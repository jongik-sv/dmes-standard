/**
 * 실행 시 등록부 합치기 — 코드 등록부 + 위젯 유형 등록부 + DB 정의·덮어쓰기 행(스펙 2026-10-02-widget-admin-generic §1.1).
 * 순수 함수라 단위 시험으로 고정한다. 코드 위젯을 덮어쓰지 않으면 원래 entry 객체를 그대로 돌려줘
 * WidgetFrame 의 지연 로딩 캐시(entry 객체 기준)가 다시 만들어지지 않게 한다.
 */
import { createElement } from "react";

import type {
  WidgetComponent,
  WidgetDefRow,
  WidgetMeta,
  WidgetProps,
  WidgetRegistry,
  WidgetRegistryEntry,
  WidgetSize,
  WidgetTypeRegistry,
  WidgetTypeRegistryEntry,
} from "./types";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const yn = (v: unknown): "Y" | "N" | null => (v === "Y" || v === "N" ? v : null);

function parseConfig(raw: unknown): unknown | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 서버 응답 한 줄(configJson 문자열 포함)을 WidgetDefRow 로 바꾼다. srcTp 가 C·D 가 아니면 null. */
export function toWidgetDefRow(raw: Record<string, unknown>): WidgetDefRow | null {
  const widgetId = str(raw.widgetId);
  const srcTp = raw.srcTp === "C" || raw.srcTp === "D" ? raw.srcTp : null;
  if (!widgetId || !srcTp) return null;
  return {
    widgetId,
    srcTp,
    typeId: str(raw.typeId),
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    description: str(raw.description),
    defW: num(raw.defW),
    defH: num(raw.defH),
    minW: num(raw.minW),
    minH: num(raw.minH),
    maxW: num(raw.maxW),
    maxH: num(raw.maxH),
    refreshSec: num(raw.refreshSec),
    linkPageId: str(raw.linkPageId),
    multipleYn: yn(raw.multipleYn),
    useYn: raw.useYn === "N" ? "N" : "Y",
    dataSrc: str(raw.dataSrc),
    config: "config" in raw ? (raw.config ?? null) : parseConfig(raw.configJson),
  };
}

function size(w: number | null, h: number | null, base: WidgetSize | undefined): WidgetSize | undefined {
  if (w === null && h === null) return base;
  if (!base && (w === null || h === null)) return undefined;
  return { w: w ?? base!.w, h: h ?? base!.h };
}

/** 코드 위젯 메타에 덮어쓰기 행을 얹는다. 비어 있는(null) 칸은 코드 값을 쓴다. */
export function applyWidgetOverride(base: WidgetMeta, row: WidgetDefRow): WidgetMeta {
  const meta: WidgetMeta = { ...base, kind: "code" };
  if (row.title) meta.title = row.title;
  if (row.subtitle) meta.subtitle = row.subtitle;
  if (row.description) meta.description = row.description;
  meta.defaultSize = size(row.defW, row.defH, base.defaultSize) ?? base.defaultSize;
  const min = size(row.minW, row.minH, base.minSize);
  if (min) meta.minSize = min;
  const max = size(row.maxW, row.maxH, base.maxSize);
  if (max) meta.maxSize = max;
  if (row.refreshSec !== null) meta.refreshSec = row.refreshSec;
  if (row.linkPageId) meta.linkPageId = row.linkPageId;
  if (row.multipleYn) meta.multiple = row.multipleYn === "Y";
  meta.disabled = row.useYn === "N";
  return meta;
}

/** 정의 위젯 메타 — 행 값, 없으면 유형 값. */
export function defWidgetMeta(row: WidgetDefRow, type: WidgetTypeRegistryEntry): WidgetMeta {
  const t = type.meta;
  const meta: WidgetMeta = {
    id: row.widgetId,
    title: row.title ?? t.title,
    defaultSize: size(row.defW, row.defH, t.defaultSize) ?? t.defaultSize,
    multiple: row.multipleYn !== "N",
    disabled: row.useYn === "N",
    kind: "def",
    typeId: t.id,
  };
  if (row.subtitle) meta.subtitle = row.subtitle;
  meta.description = row.description ?? t.description;
  const min = size(row.minW, row.minH, t.minSize);
  if (min) meta.minSize = min;
  const max = size(row.maxW, row.maxH, t.maxSize);
  if (max) meta.maxSize = max;
  if (row.refreshSec !== null) meta.refreshSec = row.refreshSec;
  if (row.linkPageId) meta.linkPageId = row.linkPageId;
  if (t.bodyPadding !== undefined) meta.bodyPadding = t.bodyPadding;
  return meta;
}

/** 유형 렌더러를 불러와 정의 설정(definition)을 끼워 넣는 본체 로더. */
export function defWidgetLoader(type: WidgetTypeRegistryEntry, definition: unknown | null): WidgetRegistryEntry["load"] {
  return async () => {
    const mod = await type.loadRenderer();
    if (typeof mod.default !== "function") throw new Error(`${type.meta.id}: renderer default export 가 컴포넌트가 아닙니다.`);
    const Renderer = mod.default as WidgetComponent;
    const Bound = (props: WidgetProps) => createElement(Renderer, { ...props, definition });
    return { default: Bound };
  };
}

/**
 * 코드 등록부 + 유형 등록부 + DB 행 → 실행 시 등록부(사용 중지 항목 포함, meta.disabled 로 표시).
 * - C 행: 코드 위젯이 있으면 덮어쓰기, 없으면 무시(코드에서 사라진 위젯 = 「없는 위젯」).
 * - D 행: 유형이 있으면 정의 위젯, 없으면 무시 + 경고(「없는 위젯」).
 */
export function mergeWidgetRegistry(
  code: WidgetRegistry,
  types: WidgetTypeRegistry,
  defs: readonly WidgetDefRow[],
): WidgetRegistry {
  const out: Record<string, WidgetRegistryEntry> = { ...code };
  for (const row of defs) {
    if (row.srcTp === "C") {
      const base = code[row.widgetId];
      if (!base) continue;
      out[row.widgetId] = { meta: applyWidgetOverride(base.meta, row), load: base.load };
      continue;
    }
    if (code[row.widgetId]) {
      console.warn(`[widget] 정의 위젯 ${row.widgetId} 가 코드 위젯 ID 와 겹쳐 건너뜁니다.`);
      continue;
    }
    const type = row.typeId ? types[row.typeId] : undefined;
    if (!type) {
      console.warn(`[widget] 정의 위젯 ${row.widgetId} 의 유형 ${row.typeId ?? "(없음)"} 이 등록부에 없어 건너뜁니다.`);
      continue;
    }
    out[row.widgetId] = { meta: defWidgetMeta(row, type), load: defWidgetLoader(type, row.config) };
  }
  return out;
}
