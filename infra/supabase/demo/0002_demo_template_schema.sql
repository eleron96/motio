-- Demo project only. Schema that holds the canonical seed content used
-- to bootstrap each visitor's sandbox workspace. Values are copied (not
-- referenced) into real workspace tables by seed_demo_workspace().
--
-- Dates are stored as INTEGER offsets in days, resolved at copy time
-- against current_date. This keeps the demo timeline always centered on
-- the visitor's today (~±2 months) without any frontend date mocking.

create schema if not exists demo_template;

-- Template entities use deterministic uuids so cross-references between
-- template_tasks and their project/status/type/assignee/tags can be
-- expressed inline. Runtime tables also use uuid PKs so copying is a
-- straight insert with the same id values.

create table demo_template.projects (
  id uuid primary key,
  name text not null,
  color text not null,
  sort_order int not null default 0
);

create table demo_template.assignees (
  id uuid primary key,
  name text not null,
  sort_order int not null default 0
);

create table demo_template.statuses (
  id uuid primary key,
  name text not null,
  color text not null,
  is_final boolean not null default false,
  is_cancelled boolean not null default false,
  sort_order int not null default 0
);

create table demo_template.task_types (
  id uuid primary key,
  name text not null,
  icon text,
  sort_order int not null default 0
);

create table demo_template.tags (
  id uuid primary key,
  name text not null,
  color text not null,
  sort_order int not null default 0
);

create table demo_template.tasks (
  id uuid primary key,
  title text not null,
  project_id uuid references demo_template.projects(id) on delete set null,
  assignee_ids uuid[] not null default '{}',
  status_id uuid not null references demo_template.statuses(id),
  type_id uuid not null references demo_template.task_types(id),
  priority text,
  tag_ids uuid[] not null default '{}',
  description text,
  start_offset_days int not null,
  end_offset_days int not null,
  sort_order int not null default 0
);

create table demo_template.milestones (
  id uuid primary key,
  project_id uuid not null references demo_template.projects(id) on delete cascade,
  title text not null,
  offset_days int not null,
  sort_order int not null default 0
);
