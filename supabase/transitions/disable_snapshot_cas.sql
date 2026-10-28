-- Only after closing old/new tabs, exporting pending queues and backup review.
-- This restores the old writer risk. Prefer visual rollback with RPC enabled.
begin;
grant insert, update, delete on public.studyhub_states to authenticated;
-- Keep the RPC for new clients still open; no snapshots/history are deleted.
commit;
