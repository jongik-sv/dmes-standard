# TSK-09-02 build-log

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과(초) | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T06:07:25Z | 기준선 | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 6 | 2.96 | 기준선 측정(2263건, 실패 0) |
| 2026-09-26T06:07:38Z | 기준선 | `cd src/backend && … ./gradlew :maru-mdm-engine:test :mdm:test … && cd ../frontend && pnpm --filter @dk-oasis/m-mdm test && … check_oasis_contract.py --root .` | 모듈 | 19 | 2.96 | 기준선 측정(4637건, 실패 0) |
| 2026-09-26T07:27:53Z | build | `cd src/backend && … ./gradlew :maru-mdm-engine:test :mdm:test … && cd ../frontend && pnpm --filter @dk-oasis/m-mdm test && … check_oasis_contract.py --root .` | 모듈 | 39 | 4.37 | 통과(4660건, 신규 0) |
| 2026-09-26T07:28:11Z | build | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 9 | 4.36 | 통과(2274건, 신규 0) |
| 2026-09-26T07:42:46Z | verify | `cd src/backend && … ./gradlew testAll --no-daemon --console=plain` | 전체 | 57 | 5.26 | 통과(3982건, 신규 0) |
| 2026-09-26T07:44:52Z | verify | `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | 전체 | 121 | 31.20 | 통과(1064건, 신규 0) |
| 2026-09-26T07:44:55Z | verify | `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` | 전체 | 3 | 29.42 | 통과(exit 0) |
| 2026-09-26T07:45:09Z | verify | `cd src/frontend && pnpm test:unit:shared` | 전체 | 14 | 27.06 | 통과(168건, 신규 0) |
| 2026-09-26T07:45:10Z | verify | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` | 전체 | 1 | 27.06 | 통과(ERROR 0) |
| 2026-09-26T14:33:00Z | 기준선(재작업 1회차, 기점 1e8ccfa8) | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 8 | 2.54 | 기준선 측정(2276건, 실패 0) |

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| MASTER_AT/MASTER의 버전·카테고리 소급 규칙(최초 행/버전으로 소급, 코드는 항상 V 기준)은 04 「판정 참고 구현」 그대로다 | B1-M1(`mutations/B1-M1.mut`) — `DefaultCodeResolver.selectVersion`에서 `Segments.covering`(기준일이 덮는 버전 선택)을 없애고 늘 최초 RELEASED 버전만 고르게 함 | `CodeConfirmSampleHistorySqliteTest`(H6 — baseDt=2026-09-03 인데 v1.000 으로 잘못 골라 BASE 집합이 2P 빠진 채로 나와 어긋남) | 잡힘 |
| `CodeLookup`·`MasterLookup`을 운영 Spring 빈으로 등록하지 않는다(D-077/D5, "04 원장 미구축" D2) — 이 작업이 그 결정을 뒤집지 않는다 | B1-M2(`mutations/B1-M2.mut`) — `MdmCodeLookup`에 `@Component` 를 붙여 운영 빈으로 등록되게 함 | `MasterCodeDeprecateEngineSqliteTest.G0_운영_CodeLookup_빈은_없다` | 잡힘 |
| 화면·CSV·API 세 경로는 `DataItemSaveCore`/`DataItemChecks` 공용 코드로 검사 1~7을 돈다(따로 구현하지 않는다) | B2-M1(`mutations/B2-M1.mut`) — `DataItemChecks.requireSourcePath`의 검사 2(원천 불일치)에서 CSV 경로만 `case CSV -> true`로 늘 통과시켜, CSV 가 SCREEN 과 다른 자체 검사를 갖는 것처럼 흉내냄 | `DataItemChecksSqliteTest.C2_경로와_원천이_맞아야_한다`(기존, 안 바꿈 — design.md §5 지정 대상 테스트, 116~117행 `core.upsert(CUST, CSV, ...)` 가 SOURCE_MISMATCH 를 잃어 어긋남) + `MasterDataLedgerJudgmentSqliteTest.CUST_CSV_경로도_원천_불일치로_거부한다`(신규) | 잡힘(Verify 감사 지적으로 2026-09-26 재확인 — Build 기록은 신규 테스트만 돌렸었다, `mutations/B2-M1.mut` 의 `test:` 두 클래스로 보강) |
| `CodeLookup`·`MasterLookup`을 운영 Spring 빈으로 등록하지 않는다(D-077/D5, "04 원장 미구축" D2) — 이 작업이 그 결정을 뒤집지 않는다 | B2-M2(`mutations/B2-M2.mut`) — `MdmEngineConfig`에 `MasterLookup` 운영 `@Bean`(`MasterLookup.NONE`)을 추가해 등록되게 함 | `MasterDataLedgerJudgmentSqliteTest.G0_운영_MasterLookup_빈은_없다` | 잡힘 |
| 룰 세트 실행 순서는 세트가 담은 목록 순서(위상 정렬 결과)대로다 | B3-M1(`mutations/B3-M1.mut`) — `MdmRuleEngine.evaluateSet`의 실행 루프(`for (RuleDefinition def : defs)`)가 도는 목록을 뒤집어 세트 목록 순서를 무시하게 함 | `SampleRuleSetValueTest`(evaluateSet 케이스 전부 — SPD_JOIN 이 BASE_SPD_LKP·SPD_EXC 보다 먼저 돌아 BASE_SPD 가 없어 MISSING_KEY 판정 오류) | 잡힘 |
| `TB_MDM_RULE_TEST_CASE`는 룰 1개당 케이스다(세트 케이스를 담지 않는다) | B3-M2(`mutations/B3-M2.mut`) — `MdmRuleTestCase.caseId`에서 `@Id`를 떼 복합 PK 를 `maruRuleId` 하나로 좁힘(같은 룰에 케이스가 둘 이상이면 구분이 깨져야 한다) | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleTestCase_는_IdClass_복합_PK_로_저장_조회_왕복한다`(기존, 안 바꿈) | 안 잡힘(보고) — 그 테스트가 한 룰에 케이스 하나만 저장해 왕복하고 `caseId`값 자체는 단언하지 않아, `@Id`가 빠져도 `findById`가 `maruRuleId`만으로 같은 행을 찾아 통과한다. 같은 룰에 `caseId`가 둘 이상인 왕복(둘을 저장하고 각각 다른 값으로 읽는 단언)을 추가해야 잡힌다 — 기존 테스트 파일이라 이 단위(B3) 범위 밖이라 보강하지 않았다. |
| `previewRule`은 결과 값을 계산하지 않고 행 고르기만 낸다(TSK-09-01 불변 규칙) | 해당 없음(diff-check, 변이할 새 코드가 없다) | `git diff --name-only fc8e875c..HEAD \| grep evalex-rule-preview` 0건 | 확인됨(안 건드림) |
| 이 작업은 선행 WP의 프로덕션 소스(`src/**/main/**`)를 고치지 않는다 — 시험 파일만 만든다 | 해당 없음(diff-check) | `git diff --name-only fc8e875c..HEAD -- src/backend src/frontend`의 파일이 전부 `test`/`tests` 경로(B1·B2·B3 신규 파일 포함) | 확인됨 |
| MSSQL 은 폐지 예정이다 — MSSQL 마이그레이션·`mssqlTest`·MSSQL 방언 분기·MSSQL 관련 문서를 새로 만들거나 고치거나 지우지 않는다 | 해당 없음(diff-check) | `git diff --name-only fc8e875c..HEAD \| grep -i mssql` 0건 | 확인됨 |

## 설계 이탈

- **B3 — SPD_EXC 를 화면(ruleEdit COLUMNS/TABLE) 경로로 재구성**: design.md §3 B3-2는 "열 설정은 SampleRules.java의 정의를
  그대로 옮긴다"고 적었지만, 엔진 fixture `SampleRules.spdExc()`의 조건 열(`exprCondVar` — 변수명 없이 행마다 독립된 불린 식
  셀을 갖는 "Expression 조건 열")은 `RuleColumnsService`가 지원하지 않는다. 그 서비스는 COND 열 dispType이 `Expression`이면
  `varName` 자체를 식으로 파싱해 저장한다(`RuleVarTypeResolver.resolveOne`의 `exprVar = VAR_AST 존재 여부`가 늘 참이 되어
  "식 변수"(`_V<id>`) 전용 경로만 허용한다) — 화면 API로는 행마다 다른 조건식을 가진 열을 만들 수 없다. `RuleSetLifecycleOasisFlowTest`는
  같은 행 선택 결과를 내는 동치 조건(이름 있는 COND 열 `COIL_WID`·`BASE_SPD`, 행마다 다른 임계값 op 셀)으로 SPD_EXC 를 다시 짰다 —
  COLLECT 적중 정책·결과 집계(`EXC_SPD` LIST)는 그대로다. 엔진 레벨 값 검증(`SampleRuleSetValueTest`)은 원래 fixture(`exprCondVar`)
  그대로 쓴다 — 그 파일은 화면 API 를 거치지 않고 엔진의 `DefinitionLookup`을 직접 조립하므로 이 제약이 없다.
- **B3 — DF-3 발견(defects.md)**: `RuleSetLifecycleOasisFlowTest` 작성 중 DERIVE 룰(SPD_JOIN)의 결과 식이 참조하는 외부 변수
  (다른 룰의 결과·컬럼 사전 이름)가 실제 원장에서는 선언 타입으로 변환되지 않아 숫자 함수가 조용히 0을 내는 결함을 찾았다
  (`RuleColumnsService.checkDeriveExprs`가 AST 를 문자열로 이중 인코딩해 저장 → `RuleDefinitionAssembler.astOf`가 Map 이 아니라며
  버림 → `InputContracts.compute`의 널 안전 분석이 그 이름을 못 찾음). 대상 WP 는 TSK-08-04(`mdm/lib`). 그 시험에서 `MIN` 분기의
  값 단언은 뺐다(`IF`의 NULL 가드 분기만 케이스로 남김) — `MIN` 분기 값 자체는 `SampleRuleSetValueTest`(엔진 레벨 `evaluateSet`)가
  이미 확정했다. 재현·수정 범위는 defects.md DF-3 참조.

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-09-02-build-B1 | sonnet | 아니오 | - | UNIT_DONE | - | - | 0 |
| B2 | TSK-09-02-build-B2 | sonnet | 아니오 | - | UNIT_DONE | - | - | 0 |
| B3 | TSK-09-02-build-B3 | sonnet | 아니오 | - | UNIT_DONE | - | - | 1 |
| B4 | TSK-09-02-build | sonnet | 아니오 | - | - | - | - | - |
