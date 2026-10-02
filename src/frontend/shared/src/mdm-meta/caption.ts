import type { MdmCaptionKind, MdmCaptionPriority, MdmScreenColumn } from "./types";

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** MDM 이 주는 캡션(spec B2). 그리드: labelShort → labelMid → labelLong → columnName, 폼: labelMid → labelLong → labelShort → columnName. */
export function mdmCaption(column: MdmScreenColumn | null | undefined, kind: MdmCaptionKind): string | null {
  if (!column) return null;
  return kind === "grid"
    ? firstText(column.labelShort, column.labelMid, column.labelLong, column.columnName)
    : firstText(column.labelMid, column.labelLong, column.labelShort, column.columnName);
}

/**
 * 화면에 보일 캡션(spec B1·B2).
 *
 * - `explicit`(기본): 화면이 적은 값 → MDM 캡션 → 화면 키.
 * - `mdm`: MDM 캡션 → 화면이 적은 값 → 화면 키.
 *
 * "적지 않음" 은 `undefined`·`null` 뿐이다. 빈 문자열(`header: ""`)은 일부러 비운 머리글(버튼·아이콘 칸)이라 explicit 에서 그대로 둔다.
 */
export function resolveCaption(
  column: MdmScreenColumn | null,
  kind: MdmCaptionKind,
  explicit: string | null | undefined,
  priority: MdmCaptionPriority,
  fallbackKey: string
): string {
  const fromMdm = mdmCaption(column, kind);
  const given = explicit ?? null;
  if (priority === "mdm") return fromMdm ?? given ?? fallbackKey;
  return given ?? fromMdm ?? fallbackKey;
}
