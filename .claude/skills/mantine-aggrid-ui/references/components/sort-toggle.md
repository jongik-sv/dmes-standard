# SortToggle

목록의 정렬 기준(ID·이름 등)과 방향(오름·내림)을 바꾸는 작은 단추 묶음이다(`SortToggle`). 기준 단추는 누르면 다음 기준으로, 방향 단추는 누르면 오름·내림을 뒤집는다.

- import: `import { SortToggle, type SortToggleOption, type SortToggleProps, type SortState, type SortDir, nextSortKey, flipSortDir } from "@dk-oasis/shared/sort-toggle";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣고, 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/sort-toggle/SortToggle.tsx`, `sort-state.ts`
- Part B 허용 목록(§1): `sort-toggle` SHOULD (Part B §18 로 등록).

## 언제 쓰나

- 쓴다: 그리드가 아닌 목록(칸 목록, 카드 목록, 고르기 목록)의 머리에서 정렬 기준과 방향을 바꿀 때. 예: 권한 작업대의 사람·역할 그룹·역할 칸.
- 쓰지 않는다:
  - `AgDataGrid` 목록 → 열 머리 정렬(그리드 기본 기능)을 쓴다.
  - 정렬 기준이 많아 이름을 보고 골라야 함 → `Select`.
- 제어형이다. `value`(`{ key, dir }`)를 부모가 쥐고 `onChange(next)` 로 받는다.
- 부품은 목록을 줄 세우지 않는다. 값 비교 규칙(ID 는 글자 코드 순, 이름은 한국어 순 등)은 화면이 정한다.
- 기준이 하나뿐이면 기준 단추를 그리지 않고 방향 단추만 그린다.
- 단추의 `aria-label`·`title` 은 「{aria-label} 기준: ID — 누르면 이름」·「{aria-label} 방향: 오름차순 — 누르면 내림차순」 꼴이다.

## 표준 사용

```tsx
import { useMemo, useState } from "react";
import { SortToggle, type SortState, type SortToggleOption } from "@dk-oasis/shared/sort-toggle";

type Key = "id" | "name";
const OPTIONS: SortToggleOption<Key>[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "이름" },
];

export function PeopleList({ rows }: { rows: { id: string; name: string }[] }) {
  const [sort, setSort] = useState<SortState<Key>>({ key: "id", dir: "asc" });
  const list = useMemo(() => {
    const out = [...rows].sort((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name, "ko") : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, sort]);
  return (
    <div>
      <SortToggle aria-label="사람 정렬" options={OPTIONS} value={sort} onChange={setSort} />
      {list.map((r) => <div key={r.id}>{r.name}</div>)}
    </div>
  );
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `options` | `SortToggleOption<K>[]` = `{ value; label }` | — | 정렬 기준(이 순서로 돌아간다). `label` 은 기준 단추 글 |
| `value` | `SortState<K>` = `{ key: K; dir: "asc" \| "desc" }` | — | 지금 정렬 상태(제어형) |
| `onChange` | `(next: SortState<K>) => void` | — | 기준 단추는 `{ key: 다음, dir }`, 방향 단추는 `{ key, dir: 뒤집음 }` |
| `aria-label` | `string` | `"정렬"` | 묶음 라벨(`role="group"`). 단추 설명 앞에도 붙는다 |
| `disabled` | `boolean` | `false` | 두 단추를 모두 잠근다 |
| `className` / `testId` | | `testId="sort-toggle"` | 뿌리 `{p}`, 기준 단추 `{p}-key`(`data-key`), 방향 단추 `{p}-dir`(`data-dir`) |

## 순수 함수

| 함수 | 하는 일 |
|---|---|
| `nextSortKey(keys, cur)` | 다음 기준. 끝이면 처음, 목록 밖이면 첫 값 |
| `flipSortDir(dir)` | `"asc"` ↔ `"desc"` |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 정렬 상태를 화면 루트에 둠(단추를 누를 때마다 다른 칸·그리드까지 다시 그림) | 목록을 그리는 칸 컴포넌트 안 `useState` 로 둔다 |
| 렌더마다 `options` 를 새로 만듦 | 모듈 수준 상수로 둔다 |
| 고른 항목을 정렬과 상관없이 맨 위로 올림 | 정렬 결과 자리에 둔다. 찾기로 거를 때 고른 항목을 남기더라도 자리는 정렬 순서를 따른다 |
