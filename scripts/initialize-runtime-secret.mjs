import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const secretArnPattern =
  /^arn:(aws|aws-cn|aws-us-gov):secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/;

export function buildInitialRuntimeSecret(input) {
  const issuer = requireHttpsUrl(input.authIssuerUrl, "BEAT_AUTH_ISSUER_URL");
  const audience = required(input.authAudience, "BEAT_AUTH_AUDIENCE");
  const repository = required(
    input.githubContentRepository,
    "BEAT_GITHUB_CONTENT_REPOSITORY",
  );
  const githubAppId = required(input.githubAppId, "BEAT_GITHUB_APP_ID");
  const githubAppInstallationId = required(
    input.githubAppInstallationId,
    "BEAT_GITHUB_APP_INSTALLATION_ID",
  );
  const githubAppPrivateKey = required(
    input.githubAppPrivateKey,
    "BEAT_GITHUB_APP_PRIVATE_KEY",
  );

  if (!/^\d+$/.test(githubAppId) || !/^\d+$/.test(githubAppInstallationId)) {
    throw new Error("GitHub App identifiers must be numeric.");
  }
  if (!githubAppPrivateKey.includes("-----BEGIN") || !githubAppPrivateKey.includes("PRIVATE KEY-----")) {
    throw new Error("BEAT_GITHUB_APP_PRIVATE_KEY must be a PEM private key.");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("BEAT_GITHUB_CONTENT_REPOSITORY must be an owner/repository value.");
  }

  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const privateJwk = privateKey.export({ format: "jwk" });
  const keyId = `beat-auth-${new Date().toISOString().slice(0, 10)}-${randomToken(4)}`;
  const signingJwk = JSON.stringify({
    ...privateJwk,
    alg: "ES256",
    kid: keyId,
    use: "sig",
  });

  return JSON.stringify({
    BEAT_AUTH_LOOKUP_SECRET: randomToken(48),
    BEAT_AUTH_ISSUER_URL: issuer,
    BEAT_AUTH_AUDIENCE: audience,
    BEAT_AUTH_SIGNING_PRIVATE_JWK: signingJwk,
    BEAT_AUTH_SIGNING_KEY_ID: keyId,
    BEAT_GOURMET_ACTION_API_KEY: randomToken(48),
    GITHUB_APP_ID: githubAppId,
    GITHUB_APP_INSTALLATION_ID: githubAppInstallationId,
    GITHUB_APP_PRIVATE_KEY: githubAppPrivateKey,
    GITHUB_CONTENT_REPOSITORY: repository,
  });
}

export function hasCurrentVersion(versionIdsToStages) {
  return Object.values(versionIdsToStages ?? {}).some((stages) =>
    stages.includes("AWSCURRENT"),
  );
}

export async function initializeRuntimeSecret(environment = process.env) {
  if (environment.GITHUB_ACTIONS !== "true") {
    throw new Error("Runtime secret initialization is allowed only in GitHub Actions.");
  }

  const runtimeSecretArn = required(
    environment.BEAT_RUNTIME_SECRET_ARN,
    "BEAT_RUNTIME_SECRET_ARN",
  );
  if (!secretArnPattern.test(runtimeSecretArn)) {
    throw new Error("BEAT_RUNTIME_SECRET_ARN must be a Secrets Manager ARN.");
  }
  const region = required(environment.AWS_REGION, "AWS_REGION");
  const description = awsJson([
    "secretsmanager",
    "describe-secret",
    "--secret-id",
    runtimeSecretArn,
    "--region",
    region,
    "--output",
    "json",
  ]);

  if (description.ARN !== runtimeSecretArn) {
    throw new Error("The runtime secret ARN did not resolve to the requested secret.");
  }
  if (hasCurrentVersion(description.VersionIdsToStages)) {
    throw new Error(
      "The runtime secret already has AWSCURRENT; refusing to overwrite it.",
    );
  }

  const value = buildInitialRuntimeSecret({
    authIssuerUrl: environment.BEAT_AUTH_ISSUER_URL,
    authAudience: environment.BEAT_AUTH_AUDIENCE,
    githubContentRepository: environment.BEAT_GITHUB_CONTENT_REPOSITORY,
    githubAppId: environment.BEAT_GITHUB_APP_ID,
    githubAppInstallationId: environment.BEAT_GITHUB_APP_INSTALLATION_ID,
    githubAppPrivateKey: environment.BEAT_GITHUB_APP_PRIVATE_KEY,
  });
  putSecretValue(runtimeSecretArn, region, value);
}

function required(value, name) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function requireHttpsUrl(value, name) {
  const url = new URL(required(value, name));
  if (url.protocol !== "https:" || !url.hostname) {
    throw new Error(`${name} must be an HTTPS URL.`);
  }
  return url.toString().replace(/\/$/, "");
}

function randomToken(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function awsJson(args) {
  const result = runAws(args, "describe the runtime secret");
  try {
    return JSON.parse(result);
  } catch {
    throw new Error("AWS Secrets Manager returned an invalid description.");
  }
}

function putSecretValue(runtimeSecretArn, region, value) {
  const directory = mkdtempSync(join(tmpdir(), "beat-runtime-secret-"));
  const path = join(directory, "value.json");
  try {
    writeFileSync(path, value, { mode: 0o600 });
    chmodSync(path, 0o600);
    runAws(
      [
        "secretsmanager",
        "put-secret-value",
        "--secret-id",
        runtimeSecretArn,
        "--region",
        region,
        "--secret-string",
        pathToFileURL(path).href,
      ],
      "initialize the runtime secret",
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function runAws(args, action) {
  try {
    return execFileSync("aws", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      `Unable to ${action}. Verify the protected Environment and bootstrap role policy.`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  initializeRuntimeSecret().then(
    () => console.log("Runtime secret initialization completed."),
    (error) => {
      console.error(error instanceof Error ? error.message : "Initialization failed.");
      process.exitCode = 1;
    },
  );
}
