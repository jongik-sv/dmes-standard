# mcm 레인 성능 비교 기록

레인은 mcm-core·mcm, 브랜치는 `refactor/mcm` 이다. README.md §6.2 형식을 따른다.
**전 항목 측정 전이다.** 아래는 항목·지표·측정 절차만 적었고 수치는 조정 세션이 「측정 시작」을 알린 뒤에 채운다.
기준(before)은 태그 `refactor-2026-10-base`(b557ccbd)를 별도 워크트리로 만들어 잰다. 변경(after)은 레인 워크트리 `refactor/mcm` 이다.

| 번호 | 항목 | 지표 성격 | 상태 |
|---|---|---|---|
| P1 | `searchCmUser` 부서명 조회 쿼리 수 | 결정적(1회) | 측정 전 |
| P2 | 사용자 삭제 매핑 삭제 SQL 수 | 결정적(1회) | 측정 전 |
| P3 | 메뉴 카탈로그 캐시 SELECT 수·응답 시간 | 결정적 + 시간(반복) | 측정 전 |
| P4 | pwdinit SSO 일괄 1,000행 처리 시간 | 시간 | 측정 안 함(구현 안 함) |

## P1. `searchCmUser` 부서명 조회 쿼리 수
- 관련 구조 변경: 1번 N+1 정리(진행 예정). S4(`CommUserMngService` 분할)와 같은 파일을 만진다.
- 지표(회): 한 번의 `searchCmUser` 호출이 내는 SELECT 문 수. 고유 부서 K 개일 때 K+1 → 2 를 예상한다(부서 일괄 조회 1회 + 사용자 조회 1회).
- 측정 절차:
  1. 기준·변경 양쪽에 같은 측정 시험을 둔다. H2 또는 SQLite 에 사용자 200명·고유 부서 30개(부서코드가 null·공백·없는 부서인 행도 몇 개 섞는다)를 넣는다.
  2. `hibernate.generate_statistics=true`(`Statistics.getPrepareStatementCount()`) 또는 `StatementInspector` 로 SELECT 수를 센다. 호출 전에 통계를 비운다.
  3. `searchCmUser` 를 1회 호출하고, 같은 호출에서 반환 `Map` 의 `DEPT_NM` 값이 양쪽에서 같은지 함께 비교한다(없는 부서·비활성 부서 의미 포함).
  4. 기준 워크트리에는 측정 시험 파일만 복사해 돌린다. 편차가 없는 지표라 1회로 충분하다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 예정
- 측정 환경: 단독 여부·전원 연결·측정 일시는 측정 때 적는다.

| 항목 | 기준 | 변경 |
|---|---|---|
| SELECT 수(K=30, 사용자 200) | | |

- 중앙값: 해당 없음(결정적 1회). 기준 <값> → 변경 <값>
- 판정: 측정 전

## P2. 사용자 삭제(`SecUserService.doSaveUsers` D 분기) 매핑 삭제 SQL 수
- 관련 구조 변경: 1번 N+1 정리(진행 예정)
- 지표(회): 사용자 N 명·역할그룹 매핑 M 개일 때 삭제 경로가 내는 DELETE(와 선행 SELECT) 문 수. 현재 N×M+N 건이고 N(또는 1)+N 건을 예상한다.
- 측정 절차:
  1. 측정 시험을 양쪽에 둔다. 사용자 N=20, 사용자당 매핑 M=5(총 100행)를 넣는다. 사용자 계정 저장소는 실제 구현이 `mcm/lib` 에 있어 기존 특성 시험 `SecUserServiceDeleteUsersTest` 처럼 메모리 가짜를 쓴다.
  2. `StatementInspector` 로 DELETE·SELECT 수를 센다. 통계는 호출 직전에 비운다.
  3. D 분기를 1회 호출한 뒤 매핑 테이블 잔여 행이 0 인지, 사용자 삭제 결과가 같은지 확인한다.
  4. 결정적 지표라 1회로 충분하다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 예정
- 측정 환경: 측정 때 적는다.

| 항목 | 기준 | 변경 |
|---|---|---|
| DELETE 수(N=20, M=5) | | |
| 선행 SELECT 수 | | |

- 중앙값: 해당 없음(결정적 1회)
- 판정: 측정 전

## P3. 메뉴 카탈로그 캐시 SELECT 수·응답 시간
- 관련 구조 변경: S3(예정, 메뉴 카탈로그 캐시)
- 지표
  - (주) 호출당 `TB_MCM_SEC_MENU`·`TB_MCM_SEC_OBJ` 전수 SELECT 수(회). 대상은 `getMyMenus`·`searchFavorites`·`searchStartPgms`·`ScreenMenuCatalog.load`. 현재 호출마다 2회(MENU 1 + OBJ 1)이고, 캐시 적중 시 0, 메뉴·OBJ 저장 직후 첫 호출에 1회 재적재(2회 SELECT)를 예상한다.
  - (보조) `getMyMenus` 응답 시간(ms).
- 측정 절차:
  1. SELECT 수(결정적, 1회): 측정 시험에서 `StatementInspector` 로 위 4개 호출 각각을 연속 2회 부르고 호출별 SELECT 수를 센다. 이어 메뉴 저장(`CommMenuMngService` 저장)을 한 번 하고 같은 호출을 다시 불러 재적재 횟수를 센다. 폴더(`TB_MCM_SEC_MENU_FLD`) 조회 수는 따로 적는다.
  2. 응답 시간: 로컬 SQLite 시드 DB 에서 mcm 서버를 기준·변경 각각 띄워 같은 사용자로 `getMyMenus` 를 호출한다. 기준·변경을 번갈아(A·B·A·B…) 각 3회 이상 재고, 회차마다 서버를 새로 띄운 직후가 아닌 안정화 뒤 값을 쓰며 `uptime` load 를 남긴다. 결론은 중앙값이다.
  3. 응답 시간은 이 PC(MacBook Air M5)의 편차가 크다. 반복 측정 없이 결론 내지 않는다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 예정
- 측정 환경: 단독 여부·전원 연결·측정 일시는 측정 때 적는다.

SELECT 수(1회):

| 호출 | 기준(연속 2회째) | 변경(적중) | 변경(저장 직후 1회째) |
|---|---|---|---|
| getMyMenus | | | |
| searchFavorites | | | |
| searchStartPgms | | | |
| ScreenMenuCatalog.load | | | |

응답 시간(ms):

| 회차 | 기준 | 변경 | load(1분) |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

- 중앙값: 기준 <값> → 변경 <값> (<증감 %>)
- 판정: 측정 전. 다중 인스턴스·DB 직접 변경은 TTL 로만 반영되는 점(S3 에서 정리 예정)은 성능이 아니라 정합성 사항이라 여기서 판정하지 않는다.

## P4. pwdinit SSO 일괄 1,000행 처리 시간
- 관련 구조 변경: 없음. 이번에는 개선안만 보고했다(`structure-mcm.md` 부록 A(2)).
- 지표(초): 사용자 1,000행의 `pwdinit` SSO 일괄 처리 시간(bcrypt 비용 불변).
- 상태: **측정 안 함(구현 안 함).** 구현하면 기준 대비 해시 계산 병렬화·JDBC batch 효과를 이 항목에서 잰다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 예정(구현 시)
- 판정: 해당 없음
