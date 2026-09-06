import {
  notFound,
  useLocation,
  useNavigation,
  useParams,
  useQueryState,
} from "@mikrostack/router";
import { useAccount } from "../account";
import { PageLoader } from "../assets/ui/Spinner";
import { toISODate } from "../assets/utils/dates";
import { EventEditor } from "../components/EventEditor";
import { useEvents } from "../domains/events/queries";
import { usePeople } from "../domains/people/queries";
import { defaultAttendees } from "../domains/people/selectors";
import { eventDate } from "../services/recurrence/timing";
import type { PersonId } from "../types";

/**
 * The editor as a route: `/event/new` seeded from the query, `/event/:id`
 * for an existing series, optionally on one of its occurrences.
 *
 * Both are full-page and close by going *back* — to the calendar screen that
 * opened them, at the date it was on — or, when there is nothing to go back
 * to (a deep link, a reload), to the day the editor is about.
 */

/** URL for a new event: the day, who is on it, and optionally its time. */
export function newEventPath(seed: {
  date: string;
  attendees: PersonId[];
  startMin?: number;
  endMin?: number;
  allDay?: boolean;
}): string {
  const q = new URLSearchParams({ date: seed.date });
  for (const id of seed.attendees) q.append("for", id);
  if (seed.startMin != null) q.set("at", String(seed.startMin));
  if (seed.endMin != null) q.set("end", String(seed.endMin));
  if (seed.allDay) q.set("allDay", "true");
  return `/event/new?${q}`;
}

/** URL for editing a series, from one of its occurrences when `date` is given. */
export function editEventPath(id: string, date?: string): string {
  const q = date ? `?${new URLSearchParams({ date })}` : "";
  return `/event/${encodeURIComponent(id)}${q}`;
}

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
  const { accountId } = useAccount();
  const { data: people = [] } = usePeople(accountId);
  const [q] = useQueryState({
    date: { type: "string", default: () => toISODate(new Date()) },
    for: { type: "string[]" },
    at: { type: "number" },
    end: { type: "number" },
    allDay: { type: "boolean" },
  });
  const close = useClose(q.date);

  return (
    <EventEditor
      target={{
        mode: "new",
        date: q.date,
        attendees: q.for ?? defaultAttendees(people),
        ...(q.at != null ? { startMin: q.at } : {}),
        ...(q.end != null ? { endMin: q.end } : {}),
        ...(q.allDay ? { allDay: true } : {}),
      }}
      onClose={close}
    />
  );
}

export function EditEventRoute() {
  const { id } = useParams("/event/:id");
  const { accountId } = useAccount();
  const { data: events, isPending } = useEvents(accountId);
  const [{ date }] = useQueryState({ date: { type: "string" } });
  const event = events?.find((e) => e.id === id);
  const close = useClose(date ?? (event ? eventDate(event) : toISODate(new Date())));

  if (!event) {
    // The series is not in the cache yet (a deep link before the first
    // fetch), or it is gone: an unknown URL and a deleted event look alike.
    if (isPending) return <PageLoader />;
    notFound();
  }

  return (
    <EventEditor
      target={{ mode: "edit", event, ...(date ? { occurrenceDate: date } : {}) }}
      onClose={close}
    />
  );
}
