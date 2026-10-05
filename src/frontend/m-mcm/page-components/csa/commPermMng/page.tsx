"use client";

/**
 * commPermMng 화면 — PERMISSION 관리 (As-Is CommPermMng.xfdl / W6).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트) / §4 (이벤트) / §6 (SQL) / §8 (BPMN)
 *   - 기능설계서 §3 (조회+그리드) / §4 (Detail 필드) / §5 (버튼) / §6 (validation) / §10 (메시지)
 *   - 디자인설계서 §2 (좌우분할 레이아웃) / §3.3 (Detail FormGrid 11 → 10 행)
 *   - BPMN설계서 §1.1 (2 API — To-Be 정책 #1) / §2 (action 흐름)
 *
 * 페이지 유형: C 단일 그리드 + 단일 상세 폼 (G+D 좌우 분할).
 * 호출: POST /api/mcm/oasis/commPermMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 *
 * To-Be 정책 #1 (cross-cutting, 2026-05-31):
 *   - BIZ_SYSTEM_CODE 폐기 → S-001 / D-007 / D-008 / G-008 / LV-003 / lov action 모두 제거
 *   - As-Is 3 action (search / save / lov) → To-Be 2 (searchCmPerm / saveCmPerm)
 *
 * 패턴: W1 commObjMng (단일 그리드 + GridPanel 표준 메뉴) + Detail 우측 폼.
 *
 * 2026-06-01 UI 정합 갱신 (As-Is 스크린샷 + 9 화면 횡단 일관성):
 *   - 상단 버튼바에 "닫기" 버튼 추가 — As-Is EX-001 btn_close (xfdl:227 / fn_close xfdl:444).
 *   - 검색 사용여부를 Combo (전체/Y/N) 로 — As-Is S-004 cbo_USE_TP (xfdl:152).
 *   - Detail 의 raw input/textarea/radio 를 shared (Input / Textarea / Radio / DatePicker) 로 교체.
 *   - 유효 개시/기한일 = DatePicker — As-Is D-012/D-014 Calendar (xfdl:113/93).
 *   - Detail Find Button (B-002 / B-003) 추가 — 공통/CUSTOM 권한 팝업 (As-Is btn_common_find / btn_custom_find).
 *   - Grid USE_TP render Y/N → "사용/미사용" 라벨 (As-Is hardcoded codecolumn=condCd 표시).
 *   - Grid START/END_ACTIVE_DATE render 정규화 (yyyy-MM-dd) — As-Is displaytype="date".
 *   - maxLength 정합 — PERMISSION_DESC 300 (As-Is xfdl maxlength=100 + DDL 300 → 300 채택) /
 *     PERMISSION_COMMON / CUSTOM 500 / POPUP_BTN 1000 / PERMISSION_ACTION 500 (DDL §9.3.1).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ResizableFormPanel,
  ErrorModal,
  DETAIL_TABLE_STYLE,
  DETAIL_LABEL_CELL,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import {
  Button,
  Input,
  Textarea,
  Radio,
  DatePicker,
} from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { searchCommPermMng, saveCommPermMng } from "./api";
import type { CommPermMngFilters, CommPermMngRow, RowStatus } from "./types";

interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

function getRowKey(row: GridRow): string {
  return (
    (row.__gridTempId as string) ||
    (row.__rowId as string) ||
    String((row as { PERMISSION_ID?: unknown }).PERMISSION_ID ?? "")
  );
}

/** 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 신규 row PERMISSION_ID="" 충돌 회피. */
function withSyntheticId<T extends Partial<CommPermMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${String(r.PERMISSION_ID ?? "")}` };
}

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const {
    __gridTempId: _t,
    __rowId: _r,
    nativeeditor_status: _s,
    ...rest
  } = row as Record<string, unknown>;
  return rest;
}

const DEFAULT_FILTERS: CommPermMngFilters = {
  edt_PERMISSION_ID: "",
  edt_PERMISSION_NM: "",
  cbo_USE_TP: "",
};

/** S-004 / D-010 / G-009 — Y/N (LV-001 정적 — 분석 §10 / §3.7 DS-002). */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

/** S-004 검색 — As-Is xfdl:152 cbo_USE_TP innerdataset=ds_cmbValidYn (gfn_setFirstRow 빈 행 prepend → 전체). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "Y", label: "Y" },
  { value: "N", label: "N" },
];

const USE_TP_LABEL: Record<string, string> = Object.fromEntries(
  USE_TP_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * AsIs `_com_popup::commonPermBtnPopup.xfdl` (xfdl:475/481) 의 To-Be 대체 모달용 권한 후보.
 *
 * AsIs 팝업 본체는 ERP 본가지의 외부 별도 .xfdl 로 To-Be 미이관 — OASIS LoV BPMN service 미구축
 * 시점이므로 docs/guide/FrontEnd/Local-Rules.md §"OASIS LoV BPMN service 미구축 시점" 절차 (v2 §12-X) 에 따라
 * 화면 내장 정적 후보 (As-Is 그리드 컬럼 PERMISSION_COMMON 등에서 관찰되는 표준 action 키워드)
 * 를 임시 옵션으로 제공.
 *
 * Q-NNN 등재: 운영 마스터 (SEC_PERM_BTN 또는 등가) 신설 시 본 옵션을 OASIS LoV 호출로 교체할 것.
 */
const PERM_BTN_OPTIONS: string[] = [
  "search",
  "save",
  "delete",
  "import",
  "export",
  "reset",
  "new",
  "copy",
  "print",
  "close",
  "rowAdd",
  "rowDelete",
  "rowCopy",
  "rowCancel",
  // mpn 화면 RBAC 적용(2026-06)으로 추가된 커스텀 액션
  "execute",
  "validate",
  "analyze",
  "view",
  "activate",
  "deactivate",
  "compare",
  "restore",
  "apply",
  "release",
  "calculate",
];

/** As-Is `yyyyMMdd` (8자) → `yyyy-MM-dd` 변환 (G-010/G-011 displaytype=date). null/빈/이미 dash 면 그대로. */
function formatDateCell(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (s.includes("T")) return s.slice(0, 10);
  if (s.length >= 10 && s.charAt(4) === "-" && s.charAt(7) === "-") return s.slice(0, 10);
  if (s.length === 8 && /^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

/** DatePicker `<input type=date>` 의 value 는 항상 `yyyy-MM-dd`. */
function toIsoDate(raw: unknown): string {
  return formatDateCell(raw);
}

/** DatePicker onChange (yyyy-MM-dd) → As-Is dataset 8자 보존 (BE saveCmPerm 가 8자 / ISO 모두 변환 지원). */
function fromIsoDate(iso: string): string {
  if (!iso) return "";
  if (iso.length === 10 && iso.charAt(4) === "-") {
    return iso.replace(/-/g, "");
  }
  return iso;
}

/**
 * Master 그리드 컬럼 — 분석 §3.3 G-001~G-012 / To-Be 정책 #1 (G-008 폐기 → 11 컬럼 — STATUS 는 행 상태 자동 표시).
 *
 * 2026-06-02 W5 정책 D — 그리드 인라인 편집 비활성화 (editable: false).
 *   사유: AsIs xfdl ds_main_onrowposchanged (xfdl:451) + BindItem (xfdl:496~506) 패턴 — 그리드 셀과
 *   Detail 폼이 양방향 bind 되며, 사용자 수정은 우측 Detail 폼에서 이루어진다 (그리드 셀 직접 편집은 의도 ✗).
 *   W5 commUserMng 사용자 검수 결과 반영 — csa W5 정합 정책.
 */
const MASTER_COLUMNS: GridColumn[] = [
  { key: "PERMISSION_ID", header: "PERMISSION ID *", width: 180, editable: false, align: "left" },
  { key: "PERMISSION_NM", header: "PERMISSION명", width: 160, editable: false, align: "left" },
  { key: "PERMISSION_COMMON", header: "공통 버튼 권한", width: 220, editable: false, align: "left" },
  { key: "PERMISSION_CUSTOM", header: "CUSTOM 버튼 권한", width: 220, editable: false, align: "left" },
  { key: "POPUP_BTN", header: "POPUP 버튼", width: 140, editable: false, align: "left" },
  { key: "PERMISSION_ACTION", header: "ACTION 권한", width: 160, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용 여부 *",
    width: 90,
    editable: false,
    align: "center",
    // AsIs G-009 displaytype 정합 — code (Y/N) 저장, label (Yes/No) 표시.
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 110,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 110,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
  { key: "PERMISSION_DESC", header: "권한 설명", width: 200, editable: false, align: "left" },
];

/** 행추가 default (As-Is xfdl:378~389 + To-Be END_ACTIVE_DATE 정정 9999-12-31). */
function emptyRow(): CommPermMngRow {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    PERMISSION_ID: "",
    PERMISSION_NM: "",
    PERMISSION_DESC: "",
    PERMISSION_COMMON: "",
    PERMISSION_CUSTOM: "",
    POPUP_BTN: "",
    PERMISSION_ACTION: "",
    USE_TP: "Y", // ST-001
    START_ACTIVE_DATE: today, // ST-002
    END_ACTIVE_DATE: "99991231", // ST-003 — BE 가 9999-12-31 23:59:59 정정
    ROLE_ID: null,
  };
}

export default function CommPermMngPage() {
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<CommPermMngFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<(CommPermMngRow & GridRow)[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /**
   * commonPermBtnPopup 모달 상태 (AsIs xfdl:475/481 gfn_openPopup 등가).
   *  - `findKind` = "common" → PERMISSION_COMMON 채움 (fn_PermBtnCallBack rtnValeChk==="common")
   *  - `findKind` = "custom" → PERMISSION_CUSTOM 채움 (fn_PermBtnCallBack rtnValeChk==="custom")
   *  - `findDraft` = textarea 편집 중인 문자열 (콤마 구분 — AsIs Mapper 컬럼 저장 형식 그대로)
   */
  const [findKind, setFindKind] = useState<"common" | "custom" | null>(null);
  const [findDraft, setFindDraft] = useState<string>("");

  const selected = useMemo<(CommPermMngRow & GridRow) | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(
    () => rows.some((r) => r.nativeeditor_status),
    [rows],
  );

  const visibleCount = rows.filter((r) => r.nativeeditor_status !== "deleted").length;

  /** action=searchCmPerm (fn_search → fn_run("searchCmPerm"), xfdl:368~370). */
  const loadList = useCallback(
    async (f: CommPermMngFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await searchCommPermMng(f);
        const list = (payload.ds_main ?? []).map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        }));
        setRows(list);
        if (list.length > 0) {
          setSelectedKey(getRowKey(list[0]));
        } else {
          setSelectedKey(null);
        }
        // As-Is "{N}건 조회 되었습니다." (xfdl:334)
        showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [showMessage],
  );

  useEffect(() => {
    void loadList(DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (k: keyof CommPermMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadList(filters);

  /** 초기화 (fn_reset / xfdl:373~376). */
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  /**
   * 행취소 — 선택된 단일 row 만 취소 (cma·W1 패턴).
   * inserted → row 제거 / updated/deleted → status reset.
   */
  const handleRowCancel = useCallback(() => {
    if (!selectedKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    setRows((prev) => {
      const target = prev.find((r) => getRowKey(r) === selectedKey);
      if (!target?.nativeeditor_status) {
        setError("변경된 행이 아닙니다.");
        return prev;
      }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getRowKey(r) !== selectedKey);
      }
      return prev.map((r) =>
        getRowKey(r) === selectedKey
          ? { ...r, nativeeditor_status: "" as RowStatus }
          : r,
      );
    });
    setSelectedKey(null);
  }, [selectedKey]);

  /**
   * 행추가 / 행복사 / 행삭제 통합 핸들러 (GridPanel onDataChange 시그니처).
   * addedRowKey 있음 → 신규/복사 (emptyRow() default — fn_rowAdd xfdl:378~389).
   * 없음 → 행삭제 → newData 비교 → 사라진 행은 deleted 마킹.
   * 단 ROLE_ID 가 있는 row 는 차단 (As-Is fn_rowDelete xfdl:402~418).
   */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<CommPermMngRow> | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          // 행복사 시 sourceRow 가 PERMISSION_ID 들고 있을 수 있으나 PK 충돌 방지 위해 항상 빈 값
          // (cma·W1 패턴 — 필수 PK 는 사용자 입력 강제).
          const newRow: CommPermMngRow & GridRow = {
            ...emptyRow(),
            ...base,
            PERMISSION_ID: "",
            ROLE_ID: null, // 신규 행은 ROLE 매핑 없음
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        // 행삭제 — ROLE_ID 존재 시 차단 (As-Is xfdl:407)
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          for (const r of removed) {
            if (
              r.nativeeditor_status !== "inserted" &&
              r.ROLE_ID &&
              String(r.ROLE_ID).length > 0
            ) {
              setError("연결된 역할이 존재합니다. 제외 후 삭제 하세요.");
              return prev;
            }
          }
          const kept = newData as (CommPermMngRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [],
  );

  /** 셀 변경 — rowStatus 갱신만. */
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          const updated: CommPermMngRow & GridRow = {
            ...r,
            [fieldName]: p.newValue,
          };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        }),
      );
    },
    [],
  );

  /** 저장 (fn_save / xfdl:423~442). 검증 → API 호출. */
  const handleSave = useCallback(async () => {
    // V-001: 변경 데이터 검증 (xfdl:425)
    if (!hasAnyChanges) {
      setError("변경된 데이터가 없습니다.");
      return;
    }
    // V-002: 필수 2 컬럼 (xfdl:431 gfn_dsRequired("PERMISSION_ID USE_TP"))
    for (const r of rows) {
      if (!r.nativeeditor_status) continue;
      if (r.nativeeditor_status === "deleted") continue;
      if (!r.PERMISSION_ID || String(r.PERMISSION_ID).trim().length === 0) {
        setError("PERMISSION ID 는 필수 입력입니다.");
        return;
      }
      if (!r.USE_TP || String(r.USE_TP).trim().length === 0) {
        setError("사용 여부(USE_TP) 는 필수 입력입니다.");
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = rows
        .filter((r) => r.nativeeditor_status)
        .map((r) => ({
          ...stripInternal(r),
          rowStatus: r.nativeeditor_status,
        })) as unknown as CommPermMngRow[];
      const res = await saveCommPermMng(payload);
      // As-Is "성공적으로 저장되었습니다." (xfdl:350) + 후속 재조회 (xfdl:347)
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      const refreshed = (res.ds_main ?? []).map((r, i) => ({
        ...withSyntheticId(r, i),
        nativeeditor_status: "" as RowStatus,
      }));
      setRows(refreshed);
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [rows, hasAnyChanges, showMessage]);

  /** Detail 필드 변경 — handleCellChange 위임. */
  const updateDetailField = (field: keyof CommPermMngRow, value: string) => {
    if (!selected) return;
    handleCellChange({ rowKey: getRowKey(selected), field: String(field), newValue: value });
  };

  /**
   * B-002 / B-003 — 공통 / CUSTOM 권한 팝업 (As-Is btn_common_find / btn_custom_find).
   * AsIs `gfn_openPopup("modal", "commonPermBtnPopup", ...)` + `fn_PermBtnCallBack` (xfdl:484~493)
   * 동등 모달. AsIs 외부 _com_popup::commonPermBtnPopup.xfdl 본체는 To-Be 미이관 — 화면 내장
   * 정적 옵션 + textarea 편집 모달로 대체 (docs/guide/FrontEnd/Local-Rules.md §"OASIS LoV BPMN service 미구축" 절차).
   */
  const handleFindCommon = useCallback(() => {
    if (!selected) return;
    setFindKind("common");
    setFindDraft(String(selected.PERMISSION_COMMON ?? ""));
  }, [selected]);

  const handleFindCustom = useCallback(() => {
    if (!selected) return;
    setFindKind("custom");
    setFindDraft(String(selected.PERMISSION_CUSTOM ?? ""));
  }, [selected]);

  /** 모달 권한 옵션 토글 — draft 의 콤마 분리 token 집합에 add/remove. */
  const toggleFindOption = useCallback((opt: string) => {
    setFindDraft((prev) => {
      const tokens = prev
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const idx = tokens.indexOf(opt);
      if (idx >= 0) {
        tokens.splice(idx, 1);
      } else {
        tokens.push(opt);
      }
      return tokens.join(",");
    });
  }, []);

  /** AsIs fn_PermBtnCallBack 등가 — rtnValeChk 분기 후 textarea 값 set_value (xfdl:484~493). */
  const handleFindConfirm = useCallback(() => {
    if (!findKind) return;
    if (!selected) {
      setFindKind(null);
      setFindDraft("");
      return;
    }
    const field: keyof CommPermMngRow =
      findKind === "common" ? "PERMISSION_COMMON" : "PERMISSION_CUSTOM";
    // updateDetailField (selected 의존) 직접 인라인 — useCallback deps 정합 + 외부 함수 stale 회피
    handleCellChange({ rowKey: getRowKey(selected), field: String(field), newValue: findDraft });
    setFindKind(null);
    setFindDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findKind, findDraft, selected, handleCellChange]);

  const handleFindCancel = useCallback(() => {
    setFindKind(null);
    setFindDraft("");
  }, []);

  /** 모달용 현재 선택된 token 집합 (체크박스 렌더용). */
  const findSelectedTokens = useMemo(() => {
    return new Set(
      findDraft
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }, [findDraft]);

  return (
    <PageLayout
      title="PERMISSION 관리"
      breadcrumb="공통관리 > 시스템관리 > PERMISSION 관리"
      objId="commPermMng"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching || isSaving,
          action: "search",
        },
        {
          id: "btn_reset",
          label: "초기화",
          onClick: handleReset,
          disabled: isSearching || isSaving,
          action: "cancel",
        },
        {
          // AsIs xfdl:227 commonTop btn_save — fn_save. 변경여부 검증은 handleSave 내부 V-001.
          // 2026-06-02 W5 정책 E — row-state (!hasAnyChanges) 사전 비활성 제거.
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: isSearching || isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="PERMISSION ID"
          name="PERMISSION_ID"
          meta="AUT_ID"
          value={filters.edt_PERMISSION_ID}
          onChange={(v) => handleFilterChange("edt_PERMISSION_ID", v)}
        />
        <SearchField
          label="PERMISSION 명"
          name="PERMISSION_NM"
          meta="AUT_NM"
          value={filters.edt_PERMISSION_NM}
          onChange={(v) => handleFilterChange("edt_PERMISSION_NM", v)}
        />
        <SearchField
          label="사용 여부"
          name="USE_TP"
          meta="USE_TP"
          type="select"
          options={USE_TP_SEARCH_OPTIONS}
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
        />
      </SearchArea>

      {/* 2026-06-02 W5 정책 A (round3 — 사용자 명시):
          Detail 폭 420 → 700 으로 확장 (메인 그리드와 균형). 그리드는 flex:1 유지.
          2026-09-09: ResizableFormPanel 로 교체 — 기본 700, 드래그로 420~900 조절. */}
      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="PERMISSION 목록"
            count={visibleCount}
            showAddButton
            showCopyButton
            showDeleteButton
            buttons={[
              {
                // AsIs btn_rowCancel (xfdl:239 commonRight 4 버튼 중 하나) — fn_rowCancel.
                // 2026-06-02 W5 정책 E — row-state 사전 비활성 제거 (!hasAnyChanges 차단 ✗).
                // 핸들러가 변경여부를 확인하고 ErrorModal 로 차단 (AsIs onclick 정합).
                id: "btn_rowCancel",
                label: "행취소",
                onClick: handleRowCancel,
                disabled: isSearching || isSaving,
              },
            ]}
            data={rows}
            rowKey="__rowId"
            columns={MASTER_COLUMNS}
            selectedRowKey={selectedKey}
            onDataChange={handleDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={MASTER_COLUMNS}
              data={rows}
              rowKey="__rowId"
              sortable
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedKey}
              onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 PERMISSION 이 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        {/* 2026-06-02 W5 정책 B — Detail wrapper:
            marginTop:32 (좌측 GridPanel header 자리 비움) + 1px #d4dae0 border + 흰 bg
            + 28px gray header ("상세 정보") — 좌측 컬럼 헤더 라인과 정렬.
            height: auto (내용물 크기 맞춤 — 흰 빈 공간 ✗). */}
        <ResizableFormPanel
          panelId="commPermMng-detail"
          defaultWidth={700}
          minWidth={420}
          maxWidth={900}
        >
          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #d4dae0",
              background: "#fff",
              height: "calc(100% - 32px)",
              minHeight: 0,
            }}
          >
            <div
              style={{
                height: 28,
                background: "#f4f6f8",
                borderBottom: "1px solid #d4dae0",
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                fontWeight: 600,
                fontSize: 13,
                color: "#333",
                flexShrink: 0,
              }}
            >
              상세 정보
            </div>
            <div style={{ padding: 0, background: "#fff", flex: 1, minHeight: 0, overflowY: "hidden" }}>
              {selected ? (
                <DetailForm
                  selected={selected}
                  updateDetailField={updateDetailField}
                  onFindCommon={handleFindCommon}
                  onFindCustom={handleFindCustom}
                />
              ) : (
                <div style={{ padding: 16, color: "#888" }}>
                  행을 선택하거나 행을 추가하세요.
                </div>
              )}
            </div>
          </div>
        </ResizableFormPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />

      {/* AsIs commonPermBtnPopup 등가 모달 — fn_PermBtnCallBack 동등 (xfdl:475/481/484).
          findKind 가 null 이 아닐 때만 mount → AsIs gfn_openPopup("modal", ...) 정합 */}
      <Modal
        open={findKind !== null}
        title={findKind === "common" ? "공통 버튼 권한 선택" : "CUSTOM 버튼 권한 선택"}
        onClose={handleFindCancel}
        size="md"
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="default" onClick={handleFindCancel}>
              취소
            </Button>
            <Button variant="primary" onClick={handleFindConfirm}>
              확인
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#555" }}>
            권한 후보를 선택하거나, 아래 textarea 에서 직접 콤마 (,) 구분으로 편집할 수 있습니다.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              padding: 8,
              border: "1px solid #d4dae0",
              background: "#fafbfc",
            }}
          >
            {PERM_BTN_OPTIONS.map((opt) => {
              const checked = findSelectedTokens.has(opt);
              return (
                <label
                  key={opt}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFindOption(opt)}
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
          <Textarea
            value={findDraft}
            rows={3}
            onChange={(v: string) => setFindDraft(v)}
          />
        </div>
      </Modal>
    </PageLayout>
  );
}

/**
 * 상세 정보 폼 — 디자인설계서 §3.3.1 FormGrid (As-Is 11 → To-Be 10 행, D-007/D-008 폐기).
 *
 * 2026-06-01 정합:
 *   - shared 컴포넌트 (Input/Textarea/Radio/DatePicker) 사용 — docs/guide/FrontEnd/FrontEnd_표준_통합_개발가이드_v2.md.
 *   - START/END_ACTIVE_DATE = DatePicker — As-Is xfdl:113/93 Calendar.
 *   - 사용 여부 = Radio (Y/N + Yes/No 라벨, vertical) — As-Is xfdl:95~112.
 *   - 공통/CUSTOM 권한 = Textarea + Find Button — As-Is xfdl:115~116 TextArea + B-002/B-003.
 *   - POPUP 버튼 / ACTION 권한 = Textarea (Find Button 없음) — As-Is xfdl:117/123.
 *   - PERMISSION_ID = readonly (기존 행) / 입력 가능 (신규 행) — As-Is ds_main_onrowposchanged.
 *
 * maxLength 정책: As-Is xfdl maxlength + DDL VARCHAR 길이 비교 후 큰 값 채택.
 *   - PERMISSION_ID 100 (DDL §9.3.1 #1)
 *   - PERMISSION_NM 100 (xfdl + DDL 일치)
 *   - PERMISSION_DESC 300 (DDL §9.3.1 #3 — xfdl 100 는 입력 제한 보수)
 *   - PERMISSION_COMMON / CUSTOM 500 (DDL §9.3.1 #4/#5)
 *   - POPUP_BTN 1000 (DDL §9.3.1 #6)
 *   - PERMISSION_ACTION 500 (DDL §9.3.1 #7)
 */
function DetailForm({
  selected,
  updateDetailField,
  onFindCommon,
  onFindCustom,
}: {
  selected: CommPermMngRow & GridRow;
  updateDetailField: (field: keyof CommPermMngRow, value: string) => void;
  onFindCommon: () => void;
  onFindCustom: () => void;
}) {
  const isNewRow = selected.nativeeditor_status === "inserted";

  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        {/* D-001 / D-002 — PERMISSION ID */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PERMISSION_ID" label="PERMISSION ID" required /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.PERMISSION_ID ?? "")}
              maxLength={100}
              readOnly={!isNewRow}
              onChange={(v: string) => updateDetailField("PERMISSION_ID", v)}
            />
          </td>
        </tr>

        {/* D-003 / D-004 — PERMISSION명 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PERMISSION_NM" label="PERMISSION명" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.PERMISSION_NM ?? "")}
              maxLength={100}
              onChange={(v: string) => updateDetailField("PERMISSION_NM", v)}
            />
          </td>
        </tr>

        {/* D-005 / D-006 — PERMISSION 설명 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PERMISSION_DESC" label="PERMISSION 설명" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.PERMISSION_DESC ?? "")}
              maxLength={300}
              onChange={(v: string) => updateDetailField("PERMISSION_DESC", v)}
            />
          </td>
        </tr>

        {/* D-009 / D-010 — 사용 여부 Radio */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USE_TP" label="사용 여부" required /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Radio
              name="USE_TP"
              value={String(selected.USE_TP ?? "Y")}
              options={USE_TP_OPTIONS}
              onChange={(v: string) => updateDetailField("USE_TP", v)}
            />
          </td>
        </tr>

        {/* D-011 / D-012 — 유효 개시일 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="START_ACTIVE_DATE" label="유효 개시일" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker
              value={toIsoDate(selected.START_ACTIVE_DATE)}
              onChange={(iso: string) => updateDetailField("START_ACTIVE_DATE", fromIsoDate(iso))}
            />
          </td>
        </tr>

        {/* D-013 / D-014 — 유효 기한일 */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="END_ACTIVE_DATE" label="유효 기한일" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker
              value={toIsoDate(selected.END_ACTIVE_DATE)}
              onChange={(iso: string) => updateDetailField("END_ACTIVE_DATE", fromIsoDate(iso))}
            />
          </td>
        </tr>

        {/* D-015 / D-016 / D-017 — 공통 버튼 권한 Textarea + Find Button.
            2026-06-02 W5 정책 C (round3 — 사용자 명시 스크린샷 정합):
              - 좌-우 분할 → 상-하 column 분할 (Textarea 위 / 찾기 버튼 아래)
              - rows: 3 → 5 (ACTION 권한과 동일 크기)
              - 버튼은 alignSelf:flex-start + width:80 (textarea 하단 좌측). */}
        <tr>
          <th style={DETAIL_LABEL_CELL}>
            <MdmFieldLabel name="PERMISSION_COMMON" label="공통 버튼 권한" />
            <br />
            <span style={{ fontWeight: 400, fontSize: 11, color: "#666" }}>
              (commonTop, commonTopCustom, commonRight)
            </span>
          </th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Textarea
                value={String(selected.PERMISSION_COMMON ?? "")}
                maxLength={500}
                rows={3}
                onChange={(v: string) => updateDetailField("PERMISSION_COMMON", v)}
              />
              <Button
                style={{ alignSelf: "flex-start", width: 80 }}
                onClick={onFindCommon}
                variant="default"
              >
                찾기
              </Button>
            </div>
          </td>
        </tr>

        {/* D-018 / D-019 / D-020 — CUSTOM 버튼 권한 Textarea + Find Button (round3 동일 정합). */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PERMISSION_CUSTOM" label="CUSTOM 버튼 권한" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Textarea
                value={String(selected.PERMISSION_CUSTOM ?? "")}
                maxLength={500}
                rows={3}
                onChange={(v: string) => updateDetailField("PERMISSION_CUSTOM", v)}
              />
              <Button
                style={{ alignSelf: "flex-start", width: 80 }}
                onClick={onFindCustom}
                variant="default"
              >
                찾기
              </Button>
            </div>
          </td>
        </tr>

        {/* D-021 / D-022 — POPUP 버튼 Textarea (round3 — ACTION 과 동일 rows=5 균형) */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="POPUP_BTN" label="POPUP 버튼" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea
              value={String(selected.POPUP_BTN ?? "")}
              maxLength={1000}
              rows={3}
              onChange={(v: string) => updateDetailField("POPUP_BTN", v)}
            />
          </td>
        </tr>

        {/* D-023 / D-024 — ACTION 권한 Textarea.
            2026-06-03 W5 정책 C (round4 — 사용자 명시 스크린샷 정합):
              - rows: 5 → 7 (Detail 하단 빈 공간을 ACTION 권한 textarea 가 채우도록 확장).
              - wrapper overflow:hidden 유지 (스크롤바 발생 ✗ — wrapper height: calc(100% - 32px) 안에서 흡수). */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PERMISSION_ACTION" label="ACTION 권한" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Textarea
              value={String(selected.PERMISSION_ACTION ?? "")}
              maxLength={500}
              rows={7}
              onChange={(v: string) => updateDetailField("PERMISSION_ACTION", v)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
