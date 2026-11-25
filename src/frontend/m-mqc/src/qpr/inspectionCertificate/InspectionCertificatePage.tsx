"use client";

/**
 * 검사증명서관리(inspectionCertificate) — 코일·적용 규격 단위 검사증명서(MTC)를 요청·발행·재발행·보류한다.
 * 프로토타입 inspection-certificate.html 의 「목록 + 오른쪽 상세」 모양을 화면 유형 B 로 옮겼다. 탭: 증명서 목록 · 발행 요청 · 발행 이력.
 * 발행하면 그 순간의 검사값(YP·TS·EL·도금량)을 고정한다. 발행은 코일 판정이 합격이어야 한다(서버가 다시 확인).
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
import { gridStatusBadge, OUTPUT_HISTORY_COLUMNS, type OutputEvent } from "@/qpr/shared/status";

import { holdMtc, issueMtcs, loadCoils, reissueMtc, requestMtc, searchMtcHistory, searchMtcs, viewMtc } from "./api";
import { MtcDetailPane } from "./MtcDetailPane";
import { MtcSheet } from "./MtcSheet";
import { RequestPanel, type MtcRequestHandle } from "./RequestPanel";
import { DEFAULT_FILTERS, SCREEN_ID, STATUS_OPTIONS, STD_OPTIONS, type CoilOption, type Filters, type MtcDetail, type MtcRow, type MtcStatus } from "./types";

type TabKey = "list" | "request" | "history";
type ReasonKind = "reissue" | "hold";

const val = (v: unknown) => (v == null ? "—" : String(v));

const LIST_COLUMNS: GridColumn[] = [
  { key: "mtcNo", header: "증명서번호", width: 120, align: "left" },
  { key: "stdCd", header: "적용 규격", width: 90, align: "left" },
  { key: "coilNo", header: "코일번호", width: 110, align: "left" },
  { key: "heatNo", header: "Heat", width: 70, align: "center" },
  { key: "prdLabel", header: "품명", width: 80, align: "left" },
  { key: "sizeText", header: "두께 × 폭", width: 100, align: "right" },
  { key: "yp", header: "YP", width: 55, align: "right", render: val },
  { key: "ts", header: "TS", width: 55, align: "right", render: val },
  { key: "el", header: "EL %", width: 55, align: "right", render: val },
  { key: "coat", header: "도금량", width: 60, align: "right", render: val },
  { key: "statusNm", header: "상태", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.status, v) },
  { key: "judgStatusNm", header: "코일 판정", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.judgStatus, v) },
  { key: "inspDate", header: "검사일", width: 100, align: "center" },
  { key: "inspBy", header: "담당", width: 70, align: "center" },
];

const MtcListPanel = memo(function MtcListPanel({
  rows,
  loading,
  selected,
  onRowClick,
  onCheck,
}: {
  rows: MtcRow[];
  loading: boolean;
  selected: string;
  onRowClick: (row: Record<string, unknown>) => void;
  onCheck: (ids: (string | number)[]) => void;
}) {
  return (
    <GridPanel title="검사증명서 목록" count={rows.length}>
      <AgDataGrid
        gridId="list"
        rowKey="mtcNo"
        columns={LIST_COLUMNS}
        data={rows}
        columnSizing="fixed"
        selectable
        multiSelect
        isRowSelectable={(r) => r.status !== "ISSUED"}
        onRowSelect={(ids) => onCheck(ids)}
        highlightedRowKey={selected}
        onRowClick={onRowClick}
        loading={loading}
      />
    </GridPanel>
  );
});

export function InspectionCertificatePage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const [tab, setTab] = useState<TabKey>("list");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<MtcRow[]>([]);
  const [counts, setCounts] = useState<Record<MtcStatus, number>>({ REVIEW: 0, ISSUED: 0, HOLD: 0 });
  const [checked, setChecked] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<MtcDetail | null>(null);
  const [coils, setCoils] = useState<CoilOption[]>([]);
  const [events, setEvents] = useState<OutputEvent[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reasonKind, setReasonKind] = useState<ReasonKind | null>(null);
  const requestRef = useRef<MtcRequestHandle>(null);
  const detailSeq = useRef(0);

  const setFilter = (key: keyof Filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);

  const loadDetail = useCallback(
    async (mtcNo: string) => {
      const seq = ++detailSeq.current;
      try {
        const d = await viewMtc(mtcNo);
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
        if (tab === "history") setEvents(await searchMtcHistory(filters.fromDt, filters.toDt));
        if (tab === "request") setCoils(await loadCoils());
        const result = await searchMtcs(filters);
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
      const no = String(row.mtcNo);
      setSelected(no);
      void loadDetail(no);
    },
    [loadDetail],
  );
  const handleCheck = useCallback((ids: (string | number)[]) => setChecked(ids.map(String)), []);

  const afterChange = useCallback(
    async (d: MtcDetail | undefined, done: string) => {
      if (d) {
        setDetail(d);
        setSelected(d.cert.mtcNo);
      } else if (selected) await loadDetail(selected);
      showMessage({ message: done, alertType: "success", toast: true });
      await handleSearch(true);
    },
    [handleSearch, loadDetail, selected, showMessage],
  );

  const issue = useCallback(
    (nos: string[]) => {
      showMessage({
        title: "확인",
        message: nos.length === 1 ? `${nos[0]} 를 발행하시겠습니까? 지금 검사값이 증명서에 고정됩니다.` : `선택한 ${nos.length}건을 발행하시겠습니까?`,
        alertType: "confirm",
        onConfirm: async () => {
          setBusy(true);
          try {
            const out = await issueMtcs(nos);
            await afterChange(out.detail, `${out.count}건을 발행했습니다.`);
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        },
      });
    },
    [afterChange, fail, showMessage],
  );

  const handleReason = useCallback(
    async (reason: string) => {
      if (!detail || !reasonKind) return;
      const no = detail.cert.mtcNo;
      setBusy(true);
      try {
        const d = reasonKind === "reissue" ? await reissueMtc(no, reason) : await holdMtc(no, reason);
        await afterChange(d, reasonKind === "reissue" ? "재발행했습니다." : "보류했습니다.");
        setReasonKind(null);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [afterChange, detail, fail, reasonKind],
  );

  const handleRequest = useCallback(async () => {
    const form = requestRef.current?.getForm();
    if (!form) return;
    if (!form.coilNo) {
      showMessage({ message: "코일번호를 선택하세요.", alertType: "warning" });
      return;
    }
    setBusy(true);
    try {
      const d = await requestMtc(form);
      setTab("list");
      await afterChange(d, `발행 요청을 등록했습니다: ${d.cert.mtcNo}(검토중)`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [afterChange, fail, showMessage]);

  const changeTab = (k: string) => {
    const next = k as TabKey;
    setTab(next);
    if (next === "request") void loadCoils().then(setCoils).catch(fail);
    if (next === "history") void searchMtcHistory(filters.fromDt, filters.toDt).then(setEvents).catch(fail);
  };

  const tabItems: TabItem[] = useMemo(
    () => [
      { key: "list", label: `증명서 목록 (${counts.REVIEW + counts.ISSUED + counts.HOLD})` },
      { key: "request", label: "발행 요청" },
      { key: "history", label: "발행 이력" },
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
        { id: "btn_issue", label: "발행", onClick: () => detail && issue([detail.cert.mtcNo]), disabled: !onList || !a?.canIssue || disabledAll, action: "issue" },
        {
          id: "btn_issue_batch",
          label: checked.length > 0 ? `일괄 발행 (${checked.length})` : "일괄 발행",
          onClick: () => issue(checked),
          disabled: !onList || checked.length === 0 || disabledAll,
          action: "issue",
        },
        { id: "btn_reissue", label: "재발행", onClick: () => setReasonKind("reissue"), disabled: !onList || !a?.canReissue || disabledAll, action: "reissue" },
        { id: "btn_hold", label: "보류", onClick: () => setReasonKind("hold"), disabled: !onList || !a?.canCancel || disabledAll, action: "cancel" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="검사일" defaultKey="fromDt" type="date" value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        <SearchField label="~" defaultKey="toDt" type="date" value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        <SearchField label="규격" defaultKey="stdCd" type="select" options={STD_OPTIONS} value={filters.stdCd} onChange={(v) => setFilter("stdCd", v)} />
        <SearchField label="상태" defaultKey="status" type="select" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilter("status", v)} />
        <SearchField label="키워드" defaultKey="keyword" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} placeholder="번호·코일·Heat·규격" />
      </SearchArea>

      <Tabs items={tabItems} activeKey={tab} onChange={changeTab} />

      {tab === "list" && (
        <ContentBody root resizable storageKey="mqc.qpr.inspectionCertificate">
          <ContentPanel>
            <MtcListPanel rows={rows} loading={isSearching} selected={selected} onRowClick={handleRowClick} onCheck={handleCheck} />
          </ContentPanel>
          <ContentPanel width={460} scrollY>
            <MtcDetailPane detail={detail} />
          </ContentPanel>
        </ContentBody>
      )}
      {tab === "request" && <RequestPanel ref={requestRef} coils={coils} busy={disabledAll} />}
      {tab === "history" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="증명서 발행·재발행·보류 처리 기록" count={events.length}>
              <AgDataGrid gridId="history" rowKey="histNo" columns={OUTPUT_HISTORY_COLUMNS} data={events} columnSizing="fit" loading={isSearching} />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {previewOpen && detail ? (
        <PrintPreviewModal
          open
          title="검사증명서 미리보기"
          fileName={`검사증명서_${detail.cert.mtcNo}`}
          onClose={() => setPreviewOpen(false)}
          testId="mtc-sheet"
          extraFooter={
            detail.actions.canIssue ? (
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  issue([detail.cert.mtcNo]);
                }}
                disabled={disabledAll}
              >
                발행
              </Button>
            ) : null
          }
        >
          <MtcSheet detail={detail} />
        </PrintPreviewModal>
      ) : null}

      {reasonKind && detail ? (
        <ReasonModal
          title={`${detail.cert.mtcNo} ${reasonKind === "reissue" ? "재발행" : "보류"}`}
          label={reasonKind === "reissue" ? "재발행 사유" : "보류 사유"}
          confirmText={reasonKind === "reissue" ? "재발행" : "보류"}
          danger={reasonKind === "hold"}
          busy={isBusy}
          onClose={() => setReasonKind(null)}
          onSubmit={(r) => void handleReason(r)}
        />
      ) : null}
    </PageLayout>
  );
}
