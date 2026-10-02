/**
 * 화면 키 → 컬럼사전 물리명. cactus-core `MdmNames.toPhysName` 과 같은 규칙(spec B6, A spec D7).
 *
 * - 앞뒤 공백을 떼고 비면 null.
 * - 이미 모두 대문자(대문자로 바꿔도 같음)면 그대로 — `CODE_NM` → `CODE_NM`.
 * - 소문자가 섞였으면 camelCase 로 보고 소문자·숫자 뒤의 대문자 앞에 `_` 를 넣어 대문자로 — `codeNm` → `CODE_NM`, `item2Cd` → `ITEM2_CD`.
 */
export function toPhysName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const t = name.trim();
  if (!t) return null;
  if (t === t.toUpperCase()) return t;
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (i > 0 && isUpper(c)) {
      const prev = t[i - 1];
      if (isLower(prev) || isDigit(prev)) out += "_";
    }
    out += c.toUpperCase();
  }
  return out;
}

function isUpper(c: string): boolean {
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

function isLower(c: string): boolean {
  return c !== c.toUpperCase() && c === c.toLowerCase();
}

function isDigit(c: string): boolean {
  return /\p{Nd}/u.test(c);
}
