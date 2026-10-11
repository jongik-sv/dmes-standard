"use client";

/**
 * 캔버스 도구 막대(스펙 8절·시안) — 도구(선택 1·표 2·비식별 4·식별 5), 접기(모두·키만·이름만), 감사 컬럼 보기, 미니맵(U51), 다이어그램에서 빼기,
 * 모델에서 삭제, 자동 배치. [정렬 ▾](U60), [다른 다이어그램에 넣기](U61), [컬럼 추가] 는 여러 개면 같은 컬럼 창(U63), 여러 개를 고르면 툴팁 끝에 표 수(U68).
 * 앞쪽 글자 단추(U43): [표 추가] [관계 ▾] [컬럼 추가] [PK 추가] — shared TextToolButton. [관계 ▾] 는 shared ContextMenu(비식별·식별)를 연다.
 * 나머지 단추는 shared ToolButton(아이콘 + CSS 툴팁)이다. 비식별·식별 아이콘 단추(erd-tool-relation·erd-tool-identifying)는 그대로 둔다.
 * 단추를 눌러도 초점이 캔버스에 남게 mousedown 을 막는다(Local-Rules §19).
 * 꺼진 단추의 툴팁·title 에 "할 일 — 짧은 이유"를 적는다(U19·U34). 글자 단추는 늘 span 으로 감싸고 꺼졌을 때만 title 을 단다.
 * 관계 도구 안내 줄(U41)은 막대 바로 아래에 붙인다 — 좁은 캔버스에서 막대가 여러 줄로 접혀도 겹치지 않는다.
 */
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { ContextMenu, TextToolButton, ToolButton, keepFocusOffButtons, type MenuItem } from "@dk-oasis/shared/react-flow";
import {
  IconEyeOff, IconFolderPlus, IconKey, IconLayoutGrid, IconLayoutList, IconLetterCase, IconLink, IconLinkPlus, IconMap, IconPointer, IconShieldCheck, IconSitemap,
  IconTrash,
} from "@tabler/icons-react";

import type { Right } from "../edit-context";
import { shortReason } from "../state/permissions";
import type { ErdFoldMode } from "../types";
import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "./erd-edit-styles";
import { ALIGN_LABEL, ALIGN_MIN, ALIGN_MODES, DISTRIBUTE_LABEL, DISTRIBUTE_MIN, type ArrangeKind } from "./erd-multi";
import { TOOL_KEY, deleteKeyLabel, type ErdTool } from "./erd-shortcuts";

export interface ErdToolbarProps {
  tool: ErdTool;
  mac: boolean;
  model: Right;
  diagram: Right;
  /** 고른 표 수. */
  selection: number;
  onTool(tool: ErdTool): void;
  /** [컬럼 추가]·[PK 추가] — 고른 표 하나에 컬럼 추가를 시작한다(U43). */
  onAddColumn(pk: boolean): void;
  onFold(mode: ErdFoldMode): void;
  onRemove(): void;
  onDelete(): void;
  onAutoLayout(): void;
  /** 정렬·간격(U58) — 고른 표에 적용한다. */
  onArrange(kind: ArrangeKind): void;
  /** 주제별로 나누기 창을 연다(U52). */
  onSplit(): void;
  /** 다른 다이어그램에 넣기 창을 연다(U61). */
  onPlaceInto(): void;
  /** 이 다이어그램을 뺀 다이어그램 수. 0 이면 [넣기] 꺼짐. */
  otherDiagrams: number;
  /** 감사 컬럼 보기(켜면 C_/U_ 감사 컬럼 8개가 노드에 보인다). */
  showAudit: boolean;
  onToggleAudit(): void;
  /** 미니맵 보기(U51). */
  miniMap: boolean;
  onToggleMiniMap(): void;
  /** 관계 도구 안내 줄 글(U41). null 이면 그리지 않는다. */
  hint: string | null;
}

const ICON = 16;

/** 아이콘 도구 단추 — 표 추가는 글자 단추로 옮겼다(U43). */
const TOOLS: readonly { tool: ErdTool; label: string; icon: ReactNode; model: boolean }[] = [
  { tool: "select", label: "선택", icon: <IconPointer size={ICON} />, model: false },
  { tool: "relation", label: "비식별 관계", icon: <IconLink size={ICON} />, model: true },
  { tool: "identifying", label: "식별 관계", icon: <IconLinkPlus size={ICON} />, model: true },
];

const FOLDS: readonly { mode: ErdFoldMode; label: string; icon: ReactNode }[] = [
  { mode: "NONE", label: "컬럼 모두 보이기", icon: <IconLayoutList size={ICON} /> },
  { mode: "KEYS", label: "키 컬럼만", icon: <IconKey size={ICON} /> },
  { mode: "NAME", label: "표 이름만", icon: <IconLetterCase size={ICON} /> },
];

const SPLIT_TIP = "주제별로 나누기 — 표 이름별 작은 다이어그램";
const NO_REASON = "지금은 고칠 수 없습니다.";

/** 권한 이유를 짧게(U19). 이유가 없으면 기본 글. */
const reasonOf = (r: Right): string => shortReason(r.reason) || NO_REASON;

/** 꺼진 단추 툴팁 — 할 일 + 짧은 이유. */
const tipOf = (label: string, r: Right | null, noSelection: boolean): string => {
  if (r && !r.ok) return `${label} — ${reasonOf(r)}`;
  if (noSelection) return `${label} — 표를 먼저 고르세요`;
  return label;
};

/** 고른 표 하나에만 쓰는 단추 툴팁 — 권한 > 고른 표 없음 > 여러 개. */
const oneTableTip = (label: string, r: Right, selection: number): string => {
  if (!r.ok) return `${label} — ${reasonOf(r)}`;
  if (selection === 0) return `${label} — 표를 먼저 고르세요`;
  if (selection > 1) return `${label} — 표를 하나만 고르세요`;
  return label;
};

export function ErdToolbar({
  tool, mac, model, diagram, selection, onTool, onAddColumn, onFold, onRemove, onDelete, onAutoLayout, onArrange, onSplit, onPlaceInto, otherDiagrams, showAudit, onToggleAudit, miniMap,
  onToggleMiniMap, hint,
}: ErdToolbarProps) {
  const none = selection === 0;
  const one = selection === 1;
  const relationTool = tool === "relation" || tool === "identifying";
  // [관계 ▾] 메뉴 — 단추 아래 왼쪽에 연다. 다시 누르면 ContextMenu 의 바깥 누르기가 먼저 닫으므로 늘 "연다" 로만 다룬다.
  const [relAt, setRelAt] = useState<{ x: number; y: number } | null>(null);
  const openRelMenu = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setRelAt({ x: r.left, y: r.bottom + 2 });
  }, []);
  const closeRelMenu = useCallback(() => setRelAt(null), []);
  const relItems = useMemo<MenuItem[]>(() => [
    { id: "relation", label: `비식별 관계 (${TOOL_KEY.relation})`, run: () => onTool("relation") },
    { id: "identifying", label: `식별 관계 (${TOOL_KEY.identifying})`, run: () => onTool("identifying") },
  ], [onTool]);
  // [정렬 ▾] 메뉴(U60) — [관계 ▾] 와 같은 방식.
  const [alignAt, setAlignAt] = useState<{ x: number; y: number } | null>(null);
  const openAlignMenu = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAlignAt({ x: r.left, y: r.bottom + 2 });
  }, []);
  const closeAlignMenu = useCallback(() => setAlignAt(null), []);
  const alignItems = useMemo<MenuItem[]>(() => [
    ...ALIGN_MODES.map((m) => ({ id: `align-${m}`, label: ALIGN_LABEL[m], run: () => onArrange({ align: m }) })),
    ...(["x", "y"] as const).map((a) => ({
      id: `dist-${a}`, label: DISTRIBUTE_LABEL[a], run: () => onArrange({ distribute: a }),
      ...(selection < DISTRIBUTE_MIN ? { disabled: true, title: `표를 ${DISTRIBUTE_MIN}개 이상 고르세요` } : {}),
    })),
  ], [onArrange, selection]);
  const alignTip = !diagram.ok ? `정렬 — ${reasonOf(diagram)}`
    : selection < ALIGN_MIN ? `정렬 — 표를 ${ALIGN_MIN}개 이상 고르세요` : `정렬 (표 ${selection}개)`;
  /** 여러 개를 고르면 툴팁 끝에 표 수(U68). 꺼진 단추에는 붙이지 않는다. */
  const many = (tip: string, on: boolean): string => (on && selection > 1 ? `${tip} (표 ${selection}개)` : tip);
  const addColTip = !model.ok ? `컬럼 추가 — ${reasonOf(model)}`
    : none ? "컬럼 추가 — 표를 먼저 고르세요"
    : selection > 1 ? `컬럼 추가 — 고른 표 ${selection}개에 같은 컬럼` : "컬럼 추가";
  const tableLabel = `표 추가 (${TOOL_KEY.table})`;
  return (
    <div className="erd-toolbar nopan nodrag nowheel" role="toolbar" aria-label="캔버스 도구" data-testid="erd-toolbar" onMouseDown={keepFocusOffButtons}>
      <style href={ERD_EDIT_STYLE_HREF} precedence="default">
        {ERD_EDIT_CSS}
      </style>
      <TextToolButton className="erd-toolbar__txt" label="표 추가" tip={tipOf(tableLabel, model, false)} disabled={!model.ok} pressed={tool === "table"} testId="erd-tool-table"
        onClick={() => onTool("table")} />
      <TextToolButton className="erd-toolbar__txt" label="관계 ▾" tip={tipOf("관계 추가 (4·5)", model, false)} disabled={!model.ok} pressed={relationTool} testId="erd-tool-relmenu"
        onClick={openRelMenu} menu open={relAt !== null} />
      <TextToolButton className="erd-toolbar__txt" label="컬럼 추가" tip={addColTip} disabled={!model.ok || none} testId="erd-tool-addcol"
        onClick={() => onAddColumn(false)} />
      <TextToolButton className="erd-toolbar__txt" label="PK 추가" tip={oneTableTip("PK 추가", model, selection)} disabled={!model.ok || !one} testId="erd-tool-addpk"
        onClick={() => onAddColumn(true)} />
      <ContextMenu items={relItems} at={relAt} onClose={closeRelMenu} testId="erd-relmenu" />
      <TextToolButton className="erd-toolbar__txt" label="정렬 ▾" tip={alignTip} disabled={!diagram.ok || selection < ALIGN_MIN}
        testId="erd-tool-align" onClick={openAlignMenu} menu open={alignAt !== null} />
      <ContextMenu items={alignItems} at={alignAt} onClose={closeAlignMenu} testId="erd-alignmenu" />
      <span className="erd-toolbar__sep" />
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
        <ToolButton key={f.mode} label={f.label} tip={many(tipOf(f.label, diagram, none), diagram.ok && !none)} icon={f.icon}
          disabled={!diagram.ok || none} data-testid={`erd-fold-${f.mode}`} onClick={() => onFold(f.mode)} />
      ))}
      <span className="erd-toolbar__sep" />
      <ToolButton label="감사 컬럼 보기" tip={showAudit ? "감사 컬럼 보기 — 켜짐 (끄면 숨김)" : "감사 컬럼 보기 — 꺼짐 (켜면 C_/U_ 8개가 보임)"}
        icon={<IconShieldCheck size={ICON} />} variant={showAudit ? "primary" : "default"} aria-pressed={showAudit}
        data-testid="erd-audit-toggle" onClick={onToggleAudit} />
      <ToolButton label="미니맵" tip={miniMap ? "미니맵 — 켜짐" : "미니맵 — 꺼짐"} icon={<IconMap size={ICON} />}
        variant={miniMap ? "primary" : "default"} aria-pressed={miniMap} data-testid="erd-tool-minimap" onClick={onToggleMiniMap} />
      <span className="erd-toolbar__sep" />
      <ToolButton label="다른 다이어그램에 넣기"
        tip={!diagram.ok ? `다른 다이어그램에 넣기 — ${reasonOf(diagram)}`
          : none ? "다른 다이어그램에 넣기 — 표를 먼저 고르세요"
          : otherDiagrams === 0 ? "다른 다이어그램에 넣기 — 다른 다이어그램이 없습니다"
          : many("다른 다이어그램에 넣기", true)}
        icon={<IconFolderPlus size={ICON} />} disabled={!diagram.ok || none || otherDiagrams === 0}
        data-testid="erd-tool-place" onClick={onPlaceInto} />
      <ToolButton label="다이어그램에서 빼기 (Delete)" tip={many(tipOf("다이어그램에서 빼기 (Delete)", diagram, none), diagram.ok && !none)} icon={<IconEyeOff size={ICON} />}
        disabled={!diagram.ok || none} data-testid="erd-tool-remove" onClick={onRemove} />
      <ToolButton label={`모델에서 삭제 (${deleteKeyLabel(mac)})`} tip={many(tipOf(`모델에서 삭제 (${deleteKeyLabel(mac)})`, model, none), model.ok && !none)}
        icon={<IconTrash size={ICON} />} disabled={!model.ok || none} data-testid="erd-tool-delete" onClick={onDelete} />
      <span className="erd-toolbar__sep" />
      <ToolButton label="자동 배치" tip={tipOf("자동 배치", diagram, false)} icon={<IconSitemap size={ICON} />} align="end"
        disabled={!diagram.ok} data-testid="erd-tool-layout" onClick={onAutoLayout} />
      <ToolButton label="주제별 나누기" tip={diagram.ok ? SPLIT_TIP : `주제별로 나누기 — ${reasonOf(diagram)}`} icon={<IconLayoutGrid size={ICON} />}
        align="end" disabled={!diagram.ok} data-testid="erd-tool-split" onClick={onSplit} />
      {hint && (
        <div className="erd-tool-hint" role="status" data-testid="erd-tool-hint">
          {hint}
        </div>
      )}
    </div>
  );
}
