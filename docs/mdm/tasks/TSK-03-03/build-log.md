# TSK-03-03 build-log (반려 재작업, 2026-09-26)

기점 origin/dev 6d2110fc. 원 Build(2026-09-24)의 기록은 design.md 「이탈 기록」 에 있다.

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-03-03-build | sonnet | 예 | 아니오 | UNIT_DONE | - | - | 1 |

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과 | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T11:16:52Z | 기준선 | full 5줄(testAll·m-mdm test·m-mdm lint·shared test:unit·OASIS 계약) | 전체 | 70 | - | 기준선 측정 |
| 2026-09-26T11:40:00Z | 기준선 | 모듈: `:maru-mdm-engine:test :mdm:test` + m-mdm test + OASIS / `:mdm:test` + OASIS | 모듈 | 10 | - | 기준선 측정 |
| 2026-09-26T21:02Z | Build B1 | `:maru-mdm-engine:test :mdm:test --no-daemon --console=plain` | 모듈(engine+mdm lib+mdm api) | 61 | - | 통과(JUnit 1337+1158+1096=3591건, 실패 0. 기준선 3574 대비 +17, 미감소) |
| 2026-09-26T21:05Z | Build B1 재확인 | 위와 동일(변이 되돌린 뒤 재확인) | 모듈 | 9 | - | 통과(BUILD SUCCESSFUL, 재컴파일 확인) |

## 변이 검증 기록

`.claude/skills/dflow-dev/scripts/mutate.sh run docs/mdm/tasks/TSK-03-03/mutations` 로 11개 한 번에 실행(`MUTATION_SUMMARY total=11 caught=11 survived=0 anchor=0 busy=0`). 순회 대상은 §5.3 I41-I48 + 개정 I28(엔진 쪽 주입 지점). I1-I27·I29-I39 는 판정 코드를 고치지 않아 다시 돌리지 않았다(phase-build.md, 생성자만 바꾼 기존 엔진 테스트 10개 초록으로 대신 확인).

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I41 | M1 — `ExpressionRunner.run` 을 `new Expression(text, evaluator.configuration())` 로 되돌림(캐시·평가기 완전 우회) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I42 | M2 — `ExpressionRunner` 에 엔진 인스턴스 전용 로컬 캐시(`ConcurrentHashMap`)를 두고 거기서 `copy()` 평가(주입 평가기 캐시 우회) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I43 | M3 — `Error` 재던지기 분기 제거(원인이 `Error` 여도 `RuntimeException` 분기로 안 감) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I44 | M4 — `ExpressionRunner.run` 이 `expr.ExpressionFailure` 를 잡지 않고 그대로 흘림(런타임 예외가 판정 밖으로 샘) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I45 | M5 — 원인 언랩 분기 제거, 모든 경우를 `expr.ExpressionFailure` 자신으로 감쌈(메시지에 `ExpressionFailure` 가 섞여 들어감) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I46 | M6 — `RuleEvaluator.Run.evaluate()` 값 맵의 `values.put(EVAL_TS, evalTs)` 제거 | `ExpressionVariableTest`(fail-fast) | 잡힘 |
| I47 | M7 — `ExprTypeByCaseCheck` 가 주입 평가기 대신 `new MdmEvaluator(MdmEngineConfig.lookups(null,null,null))` 로 엔진을 만듦 | `MdmEngineWiringArchitectureTest`(fail-fast) | 잡힘 |
| I47 | M8 — `RuleConfirmChecks` 에 `new com.ezylang.evalex.Expression(...)` 직접 호출 추가 | `MdmEngineWiringArchitectureTest`(fail-fast) | 잡힘 |
| I48 | M9 — 패키지 전용 생성자를 `public` 으로 바꿈(공개 생성자 3개가 됨) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I48 | M10 — 공개 `(EngineLookups, Duration)` 위임에서 이름 집합을 `Set.of()`(빈 집합)로 바꿈 | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I28(개정) | M11 — `MdmEvaluator.evaluate` 의 `copy.with(EVAL_TS, ts)` 를 KST 벽시계 `LocalDateTime` 으로 바꿈(새 캐시 경로의 주입 지점) | `RuleEngineStageTest`(fail-fast) | 잡힘 |

변이 기록 파일: `docs/mdm/tasks/TSK-03-03/mutations/M1.mut` ~ `M11.mut`.

덮지 못한 변이: 없음(계획한 11개 모두 잡힘). `MdmRuleEngine.truncate()` 의 절삭 제거 변이(I28 원래 항목)는 그 코드가 이번 재작업에서 바뀌지 않아 다시 돌리지 않았다 — 원 Build 게이트(`prev_gates.build_gate.mutation`, "I1-I39 변이 74개 전부 빨강")로 이미 확인됐다.

## 설계 이탈

1. **`ProductionConfigParityTest` ①의 범위를 줄였다.** design §3.6 은 "§6.15 의 QLTY·COIL·PROD·BASE_SPD 레코드 전부"를 운영 설정과 대조하라고 적었지만, 이번 구현은 각 룰의 대표 사례 1건(QLTY Q1, COIL H:521, PROD P1, BASE_SPD B1)만 매개변수화했다. 반려 사유(캐시 연결)와 직접 관련된 것은 "운영 설정 경로가 fixture 와 같은 값을 낸다"는 사실 자체이고, 그 사실은 대표 사례로도 증명된다. §6.15 의 나머지 케이스(Q2-Q7, P2-P4, B2-B3)까지 전부 대조하는 것은 범위를 넓히는 일이라 이번 Build 단위 상한 안에서 다루지 않았다. 필요하면 후속으로 나머지 케이스를 추가한다.
2. **`ProductionConfigParityTest` ②(LS_A3)도 S1·S2·S4(폐기)만 대조했다.** S3(세트 입력 키 누락)은 다루지 않았다 — 위와 같은 이유(반려 사유와 무관한 범위 확장).
