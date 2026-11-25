/**
 * 시연 시드 — 목업 app.html 의 BASERULES·fresh() 를 옮겼다. 화면 런타임은 이 파일을 쓰지 않는다
 * (scripts/mqc-demo/mtc/extract.mjs 가 서버 시드 seed.json 을 만들 때와 시험이 쓴다).
 */
import { CHEM, FORM_KEYS } from "./constants";
import { baseForm, resolve } from "./resolve";
import { clone } from "./text";
import type { Cert, Cond, EngineState, FormKey, FormState, Img, Rule, Snap } from "./types";

export interface SignSet {
  from: string;
  sign: string;
  stamp: string;
  remark: string;
}

const R = (id: string, code: string, grp: string, name: string, where: string, cond: Cond[], tgt: string, val: string, prio = cond.some((c) => c[0] === "cust") ? 10 : 50): Rule => ({
  id,
  code,
  grp,
  name,
  where,
  cond,
  tgt,
  val,
  prio,
  st: "ACTIVE",
  ver: 1,
  draft: null,
});

/** 예외 규칙 시작 목록(현행 하드코딩 → 화면 관리). 목록 순서가 같은 우선순위의 승패를 정한다. */
export function baseRules(signsets: SignSet[]): Rule[] {
  return [
    R("R1", "V-03·V-04·D-01", "값", "BIS 인증 표시 — CCLI", "DKDbJobHandler.java 685~686", [["nat", "=", "IN"], ["prd", "=", "4"]], "mark", "IS 15965:2012\nCML/4100021451"),
    R("R2", "V-05·V-06·D-01", "값", "BIS 인증 표시 — GI", "DKDbJobHandler.java 690~691", [["nat", "=", "IN"], ["prd", "=", "G"]], "mark", "IS 277:2018\nCM/L-4100039975"),
    R("R3", "V-44", "값", "REMARK — BIS 인증 안내", "DKDbJobHandler.java 725", [["nat", "=", "IN"], ["isi", "=", "Y"]], "remarkLine", "For details of BIS Certification please visit www.bis.gov.in"),
    R("R4", "V-47", "값", "REMARK — 원산지 (스페인어)", "DKDbJobHandler.java 656", [["lang", "=", "S"]], "remarkLine", "País de Origen : Corea del sur"),
    R("R5", "L-01", "라벨", "도금량 라벨 — AL-ZINC (수출 영문)", "DKDbJobHandler.java 1215", [["form", "=", "en"], ["zinc", "=", "Y"]], "zinc", "AL-ZINC\nCOATING\n(g/㎡)"),
    R("R6", "L-03", "라벨", "도금량 라벨 — AL ZN+MG (수출 영문)", "DKDbJobHandler.java 1219", [["form", "=", "en"], ["zinc", "=", "W"]], "zinc", "AL ZN+MG\nCOATING\n(g/㎡)"),
    R("R7", "L-13", "라벨", "도금량 라벨 — AL-ZINC (스페인어)", "DKDbJobHandler.java 1110", [["form", "=", "es"], ["prd", "=", "4"]], "zinc", "Recubrimiento\nAL-ZINC\n(g/㎡)"),
    R("R8", "L-16", "라벨", "도금량 라벨 — ZINC (내수 한글)", "DKDbJobHandler.java 1029", [["form", "=", "ko"], ["zinc", "=", "Z"]], "zinc", "부착량\nZINC COATING\n(g/㎡)"),
    R("R9", "L-18", "라벨", "인장시험 단위 N/㎟ → Mpa", "DKDbJobHandler.java 1350", [["cust", "=", "605329"]], "unit", "Mpa"),
    R("R10", "V-50", "값", "MESSRS — 인도 자가소비", "DKDbJobHandler.java 869", [["nat", "=", "IN"], ["prd", "=", "G"]], "cust1", "Issued for In-house Consumption"),
    R("R11", "V-33", "값", "품명 — SIRIM EGI (말레이시아)", "DKDbJobHandler.java 1409", [["nat", "=", "MY"], ["prd", "=", "E"]], "commodity", "ELECTROLYTIC ZINC-COATED STEEL SHEET AND STRIP"),
    R("R12", "D-12", "표시", "Boron 칸 숨김", "XFA 양식 스크립트 (BORON_FLAG)", [["boron", "=", "N"]], "col:B", "hide"),
    R("R13", "고객", "값", "제목 — 멕시코 통관 대응", "DKDbJobHandler.java 1126 (605422)", [["cust", "=", "MX-3001"]], "title", "CERTIFICADO DE CALIDAD"),
    R("R14", "고객", "표시", "QR 표시 — 멕시코 통관 대응", "DKDbJobHandler.java exportCreateQRImage 조건 (605422)", [["cust", "=", "MX-3001"]], "qr", "show"),
    R("R15", "고객", "표시", "도장 표시 — 멕시코 통관 대응", "DKDbJobHandler.java stamp 조건 (605422)", [["cust", "=", "MX-3001"]], "stamp", "show"),
    ...signsets.map((x, i) => R("S" + (i + 1), "서명", "이미지", x.remark.split(" — ")[1] || x.from, `서식서버 서명 날짜 분기 (sign${i + 1})`, [["date", "≥", x.from]], "signImg", x.sign)),
    R("S10", "도장", "이미지", "2025-12-29 신도장", "서식서버 도장 날짜 분기", [["date", "≥", "251229"]], "stampImg", "cm_stamp2.png"),
  ];
}

export function baseForms(): Record<FormKey, FormState> {
  return {
    en: { applied: baseForm("en", 3), draft: null, pending: false, hist: [{ v: 3, at: "2026.10.26", memo: "문서번호 개정 (REV.1 → REV.2)" }, { v: 2, at: "2026.01.02", memo: "현행 양식 이관" }] },
    ko: { applied: baseForm("ko", 1), draft: null, pending: false, hist: [{ v: 1, at: "2026.01.02", memo: "현행 양식 이관" }] },
    es: { applied: baseForm("es", 1), draft: null, pending: false, hist: [{ v: 1, at: "2025.12.29", memo: "신양식 (서명·스탬프 변경) 이관" }] },
  };
}

/** 등록된 칸 예시 값(화학성분·도료사)을 코일에 채운다 — 목업이 열 때 하는 것과 같다. */
export function withExtraValues(certs: Record<string, Cert>): Record<string, Cert> {
  const out = clone(certs);
  for (const c of Object.values(out))
    c.coils.forEach((cl, i) => {
      for (const [k, [b, d]] of Object.entries(CHEM)) cl[k] = String(b + (i % 2) * d);
      cl.paint = "PM-0" + (1 + (i % 2));
    });
  return out;
}

export function baseImgs(signsets: SignSet[], data: Record<string, string>): Img[] {
  return [
    ...signsets.map((x) => ({ name: x.sign, kind: "서명" as const, remark: x.remark, data: data[x.sign] ?? "" })),
    { name: "cm_stamp.png", kind: "도장", remark: "구도장", data: data["cm_stamp.png"] ?? "" },
    { name: "cm_stamp2.png", kind: "도장", remark: "신도장 (2025.12.29~)", data: data["cm_stamp2.png"] ?? "" },
  ];
}

export interface SeedBase {
  certs: Record<string, Cert>;
  signsets: SignSet[];
  imgs: Record<string, string>;
}

export interface SeedIssued {
  certId: string;
  issueNo: number;
  issuedAt: string;
  reissueCnt: number;
  snap: Snap;
}

/** 목업 fresh() 와 같은 시작 상태: C5 는 10/20 수출 영문 v2 로, C1~C4 는 11/01 그때 규칙으로 자동 발행. */
export function freshIssued(st: EngineState): { issued: SeedIssued[]; hist: { at: string; docNo: string; act: string; msg: string }[] } {
  const issued: SeedIssued[] = [];
  const hist: { at: string; docNo: string; act: string; msg: string }[] = [];
  const tmp = clone(st);
  tmp.forms.en.applied = { ...baseForm("en", 2), docno: "USS-G-0913-01 REV.1" };
  const c5 = resolve(tmp, "C5");
  issued.push({ certId: "C5", issueNo: 1, issuedAt: "2026-10-20T14:05:00", reissueCnt: 0, snap: c5 });
  hist.push({ at: "2026-10-20T14:05:00", docNo: st.certs.C5.head.mtc, act: "AUTO_ISSUE", msg: `자동 발행 (${c5.fname} v${c5.fver})` });
  ["C1", "C2", "C3", "C4"].forEach((id, i) => {
    const at = `2026-11-01T08:${String(10 + i * 7).padStart(2, "0")}:00`;
    const snap = resolve(st, id);
    issued.push({ certId: id, issueNo: i + 2, issuedAt: at, reissueCnt: 0, snap });
    hist.push({ at, docNo: st.certs[id].head.mtc, act: "AUTO_ISSUE", msg: `자동 발행 (${snap.fname} v${snap.fver})` });
  });
  return { issued, hist };
}

export function seedState(base: SeedBase): EngineState {
  return { forms: baseForms(), rules: baseRules(base.signsets), ovr: {}, certs: withExtraValues(base.certs), imgs: baseImgs(base.signsets, base.imgs) };
}

/** 서버 시드 파일 본문(docs/mqc/demo/mtc-contract.md §4). */
export function buildSeed(base: SeedBase) {
  const st = seedState(base);
  const { issued, hist } = freshIssued(st);
  return {
    forms: FORM_KEYS.map((k) => ({ key: k, json: st.forms[k] })),
    rules: st.rules.map((r) => ({ key: r.id, json: r })),
    certs: Object.entries(st.certs).map(([k, c]) => ({ key: k, json: c })),
    ovrs: [] as { key: string; json: unknown }[],
    imgs: st.imgs.map(({ name, ...rest }) => ({ key: name, json: rest })),
    issued,
    hist,
  };
}
