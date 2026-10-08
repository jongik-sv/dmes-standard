# ColumnSettingsModal

그리드 컬럼의 표시 여부와 순서를 한 줄씩 바꾸는 제어형 창이다. 컬럼 목록을 받아 보여 주고 [적용]·[기본값 복원] 결과만 돌려주는 순수 UI 라서 그리드 내부를 모른다.

- import: `import { ColumnSettingsModal, type ColumnSettingsColumn, type ColumnSettingsGroup, type ColumnSettingsModalProps, type ColumnSettingsState } from "@dk-oasis/shared/grid";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/grid/ColumnSettingsModal.tsx`
- 내부 구현: shared [Modal](modal.md)(`size="md"`) 안에 shared `form` 의 `Checkbox`·`Button`(순서 이동은 `size="mini"` 위·아래 단추)
- 함께 추가된 내부 부품: 머리글 우클릭 메뉴 `GridHeaderContextMenu.tsx`(Mantine `Menu`, 화면이 쓰지 않는 내부 부품이라 export 하지 않는다), GridPanel 과 안쪽 그리드를 잇는 `grid-panel-context.ts`
- Part B 허용 목록(§1): `grid` 서브패스에 포함(새 서브패스 없음, §18 등록).

## 언제 쓰나

- **대부분의 화면은 직접 쓸 일이 없다.** [AgDataGrid](ag-data-grid.md) 는 컬럼 개인화가 켜져 있으면(기본 켬) 이 창을 스스로 소유한다. 열 때마다 지금 컬럼 목록을 만들어 주고, 적용·복원 결과를 개인화 저장에 반영한다. 사용자는 「그리드 설정」 메뉴의 「컬럼 설정…」(GridPanel 안이면 [GridPanel](grid-panel.md) 머리줄, GridPanel 밖이면 그리드 머리글 줄 오른쪽 끝의 작은 아이콘)이나 그리드 머리글 우클릭 메뉴로 연다. 대화 상자 안의 그리드는 아이콘 메뉴에 엑셀 항목만 있고 우클릭 메뉴는 없어 컬럼 설정을 열 수 없다. 화면은 `gridId`·`personalize` 만 신경 쓰면 된다(자세한 동작은 ag-data-grid 의 「컬럼 개인화」 절).
- 쓴다: 그리드 밖에서 "열(항목)을 골라 보이고 순서를 정하는" UI 가 필요할 때. 예를 들어 엑셀·인쇄 대상 항목 고르기, 자체 표·차트의 계열 표시 설정처럼 항목 목록 하나에 표시 체크와 순서 이동만 있으면 된다.
- 쓰지 않는다:
  - 후보 목록에서 골라 어떤 묶음에 넣고 빼는 편집(좌 가능·우 소속) → [TransferList](transfer-list.md). 이 창은 한 목록에서 켜고 끄며 순서만 바꾼다.
  - 항목마다 이름·타입 같은 여러 칸을 고치고 행을 추가·삭제해야 할 때 → [EditableRowList](editable-row-list.md).
  - AgDataGrid 의 컬럼 설정을 화면이 따로 열려는 경우 → 이미 있는 「그리드 설정」 메뉴(그리드 머리줄 — GridPanel 안·밖 공통)·헤더 우클릭을 쓴다. 두 번째 창을 만들지 않는다.
- 제어형이다. `opened`·`columns` 와 결과(`onApply`·`onReset`)는 모두 props 로 오간다. 열린 동안만 그리며, 열 때마다 `columns` 로 처음부터 시작하므로 바깥에서 편집 중 상태를 유지할 필요가 없다. 창 안 변경은 [적용]을 눌러야 `onApply` 로 나가고 [취소]·X·Esc 는 버린다.

## 표준 사용

그리드 밖에서 항목 표시 설정을 받는 화면 예시다.

```tsx
import { useCallback, useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { ColumnSettingsModal, type ColumnSettingsColumn, type ColumnSettingsState } from "@dk-oasis/shared/grid";

const DEFAULT_ITEMS: ColumnSettingsColumn[] = [
  { colId: "itemCd", header: "품목코드", hide: false, locked: true },
  { colId: "itemNm", header: "품목명", hide: false },
  { colId: "spec", header: "규격", hide: true },
];

export function ExportItemPicker({ onChange }: { onChange: (items: ColumnSettingsState[]) => void }) {
  const [opened, setOpened] = useState(false);
  const [items, setItems] = useState<ColumnSettingsColumn[]>(DEFAULT_ITEMS);

  const handleApply = useCallback(
    (state: ColumnSettingsState[]) => {
      // state 는 모든 항목의 { colId, hide } 를 바뀐 순서대로 담는다.
      const byId = new Map(items.map((c) => [c.colId, c]));
      setItems(state.flatMap((s) => {
        const col = byId.get(s.colId);
        return col ? [{ ...col, hide: s.hide }] : [];
      }));
      onChange(state);
    },
    [items, onChange],
  );

  return (
    <>
      <Button onClick={() => setOpened(true)}>항목 설정</Button>
      <ColumnSettingsModal
        opened={opened}
        columns={items}
        onApply={handleApply}
        onReset={() => setItems(DEFAULT_ITEMS)}
        onClose={() => setOpened(false)}
      />
    </>
  );
}
```

`onApply`·`onReset` 다음에는 창이 스스로 `onClose` 를 부른다. 화면은 `onClose` 에서 `opened` 만 끄면 된다.

## 규칙

- 목록 구성: 줄은 `columns` 순서(그리드 순서)대로 보이고, 줄마다 표시 체크와 위·아래 이동 단추가 있다. 이름은 `header`(비었으면 `colId`)를 보인다.
- 잠긴 컬럼(`locked: true`): 체크가 켜진 채 비활성이고 숨길 수 없다(「숨길 수 없는 컬럼」 툴팁). 순서 이동은 된다. 보이는 컬럼이 하나도 없으면(잠긴 컬럼이 없고 전부 숨기면) [적용]이 비활성이다.
- 내부 컬럼(`internal: true`): 선택 체크박스·행 번호·화면 정의에서 숨긴 컬럼. 창에 줄이 나오지 않는다. 그래도 `onApply` 로 넘기는 상태에는 **모든 컬럼을 원래 자리 그대로** 담는다. 보이는 컬럼 순서만 보내면 ag-grid 가 빠진 컬럼(선택 체크박스 등)을 맨 뒤로 보내기 때문이다.
- 고정(pinned) 컬럼: 고정 컬럼이 하나라도 있으면 「왼쪽 고정」·「일반」·「오른쪽 고정」 구역 머리로 모아 보인다. 순서 이동은 **같은 구역 안에서만** 되고(구역 경계의 단추는 비활성), 고정 구역을 바꾸는 일은 이 창이 아니라 그리드 머리글 조작이다.
- 열 그룹: `group`(가장 가까운 그룹 `{ id, header }`)·`groupPath`(바깥 → 안쪽 경로, 중첩 그룹용)가 있는 컬럼은 앞에 그룹 이름 제목 줄(`{testId}-group-{groupId}`)이 나오고, 순서 이동은 **같은 그룹(같은 `group.id`) 안에서만** 된다(그룹 경계의 단추는 비활성, 그룹 밖 컬럼끼리는 구역 규칙만). 그룹을 통째로 옮기는 기능은 없다. 둘 다 생략하면 이전과 같다.
- 너비: `onApply` 는 `{ colId, hide }` 만 넘기고 `width` 를 넘기지 않는다. `width` 가 있으면 컬럼 개인화가 그 컬럼 너비를 저장하고 잠그기 때문이다. 너비는 헤더 경계를 끌 때만 저장된다.
- 순서 이동 뒤에는 같은 이동 단추로 초점이 돌아와 키보드로 이어서 옮길 수 있다.
- 두 컬럼이 서로 자리를 바꾸는 방식이라 사이에 낀 내부 컬럼은 제자리에 남는다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| opened | `boolean` | 필수 | 창을 열었는가. `false` 면 아무것도 그리지 않는다 |
| columns | `readonly ColumnSettingsColumn[]` | 필수 | 지금 컬럼 목록(그리드 순서). 열 때마다 이 값으로 시작한다 |
| onApply | `(state: ColumnSettingsState[]) => void` | 필수 | [적용] 시 모든 컬럼의 `{ colId, hide }` 를 바뀐 순서대로 넘기고 창을 닫는다 |
| onReset | `() => void` | 필수 | [기본값 복원] 시 호출하고 창을 닫는다. 실제 복원은 받는 쪽이 한다 |
| onSave | `(state: ColumnSettingsState[]) => void` | - | 주면 바닥에 [지금 상태 저장](`data-testid` `{testId}-save`)이 보인다. 누르면 `onApply` 와 같은 모양의 상태를 넘기고 창을 닫는다(받는 쪽이 적용한 뒤 저장한다). 자동 저장이 꺼진 AgDataGrid 만 준다 |
| onClose | `() => void` | 필수 | 닫기(취소·X·Esc·적용·복원·지금 상태 저장 뒤) |
| title | `string` | `"컬럼 설정"` | 창 제목 |
| testId | `string` | `"column-settings"` | 바깥 상자의 `data-testid` 접두어(`-reset`·`-save`·`-cancel`·`-apply`·`-row-{colId}`·`-up-{colId}`·`-down-{colId}` 등이 붙는다) |

`ColumnSettingsColumn`: `colId: string`, `header: string`, `hide: boolean`, `pinned?: "left" | "right" | null`, `locked?: boolean`, `internal?: boolean`, `group?: ColumnSettingsGroup`, `groupPath?: readonly ColumnSettingsGroup[]`.
`ColumnSettingsGroup`: `id: string`, `header: string`.
`ColumnSettingsState`: `colId: string`, `hide: boolean`.

## 표준값: 모든 화면 동일

- 제목·버튼 문구(「컬럼 설정」·「기본값 복원」·「지금 상태 저장」·「취소」·「적용」)는 기본값 그대로 쓴다. AgDataGrid·그리드 설정 메뉴(GridPanel 안·밖)·헤더 우클릭 메뉴가 같은 문구를 쓴다(메뉴 항목 이름은 `grid-settings-labels.ts`).
- `testId` 도 AgDataGrid 가 소유하는 창은 기본값(`column-settings`)이다. 같은 화면에서 직접 쓴 창이 따로 있으면 다른 접두어를 준다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| AgDataGrid 컬럼을 고르게 하려고 이 창을 화면에서 직접 연다 | 개인화가 켜져 있으면 「그리드 설정」 메뉴(그리드 머리줄)·헤더 우클릭 메뉴가 이미 같은 창을 연다. 끈 그리드(`personalize={false}`)에는 이 기능을 붙이지 않는다 |
| `onApply` 로 받은 상태에서 내부 컬럼을 걸러 낸다 | 모든 컬럼이 원래 자리에 담겨 온다. 걸러 내면 선택 체크박스 등이 뒤로 밀린다 |
| `columns` 에 `width` 를 얹어 `onApply` 결과에 합쳐 넘긴다 | 너비를 넘기면 개인화가 그 컬럼 너비를 저장·잠근다. `{ colId, hide }` 만 쓴다 |
| 창이 열린 동안 `columns` 를 바꾸면 창에 반영될 거라 기대한다 | 창은 열릴 때의 `columns` 로 한 번 시작하고 이후 바뀐 값은 반영하지 않는다. 열기 직전에 목록을 만든다 |
| 항목 추가·삭제·이름 변경까지 이 창에 기대한다 | 표시 여부와 순서만 다룬다. 항목을 고치려면 `EditableRowList`, 소속 편집은 `TransferList` 를 쓴다 |
| 고정 컬럼을 다른 구역으로 옮기려 한다 | 이 창은 구역 안 순서만 옮긴다. 고정 변경은 그리드 머리글 조작이다 |
| 열 그룹 잎을 그룹 밖으로 옮기려 한다 | `group` 을 준 컬럼은 같은 그룹 안에서만 옮겨진다. 그룹 경계는 단추가 비활성이다 |

## 실제 사용 예

- `src/frontend/shared/src/components/grid/AgDataGrid.tsx`(파일 끝 `ColumnSettingsModal` 렌더): 개인화 핸들의 `getColumns()` 결과를 `columns` 로, `apply`·`reset` 을 `onApply`·`onReset` 으로 잇고, 자동 저장이 꺼진 그리드만 `apply` 뒤 `saveNow` 를 `onSave` 로 잇는다. 화면 코드에서 직접 쓰는 곳은 아직 없다.
