import { useNavigation, useParams } from "@mikrostack/router";
import { useMemo, useState } from "react";
import { useAccount } from "../account";
import { useNow } from "../assets/hooks/useNow";
import { DayHead } from "../assets/ui/DayHead";
import { LoadingPill } from "../assets/ui/Spinner";
import { TimeGutter } from "../assets/ui/TimeGutter";
import {
  DAY_NAMES,
  addDays,
  isoWeekNumber,
  mondayOf,
  toISODate,
  weekRangeLabel,
} from "../assets/utils/dates";
import { EventSearch } from "../components/EventSearch";
import { OccurrenceSheet } from "../components/OccurrenceSheet";
import { AllDayChip } from "../domains/events/components/AllDayChip";
import { EventBlock } from "../domains/events/components/EventBlock";
import { useEvents } from "../domains/events/queries";
import { useCompletionsForRange } from "../domains/occurrences/queries";
import { usePeopleWithColors } from "../domains/people/queries";
import { eventColorIn } from "../domains/people/selectors";
import { loadZoom } from "../services/gestures";
import {
  type DayOccurrence,
  nextRelevantDate,
  occurrencesOnDate,
} from "../services/recurrence";
import { layoutBlocks } from "../services/timeline-layout";
import type { CalendarEvent } from "../types";
import { CalendarView } from "../views/Calendar";
import { editEventPath, newEventAtPath } from "./eventPaths";
import { TimelineView } from "../views/Timeline";

// The Week grid keeps its own zoom level: a comfortable hour height for one
// day (three lanes) is usually too tall for a seven-day overview.
const ZOOM_KEY = "planner:weekHourH";

/** One visible day: its ISO date plus that day's expanded occurrences. */
interface WeekDay {
  dateISO: string;
  occs: DayOccurrence[];
}

/**
 * The Week screen, wired up: seven weekday lanes in the header, three week
 * pages in the deck. Same shape as the Day screen with people swapped for
 * weekdays — which is why the view can serve both.
 */
export function WeekRoute() {
  const { navigate } = useNavigation();
  const { weekStart } = useParams("/week/:weekStart");
  const goToWeek = (monday: string) =>
    navigate("/week/:weekStart", { params: { weekStart: monday } });
  const { accountId, userId } = useAccount();
  const { data: events = [] } = useEvents(accountId);
  const { colors } = usePeopleWithColors(accountId, userId);

  const [sheet, setSheet] = useState<{
    event: CalendarEvent;
    date: string;
  } | null>(null);
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY));
  // Weekday index (0 = Mon) whose column is expanded, if any.
  const [focusDay, setFocusDay] = useState<number | null>(null);

  const now = useNow();
  const todayISO = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Windowed per-occurrence state covering the visible week and its deck
  // neighbours.
  const { completions, isLoading } = useCompletionsForRange(
    accountId,
    addDays(weekStart, -7),
    addDays(weekStart, 13),
  );

  // Expand the three pages' occurrences once per data/week change, not per
  // render: [previous week, visible week, next week], seven days each.
  const weeks = useMemo<WeekDay[][]>(
    () =>
      [-7, 0, 7].map((weekOffset) =>
        DAY_NAMES.map((_, dayIdx) => {
          const dateISO = addDays(weekStart, weekOffset + dayIdx);
          return { dateISO, occs: occurrencesOnDate(events, dateISO, completions) };
        }),
      ),
    [weekStart, events, completions],
  );

  /** Open a search hit: jump the week to its next upcoming occurrence. */
  function openSearchHit(seriesId: string) {
    const event = events.find((e) => e.id === seriesId);
    if (!event) return;
    const date = nextRelevantDate(event);
    goToWeek(mondayOf(new Date(`${date}T00:00:00`)));
    navigate(editEventPath(event.id, date));
  }

  function openOccurrence(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start });
  }

  /** Tap on empty grid: a new event around that time, for the default people. */
  function addAt(dateISO: string, minute: number) {
    navigate(newEventAtPath(dateISO, minute));
  }

  function toggleDay(idx: number) {
    setFocusDay((cur) => (cur === idx ? null : idx));
  }

  const thisWeek = weekStart === mondayOf(now);
  const visible = weeks[1];

  // A column per weekday, all attendees sharing it. With an expanded day the
  // squeezed columns are too thin for text, so only that one keeps titles.
  const page = (days: WeekDay[]) => (
    <TimelineView pxPerMin={hourH / 60}>
      {days.map(({ dateISO, occs }, dayIdx) => (
        <TimelineView.Column
          key={dateISO}
          nowMin={dateISO === todayISO ? nowMin : undefined}
          highlight={dateISO === todayISO}
          onAddAt={(minute) => addAt(dateISO, minute)}
        >
          {layoutBlocks(
            occs
              .filter((o) => !o.event.allDay)
              .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end })),
          ).map(({ block, col, cols }) => (
            <EventBlock
              key={`${block.occ.event.id}:${block.occ.start}`}
              occ={block.occ}
              color={eventColorIn(
                colors[block.occ.attendees[0]],
                block.occ.event.colorKey,
              )}
              pxPerMin={hourH / 60}
              col={col}
              cols={cols}
              dense
              showTitle={focusDay == null || dayIdx === focusDay}
              onClick={() => openOccurrence(block.occ)}
            />
          ))}
        </TimelineView.Column>
      ))}
    </TimelineView>
  );

  return (
    <>
      <CalendarView
        pageKey={weekStart}
        onNavigate={(delta) => goToWeek(addDays(weekStart, 7 * delta))}
        onGoToday={() => goToWeek(mondayOf(now))}
        todayActive={thisWeek}
        gutterLabel={`W${isoWeekNumber(weekStart)}`}
        zoom={{ hourH, setHourH, key: ZOOM_KEY }}
        initialMinute={thisWeek ? nowMin : 7 * 60}
      >
        <CalendarView.Header.Search>
          <EventSearch onPick={openSearchHit} />
        </CalendarView.Header.Search>
        <CalendarView.Header.Title>
          {weekRangeLabel(weekStart)}
        </CalendarView.Header.Title>
        {visible.map(({ dateISO, occs }, i) => (
          <CalendarView.Header.Lane
            key={dateISO}
            weight={i === focusDay ? 4 : 1}
          >
            <DayHead
              name={DAY_NAMES[i]}
              number={Number(dateISO.slice(8, 10))}
              isToday={dateISO === todayISO}
              isExpanded={focusDay === i}
              onToggle={() => toggleDay(i)}
            >
              {occs
                .filter((o) => o.event.allDay)
                .map((o) => (
                  <AllDayChip
                    key={`${o.event.id}:${o.start}`}
                    occ={o}
                    color={eventColorIn(
                      colors[o.attendees[0]],
                      o.event.colorKey,
                    )}
                    onClick={() => openOccurrence(o)}
                  />
                ))}
            </DayHead>
          </CalendarView.Header.Lane>
        ))}
        <CalendarView.Gutter>
          <TimeGutter hourH={hourH} />
        </CalendarView.Gutter>
        <CalendarView.Previous>{page(weeks[0])}</CalendarView.Previous>
        <CalendarView.Current>{page(weeks[1])}</CalendarView.Current>
        <CalendarView.Next>{page(weeks[2])}</CalendarView.Next>
      </CalendarView>

      {isLoading && <LoadingPill />}

      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setSheet(null);
            navigate(editEventPath(sheet.event.id, sheet.date));
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
