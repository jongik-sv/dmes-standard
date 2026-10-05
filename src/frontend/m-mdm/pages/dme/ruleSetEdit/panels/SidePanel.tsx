"use client";

/**
 * 오른쪽 패널(보기·편집 모드, 4단계 계획 Task 8 · 스펙 §1.3 Camunda Modeler 식) — 맨 위 머리글, 그 아래 접는 섹션 목록.
 * 속성·세트 섹션은 `PropertyPanel`·`SetPanel` 이 그리고, 룰 목록 섹션(ID `rules`)은 이 파일이 붙인다.
 * - 편집 모드에서 룰을 지정할 노드(`ASSIGNABLE_KINDS`)를 고름 → 제목 「룰 지정」, 맨 위, 줄마다 [지정].
 * - 아무것도 안 고름(세트)·선(편집 모드는 끼우기 대상, 보기 모드는 찾기만)·보기 모드의 룰·빈 단계 → 제목 「룰 목록」, 맨 아래.
 * - 시작·끝·IF·병렬·합류·받는 노드·메모·그룹(`NO_RULE_LIST_KINDS`, 접힌 블록도 같은 노드 종류)을 고르면 룰 목록 섹션을 그리지 않는다(쓸 데가 없다).
 * - 선을 고르면 속성 자리에 「연결선」 섹션(라벨 칸, Task 9)과 룰 목록 섹션이 있다(룰 목록 두 번 누르기가 그 선에 끼운다).
 * `assignSignal` 이 바뀌면(page 의 `openRuleAssign`) 룰 지정 섹션을 펴고 그다음 커밋에서 찾기 칸에 초점을 둔다.
 * 섹션 순서가 바뀌어도 같은 key 로 두어 다시 마운트하지 않는다(찾기 상태는 page 의 `useRuleSearch` 라 다시 마운트돼도 남는다).
 */
import { useEffect, useRef } from "react";

import { RulePanel, type RuleListMode } from "../canvas/RulePanel";
import type { EditFlow } from "../flow-edit";
import type { NodeLayoutSource } from "../flow-layout";
import type { RuleSearch } from "../state/useRuleSearch";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIo, RuleIoMap, RuleSetCheck, SetCallIoMap } from "../types";
import { EdgePanel } from "./EdgePanel";
import { PanelHeader, panelTargetOf } from "./PanelHeader";
import { PropertyPanel, type PropertyPanelProps } from "./PropertyPanel";
import { Section, type SectionMemory } from "./Section";
import { SetPanel, type SetPanelProps } from "./SetPanel";

/** 룰 목록 섹션 ID — 제목만 「룰 목록」/「룰 지정」 으로 바뀐다. */
export const RULES_SECTION = "rules";
/** 「룰 지정」 대상 노드 종류 — 빈 단계(TASK)·룰(RULE). */
export const ASSIGNABLE_KINDS: ReadonlySet<string> = new Set(["RULE", "TASK"]);

/**
 * 룰 목록을 쓸 데가 없는 선택 — 시작·끝·룰 세트 노드(CALL)·IF·병렬·합류·받는 노드·메모·그룹. 이때는 섹션을 그리지 않는다
 * (룰 끼우기는 선·고른 것 없음, 룰 지정은 룰·빈 단계 — 룰 세트 노드에는 룰을 지정하지 않는다).
 */
export const NO_RULE_LIST_KINDS: ReadonlySet<string> = new Set(["START", "END", "CALL", "IF", "PARALLEL", "MERGE", "CATCH", "NOTE", "GROUP"]);

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
  /** 외관 크기를 바꿀 때 그린 위치(S-D6) — PropertyPanel 로 넘긴다. */
  layoutSource?: () => NodeLayoutSource | null;
  /** 하위 세트 겉모양(세트 ID →) — 룰 세트 노드 머리글·속성 패널, 세트 입출력 표(하위 세트 spec §9). */
  calls?: SetCallIoMap;
  /** 겉모양 받기에 실패한 세트 ID — 룰 세트 노드 속성 패널이 「받는 중」 대신 「받지 못했다」 로 보인다. */
  callsFailed?: ReadonlySet<string>;
  /** 하위 세트를 같은 화면의 탭으로 연다(룰 세트 노드 속성 패널의 링크, spec §10.3). */
  onOpenSet?: (setId: string) => void;
}

export function SidePanel(p: SidePanelProps) {
  const editing = p.mode === "edit";
  const editable = editing && !p.loading;
  const target = panelTargetOf(p.flow, p.rules, p.selectedId, p.selectedEdgeId, p.setName, p.calls);
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
  const showRules = !NO_RULE_LIST_KINDS.has(target.kind);
  const body =
    target.kind === "SET" ? (
      <SetPanel
        key="props"
        flow={p.flow}
        rules={p.rules}
        calls={p.calls}
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
    ) : target.kind === "EDGE" && target.id ? (
      <EdgePanel key="props" flow={p.flow} rules={p.rules} edgeId={target.id} editable={editable} onEdit={p.onEdit} sections={sections} />
    ) : !target.id ? null : (
      <PropertyPanel
        key="props"
        flow={p.flow}
        rules={p.rules}
        checks={p.checks}
        selectedId={target.id}
        selectedNodeIds={p.selectedNodeIds}
        editable={editable}
        editing={editing}
        layoutSource={p.layoutSource}
        onEdit={p.onEdit}
        onOpenRule={p.onOpenRule}
        calls={p.calls}
        callsFailed={p.callsFailed}
        onOpenSet={p.onOpenSet}
        sections={sections}
      />
    );
  return (
    <div className="rsf-side" data-testid="flow-side" data-kind={target.kind}>
      <PanelHeader target={target} />
      {!showRules ? body : listMode === "assign" ? [ruleSection, body] : [body, ruleSection]}
    </div>
  );
}
