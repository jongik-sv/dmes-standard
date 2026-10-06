# MES 화면 표준 골격

MES 화면(`m-mpp`·`m-mqc`·`m-mls`·`m-mcm` 등)을 누가 만들어도, 어떤 LLM 이 만들어도 같은 모습이 나오도록 화면 유형별 골격과 고정값을 정한다. 컴포넌트 하나하나의 사용법은 [components/llms.txt](components/llms.txt) 색인에서 찾는다.

**사용 순서:** ① 아래 표에서 화면 유형을 고른다. ② 해당 예제 폴더를 그대로 복사해 이름과 열만 바꾼다. ③ 예제에 없는 요소는 §공통 고정값과 컴포넌트 문서를 따른다. 예제와 이 문서가 정하지 않은 모양을 새로 만들지 않는다.

## 화면 유형

| 유형 | 모습 | 예제 (타입 검사 통과본) |
|---|---|---|
| A. 조회 | 조회조건 + 목록 그리드 1개 | B 예제에서 상세 패널과 신규·저장·삭제 버튼을 뺀다 |
| B. 조회 + 상세 | 왼쪽 목록, 오른쪽 라벨-값 상세 폼. 1건씩 저장·삭제 | [examples/list-detail/](examples/list-detail/page.tsx) |
| C. 그리드 편집 저장형 | 그리드에서 바로 행추가·셀 편집·행삭제 후 일괄 저장 | [examples/grid-edit/](examples/grid-edit/page.tsx) |
| D. 마스터-디테일 | 위 마스터 그리드, 아래 디테일 그리드(상하 분할) | [examples/master-detail/](examples/master-detail/page.tsx) |
| E. 등록 팝업 | 상단 [신규] 로 여는 입력 모달 | [examples/master-detail/RegisterModal.tsx](examples/master-detail/RegisterModal.tsx) |

**모든 유형에 §성능 기본 구조가 붙는다.** 첫 조회 상한, 상세 폼 분리, 안정 참조 열 정의는 예제가 이미 그 모양이므로 복사해 쓰면 지켜진다. 규칙과 근거는 [화면 성능 가이드](../../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) 가 정본이다.

여러 유형이 섞이면 섞인 그대로 조합한다(예: C 의 그리드 + E 의 팝업). 예제는 `references/examples/` 에 있고, 바꾸면 §예제 검증으로 다시 확인한다.

## 공통 고정값

### 파일과 import

- 화면 코드는 `page.tsx`(화면) + `api.ts`(호출·body 변환) + `types.ts`(타입·옵션 상수) 셋으로 나누고, 팝업은 같은 폴더의 `<이름>Modal.tsx` 로 둔다(MES 실례: `m-mls/pages/lsh/noticeMgmt/`). 파일 위치·tsup 엔트리·포털 등록은 UI 규칙이 아니므로 [Frontend 표준 01](../../../../docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md) §2-3 과 RULE.md 를 따른다.
- import 순서: `react` → `@dk-oasis/shared/layout` → `grid` → `form` → `modal` → `message-provider` → `utils` → `./api` → `./types`. 화면은 `@mantine/*`·`ag-grid-*` 를 import 하지 않는다.
- `export default function <ScreenId>Page()`. 맨 위에 `"use client";` 와 한 줄 설명 주석.
- `const SCREEN_ID = "<screenId>";` 를 두고 `PageLayout` 의 `screenId`·`objId` 에 같은 값을 준다.
- 요청·응답 body 형식은 UI 규칙이 아니다. `oasis-contract-check` 스킬과 `noticeMgmt/api.ts` 를 따른다.

### 상단 버튼 (`PageLayout buttons`)

`PageButton` 객체 배열이다(JSX 아님). 필요한 것만 남기되 순서는 바꾸지 않는다.

| 순서 | id | label | type | action | 비활성 조건 |
|---|---|---|---|---|---|
| 1 | `btn_search` | 조회 | `primary` | `search` | `isBusy` |
| 2 | `btn_new` | 신규 | (생략) | `save` | `isBusy` |
| 3 | `btn_save` | 저장 | `save` | `save` | `isBusy \|\| !form` (B) · `isBusy \|\| !grid.hasChanges` (C) |
| 4 | `btn_delete` | 삭제 | (생략) | `delete` | `isBusy \|\| !selected` |
| 5 | `btn_export` | 엑셀 | (생략) | `export` | `isBusy` |

- label 에 업무명을 붙이지 않는다("단위 등록" 이 아니라 "신규"). 업무 고유 버튼은 5번 뒤에 `btn_<동사>` 로 붙인다.
- `type` 은 `primary`·`save` 만 적는다. F8 은 비활성이 아닌 첫 `primary` 버튼을 누른다.
- `objId` 를 주면 `action` 이 없는 버튼은 권한 검사에서 영구 비활성이 된다. 모든 버튼에 `action` 을 준다.
- C 유형은 상단에 신규·삭제를 두지 않는다. 행추가는 `GridPanel showAddButton`(라벨 "행추가" 그대로)이 그리드 머리에 만든다. 행삭제는 `showDeleteButton` 대신 `GridPanel buttons` 에 확인창을 거치는 버튼 `{ id: "btn_grid_delete", label: "행삭제", onClick: confirmDeleteRow, disabled: grid.selectedRowKey == null }` 를 넣고, 확인하면 `grid.handleDeleteRow()` 를 부른다(내장 행삭제는 확인창을 끼울 수 없고 삭제 표시 행을 맨 뒤로 옮긴다). 요구서에 "상단 행추가·삭제"가 있어도 이 위치를 지킨다.
- 처리 중 상태는 `isBusy` 하나로 쓴다. 마스터-디테일의 디테일 로딩만 `isDetailBusy` 를 따로 둔다.

### 조회조건

- `<SearchArea onSearch={…}>` 로 감싼다(Enter 조회). `onSearch` 를 빠뜨리지 않는다.
- 텍스트: `<SearchField label="품번" value onChange />`. 선택: `type="select"` + 첫 옵션 `{ value: "", label: "전체" }`.
- 기간: SearchField 두 개, 두 번째 `label="~"`. SearchArea 가 한 칸으로 묶는다. `div`·`span`·`className="span-2"` 로 직접 묶지 않는다.
- 기간 기본값은 오늘-7일 ~ 오늘이다: `formatDateStr(addDays(today(), -7))`, `formatDateStr(today())` (`@dk-oasis/shared/utils`). `today()`·`addDays()` 는 `yyyyMMdd` 를 돌려주므로 `formatDateStr` 로 `yyyy-MM-dd` 로 바꾼다. `formatDate` 는 UTC 로 계산해 하루가 밀릴 수 있으니 쓰지 않는다.
- 필수 조회조건이 없으면 진입 시 1회 자동 조회한다(`useEffect(() => { void handleSearch(); }, [])`). 단, 첫 조회에는 반드시 상한을 건다(§성능 기본 구조). 상한 없는 전체 조회를 진입 자동 조회로 두지 않는다. 자동 조회가 있는 화면은 진행 중인 같은 조건 요청을 다시 보내지 않는다(가이드 R4).

### 본문 배치

| 배치 | 코드 |
|---|---|
| 단일 | `<ContentBody root><ContentPanel>…</ContentPanel></ContentBody>` |
| 좌우 (B) | `<ContentBody root resizable storageKey=…>` + `<ContentPanel>`(목록) + `<ContentPanel width={460}>`(상세 폼) |
| 상하 (D) | `<ContentBody root direction="column" resizable storageKey=…>` + `<ContentPanel>`(마스터) + `<ContentPanel height="40%">`(디테일) |

- `storageKey` 는 `<모듈코드>.<그룹 폴더>.<screenId>` 다(예: `m-mls/pages/lsh/noticeMgmt` → `mls.lsh.noticeMgmt`).
- 오른쪽 상세 패널의 첫 자식은 바로 상세 표다. 제목·머리를 따로 만들지 않는다.
- 패널 안을 `<div style={{ display: "flex", … }}>` 로 다시 감싸지 않는다. 높이와 스크롤은 `ContentPanel`·`GridPanel` 이 맡는다.

### 목록 그리드

- 모든 목록은 `<GridPanel title="<목록명>" count={n}>` 안의 `<AgDataGrid>` 다. 작은 목록(팝업·카드 안)은 `height="auto"`.
- 열 정의는 컴포넌트 밖 상수 `const COLUMNS: GridColumn[]`. 열이 화면 state 에 의존해야 하면 `useMemo` 로 만들고 deps 에는 폼 객체가 아니라 안정값(불리언·고정 콜백)만 둔다(가이드 R12).
- 목록이 상한으로 잘릴 수 있으면 `GridPanel titleExtra` 에 `GridLimitNotice` 를 둔다(§성능 기본 구조).
- 표준 props: `rowKey` `columns` `data` `columnSizing` `highlightedRowKey` `onRowClick` `loading`. `emptyMessage`·`loadingMessage` 는 주지 않는다(기본 문구로 통일).
- `columnSizing`: 열 8개 이하 `"fit"`, 9개 이상 `"fixed"`(가로 스크롤). 소스 기본값은 `"auto"` 다.
- 컬럼 개인화(순서·너비·표시 여부·고정·정렬 저장)는 기본 켬이라 따로 줄 것이 없다. 한 화면(탭)에 그리드가 둘 이상이면(§B 좌우·§D 마스터-디테일·모달 안 그리드 포함) 그리드마다 다른 고정 `gridId`(예: `"master"`·`"detail"`·`"modal-user"`)를 쓴다. 서버 페이징 목록은 `personalize={{ sort: false }}` 를 준다([AgDataGrid](components/ag-data-grid.md) §컬럼 개인화).

| 열 종류 | width | align | 그 밖 |
|---|---|---|---|
| 코드·번호·ID | 120 | left | |
| 명칭 | 180 | left | |
| 날짜 | 100 | center | 값은 `yyyy-MM-dd` |
| 수량·금액 | 100 | right | `type: "number"` |
| 상태·여부 | 80 | center | `render` 에서 `GridBadge` |
| 비고·제목(남는 폭) | 큰 가중치(예: `100`) + `minWidth`(예: `180`) | left | 남는 폭. **폭을 생략하지 않는다** |

- `"fit"` 에서 `width` 는 픽셀이 아니라 **비율 가중치**다(위 표의 값은 그 비율). 폭을 생략하면 가중치 1 이 되어 최소 50px 까지 줄어, 남는 폭을 가져가기는커녕 가장 좁아진다. 남는 폭을 줄 열은 큰 가중치와 `minWidth` 를 함께 준다.
- 목록이 좁은 배치(좌우 분할의 왼쪽 목록 등)에서는 짧은 열에 가중치 `1` + 내용 폭만큼의 `minWidth`(배지 2자 ≈ 52, 4자 ≈ 74, 칸 좌우 여백 8px 포함)를 주어 그 폭에 머물게 하고, 남는 폭 열 하나만 큰 가중치를 준다. `minWidth` 합이 목록 폭을 넘으면 가로 스크롤이 생기므로, 기본 배치의 목록 폭 안에 들도록 열을 줄인다(예: `m-mls/pages/lsh/noticeMgmt` — `minWidth` 합 574. 목록·상세 50:50 이라 1300px 포털에서는 목록이 약 520px 로 조금 가로 스크롤한다).

### 배지 색 (`GridBadge`)

| 의미 | props |
|---|---|
| 완료·사용·OK·합격 | `bg="var(--color-success-soft)" color="var(--color-success)"` |
| 진행·정보 | `bg="var(--color-primary-soft)" color="var(--color-primary)"` |
| 보류·경고 | `bg="var(--color-warning-soft)" color="var(--color-warning)"` |
| NG·불합격·오류 | `bg="var(--color-danger-soft)" color="var(--color-danger)"` |
| 대기·미사용·비활성 | `muted` |

- 행 전체를 칠할 때(NG 행 등)는 `getRowClassExtra={(r) => (r.judge === "NG" ? "ag-row-error" : undefined)}`. `ag-row-error` 는 shared `grid.css` 에 있으므로 화면 CSS 를 만들지 않는다. 편집으로 판정이 바뀔 수 있으면 `rowClassRefreshToken` 에 판정 집합(예: NG 행 키를 이은 문자열)을 넘긴다.
- 셀만 칠할 때는 `cellClassRules` 에 `cell-light-pink`(오류)·`cell-warning`·`cell-edited`·`cell-emphasis`.
- 한 변 컬러 바, 16진수 색, 화면 CSS 의 색 값은 쓰지 않는다.

### 상세 폼

- `DETAIL_TABLE_STYLE`·`DETAIL_LABEL_CELL`·`DETAIL_VALUE_CELL`(`@dk-oasis/shared/layout`)로 `<table><tbody><tr><th/><td/></tr></tbody></table>` 를 만든다. `<thead>` 는 없다.
- 필수 항목은 라벨 끝에 ` *`. 입력은 form 래퍼만 쓴다(`Input`·`Select`·`DatePicker`·`Textarea`·`Radio`·`Checkbox`·`ComboBox`).
- 상세 폼은 화면 루트가 아니라 **별도 컴포넌트**(`<이름>DetailPane.tsx`)에 둔다. 입력 state 는 그 안에만 있다(§성능 기본 구조).
- 선택된 행이 없으면 모든 입력을 `disabled`. 수정 시 키 항목은 `readOnly` + `disabled`.
- 안내 문구용 `<p style>` 를 넣지 않는다. 선택 전 상태는 비활성 폼으로 충분하다.
- `FormGroup` 은 쓰지 않는다.
- 입력이 MDM 컬럼 사전의 칸과 맞으면(물리명 같음) 라벨은 th 안의 `<MdmFieldLabel name="TITLE" label="제목" required />`(캡션 + 올리면 MDM 컬럼·도메인 툴팁), 값 검사는 훅으로 잇는다: `useMdmColumn` 의 `column` 으로 `validateMdmValue(column, value)`(또는 `useMdmValidation().validateValue` — 받아 둔 메타만 쓰고 요청하지 않으므로 칸은 `useMdmColumn` 으로 등록해 둔다) → `Input error`, 저장 전 `validateRow`, 서버 거부는 `toFieldErrors`. 서버가 검사하는 칸(`MdmValidator.columns`)과 같게 둔다. 자세한 모양은 [mdm-meta](components/mdm-meta.md) §상세 표.

### 메시지

`const { showMessage } = useMessage();` (`@dk-oasis/shared/message-provider`). 문구는 아래 표 그대로 쓴다.

| 상황 | 호출 |
|---|---|
| 조회 성공 | 표시하지 않는다(0건은 그리드가 알려 준다) |
| 저장 성공 | `showMessage({ message: "저장되었습니다.", alertType: "success", toast: true })` |
| 삭제 성공 | `showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true })` |
| 입력 누락 | `showMessage({ message: "<항목>을(를) 입력하세요.", alertType: "warning" })`. 여러 개면 처음 누락된 항목 하나만 알린다 |
| 값 범위 오류 | `showMessage({ message: "<항목>은(는) <조건>이어야 합니다.", alertType: "warning" })` (예: "불량수량은 검사수량 이하여야 합니다.") |
| 기간 역전 | `showMessage({ message: "시작일이 종료일보다 늦을 수 없습니다.", alertType: "warning" })` |
| 행삭제 확인 (C) | 삭제 확인과 같은 문구. `onConfirm: grid.handleDeleteRow` |
| 오류 | `showMessage({ title: "오류", message: <e.message>, alertType: "error" })` |
| 삭제 확인 | `showMessage({ title: "확인", message: "선택한 행을 삭제하시겠습니까?", alertType: "confirm", onConfirm })` |
| 변경 중 조회 | `showMessage({ title: "확인", message: "저장하지 않은 변경이 있습니다. 조회하시겠습니까?", alertType: "confirm", onConfirm })` |

- `alert`·`window.confirm`·`console.error` 를 쓰지 않는다. 새 화면은 `ErrorModal` 대신 `showMessage` 로 오류를 띄운다.
- `useApiCall` 의 `successMessage` 는 토스트가 아니라 모달로 뜬다. 쓰지 않는다.

### 팝업·엑셀·아이콘

- 팝업: `Modal`(`@dk-oasis/shared/modal`) `size="md"`, `footer` 는 `<Button onClick={onClose}>취소</Button>` 다음에 `<Button variant="primary">저장</Button>`(실행 문구는 동작 그대로). 내용은 상세 폼 표 규칙 그대로.
- 엑셀: 그리드는 「그리드 설정」 메뉴(`GridPanel` 안은 머리줄, 밖은 그리드 머리글 줄 오른쪽 끝의 작은 아이콘)에 「엑셀 출력」 이 기본으로 있어 화면에 보이는 그대로의 내려받기에는 단추를 만들지 않는다(Pagination 으로 한 쪽만 들고 있으면 `GridPanel serverPaged`). 권한 검사가 붙은 업무 엑셀 단추, 서버 전체 조회, 가공 값 내리기는 그대로 `exportToExcel(rows, "<화면명>_" + today() + ".xlsx", "Sheet1", excelColumns.map(({ key, header }) => ({ key, header: header ?? key })))` (`@dk-oasis/shared/utils`). `excelColumns = useResolvedGridColumns(COLUMNS)`(`@dk-oasis/shared/grid`) — `header` 를 생략한 열도 그리드와 같은 MDM 캡션으로 나간다.
- 아이콘: `@tabler/icons-react` 만, `size={14}`(촘촘한 곳 12), `stroke`·색은 주지 않는다. m-mpp·m-mqc·m-mls 는 이 패키지를 아직 선언하지 않아 import 하면 타입 검사가 실패한다. 아이콘이 꼭 필요하면 사용자 확인 후 모듈 `package.json` 에 추가한다([icons](components/icons.md)).

### 스타일

- 래퍼에 `size`·`radius`·`color` 를 주지 않는다. 화면 CSS 파일을 만들지 않는다.
- 인라인 `style` 은 shared 가 제공하는 `DETAIL_*` 상수만 쓴다. 필요한 모양이 없으면 화면에서 만들지 말고 사용자에게 알린다(shared 확장 대상).

## 성능 기본 구조

새 화면이 처음부터 느려지지 않게 하는 구조다. 세 가지 모두 예제([list-detail](examples/list-detail/page.tsx))가 이미 그 모양이다. 근거 수치와 점검표는 [화면 성능 가이드](../../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) 의 「새 화면 만들 때 하지 말 것」 표와 §7 이다.

| 항목 | 기본 구조 | 가이드 |
|---|---|---|
| 첫 조회 상한 | 조건 없는 첫 조회는 `limit` 을 보낸다(`FIRST_SEARCH_LIMIT = 1000`). 응답의 `totalCount` 를 받아 `GridPanel titleExtra` 에 `<GridLimitNotice shownCount totalCount onShowAll />` 을 둔다. [전체 보기] 는 `limit` 없이 다시 조회한다. 조건이 있는 조회도 예상 건수·응답 크기를 설계서에 적는다. m-mdm 은 `@/oasis-screen` 의 `FIRST_SEARCH_LIMIT` 을 쓰고, 다른 모듈 예제는 `types.ts` 에 같은 상수를 둔다. 서버가 `limit`·`totalCount` 를 지원해야 한다 | R1 |
| 상세 폼 분리 | 폼 입력 state 는 `<이름>DetailPane` 컴포넌트에만 둔다. 저장 단추가 화면 루트(`PageLayout buttons`)에 있으므로 루트는 `ref` 핸들(`load(form \| null)`·`getForm()`, 일부 칸만 바꾸면 `apply({ patch, ... })`)로 폼과 대화한다. React 19 이므로 `ref` 를 prop 으로 받는다. 루트에는 폼 값을 두지 않고 단추 활성용 불리언·모드만 둔다 | R12 |
| 안정 참조 열 정의 | `COLUMNS` 는 모듈 상수. state 가 필요하면 `useMemo` 와 안정 deps(`hasForm` 같은 불리언·고정 콜백)만 쓴다. `useMemo(() => [...], [form])` 처럼 폼 객체를 deps 에 넣지 않는다. 목록 `loading` 은 목록 조회 전용 state 로 켠다 | R5·R12 |

```tsx
// 상세 폼: 입력 state 는 여기만 있다. 한 글자 입력은 이 컴포넌트만 다시 그린다.
export type EquipDetailHandle = { load(form: EquipForm | null): void; getForm(): EquipForm | null };
export function EquipDetailPane({ ref, busy, isNew }: { ref: Ref<EquipDetailHandle>; busy: boolean; isNew: boolean }) {
  const [form, setForm] = useState<EquipForm | null>(null);
  useImperativeHandle(ref, () => ({ load: setForm, getForm: () => form }), [form]);
  ...
}
// 화면 루트: 폼 값을 갖지 않는다. 행 선택·신규·조회 때 load, 저장 때 getForm.
const detailRef = useRef<EquipDetailHandle>(null);
const handleSave = async () => { const form = detailRef.current?.getForm(); ... };
<EquipDetailPane ref={detailRef} busy={isBusy} isNew={isNew} />
```

그 밖에 지킬 것: `fetch("/api/auth/me")` 를 직접 부르지 않고(`getCurrentUser()`), 권한 훅 `useUserButtonRbac()` 는 화면 루트 한 곳에서만 쓴다(R9). 0건이어도 그리드를 언마운트하지 않는다(R6). 행 클릭·입력마다 `onSnapshotChange` 를 부르지 않는다(R8). 같은 값이면 `setState` 하지 않는다(R7). 홈 위젯·`WidgetWorkspace` 를 다루면 [widget.md §성능 규칙](components/widget.md#성능-규칙)(R13~R16: 진입 조회 한 번·표시 연동 타이머·호스트 목록 재사용·스토어 필드 훅)도 따른다.

## 유형별 메모

### §A 조회

B 예제에서 오른쪽 `ContentPanel`·상세 상태·신규/저장/삭제 버튼을 지운다. `ContentBody` 는 `root` 만 남기고 `resizable`·`storageKey` 를 뺀다(분할이 없으므로).

### §B 조회 + 상세

- 행 클릭 → `detailRef.current.load(폼값)`. [신규] → `selected=""` + `load(빈 폼)`. [저장] → `getForm()` 으로 읽어 신규면 C, 아니면 U. 루트가 아는 것은 저장 단추 활성용 `mode`(none·new·edit)뿐이다. [삭제] → 확인 후 서버에서 바로 삭제하고 다시 조회.

### §C 그리드 편집 저장형

- 행 상태(추가·수정·삭제)는 `useGridDataManager` 가 관리한다(Part B §6). 화면에서 행 상태 배경을 칠하지 않는다.
- **알려진 shared 결함:** `AgDataGrid` 는 `nativeeditor_status` 중 `deleted`(취소선 배경)만 칠한다. 추가·수정 배경(`ag-row-inserted`·`ag-row-modified`)은 옛 `useRowStateManager` 의 `_rowState` 일 때만 칠해져, 이 훅을 쓰면 추가·수정 행이 구분되지 않는다(UI-Visual-Standard §7 과 어긋남). 화면에서 `getRowClassExtra` 로 메우지 말고 shared 수정을 기다린다.
- 연결은 예제 그대로다: `GridPanel` 에 `showAddButton`·`buttons`(행삭제 확인창 버튼)·`data`·`rowKey`·`columns`·`selectedRowKey`·`defaultRowValues`·`onDataChange={grid.handleGridDataChange}`, `AgDataGrid` 에 `highlightedRowKey`·`scrollToRow`·`onRowClick={(r) => grid.handleRowClick(getRowIdentifier(r, ROW_KEY))}`.
- 키 열은 새 행에서만 편집한다: `editable: (row) => isTempRow(row)`.
- 저장 실패는 훅이 `saveError` 에 담기만 한다. 화면이 `useEffect` 로 `showMessage({ …, callback: dismissSaveError })` 를 띄운다.
- 저장 성공 후에는 다시 조회한다(`onSaveSuccess`).
- **셀 편집:** `onCellValueChanged={(p) => { if (p.rowKey === grid.selectedRowKey) grid.handleFormChange(p.field, p.newValue); }}`. 훅의 `handleFormChange` 는 선택된 행만 갱신한다. 그래서 행을 클릭(선택)한 뒤 편집하는 흐름에서만 상태가 바뀐다. Tab 으로 다른 행 셀까지 이어서 편집하면 그 행은 수정 상태가 되지 않는다. 화면에서 우회 코드를 만들지 말고, 필요하면 shared 확장(`useGridDataManager` 에 행 키를 받는 셀 변경 함수 추가)을 사용자에게 제안한다.

### §D 마스터-디테일

- 마스터 행 클릭 → 디테일 조회. 디테일 로딩은 `isDetailBusy` 로 따로 표시한다. 마스터를 다시 조회하면 디테일을 비운다.
- 디테일도 편집·저장한다면 디테일 쪽을 §C 로 만든다.

### §E 등록 팝업

- 부모는 `open` 상태와 `onRegistered`(다시 조회)만 가진다. 폼 상태·검증·저장 호출은 팝업 안에 둔다.
- 열 때마다 빈 폼으로 초기화한다(`useEffect([open])`).

## 결정 기록

정책 문서와 실제 코드가 갈리거나 정해진 값이 없던 곳에서 아래처럼 정했다. 바꾸려면 이 표와 예제를 함께 고친다.

| 항목 | 갈린 내용 | 정한 값 | 근거 |
|---|---|---|---|
| 메시지 훅 | Part B §9 는 `useGfnMessage` MUST 였고, 화면은 `useMessage` 14·`ErrorModal` 15·`useGfnMessage` 0 | `useMessage().showMessage` (Part B §9 도 2026-10-01 같은 내용으로 정정) | UI-Visual-Standard §8 이 둘 다 허용, 객체 인자가 위치 인자보다 오용이 적음, 다수 사용 |
| 저장형 행 상태 | Part B §6 MUST 이나 사용 화면 0 | `useGridDataManager` | 정책 MUST |
| 상세 폼 | `FormGroup` 0, `DETAIL_TABLE_STYLE` 21 | `DETAIL_*` 표 | 다수 사용 |
| 상세 패널 폭 | 360·380·440·460 | 460 | 표준값. `noticeMgmt` 는 본문 편집기가 넓어야 해 사용자 요청으로 50:50(2026-10-02 예외) |
| 기간 조회조건 | `label="~"` 쌍 / `span-2` 안 인라인 묶음 | `label="~"` 쌍 | 인라인 스타일 없이 SearchArea 가 배치 |
| 행추가·행삭제 위치 | 상단 버튼 / 그리드 머리 | `GridPanel` 머리. 행삭제는 확인창 버튼(`buttons`) | 래퍼 내장 행추가. 내장 행삭제는 확인창이 없어 개선 후 시험에서 상단으로 새는 일이 있었다 |
| 빈 목록·로딩 문구 | 화면마다 다름 | 래퍼 기본값 | 문구 통일 |
| 상단 버튼 라벨 | "단위 등록" 등 업무명 포함 | 신규·저장·삭제·엑셀 | 화면 간 동일 |
| fit 의 남는 폭 열 | 표는 "(생략) 남는 폭" 이었으나 fit 에서 생략하면 가중치 1 로 가장 좁아짐(noticeMgmt 제목 열 실측, 2026-10-02) | 큰 가중치 + `minWidth`, 좁은 목록은 짧은 열 가중치 1 + `minWidth` | `AgDataGrid` 소스(fit: `flex = width ?? 1`, `minWidth = col.minWidth ?? width ?? 50`) |

## 예제 검증

예제를 고치면 타입 검사와 audit 를 다시 돌린다. 화면을 새로 만들거나 고친 뒤에는 화면 성능 가이드 §7 점검표와 `A audit <바꾼 파일·폴더>` 도 돌린다.

```bash
python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py check-examples
```
