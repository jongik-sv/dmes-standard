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

// 마운트 때 자동 조회하는 화면은 이어받은 값이 있으면 건너뛴다.
const restored = useCarryRestored();
useEffect(() => {
  if (!restored) void handleSearch();
}, []);
```

### 화면 치환 규칙

1. 조회 조건 객체·선택 키는 `useCarryState("filters", DEFAULT)` 로 바꾼다(light).
2. 사용자가 [조회]로 받은 결과 배열만 `{ bulky: true }` 로 둔다. 마운트 때 불러오는 LOV·콤보 목록은 `useState` 로 둔다.
3. 결과가 `{ rows, total }` 같은 객체면 배열과 나머지를 나눠 배열만 bulky 로 둔다(빈 배열 판정 때문). `total` 은 light 로 둔다.
4. `useCarryRefetch(handleSearch)` 를 둔다. 조회한 적 없으면(빈 배열) 새 창에서 재조회하지 않는다. 그래서 진입 때 자동 조회를 금지한 화면도 따로 막을 필요가 없다. 조회했는데 0건이었던 화면도 재조회하지 않는다(빈 그리드가 같은 결과다). refetch 는 Promise 를 돌려주는 조회 함수를 그대로 넘긴다.
5. 마운트 때 자동 조회하는 화면은 `useCarryRestored()` 가 true 면 건너뛴다.
6. 값은 JSON 으로 옮길 수 있어야 한다. `Date` 는 문자열로 두고, `Set`·`Map`·`dayjs` 같은 값은 쓰지 않는다(개발 모드 경고). 그런 상태는 `useState` 로 둔다.
7. key 는 화면 안에서 유일해야 한다. 같은 key 를 두 번 쓰면 개발 모드에서 경고한다. 같은 key 의 복원값은 한 번만 쓰인다.
8. setter 를 `useCallback`·`useEffect` deps 에 넣는다. eslint 가 안정값으로 인식하지 못해 요구하지만 넣어도 무해하다.

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
- 그리드 선택 표시·스크롤 위치는 AgDataGrid 2단계 작업 전까지 이어지지 않는다. 선택을 `selectedRows` prop 으로 제어하는 화면은 선택 키만으로 선택 표시가 살아난다.
- 열려 있는 셀 편집기의 값은 그리드 안에만 있어 빠질 수 있다. 화면 상태에 있는 미저장 편집 행은 그대로 옮겨진다(분리는 원래 탭을 닫는 옮기기다).
- 분리 순간에 조회가 진행 중이면 조건과 행이 어긋날 수 있다.
- 탭 snapshot(`onSnapshotChange`)과는 별개다. 성능 가이드 R8(선택 행을 snapshot 에 넣지 않음)과 충돌하지 않는다. 분리 순간에만 모으고 렌더가 늘지 않기 때문이다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 마운트 때 불러오는 LOV·콤보 목록까지 `bulky: true` 로 둠 | 새 창에서 쓸데없는 재조회가 켜진다. `useState` 로 둔다 |
| `{ rows, total }` 객체 전체를 bulky 로 둠 | 객체는 "행이 비었는가" 판정을 못 하므로 조회한 적 없는 화면까지 재조회될 수 있다. 배열만 bulky, 나머지는 light 로 나눈다 |
| `Date`·`Set`·`Map`·`dayjs` 를 값으로 둠 | handoff·새로고침 경로는 JSON 이라 모양이 바뀌거나 빠진다. `Date` 는 문자열로 두고 나머지는 `useState` 로 둔다 |
| 같은 key 를 두 번 씀 | 나중 것이 이기고 개발 모드에서 경고한다. 화면 안에서 key 를 유일하게 둔다 |
| 마운트 자동 조회 화면이 `useCarryRestored()` 를 확인하지 않음 | 틀린 화면은 되지 않지만 같은 조건으로 한 번 더 조회한다. 건너뛴다 |
| 조회 여부 플래그(`searched` 등)를 따로 두어 재조회를 막음 | 필요 없다. 빈 배열·null 인 bulky 값은 "넘겨받은 행" 으로 세지 않으므로 공통 장치가 막는다 |
| setter 를 `useCallback`·`useEffect` deps 에서 뺌 | eslint `react-hooks/exhaustive-deps` 경고가 난다. setter 도 넣는다(무해) |
| 탭 복귀용으로 이 훅을 씀 | 이 훅은 분리 순간에만 값을 모은다. 탭 복귀 상태는 snapshot 이다 |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/cme/masterCodeMngList/page.tsx`: 조회 조건·마스터 행·상세 행·선택 키·선택 카테고리를 이어받고, 행 없이 복원되면 `useCarryRefetch(() => loadMaster(filters))` 로 재조회한다. 카테고리 LOV 는 마운트 때 다시 받으므로 `useState` 다. 진입 때 자동 조회가 없는 화면이라 `useCarryRestored` 는 쓰지 않는다.
- 시험: `src/frontend/shared/tests/unit/carry-state.unit.test.ts`(shared vitest).
