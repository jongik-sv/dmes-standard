# userQueryMng 기능설계서 (맞춤 레포트 관리)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`

## 1. 화면 식별

| 항목 | 값 |
|---|---|
| screenId = objId = serviceId | `userQueryMng` |
| componentPath | `cmq/userQueryMng` |
| 메뉴 | 공통관리 > 맞춤 레포트 > 맞춤 레포트 관리(폴더 `cmq`, MENU_SEQ 002, FULL_SEQ 1070200. 처음에는 csa 시스템관리 1020230 이었고 2026-10-10 사용자 결정으로 옮겼다) |
| 화면 제목 | 맞춤 레포트 관리 |
| 기본 권한 | SYSADMIN × PERM_ALL |
| 최초 진입 | 조회조건 칸에 사용자 기본값을 넣은 다음 커밋에서 한 번 자동 조회한다(`SearchArea autoSearch`) |

## 2. 버튼

### 2.1 상단(`PageLayout buttons`)

| id | 라벨 | type | action | 동작 | 비활성 조건 |
|---|---|---|---|---|---|
| `btn_search` | 조회(F8) | primary | `search` | 조회조건 5개로 `search` 호출. 목록만 다시 받는다(상세 폼은 그대로) | 조회·상세·할당 처리 중 |
| `btn_new` | 신규 | | `save` | 빈 정의 폼을 연다. 쿼리 ID 를 입력할 수 있다. 정의 탭으로 옮긴다 | 처리 중, 첫 조회 전 |
| `btn_save` | 저장 | save | `save` | 정의 폼을 검사하고 `save` 호출. 성공하면 `get` 으로 새 `ver` 를 받아 폼을 다시 열고 목록을 다시 조회한다 | 처리 중, 선택도 신규도 아님 |
| `btn_delete` | 삭제 | | `delete` | 확인 후 `delete`(`queryId`, `ver`). 할당도 함께 삭제된다 | 처리 중, 저장된 쿼리를 고르지 않음 |

### 2.2 탭 안 버튼

| 위치 | 라벨 | 동작 |
|---|---|---|
| 정의 탭 담당 부서 | 선택, 지움 | `DeptPicker`(`userQueryMng/searchDepts`)로 부서를 고르거나 비운다 |
| 정의 탭 SQL | 쿼리 시험 | `SqlEditor` 의 시험 실행. 50행. 성공하면 결과 열 중 출력 정의에 없는 것만 덧붙인다 |
| 정의 탭 SQL | SQL 검증 | 선언 안 된 `:이름` 을 글자 형 입력 정의로 더한 뒤 `validate` 호출. 바인드 이름을 토스트로 보인다 |
| 정의 탭 입력 정의 | 조건 추가, SQL 에서 가져오기 | `ParamsEditor` 그대로 |
| 정의 탭 출력 정의 | 컬럼 추가, 결과 컬럼 모두 넣기 | `ColumnsEditor`. 모두 넣기는 시험 뒤에만 켜진다 |
| 할당 탭 | 할당 저장(권한 `saveAssign`) | 현재 집합으로 `saveAssign` 호출(전체 교체). 변경이 있을 때만 켜진다 |

## 3. 조회조건

| 칸 | 키 | 종류 | 서버 params |
|---|---|---|---|
| 분류 | `categoryCd` | select(`USRQ_CTG` LoV, 첫 항목 「전체」) | `categoryCd` |
| 쿼리 이름·ID | `keyword` | text | `keyword`(앞뒤 공백 제거) |
| 사용 여부 | `useYn` | select(전체, 사용, 미사용) | `useYn` |
| 담당 부서 | `ownerDept` | text(부서 코드 또는 이름) | `ownerDept` |
| 할당 사용자 | `assignUser` | text(사용자 ID 또는 이름) | `assignUser` |

- 빈 칸은 params 에서 뺀다. 서버가 null 로 읽는다.
- 조회조건은 `SearchArea` 의 사용자 기본값 저장 대상이다(칸마다 `name`, 라벨 사전 연결 `meta={false}`).
- 목록은 수백 행 규모라 첫 조회 상한(limit)을 두지 않는다(audit P-R1 오탐).

## 4. 목록(왼쪽 40%)

| 열 | 키 | 정렬 | 비고 |
|---|---|---|---|
| 쿼리 ID | `queryId` | left | |
| 이름 | `queryNm` | left | |
| 분류 | `categoryNm` | center | `USRQ_CTG` 이름. 모르는 코드는 코드를 그대로 |
| 담당 부서 | `ownerDeptNm` | left | 이름이 없으면 코드 |
| 사용 | `useYn` | center | 배지 「사용」, 「미사용」 |
| 최대 행 | `maxRowCnt` | right | |
| 할당 수 | `assignCnt` | right | |
| 수정일시 | `uAt` | center | `yyyy-MM-dd HH:mm` |

- `AgDataGrid` gridId `userQueryList`, rowKey `queryId`, `columnSizing="fit"`, 선택 행 강조. 0건에도 그리드를 유지한다.
- 조회 실패(한 번도 못 받음)는 패널 제목 옆에 「목록을 불러오지 못했습니다. [조회]로 다시 시도하세요」를 보인다.

## 5. 상세(오른쪽, 탭 정의·할당)

탭을 바꿔도 입력이 남도록 정의 탭과 할당 탭을 모두 마운트하고 보이는 쪽만 연다.

### 5.1 정의 탭 입력

| 항목 | 입력 | 규칙 |
|---|---|---|
| 쿼리 ID * | Input(최대 40) | 신규 때만 입력. 입력값을 대문자로 바꾼다. 저장 뒤에는 읽기 전용 |
| 이름 * | Input(최대 100) | |
| 분류 | Select(없음 + `USRQ_CTG`) | |
| 담당 부서 | 읽기 전용 Input + 선택·지움 | 표시는 「부서명 (코드)」 |
| 설명 | Textarea(최대 500) | 비면 null |
| 최대 행 * | Input number(1~5000) | 기본 1000 |
| 사용 여부 | Radio(사용, 미사용) | 기본 사용 |
| SQL * | `SqlEditor` | 조회문 한 문장 |
| 입력 정의 | `ParamsEditor` | 최대 10개. 이름 형식과 시스템 변수 이름은 `validateParams` 가 검사 |
| 출력 정의 | `ColumnsEditor` | 필드·머리글·폭·정렬·형식. 비면 결과 열 전부 |
| 미리보기 | `PreviewGrid` | 시험 결과 50행을 출력 정의대로 그린다. gridId `userQueryPreview`, 개인화 끔 |

### 5.2 할당 탭

- shared `TransferList`: 왼쪽 「미할당 사용자」, 오른쪽 「할당 사용자」, 검색 칸 「ID·이름 검색」, 부서 분류 필터.
- 후보는 탭이 처음 보일 때 `searchUserList` 를 한 번 받는다(사용 중 사용자, 최대 5000). 잘렸으면 「사용자가 많아 앞 N명만 후보로 보입니다」를 보인다.
- 할당은 쿼리를 고를 때마다 `searchAssign` 으로 받는다. 후보에 없는 할당 사용자는 뒤에 붙인다. 사용자 표에 없는 사용자는 배지 「없는 사용자」를 단다.
- 저장하지 않은 쿼리(신규, 선택 없음)에는 할당할 수 없다. 「쿼리를 저장한 뒤 사용자를 할당할 수 있습니다」를 보인다.
- 할당 상한 2000명. 넘으면 저장 전에 경고한다.

## 6. 검증과 문구

| 구분 | 내용 |
|---|---|
| 화면 검증 순서 | 쿼리 ID 형식(신규) → 이름 → 설명 길이 → 최대 행 → SQL → 입력 정의(`validateParams`) → 출력 정의 필드 비어 있음 |
| 쿼리 ID | `^[A-Z][A-Z0-9_]{2,39}$` |
| 최대 행 | 1~5000 정수 |
| 깊은 검사 | SQL 구문·금지어, 입력 정의 파싱, 출력 정의 열거값은 서버가 한다(스펙 §4.1). 서버 문구를 오류 창에 그대로 보인다 |
| 저장 충돌 | `ver` 가 DB 와 다르면 서버가 「다른 사람이 먼저 고쳤습니다. 다시 조회하세요」로 거절한다 |
| 성공 문구 | 「저장되었습니다.」, 「삭제되었습니다.」(토스트) |
| 삭제 확인 | 「선택한 쿼리를 삭제하시겠습니까? 할당도 함께 삭제됩니다.」 |
| 변경 버림 확인 | 「저장하지 않은 변경을 버릴까요?」(다른 행·신규 선택 때. 정의 또는 할당에 변경이 있을 때) |
| 오류 표시 | `showMessage` error 로 서버 문구 |

## 7. 상태 전이

| 상태 | 설명 |
|---|---|
| mode `none` | 선택 없음. 정의 폼 모두 비활성 |
| mode `new` | 빈 폼. 쿼리 ID 입력 가능. 저장하면 `edit` 로 바뀐다 |
| mode `edit` | 저장된 쿼리. 쿼리 ID 읽기 전용 |

- 쿼리를 열 때마다 시험 결과를 비우고 SQL 칸을 새로 마운트한다(`key`). 이전 쿼리의 시험이 늦게 끝나도 새 폼에 얹지 않는다.
- 저장 성공 뒤 재조회가 실패해도 `edit` 로 남고, 저장 응답의 `ver` 로 폼을 다시 연다.

## 8. 부수 효과

| 대상 | 내용 |
|---|---|
| localStorage `split-sizing`(storageKey `mcm.csa.userQueryMng`) | 목록 폭 |
| 조회조건 사용자 기본값 | `SearchArea` 가 관리 |
| DB | `save`, `delete`, `saveAssign` 이 정의·할당 표를 바꾼다(서버). `delete` 는 할당을 먼저 지운다 |

## 9. 보안 점검

| 점검 | 구현 |
|---|---|
| 권한 | 메뉴 OBJECT 권한(`userQueryMng/{action}`). 버튼 action 으로 비활성. AUTH_ONLY 아님 |
| SQL 등록 | SYSADMIN 만(권한 세트). 서버가 저장·실행 때마다 `SqlGuard` |
| 미리보기 오류 | DB 오류 문구를 그대로 보인다(관리자 SQL 작성 도움, 스펙 §4.1) |
| 할당 | 사용자 ID 는 서버가 검증한다(없는 사용자 거절) |
