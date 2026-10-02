/**
 * 마크다운 편집 방식(서식·MD) 보는 사람 설정 — 저장 키(`modeStorageKey`)마다 localStorage 에 JSON 문자열(`"markdown"`)로 남긴다.
 * 같은 키를 쓰는 편집기끼리 같은 값을 본다(한 곳에서 바꾸면 다른 곳도 바로 바뀐다). 다른 탭에서 바꾼 값은 `storage` 이벤트로 따라간다.
 * 저장소가 없거나 막혀 있으면(사설 창·미리보기 등) 이 탭 안에서만 메모리 값으로 기억한다. 모든 읽기·쓰기는 try/catch 로 감싼다.
 */
import { useCallback, useSyncExternalStore } from "react";

/** 편집 방식 — 서식(WYSIWYG, Tiptap) 또는 마크다운 원문. */
export type MarkdownEditMode = "wysiwyg" | "markdown";

/** 화면이 키를 넘기지 않을 때 쓰는 저장 키. */
export const DEFAULT_MODE_STORAGE_KEY = "cm-md:editMode";

const DEFAULT_MODE: MarkdownEditMode = "wysiwyg";

const listeners = new Map<string, Set<() => void>>();
/** 저장소에 쓰지 못한 키의 값(쓰기에 성공하면 지운다). */
const memory = new Map<string, MarkdownEditMode>();

const isMode = (v: unknown): v is MarkdownEditMode => v === "wysiwyg" || v === "markdown";

function read(key: string): MarkdownEditMode | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw == null) return undefined;
    const v: unknown = JSON.parse(raw);
    return isMode(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, mode: MarkdownEditMode): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(mode));
    return read(key) === mode;
  } catch {
    return false;
  }
}

function notify(key: string) {
  for (const l of Array.from(listeners.get(key) ?? [])) l();
}

/** 지금 편집 방식. 저장소에 쓰지 못한 값이 있으면 그 값, 아니면 저장 값, 없으면 서식. */
export function getEditMode(key: string = DEFAULT_MODE_STORAGE_KEY): MarkdownEditMode {
  return memory.get(key) ?? read(key) ?? DEFAULT_MODE;
}

/** 편집 방식을 바꾸고 같은 키를 보는 편집기에 알린다. */
export function setEditMode(mode: MarkdownEditMode, key: string = DEFAULT_MODE_STORAGE_KEY): void {
  if (write(key, mode)) memory.delete(key);
  else memory.set(key, mode);
  notify(key);
}

function onStorage(e: StorageEvent) {
  // key 가 null 이면 저장소를 통째로 비웠다 — 모든 키에 알린다.
  if (e.key == null) for (const k of Array.from(listeners.keys())) notify(k);
  else if (listeners.has(e.key)) notify(e.key);
}

function subscribe(key: string, listener: () => void): () => void {
  if (listeners.size === 0) globalThis.addEventListener?.("storage", onStorage);
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
    if (listeners.size === 0) globalThis.removeEventListener?.("storage", onStorage);
  };
}

/** [지금 모드, 바꾸기]. 서버 그리기에서는 기본 서식. */
export function useMarkdownEditMode(
  key: string = DEFAULT_MODE_STORAGE_KEY
): [MarkdownEditMode, (mode: MarkdownEditMode) => void] {
  const sub = useCallback((l: () => void) => subscribe(key, l), [key]);
  const get = useCallback(() => getEditMode(key), [key]);
  const mode = useSyncExternalStore(sub, get, () => DEFAULT_MODE);
  const set = useCallback((m: MarkdownEditMode) => setEditMode(m, key), [key]);
  return [mode, set];
}
