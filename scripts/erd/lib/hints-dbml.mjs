// dbml 문서의 짧은 형식 Ref 줄을 근거(kind DOC)로 읽는다. 외부 의존성 없음.
//   Ref: 자식.컬럼 > 부모.컬럼      (many-to-one, 왼쪽이 자식)
//   Ref: 부모.컬럼 < 자식.컬럼      (one-to-many, 오른쪽이 자식)
//   Ref: 자식.컬럼 - 부모.컬럼      (one-to-one, 왼쪽을 자식으로 본다)
//   Ref 이름: ...,  스키마.표.컬럼,  표.(컬럼1, 컬럼2) 복합 컬럼도 읽는다.
// many-to-many(<>)·긴 형식(Ref { ... })은 읽지 않고 skipped 로 돌려준다. 칸 안 [ref: ...] 는 읽지 않는다(Ref 로 시작하지 않는다).

const REF_LINE = /^\s*Ref\b/;
const SHORT_REF =
  /^\s*Ref(?:\s+[\w"]+)?\s*:\s*([\w".]+?)\.(\([^)]*\)|"?\w+"?)\s*(<>|<|>|-)\s*([\w".]+?)\.(\([^)]*\)|"?\w+"?)(?![\w."])/;

const unquote = (s) => s.replace(/"/g, "");

function tableOf(text) {
  const parts = unquote(text).split(".");
  return parts.length === 2 ? { schema: parts[0], table: parts[1] } : { schema: null, table: parts[0] };
}

function columnsOf(text) {
  return unquote(text)
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * @param {string} text dbml 본문
 * @param {string} relPath 저장소 루트 기준 경로(/ 구분). ref 에 쓴다.
 * @returns {{refs: Array, skipped: Array<{ref: string, reason: string}>}}
 */
export function parseDbml(text, relPath) {
  const refs = [];
  const skipped = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, i) => {
    if (!REF_LINE.test(line)) return;
    const ref = `${relPath}:${i + 1}`;
    const m = SHORT_REF.exec(line);
    if (!m) return void skipped.push({ ref, reason: "짧은 형식 Ref 가 아니다" });
    const [, lt, lc, op, rt, rc] = m;
    if (op === "<>") return void skipped.push({ ref, reason: "many-to-many 는 관계 하나로 옮길 수 없다" });
    const left = { ...tableOf(lt), columns: columnsOf(lc) };
    const right = { ...tableOf(rt), columns: columnsOf(rc) };
    if (left.columns.length !== right.columns.length || left.columns.length === 0) {
      return void skipped.push({ ref, reason: "양쪽 컬럼 수가 다르다" });
    }
    const [child, parent] = op === "<" ? [right, left] : [left, right];
    refs.push({ kind: "DOC", child, parent, ref });
  });
  return { refs, skipped };
}
