# DateRangePicker

기간(시작일 ~ 종료일) 두 칸을 한 부품으로 입력받을 때 쓴다.

- import: `import { DateRangePicker, type DateRangePickerProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/DateRangePicker.tsx`
- 내부 구현: shared [DatePicker](date-picker.md) 두 개와 `~`

## 언제 쓰나

- 쓴다: 상세 폼·팝업·실행 조건처럼 SearchArea 밖에서 기간 하나를 입력받을 때.
- 쓰지 않는다: 조회조건 기간 → [search-area](search-area.md) 의 SearchField 두 개(`~` 라벨) 규칙을 따른다.
- 쓰지 않는다: 날짜 하나 → [DatePicker](date-picker.md). 시각까지 → [DateTimePicker](date-time-picker.md).

## 표준 사용

```tsx
import { DateRangePicker } from "@dk-oasis/shared/form";

<DateRangePicker
  from={f.fromDt}
  to={f.toDt}
  onChange={(from, to) => setF((p) => ({ ...p, fromDt: from, toDt: to }))}
  toAriaLabel="종료일"
/>
```

값은 `yyyy-MM-dd` 문자열이고 비어 있으면 `""` 이다. 한쪽 칸을 바꾸면 `onChange` 가 바뀐 값과 다른 쪽 현재 값을 함께 넘긴다. 시작이 종료보다 늦으면 시작 칸에 오류 문구가 보이고 종료 칸이 `aria-invalid` 가 된다(값은 막지 않는다. 저장 전 검사는 호출자 몫이다).

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| from | `string` | 필수 | 시작일 `yyyy-MM-dd` |
| to | `string` | 필수 | 종료일 `yyyy-MM-dd` |
| onChange | `(from: string, to: string) => void` | 필수 | 어느 칸이든 바뀌면 두 값을 넘긴다 |
| id | `string` | 자동 생성 | 바깥 묶음 id. 칸은 `<id>-from`·`<id>-to` |
| fromAriaLabel | `string` | `"시작일"` | 시작 칸 aria-label |
| toAriaLabel | `string` | `"종료일"` | 종료 칸 aria-label |
| required | `boolean` | `false` | 묶음에 `aria-required` |
| disabled | `boolean` | `false` | 비활성 |
| readOnly | `boolean` | `false` | 읽기전용 |
| testId | `string` | - | 묶음의 `data-testid` |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `DatePicker` 두 개와 `~` 를 화면마다 직접 만든다 | 이 부품을 쓴다 |
| 시작>종료를 부품이 막는다고 가정한다 | 오류 표시만 한다. 저장·조회 전에 호출자가 검사한다 |
