import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { useCompletionsForRange, useSetOccurrenceOverride } from '../data/completions'
import { useAddTemplate, useTemplates } from '../data/templates'
import { cloneAttachments } from '../lib/attachments'
import { cx } from '../lib/cx'
import { addDays, diffDays, minutesToTime, toDateTimeLocal } from '../lib/dates'
import { COLOR_OPTIONS, DEFAULT_COLOR } from '../lib/palette'
import type { ColorKey } from '../lib/palette'
import { personColorKey } from '../lib/people'
import { effectiveOccurrence } from '../lib/recurrence'
import { eventDate, eventStartMinutes } from '../lib/timing'
import { useApp } from '../state'
import shared from '../styles/shared.module.css'
import type {
  Attachment,
  CalendarEvent,
  CompletionsMap,
  EventTemplate,
  PersonId,
  RecurrenceFreq,
} from '../types'
import { AttachmentsEditor } from './AttachmentsEditor'
import { AttendeeChips } from './AttendeeChips'
import { ColorPicker } from './ColorPicker'
import s from './EventEditor.module.css'
import { NumberField } from './NumberField'
import { PageLoader } from './Spinner'

const SNAP = 15

/** What the editor opens onto: a brand-new event or an existing one. */
export type EditorTarget =
  | {
      mode: 'new'
      date: string
      attendees: PersonId[]
      allDay?: boolean
      startMin?: number
      endMin?: number
    }
  | {
      mode: 'edit'
      event: CalendarEvent
      /**
       * The ISO date of the specific occurrence the edit was opened from. Present
       * only when entered via an occurrence (not a series-level chip); unlocks the
       * "this occurrence / this & following / all" save-scope chooser.
       */
      occurrenceDate?: string
    }

type RepeatChoice = 'none' | RecurrenceFreq

/** datetime-local value for a date + minutes-from-midnight. Minutes past the
 *  day roll into the next date — `<input type="datetime-local">` rejects the
 *  out-of-range "T24:00" and would render an empty field. */
function dtLocal(date: string, minute: number): string {
  const day = 24 * 60
  if (minute >= day) {
    return `${addDays(date, Math.floor(minute / day))}T${minutesToTime(minute % day)}`
  }
  return `${date}T${minutesToTime(minute)}`
}

function clockMinutes(dt: string): number {
  const [h, m] = dt.slice(11).split(':').map(Number)
  return h * 60 + m
}

/** Whole minutes between two datetime-local strings (b - a), in wall-clock
 *  terms: day difference × 24h + clock difference. Subtracting epoch times
 *  would shift durations by ±60 min across a DST transition. */
function minutesBetween(a: string, b: string): number {
  return diffDays(b.slice(0, 10), a.slice(0, 10)) * 24 * 60 + (clockMinutes(b) - clockMinutes(a))
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A complete, parseable datetime-local value ("yyyy-mm-ddThh:mm"). A cleared
 *  or half-typed picker emits "" — saving that would persist NaN durations. */
function isCompleteDT(v: string): boolean {
  return v.length >= 16 && ISO_DATE_RE.test(v.slice(0, 10)) && !Number.isNaN(new Date(v).getTime())
}

/** Shared full-page editor for the event *template* (timing, attendees, attachments, deps). */
export function EventEditor({
  target,
  onClose,
}: {
  target: EditorTarget
  onClose: () => void
}) {
  // When opened on a specific occurrence, the form seeds from that
  // occurrence's timing override — which lives in the windowed completions
  // cache. Hold rendering until the window is in (normally a warm cache hit:
  // the view that opened the editor fetched the same month), otherwise the
  // form's initial state would be built without the override.
  const occurrenceDate = target.mode === 'edit' ? (target.occurrenceDate ?? null) : null
  const { completions, isLoading } = useCompletionsForRange(occurrenceDate)
  if (occurrenceDate && isLoading) {
    return (
      <div className={shared.editorPage}>
        <PageLoader />
      </div>
    )
  }
  return <EventEditorForm target={target} completions={completions} onClose={onClose} />
}

function EventEditorForm({
  target,
  completions,
  onClose,
}: {
  target: EditorTarget
  completions: CompletionsMap
  onClose: () => void
}) {
  const { state, dispatch, beginEdit, endEdit } = useApp()
  const setOccurrenceOverride = useSetOccurrenceOverride()
  const { data: templates = [] } = useTemplates()
  const addTemplate = useAddTemplate()
  const isEdit = target.mode === 'edit'
  const base = isEdit ? target.event : null

  // While this editor is open, defer realtime reloads so a partner's change
  // can't pull data out from under the unsaved draft.
  useEffect(() => {
    beginEdit()
    return endEdit
  }, [beginEdit, endEdit])

  const [title, setTitle] = useState(base?.title ?? '')
  const [allDay, setAllDay] = useState(base?.allDay ?? (isEdit ? false : (target.allDay ?? false)))

  // When the editor is opened from a specific occurrence of a recurring series,
  // seed the form from THAT occurrence (its date + any one-off override) rather
  // than the series' first instance, and unlock the save-scope chooser.
  const occurrenceDate = isEdit ? target.occurrenceDate : undefined
  const isRecurringOccurrence = isEdit && !!base!.recurrence && !!occurrenceDate
  // The occurrence as it currently stands (override applied), re-anchored onto its
  // own date so the form shows the right day/time even for a far-future instance.
  const seed: CalendarEvent | null =
    isEdit && occurrenceDate
      ? (() => {
          const eff = effectiveOccurrence(base!, occurrenceDate, completions)
          return {
            ...eff,
            start: eff.allDay ? occurrenceDate : dtLocal(occurrenceDate, eventStartMinutes(eff)),
          }
        })()
      : base

  const initialDate = isEdit ? eventDate(seed!) : target.date
  const initialStartMin = isEdit
    ? eventStartMinutes(seed!)
    : ((target.mode === 'new' ? target.startMin : undefined) ?? 9 * 60)
  const initialEndMin =
    (target.mode === 'new' ? target.endMin : undefined) ?? Math.min(initialStartMin + 60, 24 * 60)

  const [date, setDate] = useState(initialDate)
  const [days, setDays] = useState(isEdit && seed!.allDay ? Math.max(1, seed!.duration) : 1)
  const [startDT, setStartDT] = useState(
    isEdit && !seed!.allDay ? seed!.start : dtLocal(initialDate, initialStartMin),
  )
  const [endDT, setEndDT] = useState(() => {
    if (isEdit && !seed!.allDay) {
      const d = new Date(seed!.start)
      d.setMinutes(d.getMinutes() + seed!.duration)
      return toDateTimeLocal(d)
    }
    return dtLocal(initialDate, initialEndMin)
  })

  const [attendees, setAttendees] = useState<PersonId[]>(
    isEdit ? base!.attendees : target.attendees,
  )
  const [colorKey, setColorKey] = useState<ColorKey | undefined>(base?.colorKey)
  const [repeat, setRepeat] = useState<RepeatChoice>(base?.recurrence?.freq ?? 'none')
  const [interval, setInterval] = useState(base?.recurrence?.interval ?? 1)
  const [attachments, setAttachments] = useState<Attachment[]>(base?.attachments ?? [])
  // Provenance: the template a *new* event was started from (written to the
  // series' `template_id`). Stays null for from-scratch events and edits.
  const [templateId, setTemplateId] = useState<string | null>(null)
  // Transient "Saved to templates" confirmation.
  const [savedTemplate, setSavedTemplate] = useState(false)
  // Save-scope chooser for editing one occurrence of a recurring series.
  const [showScope, setShowScope] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])

  // Drop empty notes / empty checklists so saving doesn't keep stubs around.
  function cleanedAttachments(): Attachment[] {
    return attachments.filter((a) => {
      if (a.kind === 'note') return a.text.trim().length > 0
      if (a.kind === 'checklist') return a.items.length > 0
      return true
    })
  }

  // The duration the form currently describes (whole days all-day, else minutes).
  function currentDuration(): number {
    return allDay ? Math.max(1, days) : Math.max(SNAP, minutesBetween(startDT, endDT))
  }

  /** Pre-fill the form from a template (deep-copying its attachments). */
  function applyTemplate(t: EventTemplate) {
    setTemplateId(t.id)
    setTitle(t.title)
    setAttendees(t.attendees)
    setAttachments(cloneAttachments(t.attachments))
    setAllDay(t.allDay)
    if (t.allDay) {
      setDays(Math.max(1, t.duration))
    } else {
      // Keep the chosen start; stretch the end to the template's duration.
      const end = new Date(startDT)
      end.setMinutes(end.getMinutes() + Math.max(SNAP, t.duration))
      setEndDT(toDateTimeLocal(end))
    }
  }

  /** Save the current form as a reusable template (a separate row; the event,
   *  if any, is untouched). Attachments are copied with fresh ids. */
  function saveAsTemplate() {
    if (!title.trim()) return
    addTemplate.mutate({
      title: title.trim(),
      allDay,
      duration: currentDuration(),
      attendees,
      attachments: cloneAttachments(cleanedAttachments()),
    })
    setSavedTemplate(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedTemplate(false), 2000)
  }

  /** The event the form currently describes (no id). */
  function buildEvent(): Omit<CalendarEvent, 'id'> {
    return {
      title: title.trim(),
      start: allDay ? date : startDT,
      allDay,
      duration: currentDuration(),
      recurrence:
        repeat === 'none'
          ? undefined
          : {
              freq: repeat,
              interval: Math.max(1, interval),
              // `until` is a structural cap (set when a series is split), not a
              // form field — preserve it across edits so editing a split-off
              // series doesn't silently un-cap it and run past the split.
              ...(base?.recurrence?.until ? { until: base.recurrence.until } : {}),
            },
      attendees,
      ...(colorKey ? { colorKey } : {}),
      attachments: cleanedAttachments(),
    }
  }

  // Timing the form can actually save: complete pickers and finite numbers.
  const timingValid = allDay
    ? ISO_DATE_RE.test(date) && Number.isFinite(days)
    : isCompleteDT(startDT) && isCompleteDT(endDT)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !timingValid) return
    // Editing one occurrence of a recurring series: ask for the save scope first.
    if (isRecurringOccurrence) {
      setShowScope(true)
      return
    }
    if (isEdit) dispatch({ type: 'updateEvent', event: { ...buildEvent(), id: base!.id } })
    else
      dispatch({
        type: 'addEvent',
        event: buildEvent(),
        templateId: templateId ?? undefined,
      })
    onClose()
  }

  // ---- save-scope handlers (recurring-occurrence edits) -------------------
  function saveThisOccurrence() {
    // The override's identity stays the original slot (`occurrenceDate`); `start`
    // carries the form's chosen day + time, so changing the day relocates just
    // this occurrence (it stays part of the series, rendered on the new day).
    setOccurrenceOverride.mutate({
      event: base!,
      date: occurrenceDate!,
      start: allDay ? date : startDT,
      duration: currentDuration(),
    })
    onClose()
  }
  function saveThisAndFollowing() {
    // Re-anchor to the occurrence's own day so the new series keeps the series'
    // cadence — only the time/length (and other fields) carry the edit. A day
    // move is a "this occurrence" operation, not a cadence change.
    const start = allDay ? occurrenceDate! : `${occurrenceDate}T${startDT.slice(11)}`
    const ev = buildEvent()
    // The new forward series runs indefinitely — never inherit the old series'
    // cap (buildEvent copies `until` from the base, which here is the series
    // being split).
    const recurrence = ev.recurrence
      ? { freq: ev.recurrence.freq, interval: ev.recurrence.interval }
      : undefined
    dispatch({
      type: 'splitSeries',
      eventId: base!.id,
      fromDate: occurrenceDate!,
      event: { ...ev, start, recurrence },
    })
    onClose()
  }
  function saveAllEvents() {
    // Editing from an occurrence seeds the form on that occurrence's date, but
    // "all events" must keep the series' original anchor date (moving the whole
    // series to another day is out of scope) — apply only the new time/duration.
    const ev = buildEvent()
    const start = allDay ? eventDate(base!) : `${eventDate(base!)}T${startDT.slice(11)}`
    dispatch({
      type: 'updateEvent',
      event: { ...ev, start, id: base!.id },
    })
    onClose()
  }

  const unitLabel = repeat === 'daily' ? 'days' : repeat === 'weekly' ? 'weeks' : 'months'

  return (
    <form className={shared.editorPage} onSubmit={submit}>
      <header className={shared.editorHead}>
        <button type="button" className={shared.editorCancel} onClick={onClose}>
          Cancel
        </button>
        <strong>{isEdit ? 'Edit event' : 'New event'}</strong>
        <button type="submit" className={shared.primary}>
          Save
        </button>
      </header>

      <div className={shared.editorBody}>
        {!isEdit && templates.length > 0 && (
          <div className={shared.row}>
            <label className={shared.field}>
              Start from a template
              <select
                value={templateId ?? ''}
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value)
                  if (t) applyTemplate(t)
                  else setTemplateId(null)
                }}
              >
                <option value="">Blank event</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title || 'Untitled template'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <input
          ref={titleRef}
          placeholder="What's the plan?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className={shared.toggle}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All-day
        </label>

        {allDay ? (
          <div className={shared.row}>
            <label className={shared.field}>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className={shared.field}>
              Ends
              <input
                type="date"
                // All-day duration is whole days, so the picked end date is
                // inclusive: ending on the start date is a one-day event.
                value={addDays(date, Math.max(1, days) - 1)}
                min={date}
                onChange={(e) => {
                  // A cleared/incomplete picker emits "" — ignore it rather
                  // than compute NaN days.
                  if (!ISO_DATE_RE.test(e.target.value)) return
                  setDays(Math.max(1, diffDays(e.target.value, date) + 1))
                }}
              />
            </label>
          </div>
        ) : (
          <div className={shared.row}>
            <label className={shared.field}>
              Starts
              <input
                type="datetime-local"
                step={SNAP * 60}
                value={startDT}
                onChange={(e) => {
                  const next = e.target.value
                  setStartDT(next)
                  // Keep the same duration when the start moves — but only
                  // when both ends are complete values, else leave the end
                  // untouched until the picker settles.
                  if (!isCompleteDT(next) || !isCompleteDT(startDT) || !isCompleteDT(endDT)) return
                  const dur = Math.max(SNAP, minutesBetween(startDT, endDT))
                  const ne = new Date(next)
                  ne.setMinutes(ne.getMinutes() + dur)
                  setEndDT(toDateTimeLocal(ne))
                }}
              />
            </label>
            <label className={shared.field}>
              Ends
              <input
                type="datetime-local"
                step={SNAP * 60}
                value={endDT}
                onChange={(e) => setEndDT(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className={shared.row}>
          <label className={shared.field}>
            Repeats
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {repeat !== 'none' && (
            <label className={shared.field}>
              Every
              <div className={shared.interval}>
                <NumberField min={1} value={interval} onChange={setInterval} />
                <span>{unitLabel}</span>
              </div>
            </label>
          )}
        </div>

        <label className={shared.label}>Who's involved?</label>
        <AttendeeChips value={attendees} onChange={setAttendees} />

        <label className={shared.label}>Color</label>
        <ColorPicker
          options={COLOR_OPTIONS}
          value={colorKey ?? null}
          defaultValue={attendees[0] ? personColorKey(state, attendees[0]) : DEFAULT_COLOR}
          ariaLabel="Event color"
          onChange={setColorKey}
        />

        <AttachmentsEditor attachments={attachments} onChange={setAttachments} />

        <div className={s.templateBar}>
          <button
            type="button"
            className={s.saveTemplate}
            onClick={saveAsTemplate}
            disabled={!title.trim()}
          >
            {savedTemplate ? 'Saved to templates ✓' : 'Save as template'}
          </button>
        </div>

        {isEdit && (
          <button
            type="button"
            className={cx(shared.danger, shared.editorDelete)}
            onClick={() => {
              dispatch({ type: 'removeEvent', id: base!.id })
              onClose()
            }}
          >
            Delete event
          </button>
        )}
      </div>

      <Dialog.Root open={showScope} onOpenChange={setShowScope}>
        <Dialog.Portal>
          <Dialog.Overlay className={s.scopeOverlay} />
          <Dialog.Content className={s.scopeCard} aria-describedby={undefined}>
            <Dialog.Title className={s.scopeTitle}>Save changes to…</Dialog.Title>
            <button type="button" className={s.scopeOption} onClick={saveThisOccurrence}>
              This event only
            </button>
            <button type="button" className={s.scopeOption} onClick={saveThisAndFollowing}>
              This and following events
            </button>
            <button type="button" className={s.scopeOption} onClick={saveAllEvents}>
              All events
            </button>
            <Dialog.Close asChild>
              <button type="button" className={s.scopeCancel}>
                Cancel
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  )
}
