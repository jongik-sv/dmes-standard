/**
 * 도장 단면 그림의 배치(순수 함수) — 층 높이·글 자리·전면/후면 묶음 괄호. 그림은 CoatingStack.tsx 가 그린다.
 *
 * 두께는 비례로 그리지 않는다. 강판(수백 ㎛)과 도막(5~25 ㎛)이 한 그림에 들어가지 않으므로 층을 구분할 만큼만 키운다.
 * 글은 층 가운데 높이에 두되, 앞 글과 겹치면 아래로 민다(지시선이 층과 글을 잇는다).
 */
import { swatchOf, type Swatch } from "../common/color";
import {
  STEEL_ORDER,
  umText,
  type Bom,
  type BomLayer,
  type LayerSide,
} from "../common/bom";

export const STACK = {
  width: 720,
  top: 14,
  /** 층 막대 x 범위. */
  x0: 150,
  x1: 330,
  /** 오른쪽 글 시작 x. */
  labelX: 352,
  /** 층 두께 글 오른쪽 끝 x. */
  thkX: 140,
  /** 전면·후면 괄호 x. */
  braceX: 88,
  /** 글 두 줄 묶음 사이 최소 간격. */
  labelGap: 30,
  steelHeight: 64,
} as const;

export interface StackBand {
  key: string;
  kind: "layer" | "steel";
  side: LayerSide | "steel";
  y: number;
  height: number;
  /** 글 첫 줄 y(기준선). */
  labelY: number;
  title: string;
  sub: string;
  thkText: string;
  swatch: Swatch | null;
  layer: BomLayer | null;
}

export interface StackBrace {
  side: "front" | "back";
  y0: number;
  y1: number;
  text: string;
}

export interface StackLayout {
  bands: StackBand[];
  braces: StackBrace[];
  height: number;
  /** 그림 설명(스크린 리더·툴팁). */
  summary: string;
}

/** 층 그림 높이(px) — 두께에 따라 조금 늘지만 비례는 아니다. */
export function bandHeight(layer: BomLayer): number {
  const t = layer.thicknessUm ?? 0;
  if (layer.side === "film") return Math.round(Math.min(34, 24 + t * 0.1));
  return Math.round(Math.min(44, Math.max(22, 16 + t * 1.1)));
}

function layerSub(l: BomLayer): string {
  const color = [l.colorCode, l.colorName].filter((v) => v !== "").join(" ");
  return [l.submatCode, color].filter((v) => v !== "").join(" · ");
}

export function stackLayout(bom: Bom): StackLayout {
  const items: (BomLayer | "steel")[] = [];
  let steelPlaced = false;
  for (const l of bom.layers) {
    if (!steelPlaced && l.order > STEEL_ORDER) {
      items.push("steel");
      steelPlaced = true;
    }
    items.push(l);
  }
  if (!steelPlaced) items.push("steel");

  const bands: StackBand[] = [];
  let y: number = STACK.top;
  let lastLabel = -Infinity;
  for (const it of items) {
    const isSteel = it === "steel";
    const height = isSteel ? STACK.steelHeight : bandHeight(it);
    const center = y + height / 2;
    // 두 줄 글의 가운데를 층 가운데에 맞춘다(첫 줄 기준선 = 가운데 - 2).
    const labelY = Math.max(center - 2, lastLabel + STACK.labelGap);
    lastLabel = labelY;
    bands.push(
      isSteel
        ? {
            key: "steel",
            kind: "steel",
            side: "steel",
            y,
            height,
            labelY,
            title: "강판(소지·도금)",
            sub: "도장 원판",
            thkText: "",
            swatch: null,
            layer: null,
          }
        : {
            key: it.itemCode,
            kind: "layer",
            side: it.side,
            y,
            height,
            labelY,
            title: `${it.layerName} · ${it.submatName || it.submatCode || "부재료 없음"}`,
            sub: layerSub(it),
            thkText: umText(it.thicknessUm),
            swatch: swatchOf(it.colorCode, it.colorName),
            layer: it,
          },
    );
    y += height;
  }

  const braces: StackBrace[] = [];
  for (const side of ["front", "back"] as const) {
    const bs = bands.filter((b) => b.side === side);
    if (bs.length === 0) continue;
    braces.push({
      side,
      y0: bs[0].y,
      y1: bs[bs.length - 1].y + bs[bs.length - 1].height,
      text: `${side === "front" ? "전면" : "후면"} ${umText(side === "front" ? bom.frontUm : bom.backUm)}`,
    });
  }

  const height = Math.ceil(Math.max(y, lastLabel + 16) + 26);
  const parts = [
    `${bom.bomNo} ${bom.bomName} 도장 단면`,
    `전면 도막 ${umText(bom.frontUm)}`,
    `후면 도막 ${umText(bom.backUm)}`,
    `도막 합계 ${umText(bom.coatUm)}`,
  ];
  if (bom.hasFilm) parts.push(`보호필름 ${umText(bom.filmUm)}(별도)`);
  return { bands, braces, height, summary: parts.join(", ") };
}
