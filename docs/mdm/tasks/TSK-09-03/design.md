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
기존 자산은 없다(mdc/mdd/dme 어디에도 서로를 잇는 `*Flow*Test`·`*Chain*Test` 가 없음, 확인함).

### 0.2 "역할 2종 × 화면·액션 권한 매트릭스, DRAFT 소유권 교차(비소유자 저장 거부)"

- 매트릭스의 **단일 진실 소스**는 `mdm/lib/contract/security/MdmPermissions.java`의 `MATRIX`(그룹×역할→권한 3종
  READ/EDIT/CONFIRM)·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS`(포함 관계 READ⊂EDIT⊂CONFIRM, CONFIRM−EDIT=
  {confirm})다. 역할 2종은 `MdmRoles.STD_ADMIN`(`MDM_STD_ADMIN`)·`STEWARD`(`MDM_STEWARD`). 이 작업의 depends 4그룹
  (DMA 용어도메인·DMC 마스터코드·DMD 마스터데이터·DME 업무기준)의 실제 매트릭스: DMA(STD_ADMIN=EDIT,STEWARD=READ),
  DMC(STD_ADMIN=READ,STEWARD=CONFIRM), DMD(STD_ADMIN=READ,STEWARD=EDIT), DME(STD_ADMIN=READ,STEWARD=CONFIRM).
- 그런데 실제 시드(`mcm/api/.../init/DataInitializer.java`의 `seedMdmObjectRbac(objectId, groupCode)`)는 **이 상수를
  import 하지 않는 하드코딩 복제본**이다 — 시드가 상수에서 드리프트할 위험이 이미 있다(확인함, 아직 아무 시험도 이를
  보지 않는다).
- 서버 가드는 2단이다: ① `EndpointPermissionFilter`(mcm-core, `OncePerRequestFilter`)가 URL 을 `PermKey`로 파싱해
  `SecRoleMapping` 캐시로 403/통과를 가른다(화면·액션 단위). ② `MdmStdAdminGuard`/`MdmStewardGuard`(`mdm/lib/common/
  security`)는 역할만 보는 보조 가드(dme 는 `RuleStewardCheck` 경유만 허용되고 `DmeRoleCheckArchitectureTest`(ArchUnit)
  가 강제한다).
- 기존 `MdmSecurityChainTest`(`common/security`, TSK-01-03)는 인증 헤더 유무만 보고(401/actuator), 역할별 화면·액션
  통과/거부는 안 본다. 인증 헤더 패턴은 이미 확인함: `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`.
  `SecurityScreenContractTest`는 상수만 단위검증(HTTP 없음). `MdmOasisActionVocabularyTest`는 04·08 BPMN 만 보고
  06(codeConfirm)·07(dataItemMng)은 빠졌다. **04·06·07·08 을 실제 HTTP 로 가로지르는 권한 매트릭스 시험은 없다.**
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

세 요구사항 모두 **프로덕션 코드를 고치지 않고 시험만 추가한다**(itest 범위, TSK-09-01 과 같은 원칙). 세 갭은 서로
다른 새 파일에 있어 파일이 겹치지 않는 독립 구현 단위 셋(B1~B3)으로 나눈다. 세 단위 모두 같은 Gradle 모듈(`mdm/api`
테스트 소스셋)에 있어 병렬 묶음 조건(컴파일 범위가 다를 것)을 만족하지 못하므로 **순차로 진행한다**(TSK-09-01 의
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
작업은 그 스키마에 서비스 API 로 행만 넣는다 — 마이그레이션 파일을 만들 이유가 없다). 이 작업은 새 마이그레이션을
추가하지 않으므로 `MdmFlywayVersionParityTest`·`*DdlParityTest` 류(SQLite·MSSQL 버전·DDL 짝 맞춤 검사)에 이 작업이
새로 노출시키는 실패는 없다 — 다만 기점에 남아 있는 이 시험들 자체가 다른 이유로 실패하면(짝 없는 MSSQL, 팀장 쪽
별도 브랜치가 그 코드를 지울 예정) 그 실패는 팀장 지시로 예상된 실패로 인정하고 이 작업 탓이 아니면 신규 실패로
세지 않는다.

## 2. 변경 파일 목록

**생성**
- `docs/mdm/tasks/TSK-09-03/design.md` — 이 문서
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/security/RolePermissionMatrixHttpTest.java` — B1
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/contract/version/DraftOwnershipCrossModuleTest.java` — B2
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/itest/CodeDataRuleLedgerChainTest.java` — B3
- `docs/mdm/tasks/TSK-09-03/defects.md` — 조건부. B1~B3 실행 중 기존 코드 결함(0.1·0.3 의 배선 부재 포함)이 실제로
  판정을 막으면 만든다. 결함이 없으면 만들지 않는다.

**수정**: 없음(선행 WP 의 프로덕션 소스·기존 테스트 파일을 고치지 않는다).

## 3. 테스트 전략

세 단위 모두 기존 게이트 명령 안에서 돈다(`gradlew testAll`). 새 게이트 명령을 추가하지 않는다.

| 단위 | 새 시험 | 도는 명령 |
|---|---|---|
| B1 | `RolePermissionMatrixHttpTest` | `cd src/backend && … ./gradlew testAll …` |
| B2 | `DraftOwnershipCrossModuleTest` | 〃 |
| B3 | `CodeDataRuleLedgerChainTest` | 〃 |

### B1 — 역할 2종 × 화면·액션 권한 매트릭스 (HTTP)

`@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)` + `MdmSecurityChainTest` 와 같은 인증 헤더 패턴
(`X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`)으로 실제 OASIS 엔드포인트를 두드린다. **시드나
하드코딩 복제본을 쓰지 않고 `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 상수에서 매트릭스
를 만든다** — 그래야 `DataInitializer.seedMdmObjectRbac` 시드가 상수에서 드리프트하면 이 시험이 그 자체로 드러낸다
(드러나면 결함으로 기록, 상수 쪽을 정답으로 본다).

이 작업 depends 범위의 4그룹 각 1개 대표 화면(`MdmScreenGroup`): DMA→`mdt/domainMng`, DMC→`mdc/codeConfirm`,
DMD→`mdd/dataItemMng`, DME→`mdr/ruleConfirm`. 그룹마다 "허용 tier 안 액션 1개(예: search 또는 tier 고유 액션)"와
"허용 tier 바로 위 액션 1개(예: DMA STEWARD 의 save, DMC STD_ADMIN 의 save·confirm, DMD STD_ADMIN 의 save)"를
호출해 200(또는 컨트롤러 도달 — 바디 검증 없이 403 이 아님만 본다)·403 을 확인한다(2역할×4그룹×2액션=16 호출).
**Build 착수 시 먼저 할 일**: `EndpointPermissionFilter` 가 실제로 만드는 `PermKey`(module/objId/action) 모양과
`SecRoleMapping` 시드 조회 조건을 grep 해, 위 16 호출이 403/200 을 가르는 진짜 조건과 맞는지 확인하고 다르면 여기
설계를 그대로 두고 build-log.md 「설계 이탈」에 실제 조건을 적는다.

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
1. `mdt/domainMng.save` 로 CODE 종류 도메인(마루 코드 참조 포함)을 등록한다(TSK-04-03 자체 검증 재사용).
2. `mdc/codeConfirm` 경로로 새 마루 코드 버전을 확정(DRAFT→RELEASED)한다(TSK-06-05 확정 경로 그대로 재현).
3. `mdd/dataItemMng`(또는 CSV 업로드)로 2번 마루 코드 값을 참조하는 마스터데이터 항목을 등록한다.
4. **여기서 이 작업이 새로 조립하는 것**: 운영 빈이 없는 `CodeLookup`·`MasterLookup`을 시험 전용으로 만든다 —
   `new MdmCodeLookup(ledger)`(`ledger`=`MasterCodeLedgerQueries`, 2번이 만든 실제 원장)와, 3번이 만든 실제
   TB_MDM_DATA_ITEM 행을 읽어 `MasterDataRows`로 매핑하는 새 어댑터(이 시험 파일 안의 private 헬퍼, 프로덕션 코드
   아님) + `MasterDataResolver`. 이 둘을 `MdmEngineConfig.lookups(codes, masters, FunctionProvider.NONE)`로 감싸
   `new MdmEvaluator(lookups)`를 만든다("운영 빈이 등록됐다면"의 모습 그대로 재현 — `MdmEngineConfig` 자체는
   고치지 않는다).
   **Build 착수 시 먼저 할 일**: TB_MDM_DATA_ITEM(+카테고리·소속) 을 읽는 기존 클래스가 있는지(`DataItemListQuery`
   등) grep 하고, 있으면 그것을 재사용해 매핑하고 없으면 JPA 엔티티를 직접 읽어 매핑한다. 어느 쪽인지 build-log.md
   에 남긴다.
5. `mdr/ruleEdit`로 `MASTER("<2번 마루코드>", "<카테고리>", <3번에서 등록한 키>)`를 참조하는 룰을 만들고, 룰 저장
   시 검사(TSK-08-04)를 통과시킨 뒤 `mdr/ruleConfirm`으로 확정(TSK-08-05 확정 경로 재현)한다.
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
| 권한 매트릭스 전 항목 통과 | B1(신규) `RolePermissionMatrixHttpTest` — `MdmPermissions.MATRIX` 기준 4그룹×2역할×2액션. 시드(`DataInitializer`)가 상수와 다르면 실패로 드러나고 결함으로 기록 |
| DRAFT 소유권 교차(비소유자 저장 거부) | B2(신규) `DraftOwnershipCrossModuleTest` — dmc·dme 교차만(domainMng·dataItemMng 는 해당 없음) |
| 성능 기준 충족 — 화면 NFR-1(1만 행 100ms) | 기존 자산 `m-mdm/tests/evalex-perf.test.ts`(TSK-03-04). 손대지 않는다. 이미 기준선 m-mdm test 안에서 통과 중(부하 민감 flake 는 TSK-09-01 D 결정과 같은 취급) |
| 성능 기준 충족 — 서버 NFR-1(컴파일 캐시) | **확인 불가(결함)**: `ExpressionRunner`에 컴파일 캐시가 없다(§0.3). 새 ms 기준 시험을 만들지 않고 DF 로 기록한다 — 이 항목은 이 작업만으로 "충족"으로 판정할 수 없다(「담당자 확인 필요 결정」 D2) |
| 성능 기준 충족 — 1만 행 규모 판정 정확성 | B3 6단계(신규) — 캐시 유무와 무관하게 결과가 맞는지만 확인, 시간 예산 단언 없음 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| 규칙 | 대상 테스트 |
|---|---|
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다(READ⊂EDIT⊂CONFIRM) | `RolePermissionMatrixHttpTest`(신규) — 이 상수에서 매트릭스를 만들어야 하고, 하드코딩 복제본을 새로 만들지 않는다 |
| `EndpointPermissionFilter`는 인증 헤더 없는 호출을 401, 권한 밖 호출을 403 으로 막는다 | `MdmSecurityChainTest`(기존, 안 바꿈) + B1 신규 |
| DRAFT 비소유자 저장·확정 거부는 dmc·dme 가 같은 `VersionStateService`/`VersionWriteGuard`/`DraftOwnershipService` 로 판정한다 | `CodeConfirmServiceSqliteTest`·`RuleConfirmServiceTest`(기존, 안 바꿈) + B2 신규 |
| domainMng·dataItemMng 에는 DRAFT 소유권 개념이 없다(스키마에 OWNER_ID 없음) | B2 — 두 화면을 대상에서 뺀다(지어내지 않는다) |
| `RuleEvaluator`/`ExpressionRunner`는 평가마다 새 `Expression`을 만든다(컴파일 캐시 없음, D17 미해결) — 이 사실 자체를 이 작업이 고치지 않는다 | build-log.md·defects.md 기록으로만 남긴다(테스트 단언 없음) |
| `MdmEngineConfig`의 `CodeLookup`·`MasterLookup` 빈은 등록하지 않는다(D-077, 프로덕션 불변) | B3 — 시험 전용 `MdmEvaluator` 인스턴스로만 우회하고 `MdmEngineConfig`·`@Component` 는 건드리지 않는다 |
| 이 작업은 선행 WP 의 프로덕션 소스(`src/**/main/**`)를 고치지 않는다 — 시험 파일만 만든다 | 커밋 diff 로 확인(`git show --stat`) |
| MSSQL 은 폐지 대상이다 — 이 작업은 MSSQL 마이그레이션·`mssqlTest` 소스셋·MSSQL 방언 분기·MSSQL 관련 문서를 새로 만들거나 고치지 않고, 기존 MSSQL 코드를 지우지도 않는다(2026-09-26 결정) | 커밋 diff 로 확인(`db/migration/mdm/mssql`·`mssqlTest` 경로 무변경) |

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | `.../common/security/RolePermissionMatrixHttpTest.java`(신규) | 역할 2종×화면·액션 권한 매트릭스(HTTP) | `MdmPermissions` 상수가 단일 진실 소스, `EndpointPermissionFilter` 401/403 |
| B2 | `.../contract/version/DraftOwnershipCrossModuleTest.java`(신규) | dmc·dme DRAFT 비소유자 거부 교차 | 공용 버전 상태 서비스, domainMng·dataItemMng 해당 없음 |
| B3 | `.../itest/CodeDataRuleLedgerChainTest.java`(신규) | CODE→코드확정→데이터등록→룰 MASTER 확정→판정(+1만 행) | `MdmEngineConfig` 빈 미등록 불변, 컴파일 캐시 미단언 |

세 단위는 같은 Gradle 모듈(`mdm/api` 테스트) 안이라 병렬 묶음 조건(다른 컴파일 범위)을 만족하지 못한다. 순차로
진행한다. B3 가 가장 크고 다른 두 단위의 조사 결과(특히 B1 의 `PermKey` 확인)에 기대지 않으므로 순서는 자유롭다 —
다만 실패 시 재현·롤백 범위를 좁히려면 B1→B2→B3 순으로 한다.

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

- **택한 것**: 백엔드 `@SpringBootTest`(HTTP)로만 관통 시나리오를 확인하고 새 Playwright spec 은 만들지 않는다.
- **근거**: TSK-09-01 D2 와 완전히 같은 상황(기준선 5개 명령에 `pnpm test:e2e` 없음). 그 판단을 그대로 재사용한다.

### D4 — 발견 결함의 defect Task 등록을 이 작업에서 할 것인가 (TSK-09-01 D3 재사용)

- **택한 것**: 결함을 `defects.md` 에 WP·재현 절차와 함께 기록하고 완료 보고에 건수를 실어, 등록은 팀장·사람이 한다.
- **근거**: 팀원 서버 쓰기 범위 규칙이 직접 등록을 금지한다. TSK-09-01 D3 와 동일.
