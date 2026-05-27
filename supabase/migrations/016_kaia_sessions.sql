create table if not exists kaia_sessions (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references folders(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  title       text not null default 'Samtale',
  messages    jsonb not null default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists kaia_sessions_folder_id_idx on kaia_sessions(folder_id);
create index if not exists kaia_sessions_updated_at_idx on kaia_sessions(updated_at desc);

alter table kaia_sessions enable row level security;
create policy "open_v1" on kaia_sessions for all using (true) with check (true);
