# MultiSelectComboBox

여러 항목을 검색해서 골라 태그로 보여 줄 때 쓴다.

- import: `import { MultiSelectComboBox, type MultiSelectComboBoxProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/MultiSelectComboBox.tsx`
- 내부 구현: Mantine `MultiSelect`(`searchable`)

## 언제 쓰나

- 쓴다: 값이 배열인 필드(여러 코드·여러 행 ID 선택).
- 쓰지 않는다: 하나만 고를 때 → [ComboBox](combo-box.md) 또는 [Select](select.md).
- 쓰지 않는다: 항목이 몇 개뿐이고 모두 보여 줘도 될 때 → [Checkbox](checkbox.md) 여러 개.

## 표준 사용

```tsx
import { MultiSelectComboBox } from "@dk-oasis/shared/form";

<MultiSelectComboBox
  data={roleOptions}
  valueField="ROLE_ID"
  labelField="ROLE_NM"
  value={form?.roleIds ?? []}
  placeholder="(선택)"
  disabled={!form || isBusy}
  onChange={(ids) => handleFormChange("roleIds", ids)}
/>
```

`data` 는 `string[]` 또는 객체 배열이다. `value`·`onChange` 는 문자열 배열이다. 숫자 ID 는 `.map(String)` 으로 바꿔 넘긴다.

## 변형

### 문자열 배열 데이터

```tsx
<MultiSelectComboBox data={["A", "B", "C"]} value={picked} onChange={setPicked} />
```

### 읽기전용·비활성

`readOnly` 는 태그를 보여 주되 바꿀 수 없게 하고, `disabled` 는 입력 전체를 막는다. 상세 폼에서는 선택 행이 없을 때 `disabled` 를 준다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| data | `any[]` | 필수 | 원본 배열(`string[]` 또는 객체 배열). |
| valueField | `string` | `"value"` | 값으로 쓸 필드명. |
| labelField | `string` | `"label"` | 표시 글자로 쓸 필드명. |
| value | `string[]` | `[]` | 선택된 값 배열. |
| onChange | `(values: string[]) => void` | 없음 | 선택 변경. |
| placeholder | `string` | `""` | 안내 문구. 선택된 항목이 있으면 숨겨진다. |
| disabled | `boolean` | `false` | 비활성. |
| readOnly | `boolean` | `false` | 읽기전용. |
| error | `string` | 없음 | 오류 문구. |
| id | `string` | 자동 생성 | 입력 id. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다. |
| aria-label, aria-labelledby, aria-describedby, aria-invalid | `string`/boolean | 없음 | 접근성 속성. |

[ComboBox](combo-box.md)와 달리 `onCreateNew`·`createLabel`·`maxVisible` 은 없다. 검색 결과가 없으면 "검색 결과 없음" 이 표시된다.

## 표준값: 모든 화면 동일

- `size`·`radius`·색 prop 을 주지 않는다.
- 값 배열은 항상 문자열 배열이다.
- 선택 행이 없으면 `disabled`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `value` 에 숫자 배열을 넘긴다 | `value={ids.map(String)}` 로 문자열 배열을 준다. |
| 옵션에 없는 값이 태그로만 남는 것을 오류로 본다 | 선택값 중 옵션에 없는 것은 값 글자가 그대로 태그가 된다. 옵션 로딩 뒤에 값을 넣는다. |
| 사용 화면에서 `.form-multiselect` 뿌리를 덮어써 테두리를 지운다 | 뿌리에는 상자가 없다. 상자는 안쪽 input(`.form-multiselect-box`) 하나이므로 덮어쓰지 않는다. 겹쳐 보이면 shared 를 고친다. |
| `data` 를 렌더마다 새로 만든다 | `useMemo` 로 고정한다. |
| `value` 를 `undefined` 로 넘긴다 | 기본값 `[]` 이 적용되지만 `?? []` 로 명시하는 편이 안전하다. |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleEdit/cards/TestCaseEditModal.tsx:333` `value={...map(String)}` 와 `disabled` 사용. m-mdm 의 모달 안이다.
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)에서는 아직 사용처 없음.
