/**
 * 룰 계산기 편집기 검색의 목(mock) — rule-calc-api A3(ruleCalc/search)가 dev 에 들어오기 전까지 api.ts 가 쓴다.
 * A3 머지 뒤 이 파일을 지우고 api.ts 의 RULE_CALC_SEARCH_USE_MOCK 을 걷는다. view·execute 는 이미 실제 API 다.
 */
import { normalizeSearch, type RuleCalcSearchRow, type RuleCalcTargetTp } from "./rule-calc-model";

const MOCK_DELAY_MS = 120;

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

const MOCK_TARGETS = [
  { tp: "RULE", id: "M47C0001", name: "코일원판중량", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0005", name: "코일도금중량", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0007", name: "도장부착량", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0014", name: "코일길이", ver: "1.000", verStatus: "RELEASED" },
  { tp: "RULE", id: "M47C0025", name: "코일외경개선", ver: "1.000", verStatus: "RELEASED" },
  { tp: "SET", id: "M47_COAT_WT", name: "코팅중량 세트", ver: "1.000", verStatus: "RELEASED" },
];

export async function mockRuleCalcSearch(targetTp: RuleCalcTargetTp | "ALL", keyword: string, limit: number): Promise<RuleCalcSearchRow[]> {
  await wait();
  const kw = keyword.trim().toLowerCase();
  return normalizeSearch({
    rows: MOCK_TARGETS.filter((t) => (targetTp === "ALL" || t.tp === targetTp) && (kw === "" || `${t.id} ${t.name}`.toLowerCase().includes(kw))).slice(0, limit),
  });
}
