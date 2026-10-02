/**
 * 룰 버전 문자열 공통 처리(D-144). 서버는 소수 셋째 자리 문자열(`"1.000"` major, `"1.001"` minor)로 내려준다.
 *
 * 화면은 버전을 숫자로 바꾸지 않는다(`Number("1.010")` 은 `1.01`, 정수 정규식은 `1.001` 을 버린다).
 * 비교는 `sameVer`, 표시는 `fmtVer`, 외부 입력(handoff·옛 저장값) 정규화는 `normVer` 로 한다.
 */
const VER_RE = /^\d{1,4}(\.\d{1,3})?$/;

/** `"1.001"`·`"2"`·`2` → `"1.001"`·`"2.000"`·`"2.000"`. 형식이 맞지 않거나 비었으면 null. */
export function normVer(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!VER_RE.test(s)) return null;
  return Number(s).toFixed(3);
}

/** 표시용 `"v1.001"`. 빈 값·형식 오류는 `""`. */
export function fmtVer(ver: string | null | undefined): string {
  const n = normVer(ver);
  return n ? `v${n}` : "";
}

/** 값으로 비교한다(`"1"` 과 `"1.000"` 은 같다). 둘 다 비었으면 같고, 형식 오류는 늘 다르다. */
export function sameVer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  const x = normVer(a);
  const y = normVer(b);
  return x !== null && x === y;
}
