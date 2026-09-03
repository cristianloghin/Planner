import {
  AlertTriangle,
  Bell,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from '../account'
import { useLatest } from '../assets/hooks/useLatest'
import { type ColorKey, colorStyle } from '../assets/palette'
import shared from '../assets/styles/shared.module.css'
import { LoadingPill } from '../assets/ui/Spinner'
import { cx } from '../assets/utils/cx'
import { addDays, isoLabel, minutesToTime, toISODate } from '../assets/utils/dates'
import { checklistEntries, hasReminders } from '../domains/events/attachments'
import { useEvents } from '../domains/events/queries'
import { useCompletionsForRange, useDependencies } from '../domains/occurrences/queries'
import type { OccurrenceDependency } from '../domains/occurrences/types'
import { usePeople } from '../domains/people/queries'
import { byId, eventColorKey, personColorKey } from '../domains/people/selectors'
import { usePreferences } from '../domains/preferences/queries'
import { personColors } from '../domains/preferences/selectors'
import { useCalendarNavigation } from '../navigation'
import { type Busy, type ChildStatus, childStatuses } from '../services/conflicts'
import { loadZoom, pageInert, useSwipeGestures } from '../services/gestures'
import {
  type DayOccurrence,
  nextRelevantDate,
  occurrencesOnDate,
} from '../services/recurrence/expand'
import {
  isOccurrenceDone,
  occKey,
  occurrenceStatus,
  prerequisiteDatesInRange,
} from '../services/recurrence/status'
import { DAY_MIN, type TimeBlock, layoutBlocks } from '../services/timeline-layout'
import type { CalendarEvent, CompletionsMap, Person, PersonId } from '../types'
import { Avatars } from './Avatars'
import s from './DayView.module.css'
import { type EditorTarget, EventEditor } from './EventEditor'
import { OccurrenceSheet } from './OccurrenceSheet'
import { TimeGutter } from './TimeGutter'
import { ViewHeader } from './ViewHeader'

const SNAP = 15
const ZOOM_KEY = 'planner:hourH'

export function DayView() {
  const nav = useCalendarNavigation()
  const { accountId, userId } = useAccount()
  const { data: events = [] } = useEvents(accountId)
  const { data: dependencies = {} } = useDependencies(accountId)
  const day = nav.selectedDay
  const { data: people = [] } = usePeople(accountId)
  const { data: overrides = {} } = usePreferences(accountId, userId, personColors)
  const peopleById = useMemo(() => byId(people), [people])
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [sheet, setSheet] = useState<{
    event: CalendarEvent
    date: string
  } | null>(null)

  // Pixels-per-hour for the timeline; pinch-to-zoom adjusts it (Y axis only).
  const [hourH, setHourH] = useState(() => loadZoom(ZOOM_KEY))
  const pxPerMin = hourH / 60
  // Mirror for scrollToMinute, which mount effects call with a stale closure.
  const hourHRef = useLatest(hourH)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const dateISO = addDays(nav.weekStart, day)

  // Swipe to change day, pinch to zoom (shared with the Week grid).
  const { onClickCapture } = useSwipeGestures({
    scrollRef,
    stripRef,
    pageKey: dateISO,
    onNavigate: (delta) => nav.shiftDay(delta),
    zoom: { hourH, setHourH, key: ZOOM_KEY },
  })

  // Tick once a minute so the "now" line moves and today-detection rolls over
  // at midnight — without it both freeze at whatever the last interaction saw.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(iv)
  }, [])

  const nowISO = toISODate(now)
  const isToday = dateISO === nowISO
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Windowed per-occurrence state for the visible day and its swipe
  // neighbors (plus the dates of any prerequisites their occurrences wait
  // on, so their met/unmet resolves even when they live outside the window).
  const prevISO = addDays(dateISO, -1)
  const nextISO = addDays(dateISO, 1)
  const prereqDates = useMemo(
    () => prerequisiteDatesInRange(dependencies, prevISO, nextISO),
    [dependencies, prevISO, nextISO],
  )
  const { completions, isLoading: completionsLoading } = useCompletionsForRange(
    accountId,
    prevISO,
    nextISO,
    prereqDates,
  )

  // Scroll the timeline so `minute` sits a little below the top edge.
  function scrollToMinute(minute: number) {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, minute * (hourHRef.current / 60) - 80)
  }

  // First mount only: focus now (or 7am). Day navigation deliberately keeps the
  // user's scroll position — jumping the timeline on every day change is jarring.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on mount only
  useEffect(() => {
    scrollToMinute(isToday ? nowMin : 7 * 60)
  }, [])

  function addAt(date: string, attendees: PersonId[], minute: number) {
    const start = Math.min(Math.max(0, Math.round(minute / SNAP) * SNAP), DAY_MIN - SNAP)
    setEditor({
      mode: 'new',
      date,
      attendees,
      startMin: start,
      endMin: Math.min(start + 60, DAY_MIN),
    })
  }

  function openSheet(occ: DayOccurrence) {
    setSheet({ event: occ.event, date: occ.start })
  }

  // One entry per swipe-strip page: yesterday, the visible day, tomorrow.
  // None of this depends on zoom or gesture state, and it's the expensive part
  // of a render (recurrence expansion + conflict analysis) — memoize so a
  // pinch-zoom frame or timer tick doesn't recompute it.
  const pages = useMemo(
    () =>
      [prevISO, dateISO, nextISO].map((iso) => {
        const occs = occurrencesOnDate(events, iso, completions)
        const timedBlocks: TimeBlock[] = occs
          .filter((o) => !o.event.allDay)
          .map((o) => ({ occ: o, start: o.segment.start, end: o.segment.end }))
        const allDayOccs = occs.filter((o) => o.event.allDay)

        // Coverage looks at the whole day: all-day events count as busy 00:00–24:00.
        const coverage: Busy[] = occs.map((o) => ({
          id: o.event.id,
          attendees: o.event.attendees,
          start: o.event.allDay ? 0 : o.segment.start,
          end: o.event.allDay ? DAY_MIN : o.segment.end,
        }))
        const statuses = childStatuses(coverage, peopleById)
        return { iso, timedBlocks, allDayOccs, statuses }
      }),
    [events, completions, peopleById, prevISO, dateISO, nextISO],
  )
  // The header (lane names, all-day chips, warning badge) shows the visible day.
  const { allDayOccs, statuses } = pages[1]
  const hasWarnings = [...statuses.values()].some((st) => st !== 'covered')

  const fullHeight = DAY_MIN * pxPerMin

  // Open a search hit: jump the day to the event's next upcoming occurrence
  // (falling back to the series anchor for an ended series) and open its editor.
  function openSearchHit(seriesId: string) {
    const event = events.find((e) => e.id === seriesId)
    if (!event) return
    const date = nextRelevantDate(event)
    nav.goToDate(date)
    setEditor({ mode: 'edit', event, occurrenceDate: date })
  }

  function goToday() {
    nav.goToDate(toISODate(new Date()))
    // Explicit "take me to now" intent, so re-focus the current time.
    const now = new Date().getHours() * 60 + new Date().getMinutes()
    requestAnimationFrame(() => scrollToMinute(now))
  }

  return (
    <section className={shared.view}>
      <ViewHeader
        onToday={goToday}
        todayActive={isToday}
        onPickSearch={openSearchHit}
        rightExtra={hasWarnings && <AlertTriangle className={s.alertBadge} />}
        nav={
          <div className={shared.weekNav}>
            <button type="button" onClick={() => nav.shiftDay(-1)} aria-label="Previous day">
              <ChevronLeft size={20} />
            </button>
            <strong>{isoLabel(dateISO)}</strong>
            <button type="button" onClick={() => nav.shiftDay(1)} aria-label="Next day">
              <ChevronRight size={20} />
            </button>
          </div>
        }
      >
        <div className={s.plannerHead}>
          <div />
          <div className={s.laneHeads}>
            {people.map((p) => (
              <div
                key={p.id}
                className={s.laneHead}
                style={colorStyle(personColorKey(people, overrides, p.id))}
              >
                <div>
                  <span className={s.dot} />
                  {p.name}
                </div>
                <div>
                  {allDayOccs
                    .filter((o) => o.event.attendees.includes(p.id))
                    .map((o) => (
                      <AllDayChip
                        key={`${o.event.id}:${o.start}`}
                        occ={o}
                        personId={p.id}
                        status={statuses.get(o.event.id)}
                        completions={completions}
                        onClick={() => openSheet(o)}
                        people={people}
                        overrides={overrides}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ViewHeader>
      <div
        className={s.plannerBody}
        ref={scrollRef}
        // Browser owns vertical panning; we own horizontal swipe + pinch.
        style={{ touchAction: 'pan-y' }}
        onClickCapture={onClickCapture}
      >
        <div
          className={s.plannerGrid}
          style={
            {
              '--hour-h': `${hourH}px`,
              '--quarter-h': `${hourH / 4}px`,
            } as React.CSSProperties
          }
        >
          <TimeGutter hourH={hourH} />
          {/* The gutter stays put; only the day pages slide during a swipe. */}
          <div className={shared.swipeClip}>
            <div className={shared.swipeStrip} ref={stripRef}>
              {pages.map((page, pageIdx) => (
                <div
                  key={page.iso}
                  className={s.lanes}
                  style={{ height: fullHeight }}
                  {...pageInert(pageIdx === 1)}
                >
                  {people.map((p) => (
                    <Lane
                      key={p.id}
                      person={p}
                      blocks={page.timedBlocks}
                      statuses={page.statuses}
                      completions={completions}
                      nowMin={page.iso === nowISO ? nowMin : null}
                      pxPerMin={pxPerMin}
                      onAddAt={(min) => addAt(page.iso, [p.id], min)}
                      onOpen={openSheet}
                      people={people}
                      overrides={overrides}
                      events={events}
                      dependencies={dependencies}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {completionsLoading && <LoadingPill />}

      {editor && <EventEditor target={editor} onClose={() => setEditor(null)} />}
      {sheet && (
        <OccurrenceSheet
          event={sheet.event}
          date={sheet.date}
          onEdit={() => {
            setEditor({
              mode: 'edit',
              event: sheet.event,
              occurrenceDate: sheet.date,
            })
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}

/** Compact badges shown on a block / chip: reminders, checklist progress, done, kid status. */
function badges(
  completions: CompletionsMap,
  event: CalendarEvent,
  date: string,
  status: ChildStatus | undefined,
) {
  const entries = checklistEntries(event)
  let checklist: { n: number; total: number } | null = null
  if (entries.length) {
    const checked = completions[occKey(event.id, date)]?.checked ?? {}
    const n = entries.filter((e) => checked[e.id]).length
    checklist = { n, total: entries.length }
  }
  return (
    <span className={s.badges}>
      {hasReminders(event) && <Bell className={s.badgeIcon} aria-label="Reminders" />}
      {checklist && (
        <span className={s.badge}>
          <CheckSquare className={s.badgeIcon} aria-label="Checklist" />
          {checklist.n}/{checklist.total}
        </span>
      )}
      {status === 'clash' && <AlertTriangle className={s.badgeIcon} aria-label="Clash" />}
      {status === 'needs' && <CircleDashed className={s.badgeIcon} aria-label="Needs attention" />}
    </span>
  )
}

function AllDayChip({
  occ,
  personId,
  status,
  completions,
  onClick,
  people,
  overrides,
}: {
  occ: DayOccurrence
  personId: PersonId
  status: ChildStatus | undefined
  completions: CompletionsMap
  onClick: () => void
  /** Everyone in the account, in lane order, and this user's colour overrides. */
  people: Person[]
  overrides: Record<PersonId, ColorKey>
}) {
  const { event } = occ
  const done = isOccurrenceDone(completions, event, occ.start)
  return (
    <button
      type="button"
      className={cx(
        s.alldayChip,
        done && s.done,
        status === 'clash' && s.warnClash,
        status === 'needs' && s.warnNeeds,
      )}
      style={colorStyle(eventColorKey(people, overrides, personId, event.colorKey))}
      onClick={onClick}
    >
      <span className={s.alldayMeta}>{badges(completions, event, occ.start, status)}</span>
      <span className={s.alldayTitle}>{event.title}</span>
      {occ.span > 1 && <span className={s.allDayOffset}>{`${occ.offset + 1}/${occ.span}`}</span>}
    </button>
  )
}

function Lane({
  person,
  blocks,
  statuses,
  completions,
  nowMin,
  pxPerMin,
  onAddAt,
  onOpen,
  people,
  overrides,
  events,
  dependencies,
}: {
  person: Person
  blocks: TimeBlock[]
  statuses: Map<string, ChildStatus>
  completions: CompletionsMap
  nowMin: number | null
  pxPerMin: number
  onAddAt: (minute: number) => void
  onOpen: (occ: DayOccurrence) => void
  /** Everyone in the account, in lane order, and this user's colour overrides. */
  people: Person[]
  overrides: Record<PersonId, ColorKey>
  /** Every event, and what each day waits on — for the blocked check. */
  events: CalendarEvent[]
  dependencies: Record<string, OccurrenceDependency[]>
}) {
  // Every block this person is on — shared events simply appear in each
  // attendee's lane, colored by that lane.
  const mine = blocks.filter((b) => b.occ.event.attendees.includes(person.id))
  const laid = layoutBlocks(mine)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(`.${s.tlEvent}`)) return
    const rect = e.currentTarget.getBoundingClientRect()
    onAddAt((e.clientY - rect.top) / pxPerMin)
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-on-empty-space is a pointer affordance to prefill the editor; the keyboard path is the header's + button
    <div className={s.lane} onClick={handleClick}>
      {nowMin != null && (
        <div className={s.nowLine} style={{ top: nowMin * pxPerMin }}>
          <span className={s.nowDot} />
        </div>
      )}

      {laid.map(({ block, col, cols }) => {
        const ev = block.occ.event
        const status = statuses.get(ev.id)
        const joint = ev.attendees.length > 1
        const done = isOccurrenceDone(completions, ev, block.occ.start)
        const blocked =
          occurrenceStatus(dependencies, events, completions, ev, block.occ.start) === 'blocked'
        return (
          <button
            type="button"
            key={`${ev.id}:${block.occ.start}`}
            className={cx(
              s.tlEvent,
              done && s.done,
              blocked && s.blocked,
              status === 'clash' && s.warnClash,
              status === 'needs' && s.warnNeeds,
            )}
            style={{
              top: block.start * pxPerMin,
              height: Math.max((block.end - block.start) * pxPerMin, 16),
              left: `calc(${(100 / cols) * col}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              ...colorStyle(eventColorKey(people, overrides, person.id, ev.colorKey)),
            }}
            onClick={() => onOpen(block.occ)}
          >
            <span className={s.tlTime}>
              {minutesToTime(block.start)}–{minutesToTime(block.end)}
              {block.occ.moved && (
                <span className={s.tlTag} aria-label="Moved from another day">
                  {' '}
                  ↔ moved
                </span>
              )}
              {badges(completions, ev, block.occ.start, status)}
            </span>
            <span className={s.tlTitle}>{ev.title}</span>
            {joint && <Avatars attendees={ev.attendees} />}
          </button>
        )
      })}
    </div>
  )
}
