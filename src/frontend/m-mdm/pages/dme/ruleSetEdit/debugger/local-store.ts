/**
 * 룰 세트 화면 개인 편의 저장소(3단계 계획 P10) — 중단점·조사식·최근 입력·최근 식·미니맵. 모든 읽기·쓰기를 try/catch 로 감싸
 * 저장소가 없거나(사설 창·미리보기) 던져도 기본값으로 동작한다(스펙 §2). 서버에 저장하지 않는다.
 */
export interface StoredInput { recordJson: string; evalTs: string }

export const storeKeys = {
  breakpoints: (setId: string) => `rsf:bp:${setId}`,
  watches: (setId: string) => `rsf:watch:${setId}`,
  recentInputs: (setId: string) => `rsf:recent:${setId}`,
  recentExprs: (setId: string) => `rsf:expr:${setId}`,
  miniMap: "rsf:minimap",
} as const;

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 꽉 찼거나 막혀 있다 — 개인 편의라 버린다.
  }
}

export function loadStrings(key: string): string[] {
  const v = read(key);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
export const saveStrings = (key: string, list: readonly string[]) => write(key, list);

export function loadInputs(key: string): StoredInput[] {
  const v = read(key);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is StoredInput => !!x && typeof x === "object" && typeof (x as StoredInput).recordJson === "string" && typeof (x as StoredInput).evalTs === "string")
    .map((x) => ({ recordJson: x.recordJson, evalTs: x.evalTs }));
}
export const saveInputs = (key: string, list: readonly StoredInput[]) => write(key, list);

export function loadFlag(key: string, fallback: boolean): boolean {
  const v = read(key);
  return typeof v === "boolean" ? v : fallback;
}
export const saveFlag = (key: string, value: boolean) => write(key, value);

export function pushRecent<T>(list: readonly T[], item: T, same: (a: T, b: T) => boolean, max: number): T[] {
  return [item, ...list.filter((x) => !same(x, item))].slice(0, max);
}
