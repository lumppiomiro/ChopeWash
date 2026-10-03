-- ChopeWash prototype schema. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create type public.machine_kind as enum ('washer', 'dryer');
create type public.machine_mode as enum ('booking', 'queue');
create type public.machine_status as enum ('available', 'running', 'finished', 'offline');
create type public.booking_status as enum ('confirmed', 'checked_in', 'complete', 'cancelled', 'no_show');
create type public.queue_status as enum ('waiting', 'offered', 'claimed', 'expired', 'left');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username)),
  display_name text not null,
  residence text not null default 'RC4',
  role text not null default 'resident' check (role in ('resident', 'operator')),
  created_at timestamptz not null default now()
);

create table public.machines (
  id text primary key,
  name text not null,
  kind public.machine_kind not null,
  mode public.machine_mode not null,
  status public.machine_status not null default 'available',
  cycle_ends_at timestamptz,
  location text not null default 'RC4 Level 1',
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  machine_id text not null references public.machines(id),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes in (30, 45, 60)),
  status public.booking_status not null default 'confirmed',
  paired_booking_id uuid references public.bookings(id),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (machine_id, starts_at)
);

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.machine_kind not null,
  status public.queue_status not null default 'waiting',
  offered_machine_id text references public.machines(id),
  offer_expires_at timestamptz,
  joined_at timestamptz not null default now()
);

create table public.machine_events (
  id bigint generated always as identity primary key,
  machine_id text not null references public.machines(id),
  event_type text not null check (event_type in ('vibration_started', 'vibration_stopped', 'manual_override')),
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create unique index one_active_queue_per_user_kind
  on public.queue_entries(user_id, kind)
  where status in ('waiting', 'offered', 'claimed');

alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.bookings enable row level security;
alter table public.queue_entries enable row level security;
alter table public.machine_events enable row level security;

create policy "Residents can read machine status" on public.machines
  for select to authenticated using (true);
create policy "Residents can read own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "Residents can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = user_id);
create policy "Residents can read own bookings" on public.bookings
  for select to authenticated using (auth.uid() = user_id);
create policy "Residents can create own bookings" on public.bookings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Residents can update own bookings" on public.bookings
  for update to authenticated using (auth.uid() = user_id);
create policy "Residents can read own queue entries" on public.queue_entries
  for select to authenticated using (auth.uid() = user_id);
create policy "Residents can join a queue" on public.queue_entries
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Residents can update own queue entries" on public.queue_entries
  for update to authenticated using (auth.uid() = user_id);

insert into public.machines (id, name, kind, mode, status) values
  ('washer-book', 'Washer 01', 'washer', 'booking', 'available'),
  ('dryer-book', 'Dryer 01', 'dryer', 'booking', 'running'),
  ('washer-queue', 'Washer 02', 'washer', 'queue', 'running'),
  ('dryer-queue', 'Dryer 02', 'dryer', 'queue', 'available')
on conflict (id) do nothing;
