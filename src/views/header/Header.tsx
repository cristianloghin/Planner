import { type RoutePath, useLocation, useNavigation } from '@mikrostack/router'
import { createComponentWithSlots, getSlotProps, isSlotFilled } from '@mikrostack/rst'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { ReactNode } from 'react'
import styles from './Header.module.css'

/** One thing the section can show, and where it lives. */
function Option({
  to: _to,
  children: _children,
}: {
  to: RoutePath
  children?: ReactNode
}) {
  // Never rendered: the view reads `to` and the label off the slot and draws
  // the menu itself, so the choice and the title stay one thing.
  return null
}

export const Header = createComponentWithSlots({
  Left: {},
  'Center.Title': {},
  'Center.Option': { component: Option, multiple: true },
  Right: {},
}).render(({ slots }) => {
  const { path } = useLocation()
  const { navigate } = useNavigation()
  const options = getSlotProps(slots['Center.Option'], (p) => ({
    to: p.to,
    label: p.children,
  }))

  // The option the URL is under; the first one stands in for the bare section.
  const current = options.find((o) => path === o.to || path.startsWith(`${o.to}/`)) ?? options[0]

  const isTitle = isSlotFilled(slots, 'Center.Title')

  const centerSlot = isTitle ? (
    <strong className={styles.title}>{slots['Center.Title']}</strong>
  ) : (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Show">
        {current?.label}
        <ChevronDown size={18} className={styles.chevron} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="center" sideOffset={6}>
          <DropdownMenu.RadioGroup value={current?.to} onValueChange={(to) => navigate(to)}>
            {options.map((o) => (
              <DropdownMenu.RadioItem key={o.to} value={o.to} className={styles.item}>
                {o.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )

  return (
    <header className={styles.head}>
      {isSlotFilled(slots, 'Left') && <div className={styles.LeftSlot}>{slots.Left}</div>}
      <div className={styles.CenterSlot}>{centerSlot}</div>
      {isSlotFilled(slots, 'Right') && <div className={styles.RightSlot}>{slots.Right}</div>}
    </header>
  )
})
