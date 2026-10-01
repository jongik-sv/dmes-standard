"use client";

/**
 * 오른쪽 패널(보기·편집 모드, 4단계 계획 Task 8 · 스펙 §1.3 Camunda Modeler 식) — 맨 위 머리글, 그 아래 접는 섹션 목록.
 * 속성·세트 섹션은 `PropertyPanel`·`SetPanel` 이 그리고, 룰 목록 섹션(ID `rules`)은 이 파일이 붙인다.
 * - 편집 모드에서 룰을 지정할 노드(`ASSIGNABLE_KINDS`)를 고름 → 제목 「룰 지정」, 맨 위, 줄마다 [지정].
 * - 그 밖(세트·선·분기·합류·메모·그룹, 보기 모드 전부) → 제목 「룰 목록」, 맨 아래.
 * - 선을 고르면 속성 섹션이 없고 룰 목록 섹션만 있다(두 번 누르기가 그 선에 끼운다).
 * `assignSignal` 이 바뀌면(page 의 `openRuleAssign`) 룰 지정 섹션을 펴고 그다음 커밋에서 찾기 칸에 초점을 둔다.
 * 섹션 순서가 바뀌어도 같은 key 로 두어 다시 마운트하지 않는다(찾기 상태는 page 의 `useRuleSearch` 라 다시 마운트돼도 남는다).
 */
import { useEffect, useRef } from "react";

import { RulePanel, type RuleListMode } from "../canvas/RulePanel";
import type { EditFlow } from "../flow-edit";
import type { RuleSearch } from "../state/useRuleSearch";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIo, RuleIoMap, RuleSetCheck } from "../types";
import { PanelHeader, panelTargetOf } from "./PanelHeader";
import { PropertyPanel, type PropertyPanelProps } from "./PropertyPanel";
import { Section, type SectionMemory } from "./Section";
import { SetPanel, type SetPanelProps } from "./SetPanel";

/** 룰 목록 섹션 ID — 제목만 「룰 목록」/「룰 지정」 으로 바뀐다. */
export const RULES_SECTION = "rules";
/** 「룰 지정」 대상 노드 종류 — 빈 단계(TASK)·룰(RULE). */
export const ASSIGNABLE_KINDS: ReadonlySet<string> = new Set(["RULE", "TASK"]);

export function ruleListMode(flow: EditFlow, selectedId: string | null, editing: boolean): RuleListMode {
  if (!editing) return "view";
  const n = selectedId ? flow.nodes.find((x) => x.id === selectedId) : undefined;
  return n && ASSIGNABLE_KINDS.has(n.kind) ? "assign" : "insert";
}

export interface SidePanelProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  /** 보기·편집만(디버그는 page 가 변수 패널을 그린다). */
  mode: FlowMode;
  loading: boolean;
  selectedId: string | null;
  selectedEdgeId: string | null;
  /** 캔버스 다중 선택(흐름 노드 ID) — 그룹 [선택 노드 더하기]. */
  selectedNodeIds: readonly string[];
  setName: string;
  description: string;
  onSetName(v: string): void;
  onDescription(v: string): void;
  canApplyGuide: boolean;
  guideHint: string | undefined;
  onApplyGuide: SetPanelProps["onApplyGuide"];
  onError(e: unknown): void;
  onEdit: PropertyPanelProps["onEdit"];
  onOpenRule(ruleId: string): void;
  sections: SectionMemory;
  ruleSearch: RuleSearch;
  /** page 의 `openRuleAssign` 이 올린다 — 바뀌면 룰 지정 섹션을 펴고 찾기 칸에 초점. */
  assignSignal: number;
  /** 룰 목록 두 번 누르기 — 고른 선(없으면 END 앞 선)에 끼운다. */
  onInsertRule(io: RuleIo): void;
  /** 흐름에 이미 있는 룰 — 룰 줄 「사용 중」 배지. */
  usedRuleIds: ReadonlySet<string>;
  /** [지정]·두 번 누르기 — 고른 노드에 룰을 지정한다(빈 단계는 룰 노드가 되고 룰 노드는 룰만 바뀐다). */
  onAssignRule(nodeId: string, io: RuleIo): void;
}

export function SidePanel(p: SidePanelProps) {
  const editing = p.mode === "edit";
  const editable = editing && !p.loading;
  const target = panelTargetOf(p.flow, p.rules, p.selectedId, p.selectedEdgeId, p.setName);
  const listMode = ruleListMode(p.flow, p.selectedId, editing);
  const { sections, assignSignal } = p;

  // 룰 지정 섹션 열기 — 신호가 바뀐 렌더에서 펴고(접혀 있었으면 다시 그린다), 칸이 그려진 커밋에서 초점을 둔다.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seen = useRef(assignSignal);
  const focusPending = useRef(false);
  useEffect(() => {
    if (assignSignal === seen.current) return;
    seen.current = assignSignal;
    if (listMode !== "assign") return;
    focusPending.current = true;
    sections.open(target.kind, RULES_SECTION);
  }, [assignSignal, listMode, target.kind, sections]);
  useEffect(() => {
    if (!focusPending.current || !inputRef.current) return;
    focusPending.current = false;
    inputRef.current.focus();
  });

  const ruleSection = (
    <Section key={RULES_SECTION} kind={target.kind} id={RULES_SECTION} title={listMode === "assign" ? "룰 지정" : "룰 목록"} memory={sections}>
      <RulePanel
        mode={listMode}
        search={p.ruleSearch}
        usedRuleIds={p.usedRuleIds}
        inputRef={inputRef}
        onInsert={p.onInsertRule}
        onAssign={(io) => {
          if (p.selectedId) p.onAssignRule(p.selectedId, io);
        }}
      />
    </Section>
  );
  const body =
    target.kind === "SET" ? (
      <SetPanel
        key="props"
        flow={p.flow}
        rules={p.rules}
        setName={p.setName}
        description={p.description}
        editable={editable}
        onSetName={p.onSetName}
        onDescription={p.onDescription}
        canApplyGuide={p.canApplyGuide}
        guideHint={p.guideHint}
        onApplyGuide={p.onApplyGuide}
        onError={p.onError}
        sections={sections}
      />
    ) : target.kind === "EDGE" || !target.id ? null : (
      <PropertyPanel
        key="props"
        flow={p.flow}
        rules={p.rules}
        checks={p.checks}
        selectedId={target.id}
        selectedNodeIds={p.selectedNodeIds}
        editable={editable}
        onEdit={p.onEdit}
        onOpenRule={p.onOpenRule}
        sections={sections}
      />
    );
  return (
    <div className="rsf-side" data-testid="flow-side" data-kind={target.kind}>
      <PanelHeader target={target} />
      {listMode === "assign" ? [ruleSection, body] : [body, ruleSection]}
    </div>
  );
}
