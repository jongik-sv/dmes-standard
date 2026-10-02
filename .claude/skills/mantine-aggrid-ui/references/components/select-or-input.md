# SelectOrInput

고를 목록이 있으면 드롭다운으로, 목록이 아직 없으면 직접 입력 칸으로 바뀌는 한 칸 입력을 만들 때 쓴다. 목록이 나중에 채워지는 칸(예: 조회해 본 결과 컬럼 이름)에 맞다.

- import: `import { SelectOrInput, withCurrentOption, type SelectOrInputProps } from "@dk-oasis/shared/form";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/form/SelectOrInput.tsx`, 선택지 도우미 `select-or-input-options.ts`
- 내부 구현: `options` 가 비면 shared `Input`, 있으면 shared `Select`. 새 스타일 없음
- Part B 허용 목록(§1): `form` 서브패스에 포함(새 서브패스 없음, §18 등록).

## 언제 쓰나

- 쓴다: 값 후보가 때에 따라 있기도 하고 없기도 한 칸. 후보가 없을 때도 값을 적어 둘 수 있어야 하는 설정 칸.
- 쓰지 않는다: 후보가 늘 있는 칸은 [Select](select.md). 후보를 쓰면서 자유 입력도 허용하는 칸은 [ComboBox](combo-box.md). 후보가 없으면 입력할 수 없어야 하는 칸은 `Select` 를 비활성으로 둔다.
- `Select` 와의 차이: `options` 가 비어도 칸이 사라지지 않고 입력 칸이 된다. 지금 값이 목록에 없으면 목록 맨 앞에 끼워 값을 잃지 않는다.

## 표준 사용

```tsx
import { SelectOrInput } from "@dk-oasis/shared/form";

// columns: 조회해 본 결과 컬럼 이름 목록. 조회 전에는 빈 배열.
<SelectOrInput
  value={cfg.labelField}
  options={columns}
  onChange={(labelField) => patch({ labelField })}
  ariaLabel="라벨 필드"
  inputPlaceholder="컬럼 이름(조회 뒤에는 목록에서 고릅니다)"
/>;

// 비워 둬도 되는 칸
<SelectOrInput value={cfg.unitField} options={columns} optional onChange={…} ariaLabel="단위 필드" />;
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string` | 필수 | 지금 값 |
| options | `readonly string[]` | 필수 | 고를 값 목록. 비면 직접 입력 칸 |
| onChange | `(value: string) => void` | 필수 | 고르거나 입력할 때 호출 |
| ariaLabel | `string` | 필수 | 화면 낭독용 이름(칸 옆 라벨이 없을 때도 필요) |
| optional | `boolean` | `false` | true 면 빈 값 선택지 「(없음)」 을 맨 앞에 둔다(빈 값 문구는 `selectPlaceholder` 로 바꾼다) |
| inputPlaceholder | `string` | `"직접 입력"` | 직접 입력 칸의 안내 문구 |
| selectPlaceholder | `string` | optional 이면 `"(없음)"`, 아니면 `"선택"` | 선택 칸의 빈 값 문구 |
| disabled | `boolean` | `false` | 비활성 |

`withCurrentOption(options, current)`: 선택지 목록에 지금 값이 없으면 앞에 끼운 새 배열을 돌려준다(빈 값은 끼우지 않는다). 컴포넌트가 쓰며, 같은 규칙이 필요한 다른 선택 칸에서도 쓸 수 있다.

## 표준값: 모든 화면 동일

- 안내 문구는 「…합니다」·「…하세요」 말투. 화면마다 다른 안내가 필요하면 `inputPlaceholder`·`selectPlaceholder` 로 준다.
- `size`·색 prop 은 없다. 크기와 모양은 `Input`·`Select` 가 정한다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 필수 칸인데 `optional` 을 켠다 | 빈 값 선택지가 생겨 비워 둔 채 저장할 수 있게 된다. 필수 칸은 끈다 |
| `ariaLabel` 을 빼고 `aria-label` 을 쓴다 | prop 이름은 `ariaLabel` |
| 후보가 늘 있는 칸에 쓴다 | [Select](select.md) 를 쓴다 |
| 조회 후 목록이 바뀐 뒤 값이 사라질까 걱정해 값을 직접 끼운다 | 지금 값은 컴포넌트가 선택지 앞에 남긴다 |

## 실제 사용 예

- `src/frontend/m-mcm/widget-types/query-number/editor.tsx`: 라벨·값·단위 필드 고르기(단위는 `optional`).
- `src/frontend/m-mcm/widget-types/query-chart/editor.tsx`: 가로축 필드 고르기.
