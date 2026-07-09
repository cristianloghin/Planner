import {
  ListChecks,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import s from "./App.module.css";
import { useAuth } from "./auth";
import { AlertHost } from "./components/AlertHost";
import { DayView } from "./components/DayView";
import { Lists } from "./components/Lists";
import { Login } from "./components/Login";
import { MonthView } from "./components/MonthView";
import { Settings } from "./components/Settings";
import { PageLoader } from "./components/Spinner";
import { WeekCalendar } from "./components/WeekCalendar";
import { useTemplatesRealtime } from "./data/templates";
import { cx } from "./lib/cx";
import { mondayOf, weekdayIndex } from "./lib/dates";
import { AppProvider, useApp } from "./state";

type Tab = "day" | "calendar" | "month" | "lists" | "settings";

const TABS: { id: Tab; label: string; icon?: LucideIcon }[] = [
  { id: "lists", label: "Lists", icon: ListChecks },
  { id: "day", label: "Day" },
  { id: "calendar", label: "Week" },
  { id: "month", label: "Month" },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/**
 * Auth gate. Decides what to mount: a spinner while the session resolves, the
 * login screen when signed out, and the data layer + app only once signed in.
 * The data store (AppProvider) is mounted *inside* the authed branch so it never
 * loads for a signed-out user.
 */
export function Root() {
  const { session, accountId, loading } = useAuth();

  // Spinner while the session resolves, or while the account bootstraps (the
  // store is built from accountId, so wait for it before mounting the data layer).
  if (loading || (session && !accountId)) {
    return (
      <div className={s.app}>
        <PageLoader />
      </div>
    );
  }

  if (!session) {
    return (
      <div className={s.app}>
        <Login />
      </div>
    );
  }

  return (
    // Key the data layer by account: the store captures accountId at mount, so
    // if it ever changes (account switch, delayed bootstrap race) the provider
    // must remount with a fresh store rather than keep writing to the old one.
    <AppProvider key={accountId}>
      <App />
    </AppProvider>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("day");
  const { dispatch } = useApp();

  // Keep the (Query-owned) templates cache fresh on a partner's change.
  useTemplatesRealtime();

  function openDay(iso: string) {
    dispatch({
      type: "setWeek",
      weekStart: mondayOf(new Date(iso + "T00:00:00")),
    });
    dispatch({ type: "setDay", day: weekdayIndex(iso) });
    setTab("day");
  }

  return (
    <div className={s.app}>
      <AlertHost />

      <main className={s.appMain}>
        {tab === "day" && <DayView />}
        {tab === "calendar" && <WeekCalendar />}
        {tab === "month" && <MonthView onOpenDay={openDay} />}
        {tab === "lists" && <Lists />}
        {tab === "settings" && <Settings />}
      </main>

      <nav className={s.tabbar}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={cx(s.tab, t.id === tab && s.active)}
            onClick={() => setTab(t.id)}
            aria-label={t.label}
          >
            {t.icon ? <t.icon size={20} /> : t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
