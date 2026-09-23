-- Lets the app owner read and clear problem reports from an in-app admin
-- view instead of needing the Supabase dashboard. Scoped to specific emails
-- (not "any authenticated user") since reports can contain other students'
-- account details -- nobody else should be able to read this table.
create policy "Admin can read all reports" on public.problem_reports
  for select using (auth.jwt() ->> 'email' in ('iwillnever12312@gmail.com', 'kjvboy@icloud.com'));

create policy "Admin can delete reports" on public.problem_reports
  for delete using (auth.jwt() ->> 'email' in ('iwillnever12312@gmail.com', 'kjvboy@icloud.com'));
