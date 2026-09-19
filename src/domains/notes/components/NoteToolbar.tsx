import { Toolbar } from '@mikrostack/notes'
import { ArrowDown, ArrowUp, CircleCheck, Heading, Pilcrow } from 'lucide-react'
import { IconButton } from '../../../assets/ui/IconButton'
import styles from './NoteToolbar.module.css'

/**
 * What can be done to the row the caret is on: make it a heading, an item or
 * a paragraph, or move it up and down. The library's toolbar derives which
 * of these apply and keeps a tap on the bar from taking the keyboard away;
 * this draws the buttons.
 */
export function NoteToolbar() {
  return (
    <Toolbar className={styles.NoteToolbar}>
      {({ activeRow, canMoveUp, canMoveDown, setRowType, moveRow }) => (
        <>
          <div className={styles.group} role="group" aria-label="Row type">
            <IconButton
              label="Heading"
              icon={Heading}
              small
              active={activeRow?.type === 'header'}
              disabled={!activeRow}
              onClick={() => setRowType('header')}
            />
            <IconButton
              label="Checklist item"
              icon={CircleCheck}
              small
              active={activeRow?.type === 'item'}
              disabled={!activeRow}
              onClick={() => setRowType('item')}
            />
            <IconButton
              label="Paragraph"
              icon={Pilcrow}
              small
              active={activeRow?.type === 'text'}
              disabled={!activeRow}
              onClick={() => setRowType('text')}
            />
          </div>
          <div className={styles.group}>
            <IconButton
              label="Move row up"
              icon={ArrowUp}
              small
              disabled={!canMoveUp}
              onClick={() => moveRow(-1)}
            />
            <IconButton
              label="Move row down"
              icon={ArrowDown}
              small
              disabled={!canMoveDown}
              onClick={() => moveRow(1)}
            />
          </div>
        </>
      )}
    </Toolbar>
  )
}
