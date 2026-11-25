/**
 * Tag관리 자료 모양 — 목업 DATA(정적 자료)와 편집 문서(docJSON: data · style · geo · imgs · facts).
 * 목업 자료는 빌드 스크립트가 만든 느슨한 JSON 이라 규칙 계산에 쓰는 칸만 이름을 붙이고 나머지는 열어 둔다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** 규칙 칸 제약. */
export interface Cons {
  in?: string[];
  notin?: string[];
  pre?: string[];
  notpre?: string[];
  ge?: number;
  gt?: number;
  le?: number;
  lt?: number;
  nn?: boolean;
  isnull?: boolean;
  b?: boolean;
  nvl?: string;
  orNull?: boolean;
}
/** 규칙 표 한 줄. c = 조건(칸 키 → 제약), r = 결과(항목 → 값). */
export interface Row {
  uid: string;
  prio: number;
  c: Record<string, Cons>;
  r: Record<string, string>;
  src?: string[];
  q?: string;
  note?: string;
  kind?: string;
  grp?: string;
}
export interface Table {
  name?: string;
  mode?: string;
  pre?: { key: string; cons: Cons };
  rows: Row[];
  groups?: { id: string; name: string }[];
  [k: string]: any;
}
/** 규칙 실행 문맥(코일 값 + 파생속성 + 규칙이 정한 값). */
export type Ctx = Record<string, any>;
export type Coil = Record<string, any>;

/** 양식 배치 노드(목업 labellers XML 을 옮긴 것). */
export interface FormNode {
  t: string;
  n?: any;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fs?: number;
  fn?: string;
  b?: number;
  al?: string;
  ls?: number;
  lt?: number;
  k?: FormNode[];
}
export interface Form {
  id: string;
  status: string;
  size: string;
  layout: FormNode[];
}

export interface TagData {
  first: string;
  built: string;
  M: Record<string, Record<string, string>>;
  COLS: Record<string, { label: string; m?: string }>;
  DERIVED: any[];
  tables: Record<string, Table>;
  items: Record<string, { d?: string; e?: string }>;
  forms: Record<string, Form>;
  formInfo: Record<string, { nm: string; fam: string; fb?: string; how?: string }>;
  coils: Coil[];
  act: Record<string, any>;
  gen: { id: string; b: string; o: Record<string, any>; why: string }[];
  gold: any;
  rules: any[];
  pools: Record<string, [string, number][] | any>;
  verify: { coils: number; diffs: Record<string, number> };
  /** 그림(data URL) — 따로 불러와 붙인다. */
  images: Record<string, string>;
}

export interface Geo {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ImgVer {
  src: string;
  at: string;
  name: string;
}
/** 기준값 표(인증서 · 규격 · 고객 요청) — 고칠 수 있는 규칙 자료. */
export interface DocData {
  std: Row[];
  lic: Row[];
  cus: Row[];
}
/** 서버에 저장하는 편집 문서(목업 docJSON). */
export interface TagDoc {
  data: DocData;
  style: Record<string, Record<string, number>>;
  geo: Record<string, Record<string, Geo>>;
  imgs: Record<string, ImgVer[]>;
  facts: Record<string, Record<string, string>>;
}
export type BaseDoc = Omit<TagDoc, "facts"> & { facts?: TagDoc["facts"] };

export type ItabKey = "field" | "list" | "coil" | "out";
/** 화면 보기 상태(서버에 저장하지 않는다). */
export interface View {
  coil: string;
  pick: string;
  size: string;
  media: string;
  res: string;
  diff: boolean;
  names: boolean;
  tint: boolean;
  lay: boolean;
  gsel: number | null;
  gfid: string | null;
  zoom: "fit" | number;
  itab: ItabKey;
  sel: string;
  baseTab: "lic" | "std" | "cus";
  lmode: "coil" | "form";
  role: string;
  fmf: string;
}
/** 목업 S — 편집 문서 + 적용본 + 보기 + 세션 전용(현행과 다른 것 판정 · 겹침 예시 코일). */
export interface SimState extends TagDoc {
  base: BaseDoc;
  view: View;
  review: Record<string, { v?: string; memo?: string }>;
  wit: Record<string, Coil>;
}
