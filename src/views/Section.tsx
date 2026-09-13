import { createComponentWithSlots } from '@mikrostack/rst'

import styles from './Section.module.css'
import { Header } from './header/Header'

/**
 * A plain screen: a fixed head over a scrolling body. With `Option`s the
 * title is a dropdown — it names what the body shows and opens to the other
 * things the section can show; with a `Title` alone it is just the title.
 * Routes drop the matched child's content, or their own, in the body.
 */
export const SectionView = createComponentWithSlots({
  Header: { component: Header },
  Body: { isRequired: true },
}).render(({ slots }) => {
  return (
    <section className={styles.Section}>
      {slots.Header}
      <div className={styles.body}>{slots.Body}</div>
    </section>
  )
})
