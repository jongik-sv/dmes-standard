# State Transition Playbook

이 문서는 OASIS BPMN 으로 도메인 객체의 상태 천이(state transition) 를 모델링하는 운영 패턴 — “state actor” 와 공용 “state router” — 을 정리한 가이드다. 권위 있는 정의는 `references/upstream/미작성 카테고리/Technical Ref/State Transition.md`. 분기 / 검증 규칙은 `references/branching-playbook.md`, callActivity 와의 관계는 `references/subservice-playbook.md` 와 함께 본다.

## 운영 패턴 한 줄 요약

도메인 객체의 상태 변화를 두 단계로 모델링:
1. **state actor** — 한 쌍의 상태(`<From><To>_actor.bpmn`) 사이의 천이를 담당하는 작은 BPMN. 검증 + 부수효과 + 상태 변경을 묶는다.
2. **state router** — 여러 actor 와 이벤트를 한곳으로 모은 공용 BPMN (`*ProgressStatus.bpmn`, `state_router_subprocess.bpmn` 등). callActivity 로 호출되어 `eventName` 분기로 적절한 actor 흐름으로 라우팅.

## 파일명 / process id 규약

- state actor: `services/core/<entity>prg/<From><To>_actor.bpmn`. 예: `C1D1_link_actor.bpmn`, `state_actor_validation.bpmn`.
- state router: `services/core/<entity>prg/<EntityName>ProgressStatus.bpmn` 또는 통합 `state_router_subprocess.bpmn`.
- BPMN process id 는 파일명과 동일하게 두면 callActivity `calledElement` 와 매칭이 명확.

## state actor 의 표준 골격

```
시작 → [is전제조건1] -fail-> Error End
       └ok→ [is전제조건2] -fail-> Error End
              └ok→ [부수효과 task: 입고 / 적재 / ...]
                    → [상태 변경 task: changeXxx(nextStatus="K1")]
                    → 종료
```

- 전제조건 검증은 boolean 반환 task 4 종 (`isReady`, `isPacked`, `isHold`/`HoldChecker#check`, ...).
- 검증 실패는 `#root = false` + Error End Event + 사용자 메시지.
- 마지막 상태 변경은 `*#changeStatus` 같은 단일 메서드. `nextStatus` 는 inputParameter 로 리터럴 주입.

운영 사례: `examples/services/state_actor_validation.bpmn`.

## state router 의 표준 골격

```
시작
  → [현재상태 게이트웨이 1: input=eventName]
       ├-event A→ [actor 호출 또는 inline 처리]
       ├-event B→ [...]
       └-others → Error End (unsupported)
  → [현재상태 게이트웨이 2: input=eventName]  ← 이전 게이트웨이의 일부 분기에서 도달
       ├-event C→ [...]
       └-others → Error End
  ...
```

- 게이트웨이마다 “현재 어느 상태인지” 가 명시되고, `eventName` 으로 다음 actor 를 선택.
- 같은 router 안에 다단계 게이트웨이가 누적되어 “상태 머신 전체” 를 한 BPMN 에 표현하는 형태.

운영 사례: `examples/services/state_router_subprocess.bpmn`.

## 도메인 객체 메서드 컨벤션

state transition 을 안정적으로 만들려면 도메인 클래스 메서드 이름이 일관돼야 한다.

| 의도 | 메서드 시그니처 패턴 |
| --- | --- |
| 현재 상태 검증 | `boolean isXxx(String id)` |
| 종속 객체 검증 | `boolean check(Domain x)` (Checker 클래스) |
| 상태 변경 | `void changeStatus(String id, String nextStatus)` 또는 도메인별 `changeXxxSts` |
| 단일 원소 처리 (multi-instance) | `void doYyy(String id)` |
| 신규 생성 | `String newXxx(...DTO들...)` |

운영 사례: `examples/java/Item_excerpt.java`, `Order_excerpt.java`, `HoldChecker_excerpt.java`, `Package_excerpt.java`.

## 새 상태 추가 절차

1. 도메인 클래스에 새 상태 코드 상수를 추가 (`MCC.ORDER_PRG_STS.NEW_STATE`).
2. 검증 메서드 (`isXxx`) 를 새 상태에 맞춰 추가하거나 기존 메서드에 분기 추가.
3. state router BPMN 에 새 게이트웨이 outgoing flow 또는 새 actor 호출 추가.
4. 새 actor 가 필요하면 `<From><To>_actor.bpmn` 신설 — `bpmn-skill` 로 구조 작성, 이 스킬로 OASIS 속성과 테스트 보강.
5. 테스트 추가: `examples/java/MyBatisSelectAndLoopTest.java` 패턴으로 새 service 호출 + `serviceResultCode == SUCCESS` + `path()` 의 마지막 노드가 의도한 종료 이벤트인지.

## 디버깅 체크리스트

1. 의도한 actor 로 라우팅이 안 된다 → router 게이트웨이의 `input` 변수 값과 flow `name` 매칭 확인 (branching-playbook §1).
2. actor 안의 검증이 항상 실패 → 도메인 객체 lookup 이 부모 컨텍스트의 어느 변수에서 오는지 확인 (binding-playbook).
3. 상태가 변경됐는데 다음 단계가 stale data 를 본다 → JPA flush 누락 (transaction-playbook §JPA flush).
4. router 가 너무 비대해진다 → 도메인 분리 검토. 새 entity 면 별도 router 신설.
5. 같은 actor 가 여러 곳에서 호출되면서 전제조건이 미묘하게 다른 경우 — actor 안에 분기를 더 넣지 말고, 호출자 측에서 사전 검증 후 호출하는 편이 깔끔.

## 자주 인용할 대표 샘플

- state actor (검증 + 상태 변경 묶음)
  - `examples/services/state_actor_validation.bpmn`
- state router (다단계 게이트웨이로 여러 상태 / 이벤트 라우팅)
  - `examples/services/state_router_subprocess.bpmn`
- 도메인 메서드 컨벤션
  - `examples/java/Item_excerpt.java`, `Order_excerpt.java`
- 권위 정의
  - `references/upstream/미작성 카테고리/Technical Ref/State Transition.md`
- 관련 playbook
  - `references/branching-playbook.md`
  - `references/subservice-playbook.md`
  - `references/transaction-playbook.md`
