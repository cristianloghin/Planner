# Navigation: the shell and the zoom axis

Two changes to how the app is moved through, planned together because they
are decided together, built separately because they touch different code.

1. **The shell** — three workspaces: the family calendar in the middle, the
   user's dashboard to its left, the editor to its right. Swipe or tap.
2. **The zoom axis** — the calendar as one continuous thing: pinch in from the
   month to the week, to the family day, to the signed-in user's own lane; and
   back out.

**Status: design only.** The shell uses `@mikrostack/router`'s workspaces and
needs two small changes to that library, which the same author owns. The
routines feature in [`ROUTINES.md`](./ROUTINES.md) comes first and depends on
neither of these.

The app is used exclusively as a PWA on an iPhone, and that is not expected to
change. Everything below is designed for a phone; the desktop keeps the tab
bar and loses nothing it has today.

---

## 1. The shell

### Three workspaces, one root

```
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │ dashboard │ ← │ calendar  │ → │  editor   │
   │  (mine)   │   │  (root)   │   │ (library) │
   └───────────┘   └───────────┘   └───────────┘
                   ▲ first launch
```

- **The calendar is the root page.** It is what the app opens on, and it stays
  a *routed* area: `/day/:date`, `/week/:weekStart`, `/month/:month`, the
  event editor, settings. Nothing in `routes.tsx` changes because of the shell.
- **The dashboard** is a workspace to the left. It is the signed-in user's own
  surface: their day, and whatever personal productivity tools earn a place
  there. It is a playground, and it is *not* part of the calendar — it may
  share a view with the calendar's my-lane level or it may not; that is its
  own decision each time.
- **The editor** is a workspace to the right: templates, notes, routines. The
  things you open, leave, and come back to.
- **The bottom bar stays.** Swipe or tap reach the same three places. On a
  phone both are good; the tab bar is also what makes the workspace swipe safe
  to confine to a zone (see *Gestures* below).

### What the router gives, and the two things it needs

The router's workspaces are persistent, URL-addressable view instances laid
out by an adapter; on a coarse pointer the default adapter is *swipe*, which
arranges open workspaces as side-by-side pages with the root page at position
zero. Containers are headless, so the chrome is the app's. Both fit.

Two things the current library does not do, to be added to it rather than
worked around:

1. **A position before the root.** The swipe deck is linear from page zero, so
   every workspace sits to the right. The dashboard wants to be on the left.
   A `position: 'before' | 'after'` on a workspace template (or an ordering
   hook on the adapter) is the change.
2. **Gesture delegation.** The calendar already owns horizontal swipe for its
   date deck (`services/gestures`), and the swipe adapter uses horizontal
   swipe to move between workspaces. On the root page they collide. The
   adapter needs a rule for *which touches it may claim* — an edge zone, a
   region such as the header, or "none: the tab bar switches, swipe is the
   page's". Decide on the phone. One caution: the screen edge is where iOS
   keeps its own back gesture, and a standalone PWA is not exempt.

Two conventions the app adopts for using workspaces as fixed sections:

- `maxInstances: 1` and `persistent: true` on both templates, and a bootstrap
  on mount that opens both so the deck has its pages from the first launch.
  `open()` dedupes on params, so the bootstrap is idempotent.
- **No close.** The chrome never offers it; a workspace is a place, not a
  document.

### Why the calendar is the root, and not a workspace

A workspace owns its URL through its params, and `updateParams` *replaces* the
URL. Making the calendar a workspace would cost exactly the things the route
table's own docblock fought for: the guards that normalise a date, the back
button walking dates, and the event editor as a full-page route that back
closes and reload keeps open. As the root page the calendar keeps all of it,
and a route navigation from inside a workspace lands on page zero — which is
the calendar, which is where the event editor belongs.

*Rejected:* dashboard as root, calendar as a workspace. Better in one way —
"my day first" — and worse in every other, including the one that matters
most on a phone: a route navigation from the calendar workspace would jump
the deck to the dashboard to edit an event and jump back after saving.

### The dashboard

Its own workspace, its own URL, persistent, left alone. On day one it can be
as small as today plus settings. It grows by adding **per-user** tools: a
scratch list, a note to self, a timer. Small state goes in the
`user_preference` bag; a tool that needs real rows gets its own table scoped
by account and user, the way preferences are, and the standalone note from
[`NOTE_MODEL.md`](./NOTE_MODEL.md) is the obvious first candidate. Domains
stay separate, so a tool that does not earn its keep is a folder to delete.

---

## 2. The zoom axis

### Four levels

The calendar is one thing seen at four distances. Pinching moves between them
continuously; the levels are where the pinch settles.

| Level | Horizontal axis | Vertical axis | Route |
|---|---|---|---|
| **My lane** | one person, full width | time | `/me/:date` (new) |
| **Family day** | a lane per person | time | `/day/:date` |
| **Week** | a column per weekday, attendees merged | time | `/week/:weekStart` |
| **Month** | days in a 6×7 grid | weeks | `/month/:month` |

The innermost level is the personal planner: the family's events that involve
this user, their routine underneath (on by default, see
[`ROUTINES.md`](./ROUTINES.md)), swiped by day. It needs "which lane is me",
which the routines feature provides. Until that is set it shows the first
lane with no backdrop and says so.

**Routes stay.** The zoom is *navigation between levels*, not one component
that draws every intermediate state. Each level keeps its route, its date in
the URL and its guard; a zoom that settles is a `navigate` to the next level
with the focal date. Deep links, the back button and reload all keep working
because nothing about them changed.

### One zoom scalar, four ranges

Today the pinch drives hour height, between 28 and 160 pixels, and only where
a level has one. Instead the pinch drives a **single zoom value** across the
whole axis, and each level maps its slice of the range to its own continuous
variable:

```
  my lane ──────── family day ──────── week ──────── month
  lane width         hour height        hour height    column density
  (mine → 1/N)       (160 → 28 px)      (…)            (reflow)
```

- Inside a level, the pinch keeps doing what it does now.
- The two ends of a level's range are the doorways to the levels either side.
- The URL holds the level and the date; the scalar lives in local storage,
  exactly as the hour height does today (`loadZoom`).
- The gesture service gains one event — *pinched past the limit*, with the
  focal point — and no knowledge of what the levels are.

### The focal point picks the date

Pinching in on Wednesday at 15:00 in the week lands on Wednesday's day view
scrolled to 15:00. Pinching out from a day lands on the week that contains it.
The rule already exists: `useVisibleDate` in `App.tsx` maps a day to its week
or month, and a month to today when it contains it. The zoom uses the same
mapping, with the finger's position replacing "the visible date" where a
level has more than one day on screen.

### Two kinds of transition

**Between my lane and the family day, and between the family day and the
week, the transition is a zoom.** All three share the vertical time axis; only
the horizontal density changes. My lane at full width shrinks as the other
lanes fade in beside it; the day's lanes collapse into one column as six more
days appear. The routine backdrop fades with the lane width unless the user
has opted their own lane into the family day, in which case it stays.

**Between the week and the month, the transition is a reflow, not a zoom.**
The month drops the time axis: rows are weeks, cells are days, blocks become
bars and dots. There is no continuous geometry between seven time columns and
a 6×7 grid, and no amount of interpolation makes one. So the week strip
becomes one row of the grid, the rows around it fold in, and blocks shrink
into dots — a *morph*, animated between two DOM states with the browser's
View Transitions API and a named element for the focal week. It reads as
continuous if the week row lands where the pinch was.

*Rejected:* redesigning the month as a time-axis view (four or five weeks of
sliver columns) to make the zoom truly continuous. It would lose the grid's
density — all-day bars, the selected-day overview — for the sake of a gesture.
A design trade, not a technical one, and not one to make.

### Gestures, settled

The Week's tap-to-widen a weekday and the Month's tap-to-select a cell both
overlap with a zoom. Settled the way Photos settles it:

| Gesture | Meaning |
|---|---|
| **Pinch** | continuous zoom; settles at a level |
| **Double-tap** | one level in, at the focal point |
| **Single tap** | keeps its current meaning: select a cell, open an occurrence, add at a time |
| **Horizontal swipe** | one unit of the current level: a day, a week, a month. My lane swipes by day too. |

The widen-a-weekday feature goes; it was the zoom before there was one.

Pinch is a two-finger gesture and the deck swipe is one-finger horizontal;
`services/gestures` already tells them apart. Neither meets the workspace
swipe, which is the shell's concern (§1).

### What each level shows of routines

See the levels table in [`ROUTINES.md`](./ROUTINES.md): on by default in my
lane, opt-in per lane in the family day, never in the week or the month.

---

## 3. Order of work

1. **Routines** — model, editor in the library, backdrop in the existing Day
   screen, the "this lane is me" setting. Lands under the current tab bar;
   changes nothing about navigation.
2. **The zoom axis** — the `/me/:date` route, the zoom scalar, the pinch
   event, the transitions. Touches the most existing code and is the one to
   feel on the phone before deciding how far the continuity goes.
3. **The shell** — the two router changes, the two workspaces, the bootstrap,
   the bottom bar's new targets. Purely additive to the calendar.

Each is its own branch and its own argument. Doing two together would make it
hard to tell which one caused a regression.

---

## Open questions

- **The workspace swipe zone.** Edge, header, or tab-bar-only. Decide on the
  device, with the iOS back gesture in mind.
- **iOS floor.** Same-document View Transitions arrived in iOS Safari 18.
  Check what the household runs before leaning on them for the morph; the
  fallback is a crossfade.
- **The my-lane route name.** `/me/:date` is proposed; it is user-relative
  where every other calendar route is not, which is honest but new.
- **The first dashboard tool** beyond today and settings.
- **Lane collapse threshold.** At what column width, between the family day
  and the week, do lanes stop being drawn as sub-columns and merge. A number
  to find on the phone.
