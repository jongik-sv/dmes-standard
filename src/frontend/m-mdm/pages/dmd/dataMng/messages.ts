/**
 * 서버와 같은 고정 문구(TSK-07-02 design.md §2, dataItemMng messages.ts 선례). BPMN 경로에서는 오류가
 * `meta.message` 로만 오므로 화면은 이 글자로 충돌을 가린다. 서버 정본: `MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()`.
 * 한쪽을 바꾸면 다른 쪽도 바꾼다(`DmdScreenMessageParityTest`).
 */

/** 충돌 문구 접두어 — 서버 기본 문구 "다른 사용자가 수정했습니다. 다시 불러오세요" 의 앞부분. */
export const ROW_VERSION_CONFLICT_PREFIX = "다른 사용자가 수정했습니다";
