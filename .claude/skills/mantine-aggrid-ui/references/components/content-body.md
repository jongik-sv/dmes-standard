# ContentBody

화면 본문을 좌우 또는 상하 패널로 나누고, 필요하면 드래그로 크기를 조절하고 패널을 최대화할 때 쓴다. 패널 하나는 ContentPanel 로 만든다.

- import: `import { ContentBody, ContentPanel, MaxHandle } from "@dk-oasis/shared/layout";`
- 소스: `src/frontend/shared/src/layout/ContentBody.tsx`, `src/frontend/shared/src/layout/ContentPanel.tsx`, `src/frontend/shared/src/layout/MaxHandle.tsx`
- 내부 구현: Mantine `Paper`(ContentPanel). ContentBody 는 일반 `div` + flex

## 언제 쓰나

- 쓴다: [PageLayout](page-layout.md) 안의 본문 루트(`root` 하나).
- 쓴다: 목록 + 상세 폼 좌우 분할, 목록 + 하단 패널 상하 분할.
- 쓰지 않는다: 상세 폼의 라벨-값 표 → [detail-form](detail-form.md). 패널 안쪽에 그것을 둔다.

## 표준 사용

```tsx
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

// 좌우 분할: 왼쪽 목록은 남는 폭, 오른쪽 상세 폼은 460px. 오른쪽 패널의 첫 자식이 곧바로 상세 표다.
<ContentBody root resizable storageKey="mls.lsh.noticeMgmt">
  <ContentPanel>{/* GridPanel + AgDataGrid */}</ContentPanel>
  <ContentPanel width={460}>{/* 상세 폼 */}</ContentPanel>
</ContentBody>
```

## 변형

### 상하 분할

```tsx
<ContentBody root direction="column" resizable storageKey="mls.lsh.noticeMgmt">
  <ContentPanel>{/* 목록 */}</ContentPanel>
  <ContentPanel height={280}>{/* 하단 패널 */}</ContentPanel>
</ContentBody>
```

### 패널 최대화

`ContentPanel` 에 `panelId` 를 주고 머리(GridPanel 의 `headerExtra` 등)에 `MaxHandle` 을 둔다. 최대화하면 같은 ContentBody 의 다른 패널은 숨겨지고 분할 막대도 사라진다.

```tsx
<ContentPanel panelId="list">
  <GridPanel title="목록" headerExtra={<MaxHandle panelId="list" />}>{/* ... */}</GridPanel>
</ContentPanel>
```

### 크기 규칙

- `resizable` 이 아닐 때: `width` 가 있으면 고정 폭, 없고 `flex` 가 있으면 그 값, column 에서 `height` 만 있으면 고정 높이, 아무것도 없으면 남는 공간(`1 1 0`)을 나눠 갖는다.
- `resizable` 일 때: 주축 크기(row 는 `width`, column 은 `height`)가 숫자면 px, `"40%"` 같은 문자열이면 %, 없으면 `flex` 비율이다. 창이 줄면 `minSize` 까지 줄어든다.
- 크기 조절 중 막대 더블클릭은 양옆 패널을 기본 크기로 되돌리고, 막대에 포커스를 두고 방향키를 누르면 10px 씩 움직인다.

## Props

ContentBodyProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| children | `React.ReactNode` | 필수 | ContentPanel·중첩 ContentBody. |
| root | `boolean` | 없음 | 본문 루트 표시. 화면에 하나만 둔다. |
| direction | `"row" \| "column"` | `"row"` | 분할 방향. |
| resizable | `boolean` | 없음 | 패널 사이에 드래그 막대를 넣는다. |
| storageKey | `string` | 없음 | 조절한 크기를 사용자별로 저장하는 키. 없으면 저장하지 않는다. |
| flex | `string \| number` | 없음 | 부모 ContentBody 안에 중첩될 때의 크기. |
| width | `string \| number` | 없음 | 위와 같음. |
| height | `string \| number` | 없음 | 위와 같음. |
| minSize | `number` | row 200 / column 120 | resizable 부모 안에서의 최소 주축 크기(px). |

ContentPanelProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| children | `React.ReactNode` | 필수 | 패널 내용. |
| panelId | `string` | 없음 | 최대화 대상 ID. `MaxHandle` 의 `panelId` 와 같아야 한다. |
| flex | `string \| number` | 없음 | 비율 크기. |
| width | `string \| number` | 없음 | 고정 폭(숫자는 px). |
| height | `string \| number` | 없음 | 고정 높이(숫자는 px). |
| minSize | `number` | row 200 / column 120 | 최소 주축 크기(px). |

MaxHandleProps: `panelId: string`(필수), `style?: React.CSSProperties`, `className?: string`. `useContentMaximize()` 는 `{ maximizedId, setMaximizedId, isMaximized(id), toggle(id) }` 를 돌려준다.

## 표준값: 모든 화면 동일

- storageKey 는 `<모듈코드>.<pages 아래 그룹 폴더>.<screenId>` 이다. `m-mls/pages/lsh/noticeMgmt` 는 `mls.lsh.noticeMgmt` 다. 화면마다 고유해야 한다.
- 좌우 분할의 상세 폼 폭은 `width={460}` 이고 그 패널의 첫 자식이 곧바로 상세 표다(머리·제목을 따로 두지 않는다).
- 패널 안을 `display: flex` 인 `div` 로 다시 감싸지 않는다. ContentPanel·GridPanel 이 높이와 스크롤을 처리한다.
- `root` 는 화면당 하나다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 같은 `storageKey` 를 두 화면이 쓴다 | 저장 크기가 섞인다. 화면 경로로 고유하게 만든다. |
| 패널 대신 `div` 를 막대 사이에 둔다 | 막대는 ContentPanel·ContentBody 사이에만 생긴다. 패널로 감싼다. |
| `panelId` 를 주고 `MaxHandle` 의 id 를 다르게 쓴다 | 두 값을 같은 상수로 쓴다. |
| 패널에 `minSize` 보다 큰 고정 폭 두 개를 둔다 | 좁은 창에서 줄어들 수 있으므로 한쪽은 폭을 생략해 남는 폭을 받게 한다. |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx` `root resizable storageKey="mls.lsh.noticeMgmt"` + `ContentPanel minSize={320}`(목록) + `ContentPanel minSize={420}`(상세). 사용자 요청으로 상세 폭을 고정하지 않고 목록·상세를 50:50 으로 나눈다(표준 460 의 예외). 상세 패널 안은 세로 flex 스크롤 영역 하나이고, 본문 편집기가 남은 높이를 채운다(Local-Rules §23). 홈 표시 미리보기는 팝업이다.
- `src/frontend/m-mdm/pages/dme/ruleMng/page.tsx:225` `root resizable storageKey="mdm.dme.ruleMng"`.
- `src/frontend/m-mdm/pages/dme/ruleSetEdit/page.tsx:664` column 분할 + 중첩 ContentBody(`flex`, `minSize`).
- `src/frontend/m-mcm/page-components/cmb/masterRuleFrame/page.tsx:344` `panelId`. `MaxHandle` 연결 예는 `src/frontend/m-design-dummy/src/screens/ResizableLayoutCatalogScreen.tsx:194`(디자인 더미 화면).
