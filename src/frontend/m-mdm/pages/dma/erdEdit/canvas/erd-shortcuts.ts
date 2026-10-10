/**
 * ERD 캔버스 키 표(S2-8·S2-27). 캔버스 host 의 onKeyDown 이 dispatchShortcut 으로 부른다(입력 칸이면 shared 가 넘긴다).
 * - 도구 숫자 키(1·2·4·5)는 캔버스에 초점이 있을 때만 받는다(그리드에서는 글자 입력이다).
 * - Alt 조합은 물리 키(code)로 본다. Mac 의 delete 키는 Backspace 라 Alt+Backspace(⌥⌫)도 모델에서 삭제다.
 * - macOS 는 Ctrl+↑/↓ 를 Mission Control 에 쓴다. Ctrl/⌘+↑/↓ 와 Alt+↑/↓ 를 함께 건다.
 * - Ctrl/⌘+Z·T·K·O 와 F3 은 ErdViewer 의 window 캡처 키(FE1)다. 여기 표의 undo 는 손잡이가 없어 막지 않는다.
 */
import { CANVAS_SHORTCUTS, type CanvasShortcutId, type ShortcutBinding } from "@dk-oasis/shared/react-flow";

export type ErdTool = "select" | "table" | "relation" | "identifying";

export type ErdCanvasKey =
  | CanvasShortcutId
  | "toolSelect" | "toolTable" | "toolRelation" | "toolIdentifying"
  | "deleteModel" | "parentTable" | "childTable";

export const ERD_CANVAS_SHORTCUTS: readonly ShortcutBinding<ErdCanvasKey>[] = [
  { id: "toolSelect", key: "1" },
  { id: "toolTable", key: "2" },
  { id: "toolRelation", key: "4" },
  { id: "toolIdentifying", key: "5" },
  { id: "deleteModel", code: "Delete", alt: true },
  { id: "deleteModel", code: "Backspace", alt: true },
  { id: "parentTable", key: "ArrowUp", mod: true },
  { id: "parentTable", code: "ArrowUp", alt: true },
  { id: "childTable", key: "ArrowDown", mod: true },
  { id: "childTable", code: "ArrowDown", alt: true },
  ...CANVAS_SHORTCUTS,
];

export const TOOL_KEY: Readonly<Record<ErdTool, string>> = { select: "1", table: "2", relation: "4", identifying: "5" };

export function deleteKeyLabel(mac: boolean): string {
  return mac ? "⌥⌫" : "Alt+Delete";
}

export function undoKeyLabel(mac: boolean): string {
  return mac ? "⌘Z" : "Ctrl+Z";
}
