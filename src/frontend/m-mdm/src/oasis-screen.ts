/**
 * MDM 화면 api.ts 가 `@dk-oasis/shared/http` 의 OASIS 호출 계약(callOasisAt·unwrapOasis)에 넘기는 값.
 *
 * - `MDM_OASIS_BASE`: MDM 서비스 경로. 공통 계약은 basePath 를 추측하지 않으므로 화면이 늘 이 값을 넘긴다
 *   (모듈마다 경로가 다른 것은 화면을 모듈별 서버에 나눠 두려는 설계다).
 * - `plainError`: 화면 api.ts 가 지금까지 던지던 그대로 — code·errors 없는 일반 `Error`(화면은 message 글자로만 판정한다).
 * - `mdmFieldLabel`: 오류 문구 `기본 문구 + "\n- 항목명: 메시지"` 의 항목명 — 서버 field 코드는 화면에 보이지 않는다.
 *
 * `@/dme/oasis-call` 에 두지 않는 까닭: 그 모듈은 시험이 `callOasis` 하나만 남겨 통째로 mock 하므로, 거기서 가져오면
 * mock 된 시험의 import 그래프에서 이 값들이 없어진다.
 */
import { labelsFrom, type OasisErrorFactory } from "@dk-oasis/shared/http";

export const MDM_OASIS_BASE = "/api/mdm/oasis";

export const plainError: OasisErrorFactory = (message) => new Error(message);

/**
 * 여러 화면이 같이 받는 서버 field → 화면 항목명. 확정 화면(layoutConfirm·codeConfirm·ruleConfirm·ruleSetConfirm)의
 * `applyFrom`(서버는 `applyFrom`·`APPLY_FROM` 둘 다 쓴다)이 여기 있다. 키는 대문자 snake 하나로 둔다 — `labelsFrom` 이
 * camelCase field 도 대문자 snake 로 바꿔 찾는다.
 */
export const MDM_COMMON_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  APPLY_FROM: "희망 적용 시작 일시",
});

/**
 * 화면 OASIS 호출의 `fieldLabel` — 화면 맵(`pages/<화면>/fieldLabels.ts`)에 공통 맵을 더한다(같은 키는 화면 맵이 이긴다).
 * 맵에 없는 field(`var:<id>` 같은 합성 값·확정 검사 항목 이름)는 항목명 없이 메시지만 보인다.
 */
export function mdmFieldLabel(screenLabels: Readonly<Record<string, string>> = {}): (field: string) => string | undefined {
  return labelsFrom({ ...MDM_COMMON_FIELD_LABELS, ...screenLabels });
}
