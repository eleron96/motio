#!/usr/bin/env bash
set -euo pipefail

# release-publish.sh
#
# Tags the current release and, when there are real user-facing changes,
# publishes a GitHub Release from the matching CHANGELOG.en.md section.
#
# Design goals:
#   - Cheap: runs automatically at the tail of `release-sync`, no extra ritual.
#   - Low-noise: a git tag is created for EVERY version (rollback / bisect
#     anchors are invisible and always useful), but a public GitHub Release is
#     only created when the changelog section has real content. Versions whose
#     only entry is "No documented changes." get a tag and nothing else.
#   - Idempotent: re-running for an already-tagged / already-released version
#     is a no-op, so it's safe to retry after a transient gh/network failure.
#   - Non-fatal: a GitHub hiccup never fails the deploy pipeline (the tag is
#     already pushed by then); just re-run `make release-publish` later.

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

# Releases are published from main, after a merge. Warn — but don't fail — when
# run elsewhere, so an accidental run on a feature branch is visible.
current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [[ -n "$current_branch" && "$current_branch" != "main" && "$current_branch" != "HEAD" ]]; then
  echo "release-publish: warning — on branch '${current_branch}', not 'main'. Publish releases after merging into main." >&2
fi

changelog_file="CHANGELOG.en.md"
empty_sentinel="- No documented changes."

version="$(tr -d '[:space:]' < VERSION)"
if [[ -z "$version" ]]; then
  echo "release-publish: VERSION is empty, nothing to do." >&2
  exit 0
fi
tag="v${version}"

# --- 1. Tag (always) -------------------------------------------------------
if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "release-publish: tag ${tag} already exists locally."
else
  git tag -a "${tag}" -m "Release ${version}"
  echo "release-publish: created tag ${tag}."
fi

# Push the tag if the remote doesn't have it yet (idempotent).
if git ls-remote --exit-code --tags origin "${tag}" >/dev/null 2>&1; then
  echo "release-publish: tag ${tag} already on origin."
else
  git push origin "${tag}"
  echo "release-publish: pushed tag ${tag} to origin."
fi

# --- 2. Extract this version's changelog section ---------------------------
# Everything between "## [<version>]" and the next "## [" heading.
section="$(awk -v ver="${version}" '
  index($0, "## [" ver "]") == 1 { capture = 1; next }
  capture && /^## \[/             { exit }
  capture                        { print }
' "${changelog_file}")"

# Trim leading/trailing blank lines.
section="$(printf '%s\n' "${section}" | awk '
  { lines[NR] = $0; if ($0 ~ /[^[:space:]]/) { if (!first) first = NR; last = NR } }
  END { for (i = first; i <= last; i++) print lines[i] }
')"

# --- 3. Decide whether the section is worth a public Release ---------------
# Real content = at least one bullet line that is not the empty sentinel.
if ! printf '%s\n' "${section}" | grep -E '^- ' | grep -vqxF -- "${empty_sentinel}"; then
  echo "release-publish: ${tag} has no documented changes — tag only, no GitHub Release."
  exit 0
fi

# --- 4. Publish the GitHub Release (best-effort) ---------------------------
if ! command -v gh >/dev/null 2>&1; then
  echo "release-publish: gh CLI not found — tag pushed, skipping Release. Run 'make release-publish' once gh is available." >&2
  exit 0
fi

if gh release view "${tag}" >/dev/null 2>&1; then
  echo "release-publish: GitHub Release ${tag} already exists."
  exit 0
fi

notes_file="$(mktemp)"
trap 'rm -f "${notes_file}"' EXIT
printf '%s\n' "${section}" > "${notes_file}"

if gh release create "${tag}" \
    --title "${tag}" \
    --notes-file "${notes_file}" \
    --latest; then
  echo "release-publish: published GitHub Release ${tag}."
else
  echo "release-publish: 'gh release create' failed (auth/network?). Tag ${tag} is pushed; re-run 'make release-publish' later." >&2
fi
