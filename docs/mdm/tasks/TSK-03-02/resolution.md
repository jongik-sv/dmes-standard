# TSK-03-02 머지 충돌 해소 기록

## 시도 1

- 기준(BASE): `origin/dev` `3d08db7` · 머지 대상: `origin/agent/ea440494-expr-eval-core` `353613d` · 주문 `ea440494-a2ed-42c5-9842-4c1dce2f9972`
- 충돌 파일 1개(modify/delete), 규약 R2.

| 파일 | 규약 | 판단 |
|---|---|---|
| `src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractOnlyPhaseTest.java` | R2 | 파일째 삭제(이 브랜치 쪽 채택) |

판단 근거:

- 이 파일은 TSK-03-01 D2 가 정한 **계약 전용 임시 규칙**(구현 클래스가 아직 없어야 한다는 단정 5건)이다. D2 는 "TSK-03-02·03-03·03-04 중 main 구현 클래스를 먼저 넣는 Task 가 파일째 지운다" 고 정했고, 이 Task 의 design.md §2.1 이 팀장 배정으로 이 계획 삭제를 맡았다(a57df48 팀장 조율 지시).
- 개발 브랜치 쪽 TSK-03-03(789728e)은 자기 구현으로 무효가 된 2건(`main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다`, `EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다`)만 지우고 파일을 남겼다. 그 커밋의 Javadoc 에 "나머지 3건은 TSK-03-02 가 지운다" 고 적혀 있다.
- 이 브랜치 쪽은 `MdmExpressionConfig`·`baseBuilder`·`create` 를 구현해 남은 3건(`MdmExpressionConfig_의_메서드는_UnsupportedOperationException_만_던진다`, `baseBuilder_는_UnsupportedOperationException_을_던진다`, `create_는_UnsupportedOperationException_을_던진다`)도 모두 거짓이 되므로 파일째 지웠다.
- R2("아직 비어 있어야 할 것" 목록에서 양쪽이 서로 다른 항목을 뺌 → 어느 쪽이든 뺀 항목은 모두 뺀다)를 적용했다. 남기면 이미 구현된 메서드에 "UOE 만 던져야 한다" 를 단정하게 된다. 시험을 지워 게이트를 넘기는 것이 아니라 단정 대상을 바로잡는 계획 삭제다. **5건 전부 계획 삭제 완료(03-03 2건 + 03-02 3건).**
- 다른 참조: `ContractTypeShapeTest` Javadoc 두 곳의 `{@code ContractOnlyPhaseTest}` 언급뿐이며 컴파일에 영향이 없다(이 Task design.md §2.1 이 바이트 동일 유지를 정했다). 개발 브랜치는 이 파일에 새 `@Test` 를 더하지 않았다.
- 텍스트 충돌 없이 합쳐진 나머지 파일에서 의미 충돌을 점검했다. mdm `MdmEngineDependencySmokeTest` 는 `new ExpressionEvaluator().evaluate(String)` 을 쓰며, 이 브랜치 판도 기본 생성자와 같은 시그니처를 유지한다.

게이트 범위: 이 브랜치는 `src/frontend` 를 건드리지 않으므로 수치 게이트는 백엔드 `testAll --continue`(JUnit XML 의 testcase 수) 로 판정했다. 프런트 m-mdm test·lint 는 BASE 와 머지 결과에서 통과 여부만 확인했다.

게이트: 개발 브랜치 1274 · MERGE_HEAD 단독 822 · 결과 1580 (신규 실패 0, `GATE_PASS need=1274 total=1580`)

- 스위트별 총수(개발 브랜치 → 결과): aps-core 3→3, cactus-core 203→203, caravan-core 102→102, caravan-hub 78→78, maru-mdm-engine 613→919(= 613 − 3 + 309), mdm/api 57→57, mdm/lib 218→218.
- 개발 브랜치 대비 줄어든 시험 클래스는 `ContractOnlyPhaseTest`(3→0) 하나뿐이다. MERGE_HEAD 단독 대비 줄어든 클래스는 없다.
- 프런트 m-mdm: BASE·결과 모두 test 26건 통과, lint 통과(`src/frontend` 차이 0 파일).
