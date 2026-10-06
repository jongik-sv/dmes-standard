"use client";

/**
 * noticeMgmt — 공지사항 관리. 화면 유형 B(조회 + 상세): 왼쪽 목록 / 오른쪽 상세(폼 · 본문 편집), 기본 50:50.
 * 본문 편집기는 상세에서 입력표를 뺀 남은 높이를 채우고, 홈 표시 미리보기는 [미리보기] 팝업으로 본다.
 *
 * 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md · 골격: mantine-aggrid-ui screen-patterns.md §B
 * 좌우 경계는 끌어서 크기를 바꾸고 사용자별로 기억한다(ContentBody resizable, SPLIT_STORAGE_KEY).
 * SIDEBAR / HEADER / TabsBar 는 포털 PortalShell 이 그린다. 이 화면은 PageLayout 안쪽만 맡는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { AgDataGrid, GridLimitNotice, GridPanel } from "@dk-oasis/shared/grid";
import {
  Checkbox,
  DatePicker,
  Input,
  MultiSelectComboBox,
  Radio,
  SegmentedControl,
  Select,
} from "@dk-oasis/shared/form";
import { toFieldErrors } from "@dk-oasis/shared/http";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import {
  MdmFieldLabel,
  MdmMetaProvider,
  useMdmValidation,
} from "@dk-oasis/shared/mdm-meta";

import {
  changeNoticeStatus,
  deleteNotice,
  fetchNotice,
  saveNotices,
  searchNotices,
  searchRoles,
  toUserMessage,
} from "./api";
import { NOTICE_COLUMNS } from "./notice-columns";
import { NoticeBodyEditor } from "./NoticeBodyEditor";
import { NoticeHomePreview } from "./NoticeHomePreview";
import { NoticeTitleRow } from "./NoticeTitleRow";
import {
  NOTICE_MDM_FIELDS,
  emptyNoticeForm,
  findSavedId,
  formToSaveRow,
  formatPeriod,
  roleNameMap,
  rowToForm,
  sameForm,
  targetLabel,
  toCategory,
  toContentFormat,
  toFormFieldErrors,
  toLocalDateTime,
  validateNotice,
  type NoticeFieldErrors,
} from "./notice-logic";
import { NOTICE_MGMT_CSS, NOTICE_MGMT_STYLE_HREF } from "./notice-styles";
import {
  CONTENT_FORMAT_SHORT,
  FIRST_SEARCH_LIMIT,
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
  emptyFilters,
  type ContentFormat,
  type NoticeForm,
  type NoticeMgmtFilters,
  type NoticeRow,
  type RoleOption,
  type TargetScope,
} from "./types";

/**
 * 화면 진입점. MDM 표준 캡션(`captionPriority="mdm"`)은 제목에만 적용한다: 목록 TITLE 열(`MdmMetaProvider` 로 그리드를 감싼다)과 상세 제목 줄(`NoticeTitleRow` 를 감싼다).
 * 그러면 MDM 컬럼 사전에 있는 TITLE 은 MDM 이 있을 때 표준 캡션, 없거나 받지 못하면 적어 둔 "제목" 이 보인다. 기존 화면을 표준 캡션으로 바꿀 때 header 를 지우지 않는 이유다
 * (프런트 Local-Rules 의 "MDM 캡션·툴팁·값 검증" 절). 나머지 상세 라벨·검색 칸은 우선순위를 바꾸지 않아(explicit) 사전에 등록돼도 화면 글자가 그대로다.
 */
export default function NoticeMgmtScreen() {
  const { showMessage } = useMessage();
  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·조회 결과(bulky)·건수·전체 보기 여부.
  // 선택 공지(selectedRow)·상세 폼(form·baseline)은 이어받지 않는다 — 편집 중인 폼은 새 창에서 다시 공지를 골라 읽는다.
  const [filters, setFilters] = useCarryState<NoticeMgmtFilters>("filters", emptyFilters);
  const [rows, setRows] = useCarryState<NoticeRow[]>("rows", [], { bulky: true });
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [rowsTotal, setRowsTotal] = useCarryState<number | null>("rowsTotal", null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지 — 저장·삭제·게시중지 뒤 재조회가 이 모드를 따른다(ref 는 읽기용 사본, 이어받기는 showAllCarry). */
  const [showAllCarry, setShowAllCarry] = useCarryState("showAll", false);
  const showAllRef = useRef(showAllCarry);
  /** 늦게 도착한 이전 상세 응답을 버리기 위한 요청 순번. */
  const detailSeq = useRef(0);
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
  /**
   * 저장 때 서버·저장 전 MDM 검사가 상세 폼 칸에 준 오류. 그 칸을 고치거나 다른 공지를 열거나 새로 쓰면 지운다.
   * 입력 중 즉시 검사(화면 문구)는 NoticeTitleRow 가 따로 보인다.
   */
  const [fieldErrors, setFieldErrors] = useState<NoticeFieldErrors>({});
  const { validateRow } = useMdmValidation();

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
    setFieldErrors({});
  }, []);

  /**
   * 목록은 본문 없이 받으므로 공지를 고르면 상세 조회로 본문을 받아 상세 폼을 채운다. 응답이 올 때까지 이전 상세를 그대로 둔다.
   * 반환값은 조회 결과다: 폼에 실었으면 "ok", 더 새 요청에 밀렸으면 "stale", 오류면 "failed".
   */
  const loadDetail = useCallback(
    async (id: string): Promise<"ok" | "stale" | "failed"> => {
      const seq = ++detailSeq.current;
      try {
        const row = await fetchNotice(id);
        if (seq !== detailSeq.current) return "stale";
        bindDetail(row);
        return "ok";
      } catch (e) {
        if (seq !== detailSeq.current) return "stale";
        showMessage({
          title: "오류",
          message: toUserMessage(
            e,
            "공지사항 상세를 조회하지 못했습니다. 잠시 뒤 다시 시도하세요.",
          ),
          alertType: "error",
        });
        return "failed";
      }
    },
    [bindDetail, showMessage],
  );

  /**
   * B-001 조회. `keep` 이 있으면 그 공지를 상세 조회로 다시 연다(저장·게시중지 뒤 — 조회조건에 걸리지 않아도 연다).
   * `all` 이 true 면 첫 조회 상한 없이 받고([전체 보기]), 생략하면 마지막 조회 모드를 따른다.
   */
  const runSearch = useCallback(
    async (f: NoticeMgmtFilters, keep?: { id: string }, all?: boolean) => {
      const seq = ++searchSeq.current;
      const showAll = all ?? showAllRef.current;
      setListLoading(true);
      try {
        const payload = await searchNotices(
          f,
          showAll ? undefined : FIRST_SEARCH_LIMIT,
        );
        if (seq !== searchSeq.current) return;
        showAllRef.current = showAll;
        setShowAllCarry(showAll);
        const list = payload.list ?? [];
        setRows(list);
        setRowsTotal(payload.truncated ? (payload.totalCount ?? null) : null);
        if (keep?.id) {
          // 저장·게시중지 뒤 상세를 못 받으면 낡은 폼(저장 전 값·신규 ID 없음)을 두지 않고 비운다 — 목록은 이미 새 값이다.
          if ((await loadDetail(keep.id)) === "failed") bindDetail(null);
        } else {
          detailSeq.current += 1;
          bindDetail(null);
        }
      } catch (e) {
        if (seq !== searchSeq.current) return;
        setRows([]);
        setRowsTotal(null);
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
    [bindDetail, loadDetail, showMessage, setRows, setRowsTotal, setShowAllCarry],
  );

  // 진입 시 1회 자동 조회 + 역할 선택 목록. 역할 목록 실패는 치명적이지 않다(ID 로 보인다).
  // 분리 창이 이어받은 목록이 있으면 자동 조회를 건너뛴다(행 없이 복원됐거나 비었으면 이어받은 조건으로 한 번 조회한다).
  // 처음 진입(복원값 없음)에서는 filters 가 빈 조건·showAllCarry 가 false 라 이전과 같다.
  const restored = useCarryRestored();
  useEffect(() => {
    if (!restored || rows.length === 0) void runSearch(filters, undefined, showAllCarry);
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
    confirmDiscard(
      "조회하시겠습니까?",
      () => void runSearch(filters, undefined, false),
    );
  }, [confirmDiscard, runSearch, filters]);

  /** [전체 보기] — 첫 조회 상한 없이 현재 조건으로 다시 받는다. */
  const handleShowAll = useCallback(() => {
    confirmDiscard(
      "전체 목록을 다시 조회하시겠습니까?",
      () => void runSearch(filters, undefined, true),
    );
  }, [confirmDiscard, runSearch, filters]);

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const id = String(row.NOTICE_ID ?? "");
      if (isBusy || !id || id === selectedId) return;
      const target = rows.find((r) => r.NOTICE_ID === id);
      if (!target) return;
      confirmDiscard("다른 공지를 여시겠습니까?", () => {
        setIsBusy(true);
        void loadDetail(id).finally(() => setIsBusy(false));
      });
    },
    [rows, selectedId, isBusy, confirmDiscard, loadDetail],
  );

  /** B-002 신규 — 빈 상세 폼. 서버 호출 없음. */
  const handleNew = useCallback(() => {
    confirmDiscard("새로 작성하시겠습니까?", () => {
      const next = emptyNoticeForm();
      setSelectedRow(null);
      setForm(next);
      setBaseline(next);
      setFieldErrors({});
      setNewSeq((n) => n + 1);
    });
  }, [confirmDiscard]);

  const setField = useCallback(
    <K extends keyof NoticeForm>(key: K, value: NoticeForm[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
      // 서버·저장 전 검사 오류는 그 칸을 고치면 낡은 판정이다.
      setFieldErrors((prev) => {
        if (prev[key] === undefined) return prev;
        const { [key]: _gone, ...rest } = prev;
        return rest;
      });
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
    // MDM 컬럼 사전 검사(화면) — 서버 MdmValidator 와 같은 판정·문구. 걸리면 서버를 부르지 않고 그 칸에 보인다.
    const mdmIssues = validateRow({ TITLE: form.TITLE.trim() }, [
      ...NOTICE_MDM_FIELDS,
    ]);
    const mdmFirst = Object.entries(mdmIssues)[0];
    if (mdmFirst) {
      setFieldErrors(
        Object.fromEntries(
          Object.entries(mdmIssues).map(([k, v]) => [k, v.message]),
        ),
      );
      showMessage({ message: mdmFirst[1].message, alertType: "warning" });
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
      await runSearch(filters, savedId ? { id: savedId } : undefined);
    } catch (e) {
      // 서버 저장 검증 오류(errors 상세)를 입력 칸에 붙인다. 저장은 한 행이라 "master" 그리드의 오류가 이 폼 것이다.
      setFieldErrors(toFormFieldErrors(toFieldErrors(e, "master")));
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
  }, [form, rows, filters, runSearch, showMessage, validateRow]);

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
          name="title"
          value={filters.title}
          onChange={(v) => setFilter("title", v)}
        />
        <SearchField
          label="게시상태"
          name="noticeStatus"
          type="select"
          options={NOTICE_STATUS_OPTIONS}
          value={filters.noticeStatus}
          onChange={(v) => setFilter("noticeStatus", v)}
        />
        <SearchField
          label="분류"
          name="noticeCategory"
          type="select"
          options={NOTICE_CATEGORY_OPTIONS}
          value={filters.noticeCategory}
          onChange={(v) => setFilter("noticeCategory", v)}
        />
        <SearchField
          label="형식"
          name="contentFormat"
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
          <GridPanel
            title="공지사항 목록"
            count={rows.length}
            titleExtra={
              <GridLimitNotice
                shownCount={rows.length}
                totalCount={rowsTotal}
                onShowAll={handleShowAll}
                disabled={listLoading || isBusy}
                testId="notice-list-limit"
              />
            }
          >
            <MdmMetaProvider captionPriority="mdm">
              <AgDataGrid
                rowKey="NOTICE_ID"
                columns={NOTICE_COLUMNS}
                // 목록은 읽기 전용이라 지금은 켜 둔 것만으로 검사할 칸이 없다 — 편집 열을 더하면 MDM 연결 칸이 바로 검사된다.
                mdmValidate
                data={gridRows}
                columnSizing="fit"
                sortable
                highlightedRowKey={selectedId}
                onRowClick={(row) =>
                  handleRowClick(row as Record<string, unknown>)
                }
                loading={listLoading}
              />
            </MdmMetaProvider>
          </GridPanel>
        </ContentPanel>

        <ContentPanel minSize={420}>
          <div className="nm-detail" aria-busy={isBusy || undefined}>
            <table style={DETAIL_TABLE_STYLE}>
              <tbody>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="NOTICE_ID" label="공지번호" />
                  </th>
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
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="C_USR_ID" label="등록" meta={false} />
                  </th>
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
                <MdmMetaProvider captionPriority="mdm">
                  <NoticeTitleRow
                    key={editorKey}
                    value={form?.TITLE ?? ""}
                    disabled={formDisabled}
                    error={fieldErrors.TITLE}
                    onChange={(v) => setField("TITLE", v)}
                  />
                </MdmMetaProvider>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="NOTICE_CATEGORY" label="분류" />
                  </th>
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
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="PIN_YN" label="상단 고정" />
                  </th>
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
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel
                      name="NOTICE_STATUS"
                      label="게시상태"
                      required
                    />
                  </th>
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
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="POST_START_DT" label="게시시작일" />
                  </th>
                  <td style={DETAIL_VALUE_CELL}>
                    <DatePicker
                      value={form?.POST_START_DT ?? ""}
                      disabled={formDisabled}
                      onChange={(v) => setField("POST_START_DT", v)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="POST_END_DT" label="게시종료일" />
                  </th>
                  <td style={DETAIL_VALUE_CELL}>
                    <DatePicker
                      value={form?.POST_END_DT ?? ""}
                      disabled={formDisabled}
                      onChange={(v) => setField("POST_END_DT", v)}
                    />
                  </td>
                </tr>
                <tr>
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="TARGET_SCOPE" label="게시 대상" />
                  </th>
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
                    <MdmFieldLabel
                      name="TARGET_ROLES"
                      label="대상 역할"
                      meta={false}
                      required={isRoleScope}
                    />
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
                  <th style={DETAIL_LABEL_CELL}>
                    <MdmFieldLabel name="CONTENT_FORMAT" label="본문 형식" />
                  </th>
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
