---
screenId: masterCategoryMng
asIsId: MasterCategoryMng
moduleId: mcm
moduleGroup: cma
pageName: masterCategoryMng
pageId: masterCategoryMng
serviceId: masterCategoryMng
작성일: 2026-05-27
작성자: Agent
---

# 카테고리 관리 (masterCategoryMng) BPMN설계서

> 본 문서는 [분석리포트](./masterCategoryMng_분석리포트.md) §8 (BPMN 워크플로우) 및 §6 (SQL ID 매트릭스) 를 To-Be 식별자 규칙(`{moduleId}{화면명}_{기능명}`) 으로 매핑한다.

---

## §1. 액션 매트릭스

### §1.1 As-Is action ↔ To-Be 매핑

| As-Is action | xfdl 호출 | bpmn flow | sqlKey (As-Is) | To-Be action ID (`{screenId}_{기능명}`) |
|---|---|---|---|---|
| search | fn_search (xfdl:145) | SequenceFlow_0grwghu → Task_2 → Task_0lk57sx → End | GetCodeCategoryList + GetCodeCategoryAllList | masterCategoryMng_search |
| save | fn_save (xfdl:161) | SequenceFlow_0x77sm3 → UserTask_154khzh → Task_2 → Task_0lk57sx → End | (UserTask) → GetCodeCategoryList + GetCodeCategoryAllList | masterCategoryMng_save |
| delete | (As-Is xfdl 미사용 — xfdl:327~353 블록 주석) | (As-Is BPMN 잔존: SequenceFlow_0w4k9x6 → Task_0k24d4u → ... ) | - | **To-Be 제거** (사용자 결정) |

### §1.2 client-side 액션 (BPMN 비대상)

| 액션 | xfdl 함수 | 비고 |
|---|---|---|
| rowAdd | fn_rowAdd (xfdl:286) | BPMN 송신 없음 |
| rowCopy | fn_rowCopy (xfdl:296) | BPMN 송신 없음 |
| rowDelete | fn_rowDelete (xfdl:308) | BPMN 송신 없음 (저장 시 nativeeditor_status=deleted 로 전송) |
| rowCancel | fn_rowCancel (xfdl:357) | BPMN 송신 없음 |
| excelDown | fn_excelDown (xfdl:280) | BPMN 송신 없음 |
| fold | btn_fold_onclick (xfdl:256) | BPMN 송신 없음 |
| 그리드 헤드 클릭 | div_main_grd_main_onheadclick (xfdl:262) | BPMN 송신 없음 |

---

## §2. API 패턴 판정

### §2.1 As-Is 패턴

| 항목 | 값 |
|---|---|
| 통신 채널 | nexacro `gfn_transaction` (xfdl:157, 219) — SOAP 또는 oasis 자체 RPC 채널 |
| sqlKey 변수 치환 | `#{serviceId}Mapper.{sqlId}` — serviceId = "MasterCategoryMng" (As-Is) |
| UserTask 클래스 변수 치환 (As-Is) | `#{basePackage}SaveTbMcmCodeCategory` — basePackage = "com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng." |
| UserTask 클래스 변수 치환 (To-Be) | basePackage = "com.dongkuk.dmes.mcm.cma.masterCategoryMng.service." (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| paramKey | (Task_2 의 paramKey = 빈값 — 자동 모드, xfdl 의 sArgument 가 전달됨) |
| resultKey | Task_2 → `ds_GetCodeCategoryList` / Task_0lk57sx → `ds_GetCodeCategoryAllList` / Task_0k24d4u → `deleteMain` (분석리포트 §8.2) |
| isServiceResult | true (모든 DB Task — bpmn:16, 54, 73) — gfn_transaction 의 sOutDatasets 로 직접 매핑 |
| 트랜잭션 단위 | BPMN process 1회 실행 = 1 트랜잭션 (UserTask 내부 + 후속 SELECT 포함) |

### §2.2 To-Be 패턴 (참고 — 구현 시 결정)

| 항목 | 값 |
|---|---|
| 통신 채널 | HTTP REST (cactus OASIS 표준) |
| sqlKey 치환 변수 | `#{serviceId}Mapper.{sqlId}` 패턴 유지 (oasis 호환) — serviceId = "masterCategoryMng" |
| Mapper namespace 변경 | "MasterCategoryMngMapper" → "masterCategoryMngMapper" |
| UserTask 클래스 변경 | "SaveTbMcmCodeCategory" 클래스명 보존, 패키지만 `com.dongkuk.dmes.mcm.cma.masterCategoryMng.service.*` 로 이전 (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| 응답 key | `ds_GetCodeCategoryList` / `ds_GetCodeCategoryAllList` / `deleteMain` / `cnt_merge` 보존 |

---

## §3. action 별 BPMN flow

### §3.1 action = search (masterCategoryMng_search)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=search ────┐
                                            ↓ (SequenceFlow_0grwghu)
                                       [Task_2 "Main조회"]
                                       class: CommonSelectTask
                                       sqlKey: #{serviceId}Mapper.GetCodeCategoryList
                                       resultKey: ds_GetCodeCategoryList
                                            ↓ (SequenceFlow_0lnje1n)
                                       [Task_0lk57sx "Main 전체조회"]
                                       class: CommonSelectTask
                                       sqlKey: #{serviceId}Mapper.GetCodeCategoryAllList
                                       resultKey: ds_GetCodeCategoryAllList
                                            ↓ (SequenceFlow_0wrkusx)
                                       [EndEvent_1]
```

| 단계 | 노드 | class | sqlKey (To-Be) | result key | 근거 |
|---|---|---|---|---|---|
| 1 | Task_2 | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterCategoryMngMapper.GetCodeCategoryList | ds_GetCodeCategoryList | bpmn:10~26 |
| 2 | Task_0lk57sx | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | masterCategoryMngMapper.GetCodeCategoryAllList | ds_GetCodeCategoryAllList | bpmn:67~80 |

### §3.2 action = save (masterCategoryMng_save)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=save ────┐
                                          ↓ (SequenceFlow_0x77sm3)
                                     [UserTask_154khzh "Main저장"]
                                     class: #{basePackage}SaveTbMcmCodeCategory
                                          ↓ (SequenceFlow_0xzcgxb)
                                     [Task_2 "Main조회"] (재조회)
                                          ↓ (SequenceFlow_0lnje1n)
                                     [Task_0lk57sx "Main 전체조회"] (재조회)
                                          ↓ (SequenceFlow_0wrkusx)
                                     [EndEvent_1]
```

| 단계 | 노드 | class | 호출 SQL | 비고 |
|---|---|---|---|---|
| 1 | UserTask_154khzh | com.dongkuk.dmes.UserTask / #{basePackage}SaveTbMcmCodeCategory | UpdateTbMcmCodeCategory / DeleteTbMcmCodeCategory / InsertTbMcmCodeCategory (java:38, 46, 56) | nativeeditor_status 분기 |
| 2 | Task_2 | CommonSelectTask | masterCategoryMngMapper.GetCodeCategoryList | 저장 후 화면 재조회 |
| 3 | Task_0lk57sx | CommonSelectTask | masterCategoryMngMapper.GetCodeCategoryAllList | 전체 중복체크 데이터 갱신 |

### §3.3 action = delete — **To-Be 제거** (As-Is xfdl 주석 — 사용자 결정)

```
[StartEvent_1]
    ↓ (SequenceFlow_1)
[ExclusiveGateway_1] ──── action=delete ──┐
                                          ↓ (SequenceFlow_0w4k9x6)
                                     [Task_0k24d4u "Main삭제"]
                                     class: CommonDeleteTask
                                     sqlKey: #{serviceId}Mapper.DeleteTbMcmCodeCategory
                                     resultKey: deleteMain
                                          ↓ (SequenceFlow_10mn97r)
                                     [Task_2 "Main조회"]
                                          ↓ (SequenceFlow_0lnje1n)
                                     [Task_0lk57sx "Main 전체조회"]
                                          ↓ (SequenceFlow_0wrkusx)
                                     [EndEvent_1]
```

비고: As-Is xfdl 에서 호출 ✗ (블록 주석) — BPMN 잔존만. **To-Be 제거** (사용자 결정 — 마스터 삭제 영구 차단 정책 유지).

### §3.4 통합 SequenceFlow 매트릭스 (As-Is 식별자 보존)

| flow id | name | source | target |
|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_2 |
| SequenceFlow_0x77sm3 | save | ExclusiveGateway_1 | UserTask_154khzh |
| SequenceFlow_0w4k9x6 | delete | ExclusiveGateway_1 | Task_0k24d4u |
| SequenceFlow_0xzcgxb | - | UserTask_154khzh | Task_2 |
| SequenceFlow_10mn97r | - | Task_0k24d4u | Task_2 |
| SequenceFlow_0lnje1n | - | Task_2 | Task_0lk57sx |
| SequenceFlow_0wrkusx | - | Task_0lk57sx | EndEvent_1 |

---

## §4. UserTask Java 클래스

### §4.1 SaveTbMcmCodeCategory

| 항목 | As-Is | To-Be 매핑 권장 |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cma.masterCategoryMng.service` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| 클래스 | SaveTbMcmCodeCategory | SaveTbMcmCodeCategory (As-Is 보존) |
| 인터페이스 | com.dongkuk.oasis.task.Wow | 동일 |
| run(Context, Task) 입력 | context.get("ds_grdMain") = ArrayList<HashMap<String,Object>> | 동일 |
| 분기 키 | `!nativeeditor_status` ∈ { "updated", "deleted", "inserted" } | 동일 |
| 호출 SQL ID 패턴 | "MasterCategoryMngMapper.{Sql}" | "masterCategoryMngMapper.{Sql}" (Mapper namespace 변경 반영) |
| context 적재 | "cnt_merge" key 로 처리 행수 누적 | 동일 |
| 예외 | 영향행 ≤ 0 시 throw → IllegalTaskException | 동일 |

### §4.2 호출 SQL → namespace 매트릭스 (To-Be 변경 반영)

| 호출 (java:33~62) | As-Is SQL ID | To-Be SQL ID |
|---|---|---|
| updated 분기 | MasterCategoryMngMapper.UpdateTbMcmCodeCategory | masterCategoryMngMapper.UpdateTbMcmCodeCategory |
| deleted 분기 | MasterCategoryMngMapper.DeleteTbMcmCodeCategory | masterCategoryMngMapper.DeleteTbMcmCodeCategory |
| inserted 분기 | MasterCategoryMngMapper.InsertTbMcmCodeCategory | masterCategoryMngMapper.InsertTbMcmCodeCategory |

비고: 예외 메시지 텍스트 (java:39, 47, 57) "MasterCodeMapper.*" 는 namespace 와 무관한 오타 — **To-Be `"MasterCategoryMngMapper.*"` 정정** (사용자 결정).

---

## §5. 트랜잭션 경계

| 구간 | 트랜잭션 단위 | 롤백 조건 |
|---|---|---|
| action=search | 단일 트랜잭션 (SELECT 2종) | DB 조회 오류 |
| action=save | 단일 트랜잭션 (UserTask 처리 + SELECT 2종 재조회) | (a) dao.update() ≤ 0 (java:38, 46, 56) (b) 임의 Exception (java:67) |
| action=delete (잔존) | 단일 트랜잭션 (DELETE + SELECT 2종) | DB 오류 |

원칙:
- UserTask 내 다중 행 (updated/deleted/inserted 혼재) 처리 시 한 행이라도 영향행 ≤ 0 이면 즉시 throw → 모든 변경 롤백.
- 후속 Task_2 (Main조회) / Task_0lk57sx (전체조회) 도 동일 트랜잭션 범위 — 재조회 결과로 ds_grdMain / ds_grdMainAll 갱신 후 commit.

---

## §6. To-Be 식별자

### §6.1 화면 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 화면 ID | MasterCategoryMng | masterCategoryMng |
| 화면명 (titletext) | 카테고리 관리 | 카테고리 관리 (보존) |
| serviceId | MasterCategoryMng | masterCategoryMng |
| pageId | (없음 — xfdl) | masterCategoryMng |
| pageName | (없음) | masterCategoryMng |
| 모듈 | (cma 폴더) | mcm |
| 모듈 그룹 | cma | cma |

### §6.2 BPMN 식별자 (사용자 정의 규칙: `{screenId}_{기능명}`)

| As-Is bpmn 식별자 | To-Be 기능 식별자 | 비고 |
|---|---|---|
| (process id) MasterCategoryMng | masterCategoryMng | bpmn:3 process id |
| (action) search | masterCategoryMng_search | SequenceFlow_0grwghu name |
| (action) save | masterCategoryMng_save | SequenceFlow_0x77sm3 name |
| ~~(action) delete~~ | **To-Be 제거** (As-Is 미사용) | - |
| Task_2 "Main조회" | masterCategoryMng_searchMain | bpmn:10 |
| Task_0lk57sx "Main 전체조회" | masterCategoryMng_searchAll | bpmn:67 |
| UserTask_154khzh "Main저장" | masterCategoryMng_saveMain | bpmn:40 |
| ~~Task_0k24d4u "Main삭제"~~ | **To-Be 제거** | bpmn:51 (As-Is) |

비고: bpmn 노드 내부 id (Task_2 등 자동 생성 id) 는 보존, 사용자 정의 식별자(노드 name 의 To-Be 표기) 만 변경.

### §6.3 Mapper / SQL ID

| 항목 | As-Is | To-Be |
|---|---|---|
| Mapper namespace | MasterCategoryMngMapper | masterCategoryMngMapper |
| Mapper 파일 (As-Is) | mappers-cma/MasterCategoryMngMapper.xml |
| Mapper 파일 (To-Be) | JPA Repository 로 흡수 → `com.dongkuk.dmes.mcm.repository.MasterCodeCategoryRepository` (native query) / 기존 Mapper.xml 은 `.asis` 보존 (RULE.md §"패키지 명명 규칙" §3-1 — Repository 는 모듈 단위 평탄 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| sqlKey (BPMN extension) | #{serviceId}Mapper.GetCodeCategoryList | #{serviceId}Mapper.GetCodeCategoryList (serviceId 가 masterCategoryMng 로 주입되어 자동 변환) |
| SQL ID (As-Is 6 → To-Be 5) | GetCodeCategoryList / GetCodeCategoryAllList / UpdateTbMcmCodeCategory / DeleteTbMcmCodeCategory / InsertTbMcmCodeCategory | MergeTbCodeCategory (As-Is 미호출) **To-Be 제거** (사용자 결정) |

### §6.4 Java 클래스 식별자

| 항목 | As-Is | To-Be |
|---|---|---|
| 패키지 (As-Is) | com.dongkuk.dmes.mui.task.ui.cma.MasterCategoryMng |
| 패키지 (To-Be) | `com.dongkuk.dmes.mcm.cma.masterCategoryMng.service` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| 클래스명 | SaveTbMcmCodeCategory | SaveTbMcmCodeCategory (As-Is 보존 권장) |
| BPMN property class | #{basePackage}SaveTbMcmCodeCategory | 동일 (basePackage 만 To-Be 패키지로 주입) |

### §6.5 결정 완료

활성 확인필요 = 0 건. 결정 내용 본문 반영 완료 (delete flow 제거 / orphan SQL 제거 / 통신채널 REST / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.cma.masterCategoryMng.{service,dto}.*` — RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신).
