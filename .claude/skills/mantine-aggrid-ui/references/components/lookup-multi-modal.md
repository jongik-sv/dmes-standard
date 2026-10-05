# LookupMultiModal

검색어로 찾아 여러 개(사람·부서 등 `{ code, name }`)를 한 번에 골라 넘길 때 쓰는 팝업이다. 결과 목록에서 체크하고, 고른 것은 아래 칩으로 보이며 × 로 뺀다.

- import: `import { LookupMultiModal, type LookupMultiRow, type LookupMultiModalProps } from "@dk-oasis/shared/lookup";` (CSS import 없음, 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/lookup/LookupMultiModal.tsx`
- 내부 구현: shared `Modal`·`Button` + Mantine `TextInput`·`Checkbox`. 그리드(AgDataGrid)·페이지 나누기는 없다. 결과는 한 번에 받은 목록을 그대로 보인다
- Part B 허용 목록(§1)에 `lookup` 서브패스가 없다. 사용 전 확인이 필요한 항목이다(ASK). 위젯 탭 공유 창(2026-10-05)이 첫 사용처라 2026-10-05 등록했다.

## 언제 쓰나

- 쓴다: 받는 사람 여러 명, 대상 부서 여러 개처럼 검색해서 몇 개를 모아 한 번에 넘길 때. 결과가 수십 건 안쪽(서버가 최대 N건)일 때.
- 쓰지 않는다: 한 행만 골라 입력 칸에 채울 때 → [LookupModal](lookup.md). 결과가 많아 페이지·여러 열이 필요할 때 → [modal](modal.md) 안에 [AgDataGrid](ag-data-grid.md)(체크 선택)를 직접 둔다. 고정된 짧은 목록 → [multi-select-combo-box](multi-select-combo-box.md).

## 표준 사용

```tsx
import { useCallback, useState } from "react";
import { LookupMultiModal, type LookupMultiRow } from "@dk-oasis/shared/lookup";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { searchUsers, sendTo } from "./api"; // (keyword) => Promise<{ userId; userNm; deptNm }[]>, (ids) => Promise<void>

export function SendButton({ selfUserId }: { selfUserId: string }) {
  const { showMessage } = useMessage();
  const [open, setOpen] = useState(false);

  const search = useCallback(
    async (keyword: string): Promise<LookupMultiRow[]> =>
      (await searchUsers(keyword)).map((u) => ({ code: u.userId, name: u.userNm, detail: u.deptNm })),
    []
  );

  // 닫기는 호출자가 한다 — 실패하면 던져서 창과 고른 것을 그대로 둔다.
  const confirm = useCallback(
    async (rows: LookupMultiRow[]) => {
      try {
        await sendTo(rows.map((r) => r.code));
      } catch (e) {
        showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });
        throw e;
      }
      showMessage({ message: `${rows.length}명에게 보냈습니다.`, alertType: "success", toast: true });
      setOpen(false);
    },
    [showMessage]
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>보내기</button>
      <LookupMultiModal
        open={open}
        title="받는 사람"
        search={search}
        onConfirm={confirm}
        onClose={() => setOpen(false)}
        minKeywordLength={2}
        maxSelect={10}
        excludeCodes={[selfUserId]}
        confirmLabel="보내기"
      />
    </>
  );
}
```

검색은 [조회] 또는 Enter 로만 한다(입력마다 부르지 않는다). 늦게 온 응답은 버리고 마지막 검색만 보인다. 열릴 때마다 검색어·결과·고른 것을 비운다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| open | `boolean` | 필수 | 열림 |
| title | `string` | 필수 | 창 제목 |
| search | `(keyword: string) => Promise<LookupMultiRow[]>` | 필수 | 앞뒤 공백을 지운 검색어로 부른다. 실패는 Error(message) 로 던지면 목록 아래 빨간 문구로 보인다 |
| onConfirm | `(rows: LookupMultiRow[]) => void \| Promise<void>` | 필수 | [확인] — 고른 순서대로. 스스로 닫지 않는다. Promise 면 끝날 때까지 단추를 막고, 던지면 고른 것을 둔다 |
| onClose | `() => void` | 필수 | 취소·× 단추·Escape·바깥 누름(처리 중에는 막힌다) |
| maxSelect | `number` | 제한 없음 | 닿으면 고르지 않은 행의 체크가 막힌다. 「고른 항목 n/max」 로 보인다 |
| minKeywordLength | `number` | `1` | 이보다 짧으면 부르지 않고 「n자 이상 입력해 주세요.」 |
| excludeCodes | `readonly string[]` | - | 결과에서 뺄 code(로그인 사용자 등) |
| placeholder | `string` | `"검색어 입력"` | 검색 칸 안내 |
| confirmLabel | `string` | `"확인"` | [확인] 글. 고르면 `보내기 (2)` 처럼 개수를 붙인다 |
| description | `ReactNode` | - | 검색 칸 위 안내 문단 |
| testId | `string` | - | 본문 `data-testid` |

`LookupMultiRow`: `code: string`(필수, 고유), `name: string`(필수), `detail?: string`(이름 옆 작은 글, 부서명 등).

## 표준값: 모든 화면 동일

- 사람 검색은 `minKeywordLength={2}` 로 둔다(서버도 2자 미만을 거절한다).
- 서버가 결과 건수를 자른다(예: 최대 20건). 이 팝업은 페이지를 나누지 않는다.
- 단추·검색 칸 시험 선택자는 `data-action="lookup-multi-search"`·`data-action="lookup-multi-confirm"`, 결과 행은 `[data-code="<code>"]`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| [확인] 뒤 창이 닫힐 거라 기대한다 | `onConfirm` 안에서 일을 마친 뒤 호출자가 `open` 을 내린다 |
| 실패를 삼키고 닫는다 | 알린 뒤 던지면 고른 것을 그대로 두고 다시 보낼 수 있다 |
| MantineProvider 밖(시험 등)에서 닫힌 상태로 늘 마운트한다 | Mantine 이 Provider 없이 던진다. 열 때만 조건부로 마운트하거나 Provider 안에 둔다 |
| 결과가 수백 건인 목록에 쓴다 | 페이지·여러 열이 필요하면 Modal + AgDataGrid 로 만든다 |

## 실제 사용 예

- `src/frontend/shared/src/widget/WidgetShareDialog.tsx`: 위젯 탭 공유 — 받는 사람 검색(2자)·최대 10명·본인 제외·[보내기], 결과 알림·닫기는 작업 공간이 한다(첫 사용처, 표준과 같다).
