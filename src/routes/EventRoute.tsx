import {
  notFound,
  useLocation,
  useNavigation,
  useParams,
  useQueryState,
} from "@mikrostack/router";
import { useState } from "react";
import { useAccount } from "../account";
import { ScopeSheet } from "../assets/ui/ScopeSheet";
import { PageLoader } from "../assets/ui/Spinner";
import { isoLabel, toISODate } from "../assets/utils/dates";
import { uid } from "../assets/utils/id";
import { EventForm } from "../domains/events/components/EventForm";
import {
  type EventDraft,
  draftForEvent,
  draftForNew,
  draftValid,
  dtLocal,
  eventFromDraft,
  templateFromDraft,
} from "../domains/events/draft";
import { useEventsWrite } from "../domains/events/mutations";
import { useEvents, useTemplates } from "../domains/events/queries";
import { timingOf } from "../domains/events/selectors";
import { useOccurrencesWrite } from "../domains/occurrences/mutations";
import { rosterChange } from "../domains/occurrences/patches";
import { useCompletionsForRange } from "../domains/occurrences/queries";
import { defaultAttendees } from "../domains/people/selectors";
import { effectiveOccurrence } from "../services/recurrence/expand";
import { eventDate, eventStartMinutes } from "../services/recurrence/timing";
import type { CalendarEvent } from "../types";
import { EditorPageView } from "../views/EditorPage";
import { usePeopleWithColors } from "./peopleWithColors";

/**
 * The editor as a route: `/event/new` seeded from the query, `/event/:id`
 * for an existing series, optionally on one of its occurrences.
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
  const { navigate, back } = useNavigation();
  const { canGoBack } = useLocation();
  return () => {
    if (canGoBack) back();
    else navigate("/day/:date", { params: { date }, replace: true });
  };
}

export function NewEventRoute() {
  const { people, withColors, isPending } = usePeopleWithColors();
  const [q] = useQueryState({
    date: { type: "string", default: () => toISODate(new Date()) },
    for: { type: "string[]" },
    at: { type: "number" },
    end: { type: "number" },
    allDay: { type: "boolean" },
  });
  const close = useClose(q.date);

  // The default roster needs the people list; hold the form until it is in.
  if (isPending && !q.for) return <PageLoader />;

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
  );
}

export function EditEventRoute() {
  const { id } = useParams("/event/:id");
  const { accountId } = useAccount();
  const { withColors, isPending: peoplePending } = usePeopleWithColors();
  const { data: events, isPending } = useEvents(accountId);
  const [{ date }] = useQueryState({ date: { type: "string" } });
  const event = events?.find((e) => e.id === id);
  // Opened on an occurrence, the form seeds from that occurrence's override —
  // which lives in the windowed completions cache. Normally a warm hit: the
  // view that opened the editor fetched the same window.
  const { completions, isLoading: completionsLoading } = useCompletionsForRange(
    accountId,
    date ?? null,
  );
  const close = useClose(date ?? (event ? eventDate(event) : toISODate(new Date())));

  if (!event) {
    // The series is not in the cache yet (a deep link before the first
    // fetch), or it is gone: an unknown URL and a deleted event look alike.
    if (isPending) return <PageLoader />;
    notFound();
  }
  if (peoplePending || (date && completionsLoading)) return <PageLoader />;

  // The occurrence as it currently stands (override applied), re-anchored on
  // its own date so the form shows the right day and time even for a
  // far-future instance.
  const seed: CalendarEvent = date
    ? (() => {
        const eff = effectiveOccurrence(event, date, completions);
        return {
          ...eff,
          start: eff.allDay ? date : dtLocal(date, eventStartMinutes(eff)),
        };
      })()
    : event;

  return (
    <EditorSession
      key={`${event.id}:${date ?? ""}`}
      initial={draftForEvent(seed)}
      base={event}
      occurrenceDate={date}
      people={withColors}
      onClose={close}
    />
  );
}

/**
 * One editing session: holds the draft, decides what a save writes, and
 * composes the page. Keyed by what is being edited, so a different event is
 * a fresh draft.
 */
function EditorSession({
  initial,
  base,
  occurrenceDate,
  people,
  onClose,
}: {
  initial: EventDraft;
  /** The series being edited; absent for a new event. */
  base?: CalendarEvent;
  occurrenceDate?: string;
  people: Parameters<typeof EventForm>[0]["people"];
  onClose: () => void;
}) {
  const { accountId, userId } = useAccount();
  const { data: templates = [] } = useTemplates(accountId);
  const events = useEventsWrite();
  const occurrences = useOccurrencesWrite();
  const [draft, setDraft] = useState(initial);
  // Save-scope chooser for editing one occurrence of a recurring series.
  const [showScope, setShowScope] = useState(false);

  const isEdit = !!base;
  const isRecurringOccurrence = !!base?.recurrence && !!occurrenceDate;

  function saveSeries(event: Omit<CalendarEvent, "id">, isNew: boolean) {
    events.mutate({
      accountId,
      userId,
      change: {
        kind: "saveEvent",
        // A new event's id is minted here, so a second edit before the first
        // write lands still names a real row.
        event: { ...event, id: isNew ? uid() : base!.id },
        isNew,
      },
    });
  }

  function submit() {
    if (!draftValid(draft)) return;
    // Editing one occurrence of a recurring series: ask for the save scope first.
    if (isRecurringOccurrence) {
      setShowScope(true);
      return;
    }
    saveSeries(eventFromDraft(draft), !isEdit);
    onClose();
  }

  /** "This event only": the whole form, as a one-off override of that day. */
  function saveThisOccurrence() {
    const series = timingOf(base!);
    const date = occurrenceDate!;
    const event = eventFromDraft(draft);
    // The override's identity stays the original slot; `start` carries the
    // form's chosen day + time, so changing the day relocates just this
    // occurrence (it stays part of the series, rendered on the new day).
    occurrences.mutate({
      accountId,
      change: { kind: "override", series, date, start: event.start, duration: event.duration },
    });
    occurrences.mutate({
      accountId,
      change: { ...rosterChange(draft.attendees, base!.attendees), series, date },
    });
    onClose();
  }

  /** "All events": the series keeps its anchor day; only time and shape change. */
  function saveAllEvents() {
    const event = eventFromDraft(draft);
    const start = draft.allDay ? eventDate(base!) : `${eventDate(base!)}T${draft.startDT.slice(11)}`;
    saveSeries({ ...event, start }, false);
    onClose();
  }

  /** The current form as a reusable template; the event, if any, is untouched. */
  function saveAsTemplate() {
    if (!draft.title.trim()) return;
    events.mutate({
      accountId,
      userId,
      change: { kind: "saveTemplate", isNew: true, template: { ...templateFromDraft(draft), id: uid() } },
    });
  }

  return (
    <>
      <EditorPageView onCancel={onClose} onSubmit={submit} submitLabel="Save">
        <EditorPageView.Title>{isEdit ? "Edit event" : "New event"}</EditorPageView.Title>
        <EditorPageView.Body>
          <EventForm
            draft={draft}
            onChange={setDraft}
            isEdit={isEdit}
            seriesStart={base ? eventDate(base) : undefined}
            people={people}
            templates={isEdit ? [] : templates}
            onSaveAsTemplate={saveAsTemplate}
          />
        </EditorPageView.Body>
      </EditorPageView>

      <ScopeSheet
        open={showScope}
        onOpenChange={setShowScope}
        title="Save changes to…"
        choices={[
          {
            label: "This event only",
            detail: occurrenceDate ? isoLabel(occurrenceDate) : undefined,
            onSelect: saveThisOccurrence,
          },
          { label: "All events", detail: "The whole series", onSelect: saveAllEvents },
        ]}
      />
    </>
  );
}
