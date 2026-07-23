-- 在 Supabase SQL Editor 執行一次
create table if not exists public.subscribers (
  user_id text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

-- 後端用 anon key 讀寫（與既有 checkins 相同做法；若你有更嚴的 RLS 再自行調整）
create policy "allow all for anon"
  on public.subscribers
  for all
  using (true)
  with check (true);
