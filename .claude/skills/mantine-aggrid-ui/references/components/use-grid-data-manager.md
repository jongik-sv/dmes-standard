# useGridDataManager

그리드 편집 화면에서 행 추가·수정·삭제 상태를 관리하고, 변경된 행만 모아 저장 페이로드로 넘길 때 쓴다. 저장형 화면은 반드시 이 훅으로 행 상태를 관리한다(Part B MUST).

- import: `import { useGridDataManager, ROW_STATUS, getRowIdentifier, type SavePayload } from "@dk-oasis/shared/grid";`
- 소스: `src/frontend/shared/src/components/grid/useGridDataManager.ts`
- 내부 구현: React `useState`·`useRef` 만 쓰는 훅. 행마다 `nativeeditor_status` 필드로 상태를 둔다

## 언제 쓰나

- 쓴다: 그리드에서 행을 추가·수정·삭제(삭제 표시)하고 "저장" 버튼으로 한 번에 보내는 화면.
- 쓰지 않는다: 조회만 하는 목록, 상세 폼 1건 저장 화면(`useState` 로 충분하다) → [AgDataGrid](ag-data-grid.md) 만 쓴다.
- 추가·삭제 버튼은 [GridPanel](grid-panel.md) 이 그린다. 이 훅은 그 콜백을 받는다.

## 표준 사용

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PageLayout, ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import {
  AgDataGrid, GridPanel, getRowIdentifier, useGridDataManager,
  type GridColumn, type SavePayload,
} from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { saveUnits, searchUnits } from "./api"; // saveUnits(p: SavePayload): Promise<void>, searchUnits(): Promise<Record<string, unknown>[]>

type UnitForm = { unitCd: string; unitNm: string; useYn: string };
const ROW_KEY = "unitCd";
// 훅 옵션은 모듈 상수로 둔다(렌더마다 새 값을 주면 setRows 가 매번 바뀐다).
const EMPTY_FORM: UnitForm = { unitCd: "", unitNm: "", useYn: "Y" };
const rowToForm = (row: Record<string, unknown>): Partial<UnitForm> => ({
  unitCd: String(row.unitCd ?? ""), unitNm: String(row.unitNm ?? ""), useYn: String(row.useYn ?? "Y"),
});
const formDefaultsToRow = () => ({ useYn: "Y" });
const COLUMNS: GridColumn[] = [
  { key: "unitCd", header: "단위코드", width: 120, align: "left", editable: true },
  { key: "unitNm", header: "단위명", width: 180, align: "left", editable: true },
  { key: "useYn", header: "사용", width: 80, align: "center", editable: true, cellEditor: "select", cellEditorValues: ["Y", "N"] },
];

export default function UnitMngPage() {
  const { showMessage } = useMessage();
  const [isLoading, setIsLoading] = useState(false);
  const reloadRef = useRef<() => Promise<void>>(async () => {});
  const grid = useGridDataManager<UnitForm>({
    rowKey: ROW_KEY, emptyForm: EMPTY_FORM, rowToForm, formDefaultsToRow,
    saveHandler: (p: SavePayload) => saveUnits(p),
    onSaveSuccess: async () => {
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      await reloadRef.current(); // 저장 뒤 다시 조회해야 상태(inserted·updated)가 지워진다
    },
  });
  const isBusy = isLoading || grid.isSaving;
  const { setRows, saveError, dismissSaveError } = grid;

  const load = useCallback(async () => {
    setIsLoading(true);
    try { setRows(await searchUnits()); }
    catch (e) { showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" }); }
    finally { setIsLoading(false); }
  }, [setRows, showMessage]);
  reloadRef.current = load;

  // handleSave 는 예외를 던지지 않고 saveError 에 담는다. 화면이 이 값을 보고 모달을 띄운다.
  useEffect(() => {
    if (!saveError) return;
    showMessage({ title: "오류", message: saveError, alertType: "error", callback: dismissSaveError });
  }, [saveError, dismissSaveError, showMessage]);

  const confirmDeleteRow = () =>
    showMessage({ title: "확인", message: "선택한 행을 삭제하시겠습니까?", alertType: "confirm", onConfirm: grid.handleDeleteRow });

  const handleSearch = () => {
    if (!grid.hasChanges) { void load(); return; }
    showMessage({ title: "확인", message: "저장하지 않은 변경이 있습니다. 조회하시겠습니까?", alertType: "confirm", onConfirm: () => void load() });
  };

  return (
    <PageLayout
      title="단위 관리"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary", disabled: isBusy, action: "search" },
        { id: "btn_save", label: "저장", onClick: () => void grid.handleSave(), type: "save", disabled: isBusy || !grid.hasChanges, action: "save" },
      ]}
    >
      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="단위 목록" count={grid.rows.length}
            showAddButton loading={isBusy}
            buttons={[{ id: "btn_grid_delete", label: "행삭제", onClick: confirmDeleteRow, disabled: grid.selectedRowKey == null }]}
            data={grid.rows} rowKey={ROW_KEY} columns={COLUMNS}
            selectedRowKey={grid.selectedRowKey}
            defaultRowValues={grid.defaultRowValues}
            onDataChange={grid.handleGridDataChange}
          >
            <AgDataGrid
              rowKey={ROW_KEY} columns={COLUMNS} data={grid.rows} columnSizing="fit"
              highlightedRowKey={grid.selectedRowKey} scrollToRow={grid.scrollToRowKey}
              loading={isBusy}
              onRowClick={(r) => grid.handleRowClick(getRowIdentifier(r, ROW_KEY))}
              onCellValueChanged={(p) => {
                // 훅은 선택된 행만 갱신한다. 다른 행 값이 덮이지 않도록 선택 행인지 확인한다.
                if (p.rowKey === grid.selectedRowKey) grid.handleFormChange(p.field, p.newValue);
              }}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
```

저장 페이로드 변환(inserted/updated/deleted → BE body)은 `*-api.ts` 에서 한다.

```ts
import type { SavePayload } from "@dk-oasis/shared/grid";

type SaveRow = Record<string, unknown> & { rowStatus: "inserted" | "updated" | "deleted" };

export function toSaveRows(p: SavePayload): SaveRow[] {
  const mark = (rows: Record<string, unknown>[], rowStatus: SaveRow["rowStatus"]): SaveRow[] =>
    rows.map((r) => ({ ...r, rowStatus }));
  return [...mark(p.inserted, "inserted"), ...mark(p.updated, "updated"), ...mark(p.deleted, "deleted")];
}
```

## 변형

### 셀 편집과 그 한계

위 예제처럼 열에 `editable: true` 를 주고 `onCellValueChanged` 에서 `grid.handleFormChange(p.field, p.newValue)` 를 부른다. 훅은 선택된 행(`selectedRowKey`)만 갱신하므로 편집은 행을 먼저 클릭해 선택한 뒤에 일어난다는 전제다. Tab·키보드 이동·`editArrowNavigation` 으로 클릭 없이 다른 행을 편집하면, 확인 없이 부를 경우 값이 이전에 선택한 행에 들어가고, 위 예제처럼 확인하면 그 편집은 수정 상태가 되지 않는다. 훅은 이를 지원하지 않는다. 편집 진입은 기본값(더블클릭)을 쓰고 `singleClickEdit` 를 켜지 않는다. 이 경우를 화면에서 우회 코드로 막지 않고, shared 확장 후보(행 키를 받는 변경 함수)로 보고한다.

### 상세 폼과 함께 쓰기

`formData`·`handleFormChange`·`isFormDisabled` 로 우측 상세 폼을 잇는다. `formFieldToRow(field, value)` 옵션은 폼 필드 하나가 행의 여러 칸을 바꿀 때(코드 선택 → 명칭 칸 동시 갱신) 쓴다.

## 옵션과 반환값

`useGridDataManager<T extends Record<string, unknown>>(options)`. `T` 는 `interface` 가 아니라 `type` 으로 선언한다(`interface` 는 인덱스 시그니처가 없어 제약을 만족하지 못한다).

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| rowKey | `string` | `"id"` | 행 식별 열 key |
| emptyForm | `Partial<T>` | 필수 | 선택이 없을 때·행추가 직후 폼 값. 모듈 상수로 둔다 |
| rowToForm | `(row) => Partial<T>` | 필수 | 행 클릭 시 폼 값으로 바꾼다 |
| formFieldToRow | `(field, value) => Record<string, unknown>` | - | 폼 필드 변경을 행 갱신 값으로 바꾼다 |
| formDefaultsToRow | `() => Record<string, unknown>` | - | 새 행의 기본값. 결과가 `defaultRowValues` 가 된다 |
| saveHandler | `(payload: SavePayload) => Promise<void>` | - | 저장 함수. 없으면 `handleSave` 는 아무것도 하지 않는다 |
| onSaveSuccess | `() => void \| Promise<void>` | - | 저장 성공 뒤 호출. 토스트와 재조회를 여기에 둔다 |

| 반환값 | 타입 | 설명 |
|---|---|---|
| rows / setRows | `Record<string, unknown>[]` / `(data) => void` | 행 목록 / 조회 결과 세팅(상태 초기화, 원본 보관, 선택 해제) |
| selectedRowKey, isNewRow | `string \| number \| null`, `boolean` | 선택 행 키, 선택 행이 신규인지 |
| formData | `Partial<T>` | 상세 폼 값 |
| handleFormChange | `(field, value) => void` | 폼 값과 선택 행을 함께 갱신. 행 상태는 `updated`(신규는 `inserted` 유지) |
| handleRowClick | `(rowId) => void` | 행 선택 + 폼 채움 |
| handleGridDataChange | `(newData, addedRowKey?) => void` | `GridPanel.onDataChange` 에 연결. 추가·삭제를 처리 |
| handleDeleteRow / handleCopyRow | `() => void` | 선택 행 삭제 표시(신규 행은 즉시 제거) / 복사(신규 행으로) |
| handleSave | `() => Promise<void>` | 변경 행을 모아 `saveHandler` 호출. 변경이 없으면 아무 일 없이 끝난다 |
| handleCancel | `() => void` | 조회 시점으로 모두 되돌린다 |
| hasChanges | `boolean` | `nativeeditor_status` 가 비어 있지 않은 행이 있는가 |
| isSaving, saveError, dismissSaveError | `boolean`, `string \| null`, `() => void` | 저장 중 / 저장 실패 메시지 / 메시지 지움 |
| isFormDisabled | `boolean` | 선택도 신규도 없으면 참 |
| scrollToRowKey, defaultRowValues | `string \| number \| null`, `Record<string, unknown>` | `AgDataGrid.scrollToRow` / `GridPanel.defaultRowValues` 에 연결 |

`SavePayload` 는 `{ inserted, updated, deleted, totalChanges }` 이고 행에서 `__gridTempId` 만 지운다. `ROW_STATUS` 는 `NONE ""`·`INSERTED "inserted"`·`UPDATED "updated"`·`DELETED "deleted"` 이며 행의 `nativeeditor_status` 에 들어간다.

## 표준값: 모든 화면 동일

- 처리 중 변수는 `isBusy`(`isLoading || grid.isSaving`). 저장 버튼은 `disabled: isBusy || !grid.hasChanges`.
- 저장 성공은 `onSaveSuccess` 에서 토스트("저장되었습니다.")와 재조회, 실패는 `saveError` 를 보고 오류 모달. 문구는 [message](message.md) 를 본다.
- 저장형 화면은 상단 삭제 버튼 없이 GridPanel 머리의 행추가(`showAddButton`)와 확인창 행삭제 버튼(`buttons`)을 쓴다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `emptyForm`·`formDefaultsToRow` 를 렌더 안에서 인라인으로 준다 | `setRows`·`defaultRowValues` 가 매번 바뀌어 `useEffect` 조회가 반복된다. 모듈 상수로 둔다 |
| `handleSave` 가 던질 줄 알고 try/catch 를 쓴다 | 던지지 않는다. `saveError` 를 effect 로 본다 |
| 저장 뒤 `setRows` 를 안 부른다 | `hasChanges` 가 계속 참이다. `onSaveSuccess` 에서 재조회한다 |
| 삭제 표시한 행을 수정한다 | `handleFormChange` 가 상태를 `updated` 로 바꿔 삭제 표시가 풀린다 |
| 추가 행의 PK 가 서버 채번인데 payload 를 그대로 보낸다 | `rowKey` 칸에 `""` 또는 `__new_N` 이 남아 있다. `*-api.ts` 에서 지운다 |
| 행복사에 `showCopyButton` 과 `defaultRowValues` 를 같이 쓴다 | 복사 행이 기본값으로 덮인다. `grid.handleCopyRow` 를 직접 쓴다 |
| 행삭제 뒤에 `count` 가 줄지 않는다 | 삭제 표시 행도 `rows` 에 남는다(GridPanel 의 행삭제는 그 행을 맨 뒤로 옮긴다). 건수가 필요하면 `rows` 에서 삭제 표시 행을 뺀다 |
| 추가·수정 행에 배경색이 자동으로 칠린다고 본다 | 소스는 `deleted` 만 칠한다(`ag-row-deleted`). `inserted`·`updated` 는 `_rowState` 가 아니라서 칠하지 않는다. UI-Visual-Standard §7 과 어긋나는 shared 결함이다. 화면에서 `getRowClassExtra` 로 메우지 말고 shared 수정을 기다린다(일부 mdm 화면은 직접 주지만 표준이 아니다) |

## 실제 사용 예

아직 사용처 없음. `src/frontend/m-*` 의 어느 화면도 이 훅을 import 하지 않는다. 같은 흐름을 손으로 구현한 화면은 `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:909-921` 이다(GridPanel + `onDataChange` + `loading`). 훅이 맡는 행 상태 관리를 화면이 직접 구현한 점은 표준과 다름.
