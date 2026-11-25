/**
 * 주문 시뮬레이션 프리셋 5건과 기본 주문 — mes-to-be order-consistency.html 의 SIM_BASE·OC_PRESETS 와 같은 값.
 * 기본 주문은 늘 발화하는 누락 룰을 모두 채운 코일형 정상 주문이다(코드값은 시연 입력값이고 라벨이 아니다).
 */
import type { OrderValues } from "./simulate";

/** 룰 참조가 많은 핵심 항목 12개 — 입력 칸 위쪽에 둔다. */
export const SIM_CORE_FIELDS = [
  "PRD_NM_CD",
  "PRD_SHP",
  "ORD_SPNL_TP",
  "ORD_SUR_HND_CD",
  "ORD_EDG_ASG_TP",
  "ORD_USG_CD",
  "ORD_EXC_THK",
  "ORD_EXC_WTH",
  "ORD_SLIT_GRP_CNT",
  "ORD_PAK_UNT_WGT_ULV",
  "ORD_PAK_UNT_WGT_LLV",
  "FNL_CUS_CD",
];

export const SIM_BASE: OrderValues = {
  ORD_REQ_NO: "OR2026-0001",
  ORD_REQ_LN: "10",
  PRD_NM_CD: "7",
  PRD_SHP: "C",
  FLOW_CHL: "D",
  ORD_KND: "1",
  ORD_USG_CD: "D10000",
  CUS_CD: "100001",
  ACT_CUS_CD: "200001",
  FNL_CUS_CD: "200001",
  SPC_AVR: "SGCC",
  SPC_YR: "2007",
  ORD_SZ: "0.8*1219*C",
  ORD_EXC_THK: "0.8",
  ORD_EXC_WTH: "1219",
  ORD_EDG_ASG_TP: "M",
  ORD_THK_TP: "T",
  WGT_DCS_MTH_TP: "A",
  ORD_WGT_UNT: "KG",
  ORD_LN_WGT: "25000",
  ORD_PAK_MTH: "P1",
  ORD_THK_MNG_CD: "A",
  ORD_WTH_MNG_CD: "F",
  NAT_CD: "KR",
  ORD_RGS_PRS_ID: "MOCK",
  ORD_TEM_CD: "T01",
  ORD_PAK_UNT_WGT_LLV: "5000",
  ORD_PAK_UNT_WGT_ULV: "8000",
  ORD_SLV_KND_TP: "P",
  ORD_COIL_IDIA: "508",
  ORD_COILG_MTH: "1",
  CCL_BOM_NO: "CB7-0001",
};

export interface SimPreset {
  key: string;
  name: string;
  hint: string;
  order: OrderValues;
  /** 기대 발화 룰 키(빈 목록 = 통과). 시험·안내용. */
  expect: string[];
}

const preset = (over: OrderValues): OrderValues => {
  const out: OrderValues = { ...SIM_BASE };
  for (const [k, v] of Object.entries(over)) {
    if (v === "") delete out[k];
    else out[k] = v;
  }
  return out;
};

const mixWidths: OrderValues = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [`ORD_MIX_WTH${i + 1}`, "100"]),
);

export const SIM_PRESETS: SimPreset[] = [
  {
    key: "p1",
    name: "① GI Spangle 오류",
    hint: '품명 G + Spangle 6 — R-075 A72 "GI Spangle 선택 오류" 1건 발화 예상',
    order: preset({
      PRD_NM_CD: "G",
      ORD_SPNL_TP: "6",
      GW_ASG_CD: "Z10",
      ORD_SUR_HND_CD: "CT",
      CCL_BOM_NO: "",
    }),
    expect: ["R-075"],
  },
  {
    key: "p2",
    name: "② 도금량 누락",
    hint: '품명 E + 도금량지정코드 빈칸 — R-068 A61 "도금량코드 누락" 1건 발화 예상',
    order: preset({ PRD_NM_CD: "E", ORD_SUR_HND_CD: "CT", CCL_BOM_NO: "" }),
    expect: ["R-068"],
  },
  {
    key: "p3",
    name: "③ 경계 1101mm",
    hint: "품명 5·두께 0.65·폭 1101·단중상한 2500 — 폭 1101 은 [1101, 1301) 구간이라 R-133 A454(2.4톤 초과)만 발화 예상. 1100.9 로 바꾸면 R-132(2.2톤 구간)로 옮겨 간다",
    order: preset({
      PRD_NM_CD: "5",
      ORD_EXC_THK: "0.65",
      ORD_EXC_WTH: "1101",
      ORD_PAK_UNT_WGT_ULV: "2500",
    }),
    expect: ["R-133"],
  },
  {
    key: "p4",
    name: "④ 정상 통과",
    hint: "필수 항목을 모두 채운 코일형 주문 — 에러 0건 통과 예상",
    order: preset({}),
    expect: [],
  },
  {
    key: "p5",
    name: "⑤ NULL vs 0 구분",
    hint: "Slit조수 10·조합폭10 빈칸 — IS_NULL 룰 R-C98(A92)만 발화하고 = 0 룰 R-112 는 미입력이라 평가하지 못한다. 조합폭10 에 0 을 넣으면 반대로 R-112 만 발화",
    order: preset({
      ...mixWidths,
      ORD_SLIT_GRP_CNT: "10",
      ORD_EDG_ASG_TP: "C",
    }),
    expect: ["R-C98"],
  },
];
