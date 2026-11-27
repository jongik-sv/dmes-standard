/**
 * 켜고 끄는 칩 묶음 순수 함수 — 업무 도메인과 무관하다.
 *
 * - 값은 문자열 목록이다. 결과 순서는 항상 `order`(옵션 순서)를 따르고, `order` 에 없는 값은 뒤에 원래 순서로 남긴다(잃지 않는다).
 * - 모든 함수는 입력 배열을 바꾸지 않는다.
 */

/** 칩의 모양 상태 — 켜짐·꺼짐, 그리고 기준(`base`)과 비교한 추가(켜졌는데 기준엔 없음)·제거(꺼졌는데 기준엔 있음). */
export type ChipDiffState = "on" | "off" | "added" | "removed";

/** `values` 를 `order` 순서로 맞춘다. 중복은 하나로, `order` 밖의 값은 뒤에 그대로. */
export function orderValues(values: readonly string[], order: readonly string[]): string[] {
  const set = new Set(values);
  const known = order.filter((o) => set.has(o));
  const knownSet = new Set(known);
  const extra: string[] = [];
  for (const v of values) {
    if (!knownSet.has(v) && !extra.includes(v)) extra.push(v);
  }
  return [...known, ...extra];
}

/** `v` 를 켜거나 끈 새 목록(`order` 순서). */
export function toggleValue(value: readonly string[], v: string, order: readonly string[]): string[] {
  return orderValues(value.includes(v) ? value.filter((x) => x !== v) : [...value, v], order);
}

/** 칩 하나의 모양 상태. `base` 가 없으면 on/off 만. */
export function chipDiffState(v: string, value: readonly string[], base?: readonly string[] | null): ChipDiffState {
  const on = value.includes(v);
  if (!base) return on ? "on" : "off";
  const was = base.includes(v);
  if (on && !was) return "added";
  if (!on && was) return "removed";
  return on ? "on" : "off";
}

/**
 * 일괄 선택 결과를 적용한다 — `picked` 를 옵션 순서로 맞추되, `disabled` 옵션은 지금 상태(`current`)를 그대로 지킨다.
 */
export function applyPreset(
  picked: readonly string[], current: readonly string[], options: ReadonlyArray<{ value: string; disabled?: boolean }>,
): string[] {
  const order = options.map((o) => o.value);
  const locked = new Set(options.filter((o) => o.disabled).map((o) => o.value));
  const next = picked.filter((v) => !locked.has(v));
  for (const v of current) if (locked.has(v)) next.push(v);
  return orderValues(next, order);
}
