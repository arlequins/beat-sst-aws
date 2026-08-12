#!/usr/bin/env bash
set -euo pipefail

account_id="$(aws sts get-caller-identity --query Account --output text)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

aws cloudfront list-distributions --output json > "$tmp_dir/distributions.json"
printf '%s\n' '{"cloudfront":[' > legacy-web-inventory.json
first=true
while IFS=$'\t' read -r distribution_id status domain_name; do
  tags="$(aws cloudfront list-tags-for-resource \
    --resource "arn:aws:cloudfront::${account_id}:distribution/${distribution_id}" \
    --output json)"
  app="$(jq -r '.Tags.Items[]? | select(.Key == "sst:app") | .Value' <<<"$tags" | head -n 1)"
  stage="$(jq -r '.Tags.Items[]? | select(.Key == "sst:stage") | .Value' <<<"$tags" | head -n 1)"
  if [[ "$app" != "web" || "$stage" != "production" ]]; then
    continue
  fi
  if [[ "$first" == false ]]; then
    printf '%s\n' ',' >> legacy-web-inventory.json
  fi
  first=false
  jq -n \
    --arg id "$distribution_id" \
    --arg status "$status" \
    --arg domain "$domain_name" \
    '{id: $id, status: $status, domainName: $domain, tags: {"sst:app": "web", "sst:stage": "production"}}' \
    >> legacy-web-inventory.json
done < <(
  jq -r '.DistributionList.Items[]? | [.Id, .Status, .DomainName] | @tsv' "$tmp_dir/distributions.json"
)
printf '%s\n' '],"s3Buckets":[' >> legacy-web-inventory.json

first=true
while IFS= read -r bucket; do
  [[ "$bucket" == web-production-* ]] || continue
  location="$(aws s3api get-bucket-location --bucket "$bucket" --output text 2>/dev/null || true)"
  versioning="$(aws s3api get-bucket-versioning --bucket "$bucket" --query Status --output text 2>/dev/null || true)"
  public_access="$(aws s3api get-public-access-block --bucket "$bucket" --output json 2>/dev/null || printf '%s' '{}')"
  if [[ "$first" == false ]]; then
    printf '%s\n' ',' >> legacy-web-inventory.json
  fi
  first=false
  jq -n \
    --arg name "$bucket" \
    --arg location "$location" \
    --arg versioning "$versioning" \
    --argjson publicAccess "$public_access" \
    '{name: $name, location: $location, versioning: $versioning, publicAccess: $publicAccess}' \
    >> legacy-web-inventory.json
done < <(aws s3api list-buckets --query 'Buckets[].Name' --output text | tr '\t' '\n')

printf '%s\n' ']}' >> legacy-web-inventory.json
jq empty legacy-web-inventory.json
cat legacy-web-inventory.json
