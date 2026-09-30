/** @vitest-environment happy-dom */
// 캔버스 단축키 디스패처(3단계 계획 P3·Task 0) — 플랫폼별 수정키, 입력 칸 무시, 손잡이가 있을 때만 막기.
import { describe, expect, it, vi } from "vitest";

import { dispatchShortcut, isMacPlatform, isTypingTarget, shortcutOf, type KeyLike } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";

const k = (key: string, mods: Partial<KeyLike> = {}, target: EventTarget | null = null): KeyLike => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods,
});

describe("shortcuts", () => {
  it("Win/Linux 는 Ctrl, Mac 은 Cmd 로 되돌리기·다시 하기", () => {
    expect(shortcutOf(k("z", { ctrlKey: true }), false)).toBe("undo");
    expect(shortcutOf(k("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(shortcutOf(k("y", { ctrlKey: true }), false)).toBe("redo");
    expect(shortcutOf(k("z", { metaKey: true }), true)).toBe("undo");
    expect(shortcutOf(k("z", { ctrlKey: true }), true)).toBeNull(); // Mac 의 Ctrl+Z 는 되돌리기가 아니다
    expect(shortcutOf(k("z", { metaKey: true }), false)).toBeNull();
  });

  it("복사·붙여넣기·복제·찾기·삭제·Esc", () => {
    expect(shortcutOf(k("c", { ctrlKey: true }), false)).toBe("copy");
    expect(shortcutOf(k("v", { ctrlKey: true }), false)).toBe("paste");
    expect(shortcutOf(k("d", { ctrlKey: true }), false)).toBe("duplicate");
    expect(shortcutOf(k("f", { metaKey: true }), true)).toBe("find");
    expect(shortcutOf(k("Delete"), false)).toBe("delete");
    expect(shortcutOf(k("Backspace"), true)).toBe("delete");
    expect(shortcutOf(k("Escape"), false)).toBe("escape");
    expect(shortcutOf(k("Delete", { ctrlKey: true }), false)).toBeNull();
  });

  it("디버거 기능키", () => {
    expect(shortcutOf(k("F5"), false)).toBe("continue");
    expect(shortcutOf(k("F10"), false)).toBe("step");
    expect(shortcutOf(k("F10", { shiftKey: true }), false)).toBe("stepBack");
    expect(shortcutOf(k("F9"), true)).toBe("breakpoint");
    expect(shortcutOf(k("F5", { ctrlKey: true }), false)).toBeNull(); // Ctrl+F5 강제 새로 고침은 건드리지 않는다
  });

  it("Alt 가 눌렸거나 입력 칸이면 무시한다", () => {
    expect(shortcutOf(k("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    const ta = document.createElement("textarea");
    const input = document.createElement("input");
    const ce = document.createElement("div");
    ce.contentEditable = "true";
    for (const t of [ta, input, ce]) expect(shortcutOf(k("z", { ctrlKey: true }, t), false)).toBeNull();
    expect(isTypingTarget(ta)).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("손잡이가 있을 때만 막고 부른다", () => {
    const undo = vi.fn();
    const ev = { ...k("z", { ctrlKey: true }), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(ev, { undo }, false)).toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
    const f5 = { ...k("F5"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(f5, { undo }, false)).toBe(false); // continue 손잡이 없음 → 브라우저 새로 고침 그대로
    expect(f5.preventDefault).not.toHaveBeenCalled();
  });

  it("플랫폼 판정", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Windows NT" })).toBe(false);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe(true);
  });
});
