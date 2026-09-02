---
screenId: masterRuleListPop
asIsId: MasterRuleListPop
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleListPop
pageId: masterRuleListPop
serviceId: masterRuleListPop
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 List조회 (masterRuleListPop) BPMN설계서

> 본 문서는 [분석리포트](./masterRuleListPop_분석리포트.md) §8 (BPMN 워크플로우) 및 §6 (SQL ID 매트릭스) 를 To-Be 식별자 규칙(`{screenId}_{기능명}`) 으로 매핑한다.

---

## §1. 액션 매트릭스

### §1.1 As-Is action ↔ To-Be 매핑

| As-Is action | xfdl 호출 | bpmn flow | sqlKey (As-Is) | To-Be action ID (`{screenId}_{기능명}`) |
|---|---|---|---|---|
| search | fn_search (xfdl:114) | SequenceFlow_0grwghu → Task_2 → End | GetRuleMasterList | masterRuleListPop_search |

비고: 본 화면 server-side action 은 **search 단 1개**. save/delete/전체조회 action 없음 (조회 전용 팝업 — 분석리포트 §4.5).

### §1.2 client-side 액션 (BPMN 비대상)

| 액션 | xfdl 함수 | 비고 |
|---|---|---|
| confirm | fn_confirm (xfdl:152) | BPMN 송신 없음 — rowposition 행 {sRuleId,sRuleNm} 반환 |
| close | fn_close (xfdl:161) | BPMN 송신 없음 — 팝업 닫기 |
| fold | btn_fold_onclick (xfdl:166) | BPMN 송신 없음 |
| 더블클릭 (선택 반환) | div_main_grd_main_oncelldblclick (xfdl:143) | BPMN 송신 없음 — e.row 행 반환 |
| 그리드 헤드 클릭 | div_main_grd_main_onheadclick (xfdl:172) | BPMN 송신 없음 — 정렬 |

---

## §2. API 패턴 판정

### §2.1 As-Is 패턴

| 항목 | 값 |
|---|---|
| 통신 채널 | nexacro `gfn_transaction` (xfdl:125) — SOAP 또는 oasis 자체 RPC 채널 |
| sqlKey 변수 치환 | `#{serviceId}Mapper.GetRuleMasterList` — serviceId = "MasterRuleListPop" (xfdl:117 `sUrl="cmb::MasterRuleListPop"` 기준) |
| UserTask 클래스 | (없음 — 본 화면 Java UserTask 부재; 단일 CommonSelectTask) |
| paramKey | Task_2 의 paramKey = 빈값 — 자동 모드 (xfdl 의 sArgument 가 전달됨) |
| resultKey | Task_2 → `ds_GetRuleMasterList` (bpmn:19) |
| isServiceResult | true (DB Task — bpmn:16) — gfn_transaction 의 sOutDatasets 로 직접 매핑 |
| 트랜잭션 단위 | BPMN process 1회 실행 = SELECT 1회 (읽기 전용) |
| 송신 파라미터 | pRuleId / pRuleNm / sSchema (xfdl:120~122) |

### §2.2 To-Be 패턴 (참고 — 구현 시 결정)

| 항목 | 값 |
|---|---|
| 통신 채널 | HTTP REST (cactus OASIS 표준) |
| sqlKey 치환 변수 | `#{serviceId}Mapper.GetRuleMasterList` 패턴 유지 (oasis 호환) — serviceId = "masterRuleListPop" |
| Mapper namespace 변경 | "MasterRuleListPopMapper" → "masterRuleListPopMapper" (또는 JPA Repository 흡수) |
| 응답 key | `ds_GetRuleMasterList` 보존 |
| 영속성 방식 | OASIS 조회 — JPA vs MyBatis 착수 전 사용자 확인 (RULE.md §영속성) |

---

## §3. action 별 BPMN flow

### §3.1 action = search (masterRuleListPop_search)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search ────┐
                                            ↓ (SequenceFlow_0grwghu)
                                       [Task_2 "Main조회"]
                                       class: CommonSelectTask
                                       sqlKey: #{serviceId}Mapper.GetRuleMasterList
                                       resultKey: ds_GetRuleMasterList
                                            ↓ (SequenceFlow_0lnje1n)
                                       [EndEvent_1]
```

| 단계 | 노드 | class | sqlKey (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | Task_2 | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleListPopMapper.GetRuleMasterList | ds_GetRuleMasterList | bpmn:10~24 |

### §3.2 통합 SequenceFlow 매트릭스 (As-Is 식별자 보존)

| flow id | name | source | target |
|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_2 |
| SequenceFlow_0lnje1n | - | Task_2 | EndEvent_1 |

---

## §4. UserTask Java 클래스

**해당 없음** (WinForms 미해당 — mui 등가: 본 화면 BPMN 에 `userTask` 노드 없음 — 단일 `task`(CommonSelectTask) 조회만). 조회 전용 팝업이므로 화면 전용 Java 트랜잭션 클래스 부재 (분석리포트 §7).

To-Be 조회 서비스는 oasis 공통 CommonSelectTask 또는 cactus 표준 조회 Service 로 구현. Java 패키지(필요 시) = `com.dongkuk.dmes.mcm.cmb.masterRuleListPop.service.*` (RULE.md §"패키지 명명 규칙" §3-1).

---

## §5. 트랜잭션 경계

| 구간 | 트랜잭션 단위 | 롤백 조건 |
|---|---|---|
| action=search | 단일 SELECT (읽기 전용) | DB 조회 오류 |

원칙:
- 쓰기 트랜잭션 없음 (UPDATE/INSERT/DELETE 부재). search 는 단일 읽기.

---

## §6. To-Be 식별자

### §6.1 화면 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 화면 ID (Form id) | MasterRuleListPop | masterRuleListPop |
| 화면명 (titletext) | 업무기준List조회 | 업무기준 List조회 (보존) |
| serviceId | MasterRuleListPop (xfdl:117 sUrl 기준) | masterRuleListPop |
| pageId | (없음 — xfdl) | masterRuleListPop |
| pageName | (없음) | masterRuleListPop |
| 모듈 | (cmb 폴더) | mcm |
| 모듈 그룹 | cmb | cmb |

### §6.2 BPMN 식별자 (사용자 정의 규칙: `{screenId}_{기능명}`)

| As-Is bpmn 식별자 | To-Be 기능 식별자 | 비고 |
|---|---|---|
| (process id) MasterJudgRuleListPop | masterRuleListPop | bpmn:3 process id — **As-Is process id 가 Form id 와 불일치(MasterJudgRuleListPop ↔ MasterRuleListPop) → To-Be 는 화면 식별자 masterRuleListPop 로 통일** (사용자 결정 / 분석리포트 §0, §11) |
| (action) search | masterRuleListPop_search | SequenceFlow_0grwghu name |
| Task_2 "Main조회" | masterRuleListPop_searchMain | bpmn:10 |

비고: bpmn 노드 내부 id (Task_2 등 자동 생성 id) 는 보존, 사용자 정의 식별자(노드 name 의 To-Be 표기 + process id) 만 변경.

### §6.3 Mapper / SQL ID

| 항목 | As-Is | To-Be |
|---|---|---|
| Mapper namespace | MasterRuleListPopMapper | masterRuleListPopMapper |
| Mapper 파일 (As-Is) | mappers-cmb/MasterRuleListPopMapper.xml |
| Mapper 파일 (To-Be) | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.MasterRuleRepository` (native query, 영속성 방식 사용자 확인 후 확정) / 기존 Mapper.xml 은 `.asis` 보존 (RULE.md §"패키지 명명 규칙" §3-1 — Repository 는 모듈 단위 평탄) |
| sqlKey (BPMN extension) | #{serviceId}Mapper.GetRuleMasterList | #{serviceId}Mapper.GetRuleMasterList (serviceId 가 masterRuleListPop 로 주입되어 자동 변환) |
| SQL ID (As-Is 1 → To-Be 1) | GetRuleMasterList | GetRuleMasterList (보존) |
| 동적 스키마 (`${sSchema}`) | `${sSchema}.TB_MCA_RULE_MASTER` else `MCA_SOURCE.` | To-Be 화이트리스트 검증 또는 고정 스키마 (분석리포트 §11 / §12 Q-002) |

### §6.4 Java 클래스 식별자

**해당 없음** (UserTask 부재). To-Be 조회 Service·DTO 신설 시 패키지 = `com.dongkuk.dmes.mcm.cmb.masterRuleListPop.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1).

### §6.5 결정 완료 / 보류

활성 확인필요 = **0 건**: Q-002(동적 스키마 `${sSchema}` As-Is 유지)·영속성(JPA) 사용자 확정 2026-06-04 / Q-003(부모 호출 화면)=호출자 식별 해소 2026-06-05 (masterRuleFrame·masterRuleData·masterRuleDataList). Q-001 (PK=RULE_ID 단일) 및 owner 스키마(`MCAAPUSER`) 는 DMES-SECTION-MCA sheet135 정본으로 확정 (분석리포트 §9.1). 결정 완료: process id 통일(masterRuleListPop) / edt "결함 코드" 잔재 정정 / 통신채널 REST / SQL ID GetRuleMasterList 보존 / SELECT 9 컬럼 보존 (분석리포트 §12).
