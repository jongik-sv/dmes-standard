"use client";

/**
 * 도구 상자의 요소 묶음(3단계 팔레트 → 4단계 Task 7 에서 아이콘만) — 누르면 onPick, 끌어서 캔버스에 놓아도 된다(HTML5 드래그, `PALETTE_MIME`).
 * 이름은 오른쪽 툴팁(`data-tip`)·`aria-label` 이다. 마우스로 누르거나 끌어 놓은 뒤에는 초점을 놓는다(S1 리뷰 Important 2).
 * 툴바처럼 mousedown 을 막지 않는 까닭: mousedown 기본 동작을 막으면 HTML5 끌기가 시작되지 않는다.
 */
import type { DragEvent, MouseEvent } from "react";

import { IconArrowsSplit, IconBoxMultiple, IconGitBranch, IconListDetails, IconNote } from "@tabler/icons-react";

import { PALETTE_MIME, type PaletteItem } from "./FlowCanvas";

export interface FlowPaletteProps {
  onPick: (item: PaletteItem) => void;
  disabled: boolean;
}

/** 요소 — 아이콘은 오른쪽 패널 머리글(Task 8)도 같은 것을 쓴다. */
export const PALETTE_ITEMS: { item: PaletteItem; testId: string; label: string; icon: typeof IconNote }[] = [
  { item: "rule", testId: "flow-add-rule", label: "룰", icon: IconListDetails },
  { item: "if", testId: "flow-add-if", label: "IF 분기", icon: IconGitBranch },
  { item: "par", testId: "flow-add-par", label: "병렬 분기", icon: IconArrowsSplit },
  { item: "note", testId: "flow-add-note", label: "메모", icon: IconNote },
  { item: "group", testId: "flow-add-group", label: "그룹", icon: IconBoxMultiple },
];

export function FlowPalette({ onPick, disabled }: FlowPaletteProps) {
  const start = (item: PaletteItem) => (e: DragEvent<HTMLButtonElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(PALETTE_MIME, item);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="rsf-palette" data-testid="flow-palette" role="group" aria-label="요소">
      {PALETTE_ITEMS.map(({ item, testId, label, icon: Icon }) => (
        <button
          key={item}
          type="button"
          className="rsf-tool"
          data-testid={testId}
          aria-label={label}
          data-tip={label}
          disabled={disabled}
          draggable={!disabled}
          onDragStart={start(item)}
          onDragEnd={(e: DragEvent<HTMLButtonElement>) => e.currentTarget.blur()}
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            onPick(item);
            if (e.detail > 0) e.currentTarget.blur(); // 마우스로 눌렀으면 초점을 놓는다(키보드 Enter·Space 는 detail 0 — 그대로)
          }}
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
