-- Data fingerprint of a database: row count and a checksum of every row of
-- every table in public, auth and storage, and the state of every sequence
-- there. The checksum does not depend on row order or on the server's text
-- sorting. pg-upgrade-17.sh compares it before and after the upgrade.
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
\set ON_ERROR_STOP 1
set search_path = pg_catalog;
set timezone = 'UTC';
set datestyle = 'ISO, YMD';
set intervalstyle = 'postgres';
set extra_float_digits = 1;
set bytea_output = 'hex';

-- storage.migrations keeps the time each migration ran: it differs by design.
select format('select %L, count(*), coalesce(md5(string_agg(md5(x::text), %L order by md5(x::text))), %L) from %s x',
              c.oid::regclass::text, '', '-', c.oid::regclass)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth', 'storage') and c.relkind in ('r', 'p') and not c.relispartition
  and c.oid::regclass::text <> 'storage.migrations'
order by 1
\gexec

select format('select %L, last_value, is_called from %s', c.oid::regclass::text, c.oid::regclass)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth', 'storage') and c.relkind = 'S'
order by 1
\gexec
