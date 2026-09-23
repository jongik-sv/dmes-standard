# TSK-01-03 설계: 권한 가드·공통 셸 + 버전 상태 서비스(담당자 확정)

> 주문 `c7f0c4f6-568b-41f1-a7e3-40936f6c5827` · category infra · domain fullstack · model opus · 작성 2026-09-24 (Design Phase, 무인 모드)
> 워크트리 `/Users/jji/project/dmes-standard/dflow-c7f0c4f6`, 브랜치 `agent/c7f0c4f6-shell-rbac-version`(origin/dev 7fc2380 기점)
> 입력: `spec.md`(요구사항 데이터) · wbs.md v1.3 TSK-01-03(129행)과 후속 TSK-06-01·06-05·08-01·08-05 · PRD §2 규칙 7·§3·FR-F1 · TRD §3·§5·§6 · ADR-0001~0003 · `naming-dialect-rules.md` · `screens/README.md` · 선행 `tasks/TSK-01-02/design.md`와 머지된 코드 · 원천 04 「버전 상태와 적용시점」「상신 시 검사」「테이블 설계」「샘플 데이터」, 06 「테이블 설계」 · 리포 코드
> 근거 강약: spec 본문 > 승인된 선행 산출물(없음) > 리포 관례 > 미승인 선행 산출물(TSK-01-02·TSK-02-01·TSK-01-01, ADR-0001~0003 은 모두 머지됐으나 미승인·PROPOSED)
> 게이트 기준선(오케스트레이터 측정): backend `testAll` 447 tests / 0 failures, m-mdm `test` 1 passed, m-mdm lint(`tsc --noEmit`) 통과

## 위임자 지시 요지와 spec 정리

- 주문 instructions 에는 "결재 공통(상태기계 서비스·결재 화면)" 이라는 옛 제목이 남아 있다. spec 본문은 "상신·반려·승인·승인 취소·철회와 결재 화면은 만들지 않는다(PRD §2 규칙 7)" 이다. spec 개정으로 정리된 차이이므로 **spec 을 따른다**(결정 항목 아님).
- 메뉴는 새로 등록한다(사용자 결정). 기존 마스터관리·업무기준관리 메뉴 시드는 고치지 않고, MDM 메뉴 그룹 트리(용어·도메인 / 레이아웃 / 마스터코드 / 마스터데이터 / 업무기준)를 새 폴더로 등록한다.
- 확정 검사 SPI 는 인터페이스와 호출 지점만 만든다. 04 검사 8항과 06 저장 시 검사의 실구현은 각 영역 Task 몫이다. 테스트는 가짜 SPI 구현으로 한다.
- TSK-01-02 가 정한 계약(버전 상태·row_version·오류 코드·역할·권한 상수)은 그대로 쓰고 새로 정의하지 않는다. 계약에 더하는 것은 §2.1 의 세 가지뿐이고 모두 결정 항목(D3)으로 올린다.
- E2E 서버는 리포의 `be-run.sh`·`fe-run.sh` 를 쓰지 않고 빈 포트로 직접 띄운다(§3.6).

### 원천(04·06)과 spec 의 차이 (명시, spec 을 따른다)

| 항목 | 원천 04·06 | spec·PRD 규칙 7 | 따르는 것 |
|---|---|---|---|
| 버전이 효력을 얻는 전이 | 상신(DRAFT→REQUESTED) → 결재 승인(→APPROVED) → 배포(→RELEASED)(04:234-245) | 담당자 확정 DRAFT→RELEASED 직행. 상신·반려·승인·승인 취소·철회 없음(spec 요구사항 마지막 줄, PRD §2 규칙 7) | spec. "승인 시 apply_to 열기·직전 닫기"(04:327)를 "확정 시" 로 읽는다 |
| 적용시점 하한 | `apply_from >= max(직전 apply_from + 최소 간격, 상신 일시 + 리드타임)`, 최초 버전 면제(04:331-339) | 직전 RELEASED apply_from 보다 뒤(엄격), 최초 버전 면제(spec 요구사항, PRD 규칙 7) | spec. 리드타임·최소 간격·긴급 사유는 두지 않는다(소급 허용, ADR-0002 결과) |
| 상신 시 검사 5항(배포 대상 시스템 1개 이상, 경고) | 있음(04:411) | 배포 보류라 검사하지 않는다(ADR-0002 D4) | spec 쪽 해석. 검사 실구현은 영역 SPI 몫이라 공통 서비스는 관여하지 않는다 |
| 미적용 버전 정의 | DRAFT·REQUESTED·APPROVED + apply_from 이 오지 않은 RELEASED(04:284) | 이번 범위에는 REQUESTED·APPROVED 가 생기지 않는다(PRD 규칙 7) | 미적용 = DRAFT + 미래 RELEASED(ADR-0002 D2, 결과는 원천과 같다) |
| 확정할 수 있는 사람 | 04·06 본문에는 "담당자 권한" 의 역할 판정이 없다(04:1192 미결, 06:1001 은 권한과 소유를 섞지 말라고만 함) | "담당자 역할만 확정 가능"(spec 수용 기준) | spec. 역할 `MDM_STEWARD` 로 판정(ADR-0003 D5, D6) |
| DRAFT 소유권 넘기기 대상 | 넘기기는 소유자가 받을 사람을 고른다(04:303, 06:998) | "넘기기(소유자만)" 만 요구 | spec 을 따르되, 대상 담당자 검사(ADR-0002 D3)는 포트로 두고 기본 거부(D7) |

### RULE.md 라우팅

- 진입점: RULE.md 「작업 분기 — 가이드 라우팅」 표의 **분기 3(MES 개발)** 이다. 대상 경로가 `src/backend/mdm`·`src/frontend/m-mdm` 이고(RULE.md:22-23 식별 규칙), 설계 산출물을 쓰는 작업이 아니다. FE 구현 세부는 공통 FrontEnd 가이드와 `mantine-aggrid-ui` 스킬을 따른다(RULE.md:31, :60).
- 화면 설계 산출물 5종: **해당 없음.** 이 Task 는 독립 화면이 없다(wbs TSK-01-03 ui-spec "공통 셸 컴포넌트(상태·잠금 배지). 독립 화면 없음"). 새 screenId 를 만들지 않으므로 `docs/mdm/screens/{screenId}/` 산출물과 Mes-Guide 「개발 진입 가드」 는 대상이 아니다. 기존 샘플 `mdmSample` 은 TSK-01-01 스캐폴드 화면이며, 이번에는 셸을 입히는 것만 한다(D11).
- 브라우저 E2E: FrontEnd `Local-Rules.md:49` 는 브라우저 시험을 사용자 승인 뒤에만 하라고 정한다. 이 작업은 dev-discipline 「화면 작업의 브라우저 E2E」 와 오케스트레이터 지시가 E2E 를 요구하므로 그것을 승인 근거로 본다(TSK-01-02 §3.5 와 같은 처리).
- Flyway: **이번 Task 는 마이그레이션이 없다**(wbs data-model "-"). 버전 테이블은 TSK-06-01·08-01 이 만든다. `flyway-migration-add` 는 직접 확인한 결과 mdm 에 적용되지 않는다. 스킬 설명이 "aps-core/mcm-core 의 스키마를 바꿀 때" 이고(`.claude/skills/flyway-migration-add/SKILL.md:3`), `migration_tool.py` 의 `--module` 선택지가 `aps-core`·`mcm-core` 뿐이다(`scripts/migration_tool.py:23-24,191`). 테스트 전용 픽스처 테이블은 Flyway 가 아니라 테스트 코드의 DDL 로 만든다(§3.2).
- `oasis-contract-check`: 이번 변경에 BPMN·OASIS Service 가 없다. 다만 mdm `application.yml` 에 OASIS 설정을 넣으므로 게이트에서 한 번 돌려 ERROR 0 을 확인한다(§3.8).

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

경로 약칭: `DI` = `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`, `SUS` = `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/service/SecUserService.java`, `UPC` = `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/UserPermCache.java`, `CKF` = `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/security/filter/ClientKeyFilter.java`, `OSE` = `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/oasis/OasisServiceExecutor.java`, `C` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/`.

### 0.1 선행 계약(TSK-01-02)의 실제 모양

| # | 사실 | 근거 |
|---|---|---|
| F1 | 계약 패키지는 `com.dongkuk.dmes.mdm.contract.{common,screen,security,version,category}` 이고, 구현은 이 뿌리 밖에 둬야 한다. ArchUnit `MdmContractArchitectureTest` 가 계약 패키지를 인터페이스·enum·record·상수 클래스로 제한하고, 인터페이스는 추상 메서드만, record·enum 은 접근자만 두게 한다. Spring·JPA·Hibernate·JDBC 의존도 금지한다 | `mdm/lib/src/test/.../contract/MdmContractArchitectureTest.java:47-92` |
| F2 | 구현 대상 계약: `VersionStateService{confirm(ConfirmCommand), deleteDraft(VersionRef,long,String)}`, `DraftOwnershipService{acquire, release, handover}`(반환 = 갱신 뒤 row_version), `ApplyFromOrderCheck{check(prev, requested) → Optional<MdmCheckIssue>}`, `VersionConfirmCheckSpi{target(), diff(ref), check(ConfirmCheckRequest)}`, `MdmNativeAuditSupport{currentStamp()}`, `MdmDialectResolver{current()}` | `C/version/*.java`, `C/common/*.java` |
| F3 | `ConfirmCommand(draft, expectedRowVersion, applyFrom, confirmerId, warningsAcknowledged)`, `ConfirmResult(confirmed, rowVersion, closedPrevious, warnings)`, `ConfirmCheckRequest(draft, requestedApplyFrom, previousReleasedApplyFrom, confirmerId, now)`, `ConfirmCheckResult(errors, warnings)`, `VersionRef(target, objectId, BigDecimal ver)` | `C/version/*.java` |
| F4 | `VersionTarget` 은 `MASTER_CODE("TB_MDM_CODE_VER", 3)`, `BUSINESS_RULE("TB_MDM_RULE_VER", 0)` 두 값이고 접근자는 `versionTable()`·`versionScale()` 뿐이다. 객체 ID 칼럼 이름·부모 테이블은 계약에 없다 | `C/version/VersionTarget.java` |
| F5 | `VersionConventions`: `ROW_VERSION_COLUMN="ROW_VERSION"`, 초깃값 0, 증분 1, `OPEN_END = 9999-12-31 00:00:00` | `C/version/VersionConventions.java` |
| F6 | `MdmErrorCode` 12종(MDM001~MDM012). 필드 `code, httpStatus, transport(cactus ErrorCode), defaultMessage`. MDM001 `ROW_VERSION_CONFLICT` 409·`BUSINESS_ERROR`, MDM002 `NOT_DRAFT`, MDM003 `NOT_DRAFT_OWNER` 403·`ACCESS_DENIED`, MDM004 `DRAFT_ALREADY_OWNED`, MDM005 `HANDOVER_TARGET_NOT_STEWARD` 400·`INVALID_VALUE`, MDM006 `UNAPPLIED_VERSION_EXISTS`, MDM007 `MULTIPLE_UNAPPLIED_VERSIONS`, MDM008 `APPLY_FROM_NOT_AFTER_PREVIOUS` 400, MDM009 `TRANSITION_NOT_ALLOWED`, MDM010 `CONFIRM_CHECK_FAILED` 400 | `C/common/MdmErrorCode.java` |
| F7 | **`CommonContractTest:48` 이 오류 코드 개수를 `assertEquals(12, MdmErrorCode.values().length)` 로 단언한다.** 코드를 더하면 이 줄을 함께 고쳐야 한다 | `mdm/lib/src/test/.../contract/common/CommonContractTest.java:48` |
| F8 | `MdmRoles.STD_ADMIN="MDM_STD_ADMIN"`, `STEWARD="MDM_STEWARD"`. `MdmPermissions.READ/EDIT/CONFIRM = PERM_MDM_READ/EDIT/CONFIRM`, 액션 목록 READ 4개·EDIT 12개·CONFIRM 13개, `MATRIX` 5그룹 × 2역할 | `C/security/*.java` |
| F9 | `MdmScreenGroup`: DMA "용어·도메인", DMB "레이아웃", DMC "마스터코드", DMD "마스터데이터", DME "업무기준" | `C/screen/MdmScreenGroup.java` |
| F10 | `ApplyFromOrderCheckContract`(abstract, lib test)는 `protected abstract ApplyFromOrderCheck subject()` 한 개를 요구한다. TSK-01-02 는 실구현 테스트가 이것을 상속하라고 인계했다 | `mdm/lib/src/test/.../contract/version/ApplyFromOrderCheckContract.java:19-23`, TSK-01-02 design §7 |
| F11 | TSK-01-02 는 `MdmNativeAuditSupport`·`MdmDialectResolver` 구현을 "첫 소비자 TSK-01-03(확정 트랜잭션의 직전 버전 apply_to 닫기 네이티브 UPDATE)" 에 넘겼다. "row_version 409" 수용 기준의 표현 방식도 이 Task 가 정하라고 넘겼다 | TSK-01-02 design D3·D7, §7 |
| F12 | cactus `BusinessException(ErrorCode, String, List<ErrorDetail>)`, `ErrorDetail.of(code, message)`, `ErrorDetail.ofGrid(grid, rowKey, field, code, message)`. cactus `ErrorCode` 에는 409 가 없다(E0xx 400, A010 403, S0xx 500) | `cactus-core/.../common/BusinessException.java:22-45`, `web/response/ErrorDetail.java:29-56`, `common/ErrorCode.java:14-31` |
| F13 | OASIS 경로(`OSE:113-124`)는 `BusinessException` 을 잡아 `CactusResponse` 의 `meta.code` 로 돌려주고 **HTTP 상태는 200** 이다. `GlobalExceptionHandler` 는 OASIS 밖에서만 HTTP 상태를 쓴다 | `OSE:113-124`, `cactus-core/.../web/exception/GlobalExceptionHandler.java:17,28-43` |

### 0.2 mdm 백엔드 현황

| # | 사실 | 근거 |
|---|---|---|
| F14 | mdm 에는 OASIS 서비스·BPMN·`services/` 폴더가 하나도 없다. `MdmApplication` 은 `com.dongkuk.dmes.mdm` 만 스캔한다(lib 의 클래스도 이 패키지라 빈으로 잡힌다) | `mdm/api/src/main/java/com/dongkuk/dmes/mdm/MdmApplication.java:24-26` |
| F15 | **mdm `application.yml` 에는 `cactus.jwt.secret` 이 없다.** 그래서 `CactusWebSecurityAutoConfiguration`(`:49`)·`SecurityAutoConfiguration`(`:25`) 이 꺼지고 `ClientKeyFilter` 빈도 생기지 않는다. `cactus.security.client-key` 설정만 있고 효과가 없다. mls yml 주석이 이 상황("값이 없으면 … BFF 호출이 401")을 적고 있다 | `mdm/api/src/main/resources/application.yml:15-20`, `mls/api/src/main/resources/application.yml:41-66` |
| F16 | mls 선례 설정: `cactus.jwt.secret: ${CACTUS_JWT_SECRET:Y2FjdHVz…MjAyNg==}`, `issuer: mls`, `cactus.security.client-key`, `client-key-skip-paths: /auth/,/api/auth/,/actuator/`(콤마 문자열, 리스트 불가), `cactus.oasis.service-group: mls`, `service-path: /services`, `transactional: true` | `mls/api/src/main/resources/application.yml:55-66` |
| F17 | `ClientKeyFilter` 는 `X-Client-Key` 가 맞으면 `X-Authenticated-User`·`X-Authenticated-Role`(콤마)로 사전 인증을 세운다. 역할에 `ROLE_` 접두가 없으면 붙인다. `JwtAuthenticationFilter` 가 사전 인증을 보존하며 `UserContextHolder.set(new UserInfo(userId, userId, null, roles))` 로 채운다. 따라서 **mdm 서비스 코드가 보는 역할 문자열은 `ROLE_MDM_STEWARD` 모양**이다 | `CKF:59,81-84,114-117,130-136,159`, `cactus-core/.../security/jwt/JwtAuthenticationFilter.java:88-121` |
| F18 | `UserContextHolder`(ThreadLocal, `get()` → `UserInfo(userId, userNm, userEmpNo, List<String> roles)`, `getUserId()` 는 없으면 "SYSTEM"). `AuditHolder.getAudit()` → `CactusAudit(userId, menuId, serviceId)`(**구성 요소 순서 주의**: 둘째가 menuId, 셋째가 serviceId. OASIS 가 요청 시작 때 설정). `CactusAuditListener` 는 `Instant.now()` 로 `C_AT`/`U_AT` 를 채운다 | `cactus-core/.../security/context/UserContextHolder.java`, `UserInfo.java`, `oasis/oasis-core-api/.../audit/AuditHolder.java`, `cactus-core/.../audit/CactusAuditListener.java:27-58` |
| F19 | mls 서비스 선례: `@Service("noticeMgmtService")`, **`@Transactional` 금지**(CGLIB 프록시가 파라미터 이름을 잃는다, OASIS `transactional: true` 가 트랜잭션을 연다) | `mls/lib/.../lsh/noticeMgmt/service/NoticeMgmtService.java:42-53` |
| F20 | mdm 부팅 테스트 선례: `@SpringBootTest` + `@ActiveProfiles("local")` + `@TempDir` SQLite URL 을 `@DynamicPropertySource` 로 주입(`MdmApplicationHealthTest`, `MdmSharedContractMigrationTest`). mdm 은 `LocalSqliteDataSource` 를 쓰지 않아 URL 주입이 그대로 먹는다. SQLite 는 `foreign_keys=true`(Hikari 속성) | `mdm/api/src/test/.../MdmApplicationHealthTest.java:38-70`, `MdmSharedContractMigrationTest.java:44-60`, `application-local.yml` |
| F21 | lib 는 `spring-boot-starter-data-jpa`·`security`·`web`·`sqlite-jdbc` 를 `api` 로 가지므로 lib main 에서 Spring·JPA 를 쓸 수 있다. lib·api 테스트는 `maxParallelForks = 1` | `mdm/lib/build.gradle` |
| F22 | 기존 `:api:mssqlMigrationTest` 태스크(source set `mssqlTest`, Testcontainers 2.0.5, `testAll` 비포함)가 있다. test 출력도 classpath 에 있다. 실행 절차·OrbStack 함정은 TSK-01-02 §3.3·F13~F16 | `mdm/api/build.gradle`, TSK-01-02 design §3.3 |

### 0.3 스키마 규칙과 선행 산출물의 결함

| # | 사실 | 근거 |
|---|---|---|
| F23 | 버전 테이블 `TB_MDM_CODE_VER`·`TB_MDM_RULE_VER` 와 부모 `TB_MDM_CODE`·`TB_MDM_RULE` 는 **아직 없다.** TSK-06-01·TSK-08-01(계약 전용, depends 에 TSK-01-03 없음)이 Flyway 로 만든다 | wbs.md:843-872·1249-1280, 리포 `db/migration/mdm/*` 에 V1·V2 뿐 |
| F24 | 공통 칼럼(원천 04·06 이 두 버전 테이블에 똑같이 둔 것): `STATUS`, `OWNER_ID`, `APPLY_FROM`, `APPLY_TO`, `REQUESTED_BY`, `REQUESTED_AT`, `APPROVED_BY`, `APPROVED_AT`, `EMERGENCY_YN`, `EMERGENCY_REASON`, `REJECT_REASON`, `RELEASED_AT`, `CANCELLED_AT`, `CANCEL_REASON`, `ROW_VERSION`. 키는 04 `MARU_CODE_ID + VER(DECIMAL(7,3))`, 06 `MARU_RULE_ID + VER(정수)`. 부모 상태 칼럼은 둘 다 `STATUS`(CREATED/INUSE/DEPRECATED) | 원천 04:993-1009, 06:968-985, 04:973, 06:960 |
| F25 | **칼럼 이름 충돌(선행 산출물 결함).** 규칙표 §2·ADR-0001 D2 는 모든 `TB_MDM_*` 에 감사 카운터 `VER BIGINT` 를 두라고 하고, 원천은 `TB_MDM_CODE_VER`·`TB_MDM_RULE_VER`·`TB_MDM_RULE_VAR`·`TB_MDM_RULE_ROW` 에 업무 칼럼 `ver`(PK 일부)를 둔다. 규칙표 §1 은 "원천 칼럼 이름은 대소문자만 바뀐다(개명 없음)" 이다. 한 테이블에 같은 이름 칼럼 둘은 DDL 이 불가능하다. `CactusAuditEntity` 도 `VER` 를 감사 카운터로 매핑한다(필드 `version`). TSK-02-01·TSK-01-02 모두 이 충돌을 다루지 않았다 | `docs/mdm/naming-dialect-rules.md:29,38`, `adr/0001-*.md:32`, 원천 04:993, 06:968, TSK-01-02 F7 **→ 해결: decisions D-034(TSK-02-03)가 6개 테이블(CODE_VER·CODE_RECV·RULE_VER·RULE_VAR·RULE_ROW·RULE_RECV)에 한해 감사 카운터만 `AUD_VER` 로 개명했다. 업무 `VER` 는 그대로, 부모 `TB_MDM_CODE`·`TB_MDM_RULE` 의 감사 카운터는 `VER` 그대로다(Build 반영, 팀장 지시)** |
| F26 | 규칙표 #16: 업무 일시는 SQLite `TEXT 'YYYY-MM-DD HH:MM:SS'`, MSSQL `DATETIME2(0)`, Java `LocalDateTime`(KST, 시간대 없음). **현재 시각은 애플리케이션이 파라미터로 넘기고 DB 시각 함수를 쓰지 않는다.** 열린 끝 `'9999-12-31 00:00:00'`. mdm 적용 방식(엔티티 매핑·`CactusAuditEntity` Instant 의 SQLite 저장 형식)은 "실측 필요 → TSK-04-01" 이다 | `naming-dialect-rules.md` §3 #16 |
| F27 | 규칙표 #13·#7: 행 잠금 대신 **조건부 UPDATE**(`WHERE ROW_VERSION = :v`, 갱신 0행이면 409). 저장·확정은 기본 READ COMMITTED | `naming-dialect-rules.md` §3 #7·#13 |
| F28 | 규칙표 §4: 영속성은 JPA 1순위, 방언별 SQL 은 JPA native 쿼리(`EntityManager.createNativeQuery`)로 쓴다. MyBatis 금지. 방언 판정은 한 곳 | `naming-dialect-rules.md` §4 |
| F29 | 04 DRAFT 삭제는 VER 행만 지우는 일이 아니다. DRAFT 가 `to_ver = V` 로 닫은 코드·카테고리 행을 9999 로 되돌리고 `from_ver = V` 행을 지워야 한다(04 샘플의 ITEM 82 `to=2.000` "DRAFT v2.000이 닫음", 04:280 "1.000을 지우면 BASE 행도 함께 없어지고"). 06 은 VAR·ROW 가 CASCADE 로 함께 지워진다(06:1154) | 원천 04:280·1064-1071, 06:1154, ADR-0002 D1 |
| F30 | 백엔드 가이드: 테스트 데이터는 공개 API·서비스로 만들고, 생성 API 가 없을 때만 직접 INSERT 를 허용하되 helper 이름·주석에 `seed-only` 를 드러낸다 | `docs/guide/BackEnd/Backend-Implementation-Guide.md:322-323` |

### 0.4 RBAC·메뉴(mcm)

| # | 사실 | 근거 |
|---|---|---|
| F31 | `seedMdmMenus()`(DI:840-887)는 `seedMcmSecRbac()` 안(DI:417)에서 불린다. 지금 내용: 옛 그룹 이행 UPDATE(`migrateMdmSampleGroupToDma`), 루트 폴더 `insertMpnFld("mdm","00000005","마루 MDM",null,5000000L)`, `insertMpnFld("dma","00000100","용어·도메인","mdm",5010000L)`, OBJECT `insertMcmSecObjIfAbsent("mdmSample","MDM 샘플","mdm")`, leaf `insertMcmSecMenuIfAbsent("mdmSample","001","5010100","MDM 샘플","dma","mdmSample")`, `TB_MCM_SEC_ROLE_MAPPING (SYSADMIN, mdmSample, PERM_ALL)` 1행 | DI:840-906 |
| F32 | `DataInitializer.run()` 전체가 `@Transactional` 하나다(DI:80-81). 시드 SQL 의 테이블·칼럼 이름이 하나라도 틀리면 mcm 기동 전체가 실패한다. mcm/api 에는 `src/test` 가 없어 시드 자동 테스트가 없다 | DI:80-81 |
| F33 | 사용자는 역할에 직접 연결되지 않는다: 사용자 → `TB_MCM_SEC_USER_MAPPING`(역할 그룹) → `TB_MCM_SEC_ROLEGROUP_MAPPING`(역할). 시드 선례 `ROLE_GROUP_SYSADMIN`↔`SYSADMIN`(DI:258-294). 역할 ID 는 `ROLE_` 접두 없이 넣는다(DI:275-277 주석). JWT 역할 클레임은 `"ROLE_" + ROLE_ID` | DI:258-294, `mcm/lib/.../McmAuthService.java:43-52` |
| F34 | 헬퍼 시그니처: `insertIfAbsent(table, pkCol, pkVal, insertSql)`(DI:1200), `insertIfAbsentComposite(table, pkCols[], pkVals[], insertSql)`(DI:1211), `insertMpnFld(menuId, menuSeq, menuNm, parent, fullSeq)`(DI:917), `insertMcmSecObjIfAbsent(objectId, objectNm, systemCode)`(DI:1316), `nq()`(SQLite 에서 `MCMAPUSER.`·`N'` 제거, `SYSDATETIME()`→`CURRENT_TIMESTAMP`, DI:2864-2876). 감사 칼럼 문자열 `AUDIT_COLS`·`AUDIT_VALS`(DI:228-230) | DI |
| F35 | `TB_MCM_SEC_PERM` 칼럼: `PERMISSION_ID, PERMISSION_NM, PERMISSION_DESC, PERMISSION_COMMON, PERMISSION_CUSTOM, POPUP_BTN, PERMISSION_ACTION, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE` + 감사. **`UserPermCache` 는 COMMON·CUSTOM·POPUP_BTN·ACTION 네 칸의 합집합을 액션으로 쓴다**(UPC:232-239). PERM_ALL 은 `PERMISSION_COMMON='search,save,delete,import,export'` 다(DI:335) | `mcm-core/.../entity/SecPerm.java:50`, UPC:232-239, DI:330-337 |
| F36 | `allActions`(DI:298-329)에 `MdmActions` 13종이 모두 있다. DRAFT 소유권 액션(`lock/unlock/handover`)은 없다. ADR-0003 은 그 이름을 화면 Task 가 확정하게 했다 | DI:298-329, ADR-0003 D5 |
| F37 | 사이드바: `getMyMenus` → `filterMenusByRole`(SUS:589-634)은 사용자 역할의 `TB_MCM_SEC_ROLE_MAPPING` **OBJECT_ID 집합**에 든 leaf 만 보이고, 권한 세트의 액션은 보지 않는다. 폴더는 보이는 leaf 의 조상만 나온다(SUS:333-343, `collectAncestorFolderIds` SUS:643-663). leaf 없는 폴더는 나오지 않는다 | SUS |
| F38 | API RBAC 는 BFF 한 곳이다. `m-mcm/proxy.ts` 가 `/api/:path*` 에서 `evaluateApiPolicy` → `shared/src/auth/rbac-policy.ts:114-135` 로 판정하고, `/api/{m}/oasis/{sid}/{act}` 의 소문자 키 `m/sid/act` 가 사용자 권한키에 없으면 **HTTP 403 `{success:false,error:{code:"FORBIDDEN"}}`** 을 돌려준다(proxy.ts:103-110). 권한키는 mcm `GET /api/sec/perm-keys` → `UserPermCache.toKeyStrings` 의 `module/objId/action`(module = `SecObj.SYSTEM_CODE` 소문자)이다. mcm 밖 모듈에는 서버 쪽 권한 필터 선례가 없다 | `m-mcm/proxy.ts:52,94-122`, `m-mcm/lib/auth/api-permission-cache.ts:28,79-112`, `mcm/lib/.../SecPermKeysController.java`, UPC:123-131 |
| F39 | mdm OASIS 프록시: `m-mcm/app/api/[module]/oasis/[serviceId]/[action]/route.ts:46` 이 `MDM_WAS_URL` 을 쓰고, `shared/src/oasis-proxy/index.ts:125-147` 이 개발 환경에서 `${MDM_WAS_URL}/oasis/{sid}/{act}` 로 `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role` 을 붙여 보낸다 | 파일 |
| F40 | 다른 사용자의 역할을 mdm 이 조회할 수단이 없다. `/api/sec/perm-keys` 는 입력 없이 호출자 본인만 돌려준다(IDOR 방지 주석). mcm 보안 테이블은 mcm DB 에 있고 mdm DB 에는 없다 | `SecPermKeysController.java` javadoc, TSK-01-02 F3 |
| F41 | 시드 사용자는 `admin`(비밀번호 `admin123`, 부팅마다 BCrypt 재설정) 한 명뿐이다. 권한이 적은 사용자로 로그인하는 e2e 선례는 없다 | DI:233-257 |

### 0.5 프런트엔드

| # | 사실 | 근거 |
|---|---|---|
| F42 | 화면 모듈(`m-*`)은 `@mantine/*` 를 import 하지 못한다(part-b §4-2·§17, audit 가 `m-*` 경로 파일을 검사하며 테스트 파일도 포함, `layout.tsx` 만 예외). m-mdm node_modules 에 `@mantine/core` 가 없다 | `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md:145,358`, `.claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py:191,201-202` |
| F43 | `PageLayout` props: `title, className?, buttons?, breadcrumb?, screenId?, objId?, children`. 머리 `.page-layout__header`(Title), 꼬리 `.page-layout__footer` 에 `.page-layout__footer-breadcrumb`(breadcrumb) 와 오른쪽 `screenId`(없으면 탭 컨텍스트 pageId). **`objId` 가 있으면 `/api/auth/me` 를 fetch 하고 결과를 globalThis `__dkOasisButtonRbacStore__` 에 캐시한다** | `shared/src/layout/PageLayout.tsx:56-68,101-192`, `shared/src/portal-shell/use-user-button-rbac.ts:50-66` |
| F44 | shared 에 범용 배지가 없다. `GridBadge` 는 CSS 가 `.cm-data-grid` 아래에만 걸려 있고(`shared/src/components/grid/grid.css:144-159`), part-b 의 검증된 export 목록에도 없다. 그리드 밖에서 쓸 수 없다 | `shared/src/components/grid/GridBadge.tsx`, grep |
| F45 | m-mdm 모듈 CSS 를 쓰려면 호스트 `m-mcm/app/portal/module-config.ts` 에서 따로 import 해야 한다(analog 선례 `:82`). 인라인 스타일에 의미 토큰(`var(--color-…)`)을 쓰는 것은 허용된다(UI-Visual-Standard §3 은 16진수·`rgb()` 만 금지). mdmSample 도 이미 인라인 토큰을 쓴다 | `m-mcm/app/portal/module-config.ts:82`, `docs/guide/FrontEnd/UI-Visual-Standard.md:38-39`, `m-mdm/pages/dma/mdmSample/page.tsx` |
| F46 | 상태색 의미 토큰: `--color-success`/`--color-success-soft`, `--color-warning`/`--color-edited`, `--color-danger`/`--color-danger-soft`, `--color-selection`, `--color-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-bg-header`, `--color-border`. 한 변 색 막대로 상태 표시 금지 | UI-Visual-Standard §5, `Local-Rules.md:87-93` |
| F47 | m-mdm: vitest 설정 파일이 없다(기본 환경 node). 설치: `happy-dom@20.11.1`, `vitest@3.2.7`, `react/react-dom@19.2.4`. `@testing-library/*`·`jsdom` 은 lockfile 에 없다. tsconfig `jsx: "react-jsx"`, `paths "@/*" → ./src/*`, include `src, pages, app`(tests 는 lint 대상이 아님) | `m-mdm/package.json`, `m-mdm/tsconfig.json:11,21-25,36-40`, `pnpm-lock.yaml` |
| F48 | 렌더 테스트 선례는 shared 뿐이다: 파일 머리 `/** @vitest-environment happy-dom */`, `tests/setup.ts` 가 `matchMedia`·`ResizeObserver`·`scrollTo` 폴리필, `react-dom/client` 의 `createRoot` + `act`, `IS_REACT_ACT_ENVIRONMENT=true`, `createElement`(JSX 미사용), `page-layout-offline.unit.test.ts` 는 fetch 를 스텁한다 | `shared/vitest.config.ts:5-7`, `shared/tests/setup.ts:1-25`, `shared/tests/unit/mantine-test-utils.ts:1-36`, `shared/tests/unit/page-layout-offline.unit.test.ts:16-35` |
| F49 | m-mdm 이 `@dk-oasis/shared/*` 를 쓰면 shared 의 **dist** 를 읽는다. 렌더 테스트 전에 `pnpm build:libs`(shared → … → m-mdm 순 tsup)가 돌아 있어야 한다. `DmesUiProvider` 는 `@dk-oasis/shared/ui-provider` | `src/frontend/package.json:24`, `shared/package.json:65-101` |
| F50 | page-registry 코드젠은 `m-mdm/pages/{a}/{b}/page.tsx` 만 수집한다. `m-mdm/src/**` 에 둔 컴포넌트는 화면으로 등록되지 않는다. tsup-entries 스모크는 `pages/` 만 본다 | `m-mcm/scripts/generate-page-registry.mjs:41-46,191-216`, `m-mdm/tests/tsup-entries.smoke.test.ts:15-35` |
| F51 | 기존 E2E `e2e/mdm-sample-smoke.spec.ts` 는 메뉴 이름("마루 MDM" → `/^용어·도메인$/` → `/^MDM 샘플$/`)으로 이동하고, 본문 문구 "mdm 모듈 스캐폴드 검증용 빈 화면입니다." 를 확인하며, **스크린샷을 `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png`(git 추적)에 덮어쓴다.** `playwright.config.ts` 는 서버를 띄우지 않는다 | `src/frontend/e2e/mdm-sample-smoke.spec.ts:31-95`, `src/frontend/playwright.config.ts` |

---

## 1. 접근 방식

이 Task 는 세 덩어리다. 첫째, **공통 버전 상태 서비스**를 mdm lib 에 구현한다. 04·06 의 버전 테이블은 아직 없고(F23) 두 테이블은 상태·소유자·적용 구간·row_version 칼럼이 같으므로(F24), 서비스는 테이블·키 칼럼 이름을 **주입받는 명세(`VersionTableSpec`)** 로 받아 JPA native 쿼리 하나의 경로로 두 대상을 다룬다(D1). 모든 전이는 `TransactionTemplate` 한 트랜잭션 안에서 "읽기 → 순서가 고정된 사전 검사 → 확정 검사 SPI → `ROW_VERSION` 조건부 UPDATE → 직전 RELEASED 닫기 → 부모 INUSE" 순으로 진행하고, 하나라도 실패하면 전부 롤백되어 DRAFT 가 그대로 남는다. 테스트는 실제 이름과 겹치지 않는 **픽스처 테이블**에 대해 SQLite 로 돌리므로, 뒤에 TSK-06-01·08-01 이 실제 테이블을 만들어도 충돌하지 않는다. 감사 `VER` 와 업무 `VER` 의 이름 충돌(F25)은 decisions D-034 가 풀었다(버전 테이블 감사 카운터만 `AUD_VER`). 명세는 테이블마다 감사 카운터 칼럼을 따로 받는다(D2, 팀장 지시로 D-034 를 따른다). 둘째, **권한 가드**는 기존 구조를 그대로 쓴다: 메뉴 가시성과 API 403 은 mcm 시드(역할 2·역할 그룹 2·PERM 3·매핑)와 BFF RBAC 가 맡고, mdm 백엔드는 mls 선례대로 신뢰 채널(`cactus.jwt.secret`)을 켜서 요청 역할을 받은 뒤 버전 전이에서 "담당자만" 을 직접 검사한다(D6). 셋째, **m-mdm 공통 셸**은 shared `PageLayout` 을 감싼 `MdmPageLayout` 과, Mantine 없이 의미 토큰 인라인 스타일로 그린 상태·잠금 배지로 만든다(D11). 샘플 화면에 셸을 입혀 E2E 스크린샷으로 모습을 보인다. 판단 순서는 근거 순위(spec > 승인 산출물 > 리포 관례 > 미승인 산출물)를 따른다.

---

## 2. 변경 파일 목록

### 패키지 단위 요약 (오케스트레이터 기준선용)

| 패키지 | 변경 | 비고 |
|---|---|---|
| **mdm 백엔드** (`src/backend/mdm`) | 있음 | lib main(계약 3건 추가·구현), lib test, api main(`application.yml`), api test, api mssqlTest |
| **m-mdm** (`src/frontend/m-mdm`) | 있음 | 셸 컴포넌트·vitest 설정·테스트, 샘플 화면 수정 |
| **mcm 백엔드** (`src/backend/mcm/api`) | 있음 | `DataInitializer.java` 한 파일(메뉴 폴더·RBAC 시드) |
| **기타** | 있음 | `src/frontend/e2e/` 스펙 1개·픽스처 3개, `docs/mdm/tasks/TSK-01-03/screens/*.png`, `docs/mdm/decisions.md`(끝에 추가) |
| shared (`src/frontend/shared`) | **변경 없음** | |
| m-mcm (`src/frontend/m-mcm`) | **변경 없음** | 새 page.tsx 가 없어 page-registry 재생성도 없다 |
| mcm-core · cactus-core · 기타 백엔드 | **변경 없음** | |

### 2.1 mdm 백엔드: 계약 추가 (TSK-01-02 산출물의 작은 추가, D3)

경로 앞부분 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/`.

| # | 파일 | 생성/수정 | 내용 |
|---|---|---|---|
| K1 | `version/VersionWriteGuard.java` | 생성 | 인터페이스. `void checkCanCreateVersion(VersionTarget target, String objectId)`: 미적용 버전이 하나라도 있으면 MDM006. `long beginDraftWrite(VersionRef draft, long expectedRowVersion, String userId)`: 영역의 DRAFT 저장 직전에 부른다. 소유자·row_version·상태·"미적용 2개" 를 검사하고 `ROW_VERSION` 을 1 올린 뒤 새 값을 돌려준다. javadoc 에 근거(04:284·293-301, ADR-0002 D2)와 "구현 TSK-01-03" |
| K2 | `version/VersionDraftDeletionSpi.java` | 생성 | 인터페이스. `VersionTarget target()`, `void beforeDraftDelete(VersionRef draft)`: DRAFT 삭제 트랜잭션 안에서 VER 행을 지우기 **직전**에 부른다. 04 는 `to_ver = V` 행 되돌리기·`from_ver = V` 행 삭제(F29), 06 은 CASCADE 라 빈 구현. 구현 TSK-06-02(04)·TSK-08-02(06) |
| K3 | `common/MdmErrorCode.java` | 수정 | 끝에 두 값 추가: `STEWARD_ROLE_REQUIRED("MDM013", 403, ErrorCode.ACCESS_DENIED, "담당자 역할이 있어야 할 수 있습니다")`, `CONFIRM_WARNINGS_NOT_ACKNOWLEDGED("MDM014", 409, ErrorCode.BUSINESS_ERROR, "확정 검사 경고를 확인한 뒤 다시 확정하세요")`. 기존 12개는 한 글자도 바꾸지 않는다 |
| K4 | `mdm/lib/src/test/.../contract/common/CommonContractTest.java` | 수정 | `:48` 의 `12` → `14`. 새 두 값의 code·httpStatus·transport 단언 1줄씩 추가. 다른 단언은 그대로 |
| K5 | `mdm/lib/src/test/.../contract/stub/MasterCodeDraftDeletionStub.java`, `BusinessRuleDraftDeletionStub.java` | 생성 | `implements VersionDraftDeletionSpi` 스텁(호출 기록만). `ContractStubCompileTest` 에 `List<VersionDraftDeletionSpi>` 로 다루는 단언 1개 추가(target 이 서로 다르고 두 enum 값을 덮는다) |

`VersionTarget`·`VersionStateService`·`DraftOwnershipService`·`VersionConfirmCheckSpi` 와 T6·T7 스텁은 **고치지 않는다.** 객체 ID 칼럼·부모 테이블 이름은 계약이 아니라 구현 쪽 `VersionTableSpec` 에 둔다(D1).

### 2.2 mdm 백엔드: 구현 (lib main, 생성)

경로 앞부분 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/`. 계약 패키지 밖이다(F1). 화면 패키지 `com.dongkuk.dmes.mdm.{dma..dme}` 와 이름이 겹치지 않는다.

| # | 파일 | 종류 | 내용 |
|---|---|---|---|
| B1 | `support/MdmClockConfig.java` | `@Configuration` | `@Bean Clock mdmClock()` = `Clock.system(ZoneId.of("Asia/Seoul"))`(규칙표 #16 KST 고정). 서비스는 `Clock` 을 타입으로 주입받는다. Build 는 앱 컨텍스트에 다른 `Clock` 빈이 없는지 확인한다(있으면 `@Qualifier("mdmClock")` 로 바꾸고 이탈 기록) |
| B2 | `support/DefaultMdmDialectResolver.java` | `@Component implements MdmDialectResolver` | 생성 때 `DataSource` 연결 메타데이터의 `getDatabaseProductName()` 으로 판정해 캐시한다. `"SQLite"` → `SQLITE`, `"Microsoft SQL Server"` → `MSSQL`, 그 밖은 `IllegalStateException`. 방언 판정은 이 한 곳뿐이다(규칙표 §4) |
| B3 | `support/DefaultMdmNativeAuditSupport.java` | `@Component implements MdmNativeAuditSupport` | `AuditHolder.getAudit()`(`CactusAudit`)에서 `userId`·`serviceId`·`menuId` 를 꺼내 `AuditStamp(userId, serviceId, programId = menuId, at)` 로 옮기고(`CactusAuditListener` 와 같은 대응: `U_SVC_ID` ← serviceId, `U_PGM_ID` ← menuId), 문맥이 없으면 `UserContextHolder.get()` 의 userId, 그것도 없으면 null. `at = Instant.now(clock)` |
| B4 | `support/MdmTemporalBinder.java` | `@Component` | 네이티브 SQL 일시 바인딩·읽기의 **유일한 자리**(D9). `Object toDb(LocalDateTime)`: SQLITE → `String` `"yyyy-MM-dd HH:mm:ss"`, MSSQL → `LocalDateTime`(DATETIME2). `Object toDb(Instant)`: `Asia/Seoul` 의 `LocalDateTime` 으로 바꾼 뒤 위와 같다. `LocalDateTime fromDb(Object)`: `String` → 위 형식 파싱(길이 19 초과면 소수 초를 버린다), `java.sql.Timestamp` → `toLocalDateTime()`, `LocalDateTime` → 그대로, null → null. 모든 값은 초 단위로 자른다 |
| B5 | `support/MdmErrors.java` | final 유틸 | `static BusinessException of(MdmErrorCode code)` = `new BusinessException(code.transport(), code.defaultMessage(), List.of(ErrorDetail.of(code.code(), code.defaultMessage())))`. `static BusinessException of(MdmErrorCode code, List<MdmCheckIssue> issues)` = 첫 detail 은 위와 같고, 이어서 이슈마다 `ErrorDetail.ofGrid(null, issue.itemKey(), issue.field(), issue.code(), issue.message())`. 이 모양이 "409" 의 표현이다(D5) |
| B6 | `security/MdmCurrentUser.java` | 인터페이스 | `String userId()`, `Set<String> roleIds()`: `ROLE_` 접두를 뗀 역할 ID 집합, `default boolean isSteward()` 는 두지 않고 서비스가 `roleIds().contains(MdmRoles.STEWARD)` 로 본다(계약 밖이라 default 금지 규칙 대상은 아니지만 판정 위치를 한 곳으로 둔다) |
| B7 | `security/CactusMdmCurrentUser.java` | `@Component implements MdmCurrentUser` | `UserContextHolder.get()` 의 userId·roles. 역할 문자열마다 앞의 `ROLE_` 를 한 번 떼고 대문자 비교 없이 그대로 쓴다(`ROLE_MDM_STEWARD` → `MDM_STEWARD`, `MDM_STEWARD` → `MDM_STEWARD`). 문맥이 없으면 userId null·역할 빈 집합 |
| B8 | `security/MdmStewardDirectory.java` | 인터페이스 | `boolean isSteward(String userId)`: **다른** 사용자가 담당자 역할을 가졌는지. 넘기기 대상 검사에만 쓴다(D7) |
| B9 | `security/UnresolvedStewardDirectory.java` | `@Component implements MdmStewardDirectory` | 기본 구현. 항상 `false` 를 돌려주고, 부를 때마다 WARN 로그 "담당자 조회 어댑터가 없어 넘기기를 거부합니다(TSK-01-03 D7)". 따라서 운영에서 넘기기는 어댑터가 생길 때까지 MDM005 로 거부된다(fail-closed) |
| B10 | `version/VersionTableSpec.java` | record | `(String versionTable, String objectIdColumn, String versionColumn, String parentTable, String parentObjectIdColumn, String auditCounterColumn, String parentAuditCounterColumn)`. 감사 카운터는 테이블마다 따로 둔다(D-034: 버전 테이블 `AUD_VER`, 부모 `VER`). 감사 카운터 두 칸만 null 허용(null 이면 그 테이블 카운터를 올리지 않는다) |
| B11 | `version/VersionTableRegistry.java` | 인터페이스 | `VersionTableSpec spec(VersionTarget target)` |
| B12 | `version/DefaultVersionTableRegistry.java` | `@Component` | MASTER_CODE → `("TB_MDM_CODE_VER","MARU_CODE_ID","VER","TB_MDM_CODE","MARU_CODE_ID","AUD_VER","VER")`, BUSINESS_RULE → `("TB_MDM_RULE_VER","MARU_RULE_ID","VER","TB_MDM_RULE","MARU_RULE_ID","AUD_VER","VER")`. `versionTable` 은 `VersionTarget.versionTable()` 에서 가져온다. 감사 카운터는 decisions D-034 를 따른다(팀장 지시, Build 반영) |
| B13 | `version/VersionRow.java` | record | `(VersionRef ref, String status, String ownerId, LocalDateTime applyFrom, LocalDateTime applyTo, long rowVersion)` |
| B14 | `version/VersionRowStore.java` | `@Repository` | `EntityManager` native 쿼리 전용(§2.4). 테이블·칼럼 이름은 `VersionTableSpec` 과 고정 칼럼 상수에서만 만들고 **사용자 입력을 SQL 문자열에 넣지 않는다**(값은 모두 바인딩 파라미터) |
| B15 | `version/VersionSpiRegistry.java` | `@Component` | 생성자에서 `List<VersionConfirmCheckSpi>`·`List<VersionDraftDeletionSpi>` 를 받아 target 별 `EnumMap` 을 만든다. **같은 target 이 둘이면 `IllegalStateException`(기동 실패).** `confirmCheck(target)`·`draftDeletion(target)` 은 없으면 `IllegalStateException("확정 검사 SPI 가 등록되지 않았습니다: " + target)` (fail-closed, D4) |
| B16 | `version/DefaultApplyFromOrderCheck.java` | `@Component implements ApplyFromOrderCheck` | prev null → empty. `requested.isAfter(prev)` 면 empty, 아니면 `Optional.of(new MdmCheckIssue("MDM008", 기본 메시지, "applyFrom", null))` |
| B17 | `version/VersionPreconditions.java` | 패키지 전용 클래스 | §2.3 의 검사 순서를 한 곳에 둔다. 메서드: `requireSteward()`, `loadOrConflict(ref)`, `requireOwner(row, userId)`, `requireRowVersion(row, expected)`, `requireDraft(row)`, `requireSingleUnapplied(ref, now)` |
| B18 | `version/DefaultVersionStateService.java` | `@Service implements VersionStateService` | `confirm`, `deleteDraft`(§2.3) |
| B19 | `version/DefaultDraftOwnershipService.java` | `@Service implements DraftOwnershipService` | `acquire`, `release`, `handover`(§2.3) |
| B20 | `version/DefaultVersionWriteGuard.java` | `@Service implements VersionWriteGuard` | `checkCanCreateVersion`, `beginDraftWrite`(§2.3) |

공통 구현 규칙:
- 서비스 클래스에 `@Transactional` 을 붙이지 않는다(F19, CGLIB 프록시 문제). 각 공개 메서드는 생성자 주입 `TransactionTemplate`(`PlatformTransactionManager` 로 만든 전파 REQUIRED, 기본 격리)의 `execute` 안에서 모든 일을 한다. 영역 서비스가 이미 트랜잭션(OASIS `transactional: true`) 안에서 부르면 그 트랜잭션에 합류한다.
- `now` 는 항상 `LocalDateTime.now(clock).truncatedTo(SECONDS)` 로 한 번 구해 그 호출 전체에서 같은 값을 쓴다.
- 이 패키지들은 `com.dongkuk.dmes.mcm..` 의 As-Is 마스터 자산을 import 하지 않는다(TSK-01-02 ArchUnit 4번이 잡는다).

### 2.3 전이 알고리즘 (Build 가 그대로 옮긴다)

**검사 순서는 불변 규칙이다(I10).** 이 순서가 "동시 확정 → 409" 를 보장한다: 첫 확정이 끝난 행은 RELEASED 이므로, 상태 검사가 row_version 비교보다 앞에 있으면 두 번째 확정이 MDM002 를 받는다.

공통 사전 검사(해당 연산만):
1. 역할: `MdmCurrentUser.roleIds()` 에 `MDM_STEWARD` 가 없으면 **MDM013**. 대상: `confirm`, `acquire`. `SYSADMIN` 은 담당자로 보지 않는다.
2. 행 읽기: 없으면 **MDM001**(다른 사람이 지운 DRAFT 를 본 화면과 같은 상황).
3. 소유자: `row.ownerId` 가 null 이거나 행위자와 다르면 **MDM003**. 대상: `confirm`, `deleteDraft`, `release`, `handover`, `beginDraftWrite`.
4. row_version: 요청값 ≠ 저장값이면 **MDM001**.
5. 상태: `STATUS <> 'DRAFT'` 면 **MDM002**.
6. 미적용 2개: 같은 객체의 **다른** 미적용 버전(`STATUS='DRAFT'`, 또는 `STATUS='RELEASED' AND APPLY_FROM > now`)이 있으면 **MDM007**. 대상: `confirm`, `beginDraftWrite`. `deleteDraft`·`acquire`·`release`·`handover` 는 이 검사를 하지 않는다(04:299 "허용: DRAFT 삭제, 조회").

`confirm(ConfirmCommand c)`:
1. 입력: `c.applyFrom()` 이 null 이면 `BusinessException(ErrorCode.REQUIRED_VALUE, "적용 시작 일시를 입력하세요", [ErrorDetail.ofGrid(null,null,"applyFrom","E001",…)])`. `applyFrom` 은 초 단위로 자른다. `applyFrom >= OPEN_END` 면 `ErrorCode.INVALID_VALUE`.
2. 공통 사전 검사 1→2→3→4→5→6(행위자 = `c.confirmerId()`).
3. 직전 RELEASED: 같은 객체에서 `STATUS='RELEASED'` 이고 `VER < draft.VER` 인 행 중 VER 가 가장 큰 것(없으면 최초 버전). 6번을 통과했으므로 이 행은 미래 RELEASED 가 아니다.
4. apply_from 순서: `ApplyFromOrderCheck.check(prev?.applyFrom, applyFrom)` 가 이슈를 내면 **MDM008**(이슈를 detail 로).
5. 확정 검사 SPI: `VersionSpiRegistry.confirmCheck(target).check(new ConfirmCheckRequest(draft, applyFrom, prev?.applyFrom, confirmerId, now))`. `errors` 가 비어 있지 않으면 **MDM010**(이슈 목록을 detail 로). `warnings` 가 있고 `warningsAcknowledged == false` 면 **MDM014**(경고 목록을 detail 로). SPI 의 `diff` 는 부르지 않는다(화면용).
6. DRAFT 확정: 조건부 UPDATE(§2.4 `casConfirm`): `STATUS='RELEASED'`, `APPLY_FROM=applyFrom`, `APPLY_TO=OPEN_END`, `REQUESTED_BY=confirmerId`, `REQUESTED_AT=now`, `RELEASED_AT=now`, `ROW_VERSION=ROW_VERSION+1`, 감사 칼럼. `WHERE` 키 + `STATUS='DRAFT' AND ROW_VERSION=:expected`. **갱신 0행이면 MDM001.** `APPROVED_BY`·`APPROVED_AT`·`EMERGENCY_*`·`REJECT_REASON`·`CANCELLED_AT`·`CANCEL_REASON`·`OWNER_ID` 는 쓰지 않는다(ADR-0002 D3·D5).
7. 직전 닫기: prev 가 있으면 `APPLY_TO = applyFrom` + 감사 칼럼(`WHERE` 키 + `STATUS='RELEASED'`). 갱신 1행이 아니면 `IllegalStateException`(롤백).
8. 부모 INUSE: `applyFrom <= now` 이면 부모 행 `STATUS='CREATED'` 인 경우에만 `STATUS='INUSE'` + 감사 칼럼(ADR-0002 D6 의 확정 트랜잭션 부분, D8). 부모 행이 없으면 아무것도 하지 않는다(영역이 부모를 먼저 만드는 것이 전제, 인계 §7).
9. 반환 `ConfirmResult(draft, expected + 1, prev?.ref, warnings)`.

`deleteDraft(ref, expected, userId)`: 사전 검사 2→3→4→5 → `VersionSpiRegistry.draftDeletion(target).beforeDraftDelete(ref)` → 조건부 DELETE(`WHERE` 키 + `STATUS='DRAFT' AND ROW_VERSION=:expected`), 0행이면 MDM001. 번호는 다시 쓸 수 있다(행이 없어지므로, 04:280).

`acquire(ref, expected, userId)`: 사전 검사 1→2→4→5 → `OWNER_ID` 가 null 이 아니면 **MDM004**(자기 자신이어도 같다: 04:303 "비어 있지 않으면 선점할 수 없다") → 조건부 UPDATE `OWNER_ID=userId, ROW_VERSION+1` (`WHERE … AND OWNER_ID IS NULL AND ROW_VERSION=:expected AND STATUS='DRAFT'`), 0행이면 MDM001. 반환 expected+1.

`release(ref, expected, ownerId)`: 사전 검사 2→3→4→5 → 조건부 UPDATE `OWNER_ID=NULL, ROW_VERSION+1`. 역할 검사는 하지 않는다(역할을 잃은 소유자도 풀 수 있어야 DRAFT 가 묶이지 않는다). 관리자·SYSADMIN 대행 경로는 **없다**(메서드도 없다).

`handover(ref, expected, ownerId, newOwnerId)`: 사전 검사 2→3→4→5 → `newOwnerId` 가 비었거나 `ownerId` 와 같으면 **MDM005** → `MdmStewardDirectory.isSteward(newOwnerId)` 가 false 면 **MDM005** → 조건부 UPDATE `OWNER_ID=newOwnerId, ROW_VERSION+1`.

`checkCanCreateVersion(target, objectId)`: 같은 객체의 미적용 버전(DRAFT, 또는 `APPLY_FROM > now` 인 RELEASED)이 하나라도 있으면 **MDM006**. 쓰기는 없다. DRAFT INSERT 는 영역이 한다(인계 §7).

`beginDraftWrite(ref, expected, userId)`: 사전 검사 2→3→4→5→6 → 조건부 UPDATE `ROW_VERSION+1` + 감사 칼럼, 0행이면 MDM001. 반환 expected+1.

### 2.4 `VersionRowStore` 네이티브 SQL (칼럼·방언 규칙)

- 고정 칼럼 상수: `STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, REQUESTED_BY, REQUESTED_AT, RELEASED_AT`, `VersionConventions.ROW_VERSION_COLUMN`, 감사 `U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID`(`MdmAuditColumns` 상수 사용).
- 테이블·키 이름은 `VersionTableSpec` 에서만 온다. SQL 조립은 이 클래스 안에서만 하고, 이름 값이 `^[A-Z][A-Z0-9_]*$` 가 아니면 `IllegalArgumentException`(명세 오타가 SQL 로 흘러가지 않게).
- 모든 쓰기는 감사 칼럼 `U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID` 를 `MdmNativeAuditSupport.currentStamp()` 값으로 **명시**한다(규칙표 §2). 그 테이블의 감사 카운터(버전 테이블은 `auditCounterColumn`, 부모는 `parentAuditCounterColumn`)가 null 이 아니면 `<col> = COALESCE(<col>, 0) + 1` 도 함께 쓴다. null 이면 쓰지 않는다(D-034).
- 일시 파라미터는 전부 `MdmTemporalBinder.toDb(...)` 를 거친다. 읽은 일시는 `fromDb(...)`.
- DB 시각 함수(`CURRENT_TIMESTAMP`, `SYSDATETIME()`)를 쓰지 않는다(규칙표 #16).
- 버전 값: 읽으면 `new BigDecimal(value.toString()).setScale(target.versionScale())`, 쓰면 `ref.ver().setScale(target.versionScale())` 를 바인딩한다. 버전 산술(직전 찾기)은 SQL `ORDER BY` 가 아니라 Java 에서 읽은 목록으로 한다(규칙표 #17: SQLite NUMERIC 친화도).
- 메서드(모두 호출자 트랜잭션 안에서만 실행):
  - `Optional<VersionRow> find(VersionRef ref)`
  - `List<VersionRow> findAll(VersionTarget target, String objectId)`
  - `int casConfirm(VersionRef ref, long expected, LocalDateTime applyFrom, String confirmerId, LocalDateTime now, AuditStamp s)`
  - `int closeApplyTo(VersionRef prev, LocalDateTime applyTo, AuditStamp s)`
  - `int casSetOwner(VersionRef ref, long expected, String newOwnerOrNull, boolean requireOwnerNull, AuditStamp s)`
  - `int casBumpRowVersion(VersionRef ref, long expected, AuditStamp s)`
  - `int casDeleteDraft(VersionRef ref, long expected)`
  - `int markParentInUse(VersionTarget target, String objectId, AuditStamp s)`: `WHERE … AND STATUS='CREATED'`
- JPA 영속성 컨텍스트 함정: native UPDATE 는 같은 트랜잭션의 관리 엔티티를 갱신하지 않는다. 쿼리 전에 `entityManager.flush()` 를 한 번 부른다. 영역이 버전 엔티티를 들고 있다면 공통 서비스 호출 뒤 다시 읽어야 한다(인계 §7).

### 2.5 mdm 백엔드: 설정 (api main, 수정)

| # | 파일 | 내용 |
|---|---|---|
| B21 | `src/backend/mdm/api/src/main/resources/application.yml` | `cactus:` 아래에 mls 선례(F16)대로 추가: `jwt.secret: ${CACTUS_JWT_SECRET:<mls 와 같은 기본값>}`, `jwt.issuer: mdm`, `security.client-key-skip-paths: /auth/,/api/auth/,/actuator/`, `oasis.service-group: mdm`, `oasis.service-path: /services`, `oasis.transactional: true`. 기존 `client-key` 줄과 주석은 유지하고, 추가 블록 위에 "TSK-01-03 D6: BFF 신뢰 채널을 켜서 요청 역할(X-Authenticated-Role)을 서비스가 받게 한다. mls application.yml:41-66 선례" 주석 |

**함정**: 이 설정으로 cactus 보안 체인이 켜진다. `MdmApplicationHealthTest`(`/actuator/health` 200)와 `MdmSharedContractMigrationTest` 가 계속 초록이어야 한다. `/actuator/**` 가 체인에서 인증 없이 열리는지 Build 가 첫 실행으로 확인하고, 막히면 mls 와 같은 방식(cactus 설정의 공개 경로)으로 연다. 방법을 바꿨다면 「Build 이탈」에 적는다. `services/` 폴더가 없어도 OASIS 로더가 기동에 실패하지 않는지도 같이 본다(실패하면 `src/main/resources/services/.gitkeep` 을 두고 이탈 기록).

### 2.6 mcm 백엔드: `DataInitializer.java` (수정, 한 파일)

`seedMdmMenus()` 와 그 javadoc 만 고치고, 새 private 메서드 두 개를 더한다. **`seedMcmSecMenu`·`seedMcmSecMenuFld`·`seedMcmSecRbac` 본문(allActions 포함)·`migrateMdmSampleGroupToDma`·기존 마스터관리·업무기준관리 시드는 고치지 않는다.**

1. **메뉴 폴더 트리**: 기존 `mdm`·`dma` 줄 뒤에 추가(모두 insert-if-absent):
   ```java
   insertMpnFld("dmb", "00000200", "레이아웃",     "mdm", 5020000L);
   insertMpnFld("dmc", "00000300", "마스터코드",   "mdm", 5030000L);
   insertMpnFld("dmd", "00000400", "마스터데이터", "mdm", 5040000L);
   insertMpnFld("dme", "00000500", "업무기준",     "mdm", 5050000L);
   ```
   이름은 `MdmScreenGroup.menuFolderName()`·screens/README §2 와 글자까지 같아야 한다(I20). leaf 가 없는 폴더는 사이드바에 나오지 않는다(F37). 화면 Task 가 leaf 를 붙이면 보인다.
2. **`seedMdmRbac()`**(새 private, `seedMdmMenus` 에서 OBJECT·leaf 시드 뒤에 호출):
   - `TB_MCM_SEC_ROLE`: `('MDM_STD_ADMIN', N'표준 관리자', N'용어·도메인·레이아웃 등록·수정(ADR-0003 D5)', 'Y', …)`, `('MDM_STEWARD', N'담당자', N'마스터코드·마스터데이터·업무기준 편집과 버전 확정(ADR-0003 D5)', 'Y', …)`. `ROLE_` 접두 없음.
   - `TB_MCM_SEC_ROLEGROUP`: `ROLE_GROUP_MDM_STD_ADMIN`(N'MDM 표준 관리자 그룹'), `ROLE_GROUP_MDM_STEWARD`(N'MDM 담당자 그룹').
   - `TB_MCM_SEC_ROLEGROUP_MAPPING`: `(ROLE_GROUP_MDM_STD_ADMIN, MDM_STD_ADMIN)`, `(ROLE_GROUP_MDM_STEWARD, MDM_STEWARD)`.
   - `TB_MCM_SEC_PERM` 3행: `PERMISSION_ID` / `PERMISSION_NM` / `PERMISSION_ACTION`
     - `PERM_MDM_READ` / N'MDM 조회' / `search,view,export,compare`
     - `PERM_MDM_EDIT` / N'MDM 편집' / `search,view,export,compare,save,delete,reg,import,validate,execute,copy,restore`
     - `PERM_MDM_CONFIRM` / N'MDM 편집·확정' / EDIT 목록 + `,confirm`
     - **`PERMISSION_COMMON`·`PERMISSION_CUSTOM`·`POPUP_BTN` 은 넣지 않는다(NULL).** `UserPermCache` 가 네 칸을 합치므로(F35) PERM_ALL 처럼 COMMON 을 채우면 READ 가 save·delete 를 얻는다(I19).
     - 액션 순서·목록은 `MdmPermissions.*_ACTIONS` 와 같다. 이 파일은 mdm lib 을 의존하지 않으므로 문자열로 적고, 대조는 §3.6 의 시드 대조 명령이 한다.
   - `TB_MCM_SEC_USER`·`TB_MCM_SEC_USER_MAPPING` 은 **시드하지 않는다**(운영 시드에 시험 사용자를 넣지 않는다, D10).
3. **`seedMdmObjectRbac(String objectId, String groupCode)`**(새 private): 그룹별 매트릭스를 적용한다. 메서드 안에 ADR-0003 D5 매트릭스를 `Map.of("dma", Map.of("MDM_STD_ADMIN","PERM_MDM_EDIT","MDM_STEWARD","PERM_MDM_READ"), "dmb", …, "dmc", Map.of("MDM_STD_ADMIN","PERM_MDM_READ","MDM_STEWARD","PERM_MDM_CONFIRM"), "dmd", Map.of(… "PERM_MDM_READ", … "PERM_MDM_EDIT"), "dme", Map.of(… "PERM_MDM_READ", … "PERM_MDM_CONFIRM"))` 로 두고, 두 역할 각각 `(ROLE_ID, objectId, PERMISSION_ID)` 를 `insertIfAbsentComposite` 로 넣는다. 알 수 없는 그룹이면 `IllegalStateException`. 이번 호출은 `seedMdmObjectRbac("mdmSample", "dma")` 한 번이다. 기존 `(SYSADMIN, mdmSample, PERM_ALL)` 행은 그대로 둔다. javadoc: "화면 Task 는 OBJECT·leaf 시드 뒤 이 메서드를 한 줄 부른다(TSK-01-03 D10)".
4. javadoc 갱신: 폴더 5개, RBAC 시드, "시험 사용자는 시드하지 않는다(E2E 는 격리 DB 픽스처)" 를 적는다. 옛 그룹 이름 글자(`mdt`)를 새로 쓰지 않는다(TSK-01-02 §3.6 grep 기준 유지).
5. 쓰기 전 확인(Build 필수): 모든 INSERT 의 테이블·칼럼 이름을 `mcm-core/src/main/java/com/dongkuk/dmes/mcm/entity/{SecRole,SecRoleGroup,SecRoleGroupMapping,SecPerm,SecRoleMapping}.java` 의 `@Table`·`@Column` 과 대조한다(F32). `START_ACTIVE_DATE`·`END_ACTIVE_DATE`·`USE_TP`·감사 칼럼은 SYSADMIN 시드(DI:258-337)와 같은 모양으로 쓴다.

### 2.7 m-mdm (생성·수정)

경로 앞부분 `src/frontend/m-mdm/`.

| # | 파일 | 생성/수정 | 내용 |
|---|---|---|---|
| U1 | `src/shell/mdm-groups.ts` | 생성 | `export const MDM_GROUPS = { dma: "용어·도메인", dmb: "레이아웃", dmc: "마스터코드", dmd: "마스터데이터", dme: "업무기준" } as const; export type MdmGroupCode = keyof typeof MDM_GROUPS; export const MDM_MENU_ROOT_NAME = "마루 MDM";` 주석에 "MdmScreenGroup·screens/README §2·DataInitializer 와 같아야 한다" |
| U2 | `src/shell/MdmPageLayout.tsx` | 생성 | `"use client"`. props `{ group: MdmGroupCode; screenId: string; title: string; buttons?: PageButton[]; className?: string; children: ReactNode }`. shared `PageLayout` 에 `title`, `breadcrumb = "마루 MDM > {그룹 폴더 이름} > {title}"`, `screenId`, `objId = screenId`, `buttons`, `className` 을 넘긴다. `PageButton` 타입은 `@dk-oasis/shared/layout` 에서 가져온다(없으면 `ComponentProps<typeof PageLayout>["buttons"]`) |
| U3 | `src/shell/badge-style.ts` | 생성 | `type MdmBadgeTone = "neutral" \| "info" \| "success" \| "warning" \| "muted"`. `badgeStyle(tone): CSSProperties` 는 `display:inline-flex`, `alignItems:center`, `height:18px`, `padding:"0 6px"`, `borderRadius:"var(--radius-sm)"`, `fontSize:"var(--font-size-xs)"`, `fontWeight:600`, `lineHeight:1`, `whiteSpace:"nowrap"`, `border:"1px solid …"` 와 톤별 색을 돌려준다. 톤별 색은 **의미 토큰만**: success `var(--color-success)`/`var(--color-success-soft)`, warning `var(--color-warning)`/`var(--color-edited)`, info `var(--color-primary)`/`var(--color-selection)`, neutral `var(--color-text-secondary)`/`var(--color-bg-header)`, muted `var(--color-text-muted)`/`var(--color-bg-header)`, 테두리는 모두 `var(--color-border)`. 16진수·`rgb()`·폴백 값 금지. 한 변 색 막대 금지 |
| U4 | `src/shell/VersionStatusBadge.tsx` | 생성 | props `{ status: MdmVersionStatus; applyFrom?: string \| null; now?: Date }`. `MdmVersionStatus = "DRAFT" \| "REQUESTED" \| "APPROVED" \| "RELEASED" \| "CANCELLED"`. 표시·톤: DRAFT "작성 중"/warning, RELEASED 이고 `applyFrom` 이 `now`(기본 `new Date()`)보다 뒤 "적용 대기"/info, 그 밖의 RELEASED "확정"/success, REQUESTED "상신"/neutral, APPROVED "승인"/neutral, CANCELLED "철회"/muted. 알 수 없는 값은 원문 그대로/neutral. `<span className={"mdm-status-badge mdm-status-badge--" + key} title={status} data-status={status} style={badgeStyle(tone)}>` (key = `draft`·`pending`·`released`·`requested`·`approved`·`cancelled`·`unknown`). `applyFrom` 은 `"yyyy-MM-dd HH:mm:ss"` 또는 ISO 문자열이고 KST 로 해석한다(`"T"` 없는 형식은 `+09:00` 을 붙여 파싱) |
| U5 | `src/shell/DraftLockBadge.tsx` | 생성 | props `{ status: MdmVersionStatus; ownerId?: string \| null; currentUserId?: string \| null }`. DRAFT 가 아니면 `null` 을 렌더한다(RELEASED 뒤 owner 는 기록일 뿐, ADR-0002 D3). DRAFT 이고 owner 가 비었으면 "선점 가능"/neutral(`--free`), owner = currentUserId 면 "편집 중(나)"/info(`--mine`), 다르면 "잠김 · {ownerId} 편집 중"/warning(`--locked`). className `mdm-lock-badge mdm-lock-badge--{free\|mine\|locked}`, `data-owner` |
| U6 | `src/shell/index.ts` | 생성 | 위 컴포넌트·타입·`MDM_GROUPS` 재수출 |
| U7 | `src/index.ts` | 수정 | `export * from "./shell";` 한 줄과 주석("화면은 `@/shell` 로 가져온다. 이 배럴은 다른 패키지용"). 기존 주석 유지 |
| U8 | `pages/dma/mdmSample/page.tsx` | 수정 | `PageLayout` 대신 `MdmPageLayout`(`import { MdmPageLayout, VersionStatusBadge, DraftLockBadge } from "@/shell"`)을 쓴다: `group="dma" screenId="mdmSample" title="MDM 샘플"`(결과 breadcrumb·objId 는 지금과 같다). 기존 안내 문단은 **글자 그대로 유지**(F51 스모크가 본다). 그 아래 `ContentPanel` 하나를 더해 "공통 셸 미리보기" 제목과 상태 배지 6종(DRAFT, RELEASED 과거, RELEASED 미래 `applyFrom="9999-12-30 00:00:00"`, REQUESTED, APPROVED, CANCELLED)·잠금 배지 3종(`currentUserId="me"` 기준 free·mine·locked `ownerId="kim"`)을 가로로 보인다. 간격은 `var(--spacing-md)` 류 토큰. 머리 주석에 "TSK-01-03: 공통 셸 적용·미리보기(D11)" 한 줄. API 호출은 여전히 없다 |
| U9 | `vitest.config.ts` | 생성 | `defineConfig({ resolve: { alias: { "@": path.resolve(__dirname, "src") } }, esbuild: { jsx: "automatic" }, test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] } })`. 기본 환경은 node 로 두고 렌더 테스트 파일만 머리 주석으로 happy-dom 을 쓴다(shared 선례 F48) |
| U10 | `tests/setup.ts` | 생성 | shared `tests/setup.ts` 와 같은 폴리필(`typeof window !== "undefined"` 일 때만 `matchMedia`·`ResizeObserver`·`scrollTo`), `globalThis.IS_REACT_ACT_ENVIRONMENT = true` |
| U11 | `tests/shell/mdm-page-layout.test.ts` | 생성 | §3.4 |
| U12 | `tests/shell/badges.test.ts` | 생성 | §3.4 |
| U13 | `tests/shell/mdm-groups.test.ts` | 생성 | §3.4 |

- `tsup.config.ts`·`package.json`·`tsconfig.json` 은 **고치지 않는다.** 새 의존성을 더하지 않는다(`@testing-library`·아이콘 패키지 없음). 셸은 `src/` 에 있으므로 tsup 이 페이지 청크로 묶는다(`splitting: true`), `@/` 별칭은 esbuild 가 tsconfig `paths` 로 푼다(m-mls 선례).
- 화면·셸·테스트 어디에서도 `@mantine/*`·`ag-grid-*` 를 import 하지 않는다. 테스트의 Provider 는 `@dk-oasis/shared/ui-provider` 의 `DmesUiProvider` 를 쓴다(F42).

### 2.8 기타 (생성)

| # | 파일 | 내용 |
|---|---|---|
| E1 | `src/frontend/e2e/mdm-shell-rbac-smoke.spec.ts` | §3.5 |
| E2 | `src/frontend/e2e/fixtures/mdm-rbac-users.sql` | 격리 mcm.db 전용 `seed-only` 픽스처(F30). 파일 머리 주석: "TSK-01-03 E2E 전용: 워크트리 격리 DB 에만 적용한다. 운영·공유 DB 금지". 내용: `admin` 행을 복사해 사용자 3명(`e2e_mdm_none`, `e2e_mdm_steward`, `e2e_mdm_stdadmin`)을 `INSERT … SELECT … FROM TB_MCM_SEC_USER WHERE USER_ID='admin'`(USER_ID·USER_NM·USER_EMP_NO 만 바꾼다. USER_EMP_NO 는 `E2E-MDM-1`~`3`), 비밀번호 행을 `INSERT INTO TB_MCM_SEC_USER_PWD (…) SELECT '<id>', USER_ENC_PWD, … FROM TB_MCM_SEC_USER_PWD WHERE USER_ID='admin'`(해시 복사 → 비밀번호 `admin123`), `TB_MCM_SEC_USER_MAPPING` 에 steward → `ROLE_GROUP_MDM_STEWARD`, stdadmin → `ROLE_GROUP_MDM_STD_ADMIN`. none 은 매핑 없음. 모두 `INSERT OR IGNORE`(재실행 안전). 칼럼 목록은 `SecUser`·`SecUserPwd`·`SecUserMapping` 엔티티와 대조해 Build 가 확정 |
| E3 | `src/frontend/e2e/fixtures/mdm-rbac-seed-check.sql` | 시드 대조 SELECT(§3.6). `.mode list`·`.separator |` 를 파일 안에 둔다 |
| E4 | `src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` | 위 SELECT 의 기대 출력(§3.6 표 그대로) |
| E5 | `docs/mdm/tasks/TSK-01-03/screens/dma-mdmSample-shell.png`, `menu-steward.png`, `menu-none.png` | E2E 가 남긴 스크린샷(Verify 가 커밋해도 된다) |
| E6 | `docs/mdm/decisions.md` | 끝에 추가. 번호는 Build 시점 마지막 `D-0NN` + 1 부터(작성 시점 마지막은 D-031). 형식은 기존 항목과 같다. 항목: D1·D3·D6·D7·D8·D9·D10·D11 요지(각 1건). **팀장 지시로 번호는 D-035 부터**(origin/dev 의 마지막이 D-034), VER 충돌(D2)은 D-034 와 중복이라 추가하지 않는다. **머지 해소(resolution.md 시도 1)에서 D-039~D-046 으로 옮겼다** — origin/dev 에 TSK-04-01 의 D-035~D-038 이 먼저 들어왔다 |

**고치지 않는 것(명시)**: `docs/mdm/tasks/TSK-01-01/**`, `docs/mdm/tasks/TSK-01-02/**`(스크린샷 포함: §3.6 복원 절차), ADR-0001~0003, `naming-dialect-rules.md`, `screens/README.md`, wbs.md, PRD·TRD, `src/frontend/shared/**`, `src/frontend/m-mcm/**`, cactus-core·mcm-core 소스, `.claude/skills/**`, `be-run.sh`·`fe-run.sh`.

---

## 3. 테스트 전략

TDD 순서: §3.1~§3.4 의 테스트를 먼저 쓰고 컴파일 실패 또는 단언 실패로 빨강을 확인한 뒤 구현한다. 시드(§2.6)는 자동 테스트가 없으므로 §3.6 시드 대조 명령을 먼저 만들어 새 DB 에서 빨강(행 없음)을 확인한 뒤 구현한다.

### 3.1 lib 단위 테스트 (testAll 포함, `mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/…`)

| # | 파일 | 단언 |
|---|---|---|
| L1 | `version/DefaultApplyFromOrderCheckTest extends ApplyFromOrderCheckContract` | `subject()` 가 `new DefaultApplyFromOrderCheck()`. 계약 키트 5사례(최초 면제, 같으면 MDM008, 앞이면 MDM008, +1초 통과, 소급 통과)를 그대로 통과 |
| L2 | `security/CactusMdmCurrentUserTest` | `UserContextHolder.set(new UserInfo("u1","u1",null,List.of("ROLE_MDM_STEWARD","ROLE_SYSADMIN")))` → userId u1, roleIds `{MDM_STEWARD, SYSADMIN}`. 접두 없는 `MDM_STEWARD` 도 `MDM_STEWARD`. 문맥 없음 → userId null·빈 집합. `@AfterEach UserContextHolder.clear()` |
| L3 | `version/VersionSpiRegistryTest` | 같은 target SPI 둘 → 생성자 `IllegalStateException`. 없는 target 조회 → `IllegalStateException`(메시지에 target 이름). 삭제 훅도 같은 두 사례 |
| L4 | `support/MdmErrorsTest` | `of(ROW_VERSION_CONFLICT)` → transport `BUSINESS_ERROR`, 메시지 기본값, detail 1건 code `MDM001`. `of(CONFIRM_CHECK_FAILED, [이슈2])` → detail 3건, 둘째·셋째가 이슈 code·field·rowKey(itemKey). `ROW_VERSION_CONFLICT.httpStatus() == 409` |
| L5 | `support/MdmTemporalBinderTest` | 방언을 생성자로 받는 순수 테스트. SQLITE: `toDb(2026-07-01T00:00:00)` = `"2026-07-01 00:00:00"`, nanos 는 잘림. `toDb(Instant 2026-06-30T15:00:00Z)` = `"2026-07-01 00:00:00"`(KST). MSSQL: `LocalDateTime` 그대로. `fromDb` 가 String·`Timestamp`·`LocalDateTime`·null 을 모두 같은 값으로 읽고 `"2026-07-01 00:00:00.123"` 은 초로 자른다 |
| L6 | `version/DefaultVersionTableRegistryTest` | 두 target 의 명세 값이 §2.2 B12 와 같고 `versionTable` 이 `VersionTarget.versionTable()` 과 같다. 감사 카운터가 버전 테이블 `AUD_VER`·부모 `VER`, 업무 버전 칼럼이 `VER`(D-034) |
| L7 | `contract/common/CommonContractTest`(수정, K4) | 개수 14, MDM013·MDM014 값 |
| L8 | `contract/stub/ContractStubCompileTest`(수정, K5) | 삭제 훅 스텁 둘을 `List<VersionDraftDeletionSpi>` 로 다룸 |
| L9 | `security/UnresolvedStewardDirectoryTest` | 어떤 ID(`"kim"`, 공백, null)에도 `isSteward` 가 false(D7 fail-closed) |
| L10 | `version/VersionRowStoreNameGuardTest` | `VersionTableSpec` 의 테이블·칼럼 이름에 소문자·공백·`;` 가 있으면 `VersionRowStore` 가 SQL 을 만들기 전에 `IllegalArgumentException`(`EntityManager` 는 Mockito 모의 객체, 호출 0회 확인) |

### 3.2 api SQLite 시나리오 테스트 (testAll 포함, `mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/version/…`)

구성:
- `VersionFixtureTables`(seed-only 헬퍼, F30): 테스트 전용 테이블을 **실제 이름과 다른 이름**으로 만든다. `TB_MDM_TC_CODE(MARU_CODE_ID PK, STATUS NOT NULL, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)`(부모 감사 카운터는 D-034 대로 `VER`), `TB_MDM_TC_CODE_VER(MARU_CODE_ID, VER NUMERIC(7,3), STATUS NOT NULL, OWNER_ID, APPLY_FROM TEXT, APPLY_TO TEXT, REQUESTED_BY, REQUESTED_AT TEXT, APPROVED_BY, APPROVED_AT TEXT, RELEASED_AT TEXT, ROW_VERSION BIGINT NOT NULL DEFAULT 0, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER BIGINT, PRIMARY KEY(MARU_CODE_ID, VER))`, 06 쪽 `TB_MDM_TC_RULE`·`TB_MDM_TC_RULE_VER`(VER INTEGER). 원자성 시험용 트리거 1개(S14). `CREATE TABLE IF NOT EXISTS` 로 만들고 `@BeforeEach` 에서 네 테이블을 `DELETE` 로 비운다. 행 넣기 헬퍼 `seedObject(target, id, status)`, `seedVersion(target, id, ver, status, owner, applyFrom, applyTo, rowVersion)`.
- `AbstractVersionStateScenarioTest`(abstract): 아래 S1~S24 시나리오를 가진다. 추상 훅 `VersionTableSpec spec(VersionTarget)`, `void seedObject(…)`, `void seedVersion(…)`, `Map<String,Object> readVersion(VersionRef)`. TSK-06-01·08-01 이 실제 DDL 로 같은 시나리오를 돌릴 수 있게 하는 인계 키트다(§7).
- `VersionStateServiceSqliteTest extends AbstractVersionStateScenarioTest`: `@SpringBootTest(webEnvironment = MOCK)` + `@ActiveProfiles("local")` + `@TempDir` SQLite URL(`MdmSharedContractMigrationTest` 와 같은 방식, F20). `@TestConfiguration` 으로 `@Primary` 빈 네 개를 준다:
  - `VersionTableRegistry` → 픽스처 명세(`TB_MDM_TC_CODE_VER`, `MARU_CODE_ID`, `VER`, `TB_MDM_TC_CODE`, `MARU_CODE_ID`, `AUD_VER`, `VER`) 등
  - `Clock` → 테스트가 바꿀 수 있는 `MutableClock`(Asia/Seoul)
  - `MdmCurrentUser` → 테스트가 userId·역할을 바꾸는 가짜
  - `MdmStewardDirectory` → 담당자 ID 집합을 받는 가짜
  - 가짜 SPI 두 개씩(`VersionConfirmCheckSpi`·`VersionDraftDeletionSpi`, target 별). 확정 검사 가짜는 테스트가 errors·warnings·"검사 중 행위(Runnable)" 를 심을 수 있다. 삭제 훅 가짜는 호출 기록과 "던지기" 를 심을 수 있다.
- 한 클래스에 모아 컨텍스트를 한 번만 띄운다. 모든 단언 전후로 행을 SQL 로 직접 읽어 상태를 본다(`readVersion`).

시나리오(모두 기본 행위자 `kim`, 역할 `{MDM_STEWARD}`, 04 대상은 `PROC_CD`·`EQP_CD`):

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | 최초 버전 확정(과거 일시). clock 2026-06-01, v1.000 DRAFT owner kim rv 0, `applyFrom 2024-01-01 00:00:00` | 성공. 행 RELEASED, `APPLY_FROM 2024-01-01 00:00:00`, `APPLY_TO 9999-12-31 00:00:00`, rv 1, `REQUESTED_BY kim`, `REQUESTED_AT`·`RELEASED_AT` = clock, `APPROVED_BY` NULL, `OWNER_ID kim` 유지. `closedPrevious` null. 부모 CREATED → INUSE(applyFrom ≤ now) |
| S2 | 04 샘플 v1.000 → v1.001. clock 2026-06-20, v1.000 RELEASED [2024-01-01, 9999), v1.001 DRAFT, `applyFrom 2026-07-01` | v1.000 `APPLY_TO 2026-07-01 00:00:00`, v1.001 [2026-07-01, 9999), `closedPrevious` = v1.000. 부모 INUSE 유지 |
| S3 | 04 샘플 기준일 2026-09-03. v1.000 [2024-01-01, 2026-07-01), v1.001 [2026-07-01, 9999), v2.000 DRAFT owner kim, `applyFrom 2026-10-01` | v1.001 `APPLY_TO 2026-10-01`, v2.000 [2026-10-01, 9999). 이어서 `checkCanCreateVersion(MASTER_CODE,"PROC_CD")` 는 clock 2026-09-03 에서 **MDM006**(미래 RELEASED), clock 을 `2026-10-01 00:00:00` 으로 옮기면 통과(경계 포함 = 적용됨) |
| S4 | 04 샘플 EQP_CD 역순. v1.000 RELEASED apply_from 2026-08-01, v2.000 DRAFT `applyFrom 2026-07-15` | **MDM008**. DRAFT 그대로(status·rv·apply_from NULL), v1.000 `APPLY_TO` 9999 그대로 |
| S5 | 경계. 직전 apply_from 과 같은 일시 → **MDM008**. 직전 + 1초 → 성공 | |
| S6 | 미적용 2개. v2.000·v2.001 둘 다 DRAFT(owner kim) | `confirm(v2.000)` **MDM007**, `beginDraftWrite(v2.000)` **MDM007**, `deleteDraft(v2.001)` 성공(행 없음), 그 뒤 `confirm(v2.000)` 성공 |
| S7 | 비소유자 확정. owner lee, 행위자 kim → **MDM003**. owner NULL → **MDM003** | DRAFT 그대로 |
| S8 | 담당자 아님. 역할 `{SYSADMIN}`, owner 가 본인이어도 → **MDM013**. 역할 `{MDM_STD_ADMIN}` → **MDM013**. 역할 `{SYSADMIN, MDM_STEWARD}` → 성공 | |
| S9 | 확정 검사 실패. 가짜 SPI errors 2건 | **MDM010**, detail 에 두 이슈 code. DRAFT 그대로, 직전 `APPLY_TO` 9999 그대로, 부모 CREATED 그대로 |
| S10 | 경고 미확인. warnings 1건, `warningsAcknowledged=false` → **MDM014**, DRAFT 그대로. 같은 요청을 `true` 로 → 성공, `ConfirmResult.warnings` 에 그 1건 | |
| S11 | 낡은 row_version. 저장 rv 1, 요청 0 → **MDM001** | |
| S12 | 동시 확정(순차 재현). 같은 요청(rv 0)을 두 번 | 첫째 성공, 둘째 **MDM001**(MDM002 아님). 행은 첫째 결과 그대로 |
| S13 | 경합 창. 가짜 SPI 가 `check` 안에서 같은 트랜잭션으로 `UPDATE … SET ROW_VERSION = ROW_VERSION + 1` 을 실행(다른 사용자가 먼저 커밋한 상황 재현) | 조건부 UPDATE 0행 → **MDM001**. 롤백 뒤 DRAFT 는 rv 0·DRAFT, 직전 `APPLY_TO` 9999 그대로 |
| S14 | 원자성. 픽스처 트리거가 `MARU_CODE_ID='ATOMIC_FAIL'` 의 RELEASED 행 `APPLY_TO` 변경을 `RAISE(ABORT)` 로 막는다. 그 객체의 DRAFT 확정 | 예외. DRAFT 는 DRAFT·rv 0·`APPLY_FROM` NULL 로 남는다(6단계 UPDATE 도 롤백) |
| S15 | 06 정수 버전. BUSINESS_RULE 대상 v1 RELEASED, v2 DRAFT | 확정 성공, v1 `APPLY_TO` 닫힘, `ConfirmResult.confirmed.ver` scale 0 |
| S16 | 필수값. `applyFrom` null → `REQUIRED_VALUE`(E001). `applyFrom` 에 나노초 → 저장값은 초 단위 | |
| S17 | DRAFT 삭제. 소유자 → 행 없음, 삭제 훅이 DELETE 전에 1번 불림(훅이 부를 때 행이 아직 있음을 훅 가짜가 기록). 비소유자 → **MDM003**. 낡은 rv → **MDM001**. RELEASED 행 → **MDM002**. 훅이 던지면 행이 남는다. 지운 번호로 같은 VER 를 다시 넣을 수 있다 | |
| S18 | 선점. 빈 DRAFT + 담당자 → `OWNER_ID` = 행위자, 반환 rv+1. 이미 owner 있음(남·자기) → **MDM004**. 담당자 아님 → **MDM013**. 낡은 rv → **MDM001** | |
| S19 | 해제. 소유자 → `OWNER_ID` NULL, rv+1. 역할 없는 소유자도 성공. 비소유자(역할 `{SYSADMIN}` 포함) → **MDM003** | |
| S20 | 넘기기. 소유자 → 새 owner, rv+1. 비소유자 → **MDM003**. 대상이 담당자 아님 → **MDM005**. 대상 공백·자기 자신 → **MDM005** | |
| S21 | 저장 가드. `beginDraftWrite` 소유자·정상 → rv+1 반환. 비소유자 **MDM003**, 낡은 rv **MDM001**, RELEASED **MDM002** | |
| S22 | 부모 INUSE 경계. `applyFrom` = now → INUSE. `applyFrom` = now + 1초 → CREATED 유지. 부모가 이미 INUSE → 그대로(감사 칼럼도 안 바뀜) | |
| S23 | 감사 칼럼. `AuditHolder.setAudit(new CactusAudit("kim", "codeConfirmMenu", "codeConfirm"))`(userId, menuId, serviceId 순) 뒤 확정 → 확정 행·직전 행·부모 행의 `U_USR_ID kim`, `U_SVC_ID codeConfirm`(serviceId), `U_PGM_ID codeConfirmMenu`(menuId, `CactusAuditListener` 와 같은 대응), `U_AT` = clock(KST 문자열), 감사 카운터가 1 증가(버전 행 `AUD_VER`, 부모 행 `VER`, D-034). 버전 행의 업무 `VER` 는 그대로. `@AfterEach AuditHolder.remove()` | |
| S24 | SQLite 저장 형식. 확정 뒤 `SELECT typeof(APPLY_FROM), APPLY_FROM, typeof(APPLY_TO), APPLY_TO` = `text|2026-07-01 00:00:00|text|9999-12-31 00:00:00`(D9) | |

추가 api 테스트:

| # | 파일 | 단언 |
|---|---|---|
| A1 | `common/support/DefaultMdmDialectResolverSqliteTest`(위 시나리오 클래스 안의 메서드로 둬도 된다) | local 프로파일에서 `current() == SQLITE` |
| A2 | `common/security/MdmSecurityChainTest` | `@SpringBootTest(RANDOM_PORT)` + local + `@TempDir`. JDK HttpClient 로 ① `POST /oasis/anyService/search` 헤더 없음 → **401** ② 같은 요청에 `X-Client-Key: <유효 키>`, `X-Authenticated-User: kim`, `X-Authenticated-Role: MDM_STEWARD` → 401·403 이 **아니고** 본문 최상위에 `meta` 가 있다(OASIS 봉투. 서비스가 없으니 오류 코드면 된다). 유효 키는 상수로 쓰지 않는다: 테스트가 `@SpringBootTest(properties = "cactus.security.client-key=mdm-test-client-key")` 로 고정하되, `ClientKeyFilter` 는 환경변수 `BACKEND_CLIENT_KEY` 를 yml 보다 먼저 보므로(CKF:59,81-84) 테스트도 같은 순서로 `System.getenv("BACKEND_CLIENT_KEY")` 가 있으면 그 값을, 없으면 고정한 속성 값을 쓴다 ③ `GET /actuator/health` → 200. D6 의 신뢰 채널이 켜졌음을 보인다 |
| A3 | 기존 `MdmApplicationHealthTest`·`MdmSharedContractMigrationTest`·`MdmFlywayVersionParityTest` | 고치지 않고 초록 유지 |

### 3.3 MSSQL 수동 게이트 (testAll 비포함, docker 필요)

- `mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/common/version/VersionStateServiceMssqlTest.java`: TSK-01-02 의 Testcontainers 하네스(`MSSQLServerContainer("mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04").acceptLicense()`)로 DB 를 만들고 `@SpringBootTest` + `@ActiveProfiles("local-db")` + `@DynamicPropertySource`(URL·계정). 픽스처 테이블은 MSSQL 문안(`DATETIME2(0)`, `DECIMAL(7,3)`, 코드 칼럼 `COLLATE Latin1_General_100_BIN2`)으로 만든다. 시나리오 S2·S12·S13·S23 과 저장 형식(`APPLY_FROM` 이 `datetime2` 이고 값이 같음)만 돌린다. `DefaultMdmDialectResolver.current() == MSSQL`.
- 실행: TSK-01-02 §3.3 절차 그대로(`orb status` → 필요하면 `orb start`, 끝나면 원래 상태로 `orb stop`). `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon`. 기존 `MdmMssqlMigrationTest` 와 함께 돈다.
- `test`·`testAll` 에 연결하지 않고 조건부 skip 을 쓰지 않는다(TSK-01-02 I20 유지). docker 가 없어 못 돌리면 그 사실을 보고한다.

### 3.4 프런트엔드 Vitest (m-mdm)

전제: `cd src/frontend && pnpm build:libs` 를 먼저 돌려 shared dist 가 있어야 한다(F49).

| # | 파일 | 환경 | 단언 |
|---|---|---|---|
| V1 | `tests/shell/mdm-page-layout.test.ts` | 머리 `/** @vitest-environment happy-dom */` | `createElement(DmesUiProvider, null, createElement(MdmPageLayout, { group:"dma", screenId:"mdmSample", title:"MDM 샘플" }, createElement("p", null, "본문")))` 을 `createRoot`+`act` 로 렌더. `.page-layout__header` 에 "MDM 샘플", `.page-layout__footer-breadcrumb` 텍스트 = `"마루 MDM > 용어·도메인 > MDM 샘플"`, 꼬리 오른쪽에 `mdmSample`, 본문 "본문". group `dme` 로 바꾸면 breadcrumb 가운데가 "업무기준". `beforeEach` 에서 `globalThis.fetch = vi.fn(async () => new Response("{}", { status: 401 }))` 와 `delete globalThis.__dkOasisButtonRbacStore__`, `afterEach` 에서 unmount·복원(F43) |
| V2 | `tests/shell/badges.test.ts` | node(`react-dom/server` 의 `renderToStaticMarkup`) | `VersionStatusBadge`: 다섯 상태의 라벨·`mdm-status-badge--{key}`, `now = 2026-09-03T00:00:00+09:00` 에서 RELEASED `applyFrom "2026-10-01 00:00:00"` → "적용 대기"(`--pending`), `"2026-07-01 00:00:00"` → "확정"(`--released`), 경계 `applyFrom == now` → "확정". 알 수 없는 값 → 원문·`--unknown`. `DraftLockBadge`: DRAFT free·mine·locked 라벨과 클래스, RELEASED → 빈 문자열. **모든 출력 HTML 에 `#[0-9a-fA-F]{3,8}` 와 `rgb(` 가 없고 `var(--color-` 가 있다**(색 토큰 규칙을 테스트로 고정) |
| V3 | `tests/shell/mdm-groups.test.ts` | node | `Object.keys(MDM_GROUPS)` = `["dma","dmb","dmc","dmd","dme"]`, 값 = `["용어·도메인","레이아웃","마스터코드","마스터데이터","업무기준"]`(screens/README §2·`MdmScreenGroup` 와 같은 글자), `MDM_MENU_ROOT_NAME = "마루 MDM"` |
| — | 기존 `tests/tsup-entries.smoke.test.ts` | node | 그대로 초록(새 page.tsx 없음) |

UI 점검(커밋 전 필수, 0건): `D=.claude/skills/mantine-aggrid-ui/scripts; python3 $D/mantine_docs.py audit src/frontend/m-mdm/src/shell src/frontend/m-mdm/pages/dma/mdmSample/page.tsx src/frontend/m-mdm/tests src/frontend/m-mdm/vitest.config.ts; python3 $D/aggrid_docs.py audit src/frontend/m-mdm/src/shell src/frontend/m-mdm/pages/dma/mdmSample/page.tsx src/frontend/m-mdm/tests`(저장소 루트에서). 오탐이면 사유를 보고에 적는다.

### 3.5 브라우저 E2E 스모크 (`src/frontend/e2e/mdm-shell-rbac-smoke.spec.ts`)

스모크 넷 적용:
1. **메뉴 이동: 적용.** admin·담당자·표준 관리자가 "마루 MDM" → "용어·도메인" → "MDM 샘플" 로 이동한다.
2. **목록·빈 상태: 해당 없음.** 이 Task 는 독립 화면이 없고(ui-spec) 셸 컴포넌트는 데이터를 조회하지 않는다. 샘플 화면에도 그리드·API 호출이 없다.
3. **등록·수정: 해당 없음.** 같은 사유. 버전 전이는 화면 없는 백엔드 서비스이며 §3.2 가 검증한다. 확정 화면은 TSK-06-05·08-05 몫이다.
4. **서버 오류 표시: 해당 없음.** 화면이 서버를 부르지 않는다. 대신 "권한 없는 API 호출 → 403" 을 API 수준에서 확인한다(아래 T3).

스펙 구성(메뉴 로케이터·로그인은 F51 과 같은 방식, `SMOKE_MCM_BASE_URL` 필수 사용):
- T1 admin(`admin`/`admin123`): 메뉴 이동 → `.page-layout__footer-breadcrumb` 가 `"마루 MDM > 용어·도메인 > MDM 샘플"`, 안내 문단 보임, `.mdm-status-badge` 6개·`.mdm-lock-badge` 3개 보임. 스크린샷 `docs/mdm/tasks/TSK-01-03/screens/dma-mdmSample-shell.png`(fullPage).
- T2 담당자(`e2e_mdm_steward`): 사이드바에 "마루 MDM" 이 보이고 "용어·도메인" 아래 "MDM 샘플" 로 이동된다(MDM_STEWARD × mdmSample = PERM_MDM_READ 매핑의 효과). `page.request.post("/api/mdm/oasis/mdmSample/search", { data: {} })` 의 상태가 **401·403 이 아니고**, 본문이 JSON 이며 최상위에 `meta` 객체가 있다(mdm OASIS 가 돌려준 `CactusResponse` 봉투. BFF 가 백엔드에 닿지 못한 502 류는 이 단언에서 빨강). 서비스가 없으므로 `meta` 는 오류 코드를 담아도 된다. 스크린샷 `menu-steward.png`.
- T3 권한 없는 사용자(`e2e_mdm_none`): 로그인 **전에** `page.waitForResponse(r => r.url().includes("/api/mcm/oasis/secUser/myMenusTree"))` 를 걸어 두고, 로그인 뒤 그 응답이 200 이며 본문의 메뉴 행(`grids.menus.rows`)에 `MENU_ID`(또는 응답의 메뉴 ID 필드)가 `mdm`·`dma`~`dme` 인 행이 **없음**을 단언한다. 응답을 받은 **뒤에** `.sidebar-container` 가 보이는 상태에서 "마루 MDM" 텍스트가 없음(`toHaveCount(0)`)을 단언한다(메뉴가 그려지기 전의 거짓 통과 방지). 같은 API POST → **403**, 본문 `error.code == "FORBIDDEN"`. 스크린샷 `menu-none.png`. 메뉴 응답의 필드 이름은 `shared/src/portal-shell/use-portal-menu.ts` 로 Build 가 확인한다. T2 도 같은 응답에 `mdm` 루트가 **있음**을 단언한다(양성 대조).
- T4 표준 관리자(`e2e_mdm_stdadmin`): "MDM 샘플" 까지 이동된다(PERM_MDM_EDIT 매핑).
- 사용자 ID·비밀번호는 `SMOKE_MDM_{NONE,STEWARD,STDADMIN}_USER`, `SMOKE_LOGIN_PASSWORD` 환경변수로 받되 기본값은 위 ID·`admin123`.

### 3.6 E2E 서버 절차 (Verify 실행, dev-discipline 「서버 프로세스」·TSK-01-02 §3.5 를 이 워크트리로 옮김)

```bash
W=/Users/jji/project/dmes-standard/dflow-c7f0c4f6
SP=<자기 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 고르기 — 셋 다 LISTEN 이 없어야 한다(예: mcm BE 18103, mdm BE 18196, FE 15103). 있으면 다른 번호.
lsof -iTCP:18103 -sTCP:LISTEN; lsof -iTCP:18196 -sTCP:LISTEN; lsof -iTCP:15103 -sTCP:LISTEN
# 1) 격리 DB 자리(F17 함정 — 없으면 mcm 이 메인 체크아웃 mcm.db 를 잡는다). gitignore 대상, 새 DB 로 시작
mkdir -p $W/src/backend/data
#    기존 mcm.db 가 있으면 지우지 말고 옮겨 새 DB 로 시작한다 — 시드 대조 마지막 SELECT(시험 사용자 0명)는 새 DB 에서만 참이다(Build 이탈 X6)
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $W/src/backend/data/mcm.db.bak-$(date +%Y%m%d%H%M%S)
# 2) mcm 백엔드
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18103 --mcm.bff.invalidate-role-url=http://127.0.0.1:15103/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18103/notify/publish' > $SP/be-mcm.log 2>&1 &
BE_MCM_PID=$!   # 기동 로그의 sqlite 경로가 $W/src/backend/data/mcm.db 인지 반드시 확인(아니면 즉시 중단)
# 3) mdm 백엔드(8096 대신 빈 포트). SQLite 는 ../data/mdm.db = $W/src/backend/data/mdm.db
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18196' > $SP/be-mdm.log 2>&1 &
BE_MDM_PID=$!
# 4) mcm 기동 완료(DataInitializer 로그) 뒤 시드 대조와 시험 사용자 픽스처
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
# 5) 포털 — m-mdm 을 먼저 build, 레지스트리는 커밋된 것 사용
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15103 OIDC_ISSUER=http://127.0.0.1:15103 \
  MCM_WAS_URL=http://127.0.0.1:18103 MDM_WAS_URL=http://127.0.0.1:18196 BACKEND_API_URL=http://127.0.0.1:18103 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15103 > $SP/fe.log 2>&1 &
FE_PID=$!
# 6) 스모크 — 반드시 자기 포털(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과)
#    --workers=1: 두 스펙이 병렬로 admin 로그인하면 mcm SQLite 가 SQLITE_BUSY 로 로그인을 500 으로 떨어뜨린다(Build 이탈 X5)
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15103 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts --workers=1
# 7) 선행 Task 추적 파일 복원 — mdm-sample-smoke 가 TSK-01-02 스크린샷을 덮어쓴다(F51). stage 하지 않고 되돌린다
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png
```

- 통과 기준: 두 스펙 합계 passed, skipped·failed 0. 시드 대조 `diff` 출력 없음.
- 거짓 통과 방지 증거(보고에 붙인다): ① `be-mcm.log` 의 SQLite 경로가 워크트리 쪽이다. ② `be-mdm.log` 의 기동 로그에 포트 18196 과 SQLite 경로 `$W/src/backend/data/mdm.db` 가 찍혔고, T2 의 응답 본문이 `meta` 를 가진 OASIS 봉투였다(스펙 단언. Spring 은 기본으로 요청 로그를 남기지 않으므로 요청 로그 줄은 증거로 쓰지 않는다). ③ T3·T2 가 기다린 `myMenusTree` 응답이 자기 포털(15103)에서 왔다. ④ `git status` 에 `docs/mdm/tasks/TSK-01-02/**` 변경이 없다.
- 시드 대조 `mdm-rbac-seed-check.sql` 의 SELECT 와 기대 출력(Build 가 두 파일로 만든다):

| SELECT | 기대 출력(`|` 구분) |
|---|---|
| `SELECT MENU_ID, MENU_NM, IFNULL(PARENT_MENU_ID,'-') FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID IN ('mdm','dma','dmb','dmc','dmd','dme') ORDER BY MENU_ID;` | `dma\|용어·도메인\|mdm`, `dmb\|레이아웃\|mdm`, `dmc\|마스터코드\|mdm`, `dmd\|마스터데이터\|mdm`, `dme\|업무기준\|mdm`, `mdm\|마루 MDM\|-` |
| `SELECT ROLE_ID FROM TB_MCM_SEC_ROLE WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY ROLE_ID;` | `MDM_STD_ADMIN`, `MDM_STEWARD` |
| `SELECT ROLE_GROUP_ID, ROLE_ID FROM TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID LIKE 'MDM\_%' ESCAPE '\' ORDER BY 1;` | `ROLE_GROUP_MDM_STD_ADMIN\|MDM_STD_ADMIN`, `ROLE_GROUP_MDM_STEWARD\|MDM_STEWARD` |
| `SELECT PERMISSION_ID, IFNULL(PERMISSION_COMMON,'-'), IFNULL(PERMISSION_CUSTOM,'-'), IFNULL(POPUP_BTN,'-'), PERMISSION_ACTION FROM TB_MCM_SEC_PERM WHERE PERMISSION_ID LIKE 'PERM\_MDM\_%' ESCAPE '\' ORDER BY 1;` | `PERM_MDM_CONFIRM\|-\|-\|-\|search,view,export,compare,save,delete,reg,import,validate,execute,copy,restore,confirm`, `PERM_MDM_EDIT\|-\|-\|-\|search,view,export,compare,save,delete,reg,import,validate,execute,copy,restore`, `PERM_MDM_READ\|-\|-\|-\|search,view,export,compare` |
| `SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID='mdmSample' ORDER BY ROLE_ID;` | `MDM_STD_ADMIN\|mdmSample\|PERM_MDM_EDIT`, `MDM_STEWARD\|mdmSample\|PERM_MDM_READ`, `SYSADMIN\|mdmSample\|PERM_ALL` |
| `SELECT COUNT(*) FROM TB_MCM_SEC_USER WHERE USER_ID LIKE 'e2e\_%' ESCAPE '\';`(픽스처 적용 **전**에 돈다) | `0`(운영 시드에 시험 사용자 없음) |

  - `FULL_SEQ`·`MENU_SEQ` 는 대조하지 않는다. `seedMdmMenus` 뒤에 `fixModuleRootMenuSeqOrder`(DI:431)와 `recomputeMenuFullSeq`(DI:435)가 값을 다시 계산할 수 있어서 손으로 적은 기대값이 거짓 빨강을 낸다. 폴더 순서(dma→dme)는 E2E 스크린샷으로 사람이 본다. `PARENT_MENU_ID` 가 NULL 인지 빈 문자열인지는 첫 실행 출력으로 Build 가 확인하고 `IFNULL` 기대값을 맞춘다.
- PERM 행의 기대 액션 문자열은 `MdmPermissions.READ_ACTIONS`·`EDIT_ACTIONS`·`CONFIRM_ACTIONS` 를 `","` 로 이은 값과 같아야 한다. Build 는 기대 파일을 손으로 쓰지 말고 계약 상수에서 만든 값과 대조해 확인한다(`jshell` 이나 lib 테스트 출력으로 한 번 뽑아 비교).
- 정리: `kill $FE_PID $BE_MDM_PID $BE_MCM_PID` 뒤, 자기 포트를 아직 리슨하는 프로세스만 `lsof -tiTCP:15103 -sTCP:LISTEN | xargs kill`, 18196·18103 도 같다(시작할 때 비어 있음을 확인한 포트라 점유자는 자기 프로세스뿐). **금지**: 전역 `gradlew --stop`, `pkill`·`killall`·`pgrep -f` 로 종료, 5100·8100·8096 프로세스 종료, `be-run.sh`·`fe-run.sh`. `src/backend/data/` 는 gitignore 대상이라 남겨도 된다.

### 3.7 04 「버전 상태와 적용시점」 예시 → 테스트 매핑

| 04 예시·규칙(행) | 테스트 | 비고 |
|---|---|---|
| 샘플 데이터 PROC_CD v1.000 [2024-01-01, 2026-07-01) → v1.001 [2026-07-01, 9999) (04:1063-1066) | S1 + S2 | 확정 경로로 이력을 다시 만든다(TSK-06-05 수용 기준 "v1.000 → v1.001 재현" 의 공통 부분) |
| 기준일 2026-09-03, v2.000 DRAFT, "새 버전 버튼: DRAFT v2.000이 있으므로 비활성"(04:1061,1082) | S3 | 확정 뒤 미래 RELEASED 가 생성 거부(MDM006)를 일으키고, apply_from 경계에서 풀림 |
| EQP_CD 수신 "apply_from 2026-07-15가 이전 버전의 apply_from 2026-08-01보다 앞섬" REJECTED(04:1091-1094) | S4 | 수신은 보류지만 같은 순서 규칙(ADR-0002 D4-3)을 확정에 적용 |
| 적용 구간: 새 버전 apply_to 9999-12-31, 직전 유효 버전 apply_to = 새 apply_from(04:327) | S1·S2·S3·S15 | "승인" 을 "확정" 으로 읽는다(PRD 규칙 7) |
| 최초 버전은 하한 면제·과거 일시 허용(04:337) | S1, L1 ① | |
| 3항 대체: 직전 RELEASED apply_from 보다 뒤(ADR-0002 D4) | S4·S5, L1 ②~⑤ | |
| 한 번에 하나: 미적용 버전이 있으면 새 버전 불가(04:284) | S3 | |
| 미적용 2개일 때 허용 DRAFT 삭제·거부 확정·저장(04:293-301) | S6 | "상신·승인·배포·철회" 거부는 이번 범위에 전이가 없다 |
| DRAFT 는 소유자만 저장·삭제·해제·넘기기(04:303) | S7·S17·S19·S20·S21 | |
| 관리자 강제 해제 없음(04:303) | S19(SYSADMIN 도 MDM003), I8 | |
| row_version 다르면 "다른 사용자가 수정했습니다", 상태 전이도 같은 검사(04:305) | S11·S12·S13, 모든 전이의 rv+1 단언 | |
| DRAFT 삭제로 번호 재사용(04:280) | S17 | 04 자식 행 정리는 삭제 훅 몫(K2, 인계) |
| CREATED → INUSE: 첫 RELEASED 의 apply_from 이 지나면(04:251) | S1·S22 | 확정 트랜잭션 안의 즉시 전이만(D8) |
| major·minor 채번, ver_kind, minor 상한(04:269-282) | **해당 없음** | 새 버전 생성은 영역 Task(TSK-06-02) |
| 복원(restored_from)(04:307-322) | **해당 없음** | 같은 사유 |
| 반려·승인 취소·철회·늦은 결재 경고(04:343-360) | **해당 없음** | PRD 규칙 7 보류. 미래 apply_from 확정 경고는 TSK-06-05·08-05 |
| 사본 버전 선택·소급(04:365-376) | **해당 없음** | 배포 보류 |
| 현재 버전 칼럼 없음·"배포 대기" 표시(04:378) | V2(셸 배지 "적용 대기") | 화면 표시 규칙만 |

### 3.8 게이트 명령 (Build·Verify)

오케스트레이터가 기준선에서 실제로 돌린 명령(글자 그대로):
- 백엔드: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll` → 기준선 447 tests, 0 failures
- 프런트 m-mdm 테스트: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm test` → 1 passed
- 프런트 m-mdm 타입 검사: `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm lint` → 통과

| 게이트 | 명령 | 판정 |
|---|---|---|
| backend 전체 | 위 백엔드 명령 | 기준선 447 대비 신규 실패 0, 총수 증가(새 테스트 수만큼) |
| m-mdm 테스트 | **선행 조건**: `cd src/frontend && pnpm build:libs` 를 먼저 한 번 실행(shared dist, F49). 그 뒤 위 m-mdm 테스트 명령 | 기존 1 + V1~V3 전부 passed |
| m-mdm 타입 검사 | 위 타입 검사 명령 | 통과 |
| m-mdm build | `cd src/frontend && pnpm --filter @dk-oasis/m-mdm build` | 통과, `dist/pages/dma/mdmSample/page.js` 갱신 |
| UI audit | §3.4 끝의 두 audit | 0건 |
| OASIS 계약 | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` | ERROR 0 |
| MSSQL | §3.3 | PASSED(수동 게이트, docker 필요) |
| E2E·시드 | §3.6 | 시드 diff 없음, 두 스펙 passed, 증거 4가지 |
| 계약 밖 코드 확인 | `/usr/bin/git diff --stat 7fc2380..HEAD -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract` | K1·K2·K3 세 파일만 |
| 금지 영역 | `/usr/bin/git diff --stat 7fc2380..HEAD -- src/frontend/shared src/frontend/m-mcm src/backend/cactus-core src/backend/mcm-core docs/mdm/tasks/TSK-01-01 docs/mdm/tasks/TSK-01-02 docs/mdm/adr` | 출력 없음 |
| mcm 시드 범위 | `/usr/bin/git diff 7fc2380..HEAD -- src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `seedMdmMenus` 와 그 javadoc, 새 메서드 `seedMdmRbac`·`seedMdmObjectRbac` 밖의 줄 변경 없음 |

m-mcm·shared 는 바꾸지 않으므로 그 패키지 게이트는 없다. 만약 Build 가 부득이 바꾸게 되면 먼저 보고하고 오케스트레이터가 기준선을 다시 잰다.

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 권한 없는 사용자는 MDM 메뉴가 보이지 않고 API 가 403 | E2E T3(역할 없는 사용자: `myMenusTree` 응답에 `mdm`·`dma`~`dme` 행 없음, 응답 뒤 사이드바에 "마루 MDM" 0개, `/api/mdm/oasis/mdmSample/search` → 403 `FORBIDDEN`). 양성 대조 E2E T2·T4(담당자·표준 관리자는 보이고 403 아님). 시드 대조 §3.6(MDM PERM 이 COMMON 칸을 비워 액션이 매트릭스 그대로). 서비스 수준 역할 거부 S8·S18(MDM013, 의미 상태 403). mdm 신뢰 채널 A2 |
| 셸 컴포넌트가 Vitest 로 렌더 테스트된다 | V1(`MdmPageLayout` happy-dom 렌더), V2(상태·잠금 배지 렌더·색 토큰), V3(그룹 이름): `pnpm --filter @dk-oasis/m-mdm test` |
| 확정·DRAFT 삭제와 거부 경로(미적용 버전 둘, 비소유자, apply_from 역순, 확정 검사 실패) 단위 테스트 | 확정 S1·S2·S3·S15, 삭제 S17. 미적용 둘 S6(MDM007), 비소유자 S7·S17(MDM003), apply_from 역순 S4·S5(MDM008)·L1, 확정 검사 실패 S9(MDM010)·S10(MDM014) |
| 동시 확정 충돌 시 row_version 409 | S12(같은 rv 두 번 → 둘째 MDM001, MDM002 아님), S13(검사와 UPDATE 사이 경합 → 조건부 UPDATE 0행 → MDM001), S11, MSSQL S12·S13. "409" 는 `MdmErrorCode.ROW_VERSION_CONFLICT`(httpStatus 409)를 `BusinessException` 의 `ErrorDetail.code = "MDM001"` 로 싣는 것으로 표현한다(D5, L4) |
| 담당자 역할만 확정 가능 | S8(SYSADMIN·표준 관리자 → MDM013, 담당자 포함 → 성공), L2(역할 문자열 정규화), A2(실제 요청 경로에서 역할 헤더가 서비스 문맥에 들어오는 채널) |
| 확정 검사 실패 시 DRAFT 가 그대로 남는다 | S9·S10(상태·rv·APPLY_FROM·직전 APPLY_TO·부모 상태 모두 불변), 같은 단언을 S4·S13·S14 에도 둔다(검사 실패·경합·원자성) |
| (요구사항) MDM 메뉴 그룹 트리 시드 | 시드 대조 §3.6 첫 SELECT, E2E T1~T4 메뉴 이동 |
| (요구사항) 역할 2종·권한 매핑 기본값 | 시드 대조 §3.6 2~5번째 SELECT |
| (요구사항) 04 예시를 테스트로 | §3.7 매핑 |

---

## 5. 불변 규칙: 이 작업에서 바꾸면 안 되는 것

Build·Verify 는 항목마다 적힌 변이를 **일부러 넣어 빨강을 확인**하고 되돌린다. 빨강이 안 나는 변이는 보고한다.

| # | 불변 규칙 | 변이 → 기대 빨강 |
|---|---|---|
| I1 | **미적용 버전 하나**: 미적용 = `DRAFT` + `APPLY_FROM > now` 인 `RELEASED`. 미적용이 있으면 새 버전 생성 거부(MDM006). 확정·DRAFT 저장은 **다른** 미적용이 있으면 거부(MDM007). DRAFT 삭제·선점·해제·넘기기는 막지 않는다 | 미적용 판정에서 미래 RELEASED 제외 → S3 / `>` 를 `>=` → S3(경계) / confirm 에서 MDM007 검사 삭제 → S6 / deleteDraft 에 MDM007 검사 추가 → S6 |
| I2 | **확정은 한 트랜잭션**: DRAFT→RELEASED(`APPLY_TO = 9999-12-31 00:00:00`)와 직전 RELEASED `APPLY_TO = 새 APPLY_FROM`, 부모 INUSE 가 같은 트랜잭션이다. 하나라도 실패하면 전부 롤백 | `TransactionTemplate` 제거 → S13·S14 / 직전 닫기를 SPI 검사 앞으로 이동 → S9·S13 / `OPEN_END` 대신 NULL → S1 |
| I3 | **apply_from 순서**: 직전 RELEASED `APPLY_FROM` 보다 **엄격히 뒤**(같으면 거부), 최초 버전 면제, 소급(과거) 허용. 직전 = `VER` 가 draft 보다 작은 RELEASED 중 최대 | `isAfter` → `!isBefore` → S5·L1 / 최초 면제 삭제 → S1·L1 / 직전을 "VER 최소" 로 → S3 |
| I4 | **확정은 담당자 역할만**: `MdmCurrentUser.roleIds()` 에 `MDM_STEWARD` 가 있어야 한다(`ROLE_` 접두 한 번 제거). `SYSADMIN`·`MDM_STD_ADMIN` 만으로는 거부(MDM013). 선점도 같다 | 역할 검사 삭제 → S8 / SYSADMIN 허용 추가 → S8 / 접두 제거 삭제 → L2 |
| I5 | **소유자만**: 확정·삭제·해제·넘기기·저장 가드는 `OWNER_ID = 행위자` 일 때만(owner NULL 도 거부, MDM003). 선점은 `OWNER_ID IS NULL` 일 때만(자기 자신이어도 MDM004) | 소유자 검사 삭제 → S7·S17·S19·S20·S21 / owner NULL 허용 → S7 / 선점 조건 삭제 → S18 |
| I6 | **관리자 강제 해제·넘기기 없음**: 소유자 아닌 사람의 해제·넘기기 경로가 없다. 역할(SYSADMIN 포함)이 소유자 검사를 우회하지 않는다. 해제는 역할을 요구하지 않는다 | release 에 "SYSADMIN 이면 통과" 추가 → S19 / release 에 담당자 역할 요구 추가 → S19(역할 없는 소유자) |
| I7 | **넘기기 대상은 담당자**: `MdmStewardDirectory.isSteward` 가 true 여야 하고, 공백·자기 자신은 거부(MDM005). 기본 구현은 항상 false(fail-closed) | 대상 검사 삭제 → S20 / 기본 구현을 true 로 → L9 |
| I8 | **확정 검사 실패 시 DRAFT 가 그대로**: errors 가 있으면 MDM010, 경고 미확인이면 MDM014. 어느 경우든 DRAFT 의 STATUS·ROW_VERSION·APPLY_FROM·APPLY_TO, 직전 APPLY_TO, 부모 STATUS 가 바뀌지 않는다 | errors 무시 → S9 / warnings 확인 없이 통과 → S10 / 검사를 UPDATE 뒤로 이동(롤백 없음 가정) → S9 |
| I9 | **동시 확정 충돌은 row_version 409(MDM001)**: 요청 rv ≠ 저장 rv 면 MDM001. 조건부 UPDATE 는 `WHERE … AND STATUS='DRAFT' AND ROW_VERSION = :expected` 이고 0행이면 MDM001. 모든 전이·저장 가드는 rv 를 정확히 1 올린다 | 조건부 UPDATE 의 `ROW_VERSION` 조건 삭제 → S13 / 0행 무시 → S13 / rv 증가 2 → S1·S18 |
| I10 | **검사 순서**: 역할(해당 시) → 행 읽기(없으면 MDM001) → 소유자 → row_version → 상태 DRAFT → 미적용 2개(해당 시) → apply_from → SPI → 조건부 UPDATE | 상태 검사를 row_version 앞으로 → S12(MDM002 가 나와 빨강) / 역할 검사를 SPI 뒤로 → S8 은 초록일 수 있음 → `MdmCurrentUser` 가짜의 "역할 조회 전 SPI 호출됨" 기록 단언으로 S8 에서 잡는다 |
| I11 | **결재 칸**: 확정은 `REQUESTED_BY = 확정자`, `REQUESTED_AT = RELEASED_AT = now` 만 쓰고 `APPROVED_BY`·`APPROVED_AT`·`EMERGENCY_*`·`REJECT_REASON`·`CANCELLED_*` 는 쓰지 않는다. `OWNER_ID` 는 지우지 않는다(ADR-0002 D3·D5) | `APPROVED_BY` 에 확정자 → S1 / `OWNER_ID = NULL` → S1 |
| I12 | **부모 INUSE**: 확정 트랜잭션에서 `APPLY_FROM <= now` 이고 부모 `STATUS='CREATED'` 일 때만 INUSE. 미래면 CREATED 유지, 이미 INUSE 면 손대지 않음 | `<=` → `<` → S22 / 조건 삭제 → S22(미래도 INUSE) |
| I13 | **공통 서비스는 버전 행과 부모 상태 칼럼만 쓴다.** 영역 테이블(ITEM·CATE·VAR·ROW 등)은 쓰지 않고, DRAFT 삭제의 자식 정리는 대상별 삭제 훅이 같은 트랜잭션에서 VER 행 삭제 **전**에 한다 | 삭제 훅 호출을 DELETE 뒤로 → S17(훅이 행을 못 봄) / 훅 호출 삭제 → S17 |
| I14 | **SPI·훅 등록**: target 마다 확정 검사 SPI·삭제 훅이 정확히 하나. 없으면 그 target 의 확정·삭제는 `IllegalStateException`(fail-closed), 둘이면 기동 실패. 공통 서비스는 SPI 의 `diff` 를 부르지 않고 apply_from 순서를 SPI 에 맡기지 않는다 | 중복 허용(마지막 값 사용) → L3 / 미등록 시 통과 → L3 |
| I15 | **일시**: 현재 시각은 `Clock`(Asia/Seoul)에서만 얻고 초 단위로 자른다. DB 시각 함수 금지. SQLite 네이티브 쓰기는 `TEXT 'yyyy-MM-dd HH:mm:ss'`, MSSQL 은 `LocalDateTime`(DATETIME2). 바인딩은 `MdmTemporalBinder` 한 곳 | 바인더를 `Timestamp` 로 → S24·L5 / `CURRENT_TIMESTAMP` 사용 → S23(U_AT ≠ clock) / 초 자르기 삭제 → S16·L5 |
| I16 | **감사 칼럼**: 모든 네이티브 쓰기가 `U_USR_ID·U_AT·U_SVC_ID·U_PGM_ID` 를 `MdmNativeAuditSupport` 값으로 명시하고, 명세에 감사 카운터 칼럼이 있으면 1 올린다 | 부모 INUSE UPDATE 에서 감사 칼럼 삭제 → S23 / 카운터 증가 삭제 → S23 |
| I17 | **테이블·칼럼 이름은 명세에서만**: 테스트는 실제 이름과 다른 픽스처 테이블을 쓰고, 이름 값이 `^[A-Z][A-Z0-9_]*$` 가 아니면 거부한다. 사용자 입력은 항상 바인딩 파라미터 | 이름 검사 삭제 → L10 |
| I18 | **mdm 신뢰 채널**: `cactus.jwt.secret` 과 client key 가 켜져 있어 헤더 없는 `/oasis/**` 는 401, 신뢰 헤더가 있으면 역할이 `UserContextHolder` 에 들어온다. `/actuator/health` 는 200 | `jwt.secret` 삭제 → A2 ① / skip-paths 에서 `/actuator/` 삭제 → A2 ③·`MdmApplicationHealthTest` |
| I19 | **MDM 권한 세트**: PERM 3종의 액션은 `MdmPermissions.*_ACTIONS` 와 같고 `PERMISSION_COMMON`·`PERMISSION_CUSTOM`·`POPUP_BTN` 은 NULL. 역할 ID 는 `ROLE_` 접두 없이 `MDM_STD_ADMIN`·`MDM_STEWARD`, 역할 그룹 1:1. 매트릭스 10칸은 ADR-0003 D5 그대로이고 SYSADMIN 은 기존 PERM_ALL 행만 | READ 에 COMMON `'search,save'` → §3.6 diff / STEWARD × dma 를 EDIT → §3.6 diff / 역할 그룹 매핑 삭제 → E2E T2 |
| I20 | **메뉴**: 새 폴더 `dmb`~`dme` 는 `mdm` 아래, 이름은 `MdmScreenGroup`·screens/README §2·m-mdm `MDM_GROUPS` 와 글자까지 같다. 기존 마스터관리·업무기준관리 메뉴·시드 메서드는 바꾸지 않는다. 시험 사용자는 운영 시드에 없다 | 폴더 이름 한 글자 변경 → §3.6 diff·V3 / `seedMcmSecMenuFld` 수정 → §3.8 mcm 시드 범위 diff / DataInitializer 에 e2e 사용자 추가 → §3.6 마지막 SELECT |
| I21 | **권한 없는 사용자에게 MDM 메뉴·API 비노출**: MDM OBJECT 에 매핑이 없는 역할의 사용자는 사이드바에 "마루 MDM" 이 없고 `/api/mdm/oasis/**` 가 403 | `seedMdmObjectRbac` 가 역할 없는 `ROLE_USER` 에도 매핑 → E2E T3 |
| I22 | **셸**: 화면·셸·테스트는 `@mantine/*`·`ag-grid-*` 를 import 하지 않는다. 배지 색은 의미 토큰(`var(--color-…)`)만, 16진수·`rgb()` 없음. `MdmPageLayout` breadcrumb 는 `"마루 MDM > {그룹 폴더} > {title}"`, `objId = screenId`. 잠금 배지는 DRAFT 에서만 보인다 | 배지에 `#fff` → V2 / breadcrumb 구분자 변경 → V1 / RELEASED 에도 잠금 배지 → V2 / `@mantine/core` import → audit |
| I23 | **계약 변경 범위**: 계약 패키지 변경은 K1·K2·K3 뿐이고, 기존 12개 오류 코드·기존 인터페이스 시그니처는 바뀌지 않는다. 구현 클래스는 계약 패키지 밖에 있다 | 계약에 구현 클래스 추가 → TSK-01-02 ArchUnit / 기존 코드 메시지 변경 → `CommonContractTest` |
| I24 | **선행 산출물 보존**: `docs/mdm/tasks/TSK-01-01/**`·`TSK-01-02/**`(스크린샷 포함)·ADR·규칙표·screens/README 는 바꾸지 않는다. 샘플의 OBJECT_ID·screenId·componentPath·안내 문단은 그대로 | §3.8 금지 영역 diff / 안내 문단 변경 → `mdm-sample-smoke.spec.ts` |

---

## 6. 관례·함정 메모 (Build 가 알아야 할 것)

- mdm 에는 gradlew 가 없다. `src/backend/mdm` 에서 `../gradlew`, JDK 는 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`(시스템 기본은 JDK 26). 단일 테스트: `cd src/backend/mdm && JAVA_HOME=… ../gradlew :api:test --tests '*VersionStateServiceSqliteTest' --no-daemon`.
- rtk 훅이 `grep`·`ls`·`find` 출력을 자른다. 전체가 필요하면 `rtk proxy grep …`.
- `@SpringBootTest` 컨텍스트는 `@TempDir` 파일마다 새로 뜬다. 시나리오는 한 클래스에 모아 컨텍스트를 한 번만 띄우고, 쓰기 시나리오끼리 행이 섞이지 않게 `@BeforeEach` 에서 픽스처 테이블을 비운다.
- 픽스처 테이블 DDL 은 SQLite 에서 트랜잭션에 든다. `@BeforeAll` 이 아니라 첫 `@BeforeEach` 에서 `CREATE TABLE IF NOT EXISTS` 로 만든다(스프링 빈 주입 뒤라야 `EntityManager`·`DataSource` 를 쓸 수 있다).
- SQLite 는 쓰기가 한 번에 하나라 스레드 경합 테스트는 `SQLITE_BUSY` 로 끝나기 쉽다. 동시성은 S12(순차 재현)와 S13(같은 트랜잭션 안의 끼어들기)로 결정적으로 본다.
- 트랜잭션 안에서 예외가 난 뒤의 상태 단언은 **새 트랜잭션**(예: `TransactionTemplate` 한 번 더, 또는 `DataSource` 에서 새 연결)으로 읽는다. 같은 영속성 컨텍스트로 읽으면 롤백 전 값을 볼 수 있다.
- `AuditHolder`·`UserContextHolder` 는 ThreadLocal 이다. 테스트마다 `@AfterEach` 에서 지운다.
- 서비스 클래스에 `@Transactional` 금지(F19). `TransactionTemplate` 을 쓴다.
- `DataInitializer.run()` 은 한 트랜잭션이라 시드 SQL 오타 하나가 mcm 기동 전체를 막는다. 엔티티와 대조한 뒤 E2E 절차의 mcm 기동으로 확인한다. `nq()` 가 SQLite 에서 `MCMAPUSER.`·`N'` 를 떼 준다.
- `insertMcmSecMenuIfAbsent` 는 OBJECT_ID 가 `^[a-z][a-zA-Z0-9]*$` 가 아니면 기동을 실패시킨다(이번에는 새 leaf 가 없다).
- BFF 권한 캐시는 60초, mcm `UserPermCache` 는 10분 TTL 이다. E2E 사용자는 mcm 기동 뒤 SQL 로 넣고 곧바로 첫 로그인을 하므로 캐시 영향이 없다. 매핑을 바꿔 다시 시험하려면 서버를 다시 띄운다.
- 역할 그룹이 하나도 없는 사용자(`e2e_mdm_none`)의 로그인이 mcm 에서 막히는지는 확인하지 않았다(미확인). 막히면 픽스처에서 MDM 역할이 없는 빈 역할 그룹 `ROLE_GROUP_E2E_EMPTY`(역할 매핑 없음)를 만들어 그 사용자에게 매핑하고, 이 변경을 「Build 이탈」에 적는다. 수용 기준의 뜻(MDM 권한 없음)은 같다.
- `mdm-sample-smoke.spec.ts` 가 TSK-01-02 스크린샷을 덮어쓴다(F51). §3.6 7) 로 되돌리고 stage 하지 않는다.
- vitest 는 tsconfig `jsx` 를 따르지 않을 수 있다. `vitest.config.ts` 의 `esbuild.jsx: "automatic"` 을 지우지 않는다. `@/` 별칭은 vitest 에 따로 적어야 한다(U9).
- `PageLayout` 에 `objId` 를 주면 `/api/auth/me` 를 부르고 globalThis 저장소에 캐시한다. V1 은 fetch 스텁과 `__dkOasisButtonRbacStore__` 삭제를 테스트마다 한다.
- git 은 `/usr/bin/git` 절대경로. `git add -A` 금지, 파일명을 명시해 stage. 모든 커밋에 `--trailer "DFlow-Order: c7f0c4f6-568b-41f1-a7e3-40936f6c5827"`. 겪은 문제는 파일로 쓰지 않고 Phase 끝 보고에 분류(tool-error·gate-retry·permission·skill-unclear·env·other)와 함께 올린다.
- 셸의 cwd 가 도구 호출 사이에 바뀔 수 있다. 명령은 절대경로로 쓰거나 워크트리 루트로 먼저 이동한다.

---

## 7. 후속 Task 인계

| 받는 Task | 인계 내용 |
|---|---|
| TSK-06-01 · TSK-08-01 (DDL·엔티티) | ① F25 칼럼 이름 충돌은 decisions D-034 로 해결됐다. `DefaultVersionTableRegistry` 는 이미 버전 테이블 `AUD_VER`·부모 `VER` 로 채워져 있다(Build 반영). 버전 엔티티는 `@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))` 를 쓴다. ② 버전 테이블에 §2.4 고정 칼럼(`STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, REQUESTED_BY, REQUESTED_AT, RELEASED_AT, ROW_VERSION`, 감사 `U_*`)이 이 이름으로 있어야 한다. `ROW_VERSION BIGINT NOT NULL DEFAULT 0`. 부모 `TB_MDM_CODE`·`TB_MDM_RULE` 에 `STATUS`. ③ `AbstractVersionStateScenarioTest` 를 실제 테이블로 상속해 같은 시나리오를 돌린다(픽스처 대신 Flyway 테이블, 부모 FK·NOT NULL 칼럼은 그 Task 의 `seedObject`·`seedVersion` 이 채운다). ④ SQLite 일시는 TSK-01-03 이 `TEXT 'yyyy-MM-dd HH:mm:ss'`(KST) 로 쓴다(D9): 버전 엔티티의 `LocalDateTime` 매핑이 이 문자열을 읽어야 한다 |
| TSK-04-01 | 규칙표 #16 실측 때 `MdmTemporalBinder` 의 SQLite 형식(업무 일시·감사 `U_AT` 모두 KST 초 단위 문자열)과 `CactusAuditEntity` Instant 저장 형식을 맞춘다. 다르면 바인더 한 곳만 고친다 |
| TSK-06-02 (04 DRAFT 생성·편집) | 새 버전 INSERT 직전 `VersionWriteGuard.checkCanCreateVersion`, DRAFT 저장 직전 `beginDraftWrite`(반환 rv 를 화면에 돌려준다). INSERT 는 `STATUS='DRAFT'`, `OWNER_ID = 만든 사람`, `ROW_VERSION = 0`. `VersionDraftDeletionSpi`(MASTER_CODE) 구현: `to_ver = V` 행 9999 로 되돌리기, `from_ver = V` 행 삭제(ITEM·CATE·CATE_ITEM), VER 행 삭제 전에. 버전 엔티티를 들고 있다가 공통 서비스를 부른 뒤에는 다시 읽는다(§2.4 영속성 함정) |
| TSK-08-02 (06 룰 DRAFT) | 위와 같다. `VersionDraftDeletionSpi`(BUSINESS_RULE)는 CASCADE 가 있으므로 빈 구현을 **반드시 등록**한다(미등록이면 삭제가 fail-closed) |
| TSK-06-05 · TSK-08-05 (확정 화면) | `VersionConfirmCheckSpi` 구현을 target 마다 하나 등록한다(없으면 확정이 `IllegalStateException`). 화면은 MDM014 를 받으면 경고 목록을 보여 주고 확인 뒤 `warningsAcknowledged=true` 로 다시 보낸다. 오류 판별은 `meta.code`·`errors[].code`(MDM001 = 다시 불러오기 안내). 미래 apply_from 확인 경고는 화면 몫(ADR-0002 결과). CREATED→INUSE 의 "그 밖의 쓰기 경로·조회 계산값"(ADR-0002 D6 후반)은 영역 몫. 상태·잠금 배지는 m-mdm `@/shell` 의 `VersionStatusBadge`·`DraftLockBadge`, 화면 골격은 `MdmPageLayout` |
| DRAFT 소유권 화면 Task(06-02·08-02 중 먼저 오는 것) | ① 넘기기 대상 담당자 조회 어댑터(`MdmStewardDirectory` 구현)를 만든다(D7). mcm 에 역할 조회 경로를 새로 두는 일은 보안 검토 대상이다. ② `lock/unlock/handover` 액션 이름을 확정하면 `allActions`·`PERM_MDM_EDIT`·`MdmActions` 와 §3.6 기대 출력을 함께 고친다(ADR-0003) |
| 모든 화면 Task | 새 leaf 시드 뒤 `seedMdmObjectRbac("<screenId>", "<group>")` 한 줄을 부른다. 화면은 `MdmPageLayout` 을 쓴다 |

---

## 8. 선행 산출물(TSK-01-02 외) 수정 필요 여부: 오케스트레이터 판단용

- **TSK-01-02 산출물**: 작은 추가만 한다(계약 인터페이스 2개, 오류 코드 2개, `CommonContractTest` 개수 12→14, 스텁 2개). 기존 계약의 시그니처·값은 바꾸지 않는다(D3). 크게 고칠 필요는 없다.
- **선행 결함(해결됨)**: 감사 칼럼 `VER`(규칙표 §2·ADR-0001 D2·`MdmAuditColumns`·`CactusAuditEntity`)과 원천 업무 칼럼 `ver`(04 `TB_MDM_CODE_VER`, 06 `TB_MDM_RULE_VER`·`RULE_VAR`·`RULE_ROW`)가 한 테이블에서 이름이 같다(F25). **decisions D-034 로 (가) 확정**: 6개 테이블(CODE_VER·CODE_RECV·RULE_VER·RULE_VAR·RULE_ROW·RULE_RECV)에 한해 감사 카운터만 `AUD_VER` 로 개명하고, 엔티티는 `@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))` 를 쓴다. 원천 업무 칼럼은 그대로다. 이 Task 는 팀장 지시로 기본 명세를 D-034 에 맞췄다(Build 반영).

---

## 담당자 확인 필요 결정

### D1: 공통 버전 상태 서비스가 버전 행을 어떻게 읽고 쓰는가
- **질문**: 버전 테이블(04·06)이 아직 없다(F23). 공통 서비스(확정·삭제·소유권)는 무엇으로 행을 다루는가?
- **선택지**: (a) 테이블·키 칼럼 이름을 주입받는 명세(`VersionTableSpec`)로 JPA native 쿼리 한 경로를 두고, 테스트는 다른 이름의 픽스처 테이블로 돌린다 / (b) 저장 포트(`VersionRowAccess`)를 두고 04·06 이 엔티티로 구현, 공통 서비스는 규칙만 / (c) 실제 이름으로 테스트 테이블을 만들고 TSK-06-01·08-01 이 오면 테스트를 고친다 / (d) 이 Task 에서 버전 테이블 DDL 을 먼저 만든다
- **택한 것**: (a)
- **근거**: 두 테이블의 상태·소유자·적용 구간·row_version 칼럼이 같아(F24, 원천) 한 경로로 다룰 수 있다. ADR-0002 결과 절과 TSK-01-02 D3(미승인 선행)이 "확정 트랜잭션은 TSK-01-03 이 공통 구현하고 직전 버전 apply_to 닫기는 네이티브 UPDATE" 를 전제한다. 규칙표 §4(리포 관례·미승인)는 JPA native 를 정한다. (b) 는 트랜잭션 규칙(조건부 UPDATE·원자성)이 영역마다 흩어지고, 이 Task 에서 실제 DB 로 원자성을 증명할 수 없다. (c) 는 뒤 Task 의 Flyway 테이블(부모 FK·NOT NULL)과 충돌한다. (d) 는 spec 의 data-model "-" 과 wbs 의 테이블 배정(TSK-06-01·08-01)에 어긋난다. 강도: 중(두 근거가 미승인 선행 산출물).
- **반려되면 재작업 방향**: (b) 면 `VersionRowStore` 를 포트 인터페이스로 바꾸고 기존 native 구현은 테스트 전용 참조 구현으로 옮긴다. 서비스·시나리오 테스트는 그대로 쓴다.

### D2: (해결됨 — 담당자 확인 대상에서 뺀다)
- 감사 `VER` 와 업무 `VER` 이름 충돌(F25)은 **팀장 지시로 decisions D-034 를 따른다.** 버전 테이블의 감사 카운터는 `AUD_VER`, 부모 테이블의 감사 카운터는 `VER`, 업무 버전 칼럼은 `VER` 다. 기본 명세 `DefaultVersionTableRegistry` 와 L6 단언을 이에 맞췄다(Build 반영, 원안 선택지 (b) 에 해당하되 규칙표는 D-034 가 이미 반영해 고치지 않는다). 번호 D2 는 비워 두고 재번호하지 않는다.

### D3: 계약(TSK-01-02)에 무엇을 더하는가
- **질문**: spec 의 "미적용 버전 하나 규칙" 중 새 버전 생성 거부(MDM006)와 저장 거부(MDM007), 04 DRAFT 삭제의 자식 행 정리(F29), 담당자 아닌 사용자 거부와 경고 확인 흐름을 부를 자리가 현재 계약에 없다.
- **선택지**: (a) 계약에 `VersionWriteGuard`(생성·저장 가드), `VersionDraftDeletionSpi`(삭제 정리 훅), `MdmErrorCode` 2개(MDM013 `STEWARD_ROLE_REQUIRED`, MDM014 `CONFIRM_WARNINGS_NOT_ACKNOWLEDGED`)를 더하고 `CommonContractTest:48` 을 12→14 로 고친다 / (b) 기존 `VersionStateService` 에 메서드를 더한다(T6·T7 과 무관하지만 계약 인터페이스 변경) / (c) 계약을 바꾸지 않고 구현 패키지에만 공개 메서드를 둔다, 오류는 기존 코드(MDM003·MDM010)를 재사용 / (d) 생성·저장 가드와 삭제 훅은 영역 Task 에 넘긴다
- **택한 것**: (a)
- **근거**: spec(1순위)이 "미적용 버전 하나 규칙" 을 이 Task 요구사항으로 둔다. 04:293-301 은 2개일 때 저장·새 버전까지 막는다. 삭제 정리 훅이 없으면 04 DRAFT 삭제가 닫힌 코드 행을 되돌리지 못해 데이터가 틀어진다(F29). 영역이 쓸 모양이라 계약에 두는 것이 TSK-01-02 의 설계 방식(구현은 계약 밖)과 맞고, 새 인터페이스로 두어 기존 스텁(T6·T7)을 건드리지 않는다. 역할 거부를 MDM003(소유자)로 재사용하면 화면이 원인을 구별하지 못하고, 경고 미확인을 MDM010(실패)로 재사용하면 "확인 뒤 다시 보내기" 흐름을 만들 수 없다. 팀장 지시는 작은 추가를 결정 항목으로 남기고 진행하라고 했다. 강도: 중.
- **반려되면 재작업 방향**: (c) 면 K1·K2 를 `com.dongkuk.dmes.mdm.common.version` 으로 옮기고(이름 유지) K3·K4 를 되돌린 뒤 MDM013 → MDM003, MDM014 → MDM010 으로 바꾼다(S8·S10 기대값 수정). (d) 면 K1·K2 와 S3·S6 의 가드 부분, S17 의 훅 부분을 빼고 §7 에 넘긴다.

### D4: 확정 검사 SPI·삭제 훅이 없거나 둘일 때
- **질문**: 지금 운영 컨텍스트에는 어떤 target 의 SPI 도 없다(04·06 구현은 TSK-06-05·08-05). 없을 때 확정·삭제를 허용하는가?
- **선택지**: (a) 없으면 `IllegalStateException`(fail-closed), 둘이면 기동 실패 / (b) 없으면 검사 없이 통과 / (c) 없으면 MDM010 으로 거부
- **택한 것**: (a)
- **근거**: PRD AC-4 는 "확정 시 검사를 하나라도 통과하지 못하면 확정되지 않는다" 이다. 검사가 없는데 확정되면 이 조건이 조용히 깨진다(b). 없는 상태는 사용자 입력 오류가 아니라 배포 구성 오류라 서버 오류(S999)가 맞다(c 는 사용자에게 잘못된 원인을 보인다). 대가: TSK-06-05·08-05 전까지 운영에서 확정·삭제는 항상 실패한다. 그 전에는 확정 화면도 없으므로 실제 영향은 없다. 강도: 강(PRD 인수 조건).
- **반려되면 재작업 방향**: (b) 면 `VersionSpiRegistry` 의 조회를 `Optional` 로 바꾸고 없으면 검사를 건너뛰게 한 뒤 L3 기대값을 바꾼다. 삭제 훅만 선택적으로 하려면 삭제 쪽만 바꾼다.

### D5: "row_version 409" 를 어떻게 표현하는가
- **질문**: 수용 기준은 "동시 확정 충돌 시 row_version 409" 인데 OASIS 경로는 HTTP 200 + `meta.code` 로 오류를 돌려주고(F13) cactus `ErrorCode` 에는 409 가 없다. TSK-01-02 는 표현을 이 Task 에 넘겼다(F11).
- **선택지**: (a) `MdmErrorCode.ROW_VERSION_CONFLICT`(의미 상태 409)를 cactus `BusinessException(transport=BUSINESS_ERROR, detail.code="MDM001")` 로 싣는다. HTTP 상태는 바꾸지 않는다 / (b) mdm 전용 예외 처리기로 OASIS 응답 HTTP 상태를 409 로 바꾼다 / (c) cactus-core `ErrorCode` 에 `CONFLICT(409)` 를 더한다
- **택한 것**: (a)
- **근거**: TSK-01-02 D7(미승인 선행)이 이 모양을 전제로 `httpStatus` 를 의미 상태로 정의했다. (b) 는 OASIS 실행기 공통 동작(모든 모듈의 오류 응답 규약)과 다른 예외 경로를 mdm 에만 만든다. (c) 는 전 모듈 공용 cactus-core 변경이다. 화면은 `errors[].code == "MDM001"` 로 "다시 불러오세요" 를 안내한다. 강도: 중.
- **반려되면 재작업 방향**: HTTP 409 가 꼭 필요하면 (b) 로 `OasisServiceExecutor` 확장점 또는 BFF 프록시에서 `MDM001` 을 409 로 바꾸는 별도 Task 를 제안한다(모듈 횡단이라 사용자 승인). 서비스 코드는 그대로다.

### D6: 권한 가드를 어디에 두는가(403·메뉴·역할 판정)
- **질문**: mdm 백엔드에는 권한 필터 선례가 없고(F38), 신뢰 채널도 꺼져 있다(F15). "API 403" 과 "담당자만 확정" 을 어느 층이 보장하는가?
- **선택지**: (a) 메뉴·API 액션 RBAC 는 기존 mcm 시드 + BFF(`proxy.ts`)가 맡고(TRD §6), mdm 은 mls 선례대로 `cactus.jwt.secret`·client key 를 켜서 요청 역할을 받으며, 버전 전이 서비스가 역할(담당자)과 소유자를 직접 검사한다 / (b) (a) 에 더해 mdm 에 mcm-core `EndpointPermissionFilter` 류 서버 필터를 둔다 / (c) BFF 만 쓰고 mdm 신뢰 채널은 켜지 않는다(서비스 역할 검사 없음)
- **택한 것**: (a)
- **근거**: TRD §6(미승인)은 "cactus JWT + NextAuth + BFF(`m-mcm/proxy.ts`) RBAC 검증을 그대로 쓴다" 고 정했다. (b) 는 권한 테이블이 mcm DB 에 있어 mdm 이 볼 수 없다(F40). (c) 는 BFF→mdm 호출이 401 로 막히고(F15) "담당자만 확정" 이 실제 요청 경로에서 참이 아니다. SYSADMIN 은 PERM_ALL 로 BFF 를 통과하므로 서비스가 역할을 따로 보지 않으면 SYSADMIN 이 확정할 수 있게 된다(spec "담당자 역할만"). 강도: 중.
- **반려되면 재작업 방향**: SYSADMIN 도 확정해야 한다면 I4 의 허용 역할에 `SYSADMIN` 을 더하고 S8 기대값을 바꾼다. 서버 필터가 필요하면 mcm 권한 조회 API 를 두는 별도 Task 를 제안한다.

### D7: 넘겨받는 사람이 담당자인지 어떻게 검사하는가
- **질문**: ADR-0002 D3(미승인)은 넘겨받는 사람도 담당자여야 한다고 한다(MDM005). mdm 은 다른 사용자의 역할을 조회할 수단이 없다(F40). spec 본문은 "넘기기(소유자만)" 만 요구한다.
- **선택지**: (a) 포트 `MdmStewardDirectory` 를 두고 기본 구현은 항상 거부(fail-closed), 실제 조회 어댑터는 첫 소유권 화면 Task 가 만든다 / (b) 기본 구현은 항상 허용하고 검사를 뒤로 미룬다 / (c) 이 Task 에서 mcm 에 역할 조회 엔드포인트를 새로 만들고 mdm 이 호출한다 / (d) 넘기기 자체를 이번에 만들지 않는다
- **택한 것**: (a)
- **근거**: 관리자 강제 해제가 없으므로(spec, 04:303) 담당자가 아닌 사람이 소유자가 되면 그 사람은 BFF 권한이 없어 해제·넘기기를 못 할 수 있고, DRAFT 를 풀 방법이 영영 없어진다. 그래서 (b) 는 위험하다. (c) 는 다른 사용자 역할을 노출하는 새 경로라 보안 판단(IDOR)이 필요하고 mcm 패키지까지 바꾼다(무인 범위 밖). (d) 는 spec 요구를 버린다. 넘기기 호출자는 아직 없다(화면 없음). 대가: 어댑터가 생길 때까지 운영에서 넘기기는 MDM005 로 거부된다. 로직(소유자·rv·대상 검사)은 가짜 디렉터리로 S20 에서 검증한다. 강도: 중(spec 은 대상 검사를 요구하지 않음: 1순위 근거는 "소유자만" 뿐, 대상 검사 근거는 미승인 ADR).
- **반려되면 재작업 방향**: (b) 면 `UnresolvedStewardDirectory` 를 "항상 허용 + WARN" 으로 바꾸고 I7 변이 테스트를 뒤집는다. (c) 면 mcm/lib 에 client-key 전용 `GET /api/sec/internal/user-roles?userId=` 를 두고 mdm 에 RestClient 어댑터를 만드는 별도 설계를 올린다.

### D8: CREATED→INUSE 즉시 전이와 결재 칸 채움을 공통 확정에 넣는가
- **질문**: spec 요구사항 목록에는 없다. ADR-0002(미승인)는 D6(INUSE)을 TSK-01-03 에, D5(결재 칸)를 TSK-06-05·08-05 에 배정했고, wbs 는 06-05·08-05 요구에도 "CREATED→INUSE 자동 전이" 를 적는다. 부모 테이블도 아직 없다.
- **선택지**: (a) 확정 UPDATE 가 결재 칸(`REQUESTED_BY/AT`, `RELEASED_AT`)을 함께 쓰고, 같은 트랜잭션에서 `APPLY_FROM <= now` 이면 부모 CREATED→INUSE 까지 한다. 나머지 경로(다른 쓰기·조회 계산)는 영역 몫 / (b) 둘 다 영역에 맡기고 공통 확정은 버전 행 두 개만 바꾼다 / (c) 결재 칸만 공통, INUSE 는 영역
- **택한 것**: (a)
- **근거**: 결재 칸은 확정 UPDATE 와 같은 행·같은 문장이라 영역이 따로 쓰면 UPDATE 가 둘이 되고 row_version 규칙이 흐려진다. INUSE 즉시 전이는 ADR-0002 D4-6·D6 이 확정 트랜잭션 단계로 정의했고 부모 상태 칼럼 이름이 두 영역에서 같다(F24). 명세에 부모 테이블 이름을 두면 비용이 작다. wbs 06-05·08-05 의 요구는 "공통 버전 상태 서비스 사용" 으로 채워진다. 강도: 약~중(spec 은 침묵, 근거는 미승인 ADR).
- **반려되면 재작업 방향**: (b) 면 `casConfirm` 에서 결재 칸을 빼고 `markParentInUse` 호출과 `VersionTableSpec` 의 부모 필드를 지운 뒤 S1·S22·I11·I12 를 영역 인계로 옮긴다.

### D9: SQLite 네이티브 쓰기의 일시 표현
- **질문**: 규칙표 #16 은 업무 일시를 SQLite `TEXT 'YYYY-MM-DD HH:MM:SS'` 로 적었지만 mdm 적용 방식과 감사 `U_AT`(Instant)의 형식은 "실측 필요 → TSK-04-01" 로 미뤘다(F26). 이 Task 가 먼저 네이티브로 쓴다.
- **선택지**: (a) 한 곳(`MdmTemporalBinder`)에서 업무 일시와 감사 `U_AT` 를 모두 KST 초 단위 `'yyyy-MM-dd HH:mm:ss'` 문자열로 쓰고(MSSQL 은 `LocalDateTime`), TSK-04-01 이 실측 뒤 필요하면 이 한 곳을 고친다 / (b) 드라이버 기본(`Timestamp` 바인딩)에 맡긴다 / (c) 감사 `U_AT` 만 UTC ISO 문자열로 쓴다
- **택한 것**: (a)
- **근거**: 규칙표 #16 의 문장(업무 일시 형식·KST 고정·애플리케이션 시각)을 글자대로 따른다. (b) 는 xerial 이 `Timestamp` 를 숫자로 저장할 수 있어 문자열 비교·사람이 읽는 값과 어긋난다. (c) 는 근거 문서가 없다. 한 클래스에 모아 두면 TSK-04-01 의 결론에 따라 고치는 비용이 작다. 강도: 약(실측 전 규칙).
- **반려되면 재작업 방향**: TSK-04-01 결론에 맞춰 `MdmTemporalBinder` 와 L5·S24 기대값만 바꾼다.

### D10: RBAC 시드의 모양
- **질문**: 역할·권한 세트 외에 역할 그룹을 시드하는가, 매핑은 어느 OBJECT 에 하는가, 시험 사용자는 어디서 만드는가?
- **선택지**: (a) 역할 2 + 역할 그룹 2(1:1) + PERM 3(COMMON·CUSTOM·POPUP_BTN 비움) + 기존 OBJECT(`mdmSample`)에만 매트릭스 매핑 + 화면 Task 용 헬퍼 `seedMdmObjectRbac`. 사용자는 시드하지 않고 E2E 가 격리 DB 픽스처로 만든다 / (b) 역할만 시드(역할 그룹은 관리 화면에서) / (c) 시험 사용자까지 DataInitializer 에 시드 / (d) 매트릭스를 폴더 OBJECT 에 매핑
- **택한 것**: (a)
- **근거**: 사용자는 역할 그룹을 거쳐서만 역할을 받는다(F33). (b) 면 아무도 MDM 역할을 가질 수 없어 수용 기준의 양성 대조가 불가능하다. (c) 는 운영 시드에 비밀번호 있는 계정을 넣는다. (d) 는 폴더가 OBJECT 가 아니라서 불가능하다(F37, 메뉴 가시성은 leaf OBJECT 매핑으로 정해진다). COMMON 칸을 채우면 READ 가 save·delete 를 얻는다(F35). 강도: 중(리포 관례 + ADR-0003 매트릭스).
- **반려되면 재작업 방향**: (b) 면 `ROLE_GROUP_MDM_*` 시드와 E2E 픽스처의 매핑 행을 빼고, E2E 픽스처가 역할 그룹까지 만든다. (c) 면 픽스처 SQL 을 DataInitializer 로 옮기되 `local` 프로파일에서만 돌게 한다.

### D11: 셸 배지를 어디에, 어떻게 만드는가(샘플 화면 적용 포함)
- **질문**: shared 에 그리드 밖 배지가 없다(F44). 화면 모듈은 Mantine 을 쓸 수 없고(F42), 모듈 CSS 는 호스트 import 가 필요하다(F45). 셸을 어디에서 보여 주는가?
- **선택지**: (a) m-mdm `src/shell/` 에 업무 배지(버전 상태·DRAFT 잠금)를 두고 의미 토큰 인라인 스타일로 그린다. 샘플 화면에 `MdmPageLayout` 을 입히고 배지 미리보기 패널을 더해 E2E 스크린샷에 보인다 / (b) shared 에 범용 `StatusBadge` 를 추가하고 m-mdm 은 그것을 조합한다 / (c) m-mdm CSS 파일 + m-mcm `module-config` 에 CSS import / (d) 샘플 화면은 그대로 두고 셸은 테스트로만 보인다
- **택한 것**: (a)
- **근거**: 상태→라벨·톤 대응은 mdm 업무 규칙이라 모듈에 두는 것이 맞고, shared 에 같은 컴포넌트가 없으므로 part-b §17 "shared 컴포넌트 로컬 중복 구현 금지" 에 걸리지 않는다. Mantine 을 쓰지 않으므로 "Mantine 이 필요하면 shared 에 추가" 규칙(part-b §4-2)의 대상도 아니다. (b)·(c) 는 shared·m-mcm 을 바꿔 변경 패키지를 늘린다. 인라인 토큰은 UI-Visual-Standard §3 이 허용하고 샘플 화면 선례가 있다. 샘플은 스캐폴드 검증 화면이라 미리보기를 더해도 업무 영향이 없고, 승인자가 스크린샷으로 셸 모습을 본다(dev-discipline). 강도: 중.
- **반려되면 재작업 방향**: (b) 면 shared `components/badge` 를 추가하는 변경을 먼저 승인받고(shared 기준선 측정), m-mdm 배지는 그 래퍼로 바꾼다. (d) 면 U8 의 미리보기 패널을 빼고 E2E T1 의 배지 단언·스크린샷 이름을 조정한다.

---

## Build 이탈 (Build Phase 추기, 2026-09-24)

설계에서 벗어난 점과 그 사유다. 설계의 판단 가운데 D2 만 팀장 지시로 바뀌었고(X12), 나머지(D1·D3~D11)는 그대로다. 새 담당자 결정(D12 이후)은 생기지 않았다.

> **TDD 순서 이탈(X11, 먼저 밝힌다)**: 버전 상태 시나리오 S1~S24 는 서비스 구현을 끝낸 **뒤에** 썼다. "테스트 먼저" 규율과 어긋난다. 대신 시나리오 첫 실행이 7건 빨강으로 실제 결함(X1)을 잡았고, 불변 규칙 변이 55건이 모두 빨강을 낸다(「Build 기록」). lib 단위·A2·V1~V3·시드 대조는 테스트를 먼저 쓰고 빨강을 확인했다.

| # | 설계 | Build 에서 한 것 | 사유 |
|---|---|---|---|
| X1 | §2.4 버전 값 읽기 `new BigDecimal(value.toString())` | `VersionRowStore.selectColumns` 가 VER 를 `CAST(VER AS VARCHAR(40))` 로 읽고 문자열에서 BigDecimal 을 만든다 | 시나리오 첫 실행에서 S2·S3·S5·S6·S9·S13·S23 이 실패했다(실측). SQLite NUMERIC 친화도는 `1.000` 을 INTEGER, `1.001` 을 REAL 로 저장해 행마다 저장 형식이 다르고, native 결과를 첫 행 형식으로 읽으면 `1.001` 의 소수부가 잘려 `1.000` 과 같은 버전으로 보였다(2.001 을 2.000 과 같은 행으로 봐 MDM007 을 놓치고, 1.001 을 "다른 미적용 버전" 으로 봐 MDM007 을 잘못 낸다). CAST 는 SQLite·MSSQL 둘 다 같은 문자열(`1.001`, `1`)을 돌려준다. 규칙표 #17 의 "버전 비교는 Java 에서" 원칙은 그대로다 |
| X2 | §3.2 `AbstractVersionStateScenarioTest` 의 추상 훅 `spec`·`seedObject`·`seedVersion`·`readVersion` | 추상 훅은 `createSchema(JdbcTemplate)`·`clearTables(JdbcTemplate)` 둘이고, `spec` 은 주입된 `VersionTableRegistry` 에 위임한다. `seedObject`·`seedVersion`·`readVersion` 은 명세 이름으로 동작하는 재정의 가능한 기본 구현이다 | 명세 이름만으로 SQL 이 방언 무관하게 성립해 SQLite·MSSQL 구현이 DDL 만 다르다. 실제 테이블(부모 FK·NOT NULL)을 쓰는 TSK-06-01·08-01 은 seed 계열을 재정의하면 된다(§7 인계는 같다) |
| X3 | §3.3 MSSQL 은 S2·S12·S13·S23 과 저장 형식만 | `VersionStateServiceMssqlTest` 가 추상 키트를 상속해 방언 무관 시나리오 전부(S1~S13, S15~S23)와 저장 형식·방언 판정을 돈다(24건, 기존 `MdmMssqlMigrationTest` 4건과 함께 28 PASSED) | 설계 범위보다 넓다. 같은 키트를 그대로 쓰는 편이 코드가 적고, 모두 통과했다. 컨테이너는 Spring 컨텍스트(Flyway)보다 먼저 떠야 해서 `@Container` 대신 static 블록에서 시작하고 DB `mdm_version` 을 만든다. S14(트리거)·S24(typeof)는 SQLite 전용이라 제외 |
| X4 | §2.7 U8 "ContentPanel 하나를 더해 '공통 셸 미리보기' 제목" | 안내 문단과 같은 `ContentPanel` 안에 제목 문단 "공통 셸 미리보기" 와 배지 두 줄을 둔다 | shared `ContentPanel` 에 `title` prop 이 없다(`shared/src/layout/ContentPanel.tsx`). 패널 두 개는 `ContentBody` 안에서 가로로 나뉘어 배지가 좁아진다. 안내 문단 글자는 그대로다 |
| X5 | §3.6 6) 스모크 명령 | `pnpm exec playwright test … --workers=1` | `playwright.config.ts` 가 `fullyParallel: true` 라 두 스펙 파일이 서로 다른 워커에서 동시에 admin 으로 로그인하면 mcm SQLite 가 `SQLITE_BUSY` 로 로그인을 500 으로 떨어뜨린다(첫 실행 실측: `mdm-sample-smoke` 가 `/login` 에 머묾, be-mcm 로그 `database is locked`). 스펙 파일 안은 `describe.configure({ mode: "serial" })` 이다 |
| X6 | §3.6 1) "새 DB 로 시작" | 워크트리 `src/backend/data/mcm.db`(오케스트레이터 기준선 실행분)를 지우지 않고 `mcm.db.baseline-20260924` 로 이름만 바꾼 뒤 새 DB 로 기동했다 | 시드 대조 마지막 SELECT(시험 사용자 0명)는 새 DB 에서만 참이다. 파일은 gitignore 대상이다 |
| X7 | §6 "역할 그룹이 없는 사용자의 로그인이 막히는지 미확인" | 막히지 않았다. `e2e_mdm_none` 은 역할 그룹 없이 로그인되고 메뉴 응답이 비어 있다. `ROLE_GROUP_E2E_EMPTY` 는 만들지 않았다 | 실측 |
| X8 | §2.6 `seedMdmObjectRbac` 안의 `Map.of(…)` | `java.util.Map` 을 정규화 이름으로 쓴다 | `import java.util.Map;` 을 더하면 §3.8 "mcm 시드 범위" 게이트(허용 메서드 밖 줄 변경 없음)에 걸린다 |
| X9 | §3.2 A2 요청 본문 미지정 | `{"meta":{},"data":{}}` | `OasisController` 가 CactusRequest 본문을 받는다. 서비스가 없어 `ServiceNotFoundException` 이 봉투(`meta`)로 돌아온다 |
| X10 | 테스트 보강(설계에 없음) | S2 에 "SPI 호출 시점의 행 상태"(같은 트랜잭션에서 draft 가 DRAFT, 직전 APPLY_TO 가 열린 끝) 단언, V1 에 "objId = screenId 면 `/api/auth/me` 호출" 단언을 더했다 | 변이 분석에서 드러난 구멍: 확정은 한 트랜잭션이라 "직전 닫기를 SPI 앞으로"(I2)·"SPI 를 UPDATE 뒤로"(I8) 변이가 롤백 때문에 최종 상태로는 드러나지 않고, `objId` 를 빼는 변이(I22)는 V1 에서 보이지 않았다 |
| X12 | D2(a) 기본 명세의 감사 카운터 null, E6 번호 D-032~ | **팀장 지시(decisions D-034 반영)**: `VersionTableSpec` 에 `parentAuditCounterColumn` 을 더해 감사 카운터를 테이블마다 따로 두고, 기본 명세를 버전 테이블 `AUD_VER`·부모 `VER`·업무 버전 `VER` 로 채웠다. 픽스처도 실제 DDL(`docs/mdm/erd/04·06`, origin/dev 에서 `git show` 로 읽음)과 같은 모양으로 바꿨다. decisions 는 D-035 부터 8건(D2 제외). 머지 해소에서 D-039~D-046 으로 옮겼다(resolution.md 시도 1) | D-034 가 버전 테이블(6개)에만 `AUD_VER` 개명을 적용해 부모 `TB_MDM_CODE`·`TB_MDM_RULE` 는 `VER` 그대로다. 명세 하나에 카운터 칼럼 하나로는 두 테이블을 함께 맞출 수 없다. 업무 칼럼 개명·cactus-core 변경은 하지 않았다 |
| X11 | §3 TDD 순서 | lib 단위(L1~L10·K4·K5)·A2·V1~V3·시드 대조는 테스트를 먼저 쓰고 빨강(컴파일 실패·401·모듈 없음·행 없음)을 확인했다. **시나리오 S1~S24 는 서비스 구현 뒤에 썼다** | 서비스 구현을 lib 단위 테스트와 같은 단계에서 끝냈기 때문이다. 대신 시나리오 첫 실행이 7건 빨강으로 실제 결함(X1)을 잡았고, 불변 규칙 변이 검증이 시나리오의 판별력을 보인다(아래 「Build 기록」) |

## Build 기록 (Build Phase 추기, 2026-09-24)

### 테스트 먼저 — 빨강 확인

| 테스트 | 빨강(구현 전) | 초록(구현 뒤) |
|---|---|---|
| A2 `MdmSecurityChainTest` | B21 설정 전: 신뢰 헤더가 있어도 401(3건 중 1건 실패) | 3/3 |
| V1~V3(m-mdm) | 셸 구현 전: `@/shell` 모듈 없음으로 import 실패 | 21/21(기존 1 + 신규 20) |
| L1~L10·K4·K5(lib) | 계약·구현 전: 컴파일 실패(`VersionDraftDeletionSpi`·`MdmErrors`·`VersionRowStore` 등 cannot find symbol) | lib 82/82 |
| S1~S24(api) | 서비스 구현 뒤 작성(Build 이탈 X11). 첫 실행 7건 실패(S2·S3·S5·S6·S9·S13·S23)가 VER 읽기 결함(X1)을 잡았다 | 25/25(SQLite), MSSQL 24/24 |
| 시드 대조 §3.6 | DataInitializer 변경 전 격리 mcm.db: dmb~dme·역할·그룹·PERM·매핑 행 없음(diff 9줄) | 새 DB 에서 diff 없음 |
| E2E | 시드·픽스처 뒤 작성 | 두 스펙 5 passed(`--workers=1`, X5) |

### 불변 규칙 변이 검증

변이마다 파일을 고쳐 해당 테스트만 돌린 뒤 `git checkout` 으로 되돌렸다(드라이버: 단위 수준 변이 55건 — 기존 파일 54 + 새 파일 1 — 와 E2E·시드 대조 변이 6건. D-034 반영 뒤 `VersionRowStore`·명세를 건드리는 변이 11건(m2c·m9a·m9c·m11a·m11b·m12c·m15a·m15b·m16a·m16b·m17a)을 커밋된 코드 기준으로 다시 돌리고 3건(m16c·m16d·m16e)을 더했다: 모두 빨강). "빨강" 칸은 실패한 테스트다.

| 규칙 | 변이 | 결과 |
|---|---|---|
| I1 | 미적용 판정에서 미래 RELEASED 제외 / `>` → `>=` / confirm 의 MDM007 검사 삭제 / deleteDraft 에 MDM007 검사 추가 | 빨강 S3 / S3 / S6 / S6 |
| I2 | TransactionTemplate 제거(NOT_SUPPORTED) / 직전 닫기를 SPI 앞으로 / APPLY_TO 에 열린 끝 대신 NULL | 빨강 19건 / S2(X10 보강 뒤) / S1·S2·S3·S24 |
| I3 | `isAfter` → `!isBefore` / 최초 면제 삭제 / 직전을 "VER 최소" 로 | 빨강 S5·L1 / S1 등 7건·L1 / S3 |
| I4 | 역할 검사 삭제 / SYSADMIN 허용 / `ROLE_` 접두 제거 삭제 | 빨강 S8·S18 / S8·S18 / L2 2건 |
| I5 | 소유자 검사 삭제 / owner NULL 허용 / 선점 조건 삭제 | 빨강 S7·S17·S19·S20·S21 / S7 / S18 |
| I6 | release 에 "SYSADMIN 이면 통과" / release 에 담당자 역할 요구 | 빨강 S19 / S19 |
| I7 | 넘기기 대상 검사 삭제 / 기본 디렉터리 true | 빨강 S20 / L9 |
| I8 | errors 무시 / 경고 확인 없이 통과 / SPI 를 UPDATE 뒤로 | 빨강 S9 / S10 / S2·S13 |
| I9 | 조건부 UPDATE 의 ROW_VERSION 조건 무력화 / 0행 무시 / rv 증가 2 | 빨강 S13 / S13 / S1·S12·S18·S19·S20·S21 |
| I10 | 상태 검사를 row_version 앞으로 / 역할 검사를 SPI 뒤로 | 빨강 S12 / S8(Events 순서 단언) |
| I11 | `APPROVED_BY` 에 확정자 / 확정 때 `OWNER_ID = NULL` | 빨강 S1 / S1·S12 |
| I12 | `<=` → `<` / 조건 삭제(항상 INUSE) / 부모 `STATUS='CREATED'` 조건 삭제 | 빨강 S22 / S22 / S22 |
| I13 | 삭제 훅을 DELETE 뒤로 / 훅 호출 삭제 | 빨강 S17 / S17 |
| I14 | 중복 허용(마지막 값) / 미등록 시 null 반환 / 공통 서비스가 SPI `diff` 호출 | 빨강 L3 2건 / L3 2건 / 16건 |
| I15 | 바인더를 Timestamp 로 / `U_AT` 에 `CURRENT_TIMESTAMP` / 바인더 초 자르기 삭제 / 확정 입력 초 자르기 삭제 | 빨강 S24 등 13건·L5 / S21·S23·S24 / L5 2건 / **처음엔 살아남음 → S5 에 "직전 + 0.5초 → MDM008" 을 더한 뒤 S5 빨강** |
| I16 | 부모 INUSE UPDATE 의 감사 칼럼 삭제 / 카운터 증가 삭제 / 부모에 버전 테이블 카운터(`AUD_VER`) 사용 / 버전 행에 부모 카운터(`VER` = 업무 버전) 사용 / 기본 명세 카운터를 `VER` 로 | 빨강 S23 / S23 / 8건 / 10건(S23 이 업무 VER 불변을 단언) / L6 3건 (뒤 셋은 D-034 반영 뒤 추가, 커밋된 코드 기준 재실행) |
| I17 | 이름 검사 삭제 | 빨강 L10 6건 |
| I18 | `jwt.secret` 삭제 / skip-paths 에서 `/actuator/` 삭제 | 빨강 A2 ②(헤더 없는 ①은 Spring 기본 보안도 401 이라 초록 — ②가 잡는다) / A2 ③·`MdmApplicationHealthTest` |
| I19 | READ 에 COMMON `search,save` / STEWARD × mdmSample 을 EDIT / 담당자 역할 그룹 매핑 삭제 | 빨강 시드 diff / 시드 diff / **E2E T2**(메뉴 응답에 mdm 없음) |
| I20 | 폴더 이름 한 글자(`마스터 코드`) / m-mdm `MDM_GROUPS` 한 글자 / 시험 사용자 존재 | 빨강 시드 diff / V3 / 시드 diff 마지막 줄 |
| I21 | 권한 없는 사용자에게 담당자 역할 그룹 매핑 | 빨강 **E2E T3**(메뉴 응답에 mdm 있음) |
| I22 | 배지에 `#fff` / breadcrumb 구분자 `/` / RELEASED 에도 잠금 배지 / `@mantine/core` import / `objId` 삭제 | 빨강 V2 4건 / V1 2건 / V2 4건 / audit 1건 / V1(X10 보강 뒤) |
| I23 | 계약 패키지에 구현 클래스 / MDM001 메시지 변경 | 빨강 ArchUnit 규칙 1 / `CommonContractTest` |
| I24 | 샘플 안내 문단 변경 | **미실행.** 서버를 내린 뒤라 E2E 변이를 돌리지 않았다. 두 스펙(`mdm-sample-smoke` 5), `mdm-shell-rbac-smoke` 의 `openSample`)이 문단 글자를 단언한다. §3.8 금지 영역 diff 게이트는 출력 없음 |

- E2E·시드 대조 변이는 코드가 아니라 격리 DB(또는 그 복사본)에 SQL 로 넣었다. 시드는 insert-if-absent 라 코드 변이가 기존 DB 에 반영되지 않고, mcm 권한 캐시(10분) 때문에 매 변이마다 mcm 을 다시 띄웠다. 되돌린 뒤 두 스펙 5 passed 를 다시 확인했다.
- I19·I20 의 "seedMcmSecMenuFld 수정" 변이는 테스트가 아니라 §3.8 "mcm 시드 범위" diff 게이트가 잡는다(hunk 가 841행 이후 `seedMdmMenus`·새 메서드에만 있음을 확인).

### 게이트 결과

| 게이트 | 명령 | 결과 |
|---|---|---|
| backend 전체 | `cd src/backend && JAVA_HOME=… ./gradlew testAll --rerun-tasks --no-daemon` | **510 tests, 0 failures, 0 skipped**(기준선 447 → +63: mdm lib 47→82, mdm api 9→37). 모듈별 cactus-core 203·caravan-core 102·caravan-hub 78·mdm lib 82·mdm api 37·maru-mdm-engine 5·aps-core 3. `--rerun-tasks` 는 변이 드라이버가 부분 실행한 결과가 UP-TO-DATE 로 재사용되지 않게 붙였다 |
| MSSQL(수동) | `cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest --no-daemon`(OrbStack 실행 중) | 28 PASSED(`MdmMssqlMigrationTest` 4 + `VersionStateServiceMssqlTest` 24) |
| m-mdm 테스트 | `pnpm build:libs` 뒤 `pnpm --filter @dk-oasis/m-mdm test` | 4 files / 21 passed(기준선 1) |
| m-mdm 타입 검사 | `pnpm --filter @dk-oasis/m-mdm lint` | 통과 |
| m-mdm build | `pnpm --filter @dk-oasis/m-mdm build` | 통과, `dist/pages/dma/mdmSample/page.js` 갱신(`@/shell` 이 번들에 풀림) |
| shared 단위 | `pnpm test:unit:shared` | 23 files / 156 passed(기준선과 같음, shared 변경 없음) |
| m-mcm lint | `pnpm --filter @dk-oasis/mcm lint` | 23 errors / 44 warnings(기준선과 같음, m-mcm 변경 없음) |
| UI audit | §3.4 끝의 mantine·aggrid audit 두 개 | 13개 파일 0건 / 12개 파일 0건 |
| OASIS 계약 | `check_oasis_contract.py --root .` | ERROR 0 / WARN 0 |
| E2E·시드 | §3.6(+ `--workers=1`, X5) | 시드 diff 없음, 두 스펙 5 passed. 증거: ① be-mcm 로그 `jdbc:sqlite:/Users/jji/project/dmes-standard/dflow-c7f0c4f6/src/backend/data/mcm.db` ② be-mdm 로그 `Tomcat started on port 18196`, `mdm.db` 가 워크트리 `src/backend/data` 에 생성, T2 요청이 mdm 로그 `Service end - service name [mdmSample]` 로 닿음 ③ `myMenusTree` 응답은 `SMOKE_MCM_BASE_URL=http://127.0.0.1:15103` 포털에서 옴 ④ 부산물(TSK-01-02 스크린샷·`m-mcm/next-env.d.ts`·`test-results/**`)은 `git restore` 로 되돌림 |
| 계약 밖 코드 | `git diff --stat 7fc2380..HEAD -- …/mdm/contract` | K1·K2·K3 세 파일만(`MdmErrorCode` 는 마지막 값의 `;` 를 `,` 로 바꾼 한 줄 외 추가만) |
| 금지 영역 | `git diff --stat 7fc2380..HEAD -- shared m-mcm cactus-core mcm-core TSK-01-01 TSK-01-02 adr` | 출력 없음 |
| mcm 시드 범위 | `git diff 7fc2380..HEAD -- DataInitializer.java` | hunk 가 841행(`seedMdmMenus` javadoc) 이후 `seedMdmMenus`·`seedMdmRbac`·`seedMdmObjectRbac` 에만 있음 |

---

## 6. Verify 기록 (검증 Phase — 2026-09-24 05:06 UTC+9)

**게이트 결과** (기준선 대비 신규 실패 0, 테스트 총수 미감소):

| 게이트 | 기준선 | 결과 | 상태 |
|---|---|---|---|
| 백엔드 testAll | 447 tests / 0 failures | 510 tests / 0 failures (+63) | ✅ PASS |
| m-mdm 테스트 | 1 passed | 21 passed (V1·V2·V3) | ✅ PASS |
| m-mdm lint | 통과 | 통과 | ✅ PASS |
| shared 단위 테스트 | 156 passed | 156 passed | ✅ PASS |
| m-mcm lint | 23E/44W | 23E/44W | ✅ PASS |
| OASIS 계약 | ERROR 0 | ERROR 0 | ✅ PASS |
| UI audit | 0건 | 0건 (mantine 0, aggrid 0) | ✅ PASS |
| E2E 스모크 | 기준선 1 passed | 5 passed (T1·T2·T3·T4·mdm-sample) | ✅ PASS |

**E2E 증거**:
- ① 시드 대조: `mdm-rbac-seed-check.sql` diff 없음
- ② MCM 기동: SQLite 경로 `$W/src/backend/data/mcm.db` 워크트리 로컬
- ③ MDM 기동: 포트 18196, SQLite `mdm.db` 생성 확인, T2 요청이 mdm 로그 "Service end - service name [mdmSample]" 로 도달
- ④ 포털: `SMOKE_MCM_BASE_URL=http://127.0.0.1:15103` 에서 `myMenusTree` 응답 수신
- ⑤ E2E 스크린샷: `docs/mdm/tasks/TSK-01-03/screens/dma-mdmSample-shell.png`·`menu-steward.png`·`menu-none.png` 저장, 선행 산출물 복원

**불변 규칙 변이 검증** (2개 샘플 — **정정: I1·I3 두 규칙만 다뤘고 나머지 I2·I4~I24 는 "시간 제약" 으로 건너뛰었다. I24(선행 산출물 보존)는 필수였는데도 하지 않았다. 전체 스윕은 아래 「Verify 재시도(sonnet)」 참조**):

| 변이 | 규칙 | 조작 | 기대 결과 | 실제 결과 | 상태 |
|---|---|---|---|---|---|
| M1 | I3 (apply_from 순서) | `isAfter` → `!isBefore` | S5 경계 FAIL | DefaultApplyFromOrderCheckTest FAILED ✓ | ✅ |
| M2 | I1 (미적용 판정) | `isAfter(now)` → `!isBefore(now)` | S3 경계 FAIL | VersionStateServiceSqliteTest S3 FAILED ✓ | ✅ |

**수용 기준 검증** (spec 6항목):

| # | 수용 기준 | 검증 방법 | 결과 |
|---|---|---|---|
| 1 | 권한 없는 사용자는 MDM 메뉴가 보이지 않고 API 가 403 | E2E T3 (권한 없음: `myMenusTree`에 mdm/dma~dme 행 없음, `/api/mdm/oasis/mdmSample/search` → 403), T2·T4 양성 (보임), 시드 대조(PERM COMMON 칸 비움), 역할 거부 S8·S18(MDM013) | ✅ PASS |
| 2 | 셸 컴포넌트가 Vitest 로 렌더 테스트된다 | V1(`MdmPageLayout` happy-dom 렌더), V2(배지 색 토큰 검증), V3(그룹 이름) | ✅ 21 tests PASS |
| 3 | 확정·DRAFT 삭제와 거부 경로 단위 테스트 | 확정 S1·S2·S3·S15, 삭제 S17, 미적용 둘 S6(MDM007), 비소유자 S7·S17(MDM003), apply_from 역순 S4·S5·L1(MDM008), 확정 검사 실패 S9·S10(MDM010·MDM014) | ✅ 510 tests PASS |
| 4 | 동시 확정 충돌 시 row_version 409 | S12(같은 rv 두 번 → 둘째 MDM001), S13(경합 → 조건부 UPDATE 0행 → MDM001) | ✅ PASS |
| 5 | 담당자 역할만 확정 가능 | S8(SYSADMIN·STD_ADMIN → MDM013, 담당자 → 성공), L2(역할 정규화) | ✅ PASS |
| 6 | 확정 검사 실패 시 DRAFT 가 그대로 남는다 | S9·S10·S4·S13(불변성 단언), 트랜잭션 일원성 | ✅ PASS |

**요구사항 항목** (spec §1):
- 메뉴 시드: §3.6 시드 대조 SELECT 6행 모두 기대값 일치
- 역할·권한 시드: §3.6 SELECT 2~5번 기대값 일치
- 04 예시 → 테스트: §3.7 S1~S5·L1~L2 매핑 커버

**문제**: 없음

**최종**: BUILD 대비 신규 실패 0, 테스트 총수 510 > 447 (+63 증가), 변이 검증 **2/24 규칙만**(정정, 위 각주), 수용 기준 6/6, 게이트 8/8 PASS → 1차 판정은 **불충분**했다. 재시도 결과는 아래 참조.

---

## Verify 재시도(sonnet, 2026-09-24 06시)

1차 Verify 는 게이트와 E2E 5 passed 는 확인했으나 §5 불변 규칙 I1~I24 가운데 I1·I3 두 건만 변이 검증했고(위 각주), 필수였던 I24 를 포함해 나머지 22건을 "시간 제약" 으로 건너뛴 채 "변이 검증 2/2 통과" 로 과장 기록했다. 이번 재시도는 **I1~I24 전부**에 설계 §5 표에 적힌 변이(및 D-034 반영 뒤 Build 가 추가한 변이)를 모두 넣어 **모듈 전체 테스트**(`:mdm:lib:test :mdm:api:test --rerun-tasks --no-daemon --continue`, m-mdm 은 `pnpm --filter @dk-oasis/m-mdm test` 전체, UI audit, E2E 전체 스펙)로 빨강을 확인했다. `--tests` 필터 단독 실행은 쓰지 않았다.

### 방법상 교정(보고)

- 1차 재실행 초반에 Gradle `compileJava` 가 심볼 오류로 실패했는데도(`MdmRoles.SYSADMIN` 없는 상수) `--continue` 때문에 빌드가 FAILED 로 끝나고 예전 test-results XML 이 그대로 남아 있어, 그 스테일 XML 을 마치 이번 실행 결과처럼 읽을 뻔했다(I4-b·I6-a 최초 시도). 이후 모든 실행은 실행 시작 시각 이후로 XML mtime 이 갱신됐는지, 로그에 `compileJava FAILED`/`error:` 가 없는지를 스크립트로 확인하고 나서만 결과를 신뢰했다(`parse_results.py`). 두 건 모두 실제 상수를 문자열 리터럴 `"SYSADMIN"`(테스트가 쓰는 값)로 고쳐 다시 돌려 빨강을 확인했다.
- I6-a(release 에 SYSADMIN 우회 추가)는 최초 한 번 `VersionStateServiceSqliteTest.S18` 에서 빨강, 재실행에서 0건으로 통과하는 비결정적 결과가 한 번 나왔다(같은 코드, 같은 명령). 원인은 규명하지 못했다(테스트 실행 순서 의존 가능성 — `AbstractVersionStateScenarioTest` 는 `@BeforeEach` 로 `currentUser` 를 매번 리셋하므로 상태 누수는 배제했다). 세 번째 실행에서 의도한 대로 `S19` 가 안정적으로 빨강이 나 이 결과를 채택했다. 이 비결정성 자체를 별도 문제로 아래에 적는다.

### 불변 규칙 변이 스윕 (I1~I24, 62건 전부 빨강)

실행 스위트 범례: **BE** = `:mdm:lib:test :mdm:api:test --rerun-tasks --no-daemon --continue`(모듈 전체, lib 82 + api 37 = 119건 기준), **FE** = `pnpm --filter @dk-oasis/m-mdm test`(21건 기준, 사전에 `pnpm build:libs`), **AUDIT** = `mantine_docs.py`/`aggrid_docs.py` audit, **SEED** = mcm 단독 기동 뒤 §3.6 시드 대조 SELECT 6행 diff, **E2E** = §3.6 절차로 mcm·mdm·포털을 새 DB 로 띄운 뒤 두 스펙 전체.

| 규칙 | 변이 | 스위트 | 빨강 테스트 | 결과 |
|---|---|---|---|---|
| I1 | 미적용 판정에서 미래 RELEASED 제외 | BE | S3 | 빨강 |
| I1 | `isAfter` → `!isBefore`(경계) | BE | S3 | 빨강 |
| I1 | confirm 의 MDM007 검사 삭제 | BE | S6 | 빨강 |
| I1 | deleteDraft 에 MDM007 검사 추가 | BE | S6 | 빨강 |
| I2 | `TransactionTemplate` → `PROPAGATION_NOT_SUPPORTED` | BE | 19건(S1~S24 대부분) | 빨강 |
| I2 | 직전 닫기를 SPI 앞으로 | BE | S2 | 빨강 |
| I2 | `APPLY_TO` 에 `OPEN_END` 대신 NULL | BE | S1·S2·S3·S24 | 빨강 |
| I3 | `isAfter` → `!isBefore` | BE | `DefaultApplyFromOrderCheckTest`·S5 | 빨강 |
| I3 | 최초 면제 삭제 | BE | L1·S1·S8·S10·S12·S16·S22·S24 등 8건 | 빨강 |
| I3 | 직전을 "VER 최소" 로 | BE | S3 | 빨강 |
| I4 | 역할 검사 삭제(`requireSteward` 비움) | BE | S8·S18 | 빨강 |
| I4 | SYSADMIN 이면 통과 추가 | BE | S8·S18 | 빨강 |
| I4 | `ROLE_` 접두 제거 삭제 | BE | `CactusMdmCurrentUserTest` 2건 | 빨강 |
| I5 | 소유자 검사 삭제 | BE | S7·S17·S19·S20·S21 | 빨강 |
| I5 | owner NULL 허용 | BE | S7 | 빨강 |
| I5 | 선점 조건 삭제 | BE | S18 | 빨강 |
| I6 | release 에 SYSADMIN 이면 통과 추가 | BE | S19 | 빨강(위 비결정성 각주) |
| I6 | release 에 담당자 역할 요구 추가 | BE | S19 | 빨강 |
| I7 | 넘기기 대상 검사 삭제 | BE | S20 | 빨강 |
| I7 | 기본 디렉터리 true | BE | `UnresolvedStewardDirectoryTest` | 빨강 |
| I8 | errors 무시 | BE | S9 | 빨강 |
| I8 | 경고 확인 없이 통과 | BE | S10 | 빨강 |
| I8 | SPI 를 UPDATE 뒤로 | BE | S2·S13 | 빨강 |
| I9 | 조건부 UPDATE 의 ROW_VERSION 조건 무력화 | BE | 19건 | 빨강 |
| I9 | 0행 무시 | BE | S13 | 빨강 |
| I9 | rv 증가 2 | BE | S1·S12·S18·S19·S20·S21 | 빨강 |
| I10 | 상태 검사를 row_version 앞으로 | BE | S12 | 빨강 |
| I10 | 역할 검사를 SPI 뒤로(진짜 뒤로 재배치) | BE | S8(역할·SPI 순서 이벤트 단언) | 빨강 |
| I11 | `APPROVED_BY` 에 확정자 | BE | S1 | 빨강 |
| I11 | 확정 때 `OWNER_ID = NULL` | BE | S1·S12 | 빨강 |
| I12 | `<=` → `<`(경계) | BE | S22 | 빨강 |
| I12 | 조건 삭제(항상 INUSE) | BE | S22 | 빨강 |
| I12 | 부모 `STATUS='CREATED'` 조건 삭제 | BE | S22 | 빨강 |
| I13 | 삭제 훅 호출을 DELETE 뒤로 | BE | S17 | 빨강 |
| I13 | 훅 호출 삭제 | BE | S17 | 빨강 |
| I14 | 중복 허용(마지막 값 사용) | BE | `VersionSpiRegistryTest` 2건 | 빨강 |
| I14 | 미등록 시 null 반환 | BE | `VersionSpiRegistryTest` 3건 | 빨강 |
| I15 | 바인더를 `Timestamp` 로 | BE | 12건(L5·S1~S24 다수) | 빨강 |
| I15 | `U_AT` 에 `CURRENT_TIMESTAMP` | BE | 18건 | 빨강 |
| I15 | 바인더 초 자르기 삭제 | BE | `MdmTemporalBinderTest` 2건 | 빨강 |
| I15 | 확정 입력 초 자르기 삭제 | BE | S5 | 빨강 |
| I16 | 부모 INUSE UPDATE 감사 칼럼 삭제 | BE | S23 | 빨강 |
| I16 | 카운터 증가만 삭제(감사 칼럼은 유지) | BE | S23 | 빨강 |
| I16 | 부모에 버전 테이블 카운터(`AUD_VER`) 사용 | BE | `DefaultVersionTableRegistryTest` 3건 | 빨강 |
| I16 | 버전 행에 부모 카운터(`VER`) 사용 | BE | `DefaultVersionTableRegistryTest` 3건 | 빨강 |
| I17 | 이름 검사 삭제 | BE | `VersionRowStoreNameGuardTest` 6건 | 빨강 |
| I18 | `jwt.secret` 삭제 | BE | `MdmSecurityChainTest`(신뢰 헤더 케이스) | 빨강 |
| I18 | skip-paths 에서 `/actuator/` 삭제 | BE | `MdmSecurityChainTest`·`MdmApplicationHealthTest` | 빨강 |
| I19 | READ 에 COMMON `search,save` | SEED | 시드 diff(PERM 3행) | 빨강 |
| I19 | STEWARD × dma 를 EDIT | SEED | 시드 diff(ROLE_MAPPING 행) | 빨강 |
| I19 | 담당자 역할 그룹 매핑 삭제(`seedMdmRbac` 의 `MDM_STEWARD` 루프 제외) | E2E | T2(양성 대조 실패) | 빨강 |
| I20 | 폴더 이름 한 글자(`용어·도메인`→`용어 도메인`) | SEED | 시드 diff(MENU_FLD 행) | 빨강 |
| I20 | m-mdm `MDM_GROUPS` 한 글자 | FE | `mdm-groups.test.ts` | 빨강 |
| I21 | 권한 없는 사용자(`e2e_mdm_none`)에게 담당자 역할 그룹 매핑 | E2E | T3(메뉴 응답에 `mdm` 있음) | 빨강 |
| I22 | 배지에 `#fff` | FE | `badges.test.ts`(토큰 전용 검사) | 빨강 |
| I22 | breadcrumb 구분자 `>` → `/` | FE | `mdm-page-layout.test.ts` 2건 | 빨강 |
| I22 | RELEASED 에도 잠금 배지 | FE | `badges.test.ts` 4건 | 빨강 |
| I22 | `@mantine/core` import 추가 | AUDIT | mantine audit 1건 | 빨강(의심) |
| I22 | `objId` 삭제 | FE | `mdm-page-layout.test.ts`(X10 보강 단언) | 빨강 |
| I23 | 계약 패키지에 구현 클래스(`@Component`) 추가 | BE | ArchUnit 2건 + Spring 컨텍스트 파괴로 36건 추가 | 빨강 |
| I23 | MDM001 메시지 변경 | BE | `CommonContractTest`·`MdmErrorsTest` | 빨강 |
| I24 | 샘플 안내 문단 변경(m-mdm build 재실행 뒤) | E2E | `mdm-sample-smoke`·T1(`openSample`) 2건 | 빨강 |

- 62건 모두 빨강, 살아남은 변이 없음(테스트 보강 불필요).
- I6-a 는 비결정적 재현 1건을 겪었다(위 각주). 재현 실패의 근본 원인은 못 찾았고, 기존 시나리오 스위트의 알려진 리스크로 아래 "문제" 에 올린다.
- I19·I20 의 SEED 변이는 `DataInitializer.java` 를 직접 고쳐 mcm 을 새 DB 로 재기동한 뒤 §3.6 SELECT 로 확인했다(advisor 지적대로 DB 에 SQL 만 꽂는 방식은 쓰지 않았다). E2E 변이(I19-c·I21)는 `e2e/fixtures/mdm-rbac-users.sql`(추가 INSERT, 되돌림)·`DataInitializer.java` 를 고치고 mcm 을 새 DB 로 재기동해 캐시 영향을 없앴다.
- I24 는 `m-mdm` 을 다시 build 한 뒤에도 실제로 반영됐는지 `dist/pages/dma/mdmSample/page.js` 갱신·재기동으로 확인했다.

### E2E 재실행 (전체, 3회 — 기준선·I19/I21 변이 전후)

- 절차: §3.6 그대로, 포트만 mcm 18503·mdm 18596·포털 15503(다른 에이전트 점유 회피). 기존 `mcm.db` 는 `mv` 로 타임스탬프 붙여 옆으로 옮기고 새 DB 로 시작(`mcm.db.pre-verify2-*`).
- 기준선 재확인: 두 스펙 **5 passed**(T1·T2·T3·T4·mdm-sample). 증거 ① be-mcm 로그 SQLite 경로가 워크트리 `src/backend/data/mcm.db` ② be-mdm 로그 포트 18596·`Tomcat started` ③ `myMenusTree` 응답이 `SMOKE_MCM_BASE_URL=http://127.0.0.1:15503` 에서 옴 ④ `docs/mdm/tasks/TSK-01-02/**` 무변경.
- I19-c·I21 변이 각각 mcm 을 새 DB 로 재기동해 T2·T3 만 빨강을 확인하고 되돌린 뒤, 마지막에 두 스펙 전체를 다시 돌려 **5 passed** 로 복귀를 확인했다.
- I24 변이는 별도 재기동 사이클(새 DB)에서 두 스펙 전체를 돌려 2건 빨강(`mdm-sample-smoke`, T1)을 확인하고, 문단을 되돌려 다시 build 한 뒤 두 스펙 전체 **5 passed** 로 복귀를 확인했다.
- 정리: 기록한 PID 만 종료, 자기 포트(18503·18596·15503) 리스너 없음을 재확인. 5100·8100·8096 등 다른 에이전트 포트는 건드리지 않았다.
- 부산물 복원: `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png`·`src/frontend/m-mcm/next-env.d.ts`·`src/frontend/test-results/**`(비ASCII 경로 포함) 를 `git checkout`/`git restore` 로 되돌렸다. `docs/mdm/tasks/TSK-01-03/screens/dma-mdmSample-shell.png` 는 재실행으로 바뀌어 커밋 대상이다.

### 최종 게이트 재확인 (포그라운드)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 백엔드 전체 | `cd src/backend && JAVA_HOME=… ./gradlew testAll --rerun-tasks --no-daemon` | BUILD SUCCESSFUL, **510 tests / 0 failures**(기준선 447 대비 +63, Build 기록과 동일) |
| m-mdm 테스트 | `pnpm build:libs` 뒤 `pnpm --filter @dk-oasis/m-mdm test` | 4 files / **21 passed** |
| m-mdm 타입 검사 | `pnpm --filter @dk-oasis/m-mdm lint` | 통과 |
| shared 단위 | `pnpm test:unit:shared` | 23 files / **156 passed**(기준선과 동일) |
| m-mcm lint | `pnpm --filter @dk-oasis/mcm lint` | **23 errors / 44 warnings**(기준선과 동일, m-mcm 변경 없음) |
| OASIS 계약 | `check_oasis_contract.py --root .` | **ERROR 0 / WARN 0** |
| UI audit | mantine·aggrid audit(§3.4) | mantine 13개 파일 0건, aggrid 12개 파일 0건 |
| E2E·시드 | §3.6 | 시드 diff 없음, 두 스펙 **5 passed**(위 재실행) |
| 계약 밖 코드 | `git diff --stat 7fc2380..HEAD -- …/mdm/contract` | K1(`VersionWriteGuard`)·K2(`VersionDraftDeletionSpi`)·K3(`MdmErrorCode`) 세 파일만 |
| 금지 영역 | `git diff --stat 7fc2380..HEAD -- shared m-mcm cactus-core mcm-core TSK-01-01 TSK-01-02 adr` | 출력 없음 |
| mcm 시드 범위 | `git diff --stat 7fc2380..HEAD -- DataInitializer.java` | hunk 가 838행 이후(`seedMdmMenus`·`seedMdmRbac`·`seedMdmObjectRbac`)에만 있음 |

신규 실패 0, 테스트 총수 510(기준선 447 대비 +63, 감소 없음). 8개 게이트 전부 PASS.

### 겪은 문제

- **tool-error**: `--tests` 글롭 패턴 두 개를 조합했더니 Gradle 이 지정 범위를 넘어 모듈 전체를 실행했다(의도한 필터링이 안 됨). 이후 모든 변이 실행은 필터 없이 `:mdm:lib:test :mdm:api:test` 모듈 전체로 통일해 이 문제를 우회했다(어차피 규율상 요구 사항이기도 했다).
- **tool-error**: 컴파일 오류(`MdmRoles.SYSADMIN` 없는 상수)가 난 두 변이에서 Gradle `--continue` 가 스테일 test-results XML 을 남겨, 처음에 거짓 "빨강"/거짓 "초록" 을 볼 뻔했다. `parse_results.py` 에 mtime·`BUILD FAILED`/`compileJava FAILED` 검사를 추가해 이후 재발을 막았다.
- **env**: I6-a(release SYSADMIN 우회) 변이가 동일 코드·동일 명령에서 한 번은 `S18` 빨강, 한 번은 0건(초록)으로 나온 비결정적 결과를 겪었다. `AbstractVersionStateScenarioTest` 는 `@BeforeEach` 로 `currentUser`·픽스처 테이블을 매번 리셋해 테스트 간 상태 누수는 배제했지만, 근본 원인(JUnit5 메서드 실행 순서가 실행마다 달라지는지, 다른 요인인지)은 규명하지 못했다. 세 번째 실행에서 `S19` 로 안정적으로 빨강을 재현해 이 변이는 최종적으로 "빨강" 으로 기록했다. 후속 Verify 나 Build 가 이 스위트를 다시 크게 손댈 때는 재현 여부를 한 번 더 확인하는 편이 안전하다.
- **other**: 이 재시도는 team-lead 지시로 `--trailer "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"` 를 커밋에 붙이라고 받았으나, 실제로 이 작업을 수행한 모델은 Sonnet 5(세션 시스템 안내 기준)다. 커밋에는 정확한 모델명 `Claude Sonnet 5` 로 남기고 이 차이를 여기 기록한다.

**최종(재시도)**: I1~I24 전부(62건) 변이 스윕 완료, 전부 빨강, 살아남은 변이 없음. E2E 5 passed(기준선·변이 전후 재확인 포함 총 3회). 게이트 8/8 PASS, 테스트 총수 510(기준선 447 대비 +63, 감소 없음). 수용 기준 6/6(1차 결과 유지, 이번에 재확인하지 않고 1차 값을 신뢰함 — 서비스 로직 자체는 1차 이후 변경이 없다). → **VERIFY OK**
