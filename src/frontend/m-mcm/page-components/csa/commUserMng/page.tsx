"use client";

/**
 * commUserMng 화면 — 사용자 관리 (As-Is CommUserMng.xfdl).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트) / §4 (이벤트 34 메서드) / §5 (V-001~V-806) / §6 (SQL 20) /
 *     §8 (BPMN 11 action) / §9 (LV / 컬럼 카탈로그) / §11 (To-Be 6 정책 결정)
 *   - 기능설계서 §3 (S 3 / G 17 / GR 2 / GL 2) / §4 (D 20 + DP 6) / §5 (B 18) / §6 (V)
 *   - 디자인설계서 (10 영역)
 *   - BPMN설계서 (11 action — As-Is 1:1 보존)
 *
 * 페이지 유형: D 다중 그리드 + 상세 폼 (G + GR + GL + D + 모달 popup).
 * 호출: POST /api/mcm/oasis/commUserMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 *
 * To-Be 정책 (분석 §11.0):
 *   - #2 / Q-002 — 부서코드 LoV = TB_MCM_DEPT_INFO (commonUserDept action)
 *   - #3 (B) / Q-003 / Q-009 — 미사용 SQL 5종 폐기, SaveCommUserMng inserted/deleted 별도 분리
 *   - #3 (C) / Q-004 — TB_MCM_SEC_USER_HIS / ROLL_HIS JPA Entity 흡수
 *   - #3 (D) / Q-005 — D-013~015 GROUP_ID 콤보 UI 미반영
 *   - #3 (E) / Q-010 / Q-014 — Grid STATUS / nexacro roleSearch 자연 흡수
 *   - M-032 (2026-09-28) — 비밀번호 초기화 후 발급된 초기 비밀번호를 팝업으로 표시 + 클립보드 복사.
 *     As-Is `pwdtmp` 콜백의 하단 상태바 표기(xfdl:806)는 값이 곧바로 사라지고 복사도 되지 않아,
 *     관리자가 사용자에게 전달할 초기 비밀번호를 알 수 없었다.
 *
 * 패턴: W3 (commRoleMng) / W4 (commRoleGrpMng) 의 다중 그리드 + Detail 확장.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
  DETAIL_TABLE_STYLE,
  DETAIL_LABEL_CELL,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { Button, useBusy } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import {
  searchCmUser as apiSearchCmUser,
  saveCmUser as apiSaveCmUser,
  reRegCmUser as apiReRegCmUser,
  searchUserRoleGrp as apiSearchUserRoleGrp,
  saveUserRoleGrp as apiSaveUserRoleGrp,
  searchRoleGrp as apiSearchRoleGrp,
  pwdinit as apiPwdInit,
  saveUserRoleGrpCopy as apiSaveUserRoleGrpCopy,
} from "./api";
import { CommUserDetailForm, type CommUserDetailHandle } from "./CommUserDetailForm";
import { IN_OUT_OPTIONS, getRowKey, toDateInputValue } from "./detailUtils";
import type {
  CommUserMngFilters,
  CommUserMngGridRow,
  CommUserMngRoleGrpListRow,
  CommUserMngRoleGrpRow,
  CommUserMngRow,
  GridRow,
  RowStatus,
} from "./types";

/** spread base 이후 PK 명시 (정책 #14). */
function withSyntheticId<T extends Partial<CommUserMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `u-${idx}-${String(r.USER_ID ?? "")}` };
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

const DEFAULT_FILTERS: CommUserMngFilters = {
  edt_USER_ID: "",
  cbo_USE_TP: "Y", // S-002 default index=0 (xfdl:273)
  cbo_IN_OUT_EMP_TP: "", // S-003 default index=-1 (전체)
};

/**
 * 초기 비밀번호 안내 팝업 (2026-09-28 신설 / 기능설계서 M-032 To-Be).
 *
 * As-Is 는 `pwdtmp` 콜백이 하단 상태바에 "임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다" 를
 * 찍었다(xfdl:806). 상태바는 곧 사라지고 복사도 되지 않아 관리자가 값을 다시 볼 수 없었다.
 * To-Be 는 BE 가 돌려준 `INIT_PWD` 를 팝업으로 띄우고 클립보드 복사까지 제공한다.
 *
 * 닫을 때(확인/×/ESC/뒤깅 클릭)는 `null` 로 되돌려 비밀번호를 화면에서 지운다.
 */
interface InitPwdInfo {
  /** 초기 비밀번호를 발급받은 사용자 ID (팝업 표시용). */
  userId: string;
  /** 발급된 평문 초기 비밀번호. */
  password: string;
}

/**
 * 클립보드 복사 — `navigator.clipboard` 우선, 없으면 `execCommand` 폴백.
 *
 * `navigator.clipboard` 는 보안 컨텍스트(https / localhost)에서만 제공되므로, 사내망에 http 로
 * 띄운 개발·검증 환경에서는 undefined 다. 폴백 없으면 "복사 버튼이 아무 반응이 없다" 로 보인다.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 폴백 경로로 진행 (권한 거부 / 컨텍스트 제한)
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 사용여부 / 내부외부 코드 ↔ 한글 표시 (xfdl ds_useTp / ds_inOutEmpTp 정적 매핑 보존).
 *   - LV-001 USE_TP: Y=Yes / N=No
 *   - LV-002 IN_OUT_EMP_TP: I=내부 / O=외부
 */
const USE_TP_CODES = ["Y", "N"] as const;
const IN_OUT_CODES = ["I", "O"] as const;
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];
/** 검색 필드용 — 빈 값(전체) 옵션 포함. */
const USE_TP_SEARCH_OPTIONS = [{ value: "", label: "전체" }, ...USE_TP_OPTIONS];
const IN_OUT_SEARCH_OPTIONS = [{ value: "", label: "전체" }, ...IN_OUT_OPTIONS];

const USE_TP_LABEL_MAP: Record<string, string> = { Y: "Yes", N: "No" };
const IN_OUT_LABEL_MAP: Record<string, string> = { I: "내부", O: "외부" };

/** 메인 사용자 그리드 — 분석 §3.3 G-002~G-017 (16 컬럼 / G-001 STATUS 자연 흡수 정책 #3 (E)).
 *  2026-06-02 iter#3 — 그리드 인라인 편집 비활성화 (editable: false).
 *  사유: 본 화면은 "행 클릭 → Detail 폼에서 수정" 패턴 (AsIs xfdl ds_main_onrowposchanged → Detail BindItem).
 *  As-Is xfdl 도 grd_main 의 셀이 Detail 폼과 양방향 bind 되어 그리드 셀 직접 편집은 의도 ✗ — 사용자 검수 결과 반영. */
const USER_COLUMNS: GridColumn[] = [
  { key: "USER_ID", header: "사용자ID *", width: 120, editable: false, align: "left" },
  { key: "USER_EMP_NO", header: "사번 *", width: 100, editable: false, align: "left" },
  { key: "SSO_ID", header: "SSO ID", width: 90, editable: false, align: "left" },
  { key: "USER_NM", header: "사용자명 *", width: 100, editable: false, align: "left" },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 100,
    editable: false,
    align: "center",
    // 2026-06-02 iter#5 사용자 검수 J-016: 수정이 yyyy-MM-dd 만 하므로 표시도 yyyy-MM-dd 만 (시분초 제거).
    render: (v) => toDateInputValue(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  { key: "DEPT_CD", header: "부서코드 *", width: 100, editable: false, align: "left" },
  { key: "DEPT_NM", header: "부서명", width: 120, editable: false, align: "left" },
  { key: "USER_CATEGORY_CD", header: "분류코드", width: 90, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용여부",
    width: 80,
    editable: false,
    align: "center",
    // As-Is G-010 displaytype="combotext" 정합 — code(Y/N) 저장, label(Yes/No) 표시.
    render: (v) => USE_TP_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
  { key: "EMAIL", header: "이메일 *", width: 160, editable: false, align: "left" },
  { key: "TEL_NO", header: "전화번호", width: 110, editable: false, align: "left" },
  { key: "MOBILE_TEL_NO", header: "MOBILE", width: 110, editable: false, align: "left" },
  {
    key: "IN_OUT_EMP_TP",
    header: "내부/외부 *",
    width: 90,
    editable: false,
    align: "center",
    // As-Is G-014 displaytype="combotext" 정합 — code(I/O) 저장, label(내부/외부) 표시.
    render: (v) => IN_OUT_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
];

/** 보유 역할그룹 (GR-NNN / ds_userRolegrp). 분석 §3.4 (2 컬럼 + USER_ID 부속). */
const USER_ROLEGRP_COLUMNS: GridColumn[] = [
  { key: "ROLE_GROUP_ID", header: "역할 그룹 ID", width: 140, editable: false, align: "left" },
  { key: "ROLE_GROUP_NM", header: "역할 그룹명", width: 200, editable: false, align: "left" },
];

/** 추가 가능 역할그룹 (GL-NNN / ds_rolegrpList). 분석 §3.5 (2 컬럼). */
const AVAIL_ROLEGRP_COLUMNS: GridColumn[] = [
  { key: "ROLE_GROUP_ID", header: "역할 그룹 ID", width: 140, editable: false, align: "left" },
  { key: "ROLE_GROUP_NM", header: "역할 그룹명", width: 200, editable: false, align: "left" },
];

/**
 * 행추가 default — 분석 §4.1 B-008 / xfdl:857~869 fn_rowAdd:
 *   - USE_TP = 'Y'
 *   - START_ACTIVE_DATE = today (8자) → BE 가 LocalDateTime 변환
 *   - END_ACTIVE_DATE = "99991231" → BE 가 9999-12-31 정정
 */
function emptyUserRow(): CommUserMngRow {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    USER_ID: "",
    USER_EMP_NO: "",
    SSO_ID: "",
    USER_NM: "",
    START_ACTIVE_DATE: today,
    END_ACTIVE_DATE: "99991231",
    DEPT_CD: "",
    DEPT_NM: "",
    USER_CATEGORY_CD: "",
    USE_TP: "Y",
    EMAIL: "",
    TEL_NO: "",
    MOBILE_TEL_NO: "",
    IN_OUT_EMP_TP: "I",
    GROUP_ID1: "",
    GROUP_ID2: "",
    GROUP_ID3: "",
  };
}

export default function CommUserMngPage() {
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·선택 키는 가볍게, 조회 결과 행은 bulky.
  // 역할그룹 그리드·후보 풀·체크 선택(Set 포함)·초기화 라디오는 선택한 사용자가 정해지면 다시 조회·초기화되므로 이어받지 않는다(useState).
  const [filters, setFilters] = useCarryState<CommUserMngFilters>("filters", DEFAULT_FILTERS);
  // 용도별 busy(R5) — "list": 목록 조회, "save": 저장·역할 저장·복사·초기화·재생성 등 쓰기 작업.
  const { isBusy, run: runBusy } = useBusy();
  const isSearching = isBusy("list");
  const isSaving = isBusy("save");
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useCarryState<CommUserMngGridRow[]>("rows", [], { bulky: true });
  const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);
  const restored = useCarryRestored();

  // 우상 그리드 — 선택 사용자 보유 역할그룹
  const [userRoleGrpRows, setUserRoleGrpRows] = useState<
    (CommUserMngRoleGrpRow & { __urgId: string; nativeeditor_status?: RowStatus })[]
  >([]);
  const [selectedUrgKey, setSelectedUrgKey] = useState<string | null>(null);

  // 우하 그리드 — 추가 가능 역할그룹 후보 풀
  const [availRoleGrpRows, setAvailRoleGrpRows] = useState<
    (CommUserMngRoleGrpListRow & { __argId: string })[]
  >([]);
  const [selectedArgKeys, setSelectedArgKeys] = useState<Set<string>>(new Set());

  // 2026-06-04 — 사용자 결정: 정보처리의뢰서 (D-019 INF_REQ_NO / D-020 DESCRIPTION) 전부 제거.
  //   FE state / Input / payload / V-NNN 검증 모두 폐기. BE 도 row 인입 시 null 처리.
  // 상세 폼의 입력 state(R12) — 역할 복사 대상 ID(D-017)·비밀번호/SSO 초기화 라디오(D-016/D-018)·부서 LoV 열림(D-007)은
  // CommUserDetailForm 안에 있다. 루트는 ref 핸들로 반영 전 초안만 읽는다.
  const formRef = useRef<CommUserDetailHandle>(null);
  // 조회 조건 최신값 — 상세 폼 핸들러가 조건 입력마다 새로 만들어지지 않게 ref 로 읽는다.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // 2026-09-28 — 비밀번호 초기화 성공 후 발급된 초기 비밀번호 (팝업 표시 + 복사).
  //   null 이면 팝업 닫힘. SSO 일괄 초기화는 BE 가 평문을 주지 않으므로 항상 null 로 둔다.
  const [initPwd, setInitPwd] = useState<InitPwdInfo | null>(null);
  const [isPwdCopied, setIsPwdCopied] = useState<boolean>(false);

  const selected = useMemo<CommUserMngGridRow | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(
    () => rows.some((r) => r.nativeeditor_status),
    [rows],
  );

  /**
   * 삭제 표시된 행을 뺀 실제 표시 대상.
   *
   * <p>2026-09-04 fix — 종전에는 건수(count)만 deleted 를 제외하고 그리드 data 는 원본 rows 를
   * 그대로 넘겨, 삭제 버튼을 눌러도 건수만 줄고 행은 그대로 남았다 ("삭제가 안 먹는다").
   * 우측 역할 그리드는 이미 같은 필터를 쓰고 있어 같은 파일 안에서 동작이 갈렸다.
   */
  const visibleRows = useMemo(
    () => rows.filter((r) => r.nativeeditor_status !== "deleted"),
    [rows],
  );
  const visibleCount = visibleRows.length;

  // ── search ──
  const loadList = useCallback(
    (f: CommUserMngFilters) =>
      runBusy("list", async () => {
        setError(null);
        try {
          const payload = await apiSearchCmUser(f);
          const list = (payload.ds_main ?? []).map((r, i) => ({
            ...withSyntheticId(r, i),
            nativeeditor_status: "" as RowStatus,
          }));
          setRows(list);
          if (list.length > 0) {
            setSelectedKey(getRowKey(list[0]));
          } else {
            setSelectedKey(null);
            setUserRoleGrpRows([]);
            setAvailRoleGrpRows([]);
          }
          showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : "조회 실패");
          setRows([]);
          setUserRoleGrpRows([]);
          setAvailRoleGrpRows([]);
        }
      }),
    [showMessage, setRows, setSelectedKey, runBusy],
  );

  const handleFilterChange = (k: keyof CommUserMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadList(filters);

  const handleReset = () => setFilters(DEFAULT_FILTERS);

  // ── row select — 자동 보유 역할 / 후보 역할 chain 갱신 (As-Is ds_main_onrowposchanged) ──
  const loadRoleGrids = useCallback(async (userId: string) => {
    try {
      const [ug, ag] = await Promise.all([
        apiSearchUserRoleGrp(userId),
        apiSearchRoleGrp(userId),
      ]);
      setUserRoleGrpRows(
        (ug.ds_userRolegrp ?? []).map((r, i) => ({
          ...r,
          __urgId: `urg-${i}-${String(r.ROLE_GROUP_ID ?? "")}`,
          nativeeditor_status: "" as RowStatus,
        })),
      );
      setAvailRoleGrpRows(
        (ag.ds_rolegrpList ?? []).map((r, i) => ({
          ...r,
          __argId: `arg-${i}-${String(r.ROLE_GROUP_ID ?? "")}`,
        })),
      );
      setSelectedArgKeys(new Set());
      setSelectedUrgKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "역할 조회 실패");
    }
  }, []);

  // 2026-06-02 iter#5 사용자 검수 J-017 — csa 8 화면 진입 시 자동조회 (AsIs xfdl:439 gfn_formOnLoad(obj, true) 정합).
  // DEFAULT_FILTERS (사용 여부="Y") 기준 1 회만 호출. selected 변경 의존 ✗.
  useEffect(() => {
    // 복원됐는데 행이 없으면 이어받은 조건으로 조회한다. 복원 아닌 첫 조회는 SearchArea autoSearch 가 한다(설계 2026-10-07-search-defaults §6.4).
    // 이어받은 선택 키를 먼저 비운다 — 조회 뒤 같은 키가 다시 잡혀도 하위 그리드 effect(selectedKey 변경)가 돌게 한다.
    if (restored && rows.length === 0) {
      setSelectedKey(null);
      void loadList(filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // As-Is xfdl:1398~1402 (edt_user_id_onchanged) 의 Radio + role 복사 USER_ID 리셋은 상세 폼이 행 key 로 다시 만들어 처리한다.
    // effect 안 상태 갱신(조회·초기화)은 의도된 동작이다.
    if (!selectedKey || !selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserRoleGrpRows([]);
      setAvailRoleGrpRows([]);
      return;
    }
    // 신규 행은 USER_ID 가 비어 있으므로 sub grid 조회 skip
    if (selected.nativeeditor_status === "inserted") {
      setUserRoleGrpRows([]);
      setAvailRoleGrpRows([]);
      return;
    }
    const userId = String(selected.USER_ID ?? "");
    if (userId) {
      void loadRoleGrids(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // ── 행추가 / 행삭제 ──
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<CommUserMngRow> | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          const newRow: CommUserMngRow & GridRow = {
            ...emptyUserRow(),
            ...base,
            USER_ID: "", // PK 사용자 입력 (정책 #14)
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          const kept = newData as (CommUserMngRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [setRows, setSelectedKey],
  );

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          // PK 변경은 신규 행만 (Detail D-001 readonly 룰 정합)
          if (fieldName === "USER_ID" && r.nativeeditor_status !== "inserted") {
            return r;
          }
          const updated: CommUserMngRow & GridRow = {
            ...r,
            [fieldName]: p.newValue,
          };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        }),
      );
    },
    [setRows],
  );

  // ── 상세 폼 초안 반영 (R12) ──
  // 폼은 입력 초안을 자기 안에 두고, blur·저장 직전·행 전환 때만 여기로 반영한다. 글자마다 rows 를 새로 만들지 않는다.
  /** 초안에서 바뀐 칸만 행에 얹는다(다른 칸의 최신 값을 덮지 않게). 바뀐 칸이 없으면 같은 행을 돌려준다. */
  const applyDraft = useCallback((r: CommUserMngGridRow, draft: CommUserMngGridRow, base: CommUserMngGridRow) => {
    const patch: Record<string, unknown> = {};
    for (const f of Object.keys(draft)) {
      if (f === "nativeeditor_status" || f === "__rowId" || f === "__gridTempId") continue;
      if (Object.is(draft[f], base[f])) continue;
      // PK 변경은 신규 행만 (Detail D-001 readonly 룰 정합)
      if (f === "USER_ID" && r.nativeeditor_status !== "inserted") continue;
      patch[f] = draft[f];
    }
    if (Object.keys(patch).length === 0) return r;
    return {
      ...r,
      ...patch,
      nativeeditor_status: r.nativeeditor_status === "inserted" ? "inserted" : "updated",
    } as CommUserMngGridRow;
  }, []);

  const handleDetailCommit = useCallback(
    (draft: CommUserMngGridRow, base: CommUserMngGridRow) => {
      const key = getRowKey(draft);
      setRows((prev) => {
        let changed = false;
        const next = prev.map((r) => {
          if (getRowKey(r) !== key) return r;
          const merged = applyDraft(r, draft, base);
          if (merged !== r) changed = true;
          return merged;
        });
        return changed ? next : prev;
      });
    },
    [setRows, applyDraft],
  );

  /**
   * 저장·단건 처리 직전에 상세 폼의 반영 전 초안을 행에 확정하고, 그 초안(없으면 null)을 돌려준다.
   * commit() 이 건 setRows 는 다음 렌더에야 보이므로, 이번 호출의 읽기는 {@link withPending} 으로 초안을 덧입혀 쓴다.
   */
  const flushPending = useCallback((): CommUserMngGridRow | null => {
    const h = formRef.current;
    if (!h || !h.isDirty()) return null;
    const draft = h.getDraft();
    h.commit();
    return draft;
  }, []);

  const withPending = useCallback(
    (r: CommUserMngGridRow, pending: CommUserMngGridRow | null): CommUserMngGridRow =>
      pending && getRowKey(pending) === getRowKey(r) ? applyDraft(r, pending, r) : r,
    [applyDraft],
  );

  // 공통 필수 검증 — fn_modify / fn_register / fn_delete 의 gfn_dsRequired (V-002 / V-102 / V-202)
  const validateRequired = (
    row: CommUserMngRow,
    fields: ReadonlyArray<keyof CommUserMngRow>,
  ): string | null => {
    for (const f of fields) {
      const v = row[f];
      if (v === undefined || v === null || String(v).trim().length === 0) {
        return `${String(f)} 는 필수 입력 항목 입니다.`;
      }
    }
    return null;
  };

  // ── 통합 저장 (2026-06-04 사용자 결정) ──
  // 기존 3 버튼 (계정생성=regCmUser / 수정=saveCmUser / 계정삭제=deleteCmUser) → 단일 "저장" 버튼.
  //   - rows 중 nativeeditor_status 가 "inserted" / "updated" / "deleted" 인 모든 row 를
  //     한 번의 saveCmUser action 호출로 일괄 처리. BE 가 status 별 분기 (계정생성 / 수정 / 논리삭제).
  //   - 정보처리의뢰서 (INF_REQ_NO / DESCRIPTION) 정책 제거 — payload 에서 omit.
  //   - 계정삭제 정합: deleted row 의 END_ACTIVE_DATE 가 99991231 / 9999-12-31 이면 BE 가 today 로 정정.
  //     (FE 에서 END_ACTIVE_DATE 미터치 — BE 가 9999-12-31 sentinel 감지 시 자동 today)
  const handleSave = useCallback(async () => {
    const pending = flushPending();
    const changed = rows.map((r) => withPending(r, pending)).filter((r) => r.nativeeditor_status);
    if (changed.length === 0) {
      setError("변경된 데이터가 없습니다.");
      return;
    }
    // V-002 필수 검증 — status 별 차등 (inserted / updated 만 사용자 입력값 검증, deleted 는 USER_ID 만)
    const requiredForUpsert: ReadonlyArray<keyof CommUserMngRow> = [
      "USER_ID", "USER_EMP_NO", "USER_NM", "IN_OUT_EMP_TP", "EMAIL",
    ];
    for (const r of changed) {
      if (r.nativeeditor_status === "deleted") {
        if (!r.USER_ID || String(r.USER_ID).trim().length === 0) {
          setError("삭제 대상 USER_ID 가 없습니다.");
          return;
        }
        continue;
      }
      const msg = validateRequired(r, requiredForUpsert);
      if (msg) {
        setError(msg);
        return;
      }
    }
    if (typeof window !== "undefined" && !window.confirm("저장하시겠습니까?")) return;

    await runBusy("save", async () => {
      setError(null);
      try {
        const payload = changed.map((r) => ({
          ...stripInternal(r),
          rowStatus: r.nativeeditor_status,
        })) as unknown as CommUserMngRow[];
        const res = await apiSaveCmUser(payload);
        showMessage({ message: `${res.cnt_save ?? 0}건 저장 되었습니다.` });
        await loadList(filters);
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패 하였습니다.");
      }
    });
  }, [rows, filters, loadList, showMessage, runBusy, flushPending, withPending]);

  // 2026-06-04 — As-Is regCmUser / deleteCmUser 핸들러 제거.
  //   master grid 의 +/-(추가/삭제) 버튼이 row 의 nativeeditor_status 를 inserted/deleted 로 마킹 후
  //   상단 "저장" 버튼이 통합 handleSave 호출 → BE 가 rowStatus 별 분기 처리.

  // ── B-016 reRegCmUser (계정 재생성 — 단건 처리) ──
  const handleReRegister = useCallback(async () => {
    const pending = flushPending();
    const live = selected ? withPending(selected, pending) : null;
    if (!live) {
      setError("선택 후 재생성 해주세요.");
      return;
    }
    if (!live.USER_EMP_NO) { setError("사번 저장 후 재생성 해주세요."); return; }
    if (!live.USER_NM)     { setError("사용자명 저장 후 재생성 해주세요."); return; }
    if (!live.IN_OUT_EMP_TP) { setError("내부 외부 구분 저장 후 재생성 해주세요."); return; }
    if (!live.EMAIL) { setError("이메일 저장 후 재생성 해주세요."); return; }

    if (typeof window !== "undefined"
        && !window.confirm(`[${live.USER_ID}] 계정을 재생성 하시겠습니까?`)) return;

    await runBusy("save", async () => {
      setError(null);
      try {
        // 2026-06-04 — infReqNo / description 정책 제거. row 그대로 전달.
        const payload: CommUserMngRow[] = [{
          ...stripInternal(live) as CommUserMngRow,
        } as unknown as CommUserMngRow];
        const res = await apiReRegCmUser(payload);
        showMessage({ message: `${res.cnt_save ?? 0}건 저장 되었습니다.` });
        await loadList(filtersRef.current);
      } catch (e) {
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }, [selected, loadList, showMessage, runBusy, flushPending, withPending]);

  // ── B-013 / B-015 pwdinit (비밀번호 / SSO 초기화) ──
  // As-Is xfdl:1382 (btn_PwdReset_onclick) / xfdl:1405 (btn_SSOPwdReset_onclick) 정합:
  //   - rdo_PwdReset / rdo_SSOReset 값이 "Y" 일 때만 confirm 표시 → fn_run("pwdinit")
  //   - 처리 후 Radio 값 강제 "N" 복귀
  // 반환값 = 상세 폼의 라디오를 "N" 으로 되돌릴지(처리가 진행됐거나 확인을 취소한 경우). 검증에서 막힌 경우는 그대로 둔다.
  const handlePwdReset = useCallback(async (sso: boolean, flag: string): Promise<boolean> => {
    const pending = flushPending();
    const live = selected ? withPending(selected, pending) : null;
    if (!live && !sso) {
      setError("선택된 사용자가 없습니다.");
      return false;
    }
    if (!sso && !live?.EMAIL) {
      setError("사용자 이메일 저장 후 진행해주세요.");
      return false;
    }
    // As-Is Radio 게이트 — Y 선택되어 있어야만 진입.
    if (sso && flag !== "Y") {
      setError("SSO 초기화 라디오에서 [Yes] 를 선택한 후 다시 시도해주세요.");
      return false;
    }
    if (!sso && flag !== "Y") {
      setError("비밀번호 초기화 라디오에서 [Yes] 를 선택한 후 다시 시도해주세요.");
      return false;
    }
    const confirmMsg = sso
      ? "전체 사용자의 SSO 비밀번호를 초기화 하시겠습니까?"
      : "비밀번호를 초기화 하시겠습니까?";
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) {
      // 취소 시 Radio 도 N 으로 복귀 (As-Is xfdl:1390 / 1413)
      return true;
    }

    await runBusy("save", async () => {
      setError(null);
      try {
        if (sso) {
          // SSO 일괄 — 현재 메인 그리드 행 전체 master 전달
          const master = rows.map((r) => stripInternal(withPending(r, pending)) as CommUserMngRow);
          await apiPwdInit(live?.USER_ID ?? "", live?.USER_EMP_NO ?? "", "Y", master);
          showMessage({ message: "SSO 비밀번호가 초기화 되었습니다" });
        } else {
          // 2026-09-28 — 초기 비밀번호는 BE 가 bcrypt 해시로만 남기면 관리자가 전달할 값을 알 수 없다.
          //   응답으로 받은 평문(INIT_PWD)을 팝업으로 띄우고 복사하게 한다 (기능설계서 M-032 To-Be).
          const res = await apiPwdInit(
            String(live!.USER_ID),
            String(live!.USER_EMP_NO ?? ""),
            "N",
          );
          if (res.INIT_PWD) {
            setIsPwdCopied(false);
            setInitPwd({
              userId: String(res.INIT_PWD_USER_ID ?? live!.USER_ID ?? ""),
              password: res.INIT_PWD,
            });
          } else {
            // 초기화는 됐지만 평문이 없으면(예: BE 롤백 후 구버전) 팝업을 띄울 값이 없다 — 기존 메시지로 폴백.
            showMessage({ message: "비밀번호가 초기화 되었습니다" });
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "비밀번호 초기화 실패");
      }
    });
    // As-Is xfdl:1395 / 1418 — 처리 후 Radio 강제 N 복귀
    return true;
  }, [selected, rows, showMessage, runBusy, flushPending, withPending]);

  // ── 초기 비밀번호 팝업 — 복사 (2026-09-28) ──
  const handleCopyInitPwd = useCallback(async () => {
    if (!initPwd) return;
    const ok = await copyToClipboard(initPwd.password);
    if (ok) {
      // 버튼 라벨로 "복사됨" 을 알린다 — 모달 위에 confirm 모달을 또 띄우지 않기 위함.
      setIsPwdCopied(true);
      showMessage({ message: "초기 비밀번호가 클립보드에 복사되었습니다.", toast: true });
    } else {
      showMessage({
        message: "복사에 실패했습니다. 비밀번호를 직접 선택해 복사해주세요.",
        alertType: "error",
      });
    }
  }, [initPwd, showMessage]);

  const handleCloseInitPwd = useCallback(() => {
    setInitPwd(null);
    setIsPwdCopied(false);
  }, []);

  // ── B-014 saveUserRoleGrpCopy (역할그룹 복사) ──
  const handleRoleCopy = useCallback(async (sourceUserId: string) => {
    const pending = flushPending();
    const live = selected ? withPending(selected, pending) : null;
    if (!live) {
      setError("선택된 사용자가 없습니다.");
      return;
    }
    if (!sourceUserId || sourceUserId.trim().length === 0) {
      setError("복사 출처 USER_ID 를 입력하세요.");
      return;
    }
    if (typeof window !== "undefined"
        && !window.confirm(`${sourceUserId} 사용자의 역할그룹을 등록 하시겠습니까?`)) return;

    await runBusy("save", async () => {
      setError(null);
      try {
        // 2026-06-04 — infReqNo / description 정책 제거. BE 가 null 처리.
        const res = await apiSaveUserRoleGrpCopy(
          String(live.USER_ID),
          sourceUserId.trim(),
        );
        showMessage({ message: `역할그룹이 ${res.cnt_save ?? 0}건 저장 되었습니다.` });
        if (live.USER_ID) await loadRoleGrids(String(live.USER_ID));
      } catch (e) {
        setError(e instanceof Error ? e.message : "역할 복사 실패");
      }
    });
  }, [selected, loadRoleGrids, showMessage, runBusy, flushPending, withPending]);

  // ── B-011 역할추가 (셔틀 → ds_userRolegrp 추가, "inserted" 마킹) ──
  const handleRoleAdd = useCallback(() => {
    if (selectedArgKeys.size === 0) {
      setError("선택된 Role 그룹이 없습니다.");
      return;
    }
    if (!selected) {
      setError("사용자를 먼저 선택하세요.");
      return;
    }
    const live = withPending(selected, flushPending());
    const newRows = availRoleGrpRows
      .filter((r) => selectedArgKeys.has(r.__argId))
      .map((r, i) => ({
        ROLE_GROUP_ID: r.ROLE_GROUP_ID,
        ROLE_GROUP_NM: r.ROLE_GROUP_NM,
        USER_ID: String(live.USER_ID),
        __urgId: `urg-new-${Date.now()}-${i}`,
        nativeeditor_status: "inserted" as RowStatus,
      }));
    setUserRoleGrpRows((prev) => [...prev, ...newRows]);
    setAvailRoleGrpRows((prev) => prev.filter((r) => !selectedArgKeys.has(r.__argId)));
    setSelectedArgKeys(new Set());
  }, [selectedArgKeys, availRoleGrpRows, selected, flushPending, withPending]);

  // ── B-009 역할삭제 (선택된 보유 역할 1건 "deleted" 마킹) ──
  const handleRoleDel = useCallback(() => {
    if (!selectedUrgKey) {
      setError("삭제할 역할을 선택하세요.");
      return;
    }
    setUserRoleGrpRows((prev) =>
      prev
        .map((r) => {
          if (r.__urgId !== selectedUrgKey) return r;
          if (r.nativeeditor_status === "inserted") return null;
          return { ...r, nativeeditor_status: "deleted" as RowStatus };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );
    setSelectedUrgKey(null);
  }, [selectedUrgKey]);

  // ── B-010 역할저장 (saveUserRoleGrp action — inserted/deleted 모두) ──
  const handleRoleSave = useCallback(async () => {
    if (!selected) {
      setError("선택된 사용자가 없습니다.");
      return;
    }
    const changed = userRoleGrpRows.filter((r) => r.nativeeditor_status);
    if (changed.length === 0) {
      setError("변경된 역할이 없습니다.");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("저장하시겠습니까?")) return;
    const live = withPending(selected, flushPending());

    await runBusy("save", async () => {
      setError(null);
      try {
        // 2026-06-04 — infReqNo / description 정책 제거. BE 가 null 처리.
        const payload: CommUserMngRoleGrpRow[] = changed.map((r) => ({
          USER_ID: String(live.USER_ID),
          ROLE_GROUP_ID: r.ROLE_GROUP_ID,
          ROLE_GROUP_NM: r.ROLE_GROUP_NM,
          rowStatus: r.nativeeditor_status,
        } as unknown as CommUserMngRoleGrpRow));
        const res = await apiSaveUserRoleGrp(payload);
        showMessage({ message: `역할 ${res.cnt_save ?? 0}건 저장 되었습니다.` });
        if (live.USER_ID) await loadRoleGrids(String(live.USER_ID));
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패 하였습니다.");
      }
    });
  }, [selected, userRoleGrpRows, loadRoleGrids, showMessage, runBusy, flushPending, withPending]);

  // ── B-012 역할조회 (선택 사용자의 추가 가능 역할 새로고침) ──
  const handleRoleSearch = useCallback(async () => {
    if (!selected) return;
    // 2026-09-04 fix — loadRoleGrids 는 두 그리드를 통째로 갈아치운다. "역할추가" 로 만든
    // 미저장 행(inserted/deleted)이 확인 없이 사라지던 것을 막는다.
    const pending = userRoleGrpRows.some((r) => r.nativeeditor_status);
    if (
      pending
      && typeof window !== "undefined"
      && !window.confirm("저장하지 않은 역할 변경이 있습니다. 버리고 다시 조회할까요?")
    ) {
      return;
    }
    await loadRoleGrids(String(withPending(selected, flushPending()).USER_ID));
  }, [selected, userRoleGrpRows, loadRoleGrids, flushPending, withPending]);

  // 보유 역할그룹 그리드 표시 행(삭제 표시 제외) — 매 렌더 새 배열이 되지 않게 메모한다(R7).
  const visibleUserRoleGrpRows = useMemo(
    () => userRoleGrpRows.filter((r) => r.nativeeditor_status !== "deleted"),
    [userRoleGrpRows],
  );

  return (
    <PageLayout
      title="사용자 관리"
      breadcrumb="공통관리 > 시스템관리 > 사용자 관리"
      objId="commUserMng"
      // 2026-06-04 — 사용자 결정: 5 버튼 (조회/계정생성/수정/계정삭제/닫기) → 3 버튼 (조회/저장/닫기).
      // 계정생성 + 수정 + 계정삭제 → 단일 "저장" 1 개로 통합 + BE 가 rowStatus 별 분기 (inserted/updated/deleted).
      // - 권한 기반 활성화는 PageLayout 의 objId+action RBAC 가 결정.
      // - 행 선택/변경 사전 disabled 제거 — 핸들러가 V-NNN 검증 후 ErrorModal 로 차단.
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
          // 2026-06-04 — 통합 저장 버튼 (다른 화면 btn_save 와 동일 패턴).
          // master rows 의 nativeeditor_status 별 BE 분기:
          //   inserted → 계정생성 (regCmUser 로직 흡수)
          //   updated  → 계정수정 (saveCmUser 로직)
          //   deleted  → 계정삭제 (deleteCmUser 로직 흡수)
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        {/* S-001 사용자 (USER_ID / USER_EMP_NO / USER_NM OR LIKE) — As-Is xfdl:275 TextBox. */}
        <SearchField
          label="사용자"
          name="USER_ID"
          value={filters.edt_USER_ID}
          onChange={(v) => handleFilterChange("edt_USER_ID", v)}
          placeholder="ID / 사번 / 이름"
        />
        {/* S-003 내부/외부 — As-Is xfdl:271 Combo (LV-002 ds_inOutEmpTp). */}
        <SearchField
          label="내부 외부 구분"
          name="IN_OUT_EMP_TP"
          meta="INTL_EXT_EMP_TP"
          type="select"
          value={filters.cbo_IN_OUT_EMP_TP}
          onChange={(v) => handleFilterChange("cbo_IN_OUT_EMP_TP", v)}
          options={IN_OUT_SEARCH_OPTIONS}
        />
        {/* S-002 사용 여부 — As-Is xfdl:273 Combo (LV-001 ds_useTp, default "Y"). */}
        <SearchField
          label="사용 여부"
          name="USE_TP"
          type="select"
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
          options={USE_TP_SEARCH_OPTIONS}
        />
      </SearchArea>

      <ContentBody root>
        {/* 좌측 — 메인 사용자 그리드 */}
        <ContentPanel>
          <GridPanel
            title="사용자 목록"
            count={visibleCount}
            showAddButton
            showCopyButton
            showDeleteButton
            data={visibleRows}
            rowKey="__rowId"
            columns={USER_COLUMNS}
            selectedRowKey={selectedKey}
            onDataChange={handleDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              gridId="userList"
              columnSizing="fit"
              columns={USER_COLUMNS}
              data={visibleRows}
              rowKey="__rowId"
              sortable
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedKey}
              onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 사용자가 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        {/* 중앙 — Detail 폼 (CommUserDetailForm).
            입력 초안은 폼 컴포넌트 안에 두고 blur·저장·행 전환 때만 rows 에 반영한다(R12).
            wrapper 크기는 내용물(form table) 크기에 맞춤 — 2026-06-02 iter#5 사용자 검수(J-015) 정합. */}
        <ContentPanel width={480}>
          <CommUserDetailForm
            ref={formRef}
            row={selected}
            saving={isSaving}
            onCommit={handleDetailCommit}
            onRoleCopy={handleRoleCopy}
            onReset={handlePwdReset}
            onReRegister={handleReRegister}
          />
        </ContentPanel>

        {/* 우측 — 보유 역할그룹 + 추가 가능 역할그룹 (수직 분할).
            2026-06-02 — AsIs 정합: width=380px (역할 그룹 ID + 역할 그룹명 2 컬럼만 표시).
            4 버튼 사전 disabled 제거 — 핸들러가 V-NNN ErrorModal 로 차단. */}
        <ContentPanel width={380}>
          <GridPanel
            title="보유 역할그룹"
            count={visibleUserRoleGrpRows.length}
            buttons={[
              {
                id: "btn_rolDel",
                label: "역할삭제",
                onClick: handleRoleDel,
                disabled: isSaving,
              },
              {
                id: "btn_rolSave",
                label: "역할저장",
                onClick: () => void handleRoleSave(),
                disabled: isSaving,
              },
            ]}
            data={visibleUserRoleGrpRows}
            rowKey="__urgId"
            columns={USER_ROLEGRP_COLUMNS}
            selectedRowKey={selectedUrgKey}
          >
            <AgDataGrid
              gridId="userRoleGrp"
              columnSizing="fit"
              columns={USER_ROLEGRP_COLUMNS}
              data={visibleUserRoleGrpRows}
              rowKey="__urgId"
              sortable
              highlightedRowKey={selectedUrgKey}
              onRowClick={(row) => setSelectedUrgKey(String((row as { __urgId?: string }).__urgId ?? ""))}
              loading={false}
              emptyMessage="보유 역할그룹이 없습니다."
            />
          </GridPanel>

          <GridPanel
            title="추가 가능 역할그룹"
            count={availRoleGrpRows.length}
            buttons={[
              {
                id: "btn_rolAdd",
                label: "역할추가",
                onClick: handleRoleAdd,
                disabled: isSaving,
              },
              {
                id: "btn_rolSearch",
                label: "역할조회",
                onClick: () => void handleRoleSearch(),
                disabled: isSaving,
              },
            ]}
            data={availRoleGrpRows}
            rowKey="__argId"
            columns={AVAIL_ROLEGRP_COLUMNS}
          >
            <AgDataGrid
              gridId="availRoleGrp"
              columnSizing="fit"
              columns={AVAIL_ROLEGRP_COLUMNS}
              data={availRoleGrpRows}
              rowKey="__argId"
              sortable
              /* 2026-09-04 fix — 종전에는 onRowClick 으로 Set 만 토글해 화면에 선택 표시가 전혀
                 없었다. 무엇이 선택됐는지 알 수 없고 두 번 클릭하면 조용히 해제돼, 그 상태로
                 "역할추가" 를 누르면 "선택된 Role 그룹이 없습니다" 만 떴다.
                 체크박스 다중 선택으로 교체 (commUserRoleCopy 정본 패턴). */
              selectable
              multiSelect
              onRowSelect={(ids) => setSelectedArgKeys(new Set(ids.map(String)))}
              loading={false}
              emptyMessage="추가 가능 역할그룹이 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {error && (
        <ErrorModal
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* 2026-09-28 — 초기 비밀번호 안내 팝업 (기능설계서 M-032 To-Be / As-Is pwdtmp 콜백 대체).
          BE 가 평문 INIT_PWD 를 응답으로 준 경우에만 열린다. 닫으면 값이 화면에서 사라진다.
          shared `Modal` 은 미지정 prop 을 DOM 으로 흘려보내지 않으므로 data-testid 는
          안쪽 Button / 값 요소에만 건다 (e2e 는 팝업 타이틀 "초기 비밀번호 안내" 로 locating). */}
      <Modal
        open={initPwd !== null}
        title="초기 비밀번호 안내"
        size="sm"
        onClose={handleCloseInitPwd}
        footer={
          <>
            <Button onClick={handleCopyInitPwd} data-testid="init-pwd-copy">
              {isPwdCopied ? "복사됨" : "비밀번호 복사"}
            </Button>
            <Button variant="primary" onClick={handleCloseInitPwd} data-testid="init-pwd-close">
              확인
            </Button>
          </>
        }
      >
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USER_ID" label="사용자 ID" /></th>
              <td style={DETAIL_VALUE_CELL}>{initPwd?.userId}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="initPassword" meta={false} label="초기 비밀번호" /></th>
              <td style={DETAIL_VALUE_CELL}>
                <code
                  data-testid="init-pwd-value"
                  // 클릭하면 전체 선택 — 복사 버튼를 못 쓰는 환경(브라우저 권한 차단) 대비.
                  onClick={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}
                  style={{
                    display: "block",
                    padding: "6px 8px",
                    background: "var(--color-bg-light)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "monospace",
                    fontSize: 14,
                    cursor: "pointer",
                    userSelect: "all",
                  }}
                >
                  {initPwd?.password}
                </code>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{
          marginTop: "var(--spacing-sm)",
          marginBottom: 0,
          fontSize: 12,
          color: "var(--color-text-muted)",
        }}>
          초기 비밀번호는 이 팝업을 닫으면 다시 볼 수 없습니다. 사용자 본인에게 전달하고 최초 로그인 시
          변경하도록 안내해주세요.
        </p>
      </Modal>
    </PageLayout>
  );
}
