/** Join truthy class names. `cx(s.tab, active && s.active)` → "tab_x active_y". */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
