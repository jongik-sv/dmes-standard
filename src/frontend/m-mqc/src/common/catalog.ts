/**
 * Maru(MDM) 기준데이터 계약 — 품질설계 시연 화면이 쓰는 룰·코드의 이름, 열 라벨, 단위, 화면별 목록.
 * MDM 정의에는 변수 라벨이 실리지 않으므로 화면은 라벨을 여기서 읽는다. 정본 지침: docs/mqc/demo/README.md §4.
 * 값은 scripts/mqc-demo/mdm/ 의 등록 묶음과 같아야 한다.
 */

export interface VarMeta {
  /** Maru 변수명(영문 대문자와 _) */
  name: string;
  label: string;
  unit?: string;
  desc?: string;
}

export interface RuleMeta {
  /** Maru 룰 ID */
  ruleId: string;
  /** 화면 표시 이름 */
  title: string;
  /** 레거시 업무기준 ID(C10B…) */
  legacyIds?: string[];
  /** 화면 안 묶음 키(공정 등) */
  group?: string;
  groupLabel?: string;
  hitPolicy: "FIRST" | "COLLECT";
  /** 조건 변수(순서 = 열 순서) */
  conds: VarMeta[];
  /** 결과 변수 */
  results: VarMeta[];
  note?: string;
}

export interface CodeMeta {
  codeId: string;
  title: string;
  /** attr01..attr10 의 뜻(앞에서부터) */
  attrNames?: string[];
  /** lvl1..lvl5 의 뜻(앞에서부터) */
  lvlNames?: string[];
  desc?: string;
}

export const RULES: Record<string, RuleMeta> = {
  C10B1074: {
    ruleId: "C10B1074",
    title: "PLTCM폭수축량",
    legacyIds: ["C10B1074"],
    group: "PLTCM",
    groupLabel: "PLTCM",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "RAW_MAT_CD",
        label: "원자재코드",
        desc: '레거시 조건 이름 "원자재코드"',
      },
      {
        name: "THK",
        label: "PLTCM 출측두께",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM두께범위"',
      },
      {
        name: "WID",
        label: "PLTCM 폭",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM폭범위"',
      },
    ],
    results: [
      {
        name: "WID_SHRINK_QTY",
        label: "폭감소량",
        unit: "mm",
        desc: "진입 폭 − 폭감소량 = 출측 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2012-06-12 19:04:25. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 폭감소량 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B1075: {
    ruleId: "C10B1075",
    title: "CGL폭감소량",
    legacyIds: ["C10B1075"],
    group: "CGL",
    groupLabel: "CGL(냉연도금)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PROC_CD",
        label: "공정(라인)코드",
        desc: '레거시 조건 이름 "공정"',
      },
      {
        name: "PRD_NM_CD",
        label: "품명코드",
        desc: '레거시 조건 이름 "품명코드"',
      },
      {
        name: "MAT_CD",
        label: "재질코드",
        desc: '레거시 조건 이름 "재질코드"',
      },
      {
        name: "RAW_MAT_CD",
        label: "원자재코드",
        desc: '레거시 조건 이름 "원자재코드"',
      },
      {
        name: "THK",
        label: "압연SET 두께",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM두께범위"',
      },
      {
        name: "WID",
        label: "CGL 적용 폭",
        unit: "mm",
        desc: '레거시 조건 이름 "제품폭범위"',
      },
    ],
    results: [
      {
        name: "WID_SHRINK_QTY",
        label: "폭감소량",
        unit: "mm",
        desc: "진입 폭 − 폭감소량 = 출측 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2012-06-12 19:04:36. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 폭감소량 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B1076: {
    ruleId: "C10B1076",
    title: "EGL폭감소량",
    legacyIds: ["C10B1076"],
    group: "EGL",
    groupLabel: "EGL(전해도금)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PROC_CD",
        label: "공정(라인)코드",
        desc: '레거시 조건 이름 "공정"',
      },
      {
        name: "PRD_NM_CD",
        label: "품명코드",
        desc: '레거시 조건 이름 "품명"',
      },
      {
        name: "MAT_CD",
        label: "재질코드",
        desc: '레거시 조건 이름 "재질코드"',
      },
      {
        name: "RAW_MAT_CD",
        label: "원자재코드",
        desc: '레거시 조건 이름 "원자재코드"',
      },
      {
        name: "THK",
        label: "압연SET 두께",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM두께범위"',
      },
      {
        name: "WID",
        label: "EGL 적용 폭",
        unit: "mm",
        desc: '레거시 조건 이름 "제품폭범위"',
      },
    ],
    results: [
      {
        name: "WID_SHRINK_QTY",
        label: "폭감소량",
        unit: "mm",
        desc: "진입 폭 − 폭감소량 = 출측 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2012-06-12 19:04:39. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 폭감소량 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B1077: {
    ruleId: "C10B1077",
    title: "정전폭감소량",
    legacyIds: ["C10B1077"],
    group: "JZ",
    groupLabel: "정전(정전처리)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PRD_NM_CD",
        label: "품명코드",
        desc: '레거시 조건 이름 "품명코드"',
      },
      {
        name: "MAT_CD",
        label: "재질코드",
        desc: '레거시 조건 이름 "재질코드"',
      },
      {
        name: "THK",
        label: "압연SET 두께",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM두께범위"',
      },
      {
        name: "WID",
        label: "주문 폭",
        unit: "mm",
        desc: '레거시 조건 이름 "제품폭범위"',
      },
    ],
    results: [
      {
        name: "WID_SHRINK_QTY",
        label: "폭감소량",
        unit: "mm",
        desc: "진입 폭 − 폭감소량 = 출측 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2012-06-12 19:04:41. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 폭감소량 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B1078: {
    ruleId: "C10B1078",
    title: "CCL폭감소량",
    legacyIds: ["C10B1078"],
    group: "CCL",
    groupLabel: "CCL(칼라코팅)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PRD_NM_CD",
        label: "품명코드",
        desc: '레거시 조건 이름 "품명코드"',
      },
      {
        name: "MAT_CD",
        label: "재질코드",
        desc: '레거시 조건 이름 "재질코드"',
      },
      {
        name: "THK",
        label: "압연SET 두께",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM두께범위"',
      },
      {
        name: "WID",
        label: "주문 폭",
        unit: "mm",
        desc: '레거시 조건 이름 "제품폭범위"',
      },
    ],
    results: [
      {
        name: "WID_SHRINK_QTY",
        label: "폭감소량",
        unit: "mm",
        desc: "진입 폭 − 폭감소량 = 출측 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2012-06-12 19:04:42. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 폭감소량 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B1073: {
    ruleId: "C10B1073",
    title: "PLTCM폭마진량",
    legacyIds: ["C10B1073"],
    group: "PLTCM",
    groupLabel: "PLTCM",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "RAW_MAT_CD",
        label: "원자재코드",
        desc: '레거시 조건 이름 "원자재코드"',
      },
      {
        name: "RAW_THK",
        label: "원자재두께",
        unit: "mm",
        desc: '레거시 조건 이름 "원자재두께범위"',
      },
      {
        name: "WID",
        label: "PLTCM 출측폭",
        unit: "mm",
        desc: '레거시 조건 이름 "PLTCM출측폭범위"',
      },
      {
        name: "CUS_CD",
        label: "고객사",
        desc: '레거시 조건 이름 "고객사"',
      },
    ],
    results: [
      {
        name: "WID_MARGIN_QTY",
        label: "마진폭",
        unit: "mm",
        desc: "주문 폭 − 마진폭 = 제품 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2012-03-19 15:21:02. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 마진폭 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B1079: {
    ruleId: "C10B1079",
    title: "정전폭마진량",
    legacyIds: ["C10B1079"],
    group: "JZ",
    groupLabel: "정전(정전처리)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "ORD_EDG_ASG_TP",
        label: "주문Edge지정구분",
        desc: '레거시 조건 이름 "주문Edge지정구분"',
      },
      {
        name: "PRD_NM_CD",
        label: "품명코드",
        desc: '레거시 조건 이름 "품명코드"',
      },
      {
        name: "PRD_SHP",
        label: "제품형태",
        desc: '레거시 조건 이름 "제품형태"',
      },
      {
        name: "COAT_WAY_CD",
        label: "코팅방식",
        desc: '레거시 조건 이름 "코팅방식"',
      },
      {
        name: "RESIN_TP",
        label: "수지타입",
        desc: '레거시 조건 이름 "수지타입"',
      },
      {
        name: "THK",
        label: "두께",
        unit: "mm",
        desc: '레거시 조건 이름 "두께범위"',
      },
      {
        name: "CCL_BOM_NO",
        label: "CCL BOM번호",
        desc: '레거시 조건 이름 "CCLBOM번호"',
      },
      {
        name: "ORD_SPNL_TP",
        label: "주문Spangle구분",
        desc: '레거시 조건 이름 "주문Spangle구분"',
      },
    ],
    results: [
      {
        name: "WID_MARGIN_QTY",
        label: "마진폭",
        unit: "mm",
        desc: "주문 폭 − 마진폭 = 제품 폭",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(WR-·WM-)",
      },
      {
        name: "PRIO",
        label: "우선순위",
        desc: "작을수록 먼저 평가(행 순서에 이미 반영)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "레거시 순번(no). 0 = 예외",
      },
      {
        name: "SRC_NOTE",
        label: "원본 주의",
        desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)",
      },
    ],
    note: '1.000 적용 2015-09-03 14:07:14. 행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 마진폭 0 으로 본다. 빈 문자 결과는 "-" 로 저장했다.',
  },
  C10B2060: {
    ruleId: "C10B2060",
    title: "압연두께Set치보정기준",
    legacyIds: ["C10B2060"],
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PRD_NM_CD",
        label: "품명코드",
      },
      {
        name: "SPEC_ORG_CD",
        label: "규격기관",
      },
      {
        name: "SPC_AVR",
        label: "규격약호",
      },
      {
        name: "ORD_USG_CD",
        label: "주문용도",
      },
      {
        name: "CUS_CD",
        label: "고객사",
      },
      {
        name: "ORD_THK_TP",
        label: "주문두께구분",
      },
      {
        name: "ORD_THK_MNG_CD",
        label: "두께관리코드",
      },
      {
        name: "GW_ASG_CD",
        label: "도금량코드",
      },
      {
        name: "THK",
        label: "주문두께",
        unit: "mm",
      },
      {
        name: "WID",
        label: "주문폭",
        unit: "mm",
      },
    ],
    results: [
      {
        name: "THK_ADJ",
        label: "두께보정치",
        unit: "mm",
        desc: "Set 두께 = 주문두께 + 보정치(음수 = 얇게)",
      },
      {
        name: "THK_COR_UNT",
        label: "두께보정단위",
        desc: "코드 QC_THK_COR_UNT(현재 모두 CRN)",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "프로토타입 룰 ID(TS-nnn)",
      },
    ],
    note: '1.000 적용 2012-05-11 12:48:58. 행 순서 = 레거시 순번. 첫 적중 적용, 없으면 보정 0 (Set 두께 = 주문두께). 빈 문자 결과는 "-" 로 저장했다.',
  },
  QD_PROCESS_ROUTING: {
    ruleId: "QD_PROCESS_ROUTING",
    title: "공정라우팅(냉연도금공정)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PRD_NM_CD",
        label: "제품군",
      },
      {
        name: "MAT_CD",
        label: "재질코드",
      },
      {
        name: "EMBS_CD",
        label: "엠보스무늬",
      },
      {
        name: "ORD_SPNL_TP",
        label: "Spangle구분",
      },
      {
        name: "GW_ASG_CD",
        label: "도금량코드",
      },
      {
        name: "ORD_SUR_HND_CD",
        label: "표면처리코드",
      },
      {
        name: "THK",
        label: "주문두께",
        unit: "mm",
      },
      {
        name: "WID",
        label: "주문폭",
        unit: "mm",
      },
    ],
    results: [
      {
        name: "ROUTE_CD",
        label: "냉연도금공정",
        desc: "1P(PLTCM) → 83(CGL) → AX(CCL) 처럼 통과 공정을 잇는 코드",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
      },
    ],
    note: '1.000 적용 2026-11-01 00:00:00. 제품군은 체크 안 함으로 둘 수 없다. 첫 적중 적용. 빈 문자 결과는 "-" 로 저장했다.',
  },
  QD_RAW_MATERIAL_GRADE: {
    ruleId: "QD_RAW_MATERIAL_GRADE",
    title: "원자재강종(원판연계)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "PRD_NM_CD",
        label: "품명코드",
      },
      {
        name: "SPC_AVR",
        label: "규격약호",
      },
      {
        name: "ORD_USG_CD",
        label: "주문용도코드",
      },
      {
        name: "THK",
        label: "두께",
        unit: "mm",
      },
    ],
    results: [
      {
        name: "MAT_CD",
        label: "재질코드",
      },
      {
        name: "RAW_MAT_PRI",
        label: "적정원료",
      },
      {
        name: "RAW_MAT_ALT",
        label: "차선원료",
        desc: "쉼표 목록, 우선순위 순",
      },
      {
        name: "RAW_GRADE_MSG",
        label: "원자재강종 메시지",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "RM-nnn",
      },
      {
        name: "RULE_KIND",
        label: "기준유형",
        desc: "BASE 도금기준 · DERIVED 칼라파생 · STANDALONE 칼라전용(QC_RULE_KIND)",
      },
      {
        name: "BASE_RULE_KEY",
        label: "원판 룰 ID",
        desc: "DERIVED 일 때 상속받은 도금기준 룰",
      },
      {
        name: "INHERIT_NOTE",
        label: "출처",
        desc: "원판 상속 여부(재질·적정원료·차선원료)",
      },
      {
        name: "LEGACY_TYPE",
        label: "유형",
        desc: "1A0 일반 · 1B1 연관판단(QC_LEGACY_RULE_TYPE)",
      },
      {
        name: "LEGACY_NO",
        label: "순번",
        desc: "0 = 예외(먼저 평가)",
      },
    ],
    note: '1.000 적용 2026-11-01 00:00:00. 행 순서 = 순번(0 예외 먼저) → ID. 파생(DERIVED) 행의 재질·적정원료·차선원료는 원판 값을 풀어 넣었다(BASE_RULE_KEY 로 원판을 가리킨다). 사용중(Y)만 실었다 — 제외: RM-005(상태 F: 차선원료 고객사양 확인 필요 (AS-IS: "고객사양으로??")). v1.001: RM-006 두께범위 0.2≤t<2.2 → 0.2≤t<2.5(프로토타입 변경 이력), RM-007 재검토 필요. 개정 1.001(적용 2026-11-20 09:00:00): RM-006 두께범위 상한 2.2 → 2.5(박서연). 빈 문자 결과는 "-" 로 저장했다.',
  },
  QD_SPEC_THK_STD: {
    ruleId: "QD_SPEC_THK_STD",
    title: "두께관리기준(규격코드 → BMT/TCT)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "SPEC_ORG_CD",
        label: "규격코드",
      },
    ],
    results: [
      {
        name: "THK_STD_CD",
        label: "두께관리기준",
        desc: "BMT 소지철 두께 · TCT 도금 포함 두께(QC_THK_STD)",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
      },
    ],
    note: '1.000 적용 2026-11-01 00:00:00. 사용중(Y)만 실었다 — 제외: TK-006 BIS(상태 F, 두께관리기준 미확정 — AS-IS "??"). v1.001: TK-004 EN 두께관리기준 BMT → TCT(프로토타입 변경 이력, 박서연). 개정 1.001(적용 2026-11-20 09:00:00): TK-004 EN 두께관리기준 BMT → TCT(박서연). 빈 문자 결과는 "-" 로 저장했다.',
  },
  QD_SPEC_BASE_GRADE: {
    ruleId: "QD_SPEC_BASE_GRADE",
    title: "원판강종 매핑(규격코드 + 강종코드 → 원판강종)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "SPEC_ORG_CD",
        label: "규격코드",
      },
      {
        name: "STL_GRD_CD",
        label: "강종코드",
      },
    ],
    results: [
      {
        name: "BASE_STL_GRD_CD",
        label: "원판강종코드",
      },
      {
        name: "RULE_KEY",
        label: "룰 ID",
      },
    ],
    note: '1.000 적용 2026-11-01 00:00:00. 첫 적중 적용. 빈 문자 결과는 "-" 로 저장했다.',
  },
  QD_ORDER_WEIGHT_ERROR: {
    ruleId: "QD_ORDER_WEIGHT_ERROR",
    title: "주문단중에러 기준(단중 × 분할)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "ORD_UNT_WGT",
        label: "주문단중",
        unit: "MT",
      },
      {
        name: "SPLIT_CNT",
        label: "분할 수",
        unit: "개",
      },
    ],
    results: [
      {
        name: "SPLIT_UNT_WGT",
        label: "분할 단중",
        unit: "MT/개",
        desc: "주문단중 ÷ 분할 수(소수 둘째 자리 반올림), 수정값이 있으면 수정값",
      },
      {
        name: "IN_RANGE_YN",
        label: "허용범위",
        desc: "Y = 허용 단중 4~5 MT/개 안(생산 가능) · N = 범위 밖. 범위는 코드 QC_ORD_WGT_LIMIT",
      },
    ],
    note: '1.000 적용 2026-11-01 00:00:00. 행 369개 = 단중 41단 × 분할 9열. 허용 단중 범위(Min 4·Max 5)는 코드 QC_ORD_WGT_LIMIT. v1.000 = 계산값, v1.001 = 수정값 2셀(단중 24.0 × 6분할 4.00 → 4.05, 단중 30.0 × 7분할 4.29 → 4.30). 개정 1.001(적용 2026-11-20 09:00:00): 셀 수정 단중 24.0 × 6분할 4.00 → 4.05, 단중 30.0 × 7분할 4.29 → 4.30. 빈 문자 결과는 "-" 로 저장했다.',
  },
  QD_FEAS_2CGL_GI: {
    ruleId: "QD_FEAS_2CGL_GI",
    title: "B.D 생산범위(2CGL GI)",
    group: "2cgl-gi",
    groupLabel: "B.D 생산범위(2CGL GI)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "MAT_GRP_CD",
        label: "재질 그룹",
        desc: "코드 QC_FEAS_MATL_GRP(시트-G순번)",
      },
      {
        name: "WID",
        label: "폭",
        unit: "mm",
        desc: "행 머리 값 이상 ~ 윗행 값 미만. 맨 위 행은 그 값만",
      },
      {
        name: "THK",
        label: "두께(Full Hard)",
        unit: "mm",
        desc: "열 머리 값 이상 ~ 다음 열 값 미만. 마지막 열은 그 값만",
      },
    ],
    results: [
      {
        name: "FEAS_STAT",
        label: "생산가부",
        desc: "- 생산불가 · P 생산가능 · C 조건부 생산 · X 생산불가(검증 완료) — QC_FEAS_STATE",
      },
    ],
    note: "1.000 적용 2025-03-31 00:00:00. 시트 머리(제목·안내·후처리 표)는 코드 QC_FEAS_SHEET, 재질 그룹은 QC_FEAS_MATL_GRP. 주석 영역(overlay) 칸은 행을 두지 않아 '해당 없음'이다. 범위 밖 폭·두께도 '해당 없음'. 빈 문자 결과는 \"-\" 로 저장했다.",
  },
  QD_FEAS_2CGL_GL: {
    ruleId: "QD_FEAS_2CGL_GL",
    title: "B.D 생산범위(2CGL GL)",
    group: "2cgl-gl",
    groupLabel: "B.D 생산범위(2CGL GL)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "MAT_GRP_CD",
        label: "재질 그룹",
        desc: "코드 QC_FEAS_MATL_GRP(시트-G순번)",
      },
      {
        name: "WID",
        label: "폭",
        unit: "mm",
        desc: "행 머리 값 이상 ~ 윗행 값 미만. 맨 위 행은 그 값만",
      },
      {
        name: "THK",
        label: "두께(Full Hard)",
        unit: "mm",
        desc: "열 머리 값 이상 ~ 다음 열 값 미만. 마지막 열은 그 값만",
      },
    ],
    results: [
      {
        name: "FEAS_STAT",
        label: "생산가부",
        desc: "- 생산불가 · P 생산가능 · C 조건부 생산 · X 생산불가(검증 완료) — QC_FEAS_STATE",
      },
    ],
    note: "1.000 적용 2025-03-31 00:00:00. 시트 머리(제목·안내·후처리 표)는 코드 QC_FEAS_SHEET, 재질 그룹은 QC_FEAS_MATL_GRP. 주석 영역(overlay) 칸은 행을 두지 않아 '해당 없음'이다. 범위 밖 폭·두께도 '해당 없음'. 빈 문자 결과는 \"-\" 로 저장했다.",
  },
  QD_FEAS_3CGL: {
    ruleId: "QD_FEAS_3CGL",
    title: "B.D 생산범위(3CGL GI.GIX)",
    group: "3cgl",
    groupLabel: "B.D 생산범위(3CGL GI.GIX)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "MAT_GRP_CD",
        label: "재질 그룹",
        desc: "코드 QC_FEAS_MATL_GRP(시트-G순번)",
      },
      {
        name: "WID",
        label: "폭",
        unit: "mm",
        desc: "행 머리 값 이상 ~ 윗행 값 미만. 맨 위 행은 그 값만",
      },
      {
        name: "THK",
        label: "두께(Full Hard)",
        unit: "mm",
        desc: "열 머리 값 이상 ~ 다음 열 값 미만. 마지막 열은 그 값만",
      },
    ],
    results: [
      {
        name: "FEAS_STAT",
        label: "생산가부",
        desc: "- 생산불가 · P 생산가능 · C 조건부 생산 · X 생산불가(검증 완료) — QC_FEAS_STATE",
      },
    ],
    note: "1.000 적용 2025-03-31 00:00:00. 시트 머리(제목·안내·후처리 표)는 코드 QC_FEAS_SHEET, 재질 그룹은 QC_FEAS_MATL_GRP. 주석 영역(overlay) 칸은 행을 두지 않아 '해당 없음'이다. 범위 밖 폭·두께도 '해당 없음'. 빈 문자 결과는 \"-\" 로 저장했다.",
  },
  QD_FEAS_4CGL: {
    ruleId: "QD_FEAS_4CGL",
    title: "B.D 생산범위(4CGL GL.GLX)",
    group: "4cgl",
    groupLabel: "B.D 생산범위(4CGL GL.GLX)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "MAT_GRP_CD",
        label: "재질 그룹",
        desc: "코드 QC_FEAS_MATL_GRP(시트-G순번)",
      },
      {
        name: "WID",
        label: "폭",
        unit: "mm",
        desc: "행 머리 값 이상 ~ 윗행 값 미만. 맨 위 행은 그 값만",
      },
      {
        name: "THK",
        label: "두께(Full Hard)",
        unit: "mm",
        desc: "열 머리 값 이상 ~ 다음 열 값 미만. 마지막 열은 그 값만",
      },
    ],
    results: [
      {
        name: "FEAS_STAT",
        label: "생산가부",
        desc: "- 생산불가 · P 생산가능 · C 조건부 생산 · X 생산불가(검증 완료) — QC_FEAS_STATE",
      },
    ],
    note: "1.000 적용 2025-03-31 00:00:00. 시트 머리(제목·안내·후처리 표)는 코드 QC_FEAS_SHEET, 재질 그룹은 QC_FEAS_MATL_GRP. 주석 영역(overlay) 칸은 행을 두지 않아 '해당 없음'이다. 범위 밖 폭·두께도 '해당 없음'. 빈 문자 결과는 \"-\" 로 저장했다.",
  },
  QD_FEAS_5CGL: {
    ruleId: "QD_FEAS_5CGL",
    title: "B.D 생산범위(5CGL GI.GL)",
    group: "5cgl",
    groupLabel: "B.D 생산범위(5CGL GI.GL)",
    hitPolicy: "FIRST",
    conds: [
      {
        name: "MAT_GRP_CD",
        label: "재질 그룹",
        desc: "코드 QC_FEAS_MATL_GRP(시트-G순번)",
      },
      {
        name: "WID",
        label: "폭",
        unit: "mm",
        desc: "행 머리 값 이상 ~ 윗행 값 미만. 맨 위 행은 그 값만",
      },
      {
        name: "THK",
        label: "두께(Full Hard)",
        unit: "mm",
        desc: "열 머리 값 이상 ~ 다음 열 값 미만. 마지막 열은 그 값만",
      },
    ],
    results: [
      {
        name: "FEAS_STAT",
        label: "생산가부",
        desc: "- 생산불가 · P 생산가능 · C 조건부 생산 · X 생산불가(검증 완료) — QC_FEAS_STATE",
      },
    ],
    note: "1.000 적용 2025-03-31 00:00:00. 시트 머리(제목·안내·후처리 표)는 코드 QC_FEAS_SHEET, 재질 그룹은 QC_FEAS_MATL_GRP. 주석 영역(overlay) 칸은 행을 두지 않아 '해당 없음'이다. 범위 밖 폭·두께도 '해당 없음'. 빈 문자 결과는 \"-\" 로 저장했다.",
  },
  QD_ORDER_CHECK: {
    ruleId: "QD_ORDER_CHECK",
    title: "주문정합성체크(통합)",
    legacyIds: ["C10B2220", "C10B2221"],
    hitPolicy: "COLLECT",
    conds: [
      {
        name: "ACT_CUS_CD",
        label: "수요가코드",
        desc: "code · EAV",
      },
      {
        name: "CCL_BOM_NO",
        label: "CCL_BOM번호",
        desc: "string · EAV",
      },
      {
        name: "CUS_CD",
        label: "고객사코드",
        desc: "code · EAV",
      },
      {
        name: "EMBS_CD",
        label: "EMBOSS무늬",
        desc: "code · EAV|column",
      },
      {
        name: "FLOW_CHL",
        label: "유통경로",
        desc: "string · EAV",
      },
      {
        name: "FNL_CUS_CD",
        label: "최종수요가코드",
        desc: "code · EAV|column",
      },
      {
        name: "GW_ASG_CD",
        label: "도금량지정코드",
        desc: "code · EAV",
      },
      {
        name: "NAT_CD",
        label: "국가코드",
        desc: "code · EAV",
      },
      {
        name: "ORD_COILG_MTH",
        label: "주문권취방법",
        desc: "code · EAV",
      },
      {
        name: "ORD_COIL_IDIA",
        label: "주문코일내경",
        desc: "number · EAV",
      },
      {
        name: "ORD_COIL_ODIA",
        label: "주문코일외경",
        desc: "number · EAV",
      },
      {
        name: "ORD_EDG_ASG_TP",
        label: "주문Edge지정구분",
        desc: "code · EAV|column",
      },
      {
        name: "ORD_EXC_LTH",
        label: "주문환산길이",
        desc: "number · EAV",
      },
      {
        name: "ORD_EXC_THK",
        label: "주문환산두께",
        unit: "mm",
        desc: "number · EAV|column",
      },
      {
        name: "ORD_EXC_WTH",
        label: "주문환산폭",
        unit: "mm",
        desc: "number · EAV|column",
      },
      {
        name: "ORD_KND",
        label: "주문종류",
        desc: "code · EAV",
      },
      {
        name: "ORD_LN_WGT",
        label: "주문행번중량",
        desc: "number · EAV",
      },
      {
        name: "ORD_LTH_MNG_CD",
        label: "주문길이관리코드",
        desc: "code · EAV",
      },
      {
        name: "ORD_MIX_WTH1",
        label: "조합폭1",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH10",
        label: "조합폭10",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH2",
        label: "조합폭2",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH3",
        label: "조합폭3",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH4",
        label: "조합폭4",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH5",
        label: "조합폭5",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH6",
        label: "조합폭6",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH7",
        label: "조합폭7",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH8",
        label: "조합폭8",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_MIX_WTH9",
        label: "조합폭9",
        unit: "mm",
        desc: "number · EAV",
      },
      {
        name: "ORD_ORG_PLT_SPC_AVR",
        label: "원판규격약호",
        desc: "string · EAV",
      },
      {
        name: "ORD_PAK_LTH_LLV",
        label: "주문포장길이하한",
        desc: "number · EAV",
      },
      {
        name: "ORD_PAK_LTH_ULV",
        label: "주문포장길이상한",
        desc: "number · EAV",
      },
      {
        name: "ORD_PAK_MTH",
        label: "주문포장방법",
        desc: "code · EAV",
      },
      {
        name: "ORD_PAK_SHT_CNT",
        label: "주문포장Sheet매수값",
        desc: "number · EAV",
      },
      {
        name: "ORD_PAK_UNT_WGT_LLV",
        label: "주문포장단중하한값",
        unit: "kg",
        desc: "number · EAV",
      },
      {
        name: "ORD_PAK_UNT_WGT_ULV",
        label: "주문포장단중상한값",
        unit: "kg",
        desc: "number · EAV",
      },
      {
        name: "ORD_PTT_FLM_ADH_LOC_CD",
        label: "보호필름부착위치",
        desc: "code · EAV",
      },
      {
        name: "ORD_PTT_FLM_CD",
        label: "주문보호필름상세코드",
        desc: "code · EAV|column",
      },
      {
        name: "ORD_PTT_FLM_WTH",
        label: "보호필름폭",
        desc: "number · EAV",
      },
      {
        name: "ORD_REQ_LN",
        label: "주문요청행번",
        desc: "string · EAV",
      },
      {
        name: "ORD_REQ_NO",
        label: "주문요청번호",
        desc: "string · EAV",
      },
      {
        name: "ORD_RGS_PRS_ID",
        label: "주문등록자",
        desc: "string · EAV",
      },
      {
        name: "ORD_ROU_CD",
        label: "주문조도코드",
        desc: "code · EAV",
      },
      {
        name: "ORD_SHT_CNT",
        label: "주문Sheet매수값",
        desc: "number · EAV",
      },
      {
        name: "ORD_SHT_LOD_MTH",
        label: "주문Sheet적재방법",
        desc: "code · EAV",
      },
      {
        name: "ORD_SKP_DEG",
        label: "주문조질도",
        desc: "string · EAV",
      },
      {
        name: "ORD_SLIT_GRP_CNT",
        label: "주문Slit조수",
        desc: "number · EAV|column",
      },
      {
        name: "ORD_SLV_KND_TP",
        label: "주문내경링종류구분",
        desc: "code · EAV|column",
      },
      {
        name: "ORD_SPNL_TP",
        label: "주문Spangle구분",
        desc: "code · EAV",
      },
      {
        name: "ORD_STDP_CNT_LLV",
        label: "주문정포장매수하한값",
        desc: "number · EAV",
      },
      {
        name: "ORD_STDP_CNT_ULV",
        label: "주문정포장매수상한값",
        desc: "number · EAV",
      },
      {
        name: "ORD_SUR_HND_CD",
        label: "주문표면처리코드",
        desc: "code · EAV|column",
      },
      {
        name: "ORD_SZ",
        label: "주문생칫수",
        desc: "string · EAV",
      },
      {
        name: "ORD_TEM_CD",
        label: "영업팀코드",
        desc: "code · EAV",
      },
      {
        name: "ORD_THK_MNG_CD",
        label: "주문두께관리코드",
        desc: "code · EAV|column",
      },
      {
        name: "ORD_THK_TP",
        label: "주문두께구분",
        desc: "code · EAV",
      },
      {
        name: "ORD_UNT_WGT",
        label: "Sheet 단위 중량",
        desc: "number · EAV",
      },
      {
        name: "ORD_USG_CD",
        label: "주문용도코드",
        desc: "code · EAV|column",
      },
      {
        name: "ORD_WGT_UNT",
        label: "주문중량단위",
        desc: "string · EAV",
      },
      {
        name: "ORD_WTH_MNG_CD",
        label: "주문폭관리코드",
        desc: "code · EAV|column",
      },
      {
        name: "PAK_MSG_CD",
        label: "포장메세지코드",
        desc: "code · column",
      },
      {
        name: "PRD_NM_CD",
        label: "품명코드",
        desc: "code · EAV|column",
      },
      {
        name: "PRD_SHP",
        label: "제품형태",
        desc: "code · EAV|column",
      },
      {
        name: "RSN_TP_FRN",
        label: "RSN_TP_FRN",
        desc: "string · EAV",
      },
      {
        name: "SPC_AVR",
        label: "규격약호",
        desc: "string · EAV",
      },
      {
        name: "SPC_YR",
        label: "규격년도",
        desc: "string · EAV",
      },
      {
        name: "WGT_DCS_MTH_TP",
        label: "중량결정법구분",
        desc: "code · EAV",
      },
    ],
    results: [
      {
        name: "RULE_KEY",
        label: "룰 ID",
        desc: "R-nnn(공통·order) · R-Cnnn(cross)",
      },
      {
        name: "ERR_CD",
        label: "에러코드",
      },
      {
        name: "ERR_MSG",
        label: "에러 메시지",
      },
      {
        name: "ERR_CATEGORY",
        label: "분류",
        desc: "누락 · 사용불가 · 불필요 · 한도위반 · 선택오류(QC_OC_ERR_CATEGORY)",
      },
      {
        name: "SEVERITY",
        label: "심각도",
        desc: "error · warn",
      },
      {
        name: "WARN_CAND_YN",
        label: "경고 후보",
        desc: "Y = 메시지에 협의·문의·확인이 있어 경고 후보",
      },
      {
        name: "OWNER_DEPT",
        label: "담당 부서",
        desc: "없으면 미지정",
      },
      {
        name: "ACTOR",
        label: "조치 주체",
        desc: "등록자 · 시스템 · 현업담당 · 미지정(QC_OC_ACTOR)",
      },
      {
        name: "TARGET_ITEM",
        label: "대상 항목",
        desc: "에러가 가리키는 주문 항목 코드",
      },
      {
        name: "RULE_SOURCE",
        label: "출처",
        desc: "공통 · order(C10B2220) · cross(C10B2221)",
      },
    ],
    note: '1.000 적용 2026-11-01 00:00:00. 조건이 모두 맞으면 에러 발생(전 룰 평가·전수 수집, COLLECT LIST). 결과 열은 적중 행 순서의 목록이다. 비활성 룰은 싣지 않았다 — R-C50(A321 주문Sheet매수값 불필요). 같은 항목 조건 두 개를 하나로 합침: R-115 ORD_PTT_FLM_CD(NOT_NULL ⊂ EQ). 입력의 빈칸은 NULL(키는 두고 값 null)이어야 IS_NULL 이 맞는다. 빈 문자 결과는 "-" 로 저장했다.',
  },
};

export const CODES: Record<string, CodeMeta> = {
  QC_PRODUCT_TYPE: {
    codeId: "QC_PRODUCT_TYPE",
    title: "제품유형",
    desc: "마스터코드 PRODUCT_TYPE 제품유형.",
  },
  QC_QUALITY_STATUS: {
    codeId: "QC_QUALITY_STATUS",
    title: "품질판정상태",
    desc: "마스터코드 QUALITY_STATUS 품질판정상태. 품질판정 상태 HOLD(보류) 추가.",
  },
  QC_USE_YN: {
    codeId: "QC_USE_YN",
    title: "사용여부",
    desc: "마스터코드 USE_YN 사용여부.",
  },
  QC_ORD_THK_MNG_CD: {
    codeId: "QC_ORD_THK_MNG_CD",
    title: "주문두께관리코드",
    attrNames: ["카테고리 ID", "카테고리명"],
    desc: "마스터코드 ORD_THK_MNG_CD 주문두께관리코드. AS-IS 마스타코드 이관 — 등록 2011-11-22 MASTDATA, 시작 2011-11-22.",
  },
  QC_THK_COR_UNT: {
    codeId: "QC_THK_COR_UNT",
    title: "두께보정기준단위",
    attrNames: ["카테고리 ID", "카테고리명"],
    desc: "마스터코드 THK_COR_UNT 두께보정기준단위. AS-IS 마스타코드 이관 — 등록 2012-04-26 MASTDATA, 시작 2012-04-26.",
  },
  QC_PRD_NM_CD: {
    codeId: "QC_PRD_NM_CD",
    title: "품명코드",
    attrNames: ["카테고리 ID", "카테고리명"],
    desc: "마스터코드 PRD_NM_CD 품명코드. AS-IS 마스타코드 이관 — 등록 2011-11-25 MASTDATA, 시작 2011-11-25.",
  },
  QC_SPEC_STATUS: {
    codeId: "QC_SPEC_STATUS",
    title: "품질사양 상태",
    desc: "품질사양 관리 화면 상태",
  },
  QC_DESIGN_STATUS: {
    codeId: "QC_DESIGN_STATUS",
    title: "품질설계 상태",
    attrNames: ["AS-IS 코드"],
    desc: "품질설계결과 설계상태. AS-IS 표기 A : 확정, B : 설계중",
  },
  QC_JUDGE_ITEM_RESULT: {
    codeId: "QC_JUDGE_ITEM_RESULT",
    title: "검사항목 판정",
    desc: "품질판정 검사 항목 결과",
  },
  QC_QCERT_STATUS: {
    codeId: "QC_QCERT_STATUS",
    title: "품질보증서 상태",
    desc: "품질보증서관리 상태",
  },
  QC_MTC_STATUS: {
    codeId: "QC_MTC_STATUS",
    title: "검사증명서 상태",
    desc: "검사증명서(MTC) 상태",
  },
  QC_TAG_STATUS: {
    codeId: "QC_TAG_STATUS",
    title: "Tag 상태",
    desc: "Tag관리 상태",
  },
  QC_TAG_KIND: {
    codeId: "QC_TAG_KIND",
    title: "Tag 종류",
    desc: "Tag 종류",
  },
  QC_IF_DIR: {
    codeId: "QC_IF_DIR",
    title: "인터페이스 방향",
    desc: "품질사양 전송 이력 방향",
  },
  QC_IF_RESULT: {
    codeId: "QC_IF_RESULT",
    title: "인터페이스 결과",
    desc: "전송 결과",
  },
  QC_FEAS_STATE: {
    codeId: "QC_FEAS_STATE",
    title: "생산가부 상태",
    attrNames: ["표시 색"],
    desc: "B.D 생산범위 시트 칸 상태",
  },
  QC_SIM_CASE_STATUS: {
    codeId: "QC_SIM_CASE_STATUS",
    title: "시뮬레이션 케이스 상태",
    desc: "시뮬레이션 회귀 케이스 결과",
  },
  QC_CUSTOMER: {
    codeId: "QC_CUSTOMER",
    title: "고객사(가명)",
    attrNames: ["거래구분", "참조 화면"],
    desc: "시연용 고객사 마스터. 실명 대신 수요가 A… 가명을 쓴다. 코드는 프로토타입 시드에 나온 거래처 번호",
  },
  QC_SPEC_CD: {
    codeId: "QC_SPEC_CD",
    title: "규격약호",
    attrNames: ["규격기관", "품명코드", "강종", "규격명"],
    desc: "규격약호(규격기관 + 품명 + 강종). 품질설계·원자재강종·압연두께Set·판정·출력물 시드에 나온 값",
  },
  QC_MATL_CD: {
    codeId: "QC_MATL_CD",
    title: "재질코드",
    attrNames: ["재질 그룹(생산범위)", "열연 원자재"],
    desc: "재질코드(Material Code). 이름은 품질설계 시드의 강종명, 없으면 생산범위 시트의 재질 그룹명",
  },
  QC_RAW_MATL_CD: {
    codeId: "QC_RAW_MATL_CD",
    title: "원자재코드",
    desc: "원자재(열연 강종) 코드. 이름은 품질설계 시드에 설명이 있는 것만, 나머지는 코드값",
  },
  QC_RULE_KIND: {
    codeId: "QC_RULE_KIND",
    title: "원자재강종 기준유형",
    desc: "원판연계 기준유형",
  },
  QC_LEGACY_RULE_TYPE: {
    codeId: "QC_LEGACY_RULE_TYPE",
    title: "업무기준 유형",
    desc: "레거시 GlueMaster 업무기준 유형",
  },
  QC_THK_STD: {
    codeId: "QC_THK_STD",
    title: "두께관리기준",
    desc: "규격약호 두께관리기준",
  },
  QC_SPEC_ORG: {
    codeId: "QC_SPEC_ORG",
    title: "규격기관",
    desc: "규격코드(규격기관). JS·AM 은 압연두께Set 룰의 2자 약호",
  },
  QC_GW_ASG_CD: {
    codeId: "QC_GW_ASG_CD",
    title: "도금량코드",
    attrNames: [
      "적용 품명",
      "하한(g/㎡)",
      "상한(g/㎡)",
      "목표(g/㎡)",
      "도금두께(㎛)",
    ],
    desc: "품명별 대표 도금량코드 — quality-design.html COAT_CD·COAT_RANGE",
  },
  QC_ORD_USG_CD: {
    codeId: "QC_ORD_USG_CD",
    title: "주문용도",
    attrNames: ["용도 상세"],
    desc: "주문용도 코드 — quality-design.html 주문 목록에 라벨이 있는 것만",
  },
  QC_LINE_PROC_CD: {
    codeId: "QC_LINE_PROC_CD",
    title: "공정(라인) 코드",
    attrNames: ["라인 구분", "사용 룰"],
    desc: "폭수축량 룰의 공정(라인) 코드. 원본에 라벨이 없어 코드값만 둔다",
  },
  QC_EDGE_TP: {
    codeId: "QC_EDGE_TP",
    title: "주문Edge지정구분",
    desc: "주문 Edge 지정 구분",
  },
  QC_PRD_SHP: {
    codeId: "QC_PRD_SHP",
    title: "제품형태",
    desc: "제품형태(주문 PRD_SHP)",
  },
  QC_COAT_WAY: {
    codeId: "QC_COAT_WAY",
    title: "코팅방식",
    desc: "정전 폭마진량 룰의 코팅방식. 원본에 라벨이 없어 코드값만 둔다",
  },
  QC_RESIN_TP: {
    codeId: "QC_RESIN_TP",
    title: "수지타입",
    desc: "정전 폭마진량 룰의 수지타입. 원본에 라벨이 없어 코드값만 둔다",
  },
  QC_ORD_WGT_LIMIT: {
    codeId: "QC_ORD_WGT_LIMIT",
    title: "주문단중 허용범위",
    attrNames: ["값", "단위"],
    desc: "주문단중에러 허용 단중 범위(MT/개) — order-weight-error.html 시드",
  },
  QC_FEAS_SHEET: {
    codeId: "QC_FEAS_SHEET",
    title: "생산범위 시트",
    attrNames: [
      "제목",
      "개정일",
      "제목 정정 메모",
      "안내(줄바꿈 구분)",
      "후처리 표(JSON)",
      "룰 ID",
    ],
    desc: "B.D 생산범위 시트 머리 — 제목·개정일·안내·후처리 표(JSON {heads, rows})",
  },
  QC_FEAS_MATL_GRP: {
    codeId: "QC_FEAS_MATL_GRP",
    title: "생산범위 재질 그룹",
    attrNames: [
      "재질코드(쉼표)",
      "재질코드 원문",
      "폭 축(위→아래)",
      "두께 축",
      "경고",
      "경고 상자",
      "주석 영역(JSON rows·cols·text·red)",
    ],
    lvlNames: ["시트"],
    desc: "시트별 재질 그룹. 코드 = 시트-G순번(룰 조건 MAT_GRP_CD 값)",
  },
  QC_OC_FIELD: {
    codeId: "QC_OC_FIELD",
    title: "주문정합성 항목",
    attrNames: [
      "타입(code·number·string)",
      "원본 표현(EAV·column)",
      "단위",
      "참조 룰 수",
      "라벨 메모",
    ],
    desc: "주문정합성 룰이 쓰는 주문 항목 코드 사전(order_consistency_seed.json fields)",
  },
  QC_OC_VALUE_LABEL: {
    codeId: "QC_OC_VALUE_LABEL",
    title: "주문정합성 값 라벨",
    attrNames: ["항목", "값", "근거 등급", "추론 근거"],
    lvlNames: ["항목"],
    desc: "에러 메시지에서 역추론한 값 라벨(추정). 코드 = 항목:값",
  },
  QC_OC_ERR_CATEGORY: {
    codeId: "QC_OC_ERR_CATEGORY",
    title: "주문정합성 에러 분류",
    desc: "정렬 순서 = 누락 < 사용불가 < 불필요 < 한도위반 < 선택오류",
  },
  QC_OC_ACTOR: {
    codeId: "QC_OC_ACTOR",
    title: "주문정합성 조치 주체",
    desc: "에러 조치 주체",
  },
  QC_COLOR_SUBMAT: {
    codeId: "QC_COLOR_SUBMAT",
    title: "칼라부재료",
    attrNames: [
      "구분",
      "수지계",
      "제조사",
      "색상코드",
      "색상명",
      "건조도막두께(㎛)",
      "광택(GU)",
      "PMT(℃)",
    ],
    desc: "칼라강판 도장 부재료(프라이머·상도·백코트·보호필름). 시연용으로 설계한 기준 — 제조사는 가명",
  },
  QC_COLOR_BOM: {
    codeId: "QC_COLOR_BOM",
    title: "칼라BOM",
    attrNames: [
      "BOM 이름",
      "적용 품명",
      "층",
      "부재료코드",
      "부재료명",
      "도막두께(㎛)",
      "색상명",
      "색상코드",
    ],
    lvlNames: ["BOM 번호"],
    desc: "칼라 도장 BOM — BOM 번호(계층 1) 아래 층별 부재료. 코드 = BOM번호-층코드(FP 전면 프라이머·FT 전면 상도·BC 후면 백코트·PF 보호필름)",
  },
};

/** 화면 objectId → 룰 ID 목록(표시 순서) */
export const SCREEN_RULES: Record<string, string[]> = {
  lineWidthShrinkage: [
    "C10B1074",
    "C10B1075",
    "C10B1076",
    "C10B1077",
    "C10B1078",
  ],
  lineWidthMargin: ["C10B1073", "C10B1079"],
  rollingThicknessSet: ["C10B2060"],
  processRouting: ["QD_PROCESS_ROUTING"],
  rawMaterialGrade: ["QD_RAW_MATERIAL_GRADE"],
  specCode: ["QD_SPEC_THK_STD", "QD_SPEC_BASE_GRADE"],
  orderWeightError: ["QD_ORDER_WEIGHT_ERROR"],
  productionFeasibility: [
    "QD_FEAS_2CGL_GI",
    "QD_FEAS_2CGL_GL",
    "QD_FEAS_3CGL",
    "QD_FEAS_4CGL",
    "QD_FEAS_5CGL",
  ],
  orderConsistency: ["QD_ORDER_CHECK"],
  designSimulation: [
    "QD_ORDER_CHECK",
    "QD_ORDER_WEIGHT_ERROR",
    "QD_FEAS_2CGL_GI",
    "QD_FEAS_2CGL_GL",
    "QD_FEAS_3CGL",
    "QD_FEAS_4CGL",
    "QD_FEAS_5CGL",
    "QD_RAW_MATERIAL_GRADE",
    "QD_SPEC_THK_STD",
    "QD_SPEC_BASE_GRADE",
    "C10B2060",
    "QD_PROCESS_ROUTING",
    "C10B1074",
    "C10B1075",
    "C10B1076",
    "C10B1077",
    "C10B1078",
    "C10B1073",
    "C10B1079",
  ],
  qualityDesignResult: [
    "QD_RAW_MATERIAL_GRADE",
    "QD_SPEC_THK_STD",
    "QD_SPEC_BASE_GRADE",
    "C10B2060",
    "QD_PROCESS_ROUTING",
    "C10B1074",
    "C10B1075",
    "C10B1076",
    "C10B1077",
    "C10B1078",
    "C10B1073",
    "C10B1079",
  ],
};

/** 화면 objectId → 코드 ID 목록 */
export const SCREEN_CODES: Record<string, string[]> = {
  lineWidthShrinkage: [
    "QC_LINE_PROC_CD",
    "QC_PRD_NM_CD",
    "QC_MATL_CD",
    "QC_RAW_MATL_CD",
    "QC_LEGACY_RULE_TYPE",
  ],
  lineWidthMargin: [
    "QC_PRD_NM_CD",
    "QC_RAW_MATL_CD",
    "QC_CUSTOMER",
    "QC_EDGE_TP",
    "QC_PRD_SHP",
    "QC_COAT_WAY",
    "QC_RESIN_TP",
    "QC_COLOR_BOM",
    "QC_LEGACY_RULE_TYPE",
  ],
  rollingThicknessSet: [
    "QC_THK_COR_UNT",
    "QC_ORD_THK_MNG_CD",
    "QC_PRD_NM_CD",
    "QC_SPEC_ORG",
    "QC_SPEC_CD",
    "QC_ORD_USG_CD",
    "QC_GW_ASG_CD",
    "QC_CUSTOMER",
    "QC_LEGACY_RULE_TYPE",
  ],
  processRouting: ["QC_PRD_NM_CD", "QC_MATL_CD", "QC_GW_ASG_CD"],
  rawMaterialGrade: [
    "QC_RULE_KIND",
    "QC_LEGACY_RULE_TYPE",
    "QC_PRD_NM_CD",
    "QC_SPEC_CD",
    "QC_MATL_CD",
    "QC_RAW_MATL_CD",
    "QC_ORD_USG_CD",
  ],
  specCode: ["QC_THK_STD", "QC_SPEC_ORG", "QC_SPEC_CD"],
  orderWeightError: ["QC_ORD_WGT_LIMIT"],
  productionFeasibility: [
    "QC_FEAS_SHEET",
    "QC_FEAS_MATL_GRP",
    "QC_FEAS_STATE",
    "QC_MATL_CD",
  ],
  orderConsistency: [
    "QC_OC_FIELD",
    "QC_OC_VALUE_LABEL",
    "QC_OC_ERR_CATEGORY",
    "QC_OC_ACTOR",
    "QC_PRD_NM_CD",
    "QC_PRD_SHP",
    "QC_CUSTOMER",
  ],
  masterCode: [
    "QC_PRODUCT_TYPE",
    "QC_QUALITY_STATUS",
    "QC_USE_YN",
    "QC_ORD_THK_MNG_CD",
    "QC_THK_COR_UNT",
    "QC_PRD_NM_CD",
    "QC_SPEC_STATUS",
    "QC_DESIGN_STATUS",
    "QC_JUDGE_ITEM_RESULT",
    "QC_QCERT_STATUS",
    "QC_MTC_STATUS",
    "QC_TAG_STATUS",
    "QC_TAG_KIND",
    "QC_IF_DIR",
    "QC_IF_RESULT",
    "QC_FEAS_STATE",
    "QC_SIM_CASE_STATUS",
    "QC_CUSTOMER",
    "QC_SPEC_CD",
    "QC_MATL_CD",
    "QC_RAW_MATL_CD",
    "QC_RULE_KIND",
    "QC_LEGACY_RULE_TYPE",
    "QC_THK_STD",
    "QC_SPEC_ORG",
    "QC_GW_ASG_CD",
    "QC_ORD_USG_CD",
    "QC_LINE_PROC_CD",
    "QC_EDGE_TP",
    "QC_PRD_SHP",
    "QC_COAT_WAY",
    "QC_RESIN_TP",
    "QC_ORD_WGT_LIMIT",
    "QC_FEAS_SHEET",
    "QC_FEAS_MATL_GRP",
    "QC_OC_FIELD",
    "QC_OC_VALUE_LABEL",
    "QC_OC_ERR_CATEGORY",
    "QC_OC_ACTOR",
  ],
  colorSubmaterial: ["QC_COLOR_SUBMAT"],
  colorBom: ["QC_COLOR_BOM", "QC_COLOR_SUBMAT", "QC_PRD_NM_CD"],
  qualitySpec: [
    "QC_SPEC_STATUS",
    "QC_IF_DIR",
    "QC_IF_RESULT",
    "QC_CUSTOMER",
    "QC_PRD_NM_CD",
  ],
  qualityDesignResult: [
    "QC_DESIGN_STATUS",
    "QC_PRD_NM_CD",
    "QC_MATL_CD",
    "QC_SPEC_CD",
    "QC_ORD_USG_CD",
    "QC_GW_ASG_CD",
    "QC_CUSTOMER",
    "QC_COLOR_BOM",
    "QC_EDGE_TP",
  ],
  designSimulation: [
    "QC_SIM_CASE_STATUS",
    "QC_DESIGN_STATUS",
    "QC_PRD_NM_CD",
    "QC_CUSTOMER",
    "QC_FEAS_STATE",
    "QC_OC_FIELD",
  ],
  qualityJudgment: [
    "QC_QUALITY_STATUS",
    "QC_JUDGE_ITEM_RESULT",
    "QC_PRD_NM_CD",
    "QC_SPEC_CD",
  ],
};
