# Radio

2~4개의 선택지 중 하나를 모두 펼쳐 보여 주며 고르게 할 때 쓴다.

- import: `import { Radio, type RadioProps, type RadioOption } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Radio.tsx`
- 내부 구현: Mantine `Radio.Group` + `Radio` (한 줄 가로 배치, 줄바꿈 없음)

## 언제 쓰나

- 쓴다: Yes/No, 구분 2~4개처럼 선택지가 적고 한눈에 보여야 할 때.
- 쓴다: 조회조건의 라디오(`SearchField type="radio"`, [search-area](search-area.md)).
- 쓰지 않는다: 선택지가 많을 때 → [Select](select.md). 켜고 끄는 값 하나 → [Checkbox](checkbox.md).

## 표준 사용

```tsx
import { Radio, type RadioOption } from "@dk-oasis/shared/form";

const YN_OPTIONS: RadioOption[] = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

<Radio
  name="useYn"
  value={form?.useYn ?? ""}
  options={YN_OPTIONS}
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("useYn", v)}
/>
```

`name` 은 접근성 이름(`aria-label`)으로 쓰이므로 항목을 설명하는 이름을 준다. `onChange` 는 선택된 `value` 문자열을 받는다. 같은 화면의 라디오 그룹끼리는 `name` 이 겹쳐도 내부 그룹 이름은 자동으로 구분된다.

## 변형

### 문자열 배열

`value` 와 `label` 이 같으면 문자열 배열로 줄 수 있다.

```tsx
<Radio name="구분" value={form?.kind ?? ""} options={["내수", "수출"]} onChange={(v) => handleFormChange("kind", v)} />
```

### 조회조건

```tsx
<SearchField label="사용여부" type="radio" value={f.useYn} options={[{ value: "", label: "전체" }, { value: "Y", label: "사용" }]} onChange={(v) => set("useYn", v)} />
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string \| number` | `""` | 선택된 값. |
| onChange | `(value: string) => void` | 없음 | 선택 변경 콜백. |
| options | `RadioOption[]` | `[]` | `string \| { value: string; label: string }` 의 배열. |
| name | `string` | 없음 | 그룹 접근성 이름. 없으면 `"radio"`. |
| disabled | `boolean` | `false` | 전체 비활성. |
| id | `string` | 없음 | 그룹 id. |
| className | `string` | `""` | 그룹에 붙는 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 배치에만 쓴다. |
| aria-label, aria-labelledby, aria-describedby | `string` | 없음 | 접근성 속성. `aria-label` 기본값은 `name`. |
| aria-invalid | `boolean` | 없음 | 오류 표시. |

`error`·`readOnly`·옵션별 `disabled` 는 없다.

## 표준값: 모든 화면 동일

- Yes/No 는 `{ value: "Y", label: "Yes" }`, `{ value: "N", label: "No" }` 로 통일한다.
- 선택지는 4개 이하로 한다. 한 줄 배치라 많으면 폭을 넘친다.
- `size`·`radius`·색 prop 을 주지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 선택지가 6개 이상이다 | 줄바꿈 없이 한 줄이라 잘린다. Select 로 바꾼다. |
| `value` 에 불리언을 넣는다 | 문자열(`"Y"`/`"N"`)로 맞춘다. |
| `onChange={(e) => e.target.value}` | 첫 인자가 이미 문자열이다. |
| 옵션 `value` 가 서로 같다 | React key 와 선택이 겹친다. 값을 고유하게 한다. |
| 읽기전용을 `readOnly` 로 준다 | 받지 않는다. `disabled` 를 쓴다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:1176` Yes/No 라디오(`name`·`value`·`onChange`·`options`). 상세 표 값 칸 안에서 `flex` `div` 와 함께 쓰고 있어 배치 코드는 표준이 아니다.
- `src/frontend/m-mcm/page-components/csa/commPermMng/page.tsx:831` 상세 영역의 Radio.
