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
- 알려진 차이(MSSQL 의 대소문자·뒤 공백 무시 비교에서만): 부서명 맵의 키가 요청 키가 아니라 DB 가 돌려준 DEPT_CD 라서, 사용자 표 DEPT_CD 가 부서 마스터와 대소문자·뒤 공백만 다르면 전에는 이름이 붙고 지금은 `DEPT_NM` 이 null 이다. Oracle(VARCHAR2)·PostgreSQL·SQLite·H2 에서는 차이가 없고 저장소 DDL 에 CHAR 형 DEPT_CD·NOCASE 콜레이션은 없다. 대소문자 보정은 구분하는 DB 에서 결과를 바꾸므로 코드는 고치지 않는다(`deptNamesOf` javadoc).

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
- 알려진 차이: 'D' 행이 둘 이상인 요청에서 사용자 계정(TB_SEC_USER) 변경의 flush 시점과 감사 컬럼이 달라진다. 'D' 행이 하나인 요청은 옛 경로와 같다.
  - 매핑 순서: `bulkDeleteByUserId` 는 `@Modifying` 만 쓰고 `flushAutomatically` 를 두지 않는다. Hibernate 가 벌크 DELETE 직전에 영향 표(`TB_MCM_SEC_USER_MAPPING`)에 미뤄 둔 변경이 있으면 auto-flush 하므로(`StandardJdbcMutationExecutor.execute` 첫머리의 `autoFlushIfRequired`), 같은 트랜잭션의 매핑 INSERT → DELETE 순서는 지켜진다. `SecUserServiceDeleteAutoFlushTest` 가 고정한다(flush 없이 저장한 매핑이 같은 트랜잭션의 'D' 행에서 지워진다). 매핑 표에 미뤄 둔 변경이 있어 이 auto-flush 가 일어나면 Hibernate 는 계정까지 전체 flush 한다. 미뤄 둔 매핑 변경이 없으면 계정 변경은 커밋 때 flush 된다.
  - 옛 경로와의 차이: 옛 경로는 'D' 행마다 매핑 ID JPQL SELECT 뒤 매핑마다 `deleteById`(`em.find` + `em.remove`)를 했다. 그래서 앞 'D' 사용자에게 매핑이 있었으면 그 매핑 DELETE 가 큐에 남고, 다음 'D' 행의 JPQL SELECT 가 이를 보고 전체 flush 를 했다. 이때 앞 'U' 행 계정의 UPDATE 와 앞 'D' 사용자의 계정 DELETE 가 먼저 나가고 계정 스냅샷이 다시 맞춰졌다. 지금은 벌크 DELETE 가 바로 실행돼 매핑 표에 미뤄 둔 것이 없으므로 뒤 'D' 행의 auto-flush 검사는 모두 '필요 없음' 으로 끝나고, 계정 변경은 커밋 때 나간다.
  - 감사 컬럼: Hibernate 7.2 는 '필요 없음' 으로 끝나는 auto-flush 검사에서도 `flushEntities` 를 먼저 돌려 dirty 엔티티의 `@PreUpdate`(`CactusAuditListener`)를 부른다. 그래서 'U' 1행 + 'D' 1행에서도 옛 경로·지금 모두 그 계정의 VER 이 +2 다. 이 이중 증가는 원래 있던 동작이다. 'U' 행 뒤에 'D' 행이 n 개(n ≥ 2, 앞 'D' 사용자에게 매핑 있음) 오면 옛 경로는 +2, 지금은 n+1 이고 U_AT 도 다르다. 예: [U X, D Y(매핑 있음), D Z] 에서 X 의 VER 은 옛 경로 +2, 지금 +3.
  - 오류 시점: 계정 UPDATE·DELETE 의 DB 오류(길이·FK)는 옛 경로에서는 두 번째 'D' 행 처리 중 `saveUsers` 안에서 났다. 지금은 커밋 때 나거나, 그보다 먼저 뒤 행의 검증 `BusinessException` 이 난다. `AuditLogger.record` 는 성공 때만 같은 트랜잭션에서 감사 행을 남기므로 실패 감사 행은 영향이 없다.
  - 코드는 그대로 둔다. `flushAutomatically` 를 되살리거나 `em.flush()` 로 옛 경로를 흉내 내지 않는다('D' 1행인 경우 옛 경로와 같은 것은 지금 코드다). 지금 `src/frontend` 에서 이 save 를 부르는 곳이 없고, `SecUserServiceDeleteUsersTest`·`SecUserServiceDeleteAutoFlushTest` 는 계정 저장소가 메모리 가짜라 이 차이를 잡지 못한다. 실제 JPA 계정 저장소로 [U X, D Y, D Z] 를 보는 시험은 이 save 를 부르는 화면이 생길 때 더한다.
  - (처음 커밋 6e5eb813 은 `flushAutomatically=true` 를 붙여 첫 'D' 행에서 계정까지 앞당겨 flush 했다. VER 증가 횟수가 옛 경로와 달라지고(위 예에서 +1) DB 오류가 행별 검증 오류보다 먼저 나는 차이가 있어 리뷰에서 뺐다. 커밋 c9a2f7ee 제목의 '옛 경로와 같게' 는 'D' 1행인 경우에만 맞는다.)

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
