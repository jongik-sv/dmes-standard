/**
 * 고른 카테고리가 REGEX 이고 서버 재해석(compare)이 정규식 문법 오류를 알렸는지 판정한다.
 * REGEX 가 아닌 카테고리로 옮겨 가면 남아 있는 이전 결과는 무시한다.
 */
export function isRegexInvalid(
  selectedRow: { defKind: string } | null | undefined,
  preview: { invalidExpression?: boolean } | null | undefined,
): boolean {
  return selectedRow?.defKind === "REGEX" && preview?.invalidExpression === true;
}
