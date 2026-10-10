# userQueryMng 분석리포트 (맞춤 레포트 관리)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`
- 구현: `src/frontend/m-mcm/page-components/cmq/userQueryMng/`, `src/frontend/m-mcm/page-components/_userq/`

## 1. As-Is

레거시 없음. 신규 공통 화면이며 2026-10-10 사용자가 설계 게이트를 면제했다(스펙 D1). 원본 자료 `docs/external/` 대조 대상이 없다.

## 2. 입력 자료 인벤토리

| 구분 | 자료 | 용도 |
|---|---|---|
| 설계 정본 | 스펙 §0~§3, §4.1, §5~§8.3 | 계약, 정책, 화면 |
| 재사용(FE) | `widget-types/_query/format`(`QueryParam`, `paramsOf`, `tableConfigOf`, `toColumnDefs`, `appendMissingFields`, `appendUndeclaredParams`, `validateParams`), `_query/ParamsEditor`, `_query/SqlEditor`, `_query/api.ts` 의 `unwrapResult`, `_query/parts` 의 `QueryStyle` | 입력 정의 편집, SQL 칸과 시험 실행, 열 규칙, 응답 해제 |
| 재사용(FE, 이번에 추출) | `widget-types/_query/ColumnsEditor.tsx`(`query-table/editor.tsx` 의 열 표를 뽑음, 조정 허가 `refactor`) | 출력 정의 편집 |
| 재사용(FE, 다른 화면) | shared `LookupModal`, `TransferList`, `GridPanel`, `AgDataGrid`, `SearchArea` | 담당 부서 선택, 할당, 목록 |
| 재사용(BE) | `WidgetQueryRunner.run`(스펙 §5), `SqlGuard`, `WidgetReadOnlyJdbc` | 서버가 미리보기와 검증에서 쓴다 |
| 표 | `TB_MCM_USRQ_DEF`(정의), `TB_MCM_USRQ_ASSIGN`(사용자 할당) | 스펙 §2.1. 관리 화면이 읽고 쓴다 |
| 코드 그룹 | `USRQ_CTG`(공용 쿼리 분류) | 조회조건과 상세의 분류, 목록의 분류 이름 |
| 관련 화면 | `cmq/userQuery`(사용자 화면, 별도 레인) | 여기서 등록한 정의와 할당을 실행한다 |

## 3. 게이트 G1~G7

기준은 `docs/guide/design/templates/analysis-report/04-api-decisions-gaps-gates.md` 의 G1~G7 이다. 레거시 원본이 없으므로 원본 전제 게이트는 해당 없음으로 둔다.

| 게이트 | 판정 | 근거 |
|---|---|---|
| G1 자료 인벤토리 | 통과 | 위 §2. 레거시 자료 5종은 해당 없음(신규) |
| G2 화면 요소 전수성 | 통과 | 기능설계서 §2~§5 가 버튼 4, 조회조건 5, 목록 열 8, 정의 탭 입력, 할당 탭을 모두 적는다 |
| G3 소스 로직 연결성 | 해당 없음 | 레거시 소스 없음 |
| G4 DB 매핑성 | 통과 | 표 2종과 `search` SQL 은 스펙 §2, §4.1 에 있다. 화면은 DB 를 직접 읽지 않는다 |
| G5 업무 규칙 반영성 | 통과 | 쿼리 ID 형식, 최대 행, 입력·출력 정의 검사, 저장 충돌, 할당 상한을 기능설계서 §6 에 반영했다 |
| G6 API 패턴 판정 | 통과 | OASIS 패턴 채택. 근거는 스펙 D5 이다 |
| G7 커버리지 | 통과 | 스펙 §4.1 의 9 action 중 `search`, `get`, `save`, `delete`, `previewQuery`(`SqlEditor` 의 `runPreview` 경유), `validate`, `searchAssign`, `saveAssign`, `searchUserList` 와 추가된 `searchDepts` 를 모두 쓴다(정합체크 §2). |

## 4. 미결(스펙 §12)

| 번호 | 내용 | 처리 |
|---|---|---|
| 1 | 메뉴 폴더 `cmq` 신규 | 사용자 화면 쪽. 이 화면은 `csa` 폴더 |
| 2 | 일반 역할 `PERM_USRQ_USE` 기본 매핑 | 사용자 화면 쪽. 이 화면은 SYSADMIN 만 |
| 3 | 분류 코드 `USRQ_CTG` 처음 값 | 스펙 제안 따름(`ETC 기타` 하나) |
| 4 | 다른 모듈 표 SELECT 권한 | 범위 밖 |
| 5 | 시간 10초, 행 상한 1000(최대 5000) | 스펙 제안 따름. 최대 행 입력 범위 1~5000 |
| 6 | 기간·다중 선택·LoV·상대 날짜·합계 줄 | 범위 밖 |

## 5. 결론

분석 게이트 통과. 구현은 이미 끝났다. BPMN, 서비스, 시드는 be 레인 머지 뒤 대조가 필요하다.
