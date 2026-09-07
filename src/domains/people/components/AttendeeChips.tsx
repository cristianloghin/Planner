import { type ColorKey, colorVar } from "../../../assets/palette";
import shared from "../../../assets/styles/shared.module.css";
import { cx } from "../../../assets/utils/cx";
import type { Person, PersonId } from "../types";

/**
 * Toggle chips for choosing who is on an event. Always keeps at least one.
 * Takes the people already in lane order with their colours resolved.
 */
export function AttendeeChips({
  people,
  value,
  onChange,
}: {
  people: { person: Person; color: ColorKey }[];
  value: PersonId[];
  onChange: (next: PersonId[]) => void;
}) {
  function toggle(id: PersonId) {
    const has = value.includes(id);
    let next = has ? value.filter((x) => x !== id) : [...value, id];
    if (next.length === 0) next = [id];
    onChange(next);
  }

  return (
    <div className={shared.chips}>
      {people.map(({ person, color }) => {
        const on = value.includes(person.id);
        const c = colorVar(color);
        return (
          <button
            type="button"
            key={person.id}
            className={cx(shared.chip, on && shared.on)}
            style={on ? { background: c, borderColor: c } : { borderColor: c, color: c }}
            onClick={() => toggle(person.id)}
          >
            {person.name}
          </button>
        );
      })}
    </div>
  );
}
