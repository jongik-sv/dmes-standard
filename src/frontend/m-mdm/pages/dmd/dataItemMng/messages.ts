/**
 * 서버와 같은 고정 문구(TSK-07-03 design.md A2). BPMN 경로에서는 오류가 `meta.message` 로만 오므로(F12) 화면은 이
 * 글자로 충돌·닫힌 키를 가린다. 서버 정본: `MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()`,
 * `DataItemMessages.CLOSED_KEY_REOPEN`. 한쪽을 바꾸면 다른 쪽도 바꾼다.
 */

/** 충돌 문구 접두어 — 서버 기본 문구 "다른 사용자가 수정했습니다. 다시 불러오세요" 의 앞부분. */
export const ROW_VERSION_CONFLICT_PREFIX = "다른 사용자가 수정했습니다";

/** 닫힌 키로 신규 등록할 때의 안내(수용 기준 3). */
export const CLOSED_KEY_REOPEN = "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요";
