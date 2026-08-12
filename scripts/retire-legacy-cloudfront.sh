#!/usr/bin/env bash
set -euo pipefail

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || {
  echo "This operation is restricted to GitHub Actions." >&2
  exit 1
}

operation="${RETIRE_OPERATION:?RETIRE_OPERATION is required}"
distribution_id="${RETIRE_DISTRIBUTION_ID:?RETIRE_DISTRIBUTION_ID is required}"
confirm="${RETIRE_CONFIRM:?RETIRE_CONFIRM is required}"

[[ "$confirm" == "RETIRE_LEGACY_WEB" ]] || {
  echo "The exact confirmation token is required." >&2
  exit 1
}
[[ "$operation" == "disable" || "$operation" == "delete" ]] || {
  echo "RETIRE_OPERATION must be disable or delete." >&2
  exit 1
}
[[ "$distribution_id" =~ ^[A-Z0-9]+$ ]] || {
  echo "RETIRE_DISTRIBUTION_ID must be an AWS CloudFront distribution ID." >&2
  exit 1
}

tags="$(aws cloudfront list-tags-for-resource \
  --resource "arn:aws:cloudfront::$(aws sts get-caller-identity --query Account --output text):distribution/${distribution_id}" \
  --output json)"
app="$(jq -r '.Tags.Items[]? | select(.Key == "sst:app") | .Value' <<<"$tags" | head -n 1)"
stage="$(jq -r '.Tags.Items[]? | select(.Key == "sst:stage") | .Value' <<<"$tags" | head -n 1)"
[[ "$app" == "web" && "$stage" == "production" ]] || {
  echo "The distribution is not tagged as the retained Beat web production resource." >&2
  exit 1
}

config_file="$(mktemp)"
updated_file="$(mktemp)"
trap 'rm -f "$config_file" "$updated_file"' EXIT
aws cloudfront get-distribution-config \
  --id "$distribution_id" \
  --output json > "$config_file"
etag="$(jq -r '.ETag' "$config_file")"
status="$(aws cloudfront get-distribution --id "$distribution_id" --query 'Distribution.Status' --output text)"
enabled="$(jq -r '.DistributionConfig.Enabled' "$config_file")"

case "$operation" in
  disable)
    if [[ "$enabled" == "false" ]]; then
      echo "Distribution $distribution_id is already disabled (status=$status)."
      exit 0
    fi
    jq '.DistributionConfig.Enabled = false | .DistributionConfig' "$config_file" > "$updated_file"
    aws cloudfront update-distribution \
      --id "$distribution_id" \
      --if-match "$etag" \
      --distribution-config "file://$updated_file" \
      --query 'Distribution.[Id,Status,DistributionConfig.Enabled]' \
      --output text
    ;;
  delete)
    [[ "$status" == "Deployed" ]] || {
      echo "Deletion requires a fully propagated distribution (status=$status)." >&2
      exit 1
    }
    [[ "$enabled" == "false" ]] || {
      echo "Deletion requires the distribution to be disabled first." >&2
      exit 1
    }
    aws cloudfront delete-distribution \
      --id "$distribution_id" \
      --if-match "$etag"
    echo "Deleted the exact disabled Beat web production distribution: $distribution_id"
    ;;
esac
