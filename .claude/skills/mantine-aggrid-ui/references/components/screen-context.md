# 화면 문맥 (screen-context · usePublishScreenContext · useScreenContext · useScreenApplyHandler · useScreenApply)

업무 화면이 가진 값(그리드 선택 행·폼 입력값)을 업무 화면 위 도구 창(위젯 도크)의 위젯이 자동으로 받고, 반대로 위젯이 계산한 값을 업무 화면에 넣을 때 쓰는 공통 통로다. 탭마다 한 건을 보관하고 도크에는 활성 탭의 것만 보인다.

- import: `import { usePublishScreenContext, useScreenContext, useScreenContextPublisher, useScreenApplyHandler, useScreenApply, findScreenContextValue, normalizeScreenKey, normalizeScreenContextValues, screenKeysMatch, screenContextEqual, screenContextKey, toScreenContextValue, screenContextStore, screenApplyStore, type ScreenContext, type ScreenContextValue, type ScreenApply, type ScreenApplyHandler, type ScreenApplyResult } from "@dk-oasis/shared/screen-context";` (CSS import 없음)
- 소스: `src/frontend/shared/src/screen-context/`(`types.ts`·`normalize-key.ts`·`store.ts`·`apply-store.ts`·`hooks.ts`), 그리드 연결 `components/grid/useGridScreenContext.ts`, 도크 연결 `widget-dock/WidgetDockLayer.tsx`
- 저장소(`screenContextStore`·`screenApplyStore`)는 `globalThis` 단일 인스턴스다. shared 는 진입점마다 따로 묶여(tsup `splitting: false`) 같은 모듈이 여러 번 들어가므로, 그리드(`grid` 진입점)가 게시한 값을 도크(`portal-shell` 진입점)가 읽으려면 전역 단일 인스턴스여야 한다.

## 언제 쓰나

- 쓴다: 업무 화면 값을 도구 창 위젯(예: 조업 계산기)이 입력 칸에 채워야 할 때, 위젯이 계산한 값을 업무 화면 칸에 넣을 때.
- 그리드는 따로 할 일이 없다. `AgDataGrid`(`GridPanel` 안 포함)가 **선택 행(없으면 포커스 행)** 을 자동 게시한다(기본 켬, `publishScreenContext={false}` 로 끔).
- 쓰지 않는다: 같은 화면 안 컴포넌트끼리 값 주고받기(props·상태로 한다), 화면 사이 이동·전달(`openPortalPage`).

## 계약

```ts
interface ScreenContext {
  source: "grid" | "form" | string;
  tabId: string;               // 포털 탭 id
  pageId: string;              // 화면 id
  values: Record<string, string | number | null>;  // 필드 이름 → 값(게시한 화면의 원래 표기)
  at: number;                  // 게시 시각(epoch ms)
}
```

- 위젯 본체가 받는 것: `WidgetProps.screenContext?: ScreenContext | null`(활성 탭의 문맥, 게시된 것이 없거나 보드면 null)·`WidgetProps.screenApply?: ScreenApply | null`(보드면 null).
- 키 비교는 정규화한다: `findScreenContextValue(ctx?.values, "coilWidth")` 는 `COIL_WIDTH`·`coil_width`·`CoilWidth` 를 같은 키로 본다(대소문자·밑줄·하이픈·공백 무시). 없으면 `undefined`, 있고 비었으면 `null` 이다. 0 과 빈 문자열은 비어 있음이 아니다.
- 그 밖의 도구: `normalizeScreenContextValues(values)`(키를 정규형으로 바꾼 사전, 겹치면 먼저 나온 키), `screenContextEqual(a, b)`(시각 `at` 을 뺀 같은 문맥 판정), `screenContextKey(tabId, pageId)`(저장소 키 = 탭 id, 없으면 pageId).
- 값 변환(`toScreenContextValue`): 숫자·문자열은 그대로, null·NaN 은 null, 불리언은 `"true"`·`"false"`, 날짜는 ISO 문자열이다. 객체·배열은 게시에서 뺀다.

## 화면 → 위젯 (게시)

| 방법 | 쓰는 곳 |
|---|---|
| `AgDataGrid` 자동 게시 | 코드 변경 없음. 선택 행(여럿이면 마지막으로 고른 행), 없으면 포커스 행의 colDef `field` 값을 낸다. 데이터가 새로 오거나 칸 값이 바뀌면 이 그리드가 마지막 게시자일 때만 다시 낸다. 한 화면에 그리드가 여럿이면 마지막으로 행을 고른 그리드가 이긴다. 대화 상자(`role="dialog"`) 안 그리드는 게시하지 않는다 |
| `usePublishScreenContext(values, { source?, enabled? })` | 폼 화면이 직접 낸다. `values` 를 렌더마다 새로 만들어도 내용이 같으면 다시 그리지 않는다. 언마운트(탭 닫힘)하면 거둔다 |
| `useScreenContextPublisher()` | 이벤트마다 명령형으로 낸다(`publish`·`owned`·`clear`·`owner`) |

```tsx
// 폼 화면이 입력값을 도구 창에 알린다.
usePublishScreenContext({ THK: form.thk, COIL_WIDTH: form.width }, { source: "form" });
```

## 위젯 → 화면 (받기)

위젯은 `screenApply?.available` 일 때만 「화면에 넣기」 버튼을 보이고, `await screenApply.apply(values, { label })` 로 보낸다. 결과는 `{ applied: string[], skipped: string[] }` 이다.

화면은 처리기를 등록해 받는다. 활성 탭에 처리기가 없으면 `available` 이 false 이고 `apply` 는 모든 키를 `skipped` 로 돌려준다.

```tsx
useScreenApplyHandler(async (values) => {
  // 키는 normalizeScreenKey 로 비교한다. 넣은 키와 못 넣은 키를 돌려준다.
  return { applied: [...], skipped: [...] };
});
```

그리드는 prop `acceptScreenApply` 로 켠다(**기본 끔** — 데이터를 바꾸므로). 켜면 선택 행(없으면 포커스 행)의 **편집 가능한 열** 중 field 가 맞는 칸에 값을 넣고, 편집 불가·없는 키는 skipped 다. 사용자가 칸을 고친 것과 같은 경로(행 수정 표시·`onCellValueChanged`)를 탄다. 값은 칸의 데이터 형(`cellDataType`, 숫자 편집기 칸은 number)에 맞춰 바꿔 넣고(숫자 문자열→숫자, 숫자→글자, `"true"`·`"false"`→불리언), 바꿀 수 없거나 ag-grid 가 받지 않은 값은 skipped 다. **숨긴 열**·같은 칸을 가리키는 두 번째 키·대화 상자 안 그리드도 skipped 다(게시는 숨긴 열 값도 포함한다). 처리기가 예외를 던지면 저장소가 잡아 모든 키를 skipped 로 돌려준다.

```tsx
<AgDataGrid columns={columns} data={rows} selectable acceptScreenApply onCellValueChanged={handleCellValueChanged} />
```

## 도크 호스트

`WidgetDockLayer` 에 `activeTabId` 를 넘기면(포털 셸이 넘긴다) 활성 탭의 문맥·받기 통로를 위젯 틀(`WidgetFrame` 의 `screenContext`·`screenApply`)로 내려 본체 props 가 된다. 보드는 틀에 넘기지 않아 null 이다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 위젯에서 `ctx.values.COIL_WIDTH` 로 직접 읽음 | 화면마다 키 표기가 달라 못 읽는다. `findScreenContextValue(ctx?.values, "coilWidth")` 로 읽는다 |
| 보드에서도 `screenContext` 가 있다고 가정 | 보드는 null 이다. 없을 때의 입력 칸(빈 값)도 그려야 한다 |
| `screenApply.available` 확인 없이 버튼을 보임 | 받는 화면이 없으면 눌러도 모두 skipped 다. available 일 때만 보이거나 막는다 |
| 모든 그리드에 `acceptScreenApply` 를 켬 | 데이터가 바뀌는 기능이라 입력을 받는 그리드 한 곳에만 켠다(여럿이면 마지막으로 행을 고른 그리드가 받는다) |
| 저장소를 직접 import 해 모듈 변수에 복제 | 전역 단일 인스턴스를 그대로 쓴다. 게시·구독은 훅으로 한다 |
| 그리드 자동 게시를 끄려고 선택 이벤트를 막음 | `publishScreenContext={false}` 만 쓴다 |

## 실제 사용 예

- `tests/unit/grid-screen-context.unit.test.ts`: 그리드 자동 게시·받기.
- `tests/unit/widget-dock-screen-context.unit.test.ts`: 도크 전달.
