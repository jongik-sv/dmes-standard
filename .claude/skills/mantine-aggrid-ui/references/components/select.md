# Select

정해진 선택지 중 하나를 드롭다운으로 고를 때 쓴다.

- import: `import { Select, type SelectProps, type SelectOption } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Select.tsx`
- 내부 구현: Mantine `NativeSelect` (브라우저 기본 select 라서 검색·신규 입력이 없다)

## 언제 쓰나

- 쓴다: 상세 폼에서 코드값 몇 개 중 하나 고르기(상태·유형·구분).
- 쓴다: 선택지가 대략 20개 이하이고 검색이 필요 없을 때.
- 쓰지 않는다: 조회조건의 선택 → `<SearchField type="select" options=…>`([search-area](search-area.md)).
- 쓰지 않는다: 선택지가 많거나 검색·신규 입력이 필요할 때 → [ComboBox](combo-box.md). 여러 개 선택 → [MultiSelectComboBox](multi-select-combo-box.md).
- 쓰지 않는다: 2~3개 중 라디오로 보이는 편이 낫는 경우 → [Radio](radio.md).

## 표준 사용

```tsx
import { Select, type SelectOption } from "@dk-oasis/shared/form";

const STATUS_OPTIONS: SelectOption[] = [
  { value: "READY", label: "대기" },
  { value: "POSTED", label: "게시중" },
];

<Select
  value={form?.status ?? ""}
  options={STATUS_OPTIONS}
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("status", v)}
/>
```

선택지 배열은 컴포넌트 밖 모듈 상수로 둔다. `onChange` 는 선택된 `value` 문자열을 받는다.

## 변형

### 문자열 배열

`value` 와 `label` 이 같으면 문자열 배열로 줄 수 있다.

```tsx
<Select value={form?.unit ?? ""} options={["EA", "KG", "M"]} onChange={(v) => handleFormChange("unit", v)} />
```

### 선택 안 함 항목

`placeholder` 를 주면 맨 앞에 `{ value: "", label: placeholder }` 가 추가된다. 상세 폼에서 "미선택" 을 허용할 때만 쓴다.

```tsx
<Select value={form?.type ?? ""} options={TYPE_OPTIONS} placeholder="선택" onChange={(v) => handleFormChange("type", v)} />
```

## Props

`SelectProps` 는 `select` 요소의 HTML 속성(`onChange` 제외)을 받는다.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string \| number` | `""` | 선택된 값. |
| onChange | `(value: string) => void` | 없음 | 선택 변경 콜백. |
| options | `SelectOption[]` | `[]` | `string \| { value: string; label: string }` 의 배열. |
| placeholder | `string` | 없음 | 있으면 맨 앞에 빈 값 항목으로 추가된다. |
| disabled | `boolean` | `false` | 비활성. |
| error | `string` | 없음 | 오류 문구. |
| id | `string` | 자동 생성 | select id. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다. |
| size | (무시됨) | 없음 | HTML `size` 는 받아서 버린다. |

## 표준값: 모든 화면 동일

- `size`·`radius`·색 prop 을 주지 않는다.
- 조회조건 select 의 첫 항목은 `{ value: "", label: "전체" }` 다.
- 선택 행이 없으면 `disabled`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `options` 를 렌더마다 `.map` 으로 새로 만든다 | 고정 선택지는 모듈 상수로 둔다. 서버에서 받은 값은 `useMemo`. |
| `value` 에 `null` 을 넘긴다 | `?? ""` 로 빈 문자열을 준다. 선택지에 없는 값은 아무 항목도 선택되지 않은 것처럼 보인다. |
| `onChange={(e) => e.target.value}` | 첫 인자가 이미 문자열이다. |
| 검색이 필요한데 Select 에 항목을 수백 개 넣는다 | ComboBox 로 바꾼다. |
| 조회조건에서 `<Select>` 를 `SearchField` 안에 직접 넣는다 | `type="select"` 와 `options` 를 쓴다. 직접 넣는 것은 선택지가 동적이거나 비활성 제어가 필요한 경우에 한한다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:325` 상세 폼의 Select(`options`, `disabled={!form || isBusy}`).
- `src/frontend/m-mcm/page-components/cme/masterCodeMngList/page.tsx:340` 동적 선택지를 `map` 으로 만든 예. 단, `style={{ minWidth: 120 }}` 를 주고 있어 폭 지정 외의 의도는 아니다.
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:444` 조회영역 안의 Select. m-mdm 화면이다.
