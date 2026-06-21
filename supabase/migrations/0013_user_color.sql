-- 0013_user_color.sql
--
-- User colors move from free-form hex to a fixed nine-color palette keyed by name
-- (the keys live in the frontend, src/lib/palette.ts). `person.color` now stores
-- a palette *key* instead of a hex string. This migration rewrites any existing
-- hex value to its closest key, defaulting unknowns to 'indigo'.
--
-- The three known seed colors map to their palette equivalents; everything else
-- (and anything still hex-shaped) becomes the default. Per-user overrides live in
-- user_preference.prefs (jsonb) and are coerced/dropped client-side on load, so
-- they need no SQL migration here.

update person set color = case lower(color)
  when '#4f46e5' then 'indigo'
  when '#ec4899' then 'pink'
  when '#14b8a6' then 'teal'
  else 'indigo'
end
where color like '#%';
