# PageLayout

화면 제목, 상단 버튼(조회·신규·저장·삭제·엑셀), 본문, 하단 화면 ID 를 한 틀로 묶고 버튼 권한(RBAC)과 F8 조회 단축키를 처리할 때 쓴다.

- import: `import { PageLayout, type PageButton, type PageLayoutProps } from "@dk-oasis/shared/layout";`
- 소스: `src/frontend/shared/src/layout/PageLayout.tsx`
- 내부 구현: Mantine `Group`·`Title`·`Button` (화면은 Mantine 을 직접 import 하지 않는다)

## 언제 쓰나

- 쓴다: MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)의 모든 업무 화면 최상위 틀.
- 쓴다: 상단 버튼을 권한(objId·action)으로 통제해야 하는 화면.
- 쓰지 않는다: m-mdm 화면 → 대신 `MdmPageLayout`(`@/shell`, m-mdm 전용).
- 쓰지 않는다: 팝업 안의 버튼 → [Button](button.md)을 `Modal` footer 에 둔다.

## 표준 사용

```tsx
import { PageLayout, type PageButton } from "@dk-oasis/shared/layout";

const buttons: PageButton[] = [
  { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: () => void handleSearch(), disabled: isBusy },
  { id: "btn_new", label: "신규", action: "save", onClick: handleNew, disabled: isBusy },
  { id: "btn_save", label: "저장", type: "save", action: "save", onClick: () => void handleSave(), disabled: isBusy || !form },
  { id: "btn_delete", label: "삭제", action: "delete", onClick: () => void handleDelete(), disabled: isBusy || !selectedRow },
  { id: "btn_export", label: "엑셀", action: "export", onClick: handleExport, disabled: isBusy },
];

<PageLayout title="검사 결과 관리" breadcrumb="품질 > 검사 결과 관리" screenId={SCREEN_ID} objId={SCREEN_ID} buttons={buttons}>
  {/* SearchArea, ContentBody */}
</PageLayout>
```

버튼은 JSX 가 아니라 `PageButton` 객체 배열로 넘긴다. 순서는 조회, 신규, 저장, 삭제, 엑셀이고 화면에 필요한 것만 남긴다. `type` 은 `primary`·`save` 만 명시하고 나머지는 생략한다(`"light"` 를 적지 않는다). 위 예는 상세형(조회+상세) 화면이다.

## 변형

### 저장형(그리드 편집) 화면

저장형 화면에는 상단 삭제 버튼을 두지 않는다. 행 삭제는 `GridPanel` 머리의 "행삭제"(확인창 후 삭제 표시) 다음 저장으로 처리한다([GridPanel](grid-panel.md)). 저장은 변경이 있을 때만 켠다. 상세형 화면은 선택된 행이 있을 때만 켠다.

```tsx
{ id: "btn_save", label: "저장", type: "save", action: "save", onClick: () => void grid.handleSave(), disabled: isBusy || !grid.hasChanges }
```

### 팝업을 여는 버튼의 권한

팝업 안의 실행 버튼이 아니라 팝업을 여는 상단 버튼은 팝업의 OBJECT_ID 로 판정한다. 버튼에 `objId` 를 따로 준다.

```tsx
{ id: "btn_pick", label: "품목 선택", action: "search", objId: "itemPickPopup", emitSearch: false, onClick: () => setPickOpen(true) }
```

## Props

PageLayoutProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `string` | 필수 | 화면 제목. |
| buttons | `PageButton[]` | `[]` | 상단 버튼 배열. |
| objId | `string` | 없음 | 화면의 보안객체 ID. 지정하면 버튼 RBAC 판정을 켠다. |
| breadcrumb | `string` | 없음 | 하단 왼쪽 경로 문구. |
| screenId | `string` | 없음 | 하단 오른쪽 화면 ID. 없으면 탭 컨텍스트의 pageId 를 쓴다. |
| className | `string` | `""` | 추가 클래스. |
| children | `React.ReactNode` | 필수 | 본문. |

PageButton

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| id | `string` | 필수 | 버튼 ID(`btn_search` 등). |
| label | `string` | 필수 | 버튼 문구. |
| onClick | `() => void` | 필수 | 클릭 핸들러. |
| type | `"primary" \| "save" \| "close" \| "light" \| "cancel"` | 생략 시 light | 모양. `primary` 는 F8 대상. `close` 는 렌더되지 않는다. |
| disabled | `boolean` | 없음 | 명시 비활성. RBAC 비활성과 OR 로 합쳐진다. |
| action | `StandardActionCode \| (string & {})` | 없음 | RBAC 액션 코드(소문자). |
| objId | `string` | 페이지 objId | 이 버튼만 다른 보안객체로 판정할 때. |
| emitSearch | `boolean` | `action === "search"` | 클릭 시 최근 검색값 저장 이벤트를 낼지 여부. |
| resetsSearch | `boolean` | `id === "btn_reset"` | 조회 조건 초기화 버튼인가. true 면 onClick 직후 조회 기본값 초기화 이벤트를 내어 SearchArea 가 사용자 기본값을 다시 넣는다(「마지막 조회값」 칸 제외). onClick 은 조건을 동기로 비워야 한다. 확인 창 뒤처럼 비동기로 비우는 화면은 false 로 두고, 비운 뒤 직접 `emitSearchReset(pageId)` 를 부른다. |

StandardActionCode: `search` `save` `delete` `export` `import` `print` `approve` `reject` `confirm` `cancel` `copy`. 이 타입은 `layout` 서브패스로 재노출되지 않으므로 코드는 문자열 리터럴로 쓴다.

## 동작

- RBAC: 페이지 `objId` 가 있고 버튼에 `action` 이 없으면 그 버튼은 자동 비활성이다(보안 기본값). `objId` 가 없는 화면은 모든 버튼이 정상 노출된다.
- 권한이 없어 꺼진 버튼에는 "권한이 없습니다" 툴팁이 붙는다.
- F8: `type: "primary"` 이면서 비활성이 아닌 첫 버튼을 누른다. 모달이 열려 있거나 화면이 숨겨져 있으면 동작하지 않는다.
- `action: "search"` 버튼은 클릭과 F8 모두 최근 검색값 저장 이벤트를 먼저 낸다. 액션 코드가 `searchMtrl` 처럼 다르면 `emitSearch: true` 를 명시한다.

## 표준값: 모든 화면 동일

- id·label: 조회 `btn_search`/"조회", 신규 `btn_new`/"신규", 저장 `btn_save`/"저장", 삭제 `btn_delete`/"삭제", 엑셀 `btn_export`/"엑셀". 업무명을 붙이지 않는다("단위 등록" 대신 "신규").
- type: 조회 `primary`, 저장 `save` 만 명시하고 나머지는 생략한다.
- action: 조회 `search`, 신규 `save`, 저장 `save`, 삭제 `delete`, 엑셀 `export`.
- `screenId`·`objId` 에는 같은 값 `SCREEN_ID`(화면 ID 상수)를 준다. `breadcrumb` 은 "<메뉴 그룹> > <화면명>".
- 처리 중에는 `disabled: isBusy` 를 준다. 처리 중 상태 변수 이름은 목록 로딩·저장 모두 `isBusy` 하나로 통일한다.
- 삭제: 상세형 화면의 상단 "삭제"는 선택한 1건을 확인 후 서버에서 바로 지운다. 저장형 화면에는 상단 삭제를 두지 않는다.
- 행추가·행삭제·행복사는 상단 버튼이 아니라 `GridPanel` 머리에 둔다([GridPanel](grid-panel.md) 표준값).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `objId` 를 주고 버튼에 `action` 을 빠뜨린다 | 버튼이 영구 비활성이 된다. 모든 버튼에 `action` 을 준다. |
| 삭제 버튼에 `action: "save"` 를 쓴다 | 삭제 권한이 따로 있으므로 `action: "delete"` 로 둔다. |
| `type: "close"` 버튼을 넣는다 | 상단에 렌더되지 않는다. 닫기는 팝업 footer 에서 처리한다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:209` 조회·신규·저장·삭제 버튼과 `objId`. 단, 삭제의 `action` 이 `"save"` 이고 "게시중지" 버튼이 추가되어 있어 표준과 다르다.
- `src/frontend/m-mqc/src/sample/SampleInspectionPanel.tsx:35` 버튼 없는 최소 틀(`title`, `breadcrumb`만).
- m-mdm 화면은 `MdmPageLayout` 을 쓰므로 이 컴포넌트의 예가 아니다.
