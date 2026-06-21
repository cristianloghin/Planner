-- 0012_event_color.sql
--
-- Lets an event carry an optional color of its own, so events can be color-coded
-- by kind (e.g. red for doctor's appointments). The value is a *key* into the
-- fixed event-color palette defined in the frontend (src/lib/palette.ts); the
-- HSL values themselves live in code, not the DB.
--
-- null = no event color chosen -> the timeline falls back to the attendee's main
-- user color for the left border. We deliberately do NOT add a CHECK constraint
-- listing the valid keys: the palette is owned by the frontend and may be
-- renamed/extended without a schema migration. Validation is the client's job.
--
-- `event_series` is already in the realtime publication (0006) with replica
-- identity full (0011), so the new column ships to clients with no extra change.

alter table event_series add column color_key text;
