# 메시지 (useMessage · useGfnMessage · MessageProvider · useApiCall · ErrorModal)

저장·삭제 결과 토스트, 입력 검증 경고, 삭제 확인, 오류 모달 같은 사용자 메시지를 모든 화면에서 같은 방식으로 띄울 때 쓴다.

- import: `import { useMessage, useGfnMessage, MessageProvider } from "@dk-oasis/shared/message-provider";` / `import { useApiCall, type ApiCallOptions } from "@dk-oasis/shared/use-api-call";` / `import { ErrorModal } from "@dk-oasis/shared/layout";`
- 소스: `src/frontend/shared/src/components/message-provider.tsx`, `src/frontend/shared/src/hooks/use-api-call.ts`, `src/frontend/shared/src/layout/ErrorModal.tsx`
- 내부 구현: 모달은 shared `MessageModal`, 토스트는 Mantine `notifications`. `MessageProvider` 는 호스트의 `DmesUiProvider`(`src/frontend/shared/src/ui-provider/index.tsx:26`)가 이미 감싸므로 화면은 직접 감싸지 않는다

## 언제 쓰나

- 쓴다: 모든 사용자 메시지. 화면은 `const { showMessage } = useMessage();` 를 쓴다. 객체 인자라 위치 인자인 `useGfnMessage` 보다 명확하다.
- 쓴다: 오류 자동 표시가 필요한 API 호출에 한해 `useApiCall`.
- 쓰지 않는다: `alert`·`window.confirm`·`console.error`·자작 토스트. `ErrorModal` 은 기존 화면 유지용이며 새 화면은 `showMessage` 를 쓴다.
- 팝업 창 자체는 [modal](modal.md).

## 표준 사용

```tsx
import { useMessage } from "@dk-oasis/shared/message-provider";

export function useUnitMessages() {
  const { showMessage } = useMessage();
  return {
    saved: () => showMessage({ message: "저장되었습니다.", alertType: "success", toast: true }),
    failed: (e: unknown) =>
      showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" }),
    confirmDelete: (doDelete: () => Promise<void>) =>
      showMessage({
        title: "확인",
        message: "선택한 행을 삭제하시겠습니까?",
        alertType: "confirm",
        onConfirm: () => void doDelete(),
      }),
  };
}
```

## 변형

### useGfnMessage (위치 인자)

기존 화면 호환용이다. `gfn_message(문구, {0} 치환값, 기본문구, 유형, 제목, 확인 콜백, 취소 콜백)` 순서다. 유형에 `"toast"` 를 주면 토스트(info)로 뜬다. 문구의 `{0}` 은 첫 번째 한 곳만 바뀌고 `/n` 은 줄바꿈이 된다. 새 화면은 `showMessage` 를 쓴다.

### useApiCall

`apiCall(() => 호출, 옵션)` 이 오류를 모달(error)로 자동 표시하고 `undefined` 를 돌려준다. 오류 자동 표시가 필요할 때만 쓰고, `successMessage` 는 쓰지 않는다(아래 함정).

```tsx
const apiCall = useApiCall();
const rows = await apiCall(() => searchUnits(), { errorPrefix: "조회 실패: " });
if (rows) setRows(rows);
```

### ErrorModal (기존 화면 유지용)

`message` 가 문자열이면 "오류" 모달이 열리고 `null` 이면 닫힌다. 확인 버튼과 복사 버튼이 있다.

```tsx
<ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />
```

## 메시지 문구

| 상황 | 호출 |
|---|---|
| 조회 결과 | 토스트 없음. 0건이면 그리드의 안내 문구가 알려 준다 |
| 저장 성공 | `showMessage({ message: "저장되었습니다.", alertType: "success", toast: true })` |
| 삭제 성공 | `showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true })` |
| 오류 | `showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" })` (모달) |
| 입력 검증 실패 | `showMessage({ message: "<항목>을(를) 입력하세요.", alertType: "warning" })` |
| 삭제 확인 | `showMessage({ title: "확인", message: "선택한 행을 삭제하시겠습니까?", alertType: "confirm", onConfirm: () => void doDelete() })` |
| 변경 중 조회 확인 | `"저장하지 않은 변경이 있습니다. 조회하시겠습니까?"` 를 같은 confirm 형태로 |

## Props

`showMessage(params: ShowMessageParams)`

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| message | `string` | 필수 | 본문(문자열만) |
| title | `string` | 모달은 "알림", confirm 은 "확인" | 제목. 토스트에서는 제목 줄이 된다 |
| alertType | `"info" \| "warning" \| "error" \| "success" \| "confirm"` | `"info"` | 유형 |
| toast | `boolean` | - | 참이면 확인이 필요 없는 토스트. confirm 은 무시되고 모달이 뜬다 |
| toastDuration | `number` | `3000` | 토스트 자동 닫힘(ms) |
| onConfirm | `() => void` | - | confirm 의 확인 |
| onCancel | `() => void` | - | confirm 의 취소·닫기 |
| callback | `() => void` | - | confirm 이 아닌 모달을 닫을 때(토스트는 닫힐 때) 호출 |

`useApiCall()` 이 돌려주는 함수는 `<T>(fn: () => Promise<T>, opts?: ApiCallOptions) => Promise<T | undefined>` 다.

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| successMessage | `string` | - | 성공 시 표시. 토스트가 아니라 info 모달로 뜬다 |
| errorPrefix | `string` | - | 오류 문구 앞에 붙일 접두어 |
| suppressError | `boolean` | - | 참이면 오류를 표시하지 않는다 |
| rethrow | `boolean` | - | 참이면 오류를 다시 던진다 |

`ErrorModal` props: `message: string | null`(필수), `onClose: () => void`(필수).

## 표준값: 모든 화면 동일

- 위 "메시지 문구" 표의 문구·유형을 그대로 쓴다. 성공 토스트는 `alertType: "success"` + `toast: true`, 오류는 모달이다.
- 삭제 확인의 title 은 "확인", 오류의 title 은 "오류".
- `useApiCall` 의 `successMessage` 는 쓰지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `useApiCall` 의 `successMessage` 로 성공 토스트를 기대한다 | JSDoc 은 "토스트"라 하지만 내부가 `gfn_message(문구)` 를 유형 없이 불러 info 모달이 뜬다. 확인을 눌러야 닫힌다. 성공 토스트는 `showMessage({ …, toast: true })` 로 직접 띄운다 |
| 오류에 `toast: true` 를 준다 | 오류는 모달이다. 사용자가 읽고 확인해야 한다 |
| confirm 에 `toast: true` 를 준다 | 무시된다(선택이 필요하므로 모달) |
| 모달을 연 직후 다른 `showMessage` 를 또 부른다 | 모달은 한 번에 하나만 있어 뒤 호출이 앞 모달을 덮는다. 앞 모달의 콜백도 사라진다. 토스트는 영향이 없다 |
| `message` 에 JSX 를 넘긴다 | `showMessage` 는 문자열만 받는다 |
| `alert`·`window.confirm`·`console.error` 를 쓴다 | `showMessage` 로 바꾼다 |
| 새 화면에 `ErrorModal` 과 `errorMessage` 상태를 만든다 | `showMessage({ alertType: "error" })` 로 바꾼다 |
| 새 화면에서 `useGfnMessage` 위치 인자로 메시지를 띄운다 | `showMessage` 객체 인자를 쓴다(Part B §9). `useGfnMessage` 는 기존 화면 호환용이다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmb/headerMng/page.tsx:157-161`: confirm 의 `onConfirm` 형태(`title: "확인"`). 표준과 같다.
- `src/frontend/m-mdm/pages/dmb/headerMng/page.tsx:138-142`, `src/frontend/m-mdm/pages/dme/ruleConfirm/page.tsx:275`: 성공 토스트. 단, `alertType: "info"` 이고 문구가 "저장했습니다."·"확정했습니다"라 표준("저장되었습니다.", `success`)과 다름.
- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:58`, `:89`: `ErrorModal` 용 `errorMessage` 상태를 쓴다. 단, 새 화면 표준(`showMessage`)과 다름.
- `src/frontend/m-mcm/page-components/cmz/masterCodeUploadFilePopup/masterCodeUploadFilePopup.tsx:168`: `useGfnMessage` 사용(기존 화면).
- `useApiCall`·`MessageModal` 직접 사용은 아직 사용처 없음.
