# ComboBox

선택지가 많거나 검색해서 고르고 싶을 때, 또는 목록에 없는 값을 새로 만들 수 있게 할 때 쓴다.

- import: `import { ComboBox, type ComboBoxProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/ComboBox.tsx`
- 내부 구현: Mantine `Select`(`searchable`)

## 언제 쓰나

- 쓴다: 코드·품목·메뉴처럼 선택지가 많아 검색이 필요한 단일 선택.
- 쓴다: 목록에 없으면 새로 만들 수 있는 입력(`onCreateNew`).
- 쓰지 않는다: 선택지가 적고 검색이 필요 없을 때 → [Select](select.md).
- 쓰지 않는다: 여러 개 선택 → [MultiSelectComboBox](multi-select-combo-box.md).

## 표준 사용

```tsx
import { ComboBox } from "@dk-oasis/shared/form";

<ComboBox
  data={menuOptions}
  valueField="MENU_ID"
  labelField="MENU_NM"
  value={form?.menuId ?? ""}
  placeholder="(선택)"
  disabled={!form || isBusy}
  onChange={(v) => handleFormChange("menuId", v)}
/>
```

`data` 는 `string[]` 또는 객체 배열이다. 객체 배열이면 `valueField`(기본 `"value"`)와 `labelField`(기본 `"label"`)로 값과 표시 글자를 지정한다. 필드가 없는 항목은 빈 문자열로 처리된다.

## 변형

### 새 항목 만들기(onCreateNew)

입력한 글자가 어떤 항목의 label 과도 같지 않을 때, 드롭다운에 `+ "{글자}" 신규 생성` 항목이 나온다. 누르면 `onCreateNew(글자)` 가 호출되고 값 변경은 화면이 직접 처리한다. 문구는 `createLabel` 로 바꿀 수 있다.

```tsx
<ComboBox
  data={dimensionOptions}
  value={form?.dimension ?? ""}
  onChange={(v) => handleFormChange("dimension", v)}
  onCreateNew={(text) => handleFormChange("dimension", text)}
  placeholder="차원 선택 또는 새 차원 입력"
/>
```

### 대용량 데이터(maxVisible)

수만 건 이상이면 `maxVisible` 로 한 번에 그리는 항목 수를 제한한다. 값을 지정하지 않으면 제한이 없다. 현재 선택값이 제한 밖에 있어도 입력창에는 표시된다.

```tsx
<ComboBox data={materials} valueField="MTRL_CD" labelField="MTRL_NM" maxVisible={100} value={v} onChange={setV} />
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| data | `any[]` | 필수 | 원본 배열(`string[]` 또는 객체 배열). |
| valueField | `string` | `"value"` | 값으로 쓸 필드명. |
| labelField | `string` | `"label"` | 표시 글자로 쓸 필드명. 없으면 값 필드를 쓴다. |
| value | `string` | `""` | 선택된 값. |
| onChange | `(value: string, item?: any) => void` | 없음 | 선택 변경. 두 번째 인자는 원본 항목(해제하면 `""`, `undefined`). |
| placeholder | `string` | `""` | 안내 문구. |
| disabled | `boolean` | `false` | 비활성. |
| readOnly | `boolean` | `false` | 읽기전용. |
| error | `string` | 없음 | 오류 문구. |
| onCreateNew | `(text: string) => void` | 없음 | 지정하면 새 항목 만들기가 켜진다. |
| createLabel | `(text: string) => string` | `+ "{text}" 신규 생성` | 새 항목 문구. |
| maxVisible | `number` | 제한 없음 | 드롭다운 최대 표시 개수. |
| id | `string` | 자동 생성 | 입력 id. |
| className | `string` | `""` | 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 폭 같은 배치에만 쓴다. |
| aria-label, aria-labelledby, aria-describedby, aria-invalid | `string`/boolean | 없음 | 접근성 속성. |

## 표준값: 모든 화면 동일

- `size`·`radius`·색 prop 을 주지 않는다(받지도 않는다).
- 안내 문구는 `"(선택)"` 처럼 짧게 쓴다.
- 선택 행이 없으면 `disabled`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 값이 숫자인 필드를 그대로 `valueField` 로 쓴다 | 값은 문자열로 비교한다. `value={String(row.ID ?? "")}` 로 준다. |
| `data` 를 렌더마다 새 배열로 만든다 | 내부 옵션 계산이 매번 다시 돈다. `useMemo` 로 고정한다. |
| `onCreateNew` 만 주고 값 반영을 안 한다 | 콜백에서 화면 상태를 직접 갱신한다. ComboBox 는 값을 바꾸지 않는다. |
| 목록에 없는 `value` 를 넣고 선택이 비었다고 생각한다 | 값 글자가 그대로 표시된다. 옵션 로딩이 끝난 뒤 값을 넣는다. |
| 조회가 늦어 `data` 가 나중에 와도 입력하던 글자가 지워진다고 걱정한다 | `value` 가 그대로면 `data` 만 바뀌어도 사용자가 친 글자는 남는다. `value` 가 바뀌거나, 손대지 않은 입력창에 라벨이 새로 생기면 그 라벨로 맞춘다. |
| 같은 label 이 두 항목에 있다 | `onCreateNew` 판단이 label 일치로 이뤄지므로 label 을 고유하게 한다. |
| 여러 개 선택에 쓴다 | MultiSelectComboBox 를 쓴다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx:1001` `valueField`·`labelField` 지정(`as unknown as Record<string, unknown>[]` 로 타입을 맞춘 부분은 표준이 아니다).
- `src/frontend/m-mdm/pages/dma/unitMng/page.tsx:265` `onCreateNew`. m-mdm 화면이다.
- `maxVisible` 은 아직 사용처 없음.
