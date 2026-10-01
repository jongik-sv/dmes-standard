# 아이콘 (@tabler/icons-react)

버튼·툴바·셀 안에 작은 그림 아이콘을 넣을 때 쓴다. 화면의 아이콘은 `@tabler/icons-react` 만 쓴다.

- import: `import { IconPlus, IconTrash } from "@tabler/icons-react";` (`@dk-oasis/shared/*` 가 아니라 이 패키지를 직접 import 하는 허용 예외다)
- 소스: 패키지 `@tabler/icons-react`(shared 의 peerDependency `>=3`, 개발 버전 `^3.46.0`)
- 내부 구현: shared 의 `Modal`·`Tree`·`LookupIconButton` 도 같은 패키지를 쓴다

## 언제 쓰나

- 쓴다: 글자와 함께 놓는 버튼 아이콘, 접기·펼치기 화살표, 아이콘만 있는 보조 버튼(`aria-label` 필수).
- 쓰지 않는다: 상태 값 표시 → [GridBadge](grid-badge.md). 다른 아이콘 패키지·이모지·자작 SVG·이미지 아이콘.
- 화면 곳곳의 장식 아이콘을 늘리지 않는다. 의미를 글자로 이미 전하면 아이콘을 빼도 된다.

## 표준 사용

```tsx
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@dk-oasis/shared/form";

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <IconPlus size={14} aria-hidden="true" style={{ marginRight: "var(--spacing-xs)" }} />
      추가
    </Button>
  );
}
```

`size={14}` 이 기본이다. `stroke`·`color` 는 주지 않는다(굵기는 기본값, 색은 둘러싼 글자색을 따른다).

## 변형

### 촘촘한 곳: 12

그리드 셀 안, 배지 옆, 작은 보조 버튼처럼 공간이 좁으면 `size={12}` 를 쓴다.

```tsx
<IconX size={12} aria-hidden="true" />
```

### 아이콘만 있는 버튼

글자가 없으면 보조기술이 읽을 이름이 필요하다. 버튼에 `aria-label`(또는 `title`)을 주고 아이콘은 `aria-hidden` 으로 감춘다.

```tsx
import { IconTrash } from "@tabler/icons-react";

<button type="button" aria-label="행 삭제" onClick={onRemove}>
  <IconTrash size={12} aria-hidden="true" />
</button>
```

## Props

아이콘 컴포넌트는 Tabler 가 정의한 props 를 받는다. 화면이 쓰는 것만 적는다.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| size | `number` | `24`(패키지) | 표준은 `14`, 촘촘한 곳 `12`. 이 값은 아이콘 픽셀 크기이며 컴포넌트 `size` 규칙의 예외다 |
| stroke | `number` | 패키지 기본 | 주지 않는다 |
| color | `string` | 글자색 따름 | 주지 않는다 |
| aria-hidden | `"true"` | - | 글자가 함께 있거나 장식일 때 준다 |
| aria-label | `string` | - | 아이콘이 단독으로 의미를 전할 때 준다 |
| className / style | - | - | 간격(`marginRight: "var(--spacing-xs)"`)에만 쓴다. 색·글꼴 크기를 주지 않는다 |

## 표준값: 모든 화면 동일

- 패키지는 `@tabler/icons-react` 하나. 아이콘 이름은 `Icon` + PascalCase(`IconTrash`, `IconArrowBackUp`).
- `size` 는 14, 촘촘한 곳 12. `stroke` 는 주지 않는다. 색은 주지 않고 글자색을 따른다.
- 글자 옆 간격은 `style={{ marginRight: "var(--spacing-xs)" }}` 같은 간격 토큰만 쓴다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `size={16}` 이나 `size="sm"` 처럼 임의 크기를 준다 | 14 또는 12 |
| `color="#d42a2a"` 나 `stroke={1.5}` 를 준다 | 주지 않는다. 오류 강조가 꼭 필요하면 글자색 토큰을 부모에 준다 |
| 아이콘만 있는 버튼에 이름이 없다 | `aria-label` 을 준다 |
| 이모지(✕, ✓)나 문자로 아이콘을 대신한다 | `IconX`·`IconCheck` 를 쓴다 |
| MES 모듈(m-mls·m-mpp·m-mqc)에서 import 가 풀리지 않는다 | 이 세 모듈의 `package.json` 에는 `@tabler/icons-react` 가 선언돼 있지 않아 `tsc` 가 `TS2307: Cannot find module '@tabler/icons-react'` 로 실패한다(2026-10-01 m-mqc 에서 확인. m-mcm·m-mdm 은 `^3.46.0` 선언). 아이콘이 필요하면 사용자 확인 후 해당 모듈 `package.json` 에 m-mdm 과 같은 버전으로 추가한다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:105`: 글자 앞 아이콘 `size={14}` + `aria-hidden` + 간격 토큰(표준과 같다). `:367` 은 `size={12}`.
- `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx:52-64`: 툴바 아이콘 `size={14}`.
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:66`: `color="var(--color-danger)"` 를 준다. 단, 색 prop 을 주지 않는 표준과 다름.
- `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx:99`: 아이콘에 `style={{ color: "var(--color-text-muted)" }}` 를 준다. 단, 색을 주지 않는 표준과 다름.
- `src/frontend/m-mdm/pages/dme/ruleEdit/sections/columns/column-grid.tsx:180`: `const ICON = 14;` 로 한 곳에서 크기를 관리한다.
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)의 화면에서는 아직 사용처 없음.
