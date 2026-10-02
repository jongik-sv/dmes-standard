# Tabs

한 영역 안에서 내용을 밑줄형 탭으로 나눠 보여 줄 때 쓴다. 탭 머리줄만 그리므로 본문 전환은 화면이 직접 한다.

- import: `import { Tabs, type TabItem, type TabsProps } from "@dk-oasis/shared/tabs";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/tabs/Tabs.tsx`
- 내부 구현: Mantine `Tabs` 의 `Tabs.List` 만 사용(밑줄 색은 `--color-primary`). `Tabs.Panel` 은 쓰지 않는다
- Part B 허용 목록(§1): `tabs` SHOULD (2026-10-02 사용자 승인으로 추가).

## 언제 쓰나

- 쓴다: 상세 영역을 "기본정보 / 변경이력" 처럼 나눌 때, 하단 패널의 탭 전환.
- 쓰지 않는다: 포털 최상위 화면 탭(포털 프레임이 맡는다), 단계 표시(스텝).

## 표준 사용

```tsx
import { useState } from "react";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

type TabKey = "basic" | "history";

const TAB_ITEMS: TabItem[] = [
  { key: "basic", label: "기본정보" },
  { key: "history", label: "변경이력" },
];

export function UnitDetail() {
  const [tab, setTab] = useState<TabKey>("basic");
  return (
    <>
      <Tabs items={TAB_ITEMS} activeKey={tab} onChange={(k) => setTab(k as TabKey)} />
      {tab === "basic" ? <div>{/* 기본정보 폼 */}</div> : <div>{/* 변경이력 목록 */}</div>}
    </>
  );
}
```

탭 목록 `items` 는 컴포넌트 밖 모듈 상수로 둔다. 활성 키는 화면이 `useState` 로 소유하고, 본문은 그 값으로 직접 고른다.

## 변형

### 비활성 탭과 간격

`disabled: true` 인 탭은 눌리지 않고 회색으로 보인다. 좌우 여백이 필요하면 `style={{ padding: "0 var(--spacing-md)" }}` 처럼 간격 토큰만 쓴다.

```tsx
const ITEMS: TabItem[] = [
  { key: "basic", label: "기본정보" },
  { key: "history", label: "변경이력", disabled: true },
];
// <Tabs items={ITEMS} activeKey={tab} onChange={…} style={{ padding: "0 var(--spacing-md)" }} />
```

### 라벨에 노드

`label` 은 `ReactNode` 라서 건수 같은 요소를 넣을 수 있다. 문자열이면 충분하면 문자열로 쓴다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| items | `TabItem[]` | 필수 | 탭 목록 |
| activeKey | `string` | 필수 | 현재 활성 탭 key |
| onChange | `(key: string) => void` | 필수 | 탭 클릭 시 눌린 탭의 key 로 호출. 빈 값은 걸러진다 |
| className | `string` | `""` | 루트에 덧붙일 클래스(`cm-tabs` 는 항상 붙는다) |
| style | `CSSProperties` | - | 루트 스타일(간격 용도) |

`TabItem`: `key: string`(필수), `label: ReactNode`(필수), `disabled?: boolean`.

## 표준값: 모든 화면 동일

- 탭 key 는 영문 소문자 식별자, 라벨은 화면에 보일 한글 문구.
- 탭 머리 아래 본문은 활성 키로 조건부 렌더링한다. `size`·색 prop 을 주지 않는다(이 컴포넌트에는 없다).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `onChange` 에서 key 문자열을 바로 상태 타입으로 쓴다 | `setTab(k as TabKey)` 로 좁힌다 |
| `activeKey` 가 `items` 에 없는 값이다 | 어떤 탭도 활성이 되지 않는다. 초기값을 `items` 의 key 로 둔다 |
| 탭 본문까지 이 컴포넌트가 그려 줄 거라 기대한다 | 머리줄만 그린다. 본문은 화면이 고른다 |
| 렌더 안에서 `items` 를 새로 만든다 | 모듈 상수로 둔다(라벨에 노드를 쓰는 경우만 예외) |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmb/layoutMng/page.tsx:367`: `TAB_ITEMS` 상수 + `activeKey` + `style` 간격 토큰(표준과 같다).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:473`: 탭 `items` 를 JSX 안에서 인라인으로 만든다. 단, 모듈 상수 권장과 다름.
- `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/BottomPanel.tsx:39-47`: `label` 에 `span` 노드를 쓰고 `style` 로 폭을 준다.
- `src/frontend/m-mcm/page-components/csa/screenUsageStat/page.tsx`: `TAB_ITEMS` 모듈 상수 + 탭을 바꾸면 그 탭만 조회(MES 모듈 첫 사용처, 표준과 같다).
