-- 0008_realtime_dependencies.sql — stream dependency-link changes over Realtime.
--
-- `occurrence_dependency` is read by the app's load() (the "Waits on" links), but
-- 0006 didn't add it to the `supabase_realtime` publication, so a partner adding
-- or clearing a link wasn't pushed live. Add it, like the other calendar tables.
-- RLS still scopes delivery to rows each client may SELECT.

alter publication supabase_realtime add table occurrence_dependency;
