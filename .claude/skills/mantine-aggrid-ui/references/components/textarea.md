# Textarea

비고·내용처럼 여러 줄 텍스트를 입력받을 때 쓴다.

- import: `import { Textarea, type TextareaProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Textarea.tsx`
- 내부 구현: Mantine `Textarea`(`autosize={false}`)

## 언제 쓰나

- 쓴다: 상세 폼의 비고·내용·사유.
- 쓰지 않는다: 한 줄 입력 → [Input](input.md).

## 표준 사용

```tsx
import { Textarea } from "@dk-oasis/shared/form";

<Textarea
  value={form?.remark ?? ""}
  rows={4}
  maxLength={500}
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("remark", v)}
/>
```

`onChange` 는 이벤트가 아니라 입력된 문자열을 받는다. 높이는 `rows` 로만 정하며 입력에 따라 자동으로 늘어나지 않는다.

## 변형

### 큰 입력(내용)

본문처럼 긴 글은 `rows` 를 키운다. 상세 폼 안에서 한 항목이 패널 높이를 지나치게 먹지 않게 8줄 안팎으로 한다.

```tsx
<Textarea value={form?.content ?? ""} rows={8} maxLength={4000} onChange={(v) => handleFormChange("content", v)} />
```

### 읽기전용

`readOnly` 와 `disabled` 를 함께 준다. 스크롤해서 내용을 읽어야 하면 `disabled` 대신 `readOnly` 만 쓰는 편이 낫다.

## Props

`TextareaProps` 는 `textarea` 요소의 HTML 속성(`onChange` 제외)을 받는다.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string \| number` | `""` | 현재 값. 내부에서 문자열로 바꾼다. |
| onChange | `(value: string) => void` | 없음 | 값 변경 콜백. |
| rows | `number` | `3` | 표시 줄 수. |
| disabled | `boolean` | `false` | 비활성. |
| readOnly | `boolean` | `false` | 읽기전용. |
| placeholder | `string` | `""` | 안내 문구. |
| error | `string` | 없음 | 오류 문구. |
| id | `string` | 자동 생성 | textarea id. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 배치에만 쓴다. |
| aria-invalid, aria-describedby | `string`/boolean | `error` 에서 계산 | 부모가 지정하면 그 값을 쓴다. |

그 밖의 HTML 속성(`maxLength`, `name`, `data-testid` 등)은 textarea 로 전달된다.

## 표준값: 모든 화면 동일

- 기본 줄 수는 3, 비고는 3~4, 내용 본문은 8 이하로 쓴다.
- `maxLength` 는 DB 컬럼 길이에 맞춘다.
- `size`·`radius`·색 prop 을 주지 않는다.
- 선택 행이 없으면 `disabled`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `autosize` 나 `minRows`/`maxRows` 를 준다 | 이 컴포넌트는 고정 높이다. `rows` 만 쓴다. |
| `onChange={(e) => e.target.value}` | 첫 인자가 이미 문자열이다. |
| `style={{ height: 200 }}` 로 높이를 준다 | `rows` 로 정한다. |
| `value` 를 `undefined` 로 넘긴다 | `?? ""` 로 문자열을 준다. |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:356` `rows={8}`·`maxLength={4000}`·`disabled={!form || isBusy}`.
- `src/frontend/m-mcm/page-components/csa/commPermMng/page.tsx:744` 상세 영역의 Textarea.
