"use client";

/**
 * layoutMng — 전문 레이아웃(TSK-05-02). 정본: docs/mdm/screens/layoutMng/layoutMng_기능설계서.md, design.md §2·§6.5.
 *
 * 전문 = EAI 헤더(적층) + 업무 본문. 헤더 구성은 헤더 단위로만 쌓고 빼며 헤더 안 항목의 구성·길이는 여기서 바꾸지 않는다 —
 * 상수만 재정의한다(수용 기준 3). 오프셋·총 길이는 편집 즉시 화면에서 다시 계산하고(불변 I11), 저장값은 서버가 다시 계산한다.
 * EAI 를 고르면 그 EAI 표준 헤더를 헤더 구성 맨 앞에 넣는다(서버도 같은 규칙, I14). OBJECT_ID = screenId = BPMN process id.
 *
 * TSK-05-03: 오른쪽 패널 위에 탭 셋 — `편집`(05-02 화면 그대로, 기본) · `등록 검증·샘플 전문`(validate·execute, 현재 편집 상태로) ·
 * `버전·영향도`(view 가 준 이력, 행을 고르면 export 스냅샷, 영향 전문 search target=IMPACT). 목록 선택은 요청을 늘리지 않는다.
 *
 * D-144 3단계: 버전 선택·시각 T·버전 버튼(VersionActionBar). 편집은 내 DRAFT 만 — 저장은 버전을 만들지 않고 고른 DRAFT 를
 * `ver`·`rowVersion` 으로 덮어쓴다. 신규 저장은 v1.000 DRAFT 를 만든다. T 를 바꾸면 그 시각의 헤더 버전으로 다시 읽는다.
 * 버전은 문자열(`"1.001"`)로만 다루고 비교·키는 `normVer` 로 맞춘다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@dk-oasis/shared/form";
import {
  ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { GridLimitNotice } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Tabs } from "@dk-oasis/shared/tabs";
import { exportToExcel } from "@dk-oasis/shared/utils";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { ColumnPickModal } from "@/layout/ColumnPickModal";
import { LayoutItemDetail } from "@/layout/LayoutItemDetail";
import { precheck } from "@/layout/fill-kind";
import { downloadText } from "@/layout/download";
import { newColumnRow, newFillerRow } from "@/layout/item-rows";
import { placeMessage, reorder, renumber, summaryText } from "@/layout/layout-calc";
import { SNAPSHOT_EXCEL_COLUMNS, snapshotExcelRows, snapshotJsonText } from "@/layout/snapshot-export";
import { hint, sectionBody, sectionTitle } from "@/layout/styles";
import type { ColumnInfo, HeaderStackRow, LayoutItemRow, LayoutVersionRow, UnitRow } from "@/layout/types";
import {
  cancelLayoutConfirm, deleteLayoutDraft, handoverLayoutDraft, lockLayoutDraft, newLayoutVersion, unlockLayoutDraft, type LayoutVersionResult,
} from "@/layout/version-api";
import { versionActionState } from "@/layout/version-rows";
import {
  DraftLockBadge, HANDOVER_AVAILABLE, MdmPageLayout, VersionActionBar, VersionStatusBadge, fmtVer, normVer, openMdmPage, type MdmVersionStatus,
} from "@/shell";
import {
  exportSnapshot, renderSample, saveLayout, searchColumns, searchHeaders, searchImpact, searchLayouts, loadHeaderPick, loadLayoutOptions, validateLayout, viewLayout,
} from "./api";
import { BodyItemGrid } from "./components/BodyItemGrid";
import { ConstEditModal } from "./components/ConstEditModal";
import { HeaderPickModal } from "./components/HeaderPickModal";
import { HeaderStackGrid } from "./components/HeaderStackGrid";
import { ImpactPanel } from "./components/ImpactPanel";
import { LayoutCheckPanel } from "./components/LayoutCheckPanel";
import { LayoutBasicForm } from "./components/LayoutBasicForm";
import { LayoutList } from "./components/LayoutList";
import { SampleMessagePanel } from "./components/SampleMessagePanel";
import { VersionPanel } from "./components/VersionPanel";
import type {
  CheckResult, ConstRow, EaiRow, ExportResult, HeaderOption, ImpactRow, LayoutDraft, LayoutRow, SampleResult, SearchFilters, SystemRow, ViewHeader,
  ViewResult,
} from "./types";

const SCREEN_ID = "layoutMng";
const CONFIRM_PAGE = "dmb/layoutConfirm";

type Mode = "none" | "edit" | "new";
type Tab = "edit" | "check" | "version";

const TAB_ITEMS = [
  { key: "edit", label: <span data-testid="layout-tab-edit">편집</span> },
  { key: "check", label: <span data-testid="layout-tab-check">등록 검증·샘플 전문</span> },
  { key: "version", label: <span data-testid="layout-tab-version">버전·영향도</span> },
];

const EMPTY_DRAFT: LayoutDraft = {
  layoutId: null, ver: null, rowVersion: null, asOf: null, layoutName: "", eaiCode: null, sndSystem: null, rcvSystem: null,
};
const EMPTY_FILTERS: SearchFilters = { keyword: "", headerLayoutId: "", sndSystem: "", rcvSystem: "" };

let keySeq = 0;
const newKey = (prefix: string) => `${prefix}${++keySeq}`;

function stackRow(h: HeaderOption | ViewHeader): HeaderStackRow {
  if ("LAYOUT_ID" in h) {
    return { KEY: newKey("h"), SEQ: 0, HEADER_LAYOUT_ID: h.LAYOUT_ID, HEADER_NAME: h.LAYOUT_NAME, EAI_CODE: h.EAI_CODE ?? null,
      TOTAL_LENGTH: h.TOTAL_LENGTH, items: (h.items ?? []).map((i) => ({ ...i, OVERRIDE_VALUE: null })) };
  }
  return { KEY: newKey("h"), SEQ: 0, HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID, HEADER_NAME: h.HEADER_NAME, EAI_CODE: h.EAI_CODE ?? null,
    TOTAL_LENGTH: h.TOTAL_LENGTH ?? null, HEADER_VER: h.HEADER_VER ?? null, HEADER_STATE: h.HEADER_STATE ?? null, items: h.items ?? [] };
}

function withSeq(stack: HeaderStackRow[]): HeaderStackRow[] {
  return stack.map((h, i) => ({ ...h, SEQ: i + 1 }));
}

export default function LayoutMngPage() {
  const rbac = useUserButtonRbac();
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const canValidate = canDoButton(rbac, SCREEN_ID, "validate");
  const canExecute = canDoButton(rbac, SCREEN_ID, "execute");
  const me = rbac.userId;
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<LayoutRow[]>([]);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [rowsTotal, setRowsTotal] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useState(false);
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [eais, setEais] = useState<EaiRow[]>([]);
  const [headerFilter, setHeaderFilter] = useState<HeaderOption[]>([]);
  const [catalog, setCatalog] = useState<HeaderOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [draft, setDraft] = useState<LayoutDraft>(EMPTY_DRAFT);
  // ── D-144 3단계 버전 ──
  const [view, setView] = useState<ViewResult | null>(null);
  /** 시각 T(null = 지금). 다른 전문을 열어도 유지한다. */
  const [asOf, setAsOf] = useState<string | null>(null);
  /** 사용자가 고른 편집 대상 버전(null = 서버가 고른다 — 내 DRAFT 우선, 없으면 T 시점 현재). */
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [handoverTo, setHandoverTo] = useState("");
  /** view 요청 순번 — T 를 연달아 바꾸면 늦게 온 옛 응답을 버린다. */
  const viewSeq = useRef(0);
  /** 헤더 단건 조회 응답이 늦게 도착했을 때, 그 사이 EAI·전문이 바뀌었는지 가리는 순번. */
  const headerSeq = useRef(0);
  const [stack, setStack] = useState<HeaderStackRow[]>([]);
  const [body, setBody] = useState<LayoutItemRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [picker, setPicker] = useState<"none" | "column" | "header">("none");
  const [constKey, setConstKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // ── TSK-05-03 탭 ──
  const [tab, setTab] = useState<Tab>("edit");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [versions, setVersions] = useState<LayoutVersionRow[]>([]);
  /** 버전·영향도 탭에서 고른 스냅샷 버전(편집 대상 버전과 따로 둔다). */
  const [snapshotVersion, setSnapshotVersion] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ExportResult | null>(null);
  const [impacts, setImpacts] = useState<ImpactRow[] | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  const selected = view?.selected ?? null;
  // 신규(mode === "new")는 저장하면 v1.000 DRAFT 가 생긴다. 기존 전문은 서버가 편집 가능(내 DRAFT)이라고 한 버전만 고친다.
  const readOnly = mode === "none" || !canEdit || busy || (mode === "edit" && !view?.editable);
  const versionActions = versionActionState(view ?? {}, me, (a) => canDoButton(rbac, SCREEN_ID, a));
  const mine = selected?.STATUS === "DRAFT" && !!me && selected.OWNER_ID === me;
  /** 버전 액션·확정 인계에 보내는 고른 버전 — 정규 문자열(`"1.1"` 로 와도 `"1.100"`). */
  const selVer = selected ? normVer(selected.VER) ?? selected.VER : "";

  // ── 즉시 재계산(I11) — 헤더 길이는 판정 시각 T 의 헤더 TOTAL_LENGTH, 본문은 항목에서 ──
  // 헤더 길이가 null(그 시각에 확정 헤더 없음)이면 그 뒤 오프셋·합계는 null 이다 — 0 으로 바꿔 더하지 않는다.
  const headerTotals = useMemo(() => stack.map((h) => h.TOTAL_LENGTH), [stack]);
  const placed = useMemo(() => placeMessage(headerTotals, body), [headerTotals, body]);
  const placedStack = useMemo(() => stack.map((h, i) => ({ ...h, OFFSET: placed.headerOffsets[i] })), [stack, placed]);
  const totalText = summaryText(headerTotals, placed.rows);
  const selectedItem = placed.rows.find((r) => r.KEY === selectedKey) ?? null;

  // ── 조회 ──
  // [조회] 는 첫 조회 상한(R1)을 걸고, [전체 보기] 는 상한 없이 받는다. 저장·버전 액션 뒤 재조회는 지금 모드를 따른다.
  const runSearch = useCallback(async (f: SearchFilters, all = false) => {
    setLoading(true);
    try {
      const out = await searchLayouts(f, all ? undefined : FIRST_SEARCH_LIMIT);
      setRows(out.layouts ?? []);
      setRowsTotal(out.truncated ? (out.totalCount ?? null) : null);
      setShowAll(all);
      setSystems(out.systems ?? []);
      setEais(out.eais ?? []);
      setHeaderFilter(out.headers ?? []);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 첫 진입 자동 목록 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청).
  // 진입 때 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음). 목록(rows)은 채우지 않는다.
  useEffect(() => {
    let alive = true;
    loadLayoutOptions()
      .then((out) => {
        if (!alive) return;
        setSystems(out.systems ?? []);
        setEais(out.eais ?? []);
        setHeaderFilter(out.headers ?? []);
      })
      .catch((e) => {
        if (alive) setErrorMessage(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const ensureCatalog = useCallback(async (): Promise<HeaderOption[]> => {
    if (catalog) return catalog;
    const list = await searchHeaders("");
    setCatalog(list);
    return list;
  }, [catalog]);

  // ── 행 선택·버전 선택·T 변경 → view(ver 를 빼면 서버가 고른다) ──
  const openLayout = useCallback(async (id: number, ver: string | null, at: string | null) => {
    const seq = ++viewSeq.current;
    setBusy(true);
    try {
      const out = await viewLayout(id, ver, at);
      if (seq !== viewSeq.current) return;
      const l = out.layout;
      if (!l) return;
      const sel = out.selected ?? null;
      setSelectedId(l.LAYOUT_ID);
      setView(out);
      setSelectedVersion(ver);
      setDraft({ layoutId: l.LAYOUT_ID, ver: sel ? normVer(sel.VER) ?? sel.VER : null, rowVersion: sel?.ROW_VERSION ?? null, asOf: at,
        layoutName: l.LAYOUT_NAME, eaiCode: l.EAI_CODE ?? null, sndSystem: l.SND_SYSTEM ?? null, rcvSystem: l.RCV_SYSTEM ?? null });
      setStack(withSeq((out.headers ?? []).map((h) => stackRow(h))));
      setBody(renumber((out.items ?? []).map((i) => ({ ...i, KEY: newKey("b") }))));
      setUnits(out.units ?? []);
      setSelectedKey(null);
      setVersions(out.versions ?? []);
      setSnapshotVersion(null);
      setSnapshot(null);
      setCheck(null);
      setSample(null);
      setMode("edit");
    } catch (e) {
      if (seq === viewSeq.current) setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === viewSeq.current) setBusy(false);
    }
  }, []);

  const startNew = () => {
    headerSeq.current += 1;
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT, asOf });
    setView(null);
    setSelectedVersion(null);
    setStack([]);
    setBody([]);
    setSelectedKey(null);
    setVersions([]);
    setSnapshotVersion(null);
    setSnapshot(null);
    setCheck(null);
    setSample(null);
    setTab("edit");
    setMode("new");
  };

  // ── EAI 선택 → 표준 헤더를 1번에(I14) ──
  const changeEai = async (code: string | null) => {
    setDraft((d) => ({ ...d, eaiCode: code }));
    const seq = ++headerSeq.current;
    const view = viewSeq.current;
    const eai = eais.find((e) => e.EAI_CODE === code);
    if (!eai?.HEADER_LAYOUT_ID || stack.some((h) => h.HEADER_LAYOUT_ID === eai.HEADER_LAYOUT_ID)) return;
    try {
      const list = await ensureCatalog();
      if (!list.some((o) => o.LAYOUT_ID === eai.HEADER_LAYOUT_ID)) return;
      // 선택 목록에는 항목이 없다 — 표준 헤더 한 건만 항목과 함께 받는다
      const h = await loadHeaderPick(eai.HEADER_LAYOUT_ID);
      if (seq !== headerSeq.current || view !== viewSeq.current) return;
      if (h) setStack((s) => (s.some((x) => x.HEADER_LAYOUT_ID === h.LAYOUT_ID) ? s : withSeq([stackRow(h), ...s])));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const openHeaderPick = async () => {
    try {
      await ensureCatalog();
      setPicker("header");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  // 팝업 목록에는 항목이 없다 — 고른 헤더의 항목을 한 건으로 받아 쌓는다.
  const pickHeader = async (h: HeaderOption) => {
    setPicker("none");
    const view = viewSeq.current;
    try {
      const detail = await loadHeaderPick(h.LAYOUT_ID);
      if (view !== viewSeq.current) return;
      if (!detail) {
        setErrorMessage("선택한 헤더의 확정 버전을 찾을 수 없습니다.");
        return;
      }
      setStack((s) => (s.some((x) => x.HEADER_LAYOUT_ID === detail.LAYOUT_ID) ? s : withSeq([...s, stackRow(detail)])));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  // ── 본문 항목 ──
  const addColumn = (c: ColumnInfo) => {
    const key = newKey("b");
    setBody((b) => renumber([...b, newColumnRow(key, c)]));
    setSelectedKey(key);
  };

  const addFiller = () => {
    const key = newKey("b");
    setBody((b) => renumber([...b, newFillerRow(key)]));
    setSelectedKey(key);
  };

  const updateItem = (next: LayoutItemRow) => setBody((b) => b.map((r) => (r.KEY === next.KEY ? next : r)));

  const overrideRows = (): ConstRow[] => stack.flatMap((h) => h.items
    .filter((i) => i.FILL_KIND === "CONST" && i.OVERRIDE_VALUE && i.OVERRIDE_VALUE.trim() !== "")
    .map((i) => ({ HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID, HEADER_SEQ: i.SEQ, CONST_VALUE: String(i.OVERRIDE_VALUE) })));

  // ── 저장 ──
  const handleSave = async () => {
    const issues = precheck(placed.rows);
    if (issues.length) {
      setErrorMessage(`전문 저장 거부: ${issues.join("; ")}`);
      return;
    }
    const consts = overrideRows();
    setBusy(true);
    try {
      // 저장은 버전을 만들지 않는다 — 고른 DRAFT(ver)를 rowVersion 으로 덮어쓴다. 신규는 응답이 v1.000·rowVersion 0 이다.
      const out = await saveLayout({ ...draft, ver: draft.ver, rowVersion: draft.rowVersion, asOf }, stack, consts, placed.rows);
      const savedVer = out.ver ?? draft.ver;
      setDraft((d) => ({ ...d, layoutId: out.layoutId ?? d.layoutId, ver: savedVer, rowVersion: out.rowVersion ?? d.rowVersion }));
      setMode("edit");
      showMessage({ message: "저장했습니다.", alertType: "info", toast: true });
      await runSearch(filters, showAll);
      if (out.layoutId) await openLayout(out.layoutId, savedVer, asOf);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── 등록 검증·샘플 전문(TSK-05-03) — 현재 편집 상태를 서버가 검사·직렬화한다. 쓰지 않는다 ──
  const runValidate = async () => {
    setBusy(true);
    try {
      setCheck(await validateLayout({ ...draft, asOf }, stack, overrideRows(), placed.rows));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runRender = async () => {
    setBusy(true);
    try {
      setSample(await renderSample({ ...draft, asOf }, stack, overrideRows(), placed.rows, samples));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── 버전·영향도(TSK-05-03) — export 는 버전 탭에서만 부른다 ──
  const loadSnapshot = useCallback(async (layoutId: number, version: string, at: string | null) => {
    setSnapshotVersion(version);
    try {
      setSnapshot(await exportSnapshot(layoutId, version, at));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (tab === "version" && selectedId != null && versions.length > 0 && snapshotVersion == null) {
      void loadSnapshot(selectedId, normVer(versions[0].VER) ?? versions[0].VER, asOf);
    }
  }, [tab, selectedId, versions, snapshotVersion, asOf, loadSnapshot]);

  const downloadJson = () => {
    if (!snapshot?.snapshot || !snapshot.fileBase) return;
    downloadText(`${snapshot.fileBase}.json`, snapshotJsonText(snapshot.snapshot), "application/json");
  };

  const downloadExcel = async () => {
    if (!snapshot?.snapshot || !snapshot.fileBase) return;
    try {
      await exportToExcel(snapshotExcelRows(snapshot.snapshot, snapshot.names ?? {}), `${snapshot.fileBase}.xlsx`, "snapshot",
        SNAPSHOT_EXCEL_COLUMNS);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const runImpact = async (keyword: string) => {
    setImpactLoading(true);
    try {
      setImpacts(await searchImpact(keyword));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setImpactLoading(false);
    }
  };

  // ── 시각 T·버전 선택 ──
  const changeAsOf = (at: string | null) => {
    setAsOf(at);
    setDraft((d) => ({ ...d, asOf: at }));
    if (mode === "edit" && selectedId != null) void openLayout(selectedId, selectedVersion, at);
  };

  const selectVersion = (ver: string) => {
    if (selectedId != null) void openLayout(selectedId, ver, asOf);
  };

  // ── 버전 버튼 — 성공하면 결과 버전(삭제는 서버가 고르는 버전)으로 다시 읽는다 ──
  const runVersionAction = async (call: () => Promise<LayoutVersionResult>, rereadVer: (r: LayoutVersionResult) => string | null) => {
    if (selectedId == null) return;
    const id = selectedId;
    setBusy(true);
    try {
      const r = await call();
      await runSearch(filters, showAll);
      await openLayout(id, rereadVer(r), asOf);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const sameOrResult = (r: LayoutVersionResult) => normVer(r.ver) ?? (selVer || null);

  const constHeader = placedStack.find((h) => h.KEY === constKey) ?? null;
  const systemOptions = [{ value: "", label: "전체" }, ...systems.map((s) => ({ value: s.SYSTEM_CODE, label: s.SYSTEM_NAME }))];
  const headerOptions = [{ value: "", label: "전체" }, ...headerFilter.map((h) => ({ value: String(h.LAYOUT_ID), label: h.LAYOUT_NAME }))];

  return (
    <MdmPageLayout
      group="dmb"
      screenId={SCREEN_ID}
      title="전문 레이아웃"
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: () => void runSearch(filters) },
        ...(canEdit ? [
          { id: "btn_new", label: "신규", action: "save", disabled: busy, onClick: startNew },
          { id: "btn_save", label: "저장", type: "save" as const, action: "save", disabled: readOnly, onClick: () => void handleSave() },
        ] : []),
      ]}
    >
      <SearchArea onSearch={() => void runSearch(filters)}>
        <SearchField label="검색어">
          <Input data-testid="layout-search-keyword" aria-label="검색어" placeholder="전문 이름" value={filters.keyword}
            onChange={(v) => setFilters((f) => ({ ...f, keyword: v }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(filters);
            }} />
        </SearchField>
        <SearchField label="헤더" type="select" value={filters.headerLayoutId} options={headerOptions}
          onChange={(v) => setFilters((f) => ({ ...f, headerLayoutId: v }))} />
        <SearchField label="송신 시스템" type="select" value={filters.sndSystem} options={systemOptions}
          onChange={(v) => setFilters((f) => ({ ...f, sndSystem: v }))} />
        <SearchField label="수신 시스템" type="select" value={filters.rcvSystem} options={systemOptions}
          onChange={(v) => setFilters((f) => ({ ...f, rcvSystem: v }))} />
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dmb.layoutMng">
        <ContentPanel width="40%">
          <LayoutList rows={rows} selectedId={selectedId} loading={loading} onSelect={(r) => void openLayout(r.LAYOUT_ID, null, asOf)}
            titleExtra={(
              <GridLimitNotice shownCount={rows.length} totalCount={rowsTotal} onShowAll={() => void runSearch(filters, true)}
                disabled={loading} testId="layout-list-limit" />
            )} />
        </ContentPanel>
        <ContentPanel>
          <div style={{ overflowY: "auto", height: "100%" }}>
            <Tabs items={TAB_ITEMS} activeKey={tab} onChange={(k) => setTab(k as Tab)} style={{ padding: "0 var(--spacing-md)" }} />
            {tab === "check" && (mode === "none" ? (
              <p style={{ ...hint, padding: "var(--spacing-md)" }}>전문을 고르거나 [신규] 를 누르세요.</p>
            ) : (
              <>
                <p style={sectionTitle}>등록 검증</p>
                <div style={sectionBody}>
                  <LayoutCheckPanel result={check} busy={busy} canRun={canValidate} onRun={() => void runValidate()} />
                </div>
                <p style={sectionTitle}>샘플 전문</p>
                <div style={sectionBody}>
                  <SampleMessagePanel items={placed.rows} values={samples} result={sample} busy={busy} canRun={canExecute}
                    onChange={(phys, v) => setSamples((m) => ({ ...m, [phys]: v }))} onRender={() => void runRender()} />
                </div>
              </>
            ))}
            {tab === "version" && (
              <div style={sectionBody}>
                {mode === "none" ? (
                  <p style={hint}>전문을 고르면 버전 이력이 보입니다.</p>
                ) : (
                  <VersionPanel versions={versions} selectedVersion={snapshotVersion} snapshot={snapshot} busy={busy}
                    onSelectVersion={(v) => selectedId != null && void loadSnapshot(selectedId, v, asOf)}
                    onDownloadJson={downloadJson} onDownloadExcel={() => void downloadExcel()} />
                )}
                <ImpactPanel rows={impacts} loading={impactLoading} onSearch={(k) => void runImpact(k)} />
              </div>
            )}
            {tab !== "edit" ? null : mode === "none" ? (
              <p style={{ ...hint, padding: "var(--spacing-md)" }}>목록에서 전문을 선택하거나 [신규] 를 누르세요.</p>
            ) : (
              <>
                {mode === "edit" && selectedId != null && (
                  <div style={sectionBody}>
                    <VersionActionBar
                      ids={{
                        newMajor: "layout-ver-new-major", newMinor: "layout-ver-new-minor", delete: "layout-ver-delete", confirm: "layout-ver-confirm",
                        cancelConfirm: "layout-ver-cancel-confirm", lock: "layout-ver-lock", unlock: "layout-ver-unlock", handover: "layout-ver-handover",
                      }}
                      newVersionMode="majorMinor"
                      {...versionActions}
                      onNewMajor={() => void runVersionAction(() => newLayoutVersion(SCREEN_ID, selectedId, "MAJOR"), (r) => normVer(r.ver))}
                      onNewMinor={() => void runVersionAction(() => newLayoutVersion(SCREEN_ID, selectedId, "MINOR"), (r) => normVer(r.ver))}
                      onDelete={() => selected && void runVersionAction(
                        () => deleteLayoutDraft(SCREEN_ID, selectedId, selVer, selected.ROW_VERSION), () => null)}
                      onConfirm={() => selected && openMdmPage(CONFIRM_PAGE, { layoutId: String(selectedId), ver: selVer })}
                      onCancelConfirm={() => selected && void runVersionAction(
                        () => cancelLayoutConfirm(SCREEN_ID, selectedId, selVer, selected.ROW_VERSION), sameOrResult)}
                      onLock={() => selected && void runVersionAction(
                        () => lockLayoutDraft(SCREEN_ID, selectedId, selVer, selected.ROW_VERSION), sameOrResult)}
                      onUnlock={() => selected && void runVersionAction(
                        () => unlockLayoutDraft(SCREEN_ID, selectedId, selVer, selected.ROW_VERSION), sameOrResult)}
                      onHandover={() => {
                        if (!selected) return;
                        const target = handoverTo.trim();
                        if (!target) {
                          setErrorMessage("넘겨받을 사용자 ID 를 적으세요.");
                          return;
                        }
                        void runVersionAction(() => handoverLayoutDraft(SCREEN_ID, selectedId, selVer, selected.ROW_VERSION, target),
                          sameOrResult).then(() => setHandoverTo(""));
                      }}
                      deleteMessage={`${fmtVer(selected?.VER)} DRAFT 를 삭제할까요?`}
                      cancelConfirmMessage={`${fmtVer(selected?.VER)} 의 확정을 취소하고 작성 중인 상태로 되돌릴까요? 적용 시각이 오기 전에만 취소할 수 있습니다.`}
                      beforeHandover={(
                        <Input data-testid="layout-ver-handover-target" value={handoverTo} placeholder="넘겨받을 사용자 ID"
                          disabled={!HANDOVER_AVAILABLE || !mine || busy} onChange={setHandoverTo} style={{ width: 150 }} />
                      )}
                      trailing={selected ? (
                        <>
                          <VersionStatusBadge status={selected.STATUS as MdmVersionStatus} applyFrom={selected.APPLY_FROM ?? null} />
                          <DraftLockBadge status={selected.STATUS as MdmVersionStatus} ownerId={selected.OWNER_ID} currentUserId={me} />
                        </>
                      ) : null}
                    />
                  </div>
                )}
                <p style={sectionTitle}>기본 속성{mode === "new" ? " — 신규" : ""}</p>
                <div style={sectionBody}>
                  <LayoutBasicForm draft={draft} versions={versions} selectedVer={selected?.VER ?? null} onSelectVersion={selectVersion}
                    asOf={asOf} onAsOfChange={changeAsOf} legacy={selected?.LEGACY === "Y"} systems={systems} eais={eais} readOnly={readOnly}
                    totalText={totalText} onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
                    onEaiChange={(code) => void changeEai(code)} />
                </div>
                <div style={sectionBody}>
                  <HeaderStackGrid rows={placedStack} readOnly={readOnly} onAdd={() => void openHeaderPick()}
                    onRemove={(key) => setStack((s) => withSeq(s.filter((h) => h.KEY !== key)))}
                    onEditConst={setConstKey}
                    onReorder={(keys) => setStack((s) => withSeq(keys.map((k) => s.find((h) => h.KEY === k)).filter(
                      (h): h is HeaderStackRow => h != null)))} />
                </div>
                <div style={sectionBody}>
                  <BodyItemGrid rows={placed.rows} headerLength={placed.headerLength} selectedKey={selectedKey} readOnly={readOnly}
                    onSelect={setSelectedKey} onAddColumn={() => setPicker("column")} onAddFiller={addFiller}
                    onDelete={() => {
                      setBody((b) => renumber(b.filter((r) => r.KEY !== selectedKey)));
                      setSelectedKey(null);
                    }}
                    onReorder={(keys) => setBody((b) => reorder(b, keys))} />
                </div>
                {selectedItem && (
                  <>
                    <p style={sectionTitle}>항목 상세 — {selectedItem.SEQ}번</p>
                    <div style={sectionBody}>
                      <LayoutItemDetail item={selectedItem} units={units} readOnly={readOnly} onChange={updateItem} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </ContentPanel>
      </ContentBody>

      <ColumnPickModal open={picker === "column"} onClose={() => setPicker("none")} onPick={addColumn} search={searchColumns}
        used={body.map((r) => r.COLUMN_PHYS).filter((p): p is string => !!p)} />
      <HeaderPickModal open={picker === "header"} options={catalog ?? []} used={stack.map((h) => h.HEADER_LAYOUT_ID)}
        onClose={() => setPicker("none")}
        onPick={(h) => void pickHeader(h)} />
      <ConstEditModal header={constHeader} readOnly={readOnly} onClose={() => setConstKey(null)}
        onApply={(overrides) => {
          setStack((s) => s.map((h) => (h.KEY !== constKey ? h : {
            ...h, items: h.items.map((i) => (i.FILL_KIND === "CONST" && i.SEQ in overrides ? { ...i, OVERRIDE_VALUE: overrides[i.SEQ] } : i)),
          })));
          setConstKey(null);
        }} />
      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
