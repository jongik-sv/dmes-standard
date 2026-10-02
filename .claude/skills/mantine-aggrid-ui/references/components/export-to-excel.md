# exportToExcel

화면의 목록 데이터를 엑셀(.xlsx) 파일로 내려받게 할 때 쓴다. ag-grid 의 Excel Export 는 Enterprise 기능이라 쓰지 않는다.

- import: `import { exportToExcel, today, type ExcelColumn } from "@dk-oasis/shared/utils";`
- 소스: `src/frontend/shared/src/utils/libExcel.ts` (`today()` 는 `src/frontend/shared/src/utils/libDate.ts`)
- 내부 구현: `xlsx` 패키지를 호출 시점에 동적으로 불러와 `XLSX.writeFile` 로 내려받는다(별도 file-saver 불필요). 별칭 `gfn_exportToExcel` 도 있으나 새 화면은 `exportToExcel` 을 쓴다. `xlsx` 는 shared 의 devDependency 이고 포털 호스트 `m-mcm` 이 dependency(`^0.18.5`)로 가진다. MES 모듈 `package.json` 에는 추가하지 않는다(런타임 다운로드는 2026-10-01 기준 직접 확인하지 않았다)
- Part B 의 `utils` 항목은 세부 심볼 미등재(ASK)이지만, §6 이 Excel 다운로드에 한해 `exportToExcel`(`@dk-oasis/shared/utils`)을 쓰라고 지정한다.

## 언제 쓰나

- 쓴다: PageLayout 상단 "엑셀" 버튼에서 현재 목록(`rows`)을 내려받을 때.
- 쓰지 않는다: ag-grid Excel Export(`ag-grid-enterprise`) 사용 금지. 서버가 만든 파일 다운로드는 별도 처리다.

## 표준 사용

```tsx
import { exportToExcel, today } from "@dk-oasis/shared/utils";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useResolvedGridColumns, type GridColumn } from "@dk-oasis/shared/grid";

const COLUMNS: GridColumn[] = [
  { key: "inspNo", header: "검사번호", width: 120, align: "left" },
  { key: "itemNm", header: "품명", width: 180, align: "left" },
  { key: "qty", header: "수량", width: 100, align: "right", type: "number" },
];

export function useInspExport(rows: Record<string, unknown>[]) {
  const { showMessage } = useMessage();
  // header 를 생략한 열(MDM 캡션)도 그리드에 보이는 머리글과 같게 채운다.
  const columns = useResolvedGridColumns(COLUMNS);
  return async () => {
    // 데이터가 0건이면 exportToExcel 은 아무 알림 없이 끝나므로 화면이 먼저 알린다.
    if (rows.length === 0) {
      showMessage({ message: "엑셀로 내보낼 데이터가 없습니다.", alertType: "warning" });
      return;
    }
    try {
      await exportToExcel(rows, `검사결과_${today()}.xlsx`, "Sheet1", columns.map((c) => ({ key: c.key, header: c.header ?? c.key })));
    } catch (e) {
      showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
    }
  };
}
```

PageLayout 상단 버튼은 `{ id: "btn_export", label: "엑셀", onClick: () => void exportInsp(), disabled: isBusy, action: "export" }` 로 둔다.

## 변형

### 열 폭 지정

`ExcelColumn` 의 `width` 는 글자 수 단위이고 생략하면 15 다. 열 정의(`GridColumn.width`)는 픽셀이라 그대로 옮기지 않는다.

```tsx
const EXCEL_COLUMNS: ExcelColumn[] = [
  { key: "inspNo", header: "검사번호", width: 14 },
  { key: "itemNm", header: "품명", width: 24 },
];
```

### 열 정의 없이 내보내기

`columns` 를 생략하면 행 객체의 모든 필드가 필드 이름을 머리로 내려간다. 내부 필드(`__gridTempId`, `nativeeditor_status`)가 섞이므로 화면 데이터에는 쓰지 않는다.

## Props

`exportToExcel(data, fileName?, sheetName?, columns?): Promise<void>`

| 인자 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| data | `Record<string, unknown>[]` | 필수 | 내보낼 행. 비어 있으면 파일을 만들지 않고 콘솔에 경고만 남긴다 |
| fileName | `string` | `"export.xlsx"` | 내려받을 파일 이름 |
| sheetName | `string` | `"Sheet1"` | 시트 이름 |
| columns | `ExcelColumn[]` | - | 내보낼 열과 머리. 주면 이 열만, 이 순서로 나간다 |

`ExcelColumn`: `key: string`(행의 필드 이름), `header: string`(엑셀 머리), `width?: number`(글자 수, 기본 15, `columns` 를 줄 때만 적용).

## 표준값: 모든 화면 동일

- 파일 이름은 `<화면명>_<yyyyMMdd>.xlsx`(`today()` 가 `yyyyMMdd` 를 준다), 시트 이름은 `"Sheet1"`.
- 열은 `useResolvedGridColumns(COLUMNS).map((c) => ({ key: c.key, header: c.header ?? c.key }))` 로 목록 열 정의에서 만든다(`header` 를 생략한 열은 그리드와 같은 MDM 캡션).
- PageLayout 상단 버튼은 id `btn_export`, label "엑셀", action `export`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 0건일 때 눌러도 아무 일이 없다 | 0건이면 파일도 안내도 없다. 화면이 먼저 확인해 `showMessage` 로 알린다 |
| `render`(배지)·`cellEditorValueLabels`(라벨) 값이 엑셀에 그대로 나올 줄 안다 | 엑셀은 `rows` 의 원시 값을 내린다. 코드 대신 명칭이 필요하면 내보낼 행을 먼저 변환한다 |
| `hide` 열이나 `__drag` 같은 보조 열이 같이 나간다 | `COLUMNS` 에서 걸러서 `columns` 를 만든다 |
| `ag-grid` 의 Excel Export 를 쓴다 | Enterprise 기능이라 금지다 |
| 오류를 `console.error` 로 찍는다 | `showMessage({ alertType: "error" })` |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmb/layoutMng/page.tsx:306-314`: `exportToExcel(rows, 파일명, 시트명, 열)` + `try/catch` 로 오류 표시. 단, 시트 이름이 "snapshot"이고 열 정의에 `width` 를 주는 점, 오류를 `ErrorModal` 용 상태로 보내는 점은 표준과 다름.
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)의 화면에서는 아직 사용처 없음.
