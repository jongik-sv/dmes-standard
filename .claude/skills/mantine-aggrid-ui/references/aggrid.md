# ag-grid-community 참고 (DMES: v33.3.2, React)

도구: `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py <명령>` (아래에서는 `$A` 로 줄여 쓴다. zsh 에서는 변수에 명령을 넣지 말고 전체 경로로 실행한다)

## 1. 문서가 버전을 따라가지 않는다

| 자원 | 버전 | 용도 |
|---|---|---|
| `https://www.ag-grid.com/llms.txt` · `/{fw}-data-grid/<slug>.md` | **최신 메이저만**(작성 시점 v36) | 기능 소개, 도입 버전 확인 |
| `https://www.ag-grid.com/archive/<x.y.z>/{fw}-data-grid/<slug>/` | 설치 버전 | **구현 근거.** HTML 만 제공 → `$A get` 이 텍스트로 바꿔 캐시 |
| 설치본 `ag-grid-community/dist/types/src/**/*.d.ts` | 설치 버전 | 최종 근거. `$A types <이름>` |
| 공식 스킬 `ag-grid/skills` → `ag-dev` 의 `documentation-index.md` · `recommendations.md` | 최신 | 슬러그 색인(`$A search`), LLM 흔한 실수(`$A recommendations`) |

- `$A get <slug>` 가 404 면 **설치 버전에 없는 기능**이다. `--latest` 로 도입 버전을 확인하고, 설치 버전 API 로만 구현하거나 사용자에게 알린다.
- ag-grid.com 은 기본 UA 요청을 403 으로 막는다. WebFetch 대신 스크립트를 쓴다.
- 대안: 공식 MCP 서버 `npx ag-mcp` 는 버전을 감지해 문서를 준다. 설치돼 있으면 써도 된다.

## 2. v33 기준으로 꼭 맞출 것 (학습 데이터의 옛 API)

| 옛 API | v33 | 비고 |
|---|---|---|
| `@ag-grid-community/*` 스코프 패키지 | `ag-grid-community` 단일 패키지 | v32 이후 갱신 중단 |
| 모듈 자동 포함 | `ModuleRegistry.registerModules([AllCommunityModule])` | DMES 는 `AgDataGrid.tsx` 가 한 번 등록 |
| `ag-grid.css` + `ag-theme-*.css` (레거시 테마) | Theming API(기본 `themeQuartz`) | DMES 는 `grid.css` 에서 `--ag-*` 변수를 의미 토큰으로 구동 |
| `rowSelection="multiple"` | `rowSelection={{ mode: 'multiRow', checkboxes, headerCheckbox, enableClickSelection, isRowSelectable }}` | v32.2 deprecated |
| colDef `checkboxSelection` · `headerCheckboxSelection` | `rowSelection.checkboxes` · `headerCheckbox` | v32.2 deprecated |
| `suppressRowClickSelection` | `rowSelection.enableClickSelection` | v32.2 deprecated |
| `enableRangeSelection` 등 | `cellSelection` (Enterprise) | DMES 사용 불가 |
| `columnApi`, `new Grid()` | `GridApi` 하나, `createGrid()` | v31 |

deprecated 목록은 설치본 `.d.ts` 의 `@deprecated` 표기에서 `$A audit` 가 자동으로 뽑는다(현재 30개).

### 설치본보다 새 버전(v34~36)에만 있는 것 — 최신 문서를 보고 쓰면 틀린다

- `enableDevValidations()` (v36). v33 은 `ModuleRegistry.registerModules([ValidationModule])` 를 개발 모드에서만 등록한다.
- v35 의 "No matching rows" 오버레이, `suppressOverlays`, v36 의 단일 스크롤 컨테이너 DOM 은 v33 에 없다. `archive/33.3.2` 문서나 `.d.ts` 로 확인한다.

## 3. 공식 권장사항 중 DMES 에 그대로 적용되는 것

- 그리드 컨테이너에 높이를 명시한다(`domLayout: 'normal'`). `AgDataGrid` 의 `height` prop.
- 데이터가 갱신되면 `getRowId` 는 순수 함수로 고유·안정 문자열을 돌려준다. `AgDataGrid` 는 `rowKey` 로 처리한다.
- 데이터를 제자리에서 바꾸면 갱신되지 않는다(참조 비교). 새 배열·객체로 교체한다.
- React: `rowData`·`columnDefs`·`defaultColDef` 같은 객체 prop 은 `useMemo`/`useState` 로 참조를 고정한다. 매 렌더 새 배열은 열 상태와 선택을 초기화한다.
- 이벤트는 과거형(`onCellClicked`, `onRowDataUpdated`)이다. DOM 식 `onClick` 이 아니다.
- 설정한 기능이 조용히 동작하지 않으면 **모듈 미등록**부터 의심한다(콘솔 `AG Grid: error #200`).
- 옵션의 JSDoc `@agModule` 이 필요한 모듈을 알려 준다. `$A types <모듈명>` 이 "정의 없음"이면 community 에 없는 **Enterprise 모듈**이다(예: `CellSelectionModule`).

## 4. 공식 권장사항 중 DMES 가 뒤집는 것

- 공식 `ag-dev` 는 "Enterprise 기능이 필요하면 `ag-grid-enterprise` 를 추가하라"고 권한다. **DMES 는 ADR-0001 에 따라 community(MIT)만 쓴다.** 행 그룹·피벗·집계 패널·셀 범위 선택·Excel 내보내기·Set Filter·Rich Select·Master Detail·Server-Side Row Model 은 Enterprise 이므로, 요구가 나오면 구현하지 말고 사용자에게 알린다. `$A get <slug>` 출력 첫 줄(`Enterprise: 예`)이나 `$A types <모듈명>` 의 "정의 없음"으로 판별한다.
- Excel 내보내기는 ag-grid 가 아니라 shared `exportToExcel`(`@dk-oasis/shared/utils`, xlsx)로 해결한다. CSV Export 는 community 다.

## 5. DMES 그리드 계층

- 화면은 `@dk-oasis/shared/grid` 의 `AgDataGrid`(기본) · `GridPanel` · `useGridDataManager` 만 쓴다. `ag-grid-react`·`ag-grid-community` 를 화면에서 import 하지 않는다([Part B §6](../../../../docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md)).
- 화면의 열 정의는 ag-grid `ColDef` 가 아니라 래퍼의 `GridColumn`(`key`, `header`, `width`, `align`, `editable`, `cellEditor`, `render`, `pinned`, `cellClassRules` …)이다. 정의는 `src/frontend/shared/src/components/grid/AgDataGrid.tsx` 의 `GridColumn`·`AgDataGridProps` 가 정본이다.
- 저장형 화면은 `useGridDataManager` 로 행 상태(added/modified/deleted)를 관리한다. 행 상태 배경색은 래퍼가 자동으로 입힌다([UI-Visual-Standard §7](../../../../docs/guide/FrontEnd/UI-Visual-Standard.md)).
- 필요한 ag-grid 기능을 래퍼가 노출하지 않으면 화면에서 우회하지 않는다. 사용자에게 알리고, 승인되면 `AgDataGrid` 에 prop 을 추가한다. 이때 위 §1 방식으로 v33 문서를 근거로 삼고, `shared` 를 build 한 뒤 모듈을 확인한다.
- 행 26px·헤더 28px, `ag-theme-alpine`·`cm-data-grid` 클래스명(e2e 의존)은 유지한다. 모습은 `grid.css` 의 `--ag-*` 변수로만 바꾼다.
