import { useEffect, type ReactNode } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import s from "./Search.module.css";

/**
 * Presentational shell for a search surface: a full-screen overlay with a search
 * input and a scrolling results area. Callers own the query state and render the
 * results (or empty/error copy) as children, so the same shell drives both the
 * event and list searches.
 */
export function SearchOverlay({
  placeholder,
  query,
  onQueryChange,
  onClose,
  loading,
  children,
}: {
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  // Close on Escape from anywhere in the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Search">
      <div className={s.bar}>
        <SearchIcon size={18} className={s.barIcon} />
        <input
          autoFocus
          className={s.input}
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button className={s.close} onClick={onClose} aria-label="Close search">
          <X size={20} />
        </button>
      </div>
      <div className={s.results}>
        {loading && <p className={s.hint}>Searching…</p>}
        {children}
      </div>
    </div>
  );
}
