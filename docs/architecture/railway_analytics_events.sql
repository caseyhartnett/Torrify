create extension if not exists pgcrypto;

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  event_name text not null,
  anonymous_id text not null,
  session_id text not null,
  runtime text not null check (runtime in ('web')),
  page text not null,
  app_version text not null,
  props jsonb not null default '{}'::jsonb,
  origin text,
  user_agent text,
  ip_hash text
);

create index if not exists analytics_events_received_at_idx on analytics_events (received_at desc);
create index if not exists analytics_events_event_name_idx on analytics_events (event_name);
create index if not exists analytics_events_anonymous_id_idx on analytics_events (anonymous_id);
create index if not exists analytics_events_props_gin_idx on analytics_events using gin (props);

create or replace view analytics_daily_event_counts as
select
  date_trunc('day', occurred_at) as event_day,
  event_name,
  count(*) as event_count
from analytics_events
group by 1, 2
order by 1 desc, 2 asc;

create or replace view analytics_torrify_file_activity as
select
  date_trunc('day', occurred_at) as event_day,
  count(*) filter (where event_name = 'project_download_initiated') as torrify_downloads,
  count(*) filter (where event_name = 'project_upload_selected') as torrify_uploads_selected,
  count(*) filter (where event_name = 'project_upload_parsed' and coalesce((props ->> 'success')::boolean, false)) as torrify_uploads_parsed
from analytics_events
group by 1
order by 1 desc;
