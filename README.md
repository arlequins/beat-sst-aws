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
- the CloudWatch Events service-linked role required when an account creates
  its first CloudWatch alarm;
- GitHub OIDC trust and the Beat production deployment role;
- the empty Beat runtime secret container.

The Beat application repository owns its generated state and ledger buckets,
Lambda functions, static site, and other application resources. Do not create a
second authentication or content bucket here. The application stack injects
its generated bucket names into the API and retains them in production.

Beat's public frontend is now published by GitHub Pages at
`https://arlequins.github.io/beat`. The former SST web resources remain
retained until the protected, read-only inventory and reviewed retirement
procedure in [`docs/legacy-web-retirement.md`](docs/legacy-web-retirement.md)
has completed.

The generated GitHub role contains the narrow OIDC trust policy and five separate
inline identity policies:

- `secretsmanager:GetSecretValue` for this bootstrap's emitted runtime-secret
  ARN only; and
- `ssm:GetParameter` for the exact regional SST bootstrap parameter
  `arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/bootstrap` only; and
- `ssm:GetParameter` for SST state export's exact home-region bootstrap
  parameter `arn:aws:ssm:us-east-1:205480711070:parameter/sst/bootstrap`
  only; and
- `ssm:GetParameter` and `ssm:PutParameter` for the exact API production SST
  passphrase parameter
  `arn:aws:ssm:ap-northeast-1:205480711070:parameter/sst/passphrase/api/production`
  only; and
- state backend bucket metadata/list access on
  `arn:aws:s3:::sst-state-euxnnsccdfbs`, plus state object read/write/delete
  access on `arn:aws:s3:::sst-state-euxnnsccdfbs/*`; and
- a reviewed API-production deployment policy limited to the exact SST asset
  bucket and `api-production-*` S3 buckets, runtime roles, Lambda functions,
  reconciliation schedule, Lambda log groups, alarms, and the
  `api-production` dashboard; and

The secret retains the matching resource policy. Both secret policies are
required for the production role to read that secret. The SSM permissions read
only the named SST control-plane parameters. The only write action is
`PutParameter` for the exact API production passphrase ARN; it grants no
parameter wildcard, deletion, path access, history, or enumeration action. The
default Secrets Manager encryption key does not require a separate `kms:Decrypt`
grant. If a customer-managed key is introduced, review and add a key-scoped
decrypt grant separately.

The SST state backend bucket already belongs to the account bootstrap. Its
separate policy permits normal state pull, diff, deploy, and rollback without
granting `DeleteObjectVersion`, bucket creation/deletion, bucket policy changes,
or an `sst-*` bucket wildcard. Beat application buckets remain application-owned
and are not covered by this state-backend policy.

### Reviewed API production deployment boundary

`BeatApiProductionDeployment` is derived only from the protected Beat API diff
run `31338437044`. The baseline owns the deployment identity, but the Beat API
stack continues to own every resource created through this policy.

The policy permits:

- read/write, upload tag reconciliation, and multipart cleanup in the exact SST
  asset bucket `sst-asset-euxnnsccdfbs`; `GetObjectTagging` and
  `PutObjectTagging` are object-scoped, and `DeleteObjectTagging` is not granted;
- creation and configuration of only `api-production-*` private buckets,
  including public-access blocking, versioning, AES256 encryption, ownership,
  the HTTPS-only bucket policy, CORS, lifecycle, tags, and the reviewed auth
  ledger's Object Lock configuration. Bucket-level `s3:ListBucket` lets the S3
  provider verify that a newly created bucket exists, while
  `s3:GetAccelerateConfiguration`, `s3:GetBucketAcl`,
  `s3:GetBucketLogging`, `s3:GetBucketRequestPayment`,
  `s3:GetBucketWebsite`, and `s3:GetReplicationConfiguration` let it reconcile
  acceleration, ACL, logging, request-payment, website, and replication
  configuration. None of these actions grants object read or write access;
- creation and in-place maintenance of only `api-production-*` runtime roles,
  including inline policies and the Lambda basic-execution managed-policy
  attachment required by SST logging. The attachment actions have an additional
  `iam:PolicyARN` condition that permits only
  `AWSLambdaBasicExecutionRole`. `iam:PassRole` is restricted further to Lambda
  and EventBridge Scheduler;
- creation, read-only version and code-signing configuration enumeration, and
  in-place maintenance of only `api-production-*` Lambda functions, Function
  URLs and Lambda permissions, the default-group reconciliation schedule, and
  `/aws/lambda/api-production-*` log groups. It may additionally run
  `logs:FilterLogEvents` only against those Lambda log groups and their streams,
  so the protected Beat diagnostic workflow can read a narrowly bounded failure
  window after a production smoke check fails. It cannot read any other
  CloudWatch log group or write/delete log events;
- creation and in-place maintenance of only `api-production-*` alarms and the
  exact `api-production` dashboard.

The bucket read boundary follows the provider code rather than anticipated
behavior. Pulumi AWS
[`v7.20.0`](https://github.com/pulumi/pulumi-aws/tree/v7.20.0) pins Terraform AWS
provider commit
[`ea6e951e`](https://github.com/hashicorp/terraform-provider-aws/tree/ea6e951e24066a24891c63a37a3b95f9971d16b8).
Its monolithic
[`resourceBucketRead`](https://github.com/hashicorp/terraform-provider-aws/blob/ea6e951e24066a24891c63a37a3b95f9971d16b8/internal/service/s3/bucket.go#L1018-L1094)
always reads logging and then replication configuration, even when neither is
configured. The replication helper calls
[`GetBucketReplication`](https://github.com/hashicorp/terraform-provider-aws/blob/ea6e951e24066a24891c63a37a3b95f9971d16b8/internal/service/s3/bucket_replication_configuration.go#L470-L488),
which AWS maps to
[`s3:GetReplicationConfiguration`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketReplication.html).
No replication write or delete action is granted.

The same pinned provider's
[`resourceFunctionRead`](https://github.com/hashicorp/terraform-provider-aws/blob/ea6e951e24066a24891c63a37a3b95f9971d16b8/internal/service/lambda/function.go#L770-L954)
lists published versions and, for zip functions in supported partitions,
unconditionally reads the code-signing configuration regardless of whether a
code-signing configuration is set. The policy therefore grants
`lambda:GetFunctionCodeSigningConfig` only on the exact `api-production-*`
function ARN. That read path does not call `GetRuntimeManagementConfig`, and
`GetFunctionConcurrency` is conditional on a qualifier, so neither speculative
permission is granted.

The account baseline creates the standard
`AWSServiceRoleForCloudWatchEvents` service-linked role through the exact
`events.amazonaws.com` service name before Beat creates its first alarm. This
keeps `iam:CreateServiceLinkedRole` out of the Beat production deployment role
and leaves the existing `api-production-*` alarm ARN boundary unchanged. The
reviewed Beat alarms do not use SSM OpsItem or response-plan actions, so this
baseline does not create `AWSServiceRoleForCloudWatchAlarms_ActionSSM`.

The only all-resources entry is `logs:DescribeLogGroups`, an AWS API that does
not support resource-level authorization; it is restricted to `ap-northeast-1`.
Every mutating action uses an API-production ARN or the exact SST asset ARN.
The reviewed plan contains no S3 bucket objects and no standalone
`aws:iam:Policy`, so this policy grants no application-bucket object data access
and no `policy/api-production-*` managed-policy CRUD. A future diff that adds
either must be reviewed before this boundary changes.

The retired web CloudFront distribution was removed through the protected
OIDC-only workflow. The versioned `web-production-*` asset bucket remains
retained without application deployment permissions until a separate data
retention decision.

The policy excludes `DeleteBucket`, `DeleteObjectVersion`, runtime-role deletion,
Lambda/schedule/log/alarm/dashboard deletion, CloudFront, web, batch, RDS, EC2,
OIDC-provider changes, modification of the production deployment role,
account-baseline controls, wildcard Secrets Manager access,
`AdministratorAccess`, and long-lived access keys. Production resources remain
retained; changing this policy does not transfer their ownership to the
bootstrap repository.

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

This repository's production role policy is also the handoff for the protected
Beat diagnostic workflow. When its narrowly scoped `logs:FilterLogEvents`
permission changes, review the `diff` operation and apply it with the
`deploy` operation in **Bootstrap AWS account**; never compensate with local
AWS credentials, a console policy edit, or a broader Beat-side permission.

`AWS_OIDC_PROVIDER_ARN` must reference the one provider created manually
for `https://token.actions.githubusercontent.com`; the SST project reuses it
rather than trying to create a duplicate provider.

This bootstrap is intentionally production-only. It must not be used for
preview stages and it is not deployed automatically from this repository.
