import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  buildInitialRuntimeSecret,
  hasCurrentVersion,
} from "./initialize-runtime-secret.mjs";

function validInput() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    authIssuerUrl: "https://api.example.com/auth",
    authAudience: "beat-agent",
    githubContentRepository: "arlequins/beat",
    githubAppId: "123456",
    githubAppInstallationId: "654321",
    githubAppPrivateKey: privateKey.export({
      format: "pem",
      type: "pkcs8",
    }),
  };
}

test("builds the complete initial runtime secret with an ES256 private JWK", () => {
  const secret = JSON.parse(buildInitialRuntimeSecret(validInput()));
  const jwk = JSON.parse(secret.BEAT_AUTH_SIGNING_PRIVATE_JWK);

  assert.equal(secret.BEAT_AUTH_ISSUER_URL, "https://api.example.com/auth");
  assert.equal(secret.BEAT_AUTH_AUDIENCE, "beat-agent");
  assert.match(secret.BEAT_AUTH_LOOKUP_SECRET, /^[A-Za-z0-9_-]{32,}$/);
  assert.match(secret.BEAT_GOURMET_ACTION_API_KEY, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(jwk.kty, "EC");
  assert.equal(jwk.crv, "P-256");
  assert.equal(jwk.alg, "ES256");
  assert.equal(jwk.use, "sig");
  assert.equal(jwk.kid, secret.BEAT_AUTH_SIGNING_KEY_ID);
  assert.ok(jwk.d);
});

test("rejects an insecure issuer URL", () => {
  assert.throws(
    () => buildInitialRuntimeSecret({ ...validInput(), authIssuerUrl: "http://api.example.com/auth" }),
    /HTTPS URL/,
  );
});

test("recognizes an existing AWSCURRENT version", () => {
  assert.equal(hasCurrentVersion({ versionA: ["AWSCURRENT"] }), true);
  assert.equal(hasCurrentVersion({ versionA: ["AWSPREVIOUS"] }), false);
});
