# userQuery 분석리포트 (맞춤 레포트 조회, 사용자 화면)

- 날짜: 2026-10-10
- 작성 방식: 구현 후 사후 작성(스펙 D1 면제 후속)
- 스펙: `docs/superpowers/specs/2026-10-10-user-query-program-design.md`
- 구현: `src/frontend/m-mcm/page-components/cmq/userQuery/`

## 1. As-Is

레거시 없음. 신규 공통 화면이며 2026-10-10 사용자가 설계 게이트를 면제했다(스펙 D1). 원본 자료 `docs/external/` 대조 대상이 없다.

## 2. 입력 자료 인벤토리

| 구분 | 자료 | 용도 |
|---|---|---|
| 설계 정본 | 스펙 §0, §1, §4.2, §5~§8 | 계약, 정책, 화면 |
| 재사용(FE) | `widget-types/_query/format`, `ConditionBar.tsx` 의 `ConditionField`, `_query/api.ts` 의 `unwrapResult` | 입력 정의, 열 규칙, 조건 칸, 응답 해제 |
| 재사용(BE) | `WidgetQueryRunner.run`(스펙 §5), `SqlGuard`, `WidgetReadOnlyJdbc`, `WidgetUserQuota` | 실행 엔진 |
| 표 | `TB_MCM_USRQ_DEF`(정의), `TB_MCM_USRQ_ASSIGN`(사용자 할당) | userQuery 는 읽기만 한다 |
| 코드 그룹 | `USRQ_CTG` | 목록 분류 이름 |
| 관련 화면 | `cmq/userQueryMng`(관리, 별도 레인) | 정의·할당 등록 |

## 3. 게이트 G1~G7

기준은 `docs/guide/design/templates/analysis-report/04-api-decisions-gaps-gates.md` 의 G1~G7 이다. 레거시 원본이 없으므로 원본 전제 게이트는 해당 없음으로 둔다.

| 게이트 | 판정 | 근거 |
|---|---|---|
| G1 자료 인벤토리 | 통과 | 위 §2. 레거시 자료 5종은 해당 없음(신규) |
| G2 화면 요소 전수성 | 통과 | 기능설계서 §2~§4 가 버튼 1, 목록, 조건, 그리드를 모두 적는다 |
| G3 소스 로직 연결성 | 해당 없음 | 레거시 소스 없음 |
| G4 DB 매핑성 | 통과 | 표 2종과 `myList` SQL 은 스펙 §2, §4.2 에 있다. 화면은 DB 를 직접 읽지 않는다 |
| G5 업무 규칙 반영성 | 통과 | 필수 값, 할당 확인, 행·시간·빈도 상한을 기능설계서 §6 에 반영했다 |
| G6 API 패턴 판정 | 통과 | OASIS 패턴 채택. 근거는 스펙 D5 이다 |
| G7 커버리지 | 통과 | 스펙 §4.2 의 3 action 을 `api.ts` 가 모두 부른다(정합체크 §2) |

## 4. 미결(스펙 §12)

| 번호 | 내용 | 처리 |
|---|---|---|
| 1 | 메뉴 폴더 `cmq` 신규 | 스펙 제안 따름 |
| 2 | 일반 역할 `PERM_USRQ_USE` 기본 매핑 | 스펙 제안 따름(이번 시드는 SYSADMIN 만) |
| 3 | 분류 코드 `USRQ_CTG` 처음 값 | 스펙 제안 따름(`ETC 기타` 하나) |
| 4 | 다른 모듈 표 SELECT 권한 | 범위 밖 |
| 5 | 시간 10초, 행 상한 1000(최대 5000) | 스펙 제안 따름 |
| 6 | 기간·다중 선택·LoV·상대 날짜·합계 줄 | 범위 밖 |

## 5. 결론

분석 게이트 통과. 구현은 이미 끝났다. BPMN 쪽은 be 레인 머지 뒤 대조가 필요하다.
