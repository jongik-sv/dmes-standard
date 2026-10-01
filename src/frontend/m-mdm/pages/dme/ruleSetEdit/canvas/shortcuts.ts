/**
 * 캔버스 단축키 디스패처(3단계 계획 P3) — 캔버스에 초점이 있을 때 page 가 onKeyDown 에서 한 번 부른다. 입력 칸이면 무시하고,
 * 그 모드에 손잡이가 있는 키만 preventDefault·stopPropagation 한다(나머지는 브라우저·포털 동작 그대로, 스펙 §2).
 * Ctrl/Cmd+F(`find`)는 찾기 위젯을 연다. 위젯 안의 Enter·Shift+Enter·Esc·Ctrl/Cmd+F 는 위젯(`FindWidget`)이 받고 여기로 오지 않는다(도움말 표에만 있다).
 */
import type { FlowMode } from "../state/useRuleSetEdit";

export type ShortcutId =
  | "undo" | "redo" | "delete" | "escape" | "copy" | "paste" | "duplicate" | "find"
  | "continue" | "step" | "stepBack" | "breakpoint"
  | "alignLeft" | "alignHCenter" | "alignRight" | "alignTop" | "alignVCenter" | "alignBottom" | "distributeH" | "distributeV"
  | "nudgeLeft" | "nudgeRight" | "nudgeUp" | "nudgeDown" | "nudgeLeftBig" | "nudgeRightBig" | "nudgeUpBig" | "nudgeDownBig";
/** `code` 는 물리 키(Mac Option+글자는 e.key 가 'å' 처럼 바뀌므로 Alt 조합은 code 로 판정한다). */
export interface KeyLike { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: EventTarget | null }
/** 핸들러가 할 일이 없어 키를 쓰지 않았다는 표시 — 디스패처가 preventDefault·stopPropagation 을 하지 않고 브라우저 기본 동작에 맡긴다. */
export const UNHANDLED = Symbol("shortcut-unhandled");
export type ShortcutHandlers = Partial<Record<ShortcutId, () => unknown>>;

/** Alt(⌥)+물리 키 → 정렬·간격 단축키(Figma 와 같다). */
const ALT_CODES: Readonly<Record<string, ShortcutId>> = {
  KeyA: "alignLeft", KeyD: "alignRight", KeyW: "alignTop", KeyS: "alignBottom", KeyH: "alignHCenter", KeyV: "alignVCenter",
};
const NUDGE_KEYS: Readonly<Record<string, readonly [ShortcutId, ShortcutId]>> = {
  ArrowLeft: ["nudgeLeft", "nudgeLeftBig"], ArrowRight: ["nudgeRight", "nudgeRightBig"],
  ArrowUp: ["nudgeUp", "nudgeUpBig"], ArrowDown: ["nudgeDown", "nudgeDownBig"],
};

export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad/i.test(nav.platform ?? "") || /Macintosh|Mac OS X/i.test(nav.userAgent ?? "");
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.getAttribute?.("contenteditable") === "true";
}

/**
 * 요소가 화면에 보이는지 — 조상 중 display:none 이 있으면(포털이 고르지 않은 탭을 숨긴 경우) 보이지 않는다.
 * `checkVisibility` 가 있으면 그것(조상의 계산된 display 를 본다), 없는 옛 브라우저는 `offsetParent` 로 본다(셸 F8 처리와 같은 판정).
 */
export function isShown(el: HTMLElement | null | undefined): boolean {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return el.offsetParent !== null;
}

export function shortcutOf(e: KeyLike, mac: boolean): ShortcutId | null {
  if (isTypingTarget(e.target)) return null;
  if (e.altKey) {
    if (e.ctrlKey || e.metaKey || !e.code) return null; // Alt 는 Ctrl·Meta 없이 정렬 글쇠에만 쓴다(Windows 의 AltGr 은 Ctrl+Alt)
    if (e.code === "KeyH" && e.shiftKey) return "distributeH";
    if (e.code === "KeyV" && e.shiftKey) return "distributeV";
    return e.shiftKey ? null : (ALT_CODES[e.code] ?? null);
  }
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
  const nudge = NUDGE_KEYS[key];
  if (nudge) return e.shiftKey ? nudge[1] : nudge[0];
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
  const result = run();
  if (result === UNHANDLED) return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
}

/**
 * 도움말 표에만 있는 포인터 조작(S1) — 키 디스패처가 받지 않는다. 영역 선택·화면 이동·확대는 React Flow 내장 처리(props)이고,
 * Alt+끌기 공간 넓히기와 노드 Alt+끌기 스냅 끄기(G1)는 캔버스가 포인터 이벤트의 altKey 로 본다(새 keydown 처리 없음).
 */
export type GestureId = "boxSelect" | "spaceDrag" | "snapOff" | "pan" | "zoom" | "handDrag";
/** 찾기 위젯 안의 키(2026-10-01) — 디스패처가 아니라 위젯(`FindWidget`)이 받는다. 도움말 표에만 있다. */
export type FindKeyId = "findNext" | "findClose";

/** 도움말 표(툴바 [?], Task 8 이 그린다). */
export const SHORTCUT_HELP: readonly { id: ShortcutId | GestureId | FindKeyId; win: string; mac: string; label: string; modes: readonly FlowMode[] }[] = [
  { id: "undo", win: "Ctrl+Z", mac: "⌘Z", label: "되돌리기", modes: ["edit"] },
  { id: "redo", win: "Ctrl+Shift+Z · Ctrl+Y", mac: "⌘⇧Z · ⌘Y", label: "다시 하기", modes: ["edit"] },
  { id: "delete", win: "Delete · Backspace", mac: "⌫ · Delete", label: "선택 삭제(여럿 고르면 고른 노드·메모·그룹·선 모두 · 고른 꺾는 점이 있으면 그 점)", modes: ["edit"] },
  { id: "copy", win: "Ctrl+C", mac: "⌘C", label: "복사", modes: ["edit"] },
  { id: "paste", win: "Ctrl+V", mac: "⌘V", label: "고른 선에 붙여넣기", modes: ["edit"] },
  { id: "duplicate", win: "Ctrl+D", mac: "⌘D", label: "복제", modes: ["edit"] },
  { id: "find", win: "Ctrl+F", mac: "⌘F", label: "노드 찾기 — 캔버스 오른쪽 위 찾기 위젯을 연다(열려 있으면 찾을 글을 전체 선택)", modes: ["view", "edit", "debug"] },
  { id: "findNext", win: "Enter · Shift+Enter", mac: "Enter · ⇧Enter", label: "찾기 위젯에서 다음 · 이전 결과", modes: ["view", "edit", "debug"] },
  { id: "findClose", win: "Esc(찾기 위젯)", mac: "Esc(찾기 위젯)", label: "찾기 위젯 닫기 — 캔버스로 돌아간다(찾을 글·옵션은 남는다)", modes: ["view", "edit", "debug"] },
  { id: "escape", win: "Esc", mac: "Esc", label: "선택 해제·메뉴 닫기(다른 도구를 골랐으면 먼저 기본 도구로 돌아간다)", modes: ["view", "edit", "debug"] },
  { id: "continue", win: "F5", mac: "fn+F5", label: "계속(다음 중단점까지)", modes: ["debug"] },
  { id: "step", win: "F10", mac: "fn+F10", label: "한 단계", modes: ["debug"] },
  { id: "stepBack", win: "Shift+F10", mac: "fn+⇧F10", label: "이전 단계", modes: ["debug"] },
  { id: "breakpoint", win: "F9", mac: "fn+F9", label: "고른 노드 중단점", modes: ["debug"] },
  { id: "alignLeft", win: "Alt+A · Alt+D", mac: "⌥A · ⌥D", label: "왼쪽·오른쪽 맞춤(고른 것 2개 이상)", modes: ["edit"] },
  { id: "alignTop", win: "Alt+W · Alt+S", mac: "⌥W · ⌥S", label: "위·아래 맞춤(고른 것 2개 이상)", modes: ["edit"] },
  { id: "alignHCenter", win: "Alt+H · Alt+V", mac: "⌥H · ⌥V", label: "가로·세로 가운데 맞춤(고른 것 2개 이상)", modes: ["edit"] },
  { id: "distributeH", win: "Alt+Shift+H · Alt+Shift+V", mac: "⌥⇧H · ⌥⇧V", label: "가로·세로 간격 고르게(고른 것 3개 이상)", modes: ["edit"] },
  { id: "nudgeLeft", win: "←↑→↓ · Shift+←↑→↓", mac: "←↑→↓ · ⇧←↑→↓", label: "고른 것을 1px · 10px 옮기기", modes: ["edit"] },
  { id: "boxSelect", win: "끌기(빈 곳)", mac: "끌기(빈 곳)", label: "영역 선택(상자에 걸친 노드·메모) — 도구 상자 [영역 선택] 일 때", modes: ["edit"] },
  { id: "spaceDrag", win: "Alt+끌기(빈 곳)", mac: "⌥+끌기(빈 곳)", label: "공간 넓히기·줄이기(도구 상자 [공간] 과 같다)", modes: ["edit"] },
  { id: "handDrag", win: "끌기(빈 곳, [손])", mac: "끌기(빈 곳, [손])", label: "화면 이동 — 도구 상자 [손] 일 때(보기·디버그 기본)", modes: ["view", "edit", "debug"] },
  { id: "snapOff", win: "Alt+끌기(노드·메모)", mac: "⌥+끌기(노드·메모)", label: "끌 때 맞춤 안내선·스냅 끄기", modes: ["edit"] },
  { id: "pan", win: "스페이스+끌기", mac: "스페이스+끌기", label: "화면 이동(가운데 버튼 끌기·두 손가락 스크롤도 된다)", modes: ["edit"] },
  { id: "zoom", win: "Ctrl+휠 · 핀치", mac: "⌘+휠 · 핀치", label: "확대·축소", modes: ["edit"] },
];
