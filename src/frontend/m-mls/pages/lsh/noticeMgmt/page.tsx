"use client";

/**
 * noticeMgmt — 공지사항 관리. 화면 유형 B(조회 + 상세): 왼쪽 목록 / 오른쪽 상세(폼 · 본문 편집), 기본 50:50.
 * 본문 편집기는 상세에서 입력표를 뺀 남은 높이를 채우고, 홈 표시 미리보기는 [미리보기] 팝업으로 본다.
 *
 * 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md · 골격: mantine-aggrid-ui screen-patterns.md §B
 * 좌우 경계는 끌어서 크기를 바꾸고 사용자별로 기억한다(ContentBody resizable, SPLIT_STORAGE_KEY).
 * SIDEBAR / HEADER / TabsBar 는 포털 PortalShell 이 그린다. 이 화면은 PageLayout 안쪽만 맡는다.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridBadge,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import {
  Checkbox,
  DatePicker,
  Input,
  MultiSelectComboBox,
  Radio,
  SegmentedControl,
  Select,
} from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import {
  changeNoticeStatus,
  deleteNotice,
  saveNotices,
  searchNotices,
  searchRoles,
  toUserMessage,
} from "./api";
import { NoticeBodyEditor } from "./NoticeBodyEditor";
import { NoticeHomePreview } from "./NoticeHomePreview";
import {
  emptyNoticeForm,
  findSavedId,
  formToSaveRow,
  formatPeriod,
  formatPeriodShort,
  roleNameMap,
  rowToForm,
  sameForm,
  targetLabel,
  toCategory,
  toContentFormat,
  toLocalDateTime,
  validateNotice,
} from "./notice-logic";
import { NOTICE_MGMT_CSS, NOTICE_MGMT_STYLE_HREF } from "./notice-styles";
import {
  CONTENT_FORMAT_SHORT,
  CONTENT_FORMAT_OPTIONS,
  CONTENT_FORMAT_SEGMENTS,
  NOTICE_CATEGORY_FORM_OPTIONS,
  NOTICE_CATEGORY_LABEL,
  NOTICE_CATEGORY_OPTIONS,
  NOTICE_STATUS,
  NOTICE_STATUS_FORM_OPTIONS,
  NOTICE_STATUS_LABEL,
  NOTICE_STATUS_OPTIONS,
  SCREEN_ID,
  SPLIT_STORAGE_KEY,
  TARGET_SCOPE_RADIO,
  TITLE_MAX,
  emptyFilters,
  type ContentFormat,
  type NoticeForm,
  type NoticeMgmtFilters,
  type NoticeRow,
  type RoleOption,
  type TargetScope,
} from "./types";

const CATEGORY_BADGE: Record<
  string,
  { bg?: string; color?: string; muted?: boolean }
> = {
  URGENT: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  MAINT: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  NORMAL: { muted: true },
};

const STATUS_BADGE: Record<
  string,
  { bg?: string; color?: string; muted?: boolean }
> = {
  [NOTICE_STATUS.POSTED]: {
    bg: "var(--color-success-soft)",
    color: "var(--color-success)",
  },
  [NOTICE_STATUS.STOPPED]: {
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
  [NOTICE_STATUS.DRAFT]: { muted: true },
};

/**
 * §3.2 목록 열. 표시용 파생 칸(*_LABEL 등)은 gridRows 에서 만든다 — 툴팁은 그 값(전체 글자)을 보인다.
 * columnSizing="fit" 에서 width 는 픽셀이 아니라 비율 가중치다(ag-data-grid.md). 그래서 짧은 열은 가중치 1 에
 * 내용 폭만큼 minWidth 를 주어 거의 그 폭에 머물게 하고, 제목만 큰 가중치로 남는 폭을 모두 가져가게 한다.
 * 칸 안쪽 여백은 좌우 8px(grid.css .ag-cell)이다. 열 합이 목록 폭보다 크면 그리드가 가로로 스크롤한다.
 * 최소 폭 합 552px — 포털 1300px·상세 460 기본 배치의 목록 폭(약 570px)에 맞춘다. 등록일은 상세·홈 미리보기에서 본다.
 */
const NARROW = 1;
const COLUMNS: GridColumn[] = [
  {
    key: "CATEGORY_LABEL",
    header: "분류",
    width: NARROW,
    minWidth: 60,
    align: "center",
    render: (v, row) => (
      <GridBadge
        label={String(v ?? "")}
        {...CATEGORY_BADGE[String(row.NOTICE_CATEGORY_CODE)]}
      />
    ),
  },
  {
    key: "FORMAT_LABEL",
    header: "형식",
    width: NARROW,
    minWidth: 52,
    align: "center",
  },
  { key: "TITLE", header: "제목", width: 100, minWidth: 180, align: "left" },
  {
    key: "STATUS_LABEL",
    header: "게시상태",
    width: NARROW,
    minWidth: 74,
    align: "center",
    render: (v, row) => (
      <GridBadge
        label={String(v ?? "")}
        {...STATUS_BADGE[String(row.NOTICE_STATUS)]}
      />
    ),
  },
  {
    key: "POST_PERIOD",
    header: "게시기간",
    width: NARROW,
    minWidth: 100,
    align: "center",
    // 칸에는 "MM-dd~MM-dd", 툴팁(값)에는 연도까지 보인다.
    render: (_v, row) =>
      formatPeriodShort(
        row.POST_START_DT as string | null,
        row.POST_END_DT as string | null,
      ),
  },
  {
    key: "PIN_LABEL",
    header: "고정",
    width: NARROW,
    minWidth: 42,
    align: "center",
    render: (v) => (v ? "●" : ""),
  },
  {
    key: "TARGET_LABEL",
    header: "대상",
    width: NARROW,
    minWidth: 66,
    align: "left",
    render: (_v, row) => String(row.TARGET_SHORT ?? ""),
  },
];

export default function NoticeMgmtPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<NoticeMgmtFilters>(emptyFilters);
  const [rows, setRows] = useState<NoticeRow[]>([]);
  /** 목록 조회 전용 로딩 — 저장·상태 변경 중에는 목록 오버레이를 띄우지 않는다(Local-Rules §11). */
  const [listLoading, setListLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  /** 선택한 공지(저장된 값). 저장 뒤 조회조건에 걸리지 않아도 상세를 이어 보이도록 목록과 따로 둔다. */
  const [selectedRow, setSelectedRow] = useState<NoticeRow | null>(null);
  const [form, setForm] = useState<NoticeForm | null>(null);
  /** 변경 여부 비교 기준(불러온 값 또는 빈 신규 폼). */
  const [baseline, setBaseline] = useState<NoticeForm | null>(null);
  /** 신규 작성 회차 — 마크다운 편집기 key 를 새로 만든다. */
  const [newSeq, setNewSeq] = useState(0);
  /** 홈 화면 표시 미리보기 팝업. */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesFailed, setRolesFailed] = useState(false);
  /** 늦게 도착한 이전 조회 응답을 버리기 위한 요청 순번(Local-Rules §11). */
  const searchSeq = useRef(0);

  const selectedId = selectedRow?.NOTICE_ID ?? "";
  const isDirty = !!form && !!baseline && !sameForm(form, baseline);
  const isPosted = selectedRow?.NOTICE_STATUS === NOTICE_STATUS.POSTED;
  const formDisabled = !form || isBusy;

  const names = useMemo(() => roleNameMap(roles), [roles]);

  const gridRows = useMemo(
    () =>
      rows.map((r) => {
        const target = targetLabel(r.TARGET_SCOPE, r.TARGET_ROLES, names, 1);
        const category = toCategory(r.NOTICE_CATEGORY);
        return {
          ...r,
          NOTICE_CATEGORY_CODE: category,
          CATEGORY_LABEL: NOTICE_CATEGORY_LABEL[category],
          FORMAT_LABEL: CONTENT_FORMAT_SHORT[toContentFormat(r.CONTENT_FORMAT)],
          STATUS_LABEL: NOTICE_STATUS_LABEL[r.NOTICE_STATUS] ?? r.NOTICE_STATUS,
          POST_PERIOD: formatPeriod(r.POST_START_DT, r.POST_END_DT),
          PIN_LABEL: String(r.PIN_YN ?? "").toUpperCase() === "Y" ? "고정" : "",
          TARGET_LABEL: target.full,
          TARGET_SHORT: target.short,
        };
      }),
    [rows, names],
  );

  const roleOptions = useMemo(
    () =>
      roles.map((r) => ({
        value: r.ROLE_ID,
        label:
          r.ROLE_NM && r.ROLE_NM !== r.ROLE_ID
            ? `${r.ROLE_NM} (${r.ROLE_ID})`
            : r.ROLE_ID,
      })),
    [roles],
  );

  /** 상세를 한 공지(또는 비움)로 맞춘다. */
  const bindDetail = useCallback((row: NoticeRow | null) => {
    setSelectedRow(row);
    const next = row ? rowToForm(row) : null;
    setForm(next);
    setBaseline(next);
  }, []);

  /**
   * B-001 조회. `keep` 이 있으면 그 공지를 다시 고른다(저장·게시중지 뒤). 응답이 올 때까지 이전 상세를 그대로 둔다.
   * `keep.fallback` 은 조회조건에 걸리지 않을 때 대신 보일 행(저장 응답의 전체 목록에서 찾은 값)이다.
   */
  const runSearch = useCallback(
    async (
      f: NoticeMgmtFilters,
      keep?: { id: string; fallback?: NoticeRow },
    ) => {
      const seq = ++searchSeq.current;
      setListLoading(true);
      try {
        const list = (await searchNotices(f)).list ?? [];
        if (seq !== searchSeq.current) return;
        setRows(list);
        const found = keep?.id
          ? (list.find((r) => r.NOTICE_ID === keep.id) ?? keep.fallback ?? null)
          : null;
        bindDetail(found);
      } catch (e) {
        if (seq !== searchSeq.current) return;
        setRows([]);
        bindDetail(null);
        showMessage({
          title: "오류",
          message: toUserMessage(
            e,
            "공지사항 목록을 조회하지 못했습니다. 잠시 뒤 다시 시도하세요.",
          ),
          alertType: "error",
        });
      } finally {
        if (seq === searchSeq.current) setListLoading(false);
      }
    },
    [bindDetail, showMessage],
  );

  // 진입 시 1회 자동 조회 + 역할 선택 목록. 역할 목록 실패는 치명적이지 않다(ID 로 보인다).
  useEffect(() => {
    void runSearch(emptyFilters());
    let alive = true;
    searchRoles()
      .then((list) => alive && setRoles(list))
      .catch(() => alive && setRolesFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 저장하지 않은 변경이 있으면 확인을 거친 뒤 진행한다. */
  const confirmDiscard = useCallback(
    (question: string, proceed: () => void) => {
      if (!isDirty) {
        proceed();
        return;
      }
      showMessage({
        title: "확인",
        message: `저장하지 않은 변경이 있습니다. ${question}`,
        alertType: "confirm",
        onConfirm: proceed,
      });
    },
    [isDirty, showMessage],
  );

  const handleSearch = useCallback(() => {
    confirmDiscard("조회하시겠습니까?", () => void runSearch(filters));
  }, [confirmDiscard, runSearch, filters]);

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const id = String(row.NOTICE_ID ?? "");
      if (!id || id === selectedId) return;
      const target = rows.find((r) => r.NOTICE_ID === id);
      if (!target) return;
      confirmDiscard("다른 공지를 여시겠습니까?", () => bindDetail(target));
    },
    [rows, selectedId, confirmDiscard, bindDetail],
  );

  /** B-002 신규 — 빈 상세 폼. 서버 호출 없음. */
  const handleNew = useCallback(() => {
    confirmDiscard("새로 작성하시겠습니까?", () => {
      const next = emptyNoticeForm();
      setSelectedRow(null);
      setForm(next);
      setBaseline(next);
      setNewSeq((n) => n + 1);
    });
  }, [confirmDiscard]);

  const setField = useCallback(
    <K extends keyof NoticeForm>(key: K, value: NoticeForm[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  /** B-003 저장 — 신규면 C, 아니면 U. 저장 뒤 현재 조회조건으로 다시 조회하고 저장한 공지를 다시 고른다. */
  const handleSave = useCallback(async () => {
    if (!form) return;
    const issue = validateNotice(form);
    if (issue) {
      showMessage({ message: issue.message, alertType: "warning" });
      return;
    }
    const isNew = !form.NOTICE_ID;
    const knownIds = new Set(rows.map((r) => r.NOTICE_ID));
    setIsBusy(true);
    try {
      const payload = await saveNotices([
        formToSaveRow(form, isNew ? "inserted" : "updated"),
      ]);
      const all = payload.list ?? [];
      const savedId = findSavedId(all, form, knownIds, payload.savedIds);
      showMessage({
        message: "저장되었습니다.",
        alertType: "success",
        toast: true,
      });
      await runSearch(
        filters,
        savedId
          ? { id: savedId, fallback: all.find((r) => r.NOTICE_ID === savedId) }
          : undefined,
      );
    } catch (e) {
      showMessage({
        title: "오류",
        message: toUserMessage(
          e,
          "저장하지 못했습니다. 잠시 뒤 다시 시도하세요.",
        ),
        alertType: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [form, rows, filters, runSearch, showMessage]);

  /** B-004 삭제 — 확인 후 서버에서 바로 지우고 다시 조회한다. 게시중 건은 버튼이 비활성이다(§7.4). */
  const handleDelete = useCallback(() => {
    if (!selectedRow) return;
    const id = selectedRow.NOTICE_ID;
    showMessage({
      title: "확인",
      message: "선택한 행을 삭제하시겠습니까?",
      alertType: "confirm",
      onConfirm: async () => {
        setIsBusy(true);
        try {
          await deleteNotice(id);
          showMessage({
            message: "삭제되었습니다.",
            alertType: "success",
            toast: true,
          });
          await runSearch(filters);
        } catch (e) {
          showMessage({
            title: "오류",
            message: toUserMessage(
              e,
              "삭제하지 못했습니다. 잠시 뒤 다시 시도하세요.",
            ),
            alertType: "error",
          });
        } finally {
          setIsBusy(false);
        }
      },
    });
  }, [selectedRow, filters, runSearch, showMessage]);

  /** B-005 게시중지 — 게시중 건만. 확인 후 상태를 바꾸고 같은 공지를 다시 고른다. */
  const handleStop = useCallback(() => {
    if (!selectedRow || selectedRow.NOTICE_STATUS !== NOTICE_STATUS.POSTED)
      return;
    if (isDirty) {
      showMessage({
        message:
          "저장하지 않은 변경이 있습니다. 저장하거나 다시 조회한 뒤 게시중지하세요.",
        alertType: "warning",
      });
      return;
    }
    const id = selectedRow.NOTICE_ID;
    showMessage({
      title: "확인",
      message:
        "선택한 공지를 게시중지하시겠습니까? 홈 화면 공지 목록에서 바로 내려갑니다.",
      alertType: "confirm",
      onConfirm: async () => {
        setIsBusy(true);
        try {
          await changeNoticeStatus(id, NOTICE_STATUS.STOPPED);
          showMessage({
            message: "게시중지되었습니다.",
            alertType: "success",
            toast: true,
          });
          await runSearch(filters, { id });
        } catch (e) {
          showMessage({
            title: "오류",
            message: toUserMessage(
              e,
              "게시중지하지 못했습니다. 잠시 뒤 다시 시도하세요.",
            ),
            alertType: "error",
          });
        } finally {
          setIsBusy(false);
        }
      },
    });
  }, [selectedRow, isDirty, filters, runSearch, showMessage]);

  const setFilter = (key: keyof NoticeMgmtFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const isRoleScope = form?.TARGET_SCOPE === "ROLE";
  const targetText = form
    ? targetLabel(form.TARGET_SCOPE, form.TARGET_ROLES, names).full
    : "";
  const editorKey = form?.NOTICE_ID || `new-${newSeq}`;

  return (
    <PageLayout
      title="공지사항 관리"
      breadcrumb="공지관리 > 공지사항 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary",
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
          type: "save",
          disabled: isBusy || !form,
          action: "save",
        },
        // §7.4 — 게시중 건은 삭제할 수 없다.
        {
          id: "btn_delete",
          label: "삭제",
          onClick: handleDelete,
          disabled: isBusy || !selectedRow || isPosted,
          action: "delete",
        },
        // 업무 고유 버튼 — 게시중 건에서만 활성(§7.4). action 은 권한 세트의 changeStatus(소문자 비교).
        {
          id: "btn_stop",
          label: "게시중지",
          onClick: handleStop,
          disabled: isBusy || !isPosted,
          action: "changestatus",
        },
      ]}
    >
      <style href={NOTICE_MGMT_STYLE_HREF} precedence="default">
        {NOTICE_MGMT_CSS}
      </style>

      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="제목"
          value={filters.title}
          onChange={(v) => setFilter("title", v)}
        />
        <SearchField
          label="게시상태"
          type="select"
          options={NOTICE_STATUS_OPTIONS}
          value={filters.noticeStatus}
          onChange={(v) => setFilter("noticeStatus", v)}
        />
        <SearchField
          label="분류"
          type="select"
          options={NOTICE_CATEGORY_OPTIONS}
          value={filters.noticeCategory}
          onChange={(v) => setFilter("noticeCategory", v)}
        />
        <SearchField
          label="형식"
          type="select"
          options={CONTENT_FORMAT_OPTIONS}
          value={filters.contentFormat}
          onChange={(v) => setFilter("contentFormat", v)}
        />
        <SearchField label="게시기간">
          <DatePicker
            value={filters.postStartDt}
            onChange={(v) => setFilter("postStartDt", v)}
          />
        </SearchField>
        <SearchField label="~">
          <DatePicker
            value={filters.postEndDt}
            onChange={(v) => setFilter("postEndDt", v)}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey={SPLIT_STORAGE_KEY}>
        <ContentPanel minSize={320}>
          <GridPanel title="공지사항 목록" count={rows.length}>
            <AgDataGrid
              rowKey="NOTICE_ID"
              columns={COLUMNS}
              data={gridRows}
              columnSizing="fit"
              sortable
              highlightedRowKey={selectedId}
              onRowClick={(row) =>
                handleRowClick(row as Record<string, unknown>)
              }
              loading={listLoading}
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel minSize={420}>
          <div className="nm-detail" aria-busy={isBusy || undefined}>
            <table style={DETAIL_TABLE_STYLE}>
              <tbody>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>공지번호</th>
                  <td style={DETAIL_VALUE_CELL}>
                    {/* D-001 — 서버 채번값. 신규 시 공란 */}
                    <Input
                      value={form?.NOTICE_ID ?? ""}
                      readOnly
                      disabled
                      aria-label="공지번호"
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>등록</th>
                  <td style={DETAIL_VALUE_CELL}>
                    {/* audit C_USR_ID · C_AT(현지 시각) — 표시 전용 */}
                    <Input
                      value={
                        form?.NOTICE_ID
                          ? [form.C_USR_ID, toLocalDateTime(form.C_AT)]
                              .filter(Boolean)
                              .join(" · ")
                          : ""
                      }
                      readOnly
                      disabled
                      aria-label="등록자·등록일시"
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>제목 *</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Input
                      value={form?.TITLE ?? ""}
                      maxLength={TITLE_MAX}
                      placeholder="홈 화면 목록에 보이는 제목"
                      disabled={formDisabled}
                      aria-label="제목"
                      onChange={(v) => setField("TITLE", v)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>분류</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Select
                      options={NOTICE_CATEGORY_FORM_OPTIONS}
                      value={form?.NOTICE_CATEGORY ?? ""}
                      disabled={formDisabled}
                      onChange={(v) =>
                        setField("NOTICE_CATEGORY", toCategory(v))
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>상단 고정</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Checkbox
                      label="홈 목록 맨 위에 둔다"
                      checked={form?.PIN_YN === "Y"}
                      disabled={formDisabled}
                      onChange={(checked) =>
                        setField("PIN_YN", checked ? "Y" : "N")
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>게시상태 *</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Select
                      options={NOTICE_STATUS_FORM_OPTIONS}
                      value={form?.NOTICE_STATUS ?? ""}
                      disabled={formDisabled}
                      onChange={(v) => setField("NOTICE_STATUS", v)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>게시시작일</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <DatePicker
                      value={form?.POST_START_DT ?? ""}
                      disabled={formDisabled}
                      onChange={(v) => setField("POST_START_DT", v)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>게시종료일</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <DatePicker
                      value={form?.POST_END_DT ?? ""}
                      disabled={formDisabled}
                      onChange={(v) => setField("POST_END_DT", v)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>게시 대상</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <Radio
                      name="noticeTargetScope"
                      options={TARGET_SCOPE_RADIO}
                      value={form?.TARGET_SCOPE ?? "ALL"}
                      disabled={formDisabled}
                      aria-label="게시 대상"
                      onChange={(v) =>
                        setField("TARGET_SCOPE", v as TargetScope)
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>
                    대상 역할{isRoleScope ? " *" : ""}
                  </th>
                  <td style={DETAIL_VALUE_CELL}>
                    <MultiSelectComboBox
                      data={roleOptions}
                      value={isRoleScope ? (form?.TARGET_ROLES ?? []) : []}
                      placeholder={
                        !isRoleScope
                          ? "전체 사용자에게 게시합니다"
                          : rolesFailed
                            ? "역할 목록을 불러오지 못했습니다"
                            : "게시할 역할을 고르세요"
                      }
                      disabled={formDisabled || !isRoleScope}
                      aria-label="대상 역할"
                      onChange={(ids) => setField("TARGET_ROLES", ids)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>본문 형식</th>
                  <td style={DETAIL_VALUE_CELL}>
                    <SegmentedControl
                      value={form?.CONTENT_FORMAT ?? "TEXT"}
                      options={CONTENT_FORMAT_SEGMENTS}
                      ariaLabel="본문 형식"
                      disabled={formDisabled}
                      testId="notice-content-format"
                      onChange={(v) =>
                        setField("CONTENT_FORMAT", v as ContentFormat)
                      }
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <NoticeBodyEditor
              editorKey={editorKey}
              value={form?.CONTENT ?? ""}
              format={form?.CONTENT_FORMAT ?? "TEXT"}
              enabled={!!form}
              locked={isBusy}
              onPreview={() => setPreviewOpen(true)}
              onChange={(v) => setField("CONTENT", v)}
            />

          </div>
          <NoticeHomePreview
            open={previewOpen}
            form={form}
            targetText={targetText}
            onClose={() => setPreviewOpen(false)}
          />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
