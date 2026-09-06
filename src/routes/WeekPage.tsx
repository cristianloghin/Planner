import { useMemo } from "react";
import type { ColorKey } from "../assets/palette";
import { TimelineColumn } from "../assets/ui/TimelineColumn";
import { EventBlock } from "../domains/events/components/EventBlock";
import { eventColorIn } from "../domains/people/selectors";
import type { DayOccurrence } from "../services/recurrence";
import { DAY_MIN, layoutBlocks } from "../services/timeline-layout";
import type { PersonId } from "../types";
import type { WeekDay } from "./WeekRoute";

import styles from "./WeekPage.module.css";

/**
 * One week in the deck: a timeline column per weekday, all attendees sharing
 * the column. With an expanded day, the squeezed columns are too thin for
 * text, so only the expanded one keeps its titles.
 */
export function WeekPage({
  days,
  colors,
  focusDay,
  pxPerMin,
  todayISO,
  nowMin,
  onAddAt,
  onOpen,
}: {
  days: WeekDay[];
  /** Everyone's colour, already resolved against this user's settings. */
  colors: Record<PersonId, ColorKey>;
  focusDay: number | null;
  pxPerMin: number;
  todayISO: string;
  nowMin: number;
  onAddAt: (dateISO: string, minute: number) => void;
  onOpen: (occ: DayOccurrence) => void;
}) {
  // Overlap-pack each day's timed occurrences once per data change.
  const laid = useMemo(
    () =>
      days.map(({ occs }) =>
        layoutBlocks(
          occs
            .filter((o) => !o.event.allDay)
            .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end })),
        ),
      ),
    [days],
  );

  return (
    <div
      className={styles.days}
      // Full-day height even before the columns exist, so the deck's first
      // scroll-to-minute has something to scroll.
      style={{ height: DAY_MIN * pxPerMin }}
    >
      {days.map(({ dateISO }, dayIdx) => {
        const isToday = dateISO === todayISO;
        return (
          <TimelineColumn
            key={dateISO}
            pxPerMin={pxPerMin}
            nowMin={isToday ? nowMin : undefined}
            highlight={isToday}
            onAddAt={(minute) => onAddAt(dateISO, minute)}
          >
            {laid[dayIdx].map(({ block, col, cols }) => (
              <EventBlock
                key={`${block.occ.event.id}:${block.occ.start}`}
                occ={block.occ}
                color={eventColorIn(
                  colors[block.occ.attendees[0]],
                  block.occ.event.colorKey,
                )}
                dense
                showTitle={focusDay == null || dayIdx === focusDay}
                style={{
                  top: block.start * pxPerMin,
                  height: Math.max((block.end - block.start) * pxPerMin, 12),
                  left: `calc(${(100 / cols) * col}% + 1px)`,
                  width: `calc(${100 / cols}% - 2px)`,
                }}
                onClick={() => onOpen(block.occ)}
              />
            ))}
          </TimelineColumn>
        );
      })}
    </div>
  );
}
