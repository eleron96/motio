#!/usr/bin/env bash
set -euo pipefail

# release-publish.sh
#
# Tags the current release and, when there are real user-facing changes,
# publishes a GitHub Release from the matching CHANGELOG.en.md section.
#
# Design goals:
#   - Runs on its own: the `Release` workflow (.github/workflows/release.yml) calls
#     it on every push to main. `make release-publish` from main stays as the
#     manual path — for a re-run, or when Actions is unavailable.
#   - Low-noise: a git tag is created for EVERY version (rollback / bisect
#     anchors are invisible and always useful), but a public GitHub Release is
#     only created when the changelog section has real content. Versions whose
#     only entry is "No documented changes." get a tag and nothing else.
#   - Idempotent: re-running for an already-tagged / already-released version
#     is a no-op, so it's safe to retry after a transient gh/network failure.
#   - Non-fatal: a GitHub hiccup never fails the deploy pipeline (the tag is
#     already pushed by then); just re-run `make release-publish` later.
#     RELEASE_PUBLISH_STRICT=1 (set by the workflow) turns that hiccup into a
#     failure, so a Release that did not get published shows up as a red run.

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
strict="${RELEASE_PUBLISH_STRICT:-0}"

# --- 1. Tag (always) -------------------------------------------------------
# The workflow tags from CI, so the tag may already exist on origin but not here.
# Pick it up first — otherwise a local re-run would create a second tag of the same
# name on a different commit and never notice.
git fetch --quiet origin "refs/tags/${tag}:refs/tags/${tag}" 2>/dev/null || true

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

# --- 2. Extract the changelog since the last published Release -------------
# Releases are cut on the owner's word, not on every deploy, so one Release
# covers every version deployed since the previous one: the sections from
# "## [<version>]" down to (not including) the last released version. With no
# earlier Release known (no gh, first run, or its version missing from the
# changelog) it is this version's section alone.
previous_version=""
if command -v gh >/dev/null 2>&1; then
  previous_tag="$(gh release list --limit 20 --exclude-drafts --json tagName \
    -q "[.[] | select(.tagName != \"${tag}\")][0].tagName" 2>/dev/null || true)"
  previous_version="${previous_tag#v}"
  if [[ -n "${previous_version}" ]] && ! grep -qF "## [${previous_version}]" "${changelog_file}"; then
    previous_version=""
  fi
fi

section="$(awk -v ver="${version}" -v prev="${previous_version}" '
  /^## \[/ {
    heading = $0; sub(/^## \[/, "", heading); sub(/\].*$/, "", heading)
    if (heading == ver) { capture = 1; versions++; print "@@version " heading; next }
    if (!capture) next
    if (prev == "" || heading == prev) exit
    versions++; print "@@version " heading; next
  }
  capture { print }
  END { print "@@count " versions }
' "${changelog_file}")"

# One version: its section as before. Several: each under its own heading.
version_count="$(printf '%s\n' "${section}" | awk '/^@@count / { print $2 }')"
section="$(printf '%s\n' "${section}" | awk -v many="$([[ "${version_count:-1}" -gt 1 ]] && echo 1 || echo 0)" '
  /^@@count / { next }
  /^@@version / { if (many) { if (seen++) print ""; print "## " substr($0, 11) } ; next }
  { print }
' | cat -s)"
if [[ "${version_count:-1}" -gt 1 ]]; then
  echo "release-publish: ${tag} collects ${version_count} versions since v${previous_version}."
fi

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
  if [[ "${strict}" == "1" ]]; then exit 1; fi
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
  if [[ "${strict}" == "1" ]]; then exit 1; fi
fi
