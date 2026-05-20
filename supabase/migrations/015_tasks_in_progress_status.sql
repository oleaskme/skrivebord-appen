alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('open', 'completed', 'overdue', 'needs_review', 'in_progress', 'archived'));
