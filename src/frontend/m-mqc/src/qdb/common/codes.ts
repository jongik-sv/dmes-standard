/**
 * 기준정보관리(qdb) 공용 — Maru 코드 항목 읽기. 값이 없는 칸은 빈 글로 받아 화면이 다시 검사하지 않게 한다.
 */
import type { CodeItem } from "@/common/rule";

/** 값이 없음을 보이는 글. */
export const NA = "—";

/** 속성 칸 값(attr01 = 0). null·공백은 빈 글. */
export function attrOf(item: CodeItem, index: number): string {
  return (item.attrs[index] ?? "").trim();
}

/** 계층 칸 값(lvl1 = 0). null·공백은 빈 글. */
export function lvlOf(item: CodeItem, index: number): string {
  return (item.lvl[index] ?? "").trim();
}

/** 숫자 글 → 숫자. 비었거나 숫자가 아니면 null. */
export function numOrNull(text: string | null | undefined): number | null {
  const t = (text ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 코드 → 이름 사전(이름이 없으면 코드). */
export function nameMap(items: readonly CodeItem[]): Map<string, string> {
  return new Map(items.map((i) => [i.code, (i.name ?? "").trim() || i.code]));
}

/** 찾기용 소문자 글. */
export function norm(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}
