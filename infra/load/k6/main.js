import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://motio.nikog.net';
const ANON_KEY = __ENV.ANON_KEY || '';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '';
const ASSIGNEE_ID = __ENV.ASSIGNEE_ID || '';
const PROJECT_ID = __ENV.PROJECT_ID || '';
const WRITE_STATUS_ID = __ENV.WRITE_STATUS_ID || '';
const WRITE_TYPE_ID = __ENV.WRITE_TYPE_ID || '';
const ENABLE_WRITE = (__ENV.ENABLE_WRITE || '0') === '1';

const DEFAULT_HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
};

if (!ANON_KEY || !AUTH_TOKEN || !WORKSPACE_ID) {
  throw new Error('ANON_KEY, AUTH_TOKEN and WORKSPACE_ID are required.');
}

const scenarios = {
  inbox_poll: {
    executor: 'constant-vus',
    vus: 12,
    duration: '6m',
    exec: 'inboxPoll',
  },
  planner_load: {
    executor: 'constant-vus',
    vus: 10,
    duration: '6m',
    exec: 'plannerLoad',
  },
  members_load: {
    executor: 'constant-vus',
    vus: 8,
    duration: '6m',
    exec: 'membersLoad',
  },
  projects_load: {
    executor: 'constant-vus',
    vus: 8,
    duration: '6m',
    exec: 'projectsLoad',
  },
  dashboard_stats: {
    executor: 'constant-vus',
    vus: 8,
    duration: '6m',
    exec: 'dashboardStats',
  },
};

if (ENABLE_WRITE && WRITE_STATUS_ID && WRITE_TYPE_ID) {
  scenarios.task_write = {
    executor: 'constant-vus',
    vus: 3,
    duration: '4m',
    exec: 'taskWrite',
  };
}

export const options = {
  discardResponseBodies: false,
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:inbox_poll}': ['p(95)<250'],
    'http_req_duration{scenario:planner_load}': ['p(95)<400'],
    'http_req_duration{scenario:members_load}': ['p(95)<450'],
    'http_req_duration{scenario:projects_load}': ['p(95)<450'],
    'http_req_duration{scenario:dashboard_stats}': ['p(95)<700'],
    ...(ENABLE_WRITE && WRITE_STATUS_ID && WRITE_TYPE_ID
      ? { 'http_req_duration{scenario:task_write}': ['p(95)<800'] }
      : {}),
  },
};

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const withHeaders = (extra = {}) => ({ headers: { ...DEFAULT_HEADERS, ...extra } });

const checkOk = (response, label) => check(response, {
  [`${label} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
});

export function inboxPoll() {
  const body = JSON.stringify({ action: 'list', includeSentUpdates: false, limit: 60 });
  const response = http.post(`${BASE_URL}/functions/v1/inbox`, body, withHeaders());
  checkOk(response, 'inbox');
  sleep(1);
}

export function plannerLoad() {
  const start = plusDays(-30);
  const end = plusDays(365);
  const query = [
    'select=id,title,project_id,assignee_id,assignee_ids,start_date,end_date,status_id,type_id,priority,tag_ids,description,repeat_id',
    `workspace_id=eq.${WORKSPACE_ID}`,
    `end_date=gte.${start}`,
    `start_date=lte.${end}`,
    'order=start_date.asc',
    'limit=250',
  ].join('&');

  const response = http.get(`${BASE_URL}/rest/v1/tasks?${query}`, withHeaders());
  checkOk(response, 'planner-load');
  sleep(1);
}

export function membersLoad() {
  const assigneeFilter = ASSIGNEE_ID
    ? `or=(assignee_id.eq.${ASSIGNEE_ID},assignee_ids.cs.{${ASSIGNEE_ID}})&`
    : '';
  const query = [
    'select=id,title,project_id,assignee_id,assignee_ids,start_date,end_date,status_id,type_id,priority,tag_ids,description,repeat_id',
    `workspace_id=eq.${WORKSPACE_ID}`,
    `${assigneeFilter}end_date=gte.${today()}`,
    'order=start_date.asc',
    'limit=200',
  ].join('&');

  const response = http.get(`${BASE_URL}/rest/v1/tasks?${query}`, withHeaders());
  checkOk(response, 'members-load');
  sleep(1);
}

export function projectsLoad() {
  const projectFilter = PROJECT_ID ? `project_id=eq.${PROJECT_ID}` : 'project_id=not.is.null';
  const query = [
    'select=id,title,project_id,assignee_id,assignee_ids,start_date,end_date,status_id,type_id,priority,tag_ids,description,repeat_id',
    `workspace_id=eq.${WORKSPACE_ID}`,
    projectFilter,
    'order=start_date.asc',
    'limit=250',
  ].join('&');

  const response = http.get(`${BASE_URL}/rest/v1/tasks?${query}`, withHeaders());
  checkOk(response, 'projects-load');
  sleep(1);
}

export function dashboardStats() {
  const body = JSON.stringify({
    p_workspace_id: WORKSPACE_ID,
    p_start_date: plusDays(-30),
    p_end_date: today(),
  });
  const response = http.post(
    `${BASE_URL}/rest/v1/rpc/dashboard_task_counts`,
    body,
    withHeaders(),
  );
  checkOk(response, 'dashboard-stats');
  sleep(1);
}

export function taskWrite() {
  const payload = {
    workspace_id: WORKSPACE_ID,
    title: `k6-load-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    start_date: today(),
    end_date: plusDays(1),
    status_id: WRITE_STATUS_ID,
    type_id: WRITE_TYPE_ID,
    tag_ids: [],
  };

  const createRes = http.post(
    `${BASE_URL}/rest/v1/tasks?select=id`,
    JSON.stringify(payload),
    withHeaders({ Prefer: 'return=representation' }),
  );
  const created = check(createRes, {
    'task-write create status is 201': (r) => r.status === 201,
  });

  if (!created) {
    sleep(1);
    return;
  }

  let createdId = null;
  try {
    const body = JSON.parse(createRes.body || '[]');
    createdId = Array.isArray(body) && body[0] && typeof body[0].id === 'string'
      ? body[0].id
      : null;
  } catch (_error) {
    createdId = null;
  }

  if (createdId) {
    const deleteRes = http.del(`${BASE_URL}/rest/v1/tasks?id=eq.${createdId}`, null, withHeaders());
    check(deleteRes, {
      'task-write cleanup status is 2xx/204': (r) => (r.status >= 200 && r.status < 300) || r.status === 204,
    });
  }

  sleep(1);
}
