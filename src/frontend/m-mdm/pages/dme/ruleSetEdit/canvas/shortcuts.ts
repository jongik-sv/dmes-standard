/**
 * 캔버스 단축키 디스패처(3단계 계획 P3) — 캔버스에 초점이 있을 때 page 가 onKeyDown 에서 한 번 부른다. 입력 칸이면 무시하고,
 * 그 모드에 손잡이가 있는 키만 preventDefault·stopPropagation 한다(나머지는 브라우저·포털 동작 그대로, 스펙 §2).
 */
import type { FlowMode } from "../state/useRuleSetEdit";

export type ShortcutId =
  | "undo" | "redo" | "delete" | "escape" | "copy" | "paste" | "duplicate" | "find"
  | "continue" | "step" | "stepBack" | "breakpoint";
export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: EventTarget | null }
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad/i.test(nav.platform ?? "") || /Macintosh|Mac OS X/i.test(nav.userAgent ?? "");
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.getAttribute?.("contenteditable") === "true";
}

export function shortcutOf(e: KeyLike, mac: boolean): ShortcutId | null {
  if (e.altKey || isTypingTarget(e.target)) return null;
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const anyMod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (key === "z") return e.shiftKey ? "redo" : "undo";
    if (e.shiftKey) return null;
    if (key === "y") return "redo";
    if (key === "c") return "copy";
    if (key === "v") return "paste";
    if (key === "d") return "duplicate";
    if (key === "f") return "find";
    return null;
  }
  if (anyMod) return null;
  if (key === "Delete" || key === "Backspace") return e.shiftKey ? null : "delete";
  if (key === "Escape") return "escape";
  if (key === "F5") return e.shiftKey ? null : "continue";
  if (key === "F10") return e.shiftKey ? "stepBack" : "step";
  if (key === "F9") return e.shiftKey ? null : "breakpoint";
  return null;
}

export function dispatchShortcut(
  e: KeyLike & { preventDefault(): void; stopPropagation(): void },
  handlers: ShortcutHandlers,
  mac: boolean,
): boolean {
  const id = shortcutOf(e, mac);
  const run = id ? handlers[id] : undefined;
  if (!run) return false;
  e.preventDefault();
  e.stopPropagation();
  run();
  return true;
}

/**
 * 도움말 표에만 있는 포인터 조작(S1) — 키 디스패처가 받지 않는다. 영역 선택·화면 이동·확대는 React Flow 내장 처리(props)이고,
 * Alt+끌기 공간 넓히기는 캔버스가 포인터 이벤트의 altKey 로 본다(새 keydown 처리 없음).
 */
export type GestureId = "boxSelect" | "spaceDrag" | "pan" | "zoom";

/** 도움말 표(툴바 [?], Task 8 이 그린다). */
export const SHORTCUT_HELP: readonly { id: ShortcutId | GestureId; win: string; mac: string; label: string; modes: readonly FlowMode[] }[] = [
  { id: "undo", win: "Ctrl+Z", mac: "⌘Z", label: "되돌리기", modes: ["edit"] },
  { id: "redo", win: "Ctrl+Shift+Z · Ctrl+Y", mac: "⌘⇧Z · ⌘Y", label: "다시 하기", modes: ["edit"] },
  { id: "delete", win: "Delete · Backspace", mac: "⌫ · Delete", label: "선택 삭제(고른 꺾는 점이 있으면 그 점)", modes: ["edit"] },
  { id: "copy", win: "Ctrl+C", mac: "⌘C", label: "복사", modes: ["edit"] },
  { id: "paste", win: "Ctrl+V", mac: "⌘V", label: "고른 선에 붙여넣기", modes: ["edit"] },
  { id: "duplicate", win: "Ctrl+D", mac: "⌘D", label: "복제", modes: ["edit"] },
  { id: "find", win: "Ctrl+F", mac: "⌘F", label: "노드 찾기", modes: ["view", "edit", "debug"] },
  { id: "escape", win: "Esc", mac: "Esc", label: "선택 해제·메뉴 닫기", modes: ["view", "edit", "debug"] },
  { id: "continue", win: "F5", mac: "fn+F5", label: "계속(다음 중단점까지)", modes: ["debug"] },
  { id: "step", win: "F10", mac: "fn+F10", label: "한 단계", modes: ["debug"] },
  { id: "stepBack", win: "Shift+F10", mac: "fn+⇧F10", label: "이전 단계", modes: ["debug"] },
  { id: "breakpoint", win: "F9", mac: "fn+F9", label: "고른 노드 중단점", modes: ["debug"] },
  { id: "boxSelect", win: "끌기(빈 곳)", mac: "끌기(빈 곳)", label: "영역 선택(상자에 걸친 노드·메모)", modes: ["edit"] },
  { id: "spaceDrag", win: "Alt+끌기(빈 곳)", mac: "⌥+끌기(빈 곳)", label: "공간 넓히기·줄이기(툴바 [공간] 과 같다)", modes: ["edit"] },
  { id: "pan", win: "스페이스+끌기", mac: "스페이스+끌기", label: "화면 이동(가운데 버튼 끌기·두 손가락 스크롤도 된다)", modes: ["edit"] },
  { id: "zoom", win: "Ctrl+휠 · 핀치", mac: "⌘+휠 · 핀치", label: "확대·축소", modes: ["edit"] },
];
