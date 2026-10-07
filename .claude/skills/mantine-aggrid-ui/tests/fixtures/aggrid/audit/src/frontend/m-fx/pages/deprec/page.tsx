import type { ColDef, GridOptions } from 'ag-grid-community';
// 설치본 d.ts 의 @deprecated 속성 점검(가짜 d.ts 는 시험이 만든다)
const cols: ColDef[] = [
  { field: 'a', checkboxSelection: true },
  { field: 'b', headerCheckboxSelection: true, suppressMenu: false },
  { field: 'c', isRowSelectable: true },
];
const opts: GridOptions = {
  suppressRowClickSelection: true,
  isRowSelectable: (n) => true,
  rowSelection: { isRowSelectable: (n) => true },
  animateRows: true,
  enableRangeSelection = true,
  suppressFoo   : 'x',
  suppressRowClickSelectionExtra: 1,
  한글suppressFoo: 1,
  suppressFoo한글: 1,
};
// 주석 안: suppressMenu: true 도 (주석이라도 deprecated 검사는 원문 그대로) 걸린다
