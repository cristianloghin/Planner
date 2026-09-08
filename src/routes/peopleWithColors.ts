import { useMemo } from "react";
import { useAccount } from "../account";
import { usePeople } from "../domains/people/queries";
import { personColorMap } from "../domains/people/selectors";
import { usePreferences } from "../domains/preferences/queries";
import { personColors } from "../domains/preferences/selectors";

/** Everyone with their colour resolved, for chips and colour defaults. */
export function usePeopleWithColors() {
  const { accountId, userId } = useAccount();
  const { data: people = [], isPending } = usePeople(accountId);
  const { data: overrides = {} } = usePreferences(accountId, userId, personColors);
  const withColors = useMemo(() => {
    const colors = personColorMap(people, overrides);
    return people.map((person) => ({ person, color: colors[person.id] }));
  }, [people, overrides]);
  return { people, withColors, isPending };
}
