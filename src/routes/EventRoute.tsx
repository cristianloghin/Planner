import { notFound, useLocation, useNavigation, useParams, useQueryState } from '@mikrostack/router'
import { useState } from 'react'
import { useAccount } from '../account'
import shared from '../assets/styles/shared.module.css'
import { PageLoader } from '../assets/ui/Spinner'
import { isoLabel, toISODate } from '../assets/utils/dates'
import { uid } from '../assets/utils/id'
import { EventForm } from '../domains/events/components/EventForm'
import {
  type EditScope,
  type EventDraft,
  draftForEvent,
  draftForNew,
  draftValid,
  dtLocal,
  eventFromDraft,
  splitEventFromDraft,
  templateFromDraft,
} from '../domains/events/draft'
import { useEventsWrite, useOccurrencesWrite } from '../domains/events/mutations'
import { rosterChange } from '../domains/events/patches'
import { useEvents, useOccurrencesForRange, useTemplates } from '../domains/events/queries'
import { timingOf } from '../domains/events/selectors'
import { usePeopleWithColors } from '../domains/people/queries'
import { defaultAttendees, eventColorIn } from '../domains/people/selectors'
import { effectiveOccurrence, startsOn } from '../services/recurrence/expand'
import { recurrenceEndingBefore, recurrenceFrom, splitDate } from '../services/recurrence/split'
import { eventDate, eventStartMinutes } from '../services/recurrence/timing'
import type { CalendarEvent } from '../types'
import { EditorPageView } from '../views/EditorPage'

/**
 * The editor as a route: `/event/new` seeded from the query, `/event/:id`
 * for an existing series, or with a `scope` and a `date` for part of one —
 * `occurrence` for that one day (which day, what time, who is on it, and
 * nothing the series owns), `following` for that day and every one after it
 * (a new series from there on, so everything).
 *
 * The routes load — people, colours, templates, the series, the occurrence
 * window — and hand the form a draft to show. The form only renders; what a
 * save means is decided here, with the domains' pure rules.
 *
 * Both close by going *back* — to the calendar screen that opened them, at
 * the date it was on — or, when there is nothing to go back to (a deep link,
 * a reload), to the day the editor is about.
 */

/** Back to the screen that opened the editor, or to `date`'s day. */
function useClose(date: string) {
  const { navigate, back } = useNavigation()
  const { canGoBack } = useLocation()
  return () => {
    if (canGoBack) back()
    else navigate('/day/:date', { params: { date }, replace: true })
  }
}

export function NewEventRoute() {
  const { accountId, userId } = useAccount()
  const { people, withColors, isPending } = usePeopleWithColors(accountId, userId)
  const [q] = useQueryState({
    date: { type: 'string', default: () => toISODate(new Date()) },
    for: { type: 'string[]' },
    at: { type: 'number' },
    end: { type: 'number' },
    allDay: { type: 'boolean' },
  })
  const close = useClose(q.date)

  // The default roster needs the people list; hold the form until it is in.
  if (isPending && !q.for) return <PageLoader />

  return (
    <EditorSession
      key={`new:${q.date}`}
      initial={draftForNew({
        date: q.date,
        attendees: q.for ?? defaultAttendees(people),
        ...(q.at != null ? { startMin: q.at } : {}),
        ...(q.end != null ? { endMin: q.end } : {}),
        ...(q.allDay ? { allDay: true } : {}),
      })}
      people={withColors}
      onClose={close}
    />
  )
}

export function EditEventRoute() {
  const { id } = useParams('/event/:id')
  const { accountId, userId } = useAccount()
  const { withColors, isPending: peoplePending } = usePeopleWithColors(accountId, userId)
  const { data: events, isPending } = useEvents(accountId)
  const [q] = useQueryState({ date: { type: 'string' }, scope: { type: 'string' } })
  const { date } = q
  const event = events?.find((e) => e.id === id)
  // Part of a series is only a thing to edit when there is a day the series
  // actually produces to pick it out of — the URL can be typed, and a day the
  // rule skips is nobody's occurrence; anything else is the series. So is
  // "following" on the series' first day, where nothing would be left before
  // the cut.
  const asked = q.scope === 'occurrence' || q.scope === 'following' ? q.scope : 'series'
  const scope: EditScope =
    !date ||
    !event?.recurrence ||
    !startsOn(event, date) ||
    (asked === 'following' && date === eventDate(event))
      ? 'series'
      : asked
  // Opened on an occurrence, the form seeds from that occurrence's override —
  // which lives in the windowed occurrence cache. Normally a warm hit: the
  // view that opened the editor fetched the same window.
  const { occurrences, isLoading: occurrencesLoading } = useOccurrencesForRange(
    accountId,
    scope === 'occurrence' ? (date ?? null) : null,
  )
  const close = useClose(date ?? (event ? eventDate(event) : toISODate(new Date())))

  if (!event) {
    // The series is not in the cache yet (a deep link before the first
    // fetch), or it is gone: an unknown URL and a deleted event look alike.
    if (isPending) return <PageLoader />
    notFound()
  }
  if (peoplePending || (scope === 'occurrence' && occurrencesLoading)) return <PageLoader />

  // The occurrence as it currently stands (override applied), re-anchored on
  // its own date so the form shows the right day and time even for a
  // far-future instance. The series shows as itself, from its own first day.
  // From a day on, it shows as itself from that day: the series' own time and
  // people (that day's one-off override stays that day's), with what is left
  // of its count.
  const seed: CalendarEvent =
    scope === 'occurrence'
      ? anchoredOn(effectiveOccurrence(event, date!, occurrences), date!)
      : scope === 'following'
        ? { ...anchoredOn(event, date!), recurrence: recurrenceFrom(event, date!) }
        : event

  return (
    <EditorSession
      key={`${event.id}:${scope}:${date ?? ''}`}
      initial={draftForEvent(seed)}
      base={event}
      scope={scope}
      occurrenceDate={scope === 'series' ? undefined : date}
      people={withColors}
      onClose={close}
    />
  )
}

/** `e` as if its first day were `date`, at its own time of day. */
function anchoredOn(e: CalendarEvent, date: string): CalendarEvent {
  return { ...e, start: e.allDay ? date : dtLocal(date, eventStartMinutes(e)) }
}

/**
 * One editing session: holds the draft, decides what a save writes, and
 * composes the page. Keyed by what is being edited, so a different event is
 * a fresh draft.
 */
function EditorSession({
  initial,
  base,
  scope = 'series',
  occurrenceDate,
  people,
  onClose,
}: {
  initial: EventDraft
  /** The series being edited; absent for a new event. */
  base?: CalendarEvent
  /**
   * What a save writes: the series, one occurrence of it, or it from one
   * occurrence on — the last two on `occurrenceDate`.
   */
  scope?: EditScope
  occurrenceDate?: string
  people: Parameters<typeof EventForm>[0]['people']
  onClose: () => void
}) {
  const { accountId, userId } = useAccount()
  const { data: templates = [] } = useTemplates(accountId)
  const events = useEventsWrite()
  const occurrences = useOccurrencesWrite()
  const [draft, setDraft] = useState(initial)

  const isEdit = !!base
  const isOccurrence = scope === 'occurrence' && !!base && !!occurrenceDate
  const isFollowing = scope === 'following' && !!base && !!occurrenceDate

  function saveSeries(event: Omit<CalendarEvent, 'id'>, isNew: boolean) {
    events.mutate({
      accountId,
      userId,
      change: {
        kind: 'saveEvent',
        // A new event's id is minted here, so a second edit before the first
        // write lands still names a real row.
        event: { ...event, id: isNew ? uid() : base!.id },
        isNew,
      },
    })
  }

  function submit() {
    if (!draftValid(draft)) return
    if (isOccurrence) saveThisOccurrence()
    else if (isFollowing) saveFollowing()
    else {
      saveSeries(eventFromDraft(draft), !isEdit)
      onClose()
    }
  }

  /**
   * This occurrence and every one after it: the series stops the day before,
   * and the form — a new series with reminders of its own — takes over from
   * here, along with whatever was already recorded on the days from here on.
   */
  function saveFollowing() {
    const event = { ...splitEventFromDraft(draft), id: uid() }
    // The form may have moved the new half's first day off the cut day.
    const fromDate = splitDate(occurrenceDate!, eventDate(event))
    events.mutate({
      accountId,
      userId,
      change: {
        kind: 'splitEvent',
        id: base!.id,
        recurrence: recurrenceEndingBefore(base!.recurrence!, fromDate),
        fromDate,
        event,
      },
    })
    onClose()
  }

  /** One occurrence: its day, times and people, as a one-off override of that slot. */
  function saveThisOccurrence() {
    const series = timingOf(base!)
    const date = occurrenceDate!
    const event = eventFromDraft(draft)
    // The override's identity stays the original slot; `start` carries the
    // form's chosen day + time, so changing the day relocates just this
    // occurrence (it stays part of the series, rendered on the new day).
    occurrences.mutate({
      accountId,
      change: { kind: 'override', series, date, start: event.start, duration: event.duration },
    })
    occurrences.mutate({
      accountId,
      change: { ...rosterChange(draft.attendees, base!.attendees), series, date },
    })
    onClose()
  }

  /**
   * The current form as a reusable template; the event, if any, is untouched.
   * The template keeps the colour the event is drawn in — its own, or the
   * first person's lane colour when it has none.
   */
  function saveAsTemplate() {
    if (!draft.title.trim()) return
    const lane = people.find((p) => p.person.id === draft.attendees[0])?.color
    events.mutate({
      accountId,
      userId,
      change: {
        kind: 'saveTemplate',
        isNew: true,
        template: { ...templateFromDraft(draft, eventColorIn(lane, draft.colorKey)), id: uid() },
      },
    })
  }

  return (
    <EditorPageView onCancel={onClose} onSubmit={submit} submitLabel="Save">
      {/* One occurrence is headed like the sheet that opened it: the event's
          name in the body, the bar left plain. From a day on, the bar names
          the day: everything before it stays as it is. */}
      <EditorPageView.Title>
        {isOccurrence
          ? null
          : isFollowing
            ? `Edit from ${isoLabel(occurrenceDate!)}`
            : isEdit
              ? 'Edit event'
              : 'New event'}
      </EditorPageView.Title>
      <EditorPageView.Body>
        {isOccurrence && (
          <>
            <h1 className={shared.editorTitle}>{base!.title}</h1>
            <p className={shared.editorMeta}>Only on {isoLabel(occurrenceDate!)}</p>
          </>
        )}
        <EventForm
          draft={draft}
          onChange={setDraft}
          isEdit={isEdit}
          scope={scope}
          seriesStart={isFollowing ? occurrenceDate : base ? eventDate(base) : undefined}
          people={people}
          templates={isEdit ? [] : templates}
          onSaveAsTemplate={saveAsTemplate}
        />
      </EditorPageView.Body>
    </EditorPageView>
  )
}
