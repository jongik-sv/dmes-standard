/**
 * masterCodeSelPop (마스터코드 선택 LoV 팝업) — 폴더 진입점.
 *
 * 팝업은 라우팅 대상이 아니다(page.tsx 없음). 부모 화면은 파일이 아니라 **폴더**를 가리킨다:
 * ```ts
 *   import { MasterCodeSelPopDialog } from "../../cmz/masterCodeSelPop";
 *   import type { MasterCodeSelPopResult } from "../../cmz/masterCodeSelPop";
 * ```
 *
 * 사용처: cmb/masterRuleDataList (P-002 마스터코드 조회).
 */
export { default, default as MasterCodeSelPopDialog } from "./masterCodeSelPop";

export { OBJ_ID, searchMasterCodes } from "./api";

export type {
  MasterCodeRow,
  MasterCodeSelPopProps,
  MasterCodeSelPopResult,
  SearchDiv,
  SearchRequest,
} from "./types";
