let state: S = { a: 1 };
function g() { return state; }
const x = useSyncExternalStore(sub, g);
