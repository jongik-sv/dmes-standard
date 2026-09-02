---
screenId: commSyncMng
asIsId: CommSyncMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 동기화 관리 (CommSyncMng) 기능설계서

> 본 설계서는 [분석리포트](./commSyncMng_분석리포트.md) 의 §0.1.3 단일 원천 기반으로 작성되었다 (사용자 요구사항 9). 신규 항목 추가 ✗ — 분석리포트 발견 항목 1:1 반영.
> 환경 제약 §0 은 분석리포트 §0 그대로 적용.

---

## §0. 환경 제약

[분석리포트 §0](./commSyncMng_분석리포트.md#0-환경-제약) 인용 — Runner / R-14 manifest / R-13 SOP 30 Step 미적용 + 가이드 템플릿 절 구조만 참고.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면명 | 동기화 관리 |
| 화면 식별자 | commSyncMng |
| As-Is 식별자 | CommSyncMng |
| moduleId | mcm (공통관리) |
| moduleGroup | csa (시스템관리) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 동기화 관리 (commSyncMng) |
| 화면 분류 | 메타 동기화 화면 (단일 액션 — `reg`) |
| 화면 유형 | 단일 그리드 형 + 조회조건 (S 4) + 액션 버튼 (B 3) — 팝업 ✗ / 상세폼 ✗ / 라인 ✗ |

**화면 목적** (분석 §1 인용 — 패턴 1 enum):

> CommSyncMng 는 **공통(권한/마스터/업무기준) 동기화 프로그램** 으로, 6 처리유형 (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT) 별로 SOURCE 스키마의 데이터를 TARGET 스키마로 일괄 이관한다 (xfdl:73~74).

---

## §2. 조회조건 (S-NNN) 명세

> 분석 §3.2 인용 — 4 행 1:1.

| ID | 화면 표시명 | 컨트롤 | 입력 유형 | maxlength | 기본값 | 필수 | 검증 규칙 (To-Be) | 근거 |
|---|---|---|---|---|---|---|---|---|
| S-001 | 처리유형 (라벨) | `stc_bizSystemCode` (Static, edi_WFSA_Label) | 표시 전용 | - | "처리유형" 고정 | - | - | xfdl:17 |
| S-002 | 처리유형 (선택) | `cbo_SyncTarget` (Combo) | Combo (LoV — 6 값 정적) | - | 미선택 (index=-1) | Y | 분석 §4.5 단계 (3) `cbo_SyncTarget` null 시 "처리유형을 선택하세요." warning + return | xfdl:18 |
| S-003 | 처리대상 (라벨) | `sts_roleId` (Static, edi_WFSA_Label) | 표시 전용 | - | "처리대상" 고정 | - | - | xfdl:19 |
| S-004 | 처리대상 (입력) | `edt_Target` (Edit, font 14pt) | TextBox | 200 | "AA_TEST" | Y (OBJECT 분기 검증) | 분석 §4.5 단계 (1) — `cbo_SyncTarget="OBJECT"` 시 값에 "::" 미포함이면 "OBJECT FULLNAME을 입력해주세요. \n ex)csa::CommSyncMng" error 차단 (xfdl:126~129). 추가 (To-Be 권장) — §11.4 SQL Injection 대응 화이트리스트 `[A-Z0-9_]+(::[A-Z0-9_]+)?` 정규식 검증 | xfdl:20 / 126~129 |

> S-NNN 합계 = 4 ✓ (분석 §13 = 4)

---

## §3. 그리드 컬럼 (G-NNN) 명세

> 분석 §3.3 인용 — 9 행 1:1. head band 1 + body band 1 (head 셀 3개 col 0 + col 1 colspan=4 + col 5 colspan=4).

### §3.1 grd_main 컬럼 9 종 (head + body)

| ID | head text | body bind | size | edittype | editmaxlength | combo / displaytype / cssclass | 필수 | 근거 |
|---|---|---|---:|---|---:|---|---|---|
| G-001 | 선택 (head col=0) | `bind:CHK` | 20 | checkbox (displaytype=`checkboxcontrol`) | - | cssclass `expr:CHK == '1' ? cellBody_BgColor_red : ''` | (체크 전용) | xfdl:33/48/53 |
| G-002 | SOURCE (FROM) (head col=1 colspan=4) | `bind:from1` | 80 | (read-only) | - | cssclass `expr:CHK == '1' ? cellBody_BgColor_red,cellControl_fontSize_14 : cellControl_fontSize_14` | (read-only — 정적값) | xfdl:34/49/54 |
| G-003 | (col=2 colspan 흡수) | `bind:from2` | 80 | (read-only) | - | (G-002 동일) | (read-only) | xfdl:35/49/55 |
| G-004 | (col=3 colspan 흡수) | `bind:from3` | 80 | (read-only) | - | (동일) | (read-only) | xfdl:36/49/56 |
| G-005 | (col=4 colspan 흡수) | `bind:from4` | 80 | (read-only) | - | (동일) | (read-only) | xfdl:37/49/57 |
| G-006 | TARGET (TO) (head col=5 colspan=4) | `bind:to1` | 80 | (read-only) | - | (동일) | (read-only) | xfdl:38/50/58 |
| G-007 | (col=6 colspan 흡수) | `bind:to2` | 80 | (read-only) | - | (동일) | (read-only) | xfdl:39/50/59 |
| G-008 | (col=7 colspan 흡수) | `bind:to3` | 80 | (read-only) | - | (동일) | (read-only) | xfdl:40/50/60 |
| G-009 | (col=8 colspan 흡수) | `bind:to4` | 80 | (read-only) | - | (동일) | (read-only) | xfdl:41/50/61 |

- 그리드 옵션: `autofittype="col"`, `selecttype="multiarea"`, head Row size 30 + body Row size 24
- head 폰트: `normal 700 16px/normal "Malgun Gothic"` (Bold 16px)
- body cell 폰트: cssclass `cellControl_fontSize_14` (14px) + CHK==1 시 빨간 배경
- 이벤트: onheadclick / oncellclick / oncolumnchanged 등록 ✗ (xfdl:29~65 전수 검토 결과)
- 데이터: 정적 16 행 (분석 §3.7 DS-001 / xfdl:273~450)

> G-NNN 합계 = 9 ✓ (분석 §13 = 9)

### §3.2 그리드 컬럼 자료형 표시 (As-Is 보존)

| ID | 컬럼 | 자료형 | 표시 형식 |
|---|---|---|---|
| G-001 | CHK | STRING(256) | "1" / "0" (체크박스) |
| G-002 | from1 | STRING(256) | 텍스트 (예: "가동계") |
| G-003 | from2 | STRING(256) | 텍스트 (예: "원장") |
| G-004 | from3 | STRING(256) | 텍스트 (예: "MEPP_MCM" — DB Link 명) |
| G-005 | from4 | STRING(256) | 텍스트 (예: "MCM_SOURCE" — 스키마명) |
| G-006 | to1 | STRING(256) | 텍스트 (예: "가동계") |
| G-007 | to2 | STRING(256) | 텍스트 (예: "가동") |
| G-008 | to3 | STRING(256) | 텍스트 (예: "MEPP_MCM") |
| G-009 | to4 | STRING(256) | 텍스트 (예: "MCMAPUSER") |

---

## §4. 상세 입력 필드 (D-NNN)

해당 없음 — 분석 §3.5 동치.

---

## §5. 버튼·액션 (B-NNN / GB-NNN) 명세

> 분석 §4.1 + §4.2 인용 — B 3 / GB 0.

### §5.1 B-NNN 전수

| ID | 위치 | 버튼명 | xfdl id | 핸들러 | 동작 | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_topMenu (사용자정의) | **이행** (cssclass Point+Confirm) | `btn_sync` | `fn_sync` (xfdl:121~168) | 분석 §4.5 단계 (1)~(6) — OBJECT "::" 검증 → confirm → 처리대상 split → ds_main CHK==1 rowtype INSERT → gfn_transaction reg | reg | xfdl:101~104 / 121~168 |
| B-002 | div_topMenu (기본) | **닫기** | `btn_close` | `fn_close` (xfdl:249~253) | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` | - (공통) | xfdl:103 / 249~253 |
| B-003 | div_main 상단 (접기 토글) | (text 없음) | `btn_fold` | `btn_fold_onclick` (xfdl:255~258) | `gfn_fold(this, div_search, div_main, btn_fold)` 접기 토글 | - (클라이언트 전용) | xfdl:24 / 255~258 |

> B-NNN 합계 = 3 ✓ (분석 §13 = 3). 단일 액션 `reg` 만 사용.

### §5.2 GB-NNN

해당 없음 — 분석 §4.2 동치.

### §5.3 B-001 fn_sync 실행 시퀀스 (분석 §4.5 인용 — 1:1)

| 단계 | 트리거 / 조건 | 로직 | 호출 BPMN action | 호출 SQL ID | 근거 |
|---:|---|---|---|---|---|
| (1) 사전 검증 | cbo_SyncTarget=="OBJECT" + edt_Target.value 에 "::" 미포함 | "OBJECT FULLNAME을 입력해주세요. \n ex)csa::CommSyncMng" error 표시 + return | - | - | xfdl:126~129 |
| (2) confirm 메시지 | cbo_SyncTarget 값 있음 | "[{처리유형명}] 이행 하시겠습니까?" confirm 표시 | - | - | xfdl:164~167 |
| (3) 콜백 사전 검증 | confirm OK 시 | cbo_SyncTarget null 재검증 → null 이면 "처리유형을 선택하세요." warning + return | - | - | xfdl:134~137 |
| (4) ds_object 분해 | (3) 통과 | edt_Target.value 를 ',' split → ds_object 행마다 OBJECT 컬럼 세트 | - | - | xfdl:138~143 |
| (5) ds_main rowtype 분기 | (4) 후 | `ds_main.set_updatecontrol(false)` → CHK==1 행은 `setRowType(i, ROWTYPE_INSERT)` / 그 외 `setRowType(ROWTYPE_NORMAL)` → `set_updatecontrol(true)` | - | - | xfdl:152~157 |
| (6) gfn_transaction | (5) 후 | sSvcID="reg", sUrl="", sInDatasets="ds_object=ds_object ds_main=ds_main:U", sOutDatasets="", sArgument="pSyncTarget=cbo_SyncTarget.value", sCallbackFunc="fn_callBack" | reg | (UserTask) → SaveCommSyncMng.java → 6 처리유형 분기 → 12 SQL | xfdl:145~159 |
| (7) fn_callBack | gfn_transaction 응답 | strSvcId="reg" 분기: nErrorCode==0 이면 strErrorMsg["cnt_save"]==0 시 "데이터 이행 미처리" warning / 그 외 "{N}건 저장 되었습니다" + "데이터 이행 정상완료" info. error 시 status bar 에 strErrorMsg | reg 콜백 | - | xfdl:171~189 |

### §5.4 S-002 cbo_SyncTarget onitemchanged — 자동 행 선택

> 분석 §10.3 인용 — 처리유형별 targetid prefix 2글자 매칭. 트랜잭션 ✗ (클라이언트 전용).

| 처리유형 (cbo_SyncTarget.value) | 자동 CHK=1 대상 (ds_main 행) | 분기 코드 라인 | 근거 |
|---|---|---|---|
| MASTER | targetid prefix "MA" — MA1/MA2/MA3/MA4 4행 | xfdl:201 substring(0,2)=="MA" | xfdl:199~208 |
| RULE | targetid prefix "RA" — RA1/RA2/RA3/RA4 4행 | xfdl:211 | xfdl:209~218 |
| RULE_JUDGE | targetid prefix "RB" — RB1/RB2/RB3/RB4 4행 | xfdl:221 | xfdl:219~227 |
| INTERFACE | targetid prefix "NU" — NU1/NU2/NU3/NU4 4행 | xfdl:230 | xfdl:228~236 |
| FORMAT | targetid prefix "NU" — NU1/NU2/NU3/NU4 4행 | xfdl:230 (동일) | xfdl:228~236 |
| OBJECT | targetid prefix "NU" + to2=="가동" — NU1/NU4 2행 (NU2 to2="원장", NU3 to2="백업" 제외) | xfdl:239 | xfdl:237~245 |

> 주석 처리 항목: xfdl:193~197 의 "테스트" set_value 코드는 To-Be 제거 (분석 §10.5).

---

## §6. 라인 필드 (L-NNN)

해당 없음 — 분석 §3.6 동치.

---

## §7. 팝업/탭/연동 (P-NNN)

해당 없음 — 분석 §5 동치.

---

## §8. 상태값 (ST-NNN)

> 분석 §13 = 8 (처리유형 6 + 서버 2). 분석 §3.7 DS-002 + §7.1 서버 분기.

### §8.1 처리유형 상태 (6 enum)

| ID | 코드 (cbo_SyncTarget.value) | 표시명 (xfdl) | 영향 처리 | 자동 선택 행 | 근거 |
|---|---|---|---|---|---|
| ST-001 | MASTER | 마스터코드 | `syncMasterCode` (java:59) — TB_MCM_CODE_MASTER / DETAIL / CATEGORY 3 테이블 SOURCE→TARGET | MA1~MA4 4행 | xfdl:458~461 / java:36/58~59 / xfdl:199~208 |
| ST-002 | RULE | 일반업무기준 | `syncRule (ruleFlag=MCA)` (java:61) — TB_MCA_RULE_MASTER / COL_LIST / {Object} 3 테이블 | RA1~RA4 4행 | xfdl:462~465 / java:37/60~61 / xfdl:209~218 |
| ST-003 | RULE_JUDGE | 판단업무기준 | `syncRule (ruleFlag=MCB)` (java:63) — TB_MCB_RULE_MASTER / COL_LIST / {Object} 3 테이블 | RB1~RB4 4행 | xfdl:466~469 / java:38/62~63 / xfdl:219~227 |
| ST-004 | INTERFACE | 인터페이스 | `syncNui (targetFlag=INTERFACE)` (java:65) — TB_MCM_MOM_TC_LIST / INTERFACES 2 테이블 | NU1~NU4 4행 | xfdl:470~473 / java:39/64~65 / xfdl:228~236 |
| ST-005 | FORMAT | 포맷 | `syncNui (targetFlag=FORMAT)` (java:67) — TB_MCM_MOM_FORMAT_LIST / LAYOUT 2 테이블 + FORMAT_VER UP | NU1~NU4 4행 | xfdl:474~477 / java:40/66~67 / xfdl:228~236 |
| ST-006 | OBJECT | OBJECT | `syncObj` (java:69) — TB_MCM_SEC_OBJ / MENU / PERM 3 테이블 (PERM LIKE) | NU1 / NU4 (to2=="가동") | xfdl:478~481 / java:41/68~69 / xfdl:237~245 |

### §8.2 서버 상태 (2 enum — 실행 가능)

| ID | 코드 (`ApplicationUtils.getServerConfig()`) | 의미 | 실행 분기 | 근거 |
|---|---|---|---|---|
| ST-007 | LOC | 로컬 / 단일 DB 환경 (To-Be 단일 MSSQL `sample_dmes` 환경 — Q-002 해소 / Q-005 해소) | (a) MASTER → syncMasterCode 의 LOC 분기 (java:111~142) — MCM_SOURCE → MCMAPUSER, MCM_BACKUP / (b) RULE/RULE_JUDGE → syncRule LOC 분기 (java:250~314) — 본체 주석 처리 비활성 / (c) INTERFACE/FORMAT → syncNui LOC 분기 (java:430~459) — MCMAPUSER → MCM_SOURCE, MCM_BACKUP / (d) OBJECT → **As-Is LOC 차단 → To-Be 차단 폐기 (Q-005 해소 — DB Link 폐기로 차단 사유 ✗)** | java:42/48/111/250/430/514~516 |
| ST-008 | PRD | 운영 환경 (As-Is — Oracle DB Link 의존) | As-Is: 모든 처리유형 ds_main loop 으로 SOURCE → TARGET (DB Link 사용). **To-Be: DB Link 폐기 (Q-002 해소) — PRD 분기는 사실상 No-op (`${pDblink*}` 변수 빈문자열 고정). As-Is 코드 분기 구조는 §7 그대로 보존.** | java:42/48/143/315/460/519~562 |

> 그 외 서버 (DEV / TST 등) 는 `run()` 시작부에서 `return null` 처리 (java:48~51) — 실행 차단 (As-Is 보존).
>
> **To-Be 환경 변경 (2026-05-31 사용자 결정 — Q-002 / Q-005 해소)**: 단일 MSSQL `sample_dmes` 환경 — LOC 분기가 유일 실 동작 분기로 유지. PRD 분기는 As-Is 코드 분기 구조만 보존 (실 실행 시 DB Link 빈값 고정으로 No-op).

---

## §9. 코드값/LoV (LV-NNN)

### §9.1 LV-001 — 처리유형 LoV (ds_lovSyncTarget — 정적 6 행)

> 분석 §3.7 DS-002 인용 (xfdl:452~483).

| CODE_VAL | CODE_VAL_MEAN | 비고 |
|---|---|---|
| MASTER | 마스터코드 | ST-001 |
| RULE | 일반업무기준 | ST-002 |
| RULE_JUDGE | 판단업무기준 | ST-003 |
| INTERFACE | 인터페이스 | ST-004 |
| FORMAT | 포맷 | ST-005 |
| OBJECT | OBJECT | ST-006 |

> **To-Be 결정**: 정적 LoV 보존 결정 (xfdl 내장). DB master code 화 ✗ (변경 빈도 매우 낮음 + 코드명에 java 분기 의존).

### §9.2 ds_main — 정적 16 행 (이행 매트릭스)

> 분석 §3.7 DS-001 표 인용 (xfdl:273~450). 본 화면의 핵심 정적 데이터 — DB 조회 ✗ / xfdl 내장. **To-Be 결정**: xfdl 자산 폐기 + React State 상수로 이전 (수정 빈도 낮음).

---

## §10. API 명세 (To-Be REST)

> 분석 §4.5 + §7 의 reg action 1 종을 REST API 로 매핑.

### §10.1 API-001 — 동기화 실행 (reg)

| 항목 | 값 |
|---|---|
| HTTP Method | POST |
| Path | `/api/mcm/csa/commSyncMng/reg` |
| Request Body (JSON) | `{ "pSyncTarget": "MASTER\|RULE\|RULE_JUDGE\|INTERFACE\|FORMAT\|OBJECT" (필수, 6 enum), "dsObject": [{"OBJECT": "string"}, ...] (필수, edt_Target ',' split 결과), "dsMain": [{"CHK": "1\|0", "targetid": "MA1\|MA2\|...\|NU4", "from1": "string", "from2": "string", "from3": "string", "from4": "string", "to1": "string", "to2": "string", "to3": "string", "to4": "string"}, ...] (필수, CHK=1 행만 처리 — gfn_transaction `ds_main:U`) }` |
| Response Body (JSON) | `{ "cntSave": 0\|N (integer, java:75 cnt_save), "message": "string" (error 시) }` |
| HTTP Status | 200 (정상 / cnt_save==0 포함 — xfdl:178 미처리 warning 은 FE 메시지) / 400 (검증 실패) / 403 (LOC + OBJECT 차단 — java:514~516) / 500 (UserException — 인천 RULE 차단 java:224 / 존재하지 않는 업무기준 java:246) |
| 인증 | (사용자 결정 — RULE.md 표준 토큰 인증 추정) |
| 트랜잭션 경계 | OASIS BPMN UserTask 1 회 (단일 트랜잭션 — UserTask id To-Be: **`UserTask_runSync`** — Q-006 해소) — 6 처리유형 분기 모두 동일 트랜잭션 |
| SQL 호출 | 6 분기 — MASTER → getCodeVer / TB_MCM_CODE_MASTER_Mapper.update / TB_MCM_CODE_DETAIL_Mapper.update / deleteSourceData / insertSourceData × N **+ To-Be: updateSyncAudit (Q-008 해소 (b) 안 — 동기화 audit U_* 덮어쓰기)**. RULE → selectMasterCodeData (차단 검증 — VI = `MCMAPUSER.VI_MCM_CODE_ACCESS` Q-003 해소) / getRuleVer / TB_MCA_RULE_MASTER_Mapper.update / TB_MCA_RULE_COL_LIST_Mapper.update / TB_MCA_{Object}_Mapper.update / deleteSourceData(주석) / insertSourceData(주석). RULE_JUDGE → (동일 MCB). INTERFACE → deleteSourceData / insertSourceData × N. FORMAT → getFormatVer / updateFormatVer / deleteSourceData / insertSourceData × N. OBJECT → deleteObjectData / insertObjectData × N. **본 화면 책임 = MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL — schema = `MCM_SOURCE`) — Q-001 해소 / Q-009 해소. Entity = cma 4 화면 재사용 (정책 #6 (A)).** |
| 근거 | xfdl:145~159 / java:24~82 / 분석 §6 / §7 / §11.0 |

> **본 화면은 단일 API 만 제공** (reg). search / save / delete 등 일반 CRUD API ✗. fn_search 는 As-Is 빈 함수 (분석 §4.4 # 4) — To-Be 제거 결정.

### §10.2 API-002 ~ API-006 (해당 없음)

본 화면은 단일 API (API-001 reg) 만 보유. 분석 §13 BPMN action 1 = `reg` 동치.

---

## §11. 유효성 검증 정책 (To-Be)

> 분석 §11.4 SQL Injection 대응 + §4.5 단계 (1)~(3) 클라이언트 검증을 BE 재검증 정책으로 등재.

| ID | 검증 항목 | 검증 위치 (FE/BE) | 정책 | 근거 |
|---|---|---|---|---|
| V-001 | pSyncTarget enum 6 값 | FE + BE | 화이트리스트 [MASTER, RULE, RULE_JUDGE, INTERFACE, FORMAT, OBJECT] — 그 외 거부 (400) | 분석 §4.5 (3) / java:58~70 |
| V-002 | OBJECT 처리유형 "::" 포함 | FE + BE | pSyncTarget=="OBJECT" 시 dsObject 의 각 OBJECT 값에 "::" 포함 필수 (예: `csa::CommSyncMng`). 미포함 시 거부 (400) | 분석 §4.5 (1) / xfdl:126~129 |
| V-003 | dsObject 비어있지 않음 | FE + BE | dsObject.size > 0 필수 (java:54 loop 진입 조건) | java:54 |
| V-004 | dsMain CHK==1 행 존재 | BE 권장 | CHK==1 행 0 건 시 fn_callBack 의 cnt_save==0 분기로 처리 (xfdl:177~180) | xfdl:177~180 / 분석 §10.4 |
| V-005 | from3 / to3 (As-Is DB Link prefix) 화이트리스트 | BE | **As-Is**: from3 / to3 ∈ {MEPP_MCM, DPMESA1_MCM, TSTMPH_MCM} — 그 외 거부. **To-Be (Q-002 해소)**: DB Link 폐기 — from3 / to3 컬럼은 ds_main 16 행 정적 표시값으로만 보존 + 런타임 SQL 사용 ✗ (검증 무관). | 분석 §11.4 / §11.2 / xfdl:282/302/313 등 |
| V-006 | from4 / to4 (스키마명) 화이트리스트 | BE | from4 / to4 ∈ {MCM_SOURCE, MCMAPUSER, MCM_BACKUP, MCA_SOURCE, MCAAPUSER, MCA_BACKUP, MCB_SOURCE, MCBAPUSER, MCB_BACKUP} — 그 외 거부. **To-Be 본 화면 책임 범위 (Q-001 해소): MCM_SOURCE / MCMAPUSER / MCM_BACKUP 3종만 활성** (MASTER 3 테이블 대상). | 분석 §11.4 / §11.0 |
| V-007 | targetid prefix 화이트리스트 | BE | targetid prefix 2글자 ∈ {MA, RA, RB, NU} + 3번째~ 숫자 1~4 — 그 외 거부. **To-Be 본 화면 책임: MA1~MA4 만 활성** (Q-001 해소 — MASTER 3 테이블). RA/RB/NU 행은 As-Is 표시값 보존 + 후속 도메인 화면 책임 위임 (Q-009 해소). | 분석 §10.3 / §11.0 / xfdl:201/211/221/230/239 |
| V-008 | ~~LOC 환경 + OBJECT 차단~~ → **Q-005 해소 — 차단 폐기** | BE | **As-Is**: 서버 LOC + pSyncTarget="OBJECT" 시 UserException "DB링크로 인해 LOCAL에서 실행할 수 없습니다." **To-Be (Q-005 해소)**: DB Link 폐기로 차단 사유 ✗ → LOC 차단 폐기. To-Be 검증 항목에서 제거 (As-Is 코드는 §10.5 인용 보존). | java:514~516 / 분석 §11.2 / §11.5 |
| V-009 | 인천 RULE 차단 | BE | pSyncTarget="RULE" 또는 "RULE_JUDGE" + dsObject 의 OBJECT 가 selectMasterCodeData(CODE_ID="RULE_BAR_SYNC_LIST") 결과 CODE_VAL 에 존재 시 UserException "인천 업무기준 관리 대상입니다. [인천 MES]에서 이행 부탁드립니다." | java:213~225 |
| V-010 | 존재하지 않는 업무기준 차단 | BE | pSyncTarget="RULE" 또는 "RULE_JUDGE" + TB_M{C}_{Object} 테이블 미존재 (Mapper update 실패) 시 UserException "존재하지 않는 업무기준 입니다." | java:236~247 |

---

## §6.14 4질문 검증 (Phase 2 종료)

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | ✗ (분석 §0.1.3 단일 원천 / 신규 항목 추가 ✗ / cite file:line / 분석 §13 매트릭스와 1:1 일치 / Q 10건 해소 갱신 본문 반영 — 2026-05-31) |
| 2 | 검증 안 한 부분? | ✗ (S 4 / G 9 / B 3 / GB 0 / D 0 / L 0 / P 0 / ST 8 / LV 1 모두 §2~§9 등재 + API-001 reg 단일 등재) |
| 3 | 그대로 수용? | ✗ (As-Is fn_search 빈 함수 → To-Be API 미포함 명시 §10.2 / 검증 V-005~V-010 BE 재검증 정책 + Q-002/Q-005/Q-008 해소로 V-005/V-006/V-007/V-008 To-Be 영향 명시 — 분석 §11 원천 보존 + To-Be 위치만 BE 로 명시) |
| 4 | 임의 합리화? | ✗ ("해당 없음" 4 회 (§4 D / §6 L / §7 P / §5.2 GB) 명시 — 분석 동치 / "주요/대표/등" 0 회 / Q 10건 전수 해소 (활성 0)) |

> Phase 2 통과 — Phase 3 진입. **2026-05-31 Q 10건 해소 갱신 반영 완료 (Q-001/Q-002/Q-003/Q-005/Q-006/Q-007/Q-008/Q-009 본 설계서 직접 영향).**
