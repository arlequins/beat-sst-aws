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
    const deployRole = createGitHubOidcRole({
      name: "beat-github-production",
      repository: "arlequins/beat",
      environment: "production",
      providerArn: required("AWS_OIDC_PROVIDER_ARN"),
      tags,
    });
    const secret = createRuntimeSecret({
      name:
        process.env.BEAT_RUNTIME_SECRET_NAME ??
        "arlequin/beat/production/runtime",
      readerRoleArn: deployRole.arn,
      tags,
    });
    const anomaly = createCostAnomalyAlerts({ email });

    return {
      ...baseline,
      accessAnalyzer: analyzer.arn,
      anomalySubscription: anomaly.arn,
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
