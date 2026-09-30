"use client";

/**
 * ruleSetEdit — 룰 세트 편집(TSK-08-06, 2단계 계획 Task 10). 정본: docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md, 스펙 §7.
 *
 * 상단 바의 세트 고르기(`IdPicker`)로 고르거나, 룰 세트 화면(등록·목록 링크)이 넘긴 setId 로 연다(`useMdmPageParams`, I22).
 * 그 아래 흐름 툴바(`FlowToolbar`), 본문 3단(편집 모드에서만 팔레트 | 흐름 캔버스 | 오른쪽 패널 — 선택 없으면 세트 패널, 있으면 속성 패널),
 * 아래 패널(검사 결과 · 시뮬레이션 탭)을 둔다. 한 줄 세트와 분기 세트 모두 캔버스로 편집하고 흐름(`flowJson`)으로 저장한다(P-D5).
 * 세트를 열면 보기 모드다. 편집 모드는 서버 판정(`editable`)·INUSE·RBAC(save)일 때만 켠다(P10).
 * 분할 골격(`ContentBody`/`ContentPanel`)은 이 파일의 직접 자식으로 둔다(Part B §4-3 — 드래그 막대가 직접 자식에만 붙는다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { IdPicker, MdmPageLayout, useMdmPageParams, type IdPickRow } from "@/shell";

import { searchSets } from "./api";
import { FlowCanvas, type PaletteItem } from "./canvas/FlowCanvas";
import { FlowPalette } from "./canvas/FlowPalette";
import { FlowToolbar } from "./canvas/FlowToolbar";
import { RuleSearchModal } from "./canvas/RuleSearchModal";
import {
  MAX_NODES,
  addGroup,
  addNote,
  connect,
  insertRule,
  insertSplit,
  removeEdge,
  setPositions,
  updateNote,
  type EditFlow,
  type EditResult,
  type FlowNote,
  type FlowPos,
} from "./flow-edit";
import { NODE_SIZE, autoLayout, positionsOf } from "./flow-layout";
import { nearestEdge } from "./flow-vars";
import { openRule } from "./links";
import { BottomPanel, type BottomTab } from "./panels/BottomPanel";
import { ChecksPanel } from "./panels/ChecksPanel";
import { PropertyPanel } from "./panels/PropertyPanel";
import { SetPanel } from "./panels/SetPanel";
import { useRuleSetEdit } from "./state/useRuleSetEdit";
import type { RuleIo } from "./types";

const SCREEN_ID = "ruleSetEdit";
const COMPONENT_PATH = "dme/ruleSetEdit";
const STORAGE_KEY = "mdm.dme.ruleSetEdit";
/** 서버 `RuleSetEditService.PICK_LIMIT` 과 같다. */
const SET_PICK_LIMIT = 20;
const NODE_LIMIT_MESSAGE = `노드는 흐름 하나에 ${MAX_NODES}개까지 둔다`;
const NO_TARGET_EDGE = "끼울 선을 찾지 못했다. 캔버스에서 선을 먼저 고른다";
const GROUP_TITLE = "그룹";
/** 새 메모를 선택 노드 오른쪽에 둘 때의 간격(px). */
const NOTE_GAP = 24;

async function searchSetPicks(keyword: string): Promise<IdPickRow[]> {
  const res = await searchSets(keyword);
  return (res.sets ?? []).map((s) => ({ id: s.setId, name: s.setName, status: s.status }));
}

const fail = (reason: string): EditResult => ({ ok: false, reason });
const branched = (f: EditFlow) => f.nodes.some((n) => n.kind === "IF" || n.kind === "PARALLEL");

/** 끼울 선 — 고른 선이 흐름에 있으면 그 선, 없으면 END 로 들어가는 첫 선(P-D10). */
function targetEdge(f: EditFlow, preferred: string | null): string | null {
  if (preferred && f.edges.some((e) => e.id === preferred)) return preferred;
  const end = f.nodes.find((n) => n.kind === "END");
  return f.edges.find((e) => e.to === end?.id)?.id ?? null;
}

/** 흐름 전체 배치의 가운데(메모를 둘 기본 자리). */
function centerOf(f: EditFlow): FlowPos {
  const pos = positionsOf(f);
  const kinds = new Map(f.nodes.map((n) => [n.id, n.kind] as const));
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [id, p] of Object.entries(pos)) {
    const k = kinds.get(id);
    if (!k) continue;
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + NODE_SIZE[k].w);
    y2 = Math.max(y2, p.y + NODE_SIZE[k].h);
  }
  return Number.isFinite(x1) ? { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) } : { x: 0, y: 0 };
}

export default function RuleSetEditPage({ tabId }: { tabId?: string }) {
  const rbac = useUserButtonRbac();
  const state = useRuleSetEdit();
  const { open, edit, addRuleIo, view, flow } = state;

  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.setId) void open(params.setId);
  });

  const canDo = useCallback((action: string) => canDoButton(rbac, SCREEN_ID, action), [rbac]);
  const canEdit = !!view && view.editable && view.set.status === "INUSE" && canDo("save");
  const editing = state.mode === "edit" && canEdit;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  /** 캔버스 다중 선택(흐름 노드 ID, 흐름 순서) — [그룹]·[선택 노드 더하기] 가 쓴다. */
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ id: string | null; seq: number }>({ id: null, seq: 0 });
  const [fitSignal, setFitSignal] = useState(0);
  const [showVars, setShowVars] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("checks");
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [ruleModal, setRuleModal] = useState(false);
  /** 룰 찾기 팝업을 연 때의 끼울 선(고른 선·끌어 놓은 자리). */
  const ruleTarget = useRef<string | null>(null);

  // 다른 세트를 열면 선택·이동 요청을 비운다.
  const setId = view?.set.setId ?? null;
  useEffect(() => {
    setSelectedId(null);
    setSelectedEdgeId(null);
    setMultiSel([]);
    setFocus((f) => ({ id: null, seq: f.seq }));
  }, [setId]);

  // 편집으로 없어진 노드·메모·그룹·선의 선택은 푼다(속성 패널이 없는 노드를 읽지 않게).
  useEffect(() => {
    if (!flow) return;
    if (selectedId && !flow.nodes.some((n) => n.id === selectedId) && !flow.view.notes.some((n) => n.id === selectedId) && !flow.view.groups.some((g) => g.id === selectedId)) {
      setSelectedId(null);
    }
    if (selectedEdgeId && !flow.edges.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [flow, selectedId, selectedEdgeId]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSelectedEdgeId(null);
  }, []);
  const selectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id);
    if (id) setSelectedId(null);
  }, []);

  /** 노드 add 개를 끼우는 연산 — 상한을 먼저 보고, 끼울 선을 고른 뒤, 새 노드(선 e 의 새 도착 노드)를 고른다. */
  const insertAt = useCallback(
    (preferred: string | null, add: number, op: (f: EditFlow, edgeId: string) => EditResult) => {
      let created: string | null = null;
      const reason = edit((f) => {
        if (f.nodes.length + add > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
        const edgeId = targetEdge(f, preferred);
        if (!edgeId) return fail(NO_TARGET_EDGE);
        const r = op(f, edgeId);
        if (r.ok) created = r.flow.edges.find((e) => e.id === edgeId)?.to ?? null;
        return r;
      });
      if (!reason && created) select(created);
    },
    [edit, select],
  );

  const pick = useCallback(
    (item: PaletteItem, preferredEdge: string | null, at?: FlowPos) => {
      if (!flow) return;
      if (item === "rule") {
        if (flow.nodes.length + 1 > MAX_NODES) {
          edit(() => fail(NODE_LIMIT_MESSAGE));
          return;
        }
        ruleTarget.current = preferredEdge;
        setRuleModal(true);
        return;
      }
      if (item === "if" || item === "par") {
        insertAt(preferredEdge, 2, (f, e) => insertSplit(f, e, item === "if" ? "IF" : "PARALLEL"));
        return;
      }
      const selNode = selectedId ? flow.nodes.find((n) => n.id === selectedId) : undefined;
      if (item === "note") {
        let place = at;
        if (!place && selNode) {
          const p = positionsOf(flow)[selNode.id];
          if (p) place = { x: p.x + NODE_SIZE[selNode.kind].w + NOTE_GAP, y: p.y };
        }
        let id: string | null = null;
        const reason = edit((f) => {
          const r = addNote(f, place ?? centerOf(f), selNode?.id ?? null);
          id = r.id;
          return r.flow;
        });
        if (!reason && id) select(id);
        return;
      }
      // 그룹: 캔버스 다중 선택(없으면 단일 선택 노드)으로 만든다.
      const members = multiSel.length > 0 ? multiSel : selNode ? [selNode.id] : [];
      let gid: string | undefined;
      const reason = edit((f) => {
        const r = addGroup(f, members, GROUP_TITLE);
        gid = r.id;
        return r;
      });
      if (!reason && gid) select(gid);
    },
    [flow, selectedId, multiSel, edit, insertAt, select],
  );

  const onPickRule = useCallback(
    (io: RuleIo) => {
      setRuleModal(false);
      addRuleIo(io);
      insertAt(ruleTarget.current, 1, (f, e) => insertRule(f, e, io.ruleId));
    },
    [addRuleIo, insertAt],
  );

  const onDropPalette = useCallback(
    (item: PaletteItem, at: FlowPos) => {
      if (!flow || !editing) return;
      pick(item, nearestEdge(flow, positionsOf(flow), at) ?? selectedEdgeId, at);
    },
    [flow, editing, pick, selectedEdgeId],
  );

  const onMove = useCallback((pos: Record<string, FlowPos>) => editing && edit((f) => setPositions(f, pos)), [editing, edit]);
  const onConnect = useCallback((from: string, to: string) => editing && edit((f) => connect(f, from, to)), [editing, edit]);
  const onDeleteEdge = useCallback((id: string) => editing && edit((f) => removeEdge(f, id)), [editing, edit]);
  const onNoteChange = useCallback(
    (id: string, patch: Partial<FlowNote>) => editing && edit((f) => updateNote(f, id, patch)),
    [editing, edit],
  );
  const onAutoLayout = useCallback(() => edit((f) => setPositions(f, autoLayout(f))), [edit]);
  const onFocusCheck = useCallback(
    (nodeId: string) => {
      select(nodeId);
      setFocus((f) => ({ id: nodeId, seq: f.seq + 1 }));
    },
    [select],
  );

  const usedRuleIds = useMemo(() => new Set((flow?.nodes ?? []).map((n) => n.ruleId).filter((x): x is string => !!x)), [flow]);

  const selectedExists =
    !!flow &&
    !!selectedId &&
    (flow.nodes.some((n) => n.id === selectedId) || flow.view.notes.some((n) => n.id === selectedId) || flow.view.groups.some((g) => g.id === selectedId));
  const isBranched = !!flow && branched(flow);
  const guideHint = !editing ? "편집 모드에서 적용한다" : isBranched ? "분기가 있는 흐름에는 적용하지 않는다" : undefined;

  const bottom = (
    <BottomPanel
      tab={bottomTab}
      onTab={setBottomTab}
      collapsed={bottomCollapsed}
      onToggle={() => setBottomCollapsed((c) => !c)}
      checkCount={state.checks.length}
      checks={<ChecksPanel checks={state.checks} onFocus={onFocusCheck} />}
    />
  );

  return (
    <MdmPageLayout group="dme" screenId={SCREEN_ID} title="룰 세트 편집">
      <div
        data-testid="set-edit-topbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-sm) var(--spacing-md)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <IdPicker
          label="룰 세트"
          placeholder="세트 ID·세트명"
          noun="세트"
          testId="set-pick"
          search={searchSetPicks}
          limit={SET_PICK_LIMIT}
          onPick={(id) => void open(id)}
          onError={state.reportError}
        />
        {view && (
          <>
            <span aria-hidden style={{ alignSelf: "stretch", width: 1, margin: "2px var(--spacing-xs)", background: "var(--color-border)" }} />
            <span data-testid="set-edit-current" style={{ fontWeight: 600 }}>
              {`${view.set.setId} · ${view.set.setName}`}
            </span>
          </>
        )}
      </div>

      {!view || !flow ? (
        <p data-testid="set-edit-empty" style={{ padding: "var(--spacing-lg) var(--spacing-md)", color: "var(--color-text-muted)" }}>
          세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다
        </p>
      ) : (
        <>
          <FlowToolbar
            state={state}
            canDo={canDo}
            canEdit={canEdit}
            showVars={showVars}
            onToggleVars={() => setShowVars((v) => !v)}
            onAutoLayout={onAutoLayout}
            onFit={() => setFitSignal((s) => s + 1)}
          />
          <ContentBody root direction="column" resizable storageKey={STORAGE_KEY}>
            <ContentBody key="main" resizable storageKey={`${STORAGE_KEY}.main`} flex="1 1 0" minSize={200}>
              <ContentPanel key="canvas" flex="1 1 0" minSize={320}>
                <div className="rsf-body">
                  {editing && <FlowPalette onPick={(item) => pick(item, selectedEdgeId)} disabled={state.loading} />}
                  <div className="rsf-canvas-host">
                    <FlowCanvas
                      flow={flow}
                      rules={state.rules}
                      checks={state.checks}
                      mode={editing ? "edit" : "view"}
                      showVars={showVars}
                      selectedId={selectedId}
                      selectedEdgeId={selectedEdgeId}
                      overlay={null}
                      focusId={focus.id}
                      focusSeq={focus.seq}
                      fitSignal={fitSignal}
                      onSelect={select}
                      onSelectEdge={selectEdge}
                      onOpenRule={openRule}
                      onMove={onMove}
                      onConnect={onConnect}
                      onDeleteEdge={onDeleteEdge}
                      onDropPalette={onDropPalette}
                      onNoteChange={onNoteChange}
                      onSelectionChange={setMultiSel}
                    />
                  </div>
                </div>
              </ContentPanel>
              <ContentPanel key="props" width={360} minSize={280}>
                <div className="rsf-props" data-testid="flow-props">
                  {selectedExists && selectedId ? (
                    <PropertyPanel
                      flow={flow}
                      rules={state.rules}
                      checks={state.checks}
                      selectedId={selectedId}
                      selectedNodeIds={multiSel}
                      editable={editing && !state.loading}
                      onEdit={edit}
                      onOpenRule={openRule}
                    />
                  ) : (
                    <SetPanel
                      flow={flow}
                      rules={state.rules}
                      setName={state.setName}
                      description={state.description}
                      editable={editing && !state.loading}
                      onSetName={state.setSetName}
                      onDescription={state.setDescription}
                      canApplyGuide={editing && !isBranched && !state.loading}
                      guideHint={guideHint}
                      onApplyGuide={state.applyGuide}
                      onError={state.reportError}
                    />
                  )}
                </div>
              </ContentPanel>
            </ContentBody>
            {bottomCollapsed ? (
              <div key="bottom-bar" className="rsf-bottom-bar">
                {bottom}
              </div>
            ) : (
              <ContentPanel key="bottom" height={220} minSize={120}>
                {bottom}
              </ContentPanel>
            )}
          </ContentBody>
          <RuleSearchModal opened={ruleModal} usedRuleIds={usedRuleIds} onClose={() => setRuleModal(false)} onPick={onPickRule} />
        </>
      )}

      {state.error && <ErrorModal message={state.error} onClose={state.clearError} />}
    </MdmPageLayout>
  );
}
