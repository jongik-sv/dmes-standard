# mcm 레인 성능 비교 기록

레인은 mcm-core·mcm, 브랜치는 `refactor/mcm` 이다. README.md §6.2 형식을 따른다.
**결정적 지표(쿼리 수)는 P1·P2 가 시험으로 확인됐다**(`CommUserMngServiceSearchSqlCountTest`·`SecUserServiceDeleteSqlCountTest`, 1회). P3 도 `MenuCatalogCallersSelectCountTest` 로 확정했다(14 → 2, 1회).
응답 시간 같은 비결정 지표(P3 보조 지표, P4)는 조정 세션이 「측정 시작」을 알린 뒤에 기준·변경을 번갈아 재서 채운다. 아래 표의 K=30·N=20 같은 측정 절차 규모 수치도 같은 시점에 채운다.
기준(before)은 태그 `refactor-2026-10-base`(b557ccbd)를 별도 워크트리로 만들어 잰다. 변경(after)은 레인 워크트리 `refactor/mcm` 이다.

| 번호 | 항목 | 지표 성격 | 상태 |
|---|---|---|---|
| P1 | `searchCmUser` 부서명 조회 쿼리 수 | 결정적(1회) | 시험 실측 완료(4 → 1), 절차 규모(K=30)는 측정 전 |
| P2 | 사용자 삭제 매핑 삭제 SQL 수 | 결정적(1회) | 시험 실측 완료(SELECT 8 → 0, DELETE 6 → 2), 절차 규모(N=20)는 측정 전 |
| P3 | 메뉴 카탈로그 캐시 SELECT 수·응답 시간 | 결정적(1회) + 시간(반복) | SELECT 수 시험 실측 완료(14 → 2), 응답 시간은 측정 전 |
| P4 | pwdinit SSO 일괄 1,000행 처리 시간 | 시간 | 측정 안 함(구현 안 함) |

## P1. `searchCmUser` 부서명 조회 쿼리 수
- 관련 구조 변경: S6(1번 N+1·전수 로드 정리). S4(`CommUserMngService` 분할) 뒤의 `CommUserMngQueryService` 를 만진다.
- 지표(회): 한 번의 `searchCmUser` 호출이 내는 SELECT 문 수. 사용자 조회(`searchByFilter`) 1회와 ds_mainAll 용 `findAllUserIdEmpNo` 1회는 양쪽 모두 늘 나간다. 옛 경로는 부서코드마다 `findById` 를 하되 없는 부서는 캐시하지 않아 그런 부서를 가진 행마다 다시 조회했으므로, 기준은 2 + (있는 distinct 부서 수 + 없는 부서를 가진 행 수), 변경은 3(붙일 부서코드가 하나도 없으면 2)을 예상한다. `TB_MCM_DEPT_INFO` SELECT 수만 보면(`CommUserMngServiceSearchSqlCountTest` 와 같은 범위) 기준은 있는 부서 수 + 없는 부서 행 수, 변경은 1(코드가 없으면 0)이다.
- 측정 절차:
  1. 기준·변경 양쪽에 같은 측정 시험을 둔다. H2 또는 SQLite 에 사용자 200명·고유 부서 30개(부서코드가 null·공백·없는 부서인 행도 몇 개 섞는다)를 넣는다.
  2. `hibernate.generate_statistics=true`(`Statistics.getPrepareStatementCount()`) 또는 `StatementInspector` 로 SELECT 수를 센다. 호출 전에 통계를 비운다.
  3. `searchCmUser` 를 1회 호출하고, 같은 호출에서 반환 `Map` 의 `DEPT_NM` 값이 양쪽에서 같은지 함께 비교한다(없는 부서·비활성 부서 의미 포함).
  4. 기준 워크트리에는 측정 시험 파일만 복사해 돌린다. 편차가 없는 지표라 1회로 충분하다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 21821142(부서명 일괄 조회), da78ef16(javadoc)
- 측정 환경: 시험 실측(`CommUserMngServiceSearchSqlCountTest`, 결정적, 1회). 단독 여부·전원 연결은 해당 없음. 절차 1~4 의 K=30·사용자 200 규모는 조정 세션 「측정 시작」 뒤에 적는다.
- 시험 근거: 기준 쪽 값은 변경 전 코드(21821142 직전)에 같은 시험을 실제로 돌려 얻었고, 의도대로 실패(부서 표 SELECT 4회, 기대 1)하는 것으로 확인했다. 기준 커밋 b557ccbd 워크트리에서 따로 재지는 않았다(같은 로직).

| 항목 | 기준 | 변경 |
|---|---|---|
| 부서 표(`TB_MCM_DEPT_INFO`) SELECT 수 — 시험 시나리오(사용자 6명, 부서 3개: D01 있음 2행·D02 비활성 1행·D99 없음 2행, 부서코드 null 1명) | 4(D01 1 + D02 1 + D99 2) | 1 |
| SELECT 수(K=30, 사용자 200) | 측정 전 | 측정 전 |

- 중앙값: 해당 없음(결정적 1회). **시험 실측(결정적, 1회): 기준 4 → 변경 1.** 기준 식은 '있는 distinct 부서 수 + 없는 부서를 가진 행 수'(여기서 2 + 2), 변경은 1(부서코드가 없으면 0)이다.
- 판정: 개선(시험 실측 4 → 1, `DEPT_NM` 결과는 1단계 특성 시험이 같음을 확인). 절차 규모의 수치는 측정 전.
- 알려진 차이(MSSQL 의 대소문자·뒤 공백 무시 비교에서만): 부서명 맵의 키가 요청 키가 아니라 DB 가 돌려준 DEPT_CD 라서, 사용자 표 DEPT_CD 가 부서 마스터와 대소문자·뒤 공백만 다르면 전에는 이름이 붙고 지금은 `DEPT_NM` 이 null 이다. Oracle(VARCHAR2)·PostgreSQL·SQLite·H2 에서는 차이가 없고 저장소 DDL 에 CHAR 형 DEPT_CD·NOCASE 콜레이션은 없다. 대소문자 보정은 구분하는 DB 에서 결과를 바꾸므로 코드는 고치지 않는다(`deptNamesOf` javadoc).

## P2. 사용자 삭제(`SecUserService.doSaveUsers` D 분기) 매핑 삭제 SQL 수
- 관련 구조 변경: S6(1번 N+1·전수 로드 정리)
- 지표(회): 사용자 N 명·역할그룹 매핑 M 개일 때 삭제 경로가 내는 DELETE(와 선행 SELECT) 문 수. 현재 N×M+N 건이고 N(또는 1)+N 건을 예상한다.
- 측정 절차:
  1. 측정 시험을 양쪽에 둔다. 사용자 N=20, 사용자당 매핑 M=5(총 100행)를 넣는다. 사용자 계정 저장소는 실제 구현이 `mcm/lib` 에 있어 기존 특성 시험 `SecUserServiceDeleteUsersTest` 처럼 메모리 가짜를 쓴다.
  2. `StatementInspector` 로 DELETE·SELECT 수를 센다. 통계는 호출 직전에 비운다.
  3. D 분기를 1회 호출한 뒤 매핑 테이블 잔여 행이 0 인지, 사용자 삭제 결과가 같은지 확인한다.
  4. 결정적 지표라 1회로 충분하다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 6e5eb813, c9a2f7ee(`flushAutomatically` 제거)
- 측정 환경: 시험 실측(`SecUserServiceDeleteSqlCountTest`, 결정적, 1회). 기준 쪽 값은 변경 전 코드에 같은 시험을 돌려 얻었다(의도대로 DELETE 6회로 실패). 절차의 N=20·M=5 규모는 조정 세션 「측정 시작」 뒤에 적는다.

| 항목 | 기준 | 변경 |
|---|---|---|
| 매핑 표 SELECT 수 — 시험 시나리오(매핑 3개씩 가진 사용자 2명 삭제) | 8(사용자마다 목록 1 + 키별 3) | 0 |
| 매핑 DELETE 수 — 같은 시나리오 | 6 | 2 |
| DELETE 수(N=20, M=5) | 측정 전 | 측정 전 |
| 선행 SELECT 수(N=20, M=5) | 측정 전 | 측정 전 |

- 중앙값: 해당 없음(결정적 1회). **시험 실측(결정적, 1회): 매핑 표 SELECT 8 → 0, DELETE 6 → 2.** 사용자 1명당 기준은 '목록 SELECT 1 + 키별 SELECT M + DELETE M', 변경은 DELETE 1·SELECT 0 이다. 세는 구간은 서비스 호출 직후까지이고 시험의 확인용 `findAll` 은 뺐다.
- 판정: 개선(시험 실측). 단 아래 '알려진 차이' 의 'D' 2행 이상 요청의 flush 시점 차이는 판정에서 따로 본다. 절차 규모의 수치는 측정 전.
- 알려진 차이: 'D' 행이 둘 이상인 요청에서 사용자 계정(TB_SEC_USER) 변경의 flush 시점과 감사 컬럼이 달라진다. 'D' 행이 하나인 요청은 옛 경로와 같다.
  - 매핑 순서: `bulkDeleteByUserId` 는 `@Modifying` 만 쓰고 `flushAutomatically` 를 두지 않는다. Hibernate 가 벌크 DELETE 직전에 영향 표(`TB_MCM_SEC_USER_MAPPING`)에 미뤄 둔 변경이 있으면 auto-flush 하므로(`StandardJdbcMutationExecutor.execute` 첫머리의 `autoFlushIfRequired`), 같은 트랜잭션의 매핑 INSERT → DELETE 순서는 지켜진다. `SecUserServiceDeleteAutoFlushTest` 가 고정한다(flush 없이 저장한 매핑이 같은 트랜잭션의 'D' 행에서 지워진다). 매핑 표에 미뤄 둔 변경이 있어 이 auto-flush 가 일어나면 Hibernate 는 계정까지 전체 flush 한다. 미뤄 둔 매핑 변경이 없으면 계정 변경은 커밋 때 flush 된다.
  - 옛 경로와의 차이: 옛 경로는 'D' 행마다 매핑 ID JPQL SELECT 뒤 매핑마다 `deleteById`(`em.find` + `em.remove`)를 했다. 그래서 앞 'D' 사용자에게 매핑이 있었으면 그 매핑 DELETE 가 큐에 남고, 다음 'D' 행의 JPQL SELECT 가 이를 보고 전체 flush 를 했다. 이때 앞 'U' 행 계정의 UPDATE 와 앞 'D' 사용자의 계정 DELETE 가 먼저 나가고 계정 스냅샷이 다시 맞춰졌다. 지금은 벌크 DELETE 가 바로 실행돼 매핑 표에 미뤄 둔 것이 없으므로 뒤 'D' 행의 auto-flush 검사는 모두 '필요 없음' 으로 끝나고, 계정 변경은 커밋 때 나간다(뒤에 'C' 행이 오면 그 행의 `existsById` 가 `TB_SEC_USER` count 쿼리라 이 표에 미뤄 둔 계정 변경을 보고 `saveUsers` 안에서 전체 flush 한다).
  - 감사 컬럼: Hibernate 7.2 는 '필요 없음' 으로 끝나는 auto-flush 검사에서도 `flushEntities` 를 먼저 돌려 dirty 엔티티의 `@PreUpdate`(`CactusAuditListener`)를 부른다. 그래서 'U' 1행 + 'D' 1행에서도 옛 경로·지금 모두 그 계정의 VER 이 +2 다. 이 이중 증가는 원래 있던 동작이다. 'U' 행 뒤에 'D' 행이 n 개(n ≥ 2, 앞 'D' 사용자에게 매핑 있음) 오면 옛 경로는 +2, 지금은 n+1 이고 U_AT 도 다르다. 예: [U X, D Y(매핑 있음), D Z] 에서 X 의 VER 은 옛 경로 +2, 지금 +3.
  - 오류 시점: 계정 INSERT·UPDATE·DELETE 의 DB 오류(길이·중복·FK)는 옛 경로에서는 두 번째 'D' 행 처리 중 `saveUsers` 안에서 났다. 지금은 커밋 때(또는 뒤 'C' 행의 `existsById` 가 계정 표 flush 를 일으키는 시점) 나거나, 그보다 먼저 뒤 행의 검증 `BusinessException` 이 난다. `AuditLogger.record` 는 성공 때만 같은 트랜잭션에서 감사 행을 남기므로 실패 감사 행은 영향이 없다.
  - 코드는 그대로 둔다. `flushAutomatically` 를 되살리거나 `em.flush()` 로 옛 경로를 흉내 내지 않는다('D' 1행인 경우 옛 경로와 같은 것은 지금 코드다). 지금 `src/frontend` 에서 이 save 를 부르는 곳이 없고, `SecUserServiceDeleteUsersTest`·`SecUserServiceDeleteAutoFlushTest` 는 계정 저장소가 메모리 가짜라 이 차이를 잡지 못한다. 실제 JPA 계정 저장소로 [U X, D Y, D Z] 를 보는 시험은 이 save 를 부르는 화면이 생길 때 더한다.
  - (처음 커밋 6e5eb813 은 `flushAutomatically=true` 를 붙여 첫 'D' 행에서 계정까지 앞당겨 flush 했다. VER 증가 횟수가 옛 경로와 달라지고(위 예에서 +1) DB 오류가 행별 검증 오류보다 먼저 나는 차이가 있어 리뷰에서 뺐다. 커밋 c9a2f7ee 제목의 '옛 경로와 같게' 는 'D' 1행인 경우에만 맞는다.)

## P3. 메뉴 카탈로그 캐시 SELECT 수·응답 시간
- 관련 구조 변경: S3(메뉴 카탈로그 캐시)
- 지표
  - (주) 4곳(`getMyMenus`·`searchFavorites`·`searchStartPgms`·`ScreenMenuCatalog.load`)을 각 2회 부를 때 `TB_MCM_SEC_MENU`·`TB_MCM_SEC_OBJ` 전수 SELECT 문장 수(결정적). 옛 코드는 호출마다 2·2·2·1 문장이다.
  - (보조) `getMyMenus` 응답 시간(ms, 비결정).
- 측정 절차:
  1. SELECT 수(결정적, 1회): `MenuCatalogCallersSelectCountTest`(mcm-core, H2, Hibernate `StatementInspector`)가 4곳을 각 2회 부르고 전수 SELECT 문장 수를 센다. 같은 시험이 캐시를 끈 대조(TTL 0), 저장 이벤트 뒤 재적재, 즐겨찾기·기본 화면 두 토글을 센다. 폴더 표(`TB_MCM_SEC_MENU_FLD`)는 카탈로그에 넣지 않았으므로 세지 않는다(요청마다 읽는 것은 전과 같다).
  2. 응답 시간: 로컬 SQLite 시드 DB 에서 mcm 서버를 기준·변경 각각 띄워 같은 사용자로 `getMyMenus` 를 호출한다. 기준·변경을 번갈아(A·B·A·B…) 각 3회 이상 재고, 서버를 새로 띄운 직후가 아니라 안정화 뒤 값을 쓰며 `uptime` load 를 남긴다. 결론은 중앙값이다.
  3. 응답 시간은 이 PC(MacBook Air M5)의 편차가 크다. 반복 측정 없이 결론 내지 않는다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 5162f3d6, 3ab73e90, 42a8f2fe(레인 커밋 전체는 S3 참조), 최종 HEAD 는 레인 `refactor/mcm-menu`
- 측정 환경: SELECT 수는 시험 실측(`MenuCatalogCallersSelectCountTest`, H2, 결정적, 1회). 기준 쪽 14 는 옛 코드의 호출 구조에서 계산한 값(호출마다 2·2·2·1 문장의 두 배)이다. 응답 시간의 단독 여부·전원 연결·측정 일시는 측정 때 적는다.

SELECT 수(결정적, 1회로 확정):

| 경우 | 전수 SELECT 문장 수(4곳 각 2회, 합계) |
|---|---|
| 바꾸기 전(기준) | 14 |
| 바꾼 뒤(캐시, 첫 호출 적재 뒤 적중) | 2 (MENU 1 + OBJ 1) |
| 캐시 없는 대조(TTL 0) | 16 (8 + 8) |
| 저장 이벤트 뒤 | 한 세트(MENU 1 + OBJ 1 = 2문장)만 재적재 |
| 즐겨찾기·기본 화면 두 토글 | 추가 SELECT 0 |

- 캐시가 비었을 때는 `ScreenMenuCatalog` 도 SEC_OBJ 를 함께 읽어 비적중 1회 비용이 1문장에서 2문장이 됐다. 캐시를 끈 대조가 16 인 이유다(옛 14 보다 2 큼).
- 결정적 지표 판정: **개선(시험 실측). 14 → 2, 1회로 확정.** 캐시를 끄면 오히려 2문장 늘어난다.

응답 시간(ms) — 비결정 지표라 조정 세션 「측정 시작」 뒤에 잰다:

| 회차 | 기준 | 변경 | load(1분) |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

- 중앙값(응답 시간): 기준 측정 전 → 변경 측정 전
- 응답 시간 판정: 측정 전(조정 세션 「측정 시작」 뒤).
- 정합성 사항(성능이 아니라 여기서 판정하지 않는다): 다중 인스턴스·DB 직접 변경은 TTL 5분으로만 반영된다(S3 영향 범위).

## P4. pwdinit SSO 일괄 1,000행 처리 시간
- 관련 구조 변경: 없음. 이번에는 개선안만 보고했다(`structure-mcm.md` 부록 A(2)).
- 지표(초): 사용자 1,000행의 `pwdinit` SSO 일괄 처리 시간(bcrypt 비용 불변).
- 상태: **측정 안 함(구현 안 함).** 구현하면 기준 대비 해시 계산 병렬화·JDBC batch 효과를 이 항목에서 잰다.
- 기준 커밋: refactor-2026-10-base(b557ccbd) / 변경 커밋: 예정(구현 시)
- 판정: 해당 없음
