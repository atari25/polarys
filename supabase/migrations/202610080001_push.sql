create table public.push_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  platform text not null check (platform = 'ios'),
  updated_at timestamptz not null default now()
);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon;
grant select, insert, update, delete on public.push_devices to authenticated;
create policy own_devices on public.push_devices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Only the server may read audience lists or send broadcasts.
create table public.push_broadcasts (
  id uuid primary key,
  title text not null,
  body text not null,
  status text not null default 'sending',
  created_at timestamptz not null default now()
);
create table public.push_receipts (
  id text primary key,
  broadcast_id uuid not null references public.push_broadcasts(id),
  token text not null,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);
alter table public.push_broadcasts enable row level security;
alter table public.push_receipts enable row level security;
revoke all on public.push_broadcasts, public.push_receipts from anon, authenticated;
