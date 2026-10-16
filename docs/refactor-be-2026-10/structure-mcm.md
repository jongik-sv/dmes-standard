# BE 리팩토링 2회차 — mcm 레인 구조 변경 기록

레인 mcm(브랜치 `refactor-be/mcm`, 세션 rbe-mcm-71)의 구조 변경을 적는다. 대상 모듈은 mcm-core·mcm 이고, F2 에 한해 cactus-core, F5 에 한해 analog 를 고쳤다. 형식은 1회차 [README §6.1](../refactor-2026-10/README.md#61-구조-변경-기록) 을 따르고, 항목 ID 는 [README.md](./README.md) 의 표를 따른다.

- 시험만 더한 커밋은 S 항목으로 만들지 않고, 해당 S 항목의 「동작 보존 근거」에 넣었다.
- 구조 변경이 아닌 결함 수정(F5·F6)은 「구조 변경이 아닌 fix」 절에 적는다. F6 은 배포 전 점검이 필요하다(「배포 전 점검 SQL」 절).
- 이 문서의 커밋 해시는 합치기 전 레인 브랜치의 커밋이다. dev 에는 레인 커밋을 합친 커밋 1개로 들어간다(2026-10-16 머지 규칙). 그 커밋 본문에 원래 해시·종류(특성 시험·refactor·fix)·제목 목록이 있다. 「되돌리는 방법」 의 revert 는 원래 커밋 객체가 남아 있을 때 `git revert <원래 해시>` 로 하고, 없으면 합친 커밋에서 해당 파일의 변경을 되돌린다.
- 경로의 `mcm-core/…/mcm/` 는 `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/` 를, `cactus-core/…/cactus/` 는 `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/` 를 줄인 것이다.

## 이번 문서에 든 항목

| 번호 | 항목 | 제목 | 커밋 |
|---|---|---|---|
| S1 | F2 | 응답 변환기에 업무 예외 변환 확장점을 두고, mcm 이 mcm-core 예외 변환기를 등록 | dd681603b(시험), 6e84dc27e, e16a23795 |
| S2 | D3 | `McmSecurityDefaults` 의 대상 없는 matcher 정리 | 5be738a40(시험), 619f638fb, 69c2f9ce2, 6241fb90b |
| S3 | F7 | `SecUserService` 의 죽은 사용자 관리 경로를 archive 로 | 7e386ac16, 6241fb90b(S2 와 같은 커밋) |
| fix | F5 | analog `ClientKeyFilter` 상수 시간 비교 | c352a1dbf(시험), e6ebc0e2a |
| fix | F6 | `QueryStatementGuard` 의 nq'·단독 CR·따옴표 식별자 우회 차단과 q 리터럴 오탐 제거 | 6d1b492af(시험), 2089e55fe, 2976112fb(시험), 7a230b459 |
| 보류 | D2 | mcm-core `Mom*` 엔티티 등 보관 | X1 설계 뒤로 미룸 |
| 새 항목 | F8 | 권한 마스터 저장에 SYSADMIN URL gate 없음 | 결정 필요, 이 레인에서 고치지 않음 |

## 기준선 (2026-10-16, 태그 `refactor-be-2026-10-base` = 40fa5061a)

| 대상 | 명령 (`src/backend` 에서) | 결과 |
|---|---|---|
| mcm-core | `node ../../.claude/skills/dflow-dev/scripts/heavy.mjs --oracle -- ./gradlew :mcm-core:test :mcm:lib:test :mcm:api:test -Pdmes.ora.test=clone --continue` | 1557건, 실패 0. 레인 특성 시험을 더해 잰 값은 1585건, 실패 0, 건너뜀 3 |
| mcm:lib | 위와 같은 명령 | 16건, 실패 0 |
| mcm:api | 위와 같은 명령 | 169건, 실패 0. 레인 특성 시험을 더해 잰 값은 174건, 실패 0, 건너뜀 1 |
| cactus-core | `./gradlew :cactus-core:test` (Oracle 없음) | 974건, 실패 0, 건너뜀 19 |
| analog core·api | `./gradlew :analog:core:test :analog:api:test` (Oracle 없음) | core 192건·api 184건, 실패 0 |

원래 실패하던 시험은 없다. 머지 직전 시험 결과는 머지 요청에 적는다.

## S1. F2 — 응답 변환기에 업무 예외 변환 확장점을 두고, mcm 이 mcm-core 예외 변환기를 등록

- 커밋: dd681603b(특성 시험), 6e84dc27e(확장점, refactor), e16a23795(mcm 변환기 등록, fix)
- 바뀌기 전:
  - mcm-core 는 cactus 에 기대지 않으므로(McmCoreArchitectureTest) `mcm-core/…/mcm/common/exception/` 에 `BusinessException`·`ErrorCode`·`ErrorDetail` 사본을 따로 갖는다.
  - `cactus-core/…/cactus/oasis/CactusResponseConverter` 는 cactus `BusinessException` 과 `ResponseCodeAware` 만 알아본다. 그래서 mcm-core 화면 서비스가 BPMN 안에서 업무 예외를 던지면 `meta.code` 가 시스템 오류 `S001` 로 나가고 행 오류 `errors[]` 가 빠졌다.
  - BPMN 밖에서 잡힌 경우에는 `OasisServiceExecutor` 가 `S999` 와 ERROR 로그를 냈다.
  - findings F2 는 이 동작을 「실행 미확인」 으로 두었다. dd681603b 의 특성 시험이 운영과 같은 조립으로 실행해 확인했다.
- 바뀐 뒤:

  ```mermaid
  flowchart LR
    SVC["mcm-core 화면 서비스"] -- "mcm-core BusinessException" --> CONV["CactusResponseConverter<br/>원인 사슬을 바깥부터 걷는다"]
    CONV -- "원소가 cactus 형" --> R1["cactus 코드·errors[]"]
    CONV -- "그 밖의 원소" --> TR["BusinessErrorTranslator 빈 목록<br/>(cactus-core 확장점)"]
    TR -- "McmBusinessErrorTranslator<br/>(mcm/lib)" --> R2["meta.code = ErrorCode 코드<br/>errors[] = 행 상세"]
  ```

  - `cactus-core/…/cactus/common/BusinessErrorTranslator`(신규 `@FunctionalInterface`): 예외 원소 하나를 `Translated(code, errors)` 로 바꾸고, 자기가 소유하지 않은 예외에는 null 을 돌려준다. 원인 사슬은 응답 변환기가 걷는다. 우선순위 규칙(`ResponseCodeAware` 우선, 코드 걷기만 트랜잭션 예외에서 멈춤, `RuntimeException` 만 삼키고 `Error` 는 전파)은 Javadoc 에 있다.
  - `CactusResponseConverter`: 변환기 목록을 받는 생성자를 더했고 인자 없는 생성자는 그대로 두었다. 사슬 걷기를 도우미 하나로 모았다(깊이 16, 자기 원인에서 멈춤, 트랜잭션 예외 경계는 예전과 같다). 원소마다 cactus 형을 먼저 보고 그다음 변환기에 묻는다. 변환기가 던진 `RuntimeException` 은 WARN 으로 남기고 결과 없음으로 본다.
  - `OasisServiceExecutor`: BPMN 밖 catch 도 같은 판정을 쓴다. 변환기가 알아보면 업무 예외로 응답하고 WARN 으로 남기며, 못 알아보면 예전과 같다(ERROR, `S999`).
  - `OasisAutoConfiguration`: `BusinessErrorTranslator` 빈을 순서대로 응답 변환기에 넘긴다.
  - `src/backend/mcm/lib/…/mcm/adapter/McmBusinessErrorTranslator`(신규 `@Component`): mcm-core `BusinessException` 을 `ErrorCode` 코드 문자열과, 같은 칸을 가진 cactus `ErrorDetail` 목록으로 옮긴다.
- 바꾼 이유: cactus-core(프레임워크)는 업무 모듈을 import 하지 않고, mcm-core 는 cactus 에 기대지 않는다. 그래서 두 형을 모두 보는 호스트(mcm/lib)가 변환기를 등록하는 확장점을 두었다. 이제 `ErrorDetail.ofGrid` 를 쓰는 서비스 8곳의 행 오류가 화면에 전달되고, 코드는 실제 `ErrorCode` 값으로 나간다.
- 동작 보존 근거:
  - dd681603b `McmBusinessErrorOasisResponseTest` 5건이 현재 동작을 고정했다. 대상은 mcm-core 업무 예외(행 상세 포함·미포함·감싼 예외), 운영 BPMN `masterCategoryMng/save` 필수값 오류, 대조군 cactus 업무 예외다. 시험 BPMN 은 `mcm/api/src/test/resources/services/test/mcmBusinessErrorProbe.bpmn` 이다.
  - 6e84dc27e 는 등록된 변환기가 없으면 응답 JSON 이 예전과 같다. cactus-core 시험 1019건이 통과했고(기존 974건 그대로, 신규 45건 = `CactusResponseConverterTranslatorTest`·`OasisAutoConfigurationTranslatorTest`·`OasisServiceExecutorTranslatorTest`), 위 특성 시험 5건도 기대를 바꾸지 않고 통과했다.
  - e16a23795 는 특성 시험의 기대를 뒤집었다. 사례 2 의 `E003` 은 변환기가 `ErrorCode` 를 실제로 읽는다는 근거다. `McmBusinessErrorTranslatorTest` 6건이 통과한다.
- 동작 변경(e16a23795, mcm 앱만):
  - mcm-core 화면 서비스가 BPMN 안에서 업무 예외를 던지면 `meta.code` 가 `S001` 대신 그 `ErrorCode` 코드(`E001`·`E002`·`E003`·`E010`·`A004` 등)로 나가고, 행 오류가 `errors[]` 로 실린다.
  - BPMN 밖에서 잡힌 경우는 `S999`·ERROR 로그 대신 그 코드와 WARN 로그다. 로그 기반 알림이 있으면 확인해야 한다.
  - FE 확인: shared·m-mcm 에 `A008`·`A009`·`A010`·`S001` 로 갈라지는 코드는 없다. BFF 는 `meta.success` 만 보고, OASIS 응답은 코드와 무관하게 HTTP 200 이라 401 재로그인을 타지 않는다. shared `oasis-call.ts` 가 `errors[]` 를 거절 문구에 줄로 붙이므로, 해당 화면의 오류 문구에 행 오류 줄이 늘고 `OasisCallError.code` 가 `Exxx`·`Axxx` 로 바뀐다.
  - `src/backend/cactus-core/CHANGELOG.md` 에 Added 항목과 동작 변경(호스트 확인 필요) 항목을 적었다.
- 영향 범위:
  - cactus-core 를 쓰는 다른 앱은 `BusinessErrorTranslator` 빈을 등록하지 않으면 응답이 그대로다.
  - 변환기 빈은 mcm/lib 에만 있다. mcm/lib 를 쓰는 앱은 mcm 하나다(`src/backend/settings.gradle` 의 `dmesIncludeBuild('mcm', …)` 밖에 `com.dongkuk.dmes:mcm` 의존이 없음을 확인했다).
  - `CactusResponseConverter` 를 직접 만드는 시험(`UserQueryBpmnTest` 등)은 인자 없는 생성자를 그대로 쓴다.
- 되돌리는 방법: e16a23795 만 revert 하면 변환기 빈이 없어져 예전 응답(`S001`, `errors[]` 없음)으로 돌아간다. 6e84dc27e 는 변환기가 없으면 응답이 같기 때문이다. 이때 특성 시험의 기대도 예전 값으로 돌아간다. 확장점까지 없애려면 이어서 6e84dc27e 를 revert 한다.

## S2. D3 — `McmSecurityDefaults` 의 대상 없는 matcher 정리

- 커밋: 5be738a40(특성 시험), 619f638fb(목록 상수화, refactor), 69c2f9ce2(BPMN 없는 matcher 11개 제거, fix), 6241fb90b(F7 뒤 `secUser/save`·`resetPassword` 제거, fix)
- 바뀌기 전: `mcm-core/…/mcm/config/McmSecurityDefaults.applyTo` 가 `requestMatchers` 를 13번 불렀다. 각 action 은 OASIS 접두 3개마다 경로가 된다.
  - SYSADMIN 전용(action 12개): `secUser/save`·`secUser/resetPassword`, `secRole/save`, `secPerm/save`, `secObj/save`, `secMenu/save`, `secRolePerm/save`, `secUserRole/save`, `secRoleGroup/save`·`assignRoles`·`assignUsers`, `secCode/save`
  - 로그인 전용: `secUser/myMenus`·`myMenusTree`·`myPermissions`, `secFavorite/**`, `secStartPgm/**`, `secMenu/recordAccess`
- 바뀐 뒤: SYSADMIN 전용 matcher 는 남지 않았다. 로그인 전용 action 은 상수 `AUTHENTICATED_ACTIONS`(`secUser/myMenus`·`myMenusTree`·`myPermissions`, `secFavorite/**`, `secStartPgm/**`)에 모아 `requestMatchers` 한 번으로 등록한다.
- 바꾼 이유: 지운 action 의 process id(`secRole`·`secPerm`·`secObj`·`secMenu`·`secRolePerm`·`secUserRole`·`secRoleGroup`·`secCode`)는 모든 모듈의 `services/**` 에 BPMN 이 없고, 이 경로를 받는 다른 핸들러나 BFF 재작성도 없다. `secUser/save`·`resetPassword` 는 S3(F7)에서 BPMN 분기를 archive 로 옮겨 대상이 없어졌다. 대상 없는 gate 가 남아 있으면 권한 마스터 변경이 SYSADMIN 으로 막혀 있다고 오해하게 된다. 실제 권한 마스터 서비스(`csa/comm*Mng`)에는 gate 가 없다(F8).
- 동작 보존 근거: 5be738a40 `McmSecurityDefaultsTest` 가 사이트 SecurityConfig 와 같은 최소 필터 체인(`applyTo` + `anyRequest().authenticated()`)에서 OASIS 접두 3개마다 판정을 고정했다. 619f638fb 뒤 26건이 그대로 통과했다. Spring Security 7 의 `addMapping` 은 패턴마다 한 항목을 차례로 더하므로, 등록되는 (matcher, 판정) 순서는 예전과 항목마다 같다.
- 동작 변경(69c2f9ce2·6241fb90b): SYSADMIN 이 아닌 로그인 사용자가 지운 경로를 부르면, 예전에는 URL 계층이 403 을 냈고 이제는 통과한 뒤 OASIS 가 서비스 없음 또는 분기 없음 오류를 낸다. 익명 사용자는 그대로 403 이다(`McmSecurityDefaultsTest` 의 `removedActions`).
- 문서: `docs/guide/Security/Security-Guide.md` 의 matcher 목록을 고쳤다(빠져 있던 `secStartPgm/**` 도 채웠다). `docs/framework/BFF-RBAC-SYSADMIN프리패스제거-상세설계.md` §1-3 아래에 D3 갱신 한 줄을 더했다(D5 본문은 그대로다).
- 영향 범위: `McmSecurityDefaults.applyTo` 를 부르는 곳은 mcm 앱 `src/backend/mcm/api/…/mcm/config/SecurityConfig` 하나다. FE 는 지운 경로를 부르지 않는다.
- 되돌리는 방법: 같은 파일(`McmSecurityDefaults`·`McmSecurityDefaultsTest`·Security-Guide·BFF-RBAC 설계 문서)을 여러 커밋이 고쳤으므로 최신 커밋부터 revert 한다. 순서는 6241fb90b → 69c2f9ce2 → 619f638fb 다. 6241fb90b 만 되돌리면 `secUser/save`·`resetPassword` matcher 가 돌아오지만, S3 가 남아 있으면 그 action 은 여전히 없다.

## S3. F7 — `SecUserService` 의 죽은 사용자 관리 경로를 archive 로

- 커밋: 7e386ac16(refactor). 남은 SYSADMIN matcher 제거는 6241fb90b(S2)다.
- 바뀌기 전: BPMN `secUser`(`src/backend/mcm/api/src/main/resources/services/security/secUser.bpmn`)에 분기 7개가 있었다. 그 가운데 `search`·`save`·`resetPassword` 는 `SecUserService` → `UserAccountRepository` → mcm/lib `SecUserAccountRepositoryAdapter` → cactus `SecUserRepository` 로 갔다. 이 저장소의 `@Primary` 빈인 mcm/lib `McmSecUserRepository` 는 cactus 로그인용 메서드만 구현한다. 그래서 `findAll()` 은 늘 빈 목록이었고, `save()`·`deleteById()` 는 `UnsupportedOperationException` 을 던졌다. 이 세 분기는 늘 0건이거나 늘 실패했다.
- 바뀐 뒤: BPMN `secUser` 와 `SecUserService` 에는 메뉴·권한 읽기(`myMenus`·`myMenusTree`·`myPermissions`·`myButtonEndpoints`)만 남는다. 옮긴 파일은 다음과 같다(경로는 `src/backend/` 기준).

  ```text
  mcm-core/archive/main/security/
    README.md                      옮긴 파일 목록, 지운 메서드 원문, 되살리는 방법
    SecUserService.java            보관 전 원본 전체
    SecUserSearchRequest.java      ← src/main/…/mcm/security/dto/
    TransientUserAccount.java      ← src/main/…/mcm/security/
    UserAccount.java               ← src/main/…/mcm/security/
    UserAccountRepository.java     ← src/main/…/mcm/security/
    PasswordHasher.java            ← src/main/…/mcm/security/
  mcm-core/archive/test/security/
    SecUserServiceDeleteAutoFlushTest.java · SecUserServiceDeleteSqlCountTest.java · SecUserServiceDeleteUsersTest.java
  mcm/archive/api/src/main/resources/services/security/secUser.bpmn   보관 전 원본
  mcm/archive/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/
    CactusPasswordHasherAdapter.java · SecUserAccountAdapter.java · SecUserAccountRepositoryAdapter.java
  ```

  - `SecUserService.java` 는 원래 자리에 my* 메서드와 그 도우미만 남긴 새 파일로 다시 만들었다. 메서드 본문은 원본과 같고, 생성자 인자는 12개에서 8개가 되었다.
  - 새 `secUser.bpmn` 은 bpmn-tool 로 세 분기와 그 노드·DI 만 지웠다.
  - `SecUserMappingRepository.bulkDeleteByUserId` 는 쓰는 곳이 없어져 지웠다. 원문은 archive README 에 있다.
- 바꾼 이유: 호출자가 없다. FE·e2e·시드는 my* 만 부르고, 다른 모듈의 main 코드와 BPMN 도 세 분기를 부르지 않는다. 실제 사용자 관리는 `csa/commUserMng`(`CommUserMngSaveService`·`CommUserMngPasswordService` 등)가 맡는다. 1회차에서 미룬 결정(a6-1)을 이번에 「보관, 메뉴·권한 읽기 유지」 로 정했다.
- 동작 보존 근거: my* 메서드 본문은 바꾸지 않았다. `OasisPathActionBpmnTest` 는 분기 집합이 my* 4개뿐임을 단언하고, 요청 본문의 action 으로 my* 를 다른 분기로 돌리지 못하는 성질도 그대로 확인한다. OASIS 계약 검사는 ERROR 0 이다.
- 동작 변경: `secUser/search`(늘 빈 목록)·`save`·`resetPassword`(늘 오류)를 부르면 이제 OASIS 분기 없음 오류다.
- 영향 범위:
  - archive 는 빌드·시험·`@EntityScan` 밖이다. mcm-core 와 mcm 은 기본 sourceSets 만 컴파일한다.
  - `MenuCatalogCallersSelectCountTest`·`MenuCatalogOasisSaveIntegrationTest` 는 `SecUserService` 생성자에 넘기던 mock 4개(`UserAccountRepository`·`PasswordHasher`·`AuditLogger`·`PasswordPolicyEvaluator`)를 뺐다.
  - 주석·Javadoc 만 고친 곳: `CommUserMngJpaTestConfig`·`CommUserMngServiceSaveTest`·`SecurityIdentity`·`McmCoreAutoConfiguration`·`PasswordPolicyEvaluator`.
- 되돌리는 방법: 6241fb90b 를 먼저 revert 한 뒤 7e386ac16 을 revert 한다. 7e386ac16 만 되돌리면 matcher 없이 분기만 돌아온다.

## 구조 변경이 아닌 fix

### F5. analog `ClientKeyFilter` 상수 시간 비교

- 커밋: c352a1dbf(특성 시험), e6ebc0e2a(fix)
- 내용: `src/backend/analog/api/…/analog/security/ClientKeyFilter` 의 `X-Client-Key` 비교를 `String.equals` 에서 `MessageDigest.isEqual`(UTF-8 바이트, 기대 키를 앞에 둔다)로 바꿨다. cactus-core `ClientKeyFilter` 와 같은 방식이다. 응답 시간으로 새는 정보는 기대 키 길이뿐이다.
- 근거: 통과·거절 결과가 그대로다(`ClientKeyFilterCompareTest` 6건, `ClientKeyFilterTest` 5건). 특성 시험은 환경 변수 `BACKEND_CLIENT_KEY` 가 있는 셸에서는 건너뛴다(필터가 환경 변수를 먼저 쓴다).

### F6. `QueryStatementGuard`(쿼리 실행 작업의 문장 검사)

- 커밋: 6d1b492af(시험), 2089e55fe(fix), 2976112fb(시험), 7a230b459(fix)
- 새로 거절하는 것:
  - 국가 문자 대체 따옴표 `nq'…'`. Oracle 은 `nq'[a'b]'` 안의 `'` 를 글자로 읽는데(L_MAIN 실측 `LENGTH` = 3), 검사기는 `'` 를 차례로 짝지어 가려서 그 뒤의 DB 링크가 가린 사본에서 숨었다. 숫자 리터럴 바로 뒤의 접두(`1nq'`·`1e5q'`·`1.e5q'`·`1fq'`)도 거절한다.
  - `--` 주석 안의 단독 CR(`\r` 뒤에 `\n` 이 없음). Oracle 은 단독 CR 에서 주석을 끝내지 않아 지금 가린 범위와 같지만, 줄바꿈을 다르게 읽는 층이 끼어도 어긋나지 않도록 보수적으로 거절한다.
  - 따옴표 식별자로 감싼 금지어(`"UTL_HTTP".REQUEST(…)`, `SYS."DBMS_SQL"`). 금지어는 따옴표 식별자의 안 글자를 드러낸 사본으로 검사한다(`SqlGuard` 의 `revealIdentifiers` 와 같은 방식).
  - 가린 사본에 남은 `@` 전부(`"T2"@REMOTE`, `T2@"REMOTE"`). Oracle 에서 리터럴·주석·따옴표 식별자 밖의 `@` 는 DB 링크뿐이다.
- 새로 받는 것: 일반 문자열 `'Q'`·`'NQ'` 와 칸 이름 `Q`·`NQ`. q·nq 판별을 원문 전체 정규식에서 마스커의 코드 자리 판별로 옮겼다. `'Q'` 는 원래부터 거절되던 오탐이었다.
- 근거: `QueryStatementGuardTest` 64건이 통과한다.
- 하지 않은 것: findings F6 의 수정안은 S3 의 공용 마스커를 쓰는 것이었지만, 이번에는 `QueryStatementGuard` 를 직접 고쳤다. findings 가 든 중첩 주석·특수 따옴표(`E'`·`$$`·backtick) 처리는 넣지 않았다. 고친 범위는 조정자가 정한 범위(nq'·단독 CR, 확장으로 따옴표 식별자·`@`·q 리터럴 오탐)다. 마스커 두 벌의 통합은 S3 에 남는다.

## 배포 전 점검 SQL (F6)

F6 뒤의 검사기는 예전에 통과하던 문장 일부를 거절한다. 검사는 두 곳에서 한다.

- 실행할 때: `JobQueryService.run` 이 실행마다 검사를 다시 한다. 그래서 이미 저장된 QUERY 작업에 위 모양이 있으면 배포 뒤 실행이 실패한다.
- 저장할 때: `JobSchedMngService` 가 저장 때 검사한다. 그래서 그 작업을 고치지 않고 다시 저장해도 거절된다.

배포 전에 아래 SQL 로 대상 작업을 넓게 거른다. 걸린 행은 사람이 SQL 을 보고 판정한다. 검사기는 문자열·주석·따옴표 식별자를 가린 사본으로 판단하므로, 걸렸다고 모두 거절되는 것은 아니다(예: 문자열 `'Q'` 는 걸리지만 이제 받는다).

```sql
-- F6 배포 전 점검: 새 QueryStatementGuard 가 거절할 수 있는 저장된 QUERY 작업을 넓게 거른다.
SELECT JOB_ID, MODULE_CD, JOB_NM, USE_YN,
       CASE WHEN REGEXP_LIKE(SQL_TEXT, 'n?q''', 'i') THEN 'Y' END AS HAS_ALT_QUOTE, -- q'…'·nq'…' 후보
       CASE WHEN INSTR(SQL_TEXT, CHR(13)) > 0         THEN 'Y' END AS HAS_CR,        -- -- 주석 안 단독 CR 후보
       CASE WHEN INSTR(SQL_TEXT, '"') > 0             THEN 'Y' END AS HAS_QUOTED_ID, -- 따옴표 식별자 안 금지어 후보
       CASE WHEN INSTR(SQL_TEXT, '@') > 0             THEN 'Y' END AS HAS_AT         -- DB 링크 후보
FROM  (SELECT D.JOB_ID, D.MODULE_CD, D.JOB_NM, D.USE_YN,
              JSON_VALUE(D.CONFIG_JSON, '$.sql' RETURNING CLOB) AS SQL_TEXT
       FROM   MCMAPUSER.TB_MCM_JOB_DEF D
       WHERE  D.JOB_KIND = 'QUERY')
WHERE  REGEXP_LIKE(SQL_TEXT, 'n?q''', 'i')
   OR  INSTR(SQL_TEXT, CHR(13)) > 0
   OR  INSTR(SQL_TEXT, '"') > 0
   OR  INSTR(SQL_TEXT, '@') > 0
ORDER BY JOB_ID;
```

- `CONFIG_JSON`(CLOB) 원문에는 JSON 의 `\"`·`\r` 이스케이프가 들어 있어 그대로는 판정할 수 없다. 그래서 `JSON_VALUE` 로 `$.sql` 을 꺼낸다. `RETURNING CLOB` 은 Oracle 18c 이상에서 쓸 수 있다. JSON 이 깨진 행은 `JSON_VALUE` 가 null 을 돌려주므로 걸리지 않는다.
- 단독 CR 조건은 넓게 거른다. CR 이 `--` 주석 안에 있는지, 뒤에 LF 가 오는지는 사람이 본다.
- 이 SQL 은 clone PDB 에서 실행해 보지 않았다(이 PC 에 SQL 클라이언트가 없다).

## 보류·새 항목

- D2(보류): mcm-core `entity/Mom*` 7개, `repository/{Mom*,InterfaceFormat*,TcErrorRowView}`, `audit/{entity/KeyStore,repository/KeyStoreRepository}` 는 main 소비자가 없음을 확인했다. 하지만 X1(cactus-core 가 `TB_MCM_MOM_*` 에 직접 SQL)과 관련 있어 X1 설계 뒤로 미뤘다(조정자 동의).
- F8(새 항목, 보안, 결정 필요): 실제 권한 마스터 저장(`csa/commRoleMng`·`commPermMng`·`commObjMng`·`commMenuMng`·`commRoleGrpMng`·`commUserRoleCopy`·`commUserMng` 의 save)에 SYSADMIN URL gate 가 없다. 예전 gate 는 BPMN 없는 옛 서비스 id 에만 걸려 있었다(S2). 이 레인에서는 고치지 않았다. `McmSecurityDefaultsTest` 의 `otherActions` 가 현재 동작(로그인만으로 URL 계층 통과)을 고정하고, 주석에 F8 을 적었다.

## 감사 정정

- D3: findings 는 「없는 BPMN matcher 7개」 라고 적었다. findings 가 든 서비스 8종의 action 을 세면 11개였다(`secRole`·`secPerm`·`secObj`·`secMenu`·`secRolePerm`·`secUserRole` 의 save, `secRoleGroup` 3개, `secCode/save`, 로그인 전용 `secMenu/recordAccess`). F7 뒤 `secUser/save`·`resetPassword` 2개를 더 지웠다.
- F2: 「실행 미확인」 이었던 동작(`S001`, `errors[]` 없음)을 dd681603b 특성 시험이 실행으로 확인했다.
- F6: 수정안(S3 공용 마스커) 대신 `QueryStatementGuard` 를 직접 고쳤다. 범위는 「F6. `QueryStatementGuard`」 의 「하지 않은 것」 에 적었다.
- F7: findings 의 「FE 는 `my*` 액션만 부른다(미확인)」 를 확인했다. FE·e2e·시드·다른 BPMN 에 세 분기의 호출자가 없다.

## 후속 후보 (이번에 하지 않음)

- S3 후보: `SqlGuard.isSpecialStringPrefix` 도 숫자 바로 뒤의 `1q'` 를 보지 못한다. 마스커 두 벌(`QueryStatementGuard`·`SqlGuard`) 통합은 S3 에 남는다.
- 보관 후보: `mcm-core/…/mcm/audit/AuditLogger` 는 F7 뒤 main 사용처가 없다(`LlmJson` Javadoc 의 언급만 남았다).
- 주석 정리: cactus `CactusRequestConverter.java:22,50` 주석이 archive 된 경로(`secUser/myMenus` 로 `resetPassword` 실행, `SecUserSearchRequest.userId`)를 예로 든다.
- 스킬 소유자 몫: OASIS 계약 검사 스크립트가 `mcm/archive` 의 BPMN 도 훑는다.
- UI 회차: FE `shared/src/oasis-proxy/index.ts:250-283` 캐시 무효화 분기의 `secRole`·`secPerm`·`secRolePerm` 은 죽은 코드다.
- BPMN `secUser` 의 프로세스 이름 「사용자 관리 서비스」 는 이제 my* 읽기만 남은 내용과 맞지 않는다.
- 1회차 문서 `docs/refactor-2026-10/perf-mcm.md` 가 archive 로 옮긴 `SecUserServiceDeleteSqlCountTest` 를 인용한다.
