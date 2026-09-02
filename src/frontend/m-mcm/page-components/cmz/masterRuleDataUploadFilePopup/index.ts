/**
 * masterRuleDataUploadFilePopup (일반 업무기준 등록 Excel Upload 팝업) — 폴더 진입점.
 *
 * 팝업은 라우팅 대상이 아니다(page.tsx 없음). 부모 화면은 파일이 아니라 **폴더**를 가리킨다:
 * ```ts
 *   import { MasterRuleDataUploadFilePopupModal } from "../../cmz/masterRuleDataUploadFilePopup";
 * ```
 *
 * 사용처: cmb/masterRuleData (P-002 엑셀업로드).
 *
 * 컴포넌트 파일이 default export 를 두지 않아 배럴에서 named ↔ default 를 함께 내보낸다.
 */
export {
  MasterRuleDataUploadFilePopupModal,
  MasterRuleDataUploadFilePopupModal as default,
} from "./masterRuleDataUploadFilePopup";
export type { MasterRuleDataUploadFilePopupModalProps } from "./masterRuleDataUploadFilePopup";

export { OBJ_ID, createMasterRuleDataUploadFilePopupRepository } from "./repository";
export type { MasterRuleDataUploadFilePopupRepository } from "./repository";

export {
  EXCEL_HEADER_ROW_INDEX,
  EXCEL_DATA_ROW_INDEX,
  MSG_REG_FLAG_CONFIRM,
  MSG_REG_FLAG_EMPTY,
  MSG_NO_RULE,
  MSG_SAVE_DONE,
} from "./constants";

export type { ColDef, UploadRow } from "./types";
