/**
 * masterRuleListPop (업무기준 List조회 LoV 팝업) — 폴더 진입점.
 *
 * 팝업은 라우팅 대상이 아니다(page.tsx 없음). 부모 화면은 파일이 아니라 **폴더**를 가리킨다:
 * ```ts
 *   import { MasterRuleListPopModal } from "../../cmz/masterRuleListPop";
 *   import type { RuleSelectResult } from "../../cmz/masterRuleListPop";
 * ```
 *
 * 사용처: cmb/masterRuleData · cmb/masterRuleDataList · cmb/masterRuleFrame (전부 P-001 업무기준 선택).
 *
 * 컴포넌트 파일이 default export 를 두지 않아 배럴에서 named ↔ default 를 함께 내보낸다.
 */
export { MasterRuleListPopModal, MasterRuleListPopModal as default } from "./masterRuleListPop";
export type { MasterRuleListPopModalProps } from "./masterRuleListPop";

export { OBJ_ID, createMasterRuleListPopRepository } from "./repository";
export type { MasterRuleListPopRepository, PopSearchResult } from "./repository";

export { DEFAULT_FILTERS, POP_COLUMNS } from "./constants";

export type { PopFilters, PopRuleRow, RuleSelectResult } from "./types";
