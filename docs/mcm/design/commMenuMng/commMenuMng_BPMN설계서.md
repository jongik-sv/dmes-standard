---
screenId: commMenuMng
asIsId: CommMenuMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 메뉴 관리 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commMenuMng` (= serviceId, As-Is bpmn process id = `sample1` — **As-Is 결함 / To-Be 정정**)
> - 프로세스 name: "메뉴 관리" (As-Is "사용자 ROLE 그룹 저장" — **As-Is 결함 / To-Be 정정**)
> - Bean명: `commMenuMngService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/commMenuMng/{action}`
> - BFF→BE: `POST /oasis/commMenuMng/{action}`
>
> **명명 룰**: MES 단일 룰 (4 식별자 1byte 동일 — mcm 모듈, APS 예외 미적용)
>
> **인용 정본**: 분석리포트 §6 (SQL ID) + §7 (Java — 부재 명시) + §8 (BPMN 전수). 자체 추가 ✗.
> **As-Is 1:1 보존**: BPMN node id (Task_00oihyb / Task_0xxo78b 등 hash 형식), sequenceFlow id, modelerTemplate 인용 그대로 보존. 변환은 §6 "To-Be 식별자" 안에서만 제안.
>
> **개정 이력 (iter#6 / 2026-06-04~05 — 사용자 지시/결정)**:
> - C1 FULL_SEQ 자동부여 (저장 시 recomputeMenuFullSeq + 기동 시 DataInitializer SoT, 7자리 인코딩 모듈 i×1,000,000 / 그룹 부모BASE+j×10,000 / 화면 그룹BASE+100+k×10) — §1.1 / §2.3 / §2.8 / §5.3 / §5.7 / §5.8 / §6.4 반영
> - C3 saveCmMenu PARENT_MENU_ID 자기참조 폐기 → FE 그룹 폴더 PARENT_MENU_ID 보존 (R3 트리 정합) — §2.3 / §5.3 반영
> - C4 MENU_SEQ 숫자 입력 + 저장 시 '0' LPAD 8자리 (lpad8) — §2.3 / §2.8 / §5.3 / §5.8 반영
> - C5 TB_MCM_SEC_MENU PK = MENU_ID 단독 (복합 PK 폐기, 신규 MENU_ID 중복 시 오류) — §2.3 / §5.3 반영
> - C7 오류 팝업 z-index 10001 (팝업 위 표시) — §2.3 / §2.8 / §4.2 참조
> - **메뉴 필드 관리 팝업 신설** (searchCmMenuFld / saveCmMenuFld 2 action, TB_MCM_SEC_MENU_FLD batch CRUD) — §1.1 (API-007/008) / §2.7 / §2.8 / §3 / §5.7 / §5.8 / §6 반영
> - C2 FULL_SEQ read-only (상세 D-009 + 메뉴 필드 관리 그리드 editable:false) 는 디자인설계서/기능설계서 정본 — 본 BPMN설계서는 응답 컬럼 동봉으로만 반영 / C6 MENU_SEQ 8자리 일괄 정규화는 DataInitializer 기동 작업 (본 문서 §2.3 saveCmMenu lpad8 정합)

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE — As-Is 보존 (`MCMAPUSER.TB_MCM_SEC_*` — 사용자 결정)
> - audit 컬럼: cactus-core `CactusAuditEntity` 9 컬럼 자동 (`C_*` / `U_*` / `VER`) — JPA `@PrePersist` / `@PreUpdate`
> - API JSON 필드: camelCase (`edt_MENU_ID` / `edt_MENU_NM` / `cbo_USE_TP` / ~~`cbo_bizSystemCode`~~ (To-Be 폐기 — cross-cutting 정책 #1) / `p_MENU_ID` / `OBJECT_ID` 등 As-Is 파라미터 보존)
> - Java 패키지: (As-Is Java UserTask 부재 — ScriptTask 만). Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / 신규 Service·DTO 필요 시 `com.dongkuk.dmes.mcm.csa.commMenuMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1)
> - DB ↔ DTO 매핑은 API 계층에서

### 1.1 API 엔드포인트 총괄 (분석 §8.3 채택 결과 인용)

| API-ID | Method | URL | 설명 | action (분기 enum) | 트리거 (B-NNN) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/commMenuMng/searchCmMenu` | 메뉴 리스트 조회 + (case break 누락으로 인한 fall-through) 메뉴 폴더 트리 콜백 가공 | searchCmMenu | B-001 (btn_search) / GT-001 트리 click |
| API-002 | POST | `POST /oasis/commMenuMng/searchMenuGrp` | 메뉴 폴더 트리 단독 조회 | searchMenuGrp | fn_formAfterOnload (xfdl:429) |
| API-003 | POST | `POST /oasis/commMenuMng/saveCmMenu` | 메뉴 일괄 저장 (insert/update/delete 분기 자동) | saveCmMenu | B-003 (btn_save) → confirm 후 fn_MsgSaveCallBack |
| API-004 | POST | `POST /oasis/commMenuMng/searchObj` | 선택 메뉴의 OBJECT 정보 조회 | searchObj | fn_callBack("searchCmMenu") + G-NNN oncellclick |
| API-005 | POST | `POST /oasis/commMenuMng/commonList` | OBJECT 팝업 LoV 조회 | commonList | D-007 (commonDynamic.xfdl LoV 검색) |
| ~~API-006~~ | ~~POST~~ | ~~`POST /oasis/commMenuMng/lov`~~ | ~~BIZ SYSTEM CODE LoV 조회 (외부 CommObjMng mapper 참조)~~ | ~~lov~~ | ~~CommMenuMng_onload (xfdl:415 fn_lov)~~ — **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 도메인 + cross-namespace `CommObjMngMapper.selectAppHostId` 호출 동시 폐기) |
| API-007 | POST | `POST /oasis/commMenuMng/searchCmMenuFld` | **신규 (2026-06-04 / iter#6)** "메뉴 필드 관리" 팝업 — 메뉴 폴더 목록 조회 (TB_MCM_SEC_MENU_FLD) | searchCmMenuFld | 메뉴 필드 관리 팝업 open / 저장 후 재조회 |
| API-008 | POST | `POST /oasis/commMenuMng/saveCmMenuFld` | **신규 (2026-06-04 / iter#6)** "메뉴 필드 관리" 팝업 — 폴더 일괄 저장 (status 분기 inserted/updated/deleted) + 저장 후 FULL_SEQ recompute | saveCmMenuFld | 메뉴 필드 관리 팝업 btn_save |

> **As-Is 6 action / To-Be 5 action** (lov action 폐기 = cross-cutting 정책 #1 BIZ_SYSTEM_CODE 도메인 폐기 동기). To-Be 활성 = searchCmMenu / searchMenuGrp / saveCmMenu / searchObj / commonList.
> **추가 (2026-06-04 / iter#6 — 사용자 지시 "메뉴 필드 관리" 팝업 신설)**: searchCmMenuFld / saveCmMenuFld 2 action 추가 → **To-Be 활성 7 action** (코드: `CommMenuMngService.searchCmMenuFld` / `saveCmMenuFld` + BPMN flow_searchCmMenuFld / flow_saveCmMenuFld). TB_MCM_SEC_MENU_FLD (모듈/그룹 폴더) batch CRUD 전용 — FULL_SEQ read-only 컬럼 동봉(C2).

### 1.2 API 패턴 자동 판정 결과 (C1~C6)

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | mui 의 As-Is 는 SP 가 아니라 Mapper.xml inline SQL. ExclusiveGateway 의 6 분기는 SP case 분기가 아닌 BPMN flow 분기 — C1 정의에 부적합 | - |
| C2. LoV master 호출 컬럼 5종 이상 | N | As-Is: LV-001 (ds_cboUseYn) + LV-002 (ds_menuViewYn) + LV-003 (cbo_menu_tp 내부) + ~~LV-004 (lov SUBSYSTEM, To-Be 폐기)~~ + LV-005 (selectMenuFldList) + LV-006 (commonList) + LV-007 (selectMenuObj) = 7 LoV → **To-Be 6 LoV** (LV-004 폐기). **C2 여전히 충족** (>=5) | C2 충족 |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 모든 LoV 가 시스템 공통 (회사/공장 의존 ✗) | - |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 그리드 컬럼 구성 고정 (As-Is 보존). commonDynamic.xfdl 의 동적 LoV 는 단일 컬럼 (OBJECT_ID) 의 응답이므로 컬럼 동적 ✗ | - |
| C5. 독립 query 분리가 적합함 | N | 본 화면은 단순 CRUD + 트리 + 부속 조회 (OBJECT / LoV). 독립 분리 부적합 (BPMN 의 6 action 분기가 자연스러움) | - |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N | As-Is: 외부 SP 호출 ✗ — 본 화면 SQL 모두 자체 Mapper namespace (`CommMenuMngMapper`) + 1 개 외부 mapper 참조 (`CommObjMngMapper.selectAppHostId` — bpmn:119, Task_1z04i9v). **To-Be**: cross-namespace 참조 0 (Task_1z04i9v 자체 폐기 — cross-cutting 정책 #1) | - |

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | **1 / 6** (C2 만 Y) |
| 채택 패턴 | **OASIS 단일 BPMN (자동)** (충족 0~1 룰) |
| API 라우팅 | `POST /oasis/{serviceId}/{action}` |
| 확인필요 등재 여부 | N (충족 1 — 잠정 OASIS 룰 미적용) |

> As-Is BPMN 자체가 단일 ExclusiveGateway 의 6 action 분기 형태 — OASIS 단일 BPMN 패턴 그대로 To-Be 채택.

---

## 2. 프로세스별 BPMN 상세

> 본 §2 는 분석리포트 §8 (BPMN 전수) 의 모든 task / sequenceFlow 를 action 별로 흐름 ASCII 로 표현. As-Is BPMN id (Task_xxx / SequenceFlow_xxx) 모두 보존.

### 2.1 searchCmMenu (B-001 / GT-001 → API-001) — 메뉴 리스트 조회

```
[btn_search 클릭] 또는 [GT-001 트리 노드 click] (xfdl:461, 770)
    │
    ├─ edt_MENU_ID         ← div_search.edt_MENU_ID.value
    ├─ p_MENU_ID           ← GT-001 트리 노드 MENU_ID (트리 click 시만)
    ├─ edt_MENU_NM         ← div_search.edt_MENU_NM.value
    └─ cbo_USE_TP          ← div_search.cbo_USE_TP.value
    │  (~~cbo_bizSystemCode~~ 폐기 — cross-cutting 정책 #1)
    │  (gfn_scanOpenerComponent(div_search.form) 자동 스캔 — fn_search 의 경우)
    │
    ▼
POST /oasis/commMenuMng/searchCmMenu   (UI→BFF)  →  /oasis/commMenuMng/searchCmMenu   (BFF→BE)
    │
    ▼  StartEvent_1 (bpmn:4)
    │
    ▼  ExclusiveGateway_1 (bpmn:14)
    │
    │  SequenceFlow_0tt1mbk name="searchCmMenu"  (bpmn:42)
    │
    ▼  Task_00oihyb "메뉴 관리 조회"  (bpmn:27)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectCommMenuMng, resultKey=ds_menuList
    │
    │  SequenceFlow_105vwsz (bpmn:41)  — **chain**
    │
    ▼  Task_0xxo78b "메뉴 Fold 조회"  (bpmn:60)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectMenuFldList, resultKey=ds_menuTreeList
    │
    │  SequenceFlow_1tgyodp (bpmn:76)
    │
    ▼  EndEvent_1 (bpmn:7)
    │
    ▼  callback (fn_callBack("searchCmMenu"), xfdl:525~586)
        ├─ fv_sRow 복원 (xfdl:528)
        ├─ bottom status: "{N}건 조회 되었습니다."  (M-007)
        ├─ rowcount > 0 시:
        │   ├─ Detail enable (gfn_setEnable("div_detail","true"))
        │   ├─ cbo_menu_grp 자동 선택 (첫 char 매칭 루프 — xfdl:543~553)
        │   ├─ cbo_menu_id 자동 선택 (MENU_SEQ substr 매칭 루프 with pad — 메뉴 depth 추가 개선, xfdl:559~566)
        │   ├─ div_object_id.fn_set_value / fn_set_nm (xfdl:569~570)
        │   └─ fn_searchObj(OBJECT_ID) 호출 (xfdl:574)
        ├─ rowcount = 0 시: Detail 비활성
        └─ **case break 누락 결함** → searchMenuGrp 분기로 fall-through 진입 (xfdl:587 — ds_menuGrp/ds_menuGrpSub 재가공)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_menuList=ds_menuList ds_menuTreeList=ds_menuTreeList` (fn_search) 또는 `ds_menuList=ds_menuList` (트리 click) |
| 파라미터 (sArgument) | **As-Is**: `edt_MENU_ID` + `edt_MENU_NM` + `cbo_USE_TP` + `cbo_bizSystemCode` (fn_search). **To-Be**: `edt_MENU_ID` + `edt_MENU_NM` + `cbo_USE_TP` (cbo_bizSystemCode 폐기) / `p_MENU_ID` (트리 click) |
| BPMN node | StartEvent_1 → ExclusiveGateway_1 → Task_00oihyb → Task_0xxo78b → EndEvent_1 |
| 호출 SQL (순서대로) | selectCommMenuMng (xml:7) → selectMenuFldList (xml:125) |

### 2.2 searchMenuGrp (fn_formAfterOnload → API-002) — 메뉴 폴더 트리 단독 조회

```
[fn_formAfterOnload]  (xfdl:429 — 화면 로드 후 공통함수 적용 후 자동 호출)
    │
    │  ~~cbo_bizSystemCode~~ ← (As-Is 빈 sArgument 였고, To-Be cross-cutting 정책 #1 로 파라미터 자체 폐기)
    │
    ▼
POST /oasis/commMenuMng/searchMenuGrp
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_11y43nf name="searchMenuGrp"  (bpmn:75)
    │
    ▼  Task_0xxo78b "메뉴 Fold 조회"  (bpmn:60)
    │  class=CommonSelectTask, sqlKey=selectMenuFldList, resultKey=ds_menuTreeList
    │
    │  SequenceFlow_1tgyodp (bpmn:76)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("searchMenuGrp"), xfdl:589~613)
        ├─ ds_menuGrp.clearData()
        ├─ ds_menuGrpSub.clearData()
        ├─ for i=0..ds_menuTreeList.rowcount:
        │   ├─ LEV=0 → ds_menuGrp.addRow + (MENU_SEQ / MENU_GRP="{MENU_ID} ({MENU_NM})" / PARENT_MENU_GRP=PARENT_MENU_ID)
        │   └─ LEV>0 → ds_menuGrpSub.addRow + 동일 (xfdl:594~609)
        └─ gfn_setFirstRow(ds_menuGrp, "", "", "MENU_SEQ", "MENU_GRP")  (xfdl:612)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_menuTreeList=ds_menuTreeList` |
| 파라미터 (sArgument) | (없음 — As-Is 빈 sArgument, xfdl:432) |
| BPMN node | StartEvent_1 → ExclusiveGateway_1 → Task_0xxo78b → EndEvent_1 |
| 호출 SQL | selectMenuFldList (xml:125) |

### 2.3 saveCmMenu (B-003 → API-003) — 메뉴 일괄 저장

```
[B-003 btn_save 클릭]  (xfdl:476 → 479 confirm "저장하시겠습니까?")
    │
    ▼  fn_before_save_chk (V-001 / V-002, 기능 §6.1)
    │  ├─ gfn_isDatasetChanged(ds_menuList) false → "저장할 데이터가 없습니다." + return
    │  └─ gfn_cpRequired(this, "MENU_ID MENU_SEQ MENU_NM OBJECT_ID") → 4 필수 컬럼 검증
    │
    ▼  confirm 응답 = 확인  → fn_MsgSaveCallBack (xfdl:644)
    │
    ▼  date millisecond cut (V-004, xfdl:649~659)
    │  for i=0..rowcount: rowType≠1 행에 대해
    │  START_ACTIVE_DATE.toString().length > 8 → substring(0,8)
    │  END_ACTIVE_DATE.toString().length > 8 → substring(0,8)
    │
    ├─ ds_menuList (변경 행만 :U)
    │
    ▼  fv_sRow = ds_menuList.rowposition  저장 (xfdl:662 — 재조회 후 복원)
    │
    ▼
POST /oasis/commMenuMng/saveCmMenu
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0grwghu name="saveCmMenu"  (bpmn:93)
    │
    ▼  Task_1dh8dal "메뉴 관리 저장"  (bpmn:43)
    │  class=CommonMultiSaveTask, paramKey=ds_menuList, resultKey=ds_menuList,
    │  insertSqlKey=#{serviceId}Mapper.insertCommMenuMng,
    │  updateSqlKey=#{serviceId}Mapper.updateCommMenuMng,
    │  deleteSqlKey=#{serviceId}Mapper.deleteCommMenuMng,
    │  nextBranchSpel=""
    │
    │  CommonMultiSaveTask 내부 동작 (As-Is 보존):
    │  ├─ for each row in ds_menuList:
    │  │   ├─ rowType=2 (신규) → insertCommMenuMng (xml:46~83)
    │  │   │   ├─ INSERT INTO TB_MCM_SEC_MENU (15 컬럼 + ref_Audit.insert_item + insert_value)
    │  │   │   ├─ ~~PARENT_MENU_ID = #{MENU_ID}~~  (xml:77 — 본 행의 MENU_ID 자기참조, As-Is)
    │  │   │   │   → **To-Be 정정 (C3, 2026-06-05 / iter#6)**: FE 전송 그룹 폴더 PARENT_MENU_ID 보존 (blank 시만 self fallback)
    │  │   ├─ rowType=4 (수정) → updateCommMenuMng (xml:85~103)
    │  │   │   ├─ UPDATE TB_MCM_SEC_MENU SET 13 컬럼 + ref_Audit.update
    │  │   │   ├─ ~~PARENT_MENU_ID = #{MENU_ID}~~  (xml:96 — 동일 자기참조) → **To-Be 정정 (C3): FE PARENT_MENU_ID 보존**
    │  │   │   └─ WHERE MENU_ID = #{MENU_ID} ~~AND MENU_SEQ = #{MENU_SEQ}~~  (PK ~~복합~~ → **To-Be C5: MENU_ID 단독**)
    │  │   └─ rowType=1 (삭제) → deleteCommMenuMng (xml:105~109)
    │  │       └─ DELETE WHERE MENU_ID = #{MENU_ID}  (To-Be C5: PK MENU_ID 단독 → existsById/deleteById)
    │  └─ context.put("cnt", cnt)
    │
    │  ▼ **To-Be 추가 단계 (2026-06-05 / iter#6 — Service for-loop 명시 분기로 재구현, 흐름 동일):**
    │  ├─ ① **PK = MENU_ID 단독 (C5)**: 복합 PK (MENU_ID, MENU_SEQ) → MENU_ID 단독.
    │  │     MENU_SEQ 는 PK 에서 분리되어 순수 "메뉴 순서" 컬럼. 신규(inserted)인데 MENU_ID 가 이미
    │  │     존재 시 IllegalState_("MENU_ID='..' 는 이미 존재합니다 (중복 등록 불가).") → 다른 화면 무단 덮어쓰기 차단.
    │  ├─ ② **PARENT_MENU_ID 정합 정정 (C3)**: As-Is 자기참조(=#{MENU_ID}) 폐기 → FE 가 보낸 그룹 폴더
    │  │     PARENT_MENU_ID (트리 노드 / OBJECT LoV 선택값) 보존. blank 인 비정상 입력만 self fallback.
    │  │     (사유: R3 트리 재설계 — 폴더=TB_MCM_SEC_MENU_FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID — 와
    │  │      자기참조가 모순. 화면이 그룹에서 분리되고 FULL_SEQ 그룹BASE 산출 불가하던 결함 정정.)
    │  ├─ ③ **MENU_SEQ '0' LPAD 8자리 (C4)**: insert/update 모두 entity.setMenuSeq(lpad8(MENU_SEQ))
    │  │     ("12" → "00000012"). C5(PK 단독화) 이후 SEC_MENU insert/update 모두 LPAD 적용
    │  │     (이전 "신규만 LPAD" 제약 해소).
    │  └─ ④ **FULL_SEQ 자동부여 (C1)**: CRUD 직후·재조회 직전 secMenuNativeRepository.recomputeMenuFullSeq()
    │        호출 → 메뉴 트리 전체 FULL_SEQ 7자리 인코딩 멱등 재계산 (모듈 i×1,000,000 / 그룹 부모BASE+j×10,000 /
    │        화면 그룹BASE+100+k×10). 사용자는 FULL_SEQ 직접 입력 ✗ (자동 부여 / 상세 D-009 read-only).
    │
    │  SequenceFlow_1vkp3qd (bpmn:92)  (To-Be bpmn: flow_saveCmMenu_end → endSaveCmMenu)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("saveCmMenu"), xfdl:616~633)
        ├─ bottom status: "{cnt}건 조회 되었습니다."  (M-008, As-Is 문구 보존 — "저장" 이 아닌 "조회")
        ├─ gfn_message("","","저장되었습니다.","info","확인", fn_msgSuccessSave)
        │   └─ fn_msgSuccessSave 콜백 → rtn=true 시 fn_search() 재호출 (재조회 → fv_sRow 복원)
        │       (To-Be: Service 가 cnt_merge 와 함께 recompute 직후의 ds_menuList 재조회 결과를 동봉 반환 → 최신 FULL_SEQ 즉시 반영)
        └─ 에러 시: bottom status (strErrorMsg) + gfn_message("저장 실패 하였습니다.","info")
            (To-Be C7: 오류 팝업 .error-modal-overlay z-index 50→10001 — 메뉴 필드 관리 등 모든 팝업 위에 표시)
```

| 입력 (sInDatasets) | `ds_menuList=ds_menuList:U` (변경 행만 전송) |
|---|---|
| 출력 (sOutDatasets) | ~~(없음)~~ → **To-Be (2026-06-05 / iter#6)**: `cnt_merge` (성공 행 수) + `ds_menuList` (recompute 직후 재조회 결과 — 최신 FULL_SEQ 동봉) |
| 파라미터 (sArgument) | (없음 — As-Is 빈 sArgument, xfdl:672) |
| BPMN node | Start → Gateway → Task_1dh8dal (CommonMultiSaveTask) → End (To-Be id: saveCmMenuTask) |
| 호출 SQL (분기) | insertCommMenuMng / updateCommMenuMng / deleteCommMenuMng (rowType 자동 분기). To-Be: JPA save()/deleteById (PK MENU_ID 단독) + recomputeMenuFullSeq() native UPDATE |

### 2.4 searchObj (oncellclick → API-004) — 선택 메뉴 OBJECT 조회

```
[fn_callBack("searchCmMenu") 내부 호출 (xfdl:574)]
또는 [G-NNN grd_M0F0 oncellclick (xfdl:889)]
    │
    ├─ OBJECT_ID  ← ds_menuList.getColumn(rowposition, "OBJECT_ID")
    │
    ▼
POST /oasis/commMenuMng/searchObj
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_043mfni name="searchObj"  (bpmn:91)
    │
    ▼  Task_0ert1qi "OBJECT 정보 조회"  (bpmn:77)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectMenuObj, resultKey=ds_objMng
    │
    │  SequenceFlow_0iw2wut (bpmn:94)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack — 4 분기 case 가 없음, default 처리로 추정)
        ├─ ds_objMng = ds_objMng (out alias 동일)
        └─ GO-NNN 그리드 자동 갱신
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_objMng=ds_objMng` |
| 파라미터 (sArgument) | `OBJECT_ID=` + vObjId |
| BPMN node | Start → Gateway → Task_0ert1qi → End |
| 호출 SQL | selectMenuObj (xml:142) |

### 2.5 commonList (D-007 LoV → API-005) — OBJECT 팝업 LoV 조회

```
[D-007 div_object_id 검색창 click — commonDynamic.xfdl 내부 trigger]
    │
    ├─ edt_OBJECT_ID  ← (commonDynamic.xfdl 의 검색창 입력값)
    │
    ▼
POST /oasis/commMenuMng/commonList
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_1s6r4vs name="commonList"  (bpmn:109)
    │
    ▼  Task_0qsfdkd "OBJECT 팝업 조회"  (bpmn:95)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectMenuObjPop, resultKey=ds_menuObjLst
    │
    │  SequenceFlow_18uvv6q (bpmn:110)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("commonList"), xfdl:636~640)
        ├─ trace("nErrorCode.OBJECT_ID >>> " + nErrorCode.OBJECT_ID)
        ├─ ds_menuList.setColumn(rowposition, "OBJECT_ID", nErrorCode.OBJECT_ID)  (xfdl:638)
        └─ (주석된 ds_menuList.setColumn(rowposition, "OBJECT_NM", ...) 잔존, xfdl:639)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_menuObjLst=ds_menuObjLst` (commonDynamic.xfdl 내부 표시용) |
| 파라미터 (sArgument) | `edt_OBJECT_ID` |
| BPMN node | Start → Gateway → Task_0qsfdkd → End |
| 호출 SQL | selectMenuObjPop (xml:156) |

### ~~2.6 lov (CommMenuMng_onload → API-006) — BIZ SYSTEM CODE LoV 조회~~ — **To-Be 폐기 (cross-cutting 정책 #1)**

> **As-Is 보존 (참고용)** 아래 흐름은 As-Is 1:1 인용. **To-Be**: lov action / Task_1z04i9v / SequenceFlow_0ug4lxk / SequenceFlow_1azff5q / fn_lov 메서드 / xfdl:415 onload 호출 / cross-namespace `CommObjMngMapper.selectAppHostId` 참조 모두 제거.

```
~~[CommMenuMng_onload 의 fn_lov() 호출]  (xfdl:415)  — To-Be 호출 자체 제거
    │
    ▼
POST /oasis/commMenuMng/lov  — To-Be 엔드포인트 폐기
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0ug4lxk name="lov"  (bpmn:125) — To-Be 제거
    │
    ▼  Task_1z04i9v "lov_SUBSYSTEM 조회"  (bpmn:111) — To-Be 제거
    │  class=CommonSelectTask, sqlKey=CommObjMngMapper.selectAppHostId, resultKey=ds_selectAppHostId
    │  **외부 mapper 참조 — As-Is 결함, To-Be 노드 제거로 자동 해소**
    │
    │  SequenceFlow_1azff5q (bpmn:126) — To-Be 제거
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack — 4 분기 case 가 없음) — To-Be 제거
        └─ ds_lovSubSystem = ds_selectAppHostId (out alias) — To-Be 제거~~
```

| ~~입력 (sInDatasets)~~ | ~~(없음)~~ |
|---|---|
| ~~출력 (sOutDatasets)~~ | ~~`ds_lovSubSystem=ds_selectAppHostId`~~ |
| ~~파라미터 (sArgument)~~ | ~~(없음 — As-Is 빈 sArgument, xfdl:425)~~ |
| ~~BPMN node~~ | ~~Start → Gateway → Task_1z04i9v → End~~ |
| ~~호출 SQL~~ | ~~**CommObjMngMapper.selectAppHostId** (외부 mapper — 본 화면 mapper 에 정의 없음, bpmn:119)~~ |

> **To-Be 영향**: BPMN node 9→8 / sequenceFlow 13→11 / action 6→5. As-Is 결함 (cross-namespace 호출) 자동 해소.

### 2.7 searchCmMenuFld (메뉴 필드 관리 팝업 → API-007) — 메뉴 폴더 목록 조회 — **신규 (2026-06-04 / iter#6)**

> **As-Is 무관 (To-Be 신설)**: 사용자 지시 "메뉴 필드 관리" 팝업 (TB_MCM_SEC_MENU_FLD = 모듈/그룹 폴더 batch CRUD). As-Is xfdl 에는 없던 To-Be 신규 action — 코드 `CommMenuMngService.searchCmMenuFld()` + BPMN flow_searchCmMenuFld / searchCmMenuFldTask.

```
[메뉴 필드 관리 팝업 open] 또는 [saveCmMenuFld 저장 후 재조회]
    │
    ▼
POST /oasis/commMenuMng/searchCmMenuFld   (UI→BFF)  →  /oasis/commMenuMng/searchCmMenuFld   (BFF→BE)
    │
    ▼  start → actionGateway
    │
    │  flow_searchCmMenuFld name="searchCmMenuFld"  (bpmn:166)
    │
    ▼  searchCmMenuFldTask "메뉴 필드 목록 조회 (TB_MCM_SEC_MENU_FLD)"  (bpmn:167)
    │  camunda:class=commMenuMngService, method=searchCmMenuFld, output=result
    │  → secMenuNativeRepository.searchMenuFldList() (SELECT MENU_ID/MENU_SEQ/MENU_NM/PARENT_MENU_ID/FULL_SEQ)
    │    ORDER BY (FULL_SEQ null 말미), FULL_SEQ, MENU_SEQ, MENU_ID
    │
    │  flow_searchCmMenuFld_end (bpmn:177)
    │
    ▼  endSearchCmMenuFld
    │
    ▼  callback → ds_menuFldList 그리드 갱신 (FULL_SEQ 컬럼 read-only — C1/C2)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_menuFldList=ds_menuFldList` |
| 파라미터 (sArgument) | (없음 — 파라미터 0개) |
| BPMN node | start → actionGateway → searchCmMenuFldTask → endSearchCmMenuFld |
| 호출 SQL | searchMenuFldList (TB_MCM_SEC_MENU_FLD, FULL_SEQ 동봉) |

### 2.8 saveCmMenuFld (메뉴 필드 관리 팝업 btn_save → API-008) — 메뉴 폴더 일괄 저장 — **신규 (2026-06-04 / iter#6)**

> **As-Is 무관 (To-Be 신설)**: 코드 `CommMenuMngService.saveCmMenuFld(List)` + BPMN flow_saveCmMenuFld / saveCmMenuFldTask. grids.master.rows → method param `master` 자동 매핑 (가이드 §6-E-3).

```
[메뉴 필드 관리 팝업 btn_save 클릭]
    │
    ├─ grids.master.rows (변경 행만 — nativeeditor_status 포함)
    │
    ▼
POST /oasis/commMenuMng/saveCmMenuFld
    │
    ▼  start → actionGateway
    │
    │  flow_saveCmMenuFld name="saveCmMenuFld"  (bpmn:149)
    │
    ▼  saveCmMenuFldTask "메뉴 필드 일괄 저장 (status 분기) — TB_MCM_SEC_MENU_FLD"  (bpmn:150)
    │  camunda:class=commMenuMngService, method=saveCmMenuFld, output=result
    │
    │  Service for-loop status 분기:
    │  ├─ "inserted"/"I" → insertMenuFld (MENU_SEQ 필수 + MENU_NM 필수 검증 → INSERT, PK 충돌 시 IllegalState)
    │  │     · **MENU_SEQ '0' LPAD 8자리 (C4)** — lpad8(MENU_SEQ). FLD 는 PK=MENU_ID 라 안전.
    │  ├─ "updated"/"U" → updateMenuFld WHERE MENU_ID=#{}  (MENU_SEQ LPAD8 동일 적용)
    │  ├─ "deleted"/"D" → deleteMenuFld WHERE MENU_ID=#{}  (자식 폴더 존재 시 IllegalState 거부)
    │  └─ 그 외 → skip
    │
    │  ▼ **FULL_SEQ 자동부여 (C1)**: CRUD 직후·재조회 직전 recomputeMenuFullSeq() 호출
    │     → 폴더(모듈 i×1,000,000 / 그룹 부모BASE+j×10,000) + 화면(그룹BASE+100+k×10) 동시 정합.
    │
    │  flow_saveCmMenuFld_end (bpmn:160)
    │
    ▼  endSaveCmMenuFld
    │
    ▼  callback → cnt_insert/cnt_update/cnt_delete + ds_menuFldList (재조회 — FULL_SEQ 동봉) 그리드 갱신
        (오류 시 C7: .error-modal-overlay z-index 10001 — 팝업 위에 표시)
```

| 입력 (sInDatasets) | `grids.master.rows` (변경 행만 — nativeeditor_status 포함) |
|---|---|
| 출력 (sOutDatasets) | `cnt_insert` / `cnt_update` / `cnt_delete` + `ds_menuFldList` (recompute 직후 재조회) |
| 파라미터 (sArgument) | (master — grids.master.rows 자동 매핑) |
| BPMN node | start → actionGateway → saveCmMenuFldTask → endSaveCmMenuFld |
| 호출 SQL (분기) | insertMenuFld / updateMenuFld / deleteMenuFld (status 자동 분기) + recomputeMenuFullSeq() native UPDATE |

> **To-Be 영향 (2026-06-04 / iter#6 메뉴 필드 관리 팝업 신설)**: To-Be 활성 action 5→7 (searchCmMenuFld / saveCmMenuFld 추가) / BPMN serviceTask 5→7 / sequenceFlow 분기 5→7. TB_MCM_SEC_MENU_FLD 의 FULL_SEQ 컬럼(NUMERIC(10,0)) 사용 — searchMenuFldList / searchMenuFld 가 SELECT 동봉 (C1).

---

## 3. UserTask Java 클래스 상세

### 3.1 본 화면의 Java UserTask 부재

본 화면은 **Java UserTask 가 존재하지 않는다** (분석 §7 인용). Java 폴더 `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/` 내에 `CommMenuMng/` 서브폴더가 없으며 (`CommChainMasterMng` / `CommSyncMng` / `CommUserMng` / `CommUserRoleCopy` 4 개만 존재), BPMN Task 노드 **As-Is 6 → To-Be 5** 모두 공통 DB Task (`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` 4 + `CommonMultiSaveTask` 1) 의 ScriptTask 패턴으로 처리된다.

> **To-Be 구현 정정 (2026-06-04~05 / iter#6)**: To-Be 는 위 공통 DB Task 대신 Spring bean `commMenuMngService` (`@Service("commMenuMngService")`) 의 method 호출 패턴으로 재구현됨 (W1 commObjMng 정본 — saveCmMenu 의 status 분기를 Service for-loop 명시 분기로). **메뉴 필드 관리 팝업 신설 (2026-06-04)** 로 To-Be serviceTask 5→7 (searchCmMenuFld / saveCmMenuFld 추가). 신규 2 action 도 UserTask 신설 ✗ — 동일 `commMenuMngService` method + `SecMenuNativeRepository` native query 로 처리.

### 3.2 BPMN Task ↔ 공통 Task 클래스 매핑

| BPMN node id | 종류 | camunda class | modelerTemplate |
|---|---|---|---|
| Task_00oihyb (메뉴 관리 조회) | CommonSelectTask | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | `com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` |
| Task_0xxo78b (메뉴 Fold 조회) | CommonSelectTask | (동일) | (동일) |
| Task_1dh8dal (메뉴 관리 저장) | CommonMultiSaveTask | `com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` | `com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` |
| Task_0ert1qi (OBJECT 정보 조회) | CommonSelectTask | (동일) | (동일 MapperBaseDbAccessTemplate) |
| Task_0qsfdkd (OBJECT 팝업 조회) | CommonSelectTask | (동일) | (동일) |
| ~~Task_1z04i9v (lov_SUBSYSTEM 조회)~~ | ~~CommonSelectTask~~ | ~~(동일)~~ | ~~(동일)~~ — **To-Be 폐기** (cross-cutting 정책 #1 — cross-namespace `CommObjMngMapper.selectAppHostId` 호출 노드 제거) |
| searchCmMenuFldTask (메뉴 필드 목록 조회) | serviceTask (method=searchCmMenuFld) | `commMenuMngService` | **신규 (2026-06-04 / iter#6)** — UserTask ✗ / native query (searchMenuFldList) |
| saveCmMenuFldTask (메뉴 필드 일괄 저장) | serviceTask (method=saveCmMenuFld) | `commMenuMngService` | **신규 (2026-06-04 / iter#6)** — UserTask ✗ / native batch CRUD + recomputeMenuFullSeq() |

### 3.3 To-Be 정책

| 항목 | 정책 |
|---|---|
| Java UserTask 신설 여부 | **신설 ✗** — 본 화면은 As-Is 공통 DB Task 패턴 유지. masterCodeMng 의 SaveTbMcmCodeMaster.java / SaveTbMcmCodeDetail.java 같은 UserTask 는 본 화면에 필요 없음 (CommonMultiSaveTask 가 rowType 분기 자동 처리) |
| 신규 Service 패키지 (만약 신설 시) | `com.dongkuk.dmes.mcm.csa.commMenuMng.service.*` (RULE.md §"패키지 명명 규칙" §3-1) |
| Entity / Repository 패키지 | `com.dongkuk.dmes.mcm.{entity,repository}.*` 모듈 단위 평탄 (cross-cutting 정책 #6 (A) — TbMcm prefix 제거 단축형). Entity = **SecMenu** / **SecObj** / **SecMenuFld**. Repository = **SecMenuRepository** / **SecObjRepository** / **SecMenuFldRepository** |
| Mapper namespace | `CommMenuMngMapper` → JPA Repository 흡수 시 위 SecMenu*Repository / SecObjRepository / SecMenuFldRepository (native query). Mapper.xml.asis 는 보존 |

---

## 4. 트랜잭션 경계 / 오류 처리

### 4.1 트랜잭션 모델

| 경계 | 범위 | 비고 |
|---|---|---|
| saveCmMenu (API-003) | for 루프 전체 + recomputeMenuFullSeq() (C1) = 단일 트랜잭션 (OASIS executor SpringTransactionHandler BPMN process 단위 wrap) | 한 행 실패 → 전체 rollback. **To-Be (2026-06-05 / iter#6)**: FULL_SEQ recompute 도 같은 트랜잭션 내 (CRUD 직후·재조회 직전) |
| saveCmMenuFld (API-008) | for 루프 batch CRUD + recomputeMenuFullSeq() = 단일 트랜잭션 | **신규 (2026-06-04 / iter#6)** 한 행 실패 → 전체 rollback (insertMenuFld PK 충돌 / deleteMenuFld 자식 존재 시 IllegalState) |
| searchCmMenu / searchMenuGrp / searchObj / commonList / searchCmMenuFld / lov | (조회 — 트랜잭션 외부 / Read-only) | searchCmMenuFld 추가 (2026-06-04 / iter#6) |

### 4.2 오류 응답

| 상황 | 응답 | 클라이언트 처리 |
|---|---|---|
| dao.update <= 0 (rowcount 0) | CommonMultiSaveTask 의 표준 오류 응답 | OASIS framework 의 표준 오류 응답 — `nErrorCode != 0` → callback else 분기 → `div_bottom.fn_commonBottomStatus_msg(strErrorMsg)` 표시 (xfdl:585, 631) + saveCmMenu 의 경우 `gfn_message("저장 실패 하였습니다.","info")` 추가 표시 |
| validation 실패 (xfdl 단계) | `gfn_message(...,"warning"/"information",...)` 모달 + return (서버 미호출) | - |
| 서버 200 + ds 갱신 | callback 정상 분기 → `div_bottom.fn_commonBottomStatus_msg("{N}건 ...되었습니다.")` | - |
| saveCmMenuFld 서버 오류 (PK 충돌 / 자식 폴더 존재 / MENU_SEQ·MENU_NM 필수 미충족) | IllegalState/IllegalArgument → FE 오류 모달 | **To-Be (C7, 2026-06-04 / iter#6)**: shared `page-layout.css` `.error-modal-overlay` z-index 50→10001 (일반 Modal 9999 / MessageModal 10000 위) → 메뉴 필드 관리 등 모든 팝업 위에 오류 팝업 표시 (이전엔 팝업 뒤로 깔려 팝업 닫아야 확인 가능하던 결함) |

### 4.3 동시성 / Optimistic Locking

| 항목 | As-Is | To-Be |
|---|---|---|
| UPDATED_AT / 동시 수정 검증 | As-Is 명시 ✗ (last-write-wins) | **To-Be**: cactus-core `CactusAuditEntity.VER` (@Version) 자동 적용 — JPA Optimistic Locking 활성화 (사용자 결정, masterCodeMng 와 동일 룰) |
| INSERT/UPDATE 의 race condition | As-Is 단순 (PK 충돌 시 SQLException) | To-Be JPA + @Version 으로 자동 감지 |

---

## 5. 트랜잭션 경계별 입출력 DTO 매핑

### 5.1 searchCmMenu (API-001)

| Request Body | 타입 | As-Is 컬럼 | 비고 |
|---|---|---|---|
| edt_MENU_ID | string | (검색 조건) | UPPER LIKE 부분 일치 (xml:29) |
| p_MENU_ID | string | (검색 조건) | 정확 일치 (xml:32) — 트리 click 시만 |
| edt_MENU_NM | string | (검색 조건) | LIKE 부분 일치 (xml:35) |
| cbo_USE_TP | string | (검색 조건) | 정확 일치 (xml:38) |
| ~~cbo_bizSystemCode~~ | ~~string~~ | ~~(검색 조건)~~ | ~~정확 일치 (xml:41, B.컬럼)~~ — **To-Be 폐기** (cross-cutting 정책 #1) |

| Response | 타입 | 비고 |
|---|---|---|
| ds_menuList → ds_menuList | **As-Is**: List<Map> 16 컬럼. **To-Be**: 15 컬럼 (BIZ_SYSTEM_CODE 제거 — cross-cutting 정책 #1). 잔존 = MENU_ID/MENU_SEQ/FULL_SEQ/MENU_NM/MENU_DESC/MENU_TP/OBJECT_ID/OBJECT_NM/USE_TP/START_ACTIVE_DATE/END_ACTIVE_DATE/MENU_VIEW_YN/PARENT_MENU_ID/MENU_PARAM1/MENU_PARAM2/MENU_PARAM3 | §9.1 분석리포트 인용 |
| ds_menuTreeList → ds_menuTreeList | List<Map> (5 컬럼 — LEV/MENU_ID/MENU_SEQ/MENU_NM/PARENT_MENU_ID) | fn_search 의 경우만 (트리 click 시 미포함) |

### 5.2 searchMenuGrp (API-002)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| (없음) | - | (As-Is 빈 sArgument) |

| Response | 타입 | 비고 |
|---|---|---|
| ds_menuTreeList → ds_menuTreeList | List<Map> (5 컬럼 동일) | - |

### 5.3 saveCmMenu (API-003)

| Request Body | 타입 | 비고 |
|---|---|---|
| ds_menuList (`:U` 변경 행만) | List<Map> (17 컬럼 — DS-001 ds_menuList 전수) | rowStatus(=`!nativeeditor_status`) 별 자동 분기 (inserted/updated/deleted) |
| · MENU_ID | string | **To-Be (C5, 2026-06-05 / iter#6)**: PK 단독 키. 신규(inserted) 인데 기존 존재 시 오류 (무단 덮어쓰기 차단) |
| · MENU_SEQ | string | **To-Be (C4)**: FE 숫자만 입력(maxLength 8) → 저장 시 BE lpad8() '0' LPAD 8자리 ("12"→"00000012"). PK 에서 분리된 순수 순서 컬럼 (C5) |
| · FULL_SEQ | (전송하나 미사용) | **To-Be (C1)**: 사용자 직접 입력 ✗ — 상세 D-009 read-only. 저장 후 recomputeMenuFullSeq() 가 자동 부여(덮어씀) |
| · PARENT_MENU_ID | string | **To-Be (C3)**: FE 가 보낸 그룹 폴더 PARENT_MENU_ID 보존 (As-Is 자기참조 폐기). blank 시만 self fallback |

| Response | 타입 | 비고 |
|---|---|---|
| ~~cnt~~ → cnt_merge | int | 성공 행 수. "{cnt}건 조회 되었습니다." 메시지 (M-008, As-Is 문구) |
| ds_menuList | List<Map> | **To-Be 추가 (2026-06-05 / iter#6)**: recompute 직후 재조회 결과 (As-Is fn_callBack saveCmMenu → fn_search 재호출 정합). FULL_SEQ 컬럼 = 자동 부여된 7자리 인코딩 값 / MENU_SEQ = 8자리 LPAD 값 |

### 5.4 searchObj (API-004)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| OBJECT_ID | string | = ds_menuList.OBJECT_ID 또는 G-NNN oncellclick 선택 값 |

| Response | 타입 | 비고 |
|---|---|---|
| ds_objMng → ds_objMng | **As-Is**: List<Map> 9 컬럼. **To-Be**: 8 컬럼 (BIZ_SYSTEM_CODE 제거 — cross-cutting 정책 #1). 잔존 = SYSTEM_CODE/OBJECT_TYPE/SERVICE/USE_TP/FORM_URL/PARAM/START_ACTIVE_DATE/END_ACTIVE_DATE | §9.2 |

### 5.5 commonList (API-005)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| edt_OBJECT_ID | string | commonDynamic.xfdl 검색창 입력값 |

| Response | 타입 | 비고 |
|---|---|---|
| ds_menuObjLst → ds_menuObjLst | List<Map> (5 컬럼 — OBJECT_ID/OBJECT_NM/SERVICE/FORM_URL/PARAM) | LV-006 |

### ~~5.6 lov (API-006)~~ — **To-Be 폐기 (cross-cutting 정책 #1)**

> As-Is 1:1 인용 (보존). To-Be: 본 트랜잭션 자체 폐기 — Request / Response / Task / SequenceFlow 모두 제거.

| ~~Request Body~~ | ~~타입~~ | ~~As-Is 컬럼~~ |
|---|---|---|
| ~~(없음)~~ | ~~-~~ | ~~(As-Is 빈 sArgument)~~ |

| ~~Response~~ | ~~타입~~ | ~~비고~~ |
|---|---|---|
| ~~ds_lovSubSystem → ds_selectAppHostId~~ | ~~List<Map> (APP_HOST_ID — 1 컬럼)~~ | ~~LV-004 / 외부 CommObjMng mapper 참조~~ |

### 5.7 searchCmMenuFld (API-007) — **신규 (2026-06-04 / iter#6)**

| Request Body | 타입 | 비고 |
|---|---|---|
| (없음) | - | 파라미터 0개 |

| Response | 타입 | 비고 |
|---|---|---|
| ds_menuFldList → ds_menuFldList | List<Map> (5 컬럼 — MENU_ID/MENU_SEQ/MENU_NM/PARENT_MENU_ID/FULL_SEQ) | TB_MCM_SEC_MENU_FLD. FULL_SEQ = 자동부여 7자리 인코딩 (C1) — 팝업 그리드 read-only 컬럼 (C2) |

### 5.8 saveCmMenuFld (API-008) — **신규 (2026-06-04 / iter#6)**

| Request Body | 타입 | 비고 |
|---|---|---|
| master (grids.master.rows) | List<Map> (nativeeditor_status + MENU_ID/MENU_SEQ/MENU_NM/PARENT_MENU_ID) | status 별 자동 분기 (inserted/updated/deleted) |
| · MENU_SEQ | string | **C4**: FE 숫자만 입력(maxLength 8) → BE lpad8() '0' LPAD 8자리. inserted/updated 시 필수 |
| · FULL_SEQ | (전송 ✗ — 응답 read-only) | **C1**: 사용자 입력 ✗. 저장 후 recomputeMenuFullSeq() 자동 부여 |

| Response | 타입 | 비고 |
|---|---|---|
| cnt_insert / cnt_update / cnt_delete | int | batch 결과 카운트 |
| ds_menuFldList | List<Map> (5 컬럼 동일) | recompute 직후 재조회 — FULL_SEQ 동봉 (저장 후 그리드 + 트리 동시 갱신) |

---

## 6. To-Be 식별자 (BPMN 기능 식별자 안)

> 정본 명명 (R-12): BPMN 기능 식별자 = `{screenId}_{기능명}` = `commMenuMng_{action}`. 본 §6 은 As-Is 의 hash id (Task_xxx) 와 1:1 매핑 안.

### 6.1 process / serviceId

| As-Is | To-Be |
|---|---|
| bpmn2:process id = `sample1` (오기재) | `commMenuMng` (= serviceId) |
| process name = "사용자 ROLE 그룹 저장" (오기재) | "메뉴 관리" |
| isExecutable = "false" | (동일 보존) |

### 6.2 action 분기 (sequenceFlow name)

| As-Is sequenceFlow id / name | To-Be 기능 식별자 |
|---|---|
| `SequenceFlow_0tt1mbk` / name="searchCmMenu" | `commMenuMng_searchCmMenu` |
| `SequenceFlow_11y43nf` / name="searchMenuGrp" | `commMenuMng_searchMenuGrp` |
| `SequenceFlow_0grwghu` / name="saveCmMenu" | `commMenuMng_saveCmMenu` |
| `SequenceFlow_043mfni` / name="searchObj" | `commMenuMng_searchObj` |
| `SequenceFlow_1s6r4vs` / name="commonList" | `commMenuMng_commonList` |
| ~~`SequenceFlow_0ug4lxk` / name="lov"~~ | ~~`commMenuMng_lov`~~ — **To-Be 폐기** (cross-cutting 정책 #1) |
| `flow_searchCmMenuFld` / name="searchCmMenuFld" | `commMenuMng_searchCmMenuFld` — **신규 (2026-06-04 / iter#6)** 메뉴 필드 관리 팝업 조회 |
| `flow_saveCmMenuFld` / name="saveCmMenuFld" | `commMenuMng_saveCmMenuFld` — **신규 (2026-06-04 / iter#6)** 메뉴 필드 관리 팝업 저장 |

### 6.3 Task id (As-Is 보존 권고)

| As-Is task id | name | To-Be 식별자 |
|---|---|---|
| `Task_00oihyb` | 메뉴 관리 조회 | (As-Is 보존 권고 — BPMN 내부 id) |
| `Task_0xxo78b` | 메뉴 Fold 조회 | (동일) |
| `Task_1dh8dal` | 메뉴 관리 저장 | (동일) |
| `Task_0ert1qi` | OBJECT 정보 조회 | (동일) |
| `Task_0qsfdkd` | OBJECT 팝업 조회 | (동일) |
| ~~`Task_1z04i9v`~~ | ~~lov_SUBSYSTEM 조회~~ | ~~(동일)~~ — **To-Be 폐기** (cross-cutting 정책 #1) |
| (As-Is 무관) | 메뉴 필드 목록 조회 | `searchCmMenuFldTask` — **신규 (2026-06-04 / iter#6)** |
| (As-Is 무관) | 메뉴 필드 일괄 저장 | `saveCmMenuFldTask` — **신규 (2026-06-04 / iter#6)** |

### 6.4 sqlKey (#{serviceId}Mapper)

| As-Is sqlKey | To-Be sqlKey (serviceId 치환) |
|---|---|
| `#{serviceId}Mapper.selectCommMenuMng` | `commMenuMngMapper.selectCommMenuMng` |
| `#{serviceId}Mapper.selectMenuFldList` | `commMenuMngMapper.selectMenuFldList` |
| `#{serviceId}Mapper.insertCommMenuMng` | `commMenuMngMapper.insertCommMenuMng` |
| `#{serviceId}Mapper.updateCommMenuMng` | `commMenuMngMapper.updateCommMenuMng` |
| `#{serviceId}Mapper.deleteCommMenuMng` | `commMenuMngMapper.deleteCommMenuMng` |
| `#{serviceId}Mapper.selectMenuObj` | `commMenuMngMapper.selectMenuObj` |
| `#{serviceId}Mapper.selectMenuObjPop` | `commMenuMngMapper.selectMenuObjPop` |
| ~~`CommObjMngMapper.selectAppHostId` (외부 — hardcoded, bpmn:119)~~ | **To-Be 폐기** (cross-cutting 정책 #1 — Task_1z04i9v 자체 제거로 cross-mapper 참조 결함 자동 해소. 본 화면 mapper / CommObjMng mapper 양쪽 모두 selectAppHostId 등록 ✗ — BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 자체 폐기) |
| `selectCommRoleGrpList` (xml 정의만, 호출 ✗) | **To-Be 제거** (As-Is 미호출) |
| (As-Is 무관 — 신규) | **신규 (2026-06-04 / iter#6) 메뉴 필드 관리**: `secMenuNativeRepository.searchMenuFldList` (SELECT) / `insertMenuFld` / `updateMenuFld` / `deleteMenuFld` (TB_MCM_SEC_MENU_FLD batch CRUD) |
| (As-Is 무관 — 신규) | **신규 (2026-06-04 / iter#6) FULL_SEQ 자동부여 (C1)**: `secMenuNativeRepository.recomputeMenuFullSeq` — saveCmMenu / saveCmMenuFld CRUD 직후·재조회 직전 호출 + DataInitializer 기동 시 호출(SoT). 7자리 인코딩 멱등 재계산 (모듈 i×1,000,000 / 그룹 부모BASE+j×10,000 / 화면 그룹BASE+100+k×10) |

### 6.5 UserTask class 패키지

| As-Is | To-Be (제안 — 사용자 결정 위임) |
|---|---|
| (Java UserTask 부재 — ScriptTask 만) | (As-Is 동일 보존 — UserTask 신설 ✗). 만약 신설 시 `com.dongkuk.dmes.mcm.csa.commMenuMng.service.*` (RULE.md §"패키지 명명 규칙" §3-1) |

---

## 7. As-Is 인용 정합

| 본 § | 인용 정본 | 검증 |
|---|---|---|
| §1.1 | 분석 §8.3 (action 6 분기 + 흐름) | 6 API + 6 action 일치 |
| §1.2 | 분석 §11 C1~C6 | C2 만 Y → 1/6 → OASIS 단일 채택 |
| §2.1 ~ §2.6 | 분석 §6 (SQL ID) + §7 (Java 부재) + §8 (BPMN 전수) | 모든 task id / sequenceFlow id / sqlKey cite 100% |
| §3 | 분석 §7 (Java 부재 명시) | UserTask 부재 + 공통 DB Task 6 종 매핑 1:1 |
| §4 | 분석 §7 + xfdl callback | 트랜잭션 경계 + 오류 처리 As-Is 보존 |
| §5 | 분석 §6 + xfdl gfn_transaction 인자 | sInDatasets / sOutDatasets / sArgument As-Is 1:1 |
| §6 | 분석 §8 + 정합체크서 §B 명명 규칙 | To-Be 명명 안 (제안) + As-Is 결함 (process id sample1 / name 오기재 / Task_1z04i9v 외부 mapper / selectCommRoleGrpList 미호출) 모두 명시 |

---

## §6.14 Phase 4 종료 4질문 자체 검증

1. **14항 위반?** ✗ 위반 없음. action 6 enum (searchCmMenu / searchMenuGrp / saveCmMenu / searchObj / commonList / lov) 일치 — 분석 §8.3 + BPMN bpmn:42/75/93/91/109/125 와 1:1 매핑. As-Is 결함 (process id `sample1` / name "사용자 ROLE 그룹 저장" / Task_1z04i9v 외부 mapper / selectCommRoleGrpList 미호출 / fn_callBack break 누락) 전수 등재.
2. **검증 안 한 부분?** §2.1~§2.6 6 action 각각의 BPMN 흐름 (StartEvent → ExclusiveGateway → Task → EndEvent) 모두 cite + xfdl callback 분기 모두 cite. §5 DTO 매핑 6 action × 입출력 + sArgument 모두 cite. §6 To-Be 명명 안 — process id / action / Task id / sqlKey 전수 매핑.
3. **그대로 수용?** As-Is 1:1 보존 — BPMN node id (hash 형식 Task_00oihyb 등) / sequenceFlow id 그대로 보존 + As-Is 결함 (process id sample1 / 외부 mapper 참조) 도 §6.1 / §6.4 에 그대로 cite + To-Be 정정 결정 별도 명시.
4. **임의 합리화?** ✗. 본 BPMN 설계서는 분석 §6 SQL ID 8 종 (활성 7 + 미사용 1) / §7 Java 부재 / §8 BPMN 노드 9 + sequenceFlow 13 + action 6 enum 전수를 1:1 인용. 표 헤더 / 행 수 모두 분석리포트와 동일.

→ ✓ Phase 4 검증 통과 → Phase 5 진입.
