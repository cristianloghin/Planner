import { useNavigation, useParams, useQueryState } from '@mikrostack/router'
import { useMemo, useState } from 'react'
import { useAccount } from '../account'
import type { ColorKey } from '../assets/palette'
import { DayHead } from '../assets/ui/DayHead'
import { LoadingPill } from '../assets/ui/Spinner'
import {
  DAY_NAMES,
  addMonths,
  isISODate,
  isSameMonth,
  isoLabel,
  isoWeekNumber,
  monthGridDays,
  monthLabel,
  startOfMonth,
  toISODate,
} from '../assets/utils/dates'
import { EventSearch } from '../components/EventSearch'
import { OccurrenceSheet } from '../components/OccurrenceSheet'
import { OccurrenceRow } from '../domains/events/components/OccurrenceRow'
import { useEvents, useOccurrencesForRange } from '../domains/events/queries'
import { Avatars } from '../domains/people/components/Avatars'
import { usePeopleWithColors } from '../domains/people/queries'
import { eventColorIn } from '../domains/people/selectors'
import type { DayOccurrence } from '../services/recurrence'
import { nextRelevantDate, occurrencesOnDate } from '../services/recurrence/expand'
import { eventStartMinutes } from '../services/recurrence/timing'
import type { CalendarEvent, OccurrenceIndex, PersonId } from '../types'
import { CalendarView } from '../views/Calendar'
import { DayPeekView } from '../views/DayPeek'
import { MonthGridView } from '../views/MonthGrid'
import { editEventPath } from './eventPaths'

/**
 * The Month screen, wired up.
 *
 * Reads the domains and drops three month grids into the calendar deck. The
 * visible month is the URL's, and so is the selected day (`?day=`): tapping
 * a cell selects it and its overview shows under the deck; the overview's
 * arrow opens the Day screen. Without a selection the overview shows today.
 * Changing the month keeps the selection.
 */
export function MonthRoute() {
  const { navigate } = useNavigation()
  const { month: cursor } = useParams('/month/:month')
  const [q, setQ] = useQueryState({ day: { type: 'string' } })
  // A month change keeps the selected day: the swipe browses around it.
  const goToMonth = (month: string) => navigate(`/month/${month}${q.day ? `?day=${q.day}` : ''}`)
  const { accountId, userId } = useAccount()
  const { data: events = [] } = useEvents(accountId)
  const { people, colors } = usePeopleWithColors(accountId, userId)

  const [sheet, setSheet] = useState<{ event: CalendarEvent; date: string } | null>(null)

  const today = toISODate(new Date())
  // The day the overview shows: the URL's, else today — whichever month is
  // in view. A selected day off the visible month has no cell to highlight,
  // and the overview still names it.
  const selected = q.day && isISODate(q.day) ? q.day : today

  /** Tap on a cell: select it, moving to its month when it is a leading or trailing day. */
  function selectDay(iso: string) {
    if (isSameMonth(iso, cursor)) setQ({ day: iso })
    else navigate(`/month/${startOfMonth(iso)}?day=${iso}`)
  }

  function openOccurrence(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start })
  }

  // Deck pages: [previous month, visible month, next month].
  const months = useMemo(() => [-1, 0, 1].map((d) => addMonths(cursor, d)), [cursor])

  // Windowed per-occurrence state covering all three pages' grids (each grid
  // pads to full weeks, so it can straddle two months).
  const prevGrid = monthGridDays(months[0])
  const nextGrid = monthGridDays(months[2])
  const { occurrences, isLoading } = useOccurrencesForRange(
    accountId,
    prevGrid[0],
    nextGrid[nextGrid.length - 1],
  )

  function openDay(iso: string) {
    navigate('/day/:date', { params: { date: iso } })
  }

  // The selected day's occurrences, all-day first, then timed in start order.
  const dayOccs = useMemo(() => {
    const occs = occurrencesOnDate(events, selected, occurrences)
    return [
      ...occs.filter((o) => o.event.allDay),
      ...occs
        .filter((o) => !o.event.allDay)
        .sort((a, b) => eventStartMinutes(a.event) - eventStartMinutes(b.event)),
    ]
  }, [events, selected, occurrences])

  const colorOf = (o: DayOccurrence) => eventColorIn(colors[o.attendees[0]], o.event.colorKey)

  /** The people on an occurrence, with their colours, for its avatars. */
  function avatarsFor(ids: PersonId[]) {
    return ids.flatMap((id) => {
      // A person not in the list yet (first fetch in flight, or one a partner
      // just removed) must not crash the view.
      const p = people.find((x) => x.id === id)
      return p ? [{ person: p, color: colors[id] }] : []
    })
  }

  /** Open a search hit at the event's next upcoming occurrence, in the Day view. */
  function openSearchHit(seriesId: string) {
    const event = events.find((e) => e.id === seriesId)
    if (event) openDay(nextRelevantDate(event))
  }

  const page = (month: string) => (
    <MonthPage
      month={month}
      today={today}
      selected={selected}
      occurrences={occurrences}
      onSelectDay={selectDay}
      colors={colors}
      events={events}
    />
  )

  return (
    <>
      <CalendarView
        pageKey={cursor}
        onNavigate={(delta) => goToMonth(addMonths(cursor, delta))}
        onGoToday={() => goToMonth(startOfMonth(today))}
        todayActive={isSameMonth(today, cursor)}
        isMonth
      >
        <CalendarView.Header.Search>
          <EventSearch onPick={openSearchHit} />
        </CalendarView.Header.Search>
        <CalendarView.Header.Title>{monthLabel(cursor)}</CalendarView.Header.Title>
        {DAY_NAMES.map((name) => (
          <CalendarView.Header.Lane key={name}>
            <DayHead name={name} />
          </CalendarView.Header.Lane>
        ))}
        <CalendarView.Previous.Body>{page(months[0])}</CalendarView.Previous.Body>
        <CalendarView.Current.Body>{page(months[1])}</CalendarView.Current.Body>
        <CalendarView.Next.Body>{page(months[2])}</CalendarView.Next.Body>
        <CalendarView.Footer>
          <DayPeekView onOpen={() => openDay(selected)} openLabel={`Open ${isoLabel(selected)}`}>
            <DayPeekView.Title>{isoLabel(selected)}</DayPeekView.Title>
            {dayOccs.map((o) => (
              <DayPeekView.Row key={`${o.event.id}:${o.start}`}>
                <OccurrenceRow occ={o} color={colorOf(o)} onClick={() => openOccurrence(o)}>
                  <Avatars attendees={avatarsFor(o.attendees)} />
                </OccurrenceRow>
              </DayPeekView.Row>
            ))}
          </DayPeekView>
        </CalendarView.Footer>
      </CalendarView>

      {isLoading && <LoadingPill />}

      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={(scope) => {
            setSheet(null)
            navigate(editEventPath(sheet.event.id, sheet.date, scope))
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}

/** One month's 6×7 cell grid — a page of the deck. */
function MonthPage({
  month,
  today,
  selected,
  occurrences,
  onSelectDay,
  colors,
  events,
}: {
  month: string
  today: string
  /** The selected day; a cell of this month, or of another page's. */
  selected: string
  occurrences: OccurrenceIndex
  onSelectDay: (iso: string) => void
  /** Everyone's colour, already resolved against this user's settings. */
  colors: Record<PersonId, ColorKey>
  events: CalendarEvent[]
}) {
  const days = useMemo(() => monthGridDays(month), [month])

  // Expanding recurrences over 42 cells is O(events × occurrence state); do it
  // only when the grid or the data actually changes, not on every render.
  // All-day occurrences and timed ones are drawn differently, so they are
  // split here, the timed ones in start order.
  const occurrencesByDay = useMemo(
    () =>
      new Map(
        days.map((iso) => {
          const occs = occurrencesOnDate(events, iso, occurrences)
          return [
            iso,
            {
              allDay: occs.filter((o) => o.event.allDay),
              timed: occs
                .filter((o) => !o.event.allDay)
                .sort((a, b) => eventStartMinutes(a.event) - eventStartMinutes(b.event)),
            },
          ]
        }),
      ),
    [days, events, occurrences],
  )

  const colorOf = (o: DayOccurrence) => eventColorIn(colors[o.attendees[0]], o.event.colorKey)

  return (
    <MonthGridView>
      {days
        .filter((_, i) => i % 7 === 0)
        .map((monday) => (
          <MonthGridView.WeekNumber key={monday} week={isoWeekNumber(monday)} />
        ))}
      {days.map((iso) => {
        const { allDay, timed } = occurrencesByDay.get(iso) ?? { allDay: [], timed: [] }
        return (
          <MonthGridView.Cell
            key={iso}
            date={Number(iso.slice(8, 10))}
            bars={allDay.map(colorOf)}
            dots={timed.map(colorOf)}
            dim={!isSameMonth(iso, month)}
            isToday={iso === today}
            selected={iso === selected}
            label={`${monthLabel(iso)} ${Number(iso.slice(8, 10))}, ${allDay.length + timed.length} plans`}
            onClick={() => onSelectDay(iso)}
          />
        )
      })}
    </MonthGridView>
  )
}
