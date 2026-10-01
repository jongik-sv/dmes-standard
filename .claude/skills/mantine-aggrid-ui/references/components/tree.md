# Tree

메뉴·코드 계층처럼 부모-자식 구조를 접고 펼치는 트리로 보여 주고 한 노드를 고르게 할 때 쓴다.

- import: `import { Tree, type TreeNode, type TreeProps } from "@dk-oasis/shared/tree";` 와 `import "@dk-oasis/shared/tree.css";`
- 소스: `src/frontend/shared/src/components/tree/Tree.tsx` (스타일은 `tree.css`)
- 내부 구현: Mantine `Tree` + `useTree`(단일 선택, 클릭으로 펼침 대신 화살표 아이콘으로 펼침). Part B 에서 SHOULD. 옛 오기 `TreeView` 는 존재하지 않는 심볼이라 import 하지 않는다

## 언제 쓰나

- 쓴다: 메뉴 트리, 코드 계층 트리처럼 단일 선택 계층 표현.
- 쓰지 않는다: 계층이 없는 목록 → [AgDataGrid](ag-data-grid.md). 계층 데이터를 표 형태로 보여야 하면 펼침 상태를 호출자가 관리하는 평탄화 목록 + `onRowExpandCollapse` 를 쓴다.
- 다중 선택은 지원하지 않는다(`multiple: false` 고정).

## 표준 사용

```tsx
import { useMemo, useState } from "react";
import { Tree, type TreeNode } from "@dk-oasis/shared/tree";
import "@dk-oasis/shared/tree.css";

type CateRow = { cateId: string; cateNm: string; parentId: string | null };

function toTree(rows: CateRow[], parentId: string | null = null): TreeNode[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .map((r) => ({ id: r.cateId, label: r.cateNm, children: toTree(rows, r.cateId) }));
}

export function CateTree({ rows, onPick }: { rows: CateRow[]; onPick: (id: string) => void }) {
  const items = useMemo(() => toTree(rows), [rows]); // items 는 메모이즈한다
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <Tree
        items={items}
        expandedItems={expanded}
        selectedItems={selected ? [selected] : []}
        onExpandedItemsChange={(_e, next) => setExpanded(next.map(String))}
        onSelectedItemsChange={(_e, id) => { setSelected(id); onPick(id); }}
      />
    </div>
  );
}
```

## 변형

### 제어 없이 쓰기

`expandedItems`·`selectedItems` 와 콜백을 모두 생략하면 트리가 펼침·선택 상태를 스스로 관리한다. 선택 값을 화면이 읽어야 하면 제어형으로 쓴다.

### 키보드

방향키로 이동·펼침·접힘, Space 로 펼침 토글, Enter 로 선택한다. 트리 자체는 스크롤하지 않으므로 바깥 요소에 `overflowY: "auto"` 를 준다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| items | `TreeNode[]` | `[]` | 노드 목록. `useMemo` 로 고정한다 |
| expandedItems | `(string \| number)[]` | 내부 상태 | 펼친 노드 id. 주면 제어형 |
| selectedItems | `(string \| number)[] \| string` | 내부 상태 | 선택 노드 id. 주면 제어형 |
| onExpandedItemsChange | `(event: null, newExpanded: (string \| number)[]) => void` | - | 펼침 변경. 두 번째 인자의 id 는 문자열이다 |
| onSelectedItemsChange | `(event: null, nodeId: string) => void` | - | 노드 클릭·Enter 선택. id 는 문자열이다 |
| className | `string` | `""` | 루트에 덧붙일 클래스(`cm-tree` 는 항상 붙는다) |

`TreeNode`: `id: string | number`, `label: string`, `children?: TreeNode[]`, 그 밖의 임의 필드(`[key: string]: unknown`)를 담을 수 있다.

## 표준값: 모든 화면 동일

- `tree.css` 를 함께 import 한다.
- id 비교는 문자열로 한다(`next.map(String)`).
- 색·크기를 주지 않는다(이 컴포넌트에는 `size`·색 prop 이 없다).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `expandedItems` 만 주고 `onExpandedItemsChange` 를 안 준다 | 제어형인데 갱신할 곳이 없어 펼침이 바뀌지 않는다. 둘을 함께 준다. 선택도 같다 |
| 렌더마다 새 `items` 배열을 만든다 | 매번 트리 데이터를 다시 변환한다. `useMemo` 로 고정한다 |
| 콜백 id 를 숫자로 비교한다 | 콜백으로 오는 id 는 문자열이다 |
| `tree.css` 를 빼먹는다 | 들여쓰기·선택 표시가 없는 목록처럼 보인다 |
| `TreeView` 를 import 한다 | 존재하지 않는다. `Tree` 를 쓴다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmd/dataItemMng/ItemTreePanel.tsx:80-92`: 제어형 `Tree` + 스크롤 래퍼(`overflowY: "auto"`).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:540-542`: `next.map(String)` 으로 펼침을 받는 표준 모양.
- `src/frontend/m-mcm/page-components/csa/commMenuMng/page.tsx:1094-1102`: 메뉴 트리. 단, 같은 줄 근처에서 인라인 색(`#888`)을 쓰는 점은 표준과 다름.
