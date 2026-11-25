"use client";

/**
 * Tag관리(tagManagement) — 코일 단위 공정 Tag·출하 Tag 를 출력·재발행·폐기한다.
 * 프로토타입 tag-management.html 의 「목록 + 오른쪽 상세(Tag 미리보기)」 모양을 화면 유형 B 로 옮겼다. 탭: Tag 발행 · 재발행 요청 · 처리 이력.
 * 출하 Tag 는 코일이 합격이어야 출력·재발행한다(서버가 다시 확인). [미리보기] 는 100 × 70 mm 용지로 브라우저 인쇄를 연다.
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

import { discardTag, issueTags, reissueTag, searchTagHistory, searchTags, viewTag } from "./api";
import { ReissuePanel, type ReissueHandle } from "./ReissuePanel";
import { TagDetailPane } from "./TagDetailPane";
import { TagLabel } from "./TagLabel";
import { DEFAULT_FILTERS, PRINTER_FILTER_OPTIONS, SCREEN_ID, STATUS_OPTIONS, type Filters, type TagDetail, type TagRow, type TagStatus } from "./types";

type TabKey = "list" | "reissue" | "history";

const LIST_COLUMNS: GridColumn[] = [
  { key: "tagNo", header: "Tag번호", width: 110, align: "left" },
  { key: "tagKndNm", header: "종류", width: 70, align: "center" },
  { key: "coilNo", header: "코일번호", width: 110, align: "left" },
  { key: "ordNo", header: "주문번호", width: 120, align: "left" },
  { key: "prdLabel", header: "품명", width: 80, align: "left" },
  { key: "sizeText", header: "두께 × 폭", width: 100, align: "right" },
  { key: "wgt", header: "중량 (kg)", width: 80, align: "right", type: "number", render: (v) => num(v) },
  { key: "cusNm", header: "수요가", width: 80, align: "left" },
  { key: "prtId", header: "프린터", width: 100, align: "center" },
  { key: "statusNm", header: "상태", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.status, v) },
  { key: "judgStatusNm", header: "코일 판정", width: 70, align: "center", render: (v, r) => gridStatusBadge(r.judgStatus, v) },
  { key: "issueAt", header: "발행", width: 120, align: "center", render: (v) => (v ? String(v) : "—") },
  { key: "issueBy", header: "담당", width: 70, align: "center", render: (v) => (v ? String(v) : "—") },
];

const TagListPanel = memo(function TagListPanel({
  rows,
  loading,
  selected,
  onRowClick,
  onCheck,
}: {
  rows: TagRow[];
  loading: boolean;
  selected: string;
  onRowClick: (row: Record<string, unknown>) => void;
  onCheck: (ids: (string | number)[]) => void;
}) {
  return (
    <GridPanel title="Tag 목록" count={rows.length}>
      <AgDataGrid
        gridId="list"
        rowKey="tagNo"
        columns={LIST_COLUMNS}
        data={rows}
        columnSizing="fixed"
        selectable
        multiSelect
        isRowSelectable={(r) => r.status === "WAIT"}
        onRowSelect={(ids) => onCheck(ids)}
        highlightedRowKey={selected}
        onRowClick={onRowClick}
        loading={loading}
      />
    </GridPanel>
  );
});

export function TagManagementPage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const [tab, setTab] = useState<TabKey>("list");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<TagRow[]>([]);
  const [counts, setCounts] = useState<Record<TagStatus, number>>({ WAIT: 0, ISSUED: 0, REISSUED: 0, DISCARDED: 0 });
  const [checked, setChecked] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<TagDetail | null>(null);
  const [events, setEvents] = useState<OutputEvent[]>([]);
  const [reissueTarget, setReissueTarget] = useState("");
  const [isSearching, setSearching] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const reissueRef = useRef<ReissueHandle>(null);
  const detailSeq = useRef(0);

  const setFilter = (key: keyof Filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);

  const loadDetail = useCallback(
    async (tagNo: string) => {
      const seq = ++detailSeq.current;
      try {
        const d = await viewTag(tagNo);
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
        if (tab === "history") setEvents(await searchTagHistory(filters.fromDt, filters.toDt));
        const result = await searchTags(filters);
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
      const no = String(row.tagNo);
      setSelected(no);
      void loadDetail(no);
    },
    [loadDetail],
  );
  const handleCheck = useCallback((ids: (string | number)[]) => setChecked(ids.map(String)), []);

  const afterChange = useCallback(
    async (d: TagDetail | undefined, done: string) => {
      if (d) {
        setDetail(d);
        setSelected(d.tag.tagNo);
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
        message: nos.length === 1 ? `${nos[0]} 를 출력하시겠습니까?` : `선택한 Tag ${nos.length}건을 출력하시겠습니까?`,
        alertType: "confirm",
        onConfirm: async () => {
          setBusy(true);
          try {
            const out = await issueTags(nos);
            await afterChange(out.detail, `Tag ${out.count}건을 출력(발행)했습니다.`);
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

  const handleDiscard = useCallback(
    async (reason: string) => {
      if (!detail) return;
      setBusy(true);
      try {
        await afterChange(await discardTag(detail.tag.tagNo, reason), "폐기했습니다.");
        setDiscardOpen(false);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [afterChange, detail, fail],
  );

  const handleReissue = useCallback(async () => {
    const form = reissueRef.current?.getForm();
    if (!form) return;
    if (!form.target.trim()) {
      showMessage({ message: "Tag번호 또는 코일번호를 입력하세요.", alertType: "warning" });
      return;
    }
    setBusy(true);
    try {
      const d = await reissueTag(form);
      setTab("list");
      await afterChange(d, `${d.tag.tagNo} 를 재발행했습니다.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [afterChange, fail, showMessage]);

  const changeTab = (k: string) => {
    const next = k as TabKey;
    if (next === "reissue" && tab !== "reissue") setReissueTarget(detail?.actions.canReissue ? detail.tag.tagNo : "");
    setTab(next);
    if (next === "history") void searchTagHistory(filters.fromDt, filters.toDt).then(setEvents).catch(fail);
  };

  const tabItems: TabItem[] = useMemo(
    () => [
      { key: "list", label: `Tag 발행 (${counts.WAIT + counts.ISSUED + counts.REISSUED + counts.DISCARDED})` },
      { key: "reissue", label: "재발행 요청" },
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
        { id: "btn_preview", label: "미리보기", onClick: () => setPreviewOpen(true), disabled: !onList || !detail || disabledAll, action: "view" },
        { id: "btn_issue", label: "출력", onClick: () => detail && issue([detail.tag.tagNo]), type: "save", disabled: !onList || !a?.canIssue || disabledAll, action: "issue" },
        {
          id: "btn_issue_batch",
          label: checked.length > 0 ? `선택 Tag 출력 (${checked.length})` : "선택 Tag 출력",
          onClick: () => issue(checked),
          disabled: !onList || checked.length === 0 || disabledAll,
          action: "issue",
        },
        {
          id: "btn_reissue",
          label: tab === "reissue" ? "재발행 요청" : "재발행",
          onClick: () => (tab === "reissue" ? void handleReissue() : changeTab("reissue")),
          disabled: disabledAll || (onList && !a?.canReissue) || tab === "history",
          action: "reissue",
        },
        { id: "btn_discard", label: "폐기", onClick: () => setDiscardOpen(true), disabled: !onList || !a?.canCancel || disabledAll, action: "cancel" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="발행일" defaultKey="fromDt" type="date" value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        <SearchField label="~" defaultKey="toDt" type="date" value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        <SearchField label="프린터" defaultKey="prtId" type="select" options={PRINTER_FILTER_OPTIONS} value={filters.prtId} onChange={(v) => setFilter("prtId", v)} />
        <SearchField label="상태" defaultKey="status" type="select" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilter("status", v)} />
        <SearchField label="키워드" defaultKey="keyword" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} placeholder="Tag·코일·주문·수요가" />
      </SearchArea>

      <Tabs items={tabItems} activeKey={tab} onChange={changeTab} />

      {tab === "list" && (
        <ContentBody root resizable storageKey="mqc.qpr.tagManagement">
          <ContentPanel>
            <TagListPanel rows={rows} loading={isSearching} selected={selected} onRowClick={handleRowClick} onCheck={handleCheck} />
          </ContentPanel>
          <ContentPanel width={460} scrollY>
            <TagDetailPane detail={detail} />
          </ContentPanel>
        </ContentBody>
      )}
      {tab === "reissue" && <ReissuePanel key={reissueTarget} ref={reissueRef} initialTarget={reissueTarget} busy={disabledAll} />}
      {tab === "history" && (
        <ContentBody root>
          <ContentPanel>
            <GridPanel title="Tag 출력·재발행·폐기 처리 기록" count={events.length}>
              <AgDataGrid gridId="history" rowKey="histNo" columns={OUTPUT_HISTORY_COLUMNS} data={events} columnSizing="fit" loading={isSearching} />
            </GridPanel>
          </ContentPanel>
        </ContentBody>
      )}

      {previewOpen && detail ? (
        <PrintPreviewModal
          open
          title={`${detail.tag.tagNo} · ${detail.tag.tagKndNm} 미리보기`}
          fileName={`Tag_${detail.tag.tagNo}`}
          paper="TAG"
          onClose={() => setPreviewOpen(false)}
          testId="tag-sheet"
          extraFooter={
            detail.actions.canIssue ? (
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  issue([detail.tag.tagNo]);
                }}
                disabled={disabledAll}
              >
                출력 처리
              </Button>
            ) : null
          }
        >
          <TagLabel tag={detail.tag} />
        </PrintPreviewModal>
      ) : null}

      {discardOpen && detail ? (
        <ReasonModal
          title={`${detail.tag.tagNo} 폐기`}
          label="폐기 사유"
          confirmText="폐기"
          danger
          busy={isBusy}
          onClose={() => setDiscardOpen(false)}
          onSubmit={(r) => void handleDiscard(r)}
        />
      ) : null}
    </PageLayout>
  );
}
