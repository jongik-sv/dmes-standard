# SegmentedControl

2~6개의 짧은 선택지(일·주·월, 제품군, 목록 필터) 중 하나를 붙어 있는 버튼 줄로 골라 보기를 바꿀 때 쓴다.

- import: `import { SegmentedControl, type SegmentedControlProps, type SegmentedControlOption } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/SegmentedControl.tsx`
- 내부 구현: Mantine `SegmentedControl` (`size="xs"`, `color="dmes"`, 칸 사이 구분선, 움직임 없음). 루트는 `role="radiogroup"`, 칸은 라디오 입력이다

## 언제 쓰나

- 쓴다: 카드·화면 머리의 보기 전환(기간 일·주·월), 목록 필터(전체·안읽음·결재…), 표시 범위(제품군 전체·냉연·도금·컬러).
- 쓰지 않는다: 저장할 폼 입력 항목 → [Radio](radio.md). 선택지가 많거나 길다 → [Select](select.md). 화면 영역 전환 → [Tabs](tabs.md).

## 표준 사용

```tsx
import { useState } from "react";
import { SegmentedControl } from "@dk-oasis/shared/form";

const PERIODS = [
  { value: "Q", label: "분기" },
  { value: "M", label: "월" },
  { value: "D", label: "일" },
];

export function PeriodSwitch() {
  const [period, setPeriod] = useState("M");
  return <SegmentedControl value={period} onChange={setPeriod} options={PERIODS} ariaLabel="기간" />;
}
```

선택지 `options` 는 모듈 상수로 둔다. 문자열 배열이면 값과 글자가 같다.

## 변형

### 폭 채우기

카드 도구 줄처럼 좁은 곳에서 칸을 고르게 나누려면 `fullWidth` 를 준다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| value | `string` | 필수 | 선택한 값 |
| onChange | `(value: string) => void` | - | 다른 칸을 골랐을 때 |
| options | `SegmentedControlOption[]` (`string \| { value, label, disabled? }`) | 필수 | 선택지 |
| ariaLabel | `string` | - | 묶음 이름(화면 읽기 프로그램) |
| disabled | `boolean` | `false` | 전체 비활성 |
| fullWidth | `boolean` | `false` | 부모 폭 채우기 |
| name | `string` | 자동 | 라디오 묶음 name |
| className | `string` | `""` | 루트 클래스(`form-segmented` 은 늘 붙는다) |
| style | `CSSProperties` | - | 루트 스타일(배치 용도) |
| testId | `string` | - | 루트 `data-testid` |

## 표준값: 모든 화면 동일

- `size`·`color`·`radius` 는 래퍼가 정한다(이 컴포넌트에는 그 prop 이 없다).
- 선택 값은 화면이 `useState` 로 소유한다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 저장 대상 폼 항목에 쓴다 | `Radio` 를 쓴다(폼 검증·라벨 연결이 그쪽에 있다) |
| `onChange` 값을 바로 좁은 타입 상태에 넣는다 | `setFilter(v as Filter)` 처럼 좁힌다 |
| 선택지 7개 이상·긴 문구 | 줄이 넘친다. `Select` 를 쓴다 |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/page.tsx`: 인사말 줄 제품군 선택(지금은 표시만).
- `src/frontend/m-mcm/page-components/home/NotificationCard.tsx`: 알림 종류 필터(`fullWidth`, 카드 `toolbar`).
