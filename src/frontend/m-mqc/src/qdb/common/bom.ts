/**
 * 칼라BOM(QC_COLOR_BOM) — 항목(BOM 번호-층코드)을 BOM 하나로 묶고 층마다 칼라부재료(QC_COLOR_SUBMAT)를 붙인다(순수 함수).
 *
 * 항목 모양: 코드 = BOM번호-층코드, lvl1 = BOM 번호, 속성 = catalog CODES.QC_COLOR_BOM.attrNames 순서
 * (BOM 이름·적용 품명·층·부재료코드·부재료명·도막두께(㎛)·색상명·색상코드).
 * 도막 합계는 도료 층(전면·후면)만 더한다. 보호필름은 출하 뒤 벗기는 층이라 따로 보인다.
 */
import type { CodeSet } from "@/common/rule";

import { attrOf, lvlOf, nameMap, norm, numOrNull } from "./codes";
import { submatsOf, type Submat } from "./color";

export const BOM_CODE_ID = "QC_COLOR_BOM";
export const PRD_CODE_ID = "QC_PRD_NM_CD";

/** QC_COLOR_BOM 속성 칸 번호(attr01 = 0) — catalog attrNames 순서. */
export const BOM_ATTR = {
  bomName: 0,
  prdCode: 1,
  layerName: 2,
  submatCode: 3,
  submatName: 4,
  thicknessUm: 5,
  colorName: 6,
  colorCode: 7,
} as const;

export type LayerSide = "film" | "front" | "back";

/** 알려진 층코드 — 단면 순서(위 → 아래). 강판은 order 50 자리다. */
export const LAYER_DEFS: Record<
  string,
  { label: string; side: LayerSide; order: number }
> = {
  PF: { label: "보호필름", side: "film", order: 0 },
  FT: { label: "전면 상도", side: "front", order: 10 },
  FP: { label: "전면 프라이머", side: "front", order: 20 },
  BP: { label: "후면 프라이머", side: "back", order: 60 },
  BC: { label: "후면 백코트", side: "back", order: 70 },
};

export const STEEL_ORDER = 50;

export interface BomLayer {
  /** 항목 코드(BOM번호-층코드). */
  itemCode: string;
  layerCode: string;
  /** 층 이름(BOM 속성 「층」, 없으면 알려진 층 이름). */
  layerName: string;
  side: LayerSide;
  order: number;
  submatCode: string;
  /** 부재료명 — 부재료 기준 이름, 없으면 BOM 에 적힌 이름. */
  submatName: string;
  /** 이 층에 쓰는 도막두께 — BOM 값, 없으면 부재료 기준값. */
  thicknessUm: number | null;
  /** BOM 에 적힌 도막두께. */
  bomThicknessUm: number | null;
  /** 부재료 기준 건조도막두께. */
  stdThicknessUm: number | null;
  /** BOM 값과 부재료 기준값이 둘 다 있고 다르다. */
  thicknessDiffers: boolean;
  colorCode: string;
  colorName: string;
  /** 붙은 부재료. 기준에 없는 코드면 null. */
  submat: Submat | null;
}

export interface Bom {
  bomNo: string;
  bomName: string;
  prdCode: string;
  /** 단면 순서(위 → 아래). */
  layers: BomLayer[];
  /** 전면 도료 층 합(㎛). */
  frontUm: number;
  /** 후면 도료 층 합(㎛). */
  backUm: number;
  /** 도막 합계 = 전면 + 후면(보호필름 제외). */
  coatUm: number;
  /** 보호필름 두께 합(㎛). */
  filmUm: number;
  hasFilm: boolean;
  /** 전면 상도 층(겉 색). 없으면 전면 맨 위 도료 층. */
  topCoat: BomLayer | null;
  /** 부재료 기준에 없는 부재료코드. */
  missingSubmats: string[];
  /** 두께가 비어 합계에 못 넣은 층 코드. */
  unknownThickness: string[];
}

/** 항목 코드 → 층코드. 「BOM번호-」 로 시작하면 나머지, 아니면 마지막 「-」 뒤. */
export function layerCodeOf(itemCode: string, bomNo: string): string {
  if (bomNo && itemCode.startsWith(`${bomNo}-`))
    return itemCode.slice(bomNo.length + 1);
  const i = itemCode.lastIndexOf("-");
  return i < 0 ? itemCode : itemCode.slice(i + 1);
}

/** 모르는 층코드의 자리 — 이름에 「후면」 이면 후면, 「필름」 이면 맨 위, 아니면 전면 프라이머 위. */
function guessLayer(layerName: string): { side: LayerSide; order: number } {
  if (/필름/.test(layerName)) return { side: "film", order: 1 };
  if (/후면|이면|백/.test(layerName)) return { side: "back", order: 65 };
  return { side: "front", order: 15 };
}

const sum = (xs: (number | null)[]) =>
  xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** 코드 묶음 → BOM 목록(처음 나온 순서). 층은 단면 순서로 둔다. */
export function bomsOf(codes: readonly CodeSet[]): Bom[] {
  const subs = new Map(submatsOf(codes).map((s) => [s.code, s]));
  const items = [
    ...(codes.find((c) => c.codeId === BOM_CODE_ID)?.items ?? []),
  ].sort(
    (a, b) =>
      (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER),
  );
  const order: string[] = [];
  const byNo = new Map<
    string,
    { bomName: string; prdCode: string; layers: BomLayer[] }
  >();
  for (const item of items) {
    const a = (k: keyof typeof BOM_ATTR) => attrOf(item, BOM_ATTR[k]);
    const layerFromCode = item.code.lastIndexOf("-");
    const bomNo =
      lvlOf(item, 0) ||
      (layerFromCode < 0 ? item.code : item.code.slice(0, layerFromCode));
    const layerCode = layerCodeOf(item.code, bomNo);
    const def = LAYER_DEFS[layerCode];
    const layerName = a("layerName") || def?.label || layerCode;
    const place = def ?? guessLayer(layerName);
    const submatCode = a("submatCode");
    const submat = subs.get(submatCode) ?? null;
    const bomThicknessUm = numOrNull(a("thicknessUm"));
    const stdThicknessUm = submat?.thicknessUm ?? null;
    const layer: BomLayer = {
      itemCode: item.code,
      layerCode,
      layerName,
      side: place.side,
      order: place.order,
      submatCode,
      submatName: submat?.name ?? a("submatName"),
      thicknessUm: bomThicknessUm ?? stdThicknessUm,
      bomThicknessUm,
      stdThicknessUm,
      thicknessDiffers:
        bomThicknessUm != null &&
        stdThicknessUm != null &&
        bomThicknessUm !== stdThicknessUm,
      colorCode: a("colorCode") || submat?.colorCode || "",
      colorName: a("colorName") || submat?.colorName || "",
      submat,
    };
    let bom = byNo.get(bomNo);
    if (!bom) {
      bom = { bomName: a("bomName"), prdCode: a("prdCode"), layers: [] };
      byNo.set(bomNo, bom);
      order.push(bomNo);
    }
    if (!bom.bomName) bom.bomName = a("bomName");
    if (!bom.prdCode) bom.prdCode = a("prdCode");
    bom.layers.push(layer);
  }
  return order.map((bomNo) => {
    const b = byNo.get(bomNo)!;
    const layers = [...b.layers].sort(
      (x, y) => x.order - y.order || x.layerCode.localeCompare(y.layerCode),
    );
    const of = (side: LayerSide) => layers.filter((l) => l.side === side);
    const frontUm = sum(of("front").map((l) => l.thicknessUm));
    const backUm = sum(of("back").map((l) => l.thicknessUm));
    const filmUm = sum(of("film").map((l) => l.thicknessUm));
    return {
      bomNo,
      bomName: b.bomName || bomNo,
      prdCode: b.prdCode,
      layers,
      frontUm,
      backUm,
      coatUm: frontUm + backUm,
      filmUm,
      hasFilm: of("film").length > 0,
      topCoat:
        layers.find((l) => l.layerCode === "FT") ?? of("front")[0] ?? null,
      missingSubmats: layers
        .filter((l) => l.submatCode !== "" && l.submat == null)
        .map((l) => l.submatCode),
      unknownThickness: layers
        .filter((l) => l.thicknessUm == null)
        .map((l) => l.layerCode),
    };
  });
}

// ── 찾기 ────────────────────────────────────────────────

export interface BomFilter {
  /** 적용 품명 코드. 빈 글 = 전체. */
  prd: string;
  /** 보호필름 — "" 전체, "Y" 있음, "N" 없음. */
  film: string;
  /** BOM 번호·이름·층 부재료코드·부재료명·색상에 든 글(대소문자 무시). */
  keyword: string;
}

export const EMPTY_BOM_FILTER: BomFilter = { prd: "", film: "", keyword: "" };

export const FILM_OPTIONS = [
  { value: "", label: "전체" },
  { value: "Y", label: "있음" },
  { value: "N", label: "없음" },
];

export function filterBoms(boms: readonly Bom[], f: BomFilter): Bom[] {
  const k = norm(f.keyword);
  return boms.filter((b) => {
    if (f.prd && b.prdCode !== f.prd) return false;
    if (f.film === "Y" && !b.hasFilm) return false;
    if (f.film === "N" && b.hasFilm) return false;
    if (k === "") return true;
    return [
      b.bomNo,
      b.bomName,
      ...b.layers.flatMap((l) => [
        l.submatCode,
        l.submatName,
        l.colorCode,
        l.colorName,
      ]),
    ].some((v) => norm(v).includes(k));
  });
}

/** 품명 표시 — 「3 · CCGI」. 이름을 모르면 코드만. */
export function prdLabel(
  prdCode: string,
  prdNames: Map<string, string>,
): string {
  if (!prdCode) return "—";
  const name = prdNames.get(prdCode);
  return name && name !== prdCode ? `${prdCode} · ${name}` : prdCode;
}

/** 품명 이름 사전(QC_PRD_NM_CD). */
export function prdNamesOf(codes: readonly CodeSet[]): Map<string, string> {
  return nameMap(codes.find((c) => c.codeId === PRD_CODE_ID)?.items ?? []);
}

/** 조회 조건 「적용 품명」 선택지 — BOM 에 나온 품명만(코드 순). */
export function prdOptions(
  boms: readonly Bom[],
  prdNames: Map<string, string>,
): { value: string; label: string }[] {
  const codes = [
    ...new Set(boms.map((b) => b.prdCode).filter((c) => c !== "")),
  ].sort();
  return [
    { value: "", label: "전체" },
    ...codes.map((c) => ({ value: c, label: prdLabel(c, prdNames) })),
  ];
}

/** 부재료 코드 → 그 부재료를 쓰는 BOM 층(칼라부재료관리 「사용 BOM」). */
export function usagesOf(
  boms: readonly Bom[],
  submatCode: string,
): {
  bomNo: string;
  bomName: string;
  layerName: string;
  thicknessUm: number | null;
}[] {
  return boms.flatMap((b) =>
    b.layers
      .filter((l) => l.submatCode === submatCode)
      .map((l) => ({
        bomNo: b.bomNo,
        bomName: b.bomName,
        layerName: l.layerName,
        thicknessUm: l.thicknessUm,
      })),
  );
}

/** ㎛ 글 — 정수면 소수점 없이. */
export function umText(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ㎛`;
}
