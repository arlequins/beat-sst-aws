import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../sst.config.ts", import.meta.url), "utf8");

function policySource(constantName, rolePolicyName) {
  const declarationStart = source.indexOf(`const ${constantName}`);
  const policyStart = source.indexOf(
    "aws.iam.getPolicyDocumentOutput",
    declarationStart,
  );
  const policyEnd = source.indexOf(
    `new aws.iam.RolePolicy("${rolePolicyName}"`,
    policyStart,
  );
  assert.notEqual(declarationStart, -1);
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

test("limits SST bootstrap parameter access to read-only exact regional ARNs", () => {
  const policy = policySource(
    "sstBootstrapParameterReadPolicy",
    "BeatSstBootstrapParameterRead",
  );
  assertSingleParameterRead(
    policy,
    "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/bootstrap",
  );
  assert.ok(
    policy.includes(
      "arn:aws:ssm:us-east-1:205480711070:parameter/sst/bootstrap",
    ),
  );
  assert.doesNotMatch(policy, /parameter\/sst\/\*/);
});

test("limits API passphrase initialization to Get and Put on one ARN", () => {
  const policy = policySource(
    "apiPassphraseParameterReadPolicy",
    "BeatApiPassphraseParameterRead",
  );
  assert.match(
    policy,
    /actions: \["ssm:GetParameter", "ssm:PutParameter"\]/,
  );
  assert.ok(
    policy.includes(
      "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/passphrase/api/production",
    ),
  );
  assert.doesNotMatch(policy, /ssm:\*/);
  assert.doesNotMatch(
    policy,
    /ssm:(DeleteParameter|GetParameters|GetParametersByPath|GetParameterHistory|DescribeParameters)/,
  );
});

test("splits SST state bucket and object access across exact ARNs", () => {
  const policy = policySource(
    "sstStateBackendAccessPolicy",
    "BeatSstStateBackendAccess",
  );
  assert.match(
    policy,
    /actions: \[\s*"s3:GetBucketLocation",\s*"s3:ListBucket",\s*"s3:ListBucketVersions",\s*\]/,
  );
  assert.match(
    policy,
    /actions: \[\s*"s3:GetObject",\s*"s3:GetObjectVersion",\s*"s3:PutObject",\s*"s3:DeleteObject",\s*\]/,
  );
  assert.ok(policy.includes('resources: ["arn:aws:s3:::sst-state-euxnnsccdfbs"]'));
  assert.ok(
    policy.includes('resources: ["arn:aws:s3:::sst-state-euxnnsccdfbs/*"]'),
  );
  assert.doesNotMatch(policy, /s3:\*/);
  assert.doesNotMatch(policy, /sst-\*/);
  assert.doesNotMatch(
    policy,
    /s3:(DeleteObjectVersion|CreateBucket|DeleteBucket|PutBucketPolicy|DeleteBucketPolicy)/,
  );
});

test("limits API production deployment to the reviewed service and ARN set", () => {
  const policy = policySource(
    "apiProductionDeploymentPolicy",
    "BeatApiProductionDeployment",
  );

  for (const arn of [
    "arn:aws:s3:::sst-asset-euxnnsccdfbs",
    "arn:aws:s3:::sst-asset-euxnnsccdfbs/*",
    "arn:aws:s3:::api-production-*",
    "arn:aws:iam::205480711070:role/api-production-*",
    "arn:aws:lambda:ap-northeast-1:205480711070:function:api-production-*",
    "arn:aws:scheduler:ap-northeast-1:205480711070:schedule/default/api-production-*",
    "arn:aws:logs:ap-northeast-1:205480711070:log-group:/aws/lambda/api-production-*",
    "arn:aws:logs:ap-northeast-1:205480711070:log-group:/aws/lambda/api-production-*:*",
    "arn:aws:cloudwatch:ap-northeast-1:205480711070:alarm:api-production-*",
    "arn:aws:cloudwatch::205480711070:dashboard/api-production",
  ]) {
    assert.ok(policy.includes(arn), `missing reviewed ARN: ${arn}`);
  }

  for (const action of [
    "s3:CreateBucket",
    "s3:GetAccelerateConfiguration",
    "s3:GetBucketAcl",
    "s3:GetBucketLogging",
    "s3:GetBucketRequestPayment",
    "s3:GetBucketWebsite",
    "s3:GetObjectTagging",
    "s3:GetReplicationConfiguration",
    "s3:ListBucket",
    "s3:PutBucketPublicAccessBlock",
    "s3:PutBucketVersioning",
    "s3:PutEncryptionConfiguration",
    "s3:PutBucketOwnershipControls",
    "s3:PutBucketPolicy",
    "s3:PutBucketCORS",
    "s3:PutLifecycleConfiguration",
    "s3:PutObjectTagging",
    "s3:PutBucketTagging",
    "iam:AttachRolePolicy",
    "iam:CreateRole",
    "iam:DetachRolePolicy",
    "iam:PutRolePolicy",
    "iam:PassRole",
    "lambda:CreateFunction",
    "lambda:CreateFunctionUrlConfig",
    "lambda:AddPermission",
    "lambda:GetFunctionCodeSigningConfig",
    "lambda:ListVersionsByFunction",
    "scheduler:CreateSchedule",
    "logs:CreateLogGroup",
    "logs:FilterLogEvents",
    "logs:PutRetentionPolicy",
    "cloudwatch:PutMetricAlarm",
    "cloudwatch:PutDashboard",
  ]) {
    assert.ok(policy.includes(`"${action}"`), `missing action: ${action}`);
  }

  assert.match(
    policy,
    /actions: \["logs:DescribeLogGroups"\],[\s\S]*?resources: \["\*"\],[\s\S]*?variable: "aws:RequestedRegion",[\s\S]*?values: \["ap-northeast-1"\]/,
  );
  assert.match(
    policy,
    /sid: "ReadApiProductionLambdaDiagnostics",[\s\S]*?actions: \["logs:FilterLogEvents"\],[\s\S]*?resources: \[\s*"arn:aws:logs:ap-northeast-1:205480711070:log-group:\/aws\/lambda\/api-production-\*:\*"[\s\S]*?\]/,
  );
  assert.match(
    policy,
    /actions: \["iam:PassRole"\],[\s\S]*?iam:PassedToService[\s\S]*?lambda\.amazonaws\.com[\s\S]*?scheduler\.amazonaws\.com/,
  );
  assert.match(
    policy,
    /actions: \["iam:AttachRolePolicy", "iam:DetachRolePolicy"\],[\s\S]*?variable: "iam:PolicyARN",[\s\S]*?arn:aws:iam::aws:policy\/service-role\/AWSLambdaBasicExecutionRole/,
  );
  assert.match(
    policy,
    // Pulumi AWS v7.20.0 pins upstream ea6e951e. Its monolithic Bucket read
    // calls logging and then replication even when neither is configured.
    /sid: "ConfigureApiProductionBuckets",[\s\S]*?"s3:GetAccelerateConfiguration"[\s\S]*?"s3:GetBucketAcl"[\s\S]*?"s3:GetBucketLogging"[\s\S]*?"s3:GetBucketRequestPayment"[\s\S]*?"s3:GetBucketWebsite"[\s\S]*?"s3:GetReplicationConfiguration"[\s\S]*?"s3:ListBucket"[\s\S]*?resources: \["arn:aws:s3:::api-production-\*"\]/,
  );
  assert.match(
    policy,
    /sid: "ManageExactSstAssetObjects",[\s\S]*?"s3:GetObjectTagging"[\s\S]*?"s3:PutObjectTagging"[\s\S]*?resources: \["arn:aws:s3:::sst-asset-euxnnsccdfbs\/\*"\]/,
  );
  assert.match(
    policy,
    // Pulumi AWS v7.20.0 pins upstream ea6e951e. Its Lambda read calls
    // GetFunctionCodeSigningConfig for zip functions regardless of configuration.
    /sid: "ManageApiProductionFunctions",[\s\S]*?"lambda:ListVersionsByFunction"[\s\S]*?resources: \[[\s\S]*?"arn:aws:lambda:ap-northeast-1:205480711070:function:api-production-\*"[\s\S]*?\]/,
  );
  assert.match(
    policy,
    /sid: "ManageApiProductionFunctions",[\s\S]*?"lambda:GetFunctionCodeSigningConfig"[\s\S]*?resources: \[[\s\S]*?"arn:aws:lambda:ap-northeast-1:205480711070:function:api-production-\*"[\s\S]*?\]/,
  );
});

test("does not retain retired web deployment permissions", () => {
  assert.doesNotMatch(source, /BeatWebPassphraseParameterRead/);
  assert.doesNotMatch(source, /BeatWebProductionDeployment/);
  assert.doesNotMatch(source, /webProductionDeploymentPolicy/);
  assert.doesNotMatch(source, /cloudfront:/);
  assert.doesNotMatch(source, /cloudfront-keyvaluestore:/);
});

test("limits Beat Agent production deployment to its own application prefix", () => {
  const policy = policySource(
    "agentApiProductionDeploymentPolicy",
    "BeatAgentApiProductionDeployment",
  );

  for (const arn of [
    "arn:aws:s3:::sst-asset-euxnnsccdfbs",
    "arn:aws:s3:::sst-asset-euxnnsccdfbs/*",
    "arn:aws:s3:::beat-agent-api-production-*",
    "arn:aws:s3:::beat-agent-api-production-*/*",
    "arn:aws:iam::205480711070:role/beat-agent-api-production-*",
    "arn:aws:lambda:ap-northeast-1:205480711070:function:beat-agent-api-production-*",
    "arn:aws:sqs:ap-northeast-1:205480711070:beat-agent-api-production-jobs*",
    "arn:aws:logs:ap-northeast-1:205480711070:log-group:/aws/lambda/beat-agent-api-production-*",
    "arn:aws:cloudwatch:ap-northeast-1:205480711070:alarm:beat-agent-api-production-*",
    "arn:aws:cloudwatch::205480711070:dashboard/beat-agent-api-production",
  ]) {
    assert.ok(policy.includes(arn), `missing Agent ARN: ${arn}`);
  }

  for (const action of [
    "s3:CreateBucket",
    "s3:PutBucketPublicAccessBlock",
    "s3:PutBucketVersioning",
    "s3:PutEncryptionConfiguration",
    "s3:PutObject",
    "iam:CreateRole",
    "iam:PassRole",
    "lambda:CreateFunction",
    "lambda:CreateFunctionUrlConfig",
    "sqs:CreateQueue",
    "sqs:SetQueueAttributes",
    "logs:CreateLogGroup",
    "logs:FilterLogEvents",
    "cloudwatch:PutMetricAlarm",
    "cloudwatch:PutDashboard",
  ]) {
    assert.ok(policy.includes(`"${action}"`), `missing Agent action: ${action}`);
  }

  assert.doesNotMatch(policy, /arn:aws:s3:::api-production-/);
  assert.doesNotMatch(policy, /arn:aws:s3:::web-production-/);
  assert.doesNotMatch(policy, /arn:aws:secretsmanager:/);
  assert.doesNotMatch(policy, /AdministratorAccess/);
  assert.doesNotMatch(policy, /[a-z]+:\*/);
  assert.doesNotMatch(
    policy,
    /"(?:s3:DeleteBucket|s3:DeleteObjectVersion|iam:DeleteRole|lambda:DeleteFunction|logs:DeleteLogGroup|cloudwatch:DeleteAlarms|cloudwatch:DeleteDashboards)"/,
  );
  assert.match(
    source,
    /name: "beat-agent-github-production"[\s\S]*?repository: "arlequins\/beat-agent"[\s\S]*?subject:[\s\S]*?repo:arlequins@21003599\/beat-agent@1312374527:environment:production/,
  );
  assert.match(
    policy,
    /sid: "CreateAgentProductionQueues"[\s\S]*?actions: \["sqs:CreateQueue"\][\s\S]*?resources: \["\*"\][\s\S]*?variable: "sqs:QueueName"[\s\S]*?beat-agent-api-production-jobs\*/,
  );
  assert.match(
    policy,
    /sid: "ManageAgentProductionQueues"[\s\S]*?actions: \[[\s\S]*?"sqs:SetQueueAttributes"[\s\S]*?\][\s\S]*?arn:aws:sqs:ap-northeast-1:205480711070:beat-agent-api-production-jobs\*/,
  );
});

test("gives Beat Agent SST its own exact passphrase parameter", () => {
  const policy = policySource(
    "agentApiPassphraseParameterReadPolicy",
    "BeatAgentApiPassphraseParameterRead",
  );
  assert.match(
    policy,
    /actions: \["ssm:GetParameter", "ssm:PutParameter"\]/,
  );
  assert.match(
    policy,
    /arn:aws:ssm:ap-northeast-1:205480711070:parameter\/sst\/passphrase\/beat-agent-api\/production/,
  );
  assert.doesNotMatch(policy, /parameter\/sst\/passphrase\/\*/);
});

test("baseline owns the CloudWatch Events service-linked role prerequisite", () => {
  assert.match(
    source,
    /new aws\.iam\.ServiceLinkedRole\("CloudWatchAlarmEventsServiceLinkedRole", \{[\s\S]*?awsServiceName: "events\.amazonaws\.com"/,
  );
  assert.match(
    source,
    /cloudWatchAlarmEventsServiceLinkedRoleArn:[\s\S]*?cloudWatchAlarmEventsServiceLinkedRole\.arn/,
  );

  const policy = policySource(
    "apiProductionDeploymentPolicy",
    "BeatApiProductionDeployment",
  );
  assert.doesNotMatch(policy, /iam:CreateServiceLinkedRole/);
  assert.doesNotMatch(source, /AWSServiceRoleForCloudWatchAlarms_ActionSSM/);
});

test("rejects broad or destructive API production deployment permissions", () => {
  const policy = policySource(
    "apiProductionDeploymentPolicy",
    "BeatApiProductionDeployment",
  );

  assert.equal((policy.match(/resources: \["\*"\]/g) ?? []).length, 1);
  assert.doesNotMatch(policy, /[a-z]+:\*/);
  assert.doesNotMatch(policy, /arn:aws:secretsmanager:/);
  assert.doesNotMatch(policy, /arn:aws:iam::205480711070:role\/beat-github-/);
  assert.doesNotMatch(policy, /arn:aws:iam::205480711070:oidc-provider\//);
  assert.doesNotMatch(policy, /arn:aws:iam::205480711070:policy\/api-production-/);
  assert.doesNotMatch(policy, /arn:aws:s3:::api-production-\*\/\*/);
  assert.doesNotMatch(
    policy,
    /(cloudfront|apigateway|rds|ec2|states|events):/,
  );
  assert.doesNotMatch(
    policy,
    /"(?:s3:DeleteBucket|s3:DeleteObjectVersion|iam:DeleteRole|lambda:DeleteFunction|scheduler:DeleteSchedule|logs:DeleteLogGroup|cloudwatch:DeleteAlarms|cloudwatch:DeleteDashboards)"/,
  );
  assert.doesNotMatch(policy, /AdministratorAccess/);
  assert.doesNotMatch(policy, /iam:CreateServiceLinkedRole/);
  assert.doesNotMatch(policy, /s3:DeleteObjectTagging/);
  assert.doesNotMatch(
    policy,
    /s3:(?:Put|Delete)ReplicationConfiguration/,
  );
  assert.doesNotMatch(
    policy,
    /lambda:(?:GetFunctionConcurrency|GetRuntimeManagementConfig)/,
  );
});
