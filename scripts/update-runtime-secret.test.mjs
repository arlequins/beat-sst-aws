import assert from "node:assert/strict";
import test from "node:test";

import { mergeGoogleRuntimeSecret } from "./update-runtime-secret.mjs";

const current = {
  BEAT_AUTH_LOOKUP_SECRET: "lookup-secret",
  BEAT_AUTH_ISSUER_URL: "https://api.example.com/auth",
  BEAT_AUTH_AUDIENCE: "beat-agent",
  BEAT_AUTH_SIGNING_PRIVATE_JWK: '{"kty":"EC"}',
  BEAT_AUTH_SIGNING_KEY_ID: "beat-auth-key",
  BEAT_GOURMET_ACTION_API_KEY: "gourmet-key",
  GITHUB_APP_ID: "123",
  GITHUB_APP_INSTALLATION_ID: "456",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
  GITHUB_CONTENT_REPOSITORY: "arlequins/beat",
  existingUnrelatedValue: "must survive",
};

const google = {
  BEAT_AUTH_GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  BEAT_AUTH_GOOGLE_CLIENT_SECRET: "client-secret",
  BEAT_AUTH_GOOGLE_REDIRECT_URI:
    "https://api.example.com/auth/google/callback",
};

test("merges Google fields without replacing existing runtime values", () => {
  const merged = mergeGoogleRuntimeSecret(JSON.stringify(current), google);

  assert.equal(
    merged.BEAT_AUTH_GOOGLE_CLIENT_ID,
    google.BEAT_AUTH_GOOGLE_CLIENT_ID,
  );
  assert.equal(
    merged.BEAT_AUTH_GOOGLE_CLIENT_SECRET,
    google.BEAT_AUTH_GOOGLE_CLIENT_SECRET,
  );
  assert.equal(
    merged.BEAT_AUTH_GOOGLE_REDIRECT_URI,
    google.BEAT_AUTH_GOOGLE_REDIRECT_URI,
  );
  assert.equal(
    merged.BEAT_AUTH_SIGNING_PRIVATE_JWK,
    current.BEAT_AUTH_SIGNING_PRIVATE_JWK,
  );
  assert.equal(merged.existingUnrelatedValue, current.existingUnrelatedValue);
});

test("requires the redirect URI to match the configured issuer", () => {
  assert.throws(
    () =>
      mergeGoogleRuntimeSecret(JSON.stringify(current), {
        ...google,
        BEAT_AUTH_GOOGLE_REDIRECT_URI:
          "https://wrong.example.com/auth/google/callback",
      }),
    /match the issuer/,
  );
});

test("refuses to update an incomplete existing runtime secret", () => {
  const incomplete = { ...current };
  delete incomplete.BEAT_AUTH_SIGNING_PRIVATE_JWK;

  assert.throws(
    () => mergeGoogleRuntimeSecret(JSON.stringify(incomplete), google),
    /missing BEAT_AUTH_SIGNING_PRIVATE_JWK/,
  );
});
