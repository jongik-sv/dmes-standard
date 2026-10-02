/**
 * SelectOrInput 의 선택지 — 지금 값이 목록에 없으면(목록이 바뀐 뒤 등) 값을 잃지 않게 앞에 둔다.
 * 빈 값은 끼우지 않는다.
 */
export function withCurrentOption(options: readonly string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : [...options];
}
