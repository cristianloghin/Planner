import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { checklistEntries, hasReminders } from "../lib/attachments";
import { childStatuses, type Busy, type ChildStatus } from "../lib/conflicts";
import { cx } from "../lib/cx";
import {
  addDays,
  isoLabel,
  minutesToTime,
  mondayOf,
  toISODate,
  weekdayIndex,
} from "../lib/dates";
import { isOccurrenceDone, occKey, occurrenceStatus } from "../lib/occurrences";
import {
  adultsGradient,
  attendeeLabel,
  eventColor,
  isAllAdults,
  peopleList,
  personColor,
} from "../lib/people";
import { occurrencesOnDate, type DayOccurrence } from "../lib/recurrence";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import type { CalendarEvent, Person, PersonId } from "../types";
import s from "./DayView.module.css";
import { EventEditor, type EditorTarget } from "./EventEditor";
import { OccurrenceSheet } from "./OccurrenceSheet";

// Layout scale. HOUR_H must match the gridline spacing in index.css.
const HOUR_H = 56;
const PX_PER_MIN = HOUR_H / 60;
const DAY_MIN = 24 * 60;
const SNAP = 15;

// A child's lane is narrower than an adult's (they share an adult's time).
const CHILD_WEIGHT = 1;
const laneWeight = (p: Person) => (p.kind === "child" ? CHILD_WEIGHT : 1);

/** A timed occurrence clamped to the current day, ready to lay out. */
interface DayBlock {
  occ: DayOccurrence;
  start: number;
  end: number;
}

export function DayView() {
  const { state, dispatch } = useApp();
  const day = state.selectedDay;
  const people = peopleList(state);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [sheet, setSheet] = useState<{
    event: CalendarEvent;
    date: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const dateISO = addDays(state.weekStart, day);
  const isToday = dateISO === toISODate(new Date());
  const nowMin = isToday
    ? new Date().getHours() * 60 + new Date().getMinutes()
    : null;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusMin = nowMin ?? 7 * 60;
    el.scrollTop = Math.max(0, focusMin * PX_PER_MIN - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, dateISO]);

  function addAt(attendees: PersonId[], minute: number) {
    const start = Math.min(
      Math.max(0, Math.round(minute / SNAP) * SNAP),
      DAY_MIN - SNAP,
    );
    setEditor({
      mode: "new",
      date: dateISO,
      attendees,
      startMin: start,
      endMin: Math.min(start + 60, DAY_MIN),
    });
  }

  function openSheet(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start });
  }

  const occs = occurrencesOnDate(state.events, dateISO);
  const timedBlocks: DayBlock[] = occs
    .filter((o) => !o.event.allDay)
    .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end }));
  const allDayOccs = occs.filter((o) => o.event.allDay);
  const spanning = timedBlocks.filter((b) =>
    isAllAdults(state, b.occ.event.attendees),
  );

  // Coverage looks at the whole day: all-day events count as busy 00:00–24:00.
  const coverage: Busy[] = occs.map((o) => ({
    id: o.event.id,
    attendees: o.event.attendees,
    start: o.event.allDay ? 0 : o.segment.start,
    end: o.event.allDay ? DAY_MIN : o.segment.end,
  }));
  const statuses = childStatuses(coverage, state.people);
  const hasWarnings = [...statuses.values()].some((s) => s !== "covered");

  const fullHeight = DAY_MIN * PX_PER_MIN;
  const totalWeight = people.reduce((s, p) => s + laneWeight(p), 0);
  // The all-adults block spans only the leading adult lanes; size it to their
  // share of the total. Assumes adults sort ahead of children (sortOrder).
  const adultWeight = people
    .filter((p) => p.kind === "adult")
    .reduce((s, p) => s + laneWeight(p), 0);
  const adultPct = (adultWeight / totalWeight) * 100;

  function goToday() {
    const todayISO = toISODate(new Date());
    dispatch({ type: "setWeek", weekStart: mondayOf(new Date()) });
    dispatch({ type: "setDay", day: weekdayIndex(todayISO) });
  }

  return (
    <section className={shared.view}>
      <div className={shared.viewHead}>
        <div className={shared.viewHeadContainer}>
          <div className={s.today}>
            <button
              className={s.todayButton}
              onClick={goToday}
            >
              <Calendar />
            </button>
          </div>
          <div className={shared.weekNav}>
            <button
              onClick={() => dispatch({ type: "shiftDay", delta: -1 })}
              aria-label="Previous day"
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{isoLabel(dateISO)}</strong>
            <button
              onClick={() => dispatch({ type: "shiftDay", delta: 1 })}
              aria-label="Next day"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {hasWarnings && (
            <div className={s.conflictLegend}>
              <AlertTriangle className={s.alertBadge} />
            </div>
          )}
        </div>
        <div className={s.plannerHead}>
          <div />
          <div className={s.laneHeads}>
            {people.map((p) => (
              <div
                key={p.id}
                className={s.laneHead}
                style={{ color: personColor(state, p.id) }}
              >
                <div>
                  <span
                    className={s.dot}
                    style={{ background: personColor(state, p.id) }}
                  />
                  {p.name}
                </div>
                <div>
                  {allDayOccs
                    .filter((o) => o.event.attendees.includes(p.id))
                    .map((o) => (
                      <AllDayChip
                        key={o.event.id}
                        occ={o}
                        status={statuses.get(o.event.id)}
                        onClick={() => openSheet(o)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={s.plannerBody} ref={scrollRef}>
        <div className={s.plannerGrid}>
          <TimeGutter />
          <div className={s.lanes} style={{ height: fullHeight }}>
            {people.map((p) => (
              <Lane
                key={p.id}
                person={p}
                blocks={timedBlocks}
                statuses={statuses}
                nowMin={nowMin}
                onAddAt={(min) => addAt([p.id], min)}
                onOpen={openSheet}
              />
            ))}

            {/* 'Both' (two-parent) blocks span the two parent columns, layered on top. */}
            <div
              className={s.sharedLayer}
              style={{ height: fullHeight, width: `${adultPct}%` }}
            >
              {layout(spanning).map(({ block, col, cols }) => {
                const ev = block.occ.event;
                const done = isOccurrenceDone(state, ev, block.occ.start);
                return (
                  <button
                    key={ev.id}
                    className={cx(s.tlEvent, s.shared, done && s.done)}
                    style={{
                      top: block.start * PX_PER_MIN,
                      height: Math.max(
                        (block.end - block.start) * PX_PER_MIN,
                        16,
                      ),
                      left: `calc(${(100 / cols) * col}% + 2px)`,
                      width: `calc(${100 / cols}% - 4px)`,
                      background: adultsGradient(state),
                    }}
                    onClick={() => openSheet(block.occ)}
                  >
                    <span className={s.tlTime}>
                      {minutesToTime(block.start)}–{minutesToTime(block.end)} ·{" "}
                      {attendeeLabel(state, ev.attendees)}
                    </span>
                    <span className={s.tlTitle}>{ev.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editor && (
        <EventEditor target={editor} onClose={() => setEditor(null)} />
      )}
      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setEditor({ mode: "edit", event: sheet.event });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}

/** Compact badges shown on a block / chip: reminders, checklist progress, done, kid status. */
function badges(
  state: ReturnType<typeof useApp>["state"],
  event: CalendarEvent,
  date: string,
  status: ChildStatus | undefined,
) {
  const entries = checklistEntries(event);
  let checklist: { n: number; total: number } | null = null;
  if (entries.length) {
    const checked = state.completions[occKey(event.id, date)]?.checked ?? {};
    const n = entries.filter((e) => checked[e.id]).length;
    checklist = { n, total: entries.length };
  }
  return (
    <span className={s.badges}>
      {hasReminders(event) && (
        <Bell className={s.badgeIcon} aria-label="Reminders" />
      )}
      {checklist && (
        <span className={s.badge}>
          <CheckSquare className={s.badgeIcon} aria-label="Checklist" />
          {checklist.n}/{checklist.total}
        </span>
      )}
      {status === "clash" && (
        <AlertTriangle className={s.badgeIcon} aria-label="Clash" />
      )}
      {status === "needs" && (
        <CircleDashed className={s.badgeIcon} aria-label="Needs attention" />
      )}
    </span>
  );
}

function AllDayChip({
  occ,
  status,
  onClick,
}: {
  occ: DayOccurrence;
  status: ChildStatus | undefined;
  onClick: () => void;
}) {
  const { state } = useApp();
  const { event } = occ;
  const done = isOccurrenceDone(state, event, occ.start);
  return (
    <button
      className={cx(
        s.alldayChip,
        done && s.done,
        status === "clash" && s.warnClash,
        status === "needs" && s.warnNeeds,
      )}
      style={{ background: eventColor(state, event.attendees) }}
      onClick={onClick}
    >
      <span className={s.alldayMeta}>
        {badges(state, event, occ.start, status)}
      </span>
      <span className={s.alldayTitle}>{event.title}</span>
      {occ.span > 1 && (
        <span
          className={s.allDayOffset}
        >{`${occ.offset + 1}/${occ.span}`}</span>
      )}
    </button>
  );
}

function TimeGutter() {
  return (
    <div className={s.timeGutter} style={{ height: DAY_MIN * PX_PER_MIN }}>
      {Array.from({ length: 25 }, (_, h) => (
        <div key={h} className={s.gutterLabel} style={{ top: h * HOUR_H }}>
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

interface Laid {
  block: DayBlock;
  col: number;
  cols: number;
}

/** Greedy column layout so overlapping blocks in one lane sit side by side. */
function layout(blocks: DayBlock[]): Laid[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Laid[] = [];
  let cluster: DayBlock[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns: DayBlock[][] = [];
    for (const b of cluster) {
      let placed = false;
      for (const c of columns) {
        if (c[c.length - 1].end <= b.start) {
          c.push(b);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([b]);
    }
    const n = columns.length;
    columns.forEach((c, ci) =>
      c.forEach((block) => result.push({ block, col: ci, cols: n })),
    );
  };

  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return result;
}

function Lane({
  person,
  blocks,
  statuses,
  nowMin,
  onAddAt,
  onOpen,
}: {
  person: Person;
  blocks: DayBlock[];
  statuses: Map<string, ChildStatus>;
  nowMin: number | null;
  onAddAt: (minute: number) => void;
  onOpen: (occ: DayOccurrence) => void;
}) {
  const { state } = useApp();
  // This person's blocks, excluding all-adults 'Both' ones (those span instead).
  const mine = blocks.filter(
    (b) =>
      b.occ.event.attendees.includes(person.id) &&
      !isAllAdults(state, b.occ.event.attendees),
  );
  const laid = layout(mine);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(`.${s.tlEvent}`)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onAddAt((e.clientY - rect.top) / PX_PER_MIN);
  }

  return (
    <div className={s.lane} onClick={handleClick}>
      {nowMin != null && (
        <div className={s.nowLine} style={{ top: nowMin * PX_PER_MIN }}>
          <span className={s.nowDot} />
        </div>
      )}

      {laid.map(({ block, col, cols }) => {
        const ev = block.occ.event;
        const status = statuses.get(ev.id);
        const joint = ev.attendees.length > 1;
        const done = isOccurrenceDone(state, ev, block.occ.start);
        const blocked =
          occurrenceStatus(state, ev, block.occ.start) === "blocked";
        return (
          <button
            key={ev.id}
            className={cx(
              s.tlEvent,
              done && s.done,
              blocked && s.blocked,
              status === "clash" && s.warnClash,
              status === "needs" && s.warnNeeds,
            )}
            style={{
              top: block.start * PX_PER_MIN,
              height: Math.max((block.end - block.start) * PX_PER_MIN, 16),
              left: `calc(${(100 / cols) * col}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              background: eventColor(state, ev.attendees),
            }}
            onClick={() => onOpen(block.occ)}
          >
            <span className={s.tlTime}>
              {minutesToTime(block.start)}–{minutesToTime(block.end)}
              {badges(state, ev, block.occ.start, status)}
            </span>
            <span className={s.tlTitle}>{ev.title}</span>
            {joint && (
              <span className={s.tlTag}>
                {attendeeLabel(state, ev.attendees)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
