/**
 * 칼라부재료(QC_COLOR_SUBMAT) 읽기와 색 견본 — 칼라부재료관리·칼라BOM관리가 같이 쓴다.
 *
 * 속성 칸 순서는 catalog CODES.QC_COLOR_SUBMAT.attrNames 와 같다(시험이 라벨을 맞춰 본다).
 * 견본 색은 화면 표시용 근사색(sRGB)이다. RAL 표준 색표를 대신하지 않는다 — 도료 실물 색은 색상코드로 확인한다.
 */
import type { CodeItem, CodeSet } from "@/common/rule";

import { attrOf, norm, numOrNull } from "./codes";

export const SUBMAT_CODE_ID = "QC_COLOR_SUBMAT";

/** 부재료 구분(표시 순서). */
export const SUBMAT_KINDS = ["프라이머", "상도", "백코트", "보호필름"] as const;
export type SubmatKind = (typeof SUBMAT_KINDS)[number];

/** QC_COLOR_SUBMAT 속성 칸 번호(attr01 = 0) — catalog attrNames 순서. */
export const SUBMAT_ATTR = {
  kind: 0,
  resin: 1,
  maker: 2,
  colorCode: 3,
  colorName: 4,
  thicknessUm: 5,
  gloss: 6,
  pmt: 7,
} as const;

export interface Submat {
  code: string;
  name: string;
  seq: number;
  /** 구분 원문(프라이머·상도·백코트·보호필름, 모르는 값도 그대로). */
  kind: string;
  resin: string;
  maker: string;
  /** 색상코드(RAL…). 없으면 빈 글. */
  colorCode: string;
  colorName: string;
  /** 건조도막두께(㎛). */
  thicknessUm: number | null;
  /** 광택(GU). */
  gloss: number | null;
  /** PMT 원문(예: "224~232"). */
  pmt: string;
  /** PMT 범위(℃). 원문이 「하한~상한」 이 아니면 null. */
  pmtRange: { min: number; max: number } | null;
}

/** 「224~232」 → {224, 232}. 한 값이면 하한=상한. */
export function parseRange(text: string): { min: number; max: number } | null {
  const m = text
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*(?:[~∼-]\s*(-?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] == null ? min : Number(m[2]);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export function toSubmat(item: CodeItem): Submat {
  const a = (k: keyof typeof SUBMAT_ATTR) => attrOf(item, SUBMAT_ATTR[k]);
  const pmt = a("pmt");
  return {
    code: item.code,
    name: (item.name ?? "").trim() || item.code,
    seq: item.seq ?? Number.MAX_SAFE_INTEGER,
    kind: a("kind"),
    resin: a("resin"),
    maker: a("maker"),
    colorCode: a("colorCode"),
    colorName: a("colorName"),
    thicknessUm: numOrNull(a("thicknessUm")),
    gloss: numOrNull(a("gloss")),
    pmt,
    pmtRange: parseRange(pmt),
  };
}

/** 구분 순서 번호 — 모르는 구분은 뒤로. */
export function kindOrder(kind: string): number {
  const i = (SUBMAT_KINDS as readonly string[]).indexOf(kind);
  return i < 0 ? SUBMAT_KINDS.length : i;
}

/** 코드 묶음 → 부재료 목록(구분 순 → 순번 → 코드). */
export function submatsOf(codes: readonly CodeSet[]): Submat[] {
  const set = codes.find((c) => c.codeId === SUBMAT_CODE_ID);
  return (set?.items ?? [])
    .map(toSubmat)
    .sort(
      (a, b) =>
        kindOrder(a.kind) - kindOrder(b.kind) ||
        a.seq - b.seq ||
        a.code.localeCompare(b.code),
    );
}

export interface SubmatFilter {
  /** 구분. 빈 글 = 전체. */
  kind: string;
  resin: string;
  maker: string;
  /** 코드·이름·색상코드·색상명에 든 글(대소문자 무시). */
  keyword: string;
}

export const EMPTY_SUBMAT_FILTER: SubmatFilter = {
  kind: "",
  resin: "",
  maker: "",
  keyword: "",
};

export function matchesSubmat(
  s: Submat,
  f: SubmatFilter,
  withKind = true,
): boolean {
  if (withKind && f.kind && s.kind !== f.kind) return false;
  if (f.resin && s.resin !== f.resin) return false;
  if (f.maker && s.maker !== f.maker) return false;
  const k = norm(f.keyword);
  if (k === "") return true;
  return [s.code, s.name, s.colorCode, s.colorName, s.resin].some((v) =>
    norm(v).includes(k),
  );
}

export function filterSubmats(
  list: readonly Submat[],
  f: SubmatFilter,
): Submat[] {
  return list.filter((s) => matchesSubmat(s, f));
}

/**
 * 구분별 건수 — 구분 막대 숫자. 구분을 뺀 나머지 조건(수지계·제조사·검색어)을 건 결과로 센다. "" 는 전체.
 */
export function kindCounts(
  list: readonly Submat[],
  f: SubmatFilter,
): Record<string, number> {
  const out: Record<string, number> = { "": 0 };
  for (const k of SUBMAT_KINDS) out[k] = 0;
  for (const s of list) {
    if (!matchesSubmat(s, f, false)) continue;
    out[""] += 1;
    out[s.kind] = (out[s.kind] ?? 0) + 1;
  }
  return out;
}

/** 조회 조건 선택지 — 값의 중복 없는 목록(처음 나온 순서), 맨 앞 「전체」. */
export function distinctOptions(
  values: readonly string[],
): { value: string; label: string }[] {
  const seen = [...new Set(values.filter((v) => v !== ""))];
  return [
    { value: "", label: "전체" },
    ...seen.map((v) => ({ value: v, label: v })),
  ];
}

// ── 색 견본 ─────────────────────────────────────────────

/** RAL 색상코드 → 화면 표시용 근사색(sRGB). 시연 데이터에 나오는 색만 둔다. */
export const RAL_APPROX: Record<string, string> = {
  RAL1015: "#E6D690",
  RAL5015: "#2271B3",
  RAL6005: "#2F4538",
  RAL7016: "#293133",
  RAL7035: "#CBD0CC",
  RAL9002: "#E7EBDA",
  RAL9006: "#A5A5A5",
  RAL9010: "#F7F5EE",
};

/** 색상명 → 근사색(색상코드가 없는 프라이머·백코트·필름). 「투명」 이 든 이름은 반투명으로 칠한다. */
const NAME_APPROX: [pattern: RegExp, color: string][] = [
  [/황색/, "#E9D79A"],
  [/흑백/, "#4A4A4A"],
  [/회백/, "#E7EBDA"],
  [/백색|화이트/, "#F7F7F2"],
  [/회색|그레이/, "#9EA3A6"],
  [/투명/, "#DCE8EF"],
];

export interface Swatch {
  /** CSS 색. */
  color: string;
  /** 「투명」 계열 — 반투명·점선으로 그린다. */
  translucent: boolean;
  /** 어디서 정했나 — RAL 색상코드, 색상명, 없음. */
  source: "ral" | "name" | "none";
}

/** RAL 글 정리 — 「RAL 9002」·「ral9002」 → 「RAL9002」. */
export function normRal(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** 색상코드·색상명 → 견본. 둘 다 모르면 source "none"(회색 빗금 대신 빈 견본). */
export function swatchOf(colorCode: string, colorName: string): Swatch {
  const translucent = /투명/.test(colorName);
  const ral = RAL_APPROX[normRal(colorCode)];
  if (ral) return { color: ral, translucent, source: "ral" };
  for (const [p, c] of NAME_APPROX)
    if (p.test(colorName)) return { color: c, translucent, source: "name" };
  return { color: "transparent", translucent: true, source: "none" };
}

/** 견본 설명 글 — 「RAL9002 회백색」·「회색」·「—」. */
export function colorText(colorCode: string, colorName: string): string {
  const t = [colorCode, colorName].filter((v) => v !== "").join(" ");
  return t === "" ? "—" : t;
}
