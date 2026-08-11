/// <reference path="./.sst/platform/config.d.ts" />

const region = process.env.AWS_REGION ?? "ap-northeast-1";

export default $config({
  app(input) {
    return {
      name: "beat-aws-bootstrap",
      home: "aws",
      providers: { aws: { region } },
      removal: "retain-all",
      protect: input.stage === "production",
    };
  },
  async run() {
    const { createAccountBaseline } = await import(
      "aws-account-baseline-sst/baseline"
    );
    const {
      createAccessAnalyzer,
      createCostAnomalyAlerts,
      createGitHubOidcRole,
      createRuntimeSecret,
      standardTags,
    } = await import("aws-account-baseline-sst/account-addons");

    if ($app.stage !== "production") {
      throw new Error(
        "Deploy this account bootstrap only with --stage production.",
      );
    }
    if (process.env.ACKNOWLEDGE_ACCOUNT_BASELINE !== "true") {
      throw new Error(
        "Set ACKNOWLEDGE_ACCOUNT_BASELINE=true after reviewing the bootstrap plan.",
      );
    }

    const email = required("BUDGET_ALERT_EMAIL");
    const tags = standardTags({
      project: "beat",
      stage: $app.stage,
      owner: required("BEAT_OWNER"),
    });
    const baseline = createAccountBaseline({
      stage: $app.stage,
      region,
      alertEmail: email,
      monthlyBudgetUsd: requiredPositiveNumber("MONTHLY_BUDGET_USD"),
      enableAuditTrail: process.env.ENABLE_AUDIT_TRAIL === "true",
    });
    const analyzer = createAccessAnalyzer("beat-account-access", tags);
    const cloudWatchAlarmEventsServiceLinkedRole =
      new aws.iam.ServiceLinkedRole("CloudWatchAlarmEventsServiceLinkedRole", {
        awsServiceName: "events.amazonaws.com",
        description:
          "Allows CloudWatch alarm actions to use CloudWatch Events.",
      });
    const deployRole = createGitHubOidcRole({
      name: "beat-github-production",
      repository: "arlequins/beat",
      environment: "production",
      providerArn: required("AWS_OIDC_PROVIDER_ARN"),
      subject:
        "repo:arlequins@21003599/beat@1309360407:environment:production",
      tags,
    });
    const secret = createRuntimeSecret({
      name:
        process.env.BEAT_RUNTIME_SECRET_NAME ??
        "arlequin/beat/production/runtime",
      readerRoleArn: deployRole.arn,
      tags,
    });
    const runtimeSecretReadPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: "Allow",
          actions: ["secretsmanager:GetSecretValue"],
          resources: [secret.arn],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatRuntimeSecretRead", {
      role: deployRole.name,
      policy: runtimeSecretReadPolicy.json,
    });
    const sstBootstrapParameterReadPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: "Allow",
          actions: ["ssm:GetParameter"],
          resources: [
            "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/bootstrap",
          ],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatSstBootstrapParameterRead", {
      role: deployRole.name,
      policy: sstBootstrapParameterReadPolicy.json,
    });
    const apiPassphraseParameterReadPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: "Allow",
          actions: ["ssm:GetParameter", "ssm:PutParameter"],
          resources: [
            "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/passphrase/api/production",
          ],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatApiPassphraseParameterRead", {
      role: deployRole.name,
      policy: apiPassphraseParameterReadPolicy.json,
    });
    const webPassphraseParameterReadPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: "Allow",
          actions: ["ssm:GetParameter", "ssm:PutParameter"],
          resources: [
            "arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/passphrase/web/production",
          ],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatWebPassphraseParameterRead", {
      role: deployRole.name,
      policy: webPassphraseParameterReadPolicy.json,
    });
    const sstStateBackendAccessPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: "Allow",
          actions: [
            "s3:GetBucketLocation",
            "s3:ListBucket",
            "s3:ListBucketVersions",
          ],
          resources: ["arn:aws:s3:::sst-state-euxnnsccdfbs"],
        },
        {
          effect: "Allow",
          actions: [
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "s3:DeleteObject",
          ],
          resources: ["arn:aws:s3:::sst-state-euxnnsccdfbs/*"],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatSstStateBackendAccess", {
      role: deployRole.name,
      policy: sstStateBackendAccessPolicy.json,
    });
    const apiProductionDeploymentPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          sid: "ManageExactSstAssetBucket",
          effect: "Allow",
          actions: [
            "s3:GetBucketLocation",
            "s3:ListBucket",
            "s3:ListBucketMultipartUploads",
          ],
          resources: ["arn:aws:s3:::sst-asset-euxnnsccdfbs"],
        },
        {
          sid: "ManageExactSstAssetObjects",
          effect: "Allow",
          actions: [
            "s3:AbortMultipartUpload",
            "s3:DeleteObject",
            "s3:GetObject",
            "s3:GetObjectTagging",
            "s3:ListMultipartUploadParts",
            "s3:PutObject",
            "s3:PutObjectTagging",
          ],
          resources: ["arn:aws:s3:::sst-asset-euxnnsccdfbs/*"],
        },
        {
          sid: "ConfigureApiProductionBuckets",
          effect: "Allow",
          actions: [
            "s3:CreateBucket",
            "s3:GetAccelerateConfiguration",
            "s3:GetBucketAcl",
            "s3:GetBucketCORS",
            "s3:GetBucketLocation",
            "s3:GetBucketLogging",
            "s3:GetBucketObjectLockConfiguration",
            "s3:GetBucketOwnershipControls",
            "s3:GetBucketPolicy",
            "s3:GetBucketPolicyStatus",
            "s3:GetBucketPublicAccessBlock",
            "s3:GetBucketRequestPayment",
            "s3:GetBucketTagging",
            "s3:GetBucketVersioning",
            "s3:GetBucketWebsite",
            "s3:GetEncryptionConfiguration",
            "s3:GetLifecycleConfiguration",
            "s3:GetReplicationConfiguration",
            "s3:ListBucket",
            "s3:PutBucketCORS",
            "s3:PutBucketObjectLockConfiguration",
            "s3:PutBucketOwnershipControls",
            "s3:PutBucketPolicy",
            "s3:PutBucketPublicAccessBlock",
            "s3:PutBucketTagging",
            "s3:PutBucketVersioning",
            "s3:PutEncryptionConfiguration",
            "s3:PutLifecycleConfiguration",
          ],
          resources: ["arn:aws:s3:::api-production-*"],
        },
        {
          sid: "ManageApiProductionRuntimeRoles",
          effect: "Allow",
          actions: [
            "iam:CreateRole",
            "iam:DeleteRolePolicy",
            "iam:GetRole",
            "iam:GetRolePolicy",
            "iam:ListAttachedRolePolicies",
            "iam:ListRolePolicies",
            "iam:ListRoleTags",
            "iam:PutRolePolicy",
            "iam:TagRole",
            "iam:UntagRole",
            "iam:UpdateAssumeRolePolicy",
            "iam:UpdateRole",
          ],
          resources: [
            "arn:aws:iam::205480711070:role/api-production-*",
          ],
        },
        {
          sid: "ManageApiProductionLambdaLoggingPolicyAttachment",
          effect: "Allow",
          actions: ["iam:AttachRolePolicy", "iam:DetachRolePolicy"],
          resources: [
            "arn:aws:iam::205480711070:role/api-production-*",
          ],
          conditions: [
            {
              test: "ArnEquals",
              variable: "iam:PolicyARN",
              values: [
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            },
          ],
        },
        {
          sid: "PassApiProductionRuntimeRolesToExpectedServices",
          effect: "Allow",
          actions: ["iam:PassRole"],
          resources: [
            "arn:aws:iam::205480711070:role/api-production-*",
          ],
          conditions: [
            {
              test: "StringEquals",
              variable: "iam:PassedToService",
              values: ["lambda.amazonaws.com", "scheduler.amazonaws.com"],
            },
          ],
        },
        {
          sid: "ManageApiProductionFunctions",
          effect: "Allow",
          actions: [
            "lambda:AddPermission",
            "lambda:CreateFunction",
            "lambda:CreateFunctionUrlConfig",
            "lambda:GetFunction",
            "lambda:GetFunctionCodeSigningConfig",
            "lambda:GetFunctionConfiguration",
            "lambda:GetFunctionUrlConfig",
            "lambda:GetPolicy",
            "lambda:ListTags",
            "lambda:ListVersionsByFunction",
            "lambda:RemovePermission",
            "lambda:TagResource",
            "lambda:UntagResource",
            "lambda:UpdateFunctionCode",
            "lambda:UpdateFunctionConfiguration",
            "lambda:UpdateFunctionUrlConfig",
          ],
          resources: [
            "arn:aws:lambda:ap-northeast-1:205480711070:function:api-production-*",
          ],
        },
        {
          sid: "ManageApiProductionReconciliationSchedule",
          effect: "Allow",
          actions: [
            "scheduler:CreateSchedule",
            "scheduler:GetSchedule",
            "scheduler:UpdateSchedule",
          ],
          resources: [
            "arn:aws:scheduler:ap-northeast-1:205480711070:schedule/default/api-production-*",
          ],
        },
        {
          sid: "ManageApiProductionLogGroups",
          effect: "Allow",
          actions: [
            "logs:CreateLogGroup",
            "logs:DescribeLogStreams",
            "logs:ListTagsForResource",
            "logs:PutRetentionPolicy",
            "logs:TagResource",
            "logs:UntagResource",
          ],
          resources: [
            "arn:aws:logs:ap-northeast-1:205480711070:log-group:/aws/lambda/api-production-*",
          ],
        },
        {
          sid: "ReadApiProductionLambdaDiagnostics",
          effect: "Allow",
          actions: ["logs:FilterLogEvents"],
          resources: [
            "arn:aws:logs:ap-northeast-1:205480711070:log-group:/aws/lambda/api-production-*:*",
          ],
        },
        {
          sid: "DiscoverRegionalLogGroups",
          effect: "Allow",
          actions: ["logs:DescribeLogGroups"],
          resources: ["*"],
          conditions: [
            {
              test: "StringEquals",
              variable: "aws:RequestedRegion",
              values: ["ap-northeast-1"],
            },
          ],
        },
        {
          sid: "ManageApiProductionAlarms",
          effect: "Allow",
          actions: [
            "cloudwatch:DescribeAlarmHistory",
            "cloudwatch:DescribeAlarms",
            "cloudwatch:ListTagsForResource",
            "cloudwatch:PutMetricAlarm",
            "cloudwatch:TagResource",
            "cloudwatch:UntagResource",
          ],
          resources: [
            "arn:aws:cloudwatch:ap-northeast-1:205480711070:alarm:api-production-*",
          ],
        },
        {
          sid: "ManageExactApiProductionDashboard",
          effect: "Allow",
          actions: [
            "cloudwatch:GetDashboard",
            "cloudwatch:ListTagsForResource",
            "cloudwatch:PutDashboard",
            "cloudwatch:TagResource",
            "cloudwatch:UntagResource",
          ],
          resources: [
            "arn:aws:cloudwatch::205480711070:dashboard/api-production",
          ],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatApiProductionDeployment", {
      role: deployRole.name,
      policy: apiProductionDeploymentPolicy.json,
    });
    const webProductionDeploymentPolicy = aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          sid: "ConfigureWebProductionBuckets",
          effect: "Allow",
          actions: [
            "s3:CreateBucket",
            "s3:GetAccelerateConfiguration",
            "s3:GetBucketAcl",
            "s3:GetBucketCORS",
            "s3:GetBucketLocation",
            "s3:GetBucketLogging",
            "s3:GetBucketObjectLockConfiguration",
            "s3:GetBucketOwnershipControls",
            "s3:GetBucketPolicy",
            "s3:GetBucketPolicyStatus",
            "s3:GetBucketPublicAccessBlock",
            "s3:GetBucketRequestPayment",
            "s3:GetBucketTagging",
            "s3:GetBucketVersioning",
            "s3:GetBucketWebsite",
            "s3:GetEncryptionConfiguration",
            "s3:GetLifecycleConfiguration",
            "s3:GetReplicationConfiguration",
            "s3:ListBucket",
            "s3:PutBucketCORS",
            "s3:PutBucketObjectLockConfiguration",
            "s3:PutBucketOwnershipControls",
            "s3:PutBucketPolicy",
            "s3:PutBucketPublicAccessBlock",
            "s3:PutBucketTagging",
            "s3:PutBucketVersioning",
            "s3:PutEncryptionConfiguration",
            "s3:PutLifecycleConfiguration",
          ],
          resources: ["arn:aws:s3:::web-production-*"],
        },
        {
          sid: "ManageWebProductionAssetObjects",
          effect: "Allow",
          actions: [
            "s3:AbortMultipartUpload",
            "s3:DeleteObject",
            "s3:GetObject",
            "s3:ListMultipartUploadParts",
            "s3:PutObject",
          ],
          resources: ["arn:aws:s3:::web-production-*/*"],
        },
        {
          // CloudFront does not support a resource ARN for these create APIs.
          // SST applies the required default tags as request tags, preventing
          // this deployment role from creating untagged or non-web resources.
          sid: "CreateTaggedWebProductionCloudFrontResources",
          effect: "Allow",
          actions: [
            "cloudfront:CreateDistribution",
            "cloudfront:CreateFunction",
            "cloudfront:CreateKeyValueStore",
          ],
          resources: ["*"],
          conditions: [
            {
              test: "StringEquals",
              variable: "aws:RequestTag/sst:app",
              values: ["web"],
            },
            {
              test: "StringEquals",
              variable: "aws:RequestTag/sst:stage",
              values: ["production"],
            },
          ],
        },
        {
          sid: "ManageWebProductionCloudFrontFunctions",
          effect: "Allow",
          actions: [
            "cloudfront:DescribeFunction",
            "cloudfront:GetFunction",
            "cloudfront:ListTagsForResource",
            "cloudfront:PublishFunction",
            "cloudfront:TagResource",
            "cloudfront:UntagResource",
            "cloudfront:UpdateFunction",
          ],
          resources: [
            "arn:aws:cloudfront::205480711070:function/web-production-*",
          ],
        },
        {
          sid: "ManageWebProductionCloudFrontKeyValueStores",
          effect: "Allow",
          actions: [
            "cloudfront:DescribeKeyValueStore",
            "cloudfront:ListTagsForResource",
            "cloudfront:TagResource",
            "cloudfront:UntagResource",
            "cloudfront:UpdateKeyValueStore",
          ],
          resources: [
            "arn:aws:cloudfront::205480711070:key-value-store/web-production-*",
          ],
        },
        {
          sid: "ManageWebProductionCloudFrontKeyValueData",
          effect: "Allow",
          actions: [
            "cloudfront-keyvaluestore:DeleteKey",
            "cloudfront-keyvaluestore:DescribeKeyValueStore",
            "cloudfront-keyvaluestore:GetKey",
            "cloudfront-keyvaluestore:ListKeys",
            "cloudfront-keyvaluestore:PutKey",
            "cloudfront-keyvaluestore:UpdateKeys",
          ],
          resources: [
            "arn:aws:cloudfront::205480711070:key-value-store/web-production-*",
          ],
        },
        {
          sid: "ManageTaggedWebProductionCloudFrontDistributions",
          effect: "Allow",
          actions: [
            "cloudfront:CreateInvalidation",
            "cloudfront:GetDistribution",
            "cloudfront:GetDistributionConfig",
            "cloudfront:GetInvalidation",
            "cloudfront:ListTagsForResource",
            "cloudfront:UpdateDistribution",
          ],
          resources: [
            "arn:aws:cloudfront::205480711070:distribution/*",
          ],
          conditions: [
            {
              test: "StringEquals",
              variable: "aws:ResourceTag/sst:app",
              values: ["web"],
            },
            {
              test: "StringEquals",
              variable: "aws:ResourceTag/sst:stage",
              values: ["production"],
            },
          ],
        },
        {
          sid: "TagNewWebProductionCloudFrontDistributions",
          effect: "Allow",
          actions: ["cloudfront:TagResource", "cloudfront:UntagResource"],
          resources: [
            "arn:aws:cloudfront::205480711070:distribution/*",
          ],
          conditions: [
            {
              test: "StringEquals",
              variable: "aws:RequestTag/sst:app",
              values: ["web"],
            },
            {
              test: "StringEquals",
              variable: "aws:RequestTag/sst:stage",
              values: ["production"],
            },
          ],
        },
      ],
    });
    new aws.iam.RolePolicy("BeatWebProductionDeployment", {
      role: deployRole.name,
      policy: webProductionDeploymentPolicy.json,
    });
    const anomaly = createCostAnomalyAlerts({
      email,
      monitorArn: required("COST_ANOMALY_MONITOR_ARN"),
    });

    return {
      ...baseline,
      accessAnalyzer: analyzer.arn,
      anomalySubscription: anomaly.arn,
      cloudWatchAlarmEventsServiceLinkedRoleArn:
        cloudWatchAlarmEventsServiceLinkedRole.arn,
      githubProductionRoleArn: deployRole.arn,
      runtimeSecretArn: secret.arn,
    };
  },
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredPositiveNumber(name: string): number {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}
