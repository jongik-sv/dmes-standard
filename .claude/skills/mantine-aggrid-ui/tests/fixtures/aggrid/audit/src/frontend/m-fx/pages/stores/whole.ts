// P-R16: 상태 객체 전체만 구독
let state: ThemeState = { dark: false, size: 1 };
const listeners = new Set<() => void>();
function getState() { return state; }
export function useTheme() {
  return useSyncExternalStore(subscribe, getState);
}
export function useThemeAgain() {
  return useSyncExternalStore(subscribe, () => state);
}
