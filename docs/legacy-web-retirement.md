# Legacy web resource retirement

Beat's public frontend is now published by GitHub Pages at
`https://arlequins.github.io/beat`. The old SST web stack (the private
`web-production-*` asset bucket and CloudFront distribution) is not used by the
current Beat deployment. It remains retained until an explicit inventory and
reviewed retirement are complete.

## Inventory first

Run **Inventory legacy web resources** from `main` in the protected `production`
Environment. The workflow assumes `AWS_BOOTSTRAP_ROLE_ARN` through GitHub OIDC,
uses a read-only session policy, and uploads a 30-day JSON artifact containing
only distribution IDs/status/domains and matching `web-production-*` bucket
metadata. It does not read object contents, change resources, or expose any
runtime secret.

Review the artifact and confirm each resource is unused by checking the Pages
deployment and the API origin. Do not infer a target from a wildcard or from a
stale local SST state file.

## Retirement safety

CloudFront deletion is destructive and asynchronous. A future retirement
workflow must require the exact distribution ID and bucket name from the
reviewed inventory, verify the `sst:app=web` and `sst:stage=production` tags,
disable the distribution and wait for `Deployed` before deletion, and refuse to
delete a non-empty or versioned bucket. It must run only from protected `main`
through GitHub OIDC; local AWS/SST commands and long-lived access keys are not
allowed.

Keep the web deployment policy attached to the Beat production role until the
resources are retired. After retirement is independently verified, remove that
policy in a separate reviewed bootstrap diff so the role no longer carries
unused CloudFront/S3 web permissions.
