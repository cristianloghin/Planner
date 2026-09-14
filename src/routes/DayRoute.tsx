import { useNavigation, useParams } from '@mikrostack/router'
import { useMemo, useState } from 'react'
import { useAccount } from '../account'
import { useNow } from '../assets/hooks/useNow'
import { LoadingPill } from '../assets/ui/Spinner'
import { TimeGutter } from '../assets/ui/TimeGutter'
import { addDays, isoLabel, toISODate } from '../assets/utils/dates'
import { EventSearch } from '../components/EventSearch'
import { OccurrenceSheet } from '../components/OccurrenceSheet'
import { AllDayChip } from '../domains/events/components/AllDayChip'
import { EventBlock } from '../domains/events/components/EventBlock'
import { useEvents, useOccurrencesForRange } from '../domains/events/queries'
import { LaneHead } from '../domains/people/components/LaneHead'
import { usePeopleWithColors } from '../domains/people/queries'
import { eventColorIn } from '../domains/people/selectors'
import { loadZoom } from '../services/gestures'
import { type DayOccurrence, nextRelevantDate, occurrencesOnDate } from '../services/recurrence'
import { type TimeBlock, layoutBlocks } from '../services/timeline-layout'
import type { CalendarEvent, PersonId } from '../types'
import { CalendarView } from '../views/Calendar'
import { TimelineView } from '../views/Timeline'
import { editEventPath, editOccurrencePath, newEventAtPath } from './eventPaths'

const ZOOM_KEY = 'planner:hourH'

/** One page of the deck: a day, already expanded. */
interface DayPage {
  iso: string
  timedBlocks: TimeBlock[]
  allDayOccs: DayOccurrence[]
}

/**
 * The Day screen, wired up.
 *
 * Reads the domains, feeds the recurrence service, and composes the calendar
 * view from slots: one lane per person in the header, and three day pages in
 * the deck. Every join between domains — which chips sit in which lane, what
 * colour a thing shows in — is made here.
 *
 * The editor is a route of its own, reached from here by URL; the occurrence
 * sheet is opened from here too, because *how a thing is reached* is the
 * shell's business.
 */
export function DayRoute() {
  const { navigate } = useNavigation()
  const { date: dateISO } = useParams('/day/:date')
  const goToDate = (date: string) => navigate('/day/:date', { params: { date } })
  const { accountId, userId } = useAccount()
  const { data: events = [] } = useEvents(accountId)
  const { people, colors } = usePeopleWithColors(accountId, userId)

  const [sheet, setSheet] = useState<{
    event: CalendarEvent
    date: string
  } | null>(null)
  // Pixels-per-hour for the timeline. The view pinches it, the pages draw with
  // it; the key is this screen's, which is why the route holds it.
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY))
  // The person whose lane is expanded, if any.
  const [focusLane, setFocusLane] = useState<PersonId | null>(null)

  const prevISO = addDays(dateISO, -1)
  const nextISO = addDays(dateISO, 1)

  const now = useNow()
  const todayISO = toISODate(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Windowed per-occurrence state for the visible day and its swipe neighbours.
  const { occurrences, isLoading } = useOccurrencesForRange(accountId, prevISO, nextISO)

  // One entry per deck page: yesterday, the visible day, tomorrow. This is the
  // expensive part of a render (recurrence expansion), and none of it depends
  // on zoom or gesture state — so it is computed once here, not per frame.
  const pages = useMemo<DayPage[]>(
    () =>
      [prevISO, dateISO, nextISO].map((iso) => {
        const occs = occurrencesOnDate(events, iso, occurrences)
        const timedBlocks: TimeBlock[] = occs
          .filter((o) => !o.event.allDay)
          .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end }))
        return {
          iso,
          timedBlocks,
          allDayOccs: occs.filter((o) => o.event.allDay),
        }
      }),
    [events, occurrences, prevISO, dateISO, nextISO],
  )

  /** Open a search hit at the event's next upcoming occurrence. */
  function openSearchHit(seriesId: string) {
    const event = events.find((e) => e.id === seriesId)
    if (!event) return
    const date = nextRelevantDate(event)
    goToDate(date)
    navigate(editEventPath(event.id, date))
  }

  function openOccurrence(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start })
  }

  /** Tap on empty lane: a new event for that person at that time. */
  function addAt(date: string, person: PersonId, minute: number) {
    navigate(newEventAtPath(date, minute, [person]))
  }

  function toggleLane(id: PersonId) {
    setFocusLane((cur) => (cur === id ? null : id))
  }

  const { allDayOccs } = pages[1]

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
          {layoutBlocks(p.timedBlocks.filter((b) => b.occ.attendees.includes(person.id))).map(
            ({ block, col, cols }) => (
              <EventBlock
                key={`${block.occ.event.id}:${block.occ.start}`}
                occ={block.occ}
                color={eventColorIn(colors[person.id], block.occ.event.colorKey)}
                pxPerMin={hourH / 60}
                col={col}
                cols={cols}
                onClick={() => openOccurrence(block.occ)}
              />
            ),
          )}
        </TimelineView.Column>
      ))}
    </TimelineView>
  )

  return (
    <>
      <CalendarView
        pageKey={dateISO}
        onNavigate={(delta) => goToDate(addDays(dateISO, delta))}
        onGoToday={() => goToDate(todayISO)}
        todayActive={dateISO === todayISO}
        zoom={{ hourH, setHourH, key: ZOOM_KEY }}
        initialMinute={dateISO === todayISO ? nowMin : 7 * 60}
      >
        <CalendarView.Header.Search>
          <EventSearch onPick={openSearchHit} />
        </CalendarView.Header.Search>
        <CalendarView.Header.Title>{isoLabel(dateISO)}</CalendarView.Header.Title>
        {people.map((p) => (
          <CalendarView.Header.Lane key={p.id} weight={p.id === focusLane ? 4 : 1}>
            <LaneHead
              person={p}
              color={colors[p.id]}
              isCollapsed={!!focusLane && focusLane !== p.id}
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
                    isCollapsed={!!focusLane && focusLane !== p.id}
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

      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={(scope) => {
            setSheet(null)
            navigate(
              scope === 'occurrence'
                ? editOccurrencePath(sheet.event.id, sheet.date)
                : editEventPath(sheet.event.id, sheet.date),
            )
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
