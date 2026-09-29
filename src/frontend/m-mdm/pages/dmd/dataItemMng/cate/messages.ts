/**
 * dataItemMng [카테고리] 탭(옛 dataCateEdit 화면, D-104)이 meta.message 접두어·포함으로 판정하는 고정 문구(design.md §2 「수정 — 공유 파일」).
 * 서버 원문과 같은 글자여야 한다 — `MdmErrorCode.RESERVED_CATEGORY.defaultMessage()`·
 * `DataItemMessages.CLOSED_KEY_REOPEN`. 파리티 항목(DmdScreenMessageParityTest 루프)은 통합 단위(I)가 더한다.
 */

/** BASE 수정·닫기 거부(R6, MdmErrorCode MDM012). */
export const RESERVED_CATEGORY_PREFIX = "예약 카테고리 BASE 는 편집·삭제할 수 없습니다";
/** 닫힌 카테고리 ID 로 다시 등록(검사 6, DataItemMessages.CLOSED_KEY_REOPEN 재사용 — registerCate 공용 경로). */
export const CLOSED_KEY_REOPEN = "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요";
