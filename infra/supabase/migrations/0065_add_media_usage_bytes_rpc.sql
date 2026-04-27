create or replace function public.get_media_usage_bytes(
  p_column text,
  p_id uuid
)
returns bigint
language sql
stable
security definer
as $$
  select coalesce(
    case p_column
      when 'owner_id'     then (select sum(byte_size) from public.task_media where owner_id     = p_id)
      when 'workspace_id' then (select sum(byte_size) from public.task_media where workspace_id = p_id)
    end,
    0
  );
$$;
