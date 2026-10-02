# JsonView

JSON 값(서버 설정·캐시 값·응답 본문처럼 모양이 정해지지 않은 값)을 읽기 전용 트리로 살펴볼 때 쓴다. 객체·배열은 접고 펼 수 있고, 글자·수·참거짓·null 은 종류별 색으로 보인다. 글자 값은 JSON 표기(따옴표·역슬래시·줄바꿈 이스케이프)로 보인다.

- import: `import { JsonView, jsonText, type JsonViewProps, type JsonKind } from "@dk-oasis/shared/json-view";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/json-view/JsonView.tsx`
- 내부 구현: 자체 재귀 트리(Mantine `Tree` 를 쓰지 않는다). 도구 막대는 form `Button`(모두 펼치기·모두 접기)과 [CopyTextButton](button.md)(복사)을 쓴다. 아이콘은 `@tabler/icons-react` `IconChevronRight`.
- Part B 허용 목록(§1): `json-view` SHOULD.

## 언제 쓰나

- 쓴다: 관리 화면에서 캐시 항목·설정·API 응답처럼 키와 모양이 그때그때 다른 값을 있는 그대로 보여 줄 때(예: m-mcm `mdmCacheMng` 항목 상세).
- 쓰지 않는다: 업무 데이터 목록 → [AgDataGrid](ag-data-grid.md). 정해진 항목을 라벨-값으로 보일 때 → [detail-form](detail-form.md). 계층 메뉴·분류처럼 고를 수 있는 노드 트리 → [Tree](tree.md)(`Tree` 는 글자 라벨 노드를 선택·펼침하는 부품이라 값 종류별 색·요약·복사가 없다).
- 편집은 하지 않는다. 값을 고쳐야 하면 화면이 정한 입력 칸을 쓴다.
- 글자 값은 `JSON.stringify` 표기다(`"say \"hi\""`, `"줄1\n줄2"`). 안쪽 따옴표·줄바꿈이 값의 경계와 헷갈리지 않는다.
- 가지 단추의 `aria-label` 은 키 경로를 담는다 — `"bizExpr 펼치기"`, `"domain.ref 접기"`, 배열 `"items[0] 펼치기"`, 뿌리 `"전체 접기"`. 화면 시험은 이 이름으로 단추를 찾는다.
- 값은 브라우저가 받은 JSON 그대로다. 서버가 `1.000` 으로 보내도 `JSON.parse` 가 `1` 로 읽으므로 소수 끝자리 0 은 트리·복사 글자에서 사라진다. 자리수가 중요하면 서버가 글자로 보내야 한다.

## 표준 사용

```tsx
import { ContentPanel } from "@dk-oasis/shared/layout";
import { JsonView } from "@dk-oasis/shared/json-view";

// 오른쪽 상세 패널: 요약 표 아래 남은 높이를 채우고 트리 안에서 스크롤한다.
export function ValuePanel({ value }: { value: unknown }) {
  return (
    <ContentPanel width={460}>
      <JsonView value={value} fill defaultExpandDepth={2} testId="entry-value" />
    </ContentPanel>
  );
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `unknown` | — | 보일 값. `undefined` 면 `emptyText` 를, `null` 이면 `null` 을 보인다 |
| `defaultExpandDepth` | `number` | `2` | 처음 펼칠 깊이. 0 이면 뿌리도 접는다 |
| `toolbar` | `boolean` | `true` | 도구 막대(모두 펼치기·모두 접기·복사) |
| `fill` | `boolean` | `false` | 부모 flex 열(`ContentPanel` 등)의 남은 높이를 채우고 트리 안에서 스크롤한다 |
| `emptyText` | `string` | `"값 없음"` | 값이 `undefined` 일 때 보일 글 |
| `className` | `string` | — | 뿌리에 더할 클래스(`jv` 는 늘 붙는다) |
| `testId` | `string` | `"json-view"` | 뿌리 `data-testid`. 트리 영역은 `<testId>-tree` |

`jsonText(value): string` — 복사 버튼과 같은 2칸 들여쓴 JSON 글자(나타낼 수 없는 값은 `String()`).
`JsonKind` — `"object" | "array" | "string" | "number" | "boolean" | "null"`(각 노드의 `data-kind`).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `<pre>{JSON.stringify(v, null, 2)}</pre>` 를 화면에 직접 둠 | `JsonView` — 접기·색·복사가 같은 모습으로 나온다 |
| `ContentPanel` 안에서 트리가 잘림 | `fill` 을 준다. `ContentPanel` 은 넘침을 숨기므로 스크롤은 `JsonView` 가 맡는다 |
| 값 종류별 색을 화면 CSS 로 덮음 | 색은 의미 토큰으로 정해져 있다. 바꿔야 하면 shared 를 고친다(승인 뒤) |
