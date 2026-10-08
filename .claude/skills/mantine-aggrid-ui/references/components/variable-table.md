# VariableTable

이름·형식·값·설명 네 칸의 변수 목록을 편집하는 표다. 값에는 고정값이나 실행 변수(`:today` 등)를 쓰며, 표 아래에 쓸 수 있는 실행 변수 안내를 보인다. 업무 도메인을 모른다.

- import: `import { VariableTable, type JobVarRow, RUNTIME_VARIABLES } from "@dk-oasis/shared/variable-table";`
- 소스: `src/frontend/shared/src/components/variable-table/VariableTable.tsx` (`variables.ts` 에 형식·실행 변수·행 도우미)
- 내부 구현: `mode="full"` 은 [EditableRowList](editable-row-list.md), `mode="valueOnly"` 는 [AgDataGrid](ag-data-grid.md)(값 칸만 편집)를 [GridPanel](grid-panel.md) 로 감싸 쓴다.
- Part B 허용 목록(§1): `variable-table` SHOULD.
- 같은 경로의 export: `VariableTableProps`·`JobVarRow`·`VariableType`·`RUNTIME_VARIABLES`·`VARIABLE_TYPE_LABEL`·`newVariableRow`·`normalizeVariableCell`.

## 언제 쓰나

- 쓴다: 이름·형식·값·설명 네 칸 변수 목록을 편집할 때(예약 작업의 변수).
- 쓰지 않는다: 일반 목록 편집 → [editable-row-list](editable-row-list.md). 읽기 전용 표 → [ag-data-grid](ag-data-grid.md).
- `mode="valueOnly"`: 코드로 정한 목록(행 추가·삭제·이름·형식 편집 없이 값만 고친다).
- `runtimeVariables`: 값 칸 안내문을 교체한다. 기본 `RUNTIME_VARIABLES`(`:schedAt`·`:now`·`:today`·`:yesterday`·`:monthStart`·`:prevMonthStart`·`:prevRunAt`·`:jobId`·`:moduleCd`)는 서버가 선점 때 확정하는 이름과 같다.
- 이름은 앞뒤 공백을 지우고 다른 칸은 입력 그대로 둔다(`normalizeVariableCell`). `valueOnly` 의 `disabled` 는 값 변경 통지를 막는다.

## 표준 사용

```tsx
import { VariableTable, type JobVarRow } from "@dk-oasis/shared/variable-table";

export function JobVariables({ rows, onChange, isCode }: { rows: JobVarRow[]; onChange: (r: JobVarRow[]) => void; isCode: boolean }) {
  return (
    <VariableTable
      value={rows}
      onChange={onChange}
      mode={isCode ? "valueOnly" : "full"}
      hint={isCode ? "변수 목록은 코드가 정합니다. 값만 고칩니다." : "쿼리에서는 :이름 으로 씁니다."}
      idPrefix="job-variable"
    />
  );
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `JobVarRow[]` | — | `{ name, type: "STRING"\|"NUMBER"\|"DATE"\|"JSON", value, desc? }` 목록 |
| `onChange` | `(rows: JobVarRow[]) => void` | — | 행이 바뀔 때 전체 목록 |
| `mode` | `"full" \| "valueOnly"` | `"full"` | `valueOnly` 는 값만 편집 |
| `disabled` | `boolean` | `false` | `valueOnly` 에서 값 변경 통지를 막는다. `full`(EditableRowList)에는 비활성 입력이 없어 적용되지 않으니, 처리 중에 막아야 하면 화면이 표 위에서 처리 중 안내를 보이고 저장을 막는다 |
| `hint` | `ReactNode` | — | 표 아래 안내(유형마다 다른 쓰임) |
| `runtimeVariables` | `{ name; desc }[]` | `RUNTIME_VARIABLES` | 값 칸에 쓸 실행 변수 안내 |
| `title` | `string` | `"변수"` | 표 제목 |
| `idPrefix` | `string` | `"job-variable"` | 그리드 ID·테스트 ID 접두어. 한 화면에 둘 이상이면 서로 다르게 준다 |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 코드로 정한 변수를 `full` 로 열어 이름·형식을 고치게 함 | `mode="valueOnly"` |
| 한 화면에 표를 둘 두면서 `idPrefix` 를 같게 둠 | 서로 다른 `idPrefix` |
| 실행 변수 이름을 화면에서 따로 적음 | 기본 `RUNTIME_VARIABLES` 를 쓴다(서버 확정 이름과 같다) |
