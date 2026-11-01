-- Roll back feature access without deleting plans, versions, events or protections.
-- Also turn VITE_WORKSPACE_PLANNING_CLOUD_READY off in the next authorized build.
begin;
revoke execute on function public.studyhub_save_planned_snapshot(uuid,jsonb,bigint) from service_role;
-- Keep the guard: an old client must not silently erase saved planning data.
commit;
