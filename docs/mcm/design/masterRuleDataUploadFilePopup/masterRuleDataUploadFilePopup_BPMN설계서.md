---
screenId: masterRuleDataUploadFilePopup
asIsId: MasterRuleDataUploadFilePopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
---

# masterRuleDataUploadFilePopup BPMN설계서

> 단일 원천: `masterRuleDataUploadFilePopup_분석리포트.md`.
> 본 문서 = BPMN process 의 액션 / API 패턴 / flow / UserTask·Task 클래스 / 트랜잭션 / To-Be 식별자 명세.
> **본 화면은 부모 masterRuleData (MasterRuleData.xfdl:722 호출) 의 자식 modal 팝업.** masterRuleData / masterCodeUploadFilePopup 가족과 1:1 정합 (사용자 확정 2026-06-04).

## §1. 액션 매트릭스 (B-NNN → action enum)

| B-NNN | UI 라벨 | sSvcID (xfdl) | action enum (7) | server call (Y/N) | BPMN target node | 트랜잭션 |
|---|---|---|---|---|---|---|
| B-001 | 다운로드 | "search" | search + export | Y | UserTask_1j7375k (GetMasterRuleDataPopup) | read-only |
| B-002 | 파일선택 | (없음 — client) | importExcel (client) | N | (none) | — |
| B-003 | 등록 | "save" | save (= upload 일괄 INSERT) | Y | UserTask_09dxtkf (SaveMasterRuleFileUpload) | TX (atomic) |
| B-099 | 닫기 | (없음) | popupClose | N | (none) | — |
| T-003 | (자동 컬럼정의) | "search_col" | search (컬럼정의) | Y | Task_1rf3f4m (CommonSelectTask) | read-only |

> action enum 정본 7 종 (00 §6.4.4): search / save / delete / changeStatus / popup / link / export.
> 본 화면 사용 enum = `search` (B-001 의 server 호출 + T-003 컬럼정의 조회) + `export` (B-001 의 후처리 gfn_exportExcel) + `save` (B-003).
> B-002 (파일선택) 은 7 enum 외 (client-only Excel import) — 본 화면 한정 비공식 enum `importExcel` 로 표기.
> ★ masterCodeUploadFilePopup(고정 6 컬럼, 2 action)과 달리 본 화면은 **동적 컬럼 + 3 server action** (search / save / search_col). 컬럼정의 조회(search_col)가 onload 시 자동 호출되어 그리드 동적 컬럼을 빌드 (분석 §3.3 / §3.4).

## §2. API 패턴 판정 (C1~C6)

> 정본: 04 §A.2-3-2. C1~C6 충족 개수에 따라 단일 actionGateway / 분리 (T3-D) 결정. (MUST NOT) Agent 자체 추론으로 결과 뒤집기 금지.

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP @Case 분기 4종 이상 + 조회/트랜잭션 분리 | **N** | 본 화면은 SP 미사용 (MyBatis dynamic SQL 3 SELECT + 외부 동적 매퍼의 delete/insert). BPMN exclusiveGateway 의 분기 3종 (search/save/search_col) 만 존재 | 단일 actionGateway 적합 |
| C2. LoV master 호출 컬럼 5종 이상 | **N** | NewCodeQuery / 공통 코드 마스터 직접 호출 0건 (분석 §10.1) | 단일 적합 |
| C3. 회사·공장 종속 LoV 1종 이상 | **N** | 회사/공장 종속 LoV 없음 | 단일 적합 |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | **Y** | grd_Upload / grd_Download 모두 ds_RuleColData 기반 **런타임 동적 컬럼** (분석 §3.3 / §3.4 / xfdl:261-291) | 단일 가능 (충족 1 — OASIS 단일 유지) |
| C5. 독립 query 분리가 적합함 | **N** | 본 화면 매퍼 3 SELECT 는 단일 service 응집 — 분리 불요 | 분리 불요 |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | **N** | UserTask 2 종 (Get/Save) + CommonSelectTask 1 종만 호출 — 모두 단일 BPMN process 내 | 단일 적합 |

**판정**: C1~C6 충족 **1/6** (C4 만 Y) → 04 §A.2-3-2 채택 표 기준 **0~1 = OASIS 단일 BPMN (자동)** → **단일 actionGateway 채택** (= As-Is BPMN 구조 유지 — exclusiveGateway 1 + UserTask 2 + Task 1). Q-NNN 등재 불요 (충족 2~3 아님).

### 2.1 API 패턴 자동 판정 결과 (분석리포트 §11 인용 — 04 §A.2-3-2 채택 표 직접 박힘)

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 (분석 §11.1 인용) | 1 (C4) |
| 채택 패턴 (3 enum: OASIS / 잠정 OASIS / Phase 7) | **OASIS 단일 BPMN (자동)** |
| API 라우팅 enum (T3-D 결과) | `POST /api/mcm/oasis/masterRuleDataUploadFilePopup/{action}` (UI→BFF) / `POST /oasis/masterRuleDataUploadFilePopup/{action}` (BFF→BE) |
| Q-NNN 등재 여부 (충족 2~3 일 때만 Y) | N (충족 1 = OASIS 자동) |

### 2.2 API 엔드포인트 총괄

| API-ID | Method (POST 고정) | URL (T3-D enum) | 설명 | action (7 enum) | 트리거 (B-NNN 인용) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/masterRuleDataUploadFilePopup/search` | 동적 테이블 전건 조회 (다운로드용) | search | B-001 |
| API-002 | POST | `POST /oasis/masterRuleDataUploadFilePopup/save` | Excel 일괄 등록 (조건부 DELETE + N INSERT) | save | B-003 |
| API-003 | POST | `POST /oasis/masterRuleDataUploadFilePopup/search_col` | 컬럼정의 조회 (그리드 동적 컬럼 빌드) | search | T-003 (onload 자동) |

> B-002(파일선택)은 server 호출 없음 (client Excel import). B-099(닫기)는 popup close (server 호출 없음).

## §3. action 별 BPMN flow

### 3.1 As-Is flow 전수 (재인용 — `MasterRuleDataUploadFilePopup.bpmn`)

```
StartEvent_1 ─SequenceFlow_1─→ ExclusiveGateway_1 (Diverging)
                                   ├─ SequenceFlow_0grwghu (action=search)     ─→ UserTask_1j7375k (GetMasterRuleDataPopup) ─SequenceFlow_0vmabw3─→ EndEvent_1
                                   ├─ SequenceFlow_0r4u7xr (action=save)       ─→ UserTask_09dxtkf (SaveMasterRuleFileUpload) ─SequenceFlow_1p74ti7─→ EndEvent_1
                                   └─ SequenceFlow_0qe9z05 (action=search_col) ─→ Task_1rf3f4m (CommonSelectTask)             ─SequenceFlow_177rnzi─→ EndEvent_1
```

### 3.2 노드 별 확장 속성 (재인용)

| 노드 ID | 종류 | name | 확장 속성 | 근거 |
|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | — | bpmn:4-6 |
| ExclusiveGateway_1 | exclusiveGateway | (no name) — gatewayDirection=Diverging | style shapeBackground=#ffff00 | bpmn:12-20 |
| UserTask_1j7375k | userTask | 일반 업무기준 조회 | modelerTemplate=com.dongkuk.dmes.UserTask / class=`#{basePackage}GetMasterRuleDataPopup` / nextBranchSpel="" | bpmn:35-44 |
| UserTask_09dxtkf | userTask | 업무기준 Import | modelerTemplate=com.dongkuk.dmes.UserTask / class=`#{basePackage}SaveMasterRuleFileUpload` / nextBranchSpel="" | bpmn:23-32 |
| Task_1rf3f4m | task | 일반 업무기준 컬럼조회 | modelerTemplate=MapperBaseDbAccessTemplate / class=CommonSelectTask / sqlKey=`#{serviceId}Mapper.GetRuleColList` / resultKey=ds_GetRuleColUploadList / isServiceResult=true / paramKey="" / dao="" | bpmn:46-59 |
| EndEvent_1 | endEvent | End Event | — | bpmn:7-11 |

### 3.3 sequenceFlow 전수 (재인용 — 7 개)

| flow ID | source | target | name (action) | 비고 | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | StartEvent_1 | ExclusiveGateway_1 | — | 진입 | bpmn:21 |
| SequenceFlow_0grwghu | ExclusiveGateway_1 | UserTask_1j7375k | search | xfdl sSvcID="search" (xfdl:173) | bpmn:22 |
| SequenceFlow_0r4u7xr | ExclusiveGateway_1 | UserTask_09dxtkf | save | xfdl sSvcID="save" (xfdl:208) | bpmn:33 |
| SequenceFlow_0qe9z05 | ExclusiveGateway_1 | Task_1rf3f4m | search_col | xfdl sSvcID="search_col" (xfdl:158) | bpmn:60 |
| SequenceFlow_0vmabw3 | UserTask_1j7375k | EndEvent_1 | — | search 종료 | bpmn:45 |
| SequenceFlow_1p74ti7 | UserTask_09dxtkf | EndEvent_1 | — | save 종료 | bpmn:34 |
| SequenceFlow_177rnzi | Task_1rf3f4m | EndEvent_1 | — | search_col 종료 | bpmn:61 |

### 3.4 To-Be BPMN 변경 사항

> As-Is BPMN 구조 (exclusiveGateway 1 + UserTask 2 + Task 1) 는 단순/명확 — 변경 불필요. 단 sqlKey / class 의 식별자만 To-Be 명명 룰에 맞춰 치환 (§6 참조).

| 변경 항목 | As-Is | To-Be |
|---|---|---|
| process id | MasterRuleDataUploadFilePopup | masterRuleDataUploadFilePopup |
| process name | 일반 업무기준 컬럼조회 | As-Is 유지 (사용자 결정) |
| sqlKey (Task_1rf3f4m) | `#{serviceId}Mapper.GetRuleColList` | **As-Is 유지** (PascalCase SQL id 컨벤션 보존 — 가족 정합) |
| resultKey (Task_1rf3f4m) | ds_GetRuleColUploadList | As-Is 유지 |
| class (UserTask_1j7375k) | `#{basePackage}GetMasterRuleDataPopup` | basePackage = `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.` (RULE.md §"패키지 명명 규칙" §3-1) |
| class (UserTask_09dxtkf) | `#{basePackage}SaveMasterRuleFileUpload` | basePackage 동일 |

## §4. UserTask·Task Java 클래스 (2종 + CommonSelectTask)

### 4.1 클래스 메타 (As-Is)

| 노드 | 클래스 FQN | 인터페이스 / 템플릿 | Method | 근거 |
|---|---|---|---|---|
| UserTask_1j7375k (search) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.GetMasterRuleDataPopup | com.dongkuk.oasis.task.Wow | `public String run(Context, Task)` | GetMasterRuleDataPopup.java:1, :17, :19 |
| UserTask_09dxtkf (save) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.SaveMasterRuleFileUpload | com.dongkuk.oasis.task.Wow | `public String run(Context, Task)` | SaveMasterRuleFileUpload.java:1, :19, :20 |
| Task_1rf3f4m (search_col) | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | MapperBaseDbAccessTemplate (공용) | (common, Java 작성 없음) | bpmn:46-59 |

### 4.2 To-Be 패키지 (확정)

`com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.GetMasterRuleDataPopup` / `...service.SaveMasterRuleFileUpload` (RULE.md §"패키지 명명 규칙" §3-1 / 가족 정합 — Entity·Repository 는 `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄).

이전 후보 비교 (참고용):

| 후보 | 영향 |
|---|---|
| (a) `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.*` | 신규 룰 §3-1 정합 — `{base-package}/{moduleGroup}/{screenId}/service/` (채택) |
| (b) `com.dongkuk.dmes.mcm.cmb.GetMasterRuleDataPopup` | 그룹 단위 scope — 화면 prefix 없음 |
| (c) As-Is FQN 유지 | 마이그레이션 부담 최소 |

### 4.3 GetMasterRuleDataPopup.run 명세 (재인용 — search)

```java
public String run(Context context, Task task) {
    try {
        // S1 dao 획득
        TransactionalDao dao = context.getDao();
        Map<String, Object> param = null;

        // S2 param 구성 (pTable)
        param = new HashMap<String, Object>();
        param.put("pTable", (String)context.get("pTable"));

        // S3 동적 테이블 전건 SELECT
        List<Map<String, Object>> ds_GetRuleDataUploadList = dao.selectList("MasterRuleDataUploadFilePopupMapper.GetMasterRuleDataList", param);

        // S4 result publish
        CommonDaoUtil.addDaoResultIntoContext(context, "ds_GetRuleDataUploadList", ds_GetRuleDataUploadList.size(), ds_GetRuleDataUploadList, true);

        return null;
    } catch (Exception e) {
        log.info("end with exception - task name : [" + task.toString() + "]");
        log.error("Exception occur", e);
        throw new IllegalTaskException(e);
    }
}
```

(GetMasterRuleDataPopup.java:19-39 1:1 인용. log / 변수 / 캐스팅 모두 As-Is 보존.)

### 4.4 SaveMasterRuleFileUpload.run 명세 (재인용 — save)

```java
public String run(Context context, Task task) {
    try {
        // S1 log 시작
        log.debug("##########	Rule 등록 엑셀IMPORT 저장 시작");

        // S2 dao 획득
        TransactionalDao dao = context.getDao();

        // S3 context 추출
        String pRuleId  = (String)context.get("pRuleId").toString();
        String pTable   = (String)context.get("pTable").toString();
        String pRegFlag = (String)context.get("pRegFlag").toString();

        // S4 ds_grdUpload / ds_RuleColData 캐스팅
        ArrayList<HashMap<String,Object>> ds_grdUpload   = (ArrayList<HashMap<String,Object>>)context.get("ds_grdUpload");
        ArrayList<HashMap<String,Object>> ds_RuleColData = (ArrayList<HashMap<String,Object>>)context.get("ds_RuleColData");

        // S5 typeDiv (COL_ID → COL_TYPE) — DATE 절단 판정용
        HashMap<String, String> typeDiv = new HashMap<String, String>();
        for(int i=0; i<ds_RuleColData.size(); i++) {
            typeDiv.put((String)ds_RuleColData.get(i).get("COL_ID"), (String)ds_RuleColData.get(i).get("COL_TYPE"));
        }

        // S6 counter
        int cnt = 0;
        Map<String,Object> getMap;
        Map<String,Object> setMap;

        // S7 (조건부) 선삭제 — 전건 (WHERE 1 = 1)
        if(pRegFlag.equals("true")) {
            Map<String,Object> param = new HashMap<String, Object>();
            param.put(CactusConstants.MYBATIS_WHERE, "1 = 1");
            dao.delete(pTable+"_Mapper.delete", param);
        }

        // S8 채번 — 부모 매퍼 GetMaxRuleSeq (namespace 불일치 — Q-103)
        getMap = new HashMap();
        getMap.put("pTable", (String)context.get("pTable"));
        int maxRuleSeq = Integer.parseInt(dao.selectOne("MasterRuleDataMapper.GetMaxRuleSeq", getMap).toString());

        // S9 반복 INSERT
        for(int i = 0; i<ds_grdUpload.size(); i++) {
            setMap = new HashMap();
            maxRuleSeq++;
            Iterator<String> iter = ds_grdUpload.get(i).keySet().iterator();
            while(iter.hasNext()){
                String keys = (String)iter.next();
                String vals = ds_grdUpload.get(i).get(keys)!=null?ds_grdUpload.get(i).get(keys).toString():"";
                if(!"".equals(vals) && "DATE".equals(typeDiv.get(keys))) {
                    vals = vals.replaceAll("-", "");
                    if(vals.length()>14) vals = vals.substring(0,14);
                }
                setMap.put(keys,vals);
            }
            setMap.put("RULE_VER",	"1");
            setMap.put("RULE_SEQ",	String.valueOf(maxRuleSeq));
            if(dao.insert(pTable+"_Mapper.insert", setMap) <= 0) {
                throw new Exception(pTable+"_Mapper.insert 에러발생");
            }else {
                cnt++;
            }
        }

        // S10 result publish
        CommonDaoUtil.addDaoResultIntoContext(context, "cnt_import", cnt, null, true);

        return null;
    } catch (Exception e) {
        log.info("end with exception - task name : [" + task.toString() + "]");
        log.error("Exception occur", e);
        throw new IllegalTaskException(e);
    }
}
```

(SaveMasterRuleFileUpload.java:20-92 1:1 인용. log 메시지 / 변수 / 캐스팅 / DATE 절단 / 채번 모두 As-Is 보존.)

### 4.5 To-Be 권고 보강 (분석가 권고 — 본 화면 결함 반영)

| 권고 ID | 위치 | 권고 | 근거 (분석리포트) |
|---|---|---|---|
| RC-001 | java(Save):77-78 (Exception) | `RuntimeException` 또는 전용 `MasterRuleImportFailedException` + row index 메시지 포함 | F-001 |
| RC-002 | java(Save):67 (toString cast) | number 셀 import 시 형식 검증 보강 (`String.valueOf` / null-safe 유지) | F-002 |
| RC-003 | java(Save):75 (RULE_VER) | "1" 고정 → application property 또는 호출자 파라미터 외부화 (To-Be 보강) | F-003 |
| RC-004 | java(Save):57 (채번 namespace) | `MasterRuleDataMapper.GetMaxRuleSeq` → 본 화면 매퍼 #3 (`MasterRuleDataUploadFilePopupMapper.GetMaxRuleSeq`) 로 일원화 | F-004 / Q-103 |
| RC-005 | java(Save):47 (chk_regFlag=false) | 선삭제 없이 INSERT 시 PK/UNIQUE 충돌 → 전체 rollback. 사전 검증 + confirm (Q-102) | F-005 |
| RC-006 | java(Save):60-82 (audit 미세팅) | cactus/Mcm 표준 `McmAuditEntity` 9 컬럼 적용 (동적 테이블 native audit 세팅) | F-006 / Q-105 |
| RC-007 | Mapper.xml:33,38 / java(Save):52,77 (`${pTable}`) | 동적 테이블명 화이트리스트(업무기준ID 메타 검증) + 바인딩 — injection 차단 | C-006 / Q-104 |

## §5. 트랜잭션 경계 / 오류 처리

### 5.1 트랜잭션 범위

| 범위 | 동작 | 비고 |
|---|---|---|
| (UserTask_1j7375k search) | 1 SELECT — read-only | 트랜잭션 의미 없음. SELECT 실패 시 BPMN 종료 + 클라이언트 콜백 strErrorMsg (xfdl:251) |
| (Task_1rf3f4m search_col) | 1 SELECT — read-only | 트랜잭션 의미 없음. 컬럼정의 조회 (onload 자동). 실패 시 strErrorMsg (xfdl:297) |
| (UserTask_09dxtkf save) | 1 트랜잭션 = (DELETE 조건부) + GetMaxRuleSeq + N INSERT | TransactionalDao 가 단일 트랜잭션으로 묶음. 어떤 step 이라도 실패 → IllegalTaskException → 전체 rollback. **부분 성공 케이스 없음** (분석 §7.3) |

### 5.2 오류 처리

| 오류 케이스 | 처리 |
|---|---|
| UserTask search SELECT 실패 (DB 오류) | catch → IllegalTaskException. 클라이언트는 fn_callBack 의 nErrorCode != 0 으로 수신 → strErrorMsg 표시 (xfdl:251) |
| Task_1rf3f4m search_col SELECT 실패 | BPMN 표준 exception path. 클라이언트 strErrorMsg (xfdl:297) |
| UserTask save DELETE 실패 (전건) | java(Save):52 → catch → IllegalTaskException → rollback → 클라이언트 strErrorMsg (xfdl:308) |
| UserTask save INSERT 실패 (dao.insert <= 0) | java(Save):77-78 throw → catch → IllegalTaskException → rollback. 단 row index 정보 미포함 (F-001) |
| UserTask save cast 실패 | java(Save):32-33 ClassCastException → catch → IllegalTaskException → rollback |
| pRegFlag / pRuleId / pTable null/empty | java(Save):28-30 `(String).toString()` → NullPointerException 가능 — **To-Be null 검증 추가**. 호출자(부모)가 항상 sRuleId/sRuleNm 함께 전달하므로 실 영향 미미 |
| ds_grdUpload null / 0 건 | java(Save):32 cast 시 NPE 가능. 빈 dataset size()=0 → for 0 iter → cnt=0 정상 종료. **chk_regFlag=true + 0 건 = 무경고 전체 삭제** (F-005 / Q-102 confirm 권고) |

### 5.3 To-Be 보강 (분석가 권고)

- BPMN 차원 보상 분기 (compensation) 는 불필요 (단일 TX 내 rollback 충분).
- UserTask 안에 sub-step 추가 권고 (RC-001~RC-007 반영).
- BPMN 차원 `errorEventDefinition` 명시 미사용 — As-Is 동일 유지 (Oasis 표준은 catch + IllegalTaskException 이 BPMN runtime 의 boundary error 로 자동 매핑됨).
- ★ As-Is 는 save 후 자동 재조회 flow 없음 (부모 masterRuleData 와 차이) — 재조회는 클라이언트 콜백에서 ds_grdDownload/ds_grdUpload clearData 로만 처리 (xfdl:304-305). To-Be 동일 유지.

## §6. To-Be 식별자

### 6.1 명명 룰 정본 적용

| 항목 | As-Is | To-Be (MES 단일 룰 camelCase) |
|---|---|---|
| 화면 식별자 (screenId) | MasterRuleDataUploadFilePopup | **masterRuleDataUploadFilePopup** |
| asIsId | MasterRuleDataUploadFilePopup | (As-Is 보존) |
| BPMN process id | MasterRuleDataUploadFilePopup | **masterRuleDataUploadFilePopup** |
| Mapper namespace | MasterRuleDataUploadFilePopupMapper | **masterRuleDataUploadFilePopupMapper** |
| Mapper select id | GetRuleColList / GetMasterRuleDataList / GetMaxRuleSeq | **As-Is 유지** (PascalCase SQL id — 사용자 결정) |
| UserTask class FQN (search) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.GetMasterRuleDataPopup | **`com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.GetMasterRuleDataPopup`** (RULE.md §"패키지 명명 규칙" §3-1) |
| UserTask class FQN (save) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.SaveMasterRuleFileUpload | **`com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.SaveMasterRuleFileUpload`** |
| BPMN service file | services/cmb/MasterRuleDataUploadFilePopup.bpmn | services/cmb/masterRuleDataUploadFilePopup.bpmn |
| Frontend 파일명 | (없음) | masterRuleDataUploadFilePopup.tsx |
| Action (B-001) | "search" | "search" (action enum 표준 유지) |
| Action (B-003) | "save" | "save" |
| Action (T-003) | "search_col" | "search_col" (컬럼정의 조회 — As-Is 보존) |

### 6.2 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| 기능 | 식별자 |
|---|---|
| 다운로드 | masterRuleDataUploadFilePopup_search |
| 파일선택 (client only) | masterRuleDataUploadFilePopup_importExcel |
| 등록 | masterRuleDataUploadFilePopup_save |
| 컬럼정의 조회 (onload 자동) | masterRuleDataUploadFilePopup_search_col |
| 닫기 | masterRuleDataUploadFilePopup_popupClose |

### 6.3 SQL 식별자 일치 매트릭스 (BPMN ↔ Mapper ↔ Java)

| 위치 | sqlKey 패턴 | 실제 sqlKey (As-Is) | 실제 sqlKey (To-Be 권고) |
|---|---|---|---|
| BPMN Task_1rf3f4m | `#{serviceId}Mapper.GetRuleColList` | MasterRuleDataUploadFilePopupMapper.GetRuleColList | masterRuleDataUploadFilePopupMapper.GetRuleColList |
| Java Get (selectList) | (literal) | MasterRuleDataUploadFilePopupMapper.GetMasterRuleDataList | masterRuleDataUploadFilePopupMapper.GetMasterRuleDataList |
| Java Save (채번 selectOne) | (literal) | **MasterRuleDataMapper.GetMaxRuleSeq** (부모 매퍼 — Q-103) | masterRuleDataUploadFilePopupMapper.GetMaxRuleSeq (일원화 권고 RC-004) |
| Java Save (dao.delete) | (literal) | `${pTable}_Mapper.delete` (= `TB_MCA_<RuleId>_Mapper.delete`) | 외부 동적 매퍼 — To-Be DDL on-demand 전략 정합 (RC-007 안전화) |
| Java Save (dao.insert) | (literal) | `${pTable}_Mapper.insert` | 동일 |
| Mapper namespace | (정의) | MasterRuleDataUploadFilePopupMapper | masterRuleDataUploadFilePopupMapper |

> ★ Q-103: Save 의 채번이 본 화면 매퍼의 동명 `GetMaxRuleSeq`(#3)를 두고 **부모 masterRuleData 매퍼**(`MasterRuleDataMapper.GetMaxRuleSeq`)를 호출 — namespace 불일치. To-Be 본 화면 매퍼로 일원화 권고 (RC-004).
> `${pTable}_Mapper` 외부 동적 namespace = `TB_MCA_<업무기준ID>_Mapper` — 업무기준 테이블별 개별 매퍼 (본 화면 자산 외부). To-Be 는 DDL on-demand + 화이트리스트 안전화 (Q-104).

### 6.4 BPMN 산출물 파일

> 본 산출물 폴더에 BPMN 파일은 직접 산출하지 않는다 (BPMN 본 문서로 명세 정본 확정만 수행). 실제 `.bpmn` 파일은 구현 단계에서 위 §6.2 식별자 + As-Is BPMN 구조 (exclusiveGateway 1 + UserTask 2 + Task 1 + sequenceFlow 7) 1:1 보존으로 생성 (`bpmn-tool create/modify` — 직접 XML 금지, 개발체크리스트 ITEM-SVC-01).
