# TSK-09-03 설계 — 모듈 관통·권한 교차·성능

## 0. 조사 요약 (다음 Phase 가 컨텍스트로 삼는다)

`category: itest`·`domain: test`·`entry-point: -` 다. 새 기능을 만들지 않고, 이미 완료·머지된 7개 선행 작업
(TSK-04-03 도메인, TSK-06-05 마루코드 확정, TSK-07-03/07-04 마스터데이터, TSK-08-04/08-05 룰, TSK-01-03 권한·버전
상태 공용 서비스)이 맞물리는 지점의 "개별 화면 단위 시험이 못 보는 이음매"를 찾아 메운다(선례: TSK-09-01, 같은 접근
그대로 따른다). Explore 서브에이전트 2개 + 직접 grep/Read 로 spec 의 세 요구사항을 조사했다.

### 0.1 "CODE 도메인 → 코드 확정 → 데이터 등록 → 룰이 MASTER 로 코드·데이터를 참조해 확정 → 원장 기준 판정 일치"

**핵심 발견 — MASTER 조회의 프로덕션 배선이 없다.** `MdmEngineConfig`(`mdm/lib/common/engine/MdmEngineConfig.java`)의
공유 `mdmEvaluator` 빈은 `CodeLookup`·`MasterLookup` 빈이 없으면 각각 `EMPTY_CODES`·`MasterLookup.NONE` 을 쓴다.
실제로 앱 전체에 `CodeLookup`·`MasterLookup` 빈은 **하나도 없다**(`grep -rln "implements MasterLookup" src/backend/mdm`
= 0건, `@Bean`도 없음). 이것은 사고가 아니라 **문서화된 결정 D-077**(`decisions.md:633`)이다: 원장 구현체
`MdmCodeLookup`(마루코드용, `mdm/lib/common/mastercode/MdmCodeLookup.java`)은 만들어졌지만 "Spring 빈으로 등록하지
않는다(D-077, D5)... **운영 등록 여부는 TSK-06-05 이후 판단한다**(그때 `@Component` 만 붙인다)"고 명시했다. TSK-06-05
는 이번 기점(`fc8e875c`)에 이미 머지돼 있어 그 판단 시점이 되었지만, 아직 아무 Task 도 그 스위치를 켜지 않았다.
마루 데이터(마스터데이터) 쪽은 더 나아가 **참고 구현조차 프로덕션에 연결된 적이 없다** — `MasterDataResolver`
(`maru-mdm-engine/.../code/MasterDataResolver.java`, `implements MasterLookup`, 생성자
`Function<String,Optional<MasterDataRows>> source` 하나만 받음)는 엔진 모듈 자체 단위 테스트(`MasterFunctionTest` 등)
에서만 쓰이고, `mdm/api`·`mdm/lib` 어디서도(프로덕션·테스트 불문) 참조되지 않는다. TSK-04-03 design.md:539 는 이미
"마루 데이터 대상 `MASTER` 는 `MasterLookup` 구현(TSK-07-01 등)이 생길 때까지 false 로 판정된다"고 적어 뒀고, 그
구현은 끝내 아무 WP 에도 배정되지 않았다.

**이 작업이 갈 수 있는 만큼**: TSK-09-01 B2·B3 가 이미 쓴 방식(운영 빈을 새로 만들지 않고, 시험이 실제 원장 조회
클래스에 직접 붙인다 — `MasterCodeDeprecateEngineSqliteTest` 가 `new DefaultCodeResolver(new MdmCodeLookup(ledger),
CodeEffLookup.NONE)` 을 직접 만들어 붙이는 선례)를 그대로 확장한다. 마루코드 쪽은 이미 있는 `MdmCodeLookup` +
`MasterCodeLedgerQueries`(자동 주입 가능, `@Autowired` 확인됨)를 그대로 쓴다. 마스터데이터 쪽은 이 작업이 **새로
만들 것**: `dataItemMng` 저장 결과(TB_MDM_DATA_ITEM 등)를 읽어 `MasterDataRows`(header·items·categories·cateItems)
로 매핑하는 어댑터 함수 하나(시험 전용 클래스, 프로덕션 코드 아님)를 짜서 `MasterDataResolver` 생성자에 물린다. 이렇게
시험이 자체 `MdmEvaluator`/`MdmRuleEngine` 인스턴스를 "운영 빈이 등록됐다면"의 모습으로 조립해, 실제 등록된 마루코드·
마스터데이터를 룰의 `MASTER(...)` 가 정확히 참조하는지 확인한다 — 운영 코드(`MdmEngineConfig`, `@Component` 여부)는
바꾸지 않는다.

**"원장 기준 판정 일치"의 두 후보**: PRD AC-1 은 "04 판정 표 원장 기준 `sql/04-code-exists.sql` 일치"·"05 PORT 판정
7케이스(원장 기준)"를 이미 04·05 자체 작업(TSK-06-05·07-03)의 수용 기준으로 걸어 뒀다 — 이것은 **각 모듈 자신의
판정**(마루코드 존재, PORT 분류)이고 새로 확인할 것이 없는 기존 자산이다. TSK-09-03 이 요구하는 "판정"은 그와
다르다 — 룰의 `MASTER(...)` 가 **다른 두 모듈이 방금 확정·등록한 값**을 참조해 내는 판정이며, 이 조합을 시험하는
기존 자산은 없다(dmc/dmd/dme 어디에도 서로를 잇는 `*Flow*Test`·`*Chain*Test` 가 없음, 확인함).

### 0.2 "역할 2종 × 화면·액션 권한 매트릭스, DRAFT 소유권 교차(비소유자 저장 거부)"

**정정(1차 조사 오류 — 판정 층을 잘못 짚었다)**: 최초 조사는 `EndpointPermissionFilter`(mcm-core)가 mdm 요청을 403
으로 막는다고 적었으나 틀렸다. **mdm 백엔드에는 서버 쪽 권한 필터가 없다** — TSK-01-03 design.md F38·D6(택한 것
(a))이 이미 이렇게 정했다: "API RBAC 는 BFF 한 곳"이고, mdm 은 mcm 보안 테이블을 볼 수 없다(F40). `MdmSecurityChainTest`
가 확인하는 것도 "신뢰 헤더가 있으면 인증만 통과한다"이지 역할별 화면·액션 403 이 아니다. 실제 판정 경로는 3단이다:
  1. **mcm 시드**: `mcm/api/.../init/DataInitializer.java`의 `seedMdmRbac()`(역할 2종·역할그룹·권한 3종
     READ/EDIT/CONFIRM 의 액션 CSV)와 `seedMdmObjectRbac(objectId, groupCode)`(화면별 그룹×역할→권한ID, `Map.of`
     로 dma/dmb/dmc/dmd/dme 매트릭스를 하드코딩)가 `TB_MCM_SEC_ROLE_MAPPING`·`TB_MCM_SEC_PERM`을 채운다. 이 매트릭스는
     현재 값을 대조해 보니 **`MdmPermissions.MATRIX`·`*_ACTIONS`(mdm/lib 계약)와 내용이 같지만, import 관계가 없는
     손 복제본**이다(mcm 은 mdm/lib 을 의존하지 않는다 — 방향이 반대면 순환 의존) — 값이 갈라져도 컴파일이 잡지 못한다.
  2. **mcm-core**: `UserPermCache.toKeyStrings(userId)`(mcm-core, `RBAC chain`을 펼쳐 `PermKey`Set 을 만든다)가 그
     시드로 `"module/objId/action"` 문자열 목록을 만든다. `PermKey`(`mcm-core/.../security/endpoint/PermKey.java`)의
     compact constructor 가 `objId`를 `.toLowerCase()` 하는 것을 코드로 확인함 — camelCase 화면 ID(`domainMng`)가
     `domainmng`로 내려간다.
  3. **BFF**: `m-mcm/proxy.ts` → `shared/src/auth/rbac-policy.ts`의 `evaluateApiPolicy`가 요청 경로를 `parseRbacKey`
     로 같은 포맷의 키로 바꿔 1·2 번이 만든 목록에 있는지로 pass/`forbidden-perm`을 가른다(순수 함수, 이미 광범위한
     기존 vitest 있음, mdm 전용 사례는 없음).
- **이미 있는 시험**: `MdmOasisActionVocabularyTest`(`mdm/api` 테스트, `com.dongkuk.dmes.mdm`)가 이 갭을 절반 메워
  뒀다 — `mcm_시드의_allActions_는_mdm_BPMN_의_모든_action_을_담고_editActions_는_계약과_같다()`가 이미
  `DataInitializer.java`를 **소스 텍스트로 읽어**(스프링 컨텍스트 없이, 클래스 주석 "단위 테스트가 없는 모듈이라 소스
  문자열을 읽어 mdm 계약·BPMN 과 대조한다") `readActions`/`editActions` 리터럴이 `MdmPermissions.READ_ACTIONS`/
  `EDIT_ACTIONS`와 같은지, BPMN 의 모든 액션이 `allActions`에 있는지 확인한다. **빠진 것**: `confirmActions` 대조,
  `seedMdmObjectRbac`의 그룹×역할 매트릭스(`Map.of` 리터럴) 대 `MdmPermissions.MATRIX` 대조, 그리고 이 시험이 개별
  `@Test`로 스캔하는 BPMN 은 `unitMng`·`termMng`(dma) + `ruleEdit`·`ruleMng`·`ruleSetMng`·`ruleSetEdit`(dme) 6개뿐
  (전체 커버리지 검사는 `allActions` 대조 하나뿐이고 이것도 dme 4개만 `scanned` 검사로 강제한다) — dmc(마루코드)·
  dmd(마스터데이터) 그룹은 어떤 검사에도 안 걸린다.
- **게이트 배치 함정(확인함, dry-run 으로 재확인)**: `mcm`(포함 빌드)의 `build.gradle`에는 `mdm/build.gradle:59-64`
  같은 `tasks.named('test') { dependsOn(subprojects.collect { ... }) }` 집계 줄이 **없다**. 루트 `testAll`은
  `gradle.includedBuild('mcm').task(':test')` 하나에만 기대므로, `./gradlew testAll --dry-run`(실행함)의 그래프에
  `:mcm:test`(무소스)만 있고 `:mcm:api:test`·`:mcm:lib:test`는 **아예 없다** — `mcm/api`엔 `src/test`조차 없고,
  `mcm/lib/src/test`의 유일한 파일(`SampleNoticeServiceTest.java`, mdm 무관)도 지금 게이트 밖이다. 그래서 **새 시험을
  `mcm/api`나 `mcm/lib`에 두면 `testAll`이 그 파일을 영원히 돌리지 않는다** — 만든 커버리지가 허상이 된다. 반면
  `mdm/build.gradle`은 이 집계 줄이 있어 `:mdm:api:test`가 실제로 돈다(`MdmOasisActionVocabularyTest`가 그 증거).
  이 판단은 「담당자 확인 필요 결정」 D5 로 올린다.
- DRAFT 소유권: 공용 계약 `VersionStateService`/`DraftOwnershipService`/`VersionWriteGuard`(`mdm/lib/contract/
  version`)를 **dmc**(`CodeConfirmService`·`CodeEditService` 등)와 **dme**(`RuleConfirmService`·`RuleVersionService`
  등)가 재사용한다(확인함). 반면 **domainMng**(dma)·**dataItemMng**(dmd)는 이 세 인터페이스를 전혀 부르지 않고,
  `TB_MDM_DOMAIN`·`TB_MDM_DATA_ITEM` 에는 `OWNER_ID`/`STATUS` 컬럼조차 없다 — 애초에 DRAFT 소유권 개념이 없다(단,
  같은 04 계열의 `TB_MDM_TERM` 은 `OWNER_ID` 를 갖는다). 비소유자 거부는 dmc(`CodeConfirmServiceSqliteTest`
  `S5_...MDM013`)·dme(`RuleConfirmServiceTest` `S5_...MDM013_소유자가_아니면_MDM003`)가 **각자 따로** 검증하고 있고,
  둘이 같은 공용 서비스의 같은 판정을 검증한다는 사실 자체를 잇는 시험은 없다.

### 0.3 "NFR-1 성능(AST 1만 행, 룰 판정)"

PRD.md:162 원문: "화면 AST 평가 1건 0.3~2.7µs, **1만 행 판정 100 ms 이내**(02 「실행 지점」). **서버 룰 판정은
컴파일 캐시를 쓴다.**" — 두 문장이다.

- **화면(1만 행 100ms) = 이미 됨.** `m-mdm/tests/evalex-perf.test.ts`(TSK-03-04 산출물, N=10_000, LIMIT_MS=100)가
  화면 JS 인터프리터로 이미 이 기준을 재고 있다(기준선 통과 중). 손대지 않는다 — 기존 자산으로만 매핑한다.
- **서버(컴파일 캐시) = 없음, 확인함.** 실제 판정 경로 `RuleEvaluator`→`ExpressionRunner`(`maru-mdm-engine/.../rule/
  ExpressionRunner.java:11-25`, 직접 Read 로 재확인)는 캐시 필드가 전혀 없고 `run()`마다
  `new Expression(text, configuration).withValues(values).evaluate()`를 새로 만든다. 클래스 주석 자체가 "컴파일
  캐시 + `copy()` 는 TSK-03-02 몫이라 여기에 끼워 넣는다(D17)"이라 적어 뒀고, D17 은 TSK-03-03 design.md 에만 "끼울
  자리"로 언급된 채 실제로 연결된 적이 없다(`ExpressionRunner`에 캐시가 없다는 사실이 그 증거). 도메인 검증에 쓰는
  **다른** 평가기 `MdmEvaluator`(`expr/MdmEvaluator.java`)는 식 텍스트를 키로 하는 진짜 캐시가 있지만(`cacheSize()`
  테스트로 검증됨), 룰 판정(`MdmRuleEngine.evaluate`)이 쓰는 `RuleEvaluator`/`ExpressionRunner` 경로에는 연결돼
  있지 않다. 서버 쪽 1만 행 규모 성능 시험은 `maru-mdm-engine`·`mdm/api`·`mdm/lib` 전체에 하나도 없다(확인함).
- NFR-1 의 서버 절반("컴파일 캐시를 쓴다")은 **아직 사실이 아니다.** 이 작업은 itest 로 프로덕션 코드(캐시 추가)를
  고치지 않으므로, 이 사실을 결함으로 기록하고 "성능 기준 충족" 수용 기준의 서버 캐시 부분은 이 작업만으로 충족
  판정할 수 없다는 것을 「담당자 확인 필요 결정」에 올린다. 대신 **판정 정확성**(캐시와 무관하게, 같은 룰을 1만 건
  규모 레코드에 판정했을 때 결과가 맞는가)은 0.1 의 관통 시나리오를 1만 행 규모로 확장해 함께 확인한다(시간 예산
  단언은 걸지 않는다 — 캐시가 없는 채로 새 ms 기준을 만들면 반드시 느리게 나오고, `evalex-perf` 가 이미 겪은 부하
  민감 flake 를 서버 쪽에 하나 더 만드는 꼴이라 하지 않는다).

## 1. 접근 방식

세 요구사항 모두 **프로덕션 코드를 고치지 않고 시험만 추가한다**(itest 범위, TSK-09-01 과 같은 원칙 — 예외: D5 가
(b)로 뒤집히면 `mcm/build.gradle`의 test 집계 줄 1개, 시험 실행 여부를 결정하는 빌드 설정이라 별도로 담당자 확인을
받는다). 세 갭은 서로 다른 파일에 있어 겹치지 않는 독립 구현 단위 셋(B1~B3)으로 나눈다. B2·B3 는 같은 Gradle 모듈
(`mdm/api` 테스트 소스셋)에 있어 병렬 묶음 조건(컴파일 범위가 다를 것)을 만족하지 못하고, B1 은 기존 파일 2개(mdm/api
Java 1개 + shared TS 1개)를 수정하는 성격이라 확신 없이 묶지 않는다 — 세 단위 모두 **순차로 진행한다**(TSK-09-01 의
"병렬 가능" 문구를 옮기지 않는다).

시험 중 기존 코드의 결함(가장 크게는 위 0.1·0.3 의 두 배선 부재)을 발견해도 고치지 않고 완료 보고에 재현 절차와
함께 올린다(수용 기준 2 — defect Task 등록은 오케스트레이터·사람의 몫). **결함 발견 시 처리**: 게이트는 기준선 대비
신규 실패 0 이므로 결함을 드러내는 실패 단언은 커밋하지 않는다(`@Disabled`·skip·기대값 완화도 쓰지 않는다). 대신
`docs/mdm/tasks/TSK-09-03/defects.md` 에 결함마다 `DF-<n>` 번호·대상 WP·재현 절차·기대/실제 결과를 적어 커밋하고,
그 부분만 "확인 불가"로 남기고 나머지 체인을 검증한다. 테스트 코드의 해당 자리에는 `// DF-<n>: defects.md 참조`
주석을 남긴다. 결함이 없으면 defects.md 를 만들지 않는다(TSK-09-01 과 동일).

**itest 관통 시나리오의 브라우저 요구와 기준선 제한의 충돌(TSK-09-01 D2 재사용)**: `e2e.md`는 itest 관통 시나리오도
브라우저로 돌리라 하지만, 이 작업 검증 명령 5개에 Playwright 가 없다. TSK-09-01 과 같은 이유로 이번 회차도 **백엔드
`@SpringBootTest`(HTTP, `RANDOM_PORT`)로만 관통 시나리오를 확인**하고 새 Playwright spec 은 만들지 않는다(각 화면의
기존 독립 E2E 가 화면별 등록·검증은 이미 본다).

**MSSQL 폐지(2026-09-26 결정)**: MDM 운영 DB 는 아직 정하지 않았고 MSSQL 은 폐지 대상이다. 이 작업은 MSSQL 마이그레이션
(`db/migration/mdm/mssql`)·`mssqlTest` 소스셋·MSSQL 방언 분기·MSSQL 관련 문서를 새로 만들거나 고치지 않는다. 기존
MSSQL 코드는 그대로 두고 지우지 않는다(팀장이 별도 브랜치에서 지운다). B1~B3 는 모두 SQLite(`test` 소스셋)만 다루고,
새 Flyway 마이그레이션 자체도 추가하지 않는다(B1~B3 가 쓰는 테이블은 모두 선행 WP 가 이미 만들어 둔 스키마이고, 이
작업은 그 스키마에 서비스 API 로 행만 넣는다 — 마이그레이션 파일을 만들 이유가 없다). **이 작업은 새 마이그레이션을
추가하지 않으므로 `MdmFlywayVersionParityTest`·`*DdlParityTest` 류(SQLite·MSSQL 버전·DDL 짝 맞춤 검사)에 허용 조항을
쓸 일이 없다** — SQLite 마이그레이션을 더하지 않으니 "짝 없는 MSSQL" 실패 자체가 이 작업에서는 생기지 않는다. 이
시험들의 다른 실패는(이 작업이 만든 것이 아니어도) 평소대로 신규 실패로 센다(팀장 지시 2026-09-26 — 허용 범위는
"SQLite 마이그레이션에 MSSQL 짝이 없다는 이유"뿐이고 그 밖은 넓히지 않는다). `DataInitializer` 의 시드 SQL 은
고치지 않는다(프로덕션 불변, §0.2).

## 2. 변경 파일 목록

**생성**
- `docs/mdm/tasks/TSK-09-03/design.md` — 이 문서
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/contract/version/DraftOwnershipCrossModuleTest.java` — B2
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/itest/CodeDataRuleLedgerChainTest.java` — B3
- `docs/mdm/tasks/TSK-09-03/defects.md` — 조건부. B1~B3 실행 중 기존 코드 결함(0.1·0.3 의 배선 부재, D5 미결정 포함)이
  실제로 판정을 막으면 만든다. 결함이 없으면 만들지 않는다.

**수정** (기존 시험 파일에 새 `@Test`/새 `it()`만 더한다 — 기존 메서드는 그대로 둔다)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java` — B1(i). `confirmActions`
  대조·`seedMdmObjectRbac` 매트릭스(그룹×역할→권한) 대조·전 화면 커버리지 새 `@Test` 추가.
- `src/frontend/shared/tests/unit/rbac-policy.unit.test.ts` — B1(ii)/(iii). 실제 MDM OASIS 경로
  (`/api/mdm/oasis/domainMng/save`)로 `parseRbacKey`의 소문자화(`domainmng`)와 `evaluateApiPolicy`의 pass/
  `forbidden-perm`을 확인하는 새 `it()` 추가.

D5 가 (b)로 뒤집히면(§0.2·「담당자 확인 필요 결정」 D5) 추가로 `src/backend/mcm/build.gradle`(집계 줄 1개, `mdm/
build.gradle:63-64` 그대로 복사) + `src/backend/mcm/api/src/test/java/...`(신규, `DataInitializer` 실제 시드 →
`UserPermCache.toKeyStrings` 를 직접 확인)가 늘어난다 — 기본값 (a) 에서는 이 두 파일을 만들지 않는다.

## 3. 테스트 전략

세 단위 모두 기존 게이트 명령 안에서 돈다(`gradlew testAll`). 새 게이트 명령을 추가하지 않는다.

| 단위 | 새 시험 | 도는 명령 |
|---|---|---|
| B1 | `MdmOasisActionVocabularyTest`(수정, mdm/api) + `rbac-policy.unit.test.ts`(수정, shared) | `cd src/backend && … ./gradlew testAll …` + `cd src/frontend && pnpm test:unit:shared` |
| B2 | `DraftOwnershipCrossModuleTest` | `cd src/backend && … ./gradlew testAll …` |
| B3 | `CodeDataRuleLedgerChainTest` | 〃 |

### B1 — 역할 2종 × 화면·액션 권한 매트릭스 (§0.2 재설계 — 실제 판정 층 3단에 맞춘다)

**판정 층마다 시험을 건다(§0.2). mdm 백엔드에 HTTP 403 을 기대하지 않는다** — 그 층이 없다.

**(i) mcm 시드 ↔ `MdmPermissions` 계약** — `MdmOasisActionVocabularyTest`(`mdm/api`, 이미 있음, `DataInitializer.java`
를 소스 텍스트로 읽는 기존 패턴)에 새 `@Test`를 더한다. 이 파일은 `testAll` 그래프에 실제로 있다(`:mdm:api:test`,
`mdm/build.gradle`의 집계 줄로 확인됨) — `mcm`쪽에는 이 집계가 없어(§0.2) 못 둔다.
1. `confirmActions` 리터럴(`String confirmActions = editActions + "..."`) 을 `String.join(",", MdmPermissions.
   CONFIRM_ACTIONS)` 와 대조한다(기존 시험은 `read`/`editActions`까지만 본다).
2. `seedMdmObjectRbac`의 `java.util.Map<String, java.util.Map<String, String>> matrix = java.util.Map.of(...)`
   블록을 정규식으로 파싱해(`"dma", java.util.Map.of("MDM_STD_ADMIN", "PERM_MDM_EDIT", ...)` 모양) 그룹마다
   역할→권한ID 를 뽑고, `MdmPermissions.MATRIX.get(MdmScreenGroup.<그룹>)`과 같은지 5그룹 모두 대조한다.
3. **화면 커버리지**: `find src/main/resources/services -iname "*.bpmn"`(23개, 이미 `wc -l` 로 확인)로 만든 화면
   목록과, `DataInitializer.java` 안의 모든 `seedMdmObjectRbac(...)` 호출에서 뽑은 (objectId, groupCode) 목록을
   대조한다. 호출은 세 모양이다 — ① 리터럴 `seedMdmObjectRbac("codeConfirm", "dmc")` ② 배열 루프
   `for (String objectId : new String[]{"a","b"}) { ...; seedMdmObjectRbac(objectId, "dma"); }` ③ 2차원 배열 루프
   `String[][] screens = {{"ruleSetMng",...}, ...}; for (String[] s : screens) { ...; seedMdmObjectRbac(s[0], "dme"); }`
   — 세 모양 모두 잡는 파서가 부담되면 ②·③을 접어 "BPMN 에 있는데 시드 호출이 하나도 안 잡히면" DF 로 남기고, 최소
   ①(리터럴)만으로 놓친 화면이 있는지부터 본다. `mdmSample`(BPMN 없음, 샘플 화면)처럼 시드에만 있고 BPMN 에 없는
   이름은 실패가 아니라 DF 로 기록한다(원천끼리 원래 다른 것).
**Build 착수 시 먼저 할 일**: 위 정규식이 실제 `DataInitializer.java`(3300줄대) 문법과 맞는지 대상 텍스트에 바로
대 보고, 안 맞으면 이 설계를 그대로 두고 build-log.md 「설계 이탈」에 실제 파싱 방식을 적는다.

**(ii)/(iii) BE 키 생성 ↔ FE 키 파싱 이음매** — 한 단언이면 된다(팀장 지시 "필요하면"). `rbac-policy.unit.test.ts`
(이미 있음, `describe("parseRbacKey")`/`describe("evaluateApiPolicy 매트릭스")`에 새 `it()` 추가):
1. `parseRbacKey("/api/mdm/oasis/domainMng/save")` 가 `"mdm/domainmng/save"`(소문자화 확인 — `PermKey` compact
   constructor 의 `objId.toLowerCase()`와 대응, §0.2 에서 코드로 확인함)를 낸다.
2. 그 키가 `perms`에 있으면 `evaluateApiPolicy`가 `"pass"`, 없으면 `"forbidden-perm"`을 낸다(기존 T1/T2 패턴을
   MDM 실제 경로로 재사용).
새 파일을 만들지 않으므로 `pnpm test:unit:shared`(기준선 명령, `include: ["tests/**/*.test.ts"]`) 글롭에 자동으로
잡힌다(확인함).

### B2 — DRAFT 소유권 교차(비소유자 저장 거부)

dmc(`CodeConfirmService`)·dme(`RuleConfirmService`)가 **같은** `VersionStateService`/`VersionWriteGuard`/
`DraftOwnershipService` 판정을 쓴다는 사실을 한 시험 안에서 확인한다: 두 모듈에서 각각 DRAFT 를 만들고, 다른
사용자(비소유자)로 저장·확정을 시도해 둘 다 같은 오류 계열(MDM003/MDM013, 기존 `CodeConfirmServiceSqliteTest`·
`RuleConfirmServiceTest` 가 이미 쓰는 코드)로 거부되는지 같은 파일에서 나란히 확인한다. 새 판정 로직을 만들지 않고
기존 서비스를 그대로 호출한다(기존 두 단위 시험의 중복 재작성이 아니라, "둘이 같은 공용 서비스를 쓴다"는 교차
사실 하나를 새로 증명하는 것이 목적이다).
**domainMng(dma)·dataItemMng(dmd)는 시험 대상에서 뺀다** — 두 테이블에 `OWNER_ID`/`STATUS` 컬럼이 없어 DRAFT
소유권 개념 자체가 없다. design.md 에 "해당 없음(스키마에 OWNER_ID 없음)"으로 남기고 있지 않은 기능을 지어내지
않는다.

### B3 — 관통 시나리오: CODE 참조 → 코드 확정 → 데이터 등록 → 룰 MASTER 확정 판정

`@SpringBootTest`(HTTP 또는 서비스 직접 호출, `DmaOasisHttpTest`류 패턴)로 아래를 한 흐름에 잇는다:
1. `dma/domainMng.save` 로 CODE 종류 도메인(마루 코드 참조 포함)을 등록한다(TSK-04-03 자체 검증 재사용).
2. `dmc/codeConfirm` 경로로 새 마루 코드 버전을 확정(DRAFT→RELEASED)한다(TSK-06-05 확정 경로 그대로 재현).
3. `dmd/dataItemMng`(또는 CSV 업로드)로 2번 마루 코드 값을 참조하는 마스터데이터 항목을 등록한다.
4. **여기서 이 작업이 새로 조립하는 것**: 운영 빈이 없는 `CodeLookup`·`MasterLookup`을 시험 전용으로 만든다 —
   `new MdmCodeLookup(ledger)`(`ledger`=`MasterCodeLedgerQueries`, 2번이 만든 실제 원장)와, 3번이 만든 실제
   TB_MDM_DATA_ITEM 행을 읽어 `MasterDataRows`로 매핑하는 새 어댑터(이 시험 파일 안의 private 헬퍼, 프로덕션 코드
   아님) + `MasterDataResolver`. 이 둘을 `MdmEngineConfig.lookups(codes, masters, FunctionProvider.NONE)`로 감싸
   `new MdmEvaluator(lookups)`를 만든다("운영 빈이 등록됐다면"의 모습 그대로 재현 — `MdmEngineConfig` 자체는
   고치지 않는다).
   **Build 착수 시 먼저 할 일**: TB_MDM_DATA_ITEM(+카테고리·소속) 을 읽는 기존 클래스가 있는지(`DataItemListQuery`
   등) grep 하고, 있으면 그것을 재사용해 매핑하고 없으면 JPA 엔티티를 직접 읽어 매핑한다. 어느 쪽인지 build-log.md
   에 남긴다.
5. `dme/ruleEdit`로 `MASTER("<2번 마루코드>", "<카테고리>", <3번에서 등록한 키>)`를 참조하는 룰을 만들고, 룰 저장
   시 검사(TSK-08-04)를 통과시킨 뒤 `dme/ruleConfirm`으로 확정(TSK-08-05 확정 경로 재현)한다.
6. 확정된 룰을 4번에서 조립한 평가기로 "값 테스트"(`RuleCaseJudge.evaluate`, `RuleValueTestService`가 쓰는 것과
   같은 함수)를 돌려, `MASTER(...)` 판정이 2·3번에서 **실제로 등록한 값**과 일치하는지 확인한다("원장 기준 판정
   일치"의 핵심 단언). 이어서 같은 룰·같은 평가기로 **1만 건 규모**(같은 키의 반복이 아니라 유효/무효 키가 섞인
   합성 레코드)를 판정해, 결과가 모두 예외 없이 올바르게 나오는지 확인한다(시간 예산 단언 없음 — §0.3).
7. 4~6단계가 D-077·마스터데이터 MasterLookup 부재 때문에 실제로 조립 불가능하다고 판명되면(예: `MasterDataRows`
   레코드 모양이 dataItemMng 저장 스키마와 안 맞음), 그 지점까지(1~3단계, 화면별 등록·확정)만 확인하고 나머지는
   `defects.md`에 DF 로 남긴다 — 조용히 시나리오를 좁혀 통과시키지 않는다.

## 4. 수용 기준 매핑

| spec 항목 | 검증 방법 |
|---|---|
| 시나리오 통과 — CODE→코드확정→데이터등록→룰 MASTER 확정→원장 기준 판정 일치 | B3(신규). 0.1 의 MASTER 배선 부재로 6단계가 막히면 그 사실을 defects.md 에 남기고 "부분 통과(1~3단계 확인, 4~6 은 DF-n)"로 보고 — 「담당자 확인 필요 결정」 D1 참조 |
| 발견 결함은 해당 기능 WP 에 defect Task 로 등록됨 | 이 작업은 코드 대상이 아니다. B1~B3 실행 중 발견한 기존 코드 결함(D-077 미결정, MasterLookup 부재, 컴파일 캐시 부재 포함)은 완료 보고에 대상 WP 추정·재현 절차와 함께 올린다(등록 자체는 오케스트레이터·사람 몫, TSK-09-01 D3 와 동일 원칙) |
| 권한 매트릭스 전 항목 통과 | B1(수정, §0.2·§3 재설계) — `MdmOasisActionVocabularyTest`가 mcm 시드(`DataInitializer` 소스 텍스트) 전체 5그룹×`confirmActions`까지 `MdmPermissions` 계약과 대조하고, BPMN 23개 화면 커버리지를 확인한다. `rbac-policy.unit.test.ts`가 BE 키 생성(소문자화)↔FE 키 파싱 이음매를 확인한다. 시드가 상수와 다르거나 화면이 빠지면 결함으로 기록. D5 가 (b)로 바뀌면 mcm 쪽에서 `UserPermCache.toKeyStrings` 실측까지 추가 |
| DRAFT 소유권 교차(비소유자 저장 거부) | B2(신규) `DraftOwnershipCrossModuleTest` — dmc·dme 교차만(domainMng·dataItemMng 는 해당 없음) |
| 성능 기준 충족 — 화면 NFR-1(1만 행 100ms) | 기존 자산 `m-mdm/tests/evalex-perf.test.ts`(TSK-03-04). 손대지 않는다. 이미 기준선 m-mdm test 안에서 통과 중(부하 민감 flake 는 TSK-09-01 D 결정과 같은 취급) |
| 성능 기준 충족 — 서버 NFR-1(컴파일 캐시) | **확인 불가(결함)**: `ExpressionRunner`에 컴파일 캐시가 없다(§0.3). 새 ms 기준 시험을 만들지 않고 DF 로 기록한다 — 이 항목은 이 작업만으로 "충족"으로 판정할 수 없다(「담당자 확인 필요 결정」 D2) |
| 성능 기준 충족 — 1만 행 규모 판정 정확성 | B3 6단계(신규) — 캐시 유무와 무관하게 결과가 맞는지만 확인, 시간 예산 단언 없음 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| 규칙 | 대상 테스트 |
|---|---|
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다(READ⊂EDIT⊂CONFIRM) | B1 수정 — mcm 시드는 이 상수의 손 복제본이므로, 시험은 이 상수를 기준(정답)으로 시드를 대조한다(반대로 상수를 시드에 맞춰 바꾸지 않는다) |
| mdm 백엔드에는 서버 쪽 권한 필터가 없다 — API RBAC 는 BFF(`m-mcm/proxy.ts`→`evaluateApiPolicy`) 한 곳이다(TSK-01-03 D6 (a)) | `MdmSecurityChainTest`(기존, 안 바꿈 — 신뢰 헤더 유무만 봄) + B1 수정(mcm 시드·BFF 키 이음매만 봄, mdm HTTP 403 을 기대하지 않는다) |
| DRAFT 비소유자 저장·확정 거부는 dmc·dme 가 같은 `VersionStateService`/`VersionWriteGuard`/`DraftOwnershipService` 로 판정한다 | `CodeConfirmServiceSqliteTest`·`RuleConfirmServiceTest`(기존, 안 바꿈) + B2 신규 |
| domainMng·dataItemMng 에는 DRAFT 소유권 개념이 없다(스키마에 OWNER_ID 없음) | B2 — 두 화면을 대상에서 뺀다(지어내지 않는다) |
| `RuleEvaluator`/`ExpressionRunner`는 평가마다 새 `Expression`을 만든다(컴파일 캐시 없음, D17 미해결) — 이 사실 자체를 이 작업이 고치지 않는다 | build-log.md·defects.md 기록으로만 남긴다(테스트 단언 없음) |
| `MdmEngineConfig`의 `CodeLookup`·`MasterLookup` 빈은 등록하지 않는다(D-077, 프로덕션 불변) | B3 — 시험 전용 `MdmEvaluator` 인스턴스로만 우회하고 `MdmEngineConfig`·`@Component` 는 건드리지 않는다 |
| 이 작업은 선행 WP 의 프로덕션 소스(`src/**/main/**`)를 고치지 않는다 — 시험 파일만 만든다(D5 가 (b)로 뒤집히면 `mcm/build.gradle`집계 줄 1개는 예외) | 커밋 diff 로 확인(`git show --stat`) |
| MSSQL 은 폐지 대상이다 — 이 작업은 MSSQL 마이그레이션·`mssqlTest` 소스셋·MSSQL 방언 분기·MSSQL 관련 문서를 새로 만들거나 고치지 않고, SQLite 만 다룬다(팀장 지시 2026-09-26). 기존 MSSQL 코드는 지우지도 않는다 | 커밋 diff 로 확인(`db/migration/mdm/mssql`·`mssqlTest` 경로 무변경) |
| `DataInitializer`의 시드 SQL(값 포함)은 고치지 않는다 — B1 은 대조만 하고 시드를 상수에 맞춰 고치지 않는다(프로덕션 불변) | 커밋 diff 로 확인(`DataInitializer.java` 무변경) |

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | `mdm/api/.../MdmOasisActionVocabularyTest.java`(수정, mcm 시드↔`MdmPermissions` 대조) + `shared/tests/unit/rbac-policy.unit.test.ts`(수정, BE↔FE 키 이음매) | 역할 2종×화면·액션 권한 매트릭스(23개 BPMN 화면 커버리지 포함) | `MdmPermissions` 상수가 단일 진실 소스, `DataInitializer` 시드 SQL 불변 |
| B2 | `.../contract/version/DraftOwnershipCrossModuleTest.java`(신규) | dmc·dme DRAFT 비소유자 거부 교차 | 공용 버전 상태 서비스, domainMng·dataItemMng 해당 없음 |
| B3 | `.../itest/CodeDataRuleLedgerChainTest.java`(신규) | CODE→코드확정→데이터등록→룰 MASTER 확정→판정(+1만 행) | `MdmEngineConfig` 빈 미등록 불변, 컴파일 캐시 미단언 |

B1 은 `mdm/api`(Java)와 `shared`(TS) 양쪽에 걸치지만 B2·B3 와 파일이 겹치지 않고 서로의 산출물에 기대지 않으므로
따로 묶을 수는 있다. 다만 확신이 서지 않아(phase-design.md 「확신이 없으면 묶지 않는다」) B2·B3 는 같은 Gradle
모듈(`mdm/api` 테스트) 안이라 병렬 묶음 조건(다른 컴파일 범위)을 만족하지 못한다 — 세 단위 모두 순차로 진행한다.
B3 가 가장 크고 다른 두 단위의 조사 결과에 기대지 않으므로 순서는 자유롭다 — 다만 실패 시 재현·롤백 범위를 좁히려면
B1→B2→B3 순으로 한다.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: 해당 없음 — 기준선 `testAll`은 `mssqlMigrationTest`를 포함하지 않는다(TSK-09-01 기준선 기록과
  동일). B1~B3 는 모두 기본 `test` 소스셋(SQLite)에 둔다 — 새 `mssqlTest` 클래스를 만들지 않는다.
- 확인하지 못한 수용 기준: "성능 기준 충족" 중 서버 NFR-1(컴파일 캐시) 은 도커 금지가 아니라 **해당 기능이 아직
  구현되지 않아서** 확인 불가하다(§4 참조, 도커 무관 사유이므로 이 절의 "생략" 표에는 해당하지 않지만 승인자 판단을
  돕기 위해 병기한다). 도커 금지로 생략한 검증은 없다.

## 담당자 확인 필요 결정

근거의 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

### D1 — MASTER(마스터데이터) 조회의 프로덕션 배선을 이 작업이 대신 만들 것인가

- **질문**: §0.1 에서 확인한 대로 `MasterLookup`(마루 데이터 대상) 프로덕션 구현·빈 등록은 어느 WP 에도 배정된 적이
  없다. 이 상태로는 B3 6단계("원장 기준 판정 일치")를 프로덕션 배선으로는 확인할 수 없다.
- **선택지**: (a) 이 itest 가 시험 전용 wiring(§3 B3 4단계, `MdmEngineConfig`는 안 건드림)으로 시나리오를 완성하고,
  운영 배선 부재는 defects.md 에 DF 로 남겨 다른 WP(제안: TSK-07-0x 계열 또는 새 Task)에 넘긴다 / (b) 이 작업이
  먼저 운영 `MasterLookup` 빈을 만들고 등록한다 / (c) 6단계를 이번 회차에서 빼고 1~3단계(등록·확정)만 확인한다
- **택한 것**: (a) 를 기본으로 하고, Build 중 (a)의 어댑터 조립이 스키마 불일치 등으로 막히면 (c)로 좁힌다(막힌
  지점을 defects.md 에 남긴다)
- **근거와 강약**: itest 는 프로덕션 코드를 고치지 않는다(TSK-09-01 불변 규칙, 이 리포의 확립된 관례 — (b) 를
  기각). spec 은 "판정 일치"만 요구하고 배선 주체를 정하지 않았다(중립). D-077 이 "운영 등록 여부는 TSK-06-05
  이후 판단"이라고 명시했으므로 그 판단은 사람의 몫이지 itest 워커의 몫이 아니다.
- **반려되면 재작업 방향**: (c) 로 확정되면 B3 는 1~3단계만 남기고 4~6단계를 통째로 defects.md 로 옮긴다(코드
  재작업 없음, 시험 범위만 좁힘). (b) 로 뒤집히면 별도 Task(운영 빈 등록 + TSK-04-03 R10·MASTER 판정 자동 전환의
  파급 확인, D-077 이 이미 경고한 부작용)가 먼저 필요하고 이 itest 는 그 뒤에 재개한다.

### D2 — 서버 NFR-1(컴파일 캐시) 미구현을 이 작업의 "성능 기준 충족"에서 어떻게 판정할 것인가

- **질문**: PRD NFR-1 "서버 룰 판정은 컴파일 캐시를 쓴다"가 사실이 아님을 §0.3 에서 코드로 확인했다(D17 미연결).
  spec 의 "성능 기준 충족"이 이 부분을 포함하는지, 포함한다면 이 작업이 실패로 봐야 하는지 애매하다.
- **선택지**: (a) 캐시 부재를 결함(DF)으로 기록하고 "성능 기준 충족"의 서버 캐시 부분은 "확인 불가"로 남긴다(화면
  NFR-1·판정 정확성은 별도로 충족) / (b) 이 작업이 `ExpressionRunner`에 캐시를 직접 추가한다 / (c) 새 ms 기준
  시험을 만들어 (느리게) 통과/실패 여부로 판정한다
- **택한 것**: (a)
- **근거와 강약**: (b) 는 itest 범위(프로덕션 코드 불변)를 벗어난다 — 캐시 추가는 D17 을 배정받은 WP(TSK-03-02
  계열) 몫이다. (c) 는 evalex-perf 가 이미 여러 Task 를 괴롭힌 부하 flake 패턴을 서버 쪽에 하나 더 만들 뿐이고,
  캐시가 없는 채로는 어떤 ms 기준을 잡아도 구조적으로 의미가 없다(측정할 대상이 아직 없다).
- **반려되면 재작업 방향**: (c) 를 요구하면 먼저 캐시 없는 현재 구현의 1만 행 판정 실측 시간을 재고 그 값에 여유를
  둔 기준을 새로 정해야 한다(캐시가 생기면 다시 낮춰야 하는 임시 기준). (b) 로 바뀌면 이 작업이 아니라 별도 Task 로
  캐시를 추가하고, 이 itest 는 그 결과를 재사용해 성능 시험을 다시 설계한다.

### D3 — itest 관통 시나리오를 브라우저(Playwright)로도 만들 것인가 (TSK-09-01 D2 재사용)

- **질문**: `e2e.md`는 itest 의 관통 시나리오도 브라우저로 돌리라 하지만, 이 작업 검증 명령 5개에 `pnpm test:e2e`
  (Playwright)가 없다. TSK-09-01 이 이미 같은 충돌을 겪었다.
- **선택지**: (a) 백엔드 `@SpringBootTest`(HTTP)로만 관통 시나리오를 확인하고 새 Playwright spec 은 만들지 않는다
  (각 화면의 기존 독립 E2E 가 화면별 등록·검증은 이미 본다) / (b) 새 Playwright spec 을 게이트 밖(정보 제공용)으로
  추가해 한 번 실행하고 결과만 보고한다 / (c) 기준선에 `pnpm test:e2e` 를 추가하도록 오케스트레이터에게 요청한다
- **택한 것**: (a)
- **근거와 강약**: TSK-09-01 D2 와 완전히 같은 상황(기준선 5개 명령에 Playwright 없음, 프롬프트 "검증 명령은 기준선
  명령 줄만 쓴다"가 spec 본문보다 이 세션에서 더 강하게 작용)이라 그 판단을 그대로 재사용한다. 강도: 중(선례 재사용).
- **반려되면 재작업 방향**: (b) 로 바뀌면 B3 완료 뒤 새 구현 단위 B4 를 만들어 Playwright spec 하나(예:
  `mdm-code-data-rule-ledger-chain.spec.ts`)를 추가하고, 완료 보고에 "게이트 밖, 실행 결과: …"를 명시한다. (c) 면
  오케스트레이터가 기준선을 다시 재는 별도 절차를 밟는다.

### D4 — 발견 결함의 defect Task 등록을 이 작업에서 할 것인가 (TSK-09-01 D3 재사용)

- **질문**: 수용 기준 2 는 "발견 결함은 해당 기능 WP 에 defect Task 로 등록됨"이다. 팀원(워커)은 서버 쓰기가 자기
  주문 하나로 제한되어 다른 WP 에 Task 를 만들 수 없다.
- **선택지**: (a) 결함을 `defects.md` 에 WP·재현 절차와 함께 기록하고 완료 보고에 건수를 실어, 등록은 팀장·사람이
  한다 / (b) 이 작업에서 D'Flow 에 defect Task 를 직접 만든다
- **택한 것**: (a)
- **근거와 강약**: 팀원 서버 쓰기 범위 규칙(worker-prompt 「5」)이 (b)를 금지한다. spec 은 등록 주체를 정하지
  않았다(중립). TSK-09-01 D3 와 동일한 상황이라 그 판단을 재사용한다. 강도: 중(리포 확립 관례).
- **반려되면 재작업 방향**: 팀장·사람이 `defects.md` 의 항목을 그대로 해당 WP 의 defect Task 로 옮긴다(코드
  재작업 없음).

### D5 — B1 을 어디에 두는가 — 게이트 실행 그래프 밖에 두지 않는다

- **질문**: §0.2 에서 dry-run 으로 확인한 대로 `mcm`(포함 빌드)의 `build.gradle`엔 `mdm/build.gradle:63-64`같은
  서브프로젝트 `test` 집계 줄이 없다. `./gradlew testAll --dry-run`(직접 실행함) 의 태스크 그래프에 `:mcm:api:test`·
  `:mcm:lib:test`가 없고 `:mcm:test`(무소스)만 있다 — `mcm/api`에는 `src/test`조차 없고, `mcm/lib/src/test`의 유일한
  파일(`SampleNoticeServiceTest.java`, mdm 무관)도 지금 이 이유로 게이트 밖이다(이 사실 자체는 이 작업이 만든 게
  아닌 기존 게이트 사각지대라 별도 DF 로도 남긴다). B1(i)("mcm 시드가 `MdmPermissions`와 같은가")를 가장 직접적으로
  검증하려면 mcm 쪽에 `@SpringBootTest`를 두고 실제 `DataInitializer`를 돌려 `UserPermCache.toKeyStrings`를 보는
  것이 이상적이지만, 그 위치에 두면 `testAll`이 영원히 그 시험을 돌리지 않는다.
- **선택지**: (a) 게이트 안에서 실제로 도는 위치(`mdm/api`의 `MdmOasisActionVocabularyTest`, 이미 `testAll`에
  포함됨이 확인된 파일)에 두고, `DataInitializer.java`를 소스 텍스트로 읽어 대조한다(§3 B1 로 이미 설계함) — 실제
  시드 실행·`UserPermCache` 호출은 타지 않고 "소스가 계약과 같은가"만 본다 / (b) `mcm/build.gradle`에
  `tasks.named('test') { dependsOn(subprojects.collect { "${it.path}:test" }) }`(mdm 과 완전히 같은 줄) 를 더해
  집계를 켜고, `mcm/api`에 새 `@SpringBootTest`를 둬 실제 `DataInitializer`가 채운 임시 SQLite 를 `UserPermCache.
  toKeyStrings`로 직접 확인한다 / (c) B1(i) 자체를 이번 회차에서 빼고 DF 로만 남긴다
- **택한 것**: (a)
- **근거와 강약**: (b) 는 팀 전체의 mcm 게이트 구성을 바꾸는 공유 자원 변경이고, 켜는 순간 `mcm/lib`의 기존
  `SampleNoticeServiceTest`가 처음으로 게이트에 들어와 그 시험의 현재 통과 여부(지금까지 한 번도 검증된 적 없음)
  까지 이 작업의 책임 범위로 끌려온다 — itest 범위(시험 파일만 추가, 공유 게이트 구성은 안 바꿈)를 벗어난다. (a) 는
  "소스 텍스트 대조"라 `UserPermCache`의 실제 런타임 동작(캐시 TTL, 역할그룹 체인)까지는 못 보지만, 그 부분은
  이미 §0.2(ii)에서 코드로 확인한(`PermKey`의 `toLowerCase()`) 안정된 계약이라 실행까지 재확인할 필요가 적다.
  강도: 중(게이트 안전이 spec 의 "전 항목 통과"보다 이 세션에서는 우선 — 실행되지 않는 시험은 "통과"의 증거가
  못 된다).
- **반려되면 재작업 방향**: (b) 로 바뀌면 팀장이 `mcm/build.gradle` 집계 변경을 별도로 승인하고, `SampleNoticeServiceTest`
  가 새로 게이트에 들어와 실패하면(가능성 있음, 지금까지 미검증) 그 실패를 이 작업 탓으로 셀지 먼저 정해야 한다.
  그 뒤 B1 은 `mcm/api`에 새 `@SpringBootTest`로 다시 쓴다. (c) 면 B1 은 (ii)/(iii)(공용 셸)만 남기고 (i)은
  `defects.md`에 "게이트 배치 결정 전이라 확인 못함"으로 올린다.
