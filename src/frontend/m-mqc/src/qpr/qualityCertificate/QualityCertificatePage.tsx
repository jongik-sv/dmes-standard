"use client";

/**
 * 품질보증서관리(qualityCertificate) — 주문·PO 단위로 코일 여러 개의 품질을 보증하는 문서를 요청·발행·재발행·회수한다.
 * 프로토타입 quality-certificate.html 의 「목록 + 오른쪽 상세」 모양을 화면 유형 B 로 옮겼다. 탭: 발행 목록 · 발행 요청 · 처리 이력.
 * [미리보기] 는 A4 양식을 모달에 그리고 브라우저 인쇄(PDF로 저장)를 연다. 발행·재발행은 실린 코일이 모두 합격이어야 한다(서버가 다시 확인).
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { errorMessage } from "@/common/oasis";
import { PrintPreviewModal } from "@/common/print/PrintPreviewModal";
import { ReasonModal } from "@/common/ReasonModal";
import { screenMeta } from "@/common/screens";
import { gridStatusBadge, num, OUTPUT_HISTORY_COLUMNS, type OutputEvent } from "@/qpr/shared/status";

import { cancelCert, issueCert, loadOrders, reissueCert, requestCert, searchCertHistory, searchCerts, viewCert } from "./api";
import { CertDetailPane } from "./CertDetailPane";
import { CertificateSheet } from "./CertificateSheet";
import { RequestPanel, type RequestPanelHandle } from "./RequestPanel";
import { CUSTOMER_OPTIONS, DEFAULT_FILTERS, SCREEN_ID, STATUS_OPTIONS, type CertDetail, type CertRow, type Filters, type OrderOption, type QcStatus } from "./types";

type TabKey = "list" | "request" | "history";
type ReasonKind = "reissue" | "cancel";

const LIST_COLUMNS: GridColumn[] = [
  { key: "qcNo", header: "보증서번호", width: 110, align: "left" },
  { key: "revText", header: "판", width: 44, align: "center" },
  { key: "cusNm", header: "수요가", width: 80, align: "left" },
  { key: "poNo", header: "PO", width: 100, align: "left" },
  { key: "ordNo", header: "주문번호", width: 120, align: "left" },
  { key: "prdLabel", header: "품명", width: 80, align: "left" },
  { key: "specCd", header: "규격", width: 110, align: "left" },
  { key: "coilCount", header: "코일", width: 50, align: "right", type: "number" },
  { key: "totalWgt", header: "중량 (kg)", width: 90, align: "right", type: "number", render: (v) => num(v) },
  { key: "statusNm", header: "상태", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.status, v) },
  { key: "issueDate", header: "발행일", width: 100, align: "center", render: (v) => (v ? String(v) : "—") },
  { key: "issueBy", header: "담당", width: 70, align: "center", render: (v, r) => String(v ?? r.reqBy ?? "—") },
];

const CertListPanel = memo(function CertListPanel({
  rows,
  loading,
  selected,
  onRowClick,
}: {
  rows: CertRow[];
  loading: boolean;
  selected: string;
  onRowClick: (row: Record<string, unknown>) => void;
}) {
  return (
    <GridPanel title="품질보증서 발행 목록" count={rows.length}>
      <AgDataGrid gridId="list" rowKey="qcNo" columns={LIST_COLUMNS} data={rows} columnSizing="fixed" highlightedRowKey={selected} onRowClick={onRowClick} loading={loading} />
    </GridPanel>
  );
});

export function QualityCertificatePage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const [tab, setTab] = useState<TabKey>("list");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CertRow[]>([]);
  const [counts, setCounts] = useState<Record<QcStatus, number>>({ DRAFT: 0, ISSUED: 0, REISSUED: 0, RECALLED: 0 });
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<CertDetail | null>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [events, setEvents] = useState<OutputEvent[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reasonKind, setReasonKind] = useState<ReasonKind | null>(null);
  const requestRef = useRef<RequestPanelHandle>(null);
  const detailSeq = useRef(0);

  const setFilter = (key: keyof Filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);

  const loadDetail = useCallback(
    async (qcNo: string) => {
      const seq = ++detailSeq.current;
      try {
        const d = await viewCert(qcNo);
        if (seq === detailSeq.current) setDetail(d);
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const handleSearch = useCallback(
    async (keepSelection = false) => {
      if (filters.fromDt && filters.toDt && filters.fromDt > filters.toDt) {
        showMessage({ message: "시작일이 종료일보다 늦을 수 없습니다.", alertType: "warning" });
        return;
      }
      setSearching(true);
      try {
        if (tab === "history") setEvents(await searchCertHistory(filters.fromDt, filters.toDt));
        if (tab === "request") setOrders(await loadOrders());
        const result = await searchCerts(filters);
        setRows(result.rows);
        setCounts(result.counts);
        if (!keepSelection) {
          setSelected("");
          setDetail(null);
        }
      } catch (e) {
        fail(e);
      } finally {
        setSearching(false);
      }
    },
    [filters, tab, fail, showMessage],
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const qcNo = String(row.qcNo);
      setSelected(qcNo);
      void loadDetail(qcNo);
    },
    [loadDetail],
  );

  /** 상태를 바꾸는 처리 공통: 호출 → 상세 갱신 → 목록 다시 조회. */
  const run = useCallback(
    async (call: () => Promise<CertDetail>, done: string) => {
      setBusy(true);
      try {
        const d = await call();
        setDetail(d);
        setSelected(d.cert.qcNo);
        showMessage({ message: done, alertType: "success", toast: true });
        await handleSearch(true);
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [handleSearch, fail, showMessage],
  );

  const handleIssue = useCallback(() => {
    if (!detail) return;
    if (detail.actions.blockReason) {
      showMessage({ message: detail.actions.blockReason, alertType: "warning" });
      return;
    }
    const qcNo = detail.cert.qcNo;
    showMessage({
      title: "확인",
      message: `${qcNo} 를 발행하시겠습니까? 발행한 보증서는 재발행·회수로만 바꿀 수 있습니다.`,
      alertType: "confirm",
      onConfirm: () => void run(() => issueCert(qcNo), "발행했습니다."),
    });
  }, [detail, run, showMessage]);

  const handleReason = useCallback(
    async (reason: string) => {
      if (!detail || !reasonKind) return;
      const qcNo = detail.cert.qcNo;
      const ok =
        reasonKind === "reissue"
          ? await run(() => reissueCert(qcNo, reason), "재발행했습니다.")
          : await run(() => cancelCert(qcNo, reason), "회수했습니다.");
      if (ok) setReasonKind(null);
    },
    [detail, reasonKind, run],
  );

  const handleRequest = useCallback(async () => {
    const form = requestRef.current?.getForm();
    if (!form) return;
    if (!form.ordNo) {
      showMessage({ message: "주문번호를 선택하세요.", alertType: "warning" });
      return;
    }
    if (form.coilNos.length === 0) {
      showMessage({ message: "보증서에 실을 코일을 선택하세요.", alertType: "warning" });
      return;
    }
    const ok = await run(() => requestCert(form), "발행 요청을 등록했습니다(초안).");
    if (ok) {
      setTab("list");
      setOrders(await loadOrders().catch(() => orders));
    }
  }, [orders, run, showMessage]);

  const changeTab = (k: string) => {
    const next = k as TabKey;
    setTab(next);
    if (next === "request") void loadOrders().then(setOrders).catch(fail);
    if (next === "history") void searchCertHistory(filters.fromDt, filters.toDt).then(setEvents).catch(fail);
  };

  const tabItems: TabItem[] = useMemo(
    () => [
      { key: "list", label: `발행 목록 (${counts.DRAFT + counts.ISSUED + counts.REISSUED + counts.RECALLED})` },
      { key: "request", label: "발행 요청" },
      { key: "history", label: "처리 이력" },
    ],
    [counts],
  );

  const disabledAll = isBusy || isSearching;
  const onList = tab === "list";
  const a = detail?.actions;

  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: disabledAll, action: "search" },
        { id: "btn_request", label: "발행 요청", onClick: () => void handleRequest(), type: "save", disabled: tab !== "request" || disabledAll, action: "save" },
        { id: "btn_preview", label: "미리보기", onClick: () => setPreviewOpen(true), disabled: !onList || !detail || disabledAll, action: "view" },
        { id: "btn_issue", label: "PDF 발행", onClick: handleIssue, disabled: !onList || !a?.canIssue || disabledAll, action: "issue" },
        { id: "btn_reissue", label: "재발행", onClick: () => setReasonKind("reissue"), disabled: !onList || !a?.canReissue || disabledAll, action: "reissue" },
        { id: "btn_cancel", label: "회수", onClick: () => setReasonKind("cancel"), disabled: !onList || !a?.canCancel || disabledAll, action: "cancel" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="발행일" defaultKey="fromDt" type="date" value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        <SearchField label="~" defaultKey="toDt" type="date" value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        <SearchField label="수요가" defaultKey="cusNm" type="select" options={CUSTOMER_OPTIONS} value={filters.cusNm} onChange={(v) => setFilter("cusNm", v)} />
        <SearchField label="상태" defaultKey="status" type="select" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilter("status", v)} />
        <SearchField label="키워드" defaultKey="keyword" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} placeholder="번호·수요가·PO·주문·규격" />
      </SearchArea>

      <Tabs items={tabItems} activeKey={tab} onChange={changeTab} />

      {tab === "list" && (
        <ContentBody root resizable storageKey="mqc.qpr.qualityCertificate">
          <ContentPanel>
            <CertListPanel rows={rows} loading={isSearching} selected={selected} onRowClick={handleRowClick} />
          </ContentPanel>
          <ContentPanel width={460} scrollY>
            <CertDetailPane detail={detail} />
          </ContentPanel>
        </ContentBody>
      )}
      {tab === "request" && <RequestPanel ref={requestRef} orders={orders} busy={disabledAll} />}
      {tab === "history" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="발행·재발행·회수 처리 기록" count={events.length}>
              <AgDataGrid gridId="history" rowKey="histNo" columns={OUTPUT_HISTORY_COLUMNS} data={events} columnSizing="fit" loading={isSearching} />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {previewOpen && detail ? (
        <PrintPreviewModal
          open
          title="품질보증서 미리보기"
          fileName={`품질보증서_${detail.cert.qcNo}_${detail.cert.revText}`}
          onClose={() => setPreviewOpen(false)}
          testId="qc-sheet"
          extraFooter={
            detail.actions.canIssue ? (
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  handleIssue();
                }}
                disabled={disabledAll}
              >
                발행
              </Button>
            ) : null
          }
        >
          <CertificateSheet detail={detail} />
        </PrintPreviewModal>
      ) : null}

      {reasonKind && detail ? (
        <ReasonModal
          title={`${detail.cert.qcNo} ${reasonKind === "reissue" ? "재발행" : "회수"}`}
          label={reasonKind === "reissue" ? "재발행 사유" : "회수 사유"}
          confirmText={reasonKind === "reissue" ? "재발행" : "회수"}
          danger={reasonKind === "cancel"}
          busy={isBusy}
          onClose={() => setReasonKind(null)}
          onSubmit={(r) => void handleReason(r)}
        />
      ) : null}
    </PageLayout>
  );
}
