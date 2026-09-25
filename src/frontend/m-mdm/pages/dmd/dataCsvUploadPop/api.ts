/**
 * dataCsvUploadPop(항목 CSV 업로드 팝업)의 OASIS 호출 래퍼(TSK-07-04 design.md §2). `dataItemMng` 화면 안에서 여는
 * 팝업이라 봉투 해제(`callOasis`)는 `dataItemMng/api.ts` 를 그대로 쓴다(termRegPop → columnMng/api 선례).
 * `POST /api/mdm/oasis/dataCsvUploadPop/{validate|save}` — actionGateway 2 분기(D3, dataCsvUploadPop.bpmn).
 *
 * CSV 는 서버에서만 파싱·검증한다(D3) — 화면은 `FileReader.readAsText` 로 원문을 그대로 넘긴다.
 */
import { callOasis } from "../dataItemMng/api";

/** CSV 20 고정 열(물리명, 순서 고정) — 안내 문구·헤더 검증 근거(I7, `Rfc4180Csv`). */
export const CSV_COLS = [
  "code",
  "name",
  "alter_name",
  "seq",
  "description",
  "lvl1",
  "lvl2",
  "lvl3",
  "lvl4",
  "lvl5",
  "attr01",
  "attr02",
  "attr03",
  "attr04",
  "attr05",
  "attr06",
  "attr07",
  "attr08",
  "attr09",
  "attr10",
] as const;

/** 서버 `DataCsvRow`(design.md §2) — lineNo 는 파일 레코드 번호(헤더=1, I7). action 은 파서 오류 행이면 "-". */
export interface DataCsvRow {
  lineNo: number;
  code: string;
  action: string;
  issues: string[];
}

export interface DataCsvValidateResult {
  rows: DataCsvRow[];
  insertCount: number;
  updateCount: number;
  noneCount: number;
  errorCount: number;
}

export interface DataCsvSaveResult {
  insertCount: number;
  updateCount: number;
  noneCount: number;
  at: string;
}

/** action=validate — dryRun 검증(읽기, 저장 안 됨). */
export function validateCsv(maruDataId: string, csvText: string): Promise<DataCsvValidateResult> {
  return callOasis<DataCsvValidateResult>("dataCsvUploadPop", "validate", { maruDataId, csvText });
}

/**
 * action=save — 실제 저장(D3: 화면이 보낸 "검증 통과" 상태를 신뢰하지 않고 서버가 저장 시점에 다시 파싱·검사한다).
 * 오류가 하나라도 있으면 전부 미저장(I2).
 */
export function saveCsv(maruDataId: string, csvText: string): Promise<DataCsvSaveResult> {
  return callOasis<DataCsvSaveResult>("dataCsvUploadPop", "save", { maruDataId, csvText });
}
