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

CloudFront deletion is destructive and asynchronous. The **Retire legacy
CloudFront web distribution** workflow requires the exact distribution ID and
`RETIRE_LEGACY_WEB` confirmation from the reviewed inventory, verifies the
`sst:app=web` and `sst:stage=production` tags, and supports two separate runs:

1. `operation=disable` turns off the distribution.
2. After the inventory and CloudFront console/API show `Deployed`,
   `operation=delete` removes only that disabled distribution.

The workflow runs only from protected `main` through GitHub OIDC and the script
refuses local execution. It does not delete the versioned
`web-production-webassetsbucket-wrkdarbs` bucket or any object versions. Keep
that bucket retained until a separate, explicit data-retention decision and
version inventory are complete.

Keep the web deployment policy attached to the Beat production role until the
resources are retired. After retirement is independently verified, remove that
policy in a separate reviewed bootstrap diff so the role no longer carries
unused CloudFront/S3 web permissions.
