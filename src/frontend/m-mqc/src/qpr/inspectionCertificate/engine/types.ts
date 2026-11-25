/**
 * 검사증명서(MTC) 계산 엔진 타입 — 목업 `app.html` 의 상태(S)·양식 정의(FORMDEF)·발행본(resolve 결과) 모양 그대로다.
 * 서버는 이 객체들을 불투명한 JSON 으로 저장한다(docs/mqc/demo/mtc-contract.md §2).
 */

export type FormKey = "en" | "ko" | "es";
export type Origin = "base" | "rule" | "ovr";

/** 표 머리 칸 하나(grid.py parse 결과). */
export interface HeadCell {
  r: number;
  rs: number;
  st: string;
  vert: boolean;
  vst: string | null;
  t: string;
}

/** 표 칸(잎) 하나: 폭, 본문 td 속성, 머리 단별 차지 칸 id, 맨 아래 머리 칸 id. */
export interface Leaf {
  w: number;
  td: string;
  occ: number[];
  top: number;
}

/** 양식 한 종의 배치·CSS·표 머리 구조(build_sim.py FORMDEF). */
export interface FormDef {
  css: string;
  page: string;
  heights: number[];
  gap: boolean;
  keys: string[];
  leaf: Record<string, Leaf>;
  cells: HeadCell[];
  defaults: Record<string, string>;
  pageTxt: string;
  stamp: string;
  isi: string;
  nRemark: number;
}

/** 코일 한 줄 — 칸 키 → 값. `_id`·`_color` 는 표시용 보조 값. */
export type Coil = Record<string, string>;

/** 인터페이스 데이터(증명서 원천). */
export interface Cert {
  kind: number;
  cust: string;
  at: Record<string, string>;
  head: Record<string, string>;
  coils: Coil[];
  notes: Record<string, string>;
}

export interface FormCol {
  k: string;
  on: boolean;
}

/** 양식 본문(적용본·초안). */
export interface Form {
  ver: number;
  qr: boolean;
  stamp: boolean;
  title: string;
  statement: string;
  signLabel: string;
  legend: string;
  maker: string;
  docno: string;
  labels: Record<string, string>;
  cols: FormCol[];
  [k: string]: unknown;
}

export interface FormHist {
  v: number;
  at: string;
  memo: string;
}

/** 서버 FORM 본문. */
export interface FormState {
  applied: Form;
  draft: Form | null;
  pending: boolean;
  hist: FormHist[];
}

export type Cond = [field: string, op: string, value: string];

export interface RuleBody {
  id: string;
  code: string;
  grp: string;
  name: string;
  where: string;
  cond: Cond[];
  tgt: string;
  val: string;
  prio: number;
  st: "ACTIVE" | "OFF";
  ver: number;
}

/** 서버 RULE 본문. */
export interface Rule extends RuleBody {
  draft: RuleBody | null;
}

/** 서버 OVR 본문(단건 수정). */
export interface Ovr {
  form?: string;
  head?: Record<string, string>;
  title?: string;
  remark?: string;
  coil?: Record<string, string>;
  reason?: string;
}

/** 서명·도장 이미지 등록함 한 건. */
export interface Img {
  name: string;
  kind: "서명" | "도장";
  remark: string;
  data: string;
}

/** 계산에 쓰는 상태. `rSel` 은 「예외 규칙」 미리보기에서 초안을 쓸 규칙 id. */
export interface EngineState {
  forms: Record<FormKey, FormState>;
  rules: Rule[];
  ovr: Record<string, Ovr>;
  certs: Record<string, Cert>;
  imgs: Img[];
  rSel?: string;
}

export type Mode = "applied" | "draft" | "rule";

export interface SnapCol {
  k: string;
  l: string;
  s: Origin | null;
  w: string | null;
}

/** 발행본(resolve 결과). 서버에는 이 객체가 그대로 snap 으로 저장된다. */
export interface Snap {
  id: string;
  fk: FormKey;
  fname: string;
  fver: number;
  T: Record<string, string>;
  src: Record<string, Origin>;
  why: Record<string, string | undefined>;
  cols: SnapCol[];
  cellOv: Record<string, { t: string; s: Origin; w: string }>;
  hidden: [string, string][];
  overflow: number;
  mark: boolean;
  qr: boolean;
  stamp: boolean;
  coils: Coil[];
  coilOv: Record<string, number>;
  rules: string[];
  signImg: string;
  stampImg: string;
  signWhy: string;
  stampWhy: string;
  nOvr: number;
  nRule: number;
}
