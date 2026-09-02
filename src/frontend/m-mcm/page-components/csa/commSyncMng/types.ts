/**
 * commSyncMng 화면 — TypeScript 타입 정의 (W8 / csa 9 화면 8번째).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트 / S 4 / G 9 / B 3) / §3.7 (Dataset DS-001~003) / §6 (SQL 13) / §8 (BPMN 1 action) / §9 (테이블)
 *   - 기능설계서 §2 (S 4) / §3 (G 9) / §5 (B 3) / §8 (ST 8 — 6 처리유형 + 2 서버) / §10 (API-001 reg)
 *   - BPMN설계서 §1.1 (단일 action reg) / §2 (UserTask_runSync)
 *
 * dataset 컬럼은 As-Is SNAKE_CASE / lowerCamelCase 보존 (Service 응답과 1:1).
 *
 * To-Be 정책 (분석 §11.0):
 *   - Q-001 — 본 화면 책임 = MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL / TB_MCM_CODE_CATEGORY)
 *             ds_main 16 행 중 MA1~MA4 (4 행) 만 실제 동기화 가능. RA / RB / NU prefix 12 행은 표시값 보존 + No-op (Q-009 후속 도메인 위임).
 *   - Q-002 — DB Link 폐기 → from3 / to3 컬럼은 표시값만 (런타임 SQL 사용 ✗).
 *   - Q-005 — LOC 분기 유일화 (PRD 분기는 No-op).
 *   - Q-008 — INSERT INTO ... SELECT * 직후 audit UPDATE.
 *   - Q-010 — 화면 존속 (schema 간 MCM_SOURCE ↔ MCMAPUSER ↔ MCM_BACKUP).
 */

/** 처리유형 6 enum — xfdl ds_lovSyncTarget 정적 (분석 §3.7 DS-002 / 기능 §9.1 LV-001). */
export type SyncTarget = "MASTER" | "RULE" | "RULE_JUDGE" | "INTERFACE" | "FORMAT" | "OBJECT";

/** ds_lovSyncTarget 행 형식 (CODE_VAL / CODE_VAL_MEAN). */
export interface CommSyncMngLovRow {
  CODE_VAL: SyncTarget;
  CODE_VAL_MEAN: string;
}

/** S-001 / S-002 / S-003 / S-004 조회조건 (기능 §2). */
export interface CommSyncMngFilters {
  /** S-002 처리유형 (콤보) — null 일 때 fn_sync 차단 (xfdl:134~137). */
  pSyncTarget: SyncTarget | "";
  /** S-004 처리대상 (TextBox) — 기본값 "AA_TEST" / 콤마 다중 입력 / OBJECT 시 "::" 포함 필수. */
  edtTarget: string;
}

/**
 * ds_main 16 행 정적 데이터 — 이행 매트릭스 (분석 §3.7 DS-001 / xfdl:273~450).
 *
 * <p>To-Be 결정: xfdl 자산 폐기 + React State 상수 INITIAL_SYNC_ROWS 로 이전 (수정 빈도 매우 낮음 — DB master code 화 불필요).
 *
 * <p>컬럼:
 *  - CHK: "0" / "1" — 체크박스 토글 (cbo_SyncTarget onChange 자동 + 사용자 수동 토글)
 *  - targetid: prefix 2글자 (MA/RA/RB/NU) + 숫자 1~4 — Q-001 해소로 MA1~MA4 만 실제 동기화 가능
 *  - from1~from4 / to1~to4: SOURCE / TARGET 표시값
 */
export interface CommSyncMngMainRow {
  CHK: "0" | "1";
  targetid: string; // MA1~MA4 / RA1~RA4 / RB1~RB4 / NU1~NU4
  from1: string; // "가동계" / "개발계"
  from2: string; // "원장" / "가동"
  from3: string; // DB Link 명 (To-Be 표시만)
  from4: string; // SOURCE schema (예: "MCM_SOURCE", "MCMAPUSER")
  to1: string;
  to2: string; // "가동" / "백업" / "원장"
  to3: string;
  to4: string; // TARGET schema
}

/** ds_object 행 형식 (edt_Target ',' split 결과 — xfdl:138~143). */
export interface CommSyncMngObjectRow {
  OBJECT: string; // 마스터코드 ID (예: "USD", "JPY"). OBJECT 처리유형 시 "::" 포함 (예: "csa::CommSyncMng").
}

/** reg action 응답 (xfdl:181 cnt_save). */
export interface CommSyncMngRegResponse {
  cnt_save: number;
}

/**
 * ds_main 16 행 정적 데이터 (분석 §3.7 DS-001 표 인용 + 디자인 §3.6 표).
 *
 * <p>xfdl:273~450 의 16 행 1:1 보존. CHK 는 모두 "0" 초기값.
 */
export const INITIAL_SYNC_ROWS: CommSyncMngMainRow[] = [
  // MASTER 처리유형용 4 행 (MA prefix) — 본 화면 책임 ✓ (Q-001)
  { CHK: "0", targetid: "MA1", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCM_SOURCE", to1: "가동계",   to2: "가동", to3: "MEPP_MCM",    to4: "MCMAPUSER"  },
  { CHK: "0", targetid: "MA2", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCM_SOURCE", to1: "가동계",   to2: "백업", to3: "MEPP_MCM",    to4: "MCM_BACKUP" },
  { CHK: "0", targetid: "MA3", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCM_SOURCE", to1: "개발계",   to2: "가동", to3: "DPMESA1_MCM", to4: "MCMAPUSER"  },
  { CHK: "0", targetid: "MA4", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCM_SOURCE", to1: "테스트계", to2: "가동", to3: "TSTMPH_MCM",  to4: "MCMAPUSER"  },
  // RULE 처리유형용 4 행 (RA prefix) — 후속 도메인 화면 위임 (Q-009)
  { CHK: "0", targetid: "RA1", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCA_SOURCE", to1: "가동계",   to2: "가동", to3: "MEPP_MCM",    to4: "MCAAPUSER"  },
  { CHK: "0", targetid: "RA2", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCA_SOURCE", to1: "가동계",   to2: "백업", to3: "MEPP_MCM",    to4: "MCA_BACKUP" },
  { CHK: "0", targetid: "RA3", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCA_SOURCE", to1: "개발계",   to2: "가동", to3: "DPMESA1_MCM", to4: "MCAAPUSER"  },
  { CHK: "0", targetid: "RA4", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCA_SOURCE", to1: "테스트계", to2: "가동", to3: "TSTMPH_MCM",  to4: "MCAAPUSER"  },
  // RULE_JUDGE 처리유형용 4 행 (RB prefix) — 후속 도메인 화면 위임
  { CHK: "0", targetid: "RB1", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCB_SOURCE", to1: "가동계",   to2: "가동", to3: "MEPP_MCM",    to4: "MCBAPUSER"  },
  { CHK: "0", targetid: "RB2", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCB_SOURCE", to1: "가동계",   to2: "백업", to3: "MEPP_MCM",    to4: "MCB_BACKUP" },
  { CHK: "0", targetid: "RB3", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCB_SOURCE", to1: "개발계",   to2: "가동", to3: "DPMESA1_MCM", to4: "MCBAPUSER"  },
  { CHK: "0", targetid: "RB4", from1: "가동계", from2: "원장", from3: "MEPP_MCM",   from4: "MCB_SOURCE", to1: "테스트계", to2: "가동", to3: "TSTMPH_MCM",  to4: "MCBAPUSER"  },
  // INTERFACE / FORMAT / OBJECT 처리유형용 공용 4 행 (NU prefix) — 후속 도메인 화면 위임
  { CHK: "0", targetid: "NU1", from1: "개발계", from2: "가동", from3: "DPMESA1_MCM", from4: "MCMAPUSER", to1: "가동계",   to2: "가동", to3: "MEPP_MCM",    to4: "MCMAPUSER"  },
  { CHK: "0", targetid: "NU2", from1: "개발계", from2: "가동", from3: "DPMESA1_MCM", from4: "MCMAPUSER", to1: "가동계",   to2: "원장", to3: "MEPP_MCM",    to4: "MCM_SOURCE" },
  { CHK: "0", targetid: "NU3", from1: "개발계", from2: "가동", from3: "DPMESA1_MCM", from4: "MCMAPUSER", to1: "가동계",   to2: "백업", to3: "MEPP_MCM",    to4: "MCM_BACKUP" },
  { CHK: "0", targetid: "NU4", from1: "개발계", from2: "가동", from3: "DPMESA1_MCM", from4: "MCMAPUSER", to1: "테스트계", to2: "가동", to3: "TSTMPH_MCM",  to4: "MCMAPUSER"  },
];

/** 처리유형 LoV 6 행 정적 (xfdl ds_lovSyncTarget 인용 — 분석 §3.7 DS-002). */
export const SYNC_TARGET_LOV: ReadonlyArray<CommSyncMngLovRow> = [
  { CODE_VAL: "MASTER",     CODE_VAL_MEAN: "마스터코드" },
  { CODE_VAL: "RULE",       CODE_VAL_MEAN: "일반업무기준" },
  { CODE_VAL: "RULE_JUDGE", CODE_VAL_MEAN: "판단업무기준" },
  { CODE_VAL: "INTERFACE",  CODE_VAL_MEAN: "인터페이스" },
  { CODE_VAL: "FORMAT",     CODE_VAL_MEAN: "포맷" },
  { CODE_VAL: "OBJECT",     CODE_VAL_MEAN: "OBJECT" },
];

/**
 * 자동 행 선택 분기 매트릭스 (xfdl:191~246 — div_search_cbo_SyncTarget_onitemchanged).
 *
 * <p>처리유형별 targetid prefix 2글자 매칭 + OBJECT 만 to2=="가동" 추가 조건.
 *
 * <p>**deprecated** — G-1/G-6 정합 보정 후 CHK 컬럼은 row 에 보관 ✗ →
 * {@link autoSelectTargetIds} 로 selectedKeys 배열 반환 패턴 사용 (W6/W7 정본).
 * 본 함수는 하위호환 + types/단위 테스트용으로 보존.
 */
export function autoSelectRows(rows: CommSyncMngMainRow[], target: SyncTarget): CommSyncMngMainRow[] {
  return rows.map((r) => {
    const match = matchTargetRow(r, target);
    return { ...r, CHK: match ? ("1" as const) : ("0" as const) };
  });
}

/**
 * 자동 선택 targetid 목록 산출 (xfdl:191~246 등가).
 *
 * <p>G-2 fix: AgDataGrid selectable+multiSelect 의 selectedKeys 배열 (W6 commRoleMng /
 * W7 commUserRoleCopy 정본 패턴) 로 사용 — page.tsx 의 setSelectedKeys 입력값.
 *
 * @param rows   ds_main 정적 16 행 (INITIAL_SYNC_ROWS)
 * @param target 처리유형 6 enum (xfdl ds_lovSyncTarget)
 * @returns 자동 체크 대상 targetid 배열 (예: MASTER → ["MA1","MA2","MA3","MA4"])
 */
export function autoSelectTargetIds(rows: ReadonlyArray<CommSyncMngMainRow>, target: SyncTarget): string[] {
  return rows.filter((r) => matchTargetRow(r, target)).map((r) => r.targetid);
}

/** 처리유형별 행 매칭 — autoSelectRows / autoSelectTargetIds 공용 본체. */
function matchTargetRow(row: CommSyncMngMainRow, target: SyncTarget): boolean {
  const prefix = row.targetid.slice(0, 2);
  switch (target) {
    case "MASTER":
      return prefix === "MA";
    case "RULE":
      return prefix === "RA";
    case "RULE_JUDGE":
      return prefix === "RB";
    case "INTERFACE":
    case "FORMAT":
      return prefix === "NU";
    case "OBJECT":
      return prefix === "NU" && row.to2 === "가동";
    default:
      return false;
  }
}
