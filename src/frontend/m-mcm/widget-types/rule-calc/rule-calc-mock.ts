/**
 * 룰 계산기 목(mock) 서버 — B3(실제 API 연동) 전까지 api.ts 가 쓴다. B3 에서 이 파일을 걷는다.
 * 응답은 README §1 초안 모양(정규화 전 원본)을 돌려주고, api.ts 가 normalize 한다.
 *   - targetId 가 NONE 으로 시작하면 확정 버전 없음(NO_RELEASED).
 *   - 세트 SET: 도장부착량(M47C0007) 결과 → 코팅중량(M47C0006) 입력, 입력 칸에서는 앞 룰 결과로 채워지는 변수를 뺀다.
 *   - 그 밖의 룰: 입력 두 칸(두께·폭)과 출력 한 칸(결과 = 두께 × 폭, 소수 3자리).
 */
import {
  normalizeIo,
  normalizeRun,
  normalizeSearch,
  type RuleCalcIo,
  type RuleCalcRun,
  type RuleCalcSearchRow,
  type RuleCalcTargetTp,
} from "./rule-calc-model";

const MOCK_DELAY_MS = 120;

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

function rawIo(targetTp: RuleCalcTargetTp, targetId: string, preview: boolean): unknown {
  const verStatus = preview ? "DRAFT" : "RELEASED";
  if (targetTp === "SET") {
    return {
      ok: true,
      target: { tp: "SET", id: targetId, name: "코팅중량 세트(목)", ver: "1.000", verStatus, status: "INUSE" },
      inputs: [
        { name: "COAT_AREA", label: "도장 면적", dataType: "NUMBER", scale: 2, unit: "M2", required: true },
        { name: "COAT_THK", label: "도막 두께", dataType: "NUMBER", scale: 1, unit: "UM", required: true },
        { name: "MEMO", label: "비고", dataType: "STRING", scale: null, unit: "", required: false },
      ],
      outputs: [{ name: "COAT_WT", label: "코팅중량", dataType: "NUMBER", scale: 3, unit: "KG" }],
      messages: [],
      steps: [
        { ruleId: "M47C0007", name: "도장부착량", outputs: [{ name: "COAT_ADH", label: "도장부착량", dataType: "NUMBER", scale: 3, unit: "" }] },
        { ruleId: "M47C0006", name: "코팅중량", outputs: [{ name: "COAT_WT", label: "코팅중량", dataType: "NUMBER", scale: 3, unit: "" }] },
      ],
    };
  }
  return {
    ok: true,
    target: { tp: "RULE", id: targetId, name: "목 룰", ver: "1.000", verStatus, status: "INUSE" },
    inputs: [
      { name: "THK", label: "두께", dataType: "NUMBER", scale: 3, unit: "MM", required: true },
      { name: "WIDTH", label: "폭", dataType: "NUMBER", scale: 1, unit: "MM", required: true },
    ],
    outputs: [{ name: "WEIGHT", label: "결과", dataType: "NUMBER", scale: 3, unit: "KG" }],
    steps: [],
    messages: [],
  };
}

const NO_RELEASED = (id: string) => id.toUpperCase().startsWith("NONE");

export async function mockRuleCalcIo(targetTp: RuleCalcTargetTp, targetId: string, preview: boolean): Promise<RuleCalcIo> {
  await wait();
  if (NO_RELEASED(targetId) && !preview) {
    return normalizeIo({
      ok: false,
      target: { tp: targetTp, id: targetId, name: "", ver: null, verStatus: null, status: null },
      inputs: [],
      outputs: [],
      steps: [],
      messages: [{ code: "NO_RELEASED", text: "확정 버전 없음" }],
    });
  }
  return normalizeIo(rawIo(targetTp, targetId, preview));
}

export async function mockRuleCalcRun(
  targetTp: RuleCalcTargetTp,
  targetId: string,
  values: Readonly<Record<string, string>>
): Promise<RuleCalcRun> {
  await wait();
  if (NO_RELEASED(targetId)) {
    return normalizeRun({ ok: false, result: {}, steps: [], messages: [{ code: "NO_RELEASED", text: "확정 버전 없음" }] });
  }
  const num = (k: string) => Number(values[k] ?? "0");
  if (targetTp === "SET") {
    const adh = num("COAT_AREA") * num("COAT_THK") * 0.0012;
    const wt = adh * 1.05;
    return normalizeRun({
      ok: true,
      result: { COAT_WT: wt.toFixed(3) },
      steps: [
        { ruleId: "M47C0007", inputs: { COAT_AREA: values.COAT_AREA ?? "", COAT_THK: values.COAT_THK ?? "" }, outputs: { COAT_ADH: adh.toFixed(3) }, hit: true, defaultApplied: false },
        { ruleId: "M47C0006", inputs: { COAT_ADH: adh.toFixed(3) }, outputs: { COAT_WT: wt.toFixed(3) }, hit: true, defaultApplied: false },
      ],
      messages: [],
    });
  }
  return normalizeRun({ ok: true, result: { WEIGHT: (num("THK") * num("WIDTH")).toFixed(3) }, steps: [], messages: [] });
}

const MOCK_TARGETS = [
  { tp: "RULE", id: "M47C0001", name: "원판 중량", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0005", name: "도금중량", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0007", name: "도장부착량", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0014", name: "이론 길이", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0025", name: "외경", ver: "1.000", verStatus: "DRAFT" },
  { tp: "SET", id: "M47_COAT_WT", name: "코팅중량 세트", ver: "1.000", verStatus: "RELEASED" },
];

export async function mockRuleCalcSearch(targetTp: RuleCalcTargetTp | "ALL", keyword: string, limit: number): Promise<RuleCalcSearchRow[]> {
  await wait();
  const kw = keyword.trim().toLowerCase();
  return normalizeSearch({
    rows: MOCK_TARGETS.filter((t) => (targetTp === "ALL" || t.tp === targetTp) && (kw === "" || `${t.id} ${t.name}`.toLowerCase().includes(kw))).slice(0, limit),
  });
}
