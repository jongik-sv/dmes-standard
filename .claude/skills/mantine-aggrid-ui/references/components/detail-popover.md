# DetailPopover

정보 아이콘(또는 감싼 글자)을 누르면 팝업에 가까운 큰 패널(제목·닫기·내부 스크롤)을 그 자리에 여는 상세 팝오버다. 툴팁에 담기 어려운 긴 설명(HTML 본문, 라벨-값 표)을 화면 이동 없이 보여 줄 때 쓴다.

- import: `import { DetailPopover, computeDetailPopoverPosition, type DetailPopoverProps } from "@dk-oasis/shared/detail-popover";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/detail-popover/DetailPopover.tsx`
- 내부 구현: Mantine `Popover` 를 쓰지 않는 자체 구현이다. 패널은 `document.body` 로 portal 하고 `position: fixed` 로 트리거 아래(공간이 모자라면 위)에 놓는다 → 그리드 셀·모달 본문의 overflow 에 잘리지 않는다. Mantine `Transition` 의 비동기 마운트가 없어 테스트에서 열자마자 동기 조회가 된다(`FormGroup` 툴팁과 같은 판단). 아이콘은 `@tabler/icons-react`.
- Part B 허용 목록(§1): `detail-popover` SHOULD.

## 언제 쓰나

- 쓴다: 그리드 셀·열 머리·상세 패널 안의 식별자(컬럼 물리명, 코드 ID 등) 옆에서 그 대상의 상세(정의·도메인·설명 HTML)를 크게 보여 줄 때. 열 때 조회하는 컴포넌트를 `content` 에 넣으면 열릴 때만 마운트된다.
- 쓰지 않는다: 한두 줄 도움말 → `title` 속성, 폼 라벨 도움말은 [FormGroup](form-group.md) `tip`. 입력·저장이 있는 대화 → [Modal](modal.md). 그리드 열 전체 설명 → [GridPanel](grid-panel.md) `help`.
- 닫힘: 닫기 단추, Esc, 패널·트리거 밖을 누를 때. 한 번에 하나만 열린다(다른 트리거를 누르면 앞의 것은 바깥 누름으로 닫힌다).
- 그리드 안에서 안전하다: 트리거의 click·dblclick·mousedown·Enter/Space 키를 **네이티브 단계에서** 끊어 ag-grid 의 행 선택·더블클릭·셀 편집 시작·열 끌기로 번지지 않는다. 패널은 portal 이라 React 트리로 트리거의 조상(머리 `onClick` 등)까지 올라가므로 패널의 React 이벤트도 끊는다.
- 모달 안에서: 포커스가 패널 안에 있으면 Esc 는 팝오버만 닫고 모달은 닫지 않는다(패널 안 요소에 `data-mantine-stop-propagation` 을 단다 — Mantine Select 드롭다운과 같은 약속). 팝오버가 닫힌 뒤의 Esc 는 모달을 닫는다.
- 층: z-index 9000 — Mantine 모달(200) 위, `MessageModal`(10000) 아래.

## 표준 사용

```tsx
import { DetailPopover } from "@dk-oasis/shared/detail-popover";

// 정보 아이콘 트리거(기본) — 본문은 열릴 때만 마운트된다.
<DetailPopover title={`코드 정보 · ${codeId}`} triggerLabel={`${codeId} 코드 정보`} content={<CodeInfoCard codeId={codeId} />} />

// 글자 트리거 — 감싼 글자가 점선 밑줄 링크처럼 보인다.
<DetailPopover title="용어 설명" content={<NoticeBodyView value={html} format="HTML" />}>
  {termName}
</DetailPopover>
```

그리드 셀에서는 `GridColumn.render` 로 글자 옆에 아이콘을 둔다. 칸이 좁으면 글자만 말줄임되게 글자 쪽에 `minWidth: 0; overflow: hidden; textOverflow: ellipsis` 를 준다(m-mdm `ColumnPhysName` 이 이 모양이다).

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `content` | `ReactNode` | — | 패널 본문. 열린 동안만 마운트 |
| `title` | `ReactNode` | — | 패널 제목(한 줄, 넘치면 말줄임) |
| `headerExtra` | `ReactNode` | — | 제목 줄 오른쪽(닫기 단추 앞) 요소. 예: `CopyTextButton` |
| `children` | `ReactNode` | 정보 아이콘 | 트리거 내용. `<button>` 안에 들어가므로 단추·링크를 넣지 않는다 |
| `triggerLabel` | `string` | `"상세 보기"` | 트리거 `aria-label`·`title`. 제목이 없으면 패널 이름으로도 쓴다 |
| `width` | `number` | `520` | 패널 폭(px). 화면이 좁으면 화면 폭 − 16px 로 줄어든다 |
| `maxHeight` | `number` | `560` | 패널 최대 높이(px). 넘치면 본문이 안에서 스크롤한다. 화면 공간이 모자라면 더 줄어든다(최소 160) |
| `opened` | `boolean` | — | 제어 모드 열림 상태 |
| `onOpenChange` | `(opened: boolean) => void` | — | 열림 상태가 바뀔 때(제어·비제어 모두 호출) |
| `disabled` | `boolean` | `false` | 트리거를 끈다 |
| `className` | `string` | — | 트리거 단추에 더할 클래스 |
| `testId` | `string` | `"detail-popover"` | `data-testid` 접두 — `<testId>-trigger`·`-panel`·`-body`·`-close` |

`computeDetailPopoverPosition(rect, viewport, size)` — 패널 자리 계산(트리거 아래, 공간이 모자라고 위가 넓으면 위, 좌우는 화면 안). 컴포넌트가 내부에서 쓰며 단위 테스트용으로 내보낸다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 Mantine `Popover`·`HoverCard` 를 직접 씀 | 이 컴포넌트를 쓴다(화면은 Mantine 을 import 하지 않는다) |
| 그리드 셀 트리거에 React `onClick={e => e.stopPropagation()}` 만 걸어 행 선택을 막으려 함 | 소용없다(ag-grid 는 네이티브 리스너). 이 컴포넌트가 네이티브 단계에서 끊는다 |
| 열기 전에 상세를 미리 조회함 | `content` 에 조회 컴포넌트를 넣는다 — 열릴 때 마운트되어 한 번 조회한다. 같은 대상의 재조회는 화면 쪽 캐시로 막는다 |
| `children` 에 `<Button>` 이나 `<a>` 를 넣음 | 트리거가 이미 단추다. 글자·아이콘만 넣는다 |
| 패널 안 HTML 설명을 `dangerouslySetInnerHTML` 로 넣음 | [NoticeBodyView](notice-body-view.md) `format="HTML"`(DOMPurify 소독) |
