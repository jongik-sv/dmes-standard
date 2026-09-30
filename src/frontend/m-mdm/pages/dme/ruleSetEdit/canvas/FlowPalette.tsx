"use client";

/** 팔레트 — 세로 버튼 5개. 누르면 onPick, 끌어서 캔버스에 놓아도 된다(HTML5 드래그, dataTransfer `application/x-rsf-palette`). */
import type { DragEvent } from "react";

import { IconArrowsSplit, IconBoxMultiple, IconGitBranch, IconListDetails, IconNote } from "@tabler/icons-react";

import { Button } from "@dk-oasis/shared/form";

import { PALETTE_MIME, type PaletteItem } from "./FlowCanvas";

export interface FlowPaletteProps {
  onPick: (item: PaletteItem) => void;
  disabled: boolean;
}

const ITEMS: { item: PaletteItem; testId: string; label: string; icon: typeof IconNote }[] = [
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
    <div className="rsf-palette" data-testid="flow-palette">
      {ITEMS.map(({ item, testId, label, icon: Icon }) => (
        <Button key={item} data-testid={testId} disabled={disabled} draggable={!disabled} onDragStart={start(item)} onClick={() => onPick(item)}>
          <Icon size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
          {label}
        </Button>
      ))}
    </div>
  );
}
