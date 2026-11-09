#!/usr/bin/env bash
set -euo pipefail

# Checks the container images Motio runs for known vulnerabilities (Trivy) and
# prints a Markdown report: per image, how many HIGH and CRITICAL findings
# already have a fixed package version upstream. A report, not a gate: it
# always exits 0, so a new advisory never blocks a deploy or a merge.
#
# Images: every `image:` of docker-compose.prod.yml and the self-host overlay,
# plus the base images of the two images built here (web, backup-service).
#
#   infra/scripts/scan-images.sh                 # all images
#   IMAGES="caddy:2.11 nginx:1.30-alpine" infra/scripts/scan-images.sh
#
# Needs Docker and jq. CI runs it weekly (.github/workflows/image-scan.yml).

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
else
  root_dir="$(pwd)"
fi
cd "$root_dir"

trivy_image="aquasec/trivy:0.57.1"
cache_volume="motio-trivy-cache"

list_images() {
  {
    grep -hE '^[[:space:]]+image:' infra/docker-compose.prod.yml infra/docker-compose.selfhost.yml \
      | sed -E 's/^[[:space:]]+image:[[:space:]]*//; s/["'\'']//g'
    # Runtime stage of each built image: the last FROM.
    for dockerfile in infra/web/Dockerfile infra/backup-service/Dockerfile; do
      grep -E '^FROM ' "$dockerfile" | tail -n1 | awk '{print $2}'
    done
  } | grep -v '\${' | sort -u
}

if [[ -n "${IMAGES:-}" ]]; then
  read -r -a images <<< "$IMAGES"
else
  images=()
  while IFS= read -r image; do images+=("$image"); done < <(list_images)
fi

report_dir="$(mktemp -d)"
trap 'rm -rf "$report_dir"' EXIT

# Trivy reads the image straight from its registry, without Docker. Registries
# throttle anonymous reads (public.ecr.aws answers TOOMANYREQUESTS when a run
# asks too often), so a failed scan waits and tries again before it is reported.
scan_image() {
  local image="$1" json="$2" attempt
  for attempt in 1 2 3; do
    if docker run --rm -v "$cache_volume:/root/.cache" "$trivy_image" image \
        --quiet --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed \
        --format json "$image" > "$json" 2> "$json.err"; then
      return 0
    fi
    if (( attempt < 3 )); then
      sleep $(( attempt * 30 ))
    fi
  done
  return 1
}

echo "## Container image vulnerabilities"
echo
echo "HIGH and CRITICAL findings that already have a fixed version upstream (Trivy, \`--ignore-unfixed\`)."
echo "Scanned $(date -u '+%Y-%m-%d %H:%M UTC')."
echo
echo "| Image | Critical | High |"
echo "|---|---:|---:|"

details=""
for image in "${images[@]}"; do
  json="$report_dir/$(echo "$image" | tr '/:@' '___').json"
  if ! scan_image "$image" "$json"; then
    echo "| \`$image\` | scan failed | |"
    details+=$'\n'"<details><summary><code>$image</code>: scan failed</summary>"$'\n\n```\n'"$(tail -n 5 "$json.err")"$'\n```\n</details>\n'
    continue
  fi

  critical="$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$json")"
  high="$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$json")"
  echo "| \`$image\` | $critical | $high |"

  if (( critical + high > 0 )); then
    rows="$(jq -r '
      [.Results[]?.Vulnerabilities[]?]
      | unique_by(.VulnerabilityID + .PkgName)
      | sort_by(if .Severity == "CRITICAL" then 0 else 1 end, .PkgName)
      | .[]
      | "| \(.Severity) | \(.VulnerabilityID) | \(.PkgName) | \(.InstalledVersion) | \(.FixedVersion) |"
    ' "$json")"
    details+=$'\n'"<details><summary><code>$image</code>: $critical critical, $high high</summary>"$'\n\n'
    details+=$'| Severity | ID | Package | Installed | Fixed in |\n|---|---|---|---|---|\n'"$rows"$'\n\n</details>\n'
  fi
done

if [[ -n "$details" ]]; then
  echo
  echo "### Details"
  echo "$details"
fi
