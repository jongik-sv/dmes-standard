/**
 * 서버와 같은 고정 문구(TSK-07-03 design.md A2). BPMN 경로에서는 오류가 `meta.message` 로만 오므로(F12) 화면은 이
 * 글자로 충돌·닫힌 키를 가린다. 서버 정본: `MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()`,
 * `DataItemMessages.CLOSED_KEY_REOPEN`. 한쪽을 바꾸면 다른 쪽도 바꾼다.
 */

import type { DataItemHeader } from "./types";

/** 충돌 문구 접두어 — 서버 기본 문구 "다른 사용자가 수정했습니다. 다시 불러오세요" 의 앞부분. */
export const ROW_VERSION_CONFLICT_PREFIX = "다른 사용자가 수정했습니다";

/** 닫힌 키로 신규 등록할 때의 안내(수용 기준 3). */
export const CLOSED_KEY_REOPEN = "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요";

/**
 * 조회 전용 마루 데이터 안내 문구 — 편집 가능 조건(MDM 원천이면서 사용 중)을 어느 쪽이 못 채웠는지로 가른다.
 * 서버 `DataItemListQuery.header` 의 editable 조건과 같아야 한다.
 */
export function readonlyNotice(header: Pick<DataItemHeader, "sourceKind" | "sourceSystem" | "status">): string {
  if (header.sourceKind !== "MDM") {
    // 원천 시스템 이름이 MDM 자신이면(환율 FX_RATE 등) 「외부(MDM)」 처럼 읽혀 헷갈리므로 이름을 붙이지 않는다.
    const system = header.sourceSystem && header.sourceSystem !== "MDM" ? ` 시스템(${header.sourceSystem})` : "";
    return `이 마루 데이터는 외부${system}에서 받아 온 값이라 여기서 고칠 수 없습니다.`;
  }
  return `이 마루 데이터는 사용 중이 아닌 상태(${header.status})라 여기서 고칠 수 없습니다.`;
}
