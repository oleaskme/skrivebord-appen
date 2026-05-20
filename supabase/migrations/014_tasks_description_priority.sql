alter table tasks add column if not exists priority text check (priority in ('high', 'medium', 'low'));
alter table tasks add column if not exists description text;
