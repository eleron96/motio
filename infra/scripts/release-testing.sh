#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

version_file="VERSION"
release_log_file="infra/testing-releases.log"
changelog_ru_file="CHANGELOG.md"
changelog_en_file="CHANGELOG.en.md"

usage() {
  cat <<'EOF'
Usage:
  infra/scripts/release-testing.sh --msg "..." --ru "..." --en "..." [--type changed] [--next-version X.Y.Z]

Options:
  --msg           Commit message for the tracked testing release (required)
  --ru            Russian changelog entry text (required)
  --en            English changelog entry text (required)
  --type          Keep a Changelog section: added|changed|fixed|removed|security (default: changed)
  --next-version  Explicit release version instead of auto-incrementing patch
EOF
}

increment_patch_version() {
  local version="$1"
  if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    return 1
  fi

  local major="${BASH_REMATCH[1]}"
  local minor="${BASH_REMATCH[2]}"
  local patch="${BASH_REMATCH[3]}"

  echo "${major}.${minor}.$((patch + 1))"
}

is_valid_semver() {
  local version="$1"
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]
}

is_version_greater() {
  local current="$1"
  local candidate="$2"
  local highest

  highest="$(printf '%s\n%s\n' "$current" "$candidate" | sort -V | tail -n1)"
  [[ "$candidate" == "$highest" && "$candidate" != "$current" ]]
}

restore_release_artifacts() {
  local backup_dir="$1"
  cp "$backup_dir/VERSION" "$version_file"
  cp "$backup_dir/CHANGELOG.md" "$changelog_ru_file"
  cp "$backup_dir/CHANGELOG.en.md" "$changelog_en_file"
  if [[ -f "$backup_dir/testing-releases.log" ]]; then
    cp "$backup_dir/testing-releases.log" "$release_log_file"
  else
    rm -f "$release_log_file"
  fi
}

ensure_testing_release_log() {
  mkdir -p "$(dirname "$release_log_file")"
  if [[ ! -f "$release_log_file" || ! -s "$release_log_file" ]]; then
    printf "# timestamp | version | commit | actor | host | target | summary\n" > "$release_log_file"
  fi
}

finalize_changelog_release() {
  local file="$1"
  local release_version="$2"
  local release_date="$3"
  local empty_message="$4"

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  local unreleased_line
  unreleased_line="$(grep -nE '^## \[Unreleased\]' "$file" | head -n1 | cut -d: -f1 || true)"
  if [[ -z "$unreleased_line" ]]; then
    echo "Warning: $file has no [Unreleased] section; skipping release rotation." >&2
    return 0
  fi

  local next_release_line
  next_release_line="$(awk -v start="$unreleased_line" 'NR > start && /^## \[/ { print NR; exit }' "$file" || true)"

  local tmp_out tmp_unreleased tmp_trimmed tmp_rest
  tmp_out="$(mktemp)"
  tmp_unreleased="$(mktemp)"
  tmp_trimmed="$(mktemp)"
  tmp_rest="$(mktemp)"

  sed -n "1,${unreleased_line}p" "$file" > "$tmp_out"

  if [[ -n "$next_release_line" ]]; then
    if (( next_release_line > unreleased_line + 1 )); then
      sed -n "$((unreleased_line + 1)),$((next_release_line - 1))p" "$file" > "$tmp_unreleased"
    else
      : > "$tmp_unreleased"
    fi
    sed -n "${next_release_line},\$p" "$file" > "$tmp_rest"
  else
    sed -n "$((unreleased_line + 1)),\$p" "$file" > "$tmp_unreleased"
    : > "$tmp_rest"
  fi

  awk '
    {
      lines[NR] = $0
      if ($0 ~ /[^[:space:]]/) {
        if (first == 0) first = NR
        last = NR
      }
    }
    END {
      if (first == 0) exit
      for (i = first; i <= last; i++) print lines[i]
    }
  ' "$tmp_unreleased" > "$tmp_trimmed"

  {
    printf "\n"
    printf "## [%s] - %s\n" "$release_version" "$release_date"
    if [[ -s "$tmp_trimmed" ]]; then
      cat "$tmp_trimmed"
      printf "\n"
    else
      printf "### Changed\n"
      printf -- "- %s\n" "$empty_message"
      printf "\n"
    fi
    if [[ -s "$tmp_rest" ]]; then
      cat "$tmp_rest"
    fi
  } >> "$tmp_out"

  mv "$tmp_out" "$file"
  rm -f "$tmp_unreleased" "$tmp_trimmed" "$tmp_rest"
}

extract_release_summary() {
  local file="$1"
  local release_version="$2"

  if [[ ! -f "$file" ]]; then
    echo ""
    return
  fi

  awk -v version="$release_version" '
    $0 ~ "^## \\[" version "\\]" {
      in_release = 1
      next
    }
    in_release && /^## \[/ {
      exit
    }
    in_release {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line ~ /^- /) {
        sub(/^- /, "", line)
        entries[++count] = line
      }
    }
    END {
      for (i = 1; i <= count; i++) {
        if (i > 1) printf " "
        printf "%s", entries[i]
      }
    }
  ' "$file"
}

msg="${MSG:-}"
ru_entry="${RU:-}"
en_entry="${EN:-}"
type_raw="${TYPE:-changed}"
requested_version="${NEXT_VERSION:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --msg)
      msg="${2:-}"
      shift 2
      ;;
    --ru)
      ru_entry="${2:-}"
      shift 2
      ;;
    --en)
      en_entry="${2:-}"
      shift 2
      ;;
    --type)
      type_raw="${2:-}"
      shift 2
      ;;
    --next-version)
      requested_version="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$msg" || -z "$ru_entry" || -z "$en_entry" ]]; then
  echo "--msg, --ru and --en are required." >&2
  usage
  exit 1
fi

backup_dir="$(mktemp -d)"
cp "$version_file" "$backup_dir/VERSION"
cp "$changelog_ru_file" "$backup_dir/CHANGELOG.md"
cp "$changelog_en_file" "$backup_dir/CHANGELOG.en.md"
if [[ -f "$release_log_file" ]]; then
  cp "$release_log_file" "$backup_dir/testing-releases.log"
fi

cleanup() {
  rm -rf "$backup_dir"
}
trap cleanup EXIT

if ! infra/scripts/changelog-add.sh --ru "$ru_entry" --en "$en_entry" --type "$type_raw"; then
  restore_release_artifacts "$backup_dir"
  exit 1
fi

current_version="$(tr -d '[:space:]' < "$version_file")"
if [[ -z "$current_version" ]]; then
  current_version="0.0.0"
fi

if [[ -n "$requested_version" ]]; then
  if ! is_valid_semver "$requested_version"; then
    restore_release_artifacts "$backup_dir"
    echo "Invalid NEXT_VERSION format: '$requested_version'. Expected X.Y.Z." >&2
    exit 1
  fi
  if ! is_valid_semver "$current_version"; then
    restore_release_artifacts "$backup_dir"
    echo "Invalid VERSION format: '$current_version'. Expected X.Y.Z." >&2
    exit 1
  fi
  if ! is_version_greater "$current_version" "$requested_version"; then
    restore_release_artifacts "$backup_dir"
    echo "NEXT_VERSION must be greater than current VERSION ($current_version)." >&2
    exit 1
  fi
  release_version="$requested_version"
else
  if ! release_version="$(increment_patch_version "$current_version")"; then
    restore_release_artifacts "$backup_dir"
    echo "Invalid VERSION format: '$current_version'. Expected X.Y.Z." >&2
    exit 1
  fi
fi

printf "%s\n" "$release_version" > "$version_file"
release_date="$(date -u +%Y-%m-%d)"

if ! finalize_changelog_release "$changelog_ru_file" "$release_version" "$release_date" "Нет зафиксированных изменений."; then
  restore_release_artifacts "$backup_dir"
  exit 1
fi
if ! finalize_changelog_release "$changelog_en_file" "$release_version" "$release_date" "No documented changes."; then
  restore_release_artifacts "$backup_dir"
  exit 1
fi

release_timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
release_commit="$(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
release_summary="$(extract_release_summary "$changelog_en_file" "$release_version")"
if [[ -z "$release_summary" ]]; then
  release_summary="$(extract_release_summary "$changelog_ru_file" "$release_version")"
fi
if [[ -z "$release_summary" ]]; then
  release_summary="n/a"
fi
release_summary="${release_summary//$'\n'/ }"
release_summary="${release_summary//|/-}"

ensure_testing_release_log
printf "%s | %s | %s | %s | %s | target=testing | %s\n" \
  "$release_timestamp" \
  "$release_version" \
  "$release_commit" \
  "$(whoami)" \
  "$(hostname -s 2>/dev/null || hostname)" \
  "$release_summary" >> "$release_log_file"

echo "Testing release prepared: $current_version -> $release_version"
echo "Testing release summary: $release_summary"
echo "Testing release log updated: $release_log_file"
echo "Suggested commit message: $msg"
