/**
 * @file libDataset.ts
 * @description 데이터셋(배열/객체) 관련 유틸리티 함수 라이브러리
 *              - Nexacro libDataset.xjs 함수를 React용으로 변환
 *              - Nexacro의 Dataset을 JavaScript 배열/객체로 대체
 *
 * @note Nexacro Dataset과 React 데이터 구조 비교
 *       - Nexacro: Dataset 객체 (rowcount, getColumn, setColumn 등)
 *       - React: JavaScript 배열 [{}, {}, ...]
 *
 * @functions
 * ● gfn_findFirstRow       : 조건에 해당하는 첫번째 행 인덱스 찾기
 * ● gfn_findRows           : 조건에 해당하는 모든 행 인덱스 찾기
 * ● gfn_findRowsByMultiCol : 다중 조건으로 행 찾기
 * ● gfn_deleteRows         : 조건에 해당하는 모든 행 삭제
 * ● gfn_isDuplicationCheck : 중복 값 체크
 * ● gfn_isDatasetChanged   : 데이터 변경 여부 체크
 * ● gfn_findData           : 키값으로 행 찾기
 * ● gfn_editData           : 키값으로 데이터 수정
 * ● gfn_deleteData         : 키값으로 데이터 삭제
 * ● gfn_setFirstRow        : 첫번째 행에 데이터 추가
 * ● gfn_dsDupDel           : 중복 데이터 제거
 * ● gfn_rowcopyData        : 행 복사
 * ● gfn_getColumnValues    : 특정 컬럼의 모든 값 배열로 반환
 * ● gfn_sumColumn          : 특정 컬럼 합계 계산
 * ● gfn_groupBy            : 그룹별 집계
 * ● gfn_sortBy             : 정렬
 */

// ============================================================
// 1. 타입 정의
// ============================================================

/** 데이터 행 타입 */
export type DataRow = Record<string, unknown>;

// ============================================================
// 2. 행 검색 함수
// ============================================================

/**
 * @function gfn_findFirstRow
 * @description 데이터 배열에서 조건에 해당하는 첫번째 행 인덱스 찾기
 *
 * @param dataArray - 데이터 배열
 * @param col - 검색할 컬럼명
 * @param val - 검색할 값
 * @returns 찾은 행 인덱스 (없으면 -1)
 *
 * @example
 * const data = [{id: 1, name: '홍길동'}, {id: 2, name: '김철수'}];
 * gfn_findFirstRow(data, 'id', 2)  // 1
 * gfn_findFirstRow(data, 'id', 5)  // -1
 */
export function gfn_findFirstRow(dataArray: DataRow[], col: string, val: unknown): number {
  if (!Array.isArray(dataArray)) return -1;

  for (let i = 0; i < dataArray.length; i++) {
    // eslint-disable-next-line eqeqeq
    if (dataArray[i][col] == val) {
      return i;
    }
  }
  return -1;
}

/**
 * @function gfn_findRows
 * @description 데이터 배열에서 조건에 해당하는 모든 행 인덱스 찾기
 *
 * @param dataArray - 데이터 배열
 * @param col - 검색할 컬럼명
 * @param val - 검색할 값
 * @returns 찾은 행 인덱스 배열
 *
 * @example
 * const data = [{type: 'A'}, {type: 'B'}, {type: 'A'}];
 * gfn_findRows(data, 'type', 'A')  // [0, 2]
 */
export function gfn_findRows(dataArray: DataRow[], col: string, val: unknown): number[] {
  const result: number[] = [];
  if (!Array.isArray(dataArray)) return result;

  for (let i = 0; i < dataArray.length; i++) {
    // eslint-disable-next-line eqeqeq
    if (dataArray[i][col] == val) {
      result.push(i);
    }
  }
  return result;
}

/**
 * @function gfn_findRowsByMultiCol
 * @description 다중 조건으로 행 인덱스 찾기
 *
 * @param dataArray - 데이터 배열
 * @param conditions - 조건 객체 {컬럼명: 값, ...}
 * @returns 찾은 행 인덱스 배열
 *
 * @example
 * const data = [{type: 'A', status: 1}, {type: 'A', status: 2}];
 * gfn_findRowsByMultiCol(data, {type: 'A', status: 1})  // [0]
 */
export function gfn_findRowsByMultiCol(dataArray: DataRow[], conditions: Record<string, unknown>): number[] {
  const result: number[] = [];
  if (!Array.isArray(dataArray)) return result;

  const conditionKeys = Object.keys(conditions);

  for (let i = 0; i < dataArray.length; i++) {
    let match = true;
    for (const key of conditionKeys) {
      // eslint-disable-next-line eqeqeq
      if (dataArray[i][key] != conditions[key]) {
        match = false;
        break;
      }
    }
    if (match) {
      result.push(i);
    }
  }
  return result;
}

/**
 * @function gfn_findMutiColRows
 * @description 2개 컬럼 조건으로 행 찾기 (Nexacro 호환)
 *
 * @param dataArray - 데이터 배열
 * @param col1 - 첫번째 컬럼명
 * @param val1 - 첫번째 값
 * @param col2 - 두번째 컬럼명
 * @param val2 - 두번째 값
 * @returns 찾은 행 인덱스 배열
 */
export function gfn_findMutiColRows(dataArray: DataRow[], col1: string, val1: unknown, col2: string, val2: unknown): number[] {
  return gfn_findRowsByMultiCol(dataArray, { [col1]: val1, [col2]: val2 });
}

// ============================================================
// 3. 행 삭제 함수
// ============================================================

/**
 * @function gfn_deleteRows
 * @description 조건에 해당하는 모든 행 삭제
 *
 * @param dataArray - 데이터 배열
 * @param col - 검색할 컬럼명
 * @param val - 검색할 값
 * @returns 삭제 후 새 배열
 *
 * @example
 * const data = [{type: 'A'}, {type: 'B'}, {type: 'A'}];
 * gfn_deleteRows(data, 'type', 'A')  // [{type: 'B'}]
 */
export function gfn_deleteRows(dataArray: DataRow[], col: string, val: unknown): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  // eslint-disable-next-line eqeqeq
  return dataArray.filter(row => row[col] != val);
}

/**
 * @function gfn_deleteMutiColRows
 * @description 다중 조건에 해당하는 모든 행 삭제
 *
 * @param dataArray - 데이터 배열
 * @param col1 - 첫번째 컬럼명
 * @param val1 - 첫번째 값
 * @param col2 - 두번째 컬럼명
 * @param val2 - 두번째 값
 * @returns 삭제 후 새 배열
 */
export function gfn_deleteMutiColRows(dataArray: DataRow[], col1: string, val1: unknown, col2: string, val2: unknown): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  // eslint-disable-next-line eqeqeq
  return dataArray.filter(row => !(row[col1] == val1 && row[col2] == val2));
}

/**
 * @function gfn_deleteMultiRows
 * @description 여러 인덱스의 행 삭제
 *
 * @param dataArray - 데이터 배열
 * @param indices - 삭제할 인덱스 배열
 * @returns 삭제 후 새 배열
 *
 * @example
 * const data = [{id: 1}, {id: 2}, {id: 3}];
 * gfn_deleteMultiRows(data, [0, 2])  // [{id: 2}]
 */
export function gfn_deleteMultiRows(dataArray: DataRow[], indices: number[]): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  if (!Array.isArray(indices)) return dataArray;

  const indexSet = new Set(indices);
  return dataArray.filter((_, index) => !indexSet.has(index));
}

// ============================================================
// 4. 중복 체크/제거 함수
// ============================================================

/**
 * @function gfn_isDuplicationCheck
 * @description 지정한 컬럼들에서 중복값 체크
 *
 * @param dataArray - 데이터 배열
 * @param columnIds - 체크할 컬럼 ID 배열 또는 단일 문자열
 * @param currentRow - 현재 행 인덱스 (옵션)
 * @returns 중복이 있으면 true
 *
 * @example
 * const data = [{code: 'A', type: 1}, {code: 'A', type: 1}, {code: 'B', type: 1}];
 * gfn_isDuplicationCheck(data, ['code', 'type'])  // true
 * gfn_isDuplicationCheck(data, 'code')  // true
 */
export function gfn_isDuplicationCheck(dataArray: DataRow[], columnIds: string[] | string, currentRow: number | null = null): boolean {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return false;

  // 단일 컬럼을 배열로 변환
  const cols = Array.isArray(columnIds) ? columnIds : [columnIds];

  // 키 생성 함수
  const makeKey = (row: DataRow): string => cols.map(col => String(row[col])).join('|');

  const seen = new Map<string, number>();

  for (let i = 0; i < dataArray.length; i++) {
    const key = makeKey(dataArray[i]);

    if (seen.has(key)) {
      // 특정 행 체크 모드
      if (currentRow !== null) {
        if (i === currentRow || seen.get(key) === currentRow) {
          return true;
        }
      } else {
        return true;
      }
    }
    seen.set(key, i);
  }

  return false;
}

/**
 * @function gfn_dsDupDel
 * @description 데이터셋 중복 제거
 *
 * @param dataArray - 데이터 배열
 * @param columnIds - 중복 체크할 컬럼 ID 배열 또는 단일 문자열
 * @returns 중복 제거된 새 배열
 *
 * @example
 * const data = [{code: 'A'}, {code: 'B'}, {code: 'A'}];
 * gfn_dsDupDel(data, 'code')  // [{code: 'A'}, {code: 'B'}]
 */
export function gfn_dsDupDel(dataArray: DataRow[], columnIds: string[] | string): DataRow[] {
  if (!Array.isArray(dataArray)) return [];

  const cols = Array.isArray(columnIds) ? columnIds : [columnIds];
  const seen = new Set<string>();
  const result: DataRow[] = [];

  for (const row of dataArray) {
    const key = cols.map(col => String(row[col])).join('|');

    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...row });
    }
  }

  return result;
}

// ============================================================
// 5. 데이터 변경 감지 함수
// ============================================================

/**
 * @constant ROW_TYPE
 * @description 행 상태 타입 (Nexacro 호환 - 숫자)
 */
export const ROW_TYPE = {
  NORMAL: 1,      // 변경 없음
  INSERT: 2,      // 추가됨
  UPDATE: 4,      // 수정됨
  DELETE: 8       // 삭제됨
} as const;

/**
 * @constant ROW_STATUS
 * @description 행 상태 문자열 상수 (nativeeditor_status 용)
 *              그리드/컨트롤러에서 행 상태 추적 시 사용
 *
 * @example
 * import { ROW_STATUS } from '@/lib';
 * newRow.nativeeditor_status = ROW_STATUS.INSERTED;
 */
export const ROW_STATUS = {
  INSERTED: 'inserted',
  UPDATED: 'updated',
  DELETED: 'deleted',
} as const;

/**
 * @interface ChangedRows
 * @description gfn_getChangedRows 반환 타입
 */
export interface ChangedRows {
  inserted: DataRow[];
  updated: DataRow[];
  deleted: DataRow[];
}

/**
 * @function gfn_isDatasetChanged
 * @description 데이터 변경 여부 체크
 *
 * @param dataArray - 현재 데이터 배열
 * @param originalArray - 원본 데이터 배열
 * @returns 변경되었으면 true
 *
 * @example
 * const original = [{id: 1, name: '홍길동'}];
 * const current = [{id: 1, name: '김철수'}];
 * gfn_isDatasetChanged(current, original)  // true
 */
export function gfn_isDatasetChanged(dataArray: unknown, originalArray: unknown): boolean {
  if (!Array.isArray(dataArray) || !Array.isArray(originalArray)) {
    return dataArray !== originalArray;
  }

  // 길이 비교
  if (dataArray.length !== originalArray.length) {
    return true;
  }

  // 내용 비교
  return JSON.stringify(dataArray) !== JSON.stringify(originalArray);
}

/**
 * @function gfn_getChangedRows
 * @description 변경된 행들의 상태와 데이터 반환
 *
 * @param dataArray - 현재 데이터 배열 (rowType 컬럼 포함)
 * @returns { inserted: [], updated: [], deleted: [] }
 *
 * @example
 * const data = [
 *   {id: 1, name: '홍길동', _rowType: 1},   // NORMAL
 *   {id: null, name: '신규', _rowType: 2},  // INSERT
 *   {id: 3, name: '수정됨', _rowType: 4}    // UPDATE
 * ];
 * gfn_getChangedRows(data)
 * // { inserted: [{...}], updated: [{...}], deleted: [] }
 */
export function gfn_getChangedRows(dataArray: DataRow[]): ChangedRows {
  const result: ChangedRows = {
    inserted: [],
    updated: [],
    deleted: []
  };

  if (!Array.isArray(dataArray)) return result;

  for (const row of dataArray) {
    const rowType = (row._rowType || row.rowType || ROW_TYPE.NORMAL) as number;

    switch (rowType) {
      case ROW_TYPE.INSERT:
        result.inserted.push(row);
        break;
      case ROW_TYPE.UPDATE:
        result.updated.push(row);
        break;
      case ROW_TYPE.DELETE:
        result.deleted.push(row);
        break;
    }
  }

  return result;
}

// ============================================================
// 6. 데이터 검색/수정/삭제 함수
// ============================================================

/**
 * @function gfn_findData
 * @description 키값으로 행 인덱스 찾기
 *
 * @param dataArray - 데이터 배열
 * @param idCol - 키 컬럼명
 * @param idVal - 키 값
 * @param subCol - 서브 키 컬럼명 (옵션)
 * @param subVal - 서브 키 값 (옵션)
 * @returns 행 인덱스 (없으면 -1)
 */
export function gfn_findData(dataArray: DataRow[], idCol: string, idVal: unknown, subCol: string | null = null, subVal: unknown = null): number {
  if (!Array.isArray(dataArray)) return -1;

  if (subCol === null) {
    return gfn_findFirstRow(dataArray, idCol, idVal);
  }

  // 다중 조건 검색
  for (let i = 0; i < dataArray.length; i++) {
    // eslint-disable-next-line eqeqeq
    if (dataArray[i][idCol] == idVal && dataArray[i][subCol] == subVal) {
      return i;
    }
  }
  return -1;
}

/**
 * @function gfn_editData
 * @description 키값으로 데이터 수정
 *
 * @param dataArray - 데이터 배열
 * @param idCol - 키 컬럼명
 * @param idVal - 키 값
 * @param valCol - 변경할 컬럼명
 * @param newVal - 새 값
 * @param subCol - 서브 키 컬럼명 (옵션)
 * @param subVal - 서브 키 값 (옵션)
 * @returns 수정된 새 배열
 *
 * @example
 * const data = [{id: 1, name: '홍길동'}];
 * gfn_editData(data, 'id', 1, 'name', '김철수')
 * // [{id: 1, name: '김철수'}]
 */
export function gfn_editData(dataArray: DataRow[], idCol: string, idVal: unknown, valCol: string, newVal: unknown, subCol: string | null = null, subVal: unknown = null): DataRow[] {
  if (!Array.isArray(dataArray)) return [];

  const curRow = gfn_findData(dataArray, idCol, idVal, subCol, subVal);

  if (curRow === -1) return [...dataArray];

  const newArray = [...dataArray];
  newArray[curRow] = { ...newArray[curRow], [valCol]: newVal };

  return newArray;
}

/**
 * @function gfn_deleteData
 * @description 키값으로 데이터 삭제
 *
 * @param dataArray - 데이터 배열
 * @param idCol - 키 컬럼명
 * @param idVal - 키 값
 * @param subCol - 서브 키 컬럼명 (옵션)
 * @param subVal - 서브 키 값 (옵션)
 * @returns 삭제 후 새 배열
 */
export function gfn_deleteData(dataArray: DataRow[], idCol: string, idVal: unknown, subCol: string | null = null, subVal: unknown = null): DataRow[] {
  if (!Array.isArray(dataArray)) return [];

  const curRow = gfn_findData(dataArray, idCol, idVal, subCol, subVal);

  if (curRow === -1) return [...dataArray];

  return dataArray.filter((_, index) => index !== curRow);
}

// ============================================================
// 7. 데이터 추가/복사 함수
// ============================================================

/**
 * @function gfn_setFirstRow
 * @description 데이터 배열 첫번째에 행 추가
 *
 * @param dataArray - 데이터 배열
 * @param codeValue - 코드 값
 * @param dataValue - 데이터 값
 * @param codeColumn - 코드 컬럼명 (default: 'code')
 * @param dataColumn - 데이터 컬럼명 (default: 'name')
 * @returns 추가된 새 배열
 *
 * @example
 * const data = [{code: 'A', name: '옵션1'}];
 * gfn_setFirstRow(data, '', '선택', 'code', 'name')
 * // [{code: '', name: '선택'}, {code: 'A', name: '옵션1'}]
 */
export function gfn_setFirstRow(dataArray: DataRow[], codeValue: unknown, dataValue: unknown, codeColumn: string = 'code', dataColumn: string = 'name'): DataRow[] {
  if (!Array.isArray(dataArray)) return [];

  const newRow: DataRow = {
    [codeColumn]: codeValue,
    [dataColumn]: dataValue
  };

  return [newRow, ...dataArray];
}

/**
 * @interface RowCopyResult
 * @description gfn_rowcopyData 반환 타입
 */
export interface RowCopyResult {
  data: DataRow[];
  newRowIndex: number;
}

/**
 * @function gfn_rowcopyData
 * @description 행 복사
 *
 * @param dataArray - 데이터 배열
 * @param sourceRow - 복사할 원본 행 인덱스
 * @param columns - 복사할 컬럼 배열 (null이면 전체)
 * @param insertType - 삽입 타입 ('A': 마지막에 추가, 'I': 현재 위치 다음에 삽입)
 * @param currentRow - 현재 행 인덱스 (insertType이 'I'일 때 사용)
 * @returns { data: 새 배열, newRowIndex: 새 행 인덱스 }
 *
 * @example
 * const data = [{id: 1, name: '홍길동'}];
 * gfn_rowcopyData(data, 0)
 * // { data: [{id: 1, name: '홍길동'}, {id: 1, name: '홍길동'}], newRowIndex: 1 }
 */
export function gfn_rowcopyData(dataArray: DataRow[], sourceRow: number, columns: string[] | null = null, insertType: 'A' | 'I' = 'A', currentRow: number | null = null): RowCopyResult {
  if (!Array.isArray(dataArray)) return { data: [], newRowIndex: -1 };
  if (sourceRow < 0 || sourceRow >= dataArray.length) {
    return { data: [...dataArray], newRowIndex: -1 };
  }

  const sourceData = dataArray[sourceRow];
  let newRow: DataRow = {};

  if (columns === null) {
    // 전체 복사
    newRow = { ...sourceData };
  } else {
    // 지정 컬럼만 복사
    for (const col of columns) {
      newRow[col] = sourceData[col];
    }
  }

  const newArray = [...dataArray];
  let newRowIndex: number;

  if (insertType === 'A') {
    // 마지막에 추가
    newArray.push(newRow);
    newRowIndex = newArray.length - 1;
  } else {
    // 현재 위치 다음에 삽입
    const insertIndex = (currentRow !== null ? currentRow : sourceRow) + 1;
    newArray.splice(insertIndex, 0, newRow);
    newRowIndex = insertIndex;
  }

  return { data: newArray, newRowIndex };
}

/**
 * @function gfn_addRow
 * @description 새 행 추가
 *
 * @param dataArray - 데이터 배열
 * @param rowData - 추가할 행 데이터 (옵션)
 * @param position - 삽입 위치 (-1이면 마지막에 추가)
 * @returns 추가된 새 배열
 */
export function gfn_addRow(dataArray: DataRow[], rowData: DataRow = {}, position: number = -1): DataRow[] {
  if (!Array.isArray(dataArray)) return [rowData];

  const newRow: DataRow = { _rowType: ROW_TYPE.INSERT, ...rowData };
  const newArray = [...dataArray];

  if (position === -1 || position >= dataArray.length) {
    newArray.push(newRow);
  } else {
    newArray.splice(position, 0, newRow);
  }

  return newArray;
}

// ============================================================
// 8. 집계/통계 함수
// ============================================================

/**
 * @function gfn_getColumnValues
 * @description 특정 컬럼의 모든 값을 배열로 반환
 *
 * @param dataArray - 데이터 배열
 * @param column - 컬럼명
 * @returns 값 배열
 *
 * @example
 * const data = [{id: 1, name: '홍길동'}, {id: 2, name: '김철수'}];
 * gfn_getColumnValues(data, 'name')  // ['홍길동', '김철수']
 */
export function gfn_getColumnValues(dataArray: DataRow[], column: string): unknown[] {
  if (!Array.isArray(dataArray)) return [];
  return dataArray.map(row => row[column]);
}

/**
 * @function gfn_sumColumn
 * @description 특정 컬럼 합계 계산
 *
 * @param dataArray - 데이터 배열
 * @param column - 컬럼명
 * @returns 합계
 *
 * @example
 * const data = [{amount: 100}, {amount: 200}, {amount: 300}];
 * gfn_sumColumn(data, 'amount')  // 600
 */
export function gfn_sumColumn(dataArray: DataRow[], column: string): number {
  if (!Array.isArray(dataArray)) return 0;
  return dataArray.reduce((sum, row) => {
    const val = parseFloat(String(row[column])) || 0;
    return sum + val;
  }, 0);
}

/**
 * @function gfn_avgColumn
 * @description 특정 컬럼 평균 계산
 *
 * @param dataArray - 데이터 배열
 * @param column - 컬럼명
 * @returns 평균
 */
export function gfn_avgColumn(dataArray: DataRow[], column: string): number {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return 0;
  return gfn_sumColumn(dataArray, column) / dataArray.length;
}

/**
 * @function gfn_maxColumn
 * @description 특정 컬럼 최대값
 *
 * @param dataArray - 데이터 배열
 * @param column - 컬럼명
 * @returns 최대값
 */
export function gfn_maxColumn(dataArray: DataRow[], column: string): number | null {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;
  const values = dataArray.map(row => parseFloat(String(row[column])) || 0);
  return Math.max(...values);
}

/**
 * @function gfn_minColumn
 * @description 특정 컬럼 최소값
 *
 * @param dataArray - 데이터 배열
 * @param column - 컬럼명
 * @returns 최소값
 */
export function gfn_minColumn(dataArray: DataRow[], column: string): number | null {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;
  const values = dataArray.map(row => parseFloat(String(row[column])) || 0);
  return Math.min(...values);
}

/**
 * @function gfn_countColumn
 * @description 조건에 맞는 행 수 계산
 *
 * @param dataArray - 데이터 배열
 * @param column - 컬럼명 (옵션)
 * @param value - 값 (옵션)
 * @returns 행 수
 */
export function gfn_countColumn(dataArray: DataRow[], column: string | null = null, value: unknown = null): number {
  if (!Array.isArray(dataArray)) return 0;

  if (column === null) {
    return dataArray.length;
  }

  // eslint-disable-next-line eqeqeq
  return dataArray.filter(row => row[column] == value).length;
}

// ============================================================
// 9. 그룹화/정렬 함수
// ============================================================

/** 집계 타입 */
export type AggregationType = 'sum' | 'avg' | 'count' | 'max' | 'min';

/** 정렬 설정 */
export interface SortConfig {
  column: string;
  order?: 'asc' | 'desc';
}

/**
 * @function gfn_groupBy
 * @description 그룹별 집계
 *
 * @param dataArray - 데이터 배열
 * @param groupColumns - 그룹 컬럼명 또는 배열
 * @param aggregations - 집계 설정 {컬럼명: 'sum'|'avg'|'count'|'max'|'min'}
 * @returns 그룹화된 배열
 *
 * @example
 * const data = [
 *   {dept: 'A', amount: 100},
 *   {dept: 'A', amount: 200},
 *   {dept: 'B', amount: 150}
 * ];
 * gfn_groupBy(data, 'dept', {amount: 'sum'})
 * // [{dept: 'A', amount: 300}, {dept: 'B', amount: 150}]
 */
export function gfn_groupBy(dataArray: DataRow[], groupColumns: string | string[], aggregations: Record<string, AggregationType> = {}): DataRow[] {
  if (!Array.isArray(dataArray)) return [];

  const groups = Array.isArray(groupColumns) ? groupColumns : [groupColumns];
  const grouped = new Map<string, DataRow & { _rows: DataRow[] }>();

  // 그룹화
  for (const row of dataArray) {
    const key = groups.map(col => String(row[col])).join('|');

    if (!grouped.has(key)) {
      const groupData: DataRow & { _rows: DataRow[] } = { _rows: [] };
      groups.forEach(col => groupData[col] = row[col]);
      grouped.set(key, groupData);
    }

    grouped.get(key)!._rows.push(row);
  }

  // 집계 계산
  const result: DataRow[] = [];
  for (const [, groupData] of grouped) {
    const rows = groupData._rows;
    const resultRow: DataRow = { ...groupData };
    delete resultRow._rows;

    for (const [col, aggType] of Object.entries(aggregations)) {
      switch (aggType) {
        case 'sum':
          resultRow[col] = rows.reduce((sum, r) => sum + (parseFloat(String(r[col])) || 0), 0);
          break;
        case 'avg':
          resultRow[col] = rows.reduce((sum, r) => sum + (parseFloat(String(r[col])) || 0), 0) / rows.length;
          break;
        case 'count':
          resultRow[col] = rows.length;
          break;
        case 'max':
          resultRow[col] = Math.max(...rows.map(r => parseFloat(String(r[col])) || 0));
          break;
        case 'min':
          resultRow[col] = Math.min(...rows.map(r => parseFloat(String(r[col])) || 0));
          break;
      }
    }

    result.push(resultRow);
  }

  return result;
}

/**
 * @function gfn_sortBy
 * @description 정렬
 *
 * @param dataArray - 데이터 배열
 * @param columns - 정렬 컬럼 또는 [{column: '컬럼명', order: 'asc'|'desc'}]
 * @param order - 정렬 순서 (단일 컬럼일 때) 'asc' 또는 'desc'
 * @returns 정렬된 새 배열
 *
 * @example
 * const data = [{name: '김', age: 30}, {name: '이', age: 25}];
 * gfn_sortBy(data, 'age', 'asc')  // [{name: '이', age: 25}, ...]
 */
export function gfn_sortBy(dataArray: DataRow[], columns: string | SortConfig[], order: 'asc' | 'desc' = 'asc'): DataRow[] {
  if (!Array.isArray(dataArray)) return [];

  const sortConfig: SortConfig[] = Array.isArray(columns)
    ? columns
    : [{ column: columns, order }];

  return [...dataArray].sort((a, b) => {
    for (const config of sortConfig) {
      const col = typeof config === 'string' ? config : config.column;
      const ord = typeof config === 'string' ? order : (config.order || 'asc');

      let valA: unknown = a[col];
      let valB: unknown = b[col];

      // 숫자 비교
      if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
        valA = parseFloat(String(valA));
        valB = parseFloat(String(valB));
      }

      if ((valA as number | string) < (valB as number | string)) return ord === 'asc' ? -1 : 1;
      if ((valA as number | string) > (valB as number | string)) return ord === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

/**
 * @function gfn_moveRow
 * @description 행 이동
 *
 * @param dataArray - 데이터 배열
 * @param fromIndex - 원본 인덱스
 * @param toIndex - 대상 인덱스
 * @returns 이동된 새 배열
 */
export function gfn_moveRow(dataArray: DataRow[], fromIndex: number, toIndex: number): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  if (fromIndex < 0 || fromIndex >= dataArray.length) return [...dataArray];
  if (toIndex < 0 || toIndex >= dataArray.length) return [...dataArray];

  const newArray = [...dataArray];
  const [removed] = newArray.splice(fromIndex, 1);
  newArray.splice(toIndex, 0, removed);

  return newArray;
}
