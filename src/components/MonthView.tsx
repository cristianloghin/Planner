import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useCompletionsForRange } from '../data/completions'
import { cx } from '../lib/cx'
import {
  DAY_NAMES,
  addMonths,
  isSameMonth,
  monthGridDays,
  monthLabel,
  startOfMonth,
  toISODate,
} from '../lib/dates'
import { colorStyle } from '../lib/palette'
import { eventColorKey } from '../lib/people'
import { nextRelevantDate, occurrencesOnDate } from '../lib/recurrence'
import { eventStartMinutes } from '../lib/timing'
import { pageInert, useSwipeGestures } from '../lib/useSwipeGestures'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import type { CompletionsMap } from '../types'
import s from './MonthView.module.css'
import { LoadingPill } from './Spinner'
import { ViewHeader } from './ViewHeader'

// Up to this many event dots before collapsing the rest into a "+N".
const MAX_DOTS = 4

export function MonthView({ onOpenDay }: { onOpenDay: (iso: string) => void }) {
  const { state } = useApp()
  const [cursor, setCursor] = useState(() => startOfMonth(toISODate(new Date())))
  const today = toISODate(new Date())
  // Strip pages: [previous month, visible month, next month].
  const months = useMemo(() => [-1, 0, 1].map((d) => addMonths(cursor, d)), [cursor])

  // Swipe left/right to change month, like the Day and Week views.
  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const { onClickCapture } = useSwipeGestures({
    scrollRef,
    stripRef,
    pageKey: cursor,
    onNavigate: (delta) => setCursor((c) => addMonths(c, delta)),
  })

  // Windowed per-occurrence state covering all three pages' grids (each grid
  // pads to full weeks, so it can straddle two months).
  const prevGrid = monthGridDays(months[0])
  const nextGrid = monthGridDays(months[2])
  const { completions, isLoading: completionsLoading } = useCompletionsForRange(
    prevGrid[0],
    nextGrid[nextGrid.length - 1],
  )

  // Open a search hit: jump to the event's next upcoming occurrence (falling
  // back to the series anchor for an ended series) in the Day view.
  function openSearchHit(seriesId: string) {
    const event = state.events.find((e) => e.id === seriesId)
    if (!event) return
    onOpenDay(nextRelevantDate(event))
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
              type="button"
              onClick={() => setCursor(addMonths(cursor, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{monthLabel(cursor)}</strong>
            <button
              type="button"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        }
      />

      <div
        className={cx(shared.viewBody, shared.swipeBody)}
        ref={scrollRef}
        // Browser owns vertical panning; we own the horizontal swipe.
        style={{ touchAction: 'pan-y' }}
        onClickCapture={onClickCapture}
      >
        {/* The weekday labels stay put; only the month pages slide. */}
        <div className={s.monthWeekdays}>
          {DAY_NAMES.map((name) => (
            <div key={name} className={s.monthWeekday}>
              {name}
            </div>
          ))}
        </div>
        {/* Clip the strip so the neighbor months can't peek into the side padding. */}
        <div className={shared.swipeClip}>
          <div className={shared.swipeStrip} ref={stripRef}>
            {months.map((month) => (
              <MonthPage
                key={month}
                month={month}
                active={month === cursor}
                today={today}
                completions={completions}
                onOpenDay={onOpenDay}
              />
            ))}
          </div>
        </div>
      </div>

      {completionsLoading && <LoadingPill />}
    </section>
  )
}

/** One month's 6×7 cell grid — a page of the Month view's swipe strip. */
function MonthPage({
  month,
  active,
  today,
  completions,
  onOpenDay,
}: {
  month: string
  /** Whether this is the visible middle page (the others render inert). */
  active: boolean
  today: string
  completions: CompletionsMap
  onOpenDay: (iso: string) => void
}) {
  const { state } = useApp()
  const days = useMemo(() => monthGridDays(month), [month])

  // Expanding recurrences over 42 cells is O(events × occurrence state); do it
  // only when the grid or the data actually changes, not on every render.
  const occurrencesByDay = useMemo(
    () =>
      new Map(
        days.map((iso) => [
          iso,
          occurrencesOnDate(state.events, iso, completions).sort(
            (a, b) =>
              Number(b.event.allDay) - Number(a.event.allDay) ||
              eventStartMinutes(a.event) - eventStartMinutes(b.event),
          ),
        ]),
      ),
    [days, state.events, completions],
  )

  return (
    <div className={s.monthGrid} {...pageInert(active)}>
      {days.map((iso) => {
        const dayOccs = occurrencesByDay.get(iso) ?? []
        return (
          <button
            type="button"
            key={iso}
            className={cx(s.monthCell, !isSameMonth(iso, month) && s.dim, iso === today && s.today)}
            onClick={() => onOpenDay(iso)}
            aria-label={`${monthLabel(iso)} ${Number(iso.slice(8, 10))}, ${dayOccs.length} plans`}
          >
            <span className={s.monthDate}>{Number(iso.slice(8, 10))}</span>
            {dayOccs.length > 0 && (
              <span className={s.monthDots}>
                {dayOccs.slice(0, MAX_DOTS).map((o) => (
                  <span
                    key={`${o.event.id}:${o.start}`}
                    className={s.monthDot}
                    style={colorStyle(eventColorKey(state, o.event.attendees[0], o.event))}
                  />
                ))}
                {dayOccs.length > MAX_DOTS && (
                  <span className={s.monthMore}>+{dayOccs.length - MAX_DOTS}</span>
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
