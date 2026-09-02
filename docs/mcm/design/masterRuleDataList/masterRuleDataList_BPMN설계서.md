---
screenId: masterRuleDataList
asIsId: MasterRuleDataList
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleDataList
pageId: masterRuleDataList
serviceId: masterRuleDataList
작성일: 2026-06-05
작성자: Agent
---

# 업무기준 상세조회 (masterRuleDataList) BPMN설계서

> 본 문서는 [분석리포트](./masterRuleDataList_분석리포트.md) §8 (BPMN 워크플로우) / §6 (SQL ID 매트릭스) / §7 (Java 트랜잭션) 을 To-Be 식별자 규칙(`{screenId}_{기능명}`) 으로 매핑한다.

---

## §1. 액션 매트릭스

### §1.1 As-Is action ↔ To-Be 매핑 (분석 §4.6 / §8.4)

| As-Is action | xfdl 호출 | bpmn flow | sqlKey / class (As-Is) | To-Be action ID |
|---|---|---|---|---|
| search | fn_search (xfdl:369) | SequenceFlow_0grwghu → UserTask_067lppc → End | (UserTask) GetMasterRuleDataList → GetMasterRuleDataList(#2) | masterRuleDataList_search |
| lov | fn_lov (xfdl:568) | SequenceFlow_1x309em → Task_0ru18qa → End | #{serviceId}Mapper.GetRuleColList | masterRuleDataList_lov |
| search_export | fn_excelDown (xfdl:425) | SequenceFlow_167nz13 → Task_0ifp7u0 → End | #{serviceId}Mapper.GetMasterRuleDataListExport | masterRuleDataList_searchExport |

비고: ★ masterRuleData(4 action — search/lov/save/search_export) 대비 본 화면은 **save 가 없는 3 action** — 조회 전용 (분석 §0). 따라서 save 관련 UserTask(Main 저장)·SequenceFlow 2개가 본 BPMN 에는 없다.

### §1.2 client-side 액션 (BPMN 비대상)

| 액션 | xfdl 함수 | 비고 |
|---|---|---|
| fold | btn_fold_onclick (xfdl:534) | BPMN 송신 없음 |
| ruleId 선택 | div_search_btn_ruleId_onclick (xfdl:540) | P-001 팝업 (BPMN 비대상) |
| 마스터코드 셀 클릭 | div_main_grdMain_oncellclick (xfdl:583) | P-002 팝업 (BPMN 비대상) |
| 그리드 헤드 클릭 | div_main_grdMain_onheadclick (xfdl:598) | 정렬 (BPMN 송신 없음) |

비고: masterRuleData 의 행추가/복사/삭제/취소(fn_rowAdd/Copy/Delete/Cancel)·엑셀업(fn_excelUp) client-side 액션이 본 화면엔 없다 (조회 전용 — 분석 §4.2 비고).

---

## §2. API 패턴 판정

### §2.1 As-Is 패턴

| 항목 | 값 |
|---|---|
| 통신 채널 | nexacro `gfn_transaction` (xfdl:421, 439, 579) — oasis RPC 채널 |
| sqlKey 변수 치환 | `#{serviceId}Mapper.{sqlId}` — serviceId = "MasterRuleDataList" (As-Is) |
| UserTask 클래스 (As-Is) | `#{basePackage}GetMasterRuleDataList` — basePackage = "com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList." |
| UserTask 클래스 (To-Be) | basePackage = "com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service." (RULE.md §"패키지 명명 규칙" — masterRuleData / masterCategoryMng 선례) |
| resultKey | Task_0ru18qa → `ds_GetRuleColList` (bpmn:31) / Task_0ifp7u0 → `ds_GetMasterRuleDataListExport` (bpmn:58) / UserTask_067lppc(Get) → `ds_GetMasterRuleDataList` (java:124) |
| isServiceResult | true (DB Task — bpmn:28, 55) |
| 트랜잭션 단위 | BPMN process 1회 실행 = 1 트랜잭션 |

### §2.2 To-Be 패턴 (참고 — 구현 시 결정)

| 항목 | 값 |
|---|---|
| 통신 채널 | HTTP REST (cactus OASIS 표준) — 분석 §12 잠정 |
| sqlKey 치환 변수 | `#{serviceId}Mapper.{sqlId}` 유지 — serviceId = "masterRuleDataList" |
| Mapper namespace 변경 | "MasterRuleDataListMapper" → "masterRuleDataListMapper" |
| UserTask 클래스 | "GetMasterRuleDataList" 클래스명 보존, 패키지만 `com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service.*` |
| 응답 key | `ds_GetMasterRuleDataList` / `ds_GetRuleColList` / `ds_GetMasterRuleDataListExport` 보존 |
| ★ 영속성 방식 | **JPA (가족 공통 확정 2026-06-04)** — 메타 테이블 JPA Repository, 동적 데이터 테이블 `TB_MCA_<업무기준ID>` 는 native 동적 SQL + 화이트리스트 안전화 (RULE.md §영속성 / Q-007). 저장 분기 없음(조회 전용) |

---

## §3. action 별 BPMN flow

### §3.1 action = search (masterRuleDataList_search)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search ────┐
                                            ↓ (SequenceFlow_0grwghu)
                                       [UserTask_067lppc "Main 조회"]
                                       class: #{basePackage}GetMasterRuleDataList
                                       (내부) GetMasterRuleDataList(#2) + TB_MCA_RULE_COL_LIST_Mapper.select
                                       resultKey: ds_GetMasterRuleDataList
                                            ↓ (SequenceFlow_1jzueym)
                                       [EndEvent_1]
```

| 단계 | 노드 | class | 호출 SQL (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | UserTask_067lppc | com.dongkuk.dmes.UserTask / #{basePackage}GetMasterRuleDataList | masterRuleDataListMapper.GetMasterRuleDataList (+ TB_MCA_RULE_COL_LIST_Mapper.select) | ds_GetMasterRuleDataList | bpmn:39~48 / java:51, 123 |

### §3.2 action = lov (masterRuleDataList_lov)

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
| 1 | Task_0ru18qa | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleDataListMapper.GetRuleColList | ds_GetRuleColList | bpmn:23~36 |

비고: search action 시에도 Java(GetMasterRuleDataList) 가 내부에서 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 를 추가 호출 — BPMN lov flow 와 별개로 UPPER 판정용 컬럼정의 조회 (분석 §6 비고 / §8.4 비고).

### §3.3 action = save — 해당 없음

- 본 화면은 **조회 전용** — save UserTask·flow 가 없다 (분석 §0 / §6 비고 / §7.1 비고). masterRuleData 의 UserTask_0zyva5v("Main 저장")·SequenceFlow_0dqldpo/0vcg09z 에 해당하는 노드가 본 BPMN 에 존재하지 않음 (bpmn 전수 — Start/End + Gateway + Task 2 + UserTask 1).

### §3.4 action = search_export (masterRuleDataList_searchExport)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search_export ──┐
                                                 ↓ (SequenceFlow_167nz13)
                                            [Task_0ifp7u0 "Main 조회 엑셀 Export"]
                                            class: CommonSelectTask
                                            sqlKey: #{serviceId}Mapper.GetMasterRuleDataListExport
                                            resultKey: ds_GetMasterRuleDataListExport
                                                 ↓ (SequenceFlow_1lritbv)
                                            [EndEvent_1]
```

| 단계 | 노드 | class | sqlKey (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | Task_0ifp7u0 | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleDataListMapper.GetMasterRuleDataListExport | ds_GetMasterRuleDataListExport | bpmn:50~63 |

### §3.5 통합 SequenceFlow 매트릭스 (As-Is 식별자 보존 — 분석 §8.3, 7개)

| flow id | name | source | target |
|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | UserTask_067lppc |
| SequenceFlow_1x309em | lov | ExclusiveGateway_1 | Task_0ru18qa |
| SequenceFlow_03tu9nr | - | Task_0ru18qa | EndEvent_1 |
| SequenceFlow_1jzueym | - | UserTask_067lppc | EndEvent_1 |
| SequenceFlow_167nz13 | search_export | ExclusiveGateway_1 | Task_0ifp7u0 |
| SequenceFlow_1lritbv | - | Task_0ifp7u0 | EndEvent_1 |

비고: SequenceFlow 7개 — masterRuleData(9개) 대비 save 관련 flow(0dqldpo/0vcg09z) 2개가 없다 (분석 §8.3 비고).

---

## §4. UserTask Java 클래스

### §4.1 GetMasterRuleDataList (조회)

| 항목 | As-Is | To-Be 매핑 권장 |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList | - |
| 패키지 (To-Be) | - | `com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service` |
| 클래스 | GetMasterRuleDataList | GetMasterRuleDataList (보존) |
| 인터페이스 | com.dongkuk.oasis.task.Wow | 동일 |
| 입력 | context: pRuleId/pTable + pWhere1~5/pOperator1~5/pVal1~5 + ds_srch(페이징) | 동일 |
| 내부 호출 | `TB_MCA_RULE_COL_LIST_Mapper.select` (컬럼정의·UPPER 판정, java:51) + `MasterRuleDataListMapper.GetMasterRuleDataList` (java:123) | masterRuleDataListMapper.* (namespace 변경) |
| context 적재 | "ds_GetMasterRuleDataList" (java:124) | 동일 |
| 예외 | catch → IllegalTaskException (java:127~131) | 동일 |
| ★ 변수명 혼동 | `pTable = context.get("pRuleId")` (실제 ruleId 값, java:29) — MYBATIS_WHERE("RULE_ID='"+pTable+"'") 에 사용 (java:50) | To-Be 변수명 정정 검토 (Q-009) — As-Is 보존 |

### §4.2 SaveMasterRuleDataList (저장) — 해당 없음

- 본 화면은 조회 전용 — 저장 클래스(SaveMasterRuleData 등가)가 없다 (분석 §7.1 비고 / §0). masterRuleData 의 SaveMasterRuleData·filterKeyByColId·setAuditField·GetMaxRuleSeq·DynamicSqlExecutor 분기가 본 화면에 전혀 없음.

### §4.3 호출 SQL → namespace 매트릭스 (To-Be 변경 반영)

| 호출 위치 | As-Is SQL/Mapper | To-Be |
|---|---|---|
| GetMasterRuleDataList (java:51) | TB_MCA_RULE_COL_LIST_Mapper.select | (외부 Mapper — namespace 정책 결정 Q-001b / 동적 영속 전략) |
| GetMasterRuleDataList (java:123) | MasterRuleDataListMapper.GetMasterRuleDataList | masterRuleDataListMapper.GetMasterRuleDataList |
| lov flow (bpmn:30) | #{serviceId}Mapper.GetRuleColList | masterRuleDataListMapper.GetRuleColList |
| search_export flow (bpmn:57) | #{serviceId}Mapper.GetMasterRuleDataListExport | masterRuleDataListMapper.GetMasterRuleDataListExport |

비고: ★ orphan SQL 없음 — 본 Mapper 는 조회 3종(GetRuleColList / GetMasterRuleDataList / GetMasterRuleDataListExport)뿐이며 INSERT/UPDATE/GetMaxRuleSeq/orphan SQL 이 정의되지 않음 (분석 §6 비고). masterRuleData 의 Q-005(orphan) 비해당.

---

## §5. 트랜잭션 경계

| 구간 | 트랜잭션 단위 | 롤백 조건 |
|---|---|---|
| action=search | 단일 트랜잭션 (컬럼정의 + 데이터 SELECT + 페이징) | DB 조회 오류 → IllegalTaskException (java:130) |
| action=lov | 단일 트랜잭션 (SELECT 1종) | DB 조회 오류 |
| action=search_export | 단일 트랜잭션 (전건 SELECT) | DB 오류 |

원칙:
- ★ 3 action 모두 단일 task 후 즉시 End — 후속 자동 조회(save→search) 연쇄 없음 (분석 §7.2 / §8.4). masterRuleData 의 save→재조회 연쇄가 본 화면엔 없다(저장 자체 부재).
- 동적 테이블/컬럼 `${pTable}`/`${pWhereN}`/`${pOperatorN}`/`${pValN}` 치환은 To-Be 동적 SQL 안전화(화이트리스트 + 바인딩) 동반 필수 (Q-007).

---

## §6. To-Be 식별자

### §6.1 화면 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 화면 ID | MasterRuleDataList | masterRuleDataList |
| 화면명 (titletext) | 업무기준 상세조회 | 업무기준 상세조회 (보존) |
| serviceId | MasterRuleDataList | masterRuleDataList |
| pageId / pageName | (없음) | masterRuleDataList |
| 모듈 / 그룹 | (cmb 폴더) | mcm / cmb |

### §6.2 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| As-Is bpmn 식별자 | To-Be 기능 식별자 | 비고 |
|---|---|---|
| (process id) MasterRuleDataList | masterRuleDataList | bpmn:3 process id |
| (action) search | masterRuleDataList_search | SequenceFlow_0grwghu name (bpmn:22) |
| (action) lov | masterRuleDataList_lov | SequenceFlow_1x309em name (bpmn:37) |
| (action) search_export | masterRuleDataList_searchExport | SequenceFlow_167nz13 name (bpmn:64) |
| UserTask_067lppc "Main 조회" | masterRuleDataList_searchMain | bpmn:39 |
| Task_0ru18qa "lov목록 조회" | masterRuleDataList_lovColList | bpmn:23 |
| Task_0ifp7u0 "Main 조회 엑셀 Export" | masterRuleDataList_exportMain | bpmn:50 |

비고: bpmn 노드 내부 id (UserTask_067lppc 등 자동 생성 id) 는 보존, 사용자 정의 식별자만 To-Be 표기. masterRuleData 의 "Main 저장"(saveMain) 노드는 본 화면에 없음(조회 전용).

### §6.3 Mapper / SQL ID

| 항목 | As-Is | To-Be |
|---|---|---|
| Mapper namespace | MasterRuleDataListMapper | masterRuleDataListMapper |
| Mapper 파일 (As-Is) | mappers-cmb/MasterRuleDataListMapper.xml | - |
| Mapper 파일 (To-Be) | - | 동적 SQL 특성상 영속 전략 = **JPA(가족 공통) + 동적 데이터 테이블 native 동적 SQL(화이트리스트)** — Q-007 / 기존 Mapper.xml `.asis` 보존 |
| sqlKey (BPMN extension) | #{serviceId}Mapper.{sqlId} | #{serviceId}Mapper.{sqlId} (serviceId=masterRuleDataList 주입) |
| SQL ID (As-Is 3) | GetRuleColList / GetMasterRuleDataList / GetMasterRuleDataListExport | 보존 (orphan 없음) |

### §6.4 Java 클래스 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList | - |
| 패키지 (To-Be) | - | `com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service` |
| 클래스명 | GetMasterRuleDataList | 보존 |
| BPMN property class | #{basePackage}GetMasterRuleDataList | 동일 (basePackage 만 To-Be 주입) |

### §6.5 미결 (Q-NNN)

활성 확인필요 = 2건 (Q-004 부모 호출 화면 — 별도 phase / Q-009 Java 변수명 혼동 정정, 분석 §12). Q-001a(메타 테이블 DMES-SECTION-MCA 수록 해소)·Q-001b(동적 데이터 테이블 = DDL on-demand)·Q-002(초기값 보존)·Q-003(FE 동적그리드 동일 구현)·Q-007(동적 `${}` 안전화)·영속성(JPA) 는 **가족 공통 확정 2026-06-04**. 본 화면은 저장·긴급적용·orphan SQL 이 없어 masterRuleData 의 Q-005/Q-006/Q-008 은 비해당 — 개발 진입 전 잔여 2 Q 검토 (개발체크리스트 §1).
