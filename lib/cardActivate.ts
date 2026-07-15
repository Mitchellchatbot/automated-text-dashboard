import type { KeyboardEvent } from "react";

/**
 * Spread onto a non-button element (a card `div`) to make it an accessible,
 * keyboard-operable button: click, Enter/Space, focusable, with the button role.
 * Avoids native `<button>` chrome resets while still passing a11y lint.
 */
export function cardActivate(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}
