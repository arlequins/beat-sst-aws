# Beat AWS bootstrap

This is the production account-bootstrap consumer of
`aws-account-baseline-sst` **v0.5.5**. It creates account controls, a GitHub
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

The generated GitHub role contains the narrow OIDC trust policy and one inline
identity policy: `secretsmanager:GetSecretValue` for this bootstrap's emitted
runtime-secret ARN only. The secret retains the matching resource policy. Both
halves are required for the production role to read that secret; neither grants
access to other Secrets Manager secrets. The default Secrets Manager encryption
key does not require a separate `kms:Decrypt` grant. If a customer-managed key
is introduced, review and add a key-scoped decrypt grant separately.

This bootstrap deliberately does **not** grant broad SST or Beat application
deployment permissions. The Beat application must derive a separate reviewed
policy from its GitHub Actions `sst diff` plan, scoped to its state and asset
resources, CloudFormation stacks, IAM roles, and application resources. Do not
attach `AdministratorAccess`, wildcard Secrets Manager permissions, or a
long-lived access key to this role. Account-wide controls remain owned here;
application-resource permissions remain owned by `arlequins/beat`.

## Validation and deployment

Releases are created through Release Please after CI passes on `main`. Use
Conventional Commits: `fix:` releases a patch, `feat:` releases a minor, and a
breaking-change marker releases a major version. The release PR updates the
package version and manifest, then creates the matching `vX.Y.Z` tag and GitHub
Release when merged.

Never run `sst diff` or `sst deploy` locally. The protected `Bootstrap AWS
account` GitHub Actions workflow is the only execution path.

Before its first run, create the GitHub OIDC provider and the
`AWS_BOOTSTRAP_ROLE_ARN` role once in the AWS Console. Its trust policy must
allow only `repo:arlequins/beat-sst-aws:environment:production`. Do not create
an AWS access key for this purpose.

Set the GitHub production Environment variables named in
`.github/workflows/bootstrap.yml`, run `diff`, review the plan, then run
`deploy` through that same protected Environment. Populate the emitted Secrets
Manager secret outside SST state and configure the Beat repository's protected
`production` Environment with the emitted role ARN and runtime secret ARN.

`AWS_OIDC_PROVIDER_ARN` must reference the one provider created manually
for `https://token.actions.githubusercontent.com`; the SST project reuses it
rather than trying to create a duplicate provider.

This bootstrap is intentionally production-only. It must not be used for
preview stages and it is not deployed automatically from this repository.
