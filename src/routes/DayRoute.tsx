import { useMemo, useState } from "react";
import { useAccount } from "../account";
import { useNow } from "../assets/hooks/useNow";
import { LoadingPill } from "../assets/ui/Spinner";
import { TimeGutter } from "../assets/ui/TimeGutter";
import { addDays, isoLabel, toISODate } from "../assets/utils/dates";
import { EventSearch } from "../components/EventSearch";
import { type EditorTarget, EventEditor } from "../components/EventEditor";
import { OccurrenceSheet } from "../components/OccurrenceSheet";
import { AllDayChip } from "../domains/events/components/AllDayChip";
import { EventBlock } from "../domains/events/components/EventBlock";
import { useEvents } from "../domains/events/queries";
import { useCompletionsForRange } from "../domains/occurrences/queries";
import { Avatars } from "../domains/people/components/Avatars";
import { LaneHead } from "../domains/people/components/LaneHead";
import { usePeople } from "../domains/people/queries";
import { eventColorIn, personColorMap } from "../domains/people/selectors";
import { usePreferences } from "../domains/preferences/queries";
import { personColors } from "../domains/preferences/selectors";
import { useCalendarNavigation } from "../navigation";
import { loadZoom } from "../services/gestures";
import {
  type DayOccurrence,
  nextRelevantDate,
  occurrencesOnDate,
} from "../services/recurrence";
import {
  DAY_MIN,
  type TimeBlock,
  layoutBlocks,
} from "../services/timeline-layout";
import type { CalendarEvent, PersonId } from "../types";
import { CalendarView } from "../views/Calendar";
import { TimelineView } from "../views/Timeline";

const ZOOM_KEY = "planner:hourH";
const SNAP = 15;

/** One page of the deck: a day, already expanded. */
interface DayPage {
  iso: string;
  timedBlocks: TimeBlock[];
  allDayOccs: DayOccurrence[];
}

/**
 * The Day screen, wired up.
 *
 * Reads the domains, feeds the recurrence service, and composes the calendar
 * view from slots: one lane per person in the header, and three day pages in
 * the deck. Every join between domains — which chips sit in which lane, what
 * colour a thing shows in — is made here.
 *
 * The editor and the occurrence sheet are opened from here rather than from
 * the view, because *how a thing is reached* is the shell's business.
 */
export function DayRoute() {
  const nav = useCalendarNavigation();
  const { accountId, userId } = useAccount();
  const { data: events = [] } = useEvents(accountId);
  const { data: people = [] } = usePeople(accountId);
  const { data: overrides = {} } = usePreferences(
    accountId,
    userId,
    personColors,
  );

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [sheet, setSheet] = useState<{
    event: CalendarEvent;
    date: string;
  } | null>(null);
  // Pixels-per-hour for the timeline. The view pinches it, the pages draw with
  // it; the key is this screen's, which is why the route holds it.
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY));
  // The person whose lane is expanded, if any.
  const [focusLane, setFocusLane] = useState<PersonId | null>(null);

  const dateISO = addDays(nav.weekStart, nav.selectedDay);
  const prevISO = addDays(dateISO, -1);
  const nextISO = addDays(dateISO, 1);

  const now = useNow();
  const todayISO = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Windowed per-occurrence state for the visible day and its swipe neighbours.
  const { completions, isLoading } = useCompletionsForRange(
    accountId,
    prevISO,
    nextISO,
  );

  // One entry per deck page: yesterday, the visible day, tomorrow. This is the
  // expensive part of a render (recurrence expansion), and none of it depends
  // on zoom or gesture state — so it is computed once here, not per frame.
  const pages = useMemo<DayPage[]>(
    () =>
      [prevISO, dateISO, nextISO].map((iso) => {
        const occs = occurrencesOnDate(events, iso, completions);
        const timedBlocks: TimeBlock[] = occs
          .filter((o) => !o.event.allDay)
          .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end }));
        return {
          iso,
          timedBlocks,
          allDayOccs: occs.filter((o) => o.event.allDay),
        };
      }),
    [events, completions, prevISO, dateISO, nextISO],
  );

  /** Open a search hit at the event's next upcoming occurrence. */
  function openSearchHit(seriesId: string) {
    const event = events.find((e) => e.id === seriesId);
    if (!event) return;
    const date = nextRelevantDate(event);
    nav.goToDate(date);
    setEditor({ mode: "edit", event, occurrenceDate: date });
  }

  function openOccurrence(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start });
  }

  /** Tap on empty lane: a new hour-long event for that person, snapped. */
  function addAt(date: string, person: PersonId, minute: number) {
    const start = Math.min(
      Math.max(0, Math.round(minute / SNAP) * SNAP),
      DAY_MIN - SNAP,
    );
    setEditor({
      mode: "new",
      date,
      attendees: [person],
      startMin: start,
      endMin: Math.min(start + 60, DAY_MIN),
    });
  }

  function toggleLane(id: PersonId) {
    setFocusLane((cur) => (cur === id ? null : id));
  }

  // Everyone's colour, resolved once; the pages and the leaves only paint.
  const colors = useMemo(
    () => personColorMap(people, overrides),
    [people, overrides],
  );
  const { allDayOccs } = pages[1];

  /** The people on an occurrence, with their colours, for its avatars. */
  function avatarsFor(ids: PersonId[]) {
    return ids.flatMap((id) => {
      // A person not in the list yet (first fetch in flight, or one a partner
      // just removed) must not crash the view.
      const p = people.find((x) => x.id === id);
      return p ? [{ person: p, color: colors[id] }] : [];
    });
  }

  // A column per person, with every block that person is on. A shared event
  // simply appears in each attendee's column, coloured by that lane.
  const page = (p: DayPage) => (
    <TimelineView pxPerMin={hourH / 60}>
      {people.map((person) => (
        <TimelineView.Column
          key={person.id}
          nowMin={p.iso === todayISO ? nowMin : undefined}
          onAddAt={(minute) => addAt(p.iso, person.id, minute)}
        >
          {layoutBlocks(
            p.timedBlocks.filter((b) => b.occ.attendees.includes(person.id)),
          ).map(({ block, col, cols }) => (
            <EventBlock
              key={`${block.occ.event.id}:${block.occ.start}`}
              occ={block.occ}
              color={eventColorIn(colors[person.id], block.occ.event.colorKey)}
              pxPerMin={hourH / 60}
              col={col}
              cols={cols}
              onClick={() => openOccurrence(block.occ)}
            >
              {/* Who is on it THIS day — an override replaces the roster. */}
              {block.occ.attendees.length > 1 && (
                <Avatars attendees={avatarsFor(block.occ.attendees)} />
              )}
            </EventBlock>
          ))}
        </TimelineView.Column>
      ))}
    </TimelineView>
  );

  return (
    <>
      <CalendarView
        pageKey={dateISO}
        onNavigate={nav.shiftDay}
        onGoToday={() => nav.goToDate(todayISO)}
        todayActive={dateISO === todayISO}
        zoom={{ hourH, setHourH, key: ZOOM_KEY }}
        initialMinute={dateISO === todayISO ? nowMin : 7 * 60}
      >
        <CalendarView.Header.Search>
          <EventSearch onPick={openSearchHit} />
        </CalendarView.Header.Search>
        <CalendarView.Header.Title>{isoLabel(dateISO)}</CalendarView.Header.Title>
        {people.map((p) => (
          <CalendarView.Header.Lane
            key={p.id}
            weight={p.id === focusLane ? 4 : 1}
          >
            <LaneHead
              person={p}
              color={colors[p.id]}
              isExpanded={focusLane === p.id}
              onToggleLane={() => toggleLane(p.id)}
            >
              {allDayOccs
                .filter((o) => o.attendees.includes(p.id))
                .map((o) => (
                  <AllDayChip
                    key={`${o.event.id}:${o.start}`}
                    occ={o}
                    color={eventColorIn(colors[p.id], o.event.colorKey)}
                    onClick={() => openOccurrence(o)}
                  />
                ))}
            </LaneHead>
          </CalendarView.Header.Lane>
        ))}
        <CalendarView.Gutter>
          <TimeGutter hourH={hourH} />
        </CalendarView.Gutter>
        <CalendarView.Previous>{page(pages[0])}</CalendarView.Previous>
        <CalendarView.Current>{page(pages[1])}</CalendarView.Current>
        <CalendarView.Next>{page(pages[2])}</CalendarView.Next>
      </CalendarView>

      {isLoading && <LoadingPill />}

      {editor && (
        <EventEditor target={editor} onClose={() => setEditor(null)} />
      )}
      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setEditor({
              mode: "edit",
              event: sheet.event,
              occurrenceDate: sheet.date,
            });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
