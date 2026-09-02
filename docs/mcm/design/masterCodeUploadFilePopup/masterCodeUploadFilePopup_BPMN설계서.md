---
screenId: masterCodeUploadFilePopup
asIsId: MasterCodeUploadFilePopup
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# masterCodeUploadFilePopup BPMN설계서

> 단일 원천: `masterCodeUploadFilePopup_분석리포트.md`.
> 본 문서 = BPMN process 의 액션 / API 패턴 / flow / UserTask 클래스 / 트랜잭션 / To-Be 식별자 명세.

## §1. 액션 매트릭스 (B-NNN → action enum)

| B-NNN | UI 라벨 | sSvcID (xfdl) | action enum (7) | server call (Y/N) | BPMN target node | 트랜잭션 |
|---|---|---|---|---|---|---|
| B-001 | 다운로드 | "search" | search + export | Y | Task_2 (CommonSelectTask) | read-only |
| B-002 | 파일선택 | (없음 — client) | importExcel (client) | N | (none) | — |
| B-003 | 등록 | "save" | save (= upload 일괄 INSERT) | Y | UserTask_09dxtkf | TX (atomic) |
| B-099 | 닫기 | (없음) | popupClose | N | (none) | — |

> action enum 정본 7 종 (00 §6.4.4): search / save / delete / changeStatus / popup / link / export.
> 본 화면 사용 enum = `search` (B-001 의 server 호출) + `export` (B-001 의 후처리) + `save` (B-003).
> B-002 (파일선택) 은 7 enum 외 (client-only Excel import) — 본 화면 한정 비공식 enum `importExcel` 로 표기.

## §2. API 패턴 판정 (C1~C6)

> 정본: 04 §A.2-3-2. C1~C6 충족 개수에 따라 단일 actionGateway / 분리 (T3-D) 결정.

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP @Case 분기 4종 이상 + 조회/트랜잭션 분리 | **N** | 본 화면은 SP 미사용 (MyBatis dynamic SQL 1 SELECT + 공용 mapper 의 delete/insert). BPMN exclusiveGateway 의 분기 2종 (search/save) 만 존재 | 단일 actionGateway 적합 |
| C2. LoV master 호출 컬럼 5종 이상 | **N** | LoV 호출 0건 (§10.1 분석리포트) | 단일 적합 |
| C3. 회사·공장 종속 LoV 1종 이상 | **N** | 회사/공장 종속 LoV 없음 | 단일 적합 |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | **N** | grd_Upload / grd_Download 모두 6 컬럼 고정 | 단일 적합 |
| C5. 독립 query 분리가 적합함 | **N** | 본 화면 매퍼는 1 SELECT 만, 공용 매퍼 (delete/insert) 는 본 화면 외 다수 사용 — 이미 독립 분리됨 | 분리 불요 |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | **N** | UserTask 1 종 (SaveMasterCodeFileUpload) + CommonSelectTask 1 종만 호출 | 단일 적합 |

**판정**: C1~C6 충족 0/6 → **단일 actionGateway 채택** (= As-Is BPMN 구조 유지 — exclusiveGateway 1 + Task_2 1 + UserTask 1).

## §3. action 별 BPMN flow

### 3.1 As-Is flow 전수 (재인용 — `MasterCodeUploadFilePopup.bpmn`)

```
StartEvent_1 ─SequenceFlow_1─→ ExclusiveGateway_1
                                   ├─ SequenceFlow_0grwghu (action=search) ─→ Task_2 (CommonSelectTask) ─SequenceFlow_0lnje1n─→ EndEvent_1
                                   └─ SequenceFlow_0r4u7xr (action=save)   ─→ UserTask_09dxtkf (SaveMasterCodeFileUpload) ─SequenceFlow_1p74ti7─→ EndEvent_1
```

### 3.2 노드 별 확장 속성 (재인용)

| 노드 ID | 종류 | name | 확장 속성 | 근거 |
|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | — | bpmn:4-6 |
| ExclusiveGateway_1 | exclusiveGateway | (no name) — gatewayDirection=Diverging | — | bpmn:26-33 |
| Task_2 | task | 마스터코드 조회 | modelerTemplate=MapperBaseDbAccessTemplate / class=CommonSelectTask / sqlKey=`#{serviceId}Mapper.GetCodeUploadList` / resultKey=ds_GetCodeUploadList / isServiceResult=true / paramKey="" / dao="" | bpmn:11-25 |
| UserTask_09dxtkf | userTask | 마스터코드 Import | modelerTemplate=com.dongkuk.dmes.UserTask / class=`#{basePackage}SaveMasterCodeFileUpload` / nextBranchSpel="" | bpmn:37-46 |
| EndEvent_1 | endEvent | End Event | — | bpmn:7-10 |

### 3.3 sequenceFlow 전수 (재인용)

| flow ID | source | target | name (action) | 비고 |
|---|---|---|---|---|
| SequenceFlow_1 | StartEvent_1 | ExclusiveGateway_1 | — | bpmn:34 |
| SequenceFlow_0grwghu | ExclusiveGateway_1 | Task_2 | search | bpmn:35 |
| SequenceFlow_0r4u7xr | ExclusiveGateway_1 | UserTask_09dxtkf | save | bpmn:47 |
| SequenceFlow_0lnje1n | Task_2 | EndEvent_1 | — | bpmn:36 |
| SequenceFlow_1p74ti7 | UserTask_09dxtkf | EndEvent_1 | — | bpmn:48 |

### 3.4 To-Be BPMN 변경 사항

> As-Is BPMN 구조는 단순/명확 — 변경 불필요. 단 sqlKey / class 의 식별자만 To-Be 명명 룰에 맞춰 치환 (§6 참조).

| 변경 항목 | As-Is | To-Be |
|---|---|---|
| process id | MasterCodeUploadFilePopup | masterCodeUploadFilePopup |
| process name | 마스터코드 등록(Excel Upload) | As-Is 유지 (사용자 결정) |
| sqlKey (Task_2) | `#{serviceId}Mapper.GetCodeUploadList` | **As-Is 유지** (사용자 결정 — PascalCase SQL id 컨벤션 보존) |
| resultKey (Task_2) | ds_GetCodeUploadList | As-Is 유지 |
| class (UserTask) | `#{basePackage}SaveMasterCodeFileUpload` | basePackage = `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |

## §4. UserTask Java 클래스 (SaveMasterCodeFileUpload)

### 4.1 클래스 메타 (As-Is)

| 항목 | 값 | 근거 |
|---|---|---|
| FQN | com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.SaveMasterCodeFileUpload | java:1, java:18 |
| 인터페이스 | com.dongkuk.oasis.task.Wow | java:13 |
| Method | `public String run(Context context, Task task)` | java:20 |

### 4.2 To-Be 패키지 (확정)

`com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신).

이전 후보 비교 (참고용):

| 후보 | 영향 |
|---|---|
| (a) `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload` | 신규 룰 §3-1 정합 — `{base-package}/{moduleGroup}/{screenId}/service/` |
| (b) `com.dongkuk.dmes.mcm.cma.SaveMasterCodeFileUpload` | 그룹 단위 scope — 화면 prefix 없음 |
| (c) As-Is FQN 유지 | 마이그레이션 부담 최소 |

### 4.3 메서드 명세 (재인용)

```java
public String run(Context context, Task task) {
    try {
        // S1 log 시작
        log.debug("##########	Master Code 등록 엑셀IMPORT 저장 시작");

        // S2 dao 획득
        TransactionalDao dao = context.getDao();

        // S3 context 추출
        String MasterCode = (String)context.get("pCodeId").toString();
        String pRegFlag   = (String)context.get("pRegFlag").toString();

        // S4 ds_grdUpload 캐스팅
        ArrayList<HashMap<String,Object>> ds_grdUpload = (ArrayList<HashMap<String,Object>>)context.get("ds_grdUpload");

        // S5 param buffer
        Map<String,Object> param = new HashMap<String, Object>();
        log.debug("##########	Master Code 등록 엑셀IMPORT 저장 MasterCode : [{}]" , MasterCode);

        // S6 counter
        int cnt = 0;

        // S7 (조건부) 선삭제
        if(pRegFlag.equals("true")) {
            param.clear();
            param.put("param_MasterCode", MasterCode);
            param.put(CactusConstants.MYBATIS_WHERE, "MASTER_CODE = #{param_MasterCode}");
            dao.delete("TB_MCM_CODE_DETAIL_Mapper.delete", param);
        }

        // S8 반복 INSERT
        for(int i = 0; i < ds_grdUpload.size(); i++) {
            param.clear();
            param.put("MASTER_CODE",   (String)ds_grdUpload.get(i).get("MASTER_CODE"));
            param.put("CATEGORY_ID",   (String)ds_grdUpload.get(i).get("CATEGORY_ID"));
            param.put("CODE_VAL",      (String)ds_grdUpload.get(i).get("CODE_VAL"));
            param.put("CODE_VAL_MEAN", (String)ds_grdUpload.get(i).get("CODE_VAL_MEAN"));
            param.put("CODE_VAL_DESC", (String)ds_grdUpload.get(i).get("CODE_VAL_DESC"));
            param.put("CODE_VER",      "1");
            param.put("SORT_SEQ",      (String)ds_grdUpload.get(i).get("SORT_SEQ"));

            if(dao.update("TB_MCM_CODE_DETAIL_Mapper.insert", param) <= 0) {
                throw new Exception("TB_MCM_CODE_DETAIL_Mapper.insert 에러발생");
            } else {
                cnt++;
            }
        }

        // S9 result publish
        CommonDaoUtil.addDaoResultIntoContext(context, "cnt_import", cnt, null, true);

        // S10 정상 종료
        return null;
    } catch (Exception e) {
        log.info("end with exception - task name : [" + task.toString() + "]");
        log.error("Exception occur", e);
        throw new IllegalTaskException(e);
    }
}
```

(java:20-76 1:1 인용. log 메시지 / 변수 / 캐스팅 모두 As-Is 보존.)

### 4.4 To-Be 권고 보강 (분석가 권고 — 본 화면 결함 반영)

| 권고 ID | 위치 | 권고 | 근거 (분석리포트) |
|---|---|---|---|
| RC-001 | java:50-56 (cast) | `String.valueOf(...)` 또는 `Optional<Object>` 패턴으로 ClassCastException 방지 (To-Be 보강 — 사용자 결정) | F-003 |
| RC-002 | java:58-61 (Exception) | `RuntimeException` 또는 전용 `MasterCodeImportFailedException` 사용 + row index 메시지 포함 | F-002 |
| RC-003 | java:40 (chk_regFlag=false) | 사전 검증 추가 (To-Be — 사용자 결정) | F-005 |
| RC-004 | java:55 (CODE_VER) | "1" 고정 → application property 또는 호출자 파라미터로 외부화 (To-Be 보강) | F-004 |

## §5. 트랜잭션 경계 / 오류 처리

### 5.1 트랜잭션 범위

| 범위 | 동작 | 비고 |
|---|---|---|
| (Task_2 search) | 1 SELECT — read-only | 트랜잭션 의미 없음. SELECT 실패 시 BPMN 종료 + 클라이언트 콜백 strErrorMsg |
| (UserTask save) | 1 트랜잭션 = (DELETE 조건부) + N INSERT | TransactionalDao 가 단일 트랜잭션으로 묶음. 어떤 step 이라도 실패 → IllegalTaskException → 전체 rollback |

### 5.2 오류 처리

| 오류 케이스 | 처리 |
|---|---|
| Task_2 SELECT 실패 (DB 오류) | BPMN 표준 — exception path. 클라이언트는 fn_callBack 의 nErrorCode != 0 으로 수신 → strErrorMsg 표시 (xfdl:238) |
| UserTask DELETE 실패 | java:71 catch → IllegalTaskException → rollback → 클라이언트 strErrorMsg 표시 |
| UserTask INSERT 실패 (dao.update <= 0) | java:60 throw → catch → IllegalTaskException → rollback. 단 row index 정보 미포함 (F-002) |
| UserTask cast 실패 | java:50-56 ClassCastException → catch → IllegalTaskException → rollback |
| pRegFlag null/empty | java:28 `(String).toString()` → NullPointerException 가능 — **To-Be null 검증 추가** |
| ds_grdUpload null | java:31 cast 시 NullPointerException 가능 — 호출 전 sInDatasets 보장 (xfdl:216) 으로 사실상 안전. 만약 호출자가 빈 dataset 송신 시 size()=0 → for 0 iter → cnt=0 정상 종료 |

### 5.3 To-Be 보강 (분석가 권고)

- BPMN 차원 보상 분기 (compensation) 는 불필요 (단일 TX 내 rollback 충분).
- UserTask 안에 sub-step 추가 권고 (RC-001~RC-003 반영).
- BPMN 차원에서 `errorEventDefinition` 명시 미사용 — As-Is 동일 유지 (Oasis 표준은 catch + IllegalTaskException 이 BPMN runtime 의 boundary error 로 자동 매핑됨).

## §6. To-Be 식별자

### 6.1 명명 룰 정본 적용

| 항목 | As-Is | To-Be (MES 2-토큰 룰 `{moduleId}{화면명}`) |
|---|---|---|
| 화면 식별자 (screenId) | MasterCodeUploadFilePopup | **masterCodeUploadFilePopup** |
| asIsId | MasterCodeUploadFilePopup | (As-Is 보존) |
| BPMN process id | MasterCodeUploadFilePopup | **masterCodeUploadFilePopup** |
| Mapper namespace | MasterCodeUploadFilePopupMapper | **masterCodeUploadFilePopupMapper** |
| Mapper select id | GetCodeUploadList | **As-Is 유지** (사용자 결정) |
| UserTask class FQN | com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.SaveMasterCodeFileUpload | **`com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload`** (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| BPMN service file | services/cma/MasterCodeUploadFilePopup.bpmn | services/cma/masterCodeUploadFilePopup.bpmn |
| Frontend 파일명 | (없음) | masterCodeUploadFilePopup.tsx |
| Action (B-001) | "search" | "search" (action enum 표준 유지) |
| Action (B-003) | "save" | "save" |

### 6.2 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| 기능 | 식별자 |
|---|---|
| 다운로드 | masterCodeUploadFilePopup_search |
| 파일선택 (client only) | masterCodeUploadFilePopup_importExcel |
| 등록 | masterCodeUploadFilePopup_save |
| 닫기 | masterCodeUploadFilePopup_popupClose |

### 6.3 SQL 식별자 일치 매트릭스 (BPMN ↔ Mapper)

| 위치 | sqlKey 패턴 | 실제 sqlKey (As-Is) | 실제 sqlKey (To-Be 권고) |
|---|---|---|---|
| BPMN Task_2 | `#{serviceId}Mapper.GetCodeUploadList` | MasterCodeUploadFilePopupMapper.GetCodeUploadList | masterCodeUploadFilePopupMapper.getCodeUploadList |
| Mapper namespace | (정의) | MasterCodeUploadFilePopupMapper | masterCodeUploadFilePopupMapper |
| Mapper select id | (정의) | GetCodeUploadList | getCodeUploadList |
| Java dao.delete arg | (literal) | TB_MCM_CODE_DETAIL_Mapper.delete | (공용 mapper — As-Is 보존) |
| Java dao.update arg | (literal) | TB_MCM_CODE_DETAIL_Mapper.insert | (공용 mapper — As-Is 보존) |

> 공용 mapper `TB_MCM_CODE_DETAIL_Mapper` 는 As-Is 명명 보존 (사용자 결정).

### 6.4 BPMN 산출물 파일

> 본 산출물 폴더에 BPMN 파일은 직접 산출하지 않는다 (BPMN 본 문서로 명세 정본 확정만 수행). 실제 `.bpmn` 파일은 구현 단계에서 위 §6.2 식별자 + As-Is BPMN 구조 1:1 보존으로 생성.
