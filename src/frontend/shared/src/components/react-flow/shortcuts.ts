/**
 * 캔버스 단축키 판정(룰 세트 편집기 canvas/shortcuts.ts 를 일반화한 복사본). 캔버스에 초점이 있을 때 화면이 onKeyDown 에서 한 번 부른다.
 * 입력 칸이면 무시하고, 묶음 표에 있고 손잡이가 있는 키만 preventDefault·stopPropagation 한다(나머지는 브라우저·포털 동작 그대로).
 * 키 표는 화면이 정한다 — 공통 키는 CANVAS_SHORTCUTS, 화면 전용 키는 그 뒤에 잇는다. 앞에 있는 묶음이 먼저 맞는다.
 */

/** `code` 는 물리 키(Mac Option+글자는 e.key 가 'å' 처럼 바뀌므로 Alt 조합은 code 로 판정한다). */
export interface KeyLike { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: EventTarget | null }
/** 핸들러가 할 일이 없어 키를 쓰지 않았다는 표시 — 디스패처가 막지 않고 브라우저 기본 동작에 맡긴다. */
export const UNHANDLED = Symbol("shortcut-unhandled");
export type ShortcutHandlers<Id extends string> = Partial<Record<Id, () => unknown>>;

/** 키 묶음 하나. `key`(한 글자면 소문자) 또는 `code`(물리 키) 가운데 하나로 맞춘다. 수정키는 적은 것과 정확히 같아야 한다. */
export interface ShortcutBinding<Id extends string> {
  id: Id;
  key?: string;
  /** Alt 조합과 Shift+숫자처럼 자판마다 e.key 가 바뀌는 키. */
  code?: string;
  /** 플랫폼 수정키(Win·Linux Ctrl, Mac Cmd). */
  mod?: boolean;
  shift?: boolean;
  /** Alt(⌥) 조합 — code 로만 맞춘다. Ctrl·Meta 가 같이 눌리면(AltGr) 맞추지 않는다. */
  alt?: boolean;
}

/** 도움말 표 한 줄 — 모드 형식은 화면이 정한다. */
export interface ShortcutHelpRow<Id extends string, Mode extends string> { id: Id; win: string; mac: string; label: string; modes: readonly Mode[] }

export type CanvasShortcutId = "undo" | "redo" | "delete" | "escape" | "copy" | "paste" | "duplicate" | "find" | "fitView" | "fitSelection";
/** 캔버스 공통 키(룰 세트 편집기와 같다). Shift+1·Shift+2 는 물리 키로 본다(자판마다 e.key 가 '!'·'@' 로 다르다). */
export const CANVAS_SHORTCUTS: readonly ShortcutBinding<CanvasShortcutId>[] = [
  { id: "undo", key: "z", mod: true },
  { id: "redo", key: "z", mod: true, shift: true },
  { id: "redo", key: "y", mod: true },
  { id: "copy", key: "c", mod: true },
  { id: "paste", key: "v", mod: true },
  { id: "duplicate", key: "d", mod: true },
  { id: "find", key: "f", mod: true },
  { id: "fitView", code: "Digit1", shift: true },
  { id: "fitSelection", code: "Digit2", shift: true },
  { id: "delete", key: "Delete" },
  { id: "delete", key: "Backspace" },
  { id: "escape", key: "Escape" },
  { id: "escape", key: "Escape", shift: true }, // 원본과 같이 Shift 와 무관하게 Esc
];

export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad/i.test(nav.platform ?? "") || /Macintosh|Mac OS X/i.test(nav.userAgent ?? "");
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.getAttribute?.("contenteditable") === "true";
}

/** 요소가 화면에 보이는지 — 조상 중 display:none 이 있으면(포털이 고르지 않은 탭을 숨긴 경우) 보이지 않는다. */
export function isShown(el: HTMLElement | null | undefined): boolean {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return el.offsetParent !== null;
}

export function shortcutOf<Id extends string>(e: KeyLike, mac: boolean, bindings: readonly ShortcutBinding<Id>[]): Id | null {
  if (isTypingTarget(e.target)) return null;
  if (e.altKey) {
    if (e.ctrlKey || e.metaKey || !e.code) return null; // Windows 의 AltGr 은 Ctrl+Alt
    for (const b of bindings) if (b.alt && b.code === e.code && !!b.shift === e.shiftKey) return b.id;
    return null;
  }
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod && (e.ctrlKey || e.metaKey)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (const b of bindings) {
    if (b.alt || !!b.mod !== mod || !!b.shift !== e.shiftKey) continue;
    if (b.code !== undefined ? b.code === e.code : b.key === key) return b.id;
  }
  return null;
}

export function dispatchShortcut<Id extends string>(
  e: KeyLike & { preventDefault(): void; stopPropagation(): void },
  handlers: ShortcutHandlers<Id>,
  mac: boolean,
  bindings: readonly ShortcutBinding<Id>[],
): boolean {
  const id = shortcutOf(e, mac, bindings);
  const run = id ? handlers[id] : undefined;
  if (!run) return false;
  if (run() === UNHANDLED) return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
}
