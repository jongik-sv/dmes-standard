# TSK-09-02 설계 — 영역 통합: 마스터코드·마스터데이터·업무기준

## 0. 조사 요약 (다음 Phase 가 컨텍스트로 삼는다)

이 작업은 `category: itest`·`domain: test`·`entry-point: -` 다(화면 작업 트리거 조건에 해당하지 않아 `references/e2e.md`
는 읽지 않는다). 새 기능을 만들지 않고, 이미 완료·머지된 11개 선행 작업(TSK-06-02~06-05 마루 코드, TSK-07-02~07-04
마루 데이터, TSK-08-02~08-06 업무기준 룰)이 서로 맞물리는 지점에서 개별 화면·서비스 단위 시험이 못 보는 이음매를 찾아
새 시험으로 메우는 것이 일이다. 세 병렬 서브에이전트(Explore 성격의 general-purpose, sonnet)로 각 요구사항의 기존
자산·프로덕션 배선·갭을 조사했다.

### 0.1 "PROC_CD·STEEL_STD·EQP_CD 샘플로 등록→편집→확정 흐름, 원장 기준 MASTER_AT 판정이 판정 표와 일치"

- **등록→편집→확정 체인 = 이미 있음.** `CodeConfirmSampleHistorySqliteTest`
  (`src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeConfirm/CodeConfirmSampleHistorySqliteTest.java`)가
  `codeMng.register → codeItemEdit.save · codeCateEdit.save → codeConfirm.confirm → codeEdit.createVersion → 저장 →
  확정`을 PROC_CD로 재현해 04 「샘플 데이터」(04:1059-1080)의 v1.000→v1.001 이력과 정확히 같은 결과를 낸다(코드
  1P/82/83/2P, 카테고리 BASE/COATING/MAJOR/COLD_MILL). TSK-09-01의 termMng/domainMng/columnMng와 달리 이 세 화면은
  이미 한 체인으로 이어져 있다 — **이 부분은 새로 만들 것이 없다.**
- **그러나 이 체인은 MASTER_AT 판정 엔진을 전혀 부르지 않는다.** 검증은 테이블 행 상태(VER·ITEM·CATE_ITEM)까지만 하고
  "이 코드가 이 기준일에 유효한가"는 확인하지 않는다.
- **"원장 기준" MASTER_AT의 실제 구현**은 `MdmCodeLookup`
  (`src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/MdmCodeLookup.java`, SPI `CodeLookup` 구현,
  `MasterCodeLedgerQueries`로 TB_MDM_CODE 계열을 직접 읽는다)이다. **이 클래스는 운영 Spring 빈으로 등록돼 있지 않다**
  — `MdmEngineConfig`(`src/backend/mdm/lib/.../common/engine/MdmEngineConfig.java`)는 `CodeLookup` 빈이 없으면
  `EMPTY_CODES`로 채우고, 자체 결정 주석(D-077/D5, "운영 CodeLookup 빈이 생기면 R10 거부와 MASTER 판정이 자동으로
  켜진다... 운영 등록 판단은 06-05 이후다")과 테스트 `MasterCodeDeprecateEngineSqliteTest.G0_운영_CodeLookup_빈은_없다()`가
  이 상태를 의도적으로 확인해 둔다. 즉 **지금 실행 중인 서버는 원장을 읽는 MASTER_AT 판정을 실서비스로 하지 않는다** —
  이건 04-master-code-deploy-full.md의 "판정 참고 구현"이 MDM 원장 서버 자신이 아니라 **하위 시스템(사본)의 구현 지침**이란
  뜻이다(같은 이유로 `CodeLookup`은 "04 원장 미구축" D2로 항상 비어 있다, `MdmEngineConfig` 클래스 Javadoc). `MdmCodeLookup`은
  이미 그 판정 로직을 시험용으로 조립할 수 있게 만들어 둔 프로덕션 클래스이며, `MasterCodeDeprecateEngineSqliteTest`가
  `new DefaultCodeResolver(new MdmCodeLookup(ledger), ...)`로 직접 조립해 쓰는 선례가 있다(다만 코드 A/B 합성 데이터로
  폐기 검사만 한다).
- **판정 표 두 가지가 문서에 따로 있다.** (a) 04 「판정 참고 구현(사본 쿼리)」 절의 4행 예제(코드 81-84, 버전
  1.000/1.001/1.002, base_dt 4개)는 `DefaultCodeResolverTest.원천04_판정_표와_같다`(`maru-mdm-engine`,
  `InMemoryLookups` 픽스처)가 이미 검증한다 — **원장(실제 DB) 대신 인메모리로만.** (b) 04 「샘플 데이터」 절 자체가
  "해석 결과(V = 1.001): BASE = {1P, 2P, 82, 83}, COATING = {82, 83}, MAJOR = {1P, 2P, 82}, COLD_MILL = {1P, 2P}"라는
  문장으로 PROC_CD 체인이 만드는 바로 그 데이터의 기대 판정을 이미 적어 뒀다 — 이것이 이 작업이 검증해야 할 "판정 표"로
  더 적합하다(아래 D1).
- **STEEL_STD 계층**(04 「계층 예」, KS/KS-3/KS-3-CGCH 등 8행)은 `MasterCodeSamples.java`에 원본 그대로 있고
  `CodeItemEditSampleDataTest.SD6`가 이 샘플로 **저장 검사**(정합성 검사, `sql/04-hier-tree-sim.py` 시뮬레이터와 일치)만
  확인한다. **등록→편집→확정 체인으로 STEEL_STD를 실제 원장에 심는 시험은 없다.** 콤보·트리 "조회" API 자체가 백엔드에
  없다(`lvls` 평면 컬럼만 반환, 트리 조립은 프런트 몫) — 이건 itest가 새로 만들 수 있는 범위가 아니라 그대로 둔다.
- **EQP_CD(EXTERNAL/MES 수신)는 백엔드 구현 자체가 없다.** `grep EQP_CD src/backend --include 프로덕션 소스` 0건,
  `TB_MDM_CODE_RECV`는 마이그레이션 DDL·샘플 SQL에만 있고 이를 채우는 서비스가 없다. `CodeItemEditSampleDataTest.SD7`은
  "조회 전용"만 확인한다 — 04 「샘플 데이터」의 수신 로그 3건(recv 1/2/3) 예제를 재현하는 것 자체가 불가능하다(아래 D3).

### 0.2 "PORT·ORG·CUST 샘플로 화면·CSV 경로가 같은 선분 규칙을 지키고 원장 기준 판정 7케이스 일치"

- **화면·CSV 저장 검사 1~7(5-1·5-2 포함, 05:168-219)은 이미 같은 코드다.** 공용 코어
  `com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore`(트랜잭션·경계) + `DataItemChecks`(CHK1~7)를 `dataItemMng`(화면)와
  `dataCsvUploadPop`(CSV) 서비스가 함께 부른다. `DataSavePath` enum(SCREEN/CSV/API)으로 경로별 분기(검사 6 upsert 여부
  등)만 코어 안에서 가른다 — Javadoc 자체가 "화면·CSV·API 세 경로가 같은 선분 저장을 쓴다(wbs TSK-07-03 fan_in, D3)"라고
  적어 뒀다. `DataItemChecksSqliteTest`(`common/segment/`)가 검사 1~7을 SCREEN·CSV·API 세 경로 모두 **합성(제네릭) 데이터**로
  촘촘히 확인한다. **선분 규칙 동치 자체의 갭은 작다** — 다만 PORT·ORG·CUST란 이름 붙은 설계 샘플로는 안 돈다.
- **원장 기준 판정 7케이스는 정확히 05 「판정 참고 구현(사본 쿼리)」 절의 PORT 표(417-471, KRPUS/KRINC/CNSHA, 카테고리
  BASE/KR/MAJOR)다.** `MasterDataResolverTest.원천05_PORT_판정_7케이스`(`maru-mdm-engine`)가 정확히 이 7행을 CSV
  (`05-port-cases.csv`)로 재현해 통과시킨다 — **단 `PortFixtures`(인메모리 고정값)로만.** 04와 같은 이유로
  `MasterLookup` 빈도 프로덕션에 없다(`grep "implements MasterLookup" src/backend/mdm` 0건 — 마스터데이터 쪽은 마스터코드의
  `MdmCodeLookup`에 해당하는 **원장 접속용 프로덕션 클래스조차 아직 없다**. 엔진 쪽 `MasterDataResolver`
  (`maru-mdm-engine` **main** 소스, `kr.dongkuk.maru.mdm.engine.code.MasterDataResolver`)는 04와 같은 설계로 "행 공급
  함수"를 인자로 받는 일반 구현이라, 이 함수 인자에 TB_MDM_DATA 계열을 읽는 JdbcTemplate 조회를 시험 코드 안에서
  꽂아 넣으면 새 프로덕션 클래스 없이도 원장을 읽을 수 있다(아래 「구현 단위」 B2).
- **ORG 계층**: `sql/04-hier-tree-sim.py`는 오타가 아니라 실재 스크립트(04가 만든 걸 05가 재사용, 05:69)이며 ORG 표본
  (05:71-77, 5행)과 이미 대조돼 있다 — 단 **프런트엔드 vitest**(`src/frontend/m-mdm/tests/dmd/dataItemMng/item-tree.test.ts`)
  뿐이고 **백엔드 itest는 없다.**
- **CUST(EXTERNAL/ERP)**: `source_kind=EXTERNAL`이라 화면·CSV 경로는 정상적으로 **거부**돼야 하는 대상이다(05 「저장
  경로와 검증」 검사 2 "원천: 경로와 source_kind가 맞아야 한다"). 정작 CUST의 정규 경로인 수신 API(TB_MDM_DATA_RECV)는
  EQP_CD와 같은 이유로 **프로덕션 서비스가 없다**(엔티티 `MdmDataRecv`/`MdmDataRecvItem`만 존재). 그래서 spec의 "화면·CSV
  경로가 같은 선분 규칙을 지키고"는 PORT·ORG(둘 다 MDM 원천)에는 그대로 적용되지만, CUST에는 **"화면·CSV로 거부되는지"**
  라는 음성 케이스로만 적용된다(아래 D3).

### 0.3 "룰 4종·세트 LS_A3 가 편집부터 확정까지 통과, 서버 판정이 샘플 기대값과 일치"

- `SampleRules.java`(`kr.dongkuk.maru.mdm.engine.rule.fixture`, TSK-03-03에서 **한 커밋**으로 생성)는 샘플 룰 4종
  (QLTY_GRD_JDG·COIL_WGT_CALC·PROD_WGT_CALC·BASE_SPD_LKP) 외에 `SPD_EXC`·`SPD_JOIN`·룰 세트 `lsA3()`(BASE_SPD_LKP →
  SPD_EXC → SPD_JOIN, `TB_MDM_RULE_SET` ID `LS_A3`, 06:1087·1324)까지 **이미 fixture로 만들어 뒀다.** 그런데 같은 커밋의
  `SampleRuleValueTest.java`는 자기 Javadoc대로 "수용 기준 1 — 06 샘플 룰 **넷**의 값 테스트"만 하고 SPD_EXC·SPD_JOIN·
  `evaluateSet("LS_A3")`는 **한 번도 값으로 검증되지 않았다.** TSK-09-01은 이 4종의 **미리보기(행 고르기) 동치**만
  다뤘다(previewRule은 값을 계산하지 않는다는 설계를 그대로 지킴). SPD_EXC·SPD_JOIN·LS_A3 fixture는 정황상 이 작업
  (또는 자매 작업)이 쓰라고 미리 심어 둔 것으로 보인다.
- `MdmRuleEngine.evaluateSet(String setId, Map<String,Object>, Instant)`(`maru-mdm-engine` main, `RuleEngine` 인터페이스
  에도 있음)는 엔진에 이미 있지만, **mdm/lib·mdm/api 프로덕션 코드 어디도 부르지 않는다**(grep 0건). `RuleValueTestService`
  ·`RuleCaseJudge`·`RuleConfirmChecks`·`ExprTypeByCaseCheck` 모두 `SingleRuleDefinitionLookup`으로 **단일 룰**만 평가한다.
  `TB_MDM_RULE_TEST_CASE`도 PK가 `(MARU_RULE_ID, CASE_ID)`라 **룰 1개당** 케이스만 담는다 — 세트 전체의 케이스는 이
  테이블 구조로 표현할 수 없다.
- `ruleEdit`(저장 시 검사·`RuleValueTestService`)·`ruleConfirm`(`RuleConfirmService`, 확정 전 TEST_CASES 재실행)·
  `ruleSetMng`/`ruleSetEdit`(`RuleSetMngService`/`RuleSetEditService`, 구조 검사 4개: EMPTY·RULE_NOT_FOUND·
  RULE_DEPRECATED·NO_RELEASED·ORDER·CYCLE·UNKNOWN_INPUT·DUP_RESULT)는 모두 프로덕션 구현이 있고 각자 독립 테스트가
  있다. 그러나 이 7개 ID(QLTY_GRD_JDG 등 4종 + SPD_EXC·SPD_JOIN·LS_A3)를 실제로 쓰는 OASIS/DB 레벨 테스트는 전부
  **구조 검사·JPA 왕복·계약 스텁의 픽스처 이름**으로만 쓰였을 뿐, 값 판정을 검증한 적이 없다(grep 확인).
- `workrule-column-design.md` §3-1(3CCL 라인스피드, LS_A3)는 체인의 업무 의미(①BASE_SPD_LKP: 두께·칼라 BOM 수지·도장
  면으로 기본 속도 조회 → ②SPD_EXC: 자유식 예외 속도 목록 COLLECT → ③SPD_JOIN: `LINE_SPD = MIN(BASE_SPD, EXC_SPD…)`)만
  설명하고, 구체적 입력→출력 수치 예시는 없다. **기대값은 TSK-09-01·`SampleRuleValueTest`와 같은 방식으로 `SampleRules.java`
  자신의 행·셀 정의에서 손으로 계산해야 한다**(spdExc()·spdJoin() Javadoc이 인용하는 원 설계 줄 번호 H:532-533·WR:33-34
  를 대조 근거로 삼는다).

## 1. 접근 방식

세 요구사항 모두 **프로덕션 코드를 고치지 않고 시험만 추가한다**(itest 범위 — TSK-09-01과 같은 원칙). 세 요구사항은
서로 다른 파일·다른 모듈에 있어 독립 구현 단위 셋(B1~B3)으로 나눈다.

공통으로 반복되는 패턴이 하나 있다: **04·05가 정의하는 "원장 기준 판정"(MASTER/MASTER_AT)은 MDM 서버 자신이 운영
빈으로 켜는 기능이 아니라, 하위 시스템(사본) 구현자를 위한 참고 구현이자 그 로직 자체의 정확성을 시험 코드로 조립해
검증해 두는 대상이다**(D-077/D5, `MdmEngineConfig` Javadoc, `MasterCodeDeprecateEngineSqliteTest` 선례). 이 작업은
이 경계를 존중해 **시험 코드 안에서만** `DefaultCodeResolver`/`MasterDataResolver`를 실제 원장(테스트 DB, 화면 API로
채운 데이터)에 연결해 판정을 확인하고, 운영 Spring 빈을 새로 등록하지 않는다(D2).

**결함 발견 시 처리**(TSK-09-01과 같은 절차): 게이트는 기준선 대비 신규 실패 0이므로 결함을 드러내는 실패 테스트는
커밋하지 않는다. `docs/mdm/tasks/TSK-09-02/defects.md`에 결함마다 `DF-<n>` 번호, 대상 기능 WP(추정), 재현 절차, 기대·
실제 결과를 적어 커밋하고, 그 단언만 빼고 나머지 체인을 검증한다. 테스트 코드에는 `// DF-<n>: defects.md 참조` 주석을
남긴다. 이번 조사로 이미 "결함성 공백"(EQP_CD·CUST 수신 API 미구현, 아래 D3)이 드러나 있어 defects.md는 착수와 함께
만든다.

## 2. 변경 파일 목록

**생성**
- `docs/mdm/tasks/TSK-09-02/design.md` — 이 문서
- `docs/mdm/tasks/TSK-09-02/defects.md` — EQP_CD·CUST 수신 API 미구현 등 발견 사실 기록(D3)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeConfirm/SteelStdLedgerConfirmSqliteTest.java` — B1,
  STEEL_STD 등록→편집→확정 단일 체인(단일 버전)
- `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/SampleRuleSetValueTest.java` — B3,
  SPD_EXC·SPD_JOIN·`evaluateSet("LS_A3")` 값 테스트(`SampleRuleValueTest.java`와 같은 패턴)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetLifecycleOasisFlowTest.java`(정확한
  패키지는 `ruleEdit`/`ruleConfirm`/`ruleSetEdit` 기존 테스트 패키지를 Build 착수 시 확인 후 맞춘다) — B3, 룰 4종
  개별 편집→저장 검사→값 테스트 케이스→확정, LS_A3 세트 등록까지의 OASIS 레벨 생애주기
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/segment/MasterDataLedgerJudgmentSqliteTest.java` — B2,
  PORT·ORG 화면·CSV 등록 + 원장 판정 7케이스 + CUST 화면·CSV 거부

**수정**
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeConfirm/CodeConfirmSampleHistorySqliteTest.java` — B1,
  기존 `@BeforeEach`(PROC_CD v1.000→v1.001 체인)를 재사용해 MASTER_AT 원장 판정 `@Test` 추가. 기존 메서드는 안 바꾼다.

## 3. 테스트 전략

세 단위 모두 기존 게이트 명령 안에서 돈다 — 새 게이트 명령을 추가하지 않는다. 전부 SQLite(비도커) 소스셋에 둔다.

| 단위 | 새 시험 | 도는 명령(기준선 5개 중) |
|---|---|---|
| B1 | `CodeConfirmSampleHistorySqliteTest`(수정) + `SteelStdLedgerConfirmSqliteTest`(신규) | `cd src/backend && … ./gradlew testAll …` |
| B2 | `MasterDataLedgerJudgmentSqliteTest`(신규) | `cd src/backend && … ./gradlew testAll …` |
| B3 | `SampleRuleSetValueTest`(신규, engine) + `RuleSetLifecycleOasisFlowTest`(신규, api) | `cd src/backend && … ./gradlew testAll …` |

### B1 — PROC_CD·STEEL_STD 등록→편집→확정 + MASTER_AT 원장 판정

1. `CodeConfirmSampleHistorySqliteTest`에 새 `@Test`를 추가한다(기존 `@BeforeEach replaySampleHistory()`가 이미
   PROC_CD를 v1.001까지 원장에 심어 둔다 — 새로 심지 않는다).
2. Build 착수 시 `DefaultCodeResolver`(`kr.dongkuk.maru.mdm.engine.code`)와 `MdmCodeLookup`의 실제 생성자 시그니처를
   확인하고(`MasterCodeDeprecateEngineSqliteTest`가 이미 이 조립을 하므로 그대로 베낀다), 그 테스트가 쓰는 `ledger`
   객체(아마 `MasterCodeLedgerQueries` 또는 `JdbcTemplate` 래퍼)를 이 테스트의 `dataSource`/`jdbc`로 어떻게 만드는지
   확인한다.
3. `new DefaultCodeResolver(new MdmCodeLookup(ledger), CodeEffLookup.NONE 또는 동급)`으로 판정기를 조립하고, 04
   「샘플 데이터」의 "해석 결과(V = 1.001)" 문장(BASE = {1P,2P,82,83}, COATING = {82,83}, MAJOR = {1P,2P,82},
   COLD_MILL = {1P,2P})을 base_dt = 2026-09-03(설계 예제와 같은 날) 기준으로 그대로 단언한다(D1).
4. 버전 소급도 한 번 확인한다: base_dt를 v1.001 applyfrom(2026-07-01) 이전(예 2025-01-01)으로 주면 v1.000 상태(83의
   이름이 "3CGl", MAJOR={1P,82}, COLD_MILL={1P}, 2P 없음)로 판정되는지 — 04 판정 참고 구현의 "버전 소급"·"카테고리
   소급" 규칙을 실제 원장으로 확인하는 지점이다.
5. 새 파일 `SteelStdLedgerConfirmSqliteTest.java`(같은 `dmc.codeConfirm` 패키지, `AbstractMdmSharedDbTest` 상속):
   `codeMng.register`(STEEL_STD, `lvl_cnt=3`, `attr01_name=인장강도`) → `codeItemEdit.save`로 04 「계층 예」의 8행(KS-9,
   KS-3-CGCC~CGCH-Z27, JIS-3-CGCC, JIS-4-SPCC, `MasterCodeSamples.java`의 값을 그대로 옮긴다) → `codeConfirm.confirm`
   (단일 버전 1.000, RELEASED)까지 재현하고, 확정 뒤 `TB_MDM_CODE_ITEM`이 원본 8행과 정확히 같은지 단언한다(콤보·트리
   조회 API는 백엔드에 없으므로 다루지 않는다 — 「불변 규칙」에 그대로 적어 범위를 명시한다).
6. EQP_CD는 이 단위에서 다루지 않는다(D3) — `docs/mdm/tasks/TSK-09-02/defects.md`에 DF-1로 기록한다.

### B2 — PORT·ORG·CUST 화면·CSV 선분 규칙 + 원장 판정 7케이스

새 파일 `MasterDataLedgerJudgmentSqliteTest.java`(`common.segment` 패키지, `DataItemChecksSqliteTest`와 같은
`AbstractMdmSharedDbTest` 계열, `DataItemMngService`·`DataCsvUploadPopService` 주입):

1. **PORT — 화면 경로**: `dataItemMng.register`로 KRPUS(2026-08-20 09:00 등록) → `modify`로 이름을 "부산"→"부산항"으로
   (2026-08-25 09:00) → KRINC 등록(2026-08-20) → `close`(2026-09-01) → CNSHA 등록. 카테고리 BASE(REGEX `.*`, 예약)·KR
   (REGEX ATTR01 `^KR$`)·MAJOR(TABLE {KRPUS, CNSHA})를 `dataCateEdit`로 만든다(05 「판정 참고 구현」 예제 그대로,
   417-460).
2. Build 착수 시 `MasterDataResolver`(`kr.dongkuk.maru.mdm.engine.code`, main)의 생성자가 받는 행 공급 함수(항목·
   카테고리·소속 조회자)의 정확한 함수형 인터페이스를 확인하고, 시험 코드 안에서 `JdbcTemplate`으로 TB_MDM_DATA_ITEM·
   TB_MDM_DATA_CATE·TB_MDM_DATA_CATE_ITEM을 직접 읽는 람다를 만들어 그 인자에 꽂는다(새 프로덕션 클래스를 만들지
   않는다 — `MasterDataResolver` 자체가 이미 그렇게 설계돼 있다, 04/05 "판정 참고 구현" 절 서문).
3. 05 「판정 참고 구현」의 PORT 7행 표(id/cate/key/base_dt/결과)를 그대로 단언한다 — 이번엔 `PortFixtures`(인메모리)가
   아니라 위 1번이 실제로 등록한 원장 데이터로.
4. **ORG — 화면 경로**: `dataItemMng.register`로 05:71-77의 5행(HQ-PLN, PH-B, PH-A-PRD, PH-A-MNT, PH-A, `lvl_cnt=2`)을
   등록하고 `TB_MDM_DATA_ITEM`이 원본과 같은지 단언한다(PH-A가 항목이자 그룹인 경우 포함).
5. **PORT/ORG — CSV 경로**: 같은 항목 중 일부(예 KRPUS 이름 재수정, 또는 ORG에 새 항목 1건)를 `dataCsvUploadPop.save`로
   업로드하고, 결과 선분 행(옛 행 `valid_to` 닫힘 + 새 행 `valid_from`, 같은 `chg_seq`)이 화면 경로로 같은 변경을 했을
   때와 **행 모양이 같은지**(닫기·새 행 생성 규칙이 같은지) 단언한다 — 이것이 "화면·CSV 경로가 같은 선분 규칙을
   지킨다"의 직접 확인이다.
6. **CUST — 음성 케이스**: `TB_MDM_DATA.source_kind = EXTERNAL`인 CUST를 화면(`dataItemMng.register`)과 CSV
   (`dataCsvUploadPop.save`) 양쪽으로 등록 시도해 **둘 다 검사 2(원천 불일치)로 거부**되는지 확인한다(05 「저천」 표
   "원천이 아�닌 쪽의 저장 | 거부한다"). CUST의 정규 경로인 수신 API는 프로덕션 구현이 없어 다루지 않는다(D3, DF-2).
   판정(MASTER_AT류) 자체는 이 작업 범위가 아니다 — spec의 "원장 기준 판정 7케이스"는 PORT 표 하나뿐이고 CUST는
   화면·CSV 규칙 확인에만 쓰인다(0.2 절 근거).

### B3 — 룰 4종·세트 LS_A3 편집→확정 + 서버 판정

1. **엔진 값 테스트**(`SampleRuleSetValueTest.java`, `maru-mdm-engine`, `SampleRuleValueTest`와 같은 패키지·같은
   `MdmRuleEngine` 조립 패턴): `SampleRules.spdExc()`·`spdJoin()`의 실제 행·셀 정의를 읽어(파일 Javadoc이 인용하는
   H:532-533·WR:33-34 줄 번호를 손 계산 근거로 옮겨 적는다, `SampleRuleValueTest`의 방식 그대로) 몇 가지 입력에 대한
   기대값을 계산하고, `engine.evaluate("SPD_EXC", ...)`·`engine.evaluate("SPD_JOIN", ...)`·
   `engine.evaluateSet("LS_A3", ...)`(BASE_SPD_LKP의 기존 B1~B3 입력 중 하나를 재사용해 체인 전체의 최종 `LINE_SPD`가
   `MIN(BASE_SPD, EXC_SPD…)`와 손 계산이 같은지)를 단언한다.
2. **OASIS 레벨 생애주기**(`RuleSetLifecycleOasisFlowTest.java`, `mdm/api`): `ruleEdit`로 BASE_SPD_LKP·SPD_EXC·SPD_JOIN
   세 룰을 각각 DRAFT로 저장(열 설정은 `SampleRules.java`의 정의를 그대로 옮긴다) → 저장 시 검사 통과 확인 →
   `TB_MDM_RULE_TEST_CASE`에 1번에서 쓴 것과 같은 입력·기대값을 저장하고 일괄 실행해 통과하는지 확인 → `ruleConfirm`
   으로 셋 다 RELEASED로 확정(TEST_CASES 재실행 포함) → `ruleSetEdit`로 `LS_A3`(순서 BASE_SPD_LKP→SPD_EXC→SPD_JOIN)를
   등록하고 구조 검사 4개(순서·순환·미지 입력·중복 대입)가 통과하는지 확인한다.
3. 세트 전체의 "서버 판정이 샘플 기대값과 일치"는 1번(엔진 레벨 `evaluateSet`)이 확정 답이고, 2번은 "편집부터 확정
   까지 통과"(생애주기 자체)를 확인한다 — `ruleSetEdit` 저장 경로에 `evaluateSet` 호출이 없어(0.3 절) 화면 레벨에서
   세트 최종값을 자동으로 검증할 수는 없다(D4).
4. TSK-09-01과 겹치지 않는지 착수 전 한 번 더 확인한다: TSK-09-01의 B1(`evalex-sample-rule-parity.test.ts`)은
   `previewRule`(JS, 행 고르기)만 다루고 값 계산은 명시적으로 범위 밖으로 남겼다(TSK-09-01 design.md §0.1) — 이 작업의
   `evaluateSet`·`ruleConfirm`·`ruleSetEdit` 생애주기와는 계층이 다르므로 중복이 아니다.

## 4. 수용 기준 매핑

spec의 수용 기준은 두 줄뿐이라, spec 「요구사항」 절의 세 항목까지 함께 매핑한다.

| 항목 | 검증 방법 |
|---|---|
| PROC_CD 등록→편집→확정 + MASTER_AT 판정 | B1 `CodeConfirmSampleHistorySqliteTest` 신규 `@Test`(원장 판정, D1) — 체인 자체는 기존 자산 |
| STEEL_STD 등록→편집→확정 | B1 `SteelStdLedgerConfirmSqliteTest`(신규). 계층 콤보·트리 "조회"는 백엔드 API 부재로 범위 밖 |
| EQP_CD 등록→편집→확정 + 판정 | 확인하지 못함 — 수신 API 프로덕션 미구현(D3, DF-1) |
| PORT 화면·CSV 선분 규칙 + 원장 판정 7케이스 | B2 `MasterDataLedgerJudgmentSqliteTest`(신규, 05 판정 참고 구현 절 7행 그대로) |
| ORG 화면·CSV 선분 규칙(계층) | B2 동일 파일 — 05:71-77 5행 재현. 화면·CSV 대조 포함 |
| CUST 화면·CSV 경로 | B2 동일 파일 — 원천 불일치 거부(음성 케이스)만. 수신 API·판정은 범위 밖(D3, DF-2) |
| 룰 4종·LS_A3 편집→확정 통과 | BASE_SPD_LKP·SPD_EXC·SPD_JOIN·`LS_A3`는 B3 `RuleSetLifecycleOasisFlowTest`(신규)가 실제 편집→확정 전 과정을 확인한다. 나머지 3종(QLTY_GRD_JDG·COIL_WGT_CALC·PROD_WGT_CALC)의 편집→확정 성공 케이스는 **확인하지 못함** — 기존 `RuleConfirmOasisHttpTest`는 `QLTY_GRD_JDG`(Q)로 검색·조회·검증과 확정 **실패**(HT2, MDM010)만 돌리고 확정 **성공**은 같은 06 샘플 정의를 쓰는 별도 시험 전용 ID `FIRST_JDG`로만 확인한다(QLTY_GRD_JDG 자신은 아니다). `PROD_WGT_CALC`는 `RuleMngServiceTest`가 검색용으로 JDBC 직접 시딩만 하고 `service.register`를 부르지 않으며, `COIL_WGT_CALC`는 `SampleRuleValueTest`의 값 계산에만 쓰인다 — 셋 다 확정을 도는 시험이 없다(DF-4). |
| 룰 4종·LS_A3 서버 판정이 샘플 기대값과 일치 | SPD_EXC·SPD_JOIN·`evaluateSet(LS_A3)`는 B3 `SampleRuleSetValueTest`(신규, 엔진 레벨). 나머지 4종 개별 값은 기존 `SampleRuleValueTest`(안 바꿈, "수용 기준 1 — 06 샘플 룰 넷의 값 테스트")가 이미 확인한다. |
| 수용 기준 "시나리오 통과" | 위 항목 중 "확인하지 못함"으로 적은 것 외 전부가 기준선 5개 명령 중 backend testAll에서 통과 |
| 수용 기준 "발견 결함은 WP에 defect Task로 등록" | `defects.md`에 DF-1(EQP_CD 수신 미구현)·DF-2(CUST 수신 미구현)·DF-3(DERIVE 룰 결과식 외부 변수 타입 변환 결함, TSK-08-04)·DF-4(룰 4종 중 3종 편집→확정 시험 없음, 추정 TSK-03-03) 기록. DF-1·DF-2·DF-4는 대상 WP 불명 — 오케스트레이터·사람이 정한다 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| 규칙 | 대상 테스트 |
|---|---|
| MASTER_AT/MASTER의 버전·카테고리 소급 규칙(최초 행/버전으로 소급, 코드는 항상 V 기준)은 04 「판정 참고 구현」 그대로다 | `DefaultCodeResolverTest`(기존, 안 바꿈) + B1 신규 `@Test`(원장으로 같은 규칙 재확인) |
| MASTER_AT/MASTER는 RELEASED 버전·선분 행만 판정에 쓰고 DRAFT는 무시한다 | `MasterCodeDeprecateEngineSqliteTest`(기존, 안 바꿈) + B1·B2 신규 |
| `CodeLookup`·`MasterLookup`을 운영 Spring 빈으로 등록하지 않는다(D-077/D5, "04 원장 미구축" D2) — 이 작업이 그 결정을 뒤집지 않는다 | `MasterCodeDeprecateEngineSqliteTest.G0_운영_CodeLookup_빈은_없다`(기존, 안 바꿈). B1·B2 신규 판정 조립은 시험 코드 안에서만 한다 |
| 화면·CSV·API 세 경로는 `DataItemSaveCore`/`DataItemChecks` 공용 코드로 검사 1~7을 돈다(따로 구현하지 않는다) | `DataItemChecksSqliteTest`(기존, 안 바꿈) |
| `previewRule`은 결과 값을 계산하지 않고 행 고르기만 낸다(TSK-09-01 불변 규칙) | `evalex-rule-preview.test.ts`(기존, 안 바꿈) — 이 작업이 건드리지 않는다 |
| `TB_MDM_RULE_TEST_CASE`는 룰 1개당 케이스다(세트 케이스를 담지 않는다) | `MdmBusinessRuleEntityJpaRoundtripTest`(기존, 안 바꿈) |
| 룰 세트 실행 순서는 세트가 담은 목록 순서(위상 정렬 결과)대로다 | `RuleSetAnalyzerTest`(기존, 안 바꿈) + B3 `evaluateSet("LS_A3")` 신규 |
| 이 작업은 선행 WP의 프로덕션 소스(`src/**/main/**`)를 고치지 않는다 — 시험 파일만 만든다 | 커밋 diff로 확인(`git show --stat`) |
| MSSQL 은 폐지 예정이다(팀장 지시 2026-09-26) — MSSQL 마이그레이션(`db/migration/mdm/mssql`)·`mssqlTest`·MSSQL 방언 분기·MSSQL 관련 문서를 새로 만들거나 고치거나 지우지 않는다. SQLite 만 다룬다. 이 작업은 마이그레이션을 추가하지 않는다(추가하게 되면 MSSQL 짝 부재만으로 실패하는 `MdmFlywayVersionParityTest`·`*DdlParityTest` 는 예상 실패로 허용하되 짝 파일은 만들지 않는다) | 커밋 diff 에 `mssql` 경로가 없는지 확인(`git diff --name-only <기점>..HEAD \| grep -i mssql` 0건) |

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | `mdm/api` `dmc/codeConfirm` 패키지: `CodeConfirmSampleHistorySqliteTest.java`(수정) + `SteelStdLedgerConfirmSqliteTest.java`(신규) | PROC_CD 원장 MASTER_AT 판정, STEEL_STD 등록→편집→확정 | 버전·카테고리 소급 규칙, 운영 CodeLookup 빈 미등록 |
| B2 | `mdm/api` `common/segment` 패키지: `MasterDataLedgerJudgmentSqliteTest.java`(신규) | PORT 화면·CSV + 원장 판정 7케이스, ORG 계층, CUST 거부 | 화면·CSV·API 공용 검사 코드, 운영 MasterLookup 빈 미등록 |
| B3 | `maru-mdm-engine` `rule` 패키지 `SampleRuleSetValueTest.java`(신규) + `mdm/api` `dme/*` 패키지 `RuleSetLifecycleOasisFlowTest.java`(신규) | SPD_EXC·SPD_JOIN·`evaluateSet(LS_A3)` 값, 룰 4종+세트 편집→확정 생애주기 | `TB_MDM_RULE_TEST_CASE` 룰 단위 스키마, 세트 실행 순서 |

세 단위는 서로 다른 파일·모듈을 다루므로 순서를 둘 필요는 없다(세 갭이 원래 독립적이다). B1·B2는 같은 Gradle 모듈
(`mdm/api`)이라 병렬 묶음으로 두지 않는다(phase-design.md 「구현 단위 표」 규칙 1). B3은 `maru-mdm-engine`과 `mdm/api`
둘을 걸치므로 단위 하나로 묶어 순차 진행한다. 묶음 열은 두지 않는다(순차 B1→B2→B3, 확신이 없으면 묶지 않는다).

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: 해당 없음 — 기준선 `testAll`은 이미 `mssqlMigrationTest`를 포함하지 않는다(baseline 기록: "testAll
  은 mssqlMigrationTest 를 포함하지 않아 제외 없이 사용"). B1~B3는 모두 `mssqlTest` 소스셋이 아니라 기본 `test`
  소스셋(SQLite)에 둔다 — 새 mssqlTest 클래스를 만들지 않는다.
- 확인하지 못한 수용 기준: EQP_CD의 등록→편집→확정·판정(요구사항 1의 일부), CUST의 수신 API 경로·판정(요구사항 2의
  일부) — 도커 금지 때문이 아니라 **해당 기능의 프로덕션 백엔드 구현 자체가 없기 때문**이다(D3). 도커를 허용해도
  확인할 수 없다. MSSQL 방언에서 같은 동작이 나오는지는 이 작업 범위가 아니고 머지 뒤 팀장 `dialect_check` 스윕이
  맡는다(레포 공용 관례).

## 담당자 확인 필요 결정

근거의 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

### D1 — "판정 표"를 04 「판정 참고 구현」 절의 81-84 예제로 볼지, 「샘플 데이터」 절의 PROC_CD 실측 해석 결과로 볼지

- **질문**: 04 문서에 판정 표가 두 개 있다. 하나는 「판정 참고 구현(사본 쿼리)」 절의 일반 예제(코드 81-84, 버전
  1.000/1.001/1.002, base_dt 4개) — 이미 `DefaultCodeResolverTest`가 인메모리로 검증했다. 다른 하나는 「샘플 데이터」
  절 자체가 PROC_CD(1P/82/83/2P) 체인의 결과로 적어 둔 "해석 결과(V=1.001)" 문장이다. spec은 "PROC_CD... 샘플로...
  판정 표와 일치"라고 해 어느 쪽인지 명시하지 않는다.
- **선택지**: (a) PROC_CD 체인이 실제로 만든 원장(1P/82/83/2P)에 「샘플 데이터」 절의 "해석 결과" 문장을 판정 표로
  대조한다 / (b) 81-84 예제를 그대로 쓰려고 별도로 코드 81-84·버전 1.000/1.001/1.002를 원장에 새로 심는다
- **택한 것**: (a)
- **근거와 강약**: spec이 "PROC_CD 샘플로"라 특정했고, 이 작업의 등록→편집→확정 체인이 만드는 원장은 PROC_CD
  (1P/82/83/2P)다 — 81-84는 다른 이름공간의 별도 시나리오라 체인과 자연히 이어지지 않는다. 81-84 판정 표는 이미
  `DefaultCodeResolverTest`(안 바꿈)가 확실히 검증하고 있어 중복 검증의 실익도 적다.
- **반려되면 재작업 방향**: B1에 81-84 코드·세 버전을 위한 별도 `@BeforeEach` 체인을 새로 만들고(PROC_CD와 무관한
  두 번째 마루 코드로), 그 원장에 `DefaultCodeResolver`를 조립해 4행 표를 재확인한다.

### D2 — `CodeLookup`/`MasterLookup`을 운영 Spring 빈으로 등록해 원장 판정을 실서비스로 켤 것인가

- **질문**: 04·05 문서의 "원장 기준 판정"을 실제로 실행 중인 서버 API로 노출하려면 `MdmEngineConfig`에
  `CodeLookup`·`MasterLookup` 빈을 등록해야 한다. 지금은 둘 다 없어 시험에서만 조립해 확인할 수 있다.
- **선택지**: (a) 운영 빈을 등록하지 않고 시험 코드 안에서만 판정기를 조립해 로직 정확성만 확인한다 / (b) 이 작업에서
  `MdmEngineConfig`에 빈을 등록해 실제 API로도 판정이 되게 한다
- **택한 것**: (a)
- **근거와 강약**: `MdmEngineConfig`의 결정 주석(D-077/D5, "04 원장 미구축" D2)이 운영 등록을 명시적으로 보류해 뒀고,
  `MasterCodeDeprecateEngineSqliteTest.G0_운영_CodeLookup_빈은_없다`가 그 상태를 스스로 확인한다 — itest는 프로덕션
  코드를 고치지 않는다는 원칙(1절)과도 맞다. 운영 등록은 별도 설계 결정(누가 API를 호출할지, 캐시가 필요한지 등)이
  딸린 변경이라 이 itest 하나로 판단할 사안이 아니다.
- **반려되면 재작업 방향**: `MdmEngineConfig`에 `@Bean CodeLookup`·`@Bean MasterLookup`을 등록하고(이 경우 itest가
  아니라 dev 범위 재작업), B1·B2의 판정 시험을 API 레벨(OASIS HTTP)로 다시 쓴다.

### D3 — EQP_CD·CUST의 수신 API가 프로덕션에 없다 — 어떻게 처리할까

- **질문**: spec은 EQP_CD·CUST를 "등록→편집→확정 흐름"·"화면·CSV 경로" 샘플로 들었지만, 조사 결과 둘 다 정규 경로
  (MES/ERP 수신 API)의 백엔드 구현이 전혀 없다(엔티티만 있고 서비스가 없다). EQP_CD는 조회 전용 화면조차 없다.
- **선택지**: (a) 두 항목을 "확인하지 못함(수신 API 프로덕션 미구현)"으로 수용 기준 매핑에 적고 `defects.md`에
  DF-1·DF-2로 기록해 대상 WP·구현 여부 판단을 사람에게 넘긴다. CUST는 화면·CSV로 거부되는 음성 케이스만 확인한다 /
  (b) 이 작업에서 EQP_CD·CUST 수신 API를 새로 만든다
- **택한 것**: (a)
- **근거와 강약**: (b)는 itest가 새 프로덕션 기능을 만들지 않는다는 원칙(1절, TSK-09-01과 동일)에 정면으로 어긋난다.
  06-02~07-04 스펙 어디에도 수신 API 구현을 명시적으로 요구한 곳이 없어, 이게 "빠뜨린 결함"인지 "아직 배정 안 된
  범위"인지도 이 작업이 판단할 수 없다.
- **반려되면 재작업 방향**: 수신 API를 구현할 담당 WP를 먼저 정하고(신규 Task), 그 WP가 끝난 뒤 이 작업의 B1·B2에
  EQP_CD·CUST 흐름 시험을 추가한다.

### D4 — 룰 세트 LS_A3의 "서버 판정이 샘플 기대값과 일치"를 화면 레벨에서도 자동 검증할 것인가

- **질문**: `ruleSetEdit` 저장 경로는 구조 검사 4개만 하고 `MdmRuleEngine.evaluateSet`을 부르지 않는다. 화면으로 세트를
  등록하는 것과 세트의 최종 계산값이 맞는지 확인하는 것이 분리돼 있다.
- **선택지**: (a) 값 판정은 엔진 레벨 새 테스트(`SampleRuleSetValueTest`)로, 생애주기(편집→확정→세트 등록)는 OASIS
  레벨 새 테스트로 나눠 다룬다 / (b) `ruleSetEdit` 저장 경로에 `evaluateSet` 호출을 추가해 화면에서도 최종값을
  검증하게 만든다
- **택한 것**: (a)
- **근거와 강약**: (b)는 프로덕션 코드 변경이라 itest 범위를 넘는다. 엔진이 이미 `evaluateSet`을 제공하고
  `SampleRules.java`가 이미 이 fixture를 준비해 뒀으므로, 시험 코드만으로 "서버 판정 = 샘플 기대값"을 확인할 수 있다.
- **반려되면 재작업 방향**: `ruleSetEdit` 저장 시 `evaluateSet`을 부르는 기능을 추가하는 별도 dev Task를 먼저 만들고,
  이 작업의 B3 OASIS 생애주기 테스트에 최종값 단언을 옮긴다.

### D5 — 발견 결함(DF-1~DF-4)의 defect Task 등록을 이 작업에서 할 것인가

- **질문**: 수용 기준 2 는 "발견 결함은 해당 기능 WP 에 defect Task 로 등록됨" 이다. 팀원(워커)의 서버 쓰기는 자기 주문
  하나로 제한되어(worker-prompt 「5」) 다른 WP 에 Task 를 만들 수 없다.
- **선택지**: (a) 결함을 `defects.md` 에 추정 WP·재현 절차·기대/실제와 함께 기록하고 완료 보고에 건수를 실어, 등록은
  팀장·사람이 한다 / (b) 이 작업에서 D'Flow 에 defect Task 를 직접 만든다
- **택한 것**: (a) — 오케스트레이터(워커 팀장 측 판단)
- **근거와 강약**: 워커 서버 쓰기 범위 규칙이 (b)를 금지한다. spec 은 등록 주체를 정하지 않았다. TSK-09-01 D3 과 같은 처리(리포 관례).
- **반려되면 재작업 방향**: 팀장·사람이 `defects.md` 의 DF-1~DF-4 를 해당 WP 의 defect Task 로 옮긴다(코드 재작업 없음).
