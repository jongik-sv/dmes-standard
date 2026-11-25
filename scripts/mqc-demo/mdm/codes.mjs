// 코드 묶음 — 프로토타입 마스터코드·상태 어휘·룰 범례 코드 + 직접 설계한 칼라부재료·칼라BOM.
// 고객사는 실명을 쓰지 않는다(수요가 A…). 라벨이 원본에 없는 코드는 이름을 코드값 그대로 둔다(추측 금지).
import { readModule, readBuildJson, literal } from "./lib/proto.mjs";

const SZ = { categoryId: "SZ0000", categoryName: "공통" };

function code(codeId, name, description, items, { attrNames = [], lvlNames = [], screens = [] } = {}) {
  return { codeId, name, description, lvlCnt: lvlNames.length, lvlNames, attrNames, screens, items: items.map((it, i) => ({ seq: i + 1, ...it })) };
}
const simple = (pairs) => pairs.map(([c, n, d]) => ({ code: c, name: n, ...(d ? { description: d } : {}) }));

// ── 마스터코드 화면(master-code.html) 6종 ────────────────────────────
function masterCodes() {
  const seed = literal(readModule("master-code.html"), "seed");
  const out = [];
  for (const m of seed) {
    const id = `QC_${m.id}`;
    const items = m.codes.map((c) => ({ code: c.code, name: c.decode, attrs: c.categoryId ? [c.categoryId, c.categoryName] : [] }));
    if (m.id === "QUALITY_STATUS") items.push({ code: "HOLD", name: "보류", attrs: [] });
    const hasCate = m.codes.some((c) => c.categoryId);
    const asis = m.registeredDate ? ` AS-IS 마스타코드 이관 — 등록 ${m.registeredDate} ${m.registrantName}, 시작 ${m.startDate}.` : "";
    out.push(code(id, m.name, `마스터코드 ${m.id} ${m.name}.${asis}${m.id === "QUALITY_STATUS" ? " 품질판정 상태 HOLD(보류) 추가." : ""}`, items,
      { attrNames: hasCate ? ["카테고리 ID", "카테고리명"] : [], screens: ["masterCode"] }));
  }
  return out;
}

// ── 상태 어휘(inventory-B §11.2) ─────────────────────────────────────
function statusCodes() {
  return [
    code("QC_SPEC_STATUS", "품질사양 상태", "품질사양 관리 화면 상태", simple([["DRAFT", "작성중"], ["CONF", "확정"], ["SENT", "전송완료"], ["SEND_FAIL", "전송실패"]]), { screens: ["qualitySpec"] }),
    code("QC_DESIGN_STATUS", "품질설계 상태", "품질설계결과 설계상태. AS-IS 표기 A : 확정, B : 설계중", [
      { code: "WAIT", name: "미설계", attrs: [""] }, { code: "ING", name: "설계중", attrs: ["B"] }, { code: "CONF", name: "확정", attrs: ["A"] }, { code: "HOLD", name: "보류", attrs: [""] },
    ], { attrNames: ["AS-IS 코드"], screens: ["qualityDesignResult", "designSimulation"] }),
    code("QC_JUDGE_ITEM_RESULT", "검사항목 판정", "품질판정 검사 항목 결과", simple([["OK", "합"], ["NG", "부"], ["HOLD", "보류"], ["NONE", "미검"]]), { screens: ["qualityJudgment"] }),
    code("QC_QCERT_STATUS", "품질보증서 상태", "품질보증서관리 상태", simple([["DRAFT", "초안"], ["ISSUED", "발행"], ["REISSUED", "재발행"], ["RECALLED", "회수"]]), { screens: ["qualityCertificate"] }),
    code("QC_MTC_STATUS", "검사증명서 상태", "검사증명서(MTC) 상태", simple([["REVIEW", "검토중"], ["ISSUED", "발행"], ["HOLD", "보류"]]), { screens: ["inspectionCertificate"] }),
    code("QC_TAG_STATUS", "Tag 상태", "Tag관리 상태", simple([["WAIT", "대기"], ["ISSUED", "발행"], ["REISSUED", "재발행"], ["VOID", "폐기"]]), { screens: ["tagManagement"] }),
    code("QC_TAG_KIND", "Tag 종류", "Tag 종류", simple([["PROC", "공정 Tag"], ["SHIP", "출하 Tag"]]), { screens: ["tagManagement"] }),
    code("QC_IF_DIR", "인터페이스 방향", "품질사양 전송 이력 방향", simple([["MES_OMS", "MES→OMS"], ["OMS_MES", "OMS→MES"]]), { screens: ["qualitySpec"] }),
    code("QC_IF_RESULT", "인터페이스 결과", "전송 결과", simple([["SUCCESS", "성공"], ["FAIL", "실패"]]), { screens: ["qualitySpec"] }),
    code("QC_FEAS_STATE", "생산가부 상태", "B.D 생산범위 시트 칸 상태", [
      { code: "-", name: "생산불가", attrs: ["white"] }, { code: "P", name: "생산가능", attrs: ["blue"] }, { code: "C", name: "조건부 생산", attrs: ["yellow"] }, { code: "X", name: "생산불가(검증 완료)", attrs: ["red"] },
    ], { attrNames: ["표시 색"], screens: ["productionFeasibility"] }),
    code("QC_SIM_CASE_STATUS", "시뮬레이션 케이스 상태", "시뮬레이션 회귀 케이스 결과", simple([["PASS", "PASS"], ["WARN", "경고"], ["FAIL", "FAIL"], ["NOT_RUN", "미실행"]]), { screens: ["designSimulation"] }),
  ];
}

// ── 룰 범례 코드 ─────────────────────────────────────────────────────
function legendCodes() {
  const qd = readModule("quality-design.html");
  const COAT_CD = literal(qd, "COAT_CD");
  const COAT_RANGE = literal(qd, "COAT_RANGE");
  const ORDERS = literal(qd, "ORDERS");
  const gw = Object.entries(COAT_CD).map(([prd, label]) => {
    const [c, n] = label.split(" : ");
    const [lo, hi, tgt, um] = COAT_RANGE[prd];
    return { code: c, name: n, attrs: [prd, String(lo), String(hi), String(tgt), String(um)] };
  });
  const usg = new Map();
  for (const o of ORDERS) {
    const [c, n] = o.use.split(" : ");
    if (!usg.has(c)) usg.set(c, { code: c, name: n, attrs: [o.useF.split(" : ")[1] ?? ""] });
  }
  return [
    code("QC_RULE_KIND", "원자재강종 기준유형", "원판연계 기준유형", [
      { code: "BASE", name: "도금기준", description: "도금(G) 원판 룰. 칼라 룰이 상속한다" },
      { code: "DERIVED", name: "칼라파생", description: "재질·적정원료(차선원료 없으면 차선도)를 원판에서 상속, 두께범위는 원판 안" },
      { code: "STANDALONE", name: "칼라전용", description: "도금 원판 없이 자체 결과를 둔 칼라 룰" },
    ], { screens: ["rawMaterialGrade"] }),
    code("QC_LEGACY_RULE_TYPE", "업무기준 유형", "레거시 GlueMaster 업무기준 유형", simple([["1A0", "일반"], ["1A1", "매트릭스"], ["1A2", "판단성일반"], ["1B0", "조건판단"], ["1B1", "연관판단", "도금·칼라 원판연계 룰"]]),
      { screens: ["rawMaterialGrade", "lineWidthShrinkage", "lineWidthMargin", "rollingThicknessSet"] }),
    code("QC_THK_STD", "두께관리기준", "규격약호 두께관리기준", simple([["BMT", "Base Metal Thickness", "소지철(원판) 두께 기준 — KS·JIS·AS"], ["TCT", "Total Coated Thickness", "도금 포함 두께 기준 — ASTM·EN"]]), { screens: ["specCode"] }),
    code("QC_SPEC_ORG", "규격기관", "규격코드(규격기관). JS·AM 은 압연두께Set 룰의 2자 약호", simple([
      ["KS", "한국산업표준"], ["JIS", "일본공업규격"], ["ASTM", "미국재료시험협회"], ["EN", "유럽표준"], ["AS", "호주표준"], ["BIS", "인도표준국"], ["JS", "JIS(2자 약호)"], ["AM", "ASTM(2자 약호)"],
    ]), { screens: ["specCode", "rollingThicknessSet"] }),
    code("QC_GW_ASG_CD", "도금량코드", "품명별 대표 도금량코드 — quality-design.html COAT_CD·COAT_RANGE", gw,
      { attrNames: ["적용 품명", "하한(g/㎡)", "상한(g/㎡)", "목표(g/㎡)", "도금두께(㎛)"], screens: ["processRouting", "rollingThicknessSet", "qualityDesignResult"] }),
    code("QC_ORD_USG_CD", "주문용도", "주문용도 코드 — quality-design.html 주문 목록에 라벨이 있는 것만", [...usg.values()],
      { attrNames: ["용도 상세"], screens: ["rollingThicknessSet", "rawMaterialGrade", "qualityDesignResult"] }),
    code("QC_LINE_PROC_CD", "공정(라인) 코드", "폭수축량 룰의 공정(라인) 코드. 원본에 라벨이 없어 코드값만 둔다", [
      ...["82", "83", "84", "85", "8O"].map((c) => ({ code: c, name: c, attrs: ["CGL", "C10B1075"] })), ...["91", "92"].map((c) => ({ code: c, name: c, attrs: ["EGL", "C10B1076"] })),
    ], { attrNames: ["라인 구분", "사용 룰"], screens: ["lineWidthShrinkage"] }),
    code("QC_EDGE_TP", "주문Edge지정구분", "주문 Edge 지정 구분", simple([["S", "지정"], ["M", "미지정"], ["C", "일괄"]]), { screens: ["lineWidthMargin"] }),
    code("QC_PRD_SHP", "제품형태", "제품형태(주문 PRD_SHP)", simple([["C", "Coil"], ["S", "Sheet"]]), { screens: ["lineWidthMargin", "orderConsistency"] }),
    code("QC_COAT_WAY", "코팅방식", "정전 폭마진량 룰의 코팅방식. 원본에 라벨이 없어 코드값만 둔다", simple(["X", "Y", "Z", "F", "G", "H", "J"].map((c) => [c, c])), { screens: ["lineWidthMargin"] }),
    code("QC_RESIN_TP", "수지타입", "정전 폭마진량 룰의 수지타입. 원본에 라벨이 없어 코드값만 둔다", simple([["CC", "CC"], ["HB", "HB"]]), { screens: ["lineWidthMargin"] }),
    code("QC_ORD_WGT_LIMIT", "주문단중 허용범위", "주문단중에러 허용 단중 범위(MT/개) — order-weight-error.html 시드", [
      { code: "MIN", name: "허용 단중 Min", attrs: ["4.0", "MT/개"] }, { code: "MAX", name: "허용 단중 Max", attrs: ["5.0", "MT/개"] },
    ], { attrNames: ["값", "단위"], screens: ["orderWeightError"] }),
  ];
}

// ── 고객사(가명) ─────────────────────────────────────────────────────
function alias(i) {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return i < 26 ? L[i] : L[Math.floor(i / 26) - 1] + L[i % 26];
}
function customerCode() {
  const refs = new Map(); // code → Set(출처)
  const add = (c, src) => { c = String(c).trim(); if (!/^\d{6}$/.test(c)) return; if (!refs.has(c)) refs.set(c, new Set()); refs.get(c).add(src); };
  const sim = readModule("simulation.html");
  const vl = literal(sim, "SEED_VLABELS").filter((v) => v.field === "FNL_CUS_CD");
  vl.forEach((v) => add(v.code, "시뮬레이션"));
  for (const o of literal(sim, "SEED_ORDERS")) for (const k of ["FNL_CUS_CD", "CUS_CD", "ACT_CUS_CD"]) if (o[k]) add(o[k], "시뮬레이션");
  for (const o of literal(readModule("quality-design.html"), "ORDERS")) add(o.buyer.split(" : ")[0], "품질설계결과");
  for (const c of literal(readModule("quality-spec.html"), "CUSTOMERS")) add(c.code, "품질사양");
  ["100001", "200001"].forEach((c) => add(c, "주문정합성 시뮬레이션"));
  const w = readBuildJson("width_rule_seed.json");
  for (const p of w.processes.margin) for (const r of p.rules) if (r.cond.cust && r.cond.cust.op !== "NOT_CHECK") String(r.cond.cust.v1).split(",").forEach((c) => add(c, "폭마진량 룰"));
  for (const r of readBuildJson("rolling_thickness_set_seed.json").rules) if (r.cond.cust.op !== "NOT_CHECK") String(r.cond.cust.v1).split(",").forEach((c) => add(c, "압연두께Set 룰"));
  for (const r of readBuildJson("order_consistency_seed.json").rules) for (const c of [...r.when, ...r.context]) if (/CUS_CD$/.test(c.field)) (c.values ?? []).forEach((v) => add(v, "주문정합성 룰"));
  // 시뮬레이션 화면이 이미 쓰는 가명(A~D)은 그대로 두고, 나머지는 코드 순으로 이어 붙인다.
  const fixed = ["110141", "603034", "200088", "110123", "510391"];
  const rest = [...refs.keys()].filter((c) => !fixed.includes(c)).sort();
  const order = [...fixed.filter((c) => refs.has(c)), ...rest];
  const items = order.map((c, i) => ({
    code: c, name: `수요가 ${alias(i)}`, alterName: alias(i),
    attrs: [c.startsWith("6") ? "수출" : "내수", [...refs.get(c)].join(", ")],
  }));
  return code("QC_CUSTOMER", "고객사(가명)", "시연용 고객사 마스터. 실명 대신 수요가 A… 가명을 쓴다. 코드는 프로토타입 시드에 나온 거래처 번호", items,
    { attrNames: ["거래구분", "참조 화면"], screens: ["qualitySpec", "qualityDesignResult", "designSimulation", "qualityCertificate", "lineWidthMargin", "rollingThicknessSet", "orderConsistency"] });
}

// ── 규격약호·재질·원자재 ─────────────────────────────────────────────
function specName(prd) {
  return { 3: "도장 용융 아연 도금 강판 및 강대", 4: "도장 용융 알루미늄 아연 합금 도금 강판", G: "용융 아연 도금 강판 및 강대", L: "용융 55% 알루미늄 아연 합금 도금 강판" }[prd]
    ?? "용융 알루미늄 아연 마그네슘 합금 도금 강판";
}
const ORG = { KS: "KS", JS: "JIS", AM: "ASTM", EN: "EN", AS: "AS" };
function specCodes() {
  const set = new Set();
  for (const o of literal(readModule("quality-design.html"), "ORDERS")) set.add(o.spec);
  for (const o of literal(readModule("simulation.html"), "SEED_ORDERS")) if (o.spec) set.add(o.spec);
  for (const m of readModule("raw-material-grade.html").matchAll(/spec:'([^']+)'/g)) set.add(m[1]);
  for (const r of readBuildJson("rolling_thickness_set_seed.json").rules) if (r.cond.spec.op !== "NOT_CHECK") String(r.cond.spec.v1).split(",").forEach((s) => set.add(s.trim()));
  for (const f of ["quality-judgment.html", "inspection-certificate.html", "quality-certificate.html", "tag-management.html"])
    for (const m of readModule(f).matchAll(/\b((?:KS|JS|AM|EN|AS)[0-9A-Z]?-[A-Z0-9()-]+)/g)) set.add(m[1]);
  const items = [...set].filter((s) => /^[A-Z]{2}-?[0-9A-Z]-/.test(s)).sort().map((s) => {
    const m = /^([A-Z]{2})-?([0-9A-Z])-(.+)$/.exec(s);
    return { code: s, name: `${ORG[m[1]] ?? m[1]} ${specName(m[2])}`, attrs: [ORG[m[1]] ?? m[1], m[2], m[3], specName(m[2])] };
  });
  return code("QC_SPEC_CD", "규격약호", "규격약호(규격기관 + 품명 + 강종). 품질설계·원자재강종·압연두께Set·판정·출력물 시드에 나온 값", items,
    { attrNames: ["규격기관", "품명코드", "강종", "규격명"], screens: ["specCode", "rawMaterialGrade", "rollingThicknessSet", "qualityDesignResult", "qualityJudgment", "inspectionCertificate"] });
}

function feasGroupsByMat(sheets) {
  const prefer = ["3cgl", "5cgl", "4cgl", "2cgl-gi", "2cgl-gl"];
  const map = new Map();
  for (const key of prefer) {
    const s = sheets.find((x) => x.key === key);
    for (const g of s.groups) for (const c of parseMatCodes(g.codes)) if (!map.has(c)) map.set(c, g.name);
  }
  return map;
}
export function parseMatCodes(text) {
  const body = String(text).split("=")[1] ?? "";
  if (body.includes("외")) return [];
  return body.split(",").map((s) => s.trim()).filter((s) => /^[0-9A-Z]{2}$/.test(s));
}

function matCodes(sheets) {
  const qd = readModule("quality-design.html");
  const MAT_NM = literal(qd, "MAT_NM");
  const MAT_HR = literal(qd, "MAT_HR");
  const set = new Set(Object.keys(MAT_NM));
  const w = readBuildJson("width_rule_seed.json");
  for (const p of [...w.processes.reduction, ...w.processes.margin]) for (const r of p.rules) if (r.cond.matCd && r.cond.matCd.op !== "NOT_CHECK") String(r.cond.matCd.v1).split(",").forEach((c) => set.add(c.trim()));
  for (const m of readModule("raw-material-grade.html").matchAll(/mat:'([0-9A-Z]{2})'/g)) set.add(m[1]);
  for (const s of sheets) for (const g of s.groups) parseMatCodes(g.codes).forEach((c) => set.add(c));
  const grp = feasGroupsByMat(sheets);
  const items = [...set].sort().map((c) => ({
    code: c, name: MAT_NM[c] ? MAT_NM[c].split(" : ")[1] : (grp.get(c) ?? c),
    attrs: [grp.get(c) ?? "", MAT_HR[c] ?? ""],
  }));
  return code("QC_MATL_CD", "재질코드", "재질코드(Material Code). 이름은 품질설계 시드의 강종명, 없으면 생산범위 시트의 재질 그룹명", items,
    { attrNames: ["재질 그룹(생산범위)", "열연 원자재"], screens: ["lineWidthShrinkage", "processRouting", "rawMaterialGrade", "productionFeasibility", "qualityDesignResult"] });
}

function rawMatCodes() {
  const MAT_HR = literal(readModule("quality-design.html"), "MAT_HR");
  const hr = Object.fromEntries(Object.values(MAT_HR).map((v) => { const [c, ...rest] = v.split(" - "); return [c.trim(), rest.join(" - ")]; }));
  const set = new Set(Object.keys(hr));
  const w = readBuildJson("width_rule_seed.json");
  for (const p of [...w.processes.reduction, ...w.processes.margin]) for (const r of p.rules) if (r.cond.rawCd && r.cond.rawCd.op !== "NOT_CHECK") String(r.cond.rawCd.v1).split(",").forEach((c) => set.add(c.trim()));
  const rm = readModule("raw-material-grade.html");
  for (const m of rm.matchAll(/pri:'([0-9A-Z]{3})'/g)) set.add(m[1]);
  for (const m of rm.matchAll(/alt:\[([^\]]*)\]/g)) for (const x of m[1].matchAll(/'([0-9A-Z]{3})'/g)) set.add(x[1]);
  const items = [...set].filter(Boolean).sort().map((c) => ({ code: c, name: hr[c] ?? c }));
  return code("QC_RAW_MATL_CD", "원자재코드", "원자재(열연 강종) 코드. 이름은 품질설계 시드에 설명이 있는 것만, 나머지는 코드값", items,
    { screens: ["lineWidthShrinkage", "lineWidthMargin", "rawMaterialGrade"] });
}

// ── 생산가부 시트·재질 그룹 ──────────────────────────────────────────
function feasCodes(sheets) {
  const sheetItems = sheets.map((s) => ({
    code: s.key.toUpperCase(), name: s.tab,
    attrs: [s.title, s.rev, s.titleNote ?? "", s.notes.join("\n"), JSON.stringify(s.post), `QD_FEAS_${s.key.toUpperCase().replace(/-/g, "_")}`],
  }));
  const grpItems = [];
  for (const s of sheets) s.groups.forEach((g, gi) => grpItems.push({
    code: `${s.key.toUpperCase()}-G${gi + 1}`, name: g.name, lvls: [s.key.toUpperCase()],
    attrs: [parseMatCodes(g.codes).join(","), g.codes, g.widths.join(","), g.thicks.join(","), g.warn ?? "", g.warnbox ?? "", g.overlay ? JSON.stringify(g.overlay) : ""],
  }));
  return [
    code("QC_FEAS_SHEET", "생산범위 시트", "B.D 생산범위 시트 머리 — 제목·개정일·안내·후처리 표(JSON {heads, rows})", sheetItems,
      { attrNames: ["제목", "개정일", "제목 정정 메모", "안내(줄바꿈 구분)", "후처리 표(JSON)", "룰 ID"], screens: ["productionFeasibility"] }),
    code("QC_FEAS_MATL_GRP", "생산범위 재질 그룹", "시트별 재질 그룹. 코드 = 시트-G순번(룰 조건 MAT_GRP_CD 값)", grpItems,
      { lvlNames: ["시트"], attrNames: ["재질코드(쉼표)", "재질코드 원문", "폭 축(위→아래)", "두께 축", "경고", "경고 상자", "주석 영역(JSON rows·cols·text·red)"], screens: ["productionFeasibility"] }),
  ];
}

// ── 주문정합성 코드 사전 ─────────────────────────────────────────────
function ocCodes() {
  const s = readBuildJson("order_consistency_seed.json");
  return [
    code("QC_OC_FIELD", "주문정합성 항목", "주문정합성 룰이 쓰는 주문 항목 코드 사전(order_consistency_seed.json fields)", s.fields.map((f) => ({
      code: f.key, name: f.label, attrs: [f.type, f.origin, f.unit ?? "", String(f.refs ?? ""), f.label_note ?? ""],
    })), { attrNames: ["타입(code·number·string)", "원본 표현(EAV·column)", "단위", "참조 룰 수", "라벨 메모"], screens: ["orderConsistency"] }),
    code("QC_OC_VALUE_LABEL", "주문정합성 값 라벨", "에러 메시지에서 역추론한 값 라벨(추정). 코드 = 항목:값", s.value_labels.map((v) => ({
      code: `${v.field}:${v.code}`, name: v.label, lvls: [v.field], attrs: [v.field, String(v.code), v.certainty, v.evidence],
    })), { lvlNames: ["항목"], attrNames: ["항목", "값", "근거 등급", "추론 근거"], screens: ["orderConsistency"] }),
    code("QC_OC_ERR_CATEGORY", "주문정합성 에러 분류", "정렬 순서 = 누락 < 사용불가 < 불필요 < 한도위반 < 선택오류", simple([["누락", "누락"], ["사용불가", "사용불가"], ["불필요", "불필요"], ["한도위반", "한도위반"], ["선택오류", "선택오류"]]), { screens: ["orderConsistency"] }),
    code("QC_OC_ACTOR", "주문정합성 조치 주체", "에러 조치 주체", simple([["등록자", "등록자"], ["시스템", "시스템"], ["현업담당", "현업담당"], ["미지정", "미지정"]]), { screens: ["orderConsistency"] }),
  ];
}

// ── 칼라부재료·칼라BOM(직접 설계 — 프로토타입은 자리표시만 있다) ─────
const SUBMAT = [
  // code, 이름, 구분, 수지계, 제조사, 색상코드, 색상명, 도막(㎛), 광택(GU), PMT(℃)
  ["PM-EP05", "에폭시 프라이머 5㎛", "프라이머", "Epoxy", "도료사 A", "", "황색 투명", "5", "", "216~224"],
  ["PM-PU05", "우레탄 프라이머 5㎛", "프라이머", "Polyurethane", "도료사 B", "", "백색", "5", "", "216~224"],
  ["PM-PE07", "폴리에스터 프라이머 7㎛", "프라이머", "Polyester", "도료사 C", "", "회색", "7", "", "224~232"],
  ["TC-PE-9002", "PE 상도 회백색", "상도", "Polyester", "도료사 A", "RAL9002", "회백색", "15", "30", "224~232"],
  ["TC-PE-7035", "PE 상도 라이트그레이", "상도", "Polyester", "도료사 A", "RAL7035", "라이트그레이", "15", "40", "224~232"],
  ["TC-PE-5015", "PE 상도 스카이블루", "상도", "Polyester", "도료사 B", "RAL5015", "스카이블루", "15", "35", "224~232"],
  ["TC-PE-9010", "PE 상도 퓨어화이트(가전)", "상도", "Polyester", "도료사 C", "RAL9010", "퓨어화이트", "18", "70", "224~232"],
  ["TC-SMP-1015", "SMP 상도 라이트아이보리", "상도", "Silicone Modified Polyester", "도료사 B", "RAL1015", "라이트아이보리", "20", "30", "232~241"],
  ["TC-HDP-7016", "HDP 상도 앤트러사이트그레이", "상도", "High Durable Polyester", "도료사 A", "RAL7016", "앤트러사이트그레이", "20", "25", "232~241"],
  ["TC-PVDF-9006", "PVDF 상도 화이트알루미늄", "상도", "PVDF", "도료사 C", "RAL9006", "화이트알루미늄(메탈릭)", "25", "30", "241~249"],
  ["TC-PE-6005", "PE 상도 모스그린", "상도", "Polyester", "도료사 B", "RAL6005", "모스그린", "15", "30", "224~232"],
  ["BC-EP-GR07", "에폭시 백코트 회색", "백코트", "Epoxy", "도료사 A", "", "회색", "7", "", "216~224"],
  ["BC-PE-WH07", "PE 백코트 백색", "백코트", "Polyester", "도료사 B", "", "백색", "7", "", "224~232"],
  ["BC-PE-WH12", "PE 백코트 백색 12㎛(가전)", "백코트", "Polyester", "도료사 C", "", "백색", "12", "", "224~232"],
  ["PF-PE50", "보호필름 PE 50㎛ 투명", "보호필름", "PE", "필름사 A", "", "투명", "50", "", ""],
  ["PF-PE60BW", "보호필름 PE 60㎛ 흑백", "보호필름", "PE", "필름사 A", "", "흑백", "60", "", ""],
];

// BOM 번호, BOM 이름, 적용 품명, 층 목록 [층코드, 층, 부재료]
const BOMS = [
  ["S00001", "표준 도장 BOM(PE 회백)", "3", [["FP", "전면 프라이머", "PM-EP05"], ["FT", "전면 상도", "TC-PE-9002"], ["BC", "후면 백코트", "BC-EP-GR07"]]],
  ["A60041", "건재 PE 라이트그레이", "3", [["FP", "전면 프라이머", "PM-EP05"], ["FT", "전면 상도", "TC-PE-7035"], ["BC", "후면 백코트", "BC-EP-GR07"]]],
  ["CB7-0001", "CCUS PE 퓨어화이트", "7", [["FP", "전면 프라이머", "PM-PE07"], ["FT", "전면 상도", "TC-PE-9010"], ["BC", "후면 백코트", "BC-PE-WH07"]]],
  ["VL0001", "가전 고광택 화이트(보호필름)", "4", [["FP", "전면 프라이머", "PM-PU05"], ["FT", "전면 상도", "TC-PE-9010"], ["BC", "후면 백코트", "BC-PE-WH12"], ["PF", "보호필름", "PF-PE50"]]],
  ["VP0001", "지붕재 SMP 아이보리", "3", [["FP", "전면 프라이머", "PM-EP05"], ["FT", "전면 상도", "TC-SMP-1015"], ["BC", "후면 백코트", "BC-EP-GR07"]]],
  ["VG001A", "외장 HDP 앤트러사이트", "4", [["FP", "전면 프라이머", "PM-PU05"], ["FT", "전면 상도", "TC-HDP-7016"], ["BC", "후면 백코트", "BC-EP-GR07"]]],
  ["VT002A", "외장 PVDF 메탈릭", "4", [["FP", "전면 프라이머", "PM-PU05"], ["FT", "전면 상도", "TC-PVDF-9006"], ["BC", "후면 백코트", "BC-PE-WH07"], ["PF", "보호필름", "PF-PE60BW"]]],
  ["US004L", "건재 PE 스카이블루", "3", [["FP", "전면 프라이머", "PM-EP05"], ["FT", "전면 상도", "TC-PE-5015"], ["BC", "후면 백코트", "BC-EP-GR07"]]],
  ["UT0C6S", "건재 PE 모스그린", "3", [["FP", "전면 프라이머", "PM-EP05"], ["FT", "전면 상도", "TC-PE-6005"], ["BC", "후면 백코트", "BC-EP-GR07"]]],
  ["K9060L", "가전 PE 회백(보호필름)", "4", [["FP", "전면 프라이머", "PM-PE07"], ["FT", "전면 상도", "TC-PE-9002"], ["BC", "후면 백코트", "BC-PE-WH12"], ["PF", "보호필름", "PF-PE50"]]],
];

function colorCodes() {
  const sub = Object.fromEntries(SUBMAT.map((s) => [s[0], s]));
  const subItems = SUBMAT.map(([c, n, kind, resin, maker, ral, color, um, gloss, pmt]) => ({ code: c, name: n, attrs: [kind, resin, maker, ral, color, um, gloss, pmt] }));
  const bomItems = [];
  for (const [bom, name, prd, layers] of BOMS) for (const [lc, layer, sm] of layers) {
    const s = sub[sm];
    bomItems.push({ code: `${bom}-${lc}`, name: `${name} · ${layer}`, lvls: [bom], attrs: [name, prd, layer, sm, s[1], s[7], s[6], s[5]] });
  }
  return [
    code("QC_COLOR_SUBMAT", "칼라부재료", "칼라강판 도장 부재료(프라이머·상도·백코트·보호필름). 시연용으로 설계한 기준 — 제조사는 가명", subItems,
      { attrNames: ["구분", "수지계", "제조사", "색상코드", "색상명", "건조도막두께(㎛)", "광택(GU)", "PMT(℃)"], screens: ["colorSubmaterial", "colorBom"] }),
    code("QC_COLOR_BOM", "칼라BOM", "칼라 도장 BOM — BOM 번호(계층 1) 아래 층별 부재료. 코드 = BOM번호-층코드(FP 전면 프라이머·FT 전면 상도·BC 후면 백코트·PF 보호필름)", bomItems,
      { lvlNames: ["BOM 번호"], attrNames: ["BOM 이름", "적용 품명", "층", "부재료코드", "부재료명", "도막두께(㎛)", "색상명", "색상코드"], screens: ["colorBom", "qualityDesignResult", "lineWidthMargin"] }),
  ];
}

export function buildCodes() {
  const src = readModule("production-feasibility.html");
  const sheets = literal(src, "SHEETS");
  const codes = [...masterCodes(), ...statusCodes(), customerCode(), specCodes(), matCodes(sheets), rawMatCodes(), ...legendCodes(), ...feasCodes(sheets), ...ocCodes(), ...colorCodes()];
  const seen = new Set();
  for (const c of codes) {
    if (seen.has(c.codeId)) throw new Error(`코드 ID 중복 ${c.codeId}`);
    seen.add(c.codeId);
    const keys = new Set();
    for (const it of c.items) {
      if (keys.has(it.code)) throw new Error(`${c.codeId}: 코드값 중복 ${it.code}`);
      if (/[,\s]/.test(it.code)) throw new Error(`${c.codeId}: 코드값에 쉼표·공백 ${it.code}`);
      keys.add(it.code);
      if ((it.attrs?.length ?? 0) > c.attrNames.length) throw new Error(`${c.codeId} ${it.code}: 속성 라벨보다 값이 많다`);
    }
  }
  return { codes };
}
