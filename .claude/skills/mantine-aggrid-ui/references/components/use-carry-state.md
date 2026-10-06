# useCarryState

포털 탭 우클릭 「새 창으로 분리」 때 조회 조건·조회 결과·선택 키를 재조회 없이 새 창으로 이어받게 하는 상태 훅이다. `useState` 와 같은 모양이라 화면은 `useState` 를 이 훅으로 바꾸기만 한다. `useCarryRefetch`·`useCarryRestored` 가 한 벌이다.

- import: `import { useCarryState, useCarryRefetch, useCarryRestored } from "@dk-oasis/shared/portal-shell";` (CSS import 없음)
- 소스: `src/frontend/shared/src/portal-shell/carry-state.ts`. 모으기·넘기기는 `portal-shell/popout.ts`·`portal-shell.tsx`, 복원은 `portal-shell/page-window/PortalPageWindow.tsx` 가 맡는다. 화면은 이 파일들을 직접 쓰지 않는다.
- 내부 구현: 상태는 그대로 `useState` 다. 화면 상태의 "지금 값을 돌려주는 함수(getter)" 를 탭 단위 등록소에 ref 로 올려 두고, 셸이 분리 버튼을 누른 순간에 동기로 한 번 모은다. 상시 기록하지 않으므로 렌더가 늘지 않고 탭 snapshot 저장소에도 쓰지 않는다.
- 진입점: 별도 서브패스 없이 `portal-shell` 진입점으로 낸다(2026-10-06 탭 분리 회차). 그래서 Part B §1 의 `portal-shell`(일반 페이지 MUST NOT) 중 이 세 훅만 일반 화면에서 쓸 수 있다.
- 설계: `docs/superpowers/specs/2026-10-06-popout-carry-state-design.md`.

## 언제 쓰나

- 쓴다: 「새 창으로 분리」 를 했을 때 원래 탭과 같은 화면을 보여야 하는 조회 화면. 조회 조건 객체, 사용자가 [조회]로 받은 결과 배열, 선택 키를 이 훅으로 둔다.
- 쓰지 않는다:
  - 탭 복귀 때 되살릴 값(조회 조건 등) → 탭 snapshot(`onSnapshotChange`). 이 훅은 탭 복귀와 무관하고 분리 순간에만 값을 모은다.
  - 마운트 때 불러오는 LOV·콤보 목록 → `useState` 그대로. bulky 로 두면 쓸데없는 재조회가 켜진다.
  - `Date`·`Set`·`Map`·`dayjs` 처럼 JSON 으로 옮길 수 없는 값 → `useState` 로 둔다.
  - 포털 탭 안에서만 쓰는 값(열림·접힘 같은 화면 부품 상태) → `useState`. 옮길 필요가 없다.
- 포털 탭·분리 창 밖(단독 시험 등)에서는 `useState` 와 똑같이 동작하므로 시험 코드를 따로 고칠 필요가 없다.

## 표준 사용

견본: m-mcm `page-components/cme/masterCodeMngList/page.tsx`(`MasterCodeMngListPage`).

```tsx
const [filters, setFilters] = useCarryState<Filters>("filters", DEFAULT_FILTERS);                 // light
const [masterRows, setMasterRows] = useCarryState<Row[]>("masterRows", [], { bulky: true });      // 조회 결과
const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);          // light

const handleSearch = useCallback(async () => {
  const res = await load(filters);
  setMasterRows(res.rows);
}, [filters, setMasterRows]);                                                                      // setter 도 deps 에 넣는다

// 원래 행이 있었는데 행 없이 복원됐을 때만 마운트 뒤 한 번 불린다(빈 배열이면 안 불린다).
// Promise 를 돌려주면 끝난 때를 알아 분리 창 새로고침 판단에 쓴다.
useCarryRefetch(handleSearch);

// 마운트 때 자동 조회하는 화면은 useCarryRefetch 를 두지 않고, 이어받은 행이 있을 때만 자동 조회를 건너뛴다.
// (행 없이 복원됐거나 분리 순간 조회가 진행 중이라 행이 비었으면 자동 조회가 한 번 돈다 — 중복 조회 없음)
const restored = useCarryRestored();
useEffect(() => {
  if (!restored || masterRows.length === 0) void handleSearch();
}, []);
```

### 화면 치환 규칙

1. 조회 조건 객체·선택 키는 `useCarryState("filters", DEFAULT)` 로 바꾼다(light).
2. 사용자가 [조회]로 받은 결과 배열만 `{ bulky: true }` 로 둔다. 마운트 때 불러오는 LOV·콤보 목록은 `useState` 로 둔다.
3. 결과가 `{ rows, total }` 같은 객체면 배열과 나머지를 나눠 배열만 bulky 로 둔다(빈 배열 판정 때문). `total` 은 light 로 둔다.
4. `useCarryRefetch(handleSearch)` 를 둔다. 조회한 적 없으면(빈 배열) 새 창에서 재조회하지 않는다. 그래서 진입 때 자동 조회를 금지한 화면도 따로 막을 필요가 없다. 조회했는데 0건이었던 화면도 재조회하지 않는다(빈 그리드가 같은 결과다). refetch 는 Promise 를 돌려주는 조회 함수를 그대로 넘긴다.
5. 마운트 때 자동 조회하는 화면은 4번의 `useCarryRefetch` 를 두지 않는다. 대신 자동 조회 조건을 `!useCarryRestored() || 결과 배열.length === 0` 으로 바꾼다. `useCarryRestored()` 만 보면, 분리 순간 조회가 진행 중이라 행이 빈 채 넘어온 경우 자동 조회도 재조회도 돌지 않아 빈 그리드로 남는다. 둘 다 두면 행 없이 복원됐을 때 두 번 조회한다.
6. 값은 JSON 으로 옮길 수 있어야 한다. `Date` 는 문자열로 두고, `Set`·`Map`·`dayjs` 같은 값은 쓰지 않는다(개발 모드 경고). 그런 상태는 `useState` 로 둔다.
7. key 는 화면 안에서 유일해야 한다. 같은 key 를 두 번 쓰면 개발 모드에서 경고한다. 같은 key 의 복원값은 한 번만 쓰인다.
8. setter 를 `useCallback`·`useEffect` deps 에 넣는다. eslint 가 안정값으로 인식하지 못해 요구하지만 넣어도 무해하다.
9. 선택 키를 carry 하면 마운트 effect 에서 `useCarryRestored() && 키` 일 때 기존 선택 함수를 한 번 불러 상세를 다시 읽는다. 포털 탭(복원값 없음)에서는 이 effect 가 아무것도 하지 않아야 한다. 선택 함수가 같은 id 면 바로 빠져나가는 핸들러(`handleRowClick` 등)이면 핸들러 대신 목록 행으로 적재 함수(`loadForm` 등)를 직접 부른다. 상세를 carry 하지 않으면서 상세 선택 키(`selectedDetailKey` 등)만 carry 하지 않는다(키만 남아 없는 행을 가리킨다).
10. 진입 대상을 handoff 가 정하는 화면은 복원 호출에서 handoff 가 이기게 한다(handoff 콜백이 `ref` 에 표시하고 복원 effect 는 그 표시가 없을 때만 부른다). 선택 함수가 토스트·확인 창을 띄우면 복원 호출에서는 뜨지 않게 한다.
11. 행 없이 복원돼 재조회하는 화면에서 하위 그리드가 선택 키 변경으로 다시 조회된다면, 복원된 선택 키가 같은 값이라 effect 가 안 돌 수 있다. 재조회 경로에서 선택 함수를 직접 부르거나 키를 한 번 비운다. 선택 함수가 목록 행에서 값을 찾는 화면은 행이 생긴 뒤 한 번 부른다(`dma/columnMng`: 첫 렌더에 행이 없으면 ref 에 대기시키고 `[list]` effect 에서 부른다). 재조회·`handleSearch` 가 선택을 비우는 화면은 재조회 함수가 이어받은 선택 키를 받아 새 목록에서 그 행을 찾아 지키게 한다(`dma/termMng`·`dma/unitMng`).
12. 조회 결과가 객체 하나(탭별 배열을 담은 객체 등)라 빈 값 판정이 안 되면, "조회한 조건"(예: `submitted`)이 없을 때 refetch 가 아무것도 하지 않게 가드한다.
13. 마운트 effect 에서 조회·선택 함수를 부르면 `react-hooks/set-state-in-effect` 에 걸릴 수 있다. 기존 화면처럼 해당 줄 바로 위에 `// eslint-disable-next-line react-hooks/set-state-in-effect` 한 줄로 둔다(deps 는 `// eslint-disable-next-line react-hooks/exhaustive-deps`).

## API

| 이름 | 설명 |
|---|---|
| `useCarryState<T>(key, initial, opts?)` | `useState` 와 같은 `[value, setValue]` 를 돌려준다. 분리 창에서는 원래 탭의 값으로 시작한다. `initial` 은 값 또는 지연 초기화 함수. `opts.bulky` 가 true 면 조회 결과 같은 큰 값 |
| `useCarryRefetch(refetch)` | 행(bulky)이 빠진 채 복원됐을 때(원래 조회 결과가 있었는데 못 받은 경우. 빈 배열이면 조회한 적 없는 것으로 보고 부르지 않는다) 마운트 뒤 한 번 `refetch` 를 부른다. 화면당 한 번만 둔다. `refetch` 는 매 렌더 새 함수여도 된다. Promise 를 돌려주면 끝난 때를 알고, 아니면 분리 창 새로고침 때 한 번 더 조회할 수 있다 |
| `useCarryRestored()` | 이번 마운트가 이어받은 값으로 시작했는지 `boolean`. 마운트 자동 조회·초기화 effect 를 건너뛸 때 쓴다 |

`CarryStateProvider`·`createCarryRegistry` 도 같은 파일에서 나가지만 셸(`PortalShell`)과 분리 창(`PortalPageWindow`)이 쓰는 내부 부품이다. 화면은 쓰지 않는다.

## 전달 경로와 한계

- **행(bulky)**: 셸 창(opener) 메모리로 넘긴다. 크기 제한이 없다.
- **조건(light)**: 위와 함께 localStorage handoff 로도 넘긴다. 인코딩한 뒤 256KB 가 상한이고, 넘거나 저장 한도 오류면 조건이 빠진다.
- **opener 를 못 쓸 때**(셸 창이 닫힘 등): 조건만 이어받고 행은 `useCarryRefetch` 로 재조회한다.
- **분리 창 새로고침(F5)**: 조건을 되살리고 행은 다시 조회한다.
- **그리드**: `gridId` 를 준 AgDataGrid 는 체크 선택·스크롤 위치·포커스 칸·자체 관리 행 커서를 자동으로 이어받는다(화면이 할 일 없음, 시험 `grid-carry.unit.test.ts`).
  - 화면이 `highlightedRowKey` 를 넘기지 않아 그리드가 커서를 자체 관리하면, 되살린 커서 행에 대해 화면 `onRowClick(row, 합성 click)` 이 마운트 뒤 한 번 불려 상세가 되살아난다. 같은 키로 상세를 다시 조회·초기화하는 `onRowClick` 은 같은 키 가드를 둔다.
  - `highlightedRowKey` 를 넘기는(controlled) 화면은 커서를 화면이 소유하므로, 선택 키를 `useCarryState` 로 이어받아 화면에서 되살린다(치환 규칙의 선택 복원).
  - `selectedRows`(제어형 선택)를 넘기면 체크 선택은 화면 값이 이긴다. 체크 복원은 `onRowSelect` 를 한 번 부른다(source `gridInitializing`).
  - `gridId` 가 없는 그리드, 대화 상자 안 그리드, 행이 재조회로 늦게 온 경우(체크·스크롤·포커스)는 이어받지 않는다. 포커스 칸·스크롤은 표시 순서·픽셀 기준이라 정렬이 다르면 다른 행을 가리킬 수 있다.
- 열려 있는 셀 편집기의 값은 분리 때 그리드가 편집을 끝내 행 객체에 넣지만, 화면이 `onCellValueChanged` 로 다는 표시(`_rowState` 등)는 반영되지 않을 수 있다. 화면 상태에 있는 미저장 편집 행은 그대로 옮겨진다(분리는 원래 탭을 닫는 옮기기다).
- 분리 순간에 조회가 진행 중이면 조건과 행이 어긋날 수 있다.
- 선택에 따라 다시 조회하는 하위 그리드·상세 폼(자식 컴포넌트 ref 가 들고 있는 값)의 미저장 편집은 빠진다. 화면이 선택 키만 이어받고, 새 창에서 선택 함수로 상세를 서버에서 다시 읽는다.
- 탭 snapshot(`onSnapshotChange`)과는 별개다. 성능 가이드 R8(선택 행을 snapshot 에 넣지 않음)과 충돌하지 않는다. 분리 순간에만 모으고 렌더가 늘지 않기 때문이다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 마운트 때 불러오는 LOV·콤보 목록까지 `bulky: true` 로 둠 | 새 창에서 쓸데없는 재조회가 켜진다. `useState` 로 둔다 |
| `{ rows, total }` 객체 전체를 bulky 로 둠 | 객체는 "행이 비었는가" 판정을 못 하므로 조회한 적 없는 화면까지 재조회될 수 있다. 배열만 bulky, 나머지는 light 로 나눈다 |
| `Date`·`Set`·`Map`·`dayjs` 를 값으로 둠 | handoff·새로고침 경로는 JSON 이라 모양이 바뀌거나 빠진다. `Date` 는 문자열로 두고 나머지는 `useState` 로 둔다 |
| 같은 key 를 두 번 씀 | 나중 것이 이기고 개발 모드에서 경고한다. 화면 안에서 key 를 유일하게 둔다 |
| 마운트 자동 조회 화면이 `useCarryRestored()` 를 확인하지 않음 | 틀린 화면은 되지 않지만 같은 조건으로 한 번 더 조회한다. `!restored \|\| 행.length === 0` 일 때만 자동 조회한다 |
| 마운트 자동 조회 화면이 `useCarryRestored()` 만 보고 건너뜀 | 분리 순간 조회 중이었으면 빈 그리드로 남는다. 행 길이도 함께 본다 |
| 마운트 자동 조회 화면에 `useCarryRefetch` 도 둠 | 행 없이 복원되면 두 번 조회한다. 자동 조회 화면은 `useCarryRefetch` 를 두지 않는다 |
| 조회 여부 플래그(`searched` 등)를 따로 두어 재조회를 막음 | bulky 값이 배열·null 이면 필요 없다. 빈 배열·null 은 "넘겨받은 행" 으로 세지 않으므로 공통 장치가 막는다. 예외: 결과가 객체 하나라 빈 값 판정이 안 되면 "조회한 조건"(`submitted` 등)을 두고 refetch 에서 가드한다(치환 규칙 12) |
| setter 를 `useCallback`·`useEffect` deps 에서 뺌 | eslint `react-hooks/exhaustive-deps` 경고가 난다. setter 도 넣는다(무해) |
| 선택 키만 carry 하고 상세를 다시 읽지 않음 | 새 창에서 행 강조만 있고 상세가 빈다. 마운트 effect 에서 `useCarryRestored() && 키` 일 때 선택 함수를 한 번 부른다(포털 탭은 복원값이 없어 아무것도 하지 않는다) |
| 같은 id 면 빠져나가는 핸들러로 선택을 복원하려 함 | 핸들러가 그냥 돌아와 폼이 안 채워진다. 목록 행으로 적재 함수(`loadForm`)를 직접 부른다 |
| 상세 행은 carry 하지 않으면서 상세 선택 키만 carry 함 | 키가 없는 행을 가리킨다. 상세 선택 키는 `useState` 로 둔다 |
| 행 없이 복원돼 재조회하는 화면에서 선택 함수를 재조회 전에 부르거나, 재조회 함수가 선택을 비움 | 선택이 사라지거나 목록에서 행을 못 찾는다. 재조회 함수가 이어받은 선택 키를 받아 새 목록에서 찾아 지킨다 |
| 복원 선택 호출이 handoff 진입 대상을 덮음 | handoff 콜백이 표시한 ref 가 있으면 복원 호출을 건너뛴다 |
| 조회 결과가 객체 하나인 화면에서 조회한 적이 없는데 refetch 가 서버를 부름 | "조회한 조건"(`submitted` 등)이 없으면 refetch 가 아무것도 하지 않게 가드한다 |
| 탭 복귀용으로 이 훅을 씀 | 이 훅은 분리 순간에만 값을 모은다. 탭 복귀 상태는 snapshot 이다 |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/cme/masterCodeMngList/page.tsx`: 조회 조건·마스터 행·상세 행·선택 키·선택 카테고리를 이어받고, 행 없이 복원되면 `useCarryRefetch(() => loadMaster(filters))` 로 재조회한다. 카테고리 LOV 는 마운트 때 다시 받으므로 `useState` 다. 진입 때 자동 조회가 없는 화면이라 `useCarryRestored` 는 쓰지 않는다.
- 선택 복원 예: `src/frontend/m-mdm/pages/dme/ruleMng/page.tsx` — `selectedId` 를 light 로 이어받고, 마운트 effect 에서 `useCarryRestored() && selectedId` 일 때 `choose(selectedId)` 를 한 번 불러 상세를 서버에서 다시 읽는다. `choose` 가 `selectedIdRef` 를 동기로 채우므로(재조회 effect 뒤에 돌아도 재조회 응답보다 먼저다) 행 없이 복원돼 재조회가 돌아도 첫 줄 자동 선택이 이어받은 선택을 덮지 않는다. `selectedIdRef` 를 이어받은 값으로 시작하는 것은 순서에 기대지 않으려는 방어다. 폼을 목록 행으로 채우는 화면은 `dma/termMng`·`dma/unitMng`(`loadForm` 직접 호출), handoff 가 우선인 화면은 `dme/ruleConfirm`(`handedOff` ref).
- 시험: `src/frontend/shared/tests/unit/carry-state.unit.test.ts`(shared vitest). 화면 복원 시험은 `createCarryRegistry(restore)` + `CarryStateProvider` 로 감싸 렌더한다 — `src/frontend/m-mdm/tests/dme/ruleMng/rule-mng-carry-restore.test.ts`.
