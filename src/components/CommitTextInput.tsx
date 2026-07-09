import { useEffect, useRef, useState } from 'react'

/**
 * A controlled-from-the-store text input that keeps keystrokes local and
 * commits on a short debounce + on blur. Writing through the store per
 * keystroke means one network write (and one realtime echo) per character —
 * and a reload landing mid-word snaps the field back, eating input.
 */
export function CommitTextInput({
  value,
  onCommit,
  delay = 400,
  ...rest
}: {
  value: string
  onCommit: (next: string) => void
  delay?: number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Adopt external updates (partner edits, reloads) only while not focused, so
  // they can't clobber what's being typed.
  useEffect(() => {
    if (document.activeElement !== ref.current) setLocal(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <input
      {...rest}
      ref={ref}
      value={local}
      onChange={(e) => {
        const next = e.target.value
        setLocal(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onCommit(next), delay)
      }}
      onBlur={() => {
        clearTimeout(timer.current)
        if (local !== value) onCommit(local)
      }}
    />
  )
}
