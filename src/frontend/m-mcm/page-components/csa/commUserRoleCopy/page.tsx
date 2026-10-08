"use client";

/**
 * commUserRoleCopy 화면 — 사용자 권한 일괄 등록 (As-Is CommUserRoleCopy.xfdl / W7).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI / DS 4) / §4 (이벤트 13) / §6 (SQL 5+1) / §8 (BPMN 3 action) / §9 (테이블 카탈로그)
 *   - 기능설계서 §3 (S 1 / G 1 + GE 3) / §4 (D 12) / §5 (B 5) / §6 (V-001~V-805) / §10 (M-001~M-012)
 *   - 디자인설계서 §2 (3 컬럼 분할 + 셔틀) / §4 (4 그리드)
 *   - BPMN설계서 §1.1 (3 API) / §2 (action 별 흐름) / §6 (To-Be 식별자)
 *
 * 페이지 유형: D 다중 그리드 (4 그리드 병렬 + 셔틀 + 권한헤더 입력).
 * 호출: POST /api/mcm/oasis/commUserRoleCopy/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 *
 * To-Be 정책 (분석 §11.0 + Q-001~Q-006 해소 2026-05-31):
 *   - #1 / Q-001 — As-Is CommUserMngMapper.selectRoleMergeObject 외부 호출 결함 정정 → 본 namespace 정본
 *   - #2 / Q-004 — As-Is EAI 폐기 → TB_MCM_DEPT_INFO LEFT JOIN
 *   - #3 / Q-003 — save flow 후속 task 미연결 = 의도된 분리 (save 완료 후 FE 가 searchUserList 별도 호출)
 *   - #5 — Q-005 RESP_GBN='A' / Q-008 WORKS_CODE='P' 하드코딩 보존
 *   - #6 / Q-002/Q-006 — JPA SecUserRollHis.saveAll 흡수
 *   - #11 — W5 commUserMng Entity / Repository 재사용
 *
 * 패턴: W5 (commUserMng) 다중 그리드 + 셔틀 — W4 (commRoleGrpMng) 의 selectable/multiSelect/onRowSelect 그리드 패턴 적용.
 *
 * 2026-06-01 UI 정합 갱신 — 9개 mcm 화면 일괄 UI 결함 보정.
 *   - D-1 셔틀 B-003/B-004 — raw `<button>` → shared `Button` (commRoleGrpMng 정본 패턴)
 *   - D-2 GE-002/GE-003 CHK 컬럼 — As-Is xfdl `displaytype="checkboxcontrol"` 등가물 = AgDataGrid selectable+multiSelect+onRowSelect
 *     (raw editable text 셀 폐기 — 실제 체크박스 native 렌더)
 *   - D-3 D-002/D-004 infReqNo/description — raw `<input>` → shared `Input`
 *   - D-4 D-005/D-006 userFilter/deptFilter — raw `<input>` → shared `Input`
 *   - D-5 GE-002/GE-003 전체선택 — commonLeftButton 등가 = 그리드 헤더 native 전체 체크 (AgGrid selectable 기본 제공) — 별도 toggle 버튼 폐기
 *   - D-6 ContentPanel 폭 = 디자인설계서 §3.1 좌 300 / 중앙 600 / 우 가변 — 1:1 보존
 *   - D-7 ErrorModal — 무조건 렌더 (내부 null guard) → 조건부 `error &&` 폐기
 *
 * 2026-06-02 iter — W5 (commUserMng) 패턴 전파:
 *   - A (Layout) — 중앙 480 narrow / 우 사용자 List flex:1 (좌 grid 영역 확장).
 *   - B (Detail wrapper) — 권한생성 대상 form: marginTop:32 + border #d4dae0 + bg #fff + 28px gray header.
 *   - C (Form row) — D-002 infReqNo / D-004 description 양쪽 flex:1 space-between table 행 정합 (W5 DETAIL_TABLE_STYLE 차용).
 *   - D (Grid) — editable:false 모두 정합 (date/code 컬럼 ✗ — toDateInputValue/LABEL_MAP 미적용).
 *   - E (Buttons) — AsIs xfdl:268 commonTop ["btn_search"]["btn_save"] + basic ["btn_close"] 정합 (btn_close 추가).
 *                   userTo.length === 0 사전 disabled 제거 — V-001/V-002 핸들러 검증 + ErrorModal 차단.
 *   - F (Auto-search) — fn_searchUserList useEffect 자동 호출 보존 (AsIs xfdl:261).
 *   - G (BE time) — 본 Service 는 사용자 date 입력 ✗ (search/save 모두 USER_ID 처리) — N/A.
 *
 * 2026-06-04 사용자 명시 3종 변경:
 *   1) UI 라벨 명확화 — source(권한 부여자) / target(권한 받을 대상) 방향 의미 표시.
 *      변수명 / state 이름 / variable / SQL 컬럼은 그대로 유지 (refactor 회피).
 *      | 위치                       | Before                       | After                                   |
 *      | -------------------------- | ---------------------------- | --------------------------------------- |
 *      | SearchField                | "Copy 대상 사용자 ID/사번"   | "권한 부여 source 사용자 ID/사번"       |
 *      | 좌측 GridPanel COPY 대상   | "COPY 대상"                  | "권한 부여자 (source)"                  |
 *      | 좌측 GridPanel 역할 그룹   | "역할 그룹"                  | "부여 권한 (source 보유)"               |
 *      | 중앙 GridPanel             | "권한 생성 대상자"           | "권한 복사 받을 대상자"                 |
 *      | 우측 사용자 List 영역      | "사용자 List"                | "권한 복사 받을 대상 List"              |
 *   2) 정보처리의뢰서 관련 전부 제거 — infReqNo + description state / Input / 중앙 form wrapper / V-003 confirm 분기.
 *      BE save 호출 시 빈 문자열 전달 ("" → BE 가 무시).
 *   3) 레이아웃 재정렬 — 중앙 form wrapper 제거 → 권한 복사 받을 대상자 그리드를 위로 올림 (marginTop 정리).
 *      userFrom / userTo 그리드 높이 정렬 — 좌측/중앙/우측 ContentPanel 모두 그리드만으로 같은 row 높이.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { searchUserList as apiSearchUserList, search as apiSearch, save as apiSave } from "./api";
import { runEntrySearch } from "./entry";
import type {
  CommUserRoleCopyCopyRoleGrpRow,
  CommUserRoleCopyCopyUserRow,
  CommUserRoleCopyUserFromRow,
  CommUserRoleCopyUserToRow,
} from "./types";

/** 합성 rowKey — AgDataGrid 의 rowKey 는 단일 컬럼만 지원 + 동일 USER_ID 충돌 방지. */
interface RowWithKey extends Record<string, unknown> {
  __rowId: string;
  USER_ID: string;
  USER_EMP_NO: string;
  USER_NM: string;
  DEPT_NM: string | null;
}

function withRowId<T extends { USER_ID?: string }>(r: T, prefix: string, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `${prefix}-${idx}-${String(r.USER_ID ?? "")}` };
}

/** 그리드 컬럼 — G-001~G-003 (Copy 대상 사용자, 1 row). */
const COPY_USER_COLUMNS: GridColumn[] = [
  { key: "USER_ID", header: "사용자ID", width: 117, editable: false, align: "left" },
  { key: "USER_EMP_NO", header: "사번", width: 101, editable: false, align: "left" },
  { key: "USER_NM", header: "사용자명", width: 100, editable: false, align: "left" },
];

/** 그리드 컬럼 — GE-001 (Copy 대상의 RoleGroup List). */
const COPY_ROLEGRP_COLUMNS: GridColumn[] = [
  { key: "ROLE_GROUP_ID", header: "역할 그룹 ID", width: 120, editable: false, align: "left" },
  { key: "ROLE_GROUP_NM", header: "역할 그룹명", width: 170, editable: false, align: "left" },
];

/**
 * 그리드 컬럼 — GE-002 (권한 생성 대상 사용자, 셔틀 이동 누적).
 * D-2 fix: 선택 컬럼은 AgDataGrid 의 selectable+multiSelect 가 자동 렌더 → CHK 컬럼 제거.
 */
const USER_TO_COLUMNS: GridColumn[] = [
  { key: "USER_ID", header: "사용자ID", width: 117, editable: false, align: "left" },
  { key: "USER_EMP_NO", header: "사번", width: 101, editable: false, align: "left" },
  { key: "USER_NM", header: "사용자명", width: 100, editable: false, align: "left" },
  { key: "DEPT_NM", header: "부서", width: 130, editable: false, align: "left" },
];

/**
 * 그리드 컬럼 — GE-003 (전체 사용자 List, 필터 가능).
 * D-2 fix: 선택 컬럼은 AgDataGrid 의 selectable+multiSelect 가 자동 렌더 → CHK 컬럼 제거.
 */
const USER_FROM_COLUMNS: GridColumn[] = [
  { key: "USER_ID", header: "사용자ID", width: 117, editable: false, align: "left" },
  { key: "USER_EMP_NO", header: "사번", width: 101, editable: false, align: "left" },
  { key: "USER_NM", header: "사용자명", width: 100, editable: false, align: "left" },
  { key: "DEPT_NM", header: "부서", width: 130, editable: false, align: "left" },
];

export default function CommUserRoleCopyPage() {
  const { showMessage } = useMessage();

  // 조회조건
  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·필터·선택 키는 가볍게, 조회 결과·셔틀 목록(4 dataset)은 bulky.
  const [filterUserId, setFilterUserId] = useCarryState("filterUserId", ""); // S-001 Copy 대상 사용자 ID/사번
  // 2026-06-04 사용자 명시 제거 — D-002 infReqNo / D-004 description 관련 state 폐기.
  //   BE save 호출 시 빈 문자열("") 로 고정 전달 → BE service 는 null/blank 처리 (영향 ✗).
  // 클라이언트 필터 (D-005 / D-006)
  const [userFilter, setUserFilter] = useCarryState("userFilter", "");
  const [deptFilter, setDeptFilter] = useCarryState("deptFilter", "");

  // 4 dataset
  const [copyUser, setCopyUser] = useCarryState<CommUserRoleCopyCopyUserRow[]>("copyUser", [], { bulky: true });
  const [copyRolegrp, setCopyRolegrp] = useCarryState<CommUserRoleCopyCopyRoleGrpRow[]>("copyRolegrp", [], { bulky: true });
  const [userTo, setUserTo] = useCarryState<(CommUserRoleCopyUserToRow & RowWithKey)[]>("userTo", [], { bulky: true });
  const [userFrom, setUserFrom] = useCarryState<(CommUserRoleCopyUserFromRow & RowWithKey)[]>("userFrom", [], { bulky: true });
  const restored = useCarryRestored();

  // 셔틀 선택 — D-2: CHK 컬럼 폐기 + AgDataGrid selectable 의 selectedIds 추적
  // 2026-06-04 fix (c) — userTo 그리드 selectable 제거로 userToSelectedKeys state 폐기.
  // userFrom 만 선택 추적 유지 (◀ 좌 셔틀 — userFrom 선택행만 → userTo 이동).
  const [userFromSelectedKeys, setUserFromSelectedKeys] = useCarryState<(string | number)[]>("userFromSelectedKeys", []);

  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // action: searchUserList — CommUserRoleCopy_onload 자동 호출 + save 콜백 재호출
  //
  // 2026-06-04 fix (a) — searchUserList 에 Copy 대상(본인) USER_ID/USER_EMP_NO 전달하여 응답에서 본인 제외.
  //   - pUserIdCopy 가 빈 문자열이면 BE 는 전체 사용자 반환 (V-705 onload 와 동등)
  //   - search 직후 / save 직후 호출 시점은 filterUserId 가 채워져 있으므로 본인 제외됨
  //   - 화면 초기 onload 시점은 filterUserId="" → 전체 반환
  // ─────────────────────────────────────────────────────────────
  const loadUserList = useCallback(async (excludeUserIdCopy?: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const payload = await apiSearchUserList(excludeUserIdCopy);
      const rows = (payload.ds_userFrom ?? []).map((r, i) =>
        withRowId(
          {
            USER_ID: r.USER_ID,
            USER_EMP_NO: r.USER_EMP_NO,
            USER_NM: r.USER_NM,
            DEPT_NM: r.DEPT_NM,
          },
          "uf",
          i,
        ),
      );
      setUserFrom(rows);
      setUserFromSelectedKeys([]);
      // M-006 — As-Is xfdl:370 "{N}건 조회 되었습니다."
      showMessage({ message: `${rows.length}건 조회 되었습니다.`, toast: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "사용자 List 조회 실패");
      setUserFrom([]);
      setUserFromSelectedKeys([]);
    } finally {
      setIsSearching(false);
    }
  }, [showMessage, setUserFrom, setUserFromSelectedKeys]);

  // ─────────────────────────────────────────────────────────────
  // action: search — Copy 대상 + RoleGroup chain (B-001 btn_search)
  // ─────────────────────────────────────────────────────────────
  // 돌려주는 값: 조회는 성공했는데 Copy 대상이 0건이면 false(그 밖에는 true — 오류는 화면에 이미 보인다). 분리 창 복원 때 사용자 List 로 물러서는 데 쓴다.
  const handleSearch = useCallback(async (): Promise<boolean> => {
    // V-101: edt_userIdCopy null 차단 (xfdl:300~303)
    if (!filterUserId || filterUserId.trim().length === 0) {
      setError("Copy 대상 사용자 ID/사번 입력 후 조회해주세요.");
      return true;
    }
    setIsSearching(true);
    setError(null);
    try {
      const trimmed = filterUserId.trim();
      const payload = await apiSearch(trimmed);
      setCopyUser(payload.ds_copyUser ?? []);
      setCopyRolegrp(payload.ds_copyRolegrp ?? []);
      // M-007 — As-Is xfdl:378 (메시지 키 ds_userCopy mismatch 보존 — 사용자 인지용은 ds_copyUser 카운트)
      const cnt = (payload.ds_copyUser ?? []).length;
      showMessage({ message: `${cnt}건 조회 되었습니다.`, toast: true });
      // 2026-06-04 fix (a) — Copy 대상 결정 후 사용자 List 본인 제외 재조회.
      // ds_copyUser[0].USER_ID 로 정확한 USER_ID 전달 (입력값이 USER_EMP_NO 인 경우도 본인 확정 가능).
      const exclude = payload.ds_copyUser?.[0]?.USER_ID ?? trimmed;
      if (cnt > 0 && exclude) {
        await loadUserList(String(exclude));
      }
      return cnt > 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy 대상 조회 실패");
      setCopyUser([]);
      setCopyRolegrp([]);
      return true;
    } finally {
      setIsSearching(false);
    }
  }, [filterUserId, showMessage, loadUserList, setCopyRolegrp, setCopyUser]);

  // V-705 onload 자동 호출 — 처음 열 때는 SearchArea autoSearch 가 조회 기본값을 넣은 다음 handleSearchArea 를 한 번 부른다.
  // 그 한 번만 진입 분기(runEntrySearch)를 타고, 그 뒤 Enter 는 조회 단추와 같다(Copy 대상이 비면 V-101 오류).
  // 분리 창이 이어받은 값으로 시작하면 autoSearch 는 부르지 않으므로 아래 effect 가 이어받은 상태를 보고 조회한다.
  const entryPendingRef = useRef(!restored);
  const handleSearchArea = useCallback(async () => {
    if (entryPendingRef.current) {
      entryPendingRef.current = false;
      await runEntrySearch(filterUserId, handleSearch, loadUserList);
      return;
    }
    await handleSearch();
  }, [filterUserId, handleSearch, loadUserList]);

  // 새 창이 이어받은 목록(사용자 List·권한 생성 대상)이 있으면 건너뛴다. 목록 없이 복원됐으면 이어받은 Copy 대상으로 다시 조회한다
  // (Copy 대상 ID 가 있으면 조회 버튼과 같은 흐름 — 그 조회가 0건이면 사용자 List 가 비지 않게 전체 List 로 물러선다. 없으면 전체 List).
  // 셔틀로 한쪽이 비어도 반대쪽이 차 있으면 이어받은 것으로 본다.
  useEffect(() => {
    if (!restored) return;
    if (userFrom.length > 0 || userTo.length > 0) return;
    void runEntrySearch(filterUserId, handleSearch, loadUserList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 셔틀 좌 (B-003 btn_left) — userFrom 선택행 → userTo 이동
  // ─────────────────────────────────────────────────────────────
  const handleShuttleLeft = useCallback(() => {
    // V-201/V-202: selectedKeys 기반 이동 (xfdl 의 CHK=1 역순 루프 등가)
    if (userFromSelectedKeys.length === 0) {
      setError("이동할 행을 선택하세요.");
      return;
    }
    const selectedSet = new Set(userFromSelectedKeys.map(String));
    const checkedFrom = userFrom.filter((r) => selectedSet.has(r.__rowId));
    // 중복 방지 — userTo 에 동일 USER_ID 가 이미 있으면 skip
    const existingIds = new Set(userTo.map((r) => r.USER_ID));
    const toMove = checkedFrom.filter((r) => !existingIds.has(r.USER_ID));
    if (toMove.length === 0) {
      setError("이미 권한 생성 대상에 추가된 사용자입니다.");
      return;
    }
    setUserTo((prev) => [
      ...prev,
      ...toMove.map((r, i) =>
        withRowId<CommUserRoleCopyUserToRow & { __rowId?: string }>(
          {
            USER_ID: r.USER_ID,
            USER_EMP_NO: r.USER_EMP_NO,
            USER_NM: r.USER_NM,
            DEPT_NM: r.DEPT_NM,
          },
          "ut",
          prev.length + i,
        ),
      ),
    ]);
    // userFrom 에서 이동된 행 제거
    const movedIds = new Set(toMove.map((r) => r.USER_ID));
    setUserFrom((prev) => prev.filter((r) => !movedIds.has(r.USER_ID)));
    setUserFromSelectedKeys([]);
  }, [userFrom, userFromSelectedKeys, userTo, setUserFrom, setUserFromSelectedKeys, setUserTo]);

  // ─────────────────────────────────────────────────────────────
  // 셔틀 우 (B-004 btn_right) — userTo 전체 → userFrom 복귀
  // 2026-06-04 fix (c) — userTo 체크박스 제거에 따라 "전체 복귀" semantics 로 변경.
  // (옮긴 사용자 전체 = 복사 대상이므로 부분 복귀 use case 없음 — 잘못 옮긴 경우 전체 되돌리기로 단순화)
  // ─────────────────────────────────────────────────────────────
  const handleShuttleRight = useCallback(() => {
    if (userTo.length === 0) {
      setError("복귀할 사용자가 없습니다.");
      return;
    }
    const existingIds = new Set(userFrom.map((r) => r.USER_ID));
    const toReturn = userTo.filter((r) => !existingIds.has(r.USER_ID));
    if (toReturn.length > 0) {
      setUserFrom((prev) => [
        ...prev,
        ...toReturn.map((r, i) =>
          withRowId<CommUserRoleCopyUserFromRow & { __rowId?: string }>(
            {
              USER_ID: r.USER_ID,
              USER_EMP_NO: r.USER_EMP_NO,
              USER_NM: r.USER_NM,
              DEPT_NM: r.DEPT_NM,
            },
            "uf",
            prev.length + i,
          ),
        ),
      ]);
    }
    setUserTo([]);
  }, [userTo, userFrom, setUserFrom, setUserTo]);

  // ─────────────────────────────────────────────────────────────
  // 클라이언트 필터 (D-005 / D-006 결합 AND / V-401~V-411)
  // useMemo 대신 직접 계산 — userFrom + 필터 두 입력만 의존.
  // ─────────────────────────────────────────────────────────────
  const filteredUserFrom = (() => {
    const uf = userFilter.trim().toUpperCase();
    const df = deptFilter.trim().toUpperCase();
    return userFrom.filter((r) => {
      const userMatch =
        uf.length === 0 ||
        String(r.USER_ID ?? "").toUpperCase().includes(uf) ||
        String(r.USER_EMP_NO ?? "").toUpperCase().includes(uf) ||
        String(r.USER_NM ?? "").toUpperCase().includes(uf);
      const deptMatch = df.length === 0 || String(r.DEPT_NM ?? "").toUpperCase().includes(df);
      return userMatch && deptMatch;
    });
  })();

  // ─────────────────────────────────────────────────────────────
  // action: save — RoleGroup 일괄 복사 (B-002 btn_save)
  // ─────────────────────────────────────────────────────────────
  const performSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const pUserIdCopy = String(copyUser[0]?.USER_ID ?? "");
      // userTo 전송 시 내부 keys 제거 — 서버는 USER_ID 만 사용
      const userToPayload = userTo.map((r) => ({
        USER_ID: r.USER_ID,
        USER_EMP_NO: r.USER_EMP_NO,
        USER_NM: r.USER_NM,
        DEPT_NM: r.DEPT_NM,
      })) as unknown as CommUserRoleCopyUserToRow[];
      // 2026-06-04 사용자 명시 — infReqNo / description 빈 문자열 고정 (BE 가 null/blank 처리).
      const res = await apiSave(
        {
          pUserIdCopy,
          pInfReqNo: "",
          pDescription: "",
        },
        userToPayload,
      );
      // M-008 — As-Is xfdl:386 (저장 메시지 아닌 조회 메시지 As-Is 보존 / cnt_save 카운트 사용자 단위)
      showMessage({ message: `${res.cnt_save ?? 0}건 조회 되었습니다.`, toast: true });

      // V-502 화면 초기화 1단계 — 4 dataset clearData
      setCopyUser([]);
      setCopyRolegrp([]);
      setUserTo([]);
      setUserFromSelectedKeys([]);

      // V-504 입력 필드 초기화 (infReqNo/description 폐기 → userFilter/deptFilter/filterUserId 만)
      setUserFilter("");
      setDeptFilter("");
      setFilterUserId("");

      // V-503/Q-003 보존 — save 트랜잭션 완료 후 별도 fn_searchUserList() 호출로 ds_userFrom 새로고침
      await loadUserList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [copyUser, userTo, showMessage, loadUserList, setCopyRolegrp, setCopyUser, setDeptFilter, setFilterUserId, setUserFilter, setUserFromSelectedKeys, setUserTo]);

  /** 저장 (B-002 fn_save / xfdl:317~358 / V-001~V-002). */
  const handleSave = useCallback(async () => {
    // V-001 (xfdl:327~330)
    if (copyUser.length === 0) {
      setError("복사 대상 사용자가 조회되지 않았습니다.");
      return;
    }
    // V-002 (xfdl:332~335)
    if (userTo.length === 0) {
      setError("권한 복사 받을 대상자가 없습니다.");
      return;
    }
    // 2026-06-04 사용자 명시 — V-003 infReqNoFlag confirm 분기 제거.
    //   정보처리의뢰서/처리사유 기능 자체 폐기 → 단일 confirm 만.
    if (typeof window !== "undefined" && !window.confirm("권한을 복사 하시겠습니까?")) {
      return;
    }
    await performSave();
  }, [copyUser, userTo, performSave]);

  return (
    <PageLayout
      title="사용자 권한 일괄 등록"
      breadcrumb="공통관리 > 시스템관리 > 사용자 권한 일괄 등록"
      objId="commUserRoleCopy"
      // 2026-06-02 iter — AsIs xfdl:268 commonTopButton ["btn_search"]["btn_save"] + basic ["btn_close"] 정합.
      // - 권한 기반 활성화는 PageLayout 의 objId+action RBAC 가 결정.
      // - 행 선택/변경 사전 disabled 제거 (userTo.length === 0 제거) — 핸들러가 V-001/V-002 ErrorModal 로 차단.
      // - isSaving/isSearching 만 유지 (double-click 방지).
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
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: isSearching || isSaving,
          action: "save",
        },
      ]}
    >
      {/* A-FILTER — S-001 권한 부여 source 사용자 ID/사번 (라벨 명확화 / 2026-06-04). */}
      <SearchArea onSearch={() => void handleSearchArea()} autoSearch>
        {/* 조회 기본값 대상 칸 — 기본값이 들어오면 진입 조회가 이 칸으로 Copy 대상을 찾고, 없으면 전체 사용자 List 를 불러온다(handleSearchArea). */}
        <SearchField
          label="권한 부여 source 사용자 ID/사번"
          name="filterUserId"
          meta="USER_ID"
          value={filterUserId}
          onChange={(v: string) => setFilterUserId(v)}
          placeholder="USER_ID 또는 사번"
        />
      </SearchArea>

      <ContentBody root>
        {/* 좌측 (310px) — 권한 부여자 + 부여 권한 (라벨 명확화 / 2026-06-04). */}
        <ContentPanel width={310}>
          <GridPanel title="권한 부여자 (source)" count={copyUser.length} loading={isSearching}>
            <AgDataGrid
              gridId="copySourceUser"
              columnSizing="fit"
              columns={COPY_USER_COLUMNS}
              data={copyUser as Record<string, unknown>[]}
              rowKey="USER_ID"
              emptyMessage="조회된 결과가 없습니다."
            />
          </GridPanel>
          <GridPanel title="부여 권한 (source 보유)" count={copyRolegrp.length}>
            <AgDataGrid
              gridId="copySourceRoleGrp"
              columnSizing="fit"
              columns={COPY_ROLEGRP_COLUMNS}
              data={copyRolegrp as Record<string, unknown>[]}
              rowKey="ROLE_GROUP_ID"
              emptyMessage="조회된 결과가 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        {/* 중앙 (380px) — 권한 복사 받을 대상자 (라벨 명확화 + 영역 재정렬 / 2026-06-04).
            정보처리의뢰서 영역 폐기 → 그리드를 위로 올림.
            우측 사용자 List 그리드와 같은 row 시작 + 같은 row 끝 = 높이 정렬 (ContentPanel flex 기본). */}
        <ContentPanel width={380}>
          <GridPanel title="권한 복사 받을 대상자" count={userTo.length}>
            {/* 2026-06-04 fix (c) — 권한 복사 받을 대상자 그리드 체크박스 제거.
                옮긴 사용자 전체 = 복사 대상이므로 선택 불필요 (사용자 명시).
                selectable / multiSelect / onRowSelect 모두 제거 — selectable 기본값 false. */}
            <AgDataGrid
              gridId="copyTargetUser"
              columnSizing="fit"
              columns={USER_TO_COLUMNS}
              data={userTo as Record<string, unknown>[]}
              rowKey="__rowId"
              sortable={false}
              emptyMessage="셔틀로 권한 복사 받을 대상자를 추가하세요."
            />
          </GridPanel>
        </ContentPanel>

        {/* A-SHUTTLE — B-003/B-004 (디자인설계서 §3.7 / xfdl:121~122)
            D-1 fix: raw `<button>` → shared `Button` */}
        <div
          style={{
            width: 60,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 8,
            padding: "0 6px",
          }}
        >
          <Button
            onClick={handleShuttleLeft}
            disabled={userFromSelectedKeys.length === 0}
            ariaLabel="선택한 사용자를 권한 복사 받을 대상자로 이동 (B-003 셔틀 좌)"
            style={{ minWidth: 0 }}
          >
            ◀
          </Button>
          <Button
            onClick={handleShuttleRight}
            disabled={userTo.length === 0}
            ariaLabel="권한 복사 받을 대상자 전체를 대상 List 로 복귀 (B-004 셔틀 우)"
            style={{ minWidth: 0 }}
          >
            ▶
          </Button>
        </div>

        {/* 우측 가변 — 권한 복사 받을 대상 List + 필터 (라벨 명확화 / 2026-06-04). */}
        <ContentPanel>
          {/* D-4 fix: D-005/D-006 필터 — raw input → shared Input */}
          <div
            style={{
              padding: "6px 8px",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginRight: 6 }}>권한 복사 받을 대상 List</div>
            <label style={{ fontSize: 12 }}>ID/사번/이름</label>
            <div style={{ width: 150 }}>
              <Input
                value={userFilter}
                onChange={(v) => setUserFilter(v)}
                maxLength={100}
                placeholder="ID/사번/이름"
              />
            </div>
            <label style={{ fontSize: 12 }}>부서</label>
            <div style={{ width: 150 }}>
              <Input
                value={deptFilter}
                onChange={(v) => setDeptFilter(v)}
                maxLength={100}
                placeholder="부서명"
              />
            </div>
          </div>
          <GridPanel title="권한 복사 받을 대상 List" count={filteredUserFrom.length} loading={isSearching}>
            {/* D-2 fix: selectable+multiSelect → 헤더 native 전체선택 + 행 체크박스
                (As-Is commonLeftButton 의 CHK 전체선택 등가물) */}
            <AgDataGrid
              gridId="copyTargetList"
              columnSizing="fit"
              columns={USER_FROM_COLUMNS}
              data={filteredUserFrom as Record<string, unknown>[]}
              rowKey="__rowId"
              selectable
              multiSelect
              sortable={false}
              onRowSelect={(ids) => setUserFromSelectedKeys(ids)}
              emptyMessage="조회된 사용자가 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {/* D-7 fix: ErrorModal 무조건 렌더 — 내부 message=null guard */}
      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
