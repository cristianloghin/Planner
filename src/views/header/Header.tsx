import { type RoutePath, useLocation, useNavigation } from '@mikrostack/router'
import { createComponentWithSlots, getSlotProps, isSlotFilled } from '@mikrostack/rst'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from '../../assets/utils/cx'
import styles from './Header.module.css'

/** One thing the section can show, and where it lives. */
function Option({ to: _to, children: _children }: { to: RoutePath; children?: ReactNode }) {
  // Never rendered: the view reads `to` and the label off the slot and draws
  // the menu itself, so the choice and the title stay one thing.
  return null
}

/**
 * The bar across the top of a screen: something on the left, something on
 * the right, and in the middle either a title or a menu of `Option`s that
 * switches what the screen shows. The middle stays centred on the screen no
 * matter how wide the sides are, so a Cancel button and a Save button can sit
 * in the same bar as a plain section title.
 *
 * `className` is for what only the caller knows — a full-screen editor pads
 * for the notch; a section does not.
 */
export const Header = createComponentWithSlots({
  Left: {},
  'Center.Title': {},
  'Center.Option': { component: Option, multiple: true },
  Right: {},
}).render<{ className?: string }>(({ slots, className }) => {
  const { path } = useLocation()
  const { navigate } = useNavigation()
  const options = getSlotProps(slots['Center.Option'], (p) => ({ to: p.to, label: p.children }))

  // The option the URL is under; the first one stands in for the bare section.
  const current = options.find((o) => path === o.to || path.startsWith(`${o.to}/`)) ?? options[0]

  let center: ReactNode = null
  if (isSlotFilled(slots, 'Center.Title')) {
    center = <strong className={styles.title}>{slots['Center.Title']}</strong>
  } else if (options.length > 0) {
    center = (
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
  }

  // All three cells always render, so the middle is centred on the screen
  // even when only one side has anything in it.
  return (
    <header className={cx(styles.Header, className)}>
      <div className={styles.left}>{slots.Left}</div>
      <div className={styles.center}>{center}</div>
      <div className={styles.right}>{slots.Right}</div>
    </header>
  )
})
