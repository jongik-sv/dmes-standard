# TSK-01-02 설계 — 전사 공유 계약: 공통·버전 상태 (계약 전용)

> 주문 `eb6fdb44-1c77-4366-bd4f-9e9c7b45a318` · category infra · domain database · model opus · 작성 2026-09-24 (Design Phase, 무인 모드)
> 입력: `spec.md`(요구사항 데이터) · wbs.md v1.3 TSK-01-02(88행)·TSK-01-03(131행) · `naming-dialect-rules.md` · ADR-0001~0003 · decisions.md D-012~D-019 · `screens/README.md` · PRD·TRD · 선행 `tasks/TSK-02-01/design.md` · 스캐폴드 `tasks/TSK-01-01/design.md` · 원천 설계 `/Users/jji/project/mdm/docs/design/basic/`(01·02·04·05·06) · 리포 코드
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 관례 > 미승인 선행 산출물(TSK-02-01·TSK-01-01 은 머지됐으나 미승인)
> 게이트 기준선(브랜치 생성 직후): backend `testAll` 395 tests / 0 failures, m-mdm `test` 1 passed, m-mdm `tsc --noEmit` 통과, m-mcm eslint 기존 실패 23 errors / 44 warnings(무관).

## 위임자 지시 (팀장 원문 요지 — 전 Phase 제약)

> "[팀장 지시 eb6fdb44] D'Flow 서버 spec 에 적힌 화면 그룹 `mdt` 경로는 낡은 값이다. dev 의 저장소 문서를 정본으로 따르라. 선행 TSK-02-01 이 화면 그룹을 dma~dme 로 확정했다. 정본은 docs/mdm/screens/README.md, docs/mdm/adr/0003-module-boundary-screens-roles.md, docs/mdm/wbs.md v1.3, docs/mdm/decisions.md D-012~019 이다. FE 경로는 `m-mdm/pages/{group}/{screenId}/page.tsx` 이다(`src/pages` 아님). 할 일: TSK-01-01 이 만든 샘플 화면 `mdt/mdmSample` 을 `dma` 로 옮기거나 지운다. 옮기거나 지울 때 메뉴 시드·tsup entry·pages 폴더·스모크 테스트·page-registry 를 함께 맞춘다. 메뉴는 기존 마스터관리·업무기준관리 메뉴를 고치지 말고 새 메뉴로 등록한다(사용자 결정)."

오케스트레이터가 정한 처리 방식(이 설계에 반영):
- 샘플은 **삭제하지 않고 `git mv` 로 `dma/mdmSample` 로 옮긴다.** 계약 작업과 **별도 커밋**으로 나눈다(D1). 저장소 문서(wbs:147, ADR-0003:82, screens/README:61)는 이 이동을 TSK-01-03 에 배정했지만 팀장 지시가 우선한다. 그 선행 문서의 "TSK-01-03 이 옮긴다" 문구는 **고치지 않는다.**
- 메뉴 시드는 샘플 자기 행(과 그 부모 폴더)의 경로만 바꾼다. MDM 메뉴 트리 전체는 TSK-01-03 소관이다. 기존 마스터관리·업무기준관리 메뉴는 건드리지 않는다.
- E2E 는 빈 포트로 직접 띄운 서버를 가리킨다(§3.5). `be-run.sh`·`fe-run.sh` 금지.

## spec 과 저장소 정본의 차이 (명시)

| 항목 | spec(D'Flow 서버) | 저장소 정본 | 따르는 것 |
|---|---|---|---|
| 화면 그룹 코드 | `mdt/mdl/mdc/mdd/mdr/mda` | `dma/dmb/dmc/dmd/dme`(결재 그룹은 보류, 나중에 `dmf`) — wbs v1.3:106, screens/README §2, ADR-0003 D1, decisions D-015 | 저장소 정본(팀장 지시). spec 은 wbs v1.3 재업로드 전의 낡은 값이다 |
| FE 경로 | (언급 없음) | `src/frontend/m-mdm/pages/{group}/{screenId}/page.tsx` | 저장소 정본 |
| `TB_MDM_SYSTEM.self_yn` | 있음 | 원천 02:764-771 에는 `system_code`·`system_name` 두 칼럼뿐이고 자기 행 표시 칼럼이 없다 | spec(1순위). 원천이 문장으로만 둔 "자기 행"(01:11·266, 02:211, 05:352)을 칼럼으로 옮긴 것 |
| 초기 행 `system_name` | (언급 없음) | 원천에 값 없음(01:195 는 목록만) | D10 |

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | mdm 백엔드는 `lib`(계약·업무 코드 자리)와 `api`(부트 앱, 리소스)로 나뉜다. lib main 에는 `package-info.java` 하나뿐이고, lib test 에 `MdmEngineDependencySmokeTest`, api test 에 `MdmApplicationHealthTest`(SQLite `@TempDir` + `@DynamicPropertySource` 로 URL 주입)·`MdmFlywayVersionParityTest` 가 있다 | `src/backend/mdm/**` |
| F2 | Flyway 는 `api/src/main/resources/db/migration/mdm/{sqlite,mssql}/V1__baseline.sql`(주석뿐)이다. 프로파일별 locations: local → `classpath:db/migration/mdm/sqlite`, local-db → `…/mssql`, wildfly → Flyway 끔 | `application-local.yml:11`, `application-local-db.yml:14`, `application-wildfly.yml` |
| F3 | mdm 은 `LocalSqliteDataSource` 를 쓰지 않는다(`MdmApplication` 이 호출하지 않음). 그래서 테스트의 `spring.datasource.url` 주입이 그대로 먹는다. mcm 은 반대로 이 클래스가 URL 을 `addFirst` 로 덮는다(아래 F17) | `MdmApplication.java`, `cactus-core/.../local/LocalSqliteDataSource.java:38-44` |
| F4 | lib 은 `mcm-core`·`cactus-core`·`maru-mdm-engine` 을 `api` 로 의존하고, `mssql-jdbc 12.8.1.jre11`·`flyway-sqlserver` 를 runtimeOnly 로 둔다. 테스트는 `maxParallelForks = 1`(SQLite 파일 락) | `mdm/lib/build.gradle` |
| F5 | `flyway-migration-add` 의 `migration_tool.py` 는 `--module` 선택지가 `aps-core`·`mcm-core` 뿐이다. `--module mdm` 은 argparse 오류로 끝난다. → **mdm 미지원 판정.** 규칙표 §5 의 대체 규칙(두 방언 합집합 최댓값 + 1)을 손으로 적용한다 → 이번 번호는 **V2**(현재 두 방언 모두 V1 뿐) | 실행 결과 `invalid choice: 'mdm' (choose from 'aps-core', 'mcm-core')` |
| F6 | cactus-core `ErrorCode` enum 에 409 항목이 없다(E0xx 400, A0xx 401/403, S0xx 500). `BusinessException(ErrorCode, String, List<ErrorDetail>)` 이고 `ErrorDetail(grid,rowKey,rowIndex,field,code,message)` 의 `code` 는 자유 문자열이다. OASIS 경로(`OasisServiceExecutor:113-118`)는 `BusinessException` 을 잡아 `CactusResponse` 의 `meta.code` 로 돌려주고 HTTP 상태를 바꾸지 않는다. `GlobalExceptionHandler` 만 `ErrorCode.httpStatus` 를 HTTP 상태로 쓴다. mls 등 모듈 전용 오류 enum 선례는 없다 | `cactus-core/.../common/ErrorCode.java`, `BusinessException.java`, `web/response/ErrorDetail.java`, `oasis/OasisServiceExecutor.java`, `web/exception/GlobalExceptionHandler.java` |
| F7 | `CactusAuditEntity` 는 감사 9칼럼을 매핑한다: `C_USR_ID`(100)·`C_AT`(**Instant**)·`C_SVC_ID`·`C_PGM_ID`·`U_USR_ID`·`U_AT`(Instant)·`U_SVC_ID`·`U_PGM_ID`·`VER`(Long, `@Version` 아님). `CactusAuditListener` 가 `AuditHolder`(OASIS 요청 문맥)에서 사용자·서비스·메뉴를 채운다 | `cactus-core/.../audit/CactusAuditEntity.java:23-52`, `CactusAuditListener.java:24-59` |
| F8 | mls V2 는 한 방언(SQLite)뿐이고 `C_AT TIMESTAMP` 를 쓴다. **MSSQL 에서 `TIMESTAMP` 는 rowversion 동의어라 한 테이블에 둘을 둘 수 없다.** MSSQL DDL 은 반드시 `DATETIME2` 를 쓴다(규칙표 §2 와 같다) | `mls/api/.../db/migration/mls/V2__create_notice.sql` |
| F9 | ArchUnit 선례: `com.tngtech.archunit:archunit-junit5:1.3.0`(Gradle 캐시에 있음) — `maru-mdm-engine/.../arch/MaruMdmEngineArchitectureTest.java`, `mcm-core/.../arch/McmCoreArchitectureTest.java`(`ClassFileImporter().withImportOption(DO_NOT_INCLUDE_TESTS).importPackages(…)`, `noClasses()…should().dependOnClassesThat()…`) | 두 파일 |
| F10 | mcm-core 의 As-Is 마스터 자산: `com.dongkuk.dmes.mcm.entity.{MasterCode, MasterCodeCategory, MasterCodeCategoryId, MasterCodeDetail, MasterCodeDetailId, MasterRuleColList, MasterRuleColListId, RuleMaster}`, `com.dongkuk.dmes.mcm.repository.{MasterCode*, MasterRuleColList*, RuleMaster*}Repository`, 패키지 `com.dongkuk.dmes.mcm.{cma,cmb,cme,code}..` | `ls mcm-core/src/main/java/com/dongkuk/dmes/mcm/**` |
| F11 | 방언 판정 선례: mcm-core `McmAuditStatementInspector.isSqlite()`(정적 플래그, `JpaConfig` 가 dialect 문자열로 주입), `DataInitializer.detectSqliteDialect()`(DB product name), cactus-core `DialectDetector.detect(jdbcUrl, driver)`(미사용). mdm 에는 방언 판정 코드가 없다 | 각 파일 |
| F12 | `McmAuditStatementInspector` 는 mdm 에 등록되지 않았다(`application*.yml` 에 `statement_inspector` 없음). ADR-0001 D2·D-013 은 이 상태를 유지하라고 한다 | `mdm/api/src/main/resources/application*.yml` |
| F13 | **Docker 상태**: 팀장 메모와 달리 착수 시 OrbStack 데몬은 `Stopped` 였다(`docker info` → socket 없음). Design 이 `orb start` 로 켰다. 켜는 순간 남의 컨테이너 3개(`lect_postgres`·`hani-postgres`·`hani-redis`, restart 정책)가 같이 올라온다. `/var/run/docker.sock` → `~/.orbstack/run/docker.sock` 링크가 있다. 호스트는 arm64(Apple M5), Rosetta 설치됨 | `orb status`, `docker info`, `ls -la /var/run/docker.sock` |
| F14 | **MSSQL 수동 실측(2026-09-24)**: `mcr.microsoft.com/mssql/server:2022-latest`(= `2022-CU27-ubuntu-22.04`, digest `sha256:5b0916c7…0637`, SQL Server 2022 RTM-CU27 16.0.4295.3 X64, amd64 이미지를 Rosetta 에뮬레이션)를 OrbStack 에서 띄우고 §2.3 의 MSSQL DDL·시드를 `sqlcmd` 로 적용했다. 결과: 적용 성공, 6행, 두 번째 `SELF_YN='Y'` INSERT → Msg 2601(UX 인덱스), `'y'` → Msg 547(CHECK), `'erp'` 는 `'ERP'` 와 다른 키로 들어감(BIN2). DB 기본 콜레이션은 `SQL_Latin1_General_CP1_CI_AS`, 호환 수준 160 | 수동 실측 |
| F15 | **실측으로 찾은 함정 2건**: ① `sqlcmd` 기본은 `QUOTED_IDENTIFIER OFF` 라 필터 인덱스 생성이 Msg 1934 로 실패한다(`-I` 필요). JDBC(Flyway)는 기본 ON 이라 영향 없다. ② `SELF_YN` 에 콜레이션을 주지 않으면 DB 기본 CI 콜레이션 때문에 `CHECK (SELF_YN IN ('Y','N'))` 가 소문자 `'y'` 를 통과시킨다. SQLite 는 거부한다 → 두 방언 판정이 갈린다(D8) | 수동 실측 |
| F16 | **Testcontainers 시제품 성공**: scratchpad 에서 Boot 4.0.6 BOM(→ testcontainers **2.0.5**) + `org.testcontainers:testcontainers-mssqlserver` + `testcontainers-junit-jupiter` + 별도 source set `mssqlTest` + 별도 `Test` 태스크로 `MSSQLServerContainer(...).acceptLicense()` 를 띄우고 Flyway API 로 V1·V2 를 적용했다(컨테이너 기동 8.3초, 태스크 전체 25초, BUILD SUCCESSFUL). 2.x 는 패키지가 `org.testcontainers.mssqlserver.MSSQLServerContainer` 다(1.x 의 `org.testcontainers.containers.MSSQLServerContainer` 아님). OrbStack 소켓을 별도 설정 없이 찾았고 Ryuk 가 컨테이너를 치웠다. 대기 중 `Prelogin error … Connection reset` 경고가 여러 줄 찍히는 것은 정상(준비 대기) | scratchpad `tcproto` |
| F17 | **E2E 격리 함정**: mcm 백엔드(local)의 SQLite 경로는 `LocalSqliteDataSource` 가 `user.dir` 에서 위로 올라가며 처음 만나는 `src/backend/data` 로 정하고 `spring.datasource.url` 을 `addFirst` 로 덮는다(명령행 인자도 진다). 이 워크트리에는 `src/backend/data` 가 없으므로 그대로 띄우면 **메인 체크아웃의 `/Users/jji/project/dmes-standard/src/backend/data/mcm.db` 를 잡아 시드·비밀번호 재설정을 그 DB 에 쓴다.** 워크트리에 `src/backend/data/` 를 먼저 만들면 격리된다(gitignore `.gitignore:37`) | `LocalSqliteDataSource.java:38-67`, `McmApplication.java:73-87` |
| F18 | m-mcm BFF 의 백엔드 주소: 모듈별 `{MODULE}_WAS_URL`(mcm → `MCM_WAS_URL`) 우선, 없으면 `BACKEND_API_URL` + `/{moduleId}`. 로그인·권한 캐시도 `MCM_WAS_URL` 우선. 자기 자신 호출은 `NEXTAUTH_URL`. `AUTH_SECRET` 필수. 워크트리 m-mcm 에 `.env`·`.env.local` 이 없다(프로세스 환경 변수로 넘기면 된다). `AUTH_COOKIE_PREFIX` 는 바꾸지 않는다(`lib/auth/config.ts:22` 하드코딩과 어긋남) | `m-mcm/lib/http/be-proxy.ts:22,64-71`, `lib/auth/config.ts:13-22`, `lib/http/oasis-client.ts:16-17`, `.env.example:18-45` |
| F19 | m-mcm 은 m-mdm 의 **dist** 를 읽는다(`m-mdm/package.json` exports `./pages/*` → `./dist/pages/*.js`). `tsup.config.ts` 는 `clean: false` 라 옮긴 뒤에도 옛 `dist/pages/mdt/` 가 남는다(추적 안 되는 빌드 산출물, 레지스트리가 참조하지 않으므로 무해). `m-mcm` 의 `dev` 스크립트는 포트 5100 고정이고 `predev` 가 레지스트리를 재생성한다 | `m-mdm/package.json:6-18`, `m-mdm/tsup.config.ts:16`, `m-mcm/package.json:6-14` |
| F20 | `mdt`·`mdmSample` 이 나오는 src 위치(node_modules·dist·.next·build 제외): `m-mdm/tsup.config.ts:28`, `m-mdm/pages/mdt/mdmSample/page.tsx`(경로·주석), `m-mcm/app/portal/module-config.ts:147`(주석), `m-mcm/lib/generated/page-registry.ts:36`(생성 파일, git 추적), `e2e/mdm-sample-smoke.spec.ts:5,31,34,84`, `DataInitializer.java:415-416,844-852,862-879`. 스크립트·Vitest·Java 테스트에는 없다. `module-config.ts` 에는 그룹 목록이 없다(`createStrictModuleLoader` 가 레지스트리 키만 본다) | grep |
| F21 | `DataInitializer.seedMdmMenus()`(`:857-880`)는 **insert-if-absent** 다(`insertMpnFld`·`insertMcmSecMenuIfAbsent`·`insertIfAbsentComposite` 모두 행이 있으면 건너뛴다). componentPath 는 DB 에 저장하지 않고 `PARENT_MENU_ID + "/" + OBJECT_ID` 로 조회 때 만든다(`SecUserService.java:397-403`). → **리터럴만 바꾸면 기존 DB 에서는 leaf 의 부모가 `mdt` 로 남아 `mdt/mdmSample` 을 계속 돌려주고, 레지스트리 키(`dma/…`)와 어긋나 화면이 열리지 않는다.** 선례: `ensureMenuParent()`(`:1144-1154`, 멱등 UPDATE), `swapLegacyGrpMenuIds()`(`:602-640`, 자식 부모 → FLD PK 순으로 UPDATE, 새 PK 가 이미 있으면 옛 행 DELETE) | `DataInitializer.java` |
| F22 | 사이드바는 권한 있는 leaf 의 조상 폴더만 보인다(`SecUserService.getMyMenus` `:333-343`, `collectAncestorFolderIds` `:643-663`). 자식 없는 옛 폴더 행은 화면에 나오지 않는다 | `SecUserService.java` |
| F23 | 즐겨찾기 `TB_MCM_SEC_USER_FAVORITE.FULL_ID` 에 componentPath 를 저장한다. 옛 `mdt/mdmSample` 즐겨찾기가 있으면 옛 경로로 남는다 | `SecFavoriteService.java:30-40,127` |
| F24 | 기존 마스터관리·업무기준관리 메뉴 시드: `seedMcmSecMenuFld()`(`:716`, `cma` 마스터관리(원장) `:735`, `cme` `:747`, `cmb` 업무기준관리(원장) `:754`), `seedMcmSecMenu()`(`:482`), `seedMcmSecRbac()`(`:223`). **이번 작업은 이 메서드들을 고치지 않는다** | `DataInitializer.java` |
| F25 | m-mdm Vitest `tests/tsup-entries.smoke.test.ts` 는 `pages/` 를 깊이 1~2 로 스캔한 키와 `tsup.config.ts` entry 키가 1:1 인지 본다(하드코딩 없음). 폴더와 entry 를 함께 옮기면 통과한다 | 파일 |
| F26 | E2E 스모크 `e2e/mdm-sample-smoke.spec.ts` 는 URL 이 아니라 메뉴 이름으로 이동한다(`"마루 MDM"` → `/^용어·도메인·컬럼·단위$/` → `/^MDM 샘플$/`). 기본 `SMOKE_MCM_BASE_URL=http://127.0.0.1:5100`, 로그인 admin/admin123(부팅마다 강제 재설정 `DataInitializer:249-256`). 스크린샷을 `docs/mdm/tasks/TSK-01-01/screens/mdt-mdmSample.png`(git 추적)에 쓴다. mdm 백엔드(8096)는 필요 없다. `playwright.config.ts` 는 서버를 띄우지 않는다. chromium 1234 가 캐시에 있다 | spec 파일, `src/frontend/playwright.config.ts` |
| F27 | 원천 카테고리 모델: 종류 REGEX/TABLE(04:178-181, 05:149-152). `def_target` 은 REGEX 일 때만 쓰고 TABLE 이면 NULL. 04 허용값 CODE·LVL1-LVL5·ATTR01-ATTR10(기본 CODE, 04:1032), 05 허용값 KEY·LVL1-LVL5·ATTR01-ATTR10(05:157·660). 예약 카테고리 `BASE` = REGEX `.*`, 04 는 CODE·05 는 KEY(04:95, 05:161). 마루 코드 ID 와 마루 데이터 ID 는 한 이름 공간이며 등록 때 상대 표에 같은 ID 가 있으면 거부(04:74, 05:86·353). ID 에 점·공백·콤마 금지(04:73, 05:617) | 원천 |
| F28 | 원천 버전: 04 는 `DECIMAL(7,3)`(major 1-9998, minor ≤999, 04:267-282·994), 06 은 정수 1부터(06:971). `row_version` 생성 시 0, 저장·전이마다 +1, 다르면 "다른 사용자가 수정했습니다. 다시 불러오세요"(04:305). 미적용 버전 2개면 "미적용 버전이 2개입니다. 하나를 삭제하세요"(04:299). diff 종류: 06 은 ADDED/REMOVED/CHANGED/SAME(06:1253-1278), 04 는 `from_ver=V` 또는 `to_ver=V` 행(04:48) | 원천 |
| F29 | 원천에 공통 오류 코드 체계·HTTP 상태 규칙은 없다(원문 없음) | 원천 |

---

## 1. 접근 방식

이 Task 는 04 마스터코드·05 마스터데이터·06 업무기준과 TSK-01-03 이 함께 쓰는 **계약**을 만든다. 계약은 mdm lib 의 한 패키지 뿌리 `com.dongkuk.dmes.mdm.contract` 아래에만 두고(D9), 그 안에는 인터페이스·enum·record·상수 클래스만 둔다. 이 "실행 로직 없음"은 말로만 두지 않고 ArchUnit 규칙으로 고정한다. 인터페이스가 04·06(그리고 05)에서 실제로 구현될 수 있는지는 lib **test** 소스셋의 스텁 구현으로 컴파일해 증명한다(런타임 스텁 금지). DB 쪽은 활성 테이블 `TB_MDM_SYSTEM` 하나만 V2 로 추가한다. 보류 테이블 DDL 은 TSK-02-01 이 TSK-02-03 에 배정했으므로 넣지 않는다(D6). 두 방언 적용은 SQLite 는 기존 `testAll` 안의 스프링 부트 테스트로, MSSQL 은 Testcontainers 로 실제 SQL Server 2022 에 Flyway 를 거는 **별도 Gradle 태스크**로 검증한다(D5). 이 태스크는 `testAll` 에 들어가지 않으므로 docker 없는 환경의 기준선을 깨뜨리지 않는다. 선행 TSK-02-01 이 이 Task 에 넘긴 인계 7항목은 spec 의 contract-only 와 항목별로 대조해 처분했다(§6). 실행 로직이 필요한 두 항목(감사 칼럼 헬퍼·방언 판정 빈)은 계약(인터페이스)만 두고 구현은 첫 소비자인 TSK-01-03 에 넘긴다(D3). 설정만으로 끝나는 SQLite `foreign_keys` 는 이번에 켜고 실측한다(D4). 끝으로 팀장 지시에 따라 샘플 화면을 `dma` 로 옮기되, 이 변경은 계약과 성격이 다르므로 **별도 커밋**으로 분리하고, 기존 개발 DB 에 남은 `mdt` 행을 UPDATE 로 이행하는 코드를 함께 둔다(D1·D2). 판단 순서는 근거 순위(spec > 승인 산출물 > 리포 관례 > 미승인 산출물)를 따른다.

---

## 2. 변경 파일 목록

커밋은 둘로 나눈다. **커밋 A(계약)** 과 **커밋 B(샘플 이동)** 는 서로 독립이라 B 만 revert 할 수 있어야 한다. B 는 A 의 어떤 파일도 고치지 않는다.

### 2.1 커밋 A — 계약 (생성)

모든 Java 파일 경로 앞부분은 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/` 다.

| # | 파일 | 종류 | 내용 |
|---|---|---|---|
| A1 | `package-info.java` | 문서 | "계약 전용 패키지. 인터페이스·enum·record·상수 클래스만 둔다(TSK-01-02). 구현은 이 패키지 밖에 둔다" |
| A2 | `common/MdmSystemCodes.java` | 상수 | 시스템 코드 6종·자기 행·시드 목록 |
| A3 | `common/MdmAuditColumns.java` | 상수 | 감사 9칼럼 이름·순서·네이티브 칼럼 목록 문자열 |
| A4 | `common/AuditStamp.java` | record | 네이티브 쓰기용 감사 값 |
| A5 | `common/MdmNativeAuditSupport.java` | 인터페이스 | 감사 칼럼 명시 헬퍼 계약(구현은 TSK-01-03, D3) |
| A6 | `common/MdmDialect.java` | enum | `SQLITE`, `MSSQL` |
| A7 | `common/MdmDialectResolver.java` | 인터페이스 | 방언 판정 빈 계약(구현은 TSK-01-03, D3) |
| A8 | `common/MdmErrorCode.java` | enum | mdm 공통 오류 코드(D7) |
| A9 | `common/MdmCheckIssue.java` | record | 검사 결과 한 건(공통 응답 DTO) |
| A10 | `screen/MdmScreenGroup.java` | enum | 화면 그룹 5종 |
| A11 | `screen/MdmOasisConventions.java` | 상수 | 모듈 ID·OASIS URL·screenId 규칙 |
| A12 | `security/MdmRoles.java` | 상수 | 역할 ID 2종 |
| A13 | `security/MdmActions.java` | 상수 | 권한 액션 코드 13종 |
| A14 | `security/MdmPermissions.java` | 상수 | 권한 세트 3종·액션 목록·그룹 매트릭스 |
| A15 | `version/VersionStatus.java` | enum | 버전 상태 5종 |
| A16 | `version/MaruObjectStatus.java` | enum | 상위 객체 상태 3종 |
| A17 | `version/VersionTransition.java` | enum | 전이 표(원천 7 + 담당자 확정 1, 이번 범위 표시) |
| A18 | `version/VersionTarget.java` | enum | 버전 대상(04·06) |
| A19 | `version/VersionRef.java` | record | 버전 식별자 |
| A20 | `version/VersionConventions.java` | 상수 | `row_version` 규약·열린 끝 일시 |
| A21 | `version/VersionStateService.java` | 인터페이스 | 확정·DRAFT 삭제 서비스 계약(구현 TSK-01-03) |
| A22 | `version/ConfirmCommand.java` | record | 확정 요청 |
| A23 | `version/ConfirmResult.java` | record | 확정 결과 |
| A24 | `version/DraftOwnershipService.java` | 인터페이스 | DRAFT 선점·해제·넘기기 |
| A25 | `version/ApplyFromOrderCheck.java` | 인터페이스 | apply_from 순서 검사 |
| A26 | `version/VersionConfirmCheckSpi.java` | 인터페이스 | 대상별 확정 검사 SPI(04·06 구현) |
| A27 | `version/ConfirmCheckRequest.java` | record | SPI 입력 |
| A28 | `version/ConfirmCheckResult.java` | record | SPI 결과(오류·경고) |
| A29 | `version/DiffKind.java` | enum | ADDED/REMOVED/CHANGED/SAME |
| A30 | `version/VersionDiff.java` | record | diff 전체 |
| A31 | `version/VersionDiffEntry.java` | record | diff 한 행 |
| A32 | `category/CategoryKind.java` | enum | REGEX/TABLE |
| A33 | `category/CategoryDefTarget.java` | enum | CODE, KEY, LVL1~LVL5, ATTR01~ATTR10 |
| A34 | `category/CategoryOwner.java` | enum | MASTER_CODE(04)·MASTER_DATA(05), BASE 대상·허용 대상 |
| A35 | `category/CategoryConventions.java` | 상수 | `BASE` 예약 ID·정의 |
| A36 | `category/CategoryDefinition.java` | record | 카테고리 정의 공유 DTO |
| A37 | `category/MaruIdKind.java` | enum | MASTER_CODE, MASTER_DATA |
| A38 | `category/MaruIdNamespace.java` | 인터페이스 | 마루 ID 이름 공간 SPI(04·05 구현) |
| A39 | `category/MaruIdRules.java` | 상수 | ID 금지 문자 |

리소스·설정·빌드:

| # | 파일 | 생성/수정 | 내용 |
|---|---|---|---|
| A40 | `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V2__create_mdm_system.sql` | 생성 | §2.3 SQLite DDL + 시드 |
| A41 | `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V2__create_mdm_system.sql` | 생성 | §2.3 MSSQL DDL + 시드 |
| A42 | `src/backend/mdm/api/src/main/resources/application-local.yml` | 수정 | `spring.datasource.hikari.data-source-properties.foreign_keys: true` 추가(§2.5) |
| A43 | `src/backend/mdm/lib/build.gradle` | 수정 | `testImplementation 'com.tngtech.archunit:archunit-junit5:1.3.0'` |
| A44 | `src/backend/mdm/api/build.gradle` | 수정 | `mssqlTest` source set + `mssqlMigrationTest` 태스크(§2.6) |
| A45 | `docs/mdm/naming-dialect-rules.md` | 수정 | §3 #14·#15·#16 검증 상태 칸, §5 도구 판정 문장만(§2.7). 다른 곳 금지 |
| A46 | `docs/mdm/decisions.md` | 수정(끝에 추가) | 결정 6건, 번호는 Build 시점 마지막 번호 + 1 부터(§2.8) |

테스트(커밋 A 에 함께, **구현보다 먼저 작성해 빨강 확인**):

| # | 파일 | 내용 |
|---|---|---|
| T1 | `mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/MdmContractArchitectureTest.java` | ArchUnit: 계약 전용·순수성·As-Is import 금지(§3.1) |
| T2 | `…/contract/version/VersionContractTest.java` | 상태 5종·상위 3종·전이 표·규약 상수 |
| T3 | `…/contract/category/CategoryContractTest.java` | 카테고리 종류·BASE·허용 대상 |
| T4 | `…/contract/security/SecurityScreenContractTest.java` | 역할·액션·권한 세트·매트릭스·그룹 코드·OASIS 규칙 |
| T5 | `…/contract/common/CommonContractTest.java` | 시스템 코드·감사 칼럼·오류 코드 |
| T6 | `…/contract/stub/MasterCodeConfirmCheckStub.java` | 04 역할 스텁 `implements VersionConfirmCheckSpi` |
| T7 | `…/contract/stub/BusinessRuleConfirmCheckStub.java` | 06 역할 스텁 `implements VersionConfirmCheckSpi` |
| T8 | `…/contract/stub/MasterCodeIdNamespaceStub.java`, `MasterDataIdNamespaceStub.java` | 04·05 역할 스텁 `implements MaruIdNamespace` |
| T9 | `…/contract/stub/ContractStubCompileTest.java` | 스텁을 인터페이스 타입으로 다루는 테스트 |
| T10 | `…/contract/version/ApplyFromOrderCheckContract.java`(abstract) + `…/contract/stub/ApplyFromOrderCheckStub.java` + `…/contract/stub/ApplyFromOrderCheckStubTest.java` | apply_from 순서 규칙의 계약 테스트 키트. TSK-01-03 실구현이 이 abstract 클래스를 상속해 같은 사례를 통과해야 한다 |
| T11 | `mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java` | SQLite: Flyway V1·V2, TB_MDM_SYSTEM 행·제약·칼럼 명명, `foreign_keys`, 인스펙터 미등록(§3.2) |
| T12 | `mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMssqlMigrationTest.java` | MSSQL(Testcontainers): 같은 검사(§3.3) |
| T13 | `mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmFlywayVersionParityTest.java` | **수정** — 기존 집합 비교에 "두 방언 모두 `{1, 2}` 를 포함" 단언 1개 추가 |

### 2.2 커밋 B — 샘플 이동 (D1·D2)

| # | 파일 | 생성/수정 | 내용 |
|---|---|---|---|
| B1 | `src/frontend/m-mdm/pages/mdt/mdmSample/page.tsx` → `src/frontend/m-mdm/pages/dma/mdmSample/page.tsx` | **`git mv`**(삭제 아님) | 옮긴 뒤 breadcrumb 를 `"마루 MDM > 용어·도메인 > MDM 샘플"` 로, 머리 주석에 "TSK-01-02 에서 그룹 dma 로 이동" 한 줄 추가. `objId="mdmSample"`·본문 문구는 그대로 |
| B2 | `src/frontend/m-mdm/tsup.config.ts` | 수정 | entry 키·경로를 `"pages/dma/mdmSample/page": "pages/dma/mdmSample/page.tsx"` 로 |
| B3 | `src/frontend/m-mcm/lib/generated/page-registry.ts` | 재생성 | **손으로 고치지 않는다.** `node src/frontend/m-mcm/scripts/generate-page-registry.mjs`(저장소 루트에서) 실행 결과를 커밋. 기대: `"dma/mdmSample": () => import("@dk-oasis/m-mdm/pages/dma/mdmSample/page")`, `mdt/` 키 0개 |
| B4 | `src/frontend/m-mcm/app/portal/module-config.ts` | 수정 | `:147` 주석만 `1호 화면 dma/mdmSample` 로 |
| B5 | `src/frontend/e2e/mdm-sample-smoke.spec.ts` | 수정 | 머리 주석 `dma/mdmSample`·TSK-01-02 참조, 서버 기동 안내 주석을 §3.5 절차로, describe 제목 `"mdm dma/mdmSample smoke"`, 폴더 로케이터 `/^용어·도메인$/`, 스크린샷 경로 `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png`. 로그인·"MDM 샘플"·본문 문구 확인은 그대로 |
| B6 | `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | 수정 | `seedMdmMenus()` 와 그 javadoc 만, 그리고 새 private 메서드 1개(§2.4). 다른 메서드는 고치지 않는다 |
| B7 | `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png` | 생성 | E2E 가 남긴 스크린샷(Verify 가 커밋해도 된다) |

**고치지 않는 것(명시)**: `docs/mdm/adr/0003-*.md`·`docs/mdm/screens/README.md`·`docs/mdm/wbs.md` 의 "TSK-01-03 이 옮긴다" 문구, `docs/mdm/tasks/TSK-01-01/**`(기존 스크린샷 `mdt-mdmSample.png` 포함 — 지우지도 덮지도 않는다), `DataInitializer` 의 `seedMcmSecMenu`·`seedMcmSecMenuFld`·`seedMcmSecRbac`·`swapLegacyGrpMenuIds`·`cleanupLegacyFolderRowsInSecMenu`, `m-mdm/package.json`(exports 와일드카드라 수정 불필요), cactus-core·mcm-core 소스 전부, `.claude/skills/**`.

### 2.3 DDL 전문 (두 방언, 그대로 옮긴다)

규칙: 규칙표 §1(대문자·`PK_/CK_/UX_` 명명·스키마 접두 없음), §2(감사 9칼럼, NULL 허용, SQLite `TIMESTAMP`·MSSQL `DATETIME2`), §3 #15(`*_yn` 은 `VARCHAR(1)` `'Y'/'N'`), #18(한글 칼럼 MSSQL `NVARCHAR`), #19(코드·키 칼럼 MSSQL BIN2), #20(NULL 허용 유일은 필터 인덱스 — 여기서는 "자기 행 하나" 강제에 부분·필터 유일 인덱스를 쓴다). 두 파일 모두 머리 주석에 "TSK-01-02 design.md §2.3, 두 방언 버전 집합은 항상 같다(규칙표 §5)" 를 적는다.

**`sqlite/V2__create_mdm_system.sql`**
```sql
CREATE TABLE TB_MDM_SYSTEM (
    SYSTEM_CODE VARCHAR(20)  NOT NULL,
    SYSTEM_NAME VARCHAR(100) NOT NULL,
    SELF_YN     VARCHAR(1)   NOT NULL,
    C_USR_ID    VARCHAR(100),
    C_AT        TIMESTAMP,
    C_SVC_ID    VARCHAR(100),
    C_PGM_ID    VARCHAR(100),
    U_USR_ID    VARCHAR(100),
    U_AT        TIMESTAMP,
    U_SVC_ID    VARCHAR(100),
    U_PGM_ID    VARCHAR(100),
    VER         BIGINT,
    CONSTRAINT PK_TB_MDM_SYSTEM PRIMARY KEY (SYSTEM_CODE),
    CONSTRAINT CK_TB_MDM_SYSTEM_SELF_YN CHECK (SELF_YN IN ('Y', 'N'))
);
CREATE UNIQUE INDEX UX_TB_MDM_SYSTEM_SELF_YN ON TB_MDM_SYSTEM (SELF_YN) WHERE SELF_YN = 'Y';
INSERT INTO TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN, C_USR_ID, C_SVC_ID, C_PGM_ID, U_USR_ID, U_SVC_ID, U_PGM_ID, VER) VALUES
    ('ERP',  'ERP',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MES',  'MES',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('APS',  'APS',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('DKMS', 'DKMS',     'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('L2',   '레벨2',    'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MDM',  '마루 MDM', 'Y', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0);
```

**`mssql/V2__create_mdm_system.sql`**
```sql
CREATE TABLE TB_MDM_SYSTEM (
    SYSTEM_CODE VARCHAR(20)   COLLATE Latin1_General_100_BIN2 NOT NULL,
    SYSTEM_NAME NVARCHAR(100) NOT NULL,
    SELF_YN     VARCHAR(1)    COLLATE Latin1_General_100_BIN2 NOT NULL,
    C_USR_ID    VARCHAR(100),
    C_AT        DATETIME2,
    C_SVC_ID    VARCHAR(100),
    C_PGM_ID    VARCHAR(100),
    U_USR_ID    VARCHAR(100),
    U_AT        DATETIME2,
    U_SVC_ID    VARCHAR(100),
    U_PGM_ID    VARCHAR(100),
    VER         BIGINT,
    CONSTRAINT PK_TB_MDM_SYSTEM PRIMARY KEY (SYSTEM_CODE),
    CONSTRAINT CK_TB_MDM_SYSTEM_SELF_YN CHECK (SELF_YN IN ('Y', 'N'))
);
CREATE UNIQUE INDEX UX_TB_MDM_SYSTEM_SELF_YN ON TB_MDM_SYSTEM (SELF_YN) WHERE SELF_YN = 'Y';
INSERT INTO TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN, C_USR_ID, C_SVC_ID, C_PGM_ID, U_USR_ID, U_SVC_ID, U_PGM_ID, VER) VALUES
    ('ERP',  N'ERP',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MES',  N'MES',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('APS',  N'APS',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('DKMS', N'DKMS',     'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('L2',   N'레벨2',    'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MDM',  N'마루 MDM', 'Y', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0);
```

설계 메모:
- 두 문안은 F14·sqlite3 CLI 로 이미 적용해 봤다(두 방언 모두 6행, 두 번째 `'Y'`·소문자 `'y'` 거부, SQLite 는 BINARY 기본이라 대소문자 구분).
- 시드의 `C_AT`·`U_AT` 는 **NULL** 로 둔다. 규칙표 #16 이 DB 시각 함수를 금지하고, 마이그레이션에는 애플리케이션 시각이 없으며, `CactusAuditEntity` 가 `Instant` 로 읽는 SQLite 저장 형식은 아직 실측 전이다(D4). 감사 사용자·서비스·프로그램은 `SYSTEM`·`flyway`·`V2__create_mdm_system`, `VER` 는 0(D10).
- `SYSTEM_CODE` 길이 20·BIN2 는 뒤에 이 표를 참조할 FK 칼럼(`*_SYSTEM.SYSTEM_CODE`, `SOURCE_SYSTEM`)과 **같아야 한다.** MSSQL 은 FK 양쪽 콜레이션이 다르면 FK 생성이 실패한다 → TSK-02-03 인계(§7).
- 보류 테이블·FK 는 이 마이그레이션에 넣지 않는다(D6). 엔티티도 만들지 않는다(spec 이 요구하지 않고 읽는 코드가 없다. 첫 소비자가 `com.dongkuk.dmes.mdm.entity` 에 만든다).
- SQLite 에는 `N'…'` 접두를 쓰지 않는다(리포는 SQLite 로 보낼 때 `N'` 를 떼는 선례를 둔다 — `McmAuditStatementInspector`).

### 2.4 `DataInitializer` 변경 (커밋 B)

`seedMdmMenus()` 첫 줄에서 새 메서드 `migrateMdmSampleGroupToDma()` 를 부르고, 그 뒤 시드 리터럴을 바꾼다.

```java
// TSK-01-02 D2 — TSK-01-01 이 옛 그룹 mdt 로 시드한 기존 DB 를 dma 로 옮긴다.
// UPDATE 만 쓴다(DELETE 없음). 새 DB 에서는 영향 행 0 이라 아무 일도 하지 않는다(멱등).
private void migrateMdmSampleGroupToDma() {
    int leaf = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = 'dma' WHERE PARENT_MENU_ID = 'mdt'").executeUpdate();
    int childFld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET PARENT_MENU_ID = 'dma' WHERE PARENT_MENU_ID = 'mdt'").executeUpdate();
    Number dmaExists = (Number) nq("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = 'dma'").getSingleResult();
    int fld = 0;
    if (dmaExists == null || dmaExists.intValue() == 0) {
        fld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_ID = 'dma', MENU_NM = N'용어·도메인' WHERE MENU_ID = 'mdt'").executeUpdate();
    }
    int fav = nq("UPDATE MCMAPUSER.TB_MCM_SEC_USER_FAVORITE SET FULL_ID = 'dma/mdmSample' WHERE FULL_ID = 'mdt/mdmSample'").executeUpdate();
    if (leaf + childFld + fld + fav > 0) log.info(...);
}
```
- 시드: `insertMpnFld("dma", "00000100", "용어·도메인", "mdm", 5010000L);`, `insertMcmSecMenuIfAbsent("mdmSample", "001", "5010100", "MDM 샘플", "dma", "mdmSample");`. OBJECT·ROLE_MAPPING 행은 그대로(OBJECT_ID 불변). 로그 문구 `MDM 샘플(dma)`. javadoc 의 `mdt` 설명을 `dma`(용어·도메인, screens/README §2)로 바꾸고 "기존 DB 는 migrateMdmSampleGroupToDma 가 이행" 을 적는다.
- 순서가 중요하다: 이행 메서드가 `insertMpnFld("dma", …)` **보다 먼저** 돌아야 기존 DB 에서 `dma` 가 새로 INSERT 되지 않고 옛 행이 이름과 함께 옮겨진다.
- `dma` 와 `mdt` 가 둘 다 있는 경우(정상 경로에서는 생기지 않는다)에는 `mdt` 폴더 행을 지우지 않는다. 자식이 없어 사이드바에 보이지 않는다(F22). 삭제는 사용자 확인 대상이라 하지 않는다.
- **즐겨찾기 UPDATE 는 조건부다.** `DataInitializer.run()` 전체가 `@Transactional` 하나라서(`:79-81`), 테이블·칼럼 이름이 틀리거나 MSSQL 개발 DB 에 테이블이 없으면 시드 전체가 롤백되고 mcm 기동이 실패한다. E2E 는 새 SQLite DB 만 보므로 MSSQL 쪽 경로는 아무도 검증하지 않는다. Build 는 ① 엔티티 `@Table`·`@Column` 으로 이름을 확인하고 ② 이 테이블이 MSSQL 에도 있다는 근거(MSSQL DDL·초기화 코드·기존 네이티브 SQL 의 `MCMAPUSER.TB_MCM_SEC_USER_FAVORITE` 사용 등)를 grep 으로 찾는다. 둘 중 하나라도 확인하지 못하면 이 UPDATE 를 빼고, 옛 즐겨찾기 경로가 남는 것을 「Build 이탈」에 알려진 한계로 적는다.
- `seedMdmMenus` javadoc 과 로그 문구에는 `mdt` 글자를 쓰지 않는다("옛 그룹" 으로 쓴다). `mdt` 리터럴은 `migrateMdmSampleGroupToDma` 본문과 바로 위 주석에만 둔다(§3.6 grep 기준).
- `nq()` 는 SQLite 에서 `MCMAPUSER.` 접두와 `N'` 를 떼 준다(`DataInitializer:2838-2850`).

### 2.5 SQLite `foreign_keys` (커밋 A, D4)

`application-local.yml` 의 `spring.datasource` 아래에 다음을 추가한다.
```yaml
    hikari:
      data-source-properties:
        # 규칙표 §3 #14 — SQLite 는 연결마다 외래키 강제를 켜야 FK·cascade 가 동작한다(TSK-01-02 D4).
        # URL 파라미터가 아니라 드라이버 속성으로 켜서, 테스트가 URL 만 바꿔 넣어도 유지되게 한다.
        foreign_keys: true
```
- 근거: Hikari 는 `driverClassName` 이 있으면 `DriverDataSource` 로 `Driver.connect(url, props)` 에 이 속성을 넘기고, xerial `SQLiteConfig` 가 `foreign_keys` 속성을 PRAGMA 로 적용한다.
- **대체 경로**: T11 이 빨강이면(속성이 드라이버에 닿지 않으면) URL 을 `jdbc:sqlite:../data/mdm.db?foreign_keys=true` 로 바꾸고, URL 을 주입하는 테스트(`MdmApplicationHealthTest`·T11)의 URL 에도 같은 파라미터를 붙인다. 어느 쪽을 택했는지 design.md 「Build 이탈」에 적는다.
- `local-db`(MSSQL)·`wildfly` 는 해당 없다(MSSQL 은 FK 를 항상 강제).

### 2.6 `mssqlMigrationTest` 태스크 (커밋 A, D5)

`src/backend/mdm/api/build.gradle` 에 추가(F16 시제품에서 검증한 형태):
```groovy
// TSK-01-02 D5 — MSSQL 실제 적용 검증. docker 가 필요하므로 test/testAll 에 연결하지 않는다.
// 실행: cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest --no-daemon
sourceSets {
    mssqlTest {
        compileClasspath += sourceSets.main.output
        runtimeClasspath += sourceSets.main.output
    }
}
configurations {
    mssqlTestImplementation.extendsFrom testImplementation
    mssqlTestRuntimeOnly.extendsFrom testRuntimeOnly
}
dependencies {
    mssqlTestImplementation 'org.testcontainers:testcontainers-mssqlserver'   // 버전은 Boot 4.0.6 BOM(2.0.5)
    mssqlTestImplementation 'org.testcontainers:testcontainers-junit-jupiter'
}
tasks.register('mssqlMigrationTest', Test) {
    description = 'mdm Flyway 마이그레이션을 Testcontainers MSSQL(2022-CU27)에 실제 적용한다. docker 필요, testAll 비포함.'
    group = 'verification'
    testClassesDirs = sourceSets.mssqlTest.output.classesDirs
    classpath = sourceSets.mssqlTest.runtimeClasspath
    useJUnitPlatform()
    testLogging { events 'passed', 'failed', 'skipped'; exceptionFormat = 'full' }
}
```
- `test`·`check`·`testAll` 에 `dependsOn` 을 걸지 않는다. 루트 `testAll` 은 각 빌드의 `:test` 만 의존하므로(`src/backend/build.gradle:15-19`, mdm 루트 `test` 는 `subprojects*.test` 만 의존) 새 태스크는 그래프에 들어가지 않는다.
- 태그·`@EnabledIf`·`Assumptions` 로 조건부 skip 하지 않는다. docker 없이 이 태스크를 부르면 **실패**해야 한다(거짓 통과 방지).
- `mssql-jdbc`·`flyway-sqlserver` 는 lib 의 runtimeOnly 가 `project(':lib')` 경유로 들어온다. 안 들어오면 `mssqlTestRuntimeOnly` 에 같은 좌표를 직접 적는다(이탈 기록).

### 2.7 규칙표 갱신 (커밋 A, A45 — 이 칸들만)

규칙표 §6.2 는 "실측 필요 행을 확인한 Task 는 같은 커밋에서 검증 상태를 바꾼다" 고 정한다. 팀장의 "선행 문서를 고치지 않는다" 는 샘플 이동 배정 문구(ADR-0003·screens/README·wbs)에 대한 지시로 해석하고, 규칙표가 스스로 요구하는 **검증 상태 칸 갱신만** 한다(해석이 틀렸다면 D4 반려 방향을 따른다).

| 위치 | 현재 | 새 문안 |
|---|---|---|
| §3 #14 검증 상태 | `…설정과 동작은 **실측 필요 → TSK-01-02**` | `확인(TSK-01-02 실측): local 프로파일은 Hikari data-source-properties 의 foreign_keys=true 로 켠다(URL 을 바꿔 넣어도 유지). 자식 FK 위반 INSERT 거부를 SQLite 에서 확인. MSSQL cascade 경로 제약은 T-SQL 규칙(미실측)` (대체 경로를 택했으면 그 문안) |
| §3 #15 검증 상태 | `Hibernate 매핑 **실측 필요 → TSK-01-02**` | `Hibernate 매핑 **실측 필요 → TSK-04-01**(TSK-01-02 에서 이관 — 첫 BOOLEAN 엔티티 Task, TSK-01-02 design D4)` |
| §3 #16 검증 상태 | `mdm 적용 방식 **실측 필요 → TSK-01-02**` | `mdm 적용 방식 **실측 필요 → TSK-04-01**(TSK-01-02 에서 이관, design D4). CactusAuditEntity 의 Instant(C_AT·U_AT) SQLite 저장 형식도 함께 확인` |
| §5 셋째 항목 | `…지원하지 않으면 같은 규칙을 손으로 적용한다(지원 여부 판정은 TSK-01-02).` | `…지원하지 않으면 같은 규칙을 손으로 적용한다. 판정(TSK-01-02): 지원하지 않는다(--module 선택지가 aps-core·mcm-core 뿐). 손으로 적용한다.` |

### 2.8 decisions.md 추가 (커밋 A, A46)

형식은 기존 항목과 같다(`## D-0NN (UTC ISO 시각)` + Phase/Decision needed/Decision made/Rationale/Reversible/Source). 시각은 Build 시점 `date -u +%Y-%m-%dT%H:%M:%SZ`, Phase `design (TSK-01-02)`, 모두 `Reversible: yes`, Source `docs/mdm/tasks/TSK-01-02/design.md` 해당 D.

**번호는 고정하지 않는다.** 다른 워커(TSK-02-02·02-03 등)도 decisions.md 끝에 이어 쓸 수 있으므로, Build 는 커밋 직전에 파일의 마지막 `D-0NN` 을 확인하고 그다음 번호부터 아래 순서대로 붙인다(작성 시점 마지막은 D-019). 병합 충돌이 나면 번호를 다시 매긴다(내용은 그대로).

| 순서 | 요지 | 근거 D |
|---|---|---|
| 1 | 샘플 `mdmSample` 을 TSK-01-02 에서 `dma` 로 `git mv`(별도 커밋), 기존 DB 는 UPDATE 로 이행(폴더 이름 용어·도메인, DELETE 없음) | D1·D2 |
| 2 | 계약 패키지 `com.dongkuk.dmes.mdm.contract` 와 ArchUnit 계약 전용 규칙. 감사 헬퍼·방언 판정 빈은 인터페이스만, 구현은 TSK-01-03 | D3·D9 |
| 3 | 방언 실측: #14 foreign_keys 는 TSK-01-02 확인, #15·#16 은 TSK-04-01 로 이관. MSSQL 적용 검증은 Testcontainers 별도 태스크(testAll 비포함) | D4·D5 |
| 4 | mdm 공통 오류 코드 `MdmErrorCode`(MDMnnn, 의미 HTTP 상태 + cactus ErrorCode 운반). cactus-core 불변 | D7 |
| 5 | `TB_MDM_SYSTEM` 시드 이름(레벨2·마루 MDM)과 감사 값, Y/N 플래그 칼럼도 MSSQL BIN2 | D8·D10 |
| 6 | 보류 테이블(배포 대상·배포 순번·수신 로그) DDL 은 TSK-01-02 에서 제외(TSK-02-01 배정대로 TSK-02-03·영역 계약) | D6 |

### 2.9 계약 코드 명세 (A1~A39)

공통 규칙:
- 상수 클래스는 `public final class` + `private` 생성자 + `public static final` 필드만 둔다(메서드 금지).
- 인터페이스에는 추상 메서드만 둔다(`default`·`static` 메서드 금지).
- record 에는 명시 메서드·검증 로직을 넣지 않는다(컴팩트 생성자 금지). NULL 허용 칸은 javadoc 에 적는다.
- enum 은 생성자와 필드 접근자(getter)만 둔다.
- 계약 패키지는 Spring·JPA·Hibernate·JDBC 에 의존하지 않는다. 쓸 수 있는 외부 타입은 `java.*` 와 cactus-core `com.dongkuk.dmes.cactus.common.ErrorCode` 뿐이다.
- 모든 클래스 javadoc 에 근거(원천 행·ADR·규칙표)를 한 줄 적는다.

```java
// ── common ──
public final class MdmSystemCodes {           // 02:764-771, 01:195, spec
    public static final String ERP = "ERP", MES = "MES", APS = "APS", DKMS = "DKMS", L2 = "L2", MDM = "MDM";
    public static final String SELF = MDM;     // SELF_YN='Y' 인 자기 행
    public static final List<String> SEEDED = List.of(ERP, MES, APS, DKMS, L2, MDM);
}
public final class MdmAuditColumns {          // 규칙표 §2, ADR-0001 D2
    public static final String C_USR_ID = "C_USR_ID", C_AT = "C_AT", C_SVC_ID = "C_SVC_ID", C_PGM_ID = "C_PGM_ID",
            U_USR_ID = "U_USR_ID", U_AT = "U_AT", U_SVC_ID = "U_SVC_ID", U_PGM_ID = "U_PGM_ID", VER = "VER";
    public static final List<String> ALL = List.of(C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER);
    /** 네이티브 INSERT 칼럼 목록. ALL 을 ", " 로 이은 값과 같다. */
    public static final String NATIVE_COLUMN_LIST = "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
}
public record AuditStamp(String userId, String serviceId, String programId, Instant at) {}  // at: CactusAuditEntity 와 같은 Instant
public interface MdmNativeAuditSupport {      // 엔티티를 거치지 않는 쓰기용(규칙표 §2). 구현 TSK-01-03
    /** 현재 요청 문맥(AuditHolder)의 감사 값. OASIS 밖 호출이면 userId·serviceId·programId 는 null 일 수 있다. */
    AuditStamp currentStamp();
}
public enum MdmDialect { SQLITE, MSSQL }
public interface MdmDialectResolver { MdmDialect current(); }   // 규칙표 §4 "방언 판정은 한 곳". 구현 TSK-01-03
public enum MdmErrorCode {                     // D7. code, 의미 HTTP 상태, 운반용 cactus ErrorCode, 기본 메시지
    ROW_VERSION_CONFLICT("MDM001", 409, ErrorCode.BUSINESS_ERROR, "다른 사용자가 수정했습니다. 다시 불러오세요"),  // 04:305
    NOT_DRAFT("MDM002", 409, ErrorCode.BUSINESS_ERROR, "DRAFT 상태에서만 할 수 있습니다"),                    // 04:259
    NOT_DRAFT_OWNER("MDM003", 403, ErrorCode.ACCESS_DENIED, "DRAFT 소유자만 할 수 있습니다"),                  // 04:303
    DRAFT_ALREADY_OWNED("MDM004", 409, ErrorCode.BUSINESS_ERROR, "다른 사용자가 선점한 DRAFT 입니다"),          // 04:303
    HANDOVER_TARGET_NOT_STEWARD("MDM005", 400, ErrorCode.INVALID_VALUE, "넘겨받는 사람은 담당자 역할이 있어야 합니다"), // ADR-0002 D3
    UNAPPLIED_VERSION_EXISTS("MDM006", 409, ErrorCode.BUSINESS_ERROR, "미적용 버전이 있어 새 버전을 만들 수 없습니다"), // 04:284, ADR-0002 D2
    MULTIPLE_UNAPPLIED_VERSIONS("MDM007", 409, ErrorCode.BUSINESS_ERROR, "미적용 버전이 2개입니다. 하나를 삭제하세요"), // 04:299
    APPLY_FROM_NOT_AFTER_PREVIOUS("MDM008", 400, ErrorCode.INVALID_VALUE, "적용 시작 일시는 직전 확정 버전의 적용 시작 일시보다 뒤여야 합니다"), // ADR-0002 D4
    TRANSITION_NOT_ALLOWED("MDM009", 409, ErrorCode.BUSINESS_ERROR, "허용되지 않는 상태 전이입니다"),          // ADR-0002 D1
    CONFIRM_CHECK_FAILED("MDM010", 400, ErrorCode.BUSINESS_ERROR, "확정 검사를 통과하지 못했습니다"),          // ADR-0002 D4
    MARU_ID_NAMESPACE_CONFLICT("MDM011", 400, ErrorCode.DUPLICATE_DATA, "마루 코드·마루 데이터에 같은 ID 가 있습니다"), // 04:74, 05:86
    RESERVED_CATEGORY("MDM012", 400, ErrorCode.BUSINESS_ERROR, "예약 카테고리 BASE 는 편집·삭제할 수 없습니다"); // 04:95, 05:161
    // 필드 code, httpStatus, transport, defaultMessage + getter 4개
}
public record MdmCheckIssue(String code, String message, String field, String itemKey) {}  // field·itemKey null 허용. cactus ErrorDetail 로 옮길 수 있는 모양

// ── screen ──
public enum MdmScreenGroup {                   // screens/README §2, ADR-0003 D1
    DMA("dma", "용어·도메인"), DMB("dmb", "레이아웃"), DMC("dmc", "마스터코드"), DMD("dmd", "마스터데이터"), DME("dme", "업무기준");
    // code(), menuFolderName()
}
public final class MdmOasisConventions {       // screens/README §5, TRD §3
    public static final String MODULE_ID = "mdm";
    public static final String MENU_ROOT_ID = "mdm";
    public static final String OASIS_URL_PREFIX = "/api/mdm/oasis/";     // + {serviceId}/{action}, serviceId = screenId
    public static final String BPMN_LOCATION_PREFIX = "services/";       // + {group}/{screenId}.bpmn
    public static final String BACKEND_BASE_PACKAGE = "com.dongkuk.dmes.mdm"; // + .{group}.{screenId}.{dto,service}
    public static final String GROUP_CODE_PATTERN = "^dm[a-z]$";
    public static final String SCREEN_ID_PATTERN = "^[a-z][a-zA-Z0-9]*$"; // DataInitializer.insertMcmSecMenuIfAbsent 의 OBJECT_ID 검사와 같다
}

// ── security ──
public final class MdmRoles {                  // ADR-0003 D5
    public static final String STD_ADMIN = "MDM_STD_ADMIN", STEWARD = "MDM_STEWARD";
    public static final List<String> ALL = List.of(STD_ADMIN, STEWARD);
}
public final class MdmActions {                // ADR-0003 D5 대조표 — 모두 현재 allActions 에 있음
    public static final String SEARCH = "search", VIEW = "view", EXPORT = "export", COMPARE = "compare",
            SAVE = "save", DELETE = "delete", REG = "reg", IMPORT = "import", VALIDATE = "validate",
            EXECUTE = "execute", COPY = "copy", RESTORE = "restore", CONFIRM = "confirm";
    // lock/unlock/handover 는 두지 않는다: ADR-0003 이 화면 Task 가 이름을 확정하도록 남겼다
}
public final class MdmPermissions {            // ADR-0003 D5
    public static final String READ = "PERM_MDM_READ", EDIT = "PERM_MDM_EDIT", CONFIRM = "PERM_MDM_CONFIRM";
    public static final List<String> READ_ACTIONS = List.of(SEARCH, VIEW, EXPORT, COMPARE);
    public static final List<String> EDIT_ACTIONS = List.of(SEARCH, VIEW, EXPORT, COMPARE, SAVE, DELETE, REG, IMPORT, VALIDATE, EXECUTE, COPY, RESTORE);
    public static final List<String> CONFIRM_ACTIONS = List.of(/* EDIT_ACTIONS 전부 */ ..., CONFIRM);
    /** 그룹 × 역할 → PERM ID. SYSADMIN 은 여기 없다(기존대로 PERM_ALL). 시드는 TSK-01-03. */
    public static final Map<MdmScreenGroup, Map<String, String>> MATRIX = Map.of(
            DMA, Map.of(STD_ADMIN, EDIT, STEWARD, READ),
            DMB, Map.of(STD_ADMIN, EDIT, STEWARD, READ),
            DMC, Map.of(STD_ADMIN, READ, STEWARD, CONFIRM),
            DMD, Map.of(STD_ADMIN, READ, STEWARD, EDIT),
            DME, Map.of(STD_ADMIN, READ, STEWARD, CONFIRM));
}

// ── version ──
public enum VersionStatus { DRAFT, REQUESTED, APPROVED, RELEASED, CANCELLED }   // 04:259-265 순서 그대로
public enum MaruObjectStatus { CREATED, INUSE, DEPRECATED }                    // 04:231·247-255
public enum VersionTransition {                // 04:234-245 + ADR-0002 D1. to == null 은 행 삭제
    REQUEST(DRAFT, REQUESTED, false), REJECT(REQUESTED, DRAFT, false), APPROVE(REQUESTED, APPROVED, false),
    UNAPPROVE(APPROVED, DRAFT, false), RELEASE(APPROVED, RELEASED, false), CANCEL(RELEASED, CANCELLED, false),
    DELETE_DRAFT(DRAFT, null, true),           // 원천 04 의 DRAFT → 삭제
    CONFIRM(DRAFT, RELEASED, true);            // 담당자 확정(결재 없음, PRD §2 규칙 7) — 원천에는 없는 전이
    // from(), to(), inScope()
}
public enum VersionTarget {                    // PRD FR-F1: 04·06 이 같은 버전 상태 서비스를 쓴다
    MASTER_CODE("TB_MDM_CODE_VER", 3),         // 04 DECIMAL(7,3)
    BUSINESS_RULE("TB_MDM_RULE_VER", 0);       // 06 정수
    // versionTable(), versionScale()
}
public record VersionRef(VersionTarget target, String objectId, BigDecimal ver) {}   // objectId = maru_code_id 또는 maru_rule_id
public final class VersionConventions {        // 04:305·1008, 규칙표 §2·#16
    public static final String ROW_VERSION_COLUMN = "ROW_VERSION";
    public static final long INITIAL_ROW_VERSION = 0L;
    public static final long ROW_VERSION_STEP = 1L;
    public static final LocalDateTime OPEN_END = LocalDateTime.of(9999, 12, 31, 0, 0, 0);  // apply_to 열린 끝
}
public interface VersionStateService {         // 구현 TSK-01-03(ADR-0002 D4). 04·06 영역 서비스가 부른다
    /** 담당자 확정 DRAFT→RELEASED. 실패 시 BusinessException(MdmErrorCode…), DRAFT 는 그대로. */
    ConfirmResult confirm(ConfirmCommand command);
    /** DRAFT 삭제(소유자만). */
    void deleteDraft(VersionRef draft, long expectedRowVersion, String userId);
}
public record ConfirmCommand(VersionRef draft, long expectedRowVersion, LocalDateTime applyFrom,
                             String confirmerId, boolean warningsAcknowledged) {}
public record ConfirmResult(VersionRef confirmed, long rowVersion, VersionRef closedPrevious,  // closedPrevious null = 최초 버전
                            List<MdmCheckIssue> warnings) {}
public interface DraftOwnershipService {       // ADR-0002 D3. 반환값 = 갱신 뒤 row_version
    long acquire(VersionRef draft, long expectedRowVersion, String userId);
    long release(VersionRef draft, long expectedRowVersion, String ownerId);
    long handover(VersionRef draft, long expectedRowVersion, String ownerId, String newOwnerId);
}
public interface ApplyFromOrderCheck {         // ADR-0002 D4-3: 엄격한 >, 최초 버전 면제
    /** previousReleasedApplyFrom 이 null 이면 최초 버전이라 통과. 통과면 Optional.empty(), 아니면 MDM008 이슈. */
    Optional<MdmCheckIssue> check(LocalDateTime previousReleasedApplyFrom, LocalDateTime requestedApplyFrom);
}
public interface VersionConfirmCheckSpi {      // 04(TSK-06-01 선언·06-05 구현)·06(TSK-08-01 선언·08-05 구현)
    VersionTarget target();
    /** 직전 RELEASED 대비 draft 의 diff. 최초 버전이면 base 가 null. */
    VersionDiff diff(VersionRef draft);
    /** 대상별 확정 검사. apply_from 순서는 VersionStateService 가 ApplyFromOrderCheck 로 공통 검사하므로 SPI 가 반복하지 않는다. */
    ConfirmCheckResult check(ConfirmCheckRequest request);
}
public record ConfirmCheckRequest(VersionRef draft, LocalDateTime requestedApplyFrom,
                                  LocalDateTime previousReleasedApplyFrom, String confirmerId, LocalDateTime now) {}
public record ConfirmCheckResult(List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings) {}  // errors 가 비면 통과
public enum DiffKind { ADDED, REMOVED, CHANGED, SAME }                         // 06:1253-1278(04 는 SAME 을 내지 않는다)
public record VersionDiff(VersionRef base, VersionRef target, List<VersionDiffEntry> entries) {}
public record VersionDiffEntry(String key, DiffKind kind, Map<String, Object> oldValues, Map<String, Object> newValues) {}
// key: 04 는 code, 06 은 row_id. ADDED 면 oldValues null, REMOVED 면 newValues null

// ── category ──
public enum CategoryKind { REGEX, TABLE }                                      // 04:178-181, 05:149-152
public enum CategoryDefTarget { CODE, KEY, LVL1, LVL2, LVL3, LVL4, LVL5,
    ATTR01, ATTR02, ATTR03, ATTR04, ATTR05, ATTR06, ATTR07, ATTR08, ATTR09, ATTR10 }
public enum CategoryOwner {                    // 04:1032, 05:157·660. def_target 은 REGEX 일 때만, TABLE 이면 null
    MASTER_CODE(CODE, EnumSet.of(CODE, LVL1..LVL5, ATTR01..ATTR10)),
    MASTER_DATA(KEY,  EnumSet.of(KEY,  LVL1..LVL5, ATTR01..ATTR10));
    // baseDefTarget(), allowedDefTargets() — 반환 Set 은 수정 불가(Collections.unmodifiableSet)
}
public final class CategoryConventions {       // 04:95·1027, 05:161·656
    public static final String BASE_CATE_ID = "BASE";
    public static final CategoryKind BASE_DEF_KIND = CategoryKind.REGEX;
    public static final String BASE_DEF_EXPR = ".*";
}
public record CategoryDefinition(String cateId, String cateName, CategoryKind defKind, String defExpr,
                                 CategoryDefTarget defTarget, String description) {}   // defExpr·defTarget 은 TABLE 이면 null
public enum MaruIdKind { MASTER_CODE, MASTER_DATA }
public interface MaruIdNamespace {             // 04(TB_MDM_CODE)·05(TB_MDM_DATA) 가 구현. 등록 서비스는 List<MaruIdNamespace> 로 상대 표를 본다
    MaruIdKind kind();
    boolean contains(String maruId);
}
public final class MaruIdRules {               // 04:73, 05:617
    /** maru_code_id·maru_data_id·cate_id 금지 문자(점·공백·콤마). */
    public static final String FORBIDDEN_CHAR_PATTERN = "[.,\\s]";
}
```
- `static import` 로 enum 상수를 쓴 것은 설명용이다. 실제 코드는 가독성에 맞게 쓴다.
- `EnumSet` 을 enum 생성자에서 만드는 것은 상수 데이터라 허용한다(ArchUnit 은 클래스 종류만 본다).
- ArchUnit 이 record 를 판별하는 방법: ArchUnit 1.3.0 의 `JavaClass.isRecord()` 가 없으면 `getRawSuperclass()` 이름이 `java.lang.Record` 인지로 본다.

---

## 3. 테스트 전략

TDD 순서: T1~T13 을 먼저 쓰고 **컴파일 실패 또는 단언 실패로 빨강을 확인**한 뒤 A1~A44 를 만든다. 커밋 B 는 스모크(E2E·Vitest)를 먼저 고쳐 빨강을 확인한 뒤 옮긴다.

### 3.1 lib 단위·아키텍처 테스트 (testAll 포함)

- **T1 `MdmContractArchitectureTest`**(ArchUnit, `importPackages("com.dongkuk.dmes.mdm")` + `DO_NOT_INCLUDE_TESTS`)
  1. `com.dongkuk.dmes.mdm.contract..` 의 모든 클래스(package-info 제외)는 인터페이스·enum·record·상수 클래스 중 하나다. 상수 클래스 = `final` 이고, 필드가 모두 `static final` 이며, 생성자가 모두 `private` 이고, 생성자 외 메서드가 없다.
  2. 계약 패키지의 인터페이스 메서드는 모두 abstract 다(`default`·`static` 없음).
  3. 계약 패키지는 `org.springframework..`, `jakarta.persistence..`, `org.hibernate..`, `java.sql..`, `javax.sql..` 에 의존하지 않는다.
  4. `com.dongkuk.dmes.mdm..` 의 어떤 클래스도 As-Is 마스터 자산(F10)에 의존하지 않는다 — 패키지 `com.dongkuk.dmes.mcm.cma..`·`cmb..`·`cme..`·`code..`, 그리고 `com.dongkuk.dmes.mcm.entity`·`com.dongkuk.dmes.mcm.repository` 안에서 단순 이름이 `Master`·`RuleMaster` 로 시작하는 클래스(ADR-0003 D4-2).
  5. lib main 에 `contract..` 밖의 클래스가 없다는 단언은 **두지 않는다**(TSK-01-03 이 구현을 lib main 에 추가하기 때문). 이번 Task 의 "계약 밖 코드 0" 은 Verify 의 diff 확인으로 본다(§4).
- **T2 `VersionContractTest`**: `VersionStatus.values()` 이름 목록 = `[DRAFT, REQUESTED, APPROVED, RELEASED, CANCELLED]`. `MaruObjectStatus` = `[CREATED, INUSE, DEPRECATED]`. `VersionTransition` 8개 각각의 from/to/inScope 가 §2.9 와 같고, `inScope == true` 인 집합이 정확히 `{DELETE_DRAFT(DRAFT→null), CONFIRM(DRAFT→RELEASED)}`. `VersionConventions` 4상수 값. `VersionTarget` 2종의 표·scale.
- **T3 `CategoryContractTest`**: `CategoryKind` = `{REGEX, TABLE}`. BASE 상수 3개. `MASTER_CODE.allowedDefTargets()` = CODE + LVL1~5 + ATTR01~10(16개, KEY 없음), `MASTER_DATA` = KEY + LVL1~5 + ATTR01~10(16개, CODE 없음), baseDefTarget CODE/KEY. `allowedDefTargets()` 가 수정 불가(추가 시 `UnsupportedOperationException`). `MaruIdKind` 2종. `MaruIdRules.FORBIDDEN_CHAR_PATTERN` 이 `"A.B"`, `"A B"`, `"A,B"` 에 찾기 일치하고 `"PROC_CD"` 에는 없다.
- **T4 `SecurityScreenContractTest`**: 역할 2종 값, PERM 3종 값, READ/EDIT/CONFIRM 액션 **집합**이 ADR-0003 과 같고 READ ⊂ EDIT ⊂ CONFIRM, `CONFIRM − EDIT = {confirm}`, 13개 액션 상수 전부가 어느 세트엔가 들어 있음, 액션에 `lock`·`unlock`·`handover` 없음. `MATRIX` 10칸이 ADR-0003 표와 같고 키가 5그룹 전부. `MdmScreenGroup` 코드 = `{dma, dmb, dmc, dmd, dme}`, 모두 `GROUP_CODE_PATTERN` 일치, 폴더 이름이 screens/README §2 와 같음. `MODULE_ID = "mdm"`, `OASIS_URL_PREFIX = "/api/mdm/oasis/"`, `"mdmSample"`·`"codeConfirm"` 이 `SCREEN_ID_PATTERN` 일치, `"MdmSample"`·`"mdm_sample"` 불일치.
- **T5 `CommonContractTest`**: `MdmSystemCodes.SEEDED` = `[ERP, MES, APS, DKMS, L2, MDM]`, `SELF = "MDM"` 이고 SEEDED 에 포함. `MdmAuditColumns.ALL` 9개 순서, `NATIVE_COLUMN_LIST.equals(String.join(", ", ALL))`, 모두 `^[A-Z][A-Z0-9_]*$`. `MdmErrorCode` 코드 유일·`^MDM\d{3}$`·transport 비어 있지 않음·`ROW_VERSION_CONFLICT.httpStatus == 409`·원천 인용 메시지 2건(MDM001·MDM007)이 원천 문구와 같음. `MdmDialect` = `{SQLITE, MSSQL}`.
- **T6~T9 스텁**(`…/contract/stub/`, test 전용): 04 스텁은 `target() = MASTER_CODE`, diff 1행(ADDED), check 는 errors 빈 목록·warnings 1건(2-1 경고 모양). 06 스텁은 `BUSINESS_RULE`, diff 1행(CHANGED), check 는 errors 1건. 04·05 이름 공간 스텁은 고정 집합으로 `contains`. `ContractStubCompileTest` 는 스텁들을 `List<VersionConfirmCheckSpi>`·`List<MaruIdNamespace>` 로만 다뤄 ① target·kind 가 서로 다르고 모든 enum 값을 덮으며 ② 반환 record 가 필드를 보존하고 ③ "04 에 있는 ID 를 05 등록이 조회하면 소유자가 MASTER_CODE" 같은 이름 공간 조회 모양이 컴파일·실행됨을 확인한다. 이 테스트의 가치는 **컴파일**이다(시그니처가 바뀌면 스텁이 깨진다).
- **T10 `ApplyFromOrderCheckContract`**(abstract, `protected abstract ApplyFromOrderCheck subject()`): ① 이전 null(최초 버전) → 어떤 일시든 empty ② 요청 = 이전 → `MDM008` ③ 요청 < 이전 → `MDM008` ④ 요청 = 이전 + 1초 → empty ⑤ 과거 일시라도 이전보다 뒤면 empty(소급 허용, ADR-0002 결과). `ApplyFromOrderCheckStub`(test 전용 참조 구현)과 `ApplyFromOrderCheckStubTest extends ApplyFromOrderCheckContract`. TSK-01-03 은 실구현 테스트가 이 클래스를 상속하게 한다(§7 인계).

### 3.2 api SQLite 통합 테스트 T11 (testAll 포함)

`MdmSharedContractMigrationTest`: `@SpringBootTest`(웹 환경 MOCK) + `@ActiveProfiles("local")` + `@TempDir` SQLite 파일 URL(`jdbc:sqlite:<file>`, 파라미터 없이 — §2.5 가 URL 과 무관하게 동작함을 보이려고). 한 컨텍스트에서:
1. `flyway_schema_history` 의 성공 버전 집합 = `{1, 2}`.
2. `SELECT SYSTEM_CODE, SYSTEM_NAME, SELF_YN, VER, C_USR_ID, C_AT FROM TB_MDM_SYSTEM` = 6행이고 코드 집합이 `MdmSystemCodes.SEEDED` 와 같다. `SELF_YN='Y'` 는 정확히 1행이고 그 코드가 `MdmSystemCodes.SELF`. 이름은 D10 값. `VER=0`, `C_USR_ID='SYSTEM'`, `C_AT IS NULL`.
3. `INSERT … SELF_YN='Y'`(새 코드) → `SQLException`(UNIQUE). `SELF_YN='y'` → `SQLException`(CHECK). `SYSTEM_CODE='erp'` 는 들어가고 `'ERP'` 조회는 여전히 1행(대소문자 구분).
   - **쓰기 단언은 반드시 롤백한다.** 같은 클래스의 메서드는 같은 `@TempDir` DB 를 공유하므로, `'erp'` INSERT 가 남으면 실행 순서에 따라 2번의 "정확히 6행" 단언이 깨진다. 쓰기 단언은 한 `Connection` 에서 `setAutoCommit(false)` 로 시작해 `finally` 에서 `rollback()` 한다. 5번의 임시 FK 테이블 DDL 도 같은 방식으로 롤백한다(SQLite 는 DDL 도 트랜잭션에 든다). 이 규칙은 T12(MSSQL)에도 같다.
4. `PRAGMA table_info(TB_MDM_SYSTEM)` 칼럼 이름 집합 = `{SYSTEM_CODE, SYSTEM_NAME, SELF_YN} ∪ MdmAuditColumns.ALL`, 모두 `^[A-Z][A-Z0-9_]*$`. `C_AT`·`U_AT` 선언 타입 `TIMESTAMP`, `VER` `BIGINT`. `sqlite_master.sql` 에 `CONSTRAINT PK_TB_MDM_SYSTEM`·`CONSTRAINT CK_TB_MDM_SYSTEM_SELF_YN` 포함, 인덱스 `UX_TB_MDM_SYSTEM_SELF_YN` 존재. 테이블 이름이 `^TB_MDM_[A-Z][A-Z0-9_]*$`.
5. `PRAGMA foreign_keys` = 1. 그리고 테스트 전용 임시 테이블 두 개(`TMP_FK_PARENT`, `TMP_FK_CHILD … REFERENCES TMP_FK_PARENT`)를 JDBC 로 만들어 없는 부모를 가리키는 INSERT 가 `SQLException` 인지 본다(규칙표 #14 동작). 테이블 생성부터 INSERT 까지 한 트랜잭션에서 하고 `rollback()` 으로 끝낸다(3번 규칙). PRAGMA 확인은 같은 풀의 연결로 하되, 트랜잭션 안에서는 `foreign_keys` 를 바꿀 수 없으므로 값 읽기만 한다.
6. `EntityManagerFactory` 속성에 `hibernate.session_factory.statement_inspector` 가 없다(ADR-0001 D2, F12).

`MdmApplicationHealthTest` 는 바꾸지 않는다(V1 검사는 그대로 참).

### 3.3 MSSQL 게이트 T12 (testAll 비포함, D5)

`MdmMssqlMigrationTest`(`src/mssqlTest/java`): `@Testcontainers` + `static MSSQLServerContainer MSSQL = new MSSQLServerContainer(DockerImageName.parse("mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04")).acceptLicense();`.
1. JDBC 로 `CREATE DATABASE mdm` 뒤 URL 에 `;databaseName=mdm` 을 붙여 Flyway API(`Flyway.configure().dataSource(...).locations(<local-db 의 locations>).load().migrate()`)로 적용한다. locations 문자열은 하드코딩하지 않고 `application-local-db.yml` 을 `YamlPropertiesFactoryBean` 으로 읽은 `spring.flyway.locations` 값을 쓴다(앱 설정과 게이트를 묶는다). `migrationsExecuted == 2`, `targetSchemaVersion == "2"`.
2. §3.2 의 2·3 과 같은 단언을 MSSQL 에서 한다. 오류 번호 2601(UX)·547(CHECK)을 확인하고, `'erp'` 가 `'ERP'` 와 다른 키로 들어가는지 본다.
3. `sys.columns` 로 `SYSTEM_CODE`·`SELF_YN` 의 `collation_name = 'Latin1_General_100_BIN2'`, `SYSTEM_NAME` 타입 `nvarchar`, `C_AT`·`U_AT` 타입 `datetime2`, `VER` `bigint`. `sys.key_constraints` 에 `PK_TB_MDM_SYSTEM`, `sys.check_constraints` 에 `CK_TB_MDM_SYSTEM_SELF_YN`, `sys.indexes` 에 `UX_TB_MDM_SYSTEM_SELF_YN`(is_unique=1, has_filter=1).
4. `SELECT @@VERSION` 을 출력해 실행 기록에 남긴다.

SQLite(T11)와 MSSQL(T12)이 같은 사실을 보도록, 단언 헬퍼(시드 기대값·칼럼 이름 집합)를 `MdmSystemCodes`·`MdmAuditColumns` 상수에서 가져온다. 기대값을 테스트마다 따로 적지 않는다.

**실행 절차(Build·Verify 공통)**:
```bash
orb status                      # Stopped 이면: orb start (남의 컨테이너 3개가 같이 올라온다 — F13)
docker info >/dev/null && ls -la /var/run/docker.sock   # 링크가 없으면 DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock
cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon
```
- 처음 실행은 amd64 이미지(약 1.6GB)를 받는다. Apple Silicon 은 Rosetta 에뮬레이션으로 돈다(F14·F16 실측 통과).
- 끝나면 `docker ps -a` 로 이 테스트가 남긴 컨테이너가 없는지 본다(Ryuk 가 치운다). 착수 전 OrbStack 이 `Stopped` 였다면, 남의 컨테이너가 `orb start` 로 올라온 것뿐인지 확인한 뒤 `orb stop` 으로 되돌린다.
- 이 게이트는 결정적 명령이다. 통과 로그(`MdmMssqlMigrationTest > … PASSED`, `@@VERSION` 줄)를 Verify 보고에 붙인다.

### 3.4 프런트엔드 (커밋 B)

- m-mdm Vitest `tsup-entries.smoke.test.ts`: **먼저** `tsup.config.ts` 만 바꾸면 빨강(디스크 `mdt/mdmSample` ≠ entry `dma/mdmSample`) → `git mv` 뒤 초록. `pnpm --filter @dk-oasis/m-mdm test` 1 passed, `tsc --noEmit` 통과.
- `node src/frontend/m-mcm/scripts/generate-page-registry.mjs` 재생성 후 `page-registry.ts` 에 `"dma/mdmSample"` 1개·`mdt/` 0개(grep).
- `pnpm --filter @dk-oasis/m-mdm build` 통과(dist 에 `pages/dma/mdmSample/page.js` 생성).
- UI 스킬 점검: `D=.claude/skills/mantine-aggrid-ui/scripts; python3 $D/mantine_docs.py audit src/frontend/m-mdm/pages/dma/mdmSample/page.tsx; python3 $D/aggrid_docs.py audit src/frontend/m-mdm/pages/dma/mdmSample/page.tsx` 모두 0건.
- m-mcm eslint 는 기준선 23 errors/44 warnings 와 차분 비교(바꾼 것은 주석 1줄과 생성 파일뿐이라 증감 0 기대).

### 3.5 브라우저 E2E 스모크 (커밋 B, 빈 포트 직접 기동)

스모크 넷 적용: ① 메뉴 이동 — **적용**(마루 MDM → 용어·도메인 → MDM 샘플). ② 목록·빈 상태, ③ 등록·수정, ④ 서버 오류 표시 — **해당 없음**: 샘플은 그리드·입력·API 호출이 없는 빈 화면이다(TSK-01-01 §3.3 과 같은 사유).

절차(Verify 가 실행, 서버 규칙은 dev-discipline 「서버 프로세스」):
```bash
W=/Users/jji/project/dmes-standard/dflow-eb6fdb44
SP=<자기 scratchpad>
# 0) 빈 포트 고르기 — 둘 다 LISTEN 이 없어야 한다(예: BE 18100, FE 15100)
lsof -iTCP:18100 -sTCP:LISTEN; lsof -iTCP:15100 -sTCP:LISTEN
# 1) 격리 DB 자리(F17). 없으면 메인 체크아웃 mcm.db 를 잡는다
mkdir -p $W/src/backend/data          # gitignore 대상. 기존 파일이 없으므로 새 DB 로 시작
# 2) mcm 백엔드
cd $W/src/backend/mcm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ../gradlew :api:bootRun --no-daemon --console=plain --args='--spring.profiles.active=local --server.port=18100 --mcm.bff.invalidate-role-url=http://127.0.0.1:15100/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18100/notify/publish' > $SP/be.log 2>&1 &
BE_PID=$!      # 기록. 기동 로그에서 sqlite 경로가 $W/src/backend/data/mcm.db 인지 반드시 확인(아니면 즉시 중단)
# 3) 포털 — m-mdm 을 먼저 build, 레지스트리는 커밋된 것 사용
cd $W/src/frontend && pnpm --filter @dk-oasis/m-mdm build
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15100 OIDC_ISSUER=http://127.0.0.1:15100 \
  MCM_WAS_URL=http://127.0.0.1:18100 BACKEND_API_URL=http://127.0.0.1:18100 BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 \
  pnpm exec next dev --turbopack --port 15100 > $SP/fe.log 2>&1 &
FE_PID=$!
# 4) 스모크 — 반드시 자기 포털을 가리킨다(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과)
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15100 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  pnpm exec playwright test e2e/mdm-sample-smoke.spec.ts
```
- 통과 기준: `1 passed`, skipped·failed 0. 거짓 통과 방지 증거 3가지를 보고에 붙인다. ① `be.log` 의 SQLite 경로가 워크트리 쪽이다. ② `be.log` 에 로그인·메뉴 조회 요청이 찍혔다(자기 백엔드가 응답함). ③ `sqlite3 $W/src/backend/data/mcm.db "SELECT MENU_ID, MENU_NM FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID IN ('dma','mdt'); SELECT PARENT_MENU_ID FROM TB_MCM_SEC_MENU WHERE MENU_ID='mdmSample';"` → `dma|용어·도메인`, `dma`.
- **기존 DB 이행 확인(D2)**: 백엔드만 내린 뒤(아래 정리 절차), 같은 DB 를 옛 상태로 되돌린다 — `sqlite3 …/mcm.db "UPDATE TB_MCM_SEC_MENU_FLD SET MENU_ID='mdt', MENU_NM='용어·도메인·컬럼·단위' WHERE MENU_ID='dma'; UPDATE TB_MCM_SEC_MENU SET PARENT_MENU_ID='mdt' WHERE MENU_ID='mdmSample';"`. 백엔드를 같은 명령으로 다시 띄우고 ③ 의 조회가 다시 `dma|용어·도메인`·`dma` 이고 `mdt` 행이 없는지 확인한 뒤 스모크를 한 번 더 돌린다(1 passed). 이 확인은 자동 테스트가 없는 `DataInitializer` 의 유일한 검증이다(§5 I21 한계).
- 스크린샷: 스펙이 `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png` 에 쓴다. 커밋한다.
- **정리**: `kill $FE_PID $BE_PID` 뒤, 자기 포트를 아직 리슨하는 프로세스만 `lsof -tiTCP:15100 -sTCP:LISTEN | xargs kill`, `lsof -tiTCP:18100 -sTCP:LISTEN | xargs kill`(시작할 때 비어 있음을 확인한 포트라 점유자는 자기 프로세스뿐). 금지: `gradlew --stop`, `pkill`·`killall`·`pgrep -f` 종료, 5100·8100 프로세스 종료. `src/backend/data/` 는 gitignore 대상이라 남겨도 된다.

### 3.6 게이트 명령 (Verify)

| 게이트 | 명령 | 판정 |
|---|---|---|
| backend 전체 | `cd src/backend && JAVA_HOME=… ./gradlew testAll` | 기준선 395 대비 신규 실패 0, 총수 증가(새 테스트 수만큼) |
| MSSQL 적용 | §3.3 `:api:mssqlMigrationTest` | PASSED(수동 게이트, docker 필요) |
| testAll 비포함 확인 | `cd src/backend && ./gradlew testAll --dry-run > $SP/dry.txt; grep -c ':mdm:api:test\|mdm:api:test' $SP/dry.txt; grep -ci mssql $SP/dry.txt` | **양성 대조가 먼저**: 같은 출력에 mdm 의 `:api:test`(또는 `:lib:test`)가 1줄 이상 찍혀야 이 검사가 유효하다. 찍히지 않으면(composite 빌드가 포함 빌드 태스크를 dry-run 에 안 보이는 경우) 대신 `cd src/backend/mdm && ../gradlew test --dry-run` 출력에서 `:api:test` 가 찍히고 `mssqlMigrationTest` 가 0줄인지 본다. 그 뒤 `mssql` 0줄 |
| m-mdm | `pnpm --filter @dk-oasis/m-mdm test` / `tsc --noEmit` / `build` | 1 passed / 통과 / 통과 |
| m-mcm lint | `pnpm -C src/frontend/m-mcm lint` | 기준선 23 errors/44 warnings 대비 증가 0 |
| UI audit | §3.4 | 0건 |
| E2E | §3.5 | 1 passed ×2(새 DB, 이행 DB) |
| mdt 잔존 | `rtk proxy grep -rnw mdt src --include='*.ts' --include='*.tsx' --include='*.java' --include='*.mjs' --include='*.sql' \| grep -v -E 'node_modules\|/dist/\|/build/\|/.next/'` | `DataInitializer.java` 한 파일뿐이고, 그 안에서도 `migrateMdmSampleGroupToDma` 메서드 본문과 그 바로 위 주석에만 있다(`seedMdmMenus` javadoc 은 `mdt` 글자 없이 "옛 그룹" 으로 쓴다) |

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 실행 로직 없음 (contract-only) | T1-1·2·3(ArchUnit, 계약 패키지 종류·순수성). Verify 가 `git diff --stat <base>..HEAD -- src/backend/mdm/lib/src/main` 으로 lib main 추가가 `contract/` 아래뿐인지 확인. 커밋 A 에 서비스 구현·Spring 빈이 없음을 diff 로 확인. 커밋 B 의 `DataInitializer` 변경은 샘플 이동(D1·D2)으로 계약과 분리돼 있음을 커밋 경계로 보인다 |
| 두 방언 마이그레이션이 SQLite·MSSQL 에서 적용된다 | SQLite: T11(스프링 부트 local 프로파일이 Flyway V1·V2 적용, testAll 포함). MSSQL: T12(Testcontainers SQL Server 2022-CU27 에 local-db 설정의 locations 로 Flyway 적용, 수동 게이트). 설계 단계에서 같은 DDL 을 SQL Server 2022 RTM-CU27 에 실제로 적용해 봤다(F14). 한계: MSSQL 게이트는 docker 가 있는 환경에서만 돌고 testAll(CI) 은 MSSQL 을 보지 않는다(D5) |
| 공통 DTO·상수가 mdm lib 에 컴파일된다 | `:lib:compileJava` 성공(testAll 이 포함). T2~T5 가 상수 값을 단언 |
| 04·06 이 같은 인터페이스를 구현할 수 있음을 스텁 컴파일로 확인 | T6·T7(04·06 역할 스텁이 `VersionConfirmCheckSpi` 구현), T8(04·05 역할 `MaruIdNamespace`), T9(인터페이스 타입으로만 사용), T10(`ApplyFromOrderCheck` 계약 테스트 키트). 모두 lib **test** 소스셋 — 런타임 스텁 없음(T1 이 main 의 구현 클래스를 막는다) |
| (팀장 지시) 샘플 `mdt/mdmSample` → `dma` | §3.4 Vitest·레지스트리 grep·build, §3.5 E2E 2회(새 DB·이행 DB), §3.6 `mdt` 잔존 grep, 커밋 B 단독 revert 가능(커밋 A 파일을 건드리지 않음) |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

Build·Verify 는 항목마다 적힌 변이를 **일부러 넣어 빨강을 확인**하고 되돌린다. 빨강이 안 나는 변이는 보고한다.

| # | 불변 규칙 | 변이 → 기대 빨강 |
|---|---|---|
| I1 | 버전 상태는 정확히 5종 `DRAFT, REQUESTED, APPROVED, RELEASED, CANCELLED`(원천 순서) | 상수 하나 추가·삭제·개명 → T2 |
| I2 | 상위 객체 상태는 정확히 3종 `CREATED, INUSE, DEPRECATED` | 개명 → T2 |
| I3 | 이번 범위 전이는 **버전 상태 사이 전이 중** 정확히 2종: `CONFIRM`(DRAFT→RELEASED), `DELETE_DRAFT`(DRAFT→삭제). 나머지 6종은 원천 from/to 그대로 `inScope=false`. "(없음)→DRAFT 생성" 과 "상위 CREATED→INUSE" 는 버전 상태 사이 전이가 아니라 이 표에 없다(ADR-0002 D1 표와 모순 아님) | `REQUEST.inScope=true` → T2 / `CONFIRM.to=APPROVED` → T2 / `DELETE_DRAFT` 삭제 → T2 |
| I4 | `row_version` 초깃값 0·증분 1·칼럼 `ROW_VERSION`, 열린 끝 `9999-12-31 00:00:00` | `INITIAL_ROW_VERSION=1` → T2 / `OPEN_END` 에 초 1 → T2 |
| I5 | `TB_MDM_SYSTEM` 시드는 두 방언 모두 정확히 6행 `{ERP, MES, APS, DKMS, L2, MDM}` 이고 `SELF_YN='Y'` 는 `MDM` 한 행뿐이며 `MdmSystemCodes.SEEDED`·`SELF` 와 같다. 이름은 D10 값 | sqlite V2 에서 L2 행 삭제 → T11 / MDM 을 N·ERP 를 Y → T11 / mssql V2 에서 같은 변이 → T12 / `SEEDED` 에서 L2 삭제 → T5·T11 |
| I6 | DB 가 자기 행 하나(`UX_TB_MDM_SYSTEM_SELF_YN` 부분·필터 유일)와 `SELF_YN ∈ {'Y','N'}`(대소문자 구분)을 강제한다. MSSQL `SYSTEM_CODE`·`SELF_YN` 은 `Latin1_General_100_BIN2` | UX 인덱스 줄 삭제 → T11(두 번째 Y 허용)·T12 / mssql `SELF_YN` 의 COLLATE 삭제 → T12(`'y'` 통과, collation 단언) / CHECK 삭제 → T11·T12 |
| I7 | 명명: 테이블 `TB_MDM_SYSTEM`, 칼럼 전부 UPPER_SNAKE, 감사 9칼럼(`MdmAuditColumns.ALL`)이 있고 타입이 규칙표 §2(SQLite `TIMESTAMP`·MSSQL `datetime2`, `VER` BIGINT), 제약 `PK_TB_MDM_SYSTEM`·`CK_TB_MDM_SYSTEM_SELF_YN`·`UX_TB_MDM_SYSTEM_SELF_YN`, 스키마 접두 없음 | `C_USR_ID`→`CREATE_USER` → T11·T12 / PK 이름 `PK_MDM_SYSTEM` → T11·T12 / mssql `C_AT` 를 `DATETIME` → T12 |
| I8 | 두 방언의 Flyway 버전 집합은 같고 둘 다 `{1, 2}` 를 포함한다. V1 은 바꾸지 않는다. 프로파일별 locations(local=sqlite, local-db=mssql, wildfly=off)는 그대로 | mssql V2 파일명을 V3 으로 → `MdmFlywayVersionParityTest` / sqlite V2 삭제 → 패리티·T11 / local-db locations 변경 → T12(yml 에서 읽음) |
| I9 | 감사 칼럼 상수 9개와 순서, `NATIVE_COLUMN_LIST` 는 `ALL` 을 이은 값 | 순서 바꿈·하나 삭제 → T5 |
| I10 | 화면 그룹 코드 집합은 정확히 `{dma, dmb, dmc, dmd, dme}`, 모두 `^dm[a-z]$`, 폴더 이름은 screens/README §2. 모듈 ID `mdm`, URL 접두 `/api/mdm/oasis/` | `DMF` 추가 → T4 / `DMA` 코드를 `mdt` → T4 / 폴더 이름 변경 → T4 |
| I11 | 역할 2종·PERM 3종·액션 세트(READ ⊂ EDIT ⊂ CONFIRM, CONFIRM−EDIT = {confirm})·매트릭스 10칸이 ADR-0003 과 같다. `lock/unlock/handover` 는 계약에 없다 | STEWARD×dmd 를 CONFIRM → T4 / READ 에 save 추가 → T4 / `LOCK` 상수 추가 → T4 |
| I12 | 오류 코드는 `MDMnnn` 유일, `ROW_VERSION_CONFLICT` 의미 상태 409, 운반용 cactus 코드 있음, 원천 인용 메시지(MDM001·MDM007)는 원천 문구 그대로 | 두 코드를 같은 값으로 → T5 / 409 → 400 → T5 / 메시지 한 글자 → T5 |
| I13 | 카테고리 종류 `{REGEX, TABLE}`, BASE = REGEX `.*`, 04 BASE 대상 CODE·05 KEY, 허용 대상 04 = CODE+LVL1~5+ATTR01~10, 05 = KEY+LVL1~5+ATTR01~10(각 16), 허용 집합 수정 불가 | `MASTER_DATA` 에 CODE 추가 → T3 / `BASE_DEF_EXPR="*"` → T3 / 수정 가능 Set 반환 → T3 |
| I14 | 계약 패키지(`com.dongkuk.dmes.mdm.contract..`)에는 인터페이스·enum·record·상수 클래스만 있고, 인터페이스는 추상 메서드만, Spring·JPA·Hibernate·JDBC 비의존 | 계약 패키지에 `class Foo { void run(){} }` 추가 → T1 / 인터페이스에 `default` 메서드 → T1 / record 에 `jakarta.persistence` 어노테이션 → T1 |
| I15 | mdm 코드는 mcm-core As-Is 마스터 자산(F10)을 import 하지 않는다(ADR-0003 D4-2) | 계약 record 에 `com.dongkuk.dmes.mcm.entity.MasterCode` 필드 추가 → T1 |
| I16 | 04·06 확정 검사 SPI, 04·05 이름 공간 SPI 는 test 스텁이 구현할 수 있는 시그니처를 유지한다. 스텁은 test 소스셋에만 있다 | SPI 메서드 인자 추가 → T6·T7 컴파일 실패 / 스텁을 main 으로 옮김 → T1 |
| I17 | apply_from 순서: 최초 버전 면제, 직전 RELEASED 보다 **엄격히 뒤**만 통과(같으면 거부), 소급(과거 일시)은 허용 | 스텁을 `>=` 로 → T10 ② 빨강 / 최초 면제 삭제 → T10 ① |
| I18 | mdm local(SQLite) 연결은 URL 과 무관하게 `foreign_keys` 가 켜져 있다 | `application-local.yml` 의 속성 삭제 → T11-5 |
| I19 | `McmAuditStatementInspector` 는 mdm 에 등록하지 않는다 | `application.yml` 에 `spring.jpa.properties.hibernate.session_factory.statement_inspector` 추가 → T11-6 |
| I20 | `mssqlMigrationTest` 는 `test`·`testAll` 에 연결되지 않고, 조건부 skip 을 쓰지 않는다 | `tasks.named('test') { dependsOn 'mssqlMigrationTest' }` → §3.6 dry-run grep 1줄 이상(빨강) / `@EnabledIf` 추가 → 리뷰 확인(자동 검출 없음, 보고) |
| I21 | 샘플: OBJECT_ID·screenId·메뉴 ID 는 `mdmSample` 그대로, componentPath `dma/mdmSample`, tsup entry ↔ pages 1:1, 레지스트리에 `mdt/` 키 없음, 기존 DB 는 UPDATE 로 이행(DELETE 없음), 기존 마스터관리·업무기준관리 시드 메서드 불변 | tsup entry 만 되돌림 → Vitest / 레지스트리 수기 편집으로 `mdt` 키 추가 → §3.4 grep / `migrateMdmSampleGroupToDma` 호출 제거 → §3.5 이행 확인 실패(**수동 검증**, 자동 테스트 없음 — 한계 보고) / `seedMcmSecMenuFld` diff 발생 → Verify diff 확인 |
| I22 | 선행 문서의 샘플 배정 문구(ADR-0003·screens/README·wbs), `docs/mdm/tasks/TSK-01-01/**` 는 바꾸지 않는다. 규칙표는 §2.7 의 칸만 바꾼다 | Verify 가 `git diff --stat <base>..HEAD -- docs/` 로 확인 |

---

## 6. TSK-02-01 인계 7항목의 처분

| TSK-02-01 이 넘긴 항목(design §7, 규칙표 §6.1) | 처분 | 근거 |
|---|---|---|
| 감사 칼럼 명시 헬퍼(네이티브 쓰기용) | **계약만**: `MdmAuditColumns`(칼럼 목록 상수) + `AuditStamp` + `MdmNativeAuditSupport` 인터페이스. 구현은 TSK-01-03 | D3 — spec "실행 로직 없음"(1순위) |
| 방언 판정 빈 | **계약만**: `MdmDialect` + `MdmDialectResolver`. 구현(빈)은 TSK-01-03 | D3 |
| SQLite `foreign_keys` 설정 | **이번에 함**: `application-local.yml` 속성 + T11 실측 + 규칙표 #14 갱신 | D4 — 설정이지 실행 로직이 아니다 |
| BOOLEAN·일시 매핑 실측(#15·#16) | **이관 → TSK-04-01**(첫 BOOLEAN·업무 일시 엔티티 Task). 규칙표 화살표 갱신 | D4 |
| `flyway-migration-add` 의 mdm 지원 판정 | **판정함**: 지원하지 않는다(F5). 손으로 채번(V2). 스킬 수정은 범위 밖. 규칙표 §5 에 판정 기록 | 규칙표 §5 가 대체 절차를 이미 정함 |
| As-Is 마스터 엔티티 import 금지 ArchUnit | **이번에 함**: T1-4 | ADR-0003 D4-2 |
| 그룹 코드 상수 `dma~dme` | **이번에 함**: `MdmScreenGroup` | ADR-0003 D1 |

---

## 7. 후속 Task 인계

| 받는 Task | 인계 내용 |
|---|---|
| TSK-01-03 | `VersionStateService`·`DraftOwnershipService`·`ApplyFromOrderCheck`·`MdmNativeAuditSupport`·`MdmDialectResolver` 구현(구현 클래스는 `contract..` 밖에 둔다 — T1 이 막는다). `ApplyFromOrderCheck` 실구현 테스트는 `ApplyFromOrderCheckContract` 를 상속. 역할·PERM·매트릭스 시드는 `MdmRoles`·`MdmPermissions` 상수를 쓴다. `MdmErrorCode` 로 `BusinessException(code.transport(), msg, List.of(ErrorDetail.of(code.code(), msg)))` 를 던지는 방식과 "row_version 409" 수용 기준의 표현(OASIS 는 HTTP 200 + `meta.code`)을 확정(D7). MDM 메뉴 트리 시드 시 `dma` 폴더는 이미 있다(이름 용어·도메인, insert-if-absent 라 다시 넣지 않아도 된다) |
| TSK-02-03 | `TB_MDM_SYSTEM` 을 참조하는 FK 칼럼(`*_SYSTEM.SYSTEM_CODE`, `SOURCE_SYSTEM`)은 `VARCHAR(20)` + MSSQL `COLLATE Latin1_General_100_BIN2` 로 맞춘다(다르면 MSSQL FK 생성 실패). `*_YN` 칼럼도 MSSQL BIN2(F15, D8). MSSQL 필터 인덱스는 `QUOTED_IDENTIFIER ON` 이 필요하다(JDBC 기본 ON, `sqlcmd` 는 `-I`). MSSQL 실측은 `:api:mssqlMigrationTest` 에 테스트를 더해 쓸 수 있다 |
| TSK-04-01 | 규칙표 #15·#16 실측(BOOLEAN·업무 일시·`CactusAuditEntity` Instant 의 SQLite 저장 형식, `SqliteTemporalConverterContributor` 를 mdm local 에 등록할지). MSSQL 쪽은 `mssqlMigrationTest` 하네스 재사용 가능 |
| TSK-06-01 · TSK-08-01 | `VersionConfirmCheckSpi` 구현 대상 선언(`VersionTarget.MASTER_CODE`·`BUSINESS_RULE`), 04 diff 는 `DiffKind.SAME` 을 내지 않음, 확정 검사에서 apply_from 순서를 반복하지 않음(공통 서비스가 함) |
| TSK-06-01 · TSK-07-01 | `MaruIdNamespace` 구현(04 = `MASTER_CODE`, 05 = `MASTER_DATA`), 카테고리는 `CategoryOwner`·`CategoryConventions`·`CategoryDefinition` 재사용 |
| 화면 Task 전부 | DRAFT 소유권 action 이름을 확정하면 `MdmActions` 에 상수를 더하고 T4 기대값과 `allActions`·`PERM_MDM_EDIT` 를 함께 고친다 |

---

## 8. 관례·함정 메모 (Build 가 알아야 할 것)

- mdm 에는 gradlew 가 없다. `src/backend/mdm` 에서 `../gradlew`, JDK 는 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`(시스템 기본은 JDK 26).
- `testAll` 은 `src/backend` 에서 `./gradlew testAll`. mdm 루트 `test` 가 `:lib:test`·`:api:test` 를 명시 집계한다(TSK-01-01 D9) — `mssqlMigrationTest` 를 여기에 넣지 않는다.
- rtk 훅이 `grep`·`ls` 출력을 자른다. 전체가 필요하면 `rtk proxy grep …` 을 쓴다.
- SQLite 테스트 컨텍스트는 `@TempDir` 파일마다 새로 뜬다. T11 은 한 클래스에 모아 컨텍스트를 하나만 띄운다.
- Testcontainers 2.x 의 패키지·아티팩트 이름(F16)을 1.x 문서와 섞지 않는다. `acceptLicense()` 가 없으면 컨테이너가 뜨지 않는다.
- git 은 `/usr/bin/git` 절대경로로 부른다. `git add -A` 금지, 파일명을 명시해 stage. 모든 커밋에 `--trailer "DFlow-Order: eb6fdb44-1c77-4366-bd4f-9e9c7b45a318"`.
- 커밋 B 의 `git mv` 는 폴더 단위(`git mv src/frontend/m-mdm/pages/mdt/mdmSample src/frontend/m-mdm/pages/dma/mdmSample`). 빈 `pages/mdt/` 폴더가 남으면 git 이 추적하지 않으므로 그대로 둔다(파일 삭제 없음).
- `oasis-contract-check`: 이번 변경에 BPMN·OASIS Service 가 없어 해당 없음.
- Design 이 켠 OrbStack 은 Design 종료 시 원래 상태(`Stopped`)로 되돌린다. Build·Verify 는 §3.3 절차대로 필요할 때 켜고 되돌린다.

---

## 담당자 확인 필요 결정

### D1 — 샘플 화면을 이 Task 에서 옮기는가
- **질문**: 저장소 문서(wbs:147, ADR-0003:82, screens/README:61)는 샘플 `mdmSample` 의 `mdt` → `dma` 이동을 TSK-01-03 에 배정했다. 팀장은 이 Task 에서 옮기거나 지우라고 지시했다. 어떻게 하는가?
- **선택지**: (a) 이 Task 에서 `git mv` 로 `dma/mdmSample` 로 옮기고 계약과 별도 커밋 / (b) 이 Task 에서 샘플 삭제 / (c) 문서대로 TSK-01-03 에 남김
- **택한 것**: (a)
- **근거**: 위임자 지시(팀장, 이 Task 의 직접 지시)가 이 Task 에서 처리하라고 한다. 삭제는 사용자 확인이 필요한 행위라 무인 모드에서 고르지 않는다. 옮기면 TSK-01-01 의 "포털에서 mdm 화면이 열린다" 증거가 그대로 유지된다. 저장소 문서(미승인 선행 산출물, 4순위)의 배정 문구는 팀장 지시에 따라 고치지 않는다 — 그래서 문서와 코드가 "누가 옮겼는가" 에서 잠시 어긋난다.
- **반려되면 재작업 방향**: 커밋 B 를 `git revert` 하고(계약 커밋 A 는 무관하게 남는다) TSK-01-03 에 위임한다. decisions.md 의 해당 항목(§2.8 순서 1)은 지우지 않고 새 항목으로 번복을 기록한다.

### D2 — 기존 개발 DB 에 남은 `mdt` 메뉴 행을 어떻게 이행하는가
- **질문**: 메뉴 시드는 insert-if-absent 이고 componentPath 는 `PARENT_MENU_ID/OBJECT_ID` 로 계산된다(F21). 리터럴만 바꾸면 기존 DB 에서는 화면이 열리지 않는다. 폴더 이름도 정해야 한다.
- **선택지**: (a) `seedMdmMenus` 앞에서 UPDATE 로 이행(leaf 부모·자식 폴더 부모·폴더 PK 와 이름·즐겨찾기 경로), DELETE 없음, 폴더 이름은 screens/README §2 의 "용어·도메인" / (b) (a) 에 더해 `dma`·`mdt` 가 둘 다 있으면 `mdt` 폴더 DELETE(`swapLegacyGrpMenuIds` 선례) / (c) 리터럴만 바꾸고 기존 DB 는 개발자가 DB 를 지우도록 안내 / (d) 폴더 이름을 옛 "용어·도메인·컬럼·단위" 로 유지
- **택한 것**: (a)
- **근거**: 공유 개발 MSSQL·동료 SQLite 에 이미 `mdt` 행이 있다(TSK-01-01 머지됨). (c) 는 남의 DB 를 지우게 만들고, (b) 의 DELETE 는 삭제 행위이며 정상 경로에서는 생기지 않는 경우라 이득이 없다(자식 없는 폴더는 사이드바에 보이지 않는다, F22). 이름은 screens/README §2(정본)를 따르는 것이 맞고, insert-if-absent 라서 지금 넣는 이름이 TSK-01-03 때까지 굳는다 — (d) 를 택하면 TSK-01-03 이 이름을 고치는 UPDATE 를 또 써야 한다. 선례 `ensureMenuParent`·`swapLegacyGrpMenuIds` 의 UPDATE 순서를 따른다.
- **반려되면 재작업 방향**: (b) 면 이행 메서드의 "`dma` 가 이미 있으면" 분기에 `DELETE … WHERE MENU_ID='mdt'` 를 더한다(사용자 승인 뒤). (d) 면 `insertMpnFld`·이행 UPDATE 의 이름과 E2E 로케이터를 "용어·도메인·컬럼·단위" 로 되돌리고 TSK-01-03 에 이름 정정을 인계한다.

### D3 — contract-only 와 TSK-02-01 인계(감사 칼럼 헬퍼·방언 판정 빈)의 충돌
- **질문**: spec 은 "실행 로직 없음" 인데, 선행 TSK-02-01 은 감사 칼럼 명시 헬퍼와 방언 판정 빈을 이 Task 에 넘겼다. 둘 다 실행 로직이다.
- **선택지**: (a) 인터페이스·상수·record 만 두고 구현은 첫 소비자 TSK-01-03 / (b) 구현까지 이 Task 에서 하고 contract-only 이탈로 기록 / (c) 둘 다 빼고 TSK-01-03 에 통째로 넘김
- **택한 것**: (a)
- **근거**: spec 본문(1순위)이 "실행 로직 없음" 을 수용 기준으로 둔다. TSK-02-01 은 미승인 선행 산출물(4순위)이다. (a) 는 두 요구를 모두 살린다: 후속 Task 가 쓸 모양(칼럼 목록·감사 값·방언 enum)은 지금 고정하고, 동작은 첫 소비자(확정 트랜잭션의 직전 버전 `apply_to` 닫기 네이티브 UPDATE — TSK-01-03)가 테스트와 함께 만든다. (c) 는 계약 Task 의 존재 이유(모양 고정)를 버린다.
- **반려되면 재작업 방향**: (b) 면 `com.dongkuk.dmes.mdm.support`(계약 패키지 밖)에 `DefaultMdmNativeAuditSupport`(AuditHolder 조회)·`DefaultMdmDialectResolver`(`spring.jpa.database-platform` 문자열 판정)를 만들고 단위 테스트를 붙인 뒤, 수용 기준 "실행 로직 없음" 이탈을 design.md 에 적는다.

### D4 — 규칙표 방언 실측(#14·#15·#16) 중 이 Task 가 할 범위
- **질문**: 규칙표는 #14(SQLite `foreign_keys`), #15(BOOLEAN 매핑), #16(업무 일시·mdm 적용 방식) 실측을 TSK-01-02 에 배정했다. `TB_MDM_SYSTEM` 에는 BOOLEAN·업무 일시 칼럼이 없어, #15·#16 을 재려면 테스트 전용 엔티티·테이블이 필요하다. 결과에 따라 변환기 등록·규칙 수정이 뒤따를 수 있다(mcm 의 변환기는 `yyyy-MM-dd HH:mm:ss.SSS` 로 써서 규칙 #16 의 초 단위 문안과도 다르다).
- **선택지**: (a) #14 는 설정 + 실측, #15·#16 은 첫 BOOLEAN·업무 일시 엔티티 Task(TSK-04-01)로 이관하고 규칙표 화살표만 갱신 / (b) 셋 다 이 Task 에서 테스트 전용 프로브 엔티티로 실측(SQLite + MSSQL) / (c) 셋 다 이관
- **택한 것**: (a)
- **근거**: spec(1순위)은 contract-only 이고 실측을 요구하지 않는다. #14 는 설정 한 줄과 PRAGMA 확인으로 끝나고 `TB_MDM_SYSTEM` 이 곧 FK 부모가 되므로 지금 켜는 것이 맞다. #15·#16 은 결과가 열려 있다(변환기 등록, 규칙 문안 수정, Instant 형식 결정) — 계약 Task 에 넣으면 범위가 실행 로직 쪽으로 번진다. 규칙표 §6.2 가 "확인한 Task 가 같은 커밋에서 검증 상태를 바꾼다" 고 정하므로 #14 는 확인으로, #15·#16 은 이관 대상 Task 로 칸을 바꾼다(팀장의 선행 문서 수정 금지는 샘플 배정 문구에 대한 지시로 해석 — §2.7).
- **반려되면 재작업 방향**: (b) 면 api test 에 `com.dongkuk.dmes.mdm.probe.DialectProbe`(boolean·LocalDateTime 필드, `CactusAuditEntity` 상속) 엔티티와 테스트 전용 테이블을 두고 SQLite(T11)·MSSQL(T12 를 스프링 컨텍스트로 확장)에서 저장·재조회·원시 값을 단언한 뒤, 결과로 규칙표 #15·#16 을 확인 또는 수정하고 decisions.md 에 기록한다. 팀장이 규칙표 칸 수정 자체를 금지하는 뜻이었다면 §2.7 의 규칙표 변경을 빼고 design.md·decisions.md 기록만 남긴다.

### D5 — MSSQL 적용을 무엇으로 검증하고 기본 게이트와 어떻게 묶는가
- **질문**: 수용 기준은 "두 방언 마이그레이션이 SQLite·MSSQL 에서 적용된다" 다. 리포에 MSSQL 실측·Testcontainers 선례가 없고, docker 없는 환경(CI)의 `testAll` 을 깨뜨리면 안 된다.
- **선택지**: (a) Testcontainers(2.0.5, SQL Server 2022-CU27) 테스트를 별도 source set `mssqlTest` + 별도 태스크 `:api:mssqlMigrationTest` 로 두고 `testAll` 에 연결하지 않음 / (b) 같은 테스트를 기본 `test` 에 넣고 docker 가 없으면 `Assumptions` 로 skip / (c) JDBC URL 을 프로퍼티로 받는 게이트 태스크 + 문서화한 `docker run` 명령 / (d) `azure-sql-edge`(arm64 네이티브) 사용 / (e) 실측하지 않고 문법 검토만
- **택한 것**: (a)
- **근거**: 이 PC 에서 실제로 돌려 통과했다(F14 수동 적용, F16 Testcontainers 시제품). (b) 는 CI 에서 조용히 skip 돼 테스트 총수·통과를 거짓으로 보이게 하고, 팀장 지시(태그·조건부 skip 이 아니라 별도 태스크)와 공통 금지(skip 으로 초록)에 어긋난다. (c) 는 컨테이너 수명 관리를 사람에게 맡긴다. (d) 는 T-SQL 표면이 달라 "MSSQL 적용" 증거가 못 되고 이미 지원 종료다. 대가: 기본 게이트(`testAll`)는 MSSQL 을 보지 않으므로, MSSQL 적용은 Verify 가 돌리는 수동 게이트로만 증명된다.
- **반려되면 재작업 방향**: "CI 에서도 MSSQL 을 봐야 한다" 면 CI 에 docker 를 갖추는 별도 작업을 제안하고 그때 `mssqlMigrationTest` 를 CI 파이프라인에 추가한다(`testAll` 에는 여전히 넣지 않는다). "Testcontainers 의존이 싫다" 면 (c) 로 바꾼다 — 태스크가 `-Pmdm.mssql.url/user/password` 를 받게 하고 없으면 실패하게 한다.

### D6 — 보류 테이블 DDL 을 이 Task 에 넣는가
- **질문**: 주문 제목과 원천에는 결재 상태기계·배포·수신이 보이지만 spec 본문·wbs note 는 결재·배포·수신 계약을 보류한다(PRD §2 규칙 7). 보류 테이블(배포 대상 `*_SYSTEM`·배포 순번 `TB_MDM_DICT_SEQ`·수신 로그 `*_RECV*`)의 DDL 을 이 Task 가 만드는가?
- **선택지**: (a) 넣지 않는다 — `TB_MDM_SYSTEM` 만 / (b) 보류 테이블 DDL 도 이 Task 에서 만든다
- **택한 것**: (a)
- **근거**: TSK-02-01 은 보류 테이블 DDL 을 TSK-02-03 에 배정했고(design §7, ADR-0002 D7·결과 절), wbs 는 TSK-02-03(DDL 초안)과 영역 계약 TSK-04-01·06-01·07-01·08-01(Flyway)에 그 테이블들을 나눠 두었다. spec 의 데이터 모델은 `TB_MDM_SYSTEM` 하나다(1순위). 결재 상태 값(REQUESTED·APPROVED·CANCELLED)은 상수(`VersionStatus`)와 전이 표(`inScope=false`)로만 둔다.
- **반려되면 재작업 방향**: (b) 면 TSK-02-03 의 DDL 초안이 나온 뒤 그 문안을 V3 으로 옮긴다(이 Task 가 먼저 쓰면 TSK-02-03 설계와 어긋날 수 있다). 그때까지 이 Task 는 `TB_MDM_SYSTEM` 만 유지한다.

### D7 — 공통 오류 코드를 어떤 모양으로 두는가
- **질문**: spec 은 "공통 오류 코드·응답 DTO" 를 요구하고 TSK-01-03 수용 기준은 "row_version 409" 다. 그러나 cactus `ErrorCode` 에는 409 가 없고, OASIS 경로는 HTTP 상태 대신 `meta.code` 로 오류를 돌려준다(F6).
- **선택지**: (a) mdm 전용 `MdmErrorCode`(코드 `MDMnnn`, 의미 HTTP 상태, 운반용 cactus `ErrorCode`, 기본 메시지) — 던질 때 cactus `BusinessException` 에 `ErrorDetail.code` 로 싣는다. 응답 DTO 는 새 HTTP 봉투를 만들지 않고 검사 결과 record(`MdmCheckIssue`·`ConfirmCheckResult`)로 둔다 / (b) cactus-core `ErrorCode` 에 `CONFLICT(…, 409, …)` 를 추가 / (c) mdm 전용 예외 클래스와 새 응답 봉투를 만든다
- **택한 것**: (a)
- **근거**: (b) 는 전 모듈이 쓰는 cactus-core 를 바꾸는 모듈 횡단 변경이다. (c) 는 `CactusResponse` 와 경쟁하는 봉투를 만들어 BFF·화면 규약을 둘로 만든다. (a) 는 cactus 규약 안에서 mdm 코드를 정확히 전달하고(`ErrorDetail.code`), 409 는 의미 상태로 기록해 TSK-01-03 이 표현 방식(OASIS `meta.code`/`errors[].code`)을 정하게 한다.
- **반려되면 재작업 방향**: (b) 면 cactus-core `ErrorCode` 에 `CONFLICT("E009", 409, …)` 를 추가하는 별도 변경(모듈 횡단, 사용자 승인)을 제안하고 `MdmErrorCode` 의 409 항목 transport 를 그것으로 바꾼다. (c) 면 `MdmBusinessException` 과 응답 DTO 를 계약에 추가한다.

### D8 — MSSQL 에서 Y/N 플래그 칼럼에도 BIN2 콜레이션을 쓰는가
- **질문**: 규칙표 #19 는 코드·키 칼럼에 BIN2 를 요구한다. `SELF_YN` 은 플래그다. 실측에서 콜레이션을 주지 않으면 DB 기본 CI 콜레이션 때문에 `CHECK (SELF_YN IN ('Y','N'))` 가 소문자 `'y'` 를 통과시켰다(F15). SQLite 는 거부한다.
- **선택지**: (a) `SELF_YN` 도 BIN2 / (b) 규칙 #19 글자대로 `SYSTEM_CODE` 만 BIN2, `SELF_YN` 은 기본 콜레이션
- **택한 것**: (a)
- **근거**: 규칙 #19 의 목적은 "두 방언의 비교 결과를 같게 한다" 다. (b) 는 같은 CHECK·필터 인덱스가 두 방언에서 다르게 판정한다(실측). 칼럼 한 개의 콜레이션이라 되돌리기 쉽다.
- **반려되면 재작업 방향**: (b) 면 mssql V2 의 `SELF_YN` 에서 `COLLATE …` 를 빼고, T12 의 `'y'` 거부 단언을 "MSSQL 은 허용" 으로 바꾸는 대신 애플리케이션이 대문자로만 쓰도록 규칙을 적는다(아직 적용 전이면 V2 파일 수정, 적용 후면 V3 에서 ALTER).

### D9 — 계약 패키지를 어디에 두는가
- **질문**: 리포 규약은 화면별 `com.dongkuk.dmes.mdm.{group}.{screenId}` 와 공용 `…mdm.{entity,repository}` 만 정했다. 공유 계약의 자리는 정해져 있지 않다. "구현 클래스 없음" 을 ArchUnit 으로 고정하려면 범위가 뚜렷해야 한다.
- **선택지**: (a) `com.dongkuk.dmes.mdm.contract.{common,screen,security,version,category}` — 구현은 이 뿌리 밖 / (b) `com.dongkuk.dmes.mdm.common.*`(mcm-core 선례) — 나중에 구현도 같은 곳 / (c) lib main 전체를 계약 전용으로 규칙화
- **택한 것**: (a)
- **근거**: 계약과 구현의 경계가 패키지 이름에 드러나서 ArchUnit 규칙이 앞으로도 참으로 남는다. (c) 는 TSK-01-03 이 lib main 에 구현을 넣는 순간 깨진다. (b) 는 계약과 구현이 섞여 "계약 전용" 을 기계로 확인할 수 없다.
- **반려되면 재작업 방향**: 패키지 이름만 바꾸는 기계적 이동이다(IDE 리팩터 + T1 의 패키지 문자열). (b) 면 T1 규칙을 "지정 클래스 목록" 방식으로 바꾼다.

### D10 — `TB_MDM_SYSTEM` 초기 행의 이름과 감사 값
- **질문**: 원천은 초기 행의 `system_name` 과 MDM 자기 행의 코드를 정하지 않았다(01:195, 02:766-771). 마이그레이션 시드의 감사 칼럼도 채울 주체가 없다.
- **선택지**: (a) 코드 = `ERP, MES, APS, DKMS, L2, MDM`, 이름 = `ERP, MES, APS, DKMS, 레벨2, 마루 MDM`, 감사 = `SYSTEM`/`flyway`/`V2__create_mdm_system`·`VER=0`·시각 NULL / (b) 이름을 코드와 같게(`L2`, `MDM`) / (c) 감사 시각을 고정 리터럴로 채움
- **택한 것**: (a)
- **근거**: 코드는 spec 이 나열한 그대로다. `레벨2` 는 원천 01 흐름 표의 표기("레벨2(미정)"), `마루 MDM` 은 이미 시드된 메뉴 루트 이름과 같다. 감사 시각은 규칙 #16(DB 시각 함수 금지)과 SQLite Instant 형식 미실측(D4) 때문에 NULL 이 가장 안전하다(규칙표 §2 는 NULL 을 허용). 화면이 없어(01:195) 이름은 나중에 UPDATE 마이그레이션으로 쉽게 바꿀 수 있다.
- **반려되면 재작업 방향**: 이름만 바꾸면 V2 가 아직 운영에 적용되지 않았으면 V2 시드를, 적용됐으면 V3 UPDATE 마이그레이션(두 방언)과 T5·T11·T12 기대값을 고친다.

---

## Build 기록 (Phase 03, 2026-09-24)

커밋: A(계약) `d0823ac` · B(샘플 이동) `93b989f` · 이 기록은 별도 docs 커밋이다(B 만 revert 해도 이 기록은 남는다).

### 빨강 확인 (테스트 먼저)

| 대상 | 구현 전 결과 |
|---|---|
| T1~T10(lib) | `:lib:compileTestJava` 실패(계약 클래스 없음, error 210건) |
| T11·T13(api) | V2·yml 없이 `:api:test` 9건 중 6건 실패(T13 패리티 1 + T11 5, 인스펙터 단언은 불변 유지라 초록) |
| T12(MSSQL) | mssql V2 를 잠시 뺀 상태로 `:api:mssqlMigrationTest` 4건 모두 실패 |
| Vitest | `tsup.config.ts` 만 바꾼 상태로 `expected ['dma/mdmSample'] to deeply equal ['mdt/mdmSample']` 실패 |
| E2E | 커밋 A 코드(샘플 이동 전)로 서버를 띄우고 고친 스펙 실행 → `/^용어·도메인$/` 폴더 없음으로 실패 |

### 변이 검증 결과 (§5 불변 규칙)

모든 변이는 스크립트로 넣고 테스트를 돌린 뒤 되돌렸다. "빨강" 은 적힌 테스트가 실패했다는 뜻이다.

| # | 넣은 변이 → 결과 |
|---|---|
| I1 | 상수 추가 → T2 빨강 / 개명 → 컴파일 실패 |
| I2 | `INUSE`→`IN_USE` → T2 빨강 |
| I3 | `REQUEST.inScope=true`·`CONFIRM.to=APPROVED` → T2 빨강 / `DELETE_DRAFT` 삭제 → 컴파일 실패 |
| I4 | `INITIAL_ROW_VERSION=1`·`OPEN_END` 초 1 → T2 빨강 |
| I5 | sqlite L2 행 삭제·MDM=N+ERP=Y·이름 레벨2→L2 → T11 빨강 / `SEEDED` 에서 L2 삭제 → T5·T11 빨강 / mssql L2 삭제·MDM=N+ERP=Y → T12 빨강 |
| I6 | sqlite UX 삭제·CHECK 삭제 → T11 빨강 / mssql UX·CHECK·`SELF_YN` COLLATE·`SYSTEM_CODE` COLLATE 삭제 → T12 빨강 |
| I7 | `C_USR_ID`→`CREATE_USER`·PK 이름 `PK_MDM_SYSTEM`·`C_AT` 타입 변경 → T11·T12 각각 빨강 / mssql `SYSTEM_NAME` VARCHAR → T12 빨강 |
| I8 | mssql V2→V3 파일명 → 패리티 빨강 / sqlite V2 삭제 → 패리티·T11 빨강 / local-db locations 변경 → T12 빨강 |
| I9 | 순서 바꿈·VER 삭제·`NATIVE_COLUMN_LIST` 불일치 → T5 빨강 |
| I10 | `DMF` 추가·`DMA` 코드를 옛 그룹 코드로·폴더 이름 변경·URL 접두 변경 → T4 빨강 |
| I11 | STEWARD×dmd CONFIRM·READ 에 save·`LOCK` 상수 → T4 빨강 |
| I12 | 코드 중복·409→400·MDM007 문구 한 글자 → T5 빨강 |
| I13 | `MASTER_DATA` 에 CODE·`BASE_DEF_EXPR="*"`·수정 가능 Set → T3 빨강 |
| I14 | 실행 클래스 추가·인터페이스 default 메서드·record 에 `jakarta.persistence` 어노테이션 → T1 빨강. **보강**: 상수 클래스의 `static final UnaryOperator` 필드와 record 의 `Supplier` 구성 요소가 처음 규칙으로는 초록이었다(ArchUnit 1.x 는 람다 본문을 합성 메서드가 아니라 감싸는 코드 단위로 본다). T1 에 "함수 객체 필드 금지" 규칙을 더해 빨강으로 만들었다. §2.9 의 "record·enum 에는 접근자만" 도 T1 에 규칙으로 더했다(record 판정 메서드·enum 의 인자 받는 메서드 → 빨강) |
| I15 | 계약 record(새 파일)에 `MasterCode` 칼럼·계약 밖 mdm 클래스의 `RuleMasterRepository`·`cma` 서비스 사용 → T1 빨강 (설계 문안의 "기존 record 에 필드 추가" 는 test 호출부가 먼저 컴파일 실패해 ArchUnit 을 시험하지 못하므로 새 파일로 바꿔 넣었다) |
| I16 | SPI 메서드 인자 추가 → 스텁 컴파일 실패 / 스텁을 main 으로 옮김 → T1 빨강 |
| I17 | 스텁을 `>=` 로 → T10② 빨강 / 최초 면제 삭제 → T10① 빨강 |
| I18 | `application-local.yml` 속성 삭제·값 false → T11-5 빨강 |
| I19 | `application.yml` 에 `statement_inspector` 등록 → T11-6 빨강 |
| I20 | `tasks.named('test') { dependsOn 'mssqlMigrationTest' }` → testAll dry-run 의 mssql 줄 0→4(빨강). 양성 대조: 같은 출력에 `:mdm:api:test`·`:mdm:lib:test` 가 찍힌다. docker 를 끈 상태로 게이트를 부르면 `initializationError`(Could not find a valid Docker environment)로 **실패**한다(skip 아님). `@EnabledIf` 추가는 자동 검출 없음 — **미커버, 리뷰 확인 대상** |
| I21 | tsup entry 만 바꿈 → Vitest 빨강 / 레지스트리 재생성 결과 `mdt/` 키 0 / `migrateMdmSampleGroupToDma` 호출 제거 → 옛 행이 남고(`mdmSample` 부모 `mdt`) E2E 빨강(**수동 검증**, 자동 테스트 없음) / `seedMcmSecMenuFld` 등 기존 시드 메서드 diff 없음(커밋 B diff 로 확인) |
| I22 | `git diff --stat` 로 확인: 선행 문서 샘플 배정 문구·`tasks/TSK-01-01/**` 변경 없음, 규칙표는 §2.7 의 네 칸만 |

**미커버로 남은 것(보고)**:
- 상수 클래스 초기화식에서 람다로 **데이터만 만드는** 경우(`Stream.of(..).map(s -> s).toList()`)는 T1 이 잡지 않는다. 설계가 허용한 "상수 데이터 구성" 범위라 규칙을 넓히지 않았다.
- 인자 없는 enum 메서드와 record 접근자 재정의의 **본문**은 T1 이 보지 않는다(예: `isTerminal()`).
- T1 은 lib 의 test classpath 에서 클래스를 가져오므로 `com.dongkuk.dmes.mdm..` 중 **lib main 만** 본다. api main(현재 `MdmApplication`·`ServletInitializer` 뿐)에 As-Is 마스터 의존을 넣는 변이는 잡지 못한다(I15 의 빨강은 lib main 변이 기준). 업무 코드는 lib 에 두는 구조(F1)라 당장 막지는 않지만, api 에 업무 클래스가 생기면 api test 에도 같은 규칙이 필요하다.
- I20 의 `@EnabledIf`·`Assumptions` 추가는 자동 검출이 없다.
- I21 의 `DataInitializer` 이행은 자동 테스트가 없고 아래 E2E 수동 절차로만 검증했다.

### 설계 이탈

1. **T1 규칙 2개 추가**(위 I14): 함수 객체 필드 금지, record·enum 접근자만. 변이 검증이 찾은 구멍을 덮기 위함이다.
2. **기대값 헬퍼 `MdmSystemSeedExpectations`**(api test): §3.3 끝 "기대값을 테스트마다 따로 적지 않는다" 를 지키려고 T11·T12 가 같은 이름(D10)·칼럼 집합을 한 곳에서 읽는다. 그래서 `mssqlTest` source set 의 classpath 에 `sourceSets.test.output` 을 더했다(§2.6 원문에는 main 만). `mssqlMigrationTest` 의 `testClassesDirs` 는 mssqlTest 뿐이라 test 클래스가 두 번 돌지 않는다. `testLogging` 에 `showStandardStreams = true` 를 더해 `@@VERSION` 줄이 실행 기록에 남게 했다.
3. **`foreign_keys` 는 주 경로로 채택**: yml 키를 대괄호 표기 `"[foreign_keys]": true` 로 적었다(Spring 이 Map 키를 바꾸지 않게). T11-5 가 URL 파라미터 없이 초록이라 §2.5 대체 경로(URL 파라미터)는 쓰지 않았다.
4. **`MdmErrorCode` 접근자 이름**: §7 인계 문안(`code.code()`·`code.transport()`)에 맞춰 `code()`·`httpStatus()`·`transport()`·`defaultMessage()` 로 했다(cactus 식 `getX()` 아님).
5. **`DataInitializer` 호출부 주석도 고침**(B6 범위 밖 1곳): `seedMdmMenus();` 바로 위 주석이 옛 그룹 코드와 `componentPath` 를 적고 있어, 고치지 않으면 §3.6 잔존 grep 기준(이행 메서드 본문과 바로 위 주석에만)을 어긴다. 주석만 `dma` 로 바꿨고 다른 메서드는 건드리지 않았다.
6. **즐겨찾기 UPDATE 는 유지**(§2.4 조건 충족): ① 엔티티 `SecUserFavorite` 가 `@Table(name = "TB_MCM_SEC_USER_FAVORITE", schema = "MCMAPUSER")`, `FULL_ID` 는 `@Column(name = "FULL_ID")`. ② mcm `application-local-db.yml` 이 `ddl-auto: update` 라 MSSQL 개발 DB 에도 테이블이 생기고, `docs/mcm/erd/csa-menu-tables.md:24` 가 이 테이블을 실측 표 항목으로 적고 있다. SQLite 에서는 옛 즐겨찾기 행을 넣고 재기동해 `dma/mdmSample` 로 바뀌는 것을 확인했다(아래 E2E ④). MSSQL 경로는 여전히 아무도 실행하지 않았다(설계가 적은 한계 그대로).
7. **E2E 순서 변경**: 설계는 "새 DB 실행 → sqlite3 로 옛 상태를 손으로 만든 뒤 이행 실행" 이었다. 실제로는 ① 커밋 A 코드로 띄워 고친 스펙이 빨강(이때 옛 코드가 진짜 `mdt` 행을 시드) → ② 커밋 B 코드로 같은 DB 재기동 = **옛 코드가 만든 DB 의 이행**(로그 `leaf 1 · 자식 폴더 0 · 폴더 1 · 즐겨찾기 0행`, 조회 `dma|용어·도메인`·`dma`, `mdt` 행 없음) → 스모크 1 passed → ③ DB 를 옆으로 옮기고(`src/backend/data/keep-migrated/`, 삭제 아님) 새 DB 로 재기동 → 스모크 1 passed → ④ I21 변이: sqlite3 로 옛 상태를 만들고 옛 즐겨찾기 행(`mdt/mdmSample`)을 넣은 뒤 이행 호출을 뺀 코드로 기동 → 옛 행이 남고 스모크 빨강 → 호출을 되돌려 같은 DB 로 재기동 → `dma`·`mdt` 둘 다 있는 분기(폴더 행은 남고 leaf·즐겨찾기만 이행, 로그 `leaf 1 · 자식 폴더 0 · 폴더 0 · 즐겨찾기 1행`)에서 스모크 1 passed → ⑤ 테스트용 즐겨찾기가 스크린샷에 별표로 찍혀, DB 를 다시 옮기고(`keep-both-branch/`) 새 DB 로 한 번 더 돌려 그 스크린샷을 커밋했다. 옛 코드가 만든 DB 로 이행을 본 ② 가 sqlite3 로 손으로 만든 상태보다 강한 증거다.
8. **T11·T12 에 사례 추가**: `SELF_YN='X'` 거부(CHECK), T12 는 오류 번호 547 까지 확인.

### E2E 실행 기록

- 포트: BE 18100, FE 15100(시작 전 두 포트 모두 LISTEN 없음 확인). Gradle `--no-daemon`, `be-run.sh`·`fe-run.sh` 미사용.
- 격리: 워크트리 `src/backend/data/` 를 만든 뒤 기동. be.log 의 SQLite URL 이 `jdbc:sqlite:/Users/jji/project/dmes-standard/dflow-eb6fdb44/src/backend/data/mcm.db`. m-mcm 의 `@dk-oasis/m-mdm`·`shared` 링크가 워크트리 안(`realpath` 확인).
- 자기 백엔드 응답 증거: be.log 에 `http-nio-18100` 스레드의 `userId=admin` JWT·`secUser` 서비스 호출.
- 결과: 빨강 1회(이동 전), 1 passed ×4(이행 DB, 새 DB, 둘 다 있는 DB, 스크린샷용 새 DB), 변이 빨강 1회.
- 정리: 기록한 PID 와 18100·15100 리스너만 종료. 전역 `gradlew --stop`·이름 기반 종료 없음.
- 부산물: next dev 가 바꾼 `m-mcm/next-env.d.ts` 와 Playwright 가 지운 추적 파일 `src/frontend/test-results/round7-verify-…/error-context.md` 는 추적본으로 되돌렸다(커밋하지 않음). 옛 빌드 산출물 `m-mdm/dist/pages/mdt/` 와 빈 폴더 `m-mdm/pages/mdt/` 는 추적되지 않아 그대로 둔다(F19).

### MSSQL 게이트 실행 기록

- OrbStack 착수 상태 `Stopped` → `orb start`(남의 컨테이너 `lect_postgres`·`hani-postgres`·`hani-redis` 가 함께 올라옴) → 게이트·변이 실행 → 자기 컨테이너(mssql·ryuk) 없음 확인, 남의 3개만 남음 → `orb stop` → `Stopped`.
- `mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04` 태그를 새로 받았다(이미지 캐시에 남는다).
- 통과 로그: `@@VERSION = Microsoft SQL Server 2022 (RTM-CU27) (KB5104824) - 16.0.4295.3 (X64) … Developer Edition (64-bit) on Linux (Ubuntu 22.04.5 LTS)`, 4 PASSED.

### 게이트 결과 (Build 시점)

| 게이트 | 결과 |
|---|---|
| backend `testAll --rerun-tasks` | 447 tests / 0 failures (기준선 395 → +52: mdm lib 46, mdm api 6). 37개 태스크 모두 실제 실행 |
| `:api:mssqlMigrationTest` | 4 PASSED (SQL Server 2022 RTM-CU27) |
| testAll 비포함 | dry-run 에 `:mdm:api:test`·`:mdm:lib:test` 가 찍히고 mssql 0줄 |
| m-mdm | Vitest 1 passed, `tsc --noEmit` 통과, `build` 통과(`dist/pages/dma/mdmSample/page.js`) |
| m-mcm eslint | 23 errors / 44 warnings(기준선과 같음) |
| UI audit | mantine·aggrid 모두 0건 |
| page-registry | 재생성 diff 는 mdm 한 줄(`"dma/mdmSample"`), 옛 그룹 키 0 |
| 옛 그룹 잔존 grep(§3.6) | `DataInitializer.java` 의 `migrateMdmSampleGroupToDma` 본문과 바로 위 주석에만 있음 |
| E2E | 위 「E2E 실행 기록」 |
| 커밋 경계 | A·B 가 고친 파일 교집합 없음(B 만 revert 가능). 기존 시드 메서드(`seedMcmSecMenu`·`seedMcmSecMenuFld`·`seedMcmSecRbac`·`swapLegacyGrpMenuIds`·`cleanupLegacyFolderRowsInSecMenu`) diff 없음 |
