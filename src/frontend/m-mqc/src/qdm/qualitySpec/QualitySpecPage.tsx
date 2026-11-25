"use client";

/**
 * qualitySpec — 품질사양 관리(포털 pageId mqc:qdm/qualitySpec). 고객 품질사양을 IF(고객사·품명·속성) → THEN(설계결과 값) 규칙으로 쓰고,
 * 확정한 뒤 SAP OMS 로 보낸다. 주문을 설계할 때 사양은 표준 설계값(기본설계)을 사양번호 순으로 덮어쓴다(뒤 사양 우선).
 * 탭 6개: 사양 목록 · 신규 등록/수정 · 코드 사전 · 변경 이력 · 전송 이력 · 주문 적용 시뮬레이션. 상태 흐름 작성중 → 확정 → 전송완료/전송실패(재전송).
 * 조회조건은 탭마다 다르다 — 조회 영역은 탭별로 다시 그리고(autoSearch 로 탭 진입 때 한 번 조회), [조회] 는 지금 탭을 조회한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageLayout, SearchArea, SearchField, canDoButton, useUserButtonRbac, type PageButton } from "@dk-oasis/shared/layout";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import {
  confirmSpecs,
  deleteAttr,
  deleteSpecs,
  loadCodes,
  saveAttr,
  saveSpecs,
  searchChanges,
  searchIfLogs,
  searchSpecs,
  sendSpecs,
  viewSpec,
} from "./api";
import type { ChipLabels } from "./badges";
import { DictionaryPanel, EMPTY_ATTR_FORM, attrToForm, checkAttrForm, type AttrDetailHandle } from "./DictionaryPanel";
import { ChangeDetailModal, ChangeHistoryPanel, IfLogPanel } from "./HistoryPanels";
import { SendResultModal } from "./SendResultModal";
import { SimulationPanel } from "./SimulationPanel";
import { SpecDetailModal } from "./SpecDetailModal";
import { SpecEditorPanel } from "./SpecEditorPanel";
import { SpecListPanel, type ActiveFilterChip } from "./SpecListPanel";
import {
  DEFAULT_PRODUCTS,
  DIRECTION_OPTIONS,
  KIND_OPTIONS,
  RESULT_OPTIONS,
  SCREEN_ID,
  STATUS_LABEL,
  STATUS_OPTIONS,
  USE_OPTIONS,
  type AttrFilters,
  type AttrKind,
  type AttrView,
  type ChangeFilters,
  type ChangeView,
  type CodesResult,
  type IfFilters,
  type IfLogView,
  type SearchResult,
  type SendResult,
  type SpecFilters,
  type SpecStatus,
  type SpecView,
  type ViewResult,
} from "./types";

type TabKey = "list" | "editor" | "dict" | "change" | "if" | "sim";

const EMPTY_SPEC_FILTERS: SpecFilters = { status: "", keyword: "", cusCd: "", prdNmCd: "", attrCd: "" };
const EMPTY_CHANGE_FILTERS: ChangeFilters = { fromDt: "", toDt: "", keyword: "", specNo: "" };
const EMPTY_IF_FILTERS: IfFilters = { direction: "", result: "", keyword: "", specNo: "" };
const EMPTY_ATTR_FILTERS: AttrFilters = { kind: "", useYn: "", keyword: "" };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function QualitySpecPage(_props: PageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const can = (action: string) => canDoButton(rbac, SCREEN_ID, action);
  const canSearch = can("search");
  const canSave = can("save");
  const canDelete = can("delete");
  const canConfirm = can("confirm");
  const canSend = can("send");
  const canRun = can("run");

  const [tab, setTab] = useState<TabKey>("list");
  const [specFilters, setSpecFilters] = useState<SpecFilters>(EMPTY_SPEC_FILTERS);
  const [changeFilters, setChangeFilters] = useState<ChangeFilters>(EMPTY_CHANGE_FILTERS);
  const [ifFilters, setIfFilters] = useState<IfFilters>(EMPTY_IF_FILTERS);
  const [attrFilters, setAttrFilters] = useState<AttrFilters>(EMPTY_ATTR_FILTERS);
  const filtersRef = useRef({ specFilters, changeFilters, ifFilters, attrFilters });
  filtersRef.current = { specFilters, changeFilters, ifFilters, attrFilters };

  const [specResult, setSpecResult] = useState<SearchResult | null>(null);
  const [codes, setCodes] = useState<CodesResult | null>(null);
  const [attrList, setAttrList] = useState<AttrView[]>([]);
  const [changes, setChanges] = useState<ChangeView[] | null>(null);
  const [ifLogs, setIfLogs] = useState<IfLogView[] | null>(null);
  const [loading, setLoading] = useState<Partial<Record<TabKey | "codes", boolean>>>({});
  const loadingRef = useRef<Partial<Record<TabKey | "codes", boolean>>>({});
  const [busy, setBusy] = useState(false);

  const [detailNo, setDetailNo] = useState<string | null>(null);
  const [detail, setDetail] = useState<ViewResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailReqRef = useRef(0);
  const [changeDetail, setChangeDetail] = useState<ChangeView | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [editTarget, setEditTarget] = useState<SpecView | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [selectedAttr, setSelectedAttr] = useState<string | null>(null);
  const attrDetailRef = useRef<AttrDetailHandle>(null);
  const pendingAttrRef = useRef<{ name: string; kind: AttrKind } | null>(null);

  const showError = useCallback((e: unknown) => showMessage({ title: "오류", message: errorText(e), alertType: "error" }), [showMessage]);

  /** 한 종류의 조회가 진행 중이면 같은 조회를 다시 보내지 않는다(성능 가이드 R4). */
  const track = useCallback(async <T,>(key: TabKey | "codes", job: () => Promise<T>): Promise<T | undefined> => {
    if (loadingRef.current[key]) return undefined;
    loadingRef.current = { ...loadingRef.current, [key]: true };
    setLoading((p) => ({ ...p, [key]: true }));
    try {
      return await job();
    } finally {
      loadingRef.current = { ...loadingRef.current, [key]: false };
      setLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  // ── 조회 ─────────────────────────────────────────────

  const reloadCodes = useCallback(async () => {
    try {
      const out = await track("codes", () => loadCodes());
      if (out) setCodes(out);
    } catch (e) {
      showError(e);
    }
  }, [track, showError]);

  const searchList = useCallback(async () => {
    try {
      const out = await track("list", () => searchSpecs(filtersRef.current.specFilters));
      if (out) setSpecResult(out);
    } catch (e) {
      showError(e);
    }
  }, [track, showError]);

  const searchDict = useCallback(async () => {
    try {
      const out = await track("dict", () => loadCodes(filtersRef.current.attrFilters));
      if (out) setAttrList(out.attrs);
    } catch (e) {
      showError(e);
    }
  }, [track, showError]);

  const searchChangeLog = useCallback(async () => {
    const f = filtersRef.current.changeFilters;
    if (f.fromDt && f.toDt && f.fromDt > f.toDt) {
      showMessage({ message: "시작일이 종료일보다 늦을 수 없습니다.", alertType: "warning" });
      return;
    }
    try {
      const out = await track("change", () => searchChanges(f));
      if (out) setChanges(out);
    } catch (e) {
      showError(e);
    }
  }, [track, showError, showMessage]);

  const searchIfLog = useCallback(async () => {
    try {
      const out = await track("if", () => searchIfLogs(filtersRef.current.ifFilters));
      if (out) setIfLogs(out);
    } catch (e) {
      showError(e);
    }
  }, [track, showError]);

  const searchTab = useCallback(
    (key: TabKey) => {
      if (key === "list") {
        if (!codes) void reloadCodes();
        void searchList();
      } else if (key === "dict") void searchDict();
      else if (key === "change") void searchChangeLog();
      else if (key === "if") void searchIfLog();
      else void reloadCodes();
    },
    [codes, reloadCodes, searchList, searchDict, searchChangeLog, searchIfLog],
  );

  /** 쓰기 뒤 다시 읽기 — 목록은 늘, 이력은 받아 둔 적이 있을 때만. */
  const refreshAfterWrite = useCallback(() => {
    void searchList();
    if (changes !== null) void searchChangeLog();
    if (ifLogs !== null) void searchIfLog();
  }, [searchList, searchChangeLog, searchIfLog, changes, ifLogs]);

  // ── 상세 ─────────────────────────────────────────────

  const loadDetail = useCallback(
    async (specNo: string) => {
      const id = ++detailReqRef.current;
      setDetailLoading(true);
      try {
        const out = await viewSpec(specNo);
        if (id === detailReqRef.current) setDetail(out);
      } catch (e) {
        if (id === detailReqRef.current) {
          setDetail(null);
          showError(e);
        }
      } finally {
        if (id === detailReqRef.current) setDetailLoading(false);
      }
    },
    [showError],
  );

  const openDetail = useCallback(
    (specNo: string) => {
      setDetailNo(specNo);
      setDetail(null);
      void loadDetail(specNo);
    },
    [loadDetail],
  );
  const closeDetail = useCallback(() => {
    detailReqRef.current += 1;
    setDetailNo(null);
    setDetail(null);
  }, []);

  // ── 쓰기 ─────────────────────────────────────────────

  const runWrite = useCallback(
    async (job: () => Promise<void>) => {
      setBusy(true);
      try {
        await job();
      } catch (e) {
        showError(e);
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );

  const startEdit = useCallback((spec: SpecView) => {
    setEditTarget(spec);
    setEditorKey((k) => k + 1);
    setDetailNo(null);
    setTab("editor");
  }, []);

  const startNew = useCallback(() => {
    setEditTarget(null);
    setEditorKey((k) => k + 1);
    setTab("editor");
  }, []);

  const doDelete = useCallback(
    (specNos: string[]) => {
      if (specNos.length === 0) return;
      showMessage({
        title: "확인",
        message: specNos.length === 1 ? "선택한 행을 삭제하시겠습니까?" : `선택한 ${specNos.length}건을 삭제하시겠습니까?`,
        alertType: "confirm",
        onConfirm: () =>
          void runWrite(async () => {
            const deleted = await deleteSpecs(specNos);
            showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
            if (detailNo && deleted.includes(detailNo)) closeDetail();
            refreshAfterWrite();
          }),
      });
    },
    [showMessage, runWrite, detailNo, closeDetail, refreshAfterWrite],
  );

  const doConfirm = useCallback(
    (specNos: string[]) => {
      if (specNos.length === 0) return;
      void runWrite(async () => {
        const out = await confirmSpecs(specNos);
        if (out.skipped.length > 0) {
          showMessage({
            title: "알림",
            message: `확정 ${out.confirmed.length}건 · 제외 ${out.skipped.length}건\n${out.skipped.map((s) => `${s.specNo}: ${s.reason}`).join("\n")}`,
            alertType: "warning",
          });
        } else {
          showMessage({ message: `확정되었습니다. (${out.confirmed.length}건)`, alertType: "success", toast: true });
        }
        if (detailNo) void loadDetail(detailNo);
        refreshAfterWrite();
      });
    },
    [runWrite, showMessage, detailNo, loadDetail, refreshAfterWrite],
  );

  const doSend = useCallback(
    (specNos: string[]) => {
      if (specNos.length === 0) return;
      showMessage({
        title: "확인",
        message: `${specNos.length}건을 SAP ERP OMS로 전송하시겠습니까?`,
        alertType: "confirm",
        onConfirm: () =>
          void runWrite(async () => {
            const out = await sendSpecs(specNos);
            setSendResult(out);
            if (detailNo) void loadDetail(detailNo);
            refreshAfterWrite();
          }),
      });
    },
    [showMessage, runWrite, detailNo, loadDetail, refreshAfterWrite],
  );

  const doSaveSpecs = useCallback(
    async (text: string, confirm: boolean): Promise<boolean> => {
      setBusy(true);
      try {
        const saved = await saveSpecs(text, { specNo: editTarget?.specNo ?? null, confirm });
        showMessage({ message: `저장되었습니다. (${saved.map((s) => `${s.specNo} Rev.${s.rev}`).join(", ")})`, alertType: "success", toast: true });
        if (editTarget) {
          setEditTarget(null);
          setEditorKey((k) => k + 1);
          setTab("list");
        }
        refreshAfterWrite();
        void reloadCodes();
        return true;
      } catch (e) {
        showError(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [editTarget, showMessage, showError, refreshAfterWrite, reloadCodes],
  );

  const cancelEdit = useCallback(() => {
    setEditTarget(null);
    setEditorKey((k) => k + 1);
    setTab("list");
  }, []);

  // ── 코드 사전 ───────────────────────────────────────────

  const quickAdd = useCallback((name: string, kind: AttrKind) => {
    pendingAttrRef.current = { name, kind };
    setSelectedAttr(null);
    setTab("dict");
  }, []);

  useEffect(() => {
    // 「코드 사전에 추가」 로 넘어오면 사전 폼에 이름·구분을 채운다(폼은 탭이 그려진 뒤에 ref 가 생긴다).
    if (tab !== "dict" || !pendingAttrRef.current) return;
    const p = pendingAttrRef.current;
    pendingAttrRef.current = null;
    attrDetailRef.current?.load({ ...EMPTY_ATTR_FORM, attrNm: p.name, kind: p.kind });
  }, [tab]);

  const selectAttr = useCallback((a: AttrView) => {
    setSelectedAttr(a.attrCd);
    attrDetailRef.current?.load(attrToForm(a));
  }, []);
  const newAttr = useCallback(() => {
    setSelectedAttr(null);
    attrDetailRef.current?.load({ ...EMPTY_ATTR_FORM });
  }, []);
  const afterAttrWrite = useCallback(() => {
    void searchDict();
    void reloadCodes();
  }, [searchDict, reloadCodes]);

  const saveAttrForm = useCallback(() => {
    const form = attrDetailRef.current?.getForm();
    if (!form) return;
    const problem = checkAttrForm(form);
    if (problem) {
      showMessage({ message: problem, alertType: "warning" });
      return;
    }
    void runWrite(async () => {
      const saved = await saveAttr(form);
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      if (saved) {
        setSelectedAttr(saved.attrCd);
        attrDetailRef.current?.load(attrToForm(saved));
      }
      afterAttrWrite();
    });
  }, [showMessage, runWrite, afterAttrWrite]);

  const toggleAttrUse = useCallback(
    (a: AttrView) =>
      void runWrite(async () => {
        await saveAttr({ ...attrToForm(a), useYn: a.useYn === "Y" ? "N" : "Y" });
        showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
        afterAttrWrite();
      }),
    [runWrite, showMessage, afterAttrWrite],
  );

  const deleteAttrForm = useCallback(() => {
    const form = attrDetailRef.current?.getForm();
    if (!form?.origAttrCd) return;
    const attrCd = form.origAttrCd;
    showMessage({
      title: "확인",
      message: "선택한 행을 삭제하시겠습니까?",
      alertType: "confirm",
      onConfirm: () =>
        void runWrite(async () => {
          await deleteAttr(attrCd);
          showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
          setSelectedAttr(null);
          attrDetailRef.current?.load(null);
          afterAttrWrite();
        }),
    });
  }, [showMessage, runWrite, afterAttrWrite]);

  const jumpToSpecs = useCallback((attrCd: string) => {
    setSpecFilters({ ...EMPTY_SPEC_FILTERS, attrCd });
    setTab("list");
  }, []);

  // ── 이력 ─────────────────────────────────────────────

  const showSpecHistory = useCallback((specNo: string) => {
    setDetailNo(null);
    setChangeFilters({ ...EMPTY_CHANGE_FILTERS, specNo });
    setTab("change");
  }, []);

  const resend = useCallback((specNo: string) => doSend([specNo]), [doSend]);

  // ── 표시 값 ───────────────────────────────────────────

  const customers = useMemo(() => codes?.customers ?? [], [codes]);
  const products = useMemo(() => (codes?.products?.length ? codes.products : DEFAULT_PRODUCTS), [codes]);
  const dictAll = useMemo(() => codes?.attrs ?? [], [codes]);
  const cusName = useCallback((code: string) => customers.find((c) => c.cusCd === code)?.cusNm ?? null, [customers]);
  const prdName = useCallback((code: string) => products.find((p) => p.prdNmCd === code)?.prdNm ?? null, [products]);
  const labels = useMemo<ChipLabels>(() => ({ cusName, prdName }), [cusName, prdName]);
  const specs = useMemo(() => specResult?.specs ?? [], [specResult]);
  const allSpecNos = useMemo(() => specResult?.allSpecNos ?? specs.map((s) => s.specNo), [specResult, specs]);

  const customerOptions = useMemo(() => [{ value: "", label: "전체" }, ...customers.map((c) => ({ value: c.cusCd, label: `${c.cusCd} ${c.cusNm}` }))], [customers]);
  const productOptions = useMemo(() => [{ value: "", label: "전체" }, ...products.map((p) => ({ value: p.prdNmCd, label: p.label }))], [products]);
  const attrOptions = useMemo(() => [{ value: "", label: "전체" }, ...dictAll.map((a) => ({ value: a.attrCd, label: `${a.attrNm} (${a.attrCd})` }))], [dictAll]);

  const activeFilters = useMemo<ActiveFilterChip[]>(() => {
    const f = specFilters;
    const out: ActiveFilterChip[] = [];
    if (f.cusCd) out.push({ key: "cusCd", label: `고객사: ${f.cusCd} ${cusName(f.cusCd) ?? ""}`.trim() });
    if (f.prdNmCd) out.push({ key: "prdNmCd", label: `품명: ${products.find((p) => p.prdNmCd === f.prdNmCd)?.label ?? f.prdNmCd}` });
    if (f.attrCd) out.push({ key: "attrCd", label: `항목: ${dictAll.find((a) => a.attrCd === f.attrCd)?.attrNm ?? f.attrCd}` });
    if (f.status) out.push({ key: "status", label: `상태: ${STATUS_LABEL[f.status as SpecStatus] ?? f.status}` });
    if (f.keyword) out.push({ key: "keyword", label: `검색: ${f.keyword}` });
    return out;
  }, [specFilters, cusName, products, dictAll]);

  const clearFilter = useCallback(
    (key: string) => {
      setSpecFilters((p) => ({ ...p, [key]: "" }));
      filtersRef.current = { ...filtersRef.current, specFilters: { ...filtersRef.current.specFilters, [key]: "" } };
      void searchList();
    },
    [searchList],
  );

  const setSpecFilter = (k: keyof SpecFilters, v: string) => setSpecFilters((p) => ({ ...p, [k]: v }));
  const setChangeFilter = (k: keyof ChangeFilters, v: string) => setChangeFilters((p) => ({ ...p, [k]: v }));
  const setIfFilter = (k: keyof IfFilters, v: string) => setIfFilters((p) => ({ ...p, [k]: v }));
  const setAttrFilter = (k: keyof AttrFilters, v: string) => setAttrFilters((p) => ({ ...p, [k]: v }));

  const activeAttrCount = dictAll.filter((a) => a.useYn === "Y").length;
  const tabItems: TabItem[] = [
    { key: "list", label: `사양 목록 (${specResult?.total ?? 0})` },
    { key: "editor", label: editTarget ? `수정 중 (${editTarget.specNo})` : "신규 등록" },
    { key: "dict", label: `코드 사전 (${activeAttrCount} active)` },
    { key: "change", label: changes ? `변경 이력 (${changes.length})` : "변경 이력" },
    { key: "if", label: ifLogs ? `전송 이력 (${ifLogs.length})` : "전송 이력" },
    { key: "sim", label: "주문 적용 시뮬레이션" },
  ];

  const isBusy = busy || !!loading[tab];
  const buttons: PageButton[] = [
    { id: "btn_search", label: "조회", onClick: () => searchTab(tab), type: "primary", disabled: isBusy || tab === "editor", action: "search" },
    { id: "btn_new", label: "신규", onClick: startNew, disabled: busy, action: "save", emitSearch: false },
  ];

  const handleTab = (key: string) => {
    if (key === tab) return;
    if (key === "editor" && tab !== "editor" && !editTarget) setEditorKey((k) => k + 1);
    setTab(key as TabKey);
    if (key === "sim" && !codes) void reloadCodes();
  };

  return (
    <PageLayout title="품질사양 관리" breadcrumb="품질관리 > 품질설계 > 모듈관리 > 품질사양 관리" screenId={SCREEN_ID} objId={SCREEN_ID} buttons={buttons}>
      {tab === "list" ? (
        <SearchArea key="list" onSearch={() => searchTab("list")} autoSearch>
          <SearchField label="상태" defaultKey="status" type="select" options={STATUS_OPTIONS} value={specFilters.status} onChange={(v) => setSpecFilter("status", v)} />
          <SearchField label="키워드" defaultKey="keyword" value={specFilters.keyword} onChange={(v) => setSpecFilter("keyword", v)} placeholder="사양번호·고객사·조건·결과 검색" />
          <SearchField label="고객사" defaultKey="cusCd" type="select" options={customerOptions} value={specFilters.cusCd} onChange={(v) => setSpecFilter("cusCd", v)} />
          <SearchField label="품명" defaultKey="prdNmCd" type="select" options={productOptions} value={specFilters.prdNmCd} onChange={(v) => setSpecFilter("prdNmCd", v)} />
          <SearchField label="항목" defaultKey="attrCd" type="select" options={attrOptions} value={specFilters.attrCd} onChange={(v) => setSpecFilter("attrCd", v)} />
        </SearchArea>
      ) : null}
      {tab === "dict" ? (
        <SearchArea key="dict" defaultsScope="dict" onSearch={() => searchTab("dict")} autoSearch>
          <SearchField label="구분" defaultKey="kind" type="select" options={KIND_OPTIONS} value={attrFilters.kind} onChange={(v) => setAttrFilter("kind", v)} />
          <SearchField label="사용 여부" defaultKey="useYn" type="select" options={USE_OPTIONS} value={attrFilters.useYn} onChange={(v) => setAttrFilter("useYn", v)} />
          <SearchField label="키워드" defaultKey="keyword" value={attrFilters.keyword} onChange={(v) => setAttrFilter("keyword", v)} placeholder="항목명·시스템 코드·설명 검색" />
        </SearchArea>
      ) : null}
      {tab === "change" ? (
        <SearchArea key="change" defaultsScope="change" onSearch={() => searchTab("change")} autoSearch>
          <SearchField label="변경기간" defaultKey="fromDt" type="date" value={changeFilters.fromDt} onChange={(v) => setChangeFilter("fromDt", v)} />
          <SearchField label="~" defaultKey="toDt" type="date" value={changeFilters.toDt} onChange={(v) => setChangeFilter("toDt", v)} />
          <SearchField label="키워드" defaultKey="keyword" value={changeFilters.keyword} onChange={(v) => setChangeFilter("keyword", v)} placeholder="품질사양번호·작업자 검색" />
          <SearchField label="품질사양번호" defaultKey="specNo" value={changeFilters.specNo} onChange={(v) => setChangeFilter("specNo", v)} />
        </SearchArea>
      ) : null}
      {tab === "if" ? (
        <SearchArea key="if" defaultsScope="if" onSearch={() => searchTab("if")} autoSearch>
          <SearchField label="방향" defaultKey="direction" type="select" options={DIRECTION_OPTIONS} value={ifFilters.direction} onChange={(v) => setIfFilter("direction", v)} />
          <SearchField label="결과" defaultKey="result" type="select" options={RESULT_OPTIONS} value={ifFilters.result} onChange={(v) => setIfFilter("result", v)} />
          <SearchField label="키워드" defaultKey="keyword" value={ifFilters.keyword} onChange={(v) => setIfFilter("keyword", v)} placeholder="I/F 번호·사양번호·주문번호" />
        </SearchArea>
      ) : null}

      <Tabs items={tabItems} activeKey={tab} onChange={handleTab} />

      {tab === "list" ? (
        <SpecListPanel
          specs={specs}
          loading={!!loading.list}
          busy={busy}
          labels={labels}
          activeFilters={activeFilters}
          onClearFilter={clearFilter}
          onOpen={openDetail}
          onEdit={startEdit}
          onDelete={doDelete}
          onConfirm={doConfirm}
          onSend={doSend}
          canSave={canSave}
          canDelete={canDelete}
          canConfirm={canConfirm}
          canSend={canSend}
        />
      ) : null}
      {tab === "editor" ? (
        <SpecEditorPanel
          key={editorKey}
          dict={dictAll}
          customers={customers}
          products={products}
          existingSpecNos={allSpecNos}
          editTarget={editTarget}
          busy={busy}
          canSave={canSave}
          canConfirm={canConfirm}
          onSave={doSaveSpecs}
          onCancelEdit={cancelEdit}
          onQuickAdd={quickAdd}
        />
      ) : null}
      {tab === "dict" ? (
        <DictionaryPanel
          detailRef={attrDetailRef}
          attrs={attrList}
          loading={!!loading.dict}
          busy={busy}
          selectedAttrCd={selectedAttr}
          canSave={canSave}
          canDelete={canDelete}
          onSelect={selectAttr}
          onNew={newAttr}
          onSave={saveAttrForm}
          onDelete={deleteAttrForm}
          onToggleUse={toggleAttrUse}
          onJumpToSpecs={jumpToSpecs}
        />
      ) : null}
      {tab === "change" ? <ChangeHistoryPanel rows={changes ?? []} loading={!!loading.change} selectedId={changeDetail?.chgId ?? null} onOpen={setChangeDetail} /> : null}
      {tab === "if" ? <IfLogPanel rows={ifLogs ?? []} loading={!!loading.if} busy={busy} canSend={canSend} onResend={resend} /> : null}
      {tab === "sim" ? <SimulationPanel orders={codes?.orders ?? []} loading={!!loading.codes} canRun={canRun && canSearch} /> : null}

      <SpecDetailModal
        open={detailNo !== null}
        data={detail}
        loading={detailLoading}
        busy={busy}
        cusName={cusName}
        prdName={prdName}
        canSave={canSave}
        canDelete={canDelete}
        canConfirm={canConfirm}
        canSend={canSend}
        onClose={closeDetail}
        onEdit={() => detail && startEdit(detail.spec)}
        onDelete={() => detail && doDelete([detail.spec.specNo])}
        onConfirm={() => detail && doConfirm([detail.spec.specNo])}
        onSend={() => detail && doSend([detail.spec.specNo])}
        onShowHistory={showSpecHistory}
      />
      <ChangeDetailModal row={changeDetail} onClose={() => setChangeDetail(null)} />
      <SendResultModal result={sendResult} onClose={() => setSendResult(null)} />
    </PageLayout>
  );
}

export default QualitySpecPage;
