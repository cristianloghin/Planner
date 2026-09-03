# Archive

Documents that described the app as it used to be, or plans that are finished.
Kept because the *reasoning* in them is sometimes still worth reading; not kept
current, and **not to be trusted as a description of the code**.

Anything still true was carried into [`../DEV.md`](../DEV.md).

| File | What it was | Why it is here |
|---|---|---|
| `CLEANUP_PLAN.md` | The plan for the strip-down | Done. Every section landed; see the git history from `7208641` to `f77a4a3`. |
| `DATA_MODEL.md` | The Phase-2 schema and its 13 decisions | Eight of the decisions describe features that no longer exist (lists, checklists, notes, dependencies, completion, the series split, private lists). Decisions 1, 4, 9 and 10 survived and are in `DEV.md`; 12 (shares & pins) moved there as unbuilt design. |
| `STATUS.md` | What was built, plus the client gotchas | The gotchas that still apply are in `DEV.md`. Its two "easy to break" rules are both void: `COUNT` is now how a series ends, and `split_series` is gone. |
| `PUSH_NOTIFICATIONS.md` | Web Push setup runbook | Folded into `DEV.md`. Still accurate on the parts that survive — VAPID keys, `CRON_SECRET`, the scheduler — but it also documents delivery paths that changed. |
| `PLANNED.md` | Designed but not built | Private lists died with Lists. Shares & pins and the RLS-granularity note moved to `DEV.md`. Its architecture note describes `AppState` / the reducer / `SupabaseStore`, all three of which were deleted. |
| `RESTRUCTURE_PLAN.md` | Applying the DRSp pattern to this codebase | Largely done: `client/`, `domains/`, `services/`, `assets/` and real routes all landed. What is left is a short section in `DEV.md`. The pattern itself lives in [`../ARCHITECTURE.md`](../ARCHITECTURE.md). |

`NOTE_MODEL.md` is **not** here. It is a design for work that has not started,
and it is deliberately unaffected by the note *attachments* that were removed —
removing those cleared the ground for it.
