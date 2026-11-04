-- Catalog fingerprint of a database: one "section|object|details" line per
-- extension, schema, table, column, function, trigger, policy, index,
-- constraint, type, publication, role, default privilege and event trigger.
-- No secrets. pg-upgrade-17.sh compares it before and after the upgrade.
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
\set ON_ERROR_STOP 1
set search_path = pg_catalog;

with s as (select oid, nspname from pg_namespace
           where nspname not in ('pg_catalog','information_schema','pg_toast') and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%')
select regexp_replace(concat_ws('|', a, b, c, d, e, f), '\s*\n\s*', ' ', 'g') as line from (
  select 'ext' as a, e.extname as b, e.extversion as c, n.nspname as d, null::text as e, null::text as f from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  union all
  select 'schema', s.nspname, pg_get_userbyid(n.nspowner), coalesce(n.nspacl::text,''), null, null from s join pg_namespace n on n.oid = s.oid
  union all
  select 'rel', s.nspname || '.' || c.relname, c.relkind::text, pg_get_userbyid(c.relowner),
         coalesce(c.relacl::text,''), c.relrowsecurity::text || '/' || c.relforcerowsecurity::text || '/' || c.relreplident::text
  from pg_class c join s on s.oid = c.relnamespace
  where c.relkind in ('r','p','v','m','S','f') and c.relname !~ '^messages_[0-9_]+$' and not exists (select 1 from pg_depend dep where dep.objid = c.oid and dep.classid = 'pg_class'::regclass and dep.deptype = 'e')
  union all
  select 'col', s.nspname || '.' || c.relname || '.' || a.attname, format_type(a.atttypid, a.atttypmod),
         a.attnotnull::text, coalesce(pg_get_expr(d.adbin, d.adrelid),''), coalesce(a.attacl::text,'')
  from pg_attribute a join pg_class c on c.oid = a.attrelid join s on s.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped and c.relkind in ('r','p','v','m','f') and c.relname !~ '^messages_[0-9_]+$' and not exists (select 1 from pg_depend dep where dep.objid = c.oid and dep.classid = 'pg_class'::regclass and dep.deptype = 'e')
  union all
  select 'func', s.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         pg_get_userbyid(p.proowner), p.prosecdef::text || '/' || coalesce(array_to_string(p.proconfig, ','),''),
         coalesce(p.proacl::text,''), md5(coalesce(p.prosrc,''))
  from pg_proc p join s on s.oid = p.pronamespace
  where not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
  union all
  select 'trigger', c.oid::regclass::text || '.' || t.tgname, pg_get_triggerdef(t.oid), t.tgenabled::text, null, null
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join s on s.oid = c.relnamespace where not t.tgisinternal
    and c.relname !~ '^messages_[0-9_]+$'
  union all
  select 'policy', schemaname || '.' || tablename || '.' || policyname, permissive || '/' || cmd, array_to_string(roles, ','),
         coalesce(qual,''), coalesce(with_check,'') from pg_policies where tablename !~ '^messages_[0-9_]+$'
  union all
  select 'index', schemaname || '.' || indexname, indexdef, null, null, null from pg_indexes
  where schemaname not in ('pg_catalog','information_schema') and tablename !~ '^messages_[0-9_]+$'
  union all
  select 'constraint', c.conrelid::regclass::text || '.' || c.conname, pg_get_constraintdef(c.oid), null, null, null
  from pg_constraint c join s on s.oid = c.connamespace where c.conrelid <> 0
    and c.conrelid::regclass::text !~ 'messages_[0-9_]+$'
  union all
  select 'type', s.nspname || '.' || t.typname, t.typtype::text,
         coalesce((select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = t.oid),''), null, null
  from pg_type t join s on s.oid = t.typnamespace
  where t.typtype in ('e','d','c') and (t.typtype <> 'c' or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
    and not exists (select 1 from pg_depend dep where dep.objid = t.oid and dep.deptype = 'e')
  union all
  select 'pubtable', p.pubname, pt.schemaname || '.' || pt.tablename, null, null, null from pg_publication p
  join pg_publication_tables pt on pt.pubname = p.pubname
  union all
  select 'pub', pubname, puballtables::text || '/' || pubinsert::text || pubupdate::text || pubdelete::text || pubtruncate::text, null, null, null from pg_publication
  union all
  select 'role', r.rolname,
         concat_ws(',', case when r.rolsuper then 'super' end, case when r.rolinherit then 'inherit' end,
                   case when r.rolcreaterole then 'createrole' end, case when r.rolcreatedb then 'createdb' end,
                   case when r.rolcanlogin then 'login' end, case when r.rolreplication then 'replication' end,
                   case when r.rolbypassrls then 'bypassrls' end),
         coalesce((select string_agg(g.rolname, ',' order by g.rolname) from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = r.oid),''),
         coalesce((select array_to_string(setconfig, ',') from pg_db_role_setting where setrole = r.oid and setdatabase = 0),''),
         coalesce((select array_to_string(setconfig, ',') from pg_db_role_setting where setrole = r.oid and setdatabase = (select oid from pg_database where datname = current_database())),'')
  from pg_roles r where r.rolname !~ '^pg_'
  union all
  select 'defacl', pg_get_userbyid(d.defaclrole), coalesce(n.nspname,'*'), d.defaclobjtype::text, d.defaclacl::text, null
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
  union all
  select 'database', datname, coalesce(datacl::text,''), pg_encoding_to_char(encoding) || '/' || datcollate || '/' || datctype, null, null
  from pg_database where datname = current_database()
  union all
  select 'dbsetting', coalesce((select rolname from pg_roles where oid = setrole), '*'), array_to_string(setconfig, ','), null, null, null
  from pg_db_role_setting where setdatabase = (select oid from pg_database where datname = current_database()) and setrole = 0
  union all
  select 'evttrigger', evtname, evtevent, evtfoid::regproc::text, evtenabled::text, null from pg_event_trigger
) x order by 1;
