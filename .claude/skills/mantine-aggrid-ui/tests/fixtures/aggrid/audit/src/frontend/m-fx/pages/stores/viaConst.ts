const store = { count: 0 };
let snapshot = { n: 1 };
const getSnap = (): Snap => snapshot;
export const useAll = () => useSyncExternalStore(sub, getSnap);
function getOther() { return snapshot }
export function useOther() { return useSyncExternalStore(sub, getOther); }
