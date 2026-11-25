/** 검사증명서 계산 상수 — 목업 app.html 의 FORMNAME·HEADF·FTEXT·RF·RT·KINDS·EXTRA 등을 그대로 옮겼다. */
import type { FormKey } from "./types";

export const FORM_KEYS: FormKey[] = ["en", "ko", "es"];
export const FORMNAME: Record<FormKey, string> = { en: "수출 영문", ko: "내수 한글", es: "스페인어" };
export const KIND: Record<number, string> = { 1: "수출", 2: "내수" };

export const CUSTS: Record<string, { name: string; nat: string }> = {
  "IN-1001": { name: "SAMPLE STEEL INDIA PRIVATE LIMITED", nat: "인도" },
  "KR-2001": { name: "(주)한빛가전", nat: "국내" },
  "MX-3001": { name: "MUESTRA ACEROS S.A. DE C.V.", nat: "멕시코" },
  "US-4001": { name: "SAMPLE TRADING INC.", nat: "미국" },
};
export const custName = (cust: string) => CUSTS[cust]?.name ?? cust;

/** 양식별 머리 항목(단건 수정·규칙 대상). */
export const HEADF: Record<FormKey, [string, string][]> = {
  en: [["cust1", "MESSRS. 1줄 (고객명)"], ["cust2", "MESSRS. 2줄"], ["cust3", "MESSRS. 3줄"], ["cust4", "MESSRS. 4줄"], ["commodity", "COMMODITY"], ["spec", "SPECIFICATION"], ["date", "D A T E"], ["order", "ORDER NO"], ["invoice", "INVOICE NO"], ["lc", "L/C NO."], ["po", "P/O NO."]],
  es: [["cust1", "Mandatarios 1줄 (고객명)"], ["cust2", "Mandatarios 2줄"], ["cust3", "Mandatarios 3줄"], ["cust4", "Mandatarios 4줄"], ["commodity", "Producto"], ["spec", "Especificacion"], ["date", "Fecha"], ["order", "No. Orden"], ["invoice", "No. Factura"], ["lc", "Linea Credito"], ["po", "Orden de Compra"]],
  ko: [["commodity", "품명 (COMMODITY) 1줄"], ["commodity2", "품명 2줄"], ["grade", "강종 (GRADE)"], ["spec", "적용규격 (SPECIFICATION)"], ["cust", "수요자 (CUSTOMER)"], ["issueNo", "발행번호 (ISSUE NO)"], ["delivDate", "출고일자 (DATE OF DELIVERY)"], ["issueDate", "발행일자 (DATE OF ISSUE)"]],
};

/** 양식 문구 6개. */
export const FTEXT: [string, string][] = [["title", "제목"], ["statement", "하단 증명 문구"], ["signLabel", "서명자 표기"], ["legend", "범례"], ["maker", "하단 제조자 문구"], ["docno", "문서번호"]];

/** 도금량 칸 기본 이름(도금 종류는 예외 규칙이 정함). */
export const COAT: Record<FormKey, string> = { en: "ZINC\nCOATING\n(g/㎡)", es: "Recubrimiento\nZINC\n(g/㎡)", ko: "부착량\nCOATING\n(g/㎡)" };

/** 등록된 칸(칸 추가 후보) — 값은 예시. */
export const CHEM: Record<string, [number, number]> = { Cr: [15, 2], Ni: [10, 1], Cu: [12, 3], Ti: [1, 1], V: [1, 1], Nb: [0, 1] };
export const CHEMK = ["C", "Si", "Mn", "P", "S", "Al", "B", ...Object.keys(CHEM)];
export interface ExtraCol {
  k: string;
  n: string;
  g: string;
  like?: string;
  lb: Record<FormKey, string>;
  after?: string[];
}
export const EXTRA: ExtraCol[] = [
  ...Object.keys(CHEM).map((k) => ({ k, n: k, g: "화학성분 묶음", like: "B", lb: { en: k, es: k, ko: k }, after: CHEMK })),
  { k: "paint", n: "도료사", g: "단독 칸", lb: { en: "PAINT\nMAKER", es: "Fabricante\nde pintura", ko: "도료사\nPAINT MAKER" } },
];
export const isExtra = (k: string) => EXTRA.some((x) => x.k === k);

/** 단건 수정으로 고칠 수 있는 표 칸(시험값은 막음). */
export const COIL_EDIT = ["coil", "size", "net", "grs", "wl", "qty", "heat", "surf", "color"];

/** 규칙 조건 항목. */
export const RF: Record<string, { n: string; date?: boolean; o: Record<string, string> }> = {
  date: { n: "증명서 날짜", date: true, o: {} },
  nat: { n: "국가", o: { IN: "인도", KR: "한국", MX: "멕시코", US: "미국", MY: "말레이시아", TH: "태국" } },
  prd: { n: "품명", o: { 2: "CCEI (도장 전기아연)", 4: "CCLI (도장 알루미늄아연)", G: "GI", E: "EGI", L: "GL", C: "CR" } },
  lang: { n: "언어", o: { K: "한국어 (K)", E: "영어 (E)", S: "스페인어 (S)", J: "일본어 (J)", C: "중국어 (C)" } },
  form: { n: "양식", o: FORMNAME },
  cust: { n: "고객", o: { ...Object.fromEntries(Object.entries(CUSTS).map(([k, v]) => [k, v.name])), 605329: "최종고객 605329" } },
  isi: { n: "BIS 인증 대상", o: { Y: "예", N: "아니오" } },
  zinc: { n: "도금 구분", o: { Y: "AL-ZINC", W: "AL ZN+MG", Z: "아연(ZINC)" } },
  boron: { n: "보론(B) 표시", o: { Y: "표시", N: "안 함" } },
};

/** 규칙 대상. */
export const RT: Record<string, { n: string; hint?: string; vis?: boolean; img?: "서명" | "도장"; opts?: Record<string, string> }> = {
  mark: { n: "BIS 인증 마크 + 번호", hint: "두 줄: 1줄 IS 번호, 2줄 CML 번호 — 마크 그림도 같이 나옴" },
  remarkLine: { n: "REMARK 줄 추가", hint: "여러 규칙이 걸리면 차례로 줄이 늘어남" },
  commodity: { n: "품명 (COMMODITY)" },
  cust1: { n: "수신처 첫 줄 (MESSRS.)" },
  title: { n: "제목" },
  zinc: { n: "도금량 칸 머리글", hint: "줄바꿈으로 여러 줄" },
  unit: { n: "인장시험 단위 (N/㎟ 칸)" },
  signImg: { n: "서명 이미지", img: "서명" },
  stampImg: { n: "도장 이미지", img: "도장", hint: "규칙이 없으면 구도장 (cm_stamp.png)" },
  qr: { n: "QR 코드", vis: true },
  stamp: { n: "도장", vis: true },
  useForm: { n: "사용 양식", opts: FORMNAME, hint: "언어 기준 자동 선택 대신 이 양식으로 (조건에 양식은 못 씀)" },
  "col:B": { n: "B (보론) 칸", vis: true },
  "col:weather": { n: "WEATHER O-METER 칸", vis: true },
  "col:hcl": { n: "HCL 칸", vis: true },
};

/** 결과 종류. */
export const KINDS: Record<string, string> = { 값: "값 — 글자를 넣거나 바꿈", 라벨: "라벨 — 칸 머리글 이름", 표시: "표시 — 보이기 / 숨기기", 이미지: "이미지 — 서명·도장 그림", 양식: "양식 — 이 양식으로 발행" };
export const kindOf = (tgt: string) => {
  const t = RT[tgt];
  if (!t) return "값";
  return t.vis ? "표시" : t.img ? "이미지" : t.opts ? "양식" : tgt === "zinc" || tgt === "unit" ? "라벨" : "값";
};
