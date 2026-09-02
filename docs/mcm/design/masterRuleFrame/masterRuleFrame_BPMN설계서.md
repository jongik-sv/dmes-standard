---
screenId: masterRuleFrame
asIsId: MasterRuleFrame
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleFrame
pageId: masterRuleFrame
serviceId: masterRuleFrame
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 구조관리 (masterRuleFrame) BPMN설계서

> 본 문서는 [분석리포트](./masterRuleFrame_분석리포트.md) §8 (BPMN 워크플로우) 및 §6 (SQL ID 매트릭스) 를 To-Be 식별자 규칙(`{screenId}_{기능명}`) 으로 매핑한다.

---

## §1. 액션 매트릭스

### §1.1 As-Is action ↔ To-Be 매핑

| As-Is action | xfdl 호출 | bpmn flow | sqlKey / class (As-Is) | To-Be action ID (`{screenId}_{기능명}`) |
|---|---|---|---|---|
| search | fn_search (xfdl:249) | SequenceFlow_0grwghu → Task_1j1g5cn → Task_1c4n8uv → End | GetRuleColInList + GetRuleColOutList | masterRuleFrame_search |
| save | fn_save (xfdl:263) | SequenceFlow_1ul62kh → SaveMasterRuleColList → Task_1j1g5cn → Task_1c4n8uv → End | (UserTask) SaveMasterRuleColList → GetRuleColInList + GetRuleColOutList | masterRuleFrame_save |

### §1.2 client-side 액션 (BPMN 비대상)

| 액션 | xfdl 함수 | 비고 |
|---|---|---|
| 업무기준 팝업 | div_search_div_search_btn_ruleIdPop_onclick (xfdl:401) | P-001 호출 — BPMN 송신 없음 |
| 기초데이터등록 팝업 | div_search_div_search1_btn_ruleCol_onclick (xfdl:424) | P-002 호출 — BPMN 송신 없음 |
| 행추가 IN | div_main_div_in_btn_rowAdd_onclick (xfdl:450) | BPMN 송신 없음 |
| 행삭제 IN | div_main_div_in_btn_rowDelete_onclick (xfdl:462) | BPMN 송신 없음 |
| 행추가 OUT | div_main_div_out_btn_rowAdd_onclick (xfdl:468) | BPMN 송신 없음 |
| 행삭제 OUT | div_main_div_out_btn_rowDelete_onclick (xfdl:480) | BPMN 송신 없음 |
| 접기 | btn_fold_onclick (xfdl:444) | BPMN 송신 없음 |

---

## §2. API 패턴 판정

### §2.1 As-Is 패턴

| 항목 | 값 |
|---|---|
| 통신 채널 | nexacro `gfn_transaction` (xfdl:259, 368) — oasis 자체 RPC 채널 |
| sqlKey 변수 치환 | `#{serviceId}Mapper.{sqlId}` — serviceId = "MasterRuleFrame" (As-Is) |
| UserTask 클래스 변수 치환 (As-Is) | `#{basePackage}SaveMasterRuleColList` — basePackage = "com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame." |
| UserTask 클래스 변수 치환 (To-Be) | basePackage = "com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service." (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동) |
| paramKey | (Task_1j1g5cn / Task_1c4n8uv 의 paramKey = 빈값 — 자동 모드, xfdl 의 sArgument pRuleId 전달) |
| resultKey | Task_1j1g5cn → `ds_GetRuleColInList` / Task_1c4n8uv → `ds_GetRuleColOutList` (분석리포트 §8.2) |
| isServiceResult | true (모든 DB Task — bpmn:25, 41) — gfn_transaction 의 sOutDatasets 로 직접 매핑 |
| 트랜잭션 단위 | BPMN process 1회 실행 = 1 트랜잭션 (UserTask 내부 delete+insert + 후속 SELECT 포함) |

### §2.2 To-Be 패턴 (참고 — 구현 시 결정)

| 항목 | 값 |
|---|---|
| 통신 채널 | HTTP REST (cactus OASIS 표준) |
| sqlKey 치환 변수 | `#{serviceId}Mapper.{sqlId}` 패턴 유지 (oasis 호환) — serviceId = "masterRuleFrame" |
| Mapper namespace 변경 | "MasterRuleFrameMapper" → "masterRuleFrameMapper" |
| UserTask 클래스 변경 | "SaveMasterRuleColList" 클래스명 보존, 패키지만 `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service.*` 로 이전 |
| 외부 공통 Mapper | `TB_MCA_RULE_COL_LIST_Mapper.delete/insert` → JPA Repository `deleteByRuleId` + `saveAll` (Repository = `com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository`) |
| 응답 key | `ds_GetRuleColInList` / `ds_GetRuleColOutList` / `cnt_save` 보존 |

---

## §3. action 별 BPMN flow

### §3.1 action = search (masterRuleFrame_search)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search ────┐
                                            ↓ (SequenceFlow_0grwghu)
                                       [Task_1j1g5cn "결과 항목 조회(IN)"]
                                       class: CommonSelectTask
                                       sqlKey: #{serviceId}Mapper.GetRuleColInList
                                       resultKey: ds_GetRuleColInList
                                            ↓ (SequenceFlow_19mau2h)
                                       [Task_1c4n8uv "결과 항목 조회(OUT)"]
                                       class: CommonSelectTask
                                       sqlKey: #{serviceId}Mapper.GetRuleColOutList
                                       resultKey: ds_GetRuleColOutList
                                            ↓ (SequenceFlow_10i9t2b)
                                       [EndEvent_1]
```

| 단계 | 노드 | class | sqlKey (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | Task_1j1g5cn | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleFrameMapper.GetRuleColInList | ds_GetRuleColInList | bpmn:20~34 |
| 2 | Task_1c4n8uv | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterRuleFrameMapper.GetRuleColOutList | ds_GetRuleColOutList | bpmn:36~49 |

### §3.2 action = save (masterRuleFrame_save)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=save ────┐
                                          ↓ (SequenceFlow_1ul62kh)
                                     [SaveMasterRuleColList "저장"]
                                     class: #{basePackage}SaveMasterRuleColList
                                     (delete-all RULE_ID → IN insert → OUT insert)
                                          ↓ (SequenceFlow_0ifq7qf)
                                     [Task_1j1g5cn "결과 항목 조회(IN)"] (재조회)
                                          ↓ (SequenceFlow_19mau2h)
                                     [Task_1c4n8uv "결과 항목 조회(OUT)"] (재조회)
                                          ↓ (SequenceFlow_10i9t2b)
                                     [EndEvent_1]
```

| 단계 | 노드 | class | 호출 SQL | 비고 |
|---|---|---|---|---|
| 1 | SaveMasterRuleColList | com.dongkuk.dmes.UserTask / #{basePackage}SaveMasterRuleColList | TB_MCA_RULE_COL_LIST_Mapper.delete (java:34) + TB_MCA_RULE_COL_LIST_Mapper.insert (java:58, 83) | delete-all → IN/OUT insert 루프 |
| 2 | Task_1j1g5cn | CommonSelectTask | masterRuleFrameMapper.GetRuleColInList | 저장 후 IN 재조회 |
| 3 | Task_1c4n8uv | CommonSelectTask | masterRuleFrameMapper.GetRuleColOutList | 저장 후 OUT 재조회 |

### §3.3 통합 SequenceFlow 매트릭스 (As-Is 식별자 보존)

| flow id | name | source | target |
|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_1j1g5cn |
| SequenceFlow_19mau2h | - | Task_1j1g5cn | Task_1c4n8uv |
| SequenceFlow_10i9t2b | - | Task_1c4n8uv | EndEvent_1 |
| SequenceFlow_1ul62kh | save | ExclusiveGateway_1 | SaveMasterRuleColList |
| SequenceFlow_0ifq7qf | - | SaveMasterRuleColList | Task_1j1g5cn |

비고: Task_1j1g5cn 은 incoming 2개 (SequenceFlow_0grwghu + SequenceFlow_0ifq7qf) — search 진입과 save 후 재조회가 합류 (bpmn:31~32).

---

## §4. UserTask Java 클래스

### §4.1 SaveMasterRuleColList

| 항목 | As-Is | To-Be 매핑 권장 |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame | - |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service` (RULE.md §"패키지 명명 규칙" §3-1) | - |
| 클래스 | SaveMasterRuleColList | SaveMasterRuleColList (As-Is 보존) |
| 인터페이스 | com.dongkuk.oasis.task.Wow | 동일 |
| run(Context, Task) 입력 | context.get("ds_grdIn") / context.get("ds_grdOut") = List<Map<String,Object>> | 동일 |
| 처리 패턴 | delete-all (RULE_ID 단위) → IN insert 루프 → OUT insert 루프 | 동일 (또는 JPA deleteByRuleId + saveAll) |
| 제외 키 | `!nativeeditor_status == "deleted"` 행은 insert 제외 | 동일 |
| COL_SEQ | IN/OUT 통합 단일 카운터 (cnt+1) 재계산 | 동일 |
| RULE_VER 보정 | 빈값이면 "1" | 동일 |
| context 적재 | "cnt_save" key 로 삽입 행수 누적 | 동일 |
| 예외 | insert 영향행 ≤ 0 시 throw → IllegalTaskException | 동일 |

### §4.2 호출 SQL → namespace 매트릭스 (To-Be 변경 반영)

| 호출 (java) | As-Is SQL ID | To-Be SQL ID / 대체 |
|---|---|---|
| delete (java:34) | TB_MCA_RULE_COL_LIST_Mapper.delete | (To-Be) MasterRuleColListRepository.deleteByRuleId(ruleId) 또는 native |
| insert IN (java:58) | TB_MCA_RULE_COL_LIST_Mapper.insert | (To-Be) MasterRuleColListRepository.save/saveAll |
| insert OUT (java:83) | TB_MCA_RULE_COL_LIST_Mapper.insert | (To-Be) 동일 |

비고:
- 본 화면 Mapper.xml(MasterRuleFrameMapper) 에는 SELECT 2개만 존재. delete/insert 는 외부 공통 Mapper (TB_MCA_RULE_COL_LIST_Mapper) 호출 — To-Be Repository 흡수 시 본 화면 전용 Repository 메서드로 이관.
- delete 반환값 미검증 (검증 블록 java:35~40 주석) — As-Is 보존 (사용자 결정).

---

## §5. 트랜잭션 경계

| 구간 | 트랜잭션 단위 | 롤백 조건 |
|---|---|---|
| action=search | 단일 트랜잭션 (SELECT 2종 IN/OUT) | DB 조회 오류 |
| action=save | 단일 트랜잭션 (delete 1 + insert N + SELECT 2종 재조회) | (a) insert 영향행 ≤ 0 (java:58, 83) (b) 임의 Exception (java:95) |

원칙:
- UserTask 내 delete(RULE_ID 전체) → IN insert 루프 → OUT insert 루프 처리 시 한 insert 라도 영향행 ≤ 0 이면 즉시 throw → delete 포함 전량 롤백.
- 후속 Task_1j1g5cn (조회 IN) / Task_1c4n8uv (조회 OUT) 도 동일 트랜잭션 범위 — 재조회 결과로 ds_grdIn / ds_grdOut 갱신 후 commit.
- **OASIS 서비스 `@Transactional` 금지 — cactus TransactionTemplate 사용** (To-Be 구현 — 메모리: CGLIB 프록시 `-parameters` 손실).

---

## §6. To-Be 식별자

### §6.1 화면 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 화면 ID | MasterRuleFrame | masterRuleFrame |
| 화면명 (titletext) | 업무기준 구조관리 | 업무기준 구조관리 (보존) |
| serviceId | MasterRuleFrame | masterRuleFrame |
| pageId | (없음 — xfdl) | masterRuleFrame |
| pageName | (없음) | masterRuleFrame |
| 모듈 | (cmb 폴더) | mcm |
| 모듈 그룹 | cmb | cmb |

### §6.2 BPMN 식별자 (사용자 정의 규칙: `{screenId}_{기능명}`)

| As-Is bpmn 식별자 | To-Be 기능 식별자 | 비고 |
|---|---|---|
| (process id) MasterRuleFrame | masterRuleFrame | bpmn:3 process id |
| (action) search | masterRuleFrame_search | SequenceFlow_0grwghu name |
| (action) save | masterRuleFrame_save | SequenceFlow_1ul62kh name |
| Task_1j1g5cn "결과 항목 조회(IN)" | masterRuleFrame_searchIn | bpmn:20 |
| Task_1c4n8uv "결과 항목 조회(OUT)" | masterRuleFrame_searchOut | bpmn:36 |
| SaveMasterRuleColList "저장" | masterRuleFrame_save (UserTask) | bpmn:51 |

비고: bpmn 노드 내부 id (Task_1j1g5cn 등 자동 생성 id) 는 보존, 사용자 정의 식별자(노드 name 의 To-Be 표기) 만 변경.

### §6.3 Mapper / SQL ID

| 항목 | As-Is | To-Be |
|---|---|---|
| Mapper namespace | MasterRuleFrameMapper | masterRuleFrameMapper |
| Mapper 파일 (As-Is) | mappers-cmb/MasterRuleFrameMapper.xml (SELECT 2) |
| Mapper 파일 (To-Be) | JPA Repository 로 흡수 → `com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository` (native query) / 기존 Mapper.xml 은 `.asis` 보존 (RULE.md §"패키지 명명 규칙" §3-1 — Repository 는 모듈 단위 평탄) |
| sqlKey (BPMN extension) | #{serviceId}Mapper.GetRuleColInList | #{serviceId}Mapper.GetRuleColInList (serviceId 가 masterRuleFrame 로 주입되어 자동 변환) |
| SQL ID | GetRuleColInList / GetRuleColOutList (+ 외부 TB_MCA_RULE_COL_LIST_Mapper.delete/insert) | 동일 (외부 delete/insert 는 Repository 흡수) |

### §6.4 Java 클래스 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service` (RULE.md §"패키지 명명 규칙" §3-1) |
| 클래스명 | SaveMasterRuleColList | SaveMasterRuleColList (As-Is 보존 권장) |
| BPMN property class | #{basePackage}SaveMasterRuleColList | 동일 (basePackage 만 To-Be 패키지로 주입) |

### §6.5 결정

활성 확인필요 = **0 건** (Q-002 cmb 등재 완료 / Q-003 메뉴 직접 진입 해소 2026-06-05 / Q-004 LoV As-Is 정적 유지 확정 / Q-001 To-Be 테이블 = DMES-SECTION-MCA sheet134/135 Resolved — 분석리포트 §12). BPMN 자체는 As-Is 2 action (search/save) + 3 노드 + 6 flow 1:1 보존. To-Be 패키지·namespace 변환만 적용.
