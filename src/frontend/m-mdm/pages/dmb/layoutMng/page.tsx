"use client";

/**
 * layoutMng — 전문 레이아웃(TSK-05-02). 정본: docs/mdm/screens/layoutMng/layoutMng_기능설계서.md, design.md §2·§6.5.
 *
 * 전문 = EAI 헤더(적층) + 업무 본문. 헤더 구성은 헤더 단위로만 쌓고 빼며 헤더 안 항목의 구성·길이는 여기서 바꾸지 않는다 —
 * 상수만 재정의한다(수용 기준 3). 오프셋·총 길이는 편집 즉시 화면에서 다시 계산하고(불변 I11), 저장값은 서버가 다시 계산한다.
 * EAI 를 고르면 그 EAI 표준 헤더를 헤더 구성 맨 앞에 넣는다(서버도 같은 규칙, I14). OBJECT_ID = screenId = BPMN process id.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@dk-oasis/shared/form";
import {
  ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { ColumnPickModal } from "@/layout/ColumnPickModal";
import { LayoutItemDetail } from "@/layout/LayoutItemDetail";
import { precheck } from "@/layout/fill-kind";
import { newColumnRow, newFillerRow } from "@/layout/item-rows";
import { placeHeader, placeMessage, reorder, renumber, summaryText } from "@/layout/layout-calc";
import { hint, sectionBody, sectionTitle } from "@/layout/styles";
import type { ColumnInfo, HeaderStackRow, LayoutItemRow, UnitRow } from "@/layout/types";
import { MdmPageLayout } from "@/shell";
import { saveLayout, searchColumns, searchHeaders, searchLayouts, viewLayout } from "./api";
import { BodyItemGrid } from "./components/BodyItemGrid";
import { ConstEditModal } from "./components/ConstEditModal";
import { HeaderPickModal } from "./components/HeaderPickModal";
import { HeaderStackGrid } from "./components/HeaderStackGrid";
import { LayoutBasicForm } from "./components/LayoutBasicForm";
import { LayoutList } from "./components/LayoutList";
import type { ConstRow, EaiRow, HeaderOption, LayoutDraft, LayoutRow, SearchFilters, SystemRow } from "./types";

const SCREEN_ID = "layoutMng";

type Mode = "none" | "edit" | "new";

const EMPTY_DRAFT: LayoutDraft = { layoutId: null, ver: null, layoutName: "", eaiCode: null, sndSystem: null, rcvSystem: null };
const EMPTY_FILTERS: SearchFilters = { keyword: "", headerLayoutId: "", sndSystem: "", rcvSystem: "" };

let keySeq = 0;
const newKey = (prefix: string) => `${prefix}${++keySeq}`;

function stackRow(h: HeaderOption | { HEADER_LAYOUT_ID: number; HEADER_NAME: string; EAI_CODE?: string | null; TOTAL_LENGTH: number; items: LayoutItemRow[] }): HeaderStackRow {
  if ("LAYOUT_ID" in h) {
    return { KEY: newKey("h"), SEQ: 0, HEADER_LAYOUT_ID: h.LAYOUT_ID, HEADER_NAME: h.LAYOUT_NAME, EAI_CODE: h.EAI_CODE ?? null,
      TOTAL_LENGTH: h.TOTAL_LENGTH, items: (h.items ?? []).map((i) => ({ ...i, OVERRIDE_VALUE: null })) };
  }
  return { KEY: newKey("h"), SEQ: 0, HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID, HEADER_NAME: h.HEADER_NAME, EAI_CODE: h.EAI_CODE ?? null,
    TOTAL_LENGTH: h.TOTAL_LENGTH, items: h.items };
}

function withSeq(stack: HeaderStackRow[]): HeaderStackRow[] {
  return stack.map((h, i) => ({ ...h, SEQ: i + 1 }));
}

export default function LayoutMngPage() {
  const rbac = useUserButtonRbac();
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<LayoutRow[]>([]);
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [eais, setEais] = useState<EaiRow[]>([]);
  const [headerFilter, setHeaderFilter] = useState<HeaderOption[]>([]);
  const [catalog, setCatalog] = useState<HeaderOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [draft, setDraft] = useState<LayoutDraft>(EMPTY_DRAFT);
  const [layoutVersion, setLayoutVersion] = useState<number | null>(null);
  const [stack, setStack] = useState<HeaderStackRow[]>([]);
  const [body, setBody] = useState<LayoutItemRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [picker, setPicker] = useState<"none" | "column" | "header">("none");
  const [constKey, setConstKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const readOnly = mode === "none" || !canEdit || busy;

  // ── 즉시 재계산(I11) — 헤더 길이는 헤더 정의의 TOTAL_LENGTH, 본문은 항목에서 ──
  const headerTotals = useMemo(() => stack.map((h) => h.TOTAL_LENGTH), [stack]);
  const placedStack = useMemo(() => {
    const offsets = placeHeader(stack.map((h): LayoutItemRow => ({ SEQ: h.SEQ, FILL_KIND: "FILLER", FILLER_LENGTH: h.TOTAL_LENGTH })));
    return stack.map((h, i) => ({ ...h, OFFSET: offsets.rows[i].OFFSET }));
  }, [stack]);
  const placed = useMemo(() => placeMessage(headerTotals, body), [headerTotals, body]);
  const totalText = summaryText(headerTotals, placed.rows);
  const selectedItem = placed.rows.find((r) => r.KEY === selectedKey) ?? null;

  // ── 조회 ──
  const runSearch = useCallback(async (f: SearchFilters) => {
    setLoading(true);
    try {
      const out = await searchLayouts(f);
      setRows(out.layouts ?? []);
      setSystems(out.systems ?? []);
      setEais(out.eais ?? []);
      setHeaderFilter(out.headers ?? []);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(EMPTY_FILTERS);
  }, [runSearch]);

  const ensureCatalog = useCallback(async (): Promise<HeaderOption[]> => {
    if (catalog) return catalog;
    const list = await searchHeaders("");
    setCatalog(list);
    return list;
  }, [catalog]);

  // ── 행 선택 → view ──
  const openLayout = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const out = await viewLayout(id);
      const l = out.layout;
      if (!l) return;
      setSelectedId(l.LAYOUT_ID);
      setDraft({ layoutId: l.LAYOUT_ID, ver: l.VER, layoutName: l.LAYOUT_NAME, eaiCode: l.EAI_CODE ?? null,
        sndSystem: l.SND_SYSTEM ?? null, rcvSystem: l.RCV_SYSTEM ?? null });
      setLayoutVersion(l.LAYOUT_VERSION);
      setStack(withSeq((out.headers ?? []).map((h) => stackRow(h))));
      setBody(renumber((out.items ?? []).map((i) => ({ ...i, KEY: newKey("b") }))));
      setUnits(out.units ?? []);
      setSelectedKey(null);
      setMode("edit");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const startNew = () => {
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT });
    setLayoutVersion(null);
    setStack([]);
    setBody([]);
    setSelectedKey(null);
    setMode("new");
  };

  // ── EAI 선택 → 표준 헤더를 1번에(I14) ──
  const changeEai = async (code: string | null) => {
    setDraft((d) => ({ ...d, eaiCode: code }));
    const eai = eais.find((e) => e.EAI_CODE === code);
    if (!eai?.HEADER_LAYOUT_ID || stack.some((h) => h.HEADER_LAYOUT_ID === eai.HEADER_LAYOUT_ID)) return;
    try {
      const list = await ensureCatalog();
      const h = list.find((o) => o.LAYOUT_ID === eai.HEADER_LAYOUT_ID);
      if (h) setStack((s) => withSeq([stackRow(h), ...s]));
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

  // ── 저장 ──
  const handleSave = async () => {
    const issues = precheck(placed.rows);
    if (issues.length) {
      setErrorMessage(`전문 저장 거부: ${issues.join("; ")}`);
      return;
    }
    const consts: ConstRow[] = stack.flatMap((h) => h.items
      .filter((i) => i.FILL_KIND === "CONST" && i.OVERRIDE_VALUE && i.OVERRIDE_VALUE.trim() !== "")
      .map((i) => ({ HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID, HEADER_SEQ: i.SEQ, CONST_VALUE: String(i.OVERRIDE_VALUE) })));
    setBusy(true);
    try {
      const out = await saveLayout(draft, stack, consts, placed.rows);
      showMessage({ message: "저장했습니다.", alertType: "info", toast: true });
      await runSearch(filters);
      if (out.layoutId) await openLayout(out.layoutId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
          { id: "btn_save", label: "저장", type: "save" as const, action: "save", disabled: busy || mode === "none",
            onClick: () => void handleSave() },
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

      <ContentBody root>
        <ContentPanel width="40%">
          <LayoutList rows={rows} selectedId={selectedId} loading={loading} onSelect={(r) => void openLayout(r.LAYOUT_ID)} />
        </ContentPanel>
        <ContentPanel>
          <div style={{ overflowY: "auto", height: "100%" }}>
            {mode === "none" ? (
              <p style={{ ...hint, padding: "var(--spacing-md)" }}>목록에서 전문을 선택하거나 [신규] 를 누르세요.</p>
            ) : (
              <>
                <p style={sectionTitle}>기본 속성{mode === "new" ? " — 신규" : ""}</p>
                <div style={sectionBody}>
                  <LayoutBasicForm draft={draft} layoutVersion={layoutVersion} systems={systems} eais={eais} readOnly={readOnly}
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
        onPick={(h) => {
          setStack((s) => withSeq([...s, stackRow(h)]));
          setPicker("none");
        }} />
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
