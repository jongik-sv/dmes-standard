# DatePicker

날짜(년-월-일) 하나를 달력으로 고르거나 `yyyy-MM-dd` 로 직접 입력받을 때 쓴다.

- import: `import { DatePicker, type DatePickerProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/DatePicker.tsx`
- 내부 구현: Mantine `DateInput`(`@mantine/dates`)

## 언제 쓰나

- 쓴다: 상세 폼의 일자 입력, 조회조건의 일자·기간(SearchField 안).
- 쓰지 않는다: 시·분·초까지 필요할 때 → [DateTimePicker](date-time-picker.md).
- 쓰지 않는다: 년월(`yyyy-MM`)만 필요한 입력 → 아직 표준 컴포넌트가 없다. 임의로 [Input](input.md)을 쓰지 말고 shared 확장 후보로 보고한다.

## 표준 사용

```tsx
import { DatePicker } from "@dk-oasis/shared/form";

<DatePicker
  value={form?.inspDt ?? ""}
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("inspDt", v)}
/>
```

값은 `yyyy-MM-dd` 문자열이고 비어 있으면 `""` 이다. `Date` 객체로 바꾸지 않는다. 지우기 버튼(`clearable`)을 누르면 `onChange("")` 가 호출된다.

## 변형

### 조회조건 기간

두 개의 SearchField 로 쓰고 두 번째 label 을 `"~"` 로 둔다. 기본값은 시작이 오늘 7일 전, 종료가 오늘이다. 자세한 규칙은 [search-area](search-area.md)에 있다.

```tsx
<SearchField label="검사일자"><DatePicker value={f.fromDt} onChange={(v) => set("fromDt", v)} /></SearchField>
<SearchField label="~"><DatePicker value={f.toDt} onChange={(v) => set("toDt", v)} /></SearchField>
```

### 선택 가능 범위(min·max)

종료일은 시작일 이후만 고르게 할 때 `min`, 시작일은 종료일 이전만 고르게 할 때 `max` 를 쓴다. 둘 다 `yyyy-MM-dd` 문자열이다.

```tsx
<DatePicker value={f.toDt} min={f.fromDt || undefined} onChange={(v) => set("toDt", v)} />
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string` | `""` | `yyyy-MM-dd`. 형식이 맞지 않으면 빈 값으로 취급한다. |
| onChange | `(value: string) => void` | 없음 | 변경 콜백. 지우면 `""`. |
| min | `string` | 없음 | 선택 가능한 가장 이른 날(`yyyy-MM-dd`). |
| max | `string` | 없음 | 선택 가능한 가장 늦은 날(`yyyy-MM-dd`). |
| disabled | `boolean` | `false` | 비활성. |
| readOnly | `boolean` | `false` | 읽기전용. |
| placeholder | `string` | `"YYYY-MM-DD"` | 안내 문구. |
| error | `string` | 없음 | 오류 문구. |
| id | `string` | 자동 생성 | 입력 id. |
| name | `string` | 없음 | 입력 name. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다. |
| aria-label, aria-labelledby, aria-invalid, aria-describedby | `string`/boolean | 없음 | 접근성 속성. |

`DatePickerProps` 는 `input` 의 나머지 HTML 속성도 타입으로는 받지만, 위에 적은 것만 실제로 전달된다.

## 표준값: 모든 화면 동일

- 값 형식은 항상 `yyyy-MM-dd` 문자열이다. `/`·`.`·`yyyyMMdd` 를 쓰지 않는다.
- 조회 기간 기본값은 시작 = 오늘 7일 전, 종료 = 오늘이다.
- `size`·`radius`·색 prop 을 주지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `20260930` 이나 `2026/09/30` 을 값으로 넣는다 | 형식이 맞지 않으면 빈 칸으로 보인다. `yyyy-MM-dd` 로 바꿔 준다. |
| `data-testid` 를 준다 | 이 컴포넌트는 정해진 prop 만 입력칸으로 전달해서 `data-testid` 가 버려진다. 테스트는 label·`aria-label` 로 찾는다. |
| `onChange` 에서 `Date` 를 기대한다 | 문자열이다. 날짜 계산이 필요하면 화면에서 변환한다. |
| 기간을 `div`·`span "~"` 로 묶는다 | SearchField `label="~"` 쌍을 쓴다. |
| 시각이 있는 값(`2026-09-30 10:00:00`)을 넣는다 | 날짜 형식이 아니라 빈 칸이 된다. DateTimePicker 를 쓴다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:336` 상세 폼의 DatePicker(`disabled={!form || isBusy}`).
- `src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:270` 조회조건 기간. 단, 한 SearchField 안에 `div`·`span "~"` 로 묶여 있어 표준과 다르다.
- `min`·`max` 는 아직 사용처 없음.
