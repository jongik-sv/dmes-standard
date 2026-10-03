/**
 * MDM 화면 api.ts 가 `@dk-oasis/shared/http` 의 OASIS 호출 계약(callOasisAt·unwrapOasis)에 넘기는 값.
 *
 * - `MDM_OASIS_BASE`: MDM 서비스 경로. 공통 계약은 basePath 를 추측하지 않으므로 화면이 늘 이 값을 넘긴다
 *   (모듈마다 경로가 다른 것은 화면을 모듈별 서버에 나눠 두려는 설계다).
 * - `plainError`: 화면 api.ts 가 지금까지 던지던 그대로 — code·errors 없는 일반 `Error`(화면은 message 글자로만 판정한다).
 *
 * `@/dme/oasis-call` 에 두지 않는 까닭: 그 모듈은 시험이 `callOasis` 하나만 남겨 통째로 mock 하므로, 거기서 가져오면
 * mock 된 시험의 import 그래프에서 이 값들이 없어진다.
 */
import type { OasisErrorFactory } from "@dk-oasis/shared/http";

export const MDM_OASIS_BASE = "/api/mdm/oasis";

export const plainError: OasisErrorFactory = (message) => new Error(message);
