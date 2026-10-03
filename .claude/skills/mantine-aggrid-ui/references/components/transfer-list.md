# TransferList

좌(가능)·우(소속) 두 목록 사이로 코드를 옮겨 소속 집합을 고칠 때 쓰는 제어형 전송 목록이다(`TransferList`). 검색·분류 필터·행 토글·Shift 범위 선택·전체선택·`>`/`>>`/`<`/`<<` 를 갖췄고, 같은 일을 하는 순수 함수(검색·분류·이동·diff 집합)도 함께 낸다.

- import: `import { TransferList, type TransferListProps, type TransferListItem, type TransferListBadge } from "@dk-oasis/shared/transfer-list";` (CSS import 없음 — 인라인 스타일, 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/transfer-list/TransferList.tsx`, `transfer-set.ts`
- 내부 구현: shared `form` 의 `Input`·`Select`·`Checkbox`·`Button`, 배지는 shared `GridBadge`(그리드 배지 모양). Mantine `Transfer` 류는 쓰지 않는다.
- Part B 허용 목록(§1): `transfer-list` SHOULD (Part B §18 로 등록, 처음 쓴 곳은 m-mdm 코드 편집 카테고리 탭 `dmc/codeItemEdit/cate`).

## 언제 쓰나

- 쓴다: 후보 목록에서 몇 개를 골라 어떤 묶음(카테고리·그룹·권한 대상)에 넣고 빼는 편집. 후보가 수백~천 건이어도 이동은 선택 수에만 비례한다.
- 쓰지 않는다:
  - 한 건만 고를 때 → [lookup](lookup.md) 의 `LookupModal` 또는 [ComboBox](combo-box.md).
  - 입력칸 안에서 여러 개를 고르는 짧은 목록 → [MultiSelectComboBox](multi-select-combo-box.md).
  - 행마다 여러 칸을 편집해야 할 때 → [AgDataGrid](ag-data-grid.md).
- 제어형이다. 소속 집합(`value`)은 부모가 쥐고 이동마다 `onChange(next)` 로 받는다. 부품은 `value` 를 복사해 두지 않고 검색어·분류·좌우 선택·Shift 기준점만 로컬로 둔다. 서버 저장 시점([저장]·[적용])은 화면이 정한다 — 버튼은 부품 밖에 둔다.
- 분류 필터는 `getGroup` 을 주고, 그 값이 하나라도 있을 때만 그린다. 배지(`getBadge`)·가능 쪽 숨김(`hideFromAvailable`)·문구(`labels`)는 화면 규칙이라 props 로 넘긴다.

## 표준 사용

```tsx
import { useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { TransferList, diffSets, type TransferListBadge } from "@dk-oasis/shared/transfer-list";

interface Candidate { code: string; name: string | null; lvl1: string | null; unsaved?: boolean }

// 함수는 모듈 수준에 둔다 — 렌더마다 새 함수면 목록 계산(useMemo)이 매번 다시 돈다.
const lvl1Of = (it: Candidate) => it.lvl1;
const badgeOf = (it: Candidate): TransferListBadge | null =>
  it.unsaved ? { label: "미저장", bg: "var(--color-warning-soft)", color: "var(--color-warning)" } : null;

export function MemberEditor({ items, saved, onApply }: {
  items: Candidate[]; saved: ReadonlySet<string>; onApply: (add: string[], remove: string[]) => void;
}) {
  const [members, setMembers] = useState<ReadonlySet<string>>(saved);
  const { added, removed } = diffSets(saved, members);
  return (
    <>
      <TransferList
        items={items}
        value={members}
        onChange={setMembers}
        testId="member-transfer"
        getGroup={lvl1Of}
        getBadge={badgeOf}
        labels={{ groupAll: "1차 전체" }}
      />
      <Button size="sm" disabled={added.length + removed.length === 0}
        onClick={() => onApply(added.sort(), removed.sort())}>적용</Button>
    </>
  );
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `items` | `readonly T[]` (`T extends TransferListItem` = `{ code: string; name?: string \| null }`) | — | 후보 전체(양쪽). 이 순서로 그린다 |
| `value` | `ReadonlySet<string>` | — | 지금 소속 코드 집합(제어형) |
| `onChange` | `(next: Set<string>) => void` | — | 이동할 때마다 새 집합으로 부른다 |
| `editable` | `boolean` | `true` | false 면 이동·행 선택·전체선택이 꺼진다(검색·분류는 된다) |
| `testId` | `string` | `"transfer-list"` | testId 접두어(아래 표) |
| `getGroup` | `(item: T) => string \| null \| undefined` | — | 분류 값. 주면 분류 필터(`Select`)를 그린다. 값이 하나도 없으면 그리지 않는다 |
| `groupTestIdSuffix` | `string` | `"group"` | 분류 필터 testId 접미 |
| `hideFromAvailable` | `(item: T) => boolean` | — | true 인 항목은 가능 쪽에 보이지 않는다(소속 쪽에는 남는다) |
| `getBadge` | `(item: T) => TransferListBadge \| null \| undefined` | — | 항목 옆 배지 `{ label, bg?, color?, title? }`. 색은 의미 토큰 |
| `labels` | `{ search?, available?, member?, countUnit?, groupAll? }` | `코드·이름 검색`·`가능`·`소속`·`건`·`분류 전체` | 검색 placeholder, 열 이름, 건수 단위(`{열 이름} {n}{단위}`), 분류 '전체' 글 |

testId 조립(`{p}` = `testId`):

| 자리 | testId |
|---|---|
| 뿌리 | `{p}` |
| 검색 칸 | `{p}-search` |
| 분류 필터 | `{p}-{groupTestIdSuffix}` |
| 열(가능·소속) | `{p}-available`, `{p}-member` |
| 항목 행 | `{p}-item-available-{code}`, `{p}-item-member-{code}` |
| 배지 | `{p}-mark-{code}` |
| 이동 | `{p}-move-right`, `{p}-move-right-all`, `{p}-move-left`, `{p}-move-left-all` |

버튼 활성: `>`·`<` 는 그쪽 선택이 있어야, `>>`·`<<` 는 그쪽 보이는(검색·분류 통과) 목록이 있어야 켜진다. `>`·`<` 는 옮긴 뒤 그쪽 선택을 비운다(`>>`·`<<` 는 비우지 않는다).

## 순수 함수

모두 입력 `Set` 을 바꾸지 않고 새 `Set` 을 돌려준다. 항목은 `code`·`name` 만 본다.

| 함수 | 하는 일 |
|---|---|
| `matchesQuery(item, query)` | 코드·이름 부분 일치(앞뒤 공백·대소문자 무시, 빈 검색어는 통과) |
| `matchesGroup(value, group)` | 고른 분류가 비면 통과, 아니면 값이 같아야 통과 |
| `visibleList(items, value, side, { query, group, getGroup, hideFromAvailable })` | 한쪽(`"available"`·`"member"`) 목록. `getGroup` 이 없으면 분류로 거르지 않는다 |
| `groupOptions(items, getGroup)` | 비어 있지 않은 분류 값을 중복 없이 기본 `.sort()` |
| `rangeSelect(visible, anchorCode, targetCode)` | Shift 범위(양방향). 기준점이 없거나 목록에 없으면 target 하나 |
| `toggleSelect(selected, code)`, `selectAllVisible(visible)` | 선택 토글, 보이는 목록 전체 선택 |
| `moveSelected`, `removeSelected`, `moveAllVisible`, `removeAllVisible` | `>`, `<`, `>>`, `<<` |
| `diffSets(original, current)` | `{ added, removed }` — 정렬하지 않는다. 저장 모양·정렬 규칙은 화면이 정한다 |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면 폴더에 좌우 목록·이동 버튼을 또 만듦 | `TransferList` |
| 부품 안에 소속 집합을 복사해 두고 [적용] 때만 부모에 알림 | 제어형으로 쓴다 — `value`·`onChange` 는 부모 상태, [적용]·[저장] 버튼은 부품 밖 |
| `getGroup`·`getBadge` 를 렌더마다 새 화살표 함수로 넘김 | 모듈 수준 함수나 `useCallback` 으로 고정한다 |
| 기존 화면의 testId 가 바뀜 | `testId` 접두어와 `groupTestIdSuffix` 로 옛 이름을 그대로 만든다 |
| `diffSets` 결과를 정렬된 것으로 믿음 | 순회 순서 그대로다. 필요한 정렬(`.sort()`·`localeCompare`)을 화면이 건다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmc/codeItemEdit/cate/components/TransferListPanel.tsx`: 코드 편집 카테고리 탭. 소속 집합은 `CategoryTab` 이 쥐고 `TransferList` 는 제어형으로 쓴다.
- `src/frontend/m-mdm/pages/dmd/dataItemMng/cate/CategoryTab.tsx`: 데이터 항목 카테고리 소속 편집. [적용] 단추는 `TransferList` 밖(패널 아래)에 두고, 눌렀을 때 `diffSets` 로 추가·제거 목록을 만들어 서비스를 부른다.
