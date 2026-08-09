import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../sst.config.ts", import.meta.url), "utf8");

function policySource(constantName, rolePolicyName) {
  const policyStart = source.indexOf(
    `const ${constantName} = aws.iam.getPolicyDocumentOutput`,
  );
  const policyEnd = source.indexOf(
    `new aws.iam.RolePolicy("${rolePolicyName}"`,
    policyStart,
  );
  assert.notEqual(policyStart, -1);
  assert.notEqual(policyEnd, -1);
  return source.slice(policyStart, policyEnd);
}

function assertSingleParameterRead(policy, expectedArn) {
  assert.match(policy, /actions: \["ssm:GetParameter"\]/);
  assert.ok(policy.includes(expectedArn));
  assert.doesNotMatch(policy, /ssm:\*/);
  assert.doesNotMatch(
    policy,
    /ssm:(PutParameter|DeleteParameter|GetParameters|GetParametersByPath|GetParameterHistory|DescribeParameters)/,
  );
}

test("limits SST bootstrap parameter access to one read action and ARN", () => {
  assertSingleParameterRead(
    policySource(
      "sstBootstrapParameterReadPolicy",
      "BeatSstBootstrapParameterRead",
    ),
    "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/bootstrap",
  );
});

test("limits API passphrase access to one read action and ARN", () => {
  assertSingleParameterRead(
    policySource(
      "apiPassphraseParameterReadPolicy",
      "BeatApiPassphraseParameterRead",
    ),
    "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/passphrase/api/production",
  );
});
