let state: ThemeState = { dark: false };
function getState() { return state; }
export function useTheme() { return useSyncExternalStore(subscribe, getState); }
export function useDark() { return useSyncExternalStore(subscribe, () => state.dark); }
