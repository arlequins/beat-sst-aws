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

The generated GitHub role contains the narrow OIDC trust policy and three separate
inline identity policies:

- `secretsmanager:GetSecretValue` for this bootstrap's emitted runtime-secret
  ARN only; and
- `ssm:GetParameter` for the exact regional SST bootstrap parameter
  `arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/bootstrap` only; and
- `ssm:GetParameter` and `ssm:PutParameter` for the exact API production SST
  passphrase parameter
  `arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/passphrase/api/production`
  only, allowing SST to initialize the missing passphrase once.

The secret retains the matching resource policy. Both secret policies are
required for the production role to read that secret. The SSM permissions read
only the named SST control-plane parameters. The sole write action is
`PutParameter` for the exact API production passphrase ARN; they grant no
parameter wildcard, deletion, path access, history, or enumeration action. The
default Secrets Manager encryption key does not require a separate `kms:Decrypt`
grant. If a customer-managed key is introduced, review and add a key-scoped
decrypt grant separately.

This bootstrap deliberately does **not** grant broad SST or Beat application
deployment permissions. The Beat application must derive a separate reviewed
policy from its GitHub Actions `sst diff` plan, scoped to its state and asset
resources, CloudFormation stacks, IAM roles, and application resources. Do not
attach `AdministratorAccess`, wildcard Secrets Manager permissions, or a
long-lived access key to this role. Account-wide controls remain owned here;
application-resource permissions remain owned by `arlequins/beat`.

## One-time runtime secret initialization

The empty secret is intentionally not usable until the protected **Initialize
Beat runtime secret** workflow has run once. The workflow has no inputs, runs
only from `main`, requires the `production` Environment, and assumes the
existing bootstrap role with GitHub OIDC. It refuses to run when the secret has
an `AWSCURRENT` version, so it cannot silently overwrite a live configuration.

Before the one-time run, configure these `production` Environment values:

- variables: `BEAT_RUNTIME_SECRET_ARN`, `BEAT_AUTH_ISSUER_URL`,
  `BEAT_AUTH_AUDIENCE`, and `BEAT_GITHUB_CONTENT_REPOSITORY`;
- secrets: `AWS_REGION`, `AWS_BOOTSTRAP_ROLE_ARN`, `BEAT_GITHUB_APP_ID`,
  `BEAT_GITHUB_APP_INSTALLATION_ID`, and `BEAT_GITHUB_APP_PRIVATE_KEY`.

`BEAT_AUTH_ISSUER_URL` must be the final HTTPS issuer, including `/auth`; do
not use a temporary or generated placeholder. The runner generates the lookup
secret, Gourmet API key, and ES256 P-256 private JWK in memory, writes the
complete JSON value directly to Secrets Manager, and deletes its private
temporary file. It does not log the value, place it in SST state, GitHub output,
or a GitHub Secret.

GitHub App ID, installation ID, and private key cannot be generated from AWS
OIDC. Create and install the GitHub App separately, then store only those three
source materials as protected Environment secrets under the `BEAT_GITHUB_*`
names above. Do not store the assembled runtime-secret JSON in GitHub.

The existing bootstrap role needs this additional one-time identity policy.
Replace `RUNTIME_SECRET_ARN` with the exact ARN emitted by the successful
bootstrap deployment; do not use a wildcard. The initialization workflow also
applies the same restriction as an STS inline session policy, so this job cannot
use any broader Secrets Manager permission the bootstrap role may retain for
account provisioning. AWS still requires the base role to allow the two
actions. The Beat production deployment role receives only `GetSecretValue` and
must never receive these write actions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InitializeOnlyTheBeatRuntimeSecret",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:DescribeSecret",
        "secretsmanager:PutSecretValue"
      ],
      "Resource": "RUNTIME_SECRET_ARN"
    }
  ]
}
```

The baseline uses the AWS-managed Secrets Manager key, so this procedure does
not need a KMS grant. A future customer-managed key requires a separately
reviewed, key-scoped grant.

### Issuer URL order and rotation

Choose and reserve the permanent API hostname before initialization, normally
through a custom domain and DNS. Set that HTTPS issuer in the protected
Environment, review the secret-initialization workflow, run it once, then run
the Beat production deployment workflow. Verify the deployed discovery document
returns the same issuer before allowing clients to use it.

If the API can only expose a generated endpoint after deployment, stop here
rather than seeding a placeholder issuer. First add a stable custom domain (or
otherwise establish the final issuer) in a separately reviewed application
change. Replacing an existing secret is deliberately outside this initializer:
perform a separately reviewed rotation that preserves the complete runtime
contract and coordinates signing-key/JWKS rollover. Never weaken issuer or JWT
validation merely to break this dependency.

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
`deploy` through that same protected Environment. After that deployment confirms
the exact runtime-secret ARN, configure the initialization Environment values
above and use **Initialize Beat runtime secret** rather than a local or console
secret-value command. Configure the Beat repository's protected `production`
Environment with the emitted role ARN and runtime secret ARN.

`AWS_OIDC_PROVIDER_ARN` must reference the one provider created manually
for `https://token.actions.githubusercontent.com`; the SST project reuses it
rather than trying to create a duplicate provider.

This bootstrap is intentionally production-only. It must not be used for
preview stages and it is not deployed automatically from this repository.
