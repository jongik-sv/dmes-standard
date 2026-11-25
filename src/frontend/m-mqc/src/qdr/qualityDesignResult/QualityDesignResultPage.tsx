"use client";

/**
 * 품질설계결과(qualityDesignResult, AS-IS C104000010) — 왼쪽 품질설계 의뢰현황(주문 행), 오른쪽 그 주문의 설계결과.
 * 설계값은 서버가 Maru 기준 룰(압연두께Set·폭수축량·폭마진량·원자재강종·공정라우팅 등)로 계산하고 값마다 근거(룰 ID·버전·적중 행)를 싣는다.
 * 상태: 미설계 → 설계중(설계계산) → 확정(설계확정), 어느 상태든 보류 ↔ 보류해제. 품질협정서는 확정일 때만.
 */
import { useCallback, useRef, useState } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField, type PageButton } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import { screenMeta } from "@/common/screens";

import { calculateDesign, confirmDesign, designHistory, searchDesigns, toggleHold, viewDesign } from "./api";
import { DesignStyle } from "./design-css";
import { DesignDetailPanel } from "./DesignDetailPanel";
import { HistoryModal } from "./HistoryModal";
import { RequestListPanel } from "./RequestListPanel";
import {
  DEFAULT_FILTERS,
  PRODUCT_OPTIONS,
  SCREEN_ID,
  STATUS_OPTIONS,
  type DesignFilters,
  type DesignHistoryEvent,
  type DesignRow,
  type DesignView,
} from "./types";

/** 처음 고를 주문(AS-IS 기준 주문). 목록에 없으면 첫 행. */
export const INITIAL_ORDER_KEY = "D260831014-010";

/** 동작 뒤 목록 행의 상태·계산 시각을 상세 응답으로 맞춘다. */
export function patchRow(rows: DesignRow[], view: DesignView): DesignRow[] {
  return rows.map((r) =>
    r.orderKey === view.order.orderKey
      ? { ...r, status: view.status, statusNm: view.statusNm, calcAt: view.calcAt, verdict: view.run?.summary?.verdict ?? r.verdict }
      : r,
  );
}

export function QualityDesignResultPage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<DesignFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<DesignRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<DesignView | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<DesignHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const viewSeq = useRef(0);
  const selectedRef = useRef<string | null>(null);

  const setFilter = (k: keyof DesignFilters, v: string) => setFilters((p) => ({ ...p, [k]: v }));
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);

  const openView = useCallback(
    async (orderKey: string) => {
      if (selectedRef.current === orderKey) return;
      selectedRef.current = orderKey;
      setSelectedKey(orderKey);
      const seq = ++viewSeq.current;
      setViewLoading(true);
      try {
        const v = await viewDesign(orderKey);
        if (seq === viewSeq.current) setView(v);
      } catch (e) {
        if (seq === viewSeq.current) {
          setView(null);
          fail(e);
        }
      } finally {
        if (seq === viewSeq.current) setViewLoading(false);
      }
    },
    [fail],
  );

  const handleSearch = useCallback(async () => {
    if (filters.fromDt && filters.toDt && filters.fromDt > filters.toDt) {
      showMessage({ message: "시작일이 종료일보다 늦을 수 없습니다.", alertType: "warning" });
      return;
    }
    setListLoading(true);
    try {
      const out = await searchDesigns(filters);
      const list = out.rows ?? [];
      setRows(list);
      const keep = list.find((r) => r.orderKey === selectedRef.current);
      const first = keep ?? list.find((r) => r.orderKey === INITIAL_ORDER_KEY) ?? list[0];
      if (!first) {
        selectedRef.current = null;
        setSelectedKey(null);
        setView(null);
      } else if (!keep) {
        void openView(first.orderKey);
      }
    } catch (e) {
      fail(e);
    } finally {
      setListLoading(false);
    }
  }, [filters, showMessage, fail, openView]);

  const handleReset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const act = useCallback(
    async (run: (orderKey: string) => Promise<DesignView>, done: string) => {
      const key = selectedRef.current;
      if (!key) return;
      setBusy(true);
      try {
        const v = await run(key);
        viewSeq.current++;
        setView(v);
        setRows((rs) => patchRow(rs, v));
        showMessage({ message: done, alertType: "success", toast: true });
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [showMessage, fail],
  );

  const handleCalculate = () => void act(calculateDesign, "설계계산이 끝났습니다.");
  const handleConfirm = () =>
    showMessage({
      title: "확인",
      message: `${selectedRef.current} 설계를 확정하시겠습니까?`,
      alertType: "confirm",
      onConfirm: () => void act(confirmDesign, "설계를 확정했습니다."),
    });
  const handleHold = () => {
    const holding = view?.status === "HOLD";
    showMessage({
      title: "확인",
      message: holding ? "보류를 해제하시겠습니까?" : "이 설계를 보류하시겠습니까?",
      alertType: "confirm",
      onConfirm: () => void act((k) => toggleHold(k), holding ? "보류를 해제했습니다." : "보류했습니다."),
    });
  };
  const handleHistory = async () => {
    const key = selectedRef.current;
    if (!key) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      setHistory(await designHistory(key));
    } catch (e) {
      fail(e);
    } finally {
      setHistoryLoading(false);
    }
  };
  const handleAgreement = () =>
    showMessage({ message: "품질협정서 출력은 시연 범위 밖입니다. 확정된 설계결과로 작성합니다.", alertType: "info" });

  const hasView = !!view && !busy;
  const status = view?.status;
  const buttons: PageButton[] = [
    { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: listLoading, action: "search" },
    { id: "btn_reset", label: "초기화", onClick: handleReset, disabled: listLoading, action: "search" },
    {
      id: "btn_hold",
      label: status === "HOLD" ? "보류해제" : "보류",
      onClick: handleHold,
      disabled: !hasView,
      action: "cancel",
    },
    { id: "btn_history", label: "변경이력", onClick: () => void handleHistory(), disabled: !view, action: "history" },
    {
      id: "btn_agreement",
      label: "품질협정서",
      onClick: handleAgreement,
      disabled: !view || status !== "CONF",
      action: "view",
    },
    {
      id: "btn_calculate",
      label: "설계계산",
      onClick: handleCalculate,
      type: "save",
      disabled: !hasView || status === "CONF" || status === "HOLD",
      action: "calculate",
    },
    {
      id: "btn_confirm",
      label: "설계확정",
      onClick: handleConfirm,
      type: "primary",
      disabled: !hasView || status === "CONF" || status === "HOLD",
      action: "confirm",
    },
  ];

  return (
    <PageLayout title={meta.title} breadcrumb={meta.breadcrumb} screenId={SCREEN_ID} objId={SCREEN_ID} buttons={buttons}>
      <DesignStyle />
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="설계의뢰일자" type="date" defaultKey="fromDt" value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        <SearchField label="~" type="date" defaultKey="toDt" value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        <SearchField label="품명" type="select" defaultKey="prdNmCd" options={PRODUCT_OPTIONS} value={filters.prdNmCd} onChange={(v) => setFilter("prdNmCd", v)} />
        <SearchField label="설계상태" type="select" defaultKey="status" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilter("status", v)} />
        <SearchField
          label="키워드"
          defaultKey="keyword"
          value={filters.keyword}
          onChange={(v) => setFilter("keyword", v)}
          placeholder="주문번호·규격약호·최종수요가 검색"
        />
      </SearchArea>
      <ContentBody root resizable storageKey="mqc.qdr.qualityDesignResult">
        <ContentPanel width={512} minSize={380}>
          <RequestListPanel rows={rows} loading={listLoading} selectedKey={selectedKey} onSelect={(k) => void openView(k)} />
        </ContentPanel>
        <ContentPanel scrollY>
          <DesignDetailPanel view={view} loading={viewLoading || busy} />
        </ContentPanel>
      </ContentBody>
      <HistoryModal open={historyOpen} orderKey={selectedKey} events={history} loading={historyLoading} onClose={() => setHistoryOpen(false)} />
    </PageLayout>
  );
}
