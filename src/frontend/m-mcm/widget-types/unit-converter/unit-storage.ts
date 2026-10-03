/**
 * 단위 계산기 브라우저 기억(localStorage) — 사용자·위젯 인스턴스별로 마지막에 고른 분류·단위·입력값을 이 브라우저에만 둔다.
 * 읽기·쓰기 모두 `window.localStorage` 접근 자체를 try/catch 로 감싼다(시크릿 창·저장소 차단·용량 초과에서도 던질 수 있다).
 * 저장소가 없거나 막혀 있어도 계산기는 정상 동작하고 기억만 못 한다. 키가 null(인스턴스 없음·관리 화면 미리보기·사용자를 모름)이면 아무것도 하지 않는다.
 */
import { parseStoredState, serializeState, type UnitState } from "./unit-model";

export function readRemembered(key: string | null): UnitState | null {
  if (!key) return null;
  try {
    return parseStoredState(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeRemembered(key: string | null, state: UnitState): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, serializeState(state));
  } catch {
    // 저장소가 막혔거나 가득 찼다 — 기억만 못 한다.
  }
}
