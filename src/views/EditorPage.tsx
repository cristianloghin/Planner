import { createComponentWithSlots } from "@mikrostack/rst";
import type { FormEvent, ReactNode } from "react";
import shared from "../assets/styles/shared.module.css";

import styles from "./EditorPage.module.css";

/**
 * A full-page editor: a fixed toolbar of actions — Cancel, a short static
 * title, whatever the route adds, and the primary action — over a scrolling
 * body. With `onSubmit` the page is a form and the primary action submits it;
 * without, it is a plain page (a sheet that saves as it goes).
 */
export const EditorPageView = createComponentWithSlots({
  Title: { isRequired: true },
  Actions: {},
  Body: { isRequired: true },
}).render<{
  onCancel: () => void;
  cancelLabel?: string;
  onSubmit?: () => void;
  /** Label of the primary action; none means no primary action. */
  submitLabel?: string;
}>(({ slots, onCancel, cancelLabel = "Cancel", onSubmit, submitLabel }) => {
  const content: ReactNode = (
    <>
      <header className={styles.head}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          {cancelLabel}
        </button>
        <strong className={styles.title}>{slots.Title}</strong>
        <div className={styles.actions}>
          {slots.Actions}
          {submitLabel && (
            <button
              type={onSubmit ? "submit" : "button"}
              className={shared.primary}
              onClick={onSubmit ? undefined : onCancel}
            >
              {submitLabel}
            </button>
          )}
        </div>
      </header>
      <div className={styles.body}>{slots.Body}</div>
    </>
  );

  if (onSubmit) {
    return (
      <form
        className={styles.EditorPage}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {content}
      </form>
    );
  }
  return <div className={styles.EditorPage}>{content}</div>;
});
