---
screenId: commUserRoleCopy
asIsId: CommUserRoleCopy
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 사용자 권한 일괄 등록 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commUserRoleCopy` (= serviceId, As-Is bpmn process id = `CommUserRoleCopy`)
> - Bean명: `commUserRoleCopyService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/commUserRoleCopy/{action}`
> - BFF→BE: `POST /oasis/commUserRoleCopy/{action}`
>
> **명명 룰**: MES 단일 룰 (4 식별자 1byte 동일 — mcm 모듈, APS 예외 미적용)
>
> **인용 정본**: 분석리포트 §6 (SQL ID) + §7 (Java) + §8 (BPMN 전수). 자체 추가 ✗.
> **As-Is 1:1 보존**: BPMN node id (Task_selectUserList / selectCopyUserMap / selectCopyRoleGroupList / SaveRoleGroupCopy 등) 인용 그대로 보존. 변환은 §6 "To-Be 식별자" 안에서만 제안.

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE — As-Is 보존 (`MCMAPUSER.TB_MCM_SEC_*` — 사용자 결정)
> - audit 컬럼: cactus-core `CactusAuditEntity` 9 컬럼 자동 (`C_*` / `U_*` / `VER`) — JPA `@PrePersist` / `@PreUpdate`
> - API JSON 필드: camelCase (`pUserIdCopy` / `pInfReqNo` / `pDescription` 등 As-Is 파라미터 보존)
> - Java 패키지: Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1)
> - DB ↔ DTO 매핑은 API 계층에서

### 1.1 API 엔드포인트 총괄 (분석 §11 채택 결과 인용)

| API-ID | Method | URL | 설명 | action (분기 enum) | 트리거 (B-NNN) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/commUserRoleCopy/searchUserList` | 전체 사용자 List 조회 → ds_userFrom | searchUserList | (자동: CommUserRoleCopy_onload, xfdl:261) |
| API-002 | POST | `POST /oasis/commUserRoleCopy/search` | Copy 대상 사용자 정보 + Copy 대상 RoleGroup List 일괄 조회 → ds_copyUser + ds_copyRolegrp | search | B-001 (`btn_search` 외부 commonTopButton) |
| API-003 | POST | `POST /oasis/commUserRoleCopy/save` | RoleGroup 일괄 복사 (MERGE) + 권한부여 이력 적재 (mergePK) → save 콜백 후 xfdl 가 searchUserList 별도 호출 | save | B-002 (`btn_save` 외부 commonTopButton) |

> **As-Is 3 action 모두 보존** (As-Is bpmn:36, 51, 77 의 3 분기 그대로 To-Be 등재). 삭제 분기 등 미사용 분기 ✗ — As-Is 가 3 분기 완결.

### 1.2 API 패턴 자동 판정 결과 (C1~C6)

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | mui 의 As-Is 는 SP 가 아니라 Mapper.xml inline SQL. ExclusiveGateway 의 3 분기는 SP case 분기가 아닌 BPMN flow 분기 — C1 정의에 부적합 | - |
| C2. LoV master 호출 컬럼 5종 이상 | N | LV-001~004 (총 4) — 모두 하드코딩 또는 WHERE 절 enum 값. DB 마스터 LoV 콤보 ✗ | - |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 회사/공장 종속 LoV 없음 | - |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 그리드 컬럼 구성 고정 (As-Is 보존) | - |
| C5. 독립 query 분리가 적합함 | N | save 와 searchUserList 가 xfdl 콜백에서 chain (save 후 searchUserList 자동 호출, xfdl:395) — 독립 분리 부적합 | - |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | **N (Q-001 / Q-002 해소 2026-05-31)** | As-Is: Java 본문이 외부 namespace 2 종 호출 (`CommUserMngMapper.selectRoleMergeObject` + `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK`). **To-Be 정정**: (1) `CommUserMngMapper.selectRoleMergeObject` → 본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 정정 (As-Is 외부 호출 결함 / 본 Mapper.xml #4 정본 존재) → 정책 #1 (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` → JPA Entity `SecUserRollHis` 흡수 → 정책 #6. 외부 namespace 호출 모두 해소 — C6 미충족 | 충족 0 |

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | **0 / 6** (C6 해소 후 — Q-001/Q-002 정책 #1/#6) |
| 채택 패턴 | **OASIS 단일 BPMN (자동)** (충족 0~1 룰) |
| API 라우팅 | `POST /oasis/{serviceId}/{action}` |
| Q-NNN 등재 여부 | N |

> As-Is BPMN 자체가 단일 ExclusiveGateway 의 3 action 분기 형태 — OASIS 단일 BPMN 패턴 그대로 To-Be 채택. 외부 namespace 호출 (As-Is) 은 Service 레이어에서 본 namespace 정정 (Q-001) + JPA Entity 흡수 (Q-002/Q-006) 로 일괄 해소.

---

## 2. 프로세스별 BPMN 상세

> 본 §2 는 분석리포트 §8 (BPMN 전수) 의 모든 task / sequenceFlow 를 action 별로 흐름 ASCII 로 표현. As-Is BPMN id (Task_selectUserList / selectCopyUserMap / SaveRoleGroupCopy 등) 모두 보존.

### 2.1 searchUserList (CommUserRoleCopy_onload → API-001) — 전체 사용자 List 조회

```
[Form onload 자동 호출]  (xfdl:261 — fn_searchUserList)
    │  CommUserRoleCopy_onload → fn_searchUserList()
    │  파라미터 (sArgument): "" (빈 — selectUserList 는 매개변수 없음)
    │
    ▼
POST /oasis/commUserRoleCopy/searchUserList   (UI→BFF)  →  /oasis/commUserRoleCopy/searchUserList   (BFF→BE)
    │
    ▼  StartEvent_1 (bpmn:4)
    │
    ▼  ExclusiveGateway_1 (bpmn:12, name="분기")
    │
    │  SequenceFlow_0tt1mbk name="searchUserList"  (bpmn:36)
    │
    ▼  Task_selectUserList "사용자 정보"  (bpmn:22)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectUserList, resultKey=ds_userFrom
    │  (FROM TB_MCM_SEC_USER + EAIUSER scalar subquery,
    │   WHERE END_ACTIVE_DATE > SYSDATE AND USE_TP = 'Y',
    │   ORDER BY DEPT_NM, USER_NM ASC)
    │
    │  SequenceFlow_11a6r0p (bpmn:80)
    │
    ▼  EndEvent_1 (bpmn:7)
    │
    ▼  callback (fn_callBack("searchUserList"), xfdl:367~373)
        ├─ ds_userFrom (out alias 동일)
        └─ bottom status: "{N}건 조회 되었습니다."  (M-006)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_userFrom=ds_userFrom` |
| 파라미터 (sArgument) | (없음 — 빈 문자열) |
| BPMN node | StartEvent_1 → ExclusiveGateway_1 → Task_selectUserList → EndEvent_1 |
| 호출 SQL | selectUserList (xml:7~19) |

### 2.2 search (B-001 btn_search → API-002) — Copy 대상 + RoleGroup 일괄 조회

```
[btn_search 클릭]  (xfdl:269 — commonTopButton 의 기본 btn_search 가 fn_search 호출)
    │
    │  V-101: edt_userIdCopy.value null 차단 (xfdl:300~303)
    │
    ├─ pUserIdCopy  ← edt_userIdCopy.value  (xfdl:310)
    │
    ▼
POST /oasis/commUserRoleCopy/search
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0pg57cu name="search"  (bpmn:77)
    │
    ▼  selectCopyUserMap "Copy 대상 사용자 정보 조회"  (bpmn:37)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectCopyUserMap, resultKey=ds_copyUser
    │  (FROM TB_MCM_SEC_USER WHERE USER_ID = #{pUserIdCopy} OR USER_EMP_NO = #{pUserIdCopy})
    │
    │  SequenceFlow_0kmoi6n (bpmn:78)
    │
    ▼  selectCopyRoleGroupList "Copy 대상 RoleGroup 조회"  (bpmn:63)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectCopyRoleGroupList, resultKey=ds_copyRolegrp
    │  (FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING A
    │   + scalar subquery TB_MCM_SEC_ROLEGROUP for ROLE_GROUP_NM
    │   WHERE USER_ID = #{pUserIdCopy} OR USER_ID = (SELECT USER_ID FROM TB_MCM_SEC_USER WHERE USER_EMP_NO = #{pUserIdCopy}))
    │
    │  SequenceFlow_1qzdnc5 (bpmn:79)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("search"), xfdl:375~381)
        ├─ ds_copyUser   (out alias 동일)
        ├─ ds_copyRolegrp (out alias 동일)
        └─ bottom status: "{N}건 조회 되었습니다."  (M-007, 메시지 키 ds_userCopy — As-Is mismatch 보존)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_copyUser=ds_copyUser ds_copyRolegrp=ds_copyRolegrp` |
| 파라미터 (sArgument) | `pUserIdCopy` |
| BPMN node 흐름 | Start → Gateway → selectCopyUserMap → selectCopyRoleGroupList → End |
| 호출 SQL (순서대로) | selectCopyUserMap (xml:21) → selectCopyRoleGroupList (xml:29) |

### 2.3 save (B-002 btn_save → API-003) — RoleGroup 일괄 복사 + 이력 적재

```
[B-002 btn_save 클릭]  (xfdl:317 — commonTopButton 의 btn_save 가 fn_save 호출)
    │
    ▼  4 단계 validation + confirm (V-001~V-004, 기능 §6.1)
    │   V-001: ds_copyUser.rowcount == 0 차단
    │   V-002: ds_userTo.rowcount == 0 차단
    │   V-003: infReqNo / description null 결합 → confirm 메시지 분기
    │   V-004: confirm 콜백 rtn==true 만 transaction 호출
    │
    ├─ pUserIdCopy   ← ds_copyUser.getColumn(0, "USER_ID")  (xfdl:343)
    ├─ pInfReqNo     ← edt_infReqNo.value                     (xfdl:344)
    └─ pDescription  ← edt_description.value                  (xfdl:345)
    │
    └─ sInDatasets: "ds_userTo=ds_userTo" (xfdl:341 — 권한 생성 대상자 List 송신)
    │
    ▼
POST /oasis/commUserRoleCopy/save
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0eh8isc name="save"  (bpmn:51)
    │
    ▼  UserTask SaveRoleGroupCopy "ROLE 그룹 복사"  (bpmn:52)
    │  class=#{basePackage}SaveRoleGroupCopy, modelerTemplate=com.dongkuk.dmes.UserTask
    │  nextBranchSpel=""
    │
    │  ─── Java run() 트랜잭션 본문 (SaveRoleGroupCopy.java:24~87) — To-Be 정정 (Q-001/Q-002/Q-006 해소) ───
    │
    │  [외곽 루프] for user in ds_userTo (N건 — 권한 생성 대상자 수):
    │      [SQL] (To-Be Q-001 정책 #1) userMappingRepository.findRoleMergeObject(pUserIdCopy, user.USER_ID)
    │            // As-Is: dao.selectList("CommUserMngMapper.selectRoleMergeObject", ...)
    │            // To-Be 1차 정정: dao.selectList("CommUserRoleCopyMapper.selectRoleMergeObject", ...)
    │            //                  (본 namespace 정본 — Mapper.xml #4)
    │            // To-Be 최종: JPA Repository native query 흡수
    │        → 결과 roleMergeObjectList (Copy 대상 의 RoleGroup 중 user 가 아직 가지지 않은 것)
    │
    │      List<SecUserRollHis> rollHisList = new ArrayList<>();
    │      [내부 루프] for role in roleMergeObjectList (M건):
    │          rollHisList.add(new SecUserRollHis(
    │             OP_SUMUP_DT  = today (yyyyMMdd),
    │             WORKS_CODE   = "P",  [LV-001 하드코딩, Q-008 부분 해소 — Permission 추정]
    │             USER_ID      = user.USER_ID,
    │             ROLE_GROUP_ID= role.ROLE_GROUP_ID,
    │             RESP_GBN     = "A",  [LV-002 하드코딩, Q-005 해소 = 추가 Add]
    │             ROLE_GROUP_NM= role.ROLE_GROUP_NM,
    │             INF_REQ_NO   = pInfReqNo,
    │             DESCRIPTION  = pDescription
    │          ));
    │      // (To-Be Q-002 / Q-006 정책 #6) secUserRollHisRepository.saveAll(rollHisList);
    │      //   As-Is: dao.insert("TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK", mapInsert) per row
    │      //   To-Be: JPA Entity SecUserRollHis (5컬럼 복합 PK OP_SUMUP_DT/WORKS_CODE/USER_ID/ROLE_GROUP_ID/RESP_GBN)
    │      //          + saveAll() — mergePK upsert 동등 (existsById → update / 미존재 → insert)
    │      //          Entity = commUserMng 의 SecUserRollHis 재사용 (자체 신설 ✗ — 정책 #6 (A))
    │
    │      [SQL] (To-Be: userMappingRepository.mergeCopyRoleGrp(pUserIdCopy, user.USER_ID))
    │            // As-Is: dao.insert("CommUserRoleCopyMapper.mergeCommonCopyRoleGrp", ...) (본 namespace 유지)
    │        → MERGE INTO TB_MCM_SEC_USER_MAPPING (PK 미존재 행만 INSERT, audit 자동 — cactus-core CactusAuditEntity)
    │
    │      cnt++  (사용자 단위 counter)
    │  ──
    │
    │  context.put("cnt_save", cnt) (CommonDaoUtil.addDaoResultIntoContext)
    │
    │  ───────────────────────────────────────────────────────────────────────────────
    │
    │  SequenceFlow_0v64ch1 (bpmn:62)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("save"), xfdl:384~404)
        ├─ ds_userFrom (out alias — 외곽 트랜잭션 결과 outDataset 으로 selectUserList 결과 1회 추가 송신, sOutDatasets="ds_userFrom=ds_userFrom", xfdl:342)
        │   (단, BPMN save flow 자체에 후속 Task_selectUserList 가 연결되지 않음 — Q-003. ds_userFrom 의 실제 값은 xfdl 콜백이 fn_searchUserList() 별도 호출로 보충 — xfdl:395)
        ├─ ds_copyRolegrp.clearData() / ds_copyUser.clearData() / ds_userTo.clearData() / ds_userFrom.clearData() (xfdl:389~392)
        ├─ fn_searchUserList() 별도 호출 (ds_userFrom 새로고침)  (xfdl:395)
        ├─ edt_infReqNo / edt_description / edt_userFilter / edt_userIdCopy 초기화 (xfdl:396~400)
        ├─ ds_userFrom.filter("") 필터 해제 (xfdl:399)
        └─ bottom status: "{N}건 조회 되었습니다." (저장 메시지 아님 — As-Is 보존, M-008)
```

| 입력 (sInDatasets) | `ds_userTo=ds_userTo` |
|---|---|
| 출력 (sOutDatasets) | `ds_userFrom=ds_userFrom` (BPMN flow 미연결 — Q-003 해소: As-Is 의도된 분리 / FE 콜백 재조회 패턴 보존) |
| 파라미터 (sArgument) | `pUserIdCopy` + `pInfReqNo` + `pDescription` |
| BPMN node 흐름 | Start → Gateway → SaveRoleGroupCopy → End |
| Java 클래스 | `SaveRoleGroupCopy` (`#{basePackage}SaveRoleGroupCopy`) → To-Be Service 메서드 `CommUserRoleCopyService.save()` |
| 호출 SQL 본 Mapper (To-Be 정정) | selectRoleMergeObject (xml:39~50, 본 namespace 정본 — Q-001 해소 정책 #1) + mergeCommonCopyRoleGrp (xml:53). 모두 JPA `UserMappingRepository` 흡수 |
| 호출 SQL 외부 namespace 해소 | (1) `CommUserMngMapper.selectRoleMergeObject` (As-Is 외부 호출 결함) → Q-001 해소 / 본 namespace 정정 (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` → Q-002/Q-006 해소 / JPA Entity `SecUserRollHis` + `saveAll()` 흡수 (외부 Mapper.xml 신규 ✗, commUserMng Entity 재사용) |
| 트랜잭션 경계 | 단일 UserTask 트랜잭션 (N 사용자 × M RoleGroup 전체 단일 commit) — Service `@Transactional` |

---

## 3. To-Be Service / Repository 매핑

### 3.1 Service 레이어 (단일 Service)

| Service 클래스 | 메서드 | action | 비고 |
|---|---|---|---|
| `CommUserRoleCopyService` | `searchUserList()` | searchUserList | UserRepository (또는 native query) 호출 — selectUserList 본문 |
| `CommUserRoleCopyService` | `search(pUserIdCopy)` | search | UserRepository + UserMappingRepository 호출 — selectCopyUserMap + selectCopyRoleGroupList |
| `CommUserRoleCopyService` | `save(saveDto)` | save | Java SaveRoleGroupCopy.java 의 트랜잭션 본문 (외곽 루프 + 내부 루프 + MERGE) 그대로 이전 |

### 3.2 Repository 매핑 (모듈 단위 평탄 — RULE.md §3-1) — 2026-05-31 Q-001/Q-002/Q-004/Q-006 해소 반영

| Repository | 경로 | 대상 테이블 / 액션 | 비고 |
|---|---|---|---|
| `UserRepository` | `com.dongkuk.dmes.mcm.repository` | TB_MCM_SEC_USER SELECT (selectUserList / selectCopyUserMap) — native query 또는 JPA `@Query` | **Q-004 해소 (정책 #2)**: As-Is EAI scalar subquery 폐기 → `LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD = S.DEPT_CD AND D.USE_TP='Y'` + `D.DEPT_NM` 으로 변환. JPA join fetch 또는 native query |
| `UserMappingRepository` | `com.dongkuk.dmes.mcm.repository` | TB_MCM_SEC_USER_MAPPING SELECT (selectCopyRoleGroupList / selectRoleMergeObject) + MERGE (mergeCommonCopyRoleGrp) | **Q-001 해소 (정책 #1)**: As-Is Java 의 외부 `CommUserMngMapper.selectRoleMergeObject` 호출 결함 → 본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 정본 (본 Mapper.xml #4) → JPA Repository native query 통합. RoleGroup scalar subquery 도 native query |
| `RoleGroupRepository` | `com.dongkuk.dmes.mcm.repository` | TB_MCM_SEC_ROLEGROUP SELECT (scalar subquery 용) | 직접 호출 ✗ (Repository 결합 측) |
| `SecUserRollHisRepository` | `com.dongkuk.dmes.mcm.repository` | TB_MCM_SEC_USER_ROLL_HIS upsert (`saveAll(List<SecUserRollHis>)`) | **Q-002 / Q-006 해소 (정책 #6)**: As-Is 외부 namespace `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` 폐기 → JPA Entity `SecUserRollHis extends McmAuditEntity` (5컬럼 복합 PK upsert) + `saveAll()` 흡수. Entity = **commUserMng 의 SecUserRollHis 재사용** (자체 신설 ✗ — 정책 #6 (A)). Repository 도 commUserMng 정본 재사용 가능 |
| `DeptInfoRepository` | `com.dongkuk.dmes.mcm.repository` | TB_MCM_DEPT_INFO SELECT (To-Be 신규 부서 마스터) | **Q-004 해소 (정책 #2 신규)**: DMES 자체 부서 마스터. Entity = `DeptInfo` (commUserMng 카탈로그 정본). 본 화면은 UserRepository.selectUserList 의 JOIN 으로만 사용 — 단독 호출 ✗ |

### 3.3 Entity 매핑 (모듈 단위 평탄) — 2026-05-31 Q-002/Q-004/Q-006 해소 + 정책 #6 (A) 재사용

> **정책 #6 (A)**: 본 화면 자체 Entity 신설 ✗ — commUserMng 화면이 정본인 4 Entity (`SecUser` / `SecUserMapping` / `SecRoleGroup` / `SecUserRollHis`) + `DeptInfo` 모두 재사용. 본 화면 Service (`CommUserRoleCopyService`) 가 동일 Entity / Repository 를 의존성 주입으로 사용.

| Entity | 경로 | 테이블 | 비고 |
|---|---|---|---|
| `SecUser` | `com.dongkuk.dmes.mcm.entity` | MCMAPUSER.TB_MCM_SEC_USER | **commUserMng 정본 재사용**. 본 컬럼 (USER_ID PK / USER_EMP_NO / USER_NM / END_ACTIVE_DATE / USE_TP / DEPT_CD 등) + McmAuditEntity 9. 본 화면은 SELECT 만 사용 (audit 영향 ✗) |
| `SecUserMapping` | `com.dongkuk.dmes.mcm.entity` | MCMAPUSER.TB_MCM_SEC_USER_MAPPING | **commUserMng 정본 재사용**. 본 컬럼 2 (USER_ID + ROLE_GROUP_ID 복합 PK) + McmAuditEntity 9. 본 화면은 MERGE WHEN NOT MATCHED 로 신규 INSERT |
| `SecRoleGroup` | `com.dongkuk.dmes.mcm.entity` | MCMAPUSER.TB_MCM_SEC_ROLEGROUP | **commUserMng 정본 재사용**. ROLE_GROUP_ID PK / ROLE_GROUP_NM 등. 본 화면은 scalar subquery 의 결합 측 (직접 호출 ✗) |
| `SecUserRollHis` | `com.dongkuk.dmes.mcm.entity` | MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS | **Q-002 / Q-006 해소 (정책 #6)** — commUserMng 정본 재사용 (자체 신설 ✗). **5 컬럼 복합 PK (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN)** + 본 컬럼 3 (ROLE_GROUP_NM / INF_REQ_NO / DESCRIPTION) + McmAuditEntity 9. JPA `@IdClass(SecUserRollHisId)` 또는 `@EmbeddedId`. `saveAll()` 호출이 mergePK upsert 동등 동작 |
| `DeptInfo` | `com.dongkuk.dmes.mcm.entity` | MCMAPUSER.TB_MCM_DEPT_INFO | **Q-004 해소 (정책 #2 신규)** — commUserMng 카탈로그 정본 재사용. DEPT_CD PK / DEPT_NM / USE_TP + McmAuditEntity 9. 본 화면은 SELECT JOIN 만 사용 |

> Entity 의 `extends McmAuditEntity` (또는 cactus-core `CactusAuditEntity`) + `CactusAuditListener` 적용으로 audit 9 컬럼 자동 채움. `VER` (Long, @Version) Optimistic Locking.

---

## 4. action enum 매트릭스 (분석 §8.3 + BPMN sequenceFlow.name 인용)

| To-Be action | BPMN sequenceFlow id | BPMN name | xfdl 트리거 | Java | 호출 SQL (순서) | 결과 dataset |
|---|---|---|---|---|---|---|
| searchUserList | SequenceFlow_0tt1mbk | "searchUserList" | CommUserRoleCopy_onload (xfdl:261) | (Task 단독) | selectUserList | ds_userFrom |
| search | SequenceFlow_0pg57cu | "search" | btn_search → fn_search (xfdl:299) | (Task 2개 chain) | selectCopyUserMap → selectCopyRoleGroupList | ds_copyUser + ds_copyRolegrp |
| save | SequenceFlow_0eh8isc | "save" | btn_save → fn_save → confirm rtn==true → fn_msgSaveBeforeCallBack (xfdl:317~358) | SaveRoleGroupCopy.java (→ To-Be CommUserRoleCopyService.save) | **To-Be 정정 (Q-001/Q-002/Q-006 해소 2026-05-31)**: (1) `CommUserRoleCopyMapper.selectRoleMergeObject` 본 namespace 정본 (As-Is `CommUserMngMapper.*` 외부 호출 결함 정정 / 정책 #1) → JPA UserMappingRepository 흡수 (2) JPA `SecUserRollHisRepository.saveAll()` × M (As-Is `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` 폐기 / 정책 #6) (3) `CommUserRoleCopyMapper.mergeCommonCopyRoleGrp` 본 namespace 유지 → JPA UserMappingRepository native (사용자 별 반복) | (BPMN flow 미연결 — Q-003 해소: As-Is 의도된 분리 / FE 콜백 재조회 패턴 보존. xfdl 콜백이 fn_searchUserList 별도 호출 보충) |

> action 3 enum 모두 As-Is 그대로 보존. 신규 추가 ✗.

---

## 5. ExclusiveGateway 분기 (As-Is bpmn:12~20 1:1 보존)

```
ExclusiveGateway_1 (name="분기" — As-Is xml 명시, bpmn:12)
  ├─ ext:style shapeBackground="#ffff00" labelPosition="Center of Figure" (bpmn:14)
  ├─ incoming: SequenceFlow_1 (StartEvent → Gateway)
  └─ outgoing 3 분기:
       ├─ SequenceFlow_0tt1mbk (name="searchUserList") → Task_selectUserList
       ├─ SequenceFlow_0eh8isc (name="save")           → SaveRoleGroupCopy (UserTask)
       └─ SequenceFlow_0pg57cu (name="search")         → selectCopyUserMap
```

> 분기 enum 3개 정렬 순서는 BPMN xml 의 outgoing 순서 (bpmn:17~19) 그대로. ExclusiveGateway 의 노란색 배경 (ext:style) 도 As-Is 보존.

---

## 6. To-Be 식별자 정정 (분석 §11.1 + 본 문서)

| 자산 | As-Is | To-Be | 정정 사유 |
|---|---|---|---|
| BPMN process id | `CommUserRoleCopy` | `commUserRoleCopy` | 4 식별자 1byte 동일 룰 |
| 본 Mapper namespace | `CommUserRoleCopyMapper` | (JPA Repository 흡수 — `UserMappingRepository`) | Mapper.xml.asis 는 보존 |
| Java UserTask class | `com.dongkuk.dmes.mui.task.ui.csa.CommUserRoleCopy.SaveRoleGroupCopy` | `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.service.CommUserRoleCopyService.save()` (BPMN UserTask class 참조 = `#{basePackage}.SaveRoleGroupCopy` → Service 메서드로 흡수) | RULE.md §3-1 |
| Java 로그 메시지 | `"##########	SaveRoleGroupHis RoleGroup 이력 저장 시작"` (java:28) | `"##########	SaveRoleGroupCopy RoleGroup 이력 저장 시작"` | As-Is 오타 정정 (분석 §11 #14) |
| Java 변수명 | `insertRollHis` (java:65) | `insertRoleHis` | Roll → Role 오타 정정 (분석 §11 #15) |
| Java import | `BCryptPasswordEncoder` / `PasswordEncoder` (java:9~10) | 제거 | 본문 미사용 dead import (분석 §11 #13) |
| WORKS_CODE 하드코딩 | "P" (java:57) | 그대로 (Q-008 부분 해소 — Permission 추정) | As-Is 보존 |
| RESP_GBN 하드코딩 | "A" (java:60) | 그대로 (Q-005 해소 — A=추가 Add) | As-Is 보존 |
| CommonUtil.getCurrentDate | `CommonUtil.getCurrentDate("yyyyMMdd")` | `LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))` 또는 cactus-core 헬퍼 | Java 8+ API |
| **외부 namespace `CommUserMngMapper.selectRoleMergeObject` (Q-001)** | `dao.selectList("CommUserMngMapper.selectRoleMergeObject", ...)` (java:52) | **본 namespace 정정** `dao.selectList("CommUserRoleCopyMapper.selectRoleMergeObject", ...)` → 최종 JPA `UserMappingRepository.findRoleMergeObject(...)` 흡수 | **Q-001 해소 (정책 #1)** — As-Is 외부 namespace 호출 결함 (본 Mapper.xml #4 정본 존재) 정정 |
| **외부 namespace `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (Q-002 / Q-006)** | `dao.insert("TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK", mapInsert)` per row (java:65) | **JPA Entity `SecUserRollHis` + `secUserRollHisRepository.saveAll(rollHisList)`** (5컬럼 복합 PK upsert 의 mergePK 동작은 JPA `save()` 가 동등) | **Q-002 / Q-006 해소 (정책 #6)** — 외부 Mapper.xml 신규 ✗ + Entity 재사용 (정책 #6 (A) — commUserMng SecUserRollHis 정본 재사용 / 자체 신설 ✗) |
| **EAI 외부 인터페이스 (Q-004)** | `EAIUSER.IF_GW01MMFSHD01` / `IF_GW01MMFSHD02` scalar subquery (xml:9~14) | **DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` LEFT JOIN** (`LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD = S.DEPT_CD AND D.USE_TP='Y'` + `D.DEPT_NM`). Entity `DeptInfo` commUserMng 정본 재사용 | **Q-004 해소 (정책 #2)** — EAI 폐기 / commUserMng selectCommDept Q-004 해소 결정 정합 / 일괄 정책 |
| **BPMN save flow 후속 task 미연결 (Q-003)** | save sequenceFlow 후속 Task_selectUserList 미연결 (As-Is) | 그대로 보존 — As-Is 의도된 분리 (FE 콜백 재조회 패턴). React 등가물에서 save mutation 완료 후 searchUserList query refetch | **Q-003 해소** — 의도된 분리 보존 / BPMN flow 변경 ✗ |

---

## 7. 트랜잭션 / 동시성 정책

| 항목 | 결정 |
|---|---|
| 트랜잭션 경계 | save action 의 UserTask 1개가 단일 트랜잭션. N 사용자 × M RoleGroup 전체 commit. 오류 시 전체 rollback |
| Optimistic Locking | cactus-core `VER` (@Version) — TB_MCM_SEC_USER_MAPPING 의 신규 행 INSERT 시 VER=0 자동 채움. 기존 행 INSERT 차단은 MERGE WHEN NOT MATCHED 로직 (xml:57) |
| 권한 이력 (TB_MCM_SEC_USER_ROLL_HIS) PK | **Q-006 해소 2026-05-31**: 5 컬럼 복합 PK = (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) — commUserMng §6.1 X-2 정본. JPA `@IdClass(SecUserRollHisId)` 또는 `@EmbeddedId` 적용. mergePK upsert 동작은 `save()` 의 `existsById → update / 미존재 → insert` 가 등가 |
| save 후 ds_userFrom 새로고침 | **Q-003 해소 2026-05-31**: (1) BPMN flow 가 후속 Task_selectUserList 미연결은 As-Is 의도된 분리 (save 트랜잭션과 List 재조회 책임 분리) (2) xfdl 콜백이 fn_searchUserList() 별도 호출로 채움 (xfdl:395). **To-Be 결정**: 보존 — React 등가물에서도 save mutation 완료 → searchUserList query refetch 동일 패턴. BPMN flow 변경 ✗ |

---

## 8. 인용 정합 (분석리포트 §6~§8 ↔ 본 §1~§7)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 + §8.3 | API 3 행 = action 3 enum |
| §1.2 | 분석 §10 + §6 + §7 | C1~C6 판정 |
| §2.1 | 분석 §6.1 #1 + §8.1 Task_selectUserList + §8.2 SequenceFlow_0tt1mbk / 11a6r0p | searchUserList 흐름 |
| §2.2 | 분석 §6.1 #2/#3 + §8.1 selectCopyUserMap / selectCopyRoleGroupList + §8.2 SequenceFlow_0pg57cu / 0kmoi6n / 1qzdnc5 | search 흐름 |
| §2.3 | 분석 §7.1 + §8.1 SaveRoleGroupCopy + §8.2 SequenceFlow_0eh8isc / 0v64ch1 | save 흐름 |
| §3 | 분석 §7.1 + §11.1 + RULE.md §3-1 | Service / Repository / Entity 매핑 |
| §4 | 분석 §8.3 | action 3 enum |
| §5 | 분석 §8.1 ExclusiveGateway_1 + §8.2 outgoing | 분기 3 enum |
| §6 | 분석 §11.1 + §11 #13~#15 | To-Be 식별자 정정 |
| §7 | 분석 §7.1 트랜잭션 경계 + §9.2 audit + §12 결정 누적 | 트랜잭션 정책 |
