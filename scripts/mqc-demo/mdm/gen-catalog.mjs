#!/usr/bin/env node
// bundles/*.json → src/frontend/m-mqc/src/common/catalog.ts (값 부분만 다시 쓴다. 머리 주석·타입은 그대로).
// 사용: node scripts/mqc-demo/mdm/gen-catalog.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const TARGET = join(ROOT, "src/frontend/m-mqc/src/common/catalog.ts");

const dir = join(HERE, "bundles");
const codes = JSON.parse(readFileSync(join(dir, "codes.json"), "utf8")).codes;
const screens = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "codes.json").map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const RULE_ORDER = ["lineWidthShrinkage", "lineWidthMargin", "rollingThicknessSet", "processRouting", "rawMaterialGrade", "specCode", "orderWeightError", "productionFeasibility", "orderConsistency"];
screens.sort((a, b) => RULE_ORDER.indexOf(a.screen) - RULE_ORDER.indexOf(b.screen));
const ruleIds = (screen) => screens.find((s) => s.screen === screen).rules.map((r) => r.ruleId);

const SCREEN_RULES = Object.fromEntries(screens.map((s) => [s.screen, s.rules.map((r) => r.ruleId)]));
// 설계 흐름 화면 — 주문 검증(정합성 → 단중 → 생산가부) 뒤 설계 기준(원자재강종 → 규격약호 → 압연두께Set → 공정라우팅 → 폭수축량 → 폭마진량).
const designChain = [...ruleIds("rawMaterialGrade"), ...ruleIds("specCode"), ...ruleIds("rollingThicknessSet"), ...ruleIds("processRouting"), ...ruleIds("lineWidthShrinkage"), ...ruleIds("lineWidthMargin")];
SCREEN_RULES.designSimulation = [...ruleIds("orderConsistency"), ...ruleIds("orderWeightError"), ...ruleIds("productionFeasibility"), ...designChain];
SCREEN_RULES.qualityDesignResult = designChain;

const SCREEN_CODES = {
  lineWidthShrinkage: ["QC_LINE_PROC_CD", "QC_PRD_NM_CD", "QC_MATL_CD", "QC_RAW_MATL_CD", "QC_LEGACY_RULE_TYPE"],
  lineWidthMargin: ["QC_PRD_NM_CD", "QC_RAW_MATL_CD", "QC_CUSTOMER", "QC_EDGE_TP", "QC_PRD_SHP", "QC_COAT_WAY", "QC_RESIN_TP", "QC_COLOR_BOM", "QC_LEGACY_RULE_TYPE"],
  rollingThicknessSet: ["QC_THK_COR_UNT", "QC_ORD_THK_MNG_CD", "QC_PRD_NM_CD", "QC_SPEC_ORG", "QC_SPEC_CD", "QC_ORD_USG_CD", "QC_GW_ASG_CD", "QC_CUSTOMER", "QC_LEGACY_RULE_TYPE"],
  processRouting: ["QC_PRD_NM_CD", "QC_MATL_CD", "QC_GW_ASG_CD"],
  rawMaterialGrade: ["QC_RULE_KIND", "QC_LEGACY_RULE_TYPE", "QC_PRD_NM_CD", "QC_SPEC_CD", "QC_MATL_CD", "QC_RAW_MATL_CD", "QC_ORD_USG_CD"],
  specCode: ["QC_THK_STD", "QC_SPEC_ORG", "QC_SPEC_CD"],
  orderWeightError: ["QC_ORD_WGT_LIMIT"],
  productionFeasibility: ["QC_FEAS_SHEET", "QC_FEAS_MATL_GRP", "QC_FEAS_STATE", "QC_MATL_CD"],
  orderConsistency: ["QC_OC_FIELD", "QC_OC_VALUE_LABEL", "QC_OC_ERR_CATEGORY", "QC_OC_ACTOR", "QC_PRD_NM_CD", "QC_PRD_SHP", "QC_CUSTOMER"],
  masterCode: codes.filter((c) => !c.codeId.startsWith("QC_COLOR_")).map((c) => c.codeId),
  colorSubmaterial: ["QC_COLOR_SUBMAT"],
  colorBom: ["QC_COLOR_BOM", "QC_COLOR_SUBMAT", "QC_PRD_NM_CD"],
  qualitySpec: ["QC_SPEC_STATUS", "QC_IF_DIR", "QC_IF_RESULT", "QC_CUSTOMER", "QC_PRD_NM_CD"],
  qualityDesignResult: ["QC_DESIGN_STATUS", "QC_PRD_NM_CD", "QC_MATL_CD", "QC_SPEC_CD", "QC_ORD_USG_CD", "QC_GW_ASG_CD", "QC_CUSTOMER", "QC_COLOR_BOM", "QC_EDGE_TP"],
  designSimulation: ["QC_SIM_CASE_STATUS", "QC_DESIGN_STATUS", "QC_PRD_NM_CD", "QC_CUSTOMER", "QC_FEAS_STATE", "QC_OC_FIELD"],
  qualityJudgment: ["QC_QUALITY_STATUS", "QC_JUDGE_ITEM_RESULT", "QC_PRD_NM_CD", "QC_SPEC_CD"],
  qualityCertificate: ["QC_QCERT_STATUS", "QC_CUSTOMER", "QC_PRD_NM_CD"],
  inspectionCertificate: ["QC_MTC_STATUS", "QC_SPEC_CD"],
  tagManagement: ["QC_TAG_STATUS", "QC_TAG_KIND", "QC_PRD_NM_CD"],
};
const codeIds = new Set(codes.map((c) => c.codeId));
for (const [s, ids] of Object.entries(SCREEN_CODES)) for (const id of ids) if (!codeIds.has(id)) throw new Error(`${s}: 없는 코드 ${id}`);

const varMeta = (c) => ({ name: c.varName, label: c.label, ...(c.unit ? { unit: c.unit } : {}), ...(c.desc ? { desc: c.desc } : {}) });
const RULES = {};
for (const s of screens) for (const r of s.rules) {
  const revs = (r.revisions ?? []).map((v) => `${v.ver}(적용 ${v.applyFrom}): ${v.note}`);
  RULES[r.ruleId] = {
    ruleId: r.ruleId, title: r.title,
    ...(r.legacyIds ? { legacyIds: r.legacyIds } : {}),
    ...(r.group ? { group: r.group, groupLabel: r.groupLabel } : {}),
    hitPolicy: r.hitPolicy,
    conds: r.columns.filter((c) => c.varKind === "COND").map(varMeta),
    results: r.columns.filter((c) => c.varKind === "RESULT").map(varMeta),
    note: [`1.000 적용 ${r.applyFrom}.`, r.note, revs.length ? `개정 ${revs.join(" / ")}.` : "", "빈 문자 결과는 \"-\" 로 저장했다."].filter(Boolean).join(" "),
  };
}
const CODES = Object.fromEntries(codes.map((c) => [c.codeId, {
  codeId: c.codeId, title: c.name,
  ...(c.attrNames.length ? { attrNames: c.attrNames } : {}),
  ...(c.lvlNames.length ? { lvlNames: c.lvlNames } : {}),
  desc: c.description,
}]));

const src = readFileSync(TARGET, "utf8");
const cut = src.indexOf("export const RULES");
if (cut < 0) throw new Error("catalog.ts 에서 RULES 자리를 찾지 못했다");
const json = (v) => JSON.stringify(v, null, 2);
const body = `export const RULES: Record<string, RuleMeta> = ${json(RULES)};

export const CODES: Record<string, CodeMeta> = ${json(CODES)};

/** 화면 objectId → 룰 ID 목록(표시 순서) */
export const SCREEN_RULES: Record<string, string[]> = ${json(SCREEN_RULES)};

/** 화면 objectId → 코드 ID 목록 */
export const SCREEN_CODES: Record<string, string[]> = ${json(SCREEN_CODES)};
`;
writeFileSync(TARGET, src.slice(0, cut) + body);
console.log(`catalog.ts — 룰 ${Object.keys(RULES).length}, 코드 ${Object.keys(CODES).length}, 화면(룰) ${Object.keys(SCREEN_RULES).length}, 화면(코드) ${Object.keys(SCREEN_CODES).length}`);
