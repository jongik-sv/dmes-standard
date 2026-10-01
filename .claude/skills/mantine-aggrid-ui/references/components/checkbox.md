# Checkbox

참·거짓 하나를 켜고 끄는 입력(여부 항목, 동의 확인)이 필요할 때 쓴다.

- import: `import { Checkbox, type CheckboxProps } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Checkbox.tsx`
- 내부 구현: Mantine `Checkbox`

## 언제 쓰나

- 쓴다: 사용 여부·확인 체크처럼 켜고 끄는 값 하나.
- 쓰지 않는다: 둘 중 하나를 골라야 하고 두 선택지를 모두 보여 줄 때 → [Radio](radio.md).
- 쓰지 않는다: 그리드 행 선택 → AgDataGrid 의 행 선택 기능.
- 쓰지 않는다: 여러 개 중 복수 선택(항목이 많을 때) → [MultiSelectComboBox](multi-select-combo-box.md).

## 표준 사용

```tsx
import { Checkbox } from "@dk-oasis/shared/form";

<Checkbox
  label="사용"
  checked={form?.useYn === "Y"}
  disabled={!form || isBusy}
  onChange={(checked) => handleFormChange("useYn", checked ? "Y" : "N")}
/>
```

`onChange` 는 이벤트가 아니라 `boolean` 을 받는다. 서버 값이 `"Y"`/`"N"` 이면 화면에서 변환한다.

## 변형

### 라벨 없는 체크박스

표 셀 안처럼 라벨을 둘 자리가 없으면 `label` 을 생략하고 `aria-label` 을 반드시 준다.

```tsx
<Checkbox aria-label="hit 비교" checked={on} onChange={setOn} />
```

### 상세 폼 안

라벨은 상세 표의 `th` 에 두고, 값 칸의 체크박스는 `label` 없이 `aria-label` 로 이름을 준다. 라벨을 체크박스 옆 글자로 쓰고 싶으면 `label` 을 쓰고 `th` 는 항목명을 쓴다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| checked | `boolean` | `false` | 체크 여부. |
| onChange | `(checked: boolean) => void` | 없음 | 변경 콜백. |
| label | `string` | `""` | 옆에 표시할 글자. 비어 있으면 표시하지 않는다. |
| disabled | `boolean` | `false` | 비활성. |
| id | `string` | 자동 생성 | 입력 id. |
| className | `string` | `""` | 루트에 붙는 추가 클래스. |
| style | `React.CSSProperties` | 없음 | 배치에만 쓴다. |
| aria-label, aria-labelledby, aria-describedby | `string` | 없음 | 접근성 속성. |
| aria-invalid | `boolean` | 없음 | 오류 표시. |

`error`·`readOnly` prop 은 없다. 읽기전용이 필요하면 `disabled` 를 쓴다.

## 표준값: 모든 화면 동일

- 라벨 문구는 짧은 명사나 확인 문장이다("사용", "경고를 확인했습니다").
- `size`·`radius`·색 prop 을 주지 않는다.
- 선택 행이 없으면 `disabled`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `onChange={(e) => e.target.checked}` | 첫 인자가 이미 `boolean` 이다. |
| 라벨도 `aria-label` 도 없다 | 스크린리더가 읽을 이름이 없다. 둘 중 하나는 준다. |
| `checked={form.useYn}` 에 `"Y"` 문자열을 그대로 넣는다 | `checked={form?.useYn === "Y"}` 로 변환한다. |
| `data-testid` 를 준다 | 이 컴포넌트는 정해진 prop 만 전달해서 `data-testid` 가 버려진다. `aria-label` 로 찾는다. |
| `readOnly` 를 준다 | 받지 않는다. `disabled` 를 쓴다. |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleConfirm/ConfirmModal.tsx:91` `checked`·`label`·`onChange`. m-mdm 모달 안이다.
- `src/frontend/m-mdm/pages/dme/ruleConfirm/page.tsx:532` 같은 형태의 "같은 행 보기" 체크.
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)에서는 아직 사용처 없음.
