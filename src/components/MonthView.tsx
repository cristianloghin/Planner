import { useState } from 'react'
import { useApp } from '../state'
import { eventColor } from '../lib/people'
import { occurrencesOnDate } from '../lib/recurrence'
import {
  DAY_NAMES,
  addMonths,
  isSameMonth,
  monthGridDays,
  monthLabel,
  startOfMonth,
  toISODate,
} from '../lib/dates'

// Up to this many event dots before collapsing the rest into a "+N".
const MAX_DOTS = 4

export function MonthView({ onOpenDay }: { onOpenDay: (iso: string) => void }) {
  const { state } = useApp()
  const [cursor, setCursor] = useState(() => startOfMonth(toISODate(new Date())))
  const today = toISODate(new Date())
  const days = monthGridDays(cursor)

  return (
    <section>
      <div className="week-nav">
        <button onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel(cursor)}</strong>
        <button onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="month-grid">
        {DAY_NAMES.map((name) => (
          <div key={name} className="month-weekday">
            {name}
          </div>
        ))}

        {days.map((iso) => {
          // Expand recurring/multi-day events onto this concrete date.
          const dayEvents = occurrencesOnDate(state.events, iso)
            .map((o) => o.event)
            .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
          const classes = [
            'month-cell',
            isSameMonth(iso, cursor) ? '' : 'dim',
            iso === today ? 'today' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={iso}
              className={classes}
              onClick={() => onOpenDay(iso)}
              aria-label={`${monthLabel(iso)} ${Number(iso.slice(8, 10))}, ${dayEvents.length} plans`}
            >
              <span className="month-date">{Number(iso.slice(8, 10))}</span>
              {dayEvents.length > 0 && (
                <span className="month-dots">
                  {dayEvents.slice(0, MAX_DOTS).map((e) => (
                    <span
                      key={e.id}
                      className="month-dot"
                      style={{ background: eventColor(state, e.attendees) }}
                    />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span className="month-more">+{dayEvents.length - MAX_DOTS}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
