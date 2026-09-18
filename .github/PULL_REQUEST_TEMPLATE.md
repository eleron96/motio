## What and why

<!-- What changes for the person using Motio (or running it), and why.
     Link the issue or discussion if there is one. -->

## How to check it

<!-- Steps a reviewer can follow. A screenshot or a short clip for anything visual. -->

## Checklist

- [ ] The pull request targets `codex/main-current` and covers one logical change
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` pass
- [ ] `npm run test:integration` passes — only when touching RPC / RLS / cron / migrations
- [ ] New UI strings went through Lingui (`npm run lingui:extract && npm run lingui:compile`), with both `en` and `ru` filled in
- [ ] A user-facing change is logged with `make logchange RU="…" EN="…"`
- [ ] I have read [CONTRIBUTING.md](https://github.com/eleron96/motio/blob/main/CONTRIBUTING.md), including the note on licensing
