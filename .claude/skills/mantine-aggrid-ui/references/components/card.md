# Card

내용 높이를 따르는 테두리 카드(`CardFrame`: 제목 줄 + 본문), 여러 카드를 제목 줄 하나로 함께 접는 묶음(`CardGroup`), 카드 안 흐린 보조 글(`MutedText`)을 그릴 때 쓴다. 편집 화면처럼 카드 여러 장을 세로로 쌓는 화면에 맞다.

- import: `import { CardFrame, CardGroup, MutedText, type CardFrameProps, type CardGroupProps, type MutedTextProps } from "@dk-oasis/shared/card";` (CSS import 없음 — 인라인 스타일, 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/card/CardFrame.tsx`, `CardGroup.tsx`
- 내부 구현: 원시 `<section>`·`<header>`·`<button>`(Mantine 미사용). 접기 아이콘은 `@tabler/icons-react` `IconChevronDown`·`IconChevronRight`.
- Part B 허용 목록(§1): `card` SHOULD (Part B §18 로 등록, 처음 쓴 곳은 m-mdm 룰 화면 `ruleEdit`·`ruleSetEdit`).

## 언제 쓰나

- 쓴다: 한 화면에 성격이 다른 카드(헤더 정보·의사결정표·값 테스트·활용처 등)를 위아래로 쌓을 때. 몇 장을 한 덩어리로 접어 두고 싶으면 `CardGroup` 으로 감싼다.
- 쓰지 않는다:
  - 그리드에 제목·건수·행추가/삭제 툴바를 붙이고 남은 높이를 채울 때 → [GridPanel](grid-panel.md).
  - 대시보드 12열 격자 칸·행 접기·크기 조절·배치 저장이 필요할 때 → [dashboard](dashboard.md) 의 `DashboardCard`·`DashboardRow`.
  - 화면을 좌우·상하로 나누고 높이를 채우는 영역 → [content-body](content-body.md) 의 `ContentPanel`.
- `CardGroup` 은 접어도 본문을 내리지 않는다(`hidden`). 안쪽 카드의 입력·dirty 상태·실행 결과가 접었다 펴도 그대로 남는다. 내려야(언마운트) 하는 경우라면 화면이 조건부로 그린다.
- `columns` 를 주면 본문이 `repeat(n, minmax(0, 1fr))` 격자가 되고, 자식은 `style={{ gridColumn: "span k", minWidth: 0 }}` 로 칸을 잡는다. 주지 않으면 흐름 배치다.

## 표준 사용

```tsx
import { Button } from "@dk-oasis/shared/form";
import { CardFrame, CardGroup, MutedText } from "@dk-oasis/shared/card";

export function UsageCard({ note }: { note?: string }) {
  return (
    <CardFrame title="⑧ 활용처" testId="rule-card-usage" right={<Button size="sm">새로 고침</Button>}>
      <strong>활용처 메모</strong> {note ? note : <MutedText>없음</MutedText>}
    </CardFrame>
  );
}

// 카드 세 장을 16칸 격자로 쌓고 제목 줄 하나로 함께 접는다(testId: rule-group-valueTests, -toggle, -body).
export function ValueTestGroup() {
  return (
    <CardGroup id="valueTests" title="④ 값 테스트 · ⑤ 테스트 결과" testIdPrefix="rule-group" columns={16}>
      <div style={{ gridColumn: "span 16", minWidth: 0 }}>
        <CardFrame title="④ 값 테스트">…</CardFrame>
      </div>
      <div style={{ gridColumn: "span 16", minWidth: 0 }}>
        <CardFrame title="⑤ 테스트 결과">…</CardFrame>
      </div>
    </CardGroup>
  );
}
```

## Props

`CardFrame`

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `title` | `ReactNode` | — | 제목 줄 왼쪽 글 |
| `testId` | `string` | — | 뿌리 `<section>` 의 `data-testid`. 없으면 붙이지 않는다 |
| `right` | `ReactNode` | — | 제목 줄 오른쪽 자리(배지·버튼) |
| `children` | `ReactNode` | — | 본문 |

`CardGroup`

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `id` | `string` | — | 묶음 id. testId 끝에 붙는다 |
| `title` | `string` | — | 제목 줄 글. 단추 `aria-label` 은 `{title} 접기`/`{title} 펼치기` |
| `testIdPrefix` | `string` | `"card-group"` | 뿌리 `{접두어}-{id}`, 단추 `{접두어}-{id}-toggle`, 본문 `{접두어}-{id}-body` |
| `columns` | `number \| null` | `null` | 본문 격자 칸 수. `null` 이면 격자 없음 |
| `defaultOpen` | `boolean` | `true` | 처음 펼침 여부 |
| `labels` | `{ collapse?: string; expand?: string }` | `접기`·`펼치기` | 단추 `aria-label` 의 동작 말 |
| `children` | `ReactNode` | — | 묶음 안 카드 |

`MutedText` — `children` 만 받는 `--color-text-muted` 색 `<span>`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면 폴더에 테두리 `<section>` 카드 틀을 또 만듦 | `CardFrame` |
| 접기를 `{open && children}` 으로 구현해 카드 상태가 사라짐 | `CardGroup` — `hidden` 으로 숨긴다 |
| 본문 격자 div 에 `hidden` 과 `display: grid` 를 함께 줌(인라인 display 가 hidden 을 이김) | `CardGroup columns` — 숨김 div 와 격자 div 를 나눠 둔다 |
| 흐린 글 색을 `#888`·`gray` 로 직접 씀 | `MutedText` 또는 `var(--color-text-muted)` |
