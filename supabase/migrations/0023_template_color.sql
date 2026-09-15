-- Templates carry a colour, not people.
--
-- A template is a shape to make an event from, and adding an event starts from
-- a person's lane — so the people on the template were never the people on the
-- event. The app now writes templates with nobody on them and always with a
-- colour. Rows saved before that are brought in line: their people are cleared
-- and a missing colour becomes the palette default, which is what the app
-- already reads a missing one as.
update event_series
   set attendees = '{}',
       color_key = coalesce(color_key, '1')
 where is_template;
