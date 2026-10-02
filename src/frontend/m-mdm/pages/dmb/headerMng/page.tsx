"use client";

/**
 * headerMng — 전문 헤더 정의(TSK-05-02). 정본: docs/mdm/screens/headerMng/headerMng_기능설계서.md, design.md §2·§6.5.
 *
 * 헤더 목록 → 상세(인코딩·패딩은 EAI 소유, D2) + 사용 전문 영향도 + 헤더 항목 그리드(컬럼 사전 검색으로만 추가) + 항목 상세.
 * 헤더 길이·항목 오프셋(헤더 안 상대값)은 편집 즉시 화면에서 다시 계산하고(불변 I11), 저장하면 서버가 다시 계산해 그 헤더를 쌓은
 * 전문 전체의 오프셋·총 길이까지 같은 트랜잭션에서 바꾼다(I12). OBJECT_ID = screenId = BPMN process id = 'headerMng'.
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
import { placeHeader, reorder, renumber } from "@/layout/layout-calc";
import { hint, sectionBody, sectionTitle } from "@/layout/styles";
import type { ColumnInfo, LayoutItemRow, UnitRow } from "@/layout/types";
import { MdmPageLayout } from "@/shell";
import { saveHeader, searchColumns, searchHeaders, loadHeaderOptions, viewHeader } from "./api";
import { HeaderForm } from "./components/HeaderForm";
import { HeaderItemGrid } from "./components/HeaderItemGrid";
import { HeaderList } from "./components/HeaderList";
import { HeaderUsagePanel } from "./components/HeaderUsagePanel";
import type { EaiRow, HeaderDraft, HeaderRow, UsedByRow } from "./types";

const SCREEN_ID = "headerMng";

type Mode = "none" | "edit" | "new";

const EMPTY_DRAFT: HeaderDraft = { layoutId: null, ver: null, layoutName: "", eaiCode: null, eaiName: null, encoding: null, padRule: null };

let keySeq = 0;
const newKey = () => `i${++keySeq}`;

export default function HeaderMngPage() {
  const rbac = useUserButtonRbac();
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const { showMessage } = useMessage();

  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<HeaderRow[]>([]);
  const [eais, setEais] = useState<EaiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [draft, setDraft] = useState<HeaderDraft>(EMPTY_DRAFT);
  const [items, setItems] = useState<LayoutItemRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [usedBy, setUsedBy] = useState<UsedByRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const readOnly = mode === "none" || !canEdit || busy;

  // ── 즉시 재계산(I11) ──
  const placed = useMemo(() => placeHeader(items), [items]);
  const lengthText = `${placed.total} 바이트 (${items.length}항목)`;
  const selectedItem = placed.rows.find((r) => r.KEY === selectedKey) ?? null;

  // ── 조회 ──
  const runSearch = useCallback(async (kw: string) => {
    setLoading(true);
    try {
      const out = await searchHeaders(kw);
      setRows(out.headers ?? []);
      setEais(out.eais ?? []);
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
    loadHeaderOptions()
      .then((out) => {
        if (alive) setEais(out.eais ?? []);
      })
      .catch((e) => {
        if (alive) setErrorMessage(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── 행 선택 → view ──
  const openHeader = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const out = await viewHeader(id);
      const h = out.header;
      if (!h) return;
      setSelectedId(h.LAYOUT_ID);
      setDraft({ layoutId: h.LAYOUT_ID, ver: h.VER, layoutName: h.LAYOUT_NAME, eaiCode: h.EAI_CODE ?? null,
        eaiName: h.EAI_NAME ?? null, encoding: h.ENCODING ?? null, padRule: h.PAD_RULE ?? null });
      setItems(renumber((out.items ?? []).map((i) => ({ ...i, KEY: newKey() }))));
      setUsedBy(out.usedBy ?? []);
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
    setItems([]);
    setUsedBy([]);
    setSelectedKey(null);
    setMode("new");
  };

  // ── 항목 ──
  const addColumn = (c: ColumnInfo) => {
    const key = newKey();
    setItems((list) => renumber([...list, newColumnRow(key, c)]));
    setSelectedKey(key);
  };

  const addFiller = () => {
    const key = newKey();
    setItems((list) => renumber([...list, newFillerRow(key)]));
    setSelectedKey(key);
  };

  const updateItem = (next: LayoutItemRow) => setItems((list) => list.map((r) => (r.KEY === next.KEY ? next : r)));

  // ── 저장 — 화면 선검사(서버와 같은 문구) → 사용 전문이 있으면 재계산 확인 ──
  const doSave = async () => {
    setBusy(true);
    try {
      const out = await saveHeader(draft, placed.rows);
      const changed = out.recalculated?.length ?? 0;
      const dropped = out.droppedOverrides ?? 0;
      showMessage({
        message: `저장했습니다.${changed ? ` 사용 전문 ${changed}건을 다시 계산했습니다.` : ""}${dropped ? ` 짝이 없는 재정의 ${dropped}건을 지웠습니다.` : ""}`,
        alertType: "info", toast: true,
      });
      await runSearch(keyword);
      if (out.layoutId) await openHeader(out.layoutId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    const issues = precheck(placed.rows);
    if (issues.length) {
      setErrorMessage(`헤더 저장 거부: ${issues.join("; ")}`);
      return;
    }
    if (usedBy.length > 0) {
      showMessage({
        title: "확인", message: `이 헤더를 쓰는 전문 ${usedBy.length}건의 오프셋·총 길이가 다시 계산됩니다. 저장할까요?`,
        alertType: "confirm", onConfirm: () => void doSave(),
      });
      return;
    }
    void doSave();
  };

  return (
    <MdmPageLayout
      group="dmb"
      screenId={SCREEN_ID}
      title="전문 헤더 정의"
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: () => void runSearch(keyword) },
        ...(canEdit ? [
          { id: "btn_new", label: "신규", action: "save", disabled: busy, onClick: startNew },
          { id: "btn_save", label: "저장", type: "save" as const, action: "save", disabled: busy || mode === "none", onClick: handleSave },
        ] : []),
      ]}
    >
      <SearchArea onSearch={() => void runSearch(keyword)}>
        <SearchField label="검색어">
          <Input data-testid="header-search-keyword" aria-label="검색어" placeholder="헤더 이름" value={keyword} onChange={setKeyword}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(keyword);
            }} />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dmb.headerMng">
        <ContentPanel width="36%">
          <HeaderList rows={rows} selectedId={selectedId} loading={loading} onSelect={(r) => void openHeader(r.LAYOUT_ID)} />
        </ContentPanel>
        <ContentPanel>
          <div style={{ overflowY: "auto", height: "100%" }}>
            {mode === "none" ? (
              <p style={{ ...hint, padding: "var(--spacing-md)" }}>목록에서 헤더를 선택하거나 [신규] 를 누르세요.</p>
            ) : (
              <>
                <p style={sectionTitle}>헤더 상세{mode === "new" ? " — 신규" : ""}</p>
                <div style={sectionBody}>
                  <HeaderForm draft={draft} eais={eais} readOnly={readOnly} lengthText={lengthText}
                    onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
                </div>
                <div style={sectionBody}>
                  <HeaderUsagePanel rows={usedBy} />
                </div>
                <div style={sectionBody}>
                  <HeaderItemGrid rows={placed.rows} selectedKey={selectedKey} readOnly={readOnly} onSelect={setSelectedKey}
                    onAddColumn={() => setPicking(true)} onAddFiller={addFiller}
                    onDelete={() => {
                      setItems((list) => renumber(list.filter((r) => r.KEY !== selectedKey)));
                      setSelectedKey(null);
                    }}
                    onReorder={(keys) => setItems((list) => reorder(list, keys))} />
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

      <ColumnPickModal open={picking} onClose={() => setPicking(false)} onPick={addColumn} search={searchColumns}
        used={items.map((r) => r.COLUMN_PHYS).filter((p): p is string => !!p)} />
      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
