"use client";

/**
 * noticeMgmt — 공지사항 관리 화면.
 *
 * 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md
 * 페이지 유형 B (조회 + 상세) — 좌측 목록 그리드(A-GRID) + 우측 상세 폼(A-DETAIL).
 *
 * SIDEBAR / HEADER / TabsBar 는 portal 의 PortalShell 이 주입하므로 여기서 그리지 않는다.
 * 본 화면이 소유하는 범위는 PageLayout 내부(title / buttons / SearchArea / ContentBody)뿐이다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  ErrorModal,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { DatePicker, Input, Select, Textarea } from "@dk-oasis/shared/form";

import { changeNoticeStatus, saveNotices, searchNotices } from "./api";
import {
  NOTICE_STATUS,
  NOTICE_STATUS_FORM_OPTIONS,
  NOTICE_STATUS_LABEL,
  NOTICE_STATUS_OPTIONS,
  emptyFilters,
  emptyNoticeRow,
  type NoticeMgmtFilters,
  type NoticeRow,
} from "./types";

/** §3.2 그리드 컬럼 G-001~G-005 (+ audit 표시). 편집은 상세 폼에서만 한다 — 그리드는 read-only. */
const NOTICE_COLUMNS: GridColumn[] = [
  { key: "NOTICE_ID", header: "공지번호", width: 140, align: "left" },
  { key: "TITLE", header: "제목", width: 260, align: "left" },
  { key: "NOTICE_STATUS_LABEL", header: "게시상태", width: 90, align: "center" },
  { key: "POST_START_DT", header: "게시시작일", width: 110, align: "center" },
  { key: "POST_END_DT", header: "게시종료일", width: 110, align: "center" },
  { key: "C_USR_ID", header: "등록자", width: 90, align: "center" },
];

export default function NoticeMgmtPage() {
  const [filters, setFilters] = useState<NoticeMgmtFilters>(emptyFilters);
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState<NoticeRow | null>(null);
  /** 신규 행 편집 중인지. 저장 전에는 NOTICE_ID 가 없어 selectedId 로 구분할 수 없다. */
  const [isNew, setIsNew] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** §3.3 코드값 변환은 그리드 바인딩 직전에 파생 컬럼으로 만든다 — 저장 컬럼이 아니다. */
  const gridRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        NOTICE_STATUS_LABEL: NOTICE_STATUS_LABEL[r.NOTICE_STATUS] ?? r.NOTICE_STATUS,
      })),
    [rows],
  );

  const selectedRow = useMemo(
    () => rows.find((r) => r.NOTICE_ID === selectedId) ?? null,
    [rows, selectedId],
  );

  const handleFilterChange = useCallback((key: keyof NoticeMgmtFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** B-001 조회 — 조회 후 상세 폼과 선택을 초기화한다 (§5.2). */
  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      const payload = await searchNotices(filters);
      setRows(payload.list ?? []);
      setSelectedId("");
      setForm(null);
      setIsNew(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [filters]);

  // 화면 진입 시 1회 자동 조회 — 빈 화면으로 시작하면 사용자가 조회를 눌러야 내용을 볼 수 있다.
  useEffect(() => {
    void handleSearch();
    // 최초 1회만 — filters 변경 때마다 자동 조회하지 않는다 (조회는 B-001 버튼이 트리거).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** B-002 신규 — 상세 폼만 초기화한다. 서버 호출 없음 (§5.2). */
  const handleNew = useCallback(() => {
    setSelectedId("");
    setForm(emptyNoticeRow());
    setIsNew(true);
  }, []);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const id = String(row.NOTICE_ID ?? "");
    setSelectedId(id);
    setIsNew(false);
    setForm({
      NOTICE_ID: id,
      TITLE: String(row.TITLE ?? ""),
      CONTENT: (row.CONTENT as string | null) ?? "",
      NOTICE_STATUS: String(row.NOTICE_STATUS ?? NOTICE_STATUS.DRAFT),
      POST_START_DT: (row.POST_START_DT as string | null) ?? "",
      POST_END_DT: (row.POST_END_DT as string | null) ?? "",
    });
  }, []);

  const handleFormChange = useCallback((key: keyof NoticeRow, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /**
   * §6 클라이언트 검증. 서버도 같은 규칙을 재검증하므로 여기서는 왕복 한 번을 아끼는 용도다.
   * 첫 번째 위반만 돌려준다 — §6.3 이 "첫 번째 에러 필드로 포커스 이동" 을 규정한다.
   */
  const validate = useCallback((row: NoticeRow): string | null => {
    if (!row.TITLE || !row.TITLE.trim()) return "제목은 필수입니다."; // V-001
    if (row.TITLE.length > 200) return "제목은 200자를 넘을 수 없습니다."; // V-002
    if ((row.CONTENT ?? "").length > 4000) return "내용은 4000자를 넘을 수 없습니다."; // V-003
    if (!row.NOTICE_STATUS) return "게시상태를 선택하세요."; // V-004
    if (row.POST_START_DT && row.POST_END_DT && row.POST_START_DT > row.POST_END_DT) {
      return "게시시작일은 게시종료일보다 늦을 수 없습니다."; // XV-001
    }
    if (row.NOTICE_STATUS === NOTICE_STATUS.POSTED && (!row.POST_START_DT || !row.POST_END_DT)) {
      return "게시중으로 변경하려면 게시기간을 입력하세요."; // XV-002
    }
    return null;
  }, []);

  /** B-003 저장 — 상세 폼 1건을 C 또는 U 로 보낸다. */
  const handleSave = useCallback(async () => {
    if (!form) {
      setErrorMessage("저장할 내용이 없습니다. 행을 선택하거나 [신규] 를 누르세요.");
      return;
    }
    const invalid = validate(form);
    if (invalid) {
      setErrorMessage(invalid);
      return;
    }
    setIsBusy(true);
    try {
      const payload = await saveNotices([{ ...form, rowStatus: isNew ? "inserted" : "updated" }]);
      setRows(payload.list ?? []);
      setForm(null);
      setSelectedId("");
      setIsNew(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [form, isNew, validate]);

  /** B-004 삭제 — 선택 행을 rowStatus=D 로 보낸다. 게시중 건은 서버가 거부한다 (§7.4). */
  const handleDelete = useCallback(async () => {
    if (!selectedRow) {
      setErrorMessage("삭제할 행을 선택하세요.");
      return;
    }
    setIsBusy(true);
    try {
      const payload = await saveNotices([{ ...selectedRow, rowStatus: "deleted" }]);
      setRows(payload.list ?? []);
      setForm(null);
      setSelectedId("");
      setIsNew(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [selectedRow]);

  /** B-005 게시중지 — 게시중 건만 활성 (§7.4). 전이 가능 여부는 서버가 다시 판정한다. */
  const handleStop = useCallback(async () => {
    if (!selectedRow) return;
    setIsBusy(true);
    try {
      const payload = await changeNoticeStatus(selectedRow.NOTICE_ID, NOTICE_STATUS.STOPPED);
      setRows(payload.list ?? []);
      setForm(null);
      setSelectedId("");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [selectedRow]);

  const isPosted = selectedRow?.NOTICE_STATUS === NOTICE_STATUS.POSTED;

  return (
    <PageLayout
      title="공지사항 관리"
      breadcrumb="공지관리 > 공지사항 관리"
      objId="noticeMgmt"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: () => void handleSearch(),
          type: "primary" as const,
          disabled: isBusy,
          action: "search",
        },
        {
          id: "btn_new",
          label: "신규",
          onClick: handleNew,
          disabled: isBusy,
          action: "save",
        },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: isBusy || !form,
          action: "save",
        },
        {
          id: "btn_delete",
          label: "삭제",
          onClick: () => void handleDelete(),
          // §7.4 — 게시중 건은 삭제 버튼 자체를 비활성한다.
          disabled: isBusy || !selectedRow || isPosted,
          action: "save",
        },
        {
          id: "btn_stop",
          label: "게시중지",
          onClick: () => void handleStop(),
          // §7.4 — 게시중 건에서만 활성.
          disabled: isBusy || !isPosted,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField
          label="제목"
          value={filters.title}
          onChange={(v) => handleFilterChange("title", v)}
        />
        <SearchField
          label="게시상태"
          type="select"
          value={filters.noticeStatus}
          options={NOTICE_STATUS_OPTIONS}
          onChange={(v) => handleFilterChange("noticeStatus", v)}
        />
        <SearchField label="게시기간" className="span-2">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
            <DatePicker
              value={filters.postStartDt}
              onChange={(v) => handleFilterChange("postStartDt", v)}
            />
            <span>~</span>
            <DatePicker
              value={filters.postEndDt}
              onChange={(v) => handleFilterChange("postEndDt", v)}
            />
          </div>
        </SearchField>
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel title="공지사항 목록" count={rows.length}>
            <AgDataGrid
              columnSizing="fit"
              columns={NOTICE_COLUMNS}
              data={gridRows}
              rowKey="NOTICE_ID"
              sortable
              highlightedRowKey={selectedId}
              onRowClick={(row) => handleRowClick(row as Record<string, unknown>)}
              loading={isBusy}
              loadingMessage="조회 중..."
              emptyMessage="조회된 공지사항이 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel width={460}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>공지번호</th>
                <td style={DETAIL_VALUE_CELL}>
                  {/* D-001 — 서버 채번값. 신규 시 공란 */}
                  <Input value={form?.NOTICE_ID ?? ""} disabled readOnly />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>제목 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={form?.TITLE ?? ""}
                    maxLength={200}
                    disabled={!form || isBusy}
                    onChange={(v) => handleFormChange("TITLE", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>게시상태 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Select
                    value={form?.NOTICE_STATUS ?? ""}
                    options={NOTICE_STATUS_FORM_OPTIONS}
                    disabled={!form || isBusy}
                    onChange={(v) => handleFormChange("NOTICE_STATUS", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>게시시작일</th>
                <td style={DETAIL_VALUE_CELL}>
                  <DatePicker
                    value={form?.POST_START_DT ?? ""}
                    disabled={!form || isBusy}
                    onChange={(v) => handleFormChange("POST_START_DT", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>게시종료일</th>
                <td style={DETAIL_VALUE_CELL}>
                  <DatePicker
                    value={form?.POST_END_DT ?? ""}
                    disabled={!form || isBusy}
                    onChange={(v) => handleFormChange("POST_END_DT", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>내용</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Textarea
                    value={form?.CONTENT ?? ""}
                    rows={8}
                    maxLength={4000}
                    disabled={!form || isBusy}
                    onChange={(v) => handleFormChange("CONTENT", v)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          {!form && (
            <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
              목록에서 행을 선택하거나 [신규] 를 눌러 작성하세요.
            </p>
          )}
        </ContentPanel>
      </ContentBody>

      {errorMessage && (
        <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />
      )}
    </PageLayout>
  );
}
