import type { ColorKey } from "../assets/palette";
import { TimelineColumn } from "../assets/ui/TimelineColumn";
import { EventBlock } from "../domains/events/components/EventBlock";
import { Avatars } from "../domains/people/components/Avatars";
import { eventColorIn } from "../domains/people/selectors";
import type { DayOccurrence } from "../services/recurrence";
import { DAY_MIN, layoutBlocks } from "../services/timeline-layout";
import type { Person, PersonId } from "../types";
import type { DayPageData } from "./DayRoute";

import styles from "./DayPage.module.css";

/**
 * One day in the deck: a timeline column per person, with every block that
 * person is on. A shared event simply appears in each attendee's lane,
 * coloured by that lane.
 */
export function DayPage({
  page,
  people,
  colors,
  pxPerMin,
  nowMin,
  onAddAt,
  onOpen,
}: {
  page: DayPageData;
  people: Person[];
  /** Everyone's colour, already resolved against this user's settings. */
  colors: Record<PersonId, ColorKey>;
  pxPerMin: number;
  nowMin?: number;
  onAddAt: (person: PersonId, minute: number) => void;
  onOpen: (occ: DayOccurrence) => void;
}) {
  return (
    <div
      className={styles.lanes}
      // Full-day height even before the columns exist, so the deck's first
      // scroll-to-minute has something to scroll.
      style={{ height: DAY_MIN * pxPerMin }}
    >
      {people.map((person) => {
        const mine = page.timedBlocks.filter((b) =>
          b.occ.attendees.includes(person.id),
        );
        return (
          <TimelineColumn
            key={person.id}
            pxPerMin={pxPerMin}
            nowMin={nowMin}
            onAddAt={(minute) => onAddAt(person.id, minute)}
          >
            {layoutBlocks(mine).map(({ block, col, cols }) => {
              // Who is on it THIS day — an override replaces the series' roster.
              const attendees = block.occ.attendees;
              return (
                <EventBlock
                  key={`${block.occ.event.id}:${block.occ.start}`}
                  occ={block.occ}
                  color={eventColorIn(colors[person.id], block.occ.event.colorKey)}
                  style={{
                    top: block.start * pxPerMin,
                    height: Math.max((block.end - block.start) * pxPerMin, 16),
                    left: `calc(${(100 / cols) * col}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                  }}
                  onClick={() => onOpen(block.occ)}
                >
                  {attendees.length > 1 && (
                    <Avatars
                      attendees={attendees.flatMap((id) => {
                        // A person not in the list yet (first fetch in flight,
                        // or one a partner just removed) must not crash the view.
                        const p = people.find((x) => x.id === id);
                        return p ? [{ person: p, color: colors[id] }] : [];
                      })}
                    />
                  )}
                </EventBlock>
              );
            })}
          </TimelineColumn>
        );
      })}
    </div>
  );
}
