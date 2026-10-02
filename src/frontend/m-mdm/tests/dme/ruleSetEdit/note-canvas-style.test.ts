// 캔버스 메모에 shared 마크다운 편집기를 붙이는 스타일(styles/note-editor.ts) — React Flow·.rsf-note 에 걸린 규칙만 m-mdm 에 남는다.
// 편집기 자체 모습(글 모양·도구 막대·문단 간격)은 shared markdown-editor 의 단위 시험이 본다.
// 2026-10-02 shared 이관 때 note-editor.test.ts 의 「스타일」·「편집 중인 캔버스 메모 z-index」 시험에서 화면 몫을 옮겼다.
import { describe, expect, it } from "vitest";

import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { CATCH_CSS } from "../../../pages/dme/ruleSetEdit/styles/catch";
import { NOTE_EDITOR_CSS } from "../../../pages/dme/ruleSetEdit/styles/note-editor";

describe("캔버스 메모 — 마크다운 편집기 붙이기 스타일", () => {
  it("화면 스타일 묶음에 들어 있고(CATCH_CSS 는 여전히 맨 끝), 색 값을 직접 쓰지 않는다", () => {
    expect(RSF_CSS).toContain(NOTE_EDITOR_CSS);
    expect(RSF_CSS.trimEnd().endsWith(CATCH_CSS.trimEnd())).toBe(true);
    expect(NOTE_EDITOR_CSS).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(/);
    // 옛 화면 전용 편집기 클래스가 남지 않는다 — 편집 중 표시는 shared 의 .cm-md-editing.
    expect(NOTE_EDITOR_CSS).not.toContain("rsf-ne");
  });

  it("편집 중에는 메모의 넘침 자르기를 푼다(도구 막대가 메모 위로 뜬다)", () => {
    expect(NOTE_EDITOR_CSS).toMatch(/\.rsf-note:has\(\.cm-md-editing\)\s*\{[^}]*overflow:\s*visible/);
  });

  it("편집기를 품은 React Flow 노드의 z-index 가 받는 노드(1001)보다 크다", () => {
    const m = /\.react-flow__node:has\(\.cm-md-editing\)\s*\{[^}]*z-index:\s*(\d+)\s*!important/.exec(NOTE_EDITOR_CSS);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(1001);
  });

  it("오른쪽 패널 메모만 남은 높이를 채운다 — 스크롤 칸부터 구역 본문까지 세로 flex 로 잇고(.rsf-panel-fill 로만 고른다), 접은 구역은 늘리지 않는다", () => {
    const rules = NOTE_EDITOR_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).toMatch(/\.rsf-props:has\(> \.rsf-side > \.rsf-panel-fill\)\s*\{[^}]*display: flex;[^}]*flex-direction: column/);
    expect(rules).toMatch(/\.rsf-side:has\(> \.rsf-panel-fill\)\s*\{[^}]*flex: 1 1 0;[^}]*min-height: 0/);
    expect(rules).toMatch(/\.rsf-panel-fill\s*\{[^}]*flex: 1 1 0;[^}]*flex-direction: column/);
    expect(rules).toMatch(/\.rsf-panel-fill > \.rsf-section\[data-open="true"\]\s*\{[^}]*flex: 1 1 0/);
    expect(rules).toMatch(/\.rsf-panel-fill > \.rsf-section\[data-open="true"\] > \.rsf-section-body\s*\{[^}]*flex: 1 1 0/);
    // 메모 패널 표시(.rsf-panel-fill) 없이 다른 패널 배치를 바꾸는 규칙이 없다.
    for (const sel of rules.match(/^[^{}\n]+(?=\{)/gm) ?? []) {
      if (/rsf-props|rsf-side|rsf-section|rsf-panel/.test(sel)) expect(sel, sel).toContain("rsf-panel-fill");
    }
  });
});
