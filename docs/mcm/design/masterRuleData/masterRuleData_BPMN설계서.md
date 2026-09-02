---
screenId: masterRuleData
asIsId: MasterRuleData
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleData
pageId: masterRuleData
serviceId: masterRuleData
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 Data관리 (masterRuleData) BPMN설계서

> 본 문서는 [분석리포트](./masterRuleData_분석리포트.md) §8 (BPMN 워크플로우) / §6 (SQL ID 매트릭스) / §7 (Java 트랜잭션) 을 To-Be 식별자 규칙(`{screenId}_{기능명}`) 으로 매핑한다.

---

## §1. 액션 매트릭스

### §1.1 As-Is action ↔ To-Be 매핑 (분석 §4.6 / §8.4)

| As-Is action | xfdl 호출 | bpmn flow | sqlKey / class (As-Is) | To-Be action ID |
|---|---|---|---|---|
| search | fn_search (xfdl:372) | SequenceFlow_0grwghu → UserTask_067lppc → End | (UserTask) GetMasterRuleData → GetMasterRuleDataList | masterRuleData_search |
| lov | fn_lov (xfdl:455) | SequenceFlow_1x309em → Task_0ru18qa → End | #{serviceId}Mapper.GetRuleColList | masterRuleData_lov |
| save | fn_save (xfdl:523) | SequenceFlow_0dqldpo → UserTask_0zyva5v → UserTask_067lppc → End | (UserTask) SaveMasterRuleData → GetMasterRuleData | masterRuleData_save |
| search_export | fn_excelDown (xfdl:698) | SequenceFlow_17wvr16 → Task_02a3gu4 → End | #{serviceId}Mapper.GetMasterRuleDataExport | masterRuleData_searchExport |

### §1.2 client-side 액션 (BPMN 비대상)

| 액션 | xfdl 함수 | 비고 |
|---|---|---|
| rowAdd | fn_rowAdd (xfdl:470) | BPMN 송신 없음 |
| rowCopy | fn_rowCopy (xfdl:485) | BPMN 송신 없음 |
| rowDelete | fn_rowDelete (xfdl:497) | BPMN 송신 없음 (저장 시 nativeeditor_status=deleted 로 전송) |
| rowCancel | fn_rowCancel (xfdl:518) | BPMN 송신 없음 |
| excelUp | fn_excelUp (xfdl:716) | P-002 팝업 (BPMN 비대상) |
| fold | btn_fold_onclick (xfdl:692) | BPMN 송신 없음 |
| ruleId 선택 | div_search_btn_ruleId_onclick (xfdl:429) | P-001 팝업 (BPMN 비대상) |
| 그리드 헤드 클릭 | div_main_grd_main_onheadclick (xfdl:732) | BPMN 송신 없음 |

---

## §2. API 패턴 판정

### §2.1 As-Is 패턴

| 항목 | 값 |
|---|---|
| 통신 채널 | nexacro `gfn_transaction` (xfdl:425, 466, 578, 712) — oasis RPC 채널 |
| sqlKey 변수 치환 | `#{serviceId}Mapper.{sqlId}` — serviceId = "MasterRuleData" (As-Is) |
| UserTask 클래스 (As-Is) | `#{basePackage}GetMasterRuleData` / `#{basePackage}SaveMasterRuleData` — basePackage = "com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData." |
| UserTask 클래스 (To-Be) | basePackage = "com.dongkuk.dmes.mcm.cmb.masterRuleData.service." (RULE.md §"패키지 명명 규칙" §3-1 — masterCategoryMng 선례) |
| resultKey | Task_0ru18qa → `ds_GetRuleColList` / Task_02a3gu4 → `ds_GetMasterRuleDataExport` / UserTask(Get) → `ds_GetMasterRuleData` (java:119) / UserTask(Save) → `cnt_save` (java:183) |
| isServiceResult | true (DB Task — bpmn:29, 69) |
| 트랜잭션 단위 | BPMN process 1회 실행 = 1 트랜잭션 |

### §2.2 To-Be 패턴 (참고 — 구현 시 결정)

| 항목 | 값 |
|---|---|
| 통신 채널 | HTTP REST (cactus OASIS 표준) — 분석 §12 잠정 |
| sqlKey 치환 변수 | `#{serviceId}Mapper.{sqlId}` 유지 — serviceId = "masterRuleData" |
| Mapper namespace 변경 | "MasterRuleDataMapper" → "masterRuleDataMapper" |
| UserTask 클래스 | "GetMasterRuleData" / "SaveMasterRuleData" 클래스명 보존, 패키지만 `com.dongkuk.dmes.mcm.cmb.masterRuleData.service.*` |
| 응답 key | `ds_GetMasterRuleData` / `ds_GetRuleColList` / `ds_GetMasterRuleDataExport` / `cnt_save` 보존 |
| ★ 영속성 방식 | 동적 테이블/컬럼 — JPA vs MyBatis(동적 SQL) 사용자 확인 필수 (RULE.md §영속성 / Q-005 / Q-007) |

---

## §3. action 별 BPMN flow

### §3.1 action = search (masterRuleData_search)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search ────┐
                                            ↓ (SequenceFlow_0grwghu)
                                       [UserTask_067lppc "Main 조회"]
                                       class: #{basePackage}GetMasterRuleData
                                       (내부) GetMasterRuleDataList + TB_MCA_RULE_COL_LIST_Mapper.select
                                       resultKey: ds_GetMasterRuleData
                                            ↓ (SequenceFlow_1jzueym)
                                       [EndEvent_1]
```

| 단계 | 노드 | class | 호출 SQL (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | UserTask_067lppc | com.dongkuk.dmes.UserTask / #{basePackage}GetMasterRuleData | masterRuleDataMapper.GetMasterRuleDataList (+ TB_MCA_RULE_COL_LIST_Mapper.select) | ds_GetMasterRuleData | bpmn:40~50 / java(Get):51, 118 |

### §3.2 action = lov (masterRuleData_lov)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=lov ────┐
                                         ↓ (SequenceFlow_1x309em)
                                    [Task_0ru18qa "lov목록 조회"]
                                    class: CommonSelectTask
                                    sqlKey: #{serviceId}Mapper.GetRuleColList
                                    resultKey: ds_GetRuleColList
                                         ↓ (SequenceFlow_03tu9nr)
                                    [EndEvent_1]
```

| 단계 | 노드 | class | sqlKey (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | Task_0ru18qa | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleDataMapper.GetRuleColList | ds_GetRuleColList | bpmn:24~37 |

### §3.3 action = save (masterRuleData_save)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=save ────┐
                                          ↓ (SequenceFlow_0dqldpo)
                                     [UserTask_0zyva5v "Main 저장"]
                                     class: #{basePackage}SaveMasterRuleData
                                          ↓ (SequenceFlow_0vcg09z)
                                     [UserTask_067lppc "Main 조회"] (재조회)
                                          ↓ (SequenceFlow_1jzueym)
                                     [EndEvent_1]
```

| 단계 | 노드 | class | 호출 SQL | 비고 |
|---|---|---|---|---|
| 1 | UserTask_0zyva5v | com.dongkuk.dmes.UserTask / #{basePackage}SaveMasterRuleData | (긴급=Y) DynamicSqlExecutor / (N) `${pTable}_Mapper.update/delete/insert` + GetMaxRuleSeq(#4) | nativeeditor_status 분기 (java:70, 104, 146) |
| 2 | UserTask_067lppc | #{basePackage}GetMasterRuleData | masterRuleDataMapper.GetMasterRuleDataList | 저장 후 화면 재조회 |

### §3.4 action = search_export (masterRuleData_searchExport)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search_export ──┐
                                                 ↓ (SequenceFlow_17wvr16)
                                            [Task_02a3gu4 "Main 조회 엑셀 Export"]
                                            class: CommonSelectTask
                                            sqlKey: #{serviceId}Mapper.GetMasterRuleDataExport
                                            resultKey: ds_GetMasterRuleDataExport
                                                 ↓ (SequenceFlow_0k1ued4)
                                            [EndEvent_1]
```

| 단계 | 노드 | class | sqlKey (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | Task_02a3gu4 | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleDataMapper.GetMasterRuleDataExport | ds_GetMasterRuleDataExport | bpmn:64~77 |

### §3.5 통합 SequenceFlow 매트릭스 (As-Is 식별자 보존 — 분석 §8.3, 9개)

| flow id | name | source | target |
|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | UserTask_067lppc |
| SequenceFlow_1x309em | lov | ExclusiveGateway_1 | Task_0ru18qa |
| SequenceFlow_03tu9nr | - | Task_0ru18qa | EndEvent_1 |
| SequenceFlow_1jzueym | - | UserTask_067lppc | EndEvent_1 |
| SequenceFlow_0dqldpo | save | ExclusiveGateway_1 | UserTask_0zyva5v |
| SequenceFlow_0vcg09z | - | UserTask_0zyva5v | UserTask_067lppc |
| SequenceFlow_0k1ued4 | - | Task_02a3gu4 | EndEvent_1 |
| SequenceFlow_17wvr16 | search_export | ExclusiveGateway_1 | Task_02a3gu4 |

---

## §4. UserTask Java 클래스

### §4.1 GetMasterRuleData (조회)

| 항목 | As-Is | To-Be 매핑 권장 |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleData.service` |
| 클래스 | GetMasterRuleData | GetMasterRuleData (보존) |
| 인터페이스 | com.dongkuk.oasis.task.Wow | 동일 |
| 입력 | context: pRuleId/pTable + pWhere1~5/pOperator1~5/pVal1~5 + ds_srch(페이징) | 동일 |
| 내부 호출 | `TB_MCA_RULE_COL_LIST_Mapper.select` (컬럼정의·UPPER 판정) + `MasterRuleDataMapper.GetMasterRuleDataList` | masterRuleDataMapper.* (namespace 변경) |
| context 적재 | "ds_GetMasterRuleData" | 동일 |
| 예외 | catch → IllegalTaskException | 동일 |

### §4.2 SaveMasterRuleData (저장)

| 항목 | As-Is | To-Be 매핑 권장 |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleData.service` |
| 클래스 | SaveMasterRuleData | SaveMasterRuleData (보존) |
| 분기 키 | `!nativeeditor_status` ∈ { "updated", "deleted", "inserted" } | 동일 |
| 긴급 분기 | pOption=="Y" → DynamicSqlExecutor.{update/delete/insert}Data(SCHEMA+pTable, ...) | To-Be 동적 실행기 등가 (Q-007/Q-008) |
| 기존 분기 | pOption≠"Y" → `dao.{update/delete/insert}(pTable+"_Mapper.{op}", setMap)` | To-Be 동적 영속 전략 (Q-005/Q-007) |
| 채번 | GetMaxRuleSeq(#4) + RULE_SEQ/RULE_VER 세팅 | 동일 |
| audit | setAuditField (8 컬럼, 프로그램ID="MasterRuleData.SaveMasterRuleData") | To-Be 프로그램ID 규칙 + cactus 적용 검토 (Q-006) |
| 컬럼 필터 | filterKeyByColId (ds_lovData COL_ID + RULE_VER/RULE_SEQ) | 동일 |
| context 적재 | "cnt_save" | 동일 |

### §4.3 호출 SQL → namespace 매트릭스 (To-Be 변경 반영)

| 호출 위치 | As-Is SQL/Mapper | To-Be |
|---|---|---|
| GetMasterRuleData (java:51) | TB_MCA_RULE_COL_LIST_Mapper.select | (외부 Mapper — namespace 정책 결정 Q-001) |
| GetMasterRuleData (java:118) | MasterRuleDataMapper.GetMasterRuleDataList | masterRuleDataMapper.GetMasterRuleDataList |
| SaveMasterRuleData (java:138) | MasterRuleDataMapper.GetMaxRuleSeq | masterRuleDataMapper.GetMaxRuleSeq |
| SaveMasterRuleData (java:92/124/171, 기존방식) | `${pTable}_Mapper.update/delete/insert` (외부 동적) | To-Be 동적 영속 (Q-005/Q-007) |
| lov flow (bpmn:31) | #{serviceId}Mapper.GetRuleColList | masterRuleDataMapper.GetRuleColList |
| search_export flow (bpmn:71) | #{serviceId}Mapper.GetMasterRuleDataExport | masterRuleDataMapper.GetMasterRuleDataExport |

비고: orphan 후보 SQL #5/#6 (InsertMasterRuleSpecDataList / UpdateMasterRuleSpecDataList) 는 BPMN/Java 미참조 — Q-005 위임.

---

## §5. 트랜잭션 경계

| 구간 | 트랜잭션 단위 | 롤백 조건 |
|---|---|---|
| action=search | 단일 트랜잭션 (컬럼정의 + 데이터 SELECT) | DB 조회 오류 |
| action=lov | 단일 트랜잭션 (SELECT 1종) | DB 조회 오류 |
| action=save | 단일 트랜잭션 (UserTask 저장 + GetMaxRuleSeq + 후속 SELECT) | catch(Exception) → IllegalTaskException (java:185) |
| action=search_export | 단일 트랜잭션 (전건 SELECT) | DB 오류 |

원칙:
- ★ As-Is save 는 영향행 ≤ 0 시 예외를 던지지 않고 log 만 (java:95~100, 127~132, 174~179) — 부분 실패가 트랜잭션을 깨지 않음. To-Be 정책 강화 검토 (Q-008).
- 긴급적용(pOption=Y) 분기는 Mapper 미경유 — To-Be 동적 SQL 안전화 동반 필수 (Q-007).

---

## §6. To-Be 식별자

### §6.1 화면 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 화면 ID | MasterRuleData | masterRuleData |
| 화면명 (titletext) | 업무기준 Data관리 | 업무기준 Data관리 (보존) |
| serviceId | MasterRuleData | masterRuleData |
| pageId / pageName | (없음) | masterRuleData |
| 모듈 / 그룹 | (cmb 폴더) | mcm / cmb |

### §6.2 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| As-Is bpmn 식별자 | To-Be 기능 식별자 | 비고 |
|---|---|---|
| (process id) MasterRuleData | masterRuleData | bpmn:3 process id |
| (action) search | masterRuleData_search | SequenceFlow_0grwghu name |
| (action) lov | masterRuleData_lov | SequenceFlow_1x309em name |
| (action) save | masterRuleData_save | SequenceFlow_0dqldpo name |
| (action) search_export | masterRuleData_searchExport | SequenceFlow_17wvr16 name |
| UserTask_067lppc "Main 조회" | masterRuleData_searchMain | bpmn:40 |
| UserTask_0zyva5v "Main 저장" | masterRuleData_saveMain | bpmn:52 |
| Task_0ru18qa "lov목록 조회" | masterRuleData_lovColList | bpmn:24 |
| Task_02a3gu4 "Main 조회 엑셀 Export" | masterRuleData_exportMain | bpmn:64 |

비고: bpmn 노드 내부 id (UserTask_067lppc 등 자동 생성 id) 는 보존, 사용자 정의 식별자만 To-Be 표기.

### §6.3 Mapper / SQL ID

| 항목 | As-Is | To-Be |
|---|---|---|
| Mapper namespace | MasterRuleDataMapper | masterRuleDataMapper |
| Mapper 파일 (As-Is) | mappers-cmb/MasterRuleDataMapper.xml |
| Mapper 파일 (To-Be) | 동적 SQL 특성상 영속 전략 사용자 확인 (JPA native vs MyBatis 동적) — Q-005/Q-007 / 기존 Mapper.xml `.asis` 보존 |
| sqlKey (BPMN extension) | #{serviceId}Mapper.{sqlId} | #{serviceId}Mapper.{sqlId} (serviceId=masterRuleData 주입) |
| SQL ID (As-Is 6) | GetRuleColList / GetMasterRuleDataList / GetMasterRuleDataExport / GetMaxRuleSeq / InsertMasterRuleSpecDataList(orphan) / UpdateMasterRuleSpecDataList(orphan) | #5/#6 보존 vs 제거 = Q-005 |

### §6.4 Java 클래스 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleData.service` |
| 클래스명 | GetMasterRuleData / SaveMasterRuleData | 보존 |
| BPMN property class | #{basePackage}GetMasterRuleData / #{basePackage}SaveMasterRuleData | 동일 (basePackage 만 To-Be 주입) |

### §6.5 미결 (Q-NNN)

활성 확인필요 = 8건 (Q-001~Q-008, 분석 §12). Q-001 의 메타 테이블 부분은 해소(정본 `DMES-SECTION-MCA` sheet134/135 수록) — Q-001 은 동적 데이터 테이블 To-Be 전략으로 재초점. 본 화면은 동적 영속 + 긴급적용 분기로 미결 다수 — 개발 진입 전 사용자 결정 필수 (개발체크리스트 §1).
