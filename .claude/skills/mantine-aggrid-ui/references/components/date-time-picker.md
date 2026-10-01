# DateTimePicker

날짜와 시각(24시간제, 초까지)을 `yyyy-MM-dd HH:mm:ss` 로 입력받을 때 쓴다.

- import: `import { DateTimePicker, parseDateTime, type DateTimePickerProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/DateTimePicker.tsx`
- 내부 구현: Mantine `Popover` + `InlineDateTimePicker`(`@mantine/dates`) 와 `Input`

## 언제 쓰나

- 쓴다: 적용 시작 일시, 발생 일시처럼 시각까지 필요한 값.
- 쓰지 않는다: 날짜만 필요할 때 → [DatePicker](date-picker.md).
- 쓰지 않는다: 브라우저 기본 `datetime-local` 입력(OS 지역 설정을 따라 표시가 달라진다).

## 표준 사용

```tsx
import { DateTimePicker } from "@dk-oasis/shared/form";

<DateTimePicker
  value={form?.applyFrom ?? ""}
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("applyFrom", v)}
/>
```

값은 `yyyy-MM-dd HH:mm:ss` 문자열(KST 벽시계 시각 그대로)이고 비어 있으면 `""` 이다. 입력칸이 진짜 `<input>` 이라 직접 치거나 붙여 넣어도 형식이 맞으면 바로 값이 된다.

## 변형

### 값 해석(parseDateTime)

저장 전에 사용자 입력이나 서버 값이 규격에 맞는지 확인할 때 쓴다. 규격에 맞으면 정규화한 문자열을, 아니면 `null` 을 돌려준다. 구분자는 공백 또는 `T` 를 받는다. 존재하지 않는 날짜(`2026-02-30`)와 범위를 벗어난 시각(`25:00:00`)은 `null` 이다. 초가 없는 값(`2026-09-30 10:00`)도 `null` 이다.

```tsx
import { parseDateTime } from "@dk-oasis/shared/form";

const normalized: string | null = parseDateTime(applyInput);
if (normalized === null) {
  showMessage({ message: "적용 시작 일시 형식을 확인하세요.", alertType: "warning" });
  return;
}
```

### 선택 가능 날짜 범위

`min`·`max` 는 날짜 경계(`yyyy-MM-dd`)로 넘어가며 시각 경계는 아니다.

```tsx
<DateTimePicker value={v} min="2026-10-01" onChange={setV} />
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string` | `""` | `yyyy-MM-dd HH:mm:ss`. 해석되지 않으면 빈 칸으로 보인다. |
| onChange | `(value: string) => void` | 없음 | 변경 콜백. 해제하면 `""`. |
| min | `string` | 없음 | 고를 수 있는 날짜의 하한(`yyyy-MM-dd`). |
| max | `string` | 없음 | 고를 수 있는 날짜의 상한(`yyyy-MM-dd`). |
| disabled | `boolean` | `false` | 비활성. |
| readOnly | `boolean` | `false` | 읽기전용(패널이 열리지 않는다). |
| placeholder | `string` | `"YYYY-MM-DD HH:mm:ss"` | 안내 문구. |
| title | `string` | `"YYYY-MM-DD HH:mm:ss"` | 툴팁. |
| error | `string` | 없음 | 오류 문구. |
| id | `string` | 자동 생성 | 입력 id. |
| name | `string` | 없음 | 숨은 input name. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다. |
| aria-label, aria-labelledby, aria-invalid, aria-describedby | `string`/boolean | 없음 | 접근성 속성. |
| `data-*` | `string \| number \| boolean` | 없음 | 입력칸에 그대로 실린다(`data-testid` 가능). |

## 동작

- 입력 칸을 누르면 달력과 시·분·초 패널이 열린다. 24시간제이며 시·분·초를 따로 고친다.
- Enter 는 확정하고 닫는다. Escape 는 해석되지 않는 글자를 원래 값으로 되돌리고 닫는다. 아래 방향키는 패널을 연다.
- 해석되지 않는 글자는 포커스를 벗어날 때 원래 값으로 되돌아간다. 빈 칸으로 지우면 `onChange("")` 가 호출된다.

## 표준값: 모든 화면 동일

- 값 형식은 항상 `yyyy-MM-dd HH:mm:ss` 다(초 필수, 24시간제).
- 날짜만 다루는 필드는 DatePicker 를 쓰고 이 컴포넌트에 `00:00:00` 을 붙여 쓰지 않는다.
- `size`·`radius`·색 prop 을 주지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 초 없이 `2026-09-30 10:00` 을 값으로 넣는다 | 해석되지 않아 빈 칸이 된다. 초를 붙여 `10:00:00` 으로 준다. |
| `min`·`max` 에 시각까지 넣는다 | 날짜(`yyyy-MM-dd`)만 쓴다. 시각 제한은 저장 전에 화면에서 검증한다. |
| 서버 값 `2026-09-30T10:00:00.000Z` 를 그대로 넣는다 | 밀리초·타임존이 있으면 해석되지 않는다. KST 벽시계 `yyyy-MM-dd HH:mm:ss` 로 바꿔 넣는다. |
| `size` 를 준다 | 이 컴포넌트는 `size` 를 받지 않는다(타입 오류). |
| 입력 중에 `onChange` 가 안 불린다고 오류로 본다 | 형식이 맞는 순간에만 값이 바뀐다. |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleConfirm/page.tsx:324` `data-testid`·`value`·`onChange`·`disabled`. m-mdm 화면이다.
- `src/frontend/m-mdm/pages/dmc/codeConfirm/page.tsx:327` 같은 용도.
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)에서는 아직 사용처 없음.
