# TokenChipInput

쉼표로 이은 짧은 코드 목록(`alpha,beta,gamma`)을 칩으로 보이고 고치는 제어형 입력이다(`TokenChipInput`). 쪼개기·잇기·규칙 거르기 순수 함수도 함께 낸다.

- import: `import { TokenChipInput, type TokenChipInputProps, parseTokens, joinTokens } from "@dk-oasis/shared/token-chip-input";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣고, 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/token-chip-input/TokenChipInput.tsx`, `token-set.ts`
- 내부 구현: 칩 안에 둔 기본 `<input>` 한 칸(고정폭 글꼴). Mantine `TagsInput`·`PillsInput` 은 쓰지 않는다.
- Part B 허용 목록(§1): `token-chip-input` SHOULD (Part B §18 로 등록).

## 언제 쓰나

- 쓴다: 값이 영문 코드 몇 개인 칸을 쉼표 글 대신 칩으로 편집할 때(예: 기능 코드 목록). 한 번에 여러 개를 붙여 넣어도 된다.
- 쓰지 않는다:
  - 정해진 후보 중에서만 고르기 → 후보가 적으면 [toggle-chip-group](toggle-chip-group.md), 많으면 [MultiSelectComboBox](multi-select-combo-box.md).
  - 후보 목록 사이 이동 → [transfer-list](transfer-list.md).
  - 사람이 읽는 문장·이름(공백 포함) → `Input`. 이 부품은 공백·쉼표를 토큰 구분자로 본다.
- 제어형이다. `value`(`string[]`)를 부모가 쥔다. 쉼표 글이 필요하면 `parseTokens(text)` 로 읽고 `joinTokens(list)` 로 쓴다.
- 입력: Enter·쉼표·공백·칸을 벗어날 때 칩이 되고, 칩 ×가 지우고, 빈 칸에서 Backspace 는 마지막 칩을 지운다. 한글 조합 중 Enter 는 칩으로 만들지 않는다.
- 규칙: `pattern`(기본 `/^[A-Za-z][A-Za-z0-9_]*$/`, `null` 이면 안 봄)·`allowed`·`maxLength`(쉼표로 이은 글 전체 글자 수)·중복. 어긋난 입력은 칩이 되지 않고 작은 안내 글(`role="alert"`)에 이유와 토큰이 보인다(다음 입력에서 사라진다). 한글 조합 중에는 칩으로 만들지 않고, 조합이 끝난 뒤 구분 글자를 다시 확인한다.
- `readOnly`·`disabled` 면 입력 칸이 없으므로 묶음(`role="group"`)이 `aria-label` 을 가진다.
- `allowed` 를 주면 기본(`rejectOutside`)은 밖의 입력을 거절한다. `rejectOutside={false}` 면 받되 목록 밖 칩을 잘못된 모양(위험색 테두리)으로 보인다. 이미 `value` 에 들어 있는 목록 밖 값은 어느 쪽이든 잘못된 칩으로 보인다.
- `readOnly`·`disabled` 면 입력 칸과 ×가 없다.

## 표준 사용

```tsx
import { useState } from "react";
import { TokenChipInput, joinTokens, parseTokens } from "@dk-oasis/shared/token-chip-input";

const ALLOWED = ["alpha", "beta", "gamma", "delta"];

export function CodeListField({ csv, onCsv }: { csv: string; onCsv: (csv: string) => void }) {
  return (
    <TokenChipInput
      aria-label="코드 목록"
      placeholder="코드를 쓰고 Enter"
      value={parseTokens(csv)}
      onChange={(next) => onCsv(joinTokens(next))}
      allowed={ALLOWED}
    />
  );
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `readonly string[]` | — | 지금 토큰(제어형) |
| `onChange` | `(next: string[]) => void` | — | 더하거나 지울 때 새 배열로 부른다 |
| `allowed` | `readonly string[]` | — | 허용 목록 |
| `rejectOutside` | `boolean` | `true` | true 면 목록 밖 입력 거절, false 면 받고 잘못된 칩으로 보임 |
| `pattern` | `RegExp \| null` | 영문자로 시작하는 영문·숫자·밑줄 | 입력 토큰 모양(`g`·`y` 깃발이 있어도 매번 되돌려 시험한다) |
| `maxLength` | `number` | 없음 | 쉼표로 이은 글 전체 글자 수 상한 |
| `readOnly` / `disabled` | `boolean` | `false` | 입력·× 없음 |
| `placeholder` | `string` | — | 칩이 하나도 없을 때만 보인다 |
| `aria-label` | `string` | — | 입력 칸 라벨 |
| `messages` | `Partial<Record<"pattern"\|"outside"\|"duplicate"\|"maxLength", string>>` | 한국어 문구 | 거절 안내 문구(뒤에 `: 토큰들` 이 붙는다) |
| `removeLabel` / `invalidTitle` | `string` | `삭제` / `허용 목록에 없는 값` | × 의 `aria-label` 뒷부분, 잘못된 칩 설명 |
| `className` / `testId` | | `testId="token-chip-input"` | testId 조립은 아래 |

testId(`{p}` = `testId`): 뿌리 `{p}`, 입력 `{p}-input`, 칩 `{p}-chip-{토큰}`, × `{p}-remove-{토큰}`, 안내 `{p}-message`.

## 순수 함수

| 함수 | 하는 일 |
|---|---|
| `parseTokens(text)` | 쉼표·공백·줄바꿈으로 쪼개 다듬고 빈 것 버림, 순서 유지, 중복은 처음 것만 |
| `joinTokens(list)` | 쉼표(공백 없이)로 잇는다 |
| `filterTokens(list, { allowed, pattern, existing, maxLength })` | `{ accepted, rejected: { token, reason }[] }` — 이유는 `pattern`·`outside`·`duplicate`·`maxLength` |
| `addTokens(value, text, options)` | 글을 쪼개 걸러 받아들인 것만 `value` 뒤에 붙인 `{ next, rejected }` |

`DEFAULT_TOKEN_PATTERN` = `pattern` 을 안 줄 때 쓰는 코드 규칙(영문자로 시작, 영문·숫자·`_`).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 쉼표 글을 그대로 `value` 에 넘김 | `parseTokens(csv)` 로 배열을 만든다. 렌더마다 새 배열이어도 된다 |
| 저장 전 형식 검사를 화면이 또 만듦 | `pattern`·`allowed` 와 `filterTokens` 를 쓴다. 서버 검증은 별개로 남긴다 |
| 허용 목록 밖 값을 저장하려 함(`rejectOutside={false}`) | 잘못된 칩이 남아 있으면 화면이 저장을 막거나 사용자에게 알린다 |
