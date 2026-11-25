/**
 * 설계 형상 그림 계산 — mes-to-be assets/shape/shape-svg.js 의 순수 함수 이식(ShapeModel 은 서버가 만든다).
 * 층 색 6개는 업무 그림 색(핫코일·소지·도금·프라이머·Top·Back)이라 상수로 둔다. 그 밖의 색은 의미 토큰을 쓴다.
 */
import type { ShapeLayer, ShapeModel, ShapeScene } from "../types";

export const COLORS = {
  hot: "#6B4A3A",
  substrate: "#5A6470",
  coating: "#9FB7C3",
  primer: "#E0B95E",
  topcoat: "#C9A24B",
  backcoat: "#B8B0A0",
} as const;

export type SurfaceKind = "hot" | "substrate" | "coating" | "paint";

/** hex 색을 흰색(amount>0) 또는 검은색(amount<0)쪽으로 섞는다. amount ∈ [-1, 1]. */
export function tint(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const mix = (c: number) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c + c * amount;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const toHex = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
  return "#" + [0, 2, 4].map((i) => toHex(mix(parseInt(n.slice(i, i + 2), 16)))).join("");
}

/** 코일 몸통 그라디언트(밝음→중간→어두움)와 끝면 색. */
export function surfaceTones(kind: SurfaceKind): { body: string[]; face: string[] } {
  const base = kind === "hot" ? COLORS.hot : kind === "coating" ? COLORS.coating : kind === "paint" ? COLORS.topcoat : COLORS.substrate;
  return {
    body: [tint(base, 0.45), base, tint(base, -0.35)],
    face: [tint(base, 0.7), tint(base, 0.15), tint(base, -0.35)],
  };
}

export const SIZES = {
  sm: { w: 110, h: 64, x0: 14, cy: 32, rx: 9, ry: 22, minLen: 52, maxLen: 76 },
  lg: { w: 320, h: 210, x0: 34, cy: 98, rx: 20, ry: 48, minLen: 96, maxLen: 136 },
} as const;
export type CoilSize = keyof typeof SIZES;

export const GAP_PX = 6;
export const CUT = { cx: 252, cy: 118, r: 46, x: 206, w: 92, innerH: 84 } as const;

/** mm 표시 — 100 이상은 천 단위 정수, 그 아래는 소수 3자리. */
export function fmtMm(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.abs(n) >= 100 ? Math.round(n).toLocaleString("ko-KR") : n.toFixed(3);
}

export function fmtUm(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : String(Math.round(n));
}

/** 부호 있는 차이 — 음수는 「−」(빼기 기호). */
export function fmtDelta(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const a = Math.abs(n);
  return sign + (Number.isInteger(a) ? String(a) : a.toFixed(3));
}

/** 겉층 종류 → 표면 색 키. */
export function surfaceOf(scene: ShapeScene): SurfaceKind {
  if (scene.id === "raw") return "hot";
  const top = scene.layers.find((l) => l.side === "top") ?? scene.layers[0];
  if (!top) return "substrate";
  if (top.kind === "topcoat" || top.kind === "primer") return "paint";
  if (top.kind === "zinc" || top.kind === "az" || top.kind === "am") return "coating";
  return "substrate";
}

export function layerColor(l: ShapeLayer, scene?: Pick<ShapeScene, "id">): string {
  if (l.kind === "substrate") return scene?.id === "raw" ? COLORS.hot : COLORS.substrate;
  if (l.kind === "zinc" || l.kind === "az" || l.kind === "am") return COLORS.coating;
  return COLORS[l.kind] ?? COLORS.substrate;
}

export function layerThkText(l: ShapeLayer): string {
  return l.kind === "substrate" ? fmtMm(l.thkUm == null ? null : l.thkUm / 1000) + " mm" : fmtUm(l.thkUm) + " µm";
}

export function layerDesc(scene: ShapeScene): string {
  return scene.layers.map((l) => l.label + " " + layerThkText(l)).join(", ");
}

/** 장면별 코일 몸통 길이(px). 폭에 비례하되 폭이 다른 장면끼리 최소 GAP_PX 차이를 둔다. */
export function coilLengths(model: Pick<ShapeModel, "scenes">, size: CoilSize): Record<string, number> {
  const sz = SIZES[size];
  const scenes = model.scenes ?? [];
  const known = scenes.map((s) => s.geometry?.widMm).filter((w): w is number => w != null);
  const max = known.length ? Math.max(...known) : null;
  const min = known.length ? Math.min(...known) : null;
  const out: Record<string, number> = {};
  scenes.forEach((s) => {
    const w = s.geometry?.widMm;
    out[s.id] =
      w == null || max === min || max == null || min == null
        ? sz.maxLen
        : Math.round(sz.minLen + ((sz.maxLen - sz.minLen) * (w - min)) / (max - min));
  });
  const sorted = scenes
    .filter((s) => s.geometry?.widMm != null)
    .sort((a, b) => (a.geometry.widMm as number) - (b.geometry.widMm as number));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (b.geometry.widMm !== a.geometry.widMm && out[b.id] - out[a.id] < GAP_PX) out[b.id] = out[a.id] + GAP_PX;
    if (b.geometry.widMm === a.geometry.widMm) out[b.id] = out[a.id];
  }
  return out;
}

/** 단면 확대 원 안의 층 높이(px). 소지는 46%, 그 외는 로그 눈금 4~12px. */
export function layerHeights(layers: Pick<ShapeLayer, "kind" | "thkUm">[], innerH: number): number[] {
  const subH = Math.round(innerH * 0.46);
  return layers.map((l) => {
    if (l.kind === "substrate") return subH;
    const t = l.thkUm == null ? 1 : Math.max(l.thkUm, 1);
    return Math.max(4, Math.min(12, Math.round(4 + 4 * Math.log10(t))));
  });
}

/** 띠 칸 아래 크기 글 — 압연 장면은 「Set 」 을 붙인다. */
export function geoLine(s: ShapeScene): string {
  return (s.id === "rolled" ? "Set " : "") + fmtMm(s.geometry.thkMm) + " × " + fmtMm(s.geometry.widMm);
}

/** 앞 장면과의 차이 글 「두께 −1.370 · 폭 +3 · 층 +2」. */
export function changeLine(s: ShapeScene): string {
  return s.changes
    .map((c) =>
      c.key === "thk_mm" ? "두께 " + fmtDelta(c.delta) : c.key === "wid_mm" ? "폭 " + fmtDelta(c.delta) : "층 " + fmtDelta(c.delta),
    )
    .join(" · ");
}

/** 상세 머리의 변화 글 「두께 1.800 → 0.430 · 폭 1,507 → 1,503」(층 변화는 뺀다). */
export function changeDetail(s: ShapeScene): string {
  return s.changes
    .filter((c) => c.key !== "layers")
    .map((c) => (c.key === "thk_mm" ? "두께 " : "폭 ") + fmtMm(c.from) + " → " + fmtMm(c.to))
    .join(" · ");
}

/** 값 표시 글. mm 숫자는 fmtMm, 그 밖 숫자는 그대로. */
export function valueText(value: string | number | null, unit: string | null): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return unit === "mm" ? fmtMm(value) : String(value);
  return value;
}

/** 서버가 summary 를 비워 보냈을 때 쓰는 요약줄(shape-svg renderSummary 와 같은 규칙). */
export function buildSummary(model: ShapeModel): string {
  const by = (id: ShapeScene["id"]) => model.scenes.find((s) => s.id === id);
  const parts: string[] = [];
  const raw = by("raw");
  const rolled = by("rolled");
  const coated = by("coated");
  const painted = by("painted");
  const product = by("product");
  if (raw) parts.push("원자재 " + fmtMm(raw.geometry.thkMm) + "×" + fmtMm(raw.geometry.widMm));
  if (rolled) parts.push("Set " + fmtMm(rolled.geometry.thkMm) + "×" + fmtMm(rolled.geometry.widMm));
  if (coated) {
    const c = coated.values.find((v) => v.key === "coat_cd");
    if (c && c.value != null) parts.push(String(c.value).split(" : ")[0]);
  }
  if (painted) {
    const p = painted.values.find((v) => v.key === "paint_way");
    if (p && p.value != null) parts.push(String(p.value).split(" : ").pop() as string);
  }
  if (product) parts.push("제품 " + fmtMm(product.geometry.thkMm) + "×" + fmtMm(product.geometry.widMm));
  return model.productType + " · " + parts.join(" → ");
}

export const LEGEND: [keyof typeof COLORS, string][] = [
  ["hot", "핫코일"],
  ["substrate", "소지(냉연)"],
  ["coating", "도금"],
  ["primer", "프라이머"],
  ["topcoat", "Top 코트"],
  ["backcoat", "Back 코트"],
];
