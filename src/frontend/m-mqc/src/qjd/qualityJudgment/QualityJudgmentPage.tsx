"use client";

/**
 * 품질판정(qualityJudgment) — 완성 코일의 검사값을 기준과 비교해 시스템이 판정을 제안하고, 검사자가 합격·불합격·보류로 확정한다.
 * 프로토타입 quality-judgment.html 의 「목록 + 오른쪽 상세」 모양을 화면 유형 B(조회 + 상세)로 옮겼다. 탭: 판정 대기 · 판정 기준 · 판정 이력.
 * 판정 계산(judge)은 고친 검사값을 저장하고 제안을 다시 계산한다. 확정(confirm)은 판정대기·보류 코일만 받고, 제안과 다르면 사유가 필요하다.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { errorMessage } from "@/common/oasis";
import { screenMeta } from "@/common/screens";
import { gridStatusBadge } from "@/qpr/shared/status";

import { confirmCoils, judgeCoil, loadCriteria, searchCoils, searchHistory, viewCoil } from "./api";
import { JudgmentDetailPane, type JudgmentDetailHandle } from "./JudgmentDetailPane";
import {
  DEFAULT_FILTERS,
  LINE_OPTIONS,
  PRD_OPTIONS,
  SCREEN_ID,
  STATUS_LABEL,
  STATUS_OPTIONS,
  type CheckBadge,
  type CoilRow,
  type CriteriaRow,
  type Filters,
  type JudgmentDetail,
  type JudgmentEvent,
  type JudgmentStatus,
} from "./types";

type TabKey = "list" | "criteria" | "history";

const BADGE_COLOR: Record<string, { bg?: string; color?: string; muted?: boolean }> = {
  PASS: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  FAIL: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  HOLD: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  NONE: { muted: true },
};

/** 검사 항목 배지 4개: 도(도금량) · 표(표면) · 기(기계적성질) · 치(치수). 녹색 통과 · 적색 미달 · 노랑 재검 · 회색 미검사. */
function renderChecks(_v: unknown, row: Record<string, unknown>) {
  const list = (row.badges as CheckBadge[] | undefined) ?? [];
  return (
    <span title="도 도금량 · 표 표면 · 기 기계적성질 · 치 치수 — 녹색 통과, 적색 미달, 노랑 재검, 회색 미검사">
      {list.map((b) => (
        <GridBadge key={b.grp} label={b.short} {...BADGE_COLOR[b.result]} />
      ))}
    </span>
  );
}

const LIST_COLUMNS: GridColumn[] = [
  { key: "coilNo", header: "코일번호", width: 110, align: "left" },
  { key: "ordNo", header: "주문번호", width: 120, align: "left" },
  { key: "prdLabel", header: "품명", width: 80, align: "left" },
  { key: "specCd", header: "규격", width: 110, align: "left" },
  { key: "sizeText", header: "두께 × 폭", width: 100, align: "right" },
  { key: "lineCd", header: "공정", width: 60, align: "center" },
  { key: "checkText", header: "검사 항목", width: 120, align: "center", sortable: false, filter: false, render: renderChecks },
  { key: "suggStatusNm", header: "제안", width: 70, align: "center", render: (v, r) => (v == null ? "—" : gridStatusBadge(r.suggStatus, v)) },
  { key: "statusNm", header: "판정", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.status, v) },
  { key: "inspBy", header: "검사자", width: 70, align: "center" },
  { key: "inspAt", header: "검사 시각", width: 120, align: "center" },
];

const CRITERIA_COLUMNS: GridColumn[] = [
  { key: "specCd", header: "규격", width: 120, align: "left" },
  { key: "prdLabel", header: "품명", width: 90, align: "left" },
  { key: "itemNm", header: "검사 항목", width: 110, align: "left" },
  { key: "unitNm", header: "단위", width: 70, align: "center" },
  { key: "critTxt", header: "기준", width: 120, align: "center" },
  { key: "coilCount", header: "적용 코일 수", width: 90, align: "right", type: "number" },
];

const HISTORY_COLUMNS: GridColumn[] = [
  { key: "actAt", header: "처리 시각", width: 130, align: "center" },
  { key: "coilNo", header: "코일번호", width: 110, align: "left" },
  { key: "actNm", header: "처리", width: 80, align: "center" },
  { key: "statBefNm", header: "이전", width: 70, align: "center" },
  { key: "statAftNm", header: "이후", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.statAft, v) },
  { key: "suggStatNm", header: "시스템 제안", width: 90, align: "center", render: (v, r) => (v == null ? "—" : gridStatusBadge(r.suggStat, v)) },
  { key: "note", header: "내용", width: 260, minWidth: 180, align: "left" },
  { key: "actBy", header: "처리자", width: 80, align: "center" },
];

const CoilListPanel = memo(function CoilListPanel({
  rows,
  loading,
  selectedCoil,
  onRowClick,
  onCheck,
}: {
  rows: CoilRow[];
  loading: boolean;
  selectedCoil: string;
  onRowClick: (row: Record<string, unknown>) => void;
  onCheck: (ids: (string | number)[]) => void;
}) {
  return (
    <GridPanel title="코일 판정 목록" count={rows.length}>
      <AgDataGrid
        gridId="list"
        rowKey="coilNo"
        columns={LIST_COLUMNS}
        data={rows}
        columnSizing="fixed"
        selectable
        multiSelect
        onRowSelect={(ids) => onCheck(ids)}
        highlightedRowKey={selectedCoil}
        onRowClick={onRowClick}
        loading={loading}
      />
    </GridPanel>
  );
});

export function QualityJudgmentPage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const [tab, setTab] = useState<TabKey>("list");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CoilRow[]>([]);
  const [counts, setCounts] = useState<Record<JudgmentStatus, number>>({ WAIT: 0, PASS: 0, FAIL: 0, HOLD: 0 });
  const [checked, setChecked] = useState<string[]>([]);
  const [selectedCoil, setSelectedCoil] = useState("");
  const [detail, setDetail] = useState<JudgmentDetail | null>(null);
  const [criteria, setCriteria] = useState<CriteriaRow[]>([]);
  const [events, setEvents] = useState<JudgmentEvent[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const detailRef = useRef<JudgmentDetailHandle>(null);
  const detailSeq = useRef(0);

  const setFilter = (key: keyof Filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  const loadDetail = useCallback(
    async (coilNo: string) => {
      const seq = ++detailSeq.current;
      try {
        const d = await viewCoil(coilNo);
        if (seq === detailSeq.current) setDetail(d);
      } catch (e) {
        showMessage({ title: "오류", message: errorMessage(e), alertType: "error" });
      }
    },
    [showMessage],
  );

  /** 지금 탭의 데이터를 조회한다. keepSelection 이면 고른 코일의 상세를 다시 읽는다. */
  const handleSearch = useCallback(
    async (keepSelection = false) => {
      if (filters.fromDt && filters.toDt && filters.fromDt > filters.toDt) {
        showMessage({ message: "시작일이 종료일보다 늦을 수 없습니다.", alertType: "warning" });
        return;
      }
      setSearching(true);
      try {
        if (tab === "criteria") setCriteria(await loadCriteria(filters.prdCd, filters.keyword));
        else if (tab === "history") setEvents(await searchHistory(filters.fromDt, filters.toDt));
        const result = await searchCoils(filters);
        setRows(result.rows);
        setCounts(result.counts);
        if (!keepSelection) {
          setSelectedCoil("");
          setDetail(null);
        }
      } catch (e) {
        showMessage({ title: "오류", message: errorMessage(e), alertType: "error" });
      } finally {
        setSearching(false);
      }
    },
    [filters, tab, showMessage],
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const coilNo = String(row.coilNo);
      setSelectedCoil(coilNo);
      void loadDetail(coilNo);
    },
    [loadDetail],
  );
  const handleCheck = useCallback((ids: (string | number)[]) => setChecked(ids.map(String)), []);

  const handleJudge = useCallback(async () => {
    if (!detail) return;
    const edits = detailRef.current?.getEdits() ?? {};
    setBusy(true);
    try {
      const d = await judgeCoil(detail.coil.coilNo, edits);
      setDetail(d);
      showMessage({
        message: `판정을 계산했습니다. 시스템 제안: ${d.judgment.suggStatusNm ?? "—"}`,
        alertType: "success",
        toast: true,
      });
      await handleSearch(true);
    } catch (e) {
      showMessage({ title: "오류", message: errorMessage(e), alertType: "error" });
    } finally {
      setBusy(false);
    }
  }, [detail, handleSearch, showMessage]);

  const runConfirm = useCallback(
    async (coilNos: string[], status: Exclude<JudgmentStatus, "WAIT">, note: string) => {
      setBusy(true);
      try {
        const out = await confirmCoils(coilNos, status, note);
        if (out.detail) setDetail(out.detail);
        else if (selectedCoil) await loadDetail(selectedCoil);
        showMessage({ message: `${out.count}건을 ${STATUS_LABEL[status]}(으)로 확정했습니다.`, alertType: "success", toast: true });
        await handleSearch(true);
      } catch (e) {
        showMessage({ title: "오류", message: errorMessage(e), alertType: "error" });
      } finally {
        setBusy(false);
      }
    },
    [handleSearch, loadDetail, selectedCoil, showMessage],
  );

  const handleConfirm = useCallback(
    (status: Exclude<JudgmentStatus, "WAIT">) => {
      if (!detail) return;
      const note = detailRef.current?.getNote().trim() ?? "";
      const edits = detailRef.current?.getEdits() ?? {};
      if (Object.keys(edits).length > 0) {
        showMessage({ message: "고친 검사값이 있습니다. [판정 계산] 으로 먼저 반영하세요.", alertType: "warning" });
        return;
      }
      if (detail.judgment.suggStatus !== status && note === "") {
        showMessage({ message: "시스템 제안과 다르게 확정하려면 판정 사유를 입력하세요.", alertType: "warning" });
        return;
      }
      showMessage({
        title: "확인",
        message: `${detail.coil.coilNo} 를 ${STATUS_LABEL[status]}(으)로 확정하시겠습니까?`,
        alertType: "confirm",
        onConfirm: () => void runConfirm([detail.coil.coilNo], status, note),
      });
    },
    [detail, runConfirm, showMessage],
  );

  const handleBatchPass = useCallback(() => {
    if (checked.length === 0) {
      showMessage({ message: "목록에서 코일을 선택하세요.", alertType: "warning" });
      return;
    }
    showMessage({
      title: "확인",
      message: `선택한 ${checked.length}건을 합격으로 확정하시겠습니까? 시스템 제안이 합격인 판정대기·보류 코일만 처리합니다.`,
      alertType: "confirm",
      onConfirm: () => void runConfirm(checked, "PASS", ""),
    });
  }, [checked, runConfirm, showMessage]);

  const tabItems: TabItem[] = useMemo(
    () => [
      { key: "list", label: `판정 대기 (${counts.WAIT})` },
      { key: "criteria", label: "판정 기준" },
      { key: "history", label: "판정 이력" },
    ],
    [counts.WAIT],
  );

  const open = !!detail?.judgment.open;
  const disabledAll = isBusy || isSearching;
  const canAct = tab === "list" && open && !disabledAll;
  const detailKey = detail ? `${detail.coil.coilNo}|${detail.judgment.judgedAt ?? ""}|${detail.judgment.status}` : "none";

  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: disabledAll, action: "search" },
        { id: "btn_judge", label: "판정 계산", onClick: () => void handleJudge(), disabled: !canAct, action: "judge" },
        { id: "btn_pass", label: "합격 판정", onClick: () => handleConfirm("PASS"), type: "save", disabled: !canAct, action: "confirm" },
        { id: "btn_fail", label: "불합격", onClick: () => handleConfirm("FAIL"), disabled: !canAct, action: "confirm" },
        { id: "btn_hold", label: "보류", onClick: () => handleConfirm("HOLD"), disabled: !canAct, action: "confirm" },
        {
          id: "btn_batch_pass",
          label: checked.length > 0 ? `일괄 합격 (${checked.length})` : "일괄 합격",
          onClick: handleBatchPass,
          disabled: tab !== "list" || disabledAll || checked.length === 0,
          action: "confirm",
        },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="검사일" defaultKey="fromDt" type="date" value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        <SearchField label="~" defaultKey="toDt" type="date" value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        <SearchField label="공정" defaultKey="lineCd" type="select" options={LINE_OPTIONS} value={filters.lineCd} onChange={(v) => setFilter("lineCd", v)} />
        <SearchField label="품명" defaultKey="prdCd" type="select" options={PRD_OPTIONS} value={filters.prdCd} onChange={(v) => setFilter("prdCd", v)} />
        <SearchField label="상태" defaultKey="status" type="select" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilter("status", v)} />
        <SearchField label="키워드" defaultKey="keyword" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} placeholder="번호·품명·규격·담당" />
      </SearchArea>

      <Tabs
        items={tabItems}
        activeKey={tab}
        onChange={(k) => {
          const next = k as TabKey;
          setTab(next);
          if (next === "criteria" && criteria.length === 0) void loadCriteria(filters.prdCd, filters.keyword).then(setCriteria).catch((e) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }));
          if (next === "history") void searchHistory(filters.fromDt, filters.toDt).then(setEvents).catch((e) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }));
        }}
      />

      {tab === "list" && (
        <ContentBody root resizable storageKey="mqc.qjd.qualityJudgment">
          <ContentPanel>
            <CoilListPanel rows={rows} loading={isSearching} selectedCoil={selectedCoil} onRowClick={handleRowClick} onCheck={handleCheck} />
          </ContentPanel>
          <ContentPanel width={460} scrollY>
            <JudgmentDetailPane key={detailKey} ref={detailRef} detail={detail} busy={disabledAll} />
          </ContentPanel>
        </ContentBody>
      )}
      {tab === "criteria" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="판정 기준 (품질설계결과에서 내려온 규격별 기준)" count={criteria.length}>
              <AgDataGrid gridId="criteria" rowKey="key" columns={CRITERIA_COLUMNS} data={criteria} columnSizing="fit" loading={isSearching} />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}
      {tab === "history" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="판정·보류·재검 처리 기록" count={events.length}>
              <AgDataGrid gridId="history" rowKey="histNo" columns={HISTORY_COLUMNS} data={events} columnSizing="fit" loading={isSearching} />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}
    </PageLayout>
  );
}
