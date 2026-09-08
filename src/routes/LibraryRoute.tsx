import { useNavigation } from "@mikrostack/router";
import type { ReactNode } from "react";
import { useAccount } from "../account";
import { TemplateList } from "../domains/events/components/TemplateList";
import { useEventsWrite } from "../domains/events/mutations";
import { useTemplates } from "../domains/events/queries";
import { reminderOffsets } from "../domains/events/selectors";
import { usePeople } from "../domains/people/queries";
import { attendeeLabelFor } from "../domains/people/selectors";
import { SectionView } from "../views/Section";

/**
 * The Library: the things you author and reuse — templates, and notes. The
 * section frame is this route's, with the title switching between the two;
 * what it shows is the matched child's, slotted in through the outlet.
 */
export function LibraryRoute({ outlet }: { outlet?: ReactNode }) {
  return (
    <SectionView>
      <SectionView.Option to="/library/templates">Templates</SectionView.Option>
      <SectionView.Option to="/library/notes">Notes</SectionView.Option>
      <SectionView.Body>{outlet}</SectionView.Body>
    </SectionView>
  );
}

/** Notes are not built yet; this holds their place in the switch. */
export function NotesRoute() {
  return <p>Notes will live here.</p>;
}

/** The saved templates: open one to edit it, delete one, or start a new one. */
export function TemplatesRoute() {
  const { navigate } = useNavigation();
  const { accountId, userId } = useAccount();
  const { data: people = [] } = usePeople(accountId);
  const { data: templates = [], isPending } = useTemplates(accountId);
  const events = useEventsWrite();

  const items = templates.map((t) => {
    const bits: string[] = [];
    if (t.attendees.length) bits.push(attendeeLabelFor(t.attendees)(people));
    const reminders = reminderOffsets(t).length;
    if (reminders) bits.push(`${reminders} reminder${reminders > 1 ? "s" : ""}`);
    return { id: t.id, title: t.title, meta: bits.join(" · ") };
  });

  return (
    <TemplateList
      items={items}
      loading={isPending}
      onOpen={(id) => navigate("/library/templates/:id", { params: { id } })}
      onNew={() => navigate("/library/templates/new")}
      onDelete={(id) =>
        events.mutate({ accountId, userId, change: { kind: "removeTemplate", id } })
      }
    />
  );
}
