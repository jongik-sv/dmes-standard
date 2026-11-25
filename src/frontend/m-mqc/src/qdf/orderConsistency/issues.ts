/**
 * 주문정합성 검토 이슈 15건 — mes-to-be order_consistency_seed.json(content_hash ae3e6d926dab)의 issues 를 그대로 옮긴 읽기 전용 검토 자료.
 * 두 원본(C10B2220 order · C10B2221 cross)을 병합하며 남긴 상충·확인필요·데이터 결함이다. 상태 처리·룰 전환은 하지 않는다 — 결정은 Maru 룰 수정으로 반영한다.
 * 조건 모양은 시제품 그대로(field·op·values, BETWEEN 은 low·high·경계 포함 여부)이고, 화면은 issueCond 로 셀 조건으로 바꿔 문장을 만든다.
 */

export type IssueType = "conflict" | "needsReview" | "dataDefect";

export interface IssueCond {
  field: string;
  op: string;
  values?: string[];
  low?: string;
  high?: string;
  lowInclusive?: boolean;
  highInclusive?: boolean;
}

export interface IssueSide {
  source?: string;
  row?: number;
  errCode?: string;
  message?: string;
  enabled?: boolean;
  conds: IssueCond[];
}

export interface ReviewIssue {
  id: string;
  type: IssueType;
  title: string;
  body: string;
  resolution?: string;
  /** 관련 룰 키(R-nnn). */
  ruleKeys: string[];
  /** 상충: 왼쪽 order(정본 채택), 오른쪽 cross(계보 보존). */
  left?: IssueSide;
  right?: IssueSide;
  /** 확인필요: order 현재값 ↔ cross 대안값(없으면 null). */
  orderValue?: IssueSide;
  crossAlternative?: IssueSide | null;
}

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  conflict: "상충",
  needsReview: "확인필요",
  dataDefect: "데이터 결함",
};

export const REVIEW_ISSUES: ReviewIssue[] = [
  {
    id: "I-C1",
    type: "conflict",
    title: "에러코드 상충: A89(cross) vs A893(order) — 이행용 용도코드",
    body: "조건이 완전히 동일한데 에러코드가 다르다. order가 누락(A89)과 사용불가(A893)를 분리한 세분화로 판단해 order 코드를 채택했고, 구코드는 legacy_codes로 보존했다.",
    resolution: "order 채택으로 해소됨 (R-010, legacy_codes:[A89])",
    ruleKeys: ["R-010"],
    left: {
      source: "order",
      row: 10,
      errCode: "A893",
      message: "이행용 용도코드(사용불가)",
      conds: [
        {
          field: "ORD_USG_CD",
          op: "IN",
          values: [
            "AZZ000",
            "BZZ000",
            "CZZ000",
            "DZZ000",
            "EZZ000",
            "FZZ000",
            "GZZ000",
            "HZZ000",
            "IZZ000",
            "JZZ000",
            "KZZ000",
          ],
        },
      ],
    },
    right: {
      source: "cross",
      row: 8,
      errCode: "A89",
      message: "이행용 용도코드(사용불가)",
      conds: [
        {
          field: "ORD_USG_CD",
          op: "IN",
          values: [
            "AZZ000",
            "BZZ000",
            "CZZ000",
            "DZZ000",
            "EZZ000",
            "FZZ000",
            "GZZ000",
            "HZZ000",
            "IZZ000",
            "JZZ000",
            "KZZ000",
          ],
        },
      ],
    },
  },
  {
    id: "I-C2",
    type: "conflict",
    title:
      "코드·메시지 상충: order#77 A72 'CCGI Spangle 선택 오류' vs cross#69 A722 '컬러원판 EXTRA SMOOTH ONLY'",
    body: "같은 조건(값 1,3,6·품명 3,6)에 코드도 메시지도 다르다. cross#69는 order#81(A722, 품명 3,6,9)의 부분집합이라 order#81의 계보로 흡수했고, order#77(A72)은 별도 유지했다. 품명 3,6에서 두 룰의 동시발화는 설계에 내재된 다중 결함 안내다(상충 아님).",
    resolution:
      "cross#69 → R-081 흡수, R-077 별도 유지, 둘 다 co_fire_pair 플래그",
    ruleKeys: ["R-077", "R-081"],
    left: {
      source: "order",
      row: 77,
      errCode: "A72",
      message: "CCGI Spangle 선택 오류",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["3", "6"],
        },
        {
          field: "ORD_SPNL_TP",
          op: "IN",
          values: ["1", "3", "6"],
        },
      ],
    },
    right: {
      source: "cross",
      row: 69,
      errCode: "A722",
      message: "컬러원판 EXTRA SMOOTH ONLY",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["3", "6"],
        },
        {
          field: "ORD_SPNL_TP",
          op: "IN",
          values: ["1", "3", "6"],
        },
      ],
    },
  },
  {
    id: "I-C3",
    type: "conflict",
    title:
      "정책 재설계 상충: cross#85 A451 일반 상한(>8000) vs order A451~A460 두께·수요가별 세분 가족",
    body: "cross는 '컬러 코일형 최대단중 준수'를 품명 1~6·제품형태 C에 대해 단중상한 8000 초과 일괄 금지 1룰로 걸었다. order는 같은 코드 A451을 두께·폭·보호필름·최종수요가별 세분 가족(A451~A460, 임계 5000~16000, 총 12룰)으로 재설계했다. 두 기준을 union하면 신정책이 허용한 주문을 구정책이 기각한다 — 검증 반례: 품명 2·두께 1.2·단중상한 12000 주문은 order A452(>16000)로는 통과지만 cross 구룰(>8000)로는 기각. 따라서 cross#85는 룰로 탑재하지 않는다. 다만 order 세분 가족에 8000 일반 상한 구간이 실제로 누락됐는지(예: 0.9T 컬러 코일 12톤 주문)는 현업 확인 대상이므로 구기준 조건 전문을 여기 보존한다.",
    resolution:
      "order 가족 채택 · cross#85 룰 미탑재(union 금지). 계보는 R-098 lineage + 본 이슈에 보존",
    ruleKeys: [
      "R-098",
      "R-099",
      "R-127",
      "R-128",
      "R-129",
      "R-130",
      "R-131",
      "R-132",
      "R-133",
      "R-134",
      "R-135",
      "R-136",
    ],
    left: {
      source: "order",
      row: 98,
      errCode: "A451",
      message:
        "0.4T 이하, 1000폭 이상, 보호필름 부착 컬러제품, 단중 제한(MAX 5톤), 사유:좌굴",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["1", "2", "3", "4", "6", "7", "8", "9"],
        },
        {
          field: "ORD_PTT_FLM_CD",
          op: "NOT_NULL",
        },
        {
          field: "ORD_EXC_THK",
          op: "LE",
          values: ["0.4"],
        },
        {
          field: "ORD_EXC_WTH",
          op: "GE",
          values: ["1000"],
        },
        {
          field: "ORD_PAK_UNT_WGT_ULV",
          op: "GT",
          values: ["5000"],
        },
      ],
    },
    right: {
      source: "cross",
      row: 85,
      errCode: "A451",
      message: "컬러 코일형 최대단중 준수",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["1", "2", "3", "4", "5", "6"],
        },
        {
          field: "PRD_SHP",
          op: "EQ",
          values: ["C"],
        },
        {
          field: "ORD_PAK_UNT_WGT_ULV",
          op: "GT",
          values: ["8000"],
        },
      ],
    },
  },
  {
    id: "I-R1",
    type: "needsReview",
    title: "A441 최소단중 임계값: order 1kg vs cross 2000kg",
    body: "order 기준으로는 하한 1kg — 2톤 하한 검증이 사실상 무력화된 상태. 의도된 완화(소단중 허용)인지 오입력(1000/2000 탈자)인지 원천 확인 필수. 단위 kg은 order#135의 12500(=12.5톤)으로 확정.",
    ruleKeys: ["R-095"],
    orderValue: {
      enabled: true,
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["C", "D", "E", "G", "K", "L", "V", "W"],
        },
        {
          field: "PRD_SHP",
          op: "EQ",
          values: ["C"],
        },
        {
          field: "ORD_PAK_UNT_WGT_LLV",
          op: "LT",
          values: ["1"],
        },
      ],
    },
    crossAlternative: {
      source: "cross",
      row: 82,
      errCode: "A441",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["C", "D", "E", "G", "L"],
        },
        {
          field: "PRD_SHP",
          op: "EQ",
          values: ["C"],
        },
        {
          field: "ORD_PAK_UNT_WGT_LLV",
          op: "LT",
          values: ["2000"],
        },
      ],
    },
  },
  {
    id: "I-R2",
    type: "needsReview",
    title: "A71 조도코드 필수 품명: order는 7 제외 vs cross는 7 포함",
    body: "품명 7이 order에선 '선택', cross에선 '필수'로 정면 모순. order#74 불필요 NOT_IN에는 7이 남아 있어 order 내부만 보면 '선택으로 완화'라는 일관 해석 가능 — 확인 전까지 모순 상태.",
    ruleKeys: ["R-073"],
    orderValue: {
      enabled: true,
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["1", "A", "B", "C", "D"],
        },
        {
          field: "ORD_ROU_CD",
          op: "IS_NULL",
        },
      ],
    },
    crossAlternative: {
      source: "cross",
      row: 61,
      errCode: "A71",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["1", "7", "A", "B", "C", "D"],
        },
        {
          field: "ORD_ROU_CD",
          op: "IS_NULL",
        },
      ],
    },
  },
  {
    id: "I-R3",
    type: "needsReview",
    title: "A732 EMBOSS 불필요 품명: order A,B,D vs cross A,B,C,D",
    body: "cross에만 품명 C 포함. order의 의도적 축소인지 편집 누락인지 확인 필요.",
    ruleKeys: ["R-084"],
    orderValue: {
      enabled: true,
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["A", "B", "D"],
        },
        {
          field: "EMBS_CD",
          op: "NOT_NULL",
        },
      ],
    },
    crossAlternative: {
      source: "cross",
      row: 72,
      errCode: "A732",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["A", "B", "C", "D"],
        },
        {
          field: "EMBS_CD",
          op: "NOT_NULL",
        },
      ],
    },
  },
  {
    id: "I-R4",
    type: "needsReview",
    title:
      "A671 보호필름폭 불필요 품명: order A,B,C,D vs cross A,B,C,D,E,G,L,J",
    body: "cross가 E,G,L,J 4종 더 넓다. 방향이 '축소'인 드리프트로 자동 채택하지 않음.",
    ruleKeys: ["R-088"],
    orderValue: {
      enabled: true,
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["A", "B", "C", "D"],
        },
        {
          field: "ORD_PTT_FLM_WTH",
          op: "GT",
          values: ["0"],
        },
      ],
    },
    crossAlternative: {
      source: "cross",
      row: 76,
      errCode: "A671",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["A", "B", "C", "D", "E", "G", "J", "L"],
        },
        {
          field: "ORD_PTT_FLM_WTH",
          op: "GT",
          values: ["0"],
        },
      ],
    },
  },
  {
    id: "I-R5",
    type: "needsReview",
    title:
      "A72 GI Spangle 금지값: order {6}(품명 G,K,V) vs cross {1,6}(품명 G)",
    body: "검사 값 집합 자체가 다른 유일한 Spangle 쌍. 값 '1'이 order에서는 허용, cross에서는 에러.",
    ruleKeys: ["R-075"],
    orderValue: {
      enabled: true,
      conds: [
        {
          field: "PRD_NM_CD",
          op: "IN",
          values: ["G", "K", "V"],
        },
        {
          field: "ORD_SPNL_TP",
          op: "EQ",
          values: ["6"],
        },
      ],
    },
    crossAlternative: {
      source: "cross",
      row: 63,
      errCode: "A72",
      conds: [
        {
          field: "PRD_NM_CD",
          op: "EQ",
          values: ["G"],
        },
        {
          field: "ORD_SPNL_TP",
          op: "IN",
          values: ["1", "6"],
        },
      ],
    },
  },
  {
    id: "I-R6",
    type: "needsReview",
    title: "A321 주문Sheet매수 불필요(cross 고유) — 기본 비활성",
    body: "order에는 대응 룰도 항목코드도 없음. 탑재 시 폐지된 제약 부활 위험, 미탑재 시 이관 누락 가능성(경미). 위험 비대칭상 기본 비활성으로 탑재하고 판단은 현업 몫.",
    ruleKeys: ["R-C50"],
    orderValue: {
      enabled: false,
      conds: [
        {
          field: "PRD_SHP",
          op: "EQ",
          values: ["C"],
        },
        {
          field: "ORD_SHT_CNT",
          op: "GT",
          values: ["0"],
        },
      ],
    },
    crossAlternative: null,
  },
  {
    id: "I-D1",
    type: "dataDefect",
    title: "조합폭 누락 체크의 NULL 구멍",
    body: "order#103~112는 조합폭N '= 0'일 때만 누락 판정하고 IS_NULL 변형이 없다. 값이 미입력(NULL)이면 누락이 통과된다. 단중·중량 계열(A44/A45/A51/A27/A69)은 =0과 IS_NULL 두 룰을 모두 두는 관례를 지켰는데 조합폭만 누락. cross#98(조합폭10 IS_NULL)만 예외적으로 존재해 R-C98로 탑재했다. 엔진 보정 없이 결함으로만 노출(룰 발명 금지).",
    ruleKeys: [
      "R-103",
      "R-104",
      "R-105",
      "R-106",
      "R-107",
      "R-108",
      "R-109",
      "R-110",
      "R-111",
      "R-112",
      "R-C98",
    ],
  },
  {
    id: "I-D2",
    type: "dataDefect",
    title: "A454 3룰이 동일 코드·동일 메시지에 임계값만 다름",
    body: "폭 [800,1101) 2.2톤 / [1101,1301) 2.4톤 / [1301,1601) 2.6톤인데 메시지가 셋 다 같아 에러를 받은 사용자가 자기 한도를 알 수 없다. 폭 <800, >=1601 구간은 체크 자체가 없다(의도 여부 확인 필요).",
    ruleKeys: ["R-132", "R-133", "R-134"],
  },
  {
    id: "I-D3",
    type: "dataDefect",
    title: "메시지 잘림 의심 2건 (끝 콤마)",
    body: "order#135/#136 메시지가 콤마로 끝난다('…Max 12.5톤,' / '…Max 8.5톤,'). 뒷부분 잘림 의심 — 원문은 lineage.raw_message에 보존, truncated_message 플래그 부착.",
    ruleKeys: ["R-135", "R-136"],
  },
  {
    id: "I-D4",
    type: "dataDefect",
    title: "의미론적 포함(그림자) 룰 2쌍 — 동시발화 안내",
    body: "병합 후 실재 2쌍: order#77[A72] ⊆ order#81[A722] / order#115[A664] ⊆ order#87[A663]. (cross#65 ⊆ cross#69는 같은 쌍의 병합 전 cross 측 계보 — 별도 쌍이 아니다.) 좁은 룰이 발화하는 모든 주문에서 넓은 룰도 발화한다 — 모순이 아니라 다중 결함이며, first-match 엔진이면 한쪽이 영구 은폐된다(전수 평가 채택 근거).",
    ruleKeys: ["R-077", "R-081", "R-087", "R-115"],
  },
  {
    id: "I-D6",
    type: "dataDefect",
    title: "컬러 단중상한 A45x 두께 밴드 공백 4구간",
    body: "두께 밴드 상한이 0.449 / 0.599 / 0.799 / 0.999로 인코딩되어 (0.449,0.45) (0.599,0.6) (0.799,0.8) (0.999,1.0) 구간의 두께는 어느 상한 룰에도 걸리지 않는다 — 단중 상한 검사가 조용히 빠지는 무주지. 폭 밴드([800,1101) 등)는 무겹침 완전 분할이 맞지만 두께 밴드는 아니다. 냉연 두께는 통상 소수 3자리라 실발생 확률은 낮으나, 원본 값 보정(0.449→0.45 미만)은 업무 확인이 필요해 룰을 고치지 않고 결함으로만 등재한다.",
    ruleKeys: ["R-098", "R-099", "R-128", "R-129", "R-130", "R-131"],
  },
  {
    id: "I-D5",
    type: "dataDefect",
    title: "에러코드 네이밍 충돌: A46 vs A460 (+A894 결번)",
    body: "A46(제품형태 누락)과 A460(A45 단중 가족의 연속 번호)이 별개 코드로 공존 — 접두사 기반 그룹핑(A46*)을 하면 남의 코드가 섞인다. A89 계열은 A891,A892,A893,A895로 A894 결번.",
    ruleKeys: ["R-004", "R-136"],
  },
];
