import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cx } from "../lib/cx";
import {
  DAY_NAMES,
  addMonths,
  isSameMonth,
  monthGridDays,
  monthLabel,
  startOfMonth,
  toISODate,
} from "../lib/dates";
import { useCompletionsForRange } from "../data/completions";
import { eventColorKey } from "../lib/people";
import { colorVar } from "../lib/palette";
import { nextStartOnOrAfter, occurrencesOnDate } from "../lib/recurrence";
import { eventDate, eventStartMinutes } from "../lib/timing";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import s from "./MonthView.module.css";
import { LoadingPill } from "./Spinner";
import { ViewHeader } from "./ViewHeader";

// Up to this many event dots before collapsing the rest into a "+N".
const MAX_DOTS = 4;

export function MonthView({ onOpenDay }: { onOpenDay: (iso: string) => void }) {
  const { state } = useApp();
  const [cursor, setCursor] = useState(() =>
    startOfMonth(toISODate(new Date())),
  );
  const today = toISODate(new Date());
  const days = useMemo(() => monthGridDays(cursor), [cursor]);

  // Windowed per-occurrence state covering the whole visible grid (the grid
  // pads to full weeks, so it can straddle two months).
  const { completions, isLoading: completionsLoading } = useCompletionsForRange(
    days[0],
    days[days.length - 1],
  );

  // Expanding recurrences over 42 cells is O(events × occurrence state); do it
  // only when the grid or the data actually changes, not on every render.
  const eventsByDay = useMemo(
    () =>
      new Map(
        days.map((iso) => [
          iso,
          occurrencesOnDate(state.events, iso, completions)
            .map((o) => o.event)
            .sort(
              (a, b) =>
                Number(b.allDay) - Number(a.allDay) ||
                eventStartMinutes(a) - eventStartMinutes(b),
            ),
        ]),
      ),
    [days, state.events, completions],
  );

  // Open a search hit: jump to the event's next upcoming occurrence (falling
  // back to the series anchor for an ended series) in the Day view.
  function openSearchHit(seriesId: string) {
    const event = state.events.find((e) => e.id === seriesId);
    if (!event) return;
    onOpenDay(nextStartOnOrAfter(event, today) ?? eventDate(event));
  }

  return (
    <section className={shared.view}>
      <ViewHeader
        onToday={() => setCursor(startOfMonth(today))}
        todayActive={isSameMonth(today, cursor)}
        onPickSearch={openSearchHit}
        nav={
          <div className={shared.weekNav}>
            <button
              onClick={() => setCursor(addMonths(cursor, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{monthLabel(cursor)}</strong>
            <button
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        }
      />

      <div className={shared.viewBody}>
        <div className={s.monthGrid}>
          {DAY_NAMES.map((name) => (
            <div key={name} className={s.monthWeekday}>
              {name}
            </div>
          ))}

          {days.map((iso) => {
            const dayEvents = eventsByDay.get(iso) ?? [];
            return (
              <button
                key={iso}
                className={cx(
                  s.monthCell,
                  !isSameMonth(iso, cursor) && s.dim,
                  iso === today && s.today,
                )}
                onClick={() => onOpenDay(iso)}
                aria-label={`${monthLabel(iso)} ${Number(iso.slice(8, 10))}, ${dayEvents.length} plans`}
              >
                <span className={s.monthDate}>{Number(iso.slice(8, 10))}</span>
                {dayEvents.length > 0 && (
                  <span className={s.monthDots}>
                    {dayEvents.slice(0, MAX_DOTS).map((e, i) => (
                      <span
                        key={`${e.id}:${i}`}
                        className={s.monthDot}
                        style={
                          {
                            "--c": colorVar(
                              eventColorKey(state, e.attendees[0], e),
                            ),
                          } as React.CSSProperties
                        }
                      />
                    ))}
                    {dayEvents.length > MAX_DOTS && (
                      <span className={s.monthMore}>
                        +{dayEvents.length - MAX_DOTS}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {completionsLoading && <LoadingPill />}
    </section>
  );
}
