# 「새 창으로 분리」 때 조회 조건·조회 결과 이어받기 설계 (지시 popout-1)

- 날짜: 2026-10-06 · 레인 popout (회차 grid-personalize-1006) · 브랜치 feat/popout-state (기준 dev e9bb7381)
- 선행 설계: [2026-10-06-portal-tab-popout-design.md](2026-10-06-portal-tab-popout-design.md) §7 후속 과제 F1
- 상태: 설계 검토 요청 (코드 수정 없음)

## 1. 목표

포털 탭 우클릭 「새 창으로 분리」 를 하면 새 창이 원래 탭과 같은 화면을 보여야 한다. 조회 조건, 조회 결과(그리드 행), 선택 행, 스크롤을 재조회 없이 이어받는다(사용자 결정 2026-10-06).

## 2. 크기 추정

| 단계 | 파일 | 대략 줄 수 | 수단 | 시점 |
|---|---|---|---|---|
| 1. 공통 장치 | shared `portal-shell/carry-state.ts`(새), `popout.ts`, `portal-shell.tsx`, `page-window/PortalPageWindow.tsx`, 진입점 `index.ts` | 코드 약 250 · 시험 약 250 | D2 (sonnet/high 구현, opus/high 리뷰 1회) | 승인 즉시 |
| 1. 문서 | mantine-aggrid-ui 공통 부품 문서·색인, FE 가이드 한 절 | 약 80 | D1 (sonnet/medium) | 1 단계와 같이 |
| 1. 파일럿 화면 | m-mcm `cme/masterCodeMngList/page.tsx` | 약 10 | D0 | 1 단계와 같이 |
| 2. 그리드 선택·스크롤 | shared `components/grid/AgDataGrid.tsx`(또는 grid-core-2 가 나눈 파일) | 약 40 · 시험 약 80 | D2 | grid-core-2 머지 뒤 |
| 3. 나머지 화면 적용 | m-mcm·m-mdm·m-mls 의 조회 화면 약 45개(SearchArea 사용 31, 그 밖 목록 화면) | 화면당 5~10 | D4 또는 모듈 레인 배분 | 사용자 판단(§8-1) |

## 3. 조사 결과: 화면을 고치지 않고는 되살릴 수 없다

1. 화면 상태는 모두 화면 자신의 `useState` 에 있다. 예를 들어 `m-mcm/page-components/cme/masterCodeMngList/page.tsx:95~104` 는 조회 조건(`filters`)·마스터 행·선택 키·상세 행·LOV 를 각각 `useState` 로 들고 있다.
2. 공통 조회 장치가 없다. react-query `useQuery` 사용처 0건, shared `useGridDataManager`·`useRowStateManager` 사용처 0건이다. m-mdm 에도 조회 공통 훅이 없다.
3. `SearchField`·`AgDataGrid` 는 제어형이다. 값은 화면 상태에서 props 로 내려온다. 그래서 공통 부품이 값을 혼자 되살려도 화면이 다음 렌더에서 자기 상태(`rowData=[]`, 빈 조건)를 다시 내려 덮어쓴다. 화면의 저장·엑셀 처리도 화면 상태를 읽으므로, 그리드 표시만 되살리면 화면 동작과 어긋난다.
4. 탭 snapshot(`onSnapshotChange`)을 쓰는 화면은 8개뿐이고, 그나마 조회 결과를 담는 화면은 없다.

기각한 자동 방식:
- **React 내부 구조(fiber) 탐색으로 훅 상태를 읽고 쓰기**: React 내부 API 에 기대므로 React 판 올림마다 깨질 수 있다. 첫 렌더와 조회 뒤의 트리 모양이 달라 훅 위치 대응도 불안하다.
- **탭의 React 트리를 새 창 문서로 옮겨 그리기(createPortal into child window)**: 상태는 그대로 남지만, 원래 설계 A 안(새 창이 자기 URL·자기 실행 환경을 가짐)을 뒤집는다. Mantine 모달·ag-grid 팝업이 원래 창 document 에 그려지고, 포털을 닫거나 새로고침하면 새 창 화면도 죽는다.
- **HTTP 응답 재생 + 조건 칸 자동 입력 + 자동 조회**: 사용자 정의 입력(날짜·콤보·Lookup)은 덮지 못하고, 요청 본문이 조금만 달라도 재생이 빗나간다.

결론: 공통 장치는 shared 에 한 번 만들고, 화면은 `useState` 몇 개를 새 훅으로 바꾸는 기계적 치환을 한 번 한다. 그리드 선택 행·스크롤은 화면 수정 없이 AgDataGrid 가 `gridId` 기준으로 스스로 이어받는다(2 단계).

## 4. 설계

### 4.1 원칙: 상시 기록이 아니라 분리 순간에 한 번 모은다

- 화면 상태를 `onSnapshotChange` 로 탭 snapshot 에 계속 넣지 않는다. 탭 snapshot 은 `use-portal-tabs.ts:536~548` 에서 탭이 바뀔 때마다 localStorage 에 통째로 저장되고, `onTabSnapshotChange` 는 호출마다 JSON 직렬화를 두 번 한다. 행 수천 개를 상시 넣으면 성능 가이드 R8 이 막으려던 셸 재렌더 문제와 저장 한도 문제가 함께 생긴다.
- 대신 화면이 "지금 값을 돌려주는 함수(getter)" 를 탭 단위 등록소에 올려 두고, 셸이 분리 버튼을 누른 순간에 동기로 한 번 모은다. 등록은 ref 로만 하므로 화면·셸 렌더가 늘지 않는다. R8(선택 행을 snapshot 에 넣지 않음)과 충돌하지 않는다. 포털 탭 저장소에는 아무것도 더 쓰지 않는다.
- 기존 탭 snapshot 계약은 그대로 둔다. 모은 값은 handoff 의 별도 칸으로 간다.

### 4.2 새 공통 훅 (shared `portal-shell/carry-state.ts`, `@dk-oasis/shared/portal-shell` 로 공개)

```ts
/** useState 와 같다. 분리 창에서는 원래 탭의 값으로 시작한다. */
export function useCarryState<T>(key: string, initial: T | (() => T), opts?: { bulky?: boolean }): [T, Dispatch<SetStateAction<T>>];
/** bulky 값(행 등)이 빠진 채 복원됐을 때 마운트 뒤 한 번 부른다(자동 재조회). Promise 를 돌려주면 끝난 때를 새로고침 저장에 쓴다. */
export function useCarryRefetch(refetch: () => void | Promise<unknown>): void;
/** 이번 마운트가 이어받은 값으로 시작했는가 — 마운트 자동 조회를 건너뛸 때 쓴다. */
export function useCarryRestored(): boolean;
```

화면 적용 예(masterCodeMngList):

```ts
const [filters, setFilters] = useCarryState("filters", DEFAULT_FILTERS);
const [masterRows, setMasterRows] = useCarryState<MasterRow[]>("masterRows", [], { bulky: true });
const [selectedMasterKey, setSelectedMasterKey] = useCarryState<string | null>("selectedMasterKey", null);
const [detailRows, setDetailRows] = useCarryState<DetailRow[]>("detailRows", [], { bulky: true });
const [categoryLov, setCategoryLov] = useState<Category[]>([]); // Master 선택 때 받는 목록 — 이어받지 않는다
useCarryRefetch(() => loadMaster(filters));
```

이어받은 Master 선택이 있으면 새 창의 첫 상세 조회는 카테고리 LOV 만 채우고, 이어받은 카테고리 선택은 지우지 않는다(요청은 한 번 더 나간다).

**bulky 규칙**

- 사용자가 조회한 결과 배열(그리드 행 등)만 `bulky: true` 로 둔다. 마운트 때 불러오는 LOV·콤보 목록은 `useState` 로 두고, 새 창이 마운트 때 다시 받는다.
- 객체형 결과는 배열로 바꿔 둔다. 조회 여부 판정(`hasCarriedBulky`)이 null·undefined·빈 배열을 "조회하지 않음" 으로 세기 때문이다. 조회하지 않은 탭을 분리해 opener 없이 열어도 전체 조회가 나가지 않고, 행이 있었을 때만 자동 재조회한다.
- 조회·초기화 함수를 `useCallback` 으로 감쌀 때는 `useCarryState` 가 돌려준 setter 를 deps 에 넣는다(`react-hooks/exhaustive-deps` 가 setter 의 안정성을 모른다).
- 같은 key 는 한 번만 복원한다. 복원값을 쓴 key 는 이후 마운트되는 같은 key 가 일반 초기값으로 시작하고, "썼다" 표시는 등록 effect 에서 하므로 StrictMode 이중 렌더·effect 에서도 첫 마운트가 복원값을 받는다. 큰 값(bulky)의 key 가 모두 쓰이면 등록소가 이어받은 bulky 참조를 놓는다.

- key 는 화면 안에서만 유일하면 된다. 같은 key 를 두 번 등록하면 개발 모드에서 경고한다.
- 값은 JSON 으로 옮길 수 있는 것(일반 객체·배열·원시값)만 둔다. 세 경로(opener·handoff·새로고침) 모두 JSON 왕복으로 복제해 값 타입을 같게 한다. 함수·Map·Set 은 사라지고 Date 는 문자열로 바뀐다. 개발 모드에서는 모을 때(`collect`) 값 자체와 배열이면 첫 원소를 보고, 옮길 수 없는 값(Date·Set·Map·함수·클래스 인스턴스)을 key 이름과 함께 `console.warn` 한다.
- 컨텍스트 밖(포털·분리 창이 아닌 곳, 시험)에서는 `useState` 와 똑같이 동작한다.
- 화면이 마운트 때 자동 조회를 한다면 `useCarryRefetch` 를 두지 않고, `!useCarryRestored() || 결과 배열.length === 0` 일 때만 자동 조회한다. `useCarryRestored()` 만 보면 분리 순간 조회가 진행 중이라 행이 빈 채 넘어온 경우 빈 그리드로 남고, `useCarryRefetch` 도 두면 행 없이 복원됐을 때 두 번 조회한다.

### 4.3 셸 쪽 흐름 (portal-shell.tsx)

1. 탭 화면을 그릴 때 탭마다 `CarryStateProvider`(등록소 + 복원값)를 감싼다. 탭을 닫으면 그 탭의 등록소를 지운다.
2. `handlePopoutTab` 은 `openPagePopout` 직전에 그 탭의 등록소에서 값을 동기로 모은다. 결과는 `{ light, bulky }` 두 묶음이다. `window.open` 을 클릭 처리기 안에서 동기로 부르는 제약은 그대로 지킨다(모으기도 동기이고 await 가 없다).
3. 모은 값은 두 경로로 넘긴다.
   - **opener 메모리 보관소(주 경로, 크기 제한 없음)**: 셸 창의 모듈 변수 `Map<token, {pageId, light, bulky, createdAt}>` 에 넣는다. 새 창은 마운트 때 `window.opener` 의 보관소에서 token 으로 한 번 꺼내고(꺼내면 지움), 자기 창의 `pageId` 와 다르면 버리며, 자기 창 안으로 JSON 왕복 복제한다(실패하면 — 순환 등 — handoff light 경로로 물러선다). 같은 출처(origin)이고 `noopener` 를 쓰지 않으므로 opener 접근이 된다(기존 설계도 `portal-open-tab` 전달에 opener 를 쓴다. m-mcm 설정에 COOP 머리글 없음 확인).
   - **localStorage handoff(보조 경로)**: 기존 `PortalPopoutHandoff` 에 선택 칸 `carry?: { light, hadBulky }` 를 더한다. light 만 담는다. opener 를 못 쓰는 경우(opener 가 닫힘 등)에도 조건(light)은 이어받고, `hadBulky` 가 true 면 새 창이 자동 재조회한다. 선택은 화면 흐름에 따라 풀릴 수 있다 — 재조회가 선택을 비우는 화면(예: masterCodeMngList 의 조회 함수)은 이어받은 선택 키도 지운다.
4. 보관소 항목은 창 열기가 성공하면 그 자리에서 동기로 건 TTL(10분) 타이머로 지우고(새 창이 안 가져가도 남지 않게), 다음 분리 때 sweep 이 한 번 더 지우며, 로그아웃 때(`clearPopoutHandoffs` 옆) 모두 지운다.

### 4.4 크기 상한과 물러서기

| 경로 | 상한 | 넘으면 |
|---|---|---|
| opener 메모리(light + bulky) | 없음(같은 브라우저 메모리) | 해당 없음 |
| localStorage handoff(light) | base64 인코딩 뒤 256KB | light 를 빼고 기존 snapshot 만 쓴다. `console.warn` |
| 분리 창 새로고침용 sessionStorage(light) | 256KB | 쓰지 않는다. 새로고침하면 처음 상태 |

- `writeSecureJson` 은 base64 로 인코딩하므로 한글은 1글자에 약 4바이트가 된다. localStorage 에는 그리드 개인화·최근 입력값·탭 저장이 이미 있어 행을 담으면 한도를 넘기 쉽다. 그래서 행(bulky)은 localStorage 에 담지 않는다. 판정은 인코딩한 뒤의 길이로 한다.
- 물러서기 순서: 전부(opener) → light + 자동 재조회(handoff) → 기존 snapshot 만 → 처음 상태.
- 쿼터 실패: carry 를 담은 handoff 쓰기가 실패하면 carry 를 뺀 기존 형태(snapshot 만)로 한 번 더 쓴다. 그것도 실패하면 경고만 남기고 창은 연다. 이 경우에도 opener 경로는 그대로 간다.
- 기존 결함 보완: 지금은 handoff 쓰기가 실패해도 창을 열고 원래 탭을 닫아 상태가 모두 사라진다. 새 구조에서는 opener 경로가 localStorage 와 무관하므로 이 경우에도 상태가 넘어간다. 탭을 닫는 동작은 바꾸지 않는다.

### 4.5 분리 창 쪽 흐름 (PortalPageWindow.tsx)

1. 마운트 때 한 번: opener 보관소 → 없으면 handoff 의 `carry.light` → 없으면 이 창 sessionStorage 의 light 순서로 복원값을 정한다.
2. `CarryStateProvider` 로 화면에 내려 준다. bulky 가 비어 있고 원래 bulky 가 있었으면 `useCarryRefetch` 가 등록한 함수를 마운트 뒤 한 번 부른다.
3. `pagehide` 때 등록소에서 light 만 모아 sessionStorage(`oasis.portal.popoutCarry.{token}`)에 쓴다. 이때 `hadBulky` 는 지금 조회 결과가 있거나(`hasCarriedBulky`), 이어받은 `hadBulky` 가 true 이고 그 재조회가 아직 끝나지 않았으면 true 다(재조회 중에 새로고침해도 행을 다시 조회). 분리 창을 새로고침(F5)하면 조건·선택 키를 되살리고 행은 다시 조회한다. 새로고침은 원래 다시 불러오는 동작이므로 재조회가 맞다고 본다.

### 4.6 편집 중인 미저장 값

- 분리는 "옮기기"다(원래 탭이 닫힌다). 화면 상태에 있는 값은 편집 중인 행(`__rowState` 등)까지 그대로 옮긴다. 원래 탭이 사라지므로 이중 저장 위험이 없고, 버리면 오히려 입력을 잃는다.
- 셀 편집기가 열려 있는 값은 그리드 안에만 있다. 2 단계에서 AgDataGrid 가 모으기 전에 `api.stopEditing()` 으로 확정한다. 1 단계에서는 열린 편집기의 값이 빠질 수 있다(한계로 적는다).
- 확인 창은 두지 않는다. 띄우려면 확인 버튼 처리기 안에서 `window.open` 을 동기로 불러야 하므로 TabsBar 메뉴 흐름을 바꿔야 한다. 필요하면 §8-3 에서 고른다.

### 4.7 그리드 선택 행·스크롤 (2 단계, grid-core-2 머지 뒤)

- 지금 AgDataGrid 는 grid api 를 화면에 내보내지 않는다(내부 `gridRef`, `onGridReady` 를 넘겨받지 않음). 그래서 화면 쪽 훅만으로는 스크롤을 못 잡는다. 1 단계에서는 grid/** 를 고치지 않는다.
- 2 단계: `gridId` 가 있는 AgDataGrid 는 carry 컨텍스트 안에서 스스로 등록한다(key `grid:{gridId}`). 모을 때 `api.stopEditing()` 후 `api.getState()` 의 `rowSelection`·`scroll`·`focusedCell` 만 담고, 새 창에서는 `initialState` 로 넘긴다. ag-grid 33.3.2 에 `getState()`·`initialState` 는 있고 `setState()` 는 없다. 새 창에서는 행이 첫 렌더부터 들어 있으므로 생성 때 `initialState` 로 충분하다. 화면 수정은 없다(gridId 사용처 119곳).
- 2 단계 전에는 행·조건·선택 키(화면 상태)는 넘어가지만 그리드의 선택 표시와 스크롤 위치는 처음 상태다. 선택 표시를 `selectedRows` prop 으로 제어하는 화면은 1 단계만으로도 선택 표시가 되살아난다.

### 4.8 「새 탭으로 하나 더 열기」

이번 범위에 넣지 않는다. 지금처럼 탭 snapshot 만 복사한다. 같은 장치로 조건만 복사하는 확장은 쉽지만, 행·미저장 편집을 복사하면 이중 저장 위험이 있어 따로 정한다(§8-4).

## 5. 공통 부품 변경 표시 (승인 필요 여부)

| 대상 | 변경 | 기존 props·동작 변경 |
|---|---|---|
| `useCarryState`·`useCarryRefetch`·`useCarryRestored`·`CarryStateProvider` | 새 공통 훅 | 없음(새 등록, 문서·색인 갱신) |
| `openPagePopout` | 선택 인자 `carry` 추가 | 없음(안 주면 지금과 같음) |
| `PortalPopoutHandoff` | 선택 칸 `carry` 추가 | 없음 |
| `PortalShell` | 탭 화면을 carry 컨텍스트로 감싸고 분리 때 값을 모음 | props 변화 없음. 훅을 쓰지 않는 화면은 동작이 같다 |
| `PortalPageWindow` | carry 복원·pagehide 저장 | props 변화 없음 |
| `AgDataGrid`(2 단계) | `gridId` 가 있으면 분리 때 선택·스크롤을 이어받음 | **동작 추가**. 분리 창에서만 일어나고 포털 탭에서는 같다. 승인 요청 |

## 6. 시험 (shared vitest, jsdom)

- `carry-state`: 컨텍스트 밖에서는 useState 와 같다. 등록·모으기가 light/bulky 를 가른다. 언마운트하면 등록이 빠진다. 같은 key 중복 경고. 복원값으로 시작하고 `useCarryRestored` 가 true. bulky 가 빠진 복원이면 `useCarryRefetch` 가 한 번만 불린다.
- `popout`: opener 보관소 넣기·꺼내기 1회·TTL·로그아웃 정리. handoff `carry.light` 왕복, 256KB 초과 시 light 빠짐.
- 셸: 분리 때 탭 값이 모여 보관소와 handoff 로 간다. 훅을 쓰지 않는 탭은 지금과 같은 handoff 를 쓴다. 탭을 닫으면 등록소가 지워진다.
- `PortalPageWindow`: opener 보관소 값으로 화면이 시작한다. opener 가 없으면 handoff light + 자동 재조회. sessionStorage 복원(F5). 기존 시험 그대로 통과.
- 왕복 고정: 셸 쪽에서 모은 값 → 보관소/handoff → 새 창 화면 초기값이 같음을 한 시험으로 고정한다.
- 파일럿 화면: masterCodeMngList 의 기존 시험이 있으면 그대로 통과, 컨텍스트에 복원값을 주면 조건·행이 보인다.

브라우저 확인(실제 분리 창에서 조건·행·선택 유지)은 머지 뒤 조정자가 한다.

## 7. 한계

- 훅으로 바꾸지 않은 화면은 지금처럼 처음 상태로 열린다.
- 분리 창 화면이 오류 경계(ErrorBoundary)로 떨어져 등록이 0 이 되면 pagehide 가 저장을 건너뛰므로, 새로고침 때 그 전에 저장한 light 가 되살아난다(드문 경우라 그대로 둔다).
- 파일럿 masterCodeMngList 는 분리 창이 열리자마자 이어받은 선택의 상세를 한 번 조회한다. 응답 전에 다른 행을 고르면 늦은 응답이 덮을 수 있다. 상세 조회에 늦은 응답을 버리는 장치가 없는 것은 원래부터다.
- 2 단계 전에는 그리드 선택 표시·스크롤이 넘어가지 않는다. 1 단계에서는 열린 셀 편집기의 값이 빠질 수 있다.
- opener 를 못 쓰면 행은 재조회로 채운다.
- 분리 순간 조회가 진행 중이면 조건과 행이 어긋날 수 있다(응답은 닫힌 탭으로 간다). 모은 값은 그 순간의 조건과 행이다.
- 새 창 첫 마운트가 처음 상태를 읽어 두는 보관(`initialStateByToken`)은 커밋 때 마운트 effect 가 지운다(커밋되지 않으면 10초 뒤 안전장치가 지운다). 지워진 뒤 같은 token 으로 다시 마운트하면(opener 보관소·handoff 는 이미 소비됨) 분리 시점 light(이 창 sessionStorage)와 재조회로 물러선다.
- 화면 안 다른 부품(모달·탭 안 탭·트리 펼침 등)의 상태는 그 부품이 훅을 쓰지 않으면 넘어가지 않는다.

## 8. 판단 요청 항목 (조정 세션 경유)

| # | 항목 | 선택지 | 기본안 |
|---|---|---|---|
| 1 | 화면 적용 범위·담당 | (a) 이 레인은 공통 장치 + 파일럿 1개(masterCodeMngList)까지, 나머지 약 45개 화면은 조정자가 모듈 레인에 배분 (b) 이 레인이 승인 뒤 전 화면을 기계적으로 치환(D4, sonnet) | (a). 공통 장치를 파일럿으로 확인한 뒤 배분하는 편이 되돌리기 쉽다 |
| 2 | 2 단계(AgDataGrid 선택·스크롤) | (a) grid-core-2 머지 뒤 이 레인이 진행(AgDataGrid 동작 추가 승인) (b) 하지 않음 | (a) |
| 3 | 미저장 편집 | (a) 그대로 옮긴다(확인 창 없음) (b) 미저장 값이 있으면 확인 창 | (a) |
| 4 | 「새 탭으로 하나 더 열기」 | (a) 이번엔 그대로 (b) 조건(light)만 복사 | (a) |
| 5 | 성능 가이드 R8 과의 관계 | 이 장치는 `onSnapshotChange` 를 부르지 않고 탭 저장소에도 쓰지 않으므로 R8 결정(선택 행을 탭 snapshot 에 넣지 않음)은 그대로다. 분리 창에만 선택 키가 넘어간다 | 알림 |
