# TSK-03-03 build-log (반려 재작업, 2026-09-26)

기점 origin/dev 6d2110fc. 원 Build(2026-09-24)의 기록은 design.md 「이탈 기록」 에 있다.

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-03-03-build | sonnet | 예 | - | UNIT_DONE | - | - | 2 |

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과 | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T11:16:52Z | 기준선 | full 5줄(testAll·m-mdm test·m-mdm lint·shared test:unit·OASIS 계약) | 전체 | 70 | - | 기준선 측정 |
| 2026-09-26T11:40:00Z | 기준선 | 모듈: `:maru-mdm-engine:test :mdm:test` + m-mdm test + OASIS / `:mdm:test` + OASIS | 모듈 | 10 | - | 기준선 측정 |
| 2026-09-26T12:19:30Z | build | `:maru-mdm-engine:test :mdm:test` + m-mdm test + OASIS | 모듈 | 19 | 2.44 | 통과 |
| 2026-09-26T12:19:42Z | build | `:mdm:test` + OASIS | 모듈 | 3 | 2.39 | 통과 |
| 2026-09-26T21:02Z | Build B1 | `:maru-mdm-engine:test :mdm:test --no-daemon --console=plain` | 모듈(engine+mdm lib+mdm api) | 61 | - | 통과(JUnit 1337+1158+1096=3591건, 실패 0. 기준선 3574 대비 +17, 미감소) |
| 2026-09-26T21:05Z | Build B1 재확인 | 위와 동일(변이 11개 되돌린 뒤 재확인) | 모듈 | 9 | - | 통과(BUILD SUCCESSFUL, 재컴파일 확인) |
| 2026-09-26T21:20Z | Build B1 | `:maru-mdm-engine:test --tests ProductionConfigParityTest --tests ExpressionCacheWiringTest`(§6.15 전 사례 반영 뒤) | 좁힌 | 1 | - | 통과(ParityTest 18건·WiringTest 7건, 실패 0) |
| 2026-09-26T21:22Z | Build B1 최종 확인 | `:maru-mdm-engine:test :mdm:test --no-daemon --console=plain` | 모듈 | 9 | - | 통과(JUnit 1348+1158+1096=3602건, 실패 0. 기준선 3574 대비 +28, 미감소) |

## 변이 검증 기록

`.claude/skills/dflow-dev/scripts/mutate.sh run docs/mdm/tasks/TSK-03-03/mutations` 로 11개를 먼저 한 번에 실행(`MUTATION_SUMMARY total=11 caught=11 survived=0 anchor=0 busy=0`), M8 의 "잡힘"이 실은 `mdm:lib:compileJava` 컴파일 오류(`ParseException` 이 던져지지 않는 경로에 catch 를 둠)였음을 로그 감사로 발견해 변이문을 고치고 M12(I28 개정의 절삭 쪽)를 더해 `--ids M8,M12` 로 재실행(`MUTATION_SUMMARY total=2 caught=2 survived=0 anchor=0 busy=0`, 이번엔 로그가 의도한 테스트 메서드 이름으로 실패함을 확인). 순회 대상은 §5.3 I41-I48 + 개정 I28(엔진 쪽 주입 지점 + 세트 절삭 지점) 이다. I1-I27·I29-I39 는 판정 코드를 고치지 않아 다시 돌리지 않았다(phase-build.md, 생성자만 바꾼 기존 엔진 테스트 10개 초록으로 대신 확인).

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I41 | M1 — `ExpressionRunner.run` 을 `new Expression(text, evaluator.configuration())` 로 되돌림(캐시·평가기 완전 우회) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I42 | M2 — `ExpressionRunner` 에 엔진 인스턴스 전용 로컬 캐시(`ConcurrentHashMap`)를 두고 거기서 `copy()` 평가(주입 평가기 캐시 우회) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I43 | M3 — `Error` 재던지기 분기 제거(원인이 `Error` 여도 `RuntimeException` 분기로 안 감) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I44 | M4 — `ExpressionRunner.run` 이 `expr.ExpressionFailure` 를 잡지 않고 그대로 흘림(런타임 예외가 판정 밖으로 샘) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I45 | M5 — 원인 언랩 분기 제거, 모든 경우를 `expr.ExpressionFailure` 자신으로 감쌈(메시지에 `ExpressionFailure` 가 섞여 들어감) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I46 | M6 — `RuleEvaluator.Run.evaluate()` 값 맵의 `values.put(EVAL_TS, evalTs)` 제거 | `ExpressionVariableTest`(fail-fast) | 잡힘 |
| I47 | M7 — `ExprTypeByCaseCheck` 가 주입 평가기 대신 `new MdmEvaluator(MdmEngineConfig.lookups(null,null,null))` 로 엔진을 만듦 | `MdmEngineWiringArchitectureTest`(fail-fast) | 잡힘 |
| I47 | M8 — `RuleConfirmChecks` 에 `new com.ezylang.evalex.Expression(...)` 직접 호출 추가(1차 시도는 컴파일 오류였고, try/catch 를 뺀 맨 문장으로 고쳐 재실행) | `MdmEngineWiringArchitectureTest`(fail-fast, `mdm_은_EvalEx_Expression_을_직접_만들지_않는다`) | 잡힘 |
| I48 | M9 — 패키지 전용 생성자를 `public` 으로 바꿈(공개 생성자 3개가 됨) | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I48 | M10 — 공개 `(EngineLookups, Duration)` 위임에서 이름 집합을 `Set.of()`(빈 집합)로 바꿈 | `ExpressionCacheWiringTest`(fail-fast) | 잡힘 |
| I28(개정) | M11 — `MdmEvaluator.evaluate` 의 `copy.with(EVAL_TS, ts)` 를 KST 벽시계 `LocalDateTime` 으로 바꿈(새 캐시 경로의 평가기 쪽 주입 지점) | `RuleEngineStageTest`(fail-fast, `EVAL_TS_는_설정_시간대와_무관하게_Instant_로_넣는다`) | 잡힘 |
| I28(개정) | M12 — `MdmRuleEngine.truncate` 의 `truncatedTo(SECONDS)` 제거(세트/룰 진입점의 절삭) | `RuleEngineStageTest`(fail-fast, `EVAL_TS_는_초_미만을_자른다`) | 잡힘 |

변이 기록 파일: `docs/mdm/tasks/TSK-03-03/mutations/M1.mut` ~ `M12.mut`.

덮지 못한 변이: 없음(계획한 12개 모두 잡힘, 각 로그의 실패 테스트 메서드 이름으로 확인).

## 설계 이탈

1. **엔진 ArchUnit ③(`rule_main_은_Expression_을_직접_만들지_않는다`)은 design 문구보다 조금 넓게 잡는다.** design §3.6 은 "Expression 의 생성자를 부르지 않는다"고 적었지만, 구현은 ArchUnit `dependOnClassesThat().belongToAnyOf(Expression.class, ExpressionConfiguration.class)`(어떤 식으로든 그 타입에 의존하지 않는다)로 잡았다 — 생성자 호출만 잡는 것보다 엄격하고, `test` 소스셋은 `DO_NOT_INCLUDE_TESTS` 로 빠지므로 `GeneratedTextParseTest`·`CellTextGeneratorTest`(생성 텍스트를 직접 파싱하는 테스트, 판정 경로 아님)는 영향받지 않는다.
2. **새 테스트를 구현 뒤에 썼다** — I41-I48·I28(개정)의 "빨강 확인"은 각 항목이 실제로 한 번씩 적색이 됐다가 원복된 변이 기록(위 표, M1-M12)이 증거다. 코드를 먼저 짜고 테스트를 나중에 쓴 순서라 "새 테스트가 실패하는 것을 먼저 본다"는 TDD 절차상의 선행 확인은 변이 검증으로 대신했다.
