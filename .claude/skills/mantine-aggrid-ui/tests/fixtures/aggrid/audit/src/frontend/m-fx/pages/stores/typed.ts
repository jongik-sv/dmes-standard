let current: PanelState;
export function usePanel() { return useSyncExternalStore(subscribe, () => current); }
const unknown = useSyncExternalStore(subscribe, nothingDefined);
