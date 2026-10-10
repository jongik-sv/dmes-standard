/** @vitest-environment happy-dom */
// 캔버스 단축키 — 묶음 표(bindings)로 판정한다. 룰 세트 편집기 shortcuts.test.ts 의 단언을 그 키 표로 그대로 지킨다.
import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_SHORTCUTS, UNHANDLED, dispatchShortcut, isMacPlatform, isShown, isTypingTarget, shortcutOf,
  type CanvasShortcutId, type KeyLike, type ShortcutBinding,
} from "../../src/components/react-flow/shortcuts";

type RuleSetId = CanvasShortcutId | "continue" | "stop" | "step" | "stepBack" | "breakpoint"
  | "alignLeft" | "alignRight" | "alignHCenter" | "distributeH" | "nudgeLeft" | "nudgeLeftBig";
/** 룰 세트 편집기 키 표(일부) — 공통 표 + 디버거 기능키 + Alt 정렬 + 화살표 옮기기. */
const RULE_SET: readonly ShortcutBinding<RuleSetId>[] = [
  ...CANVAS_SHORTCUTS,
  { id: "continue", key: "F5" }, { id: "stop", key: "F5", shift: true },
  { id: "step", key: "F10" }, { id: "stepBack", key: "F10", shift: true }, { id: "breakpoint", key: "F9" },
  { id: "alignLeft", code: "KeyA", alt: true }, { id: "alignRight", code: "KeyD", alt: true },
  { id: "distributeH", code: "KeyH", alt: true, shift: true }, { id: "alignHCenter", code: "KeyH", alt: true },
  { id: "nudgeLeft", key: "ArrowLeft" }, { id: "nudgeLeftBig", key: "ArrowLeft", shift: true },
];
const k = (key: string, mods: Partial<KeyLike> = {}, target: EventTarget | null = null): KeyLike => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods,
});
const of = (e: KeyLike, mac: boolean) => shortcutOf(e, mac, RULE_SET);

describe("shortcuts", () => {
  it("Win/Linux 는 Ctrl, Mac 은 Cmd 로 되돌리기·다시 하기", () => {
    expect(of(k("z", { ctrlKey: true }), false)).toBe("undo");
    expect(of(k("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(of(k("y", { ctrlKey: true }), false)).toBe("redo");
    expect(of(k("z", { metaKey: true }), true)).toBe("undo");
    expect(of(k("z", { ctrlKey: true }), true)).toBeNull(); // Mac 의 Ctrl+Z 는 되돌리기가 아니다
    expect(of(k("z", { metaKey: true }), false)).toBeNull();
  });

  it("복사·붙여넣기·복제·찾기·삭제·Esc", () => {
    expect(of(k("c", { ctrlKey: true }), false)).toBe("copy");
    expect(of(k("v", { ctrlKey: true }), false)).toBe("paste");
    expect(of(k("d", { ctrlKey: true }), false)).toBe("duplicate");
    expect(of(k("f", { metaKey: true }), true)).toBe("find");
    expect(of(k("Delete"), false)).toBe("delete");
    expect(of(k("Backspace"), true)).toBe("delete");
    expect(of(k("Escape"), false)).toBe("escape");
    expect(of(k("Escape", { shiftKey: true }), false)).toBe("escape"); // 원본과 같이 Shift 와 무관
    expect(of(k("Delete", { ctrlKey: true }), false)).toBeNull();
  });

  it("화면 표에 넣은 기능키 — 표에 없으면 null", () => {
    expect(of(k("F5"), false)).toBe("continue");
    expect(of(k("F5", { shiftKey: true }), false)).toBe("stop");
    expect(of(k("F10"), false)).toBe("step");
    expect(of(k("F10", { shiftKey: true }), false)).toBe("stepBack");
    expect(of(k("F9"), true)).toBe("breakpoint");
    expect(of(k("F5", { ctrlKey: true }), false)).toBeNull(); // Ctrl+F5 강제 새로 고침은 건드리지 않는다
    expect(shortcutOf(k("F5"), false, CANVAS_SHORTCUTS)).toBeNull();
  });

  it("Alt 조합은 물리 키(code)로 보고, Ctrl·Meta 가 같이 눌리면(AltGr) 무시한다", () => {
    expect(of(k("å", { altKey: true, code: "KeyA" }), true)).toBe("alignLeft");
    expect(of(k("d", { altKey: true, code: "KeyD" }), false)).toBe("alignRight");
    expect(of(k("H", { altKey: true, shiftKey: true, code: "KeyH" }), false)).toBe("distributeH");
    expect(of(k("h", { altKey: true, code: "KeyH" }), false)).toBe("alignHCenter");
    expect(of(k("A", { altKey: true, shiftKey: true, code: "KeyA" }), false)).toBeNull();
    expect(of(k("a", { altKey: true }), false)).toBeNull(); // code 를 모르면 무시
  });

  it("화살표 옮기기 — Shift 는 큰 걸음", () => {
    expect(of(k("ArrowLeft"), false)).toBe("nudgeLeft");
    expect(of(k("ArrowLeft", { shiftKey: true }), false)).toBe("nudgeLeftBig");
  });

  it("Alt 가 눌렸거나 입력 칸이면 무시한다", () => {
    expect(of(k("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    const ta = document.createElement("textarea");
    const input = document.createElement("input");
    const ce = document.createElement("div");
    ce.contentEditable = "true";
    for (const t of [ta, input, ce]) expect(of(k("z", { ctrlKey: true }, t), false)).toBeNull();
    expect(isTypingTarget(ta)).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("손잡이가 있을 때만 막고 부른다 — UNHANDLED 를 돌려주면 막지 않는다", () => {
    const undo = vi.fn();
    const ev = { ...k("z", { ctrlKey: true }), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(ev, { undo }, false, RULE_SET)).toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
    const f5 = { ...k("F5"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(f5, { undo }, false, RULE_SET)).toBe(false); // continue 손잡이 없음 → 브라우저 새로 고침 그대로
    expect(f5.preventDefault).not.toHaveBeenCalled();
    const esc = { ...k("Escape"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(esc, { escape: () => UNHANDLED }, false, CANVAS_SHORTCUTS)).toBe(false);
    expect(esc.preventDefault).not.toHaveBeenCalled();
  });

  it("Shift+1 화면 맞춤 · Shift+2 고른 것으로 이동 — 자판과 무관하게 물리 키로 본다", () => {
    expect(of(k("!", { shiftKey: true, code: "Digit1" }), false)).toBe("fitView");
    expect(of(k("!", { shiftKey: true, code: "Digit1" }), true)).toBe("fitView");
    expect(of(k("@", { shiftKey: true, code: "Digit2" }), false)).toBe("fitSelection");
    expect(of(k("1", { code: "Digit1" }), false)).toBeNull(); // Shift 없이는 아니다
    expect(of(k("!", { shiftKey: true, ctrlKey: true, code: "Digit1" }), false)).toBeNull();
    expect(of(k("!", { shiftKey: true, metaKey: true, code: "Digit1" }), true)).toBeNull();
    expect(of(k("!", { shiftKey: true, altKey: true, code: "Digit1" }), false)).toBeNull();
    const input = document.createElement("input");
    expect(of(k("!", { shiftKey: true, code: "Digit1" }, input), false)).toBeNull(); // 입력 칸은 무시
  });

  it("플랫폼 판정·보이는지 판정", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Windows NT" })).toBe(false);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe(true);
    expect(isShown(null)).toBe(false);
    expect(isShown(document.createElement("div"))).toBe(false); // 문서에 붙지 않았다
  });
});
