# Spinner · LoadingOverlay · ProgressBar

조회·저장이 진행 중임을 보여 줄 때 쓴다. 그리드 목록의 로딩은 AgDataGrid 의 `loading` 이 먼저이고, 이 컴포넌트들은 그 밖의 영역과 긴 작업에 쓴다.

- import: `import { Spinner, LoadingOverlay, ProgressBar } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/Spinner.tsx`, `LoadingOverlay.tsx`, `ProgressBar.tsx`
- 내부 구현: Mantine `Loader`·`Overlay`(Spinner, LoadingOverlay), `Progress`(ProgressBar)

## 언제 쓰나

- 쓴다: 그리드 없는 영역(상세 패널, 카드)이 데이터를 불러오는 동안 → Spinner 또는 LoadingOverlay.
- 쓴다: 패널 전체를 잠시 덮어야 하는 긴 조회·저장 → LoadingOverlay.
- 쓴다: 진행률이 있거나 오래 걸리는 일괄 작업 → ProgressBar.
- 쓰지 않는다: 그리드 목록 조회 중 표시 → 대신 `AgDataGrid` 의 `loading={isBusy}`(`loadingMessage` 는 주지 않는다). 그리드 위에 LoadingOverlay 를 또 얹지 않는다.
- 쓰지 않는다: 버튼 안의 로딩 표시 → 버튼은 `disabled={isBusy}` 로 막는다.

## 표준 사용

```tsx
import { LoadingOverlay, Spinner } from "@dk-oasis/shared/form";

// 영역 로딩: 부모에 position: relative 가 있어야 그 영역만 덮는다.
<div style={{ position: "relative" }}>
  <LoadingOverlay visible={isBusy} />
  {/* 영역 내용 */}
</div>

// 자리 하나를 채우는 단순 로딩
if (!meta) return <Spinner label="정보를 불러오는 중..." />;
```

## 변형

### ProgressBar: 결정형과 비결정형

`value`(0~100)를 주면 채워지는 막대이고, `value` 없이 `status="running"` 이면 움직이는 줄무늬다. `status` 는 `"idle"`·`"running"`·`"completed"`·`"error"` 이며 `idle` 은 기본적으로 그리지 않는다.

```tsx
<ProgressBar status={batchRunning ? "running" : "idle"} label={batchStatus} />
<ProgressBar status="running" value={percent} label="적용 중" />
```

### LoadingOverlay 화면 전체

전역 모달처럼 화면 전체를 막아야 할 때만 `scope="fullscreen"` 을 준다.

```tsx
<LoadingOverlay visible={isBusy} scope="fullscreen" label="처리 중..." />
```

## Props

Spinner

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| size | `number` | `32` | 크기(px). |
| label | `string` | 없음 | 아래 글자. |
| overlay | `boolean` | `false` | 부모를 반투명으로 덮는 모드. |
| color | `string` | `var(--color-primary, #0b62d6)` | 색. 화면에서 주지 않는다. |
| className, style | `string`, `React.CSSProperties` | `""`, 없음 | 배치용. |
| borderWidth, trackColor | `number`, `string` | 무시됨 | 타입에는 있으나 구현이 읽지 않는다. 쓰지 않는다. |

LoadingOverlay

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| visible | `boolean` | 필수 | `true` 일 때 덮는다. `false` 이면 렌더하지 않는다. |
| label | `string` | `"조회 중..."` | 스피너 아래 글자. |
| scope | `"container" \| "fullscreen"` | `"container"` | `container` 는 부모(`position: relative`), `fullscreen` 은 viewport. |
| size | `number` | `48` | 스피너 크기(px). |
| backgroundOpacity | `number` | `0.6` | 배경 투명도. |
| zIndex | `number` | `9999` | 쌓임 순서. |

ProgressBar

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| status | `"idle" \| "running" \| "completed" \| "error"` | `"idle"` | 진행 상태. |
| value | `number` | 없음 | 0~100(범위 밖은 보정). 없으면 비결정형. |
| label | `ReactNode` | 상태별 기본 글자 | 상태 글자. 기본은 대기·실행 중·완료·오류. |
| showPercent | `boolean` | `true` | `value` 가 있을 때 % 표시. |
| hideWhenIdle | `boolean` | `true` | `idle` 이면 그리지 않는다. |
| height | `number` | `8` | 막대 높이(px). |
| color | `string` | 없음 | running 색. 화면에서 주지 않는다. |
| className, style | `string`, `React.CSSProperties` | `""`, 없음 | 배치용. |

## 표준값: 모든 화면 동일

- 로딩 글자는 `"조회 중..."`(조회)을 기본으로 하고 화면마다 새 문구를 만들지 않는다.
- `color`·`backgroundOpacity`·`zIndex`·`height` 를 화면에서 바꾸지 않는다.
- 처리 중 상태 변수는 `isBusy` 하나로 쓴다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 그리드 위에 LoadingOverlay 를 얹는다 | `AgDataGrid loading={isBusy}` 를 쓴다. |
| 부모에 `position: relative` 가 없다 | 오버레이가 더 위의 요소를 덮는다. 부모에 준다. |
| `visible` 이 항상 `true` 라 화면이 막힌다 | `finally` 에서 `isBusy` 를 `false` 로 되돌린다. |
| ProgressBar 가 안 보인다 | 기본 `status="idle"` 은 숨는다. `running` 이나 `hideWhenIdle={false}` 를 준다. |
| Spinner 에 `trackColor`·`borderWidth` 를 준다 | 구현이 무시한다. 지운다. |

## 실제 사용 예

- `src/frontend/m-analog/src/anl/log-viewer/analog-log-viewer.tsx:85` `<Spinner label=… />`.
- `src/frontend/m-mdm/pages/dma/termMng/page.tsx:253` `<ProgressBar status=… label=… hideWhenIdle={false} />`. m-mdm 화면이다.
- LoadingOverlay 는 아직 사용처 없음.
