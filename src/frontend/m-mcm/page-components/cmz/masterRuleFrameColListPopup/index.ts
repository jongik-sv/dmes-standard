/**
 * masterRuleFrameColListPopup (업무기준 컬럼 리스트 등록 팝업) — 폴더 진입점.
 *
 * 팝업은 라우팅 대상이 아니다(page.tsx 없음). 부모 화면은 파일이 아니라 **폴더**를 가리킨다:
 * ```ts
 *   import { MasterRuleFrameColListPopupModal } from "../../cmz/masterRuleFrameColListPopup";
 * ```
 *
 * 사용처: cmb/masterRuleFrame (P-002 기초데이터등록).
 *
 * 컴포넌트 파일이 default export 를 두지 않아 배럴에서 named ↔ default 를 함께 내보낸다.
 */
export {
  MasterRuleFrameColListPopupModal,
  MasterRuleFrameColListPopupModal as default,
} from "./masterRuleFrameColListPopup";
export type { MasterRuleFrameColListPopupModalProps } from "./masterRuleFrameColListPopup";

export { OBJ_ID, createMasterRuleFrameColListPopupRepository } from "./repository";
export type { MasterRuleFrameColListPopupRepository, SaveRow } from "./repository";

export {
  COL_LIST_COLUMNS,
  COL_TYPE_VALUES,
  DIV_VALUES,
  IN_OUT_VALUES,
  MAX_LEN,
} from "./constants";

export type { ColListRow } from "./types";
