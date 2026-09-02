---
screenId: masterRuleList
asIsId: MasterRuleList
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleList
pageId: masterRuleList
serviceId: masterRuleList
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 목록조회 (masterRuleList) BPMN설계서

> 본 문서는 [분석리포트](./masterRuleList_분석리포트.md) §8 (BPMN 워크플로우) 및 §6 (SQL ID 매트릭스) 를 To-Be 식별자 규칙(`{screenId}_{기능명}`) 으로 매핑한다.

---

## §1. 액션 매트릭스

### §1.1 As-Is action ↔ To-Be 매핑

| As-Is action | xfdl 호출 | bpmn flow | sqlKey (As-Is) | To-Be action ID (`{screenId}_{기능명}`) |
|---|---|---|---|---|
| search | fn_search (xfdl:148) | SequenceFlow_0grwghu → Task_2 → End | GetRuleMasterList | masterRuleList_search |
| save | fn_save (xfdl:164) | SequenceFlow_0nago4p → SaveMasterRule → Task_2 → End | (UserTask) → GetRuleMasterList | masterRuleList_save |

비고: masterCategoryMng 과 달리 본 화면은 **delete action / delete BPMN flow 자체가 부재** (bpmn:1~117 전수 확인 — Main삭제 노드 없음). 후속 전체조회(AllList) 노드도 부재.

### §1.2 client-side 액션 (BPMN 비대상)

| 액션 | xfdl 함수 | 비고 |
|---|---|---|
| rowAdd | fn_rowAdd (xfdl:222) | BPMN 송신 없음 |
| rowDelete | fn_rowDelete (xfdl:238) | BPMN 송신 없음 (신규행 client 삭제만 — 기존행 서버 삭제 경로 부재) |
| excelDown | fn_excelDown (xfdl:216) | BPMN 송신 없음 |
| fold | btn_fold_onclick (xfdl:210) | BPMN 송신 없음 |
| 그리드 헤드 클릭 | div_main_grd_Main_onheadclick (xfdl:253) | BPMN 송신 없음 (정렬 위임만) |

---

## §2. API 패턴 판정

### §2.1 As-Is 패턴

| 항목 | 값 |
|---|---|
| 통신 채널 | nexacro `gfn_transaction` (xfdl:160, 177) — oasis 자체 RPC 채널 |
| sqlKey 변수 치환 | `#{serviceId}Mapper.GetRuleMasterList` — serviceId = "MasterRuleList" (As-Is) |
| UserTask 클래스 변수 치환 (As-Is) | `#{basePackage}SaveMasterRule` — basePackage = "com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList." |
| UserTask 클래스 변수 치환 (To-Be) | basePackage = "com.dongkuk.dmes.mcm.cmb.masterRuleList.service." (masterCategoryMng 선례 / RULE.md §"패키지 명명 규칙") |
| paramKey | (Task_2 의 paramKey = 빈값 — 자동 모드, xfdl 의 sArgument 가 전달됨, bpmn:15) |
| resultKey | Task_2 → `ds_GetRuleMasterList` (bpmn:19) |
| isServiceResult | true (Task_2 — bpmn:16) — gfn_transaction 의 sOutDatasets 로 직접 매핑 |
| 트랜잭션 단위 | BPMN process 1회 실행 = 1 트랜잭션 (UserTask 내부 + 후속 SELECT 포함) |

### §2.2 To-Be 패턴 (참고 — 구현 시 결정)

| 항목 | 값 |
|---|---|
| 통신 채널 | HTTP REST (cactus OASIS 표준) |
| sqlKey 치환 변수 | `#{serviceId}Mapper.GetRuleMasterList` 패턴 유지 (oasis 호환) — serviceId = "masterRuleList" |
| Mapper namespace 변경 | "MasterRuleListMapper" → "masterRuleListMapper" |
| UserTask 클래스 변경 | "SaveMasterRule" 클래스명 보존, 패키지만 `com.dongkuk.dmes.mcm.cmb.masterRuleList.service.*` 로 이전 |
| 응답 key | `ds_GetRuleMasterList` / `cnt_save` 보존 |

### §2.3 채택

- action 2종 (search / save) — 단일 actionGateway (OASIS) 채택. C1~C6 충족 0~1 (단일 테이블 단순 CRUD, SP 분기 없음, LoV 호출 없음) → 범용 OASIS 단일 BPMN. Phase 7 분리 미해당.

---

## §3. action 별 BPMN flow

### §3.1 action = search (masterRuleList_search)

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
| 1 | Task_2 | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleListMapper.GetRuleMasterList | ds_GetRuleMasterList | bpmn:10~25 |

### §3.2 action = save (masterRuleList_save)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=save ────┐
                                          ↓ (SequenceFlow_0nago4p)
                                     [SaveMasterRule "메인저장"]
                                     class: #{basePackage}SaveMasterRule
                                          ↓ (SequenceFlow_0tacpyk)
                                     [Task_2 "Main조회"] (재조회)
                                          ↓ (SequenceFlow_0lnje1n)
                                     [EndEvent_1]
```

| 단계 | 노드 | class | 호출 SQL | 비고 |
|---|---|---|---|---|
| 1 | SaveMasterRule | com.dongkuk.dmes.UserTask / #{basePackage}SaveMasterRule | TB_MCA_RULE_MASTER_Mapper.select / .insert / .update (java:48, 65, 77) | nativeeditor_status 분기 (inserted/updated) |
| 2 | Task_2 | CommonSelectTask | masterRuleListMapper.GetRuleMasterList | 저장 후 화면 재조회 |

### §3.3 통합 SequenceFlow 매트릭스 (As-Is 식별자 보존 — 5 개)

| flow id | name | source | target |
|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_2 |
| SequenceFlow_0lnje1n | - | Task_2 | EndEvent_1 |
| SequenceFlow_0nago4p | save | ExclusiveGateway_1 | SaveMasterRule |
| SequenceFlow_0tacpyk | - | SaveMasterRule | Task_2 |

비고: masterCategoryMng(8 flow) 과 달리 본 화면은 5 flow (delete flow 3 종 부재 + 전체조회 flow 부재).

---

## §4. UserTask Java 클래스

### §4.1 SaveMasterRule

| 항목 | As-Is | To-Be 매핑 권장 |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleList.service` (masterCategoryMng 선례) |
| 클래스 | SaveMasterRule | SaveMasterRule (As-Is 보존) |
| 인터페이스 | com.dongkuk.oasis.task.Wow | 동일 |
| run(Context, Task) 입력 | context.get("ds_grdMain") = List<Map<String,Object>> | 동일 |
| 분기 키 | `!nativeeditor_status` ∈ { "inserted", "updated" } (deleted 없음) | 동일 |
| 호출 SQL ID 패턴 | "TB_MCA_RULE_MASTER_Mapper.{select,insert,update}" (공통 CRUD Mapper) | JPA Repository 흡수 (existsById / save) |
| context 적재 | "cnt_save" key 로 전체 행수(grdMainList.size()) 적재 | 동일 |
| 예외 | inserted 중복 PK 시 UserException → IllegalTaskException | 동일 (existsById true 시 동일 메시지) |

### §4.2 호출 SQL → 분기 매트릭스 (To-Be 변경 반영)

| 호출 (java:43~78) | As-Is SQL ID | To-Be 처리 |
|---|---|---|
| inserted 사전체크 | TB_MCA_RULE_MASTER_Mapper.select (java:48) | `repository.existsById(ruleId)` true 시 UserException |
| inserted INSERT | TB_MCA_RULE_MASTER_Mapper.insert (java:65) | `repository.save(entity)` (RULE_ID/RULE_TP/RULE_DESC/RULE_OWNER_EMP_NO/RULE_NM/USE_TP/RULE_VER 7) |
| updated UPDATE | TB_MCA_RULE_MASTER_Mapper.update (java:77) | `repository.save(entity)` dirty checking (RULE_NM/RULE_DESC/USE_TP 3 SET) |

비고: masterCategoryMng(updated/deleted/inserted 3 분기) 과 달리 본 화면은 **inserted/updated 2 분기** (deleted 없음). inserted 에만 중복 PK 사전 SELECT + UserException 존재.

---

## §5. 트랜잭션 경계

| 구간 | 트랜잭션 단위 | 롤백 조건 |
|---|---|---|
| action=search | 단일 트랜잭션 (SELECT 1종) | DB 조회 오류 |
| action=save | 단일 트랜잭션 (UserTask 처리 + SELECT 재조회) | (a) inserted 중복 PK → UserException (java:50~54) (b) 임의 Exception (java:84) |

원칙:
- UserTask 내 다중 행 (inserted/updated 혼재) 처리 시 한 행이라도 중복 PK 발견 시 즉시 throw → 모든 변경 롤백.
- 후속 Task_2 (Main조회) 도 동일 트랜잭션 범위 — 재조회 결과로 ds_grdMain 갱신 후 commit.
- masterCategoryMng 과 달리 영향행 ≤ 0 검사 없음 (As-Is SaveMasterRule 미구현) — To-Be 보강 시 §12 결정 후보.

---

## §6. To-Be 식별자

### §6.1 화면 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 화면 ID | MasterRuleList | masterRuleList |
| 화면명 (titletext) | 업무기준 목록조회 | 업무기준 목록조회 (보존) |
| serviceId | MasterRuleList | masterRuleList |
| pageId | (없음 — xfdl) | masterRuleList |
| pageName | (없음) | masterRuleList |
| 모듈 | (cmb 폴더) | mcm |
| 모듈 그룹 | cmb | cmb |

### §6.2 BPMN 식별자 (사용자 정의 규칙: `{screenId}_{기능명}`)

| As-Is bpmn 식별자 | To-Be 기능 식별자 | 비고 |
|---|---|---|
| (process id) MasterRuleList | masterRuleList | bpmn:3 process id |
| (action) search | masterRuleList_search | SequenceFlow_0grwghu name |
| (action) save | masterRuleList_save | SequenceFlow_0nago4p name |
| Task_2 "Main조회" | masterRuleList_searchMain | bpmn:10 |
| SaveMasterRule "메인저장" | masterRuleList_saveMain | bpmn:37 |

비고: bpmn 노드 내부 id (Task_2 / SaveMasterRule 등) 는 보존, 사용자 정의 식별자(노드 name 의 To-Be 표기) 만 변경.

### §6.3 Mapper / SQL ID

| 항목 | As-Is | To-Be |
|---|---|---|
| Mapper namespace (목록) | MasterRuleListMapper | masterRuleListMapper |
| Mapper 파일 (As-Is) | mappers-cmb/MasterRuleListMapper.xml |
| Mapper 파일 (To-Be) | JPA Repository 흡수 → `com.dongkuk.dmes.mcm.repository.RuleMasterRepository` (native query 또는 JPQL) / 기존 Mapper.xml 은 `.asis` 보존 (Repository 는 모듈 단위 평탄 — masterCategoryMng 선례) |
| sqlKey (BPMN extension) | #{serviceId}Mapper.GetRuleMasterList | #{serviceId}Mapper.GetRuleMasterList (serviceId 가 masterRuleList 로 주입되어 자동 변환) |
| Java 호출 SQL namespace | TB_MCA_RULE_MASTER_Mapper.{select,insert,update} (공통 CRUD Mapper — 본 자산 외부) | RuleMasterRepository.{existsById,save} |

### §6.4 Java 클래스 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleList.service` (masterCategoryMng 선례) |
| 클래스명 | SaveMasterRule | SaveMasterRule (As-Is 보존 권장) |
| BPMN property class | #{basePackage}SaveMasterRule | 동일 (basePackage 만 To-Be 패키지로 주입) |

### §6.5 결정 완료 / 확인필요

활성 확인필요 = Q-008 ~ Q-012 (5 건, 분석리포트 §13). BPMN 영향 항목: Q-009 (RULE_ID != OLD_RULE_ID 필터 → search SQL 보존). 나머지 Q 는 FE/DB 영역. 본 BPMN 설계 진행 차단 사유 아님.

결정 내용 반영: delete flow 부재(As-Is 보존) / 전체조회 flow 부재(As-Is 보존) / 통신채널 REST / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleList.{service,dto}.*`.
