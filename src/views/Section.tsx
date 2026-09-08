import { createComponentWithSlots, getSlotProps } from "@mikrostack/rst";
import { type RoutePath, useLocation, useNavigation } from "@mikrostack/router";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";

import styles from "./Section.module.css";

/** One thing the section can show, and where it lives. */
function Option({ to: _to, children: _children }: { to: RoutePath; children?: ReactNode }) {
  // Never rendered: the view reads `to` and the label off the slot and draws
  // the menu itself, so the choice and the title stay one thing.
  return null;
}

/**
 * A plain screen whose title is a dropdown: it names what the body shows and
 * opens to the other things the section can show. Routes list the choices as
 * `Option`s and drop the matched child's content, or their own, in the body.
 */
export const SectionView = createComponentWithSlots({
  Option: { component: Option, multiple: true },
  Body: { isRequired: true },
}).render(({ slots }) => {
  const { path } = useLocation();
  const { navigate } = useNavigation();
  const options = getSlotProps(slots.Option, (p) => ({ to: p.to, label: p.children }));
  // The option the URL is under; the first one stands in for the bare section.
  const current =
    options.find((o) => path === o.to || path.startsWith(`${o.to}/`)) ?? options[0];

  return (
    <section className={styles.Section}>
      <div className={styles.head}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.trigger} aria-label="Show">
            {current?.label}
            <ChevronDown size={18} className={styles.chevron} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="center" sideOffset={6}>
              <DropdownMenu.RadioGroup
                value={current?.to}
                onValueChange={(to) => navigate(to)}
              >
                {options.map((o) => (
                  <DropdownMenu.RadioItem key={o.to} value={o.to} className={styles.item}>
                    {o.label}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className={styles.body}>{slots.Body}</div>
    </section>
  );
});
