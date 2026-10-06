"use client";

/**
 * commSyncMng 화면 — 동기화 관리 (As-Is CommSyncMng.xfdl / W8 — csa 9 화면 8번째).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI / S 4 / G 9 / B 3) / §3.7 (DS 3 — DS-001 정적 16 행) / §4 (이벤트 9) / §6 (SQL 13) / §8 (BPMN 1 action) / §9 (테이블)
 *   - 기능설계서 §2 (S 4) / §3 (G 9) / §5 (B 3) / §10 (API-001 reg) / §11 (V-001~V-010)
 *   - 디자인설계서 §1 (UX 흐름) / §6 (MSG-001~MSG-010)
 *   - BPMN설계서 §1.1 (단일 action reg) / §2 (UserTask_runSync) / §6.1 (식별자 매핑)
 *
 * 페이지 유형: 단일 그리드 + 조회조건 (S 4) + 액션 버튼 (B 3) — 팝업 ✗ / 상세폼 ✗ / 라인 ✗.
 * 호출: POST /api/mcm/oasis/commSyncMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 *
 * To-Be 정책 (분석 §11.0 / Q-001~Q-010 해소 2026-05-31):
 *   - #1 / Q-001 — 본 화면 책임 = MASTER 3 테이블 (MA1~MA4 행만 실제 동기화 가능)
 *   - #2 / Q-002 — Oracle DB Link 폐기 (from3/to3 표시값만)
 *   - #5 / Q-005 — LOC 분기 유일화
 *   - #7 / Q-008 — INSERT INTO ... SELECT * 직후 audit UPDATE
 *   - #11 — Entity = cma 4 화면 재사용 (자체 작성 ✗)
 *
 * 패턴: W7 (commUserRoleCopy) / W6 (commRoleMng) 단일 그리드 / GridPanel + AgDataGrid 표준 적용.
 *
 * 2026-06-01 UI 정합 갱신 — 9개 mcm 화면 일괄 UI 결함 보정.
 *   - G-1 G-001 CHK 컬럼 — As-Is xfdl `displaytype="checkboxcontrol" edittype="checkbox"` (xfdl:53) 등가물
 *     = AgDataGrid `selectable + multiSelect + onRowSelect` (raw editable text 셀 폐기 — native 체크박스 렌더)
 *   - G-2 처리유형(S-002) 콤보 onChange — selectedKeys 자동 세트로 cbo_SyncTarget_onitemchanged 등가 처리 (xfdl:191~246)
 *   - G-3 처리대상(S-004) Input — SearchField 사용 (기본값 "AA_TEST" / maxlength 200)
 *   - G-4 "이행"(B-001) 버튼 — PageLayout buttons (type="primary", action="reg") + objId 기반 RBAC 자동 비활성
 *   - G-5 ErrorModal — 무조건 렌더 + 내부 null guard (D-7 정본 패턴)
 *   - G-6 CHK 컬럼 자체 그리드 컬럼 정의에서 제거 — selectable 의 native 헤더/행 체크박스가 흡수
 *
 * 2026-06-02 W5(commUserMng) iter#1~#5 정합 적용 (사용자 명시 csa 8 화면 일괄 패턴 전파):
 *   - Pattern A (Layout): 단일 그리드 + ContentPanel 기본 flex:1 — AsIs 단일 div_main 정합.
 *                          본 화면은 Detail 패널 ✗ (AsIs xfdl 도 없음) — 좌측 그리드만 wider.
 *   - Pattern B (Detail wrapper): N/A — AsIs 에 Detail 패널 부재 (xfdl 구조상 검색 영역 + 메인 그리드만).
 *   - Pattern C (Form row): N/A — Detail 폼 ✗.
 *   - Pattern D (Grid): editable:false 모든 컬럼 적용 완료. Date 컬럼 ✗ / Code LABEL_MAP ✗ (전부 표시값).
 *   - Pattern E (Buttons): AsIs commonTop (xfdl:101~103) — custom ["btn_sync"] + basic ["btn_close"] 정합.
 *                          btn_search / btn_reg / btn_reset 추가 ✗ (AsIs ✗ → ToBe ✗).
 *                          사전 disabled 제거 (!pSyncTarget) — 핸들러가 V-001 ErrorModal 차단 (xfdl:134~137 정합).
 *                          isSyncing 만 유지 (double-click 방지).
 *   - Pattern F (Auto-search): N/A — AsIs xfdl:89 gfn_formOnLoad(obj) 가 transaction 호출 ✗ (ds_main 16 행 정적).
 *                              ToBe 도 INITIAL_SYNC_ROWS 가 즉시 표시되어 자동 진입 동치.
 *   - Pattern G (BE time): N/A — 본 Service 에 LocalDateTime / 날짜 컬럼 ✗ (동기화 메타 화면).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryState } from "@dk-oasis/shared/portal-shell";
import { uiCols } from "@/lib/ui-meta";

import { reg as apiReg } from "./api";
import {
  INITIAL_SYNC_ROWS,
  SYNC_TARGET_LOV,
  autoSelectTargetIds,
  type CommSyncMngMainRow,
  type CommSyncMngObjectRow,
  type SyncTarget,
} from "./types";

/**
 * 그리드 컬럼 — G-002~G-009 (분석 §3.3 / 기능 §3.1).
 *
 * <p>G-001 CHK 컬럼은 AgDataGrid `selectable + multiSelect` 가 native 체크박스로 렌더하므로
 * 본 GridColumn[] 에서 제외. As-Is xfdl `displaytype="checkboxcontrol" edittype="checkbox"` (xfdl:53)
 * 등가물 = onRowSelect callback 으로 selectedKeys 추적 (W6 commRoleMng / W7 commUserRoleCopy 정본 패턴).
 */
const SYNC_COLUMNS: GridColumn[] = uiCols([
  { key: "from1", header: "FROM (서버)", width: 90, editable: false, align: "left" },
  { key: "from2", header: "FROM (구분)", width: 90, editable: false, align: "left" },
  { key: "from3", header: "FROM (인스턴스)", width: 130, editable: false, align: "left" },
  { key: "from4", header: "FROM (스키마)", width: 130, editable: false, align: "left" },
  { key: "to1", header: "TO (서버)", width: 90, editable: false, align: "left" },
  { key: "to2", header: "TO (구분)", width: 90, editable: false, align: "left" },
  { key: "to3", header: "TO (인스턴스)", width: 130, editable: false, align: "left" },
  { key: "to4", header: "TO (스키마)", width: 130, editable: false, align: "left" },
]);

/**
 * 그리드 row — rowKey 는 targetid (16 행 정적, prefix 2자 + 1~4 — MA1~MA4 / RA1~RA4 / RB1~RB4 / NU1~NU4).
 * 각 targetid 는 유니크하므로 별도 합성 키 불필요.
 */
type GridSyncRow = CommSyncMngMainRow & Record<string, unknown>;

export default function CommSyncMngPage() {
  const { showMessage } = useMessage();

  // S-002 처리유형 (콤보) — null 일 때 fn_sync 차단 (xfdl:134~137)
  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 결과가 없는 화면이라 입력값·선택 키만(light) 옮긴다.
  const [pSyncTarget, setPSyncTarget] = useCarryState<SyncTarget | "">("pSyncTarget", "");
  // S-004 처리대상 (TextBox, 기본값 "AA_TEST" — xfdl:20)
  const [edtTarget, setEdtTarget] = useCarryState<string>("edtTarget", "AA_TEST");

  // ds_main 16 행 정적 (xfdl 자산 폐기 + React State 상수 이전).
  // CHK 는 GridPanel selectable 의 selectedKeys 로 관리 — row 자체에는 보관 ✗ (G-1 fix).
  const mainRows = useMemo<GridSyncRow[]>(() => INITIAL_SYNC_ROWS.map((r) => ({ ...r })), []);

  // G-001 CHK 등가물 — selectable+multiSelect 의 selectedKeys (W6/W7 정본 패턴).
  // 초기값: 빈 배열 (xfdl ds_main 16 행 초기 모두 CHK="0" 동치 — xfdl:273~450).
  const [selectedKeys, setSelectedKeys] = useCarryState<(string | number)[]>("selectedKeys", []);

  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Pattern F (W5 csa 자동 진입 정합) — AsIs xfdl:89 gfn_formOnLoad(obj) 등가:
  //   AsIs 본 화면은 onload 에서 transaction 호출 없음 (ds_main 16 행은 xfdl 정적 — DB 조회 ✗).
  //   따라서 ToBe loadList 콜백도 신설 ✗ — INITIAL_SYNC_ROWS 가 즉시 표시되어 AsIs 1:1 동치.
  //   본 useEffect 는 csa 정책 정합 명시용 marker (실 동작 없음).
  useEffect(() => {
    // 정적 16 행이 mainRows 상수로 즉시 노출됨 — 추가 호출 불필요.
  }, []);

  // ─────────────────────────────────────────────────────────────
  // S-002 처리유형 변경 — 자동 행 선택 (xfdl:191~246 div_search_cbo_SyncTarget_onitemchanged 등가)
  // G-2 fix: CHK 컬럼 직접 갱신 → selectedKeys 갱신 (selectable 정본 패턴)
  // ─────────────────────────────────────────────────────────────
  const handleSyncTargetChange = useCallback((value: string) => {
    setPSyncTarget(value as SyncTarget | "");
    if (value === "") {
      // 콤보 미선택 — 전체 행 선택 해제 (As-Is xfdl 기본 분기 없음 — To-Be 보강)
      setSelectedKeys([]);
      return;
    }
    // 자동 선택 targetid 목록 산출 — As-Is xfdl 처리유형별 prefix 매칭 (xfdl:201/211/221/230/239)
    const autoIds = autoSelectTargetIds(INITIAL_SYNC_ROWS, value as SyncTarget);
    setSelectedKeys(autoIds);
  }, [setPSyncTarget, setSelectedKeys]);

  // ─────────────────────────────────────────────────────────────
  // G-001 CHK 토글 — selectable+multiSelect 의 onRowSelect callback (W6/W7 정본)
  // ─────────────────────────────────────────────────────────────
  const handleRowSelect = useCallback((ids: (string | number)[]) => {
    setSelectedKeys(ids);
  }, [setSelectedKeys]);

  // ─────────────────────────────────────────────────────────────
  // B-001 "이행" 버튼 — fn_sync (xfdl:121~168)
  // ─────────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    // V-001 (xfdl:134~137) — 처리유형 null 검증
    if (!pSyncTarget) {
      setError("처리유형을 선택하세요.");
      return;
    }

    // V-003 — 처리대상 비어있지 않음 검증
    const objects = edtTarget
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (objects.length === 0) {
      setError("처리대상을 입력하세요.");
      return;
    }

    // V-002 (xfdl:126~129) — OBJECT 처리유형 시 "::" 포함 검증
    if (pSyncTarget === "OBJECT") {
      const invalid = objects.find((o) => !o.includes("::"));
      if (invalid) {
        setError(`OBJECT FULLNAME을 입력해주세요. \n ex)csa::CommSyncMng (입력값: ${invalid})`);
        return;
      }
    }

    // V-004 — selectedKeys 0 건 검증 (fn_callBack cnt_save==0 분기 + 사전 검증)
    if (selectedKeys.length === 0) {
      setError("이행 대상 행을 선택하세요.");
      return;
    }
    const selectedSet = new Set(selectedKeys.map(String));
    const checkedRows = mainRows.filter((r) => selectedSet.has(r.targetid));
    if (checkedRows.length === 0) {
      setError("이행 대상 행을 선택하세요.");
      return;
    }

    // confirm 메시지 (xfdl:164~167)
    const lov = SYNC_TARGET_LOV.find((l) => l.CODE_VAL === pSyncTarget);
    const targetName = lov?.CODE_VAL_MEAN ?? pSyncTarget;
    if (typeof window !== "undefined" &&
        !window.confirm(`[${targetName}] 이행 하시겠습니까?`)) {
      return;
    }

    setIsSyncing(true);
    setError(null);
    try {
      const dsObject: CommSyncMngObjectRow[] = objects.map((o) => ({ OBJECT: o }));
      // 서버는 selectedKeys 행만 처리 — As-Is gfn_transaction `ds_main:U` (xfdl:147) 와 동일 의미
      // 서버 화이트리스트 검증 (V-005~V-007) 을 위해 CHK="1" 로 명시 보강
      const dsMainPayload: CommSyncMngMainRow[] = checkedRows.map((r) => ({
        CHK: "1" as const,
        targetid: r.targetid,
        from1: r.from1,
        from2: r.from2,
        from3: r.from3,
        from4: r.from4,
        to1: r.to1,
        to2: r.to2,
        to3: r.to3,
        to4: r.to4,
      }));
      const payload = await apiReg(
        pSyncTarget as SyncTarget,
        dsMainPayload,
        dsObject,
      );

      const cnt = payload.cnt_save ?? 0;
      if (cnt === 0) {
        // MSG-004 (xfdl:178)
        showMessage({ message: "데이터 이행 미처리 되었습니다." });
      } else {
        // MSG-005 + MSG-006 (xfdl:181~182)
        showMessage({ message: `${cnt}건 저장 되었습니다.\n데이터 이행 정상완료 되었습니다.` });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "동기화 실행 실패");
    } finally {
      setIsSyncing(false);
    }
  }, [pSyncTarget, edtTarget, mainRows, selectedKeys, showMessage]);

  return (
    <PageLayout
      title="동기화 관리"
      breadcrumb="공통관리 > 시스템관리 > 동기화 관리"
      objId="commSyncMng"
      // 2026-06-02 W5(commUserMng) iter#1~#5 정합 적용 — Pattern E (AsIs commonTop 정합):
      //  - AsIs xfdl:101~103 fn_commonTop_onload — custom ["btn_sync"] + basic ["btn_close"]
      //  - btn_search / btn_reg / btn_reset 는 AsIs 에 ✗ — 추가 ✗ (정책)
      //  - 사전 disabled 제거 (!pSyncTarget) — 핸들러가 V-001 ErrorModal 로 차단 (AsIs xfdl:134~137 정합)
      //  - isSyncing 만 유지 (double-click 방지)
      buttons={[
        {
          id: "btn_sync",
          label: "이행",
          onClick: () => void handleSync(),
          type: "primary" as const,
          disabled: isSyncing,
          action: "reg",
        },
      ]}
    >
      {/* A-FILTER — S-001 처리유형 + S-003 처리대상 */}
      <SearchArea onSearch={() => void handleSync()}>
        <SearchField
          label="처리유형"
          name="syncTarget"
          meta={false}
          type="select"
          value={pSyncTarget}
          onChange={(v: string) => handleSyncTargetChange(v)}
          options={[
            { value: "", label: "선택" },
            ...SYNC_TARGET_LOV.map((l) => ({ value: l.CODE_VAL, label: l.CODE_VAL_MEAN })),
          ]}
        />
        <SearchField
          label="처리대상"
          name="target"
          meta={false}
          value={edtTarget}
          onChange={(v: string) => setEdtTarget(v)}
          placeholder="예: USD,JPY (OBJECT 시 csa::CommSyncMng)"
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="이행대상 선택 (SOURCE → TARGET)"
            count={selectedKeys.length}
            loading={isSyncing}
          >
            {/*
              G-1 fix: As-Is xfdl `displaytype="checkboxcontrol" edittype="checkbox"` (xfdl:53) 등가물
                      = selectable + multiSelect → 헤더/행 native 체크박스 (W6 commRoleMng / W7 commUserRoleCopy 정본 패턴)
              G-6 fix: CHK 컬럼 자체는 GridColumn[] 에서 제거 — selectable 의 내부 체크박스 컬럼이 흡수
            */}
            <AgDataGrid
              gridId="main"
              columnSizing="fit"
              columns={SYNC_COLUMNS}
              data={mainRows}
              rowKey="targetid"
              selectable
              multiSelect
              sortable={false}
              selectedRows={selectedKeys}
              onRowSelect={handleRowSelect}
              emptyMessage="이행 매트릭스가 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {/* D-7 fix: ErrorModal 무조건 렌더 — 내부 message=null guard */}
      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
