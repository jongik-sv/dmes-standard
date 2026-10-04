"use client";

/**
 * headerMng — 전문 헤더 정의(TSK-05-02). 정본: docs/mdm/screens/headerMng/headerMng_기능설계서.md, design.md §2·§6.5.
 *
 * 헤더 목록 → 상세(인코딩·패딩은 EAI 소유, D2) + 사용 전문 영향도 + 헤더 항목 그리드(컬럼 사전 검색으로만 추가) + 항목 상세.
 * 헤더 길이·항목 오프셋(헤더 안 상대값)은 편집 즉시 화면에서 다시 계산하고(불변 I11), 저장 값은 서버가 다시 계산한다.
 * OBJECT_ID = screenId = BPMN process id = 'headerMng'.
 *
 * D-144 3단계: 버전 선택·버전 버튼(VersionActionBar). 편집은 내 DRAFT 만 — 저장은 버전을 만들지 않고 고른 DRAFT 를 `ver`·`rowVersion`
 * 으로 덮어쓴다(사용 전문은 바뀌지 않는다). 헤더 변경은 확정 apply_from 부터 사용 전문에 반영된다. 헤더 자신은 시각 합성 대상이
 * 아니어서 시각 T 입력은 없다. 확정은 전문과 같은 layoutConfirm 화면에서 한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@dk-oasis/shared/form";
import { GridLimitNotice } from "@dk-oasis/shared/grid";
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
import type { ColumnInfo, LayoutItemRow, LayoutVersionRow, UnitRow } from "@/layout/types";
import {
  cancelLayoutConfirm, deleteLayoutDraft, handoverLayoutDraft, lockLayoutDraft, newLayoutVersion, unlockLayoutDraft, type LayoutVersionResult,
} from "@/layout/version-api";
import { versionActionState } from "@/layout/version-rows";
import {
  DraftLockBadge, HANDOVER_AVAILABLE, MdmPageLayout, VersionActionBar, VersionStatusBadge, fmtVer, normVer, openMdmPage, type MdmVersionStatus,
} from "@/shell";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { saveHeader, searchColumns, searchHeaders, loadHeaderOptions, viewHeader } from "./api";
import { HeaderForm } from "./components/HeaderForm";
import { HeaderItemGrid } from "./components/HeaderItemGrid";
import { HeaderList } from "./components/HeaderList";
import { HeaderUsagePanel } from "./components/HeaderUsagePanel";
import type { EaiRow, HeaderDraft, HeaderRow, UsedByRow, ViewResult } from "./types";

const SCREEN_ID = "headerMng";
const CONFIRM_PAGE = "dmb/layoutConfirm";

type Mode = "none" | "edit" | "new";

const EMPTY_DRAFT: HeaderDraft = {
  layoutId: null, ver: null, rowVersion: null, layoutName: "", eaiCode: null, eaiName: null, encoding: null, padRule: null,
};

let keySeq = 0;
const newKey = () => `i${++keySeq}`;

export default function HeaderMngPage() {
  const rbac = useUserButtonRbac();
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const me = rbac.userId;
  const { showMessage } = useMessage();

  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<HeaderRow[]>([]);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [rowsTotal, setRowsTotal] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useState(false);
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
  // ── D-144 3단계 버전 ──
  const [view, setView] = useState<ViewResult | null>(null);
  const [versions, setVersions] = useState<LayoutVersionRow[]>([]);
  const [handoverTo, setHandoverTo] = useState("");
  /** view 요청 순번 — 늦게 온 옛 응답을 버린다. */
  const viewSeq = useRef(0);

  const selected = view?.selected ?? null;
  // 신규(mode === "new")는 저장하면 v1.000 DRAFT 가 생긴다. 기존 헤더는 서버가 편집 가능(내 DRAFT)이라고 한 버전만 고친다.
  const readOnly = mode === "none" || !canEdit || busy || (mode === "edit" && !view?.editable);
  const versionActions = versionActionState(view ?? {}, me, (a) => canDoButton(rbac, SCREEN_ID, a));
  const mine = selected?.STATUS === "DRAFT" && !!me && selected.OWNER_ID === me;
  /** 버전 액션·확정 인계에 보내는 고른 버전 — 정규 문자열(`"1.1"` 로 와도 `"1.100"`). */
  const selVer = selected ? normVer(selected.VER) ?? selected.VER : "";

  // ── 즉시 재계산(I11) ──
  const placed = useMemo(() => placeHeader(items), [items]);
  const lengthText = `${placed.total} 바이트 (${items.length}항목)`;
  const selectedItem = placed.rows.find((r) => r.KEY === selectedKey) ?? null;

  // ── 조회 ──
  // [조회] 는 첫 조회 상한(R1)을 걸고, [전체 보기] 는 상한 없이 받는다. 저장·버전 액션 뒤 재조회는 지금 모드를 따른다.
  const runSearch = useCallback(async (kw: string, all = false) => {
    setLoading(true);
    try {
      const out = await searchHeaders(kw, all ? undefined : FIRST_SEARCH_LIMIT);
      setRows(out.headers ?? []);
      setRowsTotal(out.truncated ? (out.totalCount ?? null) : null);
      setShowAll(all);
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

  // ── 행 선택·버전 선택 → view(ver 를 빼면 서버가 고른다 — 내 DRAFT 우선, 없으면 지금 현재) ──
  const openHeader = useCallback(async (id: number, ver: string | null) => {
    const seq = ++viewSeq.current;
    setBusy(true);
    try {
      const out = await viewHeader(id, ver);
      if (seq !== viewSeq.current) return;
      const h = out.header;
      if (!h) return;
      const sel = out.selected ?? null;
      setSelectedId(h.LAYOUT_ID);
      setView(out);
      setVersions(out.versions ?? []);
      setDraft({ layoutId: h.LAYOUT_ID, ver: sel ? normVer(sel.VER) ?? sel.VER : null, rowVersion: sel?.ROW_VERSION ?? null,
        layoutName: h.LAYOUT_NAME, eaiCode: h.EAI_CODE ?? null, eaiName: h.EAI_NAME ?? null, encoding: h.ENCODING ?? null,
        padRule: h.PAD_RULE ?? null });
      setItems(renumber((out.items ?? []).map((i) => ({ ...i, KEY: newKey() }))));
      setUsedBy(out.usedBy ?? []);
      setUnits(out.units ?? []);
      setSelectedKey(null);
      setMode("edit");
    } catch (e) {
      if (seq === viewSeq.current) setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === viewSeq.current) setBusy(false);
    }
  }, []);

  const startNew = () => {
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT });
    setView(null);
    setVersions([]);
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

  // ── 저장 — 화면 선검사(서버와 같은 문구) 뒤 고른 DRAFT 를 덮어쓴다. DRAFT 저장은 사용 전문을 바꾸지 않아 재계산 확인을 묻지 않는다 ──
  const handleSave = async () => {
    const issues = precheck(placed.rows);
    if (issues.length) {
      setErrorMessage(`헤더 저장 거부: ${issues.join("; ")}`);
      return;
    }
    setBusy(true);
    try {
      // 저장은 버전을 만들지 않는다 — 고른 DRAFT(ver)를 rowVersion 으로 덮어쓴다. 신규는 응답이 v1.000·rowVersion 0 이다.
      const out = await saveHeader({ ...draft, ver: draft.ver, rowVersion: draft.rowVersion }, placed.rows);
      const savedVer = out.ver ?? draft.ver;
      setDraft((d) => ({ ...d, layoutId: out.layoutId ?? d.layoutId, ver: savedVer, rowVersion: out.rowVersion ?? d.rowVersion }));
      setMode("edit");
      showMessage({ message: "저장했습니다.", alertType: "info", toast: true });
      await runSearch(keyword, showAll);
      if (out.layoutId) await openHeader(out.layoutId, savedVer);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── 버전 버튼 — 성공하면 결과 버전(삭제는 서버가 고르는 버전)으로 다시 읽는다 ──
  const runVersionAction = async (call: () => Promise<LayoutVersionResult>, rereadVer: (r: LayoutVersionResult) => string | null) => {
    if (selectedId == null) return;
    const id = selectedId;
    setBusy(true);
    try {
      const r = await call();
      await runSearch(keyword, showAll);
      await openHeader(id, rereadVer(r));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const sameOrResult = (r: LayoutVersionResult) => normVer(r.ver) ?? (selVer || null);

  return (
    <MdmPageLayout
      group="dmb"
      screenId={SCREEN_ID}
      title="전문 헤더 정의"
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: () => void runSearch(keyword) },
        ...(canEdit ? [
          { id: "btn_new", label: "신규", action: "save", disabled: busy, onClick: startNew },
          { id: "btn_save", label: "저장", type: "save" as const, action: "save", disabled: readOnly, onClick: () => void handleSave() },
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
          <HeaderList rows={rows} selectedId={selectedId} loading={loading} onSelect={(r) => void openHeader(r.LAYOUT_ID, null)}
            titleExtra={(
              <GridLimitNotice shownCount={rows.length} totalCount={rowsTotal} onShowAll={() => void runSearch(keyword, true)}
                disabled={loading} testId="header-list-limit" />
            )} />
        </ContentPanel>
        <ContentPanel>
          <div style={{ overflowY: "auto", height: "100%" }}>
            {mode === "none" ? (
              <p style={{ ...hint, padding: "var(--spacing-md)" }}>목록에서 헤더를 선택하거나 [신규] 를 누르세요.</p>
            ) : (
              <>
                {mode === "edit" && selectedId != null && (
                  <div style={sectionBody}>
                    <VersionActionBar
                      ids={{
                        newMajor: "header-ver-new-major", newMinor: "header-ver-new-minor", delete: "header-ver-delete", confirm: "header-ver-confirm",
                        cancelConfirm: "header-ver-cancel-confirm", lock: "header-ver-lock", unlock: "header-ver-unlock", handover: "header-ver-handover",
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
                        <Input data-testid="header-ver-handover-target" value={handoverTo} placeholder="넘겨받을 사용자 ID"
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
                <p style={sectionTitle}>헤더 상세{mode === "new" ? " — 신규" : ""}</p>
                <div style={sectionBody}>
                  <HeaderForm draft={draft} versions={versions} selectedVer={selected?.VER ?? null}
                    onSelectVersion={(ver) => selectedId != null && void openHeader(selectedId, ver)} legacy={selected?.LEGACY === "Y"}
                    eais={eais} readOnly={readOnly} lengthText={lengthText} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
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
