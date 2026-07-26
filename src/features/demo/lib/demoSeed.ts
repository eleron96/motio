// Auto-generated from infra/supabase/demo/0003_demo_template_seed.sql via
// /tmp/build-demo-seed.mjs (kept here so the demo sandbox is fully
// client-side and doesn't depend on a Supabase project).
//
// Dates are stored as relative offsets (start_offset_days /
// end_offset_days for tasks, offset_days for milestones) and resolved
// against the visitor's current_date when the seed is hydrated. That
// keeps the timeline always centered on "today" no matter when the
// build is shipped.

export interface DemoSeedProject {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface DemoSeedAssignee {
  id: string;
  name: string;
  sort_order: number;
}

export interface DemoSeedStatus {
  id: string;
  name: string;
  color: string;
  is_final: boolean;
  is_cancelled: boolean;
  sort_order: number;
}

export interface DemoSeedTaskType {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
}

export interface DemoSeedTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface DemoSeedTask {
  id: string;
  title: string;
  project_id: string | null;
  assignee_ids: string[];
  status_id: string;
  type_id: string;
  priority: string | null;
  tag_ids: string[];
  description: string | null;
  start_offset_days: number;
  end_offset_days: number;
  sort_order: number;
}

export interface DemoSeedMilestone {
  id: string;
  project_id: string;
  title: string;
  offset_days: number;
  sort_order: number;
}

export const DEMO_SEED_PROJECTS: DemoSeedProject[] = [
  {"id":"11111111-0000-0000-0000-000000000001","name":"Website Relaunch","color":"#A3D5FF","sort_order":1},
  {"id":"11111111-0000-0000-0000-000000000002","name":"Mobile Sprint","color":"#CDB4FF","sort_order":2},
  {"id":"11111111-0000-0000-0000-000000000003","name":"Internal Automation","color":"#B5EAD7","sort_order":3},
  {"id":"11111111-0000-0000-0000-000000000004","name":"Legacy Sunset","color":"#D4D4DC","sort_order":4},
  {"id":"11111111-0000-0000-0000-000000000005","name":"Support Desk","color":"#FFC8A2","sort_order":5},
  {"id":"11111111-0000-0000-0000-000000000006","name":"Customer Onboarding","color":"#FFB5C2","sort_order":6},
  {"id":"11111111-0000-0000-0000-000000000007","name":"Analytics Dashboard","color":"#B4C5F9","sort_order":7},
  {"id":"11111111-0000-0000-0000-000000000008","name":"Marketing Hub","color":"#FFE29A","sort_order":8},
  {"id":"11111111-0000-0000-0000-000000000009","name":"Brand Refresh","color":"#E4C1F9","sort_order":9},
  {"id":"11111111-0000-0000-0000-000000000010","name":"DevOps Pipeline","color":"#CDEBC5","sort_order":10},
  {"id":"11111111-0000-0000-0000-000000000011","name":"Growth Experiments","color":"#A8E6CF","sort_order":11},
  {"id":"11111111-0000-0000-0000-000000000012","name":"Data Migration","color":"#FFDAB9","sort_order":12},
  {"id":"11111111-0000-0000-0000-000000000013","name":"Hiring Sprint","color":"#D6C8FF","sort_order":13}
];

export const DEMO_SEED_ASSIGNEES: DemoSeedAssignee[] = [
  {"id":"22222222-0000-0000-0000-000000000001","name":"Emma Taylor","sort_order":1},
  {"id":"22222222-0000-0000-0000-000000000002","name":"Ben Harper","sort_order":2},
  {"id":"22222222-0000-0000-0000-000000000003","name":"Chloe Bennett","sort_order":3},
  {"id":"22222222-0000-0000-0000-000000000004","name":"Daniel Foster","sort_order":4},
  {"id":"22222222-0000-0000-0000-000000000005","name":"Mark Sullivan","sort_order":5},
  {"id":"22222222-0000-0000-0000-000000000006","name":"Ellie Price","sort_order":6},
  {"id":"22222222-0000-0000-0000-000000000007","name":"Niko G.","sort_order":7},
  {"id":"22222222-0000-0000-0000-000000000008","name":"QA Alice","sort_order":8},
  {"id":"22222222-0000-0000-0000-000000000009","name":"QA Bob","sort_order":9},
  {"id":"22222222-0000-0000-0000-000000000010","name":"QA Carol","sort_order":10},
  {"id":"22222222-0000-0000-0000-000000000011","name":"QA Dave","sort_order":11},
  {"id":"22222222-0000-0000-0000-000000000012","name":"Advisory Consultant","sort_order":12},
  {"id":"22222222-0000-0000-0000-000000000013","name":"External QA Vendor","sort_order":13}
];

export const DEMO_SEED_STATUSES: DemoSeedStatus[] = [
  {"id":"33333333-0000-0000-0000-000000000001","name":"Backlog","color":"#cbd5e1","is_final":false,"is_cancelled":false,"sort_order":1},
  {"id":"33333333-0000-0000-0000-000000000002","name":"Ready","color":"#94a3b8","is_final":false,"is_cancelled":false,"sort_order":2},
  {"id":"33333333-0000-0000-0000-000000000003","name":"In Progress","color":"#3b82f6","is_final":false,"is_cancelled":false,"sort_order":3},
  {"id":"33333333-0000-0000-0000-000000000004","name":"Review","color":"#f59e0b","is_final":false,"is_cancelled":false,"sort_order":4},
  {"id":"33333333-0000-0000-0000-000000000005","name":"Blocked","color":"#ef4444","is_final":false,"is_cancelled":false,"sort_order":5},
  {"id":"33333333-0000-0000-0000-000000000006","name":"Done","color":"#22c55e","is_final":true,"is_cancelled":false,"sort_order":6},
  {"id":"33333333-0000-0000-0000-000000000007","name":"Cancelled","color":"#94a3b8","is_final":true,"is_cancelled":true,"sort_order":7}
];

export const DEMO_SEED_TASK_TYPES: DemoSeedTaskType[] = [
  {"id":"44444444-0000-0000-0000-000000000001","name":"Feature","icon":"Sparkles","sort_order":1},
  {"id":"44444444-0000-0000-0000-000000000002","name":"Bug","icon":"Bug","sort_order":2},
  {"id":"44444444-0000-0000-0000-000000000003","name":"Research","icon":"Search","sort_order":3},
  {"id":"44444444-0000-0000-0000-000000000004","name":"Design","icon":"PencilRuler","sort_order":4},
  {"id":"44444444-0000-0000-0000-000000000005","name":"Chore","icon":"Wrench","sort_order":5},
  {"id":"44444444-0000-0000-0000-000000000006","name":"Support","icon":"LifeBuoy","sort_order":6},
  {"id":"44444444-0000-0000-0000-000000000007","name":"Release","icon":"Rocket","sort_order":7}
];

export const DEMO_SEED_TAGS: DemoSeedTag[] = [
  {"id":"55555555-0000-0000-0000-000000000001","name":"Backend","color":"#8b5cf6","sort_order":1},
  {"id":"55555555-0000-0000-0000-000000000002","name":"Frontend","color":"#3b82f6","sort_order":2},
  {"id":"55555555-0000-0000-0000-000000000003","name":"Mobile","color":"#06b6d4","sort_order":3},
  {"id":"55555555-0000-0000-0000-000000000004","name":"Design","color":"#ec4899","sort_order":4},
  {"id":"55555555-0000-0000-0000-000000000005","name":"QA","color":"#10b981","sort_order":5},
  {"id":"55555555-0000-0000-0000-000000000006","name":"API","color":"#f97316","sort_order":6},
  {"id":"55555555-0000-0000-0000-000000000007","name":"Urgent","color":"#ef4444","sort_order":7},
  {"id":"55555555-0000-0000-0000-000000000008","name":"Docs","color":"#64748b","sort_order":8},
  {"id":"55555555-0000-0000-0000-000000000009","name":"Blocked","color":"#a855f7","sort_order":9}
];

export const DEMO_SEED_TASKS: DemoSeedTask[] = [
  {"id":"66666666-0000-0000-0000-000000000001","title":"Fix broken hero CTA link","project_id":"11111111-0000-0000-0000-000000000001","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000007"],"description":"CTA linked to old /signup. Report from marketing.","start_offset_days":-22,"end_offset_days":-22,"sort_order":1},
  {"id":"66666666-0000-0000-0000-000000000002","title":"Migrate blog to new layout","project_id":"11111111-0000-0000-0000-000000000001","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000002"],"description":"Swapped templates, kept old URLs intact.","start_offset_days":-14,"end_offset_days":-13,"sort_order":2},
  {"id":"66666666-0000-0000-0000-000000000003","title":"A11y audit: keyboard nav","project_id":"11111111-0000-0000-0000-000000000001","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000005"],"description":"Logged 4 minor fixes, shipped 3 same day.","start_offset_days":-10,"end_offset_days":-9,"sort_order":3},
  {"id":"66666666-0000-0000-0000-000000000004","title":"Fix: pricing table misaligned on iPad","project_id":"11111111-0000-0000-0000-000000000001","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000002"],"description":"Reproduced on iPad 10\" landscape.","start_offset_days":-2,"end_offset_days":1,"sort_order":4},
  {"id":"66666666-0000-0000-0000-000000000005","title":"Cookie consent rollout prep","project_id":"11111111-0000-0000-0000-000000000001","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000008"],"description":"GDPR + CCPA variants, geo-aware display.","start_offset_days":7,"end_offset_days":13,"sort_order":5},
  {"id":"66666666-0000-0000-0000-000000000010","title":"Push notification icon fix","project_id":"11111111-0000-0000-0000-000000000002","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000002","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000003"],"description":"Android adaptive icon had wrong mask.","start_offset_days":-22,"end_offset_days":-22,"sort_order":10},
  {"id":"66666666-0000-0000-0000-000000000011","title":"Biometric auth POC","project_id":"11111111-0000-0000-0000-000000000002","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000003","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000003"],"description":"FaceID works; fingerprint on Android needs keystore rotation.","start_offset_days":-18,"end_offset_days":-16,"sort_order":11},
  {"id":"66666666-0000-0000-0000-000000000012","title":"Onboarding video integration","project_id":"11111111-0000-0000-0000-000000000002","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000003","55555555-0000-0000-0000-000000000002"],"description":"Autoplay muted on first launch only.","start_offset_days":-3,"end_offset_days":2,"sort_order":12},
  {"id":"66666666-0000-0000-0000-000000000013","title":"Offline sync v1","project_id":"11111111-0000-0000-0000-000000000002","assignee_ids":["22222222-0000-0000-0000-000000000007","22222222-0000-0000-0000-000000000005"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000003","55555555-0000-0000-0000-000000000001"],"description":"Queue mutations locally, replay on reconnect.","start_offset_days":7,"end_offset_days":20,"sort_order":13},
  {"id":"66666666-0000-0000-0000-000000000020","title":"Nightly backup script hardening","project_id":"11111111-0000-0000-0000-000000000003","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Retry + Slack alert on failure.","start_offset_days":-23,"end_offset_days":-23,"sort_order":20},
  {"id":"66666666-0000-0000-0000-000000000021","title":"Slack → Linear sync","project_id":"11111111-0000-0000-0000-000000000003","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000006"],"description":"#bugs-live now opens Linear tickets.","start_offset_days":-21,"end_offset_days":-20,"sort_order":21},
  {"id":"66666666-0000-0000-0000-000000000022","title":"Weekly digest email","project_id":"11111111-0000-0000-0000-000000000003","assignee_ids":["22222222-0000-0000-0000-000000000009"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Per-workspace summary, Mondays 09:00.","start_offset_days":-14,"end_offset_days":-13,"sort_order":22},
  {"id":"66666666-0000-0000-0000-000000000023","title":"Auto-triage stale PRs","project_id":"11111111-0000-0000-0000-000000000003","assignee_ids":["22222222-0000-0000-0000-000000000005"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Close PRs older than 21 days with no activity.","start_offset_days":-2,"end_offset_days":7,"sort_order":23},
  {"id":"66666666-0000-0000-0000-000000000030","title":"Notify legacy users of sunset","project_id":"11111111-0000-0000-0000-000000000004","assignee_ids":["22222222-0000-0000-0000-000000000012"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Email + in-app banner.","start_offset_days":-22,"end_offset_days":-22,"sort_order":30},
  {"id":"66666666-0000-0000-0000-000000000031","title":"Export legacy data bundles","project_id":"11111111-0000-0000-0000-000000000004","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Individual zip per workspace.","start_offset_days":-19,"end_offset_days":-18,"sort_order":31},
  {"id":"66666666-0000-0000-0000-000000000032","title":"Decommission legacy staging","project_id":"11111111-0000-0000-0000-000000000004","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"low","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Kept DB backup for 30 days.","start_offset_days":-16,"end_offset_days":-16,"sort_order":32},
  {"id":"66666666-0000-0000-0000-000000000040","title":"Intercom → Motio integration","project_id":"11111111-0000-0000-0000-000000000005","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000006"],"description":"Bug reports auto-open tasks with tag \"support\".","start_offset_days":-22,"end_offset_days":-21,"sort_order":40},
  {"id":"66666666-0000-0000-0000-000000000041","title":"Fix: ticket sync lag","project_id":"11111111-0000-0000-0000-000000000005","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000007"],"description":"Rate-limit backoff added.","start_offset_days":-14,"end_offset_days":-13,"sort_order":41},
  {"id":"66666666-0000-0000-0000-000000000042","title":"P1: login failures from Safari","project_id":"11111111-0000-0000-0000-000000000005","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000007","55555555-0000-0000-0000-000000000002"],"description":"Intermittent, affects ~4% of sessions. Looks like third-party cookie blocking on Safari 17.4+.","start_offset_days":-1,"end_offset_days":2,"sort_order":42},
  {"id":"66666666-0000-0000-0000-000000000043","title":"SLA breach alert","project_id":"11111111-0000-0000-0000-000000000005","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Paging rule: first response >2h.","start_offset_days":4,"end_offset_days":7,"sort_order":43},
  {"id":"66666666-0000-0000-0000-000000000050","title":"Map current signup funnel","project_id":"11111111-0000-0000-0000-000000000006","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000003","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Document each step with screenshots for the redesign.","start_offset_days":-9,"end_offset_days":-3,"sort_order":50},
  {"id":"66666666-0000-0000-0000-000000000051","title":"Draft new onboarding checklist","project_id":"11111111-0000-0000-0000-000000000006","assignee_ids":["22222222-0000-0000-0000-000000000008","22222222-0000-0000-0000-000000000010"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000004","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000004","55555555-0000-0000-0000-000000000002"],"description":"Six-step checklist with progress indicator.","start_offset_days":-4,"end_offset_days":4,"sort_order":51},
  {"id":"66666666-0000-0000-0000-000000000052","title":"Prototype in-app tour","project_id":"11111111-0000-0000-0000-000000000006","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000002"],"description":"Clickable prototype covering empty-state and first task creation.","start_offset_days":-2,"end_offset_days":8,"sort_order":52},
  {"id":"66666666-0000-0000-0000-000000000053","title":"Backend: onboarding progress endpoint","project_id":"11111111-0000-0000-0000-000000000006","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000006"],"description":"Return completion state per step for current user.","start_offset_days":2,"end_offset_days":12,"sort_order":53},
  {"id":"66666666-0000-0000-0000-000000000054","title":"Fix: checklist state resets on refresh","project_id":"11111111-0000-0000-0000-000000000006","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000005","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000007","55555555-0000-0000-0000-000000000009"],"description":"Reported by Alice in the pilot build.","start_offset_days":-1,"end_offset_days":2,"sort_order":54},
  {"id":"66666666-0000-0000-0000-000000000060","title":"Define KPIs for dashboard v1","project_id":"11111111-0000-0000-0000-000000000007","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000003","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Focus on activation, retention, task throughput.","start_offset_days":-14,"end_offset_days":-6,"sort_order":60},
  {"id":"66666666-0000-0000-0000-000000000061","title":"Schema: aggregate tables for KPIs","project_id":"11111111-0000-0000-0000-000000000007","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Materialised views refreshed hourly.","start_offset_days":0,"end_offset_days":11,"sort_order":61},
  {"id":"66666666-0000-0000-0000-000000000062","title":"Frontend: KPI cards component","project_id":"11111111-0000-0000-0000-000000000007","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000001","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000004"],"description":"Responsive, dark-mode friendly.","start_offset_days":8,"end_offset_days":20,"sort_order":62},
  {"id":"66666666-0000-0000-0000-000000000063","title":"Cancelled: realtime KPI stream","project_id":"11111111-0000-0000-0000-000000000007","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000007","type_id":"44444444-0000-0000-0000-000000000001","priority":null,"tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Out of scope for v1 — push to v2.","start_offset_days":-23,"end_offset_days":-12,"sort_order":63},
  {"id":"66666666-0000-0000-0000-000000000070","title":"Q2 content calendar","project_id":"11111111-0000-0000-0000-000000000008","assignee_ids":["22222222-0000-0000-0000-000000000010"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Weekly posts, 2 long-reads, 1 case study.","start_offset_days":-6,"end_offset_days":6,"sort_order":70},
  {"id":"66666666-0000-0000-0000-000000000071","title":"Case study: Northwind pilot","project_id":"11111111-0000-0000-0000-000000000008","assignee_ids":["22222222-0000-0000-0000-000000000009"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Interview + graphs.","start_offset_days":-2,"end_offset_days":12,"sort_order":71},
  {"id":"66666666-0000-0000-0000-000000000072","title":"Landing: pricing page refresh","project_id":"11111111-0000-0000-0000-000000000008","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000004","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000004","55555555-0000-0000-0000-000000000002"],"description":"Drop \"contact sales\" from the team plan.","start_offset_days":7,"end_offset_days":21,"sort_order":72},
  {"id":"66666666-0000-0000-0000-000000000073","title":"Fix: broken social preview for /features","project_id":"11111111-0000-0000-0000-000000000008","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000002","priority":"low","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000007"],"description":"OG image showed stale copy.","start_offset_days":-3,"end_offset_days":0,"sort_order":73},
  {"id":"66666666-0000-0000-0000-000000000080","title":"Moodboard: next-gen brand direction","project_id":"11111111-0000-0000-0000-000000000009","assignee_ids":["22222222-0000-0000-0000-000000000010"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000004","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000004"],"description":"Three directions: warm, techy, editorial.","start_offset_days":-14,"end_offset_days":-6,"sort_order":80},
  {"id":"66666666-0000-0000-0000-000000000081","title":"Logo variations round 2","project_id":"11111111-0000-0000-0000-000000000009","assignee_ids":["22222222-0000-0000-0000-000000000010"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000004","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000004"],"description":"Address feedback from founders.","start_offset_days":-4,"end_offset_days":8,"sort_order":81},
  {"id":"66666666-0000-0000-0000-000000000082","title":"Brand guidelines v2 document","project_id":"11111111-0000-0000-0000-000000000009","assignee_ids":["22222222-0000-0000-0000-000000000012"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000004","55555555-0000-0000-0000-000000000008"],"description":"Typography, colour, voice.","start_offset_days":1,"end_offset_days":16,"sort_order":82},
  {"id":"66666666-0000-0000-0000-000000000083","title":"Fix: favicon blurry on retina","project_id":"11111111-0000-0000-0000-000000000009","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000004","type_id":"44444444-0000-0000-0000-000000000002","priority":"low","tag_ids":["55555555-0000-0000-0000-000000000002"],"description":"Needs 512x512 + SVG.","start_offset_days":-1,"end_offset_days":1,"sort_order":83},
  {"id":"66666666-0000-0000-0000-000000000090","title":"Stand up staging CI pipeline","project_id":"11111111-0000-0000-0000-000000000010","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"GitHub Actions → staging docker compose.","start_offset_days":-10,"end_offset_days":0,"sort_order":90},
  {"id":"66666666-0000-0000-0000-000000000091","title":"Production pipeline rollout","project_id":"11111111-0000-0000-0000-000000000010","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000007"],"description":"Blue-green deploy + automatic rollback.","start_offset_days":1,"end_offset_days":16,"sort_order":91},
  {"id":"66666666-0000-0000-0000-000000000092","title":"Migrate secrets to Vault","project_id":"11111111-0000-0000-0000-000000000010","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000005","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Retire .env for production.","start_offset_days":4,"end_offset_days":20,"sort_order":92},
  {"id":"66666666-0000-0000-0000-000000000093","title":"Fix: flaky auth integration test","project_id":"11111111-0000-0000-0000-000000000010","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000004","type_id":"44444444-0000-0000-0000-000000000002","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000005","55555555-0000-0000-0000-000000000001"],"description":"Keycloak warmup race.","start_offset_days":-2,"end_offset_days":2,"sort_order":93},
  {"id":"66666666-0000-0000-0000-000000000100","title":"Define north-star metric for Q2","project_id":"11111111-0000-0000-0000-000000000011","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000003","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Active workspaces creating >5 tasks / week.","start_offset_days":-12,"end_offset_days":-6,"sort_order":100},
  {"id":"66666666-0000-0000-0000-000000000101","title":"A/B harness: split test infra","project_id":"11111111-0000-0000-0000-000000000011","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000002"],"description":"Feature flag + bucketed randomisation.","start_offset_days":-2,"end_offset_days":12,"sort_order":101},
  {"id":"66666666-0000-0000-0000-000000000102","title":"Fix: experiment bucket leaks across tabs","project_id":"11111111-0000-0000-0000-000000000011","assignee_ids":["22222222-0000-0000-0000-000000000008"],"status_id":"33333333-0000-0000-0000-000000000005","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000002","55555555-0000-0000-0000-000000000009"],"description":"Local storage namespace collision.","start_offset_days":1,"end_offset_days":4,"sort_order":102},
  {"id":"66666666-0000-0000-0000-000000000110","title":"Audit current schema drift","project_id":"11111111-0000-0000-0000-000000000012","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000003","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000008"],"description":"Catalog tables out of sync with legacy system.","start_offset_days":-12,"end_offset_days":-4,"sort_order":110},
  {"id":"66666666-0000-0000-0000-000000000111","title":"Map legacy → new field mapping","project_id":"11111111-0000-0000-0000-000000000012","assignee_ids":["22222222-0000-0000-0000-000000000011"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000005","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000008"],"description":"63 of 87 fields mapped — legacy_status / legacy_priority still open.","start_offset_days":-6,"end_offset_days":10,"sort_order":111},
  {"id":"66666666-0000-0000-0000-000000000112","title":"Build migration scripts","project_id":"11111111-0000-0000-0000-000000000012","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000002","type_id":"44444444-0000-0000-0000-000000000001","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001"],"description":"Idempotent, resumable.","start_offset_days":1,"end_offset_days":20,"sort_order":112},
  {"id":"66666666-0000-0000-0000-000000000113","title":"Fix: row count mismatch in dry-run","project_id":"11111111-0000-0000-0000-000000000012","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000002","priority":"high","tag_ids":["55555555-0000-0000-0000-000000000001","55555555-0000-0000-0000-000000000007"],"description":"Off by 1.3% on archived rows.","start_offset_days":-2,"end_offset_days":2,"sort_order":113},
  {"id":"66666666-0000-0000-0000-000000000120","title":"Panel selection","project_id":"11111111-0000-0000-0000-000000000013","assignee_ids":["22222222-0000-0000-0000-000000000007"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":[],"description":"Four interviewers confirmed.","start_offset_days":-22,"end_offset_days":-22,"sort_order":120},
  {"id":"66666666-0000-0000-0000-000000000121","title":"Interview guide draft","project_id":"11111111-0000-0000-0000-000000000013","assignee_ids":["22222222-0000-0000-0000-000000000012"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Structured, scenario-based.","start_offset_days":-19,"end_offset_days":-19,"sort_order":121},
  {"id":"66666666-0000-0000-0000-000000000122","title":"Compensation benchmarks","project_id":"11111111-0000-0000-0000-000000000013","assignee_ids":["22222222-0000-0000-0000-000000000012"],"status_id":"33333333-0000-0000-0000-000000000006","type_id":"44444444-0000-0000-0000-000000000003","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000008"],"description":"Levels.fyi + three trusted refs.","start_offset_days":-10,"end_offset_days":-10,"sort_order":122},
  {"id":"66666666-0000-0000-0000-000000000123","title":"Careers page copy refresh","project_id":"11111111-0000-0000-0000-000000000013","assignee_ids":["22222222-0000-0000-0000-000000000010"],"status_id":"33333333-0000-0000-0000-000000000003","type_id":"44444444-0000-0000-0000-000000000005","priority":"medium","tag_ids":["55555555-0000-0000-0000-000000000008","55555555-0000-0000-0000-000000000002"],"description":"Sharper intro, clearer levels.","start_offset_days":-2,"end_offset_days":4,"sort_order":123}
];

export interface DemoSeedTimeOff {
  id: string;
  assignee_id: string;
  start_offset_days: number;
  end_offset_days: number;
  note: string | null;
}

/**
 * Days off for the sandbox. Deliberately NOT covering the anchor day: the
 * dashboard demo test asserts today's absent count, and a record spanning today
 * would move that number.
 */
export const DEMO_SEED_TIME_OFF: DemoSeedTimeOff[] = [
  {"id":"88888888-0000-0000-0000-000000000001","assignee_id":"22222222-0000-0000-0000-000000000007","start_offset_days":3,"end_offset_days":7,"note":"vacation"},
  {"id":"88888888-0000-0000-0000-000000000002","assignee_id":"22222222-0000-0000-0000-000000000003","start_offset_days":-6,"end_offset_days":-5,"note":null},
  {"id":"88888888-0000-0000-0000-000000000003","assignee_id":"22222222-0000-0000-0000-000000000002","start_offset_days":9,"end_offset_days":9,"note":"day off"},
  {"id":"99999999-0000-0000-0000-000000000001","assignee_id":"22222222-0000-0000-0000-000000000001","start_offset_days":4,"end_offset_days":10,"note":"vacation"},
  {"id":"99999999-0000-0000-0000-000000000002","assignee_id":"22222222-0000-0000-0000-000000000005","start_offset_days":5,"end_offset_days":6,"note":null},
  {"id":"99999999-0000-0000-0000-000000000003","assignee_id":"22222222-0000-0000-0000-000000000006","start_offset_days":6,"end_offset_days":12,"note":"sick leave"},
  {"id":"99999999-0000-0000-0000-000000000004","assignee_id":"22222222-0000-0000-0000-000000000004","start_offset_days":6,"end_offset_days":8,"note":null},
  {"id":"99999999-0000-0000-0000-000000000005","assignee_id":"22222222-0000-0000-0000-000000000003","start_offset_days":18,"end_offset_days":24,"note":"vacation"}
];

export const DEMO_SEED_MILESTONES: DemoSeedMilestone[] = [
  {"id":"77777777-0000-0000-0000-000000000001","project_id":"11111111-0000-0000-0000-000000000001","title":"Landing pages brand migration live","offset_days":-14,"sort_order":1},
  {"id":"77777777-0000-0000-0000-000000000002","project_id":"11111111-0000-0000-0000-000000000001","title":"Pricing page A/B test kickoff","offset_days":-2,"sort_order":2},
  {"id":"77777777-0000-0000-0000-000000000003","project_id":"11111111-0000-0000-0000-000000000001","title":"Cookie consent rollout","offset_days":13,"sort_order":3},
  {"id":"77777777-0000-0000-0000-000000000004","project_id":"11111111-0000-0000-0000-000000000001","title":"Case study library live","offset_days":35,"sort_order":4},
  {"id":"77777777-0000-0000-0000-000000000005","project_id":"11111111-0000-0000-0000-000000000002","title":"Push notifications stable on Android","offset_days":-16,"sort_order":5},
  {"id":"77777777-0000-0000-0000-000000000006","project_id":"11111111-0000-0000-0000-000000000002","title":"iOS 18 compatibility verified","offset_days":1,"sort_order":6},
  {"id":"77777777-0000-0000-0000-000000000007","project_id":"11111111-0000-0000-0000-000000000002","title":"Offline sync v1","offset_days":20,"sort_order":7},
  {"id":"77777777-0000-0000-0000-000000000008","project_id":"11111111-0000-0000-0000-000000000002","title":"App Store 4.0 release","offset_days":67,"sort_order":8},
  {"id":"77777777-0000-0000-0000-000000000009","project_id":"11111111-0000-0000-0000-000000000003","title":"Slack ↔ Linear sync live","offset_days":-13,"sort_order":9},
  {"id":"77777777-0000-0000-0000-000000000010","project_id":"11111111-0000-0000-0000-000000000003","title":"Nightly backup hardening done","offset_days":6,"sort_order":10},
  {"id":"77777777-0000-0000-0000-000000000011","project_id":"11111111-0000-0000-0000-000000000003","title":"Auto-triage for stale PRs live","offset_days":28,"sort_order":11},
  {"id":"77777777-0000-0000-0000-000000000012","project_id":"11111111-0000-0000-0000-000000000004","title":"Final user data exports sent","offset_days":-16,"sort_order":12},
  {"id":"77777777-0000-0000-0000-000000000013","project_id":"11111111-0000-0000-0000-000000000004","title":"Legacy staging decommissioned","offset_days":6,"sort_order":13},
  {"id":"77777777-0000-0000-0000-000000000014","project_id":"11111111-0000-0000-0000-000000000005","title":"Intercom → Motio integration live","offset_days":-12,"sort_order":14},
  {"id":"77777777-0000-0000-0000-000000000015","project_id":"11111111-0000-0000-0000-000000000005","title":"SLA breach alerts in production","offset_days":7,"sort_order":15},
  {"id":"77777777-0000-0000-0000-000000000016","project_id":"11111111-0000-0000-0000-000000000005","title":"First CSAT reading","offset_days":26,"sort_order":16},
  {"id":"77777777-0000-0000-0000-000000000017","project_id":"11111111-0000-0000-0000-000000000006","title":"Onboarding funnel audit shared","offset_days":-10,"sort_order":17},
  {"id":"77777777-0000-0000-0000-000000000018","project_id":"11111111-0000-0000-0000-000000000006","title":"Wireframes signed off","offset_days":11,"sort_order":18},
  {"id":"77777777-0000-0000-0000-000000000019","project_id":"11111111-0000-0000-0000-000000000006","title":"Pilot cohort kickoff","offset_days":26,"sort_order":19},
  {"id":"77777777-0000-0000-0000-000000000020","project_id":"11111111-0000-0000-0000-000000000006","title":"GA launch","offset_days":47,"sort_order":20},
  {"id":"77777777-0000-0000-0000-000000000021","project_id":"11111111-0000-0000-0000-000000000007","title":"KPI definitions signed off","offset_days":-6,"sort_order":21},
  {"id":"77777777-0000-0000-0000-000000000022","project_id":"11111111-0000-0000-0000-000000000007","title":"Data model frozen","offset_days":14,"sort_order":22},
  {"id":"77777777-0000-0000-0000-000000000023","project_id":"11111111-0000-0000-0000-000000000007","title":"Beta access for pilot customers","offset_days":34,"sort_order":23},
  {"id":"77777777-0000-0000-0000-000000000024","project_id":"11111111-0000-0000-0000-000000000007","title":"Public launch","offset_days":55,"sort_order":24},
  {"id":"77777777-0000-0000-0000-000000000025","project_id":"11111111-0000-0000-0000-000000000008","title":"Q2 calendar frozen","offset_days":1,"sort_order":25},
  {"id":"77777777-0000-0000-0000-000000000026","project_id":"11111111-0000-0000-0000-000000000008","title":"Launch campaign kickoff","offset_days":28,"sort_order":26},
  {"id":"77777777-0000-0000-0000-000000000027","project_id":"11111111-0000-0000-0000-000000000009","title":"Brand direction chosen","offset_days":-6,"sort_order":27},
  {"id":"77777777-0000-0000-0000-000000000028","project_id":"11111111-0000-0000-0000-000000000009","title":"Brand guidelines v2","offset_days":16,"sort_order":28},
  {"id":"77777777-0000-0000-0000-000000000029","project_id":"11111111-0000-0000-0000-000000000009","title":"Website brand migration","offset_days":36,"sort_order":29},
  {"id":"77777777-0000-0000-0000-000000000030","project_id":"11111111-0000-0000-0000-000000000010","title":"Staging pipeline green end-to-end","offset_days":-8,"sort_order":30},
  {"id":"77777777-0000-0000-0000-000000000031","project_id":"11111111-0000-0000-0000-000000000010","title":"CI/CD rollout to staging","offset_days":12,"sort_order":31},
  {"id":"77777777-0000-0000-0000-000000000032","project_id":"11111111-0000-0000-0000-000000000010","title":"Production pipeline cutover","offset_days":32,"sort_order":32},
  {"id":"77777777-0000-0000-0000-000000000033","project_id":"11111111-0000-0000-0000-000000000011","title":"North-star metric locked","offset_days":-3,"sort_order":33},
  {"id":"77777777-0000-0000-0000-000000000034","project_id":"11111111-0000-0000-0000-000000000011","title":"A/B testing harness ready","offset_days":18,"sort_order":34},
  {"id":"77777777-0000-0000-0000-000000000035","project_id":"11111111-0000-0000-0000-000000000011","title":"First 3 experiments live","offset_days":35,"sort_order":35},
  {"id":"77777777-0000-0000-0000-000000000036","project_id":"11111111-0000-0000-0000-000000000012","title":"Schema audit done","offset_days":-9,"sort_order":36},
  {"id":"77777777-0000-0000-0000-000000000037","project_id":"11111111-0000-0000-0000-000000000012","title":"Field mapping signed off","offset_days":6,"sort_order":37},
  {"id":"77777777-0000-0000-0000-000000000038","project_id":"11111111-0000-0000-0000-000000000012","title":"Dry-run migration on staging","offset_days":27,"sort_order":38},
  {"id":"77777777-0000-0000-0000-000000000039","project_id":"11111111-0000-0000-0000-000000000012","title":"Production cutover","offset_days":45,"sort_order":39},
  {"id":"77777777-0000-0000-0000-000000000040","project_id":"11111111-0000-0000-0000-000000000013","title":"Job descriptions approved","offset_days":-9,"sort_order":40},
  {"id":"77777777-0000-0000-0000-000000000041","project_id":"11111111-0000-0000-0000-000000000013","title":"Interview panel calibrated","offset_days":6,"sort_order":41},
  {"id":"77777777-0000-0000-0000-000000000042","project_id":"11111111-0000-0000-0000-000000000013","title":"Job posts live","offset_days":9,"sort_order":42}
];

// ── Clients / Contacts (Project Card feature) ──────────────────────────
// Customers are the client companies; each links to one or more projects
// via projects.customer_id. customer_contacts are people on the client
// side; project_members are the (external) team members shown per project.
// Together they populate the "Клиенты" and "Контакты" tabs on the demo.

export interface DemoSeedCustomer {
  id: string;
  name: string;
  industry: string | null;
}

export interface DemoSeedCustomerContact {
  id: string;
  customer_id: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  tag: string | null;
  position: number;
}

export interface DemoSeedProjectMember {
  id: string;
  project_id: string;
  assignee_id: string | null;
  role: string | null;
  tag: string | null;
  external_name: string | null;
  external_company: string | null;
  external_email: string | null;
  external_phone: string | null;
  position: number;
}

export const DEMO_SEED_CUSTOMERS: DemoSeedCustomer[] = [
  {"id":"88888888-0000-0000-0000-000000000001","name":"Northwind Trading","industry":"Retail · E-commerce"},
  {"id":"88888888-0000-0000-0000-000000000002","name":"Acme Industrial","industry":"Manufacturing"},
  {"id":"88888888-0000-0000-0000-000000000003","name":"Globex Systems","industry":"SaaS · Analytics"},
  {"id":"88888888-0000-0000-0000-000000000004","name":"Initech Software","industry":"Fintech"},
  {"id":"88888888-0000-0000-0000-000000000005","name":"Umbrella Group","industry":"Healthcare"}
];

// project_id → customer_id. Only a subset of projects has a client, so the
// sidebar shows both "with client" and "no client" projects.
export const DEMO_SEED_PROJECT_CUSTOMER: Record<string, string> = {
  "11111111-0000-0000-0000-000000000001": "88888888-0000-0000-0000-000000000001", // Website Relaunch → Northwind
  "11111111-0000-0000-0000-000000000008": "88888888-0000-0000-0000-000000000001", // Marketing Hub → Northwind
  "11111111-0000-0000-0000-000000000002": "88888888-0000-0000-0000-000000000002", // Mobile Sprint → Acme
  "11111111-0000-0000-0000-000000000010": "88888888-0000-0000-0000-000000000002", // DevOps Pipeline → Acme
  "11111111-0000-0000-0000-000000000007": "88888888-0000-0000-0000-000000000003", // Analytics Dashboard → Globex
  "11111111-0000-0000-0000-000000000011": "88888888-0000-0000-0000-000000000003", // Growth Experiments → Globex
  "11111111-0000-0000-0000-000000000012": "88888888-0000-0000-0000-000000000004", // Data Migration → Initech
  "11111111-0000-0000-0000-000000000006": "88888888-0000-0000-0000-000000000005"  // Customer Onboarding → Umbrella
};

export const DEMO_SEED_CUSTOMER_CONTACTS: DemoSeedCustomerContact[] = [
  {"id":"99999999-0000-0000-0000-000000000001","customer_id":"88888888-0000-0000-0000-000000000001","name":"Olivia Grant","role":"Head of Marketing","email":"olivia.grant@northwind.example","phone":"+1 202 555 0148","company":"Northwind Trading","tag":"Decision maker","position":0},
  {"id":"99999999-0000-0000-0000-000000000002","customer_id":"88888888-0000-0000-0000-000000000001","name":"James Whitfield","role":"Brand Manager","email":"james.w@northwind.example","phone":null,"company":"Northwind Trading","tag":"Day-to-day","position":1},
  {"id":"99999999-0000-0000-0000-000000000003","customer_id":"88888888-0000-0000-0000-000000000002","name":"Robert Klein","role":"CTO","email":"r.klein@acme.example","phone":"+49 30 5550 221","company":"Acme Industrial","tag":"Technical","position":0},
  {"id":"99999999-0000-0000-0000-000000000004","customer_id":"88888888-0000-0000-0000-000000000002","name":"Nina Petrova","role":"Product Owner","email":"nina.petrova@acme.example","phone":null,"company":"Acme Industrial","tag":null,"position":1},
  {"id":"99999999-0000-0000-0000-000000000005","customer_id":"88888888-0000-0000-0000-000000000003","name":"David Okafor","role":"VP Analytics","email":"d.okafor@globex.example","phone":"+44 20 7946 0912","company":"Globex Systems","tag":"Sponsor","position":0},
  {"id":"99999999-0000-0000-0000-000000000006","customer_id":"88888888-0000-0000-0000-000000000004","name":"Susan Meyers","role":"Compliance Lead","email":"s.meyers@initech.example","phone":null,"company":"Initech Software","tag":"Legal","position":0},
  {"id":"99999999-0000-0000-0000-000000000007","customer_id":"88888888-0000-0000-0000-000000000005","name":"Alan Reyes","role":"Clinical Director","email":"a.reyes@umbrella.example","phone":"+1 415 555 0170","company":"Umbrella Group","tag":null,"position":0},
  {"id":"99999999-0000-0000-0000-000000000008","customer_id":null,"name":"Marco Bianchi","role":"Freelance Designer","email":"marco@bianchi.studio","phone":"+39 02 5550 88","company":"Bianchi Studio","tag":"Contractor","position":0},
  {"id":"99999999-0000-0000-0000-000000000009","customer_id":null,"name":"Priya Nair","role":"Legal Advisor","email":"priya.nair@example.com","phone":null,"company":null,"tag":null,"position":1}
];

export const DEMO_SEED_PROJECT_MEMBERS: DemoSeedProjectMember[] = [
  // Same external person on two projects → deduped into one Contacts entry
  // that shows "in 2 projects".
  {"id":"aaaaaaaa-0000-0000-0000-000000000001","project_id":"11111111-0000-0000-0000-000000000001","assignee_id":null,"role":"Structural Engineer","tag":"KR","external_name":"Sergey Volkov","external_company":"BuildTech LLC","external_email":"s.volkov@buildtech.example","external_phone":"+7 495 555 3312","position":0},
  {"id":"aaaaaaaa-0000-0000-0000-000000000002","project_id":"11111111-0000-0000-0000-000000000002","assignee_id":null,"role":"Structural Engineer","tag":"KR","external_name":"Sergey Volkov","external_company":"BuildTech LLC","external_email":"s.volkov@buildtech.example","external_phone":"+7 495 555 3312","position":0},
  {"id":"aaaaaaaa-0000-0000-0000-000000000003","project_id":"11111111-0000-0000-0000-000000000006","assignee_id":null,"role":"UX Consultant","tag":"Design","external_name":"Anna Schmidt","external_company":"Pixel Foundry","external_email":"anna@pixelfoundry.example","external_phone":null,"position":0},
  {"id":"aaaaaaaa-0000-0000-0000-000000000004","project_id":"11111111-0000-0000-0000-000000000012","assignee_id":null,"role":"Data Migration Consultant","tag":"Backend","external_name":"Tomás Alvarez","external_company":"Datastream Partners","external_email":"tomas@datastream.example","external_phone":"+34 91 555 7788","position":0},
  // A couple of internal (workspace-assignee) members — shown in the project
  // Team block, deliberately excluded from the Contacts directory.
  {"id":"aaaaaaaa-0000-0000-0000-000000000005","project_id":"11111111-0000-0000-0000-000000000001","assignee_id":"22222222-0000-0000-0000-000000000001","role":"Project Lead","tag":null,"external_name":null,"external_company":null,"external_email":null,"external_phone":null,"position":1},
  {"id":"aaaaaaaa-0000-0000-0000-000000000006","project_id":"11111111-0000-0000-0000-000000000002","assignee_id":"22222222-0000-0000-0000-000000000003","role":"Mobile Lead","tag":null,"external_name":null,"external_company":null,"external_email":null,"external_phone":null,"position":1}
];

// ── Prebuilt dashboards ────────────────────────────────────────────────
// A ready-made dashboard so the demo lands on populated charts instead of
// the empty "create a dashboard" state. Widgets are normalized by the
// dashboard store, so only the fields that differ from the defaults are set.
// Typed loosely on purpose — the store's normalizeWidget fills the rest.

export interface DemoSeedDashboard {
  id: string;
  name: string;
  widgets: Array<Record<string, unknown>>;
}

// Widget mix mirrors how real workspaces build dashboards on prod: heavily
// assignee-centric (line/area/bar grouped by assignee, week period), a
// milestones widget on every board, plus project and task-type breakdowns.
// A small KPI headline row is kept for the demo's first impression.
export const DEMO_SEED_DASHBOARDS: DemoSeedDashboard[] = [
  {
    id: "bbbbbbbb-0000-0000-0000-000000000001",
    name: "Team workload",
    widgets: [
      {"id":"cccccccc-0000-0000-0000-000000000001","type":"kpi","title":"Active","period":"week","groupBy":"none","statusFilter":"active","size":"small"},
      {"id":"cccccccc-0000-0000-0000-000000000002","type":"kpi","title":"Done · 30d","period":"month","groupBy":"none","statusFilter":"final","size":"small"},
      {"id":"cccccccc-0000-0000-0000-000000000003","type":"line","title":"Load trend by assignee","period":"week","groupBy":"assignee","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000004","type":"area","title":"Active load by assignee","period":"week","groupBy":"assignee","statusFilter":"active","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000005","type":"bar","title":"Tasks per assignee","period":"week","groupBy":"assignee","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000006","type":"bar","title":"Tasks by project","period":"week","groupBy":"project","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000007","type":"pie","title":"By task type","period":"week","groupBy":"task_type","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000008","type":"milestone","title":"Milestones","period":"month","groupBy":"none","milestoneView":"list","statusFilter":"all","size":"medium"}
    ]
  },
  {
    id: "bbbbbbbb-0000-0000-0000-000000000002",
    name: "Delivery",
    widgets: [
      {"id":"cccccccc-0000-0000-0000-000000000011","type":"milestone","title":"Milestones","period":"month","groupBy":"none","milestoneView":"list","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000012","type":"line","title":"Trend by project","period":"week","groupBy":"project","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000013","type":"line","title":"Trend by assignee","period":"week","groupBy":"assignee","statusFilter":"all","size":"medium"},
      {"id":"cccccccc-0000-0000-0000-000000000014","type":"milestone","title":"Milestone calendar","period":"month","groupBy":"none","milestoneView":"calendar","statusFilter":"all","size":"medium"}
    ]
  }
];

// Explicit, per-breakpoint grid layouts for the seeded dashboards.
//
// Why not leave `layouts: {}` and let the store auto-place? Two reasons:
//  1. KPI widgets auto-place at 1×1 (KPI_SMALL_PRESET) — far too small, the
//     title and value overflow the cell.
//  2. Mass auto-placement of many widgets is not a fixed point of the
//     react-grid-layout ↔ normalizeLayouts feedback, so the grid oscillates
//     ("jitters"). Prod dashboards never hit this because they persist
//     explicit, already-normalized layouts (built incrementally per add).
//
// So we bake stable layouts here: a simple shelf/next-fit pack that is
// collision-free by construction and keeps every item inside the widget's
// size bounds, so normalizeLayouts is a no-op and the grid settles at once.

const DEMO_DASHBOARD_COLS: Record<string, number> = {
  xxl: 16, xl: 14, lg: 12, md: 10, sm: 6, xs: 2,
};

// Base width at 12 columns, fixed height (rows), and a minimum width — per
// widget type. Scaled per breakpoint below.
const DEMO_WIDGET_SIZING: Record<string, { baseW: number; h: number; minW: number }> = {
  kpi: { baseW: 3, h: 2, minW: 1 },
  bar: { baseW: 6, h: 4, minW: 3 },
  pie: { baseW: 6, h: 4, minW: 3 },
  line: { baseW: 6, h: 4, minW: 3 },
  area: { baseW: 6, h: 4, minW: 3 },
  milestone: { baseW: 6, h: 4, minW: 2 },
};

type DemoLayoutItem = { i: string; x: number; y: number; w: number; h: number };

export const buildDemoDashboardLayouts = (
  widgets: Array<Record<string, unknown>>,
): Record<string, DemoLayoutItem[]> => {
  const layouts: Record<string, DemoLayoutItem[]> = {};
  for (const [breakpoint, cols] of Object.entries(DEMO_DASHBOARD_COLS)) {
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    layouts[breakpoint] = widgets.map((widget) => {
      const sizing = DEMO_WIDGET_SIZING[widget.type as string] ?? DEMO_WIDGET_SIZING.bar;
      const target = Math.round((sizing.baseW * cols) / 12) || 1;
      const lo = Math.min(sizing.minW, cols);
      const w = Math.max(lo, Math.min(cols, target));
      const h = sizing.h;
      if (x + w > cols) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      const item: DemoLayoutItem = { i: widget.id as string, x, y, w, h };
      x += w;
      rowHeight = Math.max(rowHeight, h);
      return item;
    });
  }
  return layouts;
};
