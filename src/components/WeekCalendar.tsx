import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  DAY_NAMES,
  addDays,
  dayLabel,
  minutesToTime,
  mondayOf,
  toISODate,
  weekRangeLabel,
} from "../lib/dates";
import { defaultAttendees, eventColorKey, personColorKey } from "../lib/people";
import { colorVar } from "../lib/palette";
import { nextStartOnOrAfter, occurrencesOnDate, recurrenceLabel } from "../lib/recurrence";
import { eventDate } from "../lib/timing";
import { useApp } from "../state";
import shared from "../styles/shared.module.css";
import { EventEditor, type EditorTarget } from "./EventEditor";
import { ViewHeader } from "./ViewHeader";
import s from "./WeekCalendar.module.css";

export function WeekCalendar() {
  const { state, dispatch } = useApp();
  const [target, setTarget] = useState<EditorTarget | null>(null);

  // Open a search hit: jump the week to its next upcoming occurrence (falling
  // back to the series anchor for an ended series) and open the editor there.
  function openEvent(seriesId: string) {
    const event = state.events.find((e) => e.id === seriesId);
    if (!event) return;
    const date = nextStartOnOrAfter(event, toISODate(new Date())) ?? eventDate(event);
    dispatch({ type: "setWeek", weekStart: mondayOf(new Date(date + "T00:00:00")) });
    setTarget({ mode: "edit", event, occurrenceDate: date });
  }

  return (
    <section className={shared.view}>
      <ViewHeader
        onToday={() => dispatch({ type: "setWeek", weekStart: mondayOf(new Date()) })}
        todayActive={state.weekStart === mondayOf(new Date())}
        onPickSearch={openEvent}
        nav={
          <div className={shared.weekNav}>
            <button
              onClick={() => dispatch({ type: "shiftWeek", delta: -1 })}
              aria-label="Previous week"
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{weekRangeLabel(state.weekStart)}</strong>
            <button
              onClick={() => dispatch({ type: "shiftWeek", delta: 1 })}
              aria-label="Next week"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        }
      />

      <div className={shared.viewBody}>
        <div className={s.days}>
          {DAY_NAMES.map((_, dayIdx) => {
            const dateISO = addDays(state.weekStart, dayIdx);
            // All-day items first, then timed by start.
            const occs = occurrencesOnDate(state.events, dateISO, state.completions).sort(
              (a, b) => {
                if (a.event.allDay !== b.event.allDay)
                  return a.event.allDay ? -1 : 1;
                return a.segment.start - b.segment.start;
              },
            );
            return (
              <div className={s.dayCol} key={dayIdx}>
                <div className={s.dayHead}>
                  {dayLabel(state.weekStart, dayIdx)}
                </div>

                <div className={s.eventList}>
                  {occs.length === 0 && (
                    <p className={shared.empty}>No plans</p>
                  )}
                  {occs.map((o) => {
                    const e = o.event;
                    return (
                      <div
                        key={`${e.id}:${o.start}`}
                        className={s.event}
                        style={
                          {
                            "--c": colorVar(
                              eventColorKey(state, e.attendees[0], e),
                            ),
                          } as React.CSSProperties
                        }
                      >
                        <div className={s.eventTime}>
                          {e.allDay
                            ? o.span > 1
                              ? `All day · ${o.offset + 1}/${o.span}`
                              : "All day"
                            : `${minutesToTime(o.segment.start)}–${minutesToTime(o.segment.end)}`}
                          {o.moved && " · ↔ moved"}
                        </div>
                        <button
                          className={s.eventBody}
                          onClick={() =>
                            setTarget({
                              mode: "edit",
                              event: e,
                              occurrenceDate: o.start,
                            })
                          }
                        >
                          <span className={s.eventTitle}>{e.title}</span>
                          <span className={s.eventMeta}>
                            <span className={s.avatars}>
                              {e.attendees.map((id) => {
                                const p = state.people[id];
                                if (!p) return null;
                                return (
                                  <span
                                    key={id}
                                    className={s.avatar}
                                    style={
                                      {
                                        "--c": colorVar(
                                          personColorKey(state, id),
                                        ),
                                      } as React.CSSProperties
                                    }
                                    title={p.name}
                                  >
                                    {p.name.slice(0, 1).toUpperCase()}
                                  </span>
                                );
                              })}
                            </span>
                            {e.recurrence &&
                              recurrenceLabel(e.recurrence).toLowerCase()}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  className={s.addLink}
                  onClick={() =>
                    setTarget({
                      mode: "new",
                      date: dateISO,
                      attendees: defaultAttendees(state),
                    })
                  }
                >
                  + Add
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {target && (
        <EventEditor target={target} onClose={() => setTarget(null)} />
      )}
    </section>
  );
}
