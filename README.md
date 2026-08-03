# Beat AWS bootstrap

This is the production account-bootstrap consumer of
`aws-account-baseline-sst` **v0.5.0**. It creates account controls, a GitHub
OIDC production role, and an empty Secrets Manager container. It does not put
secret values into SST state and it does not deploy the Beat application.

## Ownership boundary

This repository owns only once-per-account or production deployment identity
resources:

- budget and cost anomaly alerts;
- account-wide S3 Block Public Access;
- EBS encryption and the IAM password policy;
- optional account CloudTrail;
- Access Analyzer;
- GitHub OIDC trust and the Beat production deployment role;
- the empty Beat runtime secret container.

The Beat application repository owns its generated state and ledger buckets,
Lambda functions, static site, and other application resources. Do not create a
second authentication or content bucket here. The application stack injects
its generated bucket names into the API and retains them in production.

The generated GitHub role contains the narrow trust policy and runtime-secret
resource policy. Attach the separately reviewed SST deployment permission
policy before using it in GitHub Actions. Do not attach administrator access;
scope it to the SST state and asset resources, CloudFormation stacks, IAM
roles, and application resources owned by `arlequins/beat`.

## Validation and deployment

1. Run `pnpm install` and `pnpm verify`.
2. Copy `.env.example` to `.env` and replace the placeholder email and owner.
3. Sign in with an IAM Identity Center SSO profile.
4. Run `pnpm diff -- --stage production` and review every retained or
   account-level resource.
5. Deploy manually with `pnpm deploy -- --stage production` only after review.
6. Populate the emitted Secrets Manager secret outside SST state.
7. Configure the Beat repository's protected `production` GitHub Environment
   with the emitted role ARN and runtime secret ARN.

This bootstrap is intentionally production-only. It must not be used for
preview stages and it is not deployed automatically from this repository.
