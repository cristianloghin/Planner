import { useMemo, useState } from 'react'
import { useAccount } from '../account'
import { addDays, toISODate } from '../assets/utils/dates'
import { type DayPage, DayView } from '../components/DayView'
import { type EditorTarget, EventEditor } from '../components/EventEditor'
import { OccurrenceSheet } from '../components/OccurrenceSheet'
import { useEvents } from '../domains/events/queries'
import { useCompletionsForRange } from '../domains/occurrences/queries'
import { usePeople } from '../domains/people/queries'
import { usePreferences } from '../domains/preferences/queries'
import { personColors } from '../domains/preferences/selectors'
import { useCalendarNavigation } from '../navigation'
import { type DayOccurrence, nextRelevantDate, occurrencesOnDate } from '../services/recurrence'
import type { TimeBlock } from '../services/timeline-layout'
import type { CalendarEvent, PersonId } from '../types'

/**
 * The Day screen, wired up.
 *
 * Reads the domains, feeds the recurrence service, and hands `DayView` plain
 * data and callbacks. The view owns nothing but how it looks — its zoom, its
 * scroll position and its gestures.
 *
 * The editor and the occurrence sheet are opened from here rather than from the
 * view, because *how a thing is reached* is the shell's business. When they
 * become query state or routes of their own, that is a change to this file and
 * `DayView` does not notice.
 */
export function DayRoute() {
  const nav = useCalendarNavigation()
  const { accountId, userId } = useAccount()
  const { data: events = [] } = useEvents(accountId)
  const { data: people = [] } = usePeople(accountId)
  const { data: overrides = {} } = usePreferences(accountId, userId, personColors)

  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [sheet, setSheet] = useState<{ event: CalendarEvent; date: string } | null>(null)

  const dateISO = addDays(nav.weekStart, nav.selectedDay)
  const prevISO = addDays(dateISO, -1)
  const nextISO = addDays(dateISO, 1)

  // Windowed per-occurrence state for the visible day and its swipe neighbours.
  const { completions, isLoading } = useCompletionsForRange(accountId, prevISO, nextISO)

  // One entry per swipe-strip page: yesterday, the visible day, tomorrow. This
  // is the expensive part of a render (recurrence expansion), and none of it
  // depends on zoom or gesture state — so it is computed here, once, rather
  // than inside a view that re-renders on every pinch frame.
  const pages = useMemo<DayPage[]>(
    () =>
      [prevISO, dateISO, nextISO].map((iso) => {
        const occs = occurrencesOnDate(events, iso, completions)
        const timedBlocks: TimeBlock[] = occs
          .filter((o) => !o.event.allDay)
          .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end }))
        return { iso, timedBlocks, allDayOccs: occs.filter((o) => o.event.allDay) }
      }),
    [events, completions, prevISO, dateISO, nextISO],
  )

  /** Open a search hit at the event's next upcoming occurrence. */
  function openSearchHit(seriesId: string) {
    const event = events.find((e) => e.id === seriesId)
    if (!event) return
    const date = nextRelevantDate(event)
    nav.goToDate(date)
    setEditor({ mode: 'edit', event, occurrenceDate: date })
  }

  return (
    <>
      <DayView
        pages={pages}
        people={people}
        overrides={overrides}
        dateISO={dateISO}
        loading={isLoading}
        onShiftDay={nav.shiftDay}
        onGoToday={() => nav.goToDate(toISODate(new Date()))}
        onPickSearch={openSearchHit}
        onAddAt={(date: string, attendees: PersonId[], startMin: number, endMin: number) =>
          setEditor({ mode: 'new', date, attendees, startMin, endMin })
        }
        onOpenOccurrence={(occ: DayOccurrence) => setSheet({ event: occ.event, date: occ.start })}
      />

      {editor && <EventEditor target={editor} onClose={() => setEditor(null)} />}
      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setEditor({ mode: 'edit', event: sheet.event, occurrenceDate: sheet.date })
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
