import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const secretArnPattern =
  /^arn:(aws|aws-cn|aws-us-gov):secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/;

const existingRuntimeKeys = [
  "BEAT_AUTH_LOOKUP_SECRET",
  "BEAT_AUTH_ISSUER_URL",
  "BEAT_AUTH_AUDIENCE",
  "BEAT_AUTH_SIGNING_PRIVATE_JWK",
  "BEAT_AUTH_SIGNING_KEY_ID",
  "BEAT_GOURMET_ACTION_API_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_CONTENT_REPOSITORY",
];

const googleRuntimeKeys = [
  "BEAT_AUTH_GOOGLE_CLIENT_ID",
  "BEAT_AUTH_GOOGLE_CLIENT_SECRET",
  "BEAT_AUTH_GOOGLE_REDIRECT_URI",
];

function required(value, name) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function requireHttpsUrl(value, name) {
  const url = new URL(required(value, name));
  if (url.protocol !== "https:" || !url.hostname)
    throw new Error(`${name} must be an HTTPS URL.`);
  return url.toString().replace(/\/$/, "");
}

function parseSecret(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The existing runtime secret must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("The existing runtime secret must be a JSON object.");
  return parsed;
}

/**
 * Merge only the Google OAuth fields into the existing runtime secret.
 * Generated and GitHub App values must already exist so a rotation cannot
 * accidentally replace the complete production secret.
 */
export function mergeGoogleRuntimeSecret(currentValue, input) {
  const current = parseSecret(currentValue);
  for (const key of existingRuntimeKeys) {
    if (typeof current[key] !== "string" || current[key].length === 0)
      throw new Error(`The existing runtime secret is missing ${key}.`);
  }

  const issuer = requireHttpsUrl(
    current.BEAT_AUTH_ISSUER_URL,
    "BEAT_AUTH_ISSUER_URL",
  );
  if (!new URL(issuer).pathname.replace(/\/$/, "").endsWith("/auth"))
    throw new Error("BEAT_AUTH_ISSUER_URL must be an HTTPS /auth issuer.");

  const clientId = required(
    input?.BEAT_AUTH_GOOGLE_CLIENT_ID,
    "BEAT_AUTH_GOOGLE_CLIENT_ID",
  );
  const clientSecret = required(
    input?.BEAT_AUTH_GOOGLE_CLIENT_SECRET,
    "BEAT_AUTH_GOOGLE_CLIENT_SECRET",
  );
  const redirectUri = requireHttpsUrl(
    input?.BEAT_AUTH_GOOGLE_REDIRECT_URI,
    "BEAT_AUTH_GOOGLE_REDIRECT_URI",
  );
  const expectedRedirectUri = `${issuer}/google/callback`;
  if (redirectUri !== expectedRedirectUri)
    throw new Error(
      "BEAT_AUTH_GOOGLE_REDIRECT_URI must match the issuer's /google/callback URL.",
    );

  return {
    ...current,
    BEAT_AUTH_GOOGLE_CLIENT_ID: clientId,
    BEAT_AUTH_GOOGLE_CLIENT_SECRET: clientSecret,
    BEAT_AUTH_GOOGLE_REDIRECT_URI: redirectUri,
  };
}

function runAws(args, action) {
  try {
    return execFileSync("aws", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      `Unable to ${action}. Verify the protected Environment and role policy.`,
    );
  }
}

export function updateRuntimeSecret(environment = process.env) {
  if (environment.GITHUB_ACTIONS !== "true")
    throw new Error("Runtime secret updates are allowed only in GitHub Actions.");

  const runtimeSecretArn = required(
    environment.BEAT_RUNTIME_SECRET_ARN,
    "BEAT_RUNTIME_SECRET_ARN",
  );
  if (!secretArnPattern.test(runtimeSecretArn))
    throw new Error("BEAT_RUNTIME_SECRET_ARN must be a Secrets Manager ARN.");
  const region = required(environment.AWS_REGION, "AWS_REGION");

  const directory = mkdtempSync(join(tmpdir(), "beat-google-runtime-secret-"));
  const currentPath = join(directory, "current.json");
  const updatedPath = join(directory, "updated.json");
  try {
    chmodSync(directory, 0o700);
    const currentValue = runAws(
      [
        "secretsmanager",
        "get-secret-value",
        "--secret-id",
        runtimeSecretArn,
        "--region",
        region,
        "--query",
        "SecretString",
        "--output",
        "text",
      ],
      "read the Beat runtime secret",
    );
    writeFileSync(currentPath, currentValue, { mode: 0o600 });

    const updatedValue = mergeGoogleRuntimeSecret(
      readFileSync(currentPath, "utf8"),
      environment,
    );
    const serialized = JSON.stringify(updatedValue);
    writeFileSync(updatedPath, serialized, { mode: 0o600 });
    if (serialized === readFileSync(currentPath, "utf8").trim()) {
      console.log("Google OAuth runtime secret is already up to date.");
      return;
    }

    runAws(
      [
        "secretsmanager",
        "put-secret-value",
        "--secret-id",
        runtimeSecretArn,
        "--region",
        region,
        "--secret-string",
        `file://${updatedPath}`,
      ],
      "update the Beat runtime secret",
    );
    console.log("Google OAuth runtime secret fields updated.");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const key of googleRuntimeKeys) {
    if (!process.env[key]) {
      console.error(`${key} is required.`);
      process.exitCode = 1;
      break;
    }
  }
  if (process.exitCode !== 1) updateRuntimeSecret();
}
