# ToggleChipGroup

정해진 옵션 목록에서 여러 개를 켜고 끄는 칩 묶음이다(`ToggleChipGroup`). 칩은 `aria-pressed` 단추다. 기준과 비교한 추가·제거 모양과 일괄 선택 단추도 낸다.

- import: `import { ToggleChipGroup, type ToggleChipGroupProps, type ToggleChipOption, type ToggleChipPreset, toggleValue, chipDiffState } from "@dk-oasis/shared/toggle-chip-group";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣고, 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/toggle-chip-group/ToggleChipGroup.tsx`, `chip-state.ts`
- Part B 허용 목록(§1): `toggle-chip-group` SHOULD (Part B §18 로 등록).

## 언제 쓰나

- 쓴다: 옵션이 열 개 안팎으로 정해져 있고 켜짐·꺼짐을 한눈에 봐야 할 때(예: 사용할 기능 모음). 저장 전 초안과 저장본을 비교해 보일 때(`baseValue`).
- 쓰지 않는다:
  - 한 개만 고르기 → `Radio`·`Select`.
  - 옵션이 많거나 검색이 필요 → [MultiSelectComboBox](multi-select-combo-box.md)·[transfer-list](transfer-list.md).
  - 사용자가 코드를 직접 타이핑 → [token-chip-input](token-chip-input.md).
  - 단순 체크 하나 → `Checkbox`.
- 제어형이다. `value`(켜진 값)를 부모가 쥐고, `onChange(next)` 의 `next` 는 항상 `options` 순서다(옵션 밖 값은 뒤에 남는다).
- `baseValue` 를 주면 칩이 기준과 다를 때 모양이 바뀐다: 추가(켜졌는데 기준엔 없음) = 켜진 모양 + 점선 경고색 테두리, 제거(꺼졌는데 기준엔 있음) = 점선 + 취소선 + 경고 배경. 마우스오버에 `diffTitles` 문구가 붙는다.
- `presets` 는 칩 뒤 일괄 단추(모두·일부만·없음 등)다. 문구와 `pick(all)` 규칙은 화면이 정한다. `readOnly` 면 숨는다. 같은 문구가 둘이면 `id` 를 줘 key·testId 로 쓴다. `disabled` 옵션은 일괄 선택으로도 바뀌지 않는다(현재 상태 유지).
- `readOnly` 칩은 `aria-disabled` 이고, 추가·제거 상태는 화면 읽기 프로그램용 숨은 글(`(추가됨)`·`(빠짐)`)로도 알린다.
- `disabled` 옵션은 눌러도 바뀌지 않는다.

## 표준 사용

```tsx
import { useState } from "react";
import { ToggleChipGroup, type ToggleChipOption, type ToggleChipPreset } from "@dk-oasis/shared/toggle-chip-group";

const OPTIONS: ToggleChipOption[] = [
  { value: "alpha", title: "첫째" }, { value: "beta" }, { value: "gamma" }, { value: "delta", disabled: true },
];
const PRESETS: ToggleChipPreset[] = [
  { label: "모두", pick: (all) => all },
  { label: "하나만", pick: () => ["alpha"] },
  { label: "없음", pick: () => [] },
];

export function FeaturePicker({ saved }: { saved: string[] }) {
  const [draft, setDraft] = useState(saved);
  return <ToggleChipGroup aria-label="사용할 기능" options={OPTIONS} value={draft} onChange={setDraft} baseValue={saved} presets={PRESETS} />;
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `options` | `ToggleChipOption[]` = `{ value; label?: ReactNode; title?; disabled? }` | — | 옵션(이 순서로 그린다). `label` 이 없으면 `value` |
| `value` | `readonly string[]` | — | 켜진 값(제어형) |
| `onChange` | `(next: string[]) => void` | — | `options` 순서로 새 목록을 준다 |
| `baseValue` | `readonly string[]` | — | 비교 기준. 주면 추가·제거 모양을 보인다 |
| `readOnly` | `boolean` | `false` | 바꿀 수 없다(모양 유지, 일괄 단추 숨김) |
| `size` | `"xs" \| "sm" \| "md"` | `"sm"` | 칩 높이·글자 크기 |
| `presets` | `ToggleChipPreset[]` = `{ id?; label; pick(all); title? }` | — | 칩 뒤 일괄 선택 단추 |
| `diffTitles` | `{ added?; removed? }` | `추가됨` / `빠짐` | 추가·제거 칩 설명 |
| `aria-label` | `string` | — | 묶음 라벨(`role="group"`) |
| `className` / `testId` | | `testId="toggle-chip-group"` | testId 조립은 아래 |

testId(`{p}` = `testId`): 뿌리 `{p}`, 칩 `{p}-chip-{value}`, 일괄 단추 `{p}-preset-{id ?? label}`. 칩에는 `data-state`(`on`·`off`·`added`·`removed`)가 붙는다.

## 순수 함수

| 함수 | 하는 일 |
|---|---|
| `toggleValue(value, v, order)` | `v` 를 켜거나 끈 새 목록(`order` 순서) |
| `orderValues(values, order)` | `order` 순서로 맞춤(중복 제거, 밖의 값은 뒤에) |
| `applyPreset(picked, current, options)` | 일괄 선택 결과를 옵션 순서로 맞추되 `disabled` 옵션은 현재 상태 유지 |
| `chipDiffState(v, value, base?)` | `"on"`·`"off"`·`"added"`·`"removed"` |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `onChange` 결과 순서가 화면마다 다름 | 부품이 `options` 순서로 준다. 화면에서 다시 정렬하지 않는다 |
| 초안과 저장본을 비교하는 모양을 화면이 CSS 로 덮어씀 | `baseValue` 에 저장본을 준다 |
| 일괄 단추를 화면이 칩 옆에 따로 만듦 | `presets` |
| 렌더마다 `options`·`presets` 를 새로 만듦 | 모듈 수준 상수로 둔다 |
