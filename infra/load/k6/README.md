# k6 load tests

## Requirements

- k6 installed locally (`brew install k6` on macOS)
- test user JWT (`AUTH_TOKEN`) with access to target workspace
- `ANON_KEY`, `WORKSPACE_ID`

Optional:
- `ASSIGNEE_ID`, `PROJECT_ID` for targeted members/projects scenarios
- `ENABLE_WRITE=1`, `WRITE_STATUS_ID`, `WRITE_TYPE_ID` to enable write scenario

## Run

```bash
BASE_URL="https://motio.nikog.net" \
ANON_KEY="..." \
AUTH_TOKEN="..." \
WORKSPACE_ID="..." \
k6 run infra/load/k6/main.js
```

Write scenario enabled:

```bash
BASE_URL="https://motio.nikog.net" \
ANON_KEY="..." \
AUTH_TOKEN="..." \
WORKSPACE_ID="..." \
ENABLE_WRITE=1 \
WRITE_STATUS_ID="..." \
WRITE_TYPE_ID="..." \
k6 run infra/load/k6/main.js
```

## Gates

- `http_req_failed < 1%`
- `inbox_poll p95 < 250ms`
- `planner_load p95 < 400ms`
- `members_load p95 < 450ms`
- `projects_load p95 < 450ms`
- `dashboard_stats p95 < 700ms`
- `task_write p95 < 800ms` (only when write scenario is enabled)
