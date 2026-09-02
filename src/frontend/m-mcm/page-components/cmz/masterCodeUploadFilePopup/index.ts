/**
 * masterCodeUploadFilePopup (마스터코드 Excel 업로드 팝업) — 폴더 진입점.
 *
 * 팝업은 라우팅 대상이 아니다(page.tsx 없음). 부모 화면은 파일이 아니라 **폴더**를 가리킨다:
 * ```ts
 *   import { MasterCodeUploadFilePopupDialog } from "../../cmz/masterCodeUploadFilePopup";
 * ```
 *
 * 사용처: cma/masterCodeMng (P-001 Import).
 */
export { default, default as MasterCodeUploadFilePopupDialog } from "./masterCodeUploadFilePopup";

export { searchMasterCodeUploadList, saveMasterCodeFileUpload } from "./api";

export {
  MODULE_ID,
  SERVICE_ID,
  MENU_ID,
  OBJ_ID,
  EXCEL_HEADER_RANGE,
  EXCEL_DATA_START_ROW,
  EXCEL_COLUMNS,
} from "./constants";
export type { ExcelColumnSpec } from "./constants";

export type {
  MasterCodeUploadFilePopupDialogProps,
  MasterCodeUploadResponseRow,
  MasterCodeUploadRow,
} from "./types";
