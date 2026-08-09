import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../sst.config.ts", import.meta.url), "utf8");

test("limits SST bootstrap parameter access to one read action and ARN", () => {
  const policyStart = source.indexOf(
    'const sstBootstrapParameterReadPolicy = aws.iam.getPolicyDocumentOutput',
  );
  const policyEnd = source.indexOf(
    'new aws.iam.RolePolicy("BeatSstBootstrapParameterRead"',
    policyStart,
  );
  assert.notEqual(policyStart, -1);
  assert.notEqual(policyEnd, -1);

  const policy = source.slice(policyStart, policyEnd);
  assert.match(policy, /actions: \["ssm:GetParameter"\]/);
  assert.match(
    policy,
    /arn:aws:ssm:ap-northeast-1:205480711070:parameter\/sst\/bootstrap/,
  );
  assert.doesNotMatch(policy, /ssm:\*/);
  assert.doesNotMatch(
    policy,
    /ssm:(Put|Delete|GetParameters|GetParameterHistory|Describe)/,
  );
});
