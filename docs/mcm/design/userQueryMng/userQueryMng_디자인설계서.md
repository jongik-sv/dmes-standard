# userQueryMng 디자인설계서 (맞춤 레포트 관리)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

## 1. 레이아웃

```
PageLayout (title 맞춤 레포트 관리, breadcrumb 공통관리 > 맞춤 레포트 > 맞춤 레포트 관리)
  buttons: 조회(F8) · 신규 · 저장 · 삭제
  SearchArea autoSearch   분류 · 쿼리 이름·ID · 사용 여부 · 담당 부서 · 할당 사용자
  ContentBody root resizable storageKey="mcm.csa.userQueryMng"
    ContentPanel width="40%"   QueryListPanel (GridPanel 「쿼리 목록」)
    ContentPanel               Tabs [정의] [할당]
                                 정의: DefTab (DETAIL 표)
                                 할당: AssignTab (TransferList + [할당 저장])
```

- 폭 조절 값은 `split-sizing` 이 사용자별로 기억한다. 코드에 별도 반응형 분기는 없다.
- 오른쪽 패널의 탭 본문은 각자 세로 스크롤한다(`flex: 1 1 0`, `min-height: 0`, `overflow-y: auto`). 탭 본문 두 개를 모두 마운트하고 `hidden` 속성으로 가린다.

## 2. 사용 컴포넌트

| 컴포넌트 | 출처 | 설정 |
|---|---|---|
| `PageLayout`, `ContentBody`, `ContentPanel`, `SearchArea`, `SearchField` | `@dk-oasis/shared/layout` | 위 레이아웃. 조회조건 칸마다 `name`, `meta={false}` |
| `Tabs` | `@dk-oasis/shared/tabs` | 항목 정의, 할당 |
| `GridPanel`, `AgDataGrid`, `GridBadge` | `@dk-oasis/shared/grid` | 목록: gridId `userQueryList`, `columnSizing="fit"`. 미리보기: gridId `userQueryPreview`, `height="auto"`, `personalize={false}` |
| `DETAIL_TABLE_STYLE`, `DETAIL_LABEL_CELL`, `DETAIL_VALUE_CELL` | `@dk-oasis/shared/layout` | 정의 탭 라벨-값 표 |
| `Input`, `Select`, `Radio`, `Textarea`, `Button` | `@dk-oasis/shared/form` | 정의 탭 입력 |
| `SqlEditor` | `widget-types/_query/SqlEditor` | SQL 칸과 쿼리 시험. `SqlCodeEditor`(Monaco) 기반이고 `runPreview` 로 `userQueryMng/previewQuery` 를 부른다 |
| `ParamsEditor` | `widget-types/_query/ParamsEditor` | 입력 정의 |
| `ColumnsEditor` | `widget-types/_query/ColumnsEditor` | 출력 정의. idPrefix `userq-col`, testId `userq-columns` |
| `QueryStyle` | `widget-types/_query/parts` | `wq-*` CSS 주입 |
| `DeptPicker` | `cmq/userQueryMng/DeptPicker`(shared `LookupModal` + `userQueryMng/searchDepts`) | 담당 부서 팝업 |
| `TransferList` | `@dk-oasis/shared/transfer-list` | testId `userq-assign`, 부서 분류 필터, 배지 「없는 사용자」 |

- 색은 의미 토큰(`var(--color-…)`)만 쓴다. 화면 CSS 파일은 없다.

## 3. 화면 상태

| 상태 | 표시 | testid |
|---|---|---|
| 목록 로딩 | 그리드 loading | |
| 목록 실패 | 패널 제목 옆 오류 문구(role alert) | `userq-admin-load-error` |
| 선택 없음 | 정의 폼 모든 칸 비활성 | `userq-admin-def` |
| 신규 | 쿼리 ID 입력 가능, 나머지 기본값 | `userq-admin-query-id` |
| 저장된 쿼리 | 쿼리 ID 읽기 전용 | |
| 시험 결과 있음 | 미리보기 그리드 + 필드 선택 목록. 잘렸으면 「상위 N행만 표시합니다」 | `userq-admin-preview` |
| 할당 후보 잘림 | 안내 줄 | `userq-admin-assign-truncated` |
| 할당 후보 실패 | 오류 줄 | `userq-admin-assign-error` |
| 저장 전 쿼리의 할당 탭 | 안내 줄 「쿼리를 저장한 뒤 사용자를 할당할 수 있습니다」 | |

## 4. 상태 전이 규칙

- 쿼리를 바꾸면 정의 폼 기준값을 새로 잡고 시험 결과를 비운다. 할당 탭은 목록을 바로 비우고 새 응답이 올 때만 채운다(늦은 응답은 버린다).
- 시험이 성공하면 출력 정의에 없는 결과 열만 뒤에 덧붙인다. 있는 열은 지우지 않는다.
- 처리 중(목록·상세·할당)에는 상단 버튼과 행 선택을 막는다.
- 저장하지 않은 변경(정의 또는 할당)이 있을 때 다른 행·신규를 고르면 확인 창을 띄운다.

## 5. testid 목록(코드 기준)

| testid | 위치 |
|---|---|
| `userq-admin-list` | 목록 패널 감싸기(`display: contents`) |
| `userq-admin-detail` | 상세 패널 감싸기 |
| `userq-admin-def` | 정의 탭 표 |
| `userq-admin-query-id`, `userq-admin-query-nm`, `userq-admin-category`, `userq-admin-owner-dept`, `userq-admin-dept-pick`, `userq-admin-dept-clear`, `userq-admin-max-row` | 정의 탭 입력 |
| `userq-admin-validate` | SQL 검증 버튼 |
| `userq-admin-preview` | 미리보기 그리드 |
| `userq-columns`, `userq-col-*` | 출력 정의 목록, 버튼 |
| `userq-admin-assign`, `userq-admin-assign-save`, `userq-assign-*` | 할당 탭, 저장 버튼, 전송 목록 |
| `userq-admin-load-error`, `userq-admin-assign-error`, `userq-admin-assign-truncated` | 오류·안내 |
