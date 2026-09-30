"use client";

/**
 * 떠 있는 도구 상자(4단계 계획 Task 7, 스펙 §1.3 P1) — 캔버스 감싸개(`rsf-canvas-host`) 안 왼쪽 위(여백 12px)의 세로 막대.
 * 위 묶음은 도구(한 번에 하나, 고른 도구는 `aria-pressed`), 구분선 아래는 요소(편집 모드만 — `FlowPalette`).
 * 아이콘만 보이고 이름은 오른쪽으로 뜨는 툴팁(`data-tip`, `styles/toolbox.ts` 의 CSS)이며 `aria-label` 도 같은 이름이다.
 * shared 에 툴팁·접는 목록 래퍼가 없고 화면은 `@mantine/*` 를 import 하지 않으므로(mantine-aggrid-ui 스킬 §3) CSS 툴팁으로 둔다.
 * 도구 단추는 mousedown 기본 동작(초점 옮기기)을 막는다(Local-Rules §19 — 단추에 초점이 남으면 스페이스+끌기가 그 단추를 다시 누른다).
 * 요소 단추는 HTML5 끌기를 살리려고 막지 않고, 누르거나 끌어 놓은 뒤 초점을 놓는다(`FlowPalette`).
 * 도구는 저장하지 않는다. 기본 도구는 모드마다 다르다(`defaultTool`) — Esc·모드 바꾸기·다른 세트 열기가 그리로 돌린다(page).
 * FlowCanvas 밖(page)에서 그려 캔버스 파일을 건드리지 않는다 — 캔버스 루트의 포인터 캡처(공간 넓히기)·끌어 놓기와도 섞이지 않는다.
 */
import { IconArrowAutofitWidth, IconHandStop, IconLasso } from "@tabler/icons-react";

import type { FlowMode } from "../state/useRuleSetEdit";
import type { PaletteItem } from "./FlowCanvas";
import { FlowPalette } from "./FlowPalette";
import { keepFocusOffButtons } from "./FlowToolbar";

export type CanvasTool = "hand" | "select" | "space";

/** 모드의 기본 도구 — 편집 = 영역 선택(3단계 편집 동작), 보기·디버그 = 손(3단계 보기·디버그 동작: 끌기 = 화면 이동). */
export function defaultTool(mode: FlowMode): CanvasTool {
  return mode === "edit" ? "select" : "hand";
}

export interface FlowToolboxProps {
  mode: FlowMode;
  tool: CanvasTool;
  /** 도구 단추 누르기 — page 가 [공간] 을 다시 누르면 영역 선택으로 돌리고 초점을 캔버스로 옮긴다. */
  onTool(t: CanvasTool): void;
  /** 요소 누르기(편집 모드만) — 고른 선(없으면 END 앞 선)에 끼운다. */
  onPick(item: PaletteItem): void;
  /** 서버를 부르는 중 — [공간]·요소를 끈다. */
  disabled: boolean;
}

const TOOLS: { tool: CanvasTool; testId: string; label: string; icon: typeof IconHandStop; editOnly: boolean }[] = [
  { tool: "hand", testId: "flow-tool-hand", label: "손", icon: IconHandStop, editOnly: false },
  { tool: "select", testId: "flow-tool-select", label: "영역 선택", icon: IconLasso, editOnly: false },
  { tool: "space", testId: "flow-space-tool", label: "공간", icon: IconArrowAutofitWidth, editOnly: true },
];

export function FlowToolbox({ mode, tool, onTool, onPick, disabled }: FlowToolboxProps) {
  const editing = mode === "edit";
  return (
    <div className="rsf-toolbox" data-testid="flow-toolbox" role="toolbar" aria-orientation="vertical" aria-label="도구 상자">
      <div className="rsf-toolbox-group" role="group" aria-label="도구" onMouseDown={keepFocusOffButtons}>
        {TOOLS.filter((t) => editing || !t.editOnly).map(({ tool: t, testId, label, icon: Icon, editOnly }) => (
          <button
            key={t}
            type="button"
            className="rsf-tool"
            data-testid={testId}
            aria-label={label}
            data-tip={label}
            aria-pressed={tool === t}
            disabled={editOnly && disabled}
            onClick={() => onTool(t)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      {editing && (
        <>
          <div className="rsf-toolbox-sep" role="separator" />
          <FlowPalette onPick={onPick} disabled={disabled} />
        </>
      )}
    </div>
  );
}
