# CronInput

반복 일정을 crontab 5칸 식(`분 시 일 월 요일`)으로 입력받을 때 쓴다. 「쉬운 설정」(반복 종류별 칸)과 「직접 입력」(다섯 칸)을 전환하고, 만들어진 식 한 줄·자주 쓰는 식 칩·일정 설명·다음 예정을 함께 보인다. 값은 늘 5칸 식 한 줄이다.

- import: `import { CronInput, type CronInputProps, type CronPreview, describeCron, validateCron } from "@dk-oasis/shared/cron-input";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/cron-input/` (`CronInput.tsx` 본체, `CronEasyEditor.tsx`·`CronDirectEditor.tsx` 두 입력 방식, `cron.ts` 순수 함수)
- 내부 구현: 자체 구현. 모드 전환은 form `SegmentedControl`, 칸은 form `Input`·`Select`·`Checkbox`·`Button`, 식 복사는 [CopyTextButton](button.md).
- Part B 허용 목록(§1): `cron-input` SHOULD.
- 순수 함수(같은 import 경로): `parseCron`·`validateCron(expr, minGapMin?)`·`describeCron`·`runTimes`·`buildCron`·`toEasy`·`DEFAULT_EASY`·`CRON_PRESETS`·`formatWithDow`·`validateFieldText`.

## 언제 쓰나

- 쓴다: 예약 작업처럼 반복 일정을 식으로 정하는 화면.
- 쓰지 않는다: 날짜·기간 하나를 고르는 입력 → [date-picker](date-picker.md)·[date-time-picker](date-time-picker.md).
- 설명·다음 예정·최종 검사는 서버가 계산하는 값이 정본이다. 브라우저 계산(`cron.ts`)은 입력하는 동안 곧바로 오류를 보이기 위한 것이고, 시간대는 브라우저 시간대를 쓴다(서버 미리보기가 Asia/Seoul 정본).
- 쉬운 설정이 식을 만들 수 없는 상태(요일을 하나도 고르지 않음 등)면 `onChange("")` 로 빈 글자를 올린다. 화면은 빈 값을 저장 불가로 취급해 저장 버튼을 막는다.
- 쉬운 설정으로 나타낼 수 없는 식(`0 0 1 1 *` 등)을 받으면 직접 입력으로 열고 안내 문구를 보인다.
- `value` 가 바깥에서 바뀌면(다른 작업을 고름 등) 입력 방식과 칸을 처음부터 다시 연다.
- `data-testid`: `cron-mode`(입력 방식 전환)·`cron-expression`(만들어진 식)·`cron-error`·`cron-mode-notice`.

## 표준 사용

```tsx
import { useCallback, useState } from "react";
import { CronInput, type CronPreview } from "@dk-oasis/shared/cron-input";

// 화면이 서버 cronPreview 를 부르고 결과를 preview 로 돌려준다.
export function ScheduleField({ value, onChange, kind }: { value: string; onChange: (v: string) => void; kind: string }) {
  const [preview, setPreview] = useState<CronPreview | null>(null);
  const requestPreview = useCallback(async (expr: string) => {
    setPreview(await jobSchedApi.cronPreview({ expr, jobKind: kind }));
  }, [kind]);
  return (
    <CronInput
      value={value}
      onChange={(v) => { setPreview(null); onChange(v); }}
      minGapMin={kind === "COLLECT" ? 5 : undefined}
      preview={preview}
      onRequestPreview={requestPreview}
    />
  );
}
```

`onRequestPreview` 는 올바른 식이 400ms 멈추면 불린다. 식이 바뀌면 이전 `preview` 를 비워 다른 식의 설명이 남지 않게 한다.

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `value` | `string` | — | crontab 5칸 식. 비어 있으면 아직 정하지 않은 상태 |
| `onChange` | `(value: string) => void` | — | 식이 바뀔 때. 쉬운 설정이 만들 수 없으면 `""` |
| `disabled` | `boolean` | `false` | 모든 입력을 막는다 |
| `minGapMin` | `number` | — | 실행 간격 하한(분). 더 짧은 식은 오류(수집 작업 5분·환율 60분) |
| `preview` | `CronPreview \| null` | — | 서버가 계산한 `{ valid, error?, desc?, next?, minGapMin? }`. 없으면 브라우저 계산을 보인다. `valid:false` 면 `error` 를 오류로 보인다 |
| `onRequestPreview` | `(expr: string) => void` | — | 올바른 식이 400ms 멈추면 부른다 |
| `previewCount` | `number` | `5` | 보일 다음 예정 개수 |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| Spring 6칸 식(`0 0 2 * * *`)을 넣음 | 5칸만 받는다. `?`·`L`·`W`·`#` 도 거절한다 |
| 일과 요일을 함께 제한한 식(`0 9 1 * 1`) | crontab 은 둘을 OR 로 읽는다. 이 입력은 거절하니 둘 중 하나를 `*` 로 둔다 |
| 서버 미리보기를 받지 않고 브라우저 계산만 믿음 | `onRequestPreview` 로 서버 `cronPreview` 를 불러 `preview` 에 넣는다 |
| 식이 바뀌어도 이전 `preview` 를 그대로 둠 | `onChange` 에서 `preview` 를 비운다 |
| 빈 값(`""`)도 저장함 | 쉬운 설정이 만들 수 없을 때 빈 글자가 올라온다. 저장 검증에서 막는다 |
