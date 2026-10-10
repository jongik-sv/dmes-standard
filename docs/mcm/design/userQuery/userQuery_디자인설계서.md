# userQuery 디자인설계서 (공용 쿼리 조회)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

## 1. 레이아웃

```
PageLayout (title 공용 쿼리 조회, breadcrumb 공통관리 > 공용 조회 > 공용 쿼리 조회)
  buttons: 조회(F8)
  ContentBody root resizable storageKey="mcm.cmq.userQuery"
    ContentPanel width="20%"   QueryListPane (거르기 칸 + 분류별 목록)
    ContentPanel               RunPane (SearchArea + 설명 + 결과 영역)
```

- 폭 조절 값은 `split-sizing` 이 사용자별로 기억한다. 코드에 별도 반응형 분기와 최소 폭 규칙은 없다.
- 두 패널은 `height: 100%`, `min-height: 0` 이다. 목록 본문과 그리드 영역이 각자 스크롤한다.

## 2. 사용 컴포넌트

| 컴포넌트 | 출처 | 설정 |
|---|---|---|
| `PageLayout`, `ContentBody`, `ContentPanel` | `@dk-oasis/shared/layout` | 위 레이아웃 |
| `Input` | `@dk-oasis/shared/form` | 목록 거르기 |
| `SearchArea` | `@dk-oasis/shared/layout` | `onSearch` = 조회, `defaults={false}` |
| `ConditionField` | `widget-types/_query/ConditionBar.tsx`(export 재사용) | 입력 정의마다 하나. 칸 testid `wq-cond-{name}-input` |
| `GridPanel` | `@dk-oasis/shared/grid` | title = 쿼리 이름, count = 행 수 |
| `AgDataGrid` | `@dk-oasis/shared/grid` | gridId `query-{queryId}`, rowKey `TABLE_ROW_KEY`, `columnSizing="fit"`, `excelExport`, `emptyMessage` = `QUERY_EMPTY` |
| `QueryStyle`, `UserQueryStyle` | `_query/parts`, `QueryListPane` | `<style href precedence>` 로 CSS 주입. 같은 href 는 한 번만 실린다 |

- 열은 `toColumnDefs(result.columns, { columns }, rows)` 로 만든다. 정의에 열이 있으면 그 규칙, 없으면 결과 열 전부다.
- `excelExport` 객체는 늘 전달한다. 줬다 뺐다 하면 그리드 뿌리가 바뀌어 다시 마운트된다. 값이 바뀔 때만 새 객체를 만든다.

## 3. 화면 상태

| 상태 | 본문 | testid |
|---|---|---|
| idle | 「왼쪽에서 쿼리를 고르세요」 | `uq-run-idle` |
| def loading | 「불러오는 중입니다」 | `uq-run-loading` |
| def error | 오류 문구(role alert, 위험 색) | `uq-run-error` |
| ready | 「조건을 확인하고 조회하세요」. 실행 중에는 「조회 중입니다」 | `uq-run-ready` |
| need-input(결과 없음) | 「조건을 입력하고 조회하세요」 | `uq-run-need-input` |
| need-input(결과 있음) | 그리드 위 한 줄 안내. 그리드는 유지 | `uq-run-need-input` |
| result | 그리드 | `uq-excel`(엑셀 메뉴) |
| empty | 그리드 빈 문구 | `uq-empty` |
| running | 그리드 loading | |

## 4. 상태 전이 규칙

- 쿼리를 바꾸면 정의, 결과, need-input, 오류를 모두 지운다. 그리드는 `key={queryId}` 로 새로 그린다.
- 한 쿼리 안에서는 그리드를 언마운트하지 않는다. 필수 값 누락이나 실행 실패 때는 행만 비우고 열은 남긴다(`withoutRows`).
- 0건 결과도 그리드를 유지하고 빈 문구만 바꾼다.
- 늦게 온 응답은 epoch 번호가 다르면 버린다.
- 상단 `조회` 는 정의 로딩, 실행 중, 미선택일 때 비활성이다.

## 5. testid 목록(코드 기준)

| testid | 위치 |
|---|---|
| `uq-list` | 목록 뿌리 |
| `uq-list-filter` | 거르기 칸 |
| `uq-list-empty` | 할당 쿼리 없음, 로딩 |
| `uq-list-nomatch` | 거르기 결과 없음 |
| `uq-item-{queryId}` | 목록 항목(선택 시 `aria-current="true"`) |
| `uq-run` | 오른쪽 뿌리 |
| `uq-run-idle`, `uq-run-loading`, `uq-run-error`, `uq-run-ready`, `uq-run-need-input` | 상태 본문 |
| `uq-excel` | 엑셀 내보내기 |
| `uq-empty` | 그리드 빈 결과 |
