---
screenId: commUserMng
asIsId: CommUserMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-05-31
작성자: Agent
---

# mcm — 사용자 관리 BPMN설계서

> **인용 정본**: 본 문서의 모든 본문은 `commUserMng_분석리포트.md` 의 §1 / §6 / §7 / §8 / §11 / §17.5 / §17.6 인용. 자체 추가 ✗. action enum 11 / SQL ID / Java UserTask class / sequenceFlow id 모두 As-Is BPMN 과 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). **2026-05-31 갱신**: ~~cactus-core 의존성~~ → **`McmAuditEntity`** (mcm-core 기존 자산 보존 + cma 정본 패턴 / ref_Audit 9 컬럼 자동) + `CactusConstants.{USER_ID/USER_EMP_NO/USER_ENC_PWD/USER_SSO_PWD/DEFAULT_PASSWORD}` (T-022). Q 13건 일괄 해소.

---

## 1. BPMN 개요

### 1.1 process 정의 (As-Is `services/csa/CommUserMng.bpmn` 인용)

| 항목 | 값 |
|---|---|
| BPMN file | `services/csa/CommUserMng.bpmn` (465 line) |
| process id | `CommUserMng` (bpmn:3) |
| process name | "사용자 계정 재생성" (bpmn:3 — As-Is 잔존 명칭, 실제는 11 액션 전반 분기) |
| isExecutable | false (bpmn:3) |
| exporter | "Camunda Modeler" 3.1.2 (bpmn:2) |
| serviceId | commUserMng (process id 와 일치 / `#{serviceId}Mapper.{sqlKey}` 패턴) |

### 1.2 BPMN action 11 enum (As-Is gateway outgoing 11 개 = 11 action)

> **사용자 입력 메타의 "6 enum" 강제 ✗** — 본 화면 As-Is 는 11 enum (사용자 관리 도메인 특성). To-Be 동일 11 enum 보존 (사용자 결정).

| # | action (sequenceFlow name) | xfdl 트리거 | BPMN node (Gateway → target) | Mapper SQL / Java UserTask |
|---:|---|---|---|---|
| 1 | `searchCmUser` | fn_search (xfdl:846) | Task_searchCmUser → Task_0970821 → EndEvent_1 | selectCommUser **(To-Be DEPT_NM = LEFT JOIN `MCMAPUSER.TB_MCM_DEPT_INFO` — 정책 #2)** → selectCommUserAll |
| 2 | `saveCmUser` | fn_modify (xfdl:892) | UserTask_1opm8fa → EndEvent_1 | (UserTask) SaveCommUserMng → updateCommUser |
| 3 | `regCmUser` | fn_register (xfdl:996) | RegCommUserMng → EndEvent_1 | (UserTask) RegCommUserMng → insertCommUser + mergeCommonPwdInit + **(To-Be `SecUserHisRepository.save()` JPA 흡수 — 정책 #3 (C) / Q-004 해소 / T-023)** |
| 4 | `deleteCmUser` | div_deletePopup_btn_save_onclick (xfdl:1163) | DeleteCommUserMng → EndEvent_1 | (UserTask) DeleteCommUserMng → deleteCmUser + **(To-Be `SecUserHisRepository.save()` JPA 흡수)** |
| 5 | `reRegCmUser` | btn_reRegister_onclick (xfdl:1433) | UserTask_128zs8e → EndEvent_1 | (UserTask) ReRegCommUserMng → updateReRegUser + mergeCommonPwdInit + **(To-Be `SecUserHisRepository.save()` JPA 흡수)** |
| 6 | `searchUserRoleGrp` | ds_main_onrowposchanged (xfdl:1199) | Task_searchUserRoleGrp → EndEvent_1 | selectCommUserRoleGrp |
| 7 | `saveUserRoleGrp` | fn_rolSave (xfdl:1303) | SaveRoleGroupHis → Task_saveUserRoleGrp → EndEvent_1 | (UserTask) SaveRoleGroupHis → **(To-Be `SecUserRollHisRepository.saveAll()` JPA 흡수)** + (CommonMultiSaveTask) insertCommUserRoleGrp / deleteCommUserRoleGrp |
| 8 | `searchRoleGrp` | fn_rolSearch (xfdl:1315) | Task_searchRoleGrp → EndEvent_1 | selectCommRoleGrpList |
| 9 | `pwdinit` | btn_PwdReset_onclick (xfdl:1382) / btn_SSOPwdReset_onclick (xfdl:1405) | UserTask_pwdinit → EndEvent_1 | (UserTask) PasswordInit → SSO_RESET_FLAG=Y → updateCommonSSOPwdInit / 단건 mergeCommonPwdInit. **(정책 #3 (F)) DEFAULT_PASSWORD 출처 = `CommUserMngPasswordProperties` (yml `commUserMng.password.*`)** |
| 10 | `saveUserRoleGrpCopy` | btn_RoleCopy_onclick (xfdl:1421) | SaveRoleGroupCopyHis → Task_0v3mxy0 → EndEvent_1 | (UserTask) SaveRoleGroupCopyHis → selectRoleMergeObject + **(To-Be `SecUserRollHisRepository.saveAll()` JPA 흡수)** + (CommonInsertTask) mergeCommonCopyRoleGrp |
| 11 | `commonUserDept` | div_dept_cd.commonDynamic_onload (FX-006, xfdl:421) | Task_1tti6qu → EndEvent_1 | selectCommDept **(To-Be `MCMAPUSER.TB_MCM_DEPT_INFO` 단독 조회 — 정책 #2)** |

---

## 2. 분기 흐름별 BPMN 상세 (분석 §8.3 1:1 인용)

### 2.1 searchCmUser 분기

```
StartEvent_1
   │ (SequenceFlow_1)
   ▼
ExclusiveGateway_1
   │ (SequenceFlow_0tt1mbk, name="searchCmUser")
   ▼
Task_searchCmUser (CommonSelectTask)
   │ sqlKey = #{serviceId}Mapper.selectCommUser
   │ resultKey = ds_main
   │ (SequenceFlow_105vwsz)
   ▼
Task_0970821 (CommonSelectTask) "사용자 정보 전체"
   │ sqlKey = #{serviceId}Mapper.selectCommUserAll
   │ resultKey = ds_mainAll
   │ (SequenceFlow_0alv1bb)
   ▼
EndEvent_1
```

| 노드 | type | camunda:class | sqlKey / class | paramKey | resultKey | 근거 |
|---|---|---|---|---|---|---|
| Task_searchCmUser | task (modelerTemplate=MapperBaseDbAccessTemplate) | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUser | "" | ds_main | bpmn:39~52 |
| Task_0970821 | task (동일) | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUserAll | "" | ds_mainAll | bpmn:127~140 |

### 2.2 saveCmUser 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_0grwghu, name="saveCmUser")
   ▼
UserTask_1opm8fa "사용자 정보 저장" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}SaveCommUserMng
   │ (SequenceFlow_19ojhvj)
   ▼
EndEvent_1
```

| 노드 | type | class | 근거 |
|---|---|---|---|
| UserTask_1opm8fa | userTask | #{basePackage}SaveCommUserMng | bpmn:116~125 |

> SaveCommUserMng.java 내부: ds_main for-loop + status="updated" 분기만 동작 → updateCommUser (inserted/deleted 주석 처리 — F-005 / Q-009).

### 2.3 regCmUser 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_1944t12, name="regCmUser")
   ▼
RegCommUserMng "사용자 계정 생성" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}RegCommUserMng
   │ (SequenceFlow_1766mr8)
   ▼
EndEvent_1
```

| 노드 | type | class | 근거 |
|---|---|---|---|
| RegCommUserMng | userTask | #{basePackage}RegCommUserMng | bpmn:176~185 |

> RegCommUserMng.java 내부: status="inserted" → setMap 전체 copy + bcrypt(USER_ENC_PWD/USER_SSO_PWD) + USE_TP="Y" 강제 → insertCommUser → mergeCommonPwdInit → **To-Be `SecUserHisRepository.save(...)` JPA Entity 흡수 (PROC_TYPE="C", PROC_CASE="M" — 정책 #3 (C) / Q-004 해소 / T-023)**.

### 2.4 deleteCmUser 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_0hchiuv, name="deleteCmUser")
   ▼
DeleteCommUserMng "사용자 계정 삭제" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}DeleteCommUserMng
   │ (SequenceFlow_0g8pzip)
   ▼
EndEvent_1
```

| 노드 | type | class | 근거 |
|---|---|---|---|
| DeleteCommUserMng | userTask | #{basePackage}DeleteCommUserMng | bpmn:186~195 |

> DeleteCommUserMng.java 내부: status="deleted" → END_ACTIVE_DATE + pUserId setMap → `CommUserMngMapper.deleteCmUser` (논리삭제 — END_ACTIVE_DATE 마감) → **To-Be `SecUserHisRepository.save(...)` JPA Entity 흡수 (PROC_TYPE="D", PROC_CASE="M" — 정책 #3 (C))**.

### 2.5 reRegCmUser 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_07aq563, name="reRegCmUser")
   ▼
UserTask_128zs8e "사용자 계정 재생성" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}ReRegCommUserMng
   │ (SequenceFlow_0l2kcue)
   ▼
EndEvent_1
```

| 노드 | type | class | 근거 |
|---|---|---|---|
| UserTask_128zs8e | userTask | #{basePackage}ReRegCommUserMng | bpmn:224~233 |

> ReRegCommUserMng.java 내부: ds_main.get(0) 단건 → USE_TP="Y" + START_ACTIVE_DATE=today + END_ACTIVE_DATE="99991231" + bcrypt → updateReRegUser → mergeCommonPwdInit → **To-Be `SecUserHisRepository.save(...)` JPA Entity 흡수 (PROC_TYPE="C", PROC_CASE="M" — 정책 #3 (C))**. updateReRegUserCnt<0 → UserException.

### 2.6 searchUserRoleGrp 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_0bb4b1a, name="searchUserRoleGrp\n")
   ▼
Task_searchUserRoleGrp "사용자 ROLE 그룹 조회" (CommonSelectTask)
   │ sqlKey = #{serviceId}Mapper.selectCommUserRoleGrp
   │ resultKey = ds_userRolegrp
   │ (SequenceFlow_0e90wtm)
   ▼
EndEvent_1
```

| 노드 | type | camunda:class | sqlKey | resultKey | 근거 |
|---|---|---|---|---|---|
| Task_searchUserRoleGrp | task | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUserRoleGrp | ds_userRolegrp | bpmn:54~67 |

### 2.7 saveUserRoleGrp 분기 (2 노드 chain)

```
ExclusiveGateway_1
   │ (SequenceFlow_saveUserRoleGrp, name="saveUserRoleGrp")
   ▼
SaveRoleGroupHis "사용자 ROLE 그룹 수정 이력 저장" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}SaveRoleGroupHis
   │ (SequenceFlow_05p4q2h)
   ▼
Task_saveUserRoleGrp "사용자 ROLE 그룹 저장" (CommonMultiSaveTask)
   │ insertSqlKey = #{serviceId}Mapper.insertCommUserRoleGrp
   │ deleteSqlKey = #{serviceId}Mapper.deleteCommUserRoleGrp
   │ updateSqlKey = ""
   │ paramKey / resultKey = ds_userRolegrp
   │ (SequenceFlow_1c1ioow)
   ▼
EndEvent_1
```

| 노드 | type | camunda:class / class | sqlKey | paramKey/resultKey | 근거 |
|---|---|---|---|---|---|
| SaveRoleGroupHis | userTask | #{basePackage}SaveRoleGroupHis | - | - | bpmn:200~209 |
| Task_saveUserRoleGrp | task (modelerTemplate=CommonMultiSaveTask) | commonDbTask.CommonMultiSaveTask | insert=insertCommUserRoleGrp / delete=deleteCommUserRoleGrp / update="" | ds_userRolegrp / ds_userRolegrp | bpmn:70~86 |

> SaveRoleGroupHis.java 내부: ds_userRolegrp for-loop + status 분기 (inserted → RESP_GBN="A" / deleted → RESP_GBN="D") + WORKS_CODE="P" → **To-Be `SecUserRollHisRepository.saveAll(...)` JPA Entity 흡수 (정책 #3 (C) / Q-004 해소 / T-023)**. 후속 CommonMultiSaveTask 가 실제 TB_MCM_SEC_USER_MAPPING INSERT/DELETE 수행.

### 2.8 searchRoleGrp 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_searchRoleGrp, name="searchRoleGrp")
   ▼
Task_searchRoleGrp "ROLE 그룹 조회" (CommonSelectTask)
   │ sqlKey = #{serviceId}Mapper.selectCommRoleGrpList
   │ resultKey = ds_rolegrpList
   │ (SequenceFlow_07entyn)
   ▼
EndEvent_1
```

| 노드 | type | camunda:class | sqlKey | resultKey | 근거 |
|---|---|---|---|---|---|
| Task_searchRoleGrp | task | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommRoleGrpList | ds_rolegrpList | bpmn:87~100 |

### 2.9 pwdinit 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_0eh8isc, name="pwdinit")
   ▼
UserTask_pwdinit "패스워드 초기화" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}PasswordInit
   │ (SequenceFlow_0v64ch1)
   ▼
EndEvent_1
```

| 노드 | type | class | 근거 |
|---|---|---|---|
| UserTask_pwdinit | userTask | #{basePackage}PasswordInit | bpmn:105~114 |

> PasswordInit.java 내부: context.get("SSO_RESET_FLAG") == "Y" → ds_main for-loop → updateCommonSSOPwdInit (전 사용자 SSO) / 그 외 → 단건 mergeCommonPwdInit (USER_ENC_PWD=bcrypt(DEFAULT_PASSWORD) + USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO)). **(정책 #3 (F) / Q-012 해소 / T-011)** ~~`CactusConstants.DEFAULT_PASSWORD`~~ → **`commUserMngPasswordProperties.getDefault()` (yml prefix `commUserMng.password.*`, FQN `mcm.csa.commUserMng.config.CommUserMngPasswordProperties`)**. 기존 `mcm-core/security/password/McmPasswordProperties` 보존.
>
> **응답 스키마 개정 (2026-09-28 / J-019 / T-030)** — To-Be `commUserMng.bpmn` 의 `pwdinitTask` 정의는 **변경 없음** (`output=result` Map). 단건 분기(`SSO_RESET_FLAG ≠ "Y"`) 성공 시 Map 에 `INIT_PWD`(발급된 평문 초기 비밀번호) / `INIT_PWD_USER_ID` 가 추가되고, FE 가 이 값으로 초기 비밀번호 안내 모달(P-004)을 띄운다. SSO 일괄 분기는 추가 없음. **평문은 응답으로만 전달하고 로그에는 남기지 않는다.** 상세 = [정합체크 §J.10.1](commUserMng_정합체크.md).

### 2.10 saveUserRoleGrpCopy 분기 (2 노드 chain)

```
ExclusiveGateway_1
   │ (SequenceFlow_1gwazq0, name="saveUserRoleGrpCopy")
   ▼
SaveRoleGroupCopyHis "사용자 ROLE 그룹 수정 이력 저장" (com.dongkuk.dmes.UserTask)
   │ class = #{basePackage}SaveRoleGroupCopyHis
   │ (SequenceFlow_01hi7kv)
   ▼
Task_0v3mxy0 "ROLE 그룹 복사" (CommonInsertTask)
   │ sqlKey = #{serviceId}Mapper.mergeCommonCopyRoleGrp
   │ resultKey = ds_userRolegrp
   │ (SequenceFlow_15dc55q)
   ▼
EndEvent_1
```

| 노드 | type | camunda:class / class | sqlKey | resultKey | 근거 |
|---|---|---|---|---|---|
| SaveRoleGroupCopyHis | userTask | #{basePackage}SaveRoleGroupCopyHis | - | - | bpmn:212~221 |
| Task_0v3mxy0 | task (MapperBaseDbAccessTemplate) | commonDbTask.CommonInsertTask | #{serviceId}Mapper.mergeCommonCopyRoleGrp | ds_userRolegrp | bpmn:143~157 |

> SaveRoleGroupCopyHis.java 내부: selectRoleMergeObject 로 USER_ID_COPY 의 ROLE_GROUP 중 USER_ID 에 없는 것만 조회 → for-loop 로 **To-Be `SecUserRollHisRepository.saveAll(...)` JPA Entity 흡수 (RESP_GBN="A" — 정책 #3 (C))**. 후속 CommonInsertTask 가 실제 TB_MCM_SEC_USER_MAPPING MERGE 수행.

### 2.11 commonUserDept 분기

```
ExclusiveGateway_1
   │ (SequenceFlow_0ugd21v, name="commonUserDept")
   ▼
Task_1tti6qu "부서 팝업 조회" (CommonSelectTask)
   │ sqlKey = #{serviceId}Mapper.selectCommDept
   │ resultKey = ds_userDept
   │ (SequenceFlow_0ssupae)
   ▼
EndEvent_1
```

| 노드 | type | camunda:class | sqlKey | resultKey | 근거 |
|---|---|---|---|---|---|
| Task_1tti6qu | task | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommDept | ds_userDept | bpmn:159~173 |

---

## 3. UserTask Java 클래스 (분석 §17.5 인용)

| # | userTask id | name | class (#{basePackage}…) | sequenceFlow incoming | sequenceFlow outgoing | 근거 |
|---:|---|---|---|---|---|---|
| 1 | UserTask_1opm8fa | 사용자 정보 저장 | SaveCommUserMng | SequenceFlow_0grwghu | SequenceFlow_19ojhvj | bpmn:116~125 |
| 2 | UserTask_pwdinit | 패스워드 초기화 | PasswordInit | SequenceFlow_0eh8isc | SequenceFlow_0v64ch1 | bpmn:105~114 |
| 3 | RegCommUserMng | 사용자 계정 생성 | RegCommUserMng | SequenceFlow_1944t12 | SequenceFlow_1766mr8 | bpmn:176~185 |
| 4 | DeleteCommUserMng | 사용자 계정 삭제 | DeleteCommUserMng | SequenceFlow_0hchiuv | SequenceFlow_0g8pzip | bpmn:186~195 |
| 5 | SaveRoleGroupHis | 사용자 ROLE 그룹 수정 이력 저장 | SaveRoleGroupHis | SequenceFlow_saveUserRoleGrp | SequenceFlow_05p4q2h | bpmn:200~209 |
| 6 | SaveRoleGroupCopyHis | 사용자 ROLE 그룹 수정 이력 저장 | SaveRoleGroupCopyHis | SequenceFlow_1gwazq0 | SequenceFlow_01hi7kv | bpmn:212~221 |
| 7 | UserTask_128zs8e | 사용자 계정 재생성 | ReRegCommUserMng | SequenceFlow_07aq563 | SequenceFlow_0l2kcue | bpmn:224~233 |

---

## 4. CommonDbTask 노드 (분석 §17.6 인용)

| # | task id | name | camunda:class | sqlKey (또는 insert/delete/updateSqlKey) | paramKey / resultKey | 근거 |
|---:|---|---|---|---|---|---|
| 1 | Task_searchCmUser | 사용자 정보 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUser | "" / ds_main | bpmn:39~52 |
| 2 | Task_0970821 | 사용자 정보 전체 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUserAll | "" / ds_mainAll | bpmn:127~140 |
| 3 | Task_searchUserRoleGrp | 사용자 ROLE 그룹 조회 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommUserRoleGrp | - / ds_userRolegrp | bpmn:54~67 |
| 4 | Task_searchRoleGrp | ROLE 그룹 조회 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommRoleGrpList | - / ds_rolegrpList | bpmn:87~100 |
| 5 | Task_saveUserRoleGrp | 사용자 ROLE 그룹 저장 | commonDbTask.CommonMultiSaveTask | insert=#{serviceId}Mapper.insertCommUserRoleGrp / delete=#{serviceId}Mapper.deleteCommUserRoleGrp / update="" | ds_userRolegrp / ds_userRolegrp | bpmn:70~86 |
| 6 | Task_0v3mxy0 | ROLE 그룹 복사 | commonDbTask.CommonInsertTask | #{serviceId}Mapper.mergeCommonCopyRoleGrp | - / ds_userRolegrp | bpmn:143~157 |
| 7 | Task_1tti6qu | 부서 팝업 조회 | commonDbTask.CommonSelectTask | #{serviceId}Mapper.selectCommDept | - / ds_userDept | bpmn:159~173 |

---

## 5. DTO 매핑 (As-Is dataset ↔ Mapper SQL ↔ Java)

| As-Is dataset | binddataset 컬럼 | Mapper SQL (호출 위치) | Java Map / Context key |
|---|---|---|---|
| ds_main | 19 컬럼 (USER_ID / USER_EMP_NO / SSO_ID / USER_NM / START_ACTIVE_DATE / END_ACTIVE_DATE / DEPT_CD / USER_CATEGORY_CD / USE_TP / EMAIL / TEL_NO / MOBILE_TEL_NO / IN_OUT_EMP_TP / GROUP_ID1~3 / DEPT_NM / INF_REQ_NO / DESCRIPTION) | selectCommUser (Task_searchCmUser) / updateCommUser (SaveCommUserMng) / insertCommUser (RegCommUserMng) / deleteCmUser (DeleteCommUserMng) / updateReRegUser (ReRegCommUserMng) / mergeCommonPwdInit / updateCommonSSOPwdInit | `ArrayList<HashMap<String,Object>> ds_main = context.get("ds_main")` |
| ds_mainAll | USER_ID / USER_EMP_NO (2 컬럼) | selectCommUserAll (Task_0970821) | (BPMN resultKey 만) |
| ds_userRolegrp | ROLE_GROUP_ID / ROLE_GROUP_NM / USER_ID (3 컬럼) | selectCommUserRoleGrp (Task_searchUserRoleGrp) / insertCommUserRoleGrp / deleteCommUserRoleGrp (Task_saveUserRoleGrp) / mergeCommonCopyRoleGrp (Task_0v3mxy0) | `ArrayList<HashMap<String,Object>> userRoleGroupList = context.get("ds_userRolegrp")` (SaveRoleGroupHis) |
| ds_rolegrpList | ROLE_GROUP_ID / ROLE_GROUP_NM (2 컬럼) | selectCommRoleGrpList (Task_searchRoleGrp) | (BPMN resultKey 만) |
| ds_userDept (commonDynamic) | DEPT_CD / DEPT_NM (2 컬럼) | selectCommDept (Task_1tti6qu) | (BPMN resultKey 만) |
| ds_pwdtmp | USER_ID / OLD_PWD / NEW_PWD / CF_PWD (4 컬럼) | (외부 publicUrl `/security/password/pwdtmp` — Mapper 미정의) | (외부 서비스) |
| (외부 — context arg) | USER_ID / USER_ID_COPY (saveUserRoleGrpCopy) | selectRoleMergeObject (SaveRoleGroupCopyHis Java 내부 호출) | `context.get("USER_ID") / context.get("USER_ID_COPY")` |
| (외부 — context arg) | INF_REQ_NO / DESCRIPTION (save/reg/delete/reReg/saveUserRoleGrp/saveUserRoleGrpCopy 공통) | (각 SQL 의 ref_Audit 또는 history Mapper insert) | `context.get("INF_REQ_NO") / context.get("DESCRIPTION")` |
| (외부 — context arg) | SSO_RESET_FLAG (pwdinit) | PasswordInit Java 분기 | `context.get("SSO_RESET_FLAG")` |
| (외부 namespace) | (history Mapper 컬럼: OP_SUMUP_DT / WORKS_CODE / USER_ID / ROLE_GROUP_ID / RESP_GBN / ROLE_GROUP_NM / INF_REQ_NO / DESCRIPTION) | TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK (SaveRoleGroupHis / SaveRoleGroupCopyHis) | mapInsert HashMap |
| (외부 namespace) | (history Mapper 컬럼: USER_ID / ACTIVE_DT / PROC_TYPE / PROC_CASE / USER_NM / INF_REQ_NO / DESCRIPTION) | TB_MCM_SEC_USER_HIS_Mapper.insert (RegCommUserMng / DeleteCommUserMng / ReRegCommUserMng) | histMap HashMap |

---

## 6. OASIS 결정 (cactus-core 의존성 + To-Be 명명 안)

### 6.1 cactus-core + mcm-core 의존성 (정책 #1 일괄 적용)

> **정책 #1**: APP_HOST / BIZ_SYSTEM_CODE 폐기 + 기존 mcm-core / kmc-core 자산 보존 + cma 정본 패턴 + Entity = `mcm.entity.*` + Service/DTO = `mcm.csa.commUserMng.{service\|dto}` + JPA only + **McmAuditEntity** 상속.

| 의존 | As-Is 사용 | To-Be 처리 |
|---|---|---|
| `com.dongkuk.cactus.constants.CactusConstants` | USER_ID / USER_EMP_NO / USER_ENC_PWD / USER_SSO_PWD / DEFAULT_PASSWORD (Java 5 클래스 import) | To-Be cactus-core 동일 import 유지 (T-022). **단 DEFAULT_PASSWORD 는 yml 외부화 — `CommUserMngPasswordProperties.getDefault()` 사용 (정책 #3 (F) / T-011)** |
| `com.dongkuk.oasis.domain.Context` | run(Context, Task) 시그니처 | To-Be cactus-core / oasis 동일 import 유지 (T-021) |
| `com.dongkuk.oasis.exception.IllegalTaskException` | 모든 Java task 의 catch 절 throw | T-021 동일 유지 |
| `com.dongkuk.oasis.exception.UserException` | ReRegCommUserMng:61 ("사용자 정보 업데이트에 실패했습니다.") | T-021 동일 유지 |
| `com.dongkuk.oasis.oxm.Task` | run signature | T-021 동일 유지 |
| `com.dongkuk.oasis.persistence.CommonDaoUtil` | `addDaoResultIntoContext(context, "cnt_save", cnt, null, true)` (5 클래스) | T-021 동일 유지 |
| `com.dongkuk.oasis.persistence.TransactionalDao` | `context.getDao()` + `dao.insert/update/selectList` | T-021 동일 유지. **JPA Entity 흡수분 (SecUserHis / SecUserRollHis)** 은 Service 단일 트랜잭션 내 `*Repository.save/saveAll` 사용 (정책 #3 (C)) |
| `com.dongkuk.oasis.task.Wow` | implements Wow (7 클래스 전체) | T-021 동일 유지 |
| `com.dongkuk.dmes.mui.task.common.CommonUtil` | `fixString` / `getCurrentDate("yyyyMMdd")` (ReRegCommUserMng / SaveRoleGroupHis / SaveRoleGroupCopyHis) | T-021 동일 유지 (cactus-core 또는 dmes-mui 모듈 그대로) |
| `org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder` | bcrypt 암호화 (4 클래스) | Spring Boot 4 / Spring Security 7 동일 호환 (T-010) |
| `lombok.extern.slf4j.Slf4j` | log.debug/info/error (7 클래스) | T-021 동일 유지 |
| **`McmAuditEntity` (mcm-core)** | (As-Is 미사용 — Mapper.xml `ref_Audit` fragment 13 회 include) | **To-Be 적용 (정책 #1)** — Entity 상속 + JPA `@PrePersist`/`@PreUpdate` 9 컬럼 자동 채움 (T-009). 기존 mcm-core 자산 보존 + cma 정본 패턴 동일 |
| **`mcm.entity.*` (신규 7 Entity)** | (해당 없음) | SecUser / SecUserMapping / SecUserPwd / SecRoleGroup / SecUserHis / SecUserRollHis / DeptInfo — 정책 #1 + #6 (A) (As-Is 직역) — 분석 §11.1 |
| **`mcm.csa.commUserMng.config.CommUserMngPasswordProperties`** | (해당 없음 — As-Is CactusConstants.DEFAULT_PASSWORD) | **신규** — yml prefix `commUserMng.password.*` (정책 #3 (F) / T-011). 기존 `mcm-core/security/password/McmPasswordProperties` 보존 |

### 6.2 BPMN 기능 식별자 To-Be 명명 (사용자 요구사항 [명명 규칙 정본])

| As-Is sequenceFlow name | To-Be 기능 식별자 | 검증 |
|---|---|---|
| searchCmUser | commUserMng_searchCmUser | ✓ |
| saveCmUser | commUserMng_saveCmUser | ✓ |
| regCmUser | commUserMng_regCmUser | ✓ |
| deleteCmUser | commUserMng_deleteCmUser | ✓ |
| reRegCmUser | commUserMng_reRegCmUser | ✓ |
| searchUserRoleGrp | commUserMng_searchUserRoleGrp | ✓ |
| saveUserRoleGrp | commUserMng_saveUserRoleGrp | ✓ |
| searchRoleGrp | commUserMng_searchRoleGrp | ✓ |
| pwdinit | commUserMng_pwdinit | ✓ |
| saveUserRoleGrpCopy | commUserMng_saveUserRoleGrpCopy | ✓ |
| commonUserDept | commUserMng_commonUserDept | ✓ |

### 6.3 BPMN 노드 To-Be 명명 (As-Is 보존 결정)

| As-Is node id | 보존 여부 | 결과 |
|---|---|---|
| StartEvent_1 / EndEvent_1 / ExclusiveGateway_1 | ✓ As-Is 보존 | ✓ |
| Task_searchCmUser / Task_0970821 / Task_searchUserRoleGrp / Task_saveUserRoleGrp / Task_searchRoleGrp / Task_0v3mxy0 / Task_1tti6qu | ✓ | ✓ |
| UserTask_1opm8fa / UserTask_pwdinit / UserTask_128zs8e | ✓ | ✓ |
| RegCommUserMng / DeleteCommUserMng / SaveRoleGroupHis / SaveRoleGroupCopyHis | ✓ (Java 클래스명 동명) | ✓ |
| (sequenceFlow 26 개 모두) | ✓ As-Is 보존 | ✓ |

### 6.4 sqlKey To-Be 명명 안 (Mapper namespace 변환)

| As-Is sqlKey | To-Be sqlKey | 비고 |
|---|---|---|
| #{serviceId}Mapper.selectCommUser | commUserMngMapper.selectCommUser | serviceId == "commUserMng" (4 식별자 1byte 일치) |
| #{serviceId}Mapper.selectCommUserAll | commUserMngMapper.selectCommUserAll | (동일) |
| #{serviceId}Mapper.selectCommUserRoleGrp | commUserMngMapper.selectCommUserRoleGrp | (동일) |
| #{serviceId}Mapper.selectCommRoleGrpList | commUserMngMapper.selectCommRoleGrpList | (동일) |
| #{serviceId}Mapper.insertCommUserRoleGrp | commUserMngMapper.insertCommUserRoleGrp | (동일) |
| #{serviceId}Mapper.deleteCommUserRoleGrp | commUserMngMapper.deleteCommUserRoleGrp | (동일) |
| #{serviceId}Mapper.mergeCommonCopyRoleGrp | commUserMngMapper.mergeCommonCopyRoleGrp | (동일) |
| #{serviceId}Mapper.selectCommDept | commUserMngMapper.selectCommDept | (동일) |
| (Java 내부) CommUserMngMapper.* | commUserMngMapper.* (Java 내부 namespace 일관성 명시) | - |
| ~~TB_MCM_SEC_USER_HIS_Mapper.insert~~ | **`SecUserHisRepository.save(...)` (JPA Entity 흡수 — 정책 #3 (C) / Q-004 해소 / T-023)** | 별도 Mapper.xml 신규 ✗ |
| ~~TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK~~ | **`SecUserRollHisRepository.saveAll(...)` (JPA Entity 흡수 — 정책 #3 (C))** — mergePK 의미 = 복합 PK upsert. JPA `save()` 가 동일 동작 (existsById → update / 아니면 insert) | 별도 Mapper.xml 신규 ✗ |

### 6.5 BPMN action 6 enum 차이 명시 (As-Is 11 enum 보존)

> 사용자 입력 메타의 가이드 템플릿 "BPMN action 6 enum" (search / searchDetail / save / saveDetail / delete / deleteDetail) 은 본 화면 As-Is 와 불일치. 본 화면은 **사용자 관리 도메인 특성상 11 액션** (searchCmUser / saveCmUser / regCmUser / deleteCmUser / reRegCmUser / searchUserRoleGrp / saveUserRoleGrp / searchRoleGrp / pwdinit / saveUserRoleGrpCopy / commonUserDept). **As-Is 11 enum 1:1 보존** (사용자 결정 — Master/Detail CRUD 가 아닌 사용자 + 역할그룹 + 패스워드 + 부서팝업 다중 도메인).

| 가이드 표준 enum | 본 화면 As-Is 대응 |
|---|---|
| search | searchCmUser |
| searchDetail | searchUserRoleGrp (사용자 → 역할그룹 master/detail) + searchRoleGrp (LoV 후보 조회) |
| save | saveCmUser (수정) |
| saveDetail | saveUserRoleGrp (역할그룹 매핑 INSERT/DELETE) |
| delete | deleteCmUser (논리삭제) |
| deleteDetail | (해당 없음 — saveUserRoleGrp 의 deleteSqlKey 가 동등 처리) |
| (추가) | regCmUser, reRegCmUser, pwdinit, saveUserRoleGrpCopy, commonUserDept (5 도메인 특화 action) |

---

## 7. To-Be 마이그레이션 변환 사항 (분석 §11 인용)

| # | 변환 항목 | 영향 BPMN 노드 / Mapper SQL | 비고 |
|---|---|---|---|
| T-01 | Oracle MERGE → MSSQL MERGE (FROM DUAL 제거) | mergeCommonPwdInit / mergeCommonCopyRoleGrp | xml:204 / 228 |
| T-02 | Oracle SYSDATE → MSSQL GETDATE() | selectCommRoleGrpList | xml:187 |
| T-03 | Oracle NVL → MSSQL ISNULL | selectCommRoleGrpList | xml:187 |
| T-04 | Oracle `||` 결합 → MSSQL `+` 또는 CONCAT | selectCommUser / selectCommDept | xml:28~30 / 258~259 |
| T-05 | Oracle TO_DATE → MSSQL TRY_CONVERT | updateReRegUser | xml:280~281 |
| T-06 | **(정책 #3 (H) / Q-011 해소)** schema = `MCMAPUSER` + 테이블명 As-Is 대문자 `TB_MCM_SEC_*` 보존 확정 | 모든 SQL | 결정 |
| T-07 | ~~`EAIUSER.IF_DSHRMMCMHD02` 외부 EAI → HR 마스터 연계 결정~~ → **(정책 #2 / Q-002 해소)** DMES 신규 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN (selectCommUser) / 단독 조회 (selectCommDept) | selectCommUser DEPT_NM subquery → LEFT JOIN / selectCommDept | xml:24 / 255 |
| T-08 | `ref_Audit` fragment 13 회 include → **`McmAuditEntity` 상속 + JPA `@PrePersist`/`@PreUpdate` 자동 (정책 #1 / T-009)** — mcm-core 기존 자산 보존 + cma 정본 패턴 동일 | insertCommUser / updateCommUser / insertCommUserRoleGrp / mergeCommonPwdInit / mergeCommonCopyRoleGrp / updateCommonSSOPwdInit / updateReRegUser | xml 13 hits |
| T-09 | **(정책 #3 (F) / Q-013 해소)** nexacro WebBrowser RSA pwChg.html → 신규 FE `m-mcm/app/password-change/page.tsx` + 신규 BE `POST /oasis/commUserMng/changePassword` (기존 `/oasis/secUser/resetPassword` 보존) | UserTask_pwdinit (단건 분기) | T-012 |
| T-10 | `commonDynamic.xfdl` 부서 팝업 → SelectModal/Autocomplete (T-016) — **출처 `MCMAPUSER.TB_MCM_DEPT_INFO` (정책 #2)** | Task_1tti6qu / D-007 | - |
| T-11 | **(정책 #3 (B) / Q-003 해소)** 미사용 SQL 5 종 (selectCommUserForSave / deleteCommUser / deleteCommUserMapping / deleteCommUserPwd / updateCommonPwdInit) → To-Be 폐기 | (Mapper.xml 정의만) | - |
| T-12 | **(정책 #3 (C) / Q-004 해소)** 외부 namespace SQL (TB_MCM_SEC_USER_HIS_Mapper.insert / TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK) → JPA Entity `SecUserHis` / `SecUserRollHis` + Repository.saveAll() 흡수. 별도 Mapper.xml 신규 ✗ | DeleteCommUserMng / RegCommUserMng / ReRegCommUserMng / SaveRoleGroupHis / SaveRoleGroupCopyHis | T-023 |
| T-13 | **(정책 #3 (G) / Q-015 해소)** nexacro `gv_AppWorkFrameSet` / `gds_btn_list` 권한 분기 → PortalShell + RBAC React Context 통합 | (xfdl 초기화) | T-15 |
| T-14 | Spring Security BCrypt 라이브러리 → Spring Boot 4 / Spring Security 7 호환 (T-010) | RegCommUserMng / PasswordInit / ReRegCommUserMng | - |
| T-15 | **(정책 #3 (F) / Q-012 해소)** `CactusConstants.DEFAULT_PASSWORD` → **`CommUserMngPasswordProperties.getDefault()`** (yml prefix `commUserMng.password.*`, FQN `mcm.csa.commUserMng.config.CommUserMngPasswordProperties`). 기존 `mcm-core/security/password/McmPasswordProperties` 보존 | RegCommUserMng / PasswordInit / ReRegCommUserMng | T-011 |
