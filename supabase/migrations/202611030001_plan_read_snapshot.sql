-- The planning handler reads the owner's current revision before validating
-- commands. Some older installations did not grant this read to the server.
-- All writes still go through the existing CAS functions.
begin;
grant select on public.studyhub_states to service_role;
commit;
