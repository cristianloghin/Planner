import { useNavigation, useParams } from '@mikrostack/router'
import { useMemo } from 'react'
import { useAccount } from '../account'
import type { ColorKey } from '../assets/palette'
import { DayHead } from '../assets/ui/DayHead'
import { LoadingPill } from '../assets/ui/Spinner'
import {
  DAY_NAMES,
  addMonths,
  isSameMonth,
  isoWeekNumber,
  monthGridDays,
  monthLabel,
  startOfMonth,
  toISODate,
} from '../assets/utils/dates'
import { EventSearch } from '../components/EventSearch'
import { useEvents } from '../domains/events/queries'
import { useCompletionsForRange } from '../domains/occurrences/queries'
import { usePeople } from '../domains/people/queries'
import { eventColorIn, personColorMap } from '../domains/people/selectors'
import { usePreferences } from '../domains/preferences/queries'
import { personColors } from '../domains/preferences/selectors'
import { nextRelevantDate, occurrencesOnDate } from '../services/recurrence/expand'
import { eventStartMinutes } from '../services/recurrence/timing'
import type { CalendarEvent, CompletionsMap, PersonId } from '../types'
import { CalendarView } from '../views/Calendar'
import { MonthGridView } from '../views/MonthGrid'

/**
 * The Month screen, wired up.
 *
 * Reads the domains and drops three month grids into the calendar deck. The
 * visible month is the URL's; opening a day is one navigation.
 */
export function MonthRoute() {
  const { navigate } = useNavigation()
  const { month: cursor } = useParams('/month/:month')
  const goToMonth = (month: string) => navigate('/month/:month', { params: { month } })
  const { accountId, userId } = useAccount()
  const { data: events = [] } = useEvents(accountId)
  const { data: people = [] } = usePeople(accountId)
  const { data: overrides = {} } = usePreferences(accountId, userId, personColors)

  // Everyone's colour, resolved once; the pages only paint.
  const colors = useMemo(() => personColorMap(people, overrides), [people, overrides])

  const today = toISODate(new Date())
  // Deck pages: [previous month, visible month, next month].
  const months = useMemo(() => [-1, 0, 1].map((d) => addMonths(cursor, d)), [cursor])

  // Windowed per-occurrence state covering all three pages' grids (each grid
  // pads to full weeks, so it can straddle two months).
  const prevGrid = monthGridDays(months[0])
  const nextGrid = monthGridDays(months[2])
  const { completions, isLoading } = useCompletionsForRange(
    accountId,
    prevGrid[0],
    nextGrid[nextGrid.length - 1],
  )

  function openDay(iso: string) {
    navigate('/day/:date', { params: { date: iso } })
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
      completions={completions}
      onOpenDay={openDay}
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
        <CalendarView.Previous>{page(months[0])}</CalendarView.Previous>
        <CalendarView.Current>{page(months[1])}</CalendarView.Current>
        <CalendarView.Next>{page(months[2])}</CalendarView.Next>
      </CalendarView>

      {isLoading && <LoadingPill />}
    </>
  )
}

/** One month's 6×7 cell grid — a page of the deck. */
function MonthPage({
  month,
  today,
  completions,
  onOpenDay,
  colors,
  events,
}: {
  month: string
  today: string
  completions: CompletionsMap
  onOpenDay: (iso: string) => void
  /** Everyone's colour, already resolved against this user's settings. */
  colors: Record<PersonId, ColorKey>
  events: CalendarEvent[]
}) {
  const days = useMemo(() => monthGridDays(month), [month])

  // Expanding recurrences over 42 cells is O(events × occurrence state); do it
  // only when the grid or the data actually changes, not on every render.
  const occurrencesByDay = useMemo(
    () =>
      new Map(
        days.map((iso) => [
          iso,
          occurrencesOnDate(events, iso, completions).sort(
            (a, b) =>
              Number(b.event.allDay) - Number(a.event.allDay) ||
              eventStartMinutes(a.event) - eventStartMinutes(b.event),
          ),
        ]),
      ),
    [days, events, completions],
  )

  return (
    <MonthGridView>
      {days
        .filter((_, i) => i % 7 === 0)
        .map((monday) => (
          <MonthGridView.WeekNumber key={monday} week={isoWeekNumber(monday)} />
        ))}
      {days.map((iso) => {
        const dayOccs = occurrencesByDay.get(iso) ?? []
        return (
          <MonthGridView.Cell
            key={iso}
            date={Number(iso.slice(8, 10))}
            dots={dayOccs.map((o) => eventColorIn(colors[o.attendees[0]], o.event.colorKey))}
            dim={!isSameMonth(iso, month)}
            isToday={iso === today}
            label={`${monthLabel(iso)} ${Number(iso.slice(8, 10))}, ${dayOccs.length} plans`}
            onClick={() => onOpenDay(iso)}
          />
        )
      })}
    </MonthGridView>
  )
}
