/**
 * 설계결과 섹션 정의와 요약줄 — quality-design.html SECS 의 이식(순수 함수). 표 머리(두 단 머리)도 여기서 정한다.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import type { DesignDoc, ShapeModel } from "./types";

export type SectionKey = "shape" | "common" | "mat" | "tol" | "cgl" | "egl" | "post" | "color" | "route" | "comp";

export interface SectionDef {
  key: SectionKey;
  title: string;
}

export const SECTIONS: SectionDef[] = [
  { key: "shape", title: "설계 형상" },
  { key: "common", title: "공통" },
  { key: "mat", title: "재질" },
  { key: "tol", title: "인수도" },
  { key: "cgl", title: "용융도금 - 제조표준" },
  { key: "egl", title: "전기도금 - 제조표준" },
  { key: "post", title: "후공정 - 제조표준" },
  { key: "color", title: "칼라제조사양" },
  { key: "route", title: "통과공정" },
  { key: "comp", title: "성분" },
];

/** 두 단 머리 정의 — t 는 머리, s 가 있으면 아래 단 머리들. */
export interface HeadDef {
  t: string;
  s?: string[];
}

const LH = ["하", "상"];
export const HEADS = {
  matBands: [
    { t: "사양구분" },
    { t: "HRB", s: LH },
    { t: "YP(MPa)", s: LH },
    { t: "TS(MPa)", s: LH },
    { t: "EL(%)", s: LH },
    { t: "ERI(mm)", s: LH },
    { t: "굴곡" },
  ],
  matSpc: [
    { t: "사양구분" },
    { t: "시편채취위치" },
    { t: "시편채취길이(mm)" },
    { t: "시편가공코드" },
    { t: "EGL도금량(g/㎡)", s: ["전면하한", "전면상한", "후면하한", "후면상한"] },
    { t: "CGL시험도금량(g/㎡)", s: ["하한", "상한"] },
  ],
  tols: [{ t: "사양구분" }, { t: "두께공차(mm)", s: LH }, { t: "폭공차(mm)", s: LH }, { t: "길이공차(mm)", s: LH }],
  tolBase: [
    { t: "적용기준" },
    { t: "두께구분" },
    { t: "제품 두께 범위", s: LH },
    { t: "제품 폭 범위", s: LH },
    { t: "제품 길이 범위", s: LH },
  ],
  tolShape: [
    { t: "사양구분" },
    { t: "반곡" },
    { t: "중곡" },
    { t: "외곡" },
    { t: "직각도" },
    { t: "직선도" },
    { t: "대각선공차" },
    { t: "급준도" },
    { t: "TELESCOPE" },
  ],
  cglLines: [
    { t: "적차선" },
    { t: "원자재 코드" },
    { t: "원자재 선호도" },
    { t: "두께", s: ["목표", "하한", "상한"] },
    { t: "폭 목표" },
  ],
  cglOps: [{ t: "라인" }, { t: "소둔Cycle" }, { t: "HT(℃)" }, { t: "CT(℃)" }, { t: "ST(℃)" }, { t: "Line Speed" }],
  film: [
    { t: "관리점착력" },
    { t: "상세코드" },
    { t: "부착위치" },
    { t: "두께" },
    { t: "폭" },
    { t: "SUS점착력" },
    { t: "제품점착력" },
  ],
  colorMatrix: [
    { t: "구분" },
    { t: "Top", s: ["4Coat", "3Coat", "2Coat", "1Coat"] },
    { t: "Back", s: ["1Coat"] },
    { t: "Lamina", s: ["접착제", "필름", "인쇄"] },
  ],
  route: [{ t: "순서" }, { t: "주공정" }, { t: "MaterialCode" }],
  compG1: [
    { t: "사양구분" },
    { t: "C(%)", s: LH },
    { t: "Si(%)", s: LH },
    { t: "Mn(%)", s: LH },
    { t: "P(%)", s: LH },
    { t: "S(%)", s: LH },
    { t: "Cr(%)", s: LH },
    { t: "Ni(%)", s: LH },
  ],
  compG2: [
    { t: "사양구분" },
    { t: "Cu(%)", s: LH },
    { t: "Al(%)", s: LH },
    { t: "Ti(%)", s: LH },
    { t: "Nb(%)", s: LH },
    { t: "V(%)", s: LH },
    { t: "N(%)", s: LH },
  ],
} satisfies Record<string, HeadDef[]>;

/** 잎 열 수(두 단 머리를 편 칸 수). */
export function leafCount(heads: HeadDef[]): number {
  return heads.reduce((n, h) => n + (h.s ? h.s.length : 1), 0);
}

/** [라벨, 값] 줄에서 라벨 값. 없으면 "". */
export function kv(rows: readonly (readonly unknown[])[] | undefined, label: string): string {
  const r = rows?.find((x) => x[0] === label);
  return r == null || r[1] == null ? "" : String(r[1]);
}

const dash = (v: unknown) => (v == null || String(v).trim() === "" ? "-" : String(v));
const range = (a: unknown, b: unknown) => `${dash(a)}~${dash(b)}`;

/** 「1P - PLTCM」 → 「PLTCM」. */
export function stepName(step: string): string {
  const parts = String(step ?? "").split(" - ");
  return (parts[1] ?? parts[0]).trim();
}

/** 섹션 머리 요약줄(quality-design.html 의 SECS[].sum). */
export function sectionSummary(key: SectionKey, d: DesignDoc, shape?: ShapeModel | null): string {
  switch (key) {
    case "shape":
      return shape?.summary ?? "";
    case "common":
      return `${kv(d.common, "품질설계상태") || "-"} · 도금량 ${(kv(d.common, "도금량코드") || "-").split(" : ")[0]}`;
    case "mat": {
      const r = d.mat?.bands?.[2] ?? [];
      return `YP ${range(r[3], r[4])} · TS ${range(r[5], r[6])} · 굴곡 ${dash(r[11])}`;
    }
    case "tol": {
      const b = d.tol?.base?.[0] ?? [];
      return `설계기준 ${dash(b[1])} ${range(b[2], b[3])} · 폭 ${range(b[4], b[5])}`;
    }
    case "cgl": {
      const c = d.cgl?.coat;
      return `두께목표 ${kv(d.cgl?.pltcm, "두께목표값") || "-"} · 폭 ${kv(d.cgl?.pltcm, "폭목표값(주공정)") || "-"} · 도금 ${c ? range(c.min, c.max) : "-"}g/㎡`;
    }
    case "egl":
      return d.egl ? "설계값 있음" : "해당 없음";
    case "post":
      return `제품폭범위 ${range(d.post?.wMin, d.post?.wMax)} · ${(d.post?.pack || "-").split(" : ")[0]}`;
    case "color":
      return d.color ? `${d.color.sum.name || "-"} · ${d.color.sum.way || "-"}` : "해당 없음";
    case "route":
      return (d.route?.rows ?? []).map((r) => stepName(r[1])).join(" → ") || "-";
    case "comp": {
      const r = d.comp?.g1?.[2] ?? [];
      return `C ≤ ${dash(r[2])} · Mn ≤ ${dash(r[6])} · P ≤ ${dash(r[8])}`;
    }
    default:
      return "";
  }
}

/** 설계 경로 머리(섹션 키) — 「cgl.lines.적정.1」 → 「cgl」. 근거 경로가 어느 섹션 것인지 고를 때 쓴다. */
export function sectionOfPath(path: string): SectionKey | null {
  const head = path.split(".")[0];
  if (head === "head") return "common";
  return (SECTIONS.find((s) => s.key === head)?.key ?? null) as SectionKey | null;
}

// ── 띠 표 열·행 ──

/** 두 단 머리 → GridColumn[](잎 열 키 c0, c1, …). 첫 열은 행 머리(사양구분 등)라 조금 넓다. */
export function bandColumns(heads: HeadDef[]): GridColumn[] {
  let i = 0;
  const leaf = (header: string, first: boolean): GridColumn => {
    const key = `c${i++}`;
    return first
      ? { key, header, width: 3, minWidth: 84, align: "left", sortable: false, meta: false }
      : { key, header, width: 2, minWidth: 56, align: "center", sortable: false, meta: false };
  };
  return heads.map((h, gi) =>
    h.s
      ? { key: `g${gi}`, header: h.t, meta: false, children: h.s.map((s) => leaf(s, false)) }
      : leaf(h.t, gi === 0),
  );
}

/** string[][] → 그리드 행(_k + c0…). */
export function bandRows(rows: readonly (readonly unknown[])[] | undefined): Record<string, unknown>[] {
  return (rows ?? []).map((r, ri) => {
    const o: Record<string, unknown> = { _k: `${ri}` };
    r.forEach((v, ci) => {
      o[`c${ci}`] = v == null ? "" : String(v);
    });
    return o;
  });
}

