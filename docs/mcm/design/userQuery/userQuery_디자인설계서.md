# userQuery 디자인설계서 (맞춤 레포트 조회)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

## 1. 레이아웃

```
PageLayout (title 맞춤 레포트 조회, breadcrumb 공통관리 > 맞춤 레포트 > 맞춤 레포트 조회)
  buttons: 조회(F8)
  ContentBody root resizable storageKey="mcm.cmq.userQuery"
    ContentPanel width="20%"   QueryListPane
      SearchArea (분류 select · 이름 text · [조회])   N3 조회조건 Form
      GridPanel '쿼리 목록' + AgDataGrid (이름 · 분류 · 쿼리 ID)   N3 목록 Grid
    ContentPanel               RunPane (SearchArea + 설명 + 결과 영역)
```

- 왼쪽 칸은 기본 20% 라 조회 영역을 세로로 쌓는다. `.uq-list` 안에서만 `--search-input-width: 100%` 로 좁히고 칸 하나씩 가득 채운다.

- 폭 조절 값은 `split-sizing` 이 사용자별로 기억한다. 코드에 별도 반응형 분기와 최소 폭 규칙은 없다.
- 두 패널은 `height: 100%`, `min-height: 0` 이다. 목록 그리드와 결과 그리드 영역이 각자 스크롤한다.

## 2. 사용 컴포넌트

| 컴포넌트 | 출처 | 설정 |
|---|---|---|
| `PageLayout`, `ContentBody`, `ContentPanel` | `@dk-oasis/shared/layout` | 위 레이아웃 |
| `SearchArea`, `SearchField` | `@dk-oasis/shared/layout` | 왼쪽 N3 조회조건. `autoSearch`(진입 때 한 번 조회), 분류 select(`USRQ_CTG`, 「전체」 포함), 이름 text |
| `Input`, `Button` | `@dk-oasis/shared/form` | 이름 입력 칸, [조회] 단추(submit) |
| `GridPanel` + `AgDataGrid` | `@dk-oasis/shared/grid` | 왼쪽 N3 목록. 제목 「쿼리 목록」, gridId `list`, rowKey `queryId`, 열 이름·분류·쿼리 ID, `columnSizing="fit"`, `highlightedRowKey` = 고른 쿼리, `onRowClick` |
| `SearchArea` | `@dk-oasis/shared/layout` | 오른쪽 N5 조건. `onSearch` = 조회, `defaults={false}` |
| `ConditionField` | `widget-types/_query/ConditionBar.tsx`(export 재사용) | 입력 정의마다 하나. 칸 testid `wq-cond-{name}-input` |
| `GridPanel` | `@dk-oasis/shared/grid` | title = 쿼리 이름, count = 행 수 |
| `AgDataGrid` | `@dk-oasis/shared/grid` | N4 결과. gridId `query-{queryId}`, rowKey `TABLE_ROW_KEY`, `columnSizing="fit"`, `excelExport`, `personalize={false}`, `resetColumnsMenu={false}`, `emptyMessage` 는 아래 |
| `QueryStyle`, `UserQueryStyle` | `_query/parts`, `QueryListPane` | `<style href precedence>` 로 CSS 주입. 같은 href 는 한 번만 실린다 |

- 목록 열은 모듈 상수 `LIST_COLUMNS` 다(가로 스크롤이 생기지 않게 minWidth 합을 작게 둔다). 분류 이름은 행을 만들 때 미리 풀어 `categoryNm` 에 넣는다.
- 결과 열은 `definedColumns(getDef.columns)` 로 만든다. 정의에 열이 있으면 그 규칙, 없으면 조회 뒤 `resultColumns` 로 결과 열 전부를 쓴다.
- 정의 열 배열은 `getDef` 결과(def)에서만 `useMemo` 로 만든다. 참조가 안정적이라 조회 결과가 와도 그리드는 행만 바꾸고 다시 마운트하지 않는다.
- 결과 그리드 설정 메뉴(N4)에는 「칸별 필터 보기」와 「엑셀 출력」만 남긴다. `personalize={false}` 로 개인화를 끄고, `resetColumnsMenu={false}` 로 「열 초기화」 항목을 뺀다. `resetColumnsMenu` 는 shared `AgDataGrid` 의 새 선택 prop 이고 기본값은 `true` 다.
- 빈 그리드 문구(`emptyMessage`): 결과 있음 = `QUERY_EMPTY`, 필수 값 누락 = 「조건을 입력하고 조회하세요」, 그 밖의 조회 전 = 「조건을 확인하고 조회하세요」.
- `excelExport` 객체는 늘 전달한다. 줬다 뺐다 하면 그리드 뿌리가 바뀌어 다시 마운트된다. 값이 바뀔 때만 새 객체를 만든다.

## 3. 화면 상태

| 상태 | 본문 | testid |
|---|---|---|
| idle | 「왼쪽에서 쿼리를 고르세요」 | `uq-run-idle` |
| def loading | 「불러오는 중입니다」 | `uq-run-loading` |
| def error | 오류 문구(role alert, 위험 색) | `uq-run-error` |
| ready(출력 열 없는 쿼리) | 「조건을 확인하고 조회하세요」. 실행 중에는 「조회 중입니다」. 조회 뒤 결과 열로 그린다 | `uq-run-ready` |
| ready(출력 열 있는 쿼리) | 0행 빈 그리드를 바로 그린다. 빈 문구 「조건을 확인하고 조회하세요」 | `uq-empty` |
| need-input(출력 열 없음, 결과 없음) | 「조건을 입력하고 조회하세요」 | `uq-run-need-input` |
| need-input(출력 열 있음, 결과 없음) | 빈 그리드 유지. 빈 문구 「조건을 입력하고 조회하세요」 | `uq-empty` |
| need-input(결과 있음) | 그리드 위 한 줄 안내. 그리드는 유지 | `uq-run-need-input` |
| result | 그리드 | `uq-excel`(엑셀 메뉴) |
| empty | 그리드 빈 문구 | `uq-empty` |
| running | 그리드 loading | |

## 4. 상태 전이 규칙

- 쿼리를 바꾸면 정의, 이전 결과 행, need-input, 오류를 모두 지운다. 그리드는 `key={queryId}` 로 새로 그린다.
- 쿼리를 고르면 `getDef` 도착 즉시 `getDef.columns` 로 0행 빈 그리드를 그린다. 조회 때는 같은 열 정의에 행만 채운다.
- `getDef.columns` 가 비어 있는 쿼리는 열을 알 수 없으므로 조회 뒤 결과 열로 그린다.
- 한 쿼리 안에서는 그리드를 언마운트하지 않는다. 필수 값 누락이나 실행 실패 때는 행만 비우고 열은 남긴다(`withoutRows`).
- 0건 결과도 그리드를 유지하고 빈 문구만 바꾼다.
- 늦게 온 응답은 epoch 번호가 다르면 버린다.
- 상단 `조회` 는 정의 로딩, 실행 중, 미선택일 때 비활성이다.

## 5. testid 목록(코드 기준)

| testid | 위치 |
|---|---|
| `uq-list` | 왼쪽 뿌리 |
| `uq-list-filter` | 이름 입력 칸 |
| `uq-list-search` | 왼쪽 [조회] 단추 |
| `uq-list-empty` | 목록 그리드 빈 문구(할당 쿼리 없음. 로딩 중에는 그리드 loading) |
| `uq-run` | 오른쪽 뿌리 |
| `uq-run-idle`, `uq-run-loading`, `uq-run-error`, `uq-run-ready`, `uq-run-need-input` | 상태 본문 |
| `uq-excel` | 엑셀 내보내기 |
| `uq-empty` | 그리드 빈 결과 |
