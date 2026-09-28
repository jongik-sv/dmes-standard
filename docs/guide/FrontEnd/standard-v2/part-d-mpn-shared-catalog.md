# Part D: m-mpn 공통 모듈 카탈로그 (APS 프론트)

> 상위 문서: [Frontend 표준 개발 가이드 V2](../FrontEnd_표준_통합_개발가이드_v2.md)
> 워크스페이스 공용 패키지(`@dk-oasis/shared`)의 정책은 [Part B](part-b-shared-policy.md)가 정본이다.
> 본 문서는 그 **위층인 m-mpn 로컬 공통층**(`src/_shared`, `src/_types`, 도메인 공통)의 카탈로그다.
> 최종 갱신: 2026-07-18 (프론트 전면 리팩토링 W0~W4 반영)

## 0. 원칙

1. **카탈로그 우선**: m-mpn 에서 새 화면/기능을 만들 때 아래 순서로 찾는다.
   `@dk-oasis/shared`(Part B) → `src/_shared`(§1) → 해당 도메인 공통(§2) → 그래도 없으면 신설.
2. **로컬 재구현 금지**: §4 의 금지 목록에 해당하는 패턴을 화면 파일 안에 다시 만들지 않는다.
3. **신설 시 문서 갱신**: 공통 모듈을 새로 만들면 본 문서에 등재한다. 2개 이상 도메인에서
   쓰이게 된 도메인 공통은 `src/_shared` 승격을 검토한다.
4. 등급은 Part B 와 동일: MUST(반드시) / SHOULD(특별한 사유 없으면) / MAY(조건부).

---

## 1. `src/_shared` — 전 도메인 공통

### 1.1 HTTP 계층 — `_shared/http.ts` (MUST)

`@dk-oasis/shared/http`의 `apiRequest`(토큰·401·에러추출·JSON) 위에서 mpn 반복 상용구를 흡수한다.
**`*-api.ts` 에서 `apiRequest` 직접 호출·`new URLSearchParams()` 수동 조립·`res.data` 수동 언랩은 금지.**

| export | 용도 | 비고 |
|---|---|---|
| `API_BASE` | `/api/mpn/rest/api` 프리픽스 상수 | URL 하드코딩 금지 |
| `buildQuery(params)` | 쿼리스트링 조립 | `null/undefined/""` 스킵, **`0`/`false` 유지**. 반환 `""` 또는 `?a=b` |
| `getData<T>(path)` | GET + 엔벨로프 `data` 언랩 | init 없으면 `apiRequest(path)` 단일 인자 호출(테스트 목킹 계약 — 변경 금지) |
| `postData/putData/patchData<T>(path, body?)` | 뮤테이션 + 언랩 | body 미지정 시 `{}` 직렬화(상태전이 빈바디 PATCH 관행) |
| `deleteData(path)` | DELETE(void) | 반환값이 필요한 삭제 API 는 예외적으로 `apiRequest` 유지 가능 |
| `normalizePage<T>(raw)` / `getPage<T>(path)` | Spring Page 직렬화 드리프트 방어 | 목록 조회는 `getPage` 사용 |
| `createCrudApi<TItem,TCreate,TUpdate>(basePath)` | 표준 CRUD 5종(list/get/create/update/remove) 팩토리 | 기존 함수명 재export 로 시그니처 유지. 중첩리소스(`/xxx/{id}/yyy`)·액션형 API 는 대상 아님 |
| `downloadWithAuth(path, filename)` | 인증 blob 다운로드(CSV/Excel) | raw `fetch` + 토큰 수동 주입 금지. multipart **업로드**만 raw fetch 허용(master-excel-api 참조) |

### 1.2 옵션·라벨 — `_shared/options.ts` (MUST)

| export | 용도 |
|---|---|
| `ComboOption` / `ALL_OPTION` / `withAllOption(opts)` | `{value,label}` 표준, `"전체"` 선두 옵션 |
| `toOptions(labelMap, {withAll})` | **STATUS_LABEL Record 단일소스에서 OPTIONS 파생** — 라벨/옵션 이중 관리 금지 |
| `toValueLabel(items, getValue, getLabel)` | 임의 배열 → ComboOption 매핑 |
| `BadgeStyle` | 배지 색상맵 키는 `{bg, color}` 로 통일(`bg/text` 금지) |

### 1.3 화면 훅 7종

| 훅 | 등급 | 언제 쓰나 | 주의 |
|---|---|---|---|
| `useSearchFilters<T>(defaults)` | MUST | 검색조건 폼 상태(입력 `filters` / 커밋 `appliedFilters` 분리) | 필터 변경에 부수효과(연쇄 리셋 등)가 필요한 화면은 무리하게 채택하지 않는다 |
| `usePaginatedList<TItem,TFilter>` | MUST | **서버 페이징** 목록(doFetch+트리오+Pagination 4종 state 흡수). `paginationProps` 를 `<Pagination/>` 에 직결 | 페이지 이동은 `appliedFilters` 기준(라이브 필터 아님). 필터 타입에 `[key:string]: unknown` 인덱스 시그니처 필요 |
| `useClientPagedSearch<TItem,TFilter>` | MUST | BE 필터 pushdown 미지원 화면의 전건로드+클라필터+클라페이징 | `fetchAll` 은 기존 화면의 로드 방식(단발 대용량/while-loop)을 그대로 주입 |
| `useAutoSelectAdded(rows, getKey, onSelect)` | MUST | 행 추가/복사 직후 자동 선택 | "최근 added/copied 키 변경 시에만" 발화 — 별도 가드 불필요 |
| `usePortalDeepLink({eventName, storageKey, parse, onApply, enabled})` | MUST | 포털 딥링크 수신(CustomEvent + sessionStorage pending 소비) | 이벤트명·스토리지키는 **발신측과의 계약** — 임의 변경 금지. 계약이 다른 수신 패턴(탭 활성화 등)엔 강제 적용 금지 |
| `usePollingTask()` | MUST | 진행상태 폴링(interval·타임아웃·세대가드·inFlight·cleanup) | `const { start, stop, isPolling } = usePollingTask()` 로 **구조분해**해서 사용 |
| `useEntityForm<T>(source, {onChange})` | SHOULD | 폼 미러상태(`useState({...prop})`+리셋 effect+updateField 대체) | `T extends Record<string,unknown>` 제약 — interface 는 type 별칭 전환 또는 `entity as T & Record<string,unknown>` 캐스팅. onBlur 커밋형 폼(RoutingForm류)은 부적합 |

### 1.4 기타 헬퍼

| 모듈 | 용도 | 주의 |
|---|---|---|
| `_shared/validation.ts` `firstRequiredError(rules)` | 필수값 검증 캐스케이드(첫 위반 메시지 반환) | **falsy 기준**(0/false 도 missing) — 0/false 가 유효한 필드는 non-falsy 로 감쌀 것 |
| `_shared/grid-rows.ts` `toGridRows(rows, getKey, mapData)` | RowStateItem → 그리드 행(`_rowId`/`_rowState` 부착) | 호출부에서 반드시 `useMemo` 로 감싼다 |

### 1.5 컴포넌트 — `_shared/components/`

| 컴포넌트 | 용도 | 주의 |
|---|---|---|
| `EmptyDetailPanel` | "항목을 선택하세요" 빈 상세패널(로딩 변형 포함) | 인라인 form-panel 마크업 복붙 금지 |
| `DateField` | 날짜 입력(기존 인라인 스타일 픽셀 동일) | **onChange 는 값 기반**: `onChange={setX}` (이벤트 아님) |
| `FormModal` | 제출형 모달 골격(open/onClose/onSubmit/submitting) | minWidth 480 고정 — 다른 크기·특수 모달은 `@dk-oasis/shared/modal` 직접 |

### 1.6 기존 자산 (리팩토링 이전부터 존재 — 계속 사용)

| 모듈 | 용도 |
|---|---|
| `_shared/lov-api.ts` | 콤보/LOV 로더 정본 12종(fetchAllPlants/Items/FgItems/Customers/Vendors/Uoms/Resources/WorkCenters/Operations/Boms/Routings/ItemGroupsByPlant) + `fetchCompletedPlanningRuns`. 실패 시 빈배열 반환(삼킴형) — **실패 토스트가 필요한 화면은 getData 기반 로더 유지**(승인된 예외) |
| `_shared/format.ts` | formatDateTime/Date/Time/ShortDateTime/Number/Decimal (null-safe·ko-KR). 로컬 포매터 재구현 금지 — 단 출력 포맷이 다른 기존 화면(slice 형 등)은 표시 보존 우선 |
| `_shared/grid-help.ts` | GridPanel `help` prop 용 도움말 config |
| `_shared/field-tips.ts` | FormGroup `tip` 사전(src/ 하위 FormGroup 은 tip 필수 — §4 census) |
| `_shared/lookups/` | Item/Bom/Routing 등 공용 Lookup 모달 8종 |
| `_shared/timeline-zoom.ts` | 간트·타임라인 줌 앵커/센터 스크롤(scheduling·planning 공유) |
| `_shared/ResizableSplitV.tsx` | 상하 분할 리사이저 (기존 화면 계속 사용) — 신규 분할 화면은 `ContentBody resizable` 을 쓴다(Frontend Part B §4-3) |
| `_shared/useItemGroupCascade.ts` | 공장→자재그룹 캐스케이드 |
| `_types/api.ts` | `ApiResponse<T>`/`PageResponse<T>` 정본 — **로컬 재정의 금지** |
| `_types/useBackendTokenSync.ts` | BE 토큰 동기화 — 페이지 mount 시 호출 + `tokenReady` 게이트 후 초기 fetch (MUST) |
| `_types/combo.ts` | `fetchOptionsFromPage/List`(lov-api 내부용 프리미티브) |

---

## 2. 도메인 공통 (해당 도메인 개발 시)

### 2.1 master — `src/master/_shared/`
| 모듈 | 용도 | 주의 |
|---|---|---|
| `use-master-crud.ts` `useMasterCrudPage` | 단순 CRUD 화면(customer/vendor/uom/batch 형): search 컨트롤러(usePaginatedList/useClientPagedSearch) 주입 + RowStateManager 편집·선택·자동선택·저장 골격 | **단순 CRUD 전용.** 마스터-디테일(2매니저)·자식 detail-fetch·통합저장 화면에 강제 삽입 금지(확정 결정 — plant/item-group/labor/workcenter 등은 개별 훅 조합) |
| `PvLinkPanel.tsx` | 생산버전 링크 패널 | api 호출은 bom-api 경유(컴포넌트 내 직접 fetch 금지) |
| `MasterExcelToolbar` + `master-excel-api.ts` | 마스터 Excel 업/다운로드 | 다운로드=downloadWithAuth, 업로드=raw fetch(multipart 정당) |
| `src/master/operation/operation-time.ts` | **공정 합계 정본(5항: run+setup+queue+wait+move)** | 화면별 2항/5항 즉석 계산 금지 |
| `src/master/operation/constants.ts` | OVERLAP_POLICY_LABEL·RUN_TIME_LABEL_BY_UNIT 단일소스 | routing 쪽 로컬 재정의 금지 |
| `src/master/bom/` bom-tree-rows·bom-helpers·useBomTree·TreeLabelCell·BomDetailPanel | BOM 트리 화면 부품 | |

### 2.2 scheduling — `src/scheduling/common/`
| 모듈 | 용도 |
|---|---|
| `useScheduleStatusActions` | 확정/발행/발행회수/삭제 세트(문구·가드 파라미터화 — 목록/실행 화면 공용) |
| `useScheduleDrilldown` | `aps_navigate_scheduleId`/`aps-schedule-navigate` 딥링크 수신 표준 |
| `useScheduleOptions` | 스케줄 콤보 |
| `ScheduleSidebar`/`ScheduleLookup` | 스케줄 사이드바(5화면 공용)·룩업 |

### 2.3 simulation — `src/simulation/common/`, `console/`
| 모듈 | 용도 |
|---|---|
| `common/useSimulationProgressPolling` | queueStatus 3상태 진행 폴링(usePollingTask 기반) |
| `common/constants.ts` | 시나리오/비교 STATUS 칩 스타일·라벨 단일소스 |
| `common/detail-panel-parts.tsx` | DetailPlaceholder·StatusChip |
| `console/useTabbedResultPanel` + `result-panel-shared.tsx` | 탭드 결과패널 골격(요청가드·배지 카운트·InlineLoadError·EmptyHint) |
| `kpi/kpi-helpers.ts` | KPI_META 정본(formatKpiValue). 비교 화면은 `formatKpiValueWithUnit` |

### 2.4 operation — `src/operation/`
| 모듈 | 용도 |
|---|---|
| `schedule-options.ts` `fetchScheduleOptions(label?)` | 6화면 공용 스케줄 콤보(size 500) |

---

## 3. 개발 시나리오 → 모듈 매핑

| 만들려는 것 | 사용 조합 |
|---|---|
| 목록+검색+서버 페이징 화면 | `usePaginatedList` + `<Pagination {...paginationProps}/>` + `useSearchFilters`(내장) |
| BE 필터 미지원 목록 | `useClientPagedSearch` (전건로드 방식은 기존 관행 유지) |
| 단순 CRUD 편집 그리드(master) | `useMasterCrudPage` + `useRowStateManager` + `toGridRows`+`useMemo` |
| 마스터-디테일 편집 | 개별 조합: `useRowStateManager`×2 + `useAutoSelectAdded` + `firstRequiredError` + 저장 그룹 내 `Promise.all`(그룹 간 순서 의존 확인) |
| 폼 | `useEntityForm` + shared `FormGroup`(tip 필수) + 콤보는 **페이지 1회 로드 후 prop 주입**(폼 mount fetch 금지) |
| 제출형 모달 | `FormModal` (크기·구조 다르면 shared Modal) |
| 콤보/LOV | `lov-api` → 없으면 `toValueLabel`/`withAllOption` 조합. 실패 토스트 필요 시 getData 기반 |
| 상태 라벨·배지 | `STATUS_LABEL` Record 단일소스 + `toOptions` 파생 + `BadgeStyle` |
| 실행 진행 폴링 | `usePollingTask` (simulation 은 `useSimulationProgressPolling`) |
| 포털 딥링크 수신 | `usePortalDeepLink` (scheduling 은 `useScheduleDrilldown`) |
| CSV/Excel 다운로드 | `downloadWithAuth` |
| 날짜 입력 | `DateField` |

---

## 4. 금지·함정 (테스트 계약 포함)

- **재구현 금지**: `ApiResponse`/`PageResponse` 로컬 정의, raw `fetch`(multipart 업로드 제외), `URLSearchParams` 수동 조립, 로컬 formatDateTime/toGridData/applyPage/자동선택 useEffect, `gfn_message` 래퍼 신설(positional 시그니처 유지).
- **삭제된 모듈 — 부활 금지**: `_shared/tempId.ts`(→ `useRowStateManager`/`useGridDataManager`), `_shared/components/ControllerGrid.tsx`(census 정책 충돌로 폐기), `scheduling/gantt/GanttBody.tsx`, `master/calendar/CalendarEntryForm.tsx`.
- **ui-guidance census** (`tests/unit/ui-guidance-a11y.unit.test.ts`): `src/` 만 스캔하며 `<GridPanel>` AST 수를 **고정값(현재 15)** 으로 검증하고 FormGroup `tip` 을 요구한다. src 로 그리드/폼을 추출·신설하면 census 갱신이 필요한지 먼저 확인하라. 테스트를 임의 완화하지 말 것.
- **silent-api-error 테스트**는 소스 리터럴(예: `fetchItemGroupsByPlant(item.plantId)`)을 앵커로 잡는다 — 해당 호출부의 지역변수 추출 리팩토링 금지.
- shared `Pagination` 은 `totalPages <= 0` 이면 null 렌더(빈 목록에서 미표시가 정상).
- `getData` 는 init 미지정 시 `apiRequest(path)` 단일 인자 호출을 유지해야 한다(목킹 계약).
- 간트 좌표 계산은 `startMs/endMs` 사전계산 필드를 소비한다(`op.startMs ?? new Date(op.start).getTime()` 폴백형) — 렌더 루프에서 `new Date()` 반복 파싱 금지.
- dist 산출물 검증 시 한글 문자열 grep 불가(esbuild `\uXXXX` 이스케이프) — 이스케이프 문자열 또는 Node import 로 확인.

---

## 5. 유지보수

- 공통 모듈 추가/폐기 시 **본 문서를 같은 커밋에서 갱신**한다.
- 도메인 공통이 2개 이상 도메인에서 쓰이면 `src/_shared` 승격을 검토한다.
- 배경·결정 이력: 2026-07-18 프론트 전면 리팩토링(W0 공통 신설 → W1 API 이관 → W2 화면 채택 → W3 성능 → W4 tsup splitting). E2E 스모크 정본: `e2e/w4-refactor-smoke.spec.ts`.
