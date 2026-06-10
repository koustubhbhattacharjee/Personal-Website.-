-- Add parent_email to students.
-- A logged-in Google account matching parent_email gets the same privileges as the student email.
alter table public.students
  add column if not exists parent_email text;
