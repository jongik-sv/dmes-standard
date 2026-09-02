---
screenId: commSyncMng
asIsId: CommSyncMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 동기화 관리 (CommSyncMng) 분석리포트

## §0. 환경 제약 (사용자 결정 사항 — R-13 / R-14 미적용 사유 포함)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | 사용자 결정 — mui (xfdl / Java / Mapper.xml / bpmn) 자산은 Runner 의 WinForms (designer.cs / cs / sp.sql) 인입 패턴과 정합되지 않음 |
| SOP 30 Step (R-13) | 미실행 (기록 ✗) | Runner 산출물 (classify.trace.json 등) 부재로 §-1 자기 기록 불가 — 본 분석은 mui 자료 직접 grep + Read 로 진행 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 (manifest 9 파일 검증) | ✗ + 사유 명시 | "Runner config mui 미지원 — 사용자 결정으로 생략" |
| 가이드 템플릿 (WinForms 전제) | 절 제목 / 절 구조 참고만 | 본문은 mui 등가물로 매핑: designer.cs → xfdl Layout / cs → xfdl Script + java UserTask / sp.sql → Mapper.xml inline SQL / cs Click+= → xfdl on*click / @Case 분기 → BPMN sequenceFlow `name` 분기 |
| 자체 grep / 자체 추론 | 본 분석에서는 허용 (Runner 부재) | R-14 강제 조항 "manifest 인용만" 은 mui 환경에 미적용. cite 는 file:line 형식 유지 |

> 본 §0 에 따라 본 분석리포트는 가이드 템플릿의 절 순서·표 헤더는 가능한 한 유지하되, R-14 강제 인용 / R-13 SOP 30 Step 자기 기록 / Auto Manifest 9 파일 hash 표는 모두 생략한다. 정합체크서 §A.3 / §A.A-R12-1 / §D.4 도 동일 사유로 ✗ + 사유 명시 처리.

---

## §1. 분석 대상

| 항목 | 값 |
|---|---|
| 화면명 | 동기화 관리 (xfdl titletext, xfdl:3) |
| 화면 식별자 (screenId) | commSyncMng |
| As-Is 식별자 (asIsId) | CommSyncMng |
| moduleId | mcm (한글명 **"공통관리"**) |
| moduleGroup | csa (한글명 **"시스템관리"**) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 동기화 관리 (commSyncMng) |
| 적용 명명 룰 | MES 단일 토큰 룰 (`{화면명}` camelCase — 모듈명·그룹명 토큰 ✗) |
| pageName | commSyncMng |
| pageId | commSyncMng |
| serviceId | commSyncMng |
| Frontend 파일명 | `commSyncMng.tsx` |
| 분석 일자 | 2026-05-29 |

**화면 목적** (xfdl 상단 주석 인용 + 패턴 1 enum):

> CommSyncMng (동기화 관리) 는 **공통(권한/마스터/업무기준) 동기화 프로그램** 으로, 6 처리유형 (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT) 별로 SOURCE 스키마 (가동계 또는 개발계) 의 데이터를 TARGET 스키마 (가동/백업/개발/테스트계) 로 이행한다 (xfdl:73~74, xfdl:121~168, java:24~82).

- 주 사용자: 시스템 관리자 / 운영 담당자 (운영계 PRD 또는 LOC 한정 — java:48 `if(!("LOC".equals(targetServer) || "PRD".equals(targetServer))) return null`)
- 업무 도메인: MCM (공통관리) 의 6 처리유형 데이터를 SOURCE → TARGET 스키마로 일괄 이관 (Oracle DB Link `@DPMESA1_MCM` / `@TSTMPH_MCM` 사용)
- 기능 요약 (BPMN action 1 enum — `reg` 만, bpmn:18):
  1. `reg` — 이행 (동기화 실행) — 6 처리유형별 분기 (`syncMasterCode` / `syncRule` ×2 / `syncNui` ×2 / `syncObj`) — java:54~73

---

## §2. 자료 수집 인벤토리 (mui 5 자산 + DMES 매핑)

| # | 자료 구분 | 경로 | line 수 | 확인 (Y/N) | 분석에 사용한 내용 | 비고 |
|---:|---|---|---:|---|---|---|
| 1 | xfdl (UI 정의 + Script) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommSyncMng.xfdl` | 491 | Y | Form / Layout / Div 5 / Grid 1 / Button 2 / Combo 1 / Edit 4 / Dataset 3 / Script 8 function 전수 | §3 / §4 / §5 / §10 |
| 2 | Java UserTask — 동기화 실행 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommSyncMng/SaveCommSyncMng.java` | 564 | Y | `run(Context, Task)` + 4 sync 메서드 (`syncMasterCode` / `syncRule` / `syncNui` / `syncObj`) + 6 처리유형 분기 + LOC/PRD 서버 분기 + 인천 RULE 차단 + DB Link 처리 | §7 |
| 3 | Mapper.xml (MyBatis) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-csa/CommSyncMngMapper.xml` | 108 | Y | 12 SQL ID (select 7 / update 2 / insert 2 / delete 2 / create 1) + 동적 SQL (`${pSchemaTo}` / `${pTableTo}` / `${pDblinkTo}`) | §6 |
| 4 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommSyncMng.bpmn` | 75 | Y | StartEvent 1 / ExclusiveGateway 1 (action 1 분기 `reg`) / UserTask 1 / EndEvent 1 / SequenceFlow 3 | §8 |
| 5 | DMES 테이블 정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | (별도) | N (본 화면 직접 사용 ✗ — MASTER 3 테이블 컬럼은 cma 4 화면 정본 재사용) | 본 화면은 16 테이블 그룹을 메타 동기화 대상으로 보유하나, 본 화면 책임 범위 = MASTER 3 테이블 (cma 4 화면 entity 재사용 — Q-001 해소) + 13 테이블 후속 도메인 화면 위임 (Q-009 해소) | §9 |
| 6 | ref_Audit 매퍼 정의 | (As-Is mui 산출물 내 미동봉) | - | N (To-Be cactus-core 적용) | As-Is Mapper.xml 의 `<include refid="ref_Audit.update">` 1 회 호출 (xml:40 `updateFormatVer`) 은 To-Be 에서 폐기 — cactus-core `CactusAuditEntity` 의 `@PreUpdate` 9 컬럼 자동 채움. **단, 본 화면은 메타 동기화 화면이므로 To-Be 에서 audit 자동 채움은 동기화 시점의 `U_USR_ID` / `U_AT` 만 의미. SOURCE → TARGET INSERT 시는 SOURCE 원본 audit 그대로 복사 (As-Is `INSERT INTO ... SELECT *` 그대로 보존)** — §11 명시 | - |

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성 (Layout 좌표 기반)

| 영역 ID | xfdl 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 + 공통 topMenu (사용자정의 btn_sync 등재) | xfdl:6~13 |
| A-FILTER | `Div div_search` | top=`div_title:10` / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (처리유형 / 처리대상) | xfdl:14~23 |
| A-FOLD | `Button btn_fold` | top=93 / height=10 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 | xfdl:24 |
| A-MAIN | `Div div_main` | top=`btn_fold:5` / bottom=40 / left=20 / right=20 | 이행대상 선택 그리드 영역 | xfdl:25~68 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:69 |

### §3.2 조회조건 (S-NNN)

| ID | 화면 표시명 (Static/Edit text) | 컨트롤 (xfdl id) | 입력 유형 (5 enum) | maxlength | 기본값 / inputmode | 필수 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | 처리유형 | `stc_bizSystemCode` (옆 Combo `cbo_SyncTarget`) | (라벨 Static — 표시 전용) | - | 표시 텍스트 "처리유형" 고정 | - | xfdl:17 |
| S-002 | 처리유형 콤보 (선택) | `cbo_SyncTarget` | Combo (LoV) | - | innerdataset=`ds_lovSyncTarget` (6 행 정적 — MASTER/RULE/RULE_JUDGE/INTERFACE/FORMAT/OBJECT), codecolumn=`CODE_VAL`, datacolumn=`CODE_VAL_MEAN`, index=-1 (기본 미선택) | Y (xfdl:134 null 검증) | xfdl:18 |
| S-003 | 처리대상 (라벨) | `sts_roleId` | (라벨 Static — 표시 전용) | - | 표시 텍스트 "처리대상" 고정 | - | xfdl:19 |
| S-004 | 처리대상 입력 | `edt_Target` | TextBox (font size 14pt — xfdl:20) | 200 | 기본값 "AA_TEST" / inputmode 별도 지정 ✗ | Y (OBJECT 시 "::" 포함 검증 xfdl:126) | xfdl:20 |

### §3.3 그리드 G-NNN (`grd_main`, binddataset=`ds_main`, taborder=1)

> head Row 1 + body Row 1. head 1 줄 (band="head") + body 1 줄 (band="body"). head 셀 3 개 (병합 colspan 사용 — col0 "선택" + col1~4 colspan=4 "SOURCE (FROM)" + col5~8 colspan=4 "TARGET (TO)") → body 셀 9 개. autofittype="col" / selecttype="multiarea".

| ID | head text (head band, xfdl:47~51) | body bind (body band, xfdl:52~62) | 컬럼 size | edittype | editmaxlength | 기타 (combo / displaytype / cssclass) | 필수 | 근거 |
|---|---|---|---:|---|---:|---|---|---|
| G-001 | 선택 (col=0) | `bind:CHK` | 20 | checkbox (`displaytype="checkboxcontrol" edittype="checkbox"`) | - | cssclass `expr:dataset.getColumn(currow, 'CHK') == '1' ? 'cellBody_BgColor_red' : ''` (선택 시 red bg) | (체크 전용) | xfdl:33 / 48 / 53 |
| G-002 | SOURCE (FROM) → (col=1 콜렙스 흡수, head text 없음 — body 컬럼 1) | `bind:from1` | 80 | (없음 — read-only) | - | cssclass `expr:CHK == '1' ? 'cellBody_BgColor_red,cellControl_fontSize_14' : 'cellControl_fontSize_14'` | (read-only — 정적 값) | xfdl:34 / 49 (colspan=4) / 54 |
| G-003 | SOURCE (FROM) → (col=2 콜렙스 흡수) | `bind:from2` | 80 | (없음) | - | (동일) | (read-only) | xfdl:35 / 49 / 55 |
| G-004 | SOURCE (FROM) → (col=3 콜렙스 흡수) | `bind:from3` | 80 | (없음) | - | (동일) | (read-only) | xfdl:36 / 49 / 56 |
| G-005 | SOURCE (FROM) → (col=4 콜렙스 흡수) | `bind:from4` | 80 | (없음) | - | (동일) | (read-only) | xfdl:37 / 49 / 57 |
| G-006 | TARGET (TO) (col=5 colspan=4) | `bind:to1` | 80 | (없음) | - | (동일) | (read-only) | xfdl:38 / 50 / 58 |
| G-007 | TARGET (TO) → (col=6 콜렙스 흡수) | `bind:to2` | 80 | (없음) | - | (동일) | (read-only) | xfdl:39 / 50 / 59 |
| G-008 | TARGET (TO) → (col=7 콜렙스 흡수) | `bind:to3` | 80 | (없음) | - | (동일) | (read-only) | xfdl:40 / 50 / 60 |
| G-009 | TARGET (TO) → (col=8 콜렙스 흡수) | `bind:to4` | 80 | (없음) | - | (동일) | (read-only) | xfdl:41 / 50 / 61 |

- 그리드 옵션: `autofittype="col"`, `selecttype="multiarea"`, head Row 1 + body Row 1 (band 명시), Row size head=30 / body=24
- head 폰트: `normal 700 16px/normal "Malgun Gothic"` (Bold 16px)
- body cell 폰트: cssclass `cellControl_fontSize_14` (14px) + 선택 시 빨간 배경
- 이벤트 등록: 없음 (`grd_main` 자체에 onheadclick / oncellclick 미등록 — xfdl:29~65 grid 태그 전수 검토)
- head band col 0 ("선택") + col 1 colspan=4 ("SOURCE (FROM)") + col 5 colspan=4 ("TARGET (TO)") — 9 컬럼 정의 + head 3 셀

### §3.4 상세 그리드 GE-NNN

해당 없음 — 본 화면은 단일 Grid (`grd_main`) 형. xfdl:29~65 전수 검토 결과 `grd_detail` 등 추가 Grid 미존재.

### §3.5 상세 입력 필드 D-NNN

해당 없음 — 본 화면은 그리드 형 (편집 가능 컬럼은 G-001 CHK 만). 단일 상세 폼 입력 영역 ✗.

### §3.6 라인 필드 L-NNN

해당 없음 — 본 화면에 Tabs / TabPage / List / DataList 등 라인 반복 컴포넌트 미존재.

### §3.7 Dataset 전수 (xfdl Objects)

| ID | xfdl 경로 | 컬럼 (전수) | 역할 | 행 수 (정적) | 근거 |
|---|---|---|---|---:|---|
| DS-001 | `ds_main` | CHK / targetid / from1~from4 / to1~to4 (총 10 컬럼) | 이행대상 선택 그리드 데이터 (12 테이블 동기화 매트릭스) | **16 행 정적 (xfdl 내장)** — 사용자 선택 ↔ 처리유형별 자동 선택 분기 | xfdl:260~451 (Columns:261~272 / Rows 16 정적:273~450) |
| DS-002 | `ds_lovSyncTarget` | CODE_VAL / CODE_VAL_MEAN (2 컬럼) | 처리유형 콤보 LoV (S-002) | **6 행 정적 (xfdl 내장)** — MASTER/RULE/RULE_JUDGE/INTERFACE/FORMAT/OBJECT | xfdl:452~483 |
| DS-003 | `ds_object` | OBJECT (1 컬럼) | 처리대상 분해 데이터셋 (`edt_Target.value.split(',')` 으로 fn_sync 에서 동적 생성) | 0 (xfdl:484~488, fn_sync xfdl:140~143 에서 동적 addRow) | xfdl:484~488 |

> **ds_main 16 행 정적 데이터 (xfdl:273~450)**: 사용자 결정에 따라 본 화면의 이행 매트릭스는 화면 코드에 내장되어 있다 — 동적 SQL 조회 ✗.
>
> | targetid | from1 | from2 | from3 | from4 | to1 | to2 | to3 | to4 | 근거 |
> |---|---|---|---|---|---|---|---|---|---|
> | MA1 | 가동계 | 원장 | MEPP_MCM | MCM_SOURCE | 가동계 | 가동 | MEPP_MCM | MCMAPUSER | xfdl:274~284 |
> | MA2 | 가동계 | 원장 | MEPP_MCM | MCM_SOURCE | 가동계 | 백업 | MEPP_MCM | MCM_BACKUP | xfdl:285~295 |
> | MA3 | 가동계 | 원장 | MEPP_MCM | MCM_SOURCE | 개발계 | 가동 | DPMESA1_MCM | MCMAPUSER | xfdl:296~306 |
> | MA4 | 가동계 | 원장 | MEPP_MCM | MCM_SOURCE | 테스트계 | 가동 | TSTMPH_MCM | MCMAPUSER | xfdl:307~317 |
> | RA1 | 가동계 | 원장 | MEPP_MCM | MCA_SOURCE | 가동계 | 가동 | MEPP_MCM | MCAAPUSER | xfdl:318~328 |
> | RA2 | 가동계 | 원장 | MEPP_MCM | MCA_SOURCE | 가동계 | 백업 | MEPP_MCM | MCA_BACKUP | xfdl:329~339 |
> | RA3 | 가동계 | 원장 | MEPP_MCM | MCA_SOURCE | 개발계 | 가동 | DPMESA1_MCM | MCAAPUSER | xfdl:340~350 |
> | RA4 | 가동계 | 원장 | MEPP_MCM | MCA_SOURCE | 테스트계 | 가동 | TSTMPH_MCM | MCAAPUSER | xfdl:351~361 |
> | RB1 | 가동계 | 원장 | MEPP_MCM | MCB_SOURCE | 가동계 | 가동 | MEPP_MCM | MCBAPUSER | xfdl:362~372 |
> | RB2 | 가동계 | 원장 | MEPP_MCM | MCB_SOURCE | 가동계 | 백업 | MEPP_MCM | MCB_BACKUP | xfdl:373~383 |
> | RB3 | 가동계 | 원장 | MEPP_MCM | MCB_SOURCE | 개발계 | 가동 | DPMESA1_MCM | MCBAPUSER | xfdl:384~394 |
> | RB4 | 가동계 | 원장 | MEPP_MCM | MCB_SOURCE | 테스트계 | 가동 | TSTMPH_MCM | MCBAPUSER | xfdl:395~405 |
> | NU1 | 개발계 | 가동 | DPMESA1_MCM | MCMAPUSER | 가동계 | 가동 | MEPP_MCM | MCMAPUSER | xfdl:406~416 |
> | NU2 | 개발계 | 가동 | DPMESA1_MCM | MCMAPUSER | 가동계 | 원장 | MEPP_MCM | MCM_SOURCE | xfdl:417~427 |
> | NU3 | 개발계 | 가동 | DPMESA1_MCM | MCMAPUSER | 가동계 | 백업 | MEPP_MCM | MCM_BACKUP | xfdl:428~438 |
> | NU4 | 개발계 | 가동 | DPMESA1_MCM | MCMAPUSER | 테스트계 | 가동 | TSTMPH_MCM | MCMAPUSER | xfdl:439~449 |
>
> targetid prefix 규칙 (xfdl:201/211/221/230/239 의 `substring(0,2)` 분기):
> - `MA` = MASTER 처리유형용 4행 (xfdl:201)
> - `RA` = RULE 처리유형용 4행 (xfdl:211)
> - `RB` = RULE_JUDGE 처리유형용 4행 (xfdl:221)
> - `NU` = INTERFACE / FORMAT / OBJECT 공용 4행 (xfdl:230 / 239)
>
> OBJECT 처리유형은 NU + to2="가동" 조건 (xfdl:239) → NU1 / NU4 만 자동 선택

> **ds_lovSyncTarget 6 행 정적 (xfdl:452~483)**:
>
> | CODE_VAL | CODE_VAL_MEAN | 분기 처리 메서드 | 근거 |
> |---|---|---|---|
> | MASTER | 마스터코드 | `syncMasterCode` (java:59) | xfdl:458~461 |
> | RULE | 일반업무기준 | `syncRule (ruleFlag=MCA)` (java:61) | xfdl:462~465 |
> | RULE_JUDGE | 판단업무기준 | `syncRule (ruleFlag=MCB)` (java:63) | xfdl:466~469 |
> | INTERFACE | 인터페이스 | `syncNui (targetFlag=INTERFACE)` (java:65) | xfdl:470~473 |
> | FORMAT | 포맷 | `syncNui (targetFlag=FORMAT)` (java:67) | xfdl:474~477 |
> | OBJECT | OBJECT | `syncObj` (java:69) | xfdl:478~481 |

---

## §4. 버튼·액션 (B-NNN / GB-NNN) + 이벤트 핸들러 매핑

### §4.1 B-NNN 전수 (xfdl Button + onclick + 사용자정의 commonTopButton 등재)

| ID | 위치 | 버튼명 (text) | xfdl id | onclick 핸들러 | 동작 enum | To-Be action | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | div_title.div_topMenu (사용자정의 commonTopButton 등재) | **이행** (cssclass: `btn_WF_Point, btn_WF_confirm` — Point + Confirm 강조) | `btn_sync` (commonTopButton 동적 생성) | `fn_sync` (xfdl:121~168) | confirm → ds_object 분해 → ds_main rowtype 분기 → gfn_transaction("reg",...) | reg | xfdl:101~104 / 121~168 |
| B-002 | div_title.div_topMenu (기본 commonTopButton) | **닫기** (기본 버튼) | `btn_close` (commonTopButton 기본 버튼 array `["btn_close"]`) | (commonTopButton 라이브러리 처리) → `fn_close` (xfdl:249~253) | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` | - (탭 닫기 — 공통) | xfdl:103 / 249~253 |
| B-003 | div_main 상단 (접기 토글) | (접기 토글 — text 없음) | `btn_fold` | `btn_fold_onclick` (xfdl:255~258) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 | - (클라이언트 전용) | xfdl:24 / 255~258 |

> **주석 처리된 사용자정의 버튼 (As-Is 제외)** — xfdl:103 의 `/*["btn_search"], ["btn_reg"],*/` 주석은 다른 화면의 commonTop 룰을 그대로 복사한 흔적. 본 화면에서는 기본 버튼 `btn_close` 만 실제 등록 + 사용자정의 `btn_sync` 1 개 등록.

### §4.2 그리드 셀 인라인 버튼 GB-NNN

해당 없음 — `grd_main` (xfdl:29~65) 의 Format / Columns / Band 전수 검토 결과 ButtonField / displaytype="button" 셀 ✗.

### §4.3 공통 topMenu 버튼 (외부 인입)

| ID | 경로 | 등록 위치 | 호출 | 비고 | 근거 |
|---|---|---|---|---|---|
| EX-001 | `_com_div::commonTopButton.xfdl` (url include) | `div_title.div_topMenu` (xfdl:10) | `fn_button()` (xfdl:99) → `fn_commonTop_onload(this, [사용자정의 btn_sync], [기본 btn_close])` | 사용자정의 `btn_sync` (이행, cssclass `btn_WF_Point, btn_WF_confirm`) + 기본 `btn_close` | xfdl:99~104 |
| EX-002 | `_com_div::commonBottomStatus.xfdl` (url include) | `div_bottom` (xfdl:69) | `gfn_commonBottomStatus_msg(...)` 호출 (xfdl:181 fn_callBack 내) | 하단 status 메시지 표시 | xfdl:69 / 181 |

### §4.4 xfdl Script — 이벤트/메서드 전수 (자유 서술 ✗, 표 분해)

> 본 화면의 xfdl Script (xfdl:72~258) 의 모든 function 을 전수 등재 (총 8 개 — onload 1 + AfterOnload 1 + fn_button 1 + fn_search 1 + fn_sync 1 + fn_callBack 1 + cbo onitemchanged 1 + fn_close 1 + btn_fold_onclick 1) — 실제 8 개 (fn_close + btn_fold_onclick 포함, fn_search 는 빈 함수).

| # | 메서드 | 트리거 | 입력 / 부수효과 | 호출 BPMN action | 호출 SQL ID (Mapper.xml) | 근거 |
|---:|---|---|---|---|---|---|
| 1 | `CommSyncMng_onload` | Form onload | `gfn_formOnLoad(obj)` 호출 | - | - | xfdl:87~90 |
| 2 | `fn_formAfterOnload` | (gfn 라이프사이클) | `fn_button()` + `ds_main.set_rowposition(this.grd_row = -1)` (xfdl:85) | - | - | xfdl:92~96 |
| 3 | `fn_button` | `fn_formAfterOnload` | `commonTopButton.fn_commonTop_onload(this, [["btn_sync","fn_sync","이행","btn_WF_Point, btn_WF_confirm"]], [["btn_close"]])` | - | - | xfdl:99~104 |
| 4 | `fn_search` | (등록만, 호출 ✗) | **빈 함수 + 주석 처리된 트랜잭션 코드 잔존** (xfdl:110~117 주석) — `gfn_transaction("search", "", "ds_srch=ds_srch", "ds_grdMain=ds_GetMasterRuleData", pTable="TB_MCA_"+edt_ruleId.value, fn_callBack)` 형태였으나 모두 주석화 | - (사용 ✗ — 본문 빈 함수) | (`GetMasterRuleData` 주석 — Mapper.xml 미정의) | xfdl:108~118 |
| 5 | `fn_sync` (B-001 onclick) | btn_sync (사용자정의 top) | (1) cbo_SyncTarget == "OBJECT" 이고 edt_Target 값에 "::" 미포함이면 차단 (xfdl:126~129) (2) confirm 후 콜백 fn_msgSaveCallBack 에서 cbo_SyncTarget null 검증 (3) edt_Target 을 ',' split 후 ds_object 행마다 OBJECT 컬럼 세트 (4) ds_main 의 CHK==1 행은 ROWTYPE_INSERT 로 / 그 외 ROWTYPE_NORMAL 로 setRowType (xfdl:152~157) (5) `gfn_transaction("reg", "", "ds_object=ds_object ds_main=ds_main:U", "", pSyncTarget=cbo_SyncTarget.value, "fn_callBack")` | reg | (UserTask) → 6 분기 → 12 SQL ID 동적 호출 | xfdl:121~168 |
| 6 | `fn_callBack` | `gfn_transaction` callback | strSvcId="reg" 분기: nErrorCode==0 이면 `cnt_save==0` 시 "데이터 이행 미처리" 경고 / 그 외 `cnt_save건 저장 되었습니다` + "데이터 이행 정상완료" info 표시. error 시 status bar 에 strErrorMsg | (모든 action 의 콜백) | (모든 sqlKey 의 결과 처리) | xfdl:171~189 |
| 7 | `div_search_cbo_SyncTarget_onitemchanged` (S-002 onitemchanged) | cbo_SyncTarget 변경 | cbo_SyncTarget 값에 따라 ds_main 의 행 CHK 자동 세트 — MASTER → MA* / RULE → RA* / RULE_JUDGE → RB* / INTERFACE+FORMAT → NU* / OBJECT → NU* 중 to2=="가동" (xfdl:199~245). targetid 의 첫 2 글자로 매칭 (`substring(0,2)`) | - (클라이언트 전용) | - | xfdl:191~246 |
| 8 | `fn_close` (B-002 트리거, commonTopButton btn_close 자동) | btn_close (기본 commonTop) | `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` | - | - | xfdl:249~253 |
| 9 | `btn_fold_onclick` (B-003 onclick) | btn_fold | `gfn_fold(this, div_search, div_main, btn_fold)` | - | - | xfdl:255~258 |

> 메서드 총수 = 9 (xfdl Script 의 `this.X = function`/`this.X_onclick = function` 모두 전수 — onload 1 + AfterOnload 1 + fn_button 1 + fn_search 1 (빈) + fn_sync 1 + fn_callBack 1 + cbo onitemchanged 1 + fn_close 1 + btn_fold_onclick 1).

### §4.5 fn_sync 내부 콜백 `fn_msgSaveCallBack` (트랜잭션 본체) — 상세 단계

> fn_sync (xfdl:121~168) 내부의 confirm 메시지 콜백 함수.

| 단계 | 로직 | 분기 / 부수효과 | 근거 |
|---:|---|---|---|
| (1) | OBJECT 처리유형 + "::" 미포함 사전 차단 | "OBJECT FULLNAME을 입력해주세요. \n ex)csa::CommSyncMng" 에러 표시 후 return | xfdl:126~129 |
| (2) | confirm 메시지 표시 ("[{처리유형명}] 이행 하시겠습니까?") | OK 시 콜백 진입 | xfdl:164~167 |
| (3) | (콜백 진입) cbo_SyncTarget null 재검증 | null 이면 "처리유형을 선택하세요." warning + return | xfdl:134~137 |
| (4) | edt_Target.value 를 ',' split → 행 수만큼 ds_object.addRow + OBJECT 컬럼 세트 | (다중 처리대상 지원) | xfdl:138~143 |
| (5) | ds_main.set_updatecontrol(false) → CHK==1 행은 setRowType(i, ROWTYPE_INSERT) / 그 외 setRowType(ROWTYPE_NORMAL) → set_updatecontrol(true) | 서버 전송 시 ds_main:U (Update Set) 으로 CHK==1 행만 전송됨 — fn_sync gfn_transaction sInDatasets `ds_main=ds_main:U` (xfdl:147) | xfdl:152~157 |
| (6) | gfn_transaction("reg", "", "ds_object=ds_object ds_main=ds_main:U", "", pSyncTarget=cbo_SyncTarget.value, "fn_callBack") | sOutDatasets ✗ (서버 응답 데이터셋 ✗ — `cnt_save` 메시지만) | xfdl:145~159 |

---

## §5. 팝업 P-NNN

해당 없음 — 본 화면의 xfdl Script (xfdl:72~258) 전수 검토 결과 `gfn_openPopup` / `OpenForm` / `gfn_callPopup` grep 0 hit. 본 화면은 팝업 호출 ✗.

---

## §6. SQL ID 매트릭스 (Mapper.xml 12 SQL 전수 — As-Is 호출 + 미사용)

> Mapper.xml namespace = `CommSyncMngMapper` (mapper:5). 본 표는 12 SQL 모두 전수 — As-Is 1:1 보존. **As-Is 미호출 후보**: `selectCommUser` (xml:7) / `selectObjectData` (xml:79) / `createTable` (xml:44, 주석 처리만) — Java grep 결과 호출 위치 ✗.

| # | SQL ID | 유형 | 파라미터 | 결과 | 사용 테이블 | WHERE / 키 | Oracle 문법 포인트 | 호출 Java 위치 | 호출 (Y/N) | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | `selectCommUser` | select | (없음) | List<Map> (USER_ID, USER_EMP_NO) | `TB_MCM_SEC_USER` | (없음) | - | (Java grep 결과 미호출) | **N — To-Be 제거 후보** | xml:7~11 |
| 2 | `getCodeVer` | select | `pMasterCode` | String (CODE_VER) | `MCM_SOURCE.TB_MCM_CODE_MASTER` | `WHERE MASTER_CODE = #{pMasterCode}` | `NVL(MAX(CODE_VER) + 0.1, 1)` (Oracle NVL + 소수점 증분) | `syncMasterCode` java:100 | Y | xml:13~17 |
| 3 | `getRuleVer` | select | `pRuleId` | String (RULE_VER) | `MCA_SOURCE.TB_MCA_RULE_MASTER` | `WHERE RULE_ID = #{pRuleId}` | `NVL(MAX(RULE_VER) + 0.1, 1)` | `syncRule (ruleFlag=MCA)` java:231 | Y | xml:19~23 |
| 4 | `getJudgeRuleVer` | select | `pRuleId` | String (RULE_VER) | `MCB_SOURCE.TB_MCB_RULE_MASTER` | `WHERE RULE_ID = #{pRuleId}` | `NVL(MAX(RULE_VER) + 0.1, 1)` | `syncRule (ruleFlag=MCB)` java:232 | Y | xml:25~29 |
| 5 | `getFormatVer` | select | `pFormatId` | String (FORMAT_VER) | `MCMAPUSER.TB_MCM_MOM_FORMAT_LIST` | `WHERE FORMAT_ID = #{pFormatId}` | `NVL(MAX(FORMAT_VER) + 0.1, 1)` | `syncNui (targetFlag=FORMAT)` java:407 | Y | xml:31~35 |
| 6 | `updateFormatVer` | update | `pTableTo` / `pDblinkTo` / `pFormatId` / `FORMAT_VER` + audit | (rowcount) | `MCMAPUSER.${pTableTo}${pDblinkTo}` (TB_MCM_MOM_FORMAT_LIST or TB_MCM_MOM_FORMAT_LAYOUT) | `WHERE FORMAT_ID = #{pFormatId}` | **`MCMAPUSER.${pTableTo}${pDblinkTo}` 동적 테이블** + **`<include refid="ref_Audit.update">` audit** (xml:40) — As-Is 주석 (xml:37 주석: "FORMAT_VER PK 때문에 Table Mapper 생성시 UPDATE 제외되어 화면 Mapper 사용") | `syncNui (targetFlag=FORMAT)` java:419 (TB_MCM_MOM_FORMAT_LIST) + java:422 (TB_MCM_MOM_FORMAT_LAYOUT) | Y | xml:37~42 |
| 7 | `createTable` | update (DDL) | `pSchemaTo` / `pTableTo` / `pDblinkTo` / `pSchema` / `pTable` / `pDblink` | (DDL — rowcount 0) | (동적 TARGET / SOURCE) | (1=2 — 빈 구조만) | **CREATE TABLE ... AS SELECT * FROM ... WHERE 1=2** (Oracle DDL via Mapper) | (As-Is Java 주석 처리만, syncRule java:280 등 주석) | **N — To-Be 제거 후보 (As-Is 주석화 + 미호출)** | xml:44~47 |
| 8 | `deleteSourceData` | delete | `pSchemaTo` / `pTableTo` / `pDblinkTo` / `pWhere` / `pWhereClause` | (rowcount) | `${pSchemaTo}.${pTableTo}${pDblinkTo}` (동적) | `<if test="pWhere != null and pWhere != ''">WHERE ${pWhere} = #{pWhereClause}</if>` | **MyBatis `<if>` 동적 WHERE** + **`${}` 변수 치환 (Oracle DB Link)** | `syncMasterCode` java:124/163 / `syncRule` java:274(주석)/342 / `syncNui` java:441/476 | Y | xml:49~54 |
| 9 | `insertSourceData` | insert | `pSchemaTo` / `pTableTo` / `pDblinkTo` / `pSchema` / `pTable` / `pDblink` / `pWhere` / `pWhereClause` | (rowcount) | (동적 TARGET) ← `${pSchema}.${pTable}${pDblink}` (동적 SOURCE) | `INSERT INTO ${pSchemaTo}.${pTableTo}${pDblinkTo} SELECT * FROM ${pSchema}.${pTable}${pDblink} <if test='pWhere != null and pWhere != ''>WHERE ${pWhere} = #{pWhereClause}</if>` | **INSERT INTO ... SELECT \* FROM ... (DB Link 간 전수 복사)** | `syncMasterCode` java:139/186 / `syncRule` java:308(주석)/383 / `syncNui` java:456/498 | Y | xml:56~62 |
| 10 | `deleteObjectData` | delete | (동일 deleteSourceData) | (rowcount) | (동적) | `<if test="pWhere != null and pWhere != ''">WHERE ${pWhere} like #{pWhereClause}</if>` | **`LIKE` 연산자 (PERMISSION_ID prefix match)** | `syncObj` java:546 | Y | xml:64~69 |
| 11 | `insertObjectData` | insert | (동일 insertSourceData) | (rowcount) | (동적) | (insertSourceData + LIKE) `INSERT INTO ... SELECT * FROM ... <if>WHERE ${pWhere} like #{pWhereClause}</if>` | (동일 + LIKE) | `syncObj` java:558 | Y | xml:71~77 |
| 12 | `selectObjectData` | select | (동일 selectObjectData) | List<Map> (모든 컬럼) | (동적 SOURCE) | `<if test="pWhere != null and pWhere != ''">WHERE ${pWhere} like #{pWhereClause}</if>` | (조회 — `SELECT *`) | (Java grep 결과 미호출) | **N — To-Be 제거 후보** | xml:79~84 |
| 13 | `selectMasterCodeData` | select | `sCodeId` / `sCodeValue` / `sCategoryId` / `MYBATIS_ORDER_BY` | List<Map> (CODE_ID, CODE_NM, CODE_VAL, CODE_VAL_MEAN, CATEGORY_ID, CATEGORY_NM) | **As-Is**: `VI_MCM_CODE_ACCESS` (View, PUBLIC SYNONYM) → **To-Be**: `MCMAPUSER.VI_MCM_CODE_ACCESS` (schema 명시 — cma 정본 재사용, Q-003 해소) | `WHERE 1=1` + 3 `<if>` 동적 조건 + `<if>ORDER BY ${MYBATIS_ORDER_BY}</if>` | **VI_MCM_CODE_ACCESS 뷰 사용** (마스터코드 + 카테고리 조인 뷰) + **`${}` 치환 (SQL Injection 위험)**. To-Be MSSQL 은 PUBLIC SYNONYM 미지원이므로 Service.java FROM 절에 `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (cma masterCodeSelPop C-005 a 안 정본 — 2026-05-29 사용자 결정 동치 적용) | `syncRule` java:217 (인천 RULE_BAR_SYNC_LIST 차단 대상 조회) | Y | xml:87~108 |

> **SQL 정합 요약 (As-Is)**: Mapper.xml 13 SQL 등재 ↔ 실 호출 10 SQL ✓ + 미사용 3 SQL (`selectCommUser` / `createTable` / `selectObjectData`).
>
> **갯수 정정**: 본 §6 표 # 1~13 — Mapper.xml line 1~108 의 모든 `<select|insert|update|delete>` 태그 grep 결과 = 13 SQL. §2 인벤토리의 "12 SQL ID" 는 selectCommUser/selectMasterCodeData 의 중복 카운트 오류 → 실 13 SQL 정정.
>
> **As-Is 동적 SQL 변수 (DB Link 보존 표기)**: `${pDblinkTo}` / `${pDblink}` / `${pDblinkFrom}` / `@MEPP_MCM` / `@DPMESA1_MCM` / `@TSTMPH_MCM` 은 As-Is Mapper.xml + Java 본문에 그대로 인용 보존. To-Be 변환점 §11.2 에서 "단일 MSSQL `sample_dmes` — DB Link 폐기 / 변수 값은 모두 빈문자열 고정" 으로 결정 (Q-002 해소 — 2026-05-31 사용자 결정).
>
> **To-Be 적용**:
> - 활성 SQL 10 개만 이전 (getCodeVer / getRuleVer / getJudgeRuleVer / getFormatVer / updateFormatVer / deleteSourceData / insertSourceData / deleteObjectData / insertObjectData / selectMasterCodeData)
> - 미사용 3 SQL (selectCommUser / createTable / selectObjectData) 은 To-Be 제거
> - **Oracle DB Link `@DPMESA1_MCM` / `@TSTMPH_MCM` / `@MEPP_MCM` 처리 결정 = Q-002 해소** (2026-05-31 사용자 결정: 단일 MSSQL `sample_dmes` 환경 — DB Link 3종 전부 폐기. `${pDblinkTo}` / `${pDblink}` / `${pDblinkFrom}` 변수는 As-Is 보존 + 런타임 값은 빈문자열 고정. LOC 분기만 유일 분기로 유지 — Q-005 해소 동치)
> - **`VI_MCM_CODE_ACCESS` 뷰 정의는 cma 4 화면 정본 재사용 — Q-003 해소** (cma masterCodeSelPop §11.2 정본 DDL `MCMAPUSER.VI_MCM_CODE_ACCESS` 동치 적용 / `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 멱등 적재)
> - **`${}` 변수 치환 SQL Injection 위험** → To-Be 에서 화이트리스트 검증 추가 필요 — §11.4 명시

---

## §7. Java 트랜잭션 (UserTask 1 종 — SaveCommSyncMng)

### §7.1 SaveCommSyncMng.java (As-Is UserTask_pwdinit → To-Be UserTask_runSync, BPMN:19~28) — `run` 메서드

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is package | `com.dongkuk.dmes.mui.task.ui.csa.CommSyncMng` | java:1 |
| **To-Be package (Q-007 해소 — 2026-05-31)** | service: `com.dongkuk.dmes.mcm.csa.commSyncMng.service` / dto: `com.dongkuk.dmes.mcm.csa.commSyncMng.dto` (가이드 §3-1 — `{base-package}/{moduleGroup}/{screenId}/...`). **Entity 는 본 화면 자체 작성 ✗ — cma 4 화면 (masterCodeMng) entity (`com.dongkuk.dmes.mcm.entity.TbMcmCode{Master\|Category\|Detail}`) 재사용 (정책 #6 (A))** | - |
| class | `SaveCommSyncMng implements Wow` | java:22 |
| 메서드 | `String run(Context context, Task task)` | java:23~24 |
| 입력 | `context.get("ds_main")` → `ArrayList<HashMap<String,Object>>` (10 컬럼 — xfdl ds_main 컬럼 전수) + `context.get("ds_object")` → `ArrayList<HashMap<String,Object>>` (1 컬럼) + `context.get("pSyncTarget")` → String (6 enum) | java:31~33 |
| 6 처리유형별 6 테이블 그룹 상수 | masterTable={TB_MCM_CODE_MASTER, TB_MCM_CODE_DETAIL, TB_MCM_CODE_CATEGORY} (3종) / ruleTable={TB_MCA_RULE_MASTER, TB_MCA_RULE_COL_LIST, TB_MCA_} (3종) / ruleJudgeTable={TB_MCB_RULE_MASTER, TB_MCB_RULE_COL_LIST, TB_MCB_} (3종) / InterfaceTable={TB_MCM_MOM_TC_LIST, TB_MCM_MOM_INTERFACES} (2종) / FormatTable={TB_MCM_MOM_FORMAT_LIST, TB_MCM_MOM_FORMAT_LAYOUT} (2종) / ObjectTable={TB_MCM_SEC_OBJ, TB_MCM_SEC_MENU, TB_MCM_SEC_PERM} (3종) | java:36~41 |
| 서버 분기 | `targetServer = ApplicationUtils.getServerConfig()` → 6 enum (LOC / PRD / DEV / TST / ...) 중 LOC 또는 PRD 만 처리, 그 외 return null (java:48~51) | java:42 / 48~51 |
| 처리유형 분기 | `pSyncTarget` 6 분기 (MASTER → syncMasterCode / RULE → syncRule(MCA) / RULE_JUDGE → syncRule(MCB) / INTERFACE → syncNui(INTERFACE) / FORMAT → syncNui(FORMAT) / OBJECT → syncObj) | java:54~73 |
| 처리대상 loop | `for (i=0; i<ds_object.size(); i++) { String Object = ds_object.get(i).get("OBJECT")...if("".equals(Object)) continue; ... cnt++; }` — 처리대상 다중 지원 (콤마 split 결과만큼 sync 메서드 호출) | java:54~73 |
| 부수효과 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_save", cnt, null, true)` — 콜백에서 `strErrorMsg["cnt_save"]+"건 저장 되었습니다."` 메시지 사용 (xfdl:181) | java:75 |
| 오류 처리 | `catch(Exception e) → log + throw new IllegalTaskException(e)` | java:77~81 |
| 트랜잭션 경계 | `context.getDao()` 의 `TransactionalDao` — Wow 인터페이스 / OASIS BPMN 트랜잭션 (한 UserTask 단위) | java:11, 13, 14, 15, 16 |

### §7.2 `syncMasterCode` 메서드 — MASTER 처리유형 (java:94~193)

| 단계 | 로직 | 호출 SQL ID | 근거 |
|---:|---|---|---|
| (1) | `getMap.put("pMasterCode", Object)` → `dao.selectOne("CommSyncMngMapper.getCodeVer", getMap)` 으로 nextVer 추출 (Oracle NVL+0.1) | getCodeVer | java:99~100 |
| (2) | `setMap.put("CODE_VER", nextVer)` + `setMap.put(CactusConstants.MYBATIS_WHERE, "MASTER_CODE = '" + Object + "'")` → `dao.update("TB_MCM_CODE_MASTER_Mapper.update", setMap)` + `dao.update("TB_MCM_CODE_DETAIL_Mapper.update", setMap)` (SOURCE 의 CODE_VER UP) | TB_MCM_CODE_MASTER_Mapper.update / TB_MCM_CODE_DETAIL_Mapper.update (외부 Mapper — cactus 표준) | java:103~107 |
| (3) | **LOC 분기** (java:111~142): 2 중 for (j=0~1 → MCMAPUSER / MCM_BACKUP, k=0~2 → masterTable 3종) → setMap 빌드 → `dao.delete("deleteSourceData", setMap)` 조건부 호출 (`if(j==0 \|\| (j==1 && k!=1))` — 백업 스키마는 DETAIL 제외). 이후 동일 2중 for 로 `dao.insert("insertSourceData", setMap)` (MCM_SOURCE → MCMAPUSER, MCM_BACKUP) | deleteSourceData / insertSourceData | java:113~141 |
| (4) | **PRD 분기** (java:144~191): ds_main loop (j=0~ds_main.size()) → pDblinkTo = "@"+to3 (단 to3=="MEPP_MCM" 이면 "") / pSchemaTo = to4 → 2 중 for (k=0~masterTable.length, k=0~2) → setMap 빌드 → `dao.delete("deleteSourceData", setMap)` (조건 `if(!("".equals(pDblinkTo) && pSchemaTo.equals("MCM_BACKUP") && k==1))` — 같은 인스턴스 백업 DETAIL 제외). 이후 동일 ds_main loop 로 pDblinkFrom = "@"+from3, pDblink= from3 처리 후 `dao.insert("insertSourceData", setMap)` | deleteSourceData / insertSourceData | java:147~190 |

### §7.3 `syncRule` 메서드 — RULE / RULE_JUDGE 처리유형 (java:207~392)

| 단계 | 로직 | 호출 SQL ID | 근거 |
|---:|---|---|---|
| (1) **인천 RULE 차단** | `dao.selectList("selectMasterCodeData", { sCodeId="RULE_BAR_SYNC_LIST" })` 결과를 `stream().filter(x -> x.get("CODE_VAL").equals(Object)).findAny()` → present 이면 `throw new UserException("인천 업무기준 관리 대상입니다. \r\n[인천 MES]에서 이행 부탁드립니다.")` 차단 | selectMasterCodeData | java:213~226 |
| (2) version 추출 | `getMap.put("pRuleId", Object)` → ruleFlag (MCA/MCB) 분기로 `getRuleVer` 또는 `getJudgeRuleVer` 호출 | getRuleVer / getJudgeRuleVer | java:229~232 |
| (3) version up | try/catch — `setMap.put("RULE_VER", nextVer)` + `setMap.put(MYBATIS_WHERE, "RULE_ID = '" + Object + "'")` → `dao.update("TB_" + ruleFlag + "_RULE_MASTER_Mapper.update", setMap)` + `dao.update("TB_" + ruleFlag + "_RULE_COL_LIST_Mapper.update", setMap)` + setMap 의 WHERE 를 "1=1" 로 갱신 후 `dao.update("TB_" + ruleFlag + "_" + Object + "_Mapper.update", setMap)` 호출. catch 시 "존재하지 않는 업무기준 입니다." UserException | TB_{ruleFlag}_RULE_MASTER_Mapper.update / TB_{ruleFlag}_RULE_COL_LIST_Mapper.update / TB_{ruleFlag}_{Object}_Mapper.update (외부 Mapper — 동적 클래스명) | java:236~247 |
| (4) **LOC 분기** (java:250~314) | 2 중 for — table1 (arrTable[k]) 이 "TB_{ruleFlag}_" 와 같으면 table1 + Object 추가 (PK 없음 처리) → setMap 빌드 (pSchemaTo / pTableTo / pTable / pSchema / pWhere / pWhereClause). **As-Is delete/insert 모두 try/catch 로 감싸고 본체 호출 코드는 주석 처리되어 있음** (java:274 / 308) — 실 실행 없음 + `JDBC-8033` 에러 시 createTable 주석 (java:280) | deleteSourceData (주석) / insertSourceData (주석) | java:252~313 |
| (5) **PRD 분기** (java:315~390) | ds_main loop — pDblinkTo = "@"+to3 (단 to3=="MEPP_MCM" 이면 "") / pSchemaTo = to4 → table1 동적 결정 (TB_{ruleFlag}_ 동일 시 Object 붙임 + pWhere 빈 처리). setMap 빌드 후 try/catch 로 `dao.delete("deleteSourceData", setMap)` 조건부 (`if(!("".equals(pDblinkTo) && pSchemaTo.indexOf("BACKUP") > 0 && k==2))`). 이후 ds_main loop 로 `dao.insert("insertSourceData", setMap)` | deleteSourceData / insertSourceData | java:318~389 |

### §7.4 `syncNui` 메서드 — INTERFACE / FORMAT 처리유형 (java:399~504)

| 단계 | 로직 | 호출 SQL ID | 근거 |
|---:|---|---|---|
| (1) FORMAT 만 version up | `targetFlag == "FORMAT"` 분기 — `getFormatVer` 호출 → setMap 빌드 ("pFormatId" / "pDblinkTo=@DPMESA1_MCM" / "pTableTo=TB_MCM_MOM_FORMAT_LIST") → `dao.update("updateFormatVer", setMap)` → pTableTo 를 TB_MCM_MOM_FORMAT_LAYOUT 으로 변경 후 재호출 (FORMAT_VER PK 영향으로 화면 Mapper 사용 — 주석 java:419) → pWhere = "FORMAT_ID" | getFormatVer / updateFormatVer | java:404~424 |
| (1') INTERFACE 분기 | pWhere = "TRANSACTION_CODE" 만 세트 (version up ✗) | - | java:425~427 |
| (2) **LOC 분기** (java:430~459) | 2 중 for (j=0~1 → MCM_SOURCE / MCM_BACKUP, k=0~arrTable.length) → setMap 빌드 → `dao.delete("deleteSourceData", setMap)` 무조건 호출. 이후 동일 2 중 for 로 `dao.insert("insertSourceData", setMap)` (pSchema="MCMAPUSER" → pSchemaTo=MCM_SOURCE/MCM_BACKUP) | deleteSourceData / insertSourceData | java:432~458 |
| (3) **PRD 분기** (java:460~502) | ds_main loop — pDblinkTo = "@"+to3 / pSchemaTo = to4 → setMap 빌드 → 조건 `if(!("".equals(pDblinkTo) && pSchemaTo.equals("MCM_BACKUP") && "FORMAT".equals(targetFlag)))` 검사 후 `dao.delete("deleteSourceData", setMap)`. 이후 ds_main loop 로 `dao.insert("insertSourceData", setMap)` | deleteSourceData / insertSourceData | java:463~501 |

> **As-Is 버그 의심 (As-Is 그대로 보존)**: PRD insert 로직 java:486 `if(pDblinkFrom.equals("@MEPP_MCM")) pDblinkTo = "";` — 두 번째 if 에서 `pDblinkTo` 가 아닌 `pDblinkFrom` 을 비워야 정상으로 추정. As-Is 코드는 `pDblinkTo` 를 비우는 중복 처리. **§11.5 As-Is 보존 vs 수정 결정 = Q-004**.

### §7.5 `syncObj` 메서드 — OBJECT 처리유형 (java:506~564)

| 단계 | 로직 | 호출 SQL ID | 근거 |
|---:|---|---|---|
| (1) LOC 차단 | `if("LOC".equals(targetServer)) throw new UserException("DB링크로 인해 LOCAL에서 실행할 수 없습니다.")` | (없음) | java:514~516 |
| (2) **PRD 분기** (java:520~562) | ds_main loop → pDblinkFrom = "@"+from3 / pSchemaFrom = from4 / pDblinkTo = "@"+to3 / pSchemaTo = to4 ("@MEPP_MCM" 은 빈문자열). 2 중 for (k=0~ObjectTable.length 3종) → arrTable[k] == "TB_MCM_SEC_PERM" 분기로 pWhere="PERMISSION_ID" / pWhereClause="perm_" + Object + "_%" (LIKE 패턴). 그 외 pWhere="OBJECT_ID" / pWhereClause=Object. setMap 빌드 후 `dao.delete("deleteObjectData", setMap)` (LIKE delete) → setMap 재빌드 (pTable/pDblink/pSchema 추가) → `dao.insert("insertObjectData", setMap)` (LIKE insert) | deleteObjectData / insertObjectData | java:521~561 |

> **LOC 차단 (As-Is) — Q-005 해소 (2026-05-31)**: As-Is 정책으로 Oracle DB Link 의존으로 인해 LOC 차단. **To-Be (Q-005 해소)**: DB Link 폐기 (Q-002 해소) 로 차단 사유 ✗ → LOC 차단 폐기 (실행 허용). As-Is 코드 자체는 §10.5 인용 보존.

---

## §8. BPMN 워크플로우 전수 (`CommSyncMng.bpmn`)

> bpmn2:process id="CommSyncMng" name="동기화 관리" isExecutable="false" (bpmn:3)

### §8.1 노드 전수 (StartEvent / EndEvent / ExclusiveGateway / UserTask)

| ID (bpmn id) | 종류 | name | camunda class / sqlKey / resultKey | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | SequenceFlow_0v64ch1 | - | bpmn:7~9 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | 분기 (label) | extensionElements style shapeBackground="#ffff00" (노란색 강조, bpmn:11~13) | SequenceFlow_1 | 1 outgoing — SequenceFlow_0eh8isc (action `reg`) | bpmn:10~16 |
| UserTask_pwdinit (As-Is) → **UserTask_runSync (To-Be — Q-006 해소)** | userTask | 동기화 관리 | modelerTemplate=`com.dongkuk.dmes.UserTask`, class=`#{basePackage}SaveCommSyncMng`, nextBranchSpel="" (비분기 단일 종료) | SequenceFlow_0eh8isc | SequenceFlow_0v64ch1 | bpmn:19~28 |

> **UserTask id 해소 (Q-006 — 2026-05-31)**: As-Is id `UserTask_pwdinit` 은 다른 화면 (비밀번호 초기화) BPMN 복사 흔적. **To-Be 개명: `UserTask_runSync`** (의미있는 명명). camunda class `#{basePackage}SaveCommSyncMng` 유지. BPMN .bpmn 파일 정정은 후속 위임 (본 갱신 사이클은 .md 산출물만).

### §8.2 SequenceFlow 전수 (총 3 개)

| sequenceFlow id | name (action 분기) | sourceRef (As-Is / To-Be) | targetRef (As-Is / To-Be) | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | bpmn:17 |
| SequenceFlow_0eh8isc | **reg** | ExclusiveGateway_1 | UserTask_pwdinit (As-Is) → **UserTask_runSync (To-Be)** | bpmn:18 |
| SequenceFlow_0v64ch1 | - | UserTask_pwdinit (As-Is) → **UserTask_runSync (To-Be)** | EndEvent_1 | bpmn:29 |

### §8.3 action 1 분기 — 흐름 요약

| action | 분기 sequenceFlow | 흐름 (전체 — To-Be 명명) |
|---|---|---|
| reg | SequenceFlow_0eh8isc | Start → Gateway → **UserTask_runSync** (SaveCommSyncMng.java — 6 처리유형 내부 분기) → End |

> BPMN node 합계 = StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + UserTask 1 = 4 노드. SequenceFlow 3 개.
>
> **본 화면 BPMN 의 특이점**: 일반적인 MES 화면은 search / save 등 2~6 action 분기를 BPMN 에 등록하나, 본 화면은 단일 action `reg` 만 보유 + 모든 처리 분기 (6 처리유형 → 4 sync 메서드 → 12 SQL 호출) 가 **Java 코드 내부 if/else 로 구현**. BPMN 은 사실상 단일 진입점 라우터.

---

## §9. 사용 테이블 카탈로그 (As-Is Mapper.xml + Java 동기화 대상 + To-Be cactus-core 통합)

> **본 화면의 특수성**: 본 화면은 일반적인 CRUD 화면이 아닌 **메타 동기화 화면**이다. 직접 조회하는 테이블 (Mapper.xml) 과 **동기화 대상 테이블** (Java `arrTable`) 이 분리된다.
>
> **스키마 정본 (DMES Excel 기준)** = `MCMAPUSER.TB_MCM_*` / `MCAAPUSER.TB_MCA_*` / `MCBAPUSER.TB_MCB_*` (Excel 기준 owner). As-Is Mapper.xml 의 `MCM_SOURCE.TB_MCM_*` / `MCA_SOURCE.TB_MCA_*` / `MCB_SOURCE.TB_MCB_*` 는 **Oracle synonym** (실 owner = `MCMAPUSER` / `MCAAPUSER` / `MCBAPUSER`).
>
> **To-Be 정책 (사용자 결정)**:
> - **스키마**: As-Is 테이블명 그대로 보존 (대문자 prefix 유지) — MSSQL `sample_dmes` DB 단일 스키마로 통합 (Oracle DB Link 폐기 — §11.2 명시)
> - **본 화면은 데이터 동기화만 수행** — audit 컬럼은 SOURCE 행 그대로 복사 + 동기화 시점의 `U_USR_ID` / `U_AT` 만 본 화면 사용자/시각으로 덮어쓰기 (Q-008 결정)

### §9.1 본 화면 직접 사용 테이블 (Mapper.xml + version up)

> **본 화면 책임 범위 결정 (Q-001 해소 / 2026-05-31 사용자 결정)**: 본 commSyncMng 화면이 직접 책임지는 **본 화면 책임 = MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL — cma 정본 schema = `MCM_SOURCE`)** 만이다. 나머지 13 테이블 (RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT 5 그룹) 은 후속 도메인 화면 책임으로 위임 (Q-009 해소 동치).

| 테이블 | 스키마 (As-Is / To-Be) | 사용 SQL ID | 역할 | 본 화면 책임 | 근거 |
|---|---|---|---|---|---|
| TB_MCM_CODE_MASTER | **MCM_SOURCE** (cma 정본 schema — masterCodeMng §9.1 동치) | getCodeVer (select) + TB_MCM_CODE_MASTER_Mapper.update (cactus 표준) | 마스터 코드 마스터 — CODE_VER UP (소수점 +0.1 증분) | **본 화면 책임 ✓** | xml:13~17 / java:100 / java:106 |
| TB_MCM_CODE_DETAIL | **MCM_SOURCE** (cma 정본) | TB_MCM_CODE_DETAIL_Mapper.update (cactus 표준) | 마스터 코드 상세 — CODE_VER UP (Master 동시 갱신) | **본 화면 책임 ✓** | java:107 |
| TB_MCM_CODE_CATEGORY | **MCM_SOURCE** (cma 정본) | (Java arrTable 만 — 본 화면 직접 SQL ✗) | 마스터 코드 카테고리 — SOURCE→TARGET 단순 복사 (`INSERT INTO ... SELECT *`) | **본 화면 책임 ✓** | java:36 masterTable[2] |
| TB_MCA_RULE_MASTER | MCA_SOURCE → MCAAPUSER | getRuleVer (select) + TB_MCA_RULE_MASTER_Mapper.update | RULE 마스터 — RULE_VER UP | **✗ 후속 도메인 화면 책임 (RULE 관리 — Q-009)** | xml:19~23 / java:231 / java:238 |
| TB_MCB_RULE_MASTER | MCB_SOURCE → MCBAPUSER | getJudgeRuleVer (select) + TB_MCB_RULE_MASTER_Mapper.update | RULE_JUDGE 마스터 — RULE_VER UP | **✗ 후속 도메인 화면 책임 (RULE_JUDGE 관리 — Q-009)** | xml:25~29 / java:232 / java:238 |
| TB_MCA_RULE_COL_LIST | MCA_SOURCE → MCAAPUSER | TB_MCA_RULE_COL_LIST_Mapper.update | RULE 컬럼 리스트 (Master 동시 갱신) | **✗ 후속 위임** | java:239 |
| TB_MCB_RULE_COL_LIST | MCB_SOURCE → MCBAPUSER | TB_MCB_RULE_COL_LIST_Mapper.update | RULE_JUDGE 컬럼 리스트 | **✗ 후속 위임** | java:239 |
| TB_MCA_{Object} | MCA_SOURCE → MCAAPUSER | TB_MCA_{Object}_Mapper.update (동적 클래스) | RULE 본 데이터 (동적 테이블 — RULE_ID 가 곧 테이블명 suffix) | **✗ 후속 위임** | java:241 |
| TB_MCB_{Object} | MCB_SOURCE → MCBAPUSER | TB_MCB_{Object}_Mapper.update (동적 클래스) | RULE_JUDGE 본 데이터 (동적 테이블) | **✗ 후속 위임** | java:241 |
| TB_MCM_MOM_FORMAT_LIST | MCMAPUSER (직접) | getFormatVer (select) + updateFormatVer (update) | FORMAT 리스트 — FORMAT_VER UP (PK 영향으로 화면 Mapper 사용 — As-Is 주석 xml:37) | **✗ 후속 도메인 화면 책임 (FORMAT 관리 — Q-009)** | xml:31~35 / xml:37~42 / java:407 / java:419 |
| TB_MCM_MOM_FORMAT_LAYOUT | MCMAPUSER (직접) | updateFormatVer (재호출 — pTableTo 변경) | FORMAT 레이아웃 — FORMAT_VER UP | **✗ 후속 위임** | java:421~422 |
| TB_MCM_MOM_TC_LIST | MCMAPUSER | (Java arrTable 만) | INTERFACE TC 리스트 — SOURCE→TARGET 단순 복사 | **✗ 후속 도메인 화면 책임 (INTERFACE 관리 — Q-009)** | java:39 InterfaceTable[0] |
| TB_MCM_MOM_INTERFACES | MCMAPUSER | (Java arrTable 만) | INTERFACE 정의 — SOURCE→TARGET 단순 복사 | **✗ 후속 위임** | java:39 InterfaceTable[1] |
| TB_MCM_SEC_OBJ | MCMAPUSER | (Java arrTable 만) | 권한 OBJECT — LIKE 복사 | **✗ 후속 도메인 화면 책임 (commObjMng — Q-009)** | java:41 ObjectTable[0] |
| TB_MCM_SEC_MENU | MCMAPUSER | (Java arrTable 만) | 권한 MENU — LIKE 복사 | **✗ 후속 도메인 화면 책임 (commMenuMng — Q-009)** | java:41 ObjectTable[1] |
| TB_MCM_SEC_PERM | MCMAPUSER | (Java arrTable 만 — PERMISSION_ID LIKE prefix 매치) | 권한 PERM — LIKE 복사 | **✗ 후속 도메인 화면 책임 (commPermMng — Q-009)** | java:41 ObjectTable[2] |
| TB_MCM_SEC_USER | (스키마 명시 없음 — 본 화면 사용 X — selectCommUser 미호출) | selectCommUser (미호출) | (미사용 SQL) | **✗ To-Be 제거** | xml:7~11 |
| VI_MCM_CODE_ACCESS | **`MCMAPUSER.VI_MCM_CODE_ACCESS`** (cma 정본 — masterCodeSelPop §11.2 동치, Q-003 해소) | selectMasterCodeData | 인천 관리 RULE 차단 대상 조회 (CODE_ID="RULE_BAR_SYNC_LIST" 의 CODE_VAL 리스트) | **본 화면 read 사용** (cma 4 화면 정본 재사용) | xml:87~108 / java:217 |

> **본 화면 책임 (To-Be Entity 재사용 결정)**: 본 화면이 직접 책임지는 MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL) 의 JPA Entity 는 **본 화면이 자체 Entity 작성 ✗ — cma 4 화면 (masterCodeMng) 이 이미 등재한 Entity 를 재사용** 한다 (2026-05-31 사용자 결정 정책 #6 (A)). 위치: `com.dongkuk.dmes.mcm.entity.{TbMcmCodeMaster|TbMcmCodeCategory|TbMcmCodeDetail}` (가이드 §3-1 모듈 직속).

### §9.2 본 화면 동기화 대상 테이블 (Java `arrTable` — 동기화 SOURCE→TARGET 단순 복사)

| 처리유형 | arrTable (java:36~41) | 대상 테이블 | 비고 |
|---|---|---|---|
| MASTER | masterTable[0~2] | TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL / TB_MCM_CODE_CATEGORY | 3 테이블 SOURCE→TARGET 복사 |
| RULE | ruleTable[0~2] | TB_MCA_RULE_MASTER / TB_MCA_RULE_COL_LIST / TB_MCA_{Object} | 동적 테이블 포함 |
| RULE_JUDGE | ruleJudgeTable[0~2] | TB_MCB_RULE_MASTER / TB_MCB_RULE_COL_LIST / TB_MCB_{Object} | 동적 테이블 포함 |
| INTERFACE | InterfaceTable[0~1] | TB_MCM_MOM_TC_LIST / TB_MCM_MOM_INTERFACES | 2 테이블 |
| FORMAT | FormatTable[0~1] | TB_MCM_MOM_FORMAT_LIST / TB_MCM_MOM_FORMAT_LAYOUT | 2 테이블 |
| OBJECT | ObjectTable[0~2] | TB_MCM_SEC_OBJ / TB_MCM_SEC_MENU / TB_MCM_SEC_PERM | 3 테이블 (PERM 은 LIKE) |

> **합계**: 마스터+RULE+RULE_JUDGE+INTERFACE+FORMAT+OBJECT = 3+3+3+2+2+3 = **16 테이블 그룹** (RULE/RULE_JUDGE 의 마지막 2 개는 동적 테이블) — 본 화면 처리 영향 테이블 수.

### §9.3 컬럼 1:1 전수 (§17.2 동치 — 본 화면 사용 컬럼)

> **본 화면은 동기화 화면이므로 직접 조회/편집 컬럼이 한정적이다**. 본 §9.3 은 본 화면 SQL 에서 직접 참조되는 컬럼만 전수.

#### §9.3.1 TB_MCM_CODE_MASTER (직접 참조 컬럼)

| 컬럼명 | 자료형 | NULL | 본 화면 사용 | 근거 | To-Be 보존 |
|---|---|---|---|---|---|
| MASTER_CODE | VARCHAR2 | N | WHERE 키 (xml:16) | xml:15 | Y (As-Is 보존) |
| CODE_VER | NUMBER | N | SELECT MAX(CODE_VER)+0.1 (xml:14) + UPDATE (java:103) | xml:14 / java:103 | Y |

#### §9.3.2 TB_MCA_RULE_MASTER (직접 참조 컬럼)

| 컬럼명 | 자료형 | NULL | 본 화면 사용 | 근거 | To-Be 보존 |
|---|---|---|---|---|---|
| RULE_ID | VARCHAR2 | N | WHERE 키 (xml:22) | xml:22 | Y |
| RULE_VER | NUMBER | N | SELECT MAX(RULE_VER)+0.1 (xml:20) + UPDATE (java:236) | xml:20 / java:236 | Y |

#### §9.3.3 TB_MCB_RULE_MASTER (직접 참조 컬럼)

| 컬럼명 | 자료형 | NULL | 본 화면 사용 | 근거 | To-Be 보존 |
|---|---|---|---|---|---|
| RULE_ID | VARCHAR2 | N | WHERE 키 (xml:28) | xml:28 | Y |
| RULE_VER | NUMBER | N | SELECT MAX(RULE_VER)+0.1 (xml:26) + UPDATE (java:236) | xml:26 / java:236 | Y |

#### §9.3.4 TB_MCM_MOM_FORMAT_LIST (직접 참조 컬럼)

| 컬럼명 | 자료형 | NULL | 본 화면 사용 | 근거 | To-Be 보존 |
|---|---|---|---|---|---|
| FORMAT_ID | VARCHAR2 | N | WHERE 키 (xml:34 / xml:41) | xml:34 / xml:41 | Y |
| FORMAT_VER | NUMBER | N | SELECT MAX(FORMAT_VER)+0.1 (xml:32) + UPDATE (xml:39) | xml:32 / xml:39 | Y |

#### §9.3.5 VI_MCM_CODE_ACCESS (뷰 — selectMasterCodeData 사용 컬럼)

| 컬럼명 | 자료형 | NULL | 본 화면 사용 | 근거 | To-Be 보존 |
|---|---|---|---|---|---|
| CODE_ID | VARCHAR2 | N | SELECT + WHERE (xml:88 / xml:97) | xml:88 / xml:97 | Y |
| CODE_NM | VARCHAR2 | Y | SELECT (xml:89) | xml:89 | Y |
| CODE_VAL | VARCHAR2 | N | SELECT + WHERE (xml:90 / xml:100) | xml:90 / xml:100 | Y |
| CODE_VAL_MEAN | VARCHAR2 | Y | SELECT (xml:91) | xml:91 | Y |
| CATEGORY_ID | VARCHAR2 | N | SELECT + WHERE (xml:92 / xml:103) | xml:92 / xml:103 | Y |
| CATEGORY_NM | VARCHAR2 | Y | SELECT (xml:93) | xml:93 | Y |

#### §9.3.6 동기화 대상 16 테이블 그룹의 컬럼 (`INSERT INTO ... SELECT *` 처리)

> **본 화면은 동기화 대상 테이블의 모든 컬럼을 SELECT \* / INSERT \* 로 일괄 복사한다** (Mapper.xml `insertSourceData` xml:57~58 / `insertObjectData` xml:72~73). 컬럼 정의 책임은 다음과 같이 분할된다 (2026-05-31 사용자 결정 — Q-001 / Q-009 해소).
>
> **본 화면 책임 (MASTER 3 테이블 — Entity 는 cma 4 화면 재사용)**:
> - **TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL / TB_MCM_CODE_CATEGORY**: `docs/mcm/design/masterCodeMng/masterCodeMng_분석리포트.md §9.1~§9.3` 33+30+21 컬럼 전수 — cma 4 화면 정본 재사용. 본 commSyncMng 화면은 자체 Entity 작성 ✗ (정책 #6 (A))
>
> **후속 도메인 화면 책임 (13 테이블 위임 — Q-009 해소)**:
> - **TB_MCA_RULE_MASTER / TB_MCA_RULE_COL_LIST / TB_MCA_{Object}**: 후속 RULE 관리 화면 (`mcaRuleMng` 등 신규 도메인 화면 — 본 mui 자산 미동봉) 책임으로 위임
> - **TB_MCB_RULE_MASTER / TB_MCB_RULE_COL_LIST / TB_MCB_{Object}**: 후속 RULE_JUDGE 관리 화면 (`mcbRuleJudgeMng` 등) 책임으로 위임
> - **TB_MCM_MOM_TC_LIST / TB_MCM_MOM_INTERFACES**: 후속 INTERFACE 관리 화면 (`mcmInterfaceMng` 등) 책임으로 위임
> - **TB_MCM_MOM_FORMAT_LIST / TB_MCM_MOM_FORMAT_LAYOUT**: 후속 FORMAT 관리 화면 (`mcmFormatMng` 등) 책임으로 위임
> - **TB_MCM_SEC_OBJ / TB_MCM_SEC_MENU / TB_MCM_SEC_PERM**: 후속 도메인 화면 (commObjMng / commMenuMng / commPermMng — 본 모듈 csa 그룹 동시 작업 중) 책임으로 위임
>
> > **참고**: 본 화면은 위 13 테이블에 대한 SOURCE→TARGET 단순 복사 (INSERT INTO ... SELECT \*) 만 수행하므로 컬럼 정의 누락 시에도 본 화면 기능에는 영향 ✗ (전수 컬럼이 SELECT \* 로 자동 처리). 단, MSSQL `sample_dmes` 단일 DB 전환 후에는 SOURCE = TARGET 동일 schema 인 경우 동기화 자체가 No-op 이 되므로, 후속 도메인 화면 책임자가 실제 동기화 시나리오 (백업 / 환경 간 이행) 정의 필요.

---

## §10. xfdl Script 전수 (자유 서술 ✗ — 표 분해는 §4.4 / 본 §10 은 핵심 로직 인용)

> 본 §10 은 §4.4 (메서드 28 표) 와 중복되지 않는 **핵심 코드 인용**만 등재 — As-Is 1:1 보존 우선.

### §10.1 fn_button — 사용자정의 + 기본 버튼 등록 (xfdl:99~104)

```javascript
this.fn_button = function()
{
 	this.div_title.form.div_topMenu.form.fn_commonTop_onload(this, 
															new Array(["btn_sync","fn_sync", "이행","btn_WF_Point, btn_WF_confirm"]), 	//사용자정의버튼
															new Array(/*["btn_search"], ["btn_reg"],*/ ["btn_close"]));	//기본버튼
};
```

> 사용자정의 1개 (`btn_sync` → fn_sync 호출, text "이행", cssclass Point+Confirm) + 기본 1개 (`btn_close`). 주석 (`["btn_search"], ["btn_reg"]`) 은 다른 화면 복사 흔적.

### §10.2 fn_sync — 동기화 실행 (xfdl:121~168)

> §4.4 # 5 + §4.5 참고. 핵심 분기:

```javascript
// OBJECT 처리유형 사전 검증
if(this.div_search.form.cbo_SyncTarget.value == "OBJECT" && !this.div_search.form.edt_Target.value.includes("::")) { 
	this.gfn_message("", "", "OBJECT FULLNAME을 입력해주세요. \n ex)csa::CommSyncMng", "error", "", ""); 
	return;
}

// CHK==1 행만 ROWTYPE_INSERT (서버 ds_main:U 전송 대상)
this.ds_main.set_updatecontrol(false);
for(i=0; i<this.ds_main.getRowCount(); i++) {
	if(this.ds_main.getColumn(i,"CHK") == 1) this.ds_main.setRowType(i, Dataset.ROWTYPE_INSERT);
	else this.ds_main.setRowType(i, Dataset.ROWTYPE_NORMAL);
}
this.ds_main.set_updatecontrol(true);

this.gfn_transaction(sSvcID, sUrl, sInDatasets, sOutDatasets, sArgument);
```

> sSvcID="reg", sInDatasets="ds_object=ds_object ds_main=ds_main:U", sOutDatasets="", sArgument=`pSyncTarget=cbo_SyncTarget.value`

### §10.3 div_search_cbo_SyncTarget_onitemchanged — 자동 행 선택 (xfdl:191~246)

> 처리유형별 targetid prefix 2글자 매칭 + OBJECT 만 to2=="가동" 추가 조건:

```javascript
// 마스터코드 동기화 제한 제거 21.05.21 김민석 — 주석 (xfdl:123 동일)
if(this.div_search.form.cbo_SyncTarget.value == "MASTER") {
	for(i=0; i<this.ds_main.rowcount; i++) {
		if(this.ds_main.getColumn(i,"targetid").substring(0,2) == "MA") {
			this.ds_main.setColumn(i,"CHK",1);
		}else{
			this.ds_main.setColumn(i,"CHK",0);
		}
	}
}
// RULE → "RA" / RULE_JUDGE → "RB" / INTERFACE → "NU" / FORMAT → "NU" / OBJECT → "NU" + to2=="가동"
```

### §10.4 fn_callBack — 콜백 메시지 처리 (xfdl:171~189)

```javascript
switch(strSvcId)
{
	case "reg" :  
		if(nErrorCode == 0){
			if(strErrorMsg["cnt_save"]=='0') {
				this.gfn_message("", "", "데이터 이행 미처리 되었습니다.", "warning", "", "");
				return;
			}
			this.gfn_commonBottomStatus_msg(strErrorMsg["cnt_save"]+ "건 저장 되었습니다.");
			this.gfn_message("", "", "데이터 이행 정상완료 되었습니다.", "info", "", "");
			
		}else{
			this.gfn_commonBottomStatus_msg(strErrorMsg);
		}
	    break;
}
```

> cnt_save 0 건 → warning / 그 외 → info + bottom status. error 시 status bar 에만 표시 (modal 다이얼로그 ✗).

### §10.5 주석 코드 / 주석 잔존 항목 — As-Is 1:1 보존 등재

| 위치 | 주석 내용 | 본문 분석 결정 |
|---|---|---|
| xfdl:110~117 | `fn_search` 함수 본체 전체 주석 — `var sSvcID = "search"; var sUrl = ""; var sInDatasets = "ds_srch=ds_srch"; var sOutDatasets = "ds_grdMain=ds_GetMasterRuleData"; var sArgument = this.gfn_setParam("pTable", "TB_MCA_"+this.div_search.form.edt_ruleId.value); var sCallbackFunc = "fn_callBack";` | 본 화면 search action 미사용 (Mapper.xml `GetMasterRuleData` 미정의 + xfdl 의 `div_search.form.edt_ruleId` 미정의) → To-Be 제거 |
| xfdl:123 | "21.05.21 마스터코드 동기화 제한 제거 김민석" — 이전 차단 코드 주석 처리 | As-Is 정책 (MASTER 도 일반 사용자 이행 가능 + 임시등록 21.01.18 최규찬) — As-Is 보존 |
| xfdl:124 | "if(cbo_SyncTarget.value == 'MASTER') { gfn_message('', '', '시스템 담당자에게 문의하세요.', 'error', '', ''); return; } // 임시등록 21.01.18 최규찬" — 주석 처리 | (위와 동일) |
| xfdl:193~197 | div_search_cbo_SyncTarget_onitemchanged 의 테스트 코드 5 줄 (`/* 테스트 ... edt_Target.set_value("MPPAP999") */`) | 테스트 코드 — To-Be 제거 |
| java:36~41 | 6 처리유형 테이블 그룹 상수 — String[] 배열 6 개 | As-Is 1:1 보존 |
| java:148~149 / 166~168 | "befSrouce / aftSrouce" 변수 (오타: Srouce = Source) 주석 — from 스키마+링크 동일 시 skip 로직 주석화 | As-Is 그대로 보존 (이행 시 중복 호출 허용 정책) |
| java:265~287 / 308 | syncRule LOC 분기의 `dao.delete` / `dao.insert` 본체 호출 모두 주석 처리 (`// if(j==0 \|\| (j==1 && k!=2)) dao.delete(...)`) | RULE 의 LOC 환경 동기화는 As-Is 비활성 — 본 화면은 PRD 환경 전용 — Q-005 |
| java:274 / 280 / 350 | createTable 호출 주석 (JDBC-8033 에러 시 fallback 으로 추가했었으나 비활성) | As-Is 비활성 — To-Be 도 비활성 |
| java:412 / 413 | updateFormatVer 의 Table Mapper 호출 주석 (FORMAT_VER PK 영향으로 화면 Mapper 사용) | As-Is 그대로 — updateFormatVer 화면 Mapper 사용 유지 |

---

## §11. To-Be 변환점 (Oracle → MSSQL sample_dmes + cactus-core + 동기화 정책 변환)

### §11.0 Q-NNN 10 건 일괄 해소 결정표 (2026-05-31 사용자 결정)

| Q-ID | 분류 | 결정 | 본문 반영 위치 |
|---|---|---|---|
| Q-001 | 데이터 카탈로그 / 화면 책임 | **MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL — schema = `MCM_SOURCE`) 만 본 화면 책임. 나머지 13 테이블은 후속 도메인 화면 책임 위임** | §9.1 / §9.3.6 정정 |
| Q-002 | DB 엔진 (Oracle DB Link → MSSQL) | **Oracle DB Link 3종 (`@MEPP_MCM` / `@DPMESA1_MCM` / `@TSTMPH_MCM`) 전부 폐기. 단일 MSSQL `sample_dmes` 환경 — DB Link 변수 (`${pDblinkTo}` / `${pDblink}` / `${pDblinkFrom}`) 는 As-Is Mapper.xml + Java 본문 그대로 보존 + 런타임 값은 빈문자열 고정. 화면은 존속.** | §11.1 / §11.2 정정 + §6 Mapper.xml As-Is 보존 + To-Be 변환점 명시 |
| Q-003 | View DDL | **VI_MCM_CODE_ACCESS 는 cma 4 화면 정본 재사용 — `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (cma masterCodeSelPop §11.2 정본 DDL). `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 멱등 적재 (2026-05-29 cma 이미 완료).** | §6 # 13 / §9.1 / §11.4 정정 |
| Q-004 | As-Is 의심 버그 | **DB Link 폐기로 인해 java:486 의 `if(pDblinkFrom.equals("@MEPP_MCM")) pDblinkTo = "";` 코드 자체가 의미 ✗ (모든 pDblink* 변수가 빈문자열로 고정). To-Be 에서 자연 무력화 — As-Is 인용은 §10.5 표 보존.** | §11.5 정정 (Q-004 닫음) |
| Q-005 | LOC 환경 처리 정책 | **MSSQL `sample_dmes` 단일 DB 환경에서는 LOC 분기가 유일 실 동작 분기로 유지 (PRD 분기는 ds_main loop + DB Link 의존이므로 사실상 No-op). 기존 LOC 차단 (syncObj LOC 차단) 도 DB Link 의존 사유 ✗ → LOC 차단 폐기.** | §11.2 정정 + §11.5 + §7.3 / §7.5 As-Is 코드 인용 보존 |
| Q-006 | BPMN id 명명 | **`UserTask_pwdinit` → `UserTask_runSync` 개명 (의미있는 명명). camunda class `#{basePackage}SaveCommSyncMng` 유지.** | §8.1 / §11.7 정정 / BPMN 설계서 §2 / §5.1 / §7 동치 |
| Q-007 | 패키지 경로 | **`com.dongkuk.dmes.mcm.csa.commSyncMng.{service\|dto}` (mcm 모듈 + csa 그룹 + commSyncMng 화면 + 클래스 분리)**. Entity 는 본 화면 자체 작성 ✗ — cma 4 화면 (masterCodeMng) entity (`com.dongkuk.dmes.mcm.entity.TbMcmCode{Master\|Category\|Detail}`) 재사용 (정책 #6 (A)). | §7.1 정정 + 분석/BPMN 패키지 명시 |
| Q-008 | audit 처리 정책 | **(b) 안 — SOURCE → TARGET INSERT (`INSERT INTO ... SELECT *`) 직후 별도 UPDATE 로 `U_USR_ID` / `U_AT` / `U_SVC_ID="commSyncMng"` / `U_PGM_ID="commSyncMng"` 덮어쓰기. C_* 는 SOURCE 보존. JPA `@PreUpdate` 대신 명시 UPDATE — cactus-core 자동 채움.** | §11.3 / §11.6 정정 |
| Q-009 | 16 테이블 그룹 화면 매핑 | **위 Q-001 결정과 동치 — 13 후속 위임 테이블의 원천 화면은 별도 도메인 화면 (`mcaRuleMng` / `mcbRuleJudgeMng` / `mcmInterfaceMng` / `mcmFormatMng` / commObjMng / commMenuMng / commPermMng) 에서 정의. 본 화면 책임 외.** | §9.3.6 정정 |
| Q-010 | 화면 존속 여부 | **(c) 안 — 화면 존속. 단일 MSSQL 환경 전환 후에도 LOC ↔ 백업 schema (`MCM_SOURCE` ↔ `MCM_BACKUP` 등) 간 동기화 + 메타 카탈로그 형태 유지로 화면은 보존. PRD 분기는 LOC 단일 분기로 합치되, As-Is 코드 분기 구조는 §7 그대로 인용 보존.** | §11.8 정정 |

> **Q 활성 합계 = 0** — 본 §12 의 10건 모두 본 §11.0 으로 해소. §12 에는 ~~취소선~~ + 해소 사유 + 활성 0 명시.

### §11.1 DB 엔진 변환 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | To-Be (MSSQL sample_dmes) | 영향 SQL | 결정 |
|---|---|---|---|---|
| `NVL(MAX(X) + 0.1, 1)` | Oracle NVL + 0.1 증분 | `ISNULL(MAX(X) + 0.1, 1)` | getCodeVer / getRuleVer / getJudgeRuleVer / getFormatVer (4 SQL) | NVL → ISNULL 치환 (decimal 결과 보존) |
| `SYSDATE` | Oracle SYSDATE | `GETDATE()` | (본 화면 Mapper 내 직접 사용 없음 — ref_Audit 호출 1 회만 xml:40) | GETDATE() 또는 cactus-core `@PreUpdate` 자동 |
| `${pSchema}.${pTable}${pDblink}` | Oracle DB Link (`@DPMESA1_MCM` 등) | **단일 MSSQL `sample_dmes` — DB Link 폐기. `${pDblink}` / `${pDblinkFrom}` 변수는 As-Is Mapper.xml + Java 본문 그대로 보존 + 런타임 값은 빈문자열 고정** (Q-002 해소) | deleteSourceData / insertSourceData / deleteObjectData / insertObjectData / selectObjectData (5 SQL) + 동기화 본체 12 SQL 모두 | **Q-002 해소** — DB Link 3종 폐기 (As-Is 코드/변수 보존 + 빈값 고정) |
| `${pSchemaTo}.${pTableTo}${pDblinkTo}` | (위와 동일) | (위와 동일 — `${pDblinkTo}` 빈값 고정) | (위와 동일) | (위와 동일 Q-002 해소) |
| `<include refid="ref_Audit.update">` | Oracle 표준 audit 컬럼 17 개 | cactus-core `CactusAuditEntity` 9 컬럼 + JPA `@PreUpdate` | updateFormatVer (xml:40) | ref_Audit 1 회 호출 폐기 + JPA 자동 (Q-008 결합) |
| Oracle `1=2` (createTable AS SELECT) | DDL via Mapper | MSSQL `SELECT INTO` (CREATE TABLE 별도) | createTable (As-Is 미호출 → To-Be 제거) | createTable 제거 |
| Oracle `LIKE` (이중바이트 검색) | LIKE | MSSQL `LIKE` (동일) | deleteObjectData / insertObjectData (PERMISSION_ID LIKE) | 동일 — 변경 없음 |

### §11.2 Oracle DB Link 폐기 정책 = Q-002 해소 (2026-05-31 사용자 결정)

| 항목 | As-Is (Oracle DB Link) | To-Be (MSSQL `sample_dmes` 단일 DB) | 결정 |
|---|---|---|---|
| 운영계 → 가동/개발/테스트계 데이터 이관 | `@MEPP_MCM` (가동, 빈문자열) / `@DPMESA1_MCM` (개발) / `@TSTMPH_MCM` (테스트) DB Link | **DB Link 3종 전부 폐기**. 단일 MSSQL `sample_dmes` schema 간 직접 INSERT-SELECT (`INSERT INTO MCM_SOURCE.TB_MCM_CODE_MASTER SELECT * FROM MCMAPUSER.TB_MCM_CODE_MASTER` 등) | **Q-002 해소** — DB Link 폐기 |
| Mapper.xml `${pDblinkTo}` / `${pDblink}` / `${pDblinkFrom}` 변수 | As-Is 변수 치환 | **As-Is 변수 자체는 Mapper.xml + Java 본문 그대로 보존 (As-Is 1:1 인용 보존 원칙)** + **런타임 값은 빈문자열 (`""`) 고정** — 변수가 SQL 본문에서 사라지는 결과 | As-Is 보존 + 빈값 고정 |
| Java `pDblinkTo = "@" + to3` (단 to3=="MEPP_MCM" 이면 빈문자열 — java:147~150 등) | DB Link prefix 부여 | **단일 MSSQL 환경 — `pDblinkTo` / `pDblinkFrom` 항상 빈문자열 (`""`)** 으로 고정 처리 | java 코드 To-Be 적용 시 `pDblinkTo = ""` / `pDblinkFrom = ""` 고정 (java:148~149 의 if 분기 자연 무력화 — Q-004 해소 동치) |
| LOC ↔ PRD 분기 | 서버 환경 분기 | **LOC 분기가 유일 실 동작 분기로 유지** (PRD 분기는 DB Link 의존이므로 사실상 No-op 이나 As-Is 코드 분기 구조는 §7 그대로 보존). syncObj 의 LOC 차단 폐기 (DB Link 의존 사유 ✗) | **Q-005 해소** — LOC 분기 유일화 |

> **본 화면의 정체성 결정 (Q-010 해소)**: 화면 **존속**. 단일 MSSQL `sample_dmes` 환경에서도 schema 간 (예: `MCM_SOURCE` ↔ `MCMAPUSER` ↔ `MCM_BACKUP`) 메타 동기화 시나리오로 정체성 유지. ds_main 16 행 정적 매트릭스 + 6 처리유형 분기 + 4 sync 메서드는 As-Is 1:1 보존.

### §11.3 cactus-core ref_Audit 폐기

| 항목 | As-Is | To-Be |
|---|---|---|
| audit 컬럼 수 | 17 (생성자 4 + 수정자 4 + 만료 4 + 아카이브 4 + 버전 1) | 9 (cactus-core CactusAuditEntity) — 단, 본 화면은 SOURCE→TARGET `INSERT INTO ... SELECT *` 단순 복사이므로 cactus 자동 채움이 동작하지 않음. §11.6 (b) 안 결정으로 별도 UPDATE 수행 |
| Mapper.xml `<include refid="ref_Audit.update">` 호출 | 1 회 (xml:40 updateFormatVer) | 0 (JPA `@PreUpdate` 자동 또는 명시 UPDATE) |
| insert_item / insert_value | 본 화면 사용 ✗ | (cactus-core `@PrePersist` 자동 — 단, 본 화면 적용 ✗ (Bulk INSERT 우회)) |

> **본 화면의 INSERT 는 SOURCE → TARGET `INSERT INTO ... SELECT *` 단순 복사**. SOURCE 의 audit 컬럼이 그대로 복사되며, JPA `@PrePersist` 가 동작하지 않으므로 §11.6 (b) 안으로 결정 — 동기화 시점의 `U_USR_ID` / `U_AT` / `U_SVC_ID="commSyncMng"` / `U_PGM_ID="commSyncMng"` 별도 명시 UPDATE 적용 (Q-008 해소).

### §11.4 동적 SQL `${}` 치환 SQL Injection 위험

| As-Is 위험 | 영향 SQL | To-Be 대응 |
|---|---|---|
| `${pSchemaTo}` / `${pTableTo}` / `${pDblinkTo}` / `${pSchema}` / `${pTable}` / `${pDblink}` 가 사용자 input 으로 결정되지는 않으나, ds_main 정적 데이터셋 + xfdl/edt_Target 입력값이 일부 결정. **단, Q-002 해소로 `${pDblink*}` 변수는 빈문자열 고정 — 실 위험은 schema/table 변수만 남음.** | deleteSourceData / insertSourceData / deleteObjectData / insertObjectData / selectObjectData / updateFormatVer | **화이트리스트 검증 추가** — 처리유형별 허용 테이블 / 허용 스키마 만 정규식 검증 후 ${} 치환. edt_Target 은 `[A-Z0-9_]+(::[A-Z0-9_]+)?` 정규식 검증 |
| `WHERE ${pWhere} = #{pWhereClause}` — pWhere 가 컬럼명 입력 | 동일 | 컬럼명 화이트리스트 (MASTER_CODE / RULE_ID / FORMAT_ID / TRANSACTION_CODE / OBJECT_ID / PERMISSION_ID 만 허용) |
| `selectMasterCodeData` 의 `'${sCodeId}'` 변수 치환 (xml:97) | selectMasterCodeData | `#{}` 바인딩 치환으로 변경. **VI_MCM_CODE_ACCESS 는 `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (Q-003 해소 — cma masterCodeSelPop C-005 a 안 정본 동치).** |

### §11.5 As-Is 버그 / 의심 코드 (As-Is 보존 — Q-004 해소)

| 위치 | As-Is 코드 | 의심 사유 | To-Be 결정 |
|---|---|---|---|
| java:486 | `if(pDblinkFrom.equals("@MEPP_MCM")) pDblinkTo = "";` | 두 번째 if 에서 `pDblinkTo` 가 아닌 `pDblinkFrom` 을 비워야 정상으로 추정 (java:485 의 if 는 `pDblinkTo` 처리 — 그 다음 줄에서 다시 pDblinkTo 처리 = 중복) | **Q-004 해소** — DB Link 폐기 (§11.2) 로 인해 본 if 블록이 자연 무력화 (`pDblinkFrom` / `pDblinkTo` 모두 빈문자열 고정 — if 조건 false). As-Is 코드 자체는 §10.5 표 인용 보존 (수정 ✗ — As-Is 1:1 원칙) |
| java:299 (오타) | `"MasterCodeMapper.merge 에러발생"` (Mapper 명이 MasterCodeMngMapper 인데 메시지는 MasterCodeMapper) | 오타 | (※ masterCodeMng 화면의 오타 — 본 화면 commSyncMng 은 무관. 본 화면에서는 별도 의미있는 에러 메시지 ✗) |
| xfdl:194~197 | "테스트" 주석 + 5 줄 set_value 테스트 코드 | 테스트 코드 잔존 | To-Be 제거 |
| xfdl:148~149 / 167 (Java) | `befSrouce / aftSrouce` 오타 (Srouce = Source) | 오타 | As-Is 보존 (주석만) |
| java:514~516 (syncObj LOC 차단) | `if("LOC".equals(targetServer)) throw new UserException("DB링크로 인해 LOCAL에서 실행할 수 없습니다.")` | DB Link 의존 사유 차단 | **Q-005 해소** — DB Link 폐기로 차단 사유 ✗ → LOC 차단 폐기 (To-Be 실행 허용). As-Is 코드는 §7.5 / §10.5 인용 보존 |

### §11.6 동기화 audit 처리 결정 = Q-008 해소 (2026-05-31 사용자 결정 — (b) 안)

| 단계 | As-Is | To-Be 결정 |
|---|---|---|
| SOURCE → TARGET INSERT | `INSERT INTO ... SELECT * FROM ...` (audit 컬럼 포함 전수 복사) | **(b) 안 채택** — INSERT 직후 별도 UPDATE 로 동기화 시점 사용자 + 시각으로 `U_USR_ID` / `U_AT = GETDATE()` / `U_SVC_ID="commSyncMng"` / `U_PGM_ID="commSyncMng"` 덮어쓰기. `C_USR_ID` / `C_AT` 는 SOURCE 원작자/원작시각 보존. cactus-core `@PreUpdate` 는 Bulk INSERT 우회로 동작 ✗ — Service.java 에서 명시 UPDATE 호출. |
| 적용 SQL | (없음) | To-Be 신규 SQL `updateSyncAudit` 추가 — `UPDATE ${pSchemaTo}.${pTableTo} SET U_USR_ID = #{userId}, U_AT = GETDATE(), U_SVC_ID = 'commSyncMng', U_PGM_ID = 'commSyncMng' WHERE ${pWhere} = #{pWhereClause}` (화이트리스트 검증 후 호출) |

### §11.7 BPMN UserTask id 의미있는 명명 = Q-006 해소

| As-Is | To-Be 결정 |
|---|---|
| `UserTask_pwdinit` (다른 화면 복사 흔적) | **`UserTask_runSync` 채택** (의미있는 명명). camunda `class` 속성 `#{basePackage}SaveCommSyncMng` 유지. BPMN .bpmn 파일 정정은 후속 위임 (본 갱신 사이클은 .md 산출물만). |

### §11.8 동기화 화면 자체 존속 여부 = Q-010 해소 (2026-05-31 사용자 결정 — (c) 안 변형)

| 결정 사항 | As-Is 정체성 | To-Be 결정 |
|---|---|---|
| MSSQL sample_dmes 단일 DB 전환 후 본 화면의 의미 | 가동/개발/테스트 환경 다중 DB | **화면 존속**. 단일 MSSQL `sample_dmes` DB 내 schema 간 동기화 (`MCM_SOURCE` ↔ `MCMAPUSER` ↔ `MCM_BACKUP`) 로 정체성 유지. 본 화면 책임은 **MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL)** 로 축소 (Q-001 / Q-009 해소). 나머지 13 테이블은 후속 도메인 화면 책임 위임. |
| ds_main 16 행 정적 매트릭스 | xfdl 내장 | As-Is 1:1 보존 (xfdl 내장 → React State 상수 `INITIAL_SYNC_ROWS`). `from3` / `to3` (DB Link 명) 컬럼은 As-Is 표시값 보존 + To-Be 사용 ✗ (빈값 고정). |

---

## §12. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 (Q-001 ~ Q-010, 10 건) 사용자 결정 완료 (2026-05-31). 활성 미결정 = **0 건**. 결정 내용은 §6 / §7 / §9 / §11 본문에 직접 반영. 일괄 해소 결정표 정본은 §11.0 참조.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **동기화 16 테이블 그룹 책임 범위** (Q-001) | MASTER 3 테이블 (`TB_MCM_CODE_MASTER` / `TB_MCM_CODE_CATEGORY` / `TB_MCM_CODE_DETAIL`, schema = `MCM_SOURCE`) 만 본 화면 책임. 나머지 13 테이블은 후속 도메인 화면 책임 위임 | §9.1 / §9.3.6 / §11.0 |
| **Oracle DB Link 폐기** (Q-002, Q-004) | DB Link 3종 (`@MEPP_MCM` / `@DPMESA1_MCM` / `@TSTMPH_MCM`) 전부 폐기. 단일 MSSQL `sample_dmes` 환경 — 변수 (`${pDblinkTo}` / `${pDblink}` / `${pDblinkFrom}`) 는 As-Is 1:1 보존 + 런타임 빈값 고정. java:486 `if(pDblinkFrom.equals("@MEPP_MCM")) pDblinkTo = "";` 블록은 if 조건 false 로 자연 무력화 (As-Is 코드 §10.5 인용 보존) | §11.0 / §11.1 / §11.2 / §11.5 |
| **VI_MCM_CODE_ACCESS 재사용** (Q-003) | cma 4 화면 정본 `MCMAPUSER.VI_MCM_CODE_ACCESS` 재사용 (masterCodeSelPop §11.2 / C-005 a 안 동치). `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 멱등 적재 완료 (2026-05-29) | §6 #13 / §9.1 / §11.4 / §11.0 |
| **LOC 분기 유일화** (Q-005) | DB Link 폐기 → LOC 차단 사유 ✗ → syncObj LOC 차단 폐기. LOC 분기가 유일 실 동작 분기로 유지 (PRD 분기는 DB Link 의존이므로 사실상 No-op 이나 As-Is 코드 분기 구조는 §7 그대로 보존) | §11.0 / §11.2 / §11.5 |
| **BPMN UserTask 명명** (Q-006) | `UserTask_pwdinit` (다른 화면 복사 흔적) → `UserTask_runSync` 개명. camunda `class` 속성 `#{basePackage}SaveCommSyncMng` 유지. BPMN .bpmn 파일 정정은 후속 BE 개발 위임 | §8.1 / §8.2 / §11.7 |
| **To-Be 패키지** (Q-007) | service: `com.dongkuk.dmes.mcm.csa.commSyncMng.service` / dto: `com.dongkuk.dmes.mcm.csa.commSyncMng.dto` (RULE.md §"패키지 명명 규칙" §3-1 정본). Entity = 자체 작성 ✗ — cma 4 화면 entity (`com.dongkuk.dmes.mcm.entity.TbMcmCode{Master\|Category\|Detail}`) 재사용 (정책 #6 (A)) | §7.1 / §11.0 |
| **동기화 audit 처리 정책** (Q-008) | (b) 안 — SOURCE → TARGET `INSERT INTO ... SELECT *` 직후 별도 UPDATE 로 `U_USR_ID` / `U_AT = GETDATE()` / `U_SVC_ID="commSyncMng"` / `U_PGM_ID="commSyncMng"` 덮어쓰기. `C_*` 는 SOURCE 원작자/원작시각 보존. cactus-core `@PreUpdate` 는 Bulk INSERT 우회로 동작 ✗ — Service.java 에서 명시 UPDATE 호출. To-Be 신규 SQL `updateSyncAudit` 추가 | §11.0 / §11.3 / §11.6 |
| **16 테이블 그룹 후속 화면 매핑** (Q-009) | Q-001 결정과 동치. 13 후속 위임 테이블의 원천 화면은 별도 도메인 화면 (`mcaRuleMng` / `mcbRuleJudgeMng` / `mcmInterfaceMng` / `mcmFormatMng` / commObjMng / commMenuMng / commPermMng) 책임 | §9.3.6 / §11.0 |
| **화면 존속** (Q-010) | (c) 안 — 화면 **존속**. 단일 MSSQL `sample_dmes` 환경에서 schema 간 (`MCM_SOURCE` ↔ `MCMAPUSER` ↔ `MCM_BACKUP`) 메타 동기화 시나리오로 정체성 유지. 단 다중 환경 (가동/개발/테스트) 동기화는 폐기, 단일 DB schema 간 동기화 (LOC 분기) 만 잔존. ds_main 16 행 정적 매트릭스 / 6 처리유형 분기 / 4 sync 메서드는 As-Is 1:1 보존 | §11.0 / §11.8 |
| **Entity 명명 정책** (정책 #6 (A)) | 본 화면 자체 Entity ✗ — cma 4 화면 entity (MasterCode / MasterCodeCategory / MasterCodeDetail) 재사용 | §7.1 / §11.0 |
| **스키마/테이블명 (정책 #1)** | cma 정본 schema = `MCM_SOURCE` 인용 (원장) + 본 화면 read 대상 = `MCMAPUSER` schema (운영 read 동기화본). 3 schema 구조 (`MCM_SOURCE` 원장 / `MCMAPUSER` 운영 read 동기화본 / `MCM_BACKUP` 백업본) 분리 명시. As-Is mui DB테이블명세서 "MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합 | §9.1 / §11.1 / §11.4 |
| **As-Is/To-Be 표준 우선 원칙** (정책 #4 (0)) | As-Is 1:1 보존이 최우선. To-Be 정정/제거 결정은 §11.0 누적 결정표에 명시 — As-Is 코드는 §10.5 인용 보존 | §0 / §11 전반 |

---

## §13. 발견 매트릭스 (§A.2 누락 검증 원천)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 (예정) | 디자인설계 반영 (예정) | BPMN설계 반영 (예정) | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 조회조건 (S-NNN) | 4 (S-001 라벨 / S-002 콤보 / S-003 라벨 / S-004 처리대상 Edit) | 4 | 4 | (해당 없음) | - | 0 | 0 |
| 그리드 컬럼 (G-NNN) | 9 (G-001~G-009) | 9 | 9 | (해당 없음) | - | 0 | 0 |
| 확장 그리드 (GE-NNN) | 0 (해당 없음 — 단일 그리드) | 0 | 0 | (해당 없음) | - | 0 | 0 |
| 상세 필드 (D-NNN) | 0 (해당 없음) | 0 | 0 | (해당 없음) | - | 0 | 0 |
| 라인 필드 (L-NNN) | 0 (해당 없음) | 0 | 0 | (해당 없음) | - | 0 | 0 |
| 버튼 (B-NNN) | 3 (B-001 이행 / B-002 닫기 / B-003 접기 토글) | 3 | 3 | (해당 없음) | - | 0 | 0 |
| 그리드셀 인라인 (GB-NNN) | 0 (해당 없음) | 0 | 0 | (해당 없음) | - | 0 | 0 |
| 팝업/탭/연동 (P-NNN) | 0 (해당 없음) | 0 | 0 | (해당 없음) | - | 0 | 0 |
| 상태값 (ST-NNN) | 6 (처리유형 enum MASTER/RULE/RULE_JUDGE/INTERFACE/FORMAT/OBJECT) + 2 (서버 LOC/PRD) = 8 | 8 | (해당 없음) | (해당 없음) | - | 0 | 0 |
| 코드값/LoV (LV-NNN) | 1 (LV-001 ds_lovSyncTarget 6 행) + ds_main 16 정적 행 | (참조만) | (참조만) | (해당 없음) | - | 0 | 0 |
| Mapper.xml SQL ID | 13 (selectCommUser + getCodeVer + getRuleVer + getJudgeRuleVer + getFormatVer + updateFormatVer + createTable + deleteSourceData + insertSourceData + deleteObjectData + insertObjectData + selectObjectData + selectMasterCodeData) | 13 (§5.2 인용) | (해당 없음) | 13 (§6.4 sqlKey) | - | 0 | 3 (selectCommUser / createTable / selectObjectData — 미사용 → To-Be 제거) |
| BPMN 노드 / SequenceFlow | 4 노드 / 3 flow | (해당 없음) | (해당 없음) | 4 / 3 (§2 전수) | - | 0 (단순 구조) | 0 |
| Java UserTask 클래스 | 1 (SaveCommSyncMng) | (해당 없음) | (해당 없음) | 1 (§3) | - | 0 | 0 |
| Java 메서드 (run + 4 sync) | 5 (run / syncMasterCode / syncRule / syncNui / syncObj) | (해당 없음) | (해당 없음) | 5 | - | 0 | 0 |
| xfdl Script 메서드 | 9 (onload / AfterOnload / fn_button / fn_search / fn_sync / fn_callBack / cbo onitemchanged / fn_close / btn_fold_onclick) | (참조만) | (참조만) | (참조만) | - | 0 | 1 (fn_search — 빈 함수 → To-Be 제거) |
| 사용 테이블 (본 화면 직접) | 12 (TB_MCM_CODE_MASTER/DETAIL + TB_MCA_RULE_MASTER/COL_LIST/{Object} + TB_MCB_RULE_MASTER/COL_LIST/{Object} + TB_MCM_MOM_FORMAT_LIST/LAYOUT + TB_MCM_SEC_USER + VI_MCM_CODE_ACCESS) | (참조만) | (해당 없음) | (참조만) | - | 0 (TB_MCM_SEC_USER 미사용) | 0 |
| 동기화 대상 테이블 그룹 | 6 그룹 (masterTable 3 / ruleTable 3 / ruleJudgeTable 3 / InterfaceTable 2 / FormatTable 2 / ObjectTable 3 — 합 16) | (참조만) | (해당 없음) | (참조만) | - | 0 | 0 |

> 본 §13 매트릭스는 정합체크서 §A.2 누락 검증의 원천이다.

---

## §17.2 컬럼 1:1 전수 분해 (§9.3 동치 — 본 화면 직접 사용 컬럼만)

> **본 화면은 동기화 화면이므로 직접 사용 컬럼이 한정적이다** (§9.3.1~§9.3.5 참조). 동기화 대상 16 테이블 그룹의 모든 컬럼 정의는 원천 화면 (masterCodeMng 등) 책임 — Q-009 / §9.3.6 참조.
>
> 따라서 본 §17.2 는 §9.3.1 ~ §9.3.5 의 5 표 (총 20 컬럼) 를 동치 인용한다 — 별도 표 분해 ✗.

| 테이블 | §9.3 참조 | 컬럼 수 |
|---|---|---:|
| TB_MCM_CODE_MASTER (직접 참조 컬럼) | §9.3.1 | 2 |
| TB_MCA_RULE_MASTER (직접 참조 컬럼) | §9.3.2 | 2 |
| TB_MCB_RULE_MASTER (직접 참조 컬럼) | §9.3.3 | 2 |
| TB_MCM_MOM_FORMAT_LIST (직접 참조 컬럼) | §9.3.4 | 2 |
| VI_MCM_CODE_ACCESS (selectMasterCodeData 사용) | §9.3.5 | 6 |
| 합계 (본 화면 직접 사용) | - | **14** |

> 동기화 대상 16 테이블 그룹의 컬럼 (Q-009 해소 — 후속 도메인 화면 책임) 은 본 §17.2 의 책임 범위 외. **본 화면 책임 = MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL) — Entity 는 cma 4 화면 재사용 (§9.1 / §11.0)**.

---

## §6.14 4질문 검증 (Phase 1 종료)

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | ✗ (As-Is 1:1 보존 / cite file:line / 누락 ✗ / 결함 §11 / 분량 충분 / xfdl 단독 / 가이드 §외 신설 ✗ / 5종 정합 §0.1.3 기준 / Phase 4질문 §6.14 / 환경 제약 §0 / 직접 수행 ✗ / §외 임의 신설 ✗ / 파일 경로 ls 검증 완료) |
| 2 | 검증 안 한 부분? | ✗ (xfdl 491 line / Java 564 line / Mapper.xml 108 line / BPMN 75 line 모두 Read + 등재) |
| 3 | 그대로 수용? | ✗ (As-Is 버그 의심 §11.5 Q-004 해소 (DB Link 폐기로 자연 무력화) / 빈 함수 fn_search 등재 / 주석 코드 등재 / xfdl/java 모든 주석 §10.5 전수) |
| 4 | 임의 합리화? | ✗ (Q-NNN 10 건 전수 해소 (§11.0 / §12 — 활성 0) / "주요/대표/등" 0 회 사용 / "해당 없음" 명시 항목 §3.4/§3.5/§3.6/§4.2/§5 5 회) |

> Phase 1 통과 — Phase 2 진입. **2026-05-31 Q 10건 해소 갱신 반영 완료.**
