# Input

한 줄 텍스트나 숫자를 입력받거나 읽기전용 값을 보여 줄 때 쓴다.

- import: `import { Input, type InputProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Input.tsx`
- 내부 구현: Mantine `TextInput`

## 언제 쓰나

- 쓴다: 상세 폼([detail-form](detail-form.md))의 코드·명칭·수량·비고 한 줄 입력.
- 쓴다: 읽기전용 값 표시(서버 채번 ID 등).
- 쓰지 않는다: 조회조건 텍스트칸 → `SearchField`(내부에서 Input 을 쓴다. [search-area](search-area.md)).
- 쓰지 않는다: 여러 줄 → [Textarea](textarea.md). 목록에서 고르기 → [Select](select.md)·[ComboBox](combo-box.md).

## 표준 사용

```tsx
import { Input } from "@dk-oasis/shared/form";

<Input
  value={form?.itemCd ?? ""}
  maxLength={20}
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("itemCd", v)}
/>
```

`onChange` 는 이벤트가 아니라 입력된 문자열 `string` 을 받는다.

## 변형

### 읽기전용

`readOnly` 와 `disabled` 를 함께 준다.

```tsx
<Input value={form?.noticeId ?? ""} disabled readOnly />
```

### 숫자

`type="number"` 를 주면 브라우저 숫자 입력이 된다. 값은 여전히 문자열로 돌아오므로 저장 직전에 `Number()` 로 바꾼다.

```tsx
<Input type="number" value={form?.qty ?? ""} onChange={(v) => handleFormChange("qty", v)} />
```

### 오류 표시

검증 실패 문구를 `error` 로 넘기면 입력 아래에 오류 문구가 붙고 `aria-invalid` 가 켜진다.

```tsx
<Input value={form?.itemCd ?? ""} error={errors.itemCd} onChange={(v) => handleFormChange("itemCd", v)} />
```

## Props

`InputProps` 는 `input` 요소의 HTML 속성(`onChange` 제외)을 받는다. 직접 다루는 것은 아래와 같다.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string \| number` | `""` | 현재 값. 내부에서 문자열로 바꾼다. |
| onChange | `(value: string) => void` | 없음 | 값 변경 콜백. |
| disabled | `boolean` | `false` | 비활성. |
| readOnly | `boolean` | `false` | 읽기전용. |
| placeholder | `string` | `""` | 안내 문구. |
| type | `string` | `"text"` | HTML input type. |
| error | `string` | 없음 | 오류 문구. |
| id | `string` | 자동 생성 | input id. |
| className | `string` | `""` | 입력칸에 붙는 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다. |
| size | (무시됨) | 없음 | HTML `size` 속성은 받아서 버린다. 크기 조절 수단이 아니다. |
| aria-invalid, aria-describedby | `string`/boolean | `error` 에서 계산 | 부모가 지정하면 그 값을 쓴다. |

그 밖의 HTML 속성(`maxLength`, `name`, `data-testid`, `onKeyDown` 등)은 입력칸으로 전달된다.

## 표준값: 모든 화면 동일

- `size`·`radius`·색 prop 을 주지 않는다. 기본 높이는 xs(26px)이다.
- 읽기전용은 `readOnly` + `disabled`, 선택 행이 없으면 `disabled`.
- 필수 표시는 입력이 아니라 라벨 끝 " *" 로 한다.
- 최대 길이는 DB 컬럼 길이에 맞춰 `maxLength` 로 준다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `onChange={(e) => ... e.target.value}` | 첫 인자가 이미 문자열이다. `onChange={(v) => ...}`. |
| `size="sm"` 로 줄인다 | 지정해도 무시된다. 지우고 기본 크기를 쓴다. |
| 원시 `<input style={INPUT_BASE}>` 로 대신한다 | 이 컴포넌트를 쓴다. |
| `value` 에 `undefined` 를 넘겨 비제어로 만든다 | `?? ""` 로 항상 문자열을 준다. |
| 오류 문구를 직접 `<span style={{ color: "red" }}>` 로 그린다 | `error` prop 을 쓴다. |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:308` 읽기전용(`disabled readOnly`), 314줄 `maxLength`·`disabled={!form || isBusy}`·`onChange`.
- `src/frontend/m-mdm/pages/dma/unitMng/page.tsx:278` m-mdm 상세 폼의 읽기전용 Input.
- `error` prop 을 쓰는 화면은 아직 사용처 없음.
