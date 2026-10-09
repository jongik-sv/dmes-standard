/**
 * 화면이 렌더마다 새로 만드는 JSX·객체를 「같은 내용인가」로 비교한다 — GridPanel·GridHeaderBar 의 memo 비교 함수가 쓴다.
 *
 * 화면은 `children`·`titleExtra`·`headerExtra`·`help` 를 렌더마다 새 참조로 넘기므로 참조 비교(기본 memo)로는 늘 달라 보인다.
 * 같은 부품(type·key·ref)에 같은 props 를 넘기면 그린 결과도 같으므로(상태·context 는 부품 안에서 따로 갱신된다) 그런 요소는 같다고 본다.
 * - 요소 props 안의 일반 객체(행 데이터·`style` 등)는 참조가 같을 때만 같다 — 내용만 같은 새 행 객체를 같다고 보면 그리드가 옛 행 객체를 계속 들고 있게 된다.
 *   일반 객체를 내용으로 비교하는 곳은 비교 함수의 최상위 props(`help`·`buttons` 항목 등)뿐이다.
 * - 함수 props 는 참조가 같을 때만 같다 — 인라인 함수가 섞인 요소는 다르다고 판정해(비교 실패는 다시 그리기일 뿐) 안전한 쪽으로 기운다.
 * - 비교 비용이 다시 그리기보다 커지지 않게 깊이(DEPTH_LIMIT)와 배열 길이(ARRAY_LIMIT)를 제한한다. 한도를 넘으면 참조 비교만 한다.
 */
import { isValidElement, type ReactElement } from "react";

const DEPTH_LIMIT = 4;
const ARRAY_LIMIT = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 두 값이 같은 내용인가 — 참조가 같거나, 요소·배열·일반 객체를 한도 안에서 안쪽까지 비교해 같다. */
export function sameValue(a: unknown, b: unknown, depth = 0, inElement = false): boolean {
  if (Object.is(a, b)) return true;
  if (depth >= DEPTH_LIMIT) return false;
  if (isValidElement(a) && isValidElement(b)) {
    // React 19 의 ref 는 props.ref 에 들어 있어 아래 props 비교가 본다(element.ref 를 읽으면 개발 모드 경고가 난다).
    return a.type === b.type && a.key === b.key && sameProps(a.props, b.props, depth + 1, true);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length || a.length > ARRAY_LIMIT) return false;
    for (let i = 0; i < a.length; i += 1) if (!sameValue(a[i], b[i], depth + 1, inElement)) return false;
    return true;
  }
  if (!inElement && isPlainObject(a) && isPlainObject(b)) return sameProps(a, b, depth + 1, false);
  return false;
}

/** 두 props(일반 객체)의 키와 값이 모두 같은 내용인가. */
export function sameProps(a: unknown, b: unknown, depth = 0, inElement = false): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const key of keysA) {
    if (!(key in b) || !sameValue(a[key], b[key], depth, inElement)) return false;
  }
  return true;
}
