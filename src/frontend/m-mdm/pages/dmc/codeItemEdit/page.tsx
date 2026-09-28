"use client";

/**
 * codeItemEdit — 코드 편집(TSK-06-03, 카테고리 편집 TSK-06-04 를 합침 D-101). 정본:
 * docs/mdm/screens/codeItemEdit/codeItemEdit_기능설계서.md, design.md §6.8.
 *
 * 마루 코드 하나의 버전 V 모습을 [코드]·[트리]·[카테고리] 탭과 오른쪽 카테고리 미리보기로 보인다. DRAFT(소유자·편집
 * 가능)에서는 코드 행을 추가·수정·삭제·되돌리고 카테고리(REGEX·TABLE)·소속을 편집하며, RELEASED 에서는 이름·약칭·순서·
 * 설명만 경미 수정한다. [저장] 은 하나다 — 코드 행·카테고리·소속 세 그리드를 codeItemEdit `save` 한 번으로 보낸다. 저장
 * 판정(저장 검사)은 서버가 하고, 거부되면 같은 세 그리드로 validate 를 불러 코드 행 이슈는 그리드에, 카테고리 이슈는
 * 카테고리 탭에 보인다. 카테고리 조회·REGEX 미리보기는 codeCateEdit 서비스 그대로다(cate/). 트리·콤보는 시뮬레이터
 * 규칙의 FE 순수 함수다(D9). OBJECT_ID = screenId = BPMN process id = 'codeItemEdit'.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlertCircle } from "@tabler/icons-react";
import { Button, Checkbox, Select } from "@dk-oasis/shared/form";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import {
  ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Tabs } from "@dk-oasis/shared/tabs";
import { Tree } from "@dk-oasis/shared/tree";
import "@dk-oasis/shared/tree.css";
import { MdmPageLayout, VersionStatusBadge, useMdmPageParams } from "@/shell";
import {
  patchRow, previewCategory, revertRow, saveAll, searchCodes, validateAll, viewCode, type SaveChanges,
} from "./api";
import { allNodeValues, buildCodeTree, LVL_KEYS, toTreeItems, type HierRow } from "@/hier-tree";
import {
  addRow, changesOf, editCell, filterByNode, isCellEditable, pathOf, removeRow, toEditRows, undoLocal,
  type EditRow, type ServerRow,
} from "./grid-state";
import { PatchPanel, type PatchValues } from "./components/PatchPanel";
import { PreviewPanel, type PreviewMode } from "./components/PreviewPanel";
import { hint, issueText, struck, toolbar } from "./components/styles";
import { CategoryTab } from "./cate/CategoryTab";
import { PreviewPanel as CatePreviewPanel } from "./cate/components/PreviewPanel";
import { useCategoryEdit } from "./cate/useCategoryEdit";
import type { CodeSummary, Issue, PreviewResult, ViewResult } from "./types";

const SCREEN_ID = "codeItemEdit";
const COMPONENT_PATH = "dmc/codeItemEdit";
const EMPTY_TEXT = "보일 코드가 없습니다";

type Tab = "grid" | "tree" | "cate";

/** 탭 이름 — 저장 검사 이슈가 있으면 옆에 경고 아이콘. */
function tabLabel(testId: string, text: string, hasIssue = false): ReactNode {
  return (
    <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
      {text}
      {hasIssue && (
        <span data-testid={`${testId}-issue`} title="저장 검사 이슈가 있습니다" style={{ display: "inline-flex" }}>
          <IconAlertCircle size={14} color="var(--color-danger)" />
        </span>
      )}
    </span>
  );
}

const blank = (v: unknown) => v === null || v === undefined || v === "";
const same = (a: unknown, b: unknown) => (blank(a) ? "" : String(a)) === (blank(b) ? "" : String(b));

function badgeOf(row: EditRow): { label: string; bg: string; color: string } | null {
  const local = row.__local;
  const change = row.change as string | undefined;
  if (local === "deleted" || change === "REMOVED") {
    return { label: "삭제", bg: "var(--color-danger-soft)", color: "var(--color-danger)" };
  }
  if (local === "new" || change === "ADDED") {
    return { label: "추가", bg: "var(--color-success-soft)", color: "var(--color-success)" };
  }
  if (local === "edited" || change === "CHANGED") {
    return { label: "수정", bg: "var(--color-warning-soft)", color: "var(--color-warning)" };
  }
  return null;
}

export default function CodeItemEditPage({ tabId }: { tabId?: string }) {
  const rbac = useUserButtonRbac();
  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canValidate = canDoButton(rbac, SCREEN_ID, "validate");
  const canRestore = canDoButton(rbac, SCREEN_ID, "restore");
  const canExecute = canDoButton(rbac, SCREEN_ID, "execute");
  const { showMessage } = useMessage();

  const [codes, setCodes] = useState<CodeSummary[]>([]);
  const [maruCodeId, setMaruCodeId] = useState("");
  const [view, setView] = useState<ViewResult | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [issues, setIssues] = useState<Record<string, Issue[]>>({});
  const [showClosed, setShowClosed] = useState(false);
  const [tab, setTab] = useState<Tab>("grid");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [treeSel, setTreeSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cateId, setCateId] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("combo");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selected = view?.selected ?? null;
  const header = view?.header ?? null;
  const lvlCnt = header?.lvlCnt ?? 0;
  const attrLabels = useMemo(() => header?.attrLabels ?? [], [header]);
  const editable = !!selected?.editable;
  const patchable = !!selected?.patchable;
  const fail = (e: unknown) => setErrorMessage(e instanceof Error ? e.message : String(e));
  const cate = useCategoryEdit({ maruCodeId, ver: selected?.ver ?? null, codeRows: rows });
  const { load: loadCategories, reset: resetCategories, setIssues: setCateIssues } = cate;

  // 합친 저장의 세 그리드 — 저장 버튼 활성도 이것으로 판정해 보낼 것과 어긋나지 않게 한다.
  const saveChanges = useMemo<SaveChanges>(
    () => ({ rows: changesOf(rows), ...cate.changes }),
    [rows, cate.changes],
  );
  const dirty = saveChanges.rows.length + saveChanges.categories.length + saveChanges.members.length > 0;
  // 코드 그리드 __action 칸(handleRevert 포함)은 성능 때문에 columns useMemo 가 cate 변화로는 다시 그리지 않는다
  // (아래 columns useMemo 주석 참고) — 그 안의 stale 클로저가 최신 카테고리 편집 여부를 보도록 ref 로 읽는다.
  const cateChangesRef = useRef(cate.changes);
  cateChangesRef.current = cate.changes;

  // ── 조회 ──
  useEffect(() => {
    searchCodes().then((out) => setCodes(out.codes ?? [])).catch(fail);
  }, []);

  const load = useCallback(async (id: string, ver?: string | null, keepKey?: string | null) => {
    if (!id) return;
    setBusy(true);
    try {
      const out = await viewCode(id, ver);
      const editRows = toEditRows(out.rows ?? []);
      setView(out);
      setRows(editRows);
      setIssues({});
      setFilter(null);
      setTreeSel(null);
      setSelectedKey(keepKey ?? null);
      setExpanded(allNodeValues(buildCodeTree(out.rows ?? [])));
      const cates = out.categories ?? [];
      setCateId((prev) => (cates.some((c) => c.cateId === prev) ? prev
        : cates.find((c) => c.cateId === "BASE")?.cateId ?? cates[0]?.cateId ?? ""));
      // 카테고리는 코드 view 가 고른 버전으로 따로 읽는다 — 실패해도 코드 탭은 그대로 쓴다(카테고리 탭에 안내).
      await loadCategories(id, out.selected?.ver ?? null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [loadCategories]);

  useEffect(() => {
    const ver = view?.selected?.ver;
    if (!maruCodeId || !ver || !cateId) {
      setPreview(null);
      return;
    }
    previewCategory(maruCodeId, ver, cateId).then(setPreview).catch(() => setPreview(null));
  }, [view, maruCodeId, cateId]);

  // 마루 코드 화면이 [코드 편집]으로 넘긴 마루 코드·버전(openMdmPage)을 받는다(§6.10). RELEASED 도 열린다(읽기 전용).
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (!params.maruCodeId) return;
    setMaruCodeId(params.maruCodeId);
    void load(params.maruCodeId, params.ver ?? null);
  });

  const chooseCode = (id: string) => {
    setMaruCodeId(id);
    if (id) void load(id);
    else {
      setView(null);
      resetCategories();
    }
  };

  // ── 검사·저장·되돌리기 ──
  // 세 그리드를 인자로 받는다 — 셀 편집 직후에는 아직 state 에 없는 새 행으로 검사해야 한다.
  const runValidate = useCallback(async (changes: SaveChanges) => {
    const ver = view?.selected?.ver;
    if (!ver || !canValidate) return;
    try {
      const out = await validateAll(maruCodeId, ver, changes);
      const map: Record<string, Issue[]> = {};
      for (const i of out.issues ?? []) {
        const key = i.itemKey ?? "";
        (map[key] ??= []).push(i);
      }
      setIssues(map);
      setCateIssues(out.cateIssues ?? []);
    } catch {
      // 미리 보기 검사는 저장을 막지 않는다 — 판정은 save 가 한다.
    }
  }, [view, maruCodeId, canValidate, setCateIssues]);

  const handleSave = async () => {
    if (!selected) return;
    if (!dirty) {
      setErrorMessage("저장할 변경이 없습니다");
      return;
    }
    setBusy(true);
    try {
      await saveAll(maruCodeId, selected.ver, selected.rowVersion, saveChanges);
      showMessage({ message: "저장했습니다", alertType: "info", toast: true });
      await load(maruCodeId, selected.ver);
    } catch (e) {
      fail(e);
      await runValidate(saveChanges);
    } finally {
      setBusy(false);
    }
  };

  const revertNow = async (code: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await revertRow(maruCodeId, selected.ver, selected.rowVersion, code);
      showMessage({ message: "되돌렸습니다", alertType: "info", toast: true });
      await load(maruCodeId, selected.ver);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // 되돌리기는 코드 전체를 다시 조회해(load → loadCategories) 카테고리 탭의 저장 안 한 편집(카테고리·소속)이 함께
  // 사라진다. 남겨 얹는 대신(§ 결함 2, 재조회한 서버 값 위에 편집을 다시 얹는 방식은 하지 않기로 함) 버릴 편집이 있으면
  // 먼저 확인을 받는다 — 기존 화면의 확인 모달(handleDelete 와 같은 showMessage alertType="confirm")을 그대로 쓴다.
  const handleRevert = async (code: string) => {
    if (!selected) return;
    const { categories, members } = cateChangesRef.current;
    const hasCateEdits = categories.length > 0 || members.length > 0;
    if (!hasCateEdits) {
      await revertNow(code);
      return;
    }
    showMessage({
      title: "확인",
      message: "저장하지 않은 카테고리 편집이 있습니다. 되돌리면 함께 사라집니다. 계속할까요?",
      alertType: "confirm",
      onConfirm: () => void revertNow(code),
    });
  };

  const handleDelete = (row: EditRow) => {
    const cates = (row.tableCategories as string[] | undefined) ?? [];
    const apply = () => setRows((rs) => removeRow(rs, row.__key));
    if (cates.length > 0) {
      showMessage({
        title: "확인", message: `카테고리 ${cates.length}개에서 함께 빠집니다. 삭제할까요?`, alertType: "confirm", onConfirm: apply,
      });
      return;
    }
    apply();
  };

  const handlePatch = async (values: PatchValues) => {
    const row = rows.find((r) => r.__key === selectedKey)?.__server;
    if (!row || !selected) return;
    setBusy(true);
    try {
      await patchRow({
        maruCodeId, code: row.code, fromVer: row.fromVer, name: values.name || null,
        alterName: values.alterName || null, seq: values.seq.trim() === "" ? null : Number(values.seq),
        description: values.description || null,
      });
      showMessage({ message: "경미 수정했습니다", alertType: "info", toast: true });
      await load(maruCodeId, selected.ver, row.code);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = () => {
    const defaults: Record<string, unknown> = {};
    if (filter) pathOf(filter, rows).forEach((v, i) => { if (i < LVL_KEYS.length) defaults[LVL_KEYS[i]] = v; });
    setRows((rs) => addRow(rs, defaults));
  };

  // ── 그리드 ──
  const closedRows = useMemo<EditRow[]>(() => (view?.closed ?? []).map((r: ServerRow) => ({
    ...r, __key: `__closed_${r.code}`, __local: "none", __server: null, __closed: true,
  })), [view]);
  // 변경·동작 칸은 값 없이 행 상태로 그린다. 상태를 그 칸 값으로 실어야 ag-grid 가 행 갱신 때 두 칸을 다시 그린다
  // (값이 그대로인 칸은 다시 그리지 않아 [취소]·"삭제" 배지가 저장 전에 안 보였다).
  const visibleRows = useMemo(() => [
    ...filterByNode(rows, filter),
    ...(showClosed ? filterByNode(closedRows, filter) : []),
  ].map((r) => {
    const state = `${r.__local}|${String(r.change ?? "")}`;
    return { ...r, __change: state, __action: state };
  }), [rows, closedRows, filter, showClosed]);

  const columns = useMemo<GridColumn[]>(() => {
    const cell = (key: string, header: string, width: number, extra: Partial<GridColumn> = {}): GridColumn => ({
      key, header, width,
      editable: (row) => isCellEditable(editable, row as EditRow, key),
      render: (value, row) => {
        if (row.__closed) return <span style={{ color: "var(--color-text-disabled)" }}>{String(value ?? "")}</span>;
        const prev = (row.prev as Record<string, unknown> | null | undefined)?.[key];
        if (row.change === "CHANGED" && row.__local !== "new" && prev !== undefined && !same(prev, value)) {
          return <><span style={struck}>{String(prev ?? "")}</span>{String(value ?? "")}</>;
        }
        return String(value ?? "");
      },
      ...extra,
    });
    const cols: GridColumn[] = [
      cell("code", "코드", 150),
      cell("name", "이름", 160),
      cell("alterName", "약칭", 110),
      cell("seq", "순서", 70, { align: "right", cellEditor: "number" }),
      ...LVL_KEYS.slice(0, lvlCnt).map((k, i) => cell(k, `${i + 1}차`, 120)),
      ...attrLabels.map((a) => cell(`attr${String(a.no).padStart(2, "0")}`, a.label, 120)),
      cell("description", "설명", 180),
      {
        key: "__change", header: "변경", width: 220, tooltip: false,
        render: (_v, row) => {
          const r = row as EditRow;
          const badge = badgeOf(r);
          const rowIssues = issues[r.code] ?? [];
          return (
            <span>
              {badge && <GridBadge label={badge.label} bg={badge.bg} color={badge.color} />}
              {rowIssues.length > 0 && (
                <span data-testid={`code-row-issue-${r.code}`} style={issueText}
                  title={rowIssues.map((i) => i.code).join(", ")}>
                  {rowIssues.map((i) => i.message).join(" · ")}
                </span>
              )}
            </span>
          );
        },
      },
    ];
    if (editable) {
      cols.push({
        key: "__action", header: "동작", width: 110, align: "center", tooltip: false,
        render: (_v, row) => {
          const r = row as EditRow;
          if (r.__closed) {
            return canRestore ? <Button size="mini" onClick={() => void handleRevert(r.code)}>되돌리기</Button> : null;
          }
          if (r.__local !== "none") {
            return <Button size="mini" onClick={() => setRows((rs) => undoLocal(rs, r.__key))}>취소</Button>;
          }
          if (r.change === "ADDED" || r.change === "CHANGED") {
            return canRestore ? <Button size="mini" onClick={() => void handleRevert(r.code)}>되돌리기</Button> : null;
          }
          return <Button size="mini" onClick={() => handleDelete(r)}>삭제</Button>;
        },
      });
    }
    return cols;
    // 핸들러는 렌더마다 새로 만들어지지만 열 모양은 아래 값에만 달려 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, lvlCnt, attrLabels, issues, canRestore, selected]);

  // ── 트리 ──
  const treeNodes = useMemo(() => buildCodeTree(rows.filter((r) => r.__local !== "deleted" && r.code !== "")
    .map((r): HierRow => {
      const h: HierRow = { code: r.code, name: blank(r.name) ? null : String(r.name), seq: blank(r.seq) ? null : Number(r.seq) };
      for (const k of LVL_KEYS) h[k] = blank(r[k]) ? null : String(r[k]);
      return h;
    })), [rows]);
  const treeItems = useMemo(() => toTreeItems(treeNodes), [treeNodes]);
  const filterIsGroup = useMemo(() => {
    if (!filter) return false;
    const find = (ns: typeof treeNodes): boolean => ns.some((n) => (n.value === filter ? n.children.length > 0 : find(n.children)));
    return find(treeNodes);
  }, [filter, treeNodes]);

  const patchRowValue = useMemo(() => rows.find((r) => r.__key === selectedKey)?.__server ?? null, [rows, selectedKey]);
  const versions = view?.versions ?? [];
  const codeHasIssue = Object.values(issues).some((l) => l.length > 0);
  const cateHasIssue = cate.otherIssues.length > 0 || Object.keys(cate.issuesByCate).length > 0;

  return (
    <MdmPageLayout
      group="dmc"
      screenId={SCREEN_ID}
      title="코드 편집"
      buttons={[
        {
          id: "btn_view", label: "조회", type: "primary", action: "view",
          onClick: () => (maruCodeId ? void load(maruCodeId, selected?.ver) : void searchCodes().then((o) => setCodes(o.codes ?? []))),
        },
        ...(editable ? [{
          id: "btn_save", label: "저장", type: "save" as const, action: "save", disabled: busy || !dirty,
          onClick: () => void handleSave(),
        }] : []),
      ]}
    >
      <SearchArea onSearch={() => void load(maruCodeId, selected?.ver)}>
        <SearchField label="마루 코드">
          <Select data-testid="code-maru-select" value={maruCodeId} placeholder="마루 코드를 고르세요"
            options={codes.map((c) => ({ value: c.maruCodeId, label: `${c.maruCodeId} ${c.maruCodeName}` }))}
            onChange={chooseCode} />
        </SearchField>
        <SearchField label="버전">
          <Select data-testid="code-ver-select" value={selected?.ver ?? ""} disabled={versions.length === 0}
            options={versions.map((v) => ({ value: v.ver, label: `${v.display} ${v.status}` }))}
            onChange={(v) => void load(maruCodeId, v)} />
        </SearchField>
        <SearchField label="닫힌 코드">
          <span data-testid="code-closed-toggle">
            <Checkbox label="닫힌 코드 보기" checked={showClosed} onChange={setShowClosed} />
          </span>
        </SearchField>
      </SearchArea>

      {selected && (
        <div style={toolbar}>
          <VersionStatusBadge status={selected.status}
            applyFrom={versions.find((v) => v.ver === selected.ver)?.applyFrom ?? null} />
          <span style={hint}>
            {editable ? `편집 가능 · 소유자 ${selected.ownerId ?? ""}` : "읽기 전용 · diff 보기"}
          </span>
          <span style={hint} data-testid="code-row-version">{`row_version = ${selected.rowVersion}`}</span>
          {selected.warning === "MULTIPLE_UNAPPLIED" && (
            <span style={issueText}>미적용 버전이 2개입니다. 하나를 삭제하세요</span>
          )}
          {header?.sourceKind === "EXTERNAL" && <span style={hint}>원천이 EXTERNAL 이라 조회 전용입니다</span>}
        </div>
      )}

      <ContentBody root resizable storageKey="mdm.dmc.codeItemEdit">
        <ContentPanel>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Tabs activeKey={tab} onChange={(k) => setTab(k as Tab)} items={[
              { key: "grid", label: tabLabel("code-tab-grid", "코드", codeHasIssue) },
              { key: "tree", label: tabLabel("code-tab-tree", "트리") },
              { key: "cate", label: tabLabel("code-tab-cate", "카테고리", cateHasIssue) },
            ]} />
            {tab === "grid" && (
              <div data-testid="code-grid" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <GridPanel
                    title="코드"
                    count={visibleRows.length}
                    titleExtra={filter ? (
                      <span data-testid="code-filter-chip" style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
                        <GridBadge label={filterIsGroup ? `${filter} 아래` : `${filter}만`} strong />
                        <Button data-testid="code-filter-clear" size="mini" onClick={() => setFilter(null)}>
                          ✕ 거르기 풀기
                        </Button>
                      </span>
                    ) : undefined}
                    headerExtra={editable && canSave ? (
                      <Button data-testid="code-add" size="sm" disabled={busy} onClick={handleAdd}>코드 추가</Button>
                    ) : undefined}
                  >
                    <AgDataGrid
                      columns={columns}
                      data={visibleRows}
                      rowKey="__key"
                      singleClickEdit
                      stopEditingWhenCellsLoseFocus
                      highlightedRowKey={selectedKey}
                      onRowClick={(row) => {
                        // 행 선택은 경미 수정 패널만 쓴다. DRAFT 편집 중에 선택을 바꾸면 그리드가 다시 그려져
                        // 한 번 클릭 편집 시작과 겹친다(E2E T4 실측) — RELEASED(경미 수정 가능)에서만 고른다.
                        if (patchable) setSelectedKey(String(row.__key));
                      }}
                      onCellValueChanged={({ rowKey, field, newValue }) => {
                        const next = editCell(rows, String(rowKey), field, newValue);
                        setRows(next);
                        if (field.startsWith("lvl") || field === "code") void runValidate({ ...saveChanges, rows: changesOf(next) });
                      }}
                      getRowClassExtra={(row) => (row.__closed ? "code-item-edit__row--closed" : undefined)}
                      loading={busy}
                      loadingMessage="조회 중..."
                      emptyMessage={EMPTY_TEXT}
                      emptyTestId="code-grid-empty"
                    />
                  </GridPanel>
                </div>
              </div>
            )}
            {tab === "tree" && (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--spacing-sm)" }}>
                <div style={toolbar}>
                  <Button data-testid="code-tree-to-grid" size="sm" disabled={!treeSel}
                    onClick={() => { setFilter(treeSel); setTab("grid"); }}>
                    이 노드로 편집
                  </Button>
                  <Button size="sm" onClick={() => setExpanded(allNodeValues(treeNodes))}>모두 펴기</Button>
                  <Button size="sm" onClick={() => setExpanded([])}>모두 접기</Button>
                </div>
                {lvlCnt === 0 && <p style={hint}>계층을 쓰지 않는 마루 코드라 모든 코드가 한 단계에 순서(seq)대로 보입니다.</p>}
                <div data-testid="code-tree">
                  <Tree items={treeItems} expandedItems={expanded} selectedItems={treeSel ? [treeSel] : []}
                    onExpandedItemsChange={(_e, next) => setExpanded(next.map(String))}
                    onSelectedItemsChange={(_e, id) => setTreeSel(id)} />
                </div>
              </div>
            )}
            {tab === "cate" && (
              // 카테고리 추가·닫기·REGEX 편집·소속 이동은 codeItemEdit save 로 함께 저장되므로 그 save 권한(canSave)
              // 하나로 판정한다(codeCateEdit OBJECT 의 save 권한을 따로 보지 않는다, § 결함 3). codeCateEdit 의
              // restore 권한은 서버 restore 를 직접 부르는 카테고리 되돌리기(서버 행)를 위한 것이라 이 판정과
              // 분리해 둔다 — 이 화면에는 그 되돌리기 버튼이 아직 없다.
              <CategoryTab cate={cate} loaded={!!view && !!selected} editable={editable} canEdit={canSave}
                rowVersion={selected?.rowVersion ?? null} />
            )}
          </div>
        </ContentPanel>

        <ContentBody direction="column" width="34%" resizable storageKey="mdm.dmc.codeItemEdit.right">
          <ContentPanel>
            {/* 미리보기 자리는 하나다 — 코드·트리 탭은 저장된 정의 기준, 카테고리 탭은 고른 카테고리의 후보 정의 기준. */}
            {view && selected && tab !== "cate" && (
              <PreviewPanel maruCodeId={maruCodeId} lvlCnt={lvlCnt} categories={view.categories ?? []}
                cateId={cateId} onCateChange={setCateId} mode={previewMode} onModeChange={setPreviewMode}
                result={preview} />
            )}
            {view && selected && tab === "cate" && cate.view && (
              <CatePreviewPanel defKind={cate.selectedRow?.defKind ?? null} result={cate.preview} />
            )}
          </ContentPanel>
          {patchable && (
            <ContentPanel>
              <PatchPanel row={patchRowValue} lvlCnt={lvlCnt} attrLabels={attrLabels} canPatch={canExecute}
                busy={busy} onSave={(v) => void handlePatch(v)} />
            </ContentPanel>
          )}
        </ContentBody>
      </ContentBody>

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
