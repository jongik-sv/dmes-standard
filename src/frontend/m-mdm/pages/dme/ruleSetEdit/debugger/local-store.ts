/**
 * 룰 세트 화면 개인 편의 저장소(3단계 계획 P10) — 중단점·조사식·최근 입력·최근 식·미니맵·자동 저장 켜짐·메모 편집 방식. 모든 읽기·쓰기를 try/catch 로 감싸
 * 저장소가 없거나(사설 창·미리보기) 던져도 기본값으로 동작한다(스펙 §2). 서버에 저장하지 않는다.
 */
import type { VarDisplay } from "../types";

export interface StoredInput { recordJson: string; evalTs: string }

export const storeKeys = {
  breakpoints: (setId: string) => `rsf:bp:${setId}`,
  watches: (setId: string) => `rsf:watch:${setId}`,
  recentInputs: (setId: string) => `rsf:recent:${setId}`,
  recentExprs: (setId: string) => `rsf:expr:${setId}`,
  miniMap: "rsf:minimap",
  varDisplay: "rsf:varDisplay",
  /** 편집 모드 [자동 저장] 켜짐(세트와 무관한 보는 사람 설정, 기본 꺼짐). */
  autoSave: "rsf:autoSave",
  /** 메모 편집 방식(서식 wysiwyg · 원문 markdown) 저장 키 — shared MarkdownEditor·MarkdownField 의 modeStorageKey 로 넘긴다
   *  (읽기·쓰기는 shared 가 한다). 캔버스·패널이 같은 키라 같이 바뀐다. 값을 잃지 않게 키를 바꾸지 않는다. */
  noteEditMode: "rsf:noteEditMode",
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

/** [변수 흐름] 마지막 선택. 저장된 값이 세 값이 아니면 off. */
export function loadVarDisplay(): VarDisplay {
  const v = read(storeKeys.varDisplay);
  return v === "id" || v === "name" ? v : "off";
}
export const saveVarDisplay = (value: VarDisplay) => write(storeKeys.varDisplay, value);

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
