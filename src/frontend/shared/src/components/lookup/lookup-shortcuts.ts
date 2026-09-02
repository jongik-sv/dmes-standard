export interface LookupPopupShortcutEvent {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface LookupPopupShortcutOptions {
  disabled?: boolean;
  hasOpenPopup?: boolean;
}

export function shouldOpenLookupPopupFromKey(
  event: LookupPopupShortcutEvent,
  { disabled = false, hasOpenPopup = true }: LookupPopupShortcutOptions = {}
) {
  return (
    event.key === "F4" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    hasOpenPopup &&
    !disabled
  );
}
