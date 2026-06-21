-- 0015_unified_colors.sql
--
-- Collapses the separate user/event palettes into one unified 12-color palette
-- keyed by number ('1'..'12'). The color *values* now live in the frontend CSS
-- (src/styles/swatches.css); the DB only stores keys.
--
-- Converts the previous key forms to numeric:
--   person.color:           'user_N'  -> 'N'   (else -> '8', the default Me color)
--   event_series.color_key: 'event_N' -> 'N'   (else -> null = inherit person)
-- and fixes the account-bootstrap function to seed a key, not a hex string.

-- ---- person.color -> numeric key --------------------------------------------
update person set color = substring(color from 6)
  where color ~ '^user_[0-9]+$';
-- anything still non-numeric (hex, old names) falls back to the default
update person set color = '8'
  where color !~ '^[0-9]+$';

-- ---- event_series.color_key -> numeric key ----------------------------------
update event_series set color_key = substring(color_key from 7)
  where color_key ~ '^event_[0-9]+$';
update event_series set color_key = null
  where color_key is not null and color_key !~ '^[0-9]+$';

-- ---- seed new accounts with a palette key, not a hex color -------------------
create or replace function create_account(p_name text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_account: not authenticated';
  end if;
  insert into account (name) values (p_name) returning id into v_id;
  insert into account_member (account_id, user_id, role)
  values (v_id, auth.uid(), 'owner');
  insert into person (account_id, user_id, name, color, kind, sort_order)
  values (v_id, auth.uid(), 'Me', '8', 'adult', 0);
  return v_id;
end;
$$;
