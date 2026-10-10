"use client";

/**
 * 캔버스 도구 막대(스펙 8절·시안) — 도구(선택 1·표 2·비식별 4·식별 5), 접기(모두·키만·이름만), 다이어그램에서 빼기, 모델에서 삭제, 자동 배치.
 * 단추는 shared ToolButton(아이콘 + CSS 툴팁)이다. 단추를 눌러도 초점이 캔버스에 남게 mousedown 을 막는다(Local-Rules §19).
 * 꺼진 단추의 툴팁에 이유를 적는다(S2-20 권한 문구).
 */
import type { ReactNode } from "react";

import { ToolButton, keepFocusOffButtons } from "@dk-oasis/shared/react-flow";
import {
  IconEyeOff, IconKey, IconLayoutList, IconLetterCase, IconLink, IconLinkPlus, IconPointer, IconSitemap, IconTablePlus, IconTrash,
} from "@tabler/icons-react";

import type { Right } from "../edit-context";
import type { ErdFoldMode } from "../types";
import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "./erd-edit-styles";
import { TOOL_KEY, deleteKeyLabel, type ErdTool } from "./erd-shortcuts";

export interface ErdToolbarProps {
  tool: ErdTool;
  mac: boolean;
  model: Right;
  diagram: Right;
  /** 고른 표 수. */
  selection: number;
  onTool(tool: ErdTool): void;
  onFold(mode: ErdFoldMode): void;
  onRemove(): void;
  onDelete(): void;
  onAutoLayout(): void;
}

const ICON = 16;

const TOOLS: readonly { tool: ErdTool; label: string; icon: ReactNode; model: boolean }[] = [
  { tool: "select", label: "선택", icon: <IconPointer size={ICON} />, model: false },
  { tool: "table", label: "표 추가", icon: <IconTablePlus size={ICON} />, model: true },
  { tool: "relation", label: "비식별 관계", icon: <IconLink size={ICON} />, model: true },
  { tool: "identifying", label: "식별 관계", icon: <IconLinkPlus size={ICON} />, model: true },
];

const FOLDS: readonly { mode: ErdFoldMode; label: string; icon: ReactNode }[] = [
  { mode: "NONE", label: "컬럼 모두 보이기", icon: <IconLayoutList size={ICON} /> },
  { mode: "KEYS", label: "키 컬럼만", icon: <IconKey size={ICON} /> },
  { mode: "NAME", label: "표 이름만", icon: <IconLetterCase size={ICON} /> },
];

/** 꺼진 단추 툴팁 — 할 일 + 이유. */
const tipOf = (label: string, r: Right | null, noSelection: boolean): string => {
  if (r && !r.ok) return `${label} — ${r.reason ?? "지금은 고칠 수 없습니다."}`;
  if (noSelection) return `${label} — 표를 먼저 고르세요`;
  return label;
};

export function ErdToolbar({ tool, mac, model, diagram, selection, onTool, onFold, onRemove, onDelete, onAutoLayout }: ErdToolbarProps) {
  const none = selection === 0;
  return (
    <div className="erd-toolbar nopan nodrag nowheel" role="toolbar" aria-label="캔버스 도구" data-testid="erd-toolbar" onMouseDown={keepFocusOffButtons}>
      <style href={ERD_EDIT_STYLE_HREF} precedence="default">
        {ERD_EDIT_CSS}
      </style>
      {TOOLS.map((t) => {
        const label = `${t.label} (${TOOL_KEY[t.tool]})`;
        const off = t.model && !model.ok;
        return (
          <ToolButton key={t.tool} label={label} tip={tipOf(label, t.model ? model : null, false)} icon={t.icon}
            variant={tool === t.tool ? "primary" : "default"} aria-pressed={tool === t.tool} disabled={off}
            data-testid={`erd-tool-${t.tool}`} onClick={() => onTool(t.tool)} />
        );
      })}
      <span className="erd-toolbar__sep" />
      {FOLDS.map((f) => (
        <ToolButton key={f.mode} label={f.label} tip={tipOf(f.label, diagram, none)} icon={f.icon}
          disabled={!diagram.ok || none} data-testid={`erd-fold-${f.mode}`} onClick={() => onFold(f.mode)} />
      ))}
      <span className="erd-toolbar__sep" />
      <ToolButton label="다이어그램에서 빼기 (Delete)" tip={tipOf("다이어그램에서 빼기 (Delete)", diagram, none)} icon={<IconEyeOff size={ICON} />}
        disabled={!diagram.ok || none} data-testid="erd-tool-remove" onClick={onRemove} />
      <ToolButton label={`모델에서 삭제 (${deleteKeyLabel(mac)})`} tip={tipOf(`모델에서 삭제 (${deleteKeyLabel(mac)})`, model, none)}
        icon={<IconTrash size={ICON} />} disabled={!model.ok || none} data-testid="erd-tool-delete" onClick={onDelete} />
      <span className="erd-toolbar__sep" />
      <ToolButton label="자동 배치" tip={tipOf("자동 배치", diagram, false)} icon={<IconSitemap size={ICON} />} align="end"
        disabled={!diagram.ok} data-testid="erd-tool-layout" onClick={onAutoLayout} />
    </div>
  );
}
