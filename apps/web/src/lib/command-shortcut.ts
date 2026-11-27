/**
 * Keyboard helpers for the Command Center.
 *
 * `mod` is Command on Apple platforms and Control elsewhere. A web page cannot
 * rely on the Windows key: Windows intercepts it to open Start, and Linux
 * window managers often claim Super before the keydown reaches the page. The
 * platform's Control/Command chord is the equivalent users can actually press.
 */

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Label for the Command Center chord, matching the platform modifier. */
export function commandShortcutLabel(): string {
  return isApplePlatform() ? "⌘K" : "Ctrl K";
}

/**
 * True when a key event targets a text-entry surface. `mod+Enter` opens the
 * Command Center only outside these, so it never submits the Assistant
 * composer or advances a form step while the user meant to open the Command
 * Center.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only'], [role='textbox']",
    ) !== null
  );
}

/**
 * The platform chord shared by both shortcuts: no Alt/Shift/composition, with
 * Command on Apple and Control elsewhere. On non-Apple platforms Meta is
 * accepted too, so a Super keydown reaching the page also works when the
 * window manager allows it.
 */
function isCommandChord(event: KeyboardEvent): boolean {
  if (event.isComposing || event.altKey || event.shiftKey) return false;

  return isApplePlatform() ? event.metaKey : event.ctrlKey || event.metaKey;
}

/** True for a plain `mod+K` keydown. */
export function isCommandCenterKey(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === "k" && isCommandChord(event);
}

/**
 * True for the requested `mod+Enter` alias, but only outside text-entry
 * surfaces. See `isEditableTarget` for why that guard exists.
 */
export function isCommandCenterEnterKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !isEditableTarget(event.target) && isCommandChord(event);
}
