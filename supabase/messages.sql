-- 在 Supabase SQL Editor 執行一次
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  user_id text not null,
  text text not null,
  line_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_user_id_created_at_idx
  on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;

create policy "allow all for anon on messages"
  on public.messages
  for all
  using (true)
  with check (true);
