---
screenId: masterRuleListPop
asIsId: MasterRuleListPop
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 List조회 (masterRuleListPop) 분석리포트

> 본 문서 = 5종 산출물의 단일 원천(Single Source of Truth). 기능설계서·디자인설계서·BPMN설계서·정합체크서·개발체크리스트는 본 문서의 식별자/표/SQL/액션 매트릭스를 인용한다.

---

## §0. 환경 제약

- Auto Manifest Runner 미적용 (사용자 결정 — 입력 자산은 mui (xfdl/Mapper.xml/bpmn) 3종. 본 화면은 Java UserTask 없음 → Java 자산 미해당).
- WinForms 전제 §(designer.cs / sp.sql / resx PropBag / 12 이벤트 매트릭스 등) 미해당 → 가이드 §외 항목은 mui 등가물(xfdl Component / Mapper.xml SQL / bpmn flow / xfdl script 함수) 로 매핑. 템플릿 절/표 헤더는 삭제하지 않고 "해당 없음(WinForms 미해당 — mui 등가: ...)" 로 유지.
- 정합체크서 §D.4 manifest 9 파일 = ✗ + 사유: Runner 미실행.
- 작성 원칙: As-Is 1:1 보존(xfdl 컴포넌트 전수 / Grid columns 전수 / xfdl script 함수 전수 / Mapper.xml SQL 전수 / bpmn flow 전수).
- As-Is DB = Oracle (`NVL` / `||` 문자열 연결 / `UPPER()` / schema `MCA_SOURCE` 명시 + `${sSchema}` 동적 스키마). To-Be DB = MSSQL. §11 변환점 명시.
- **As-Is 식별자 불일치 (보존 대상)**: xfdl `<Form id="MasterRuleListPop">` (xfdl:3) ↔ bpmn `<process id="MasterJudgRuleListPop">` (bpmn:3). 즉 화면 Form id 와 BPMN process id 가 다름 (`MasterRuleListPop` vs `MasterJudgRuleListPop`). 운영상 oasis serviceId 는 xfdl 의 `sUrl = "cmb::MasterRuleListPop"` (xfdl:117) 가 기준 → serviceId = `MasterRuleListPop`. BPMN process id 는 참조용(`isExecutable="false"`) 이라 런타임 라우팅에 무관. §8.1 / §11 에 보존 + To-Be 정정 명시.
- **본 화면은 조회 전용 팝업** — Java UserTask·INSERT/UPDATE/DELETE SQL·저장 트랜잭션 모두 없음. 단일 SELECT (`GetRuleMasterList`) + 행 선택(더블클릭/확인) 후 호출 화면으로 값 반환.

---

## §1. 화면 개요

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 ID (As-Is) | MasterRuleListPop | MasterRuleListPop.xfdl:3 (`<Form id="MasterRuleListPop" ...>`) |
| 화면 ID (To-Be) | masterRuleListPop | 사용자 결정 (모듈 mcm + As-Is 화면명) |
| 화면명 | 업무기준 List조회 | MasterRuleListPop.xfdl:3 (`titletext="업무기준List조회"`) / xfdl:41 (`value="업무기준List조회"`) / bpmn:3 (`name="업무기준List조회"`) |
| 모듈 | mcm — 한글명 **"공통관리"** | 01_Agent부속_가이드.md:80 (`mcm` → 그룹 `cma`/`cmb`/...) |
| 모듈 그룹 | cmb — 한글명 **"업무기준 관리(원장)"** | 자산 경로: `mui/src/nxuiMui/cmb/` / `mappers-cmb/` / `services/cmb/` (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 List조회 (masterRuleListPop) | - |
| 화면 크기 | 480 × 740 | MasterRuleListPop.xfdl:3 (`width="480" height="740"`) |
| onload 핸들러 | MasterRuleListPop_onload | MasterRuleListPop.xfdl:3 / xfdl:82 |
| 최초 생성 | 2019.11.21 최민수 | MasterRuleListPop.xfdl:74 |
| 수정 | 2020.05.08 최규찬 | MasterRuleListPop.xfdl:75 |
| 화면 성격 | 업무기준(Rule) 마스터 List 조회 + 행 선택 후 값 반환 **팝업** (조회/선택 전용 — CRUD ✗) | xfdl:143~158 (더블클릭/확인 시 sRuleId/sRuleNm 반환), bpmn 단일 조회 flow |
| 주 사용 테이블 | MCA_SOURCE.TB_MCA_RULE_MASTER (또는 `${sSchema}.TB_MCA_RULE_MASTER` 동적 스키마) | MasterRuleListPopMapper.xml:19, 22 |
| 참조 테이블 (JOIN 전용) | (없음 — 단일 테이블 조회) | Mapper.xml:7~33 (JOIN ✗) |
| 트랜잭션 클래스 (Java UserTask) | **해당 없음** (WinForms 미해당 — mui 등가: BPMN flow 에 UserTask 없음 — 단일 CommonSelectTask) | bpmn:10~24 |
| BPMN 프로세스 ID | MasterJudgRuleListPop (※ xfdl Form id 와 불일치 — §0 / §11) | MasterRuleListPop.bpmn:3 |
| BPMN 실행 모드 | isExecutable="false" (참조용) | MasterRuleListPop.bpmn:3 |
| 팝업 호출 부모(추정) | 업무기준(Rule) 입력 화면에서 RuleId/RuleNm 룩업 (in-coming) | §5.2 |

---

## §2. 입력 자산 인벤토리

| # | 자산 유형 | 파일 경로 (절대) | line 수 | 비고 |
|---:|---|---|---:|---|
| 1 | xfdl (UI) | D:\dmes-Section\workspace-Section\mui\src\nxuiMui\cmb\MasterRuleListPop.xfdl | 177 | nexacro Form + Script (13 절 / 9 함수) |
| 2 | Mapper.xml | D:\dmes-Section\workspace-Section\mui\src\main\resources\persistence\mappers-cmb\MasterRuleListPopMapper.xml | 34 | namespace=MasterRuleListPopMapper, SQL 1 |
| 3 | BPMN | D:\dmes-Section\workspace-Section\mui\src\main\resources\services\cmb\MasterRuleListPop.bpmn | 86 | Camunda Modeler 3.1.2 |
| 4 | (참고) 생성본 xfdl.js | D:\dmes-Section\workspace-Section\mui\src\main\webapp\nxui\cmb\MasterRuleListPop.xfdl.js | (생성물) | xfdl → js 컴파일 산출물 (본문 인용 ✗) |
| 5 | DMES 테이블 정의서 | docs\external\DMES\DMES-SECTION-MCA_테이블정의서.xlsx | (xlsx, sheet135) | **TB_MCA_RULE_MASTER 등재 (MCAAPUSER, sheet135, 26 컬럼)** — 정본 카탈로그 (§9 매핑). ※ 초기 오참조(DMES-SECTION-MCM)는 MCA 정본으로 정정. masterRuleList 분석리포트 §9.1 과 동일 출처 |

Java (UserTask) 자산: **해당 없음** (WinForms 미해당 — mui 등가: 본 화면 BPMN 에 UserTask 없음 — 단일 CommonSelectTask 조회만). 따라서 §7 (Java 트랜잭션) 은 "해당 없음" 으로 유지.

추가 외부 참조: ref_Audit fragment 등 `<include refid>` 호출 ✗ (본 화면 SQL 은 SELECT 1 개로 audit fragment 미사용).

형제 화면 (맥락 참조용 — 본 산출물 본문 혼입 금지): 동일 cmb 폴더의 MasterRuleList / MasterRuleFrame / MasterRuleData / MasterRuleFrameColListPopup 및 MasterJudgRule* 계열. 본 화면 주 테이블(TB_MCA_RULE_MASTER) 컬럼 타입 추정 시 형제 `MasterRuleListMapper.xml` (동일 테이블 12 컬럼 SELECT) 만 §9.1 비고에 보강 인용.

---

## §3. UI 컴포넌트 전수 (xfdl)

### §3.1 영역 구성

| 영역 ID | 영역명 | xfdl id | 위치 (top/left/right/bottom/height) | 근거 |
|---|---|---|---|---|
| A-001 | 헤더 (제목 + 상단 메뉴) | div_title | top=0, left=20, right=20, height=50 | xfdl:38 |
| A-002 | 조회조건 | div_search | top=50, left=20, right=20, height=43 | xfdl:52 |
| A-003 | 접기 토글 | btn_fold | top=93, left=20, right=20, height=15 | xfdl:6 |
| A-004 | 메인 (그리드) | div_main | top=btn_fold:5, left=20, right=20, bottom=35 | xfdl:7 |
| A-005 | 하단 상태바 | div_bottom | bottom=0, left=0, right=0, height=20 | xfdl:51 |

비고: masterCategoryMng 와 달리 본 화면 div_main 내부에 우측 메뉴(div_rightMenu) 없음 — 그리드 단독 (xfdl:7~37). 행 추가/복사/삭제 우측 메뉴 ✗ (조회 전용 팝업).

### §3.2 조회조건 (S-NNN) — div_search

| S-NNN | xfdl id | 종류 | 라벨 | 초기 value / text | 폭 | inputmode | 파라미터 | 근거 |
|---|---|---|---|---|---:|---|---|---|
| S-001 | stc_ruleId | Static (라벨) | 업무기준ID | "업무기준ID" | 80 | - | (라벨) | xfdl:55 |
| S-002 | edt_ruleId | Edit | (업무기준ID 입력) | text="결함 코드" | 80 | upper | pRuleId | xfdl:56 |
| S-003 | stc_ruleNm | Static (라벨) | 업무기준명 | "업무기준명" | 80 | - | (라벨) | xfdl:57 |
| S-004 | edt_ruleNm | Edit | (업무기준명 입력) | text="결함 코드" | 162 | (지정 없음 / normal) | pRuleNm | xfdl:58 |

비고:
- edt_ruleId / edt_ruleNm 두 Edit 모두 `text="결함 코드"` 초기값 보존 (xfdl:56/58 — 원본 그대로). 본 화면명(업무기준)과 무관한 "결함 코드" 텍스트가 디자이너 잔재로 남아있음 — **To-Be 빈 값으로 정정** (사용자 결정 — 운영 노출 부적합 잔재; §12 결정). *(masterCategoryMng 의 "USD" 보존 결정과 달리, 본 잔재는 화면 도메인과 명백히 불일치하므로 정정.)*
- edt_ruleId 는 `inputmode="upper"` (xfdl:56) — 입력 시 대문자 변환. edt_ruleNm 은 inputmode 미지정 → 변환 없음 (xfdl:58).
- masterCategoryMng 와 달리 maxlength / imemode 속성은 div_search Edit 에 미지정 (xfdl:56, 58). 입력 길이 제약은 그리드 셀(§3.3) 의 editmaxlength 에만 존재.
- div_search 영역은 cssclass `div_WFSA_Box` (xfdl:52).

### §3.3 결과 그리드 G-001 — div_main.grd_main (binddataset=ds_grdMain)

| 속성 | 값 | 근거 |
|---|---|---|
| Grid id | grd_main | xfdl:10 |
| binddataset | ds_grdMain | xfdl:10 |
| autofittype | col | xfdl:10 |
| selecttype | cell | xfdl:10 |
| cellmovingtype / cellsizingtype | col / col | xfdl:10 |
| onheadclick | div_main_grd_main_onheadclick | xfdl:10 / xfdl:172 |
| oncelldblclick | div_main_grd_main_oncelldblclick | xfdl:10 / xfdl:143 |
| 행 높이 | 26 (head/body 공통) | xfdl:19~20 |

#### Grid columns 전수 (3 cols)

| col | head text | bind | editmaxlength | editimemode | editinputmode | displaytype | 근거 |
|---:|---|---|---:|---|---|---|---|
| 0 | NO | expr:currow+1 | - | - | - | normal (계산식) | xfdl:23, 28 |
| 1 | 업무기준 ID | RULE_ID | 50 | alpha | upper | normal | xfdl:24, 29 |
| 2 | 업무기준 명 | RULE_NM | 180 | hangul | - | normal | xfdl:25, 30 |

비고:
- col 0 (NO) text = `expr:currow+1` (1 부터 시작 일련번호) — bind 컬럼 아님 (xfdl:28).
- col 1 (업무기준 ID) = `editmaxlength="50" editimemode="alpha" editinputmode="upper"` (xfdl:29) → 영문 대문자 max 50.
- col 2 (업무기준 명) = `editmaxlength="180" editimemode="hangul"` (xfdl:30) → 한글 max 180.
- 셀 cssclass 조건부(빨간 배경 등) ✗ — masterCategoryMng 의 CHK 강조 없음 (선택 컬럼 자체 없음).
- 그리드 컬럼 폭 (Format default — xfdl:13~17): col0=30, col1=100, col2=220 (총 350px).
- 본 화면 그리드는 **편집 의도 없음** (조회/선택 전용). editmaxlength/editimemode 속성은 xfdl 디폴트 잔재 — 실제 편집 핸들러(저장/수정) ✗. **To-Be 읽기 전용 표시** (사용자 결정 — §12).

#### Dataset 컬럼 — ds_grdMain (xfdl:65)

| 컬럼 ID | type | size | 그리드 col 매핑 | 근거 |
|---|---|---:|---|---|
| (ColumnInfo 미선언) | - | - | RULE_ID / RULE_NM 은 SQL 결과(`ds_GetRuleMasterList`) 로 동적 바인딩 | xfdl:65 (`<Dataset id="ds_grdMain"/>` — 빈 선언) |

비고: ds_grdMain 은 ColumnInfo 없이 빈 Dataset 으로 선언 (xfdl:65). 컬럼은 서버 응답(`ds_GetRuleMasterList`) 의 SELECT 컬럼(§6.1 — RULE_ID, OLD_RULE_ID, RULE_NM, RULE_DESC, RULE_VER, RULE_TP, RULE_OWNER_DEPT_NM, RULE_OWNER_EMP_NO, USE_TP 9 종) 으로 런타임 자동 생성. 그리드는 그 중 RULE_ID / RULE_NM 2 종만 표시 (xfdl:29~30). 더블클릭/확인 반환도 RULE_ID / RULE_NM 2 종만 사용 (xfdl:146~147, 155~156).

### §3.4 편집 그리드 — 해당 없음

- grd_main 단일 그리드 (조회/선택 전용). 별도 GE-NNN 편집 그리드 없음. CRUD 편집 의도 자체가 없음.

### §3.5 보조 영역

| ID | 종류 | 위치 | URL 참조 | 근거 |
|---|---|---|---|---|
| C-001 | 상단 메뉴 div | div_title.div_topMenu (width=290, height=23, right=0, bottom=10) | _com_div::commonTopButton.xfdl | xfdl:42 |
| C-002 | 하단 상태바 div | div_bottom (height=20, bottom=0) | _com_div::commonBottomStatus.xfdl | xfdl:51 |
| C-003 | 제목 Edit (readonly) | div_title.edt_title (width=130, height=30, value="업무기준List조회") | (없음) | xfdl:41 |

비고: masterCategoryMng 의 우측 메뉴 div(C-001 commonRightButton) 는 본 화면에 **없음** (조회 전용 팝업 — 행 CRUD 버튼군 미존재).

---

## §4. 버튼·액션 (B-NNN / GB-NNN)

### §4.1 상단 메뉴 (commonTop — fn_button xfdl:104~112)

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-001 | btn_search | 조회 | fn_search (xfdl:114) | search | xfdl:110, 114~126 |
| B-002 | btn_confirm | 확인 | fn_confirm (xfdl:152) | (client-side) 결과 반환 | xfdl:110, 152~158 |
| B-003 | btn_close | 닫기 | fn_close (xfdl:161) | (client-side) 팝업 닫기 | xfdl:110, 161~163 |

비고: fn_button (xfdl:104~112) 의 기본버튼 배열 = `[["btn_search"],["btn_confirm"],["btn_close"]]` (xfdl:110). 사용자정의버튼 배열 = 빈 배열 (xfdl:109). 우측 메뉴 호출 ✗.

### §4.2 우측 메뉴 (commonRight) — 해당 없음

- 본 화면은 우측 메뉴(div_rightMenu / commonRightButton) 자체가 없음 (조회 전용 팝업). 행추가/복사/삭제/엑셀다운 버튼군 ✗.

### §4.3 본문 버튼

| B-NNN | 버튼 ID | 라벨 | 핸들러 (xfdl) | action enum | 근거 |
|---|---|---|---|---|---|
| B-004 | btn_fold | 조회조건 접기/펴기 | btn_fold_onclick (xfdl:166) | (client-side) fold | xfdl:6, 166~169 |

### §4.4 그리드 헤더 / 셀 액션

| GB-NNN | 위치 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|
| GB-001 | grd_main 헤드(모든 컬럼) | div_main_grd_main_onheadclick → gfn_commonOnheadclick(obj, e) | 그리드 정렬 (공통 함수 위임) | xfdl:10, 172~174 |
| GB-002 | grd_main 셀(더블클릭) | div_main_grd_main_oncelldblclick (xfdl:143) | 더블클릭 행의 RULE_ID/RULE_NM 을 obj 로 묶어 gfn_popupClose(obj) 로 부모에 반환 후 팝업 닫기 | xfdl:10, 143~149 |

비고: masterCategoryMng 의 GB-001(CHK 전체선택 토글) 에 대응하는 동작은 본 화면에 없음 (선택 컬럼 ✗). 헤드 클릭은 정렬만, 셀 더블클릭은 선택 반환.

### §4.5 action 매트릭스 (server-side 호출 여부)

| 버튼 | action | 서버 호출? | BPMN sequenceFlow name | sInDatasets | sOutDatasets | 근거 |
|---|---|---|---|---|---|---|
| B-001 btn_search | search | Y | SequenceFlow_0grwghu | "" | ds_grdMain=ds_GetRuleMasterList | xfdl:116~125 / bpmn:33 |
| B-002 btn_confirm | (client-side) | N | (해당 없음) | - | - | xfdl:152~158 |
| B-003 btn_close | (client-side) | N | (해당 없음) | - | - | xfdl:161~163 |
| B-004 btn_fold | fold | N (UI 토글만) | (해당 없음) | - | - | xfdl:166~169 |
| GB-002 더블클릭 | (client-side 반환) | N | (해당 없음) | - | - | xfdl:143~149 |

비고:
- 본 화면 server-side action 은 **search 단 1개** (DELETE/UPDATE/INSERT/SAVE 없음 — 조회 전용 팝업).
- fn_search (xfdl:114) 의 송신 파라미터: `pRuleId` (edt_ruleId.value) + `pRuleNm` (edt_ruleNm.value) + `sSchema` (this.parent.sSchema) (xfdl:120~122). 즉 부모 화면이 넘긴 `sSchema` 로 동적 스키마 조회 (§6 / §11).
- search 송신 전 `this.ds_grdMain.clearData()` 로 그리드 초기화 (xfdl:124).

---

## §5. 팝업 (P-NNN)

### §5.1 호출(out-going) 팝업

- mui xfdl 본문에 `goPopup` / `setUserPopup` / `nexacro.createDialog` 등 팝업 직접 호출 ✗.
- → **본 화면에서 호출하는 팝업 없음**. (본 화면 자체가 호출됨(in-coming) 팝업.)

### §5.2 호출됨(in-coming) 팝업

- 본 화면은 **팝업(조회/선택) 화면 자체**. 부모 화면이 본 화면을 띄우고, 사용자가 행을 더블클릭(GB-002) 하거나 확인(B-002) 을 누르면 `{sRuleId, sRuleNm}` 을 `gfn_popupClose(obj)` 로 부모에 반환 (xfdl:148, 157).
- 부모 → 본 화면 입력 파라미터 (gfn_Data_Return 으로 수신 — xfdl:90~97):
  - `sRuleId` → edt_ruleId 초기값 세트 (xfdl:90~93).
  - `sRuleNm` → edt_ruleNm 초기값 세트 (xfdl:94~97).
  - `this.parent.sSchema` → 조회 시 동적 스키마(`sSchema` 파라미터) 로 전달 (xfdl:86, 122).
- 본 화면 → 부모 반환 객체: `obj.sRuleId` (RULE_ID) / `obj.sRuleNm` (RULE_NM) (xfdl:146~147 더블클릭 / xfdl:155~156 확인).
- 호출 부모 화면(추정): 업무기준(Rule) ID 룩업이 필요한 입력 화면 (형제 MasterRuleData / MasterRuleFrame 등에서 호출 가능성). **본 분석 범위 외 — 본 화면 자산만으로는 부모 화면 단정 불가** (사용자 확인 시 보강).

---

## §6. SQL ID 매트릭스 (Mapper.xml 모든 SQL — 전수 1개)

| # | SQL ID | 유형 | parameterType | resultType | 사용 테이블 | 결합 (JOIN) | 동적 WHERE (mybatis if) | 정렬 (ORDER BY) | Oracle 특화 문법 | 근거 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | GetRuleMasterList | select | java.util.Map | java.util.Map | `${sSchema}.TB_MCA_RULE_MASTER` (else `MCA_SOURCE.TB_MCA_RULE_MASTER`) | (없음) | pRuleId / pRuleNm (2 if) | RULE_ID | `NVL(OLD_RULE_ID,' ')` / `UPPER()` / `\|\|` 문자열 결합 / `${sSchema}` 동적 스키마 (`<choose>/<when>/<otherwise>`) | Mapper.xml:7~33 |

비고:
- 본 Mapper 는 SELECT **1 개**만 정의 (INSERT/UPDATE/DELETE/MERGE 없음 — 조회 전용 팝업).
- `<choose>` 블록 (Mapper.xml:17~24): `sSchema` 파라미터가 있으면 `${sSchema}.TB_MCA_RULE_MASTER`, 없으면 `MCA_SOURCE.TB_MCA_RULE_MASTER` (xfdl:122 에서 부모의 sSchema 전달). `${}` 는 mybatis 문자열 치환(바인딩 ✗) → SQL injection 표면 — **To-Be 화이트리스트/검증 필요** (§11 / §12).
- orphan SQL 없음 (1 SQL 모두 search action 에서 호출).

### §6.1 SQL 별 컬럼 / 파라미터 상세

#### #1 GetRuleMasterList (Mapper.xml:7~33)

SELECT 컬럼 9종:
| # | 컬럼 | 매핑 (Dataset / Grid) | 근거 |
|---:|---|---|---|
| 1 | RULE_ID | ds_grdMain.RULE_ID (grid col 1 업무기준 ID) + 반환값 sRuleId | Mapper.xml:8 / xfdl:29, 146, 155 |
| 2 | OLD_RULE_ID | (SELECT 반환 — 그리드 미표시; WHERE 필터 `RULE_ID != NVL(OLD_RULE_ID,' ')` 용) | Mapper.xml:9, 25 |
| 3 | RULE_NM | ds_grdMain.RULE_NM (grid col 2 업무기준 명) + 반환값 sRuleNm | Mapper.xml:10 / xfdl:30, 147, 156 |
| 4 | RULE_DESC | (SELECT 반환 — 그리드 미표시) | Mapper.xml:11 |
| 5 | RULE_VER | (SELECT 반환 — 그리드 미표시) | Mapper.xml:12 |
| 6 | RULE_TP | (SELECT 반환 — 그리드 미표시) | Mapper.xml:13 |
| 7 | RULE_OWNER_DEPT_NM | (SELECT 반환 — 그리드 미표시) | Mapper.xml:14 |
| 8 | RULE_OWNER_EMP_NO | (SELECT 반환 — 그리드 미표시) | Mapper.xml:15 |
| 9 | USE_TP | (SELECT 반환 — 그리드 미표시) | Mapper.xml:16 |

비고: SELECT 는 9 컬럼 반환하나 그리드는 RULE_ID / RULE_NM 2 종만 표시 (xfdl:29~30), 반환도 2 종만 사용. 나머지 7 컬럼(OLD_RULE_ID·RULE_DESC·RULE_VER·RULE_TP·RULE_OWNER_DEPT_NM·RULE_OWNER_EMP_NO·USE_TP) 은 ds_grdMain 에 적재되나 화면 미사용 — As-Is 보존 (To-Be SELECT 동일 9 컬럼 보존; 사용자 결정 §12).

WHERE 고정 조건:
| 조건 | 의미 | 근거 |
|---|---|---|
| `RULE_ID != NVL(OLD_RULE_ID,' ')` | OLD_RULE_ID 가 자신과 같은(= 구버전 대체) 행 제외 — 현행 RULE 만 표시 | Mapper.xml:25 |

WHERE 동적 조건 (mybatis if):
| 파라미터 | 비교 대상 컬럼 | 비교 방식 | 근거 |
|---|---|---|---|
| pRuleId | RULE_ID | `UPPER(RULE_ID) LIKE UPPER('%' \|\| #{pRuleId} \|\| '%')` | Mapper.xml:26~28 |
| pRuleNm | RULE_NM | `UPPER(RULE_NM) LIKE UPPER('%' \|\| #{pRuleNm} \|\| '%')` | Mapper.xml:29~31 |

ORDER BY: RULE_ID (Mapper.xml:32).

비교: 형제 화면 `MasterRuleListMapper.xml` 의 `GetRuleMasterList` 는 동일 테이블에 추가로 `AND NVL(USE_TP,'N') != 'N'` (사용중만) 및 `CREATION_TIMESTAMP / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_TIMESTAMP` 3 audit 컬럼을 더 SELECT 하나, **본 팝업 SQL 에는 그 조건/컬럼이 없음** (본 팝업은 USE_TP 무관 전체 현행 RULE 표시). 본 산출물은 본 화면 자산(MasterRuleListPopMapper.xml) 만 정본으로 한다.

---

## §7. Java 트랜잭션 (UserTask)

**해당 없음** (WinForms 미해당 — mui 등가: 본 화면 BPMN 에 UserTask 없음 — 조회 전용 팝업이므로 저장/수정/삭제 Java Task 부재).

### §7.1 클래스 메타

| 항목 | 값 |
|---|---|
| Java UserTask 클래스 | (없음) — bpmn flow 에 `userTask` 노드 없음, 단일 `task`(CommonSelectTask) 만 존재 (bpmn:10~24) |

### §7.2 메서드 전수

- 해당 없음 (Java UserTask 부재). 본 화면의 server-side 처리는 oasis 공통 `CommonSelectTask` (BPMN modelerTemplate) 로 100% 위임 — 화면 전용 Java 코드 없음.

### §7.3 트랜잭션 경계

- search action 은 단일 SELECT (읽기 전용) — 쓰기 트랜잭션 경계 없음. BPMN process 1회 = SELECT 1회 (bpmn:10~24).

---

## §8. BPMN 워크플로우 전수

### §8.1 프로세스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterJudgRuleListPop (※ xfdl Form id `MasterRuleListPop` 과 불일치 — §0 / §11 보존+정정) | bpmn:3 |
| name | 업무기준List조회 | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |

### §8.2 Flow 노드 전수

| 노드 ID | 종류 | name | camunda:class / template | 주요 property | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | - | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | End Event | - | - | SequenceFlow_0lnje1n | - | bpmn:7~9 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (이름 없음) | - | - | SequenceFlow_1 | SequenceFlow_0grwghu | bpmn:25~31 |
| Task_2 | task | Main조회 | MapperBaseDbAccessTemplate / class=CommonSelectTask | sqlKey=#{serviceId}Mapper.GetRuleMasterList, resultKey=ds_GetRuleMasterList, isServiceResult=true, paramKey=(빈값), dao=(빈값) | SequenceFlow_0grwghu | SequenceFlow_0lnje1n | bpmn:10~24 |

### §8.3 SequenceFlow 전수 (3 개)

| flow id | name | source | target | 분기 조건(action) | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | - | StartEvent_1 | ExclusiveGateway_1 | - | bpmn:32 |
| SequenceFlow_0grwghu | search | ExclusiveGateway_1 | Task_2 (Main조회) | action=search | bpmn:33 |
| SequenceFlow_0lnje1n | - | Task_2 (Main조회) | EndEvent_1 | (조회 후 종료) | bpmn:34 |

### §8.4 action 별 실행 경로

| action | 경로 | 호출 SQL / Class |
|---|---|---|
| search | Start → Gateway → Task_2(Main조회) → End | GetRuleMasterList (CommonSelectTask) |

비고:
- 단일 action(search) 단일 Task — masterCategoryMng 의 save/delete/전체조회 후행 Task 없음.
- BPMN 의 sqlKey 패턴 = `#{serviceId}Mapper.{sqlId}` — serviceId 변수는 oasis 런타임에서 주입. As-Is 운영 환경 serviceId 값 = xfdl `sUrl="cmb::MasterRuleListPop"` (xfdl:117) 기준 → "MasterRuleListPop" → "MasterRuleListPopMapper.GetRuleMasterList". To-Be serviceId = "masterRuleListPop".

### §8.5 BPMN Diagram (시각 좌표) — 참고

| 노드 | x | y | width | height | 근거 |
|---|---:|---:|---:|---:|---|
| StartEvent_1 | 220 | 104 | 36 | 36 | bpmn:38~39 |
| ExclusiveGateway_1 | 213 | 180 | 50 | 50 | bpmn:56~57 |
| Task_2 | 156 | 411 | 164 | 50 | bpmn:50~51 |
| EndEvent_1 | 220 | 641 | 36 | 36 | bpmn:44~45 |

---

## §9. 사용 테이블

### §9.1 MCAAPUSER.TB_MCA_RULE_MASTER (주 테이블 — DMES MCA Excel sheet135 전수 26 컬럼)

> 정본 owner = `MCAAPUSER.TB_MCA_RULE_MASTER` (DMES-SECTION-MCA 테이블정의서 sheet135, 총 26 컬럼 — masterRuleList 분석리포트 §9.1 과 동일 출처/동일 카탈로그). As-Is Mapper.xml 의 `MCA_SOURCE.TB_MCA_RULE_MASTER` (Mapper.xml:22) 는 Oracle synonym, 부모가 넘긴 `${sSchema}.TB_MCA_RULE_MASTER` (Mapper.xml:19) 는 동적 스키마. **초기 오참조(DMES-SECTION-MCM 미등재 fail-fast)는 MCA 정본으로 정정 — 본 테이블은 MCA 카탈로그에 존재.** 본 팝업은 **조회 전용** (SELECT 9 업무 컬럼만 사용 — audit/그룹3·4 컬럼은 미사용). Excel sheet135 의 한글항목명/Type 셀은 정의서 misalignment(Q-010 류) → **영문컬럼명 + NULL여부가 정본**. 한글의미는 As-Is xfdl 그리드 헤드(xfdl:29~30) + 컬럼명 직역 보강. **To-Be**: `MCAAPUSER.TB_MCA_RULE_MASTER` 보존 + audit 부분은 mcm-core `McmAuditEntity` 9 컬럼 적용.

| 순서 | 영문항목명 | KEY/NULL | 한글의미 | 본 화면 사용 | 출현 위치 | 근거 |
|---:|---|---|---|---|---|---|
| 0 | CREATED_OBJECT_TYPE | NULL=Y | 생성TYPE | N (audit 그룹1 — 본 팝업 SQL 미사용) | (Mapper 미사용) | MCA sheet135 r6 |
| 1 | CREATED_OBJECT_ID | NULL=Y | 생성USER | N (audit 그룹1) | (Mapper 미사용) | MCA sheet135 r7 |
| 2 | CREATED_PROGRAM_ID | NULL=Y | 생성SERVICE | N (audit 그룹1) | (Mapper 미사용) | MCA sheet135 r8 |
| 3 | CREATION_TIMESTAMP | NULL=Y | 생성일시 | N (audit 그룹1 — 본 팝업 SQL 미사용; 형제 MasterRuleList 는 표시) | (Mapper 미사용) | MCA sheet135 r9 |
| 4 | LAST_UPDATED_OBJECT_TYPE | NULL=Y | 최종변경TYPE | N (audit 그룹2) | (Mapper 미사용) | MCA sheet135 r10 |
| 5 | LAST_UPDATED_OBJECT_ID | NULL=Y | 최종변경USER | N (audit 그룹2 — 본 팝업 SQL 미사용; 형제 MasterRuleList 는 표시) | (Mapper 미사용) | MCA sheet135 r11 |
| 6 | LAST_UPDATE_PROGRAM_ID | NULL=Y | 최종변경SERVICE | N (audit 그룹2) | (Mapper 미사용) | MCA sheet135 r12 |
| 7 | LAST_UPDATE_TIMESTAMP | NULL=Y | 최종변경일시 | N (audit 그룹2 — 본 팝업 SQL 미사용; 형제 MasterRuleList 는 표시) | (Mapper 미사용) | MCA sheet135 r13 |
| 8 | DATA_END_STATUS | NULL=Y | 데이터종료STATUS | N (audit 그룹3) | (Mapper 미사용) | MCA sheet135 r14 |
| 9 | DATA_END_OBJECT_TYPE | NULL=Y | 데이터종료TYPE | N (audit 그룹3) | (Mapper 미사용) | MCA sheet135 r15 |
| 10 | DATA_END_OBJECT_ID | NULL=Y | 데이터종료USER | N (audit 그룹3) | (Mapper 미사용) | MCA sheet135 r16 |
| 11 | DATA_END_PROGRAM_ID | NULL=Y | 데이터종료SERVICE | N (audit 그룹3) | (Mapper 미사용) | MCA sheet135 r17 |
| 12 | DATA_END_TIMESTAMP | NULL=Y | 데이터종료일시 | N (audit 그룹3) | (Mapper 미사용) | MCA sheet135 r18 |
| 13 | ARCHIVE_COMPLETED_FLAG | NULL=Y | Archive완료FLAG | N (audit 그룹4) | (Mapper 미사용) | MCA sheet135 r19 |
| 14 | ARCHIVED_EMPLOYEE_NUM | NULL=Y | Archive완료USER | N (audit 그룹4) | (Mapper 미사용) | MCA sheet135 r20 |
| 15 | ARCHIVED_TIMESTAMP | NULL=Y | Archive완료일시 | N (audit 그룹4) | (Mapper 미사용) | MCA sheet135 r21 |
| 16 | ARCHIVE_PROGRAM_ID | NULL=Y | Archive완료SERVICE | N (audit 그룹4) | (Mapper 미사용) | MCA sheet135 r22 |
| 17 | RULE_VER | NULL=Y | 업무기준Version | △ (SELECT 반환 — 미표시) | SELECT | MCA sheet135 r23 / Mapper.xml:12 |
| 18 | RULE_ID | **NULL=N (PK)** | 업무기준ID | ✓ (표시 col1 / 반환 sRuleId) | SELECT / WHERE LIKE / ORDER BY | MCA sheet135 r24 / Mapper.xml:8, 27, 32 / xfdl:29, 146, 155 |
| 19 | OLD_RULE_ID | NULL=Y | 구업무기준ID | △ (WHERE 필터만) | WHERE `RULE_ID != NVL(OLD_RULE_ID,' ')` | MCA sheet135 r25 / Mapper.xml:9, 25 |
| 20 | RULE_NM | **NULL=N** | 업무기준명 | ✓ (표시 col2 / 반환 sRuleNm) | SELECT / WHERE LIKE | MCA sheet135 r26 / Mapper.xml:10, 30 / xfdl:30, 147, 156 |
| 21 | RULE_DESC | NULL=Y | 업무기준설명 | △ (SELECT 반환 — 미표시) | SELECT | MCA sheet135 r27 / Mapper.xml:11 |
| 22 | RULE_TP | NULL=Y | 업무기준구분 | △ (SELECT 반환 — 미표시) | SELECT | MCA sheet135 r28 / Mapper.xml:13 |
| 23 | RULE_OWNER_DEPT_NM | NULL=Y | 담당부서명 | △ (SELECT 반환 — 미표시) | SELECT | MCA sheet135 r29 / Mapper.xml:14 |
| 24 | RULE_OWNER_EMP_NO | NULL=Y | 담당자사번 | △ (SELECT 반환 — 미표시) | SELECT | MCA sheet135 r30 / Mapper.xml:15 |
| 25 | USE_TP | NULL=Y | 사용여부 | △ (SELECT 반환 — 미표시; 본 팝업 SQL 은 USE_TP 필터 없음) | SELECT | MCA sheet135 r31 / Mapper.xml:16 |

PK 결론: `RULE_ID` 단일 PK (MCA sheet135 r24 NULL=N(NOT NULL) 정본 + ORDER BY RULE_ID + WHERE LIKE RULE_ID 단일 키 패턴 + 반환 단일 식별자 — Mapper.xml:8, 27, 32). masterRuleList 분석리포트 §9.1 과 동일 결론(단일 PK) — **DDL/형제 CRUD 화면 추정에 의존하지 않고 MCA 정본으로 확정** (Q-001 해소).

비고: As-Is 본 팝업 SQL 은 26 컬럼 중 업무 9 컬럼(RULE_VER/RULE_ID/OLD_RULE_ID/RULE_NM/RULE_DESC/RULE_TP/RULE_OWNER_DEPT_NM/RULE_OWNER_EMP_NO/USE_TP) 만 SELECT(Mapper.xml:8~16), audit 17 컬럼(r6~r22)은 미사용. 그 중 그리드 표시·반환은 RULE_ID/RULE_NM 2 종(xfdl:29~30, 146~147, 155~156). 형제 MasterRuleList 화면은 추가로 CREATION_TIMESTAMP/LAST_UPDATED_OBJECT_ID/LAST_UPDATE_TIMESTAMP 3 audit 을 SELECT·표시하나 본 팝업은 미사용(§6.1 비교).

### §9.2 참조 테이블 — 해당 없음

- 본 화면 SQL 은 단일 테이블 조회 (JOIN ✗). 참조 테이블 없음 (Mapper.xml:7~33).

### §9.3 DMES Excel 매핑

- **정본 = DMES-SECTION-MCA 테이블정의서(`DMES-SECTION-MCA_테이블정의서.xlsx`) sheet135** — TB_MCA_RULE_MASTER 26 컬럼 §9.1 본문 직접 반영 (masterRuleList 분석리포트 §9.1 과 동일 출처).
- 본 RULE_MASTER 테이블은 MCM(`DMES-SECTION-MCM`) 정의서에는 **부재**, MCA 정의서에만 **존재** (As-Is Mapper.xml schema = `MCA_SOURCE` 와 일치). **초기 작업에서 MCM 정의서를 오참조하여 "미등재 fail-fast" 로 기록했던 것을 MCA 정본으로 정정** (오탐 해소). To-Be 스키마 owner = `MCAAPUSER` (sheet135 정본).
- As-Is `MCA_SOURCE.` 는 Oracle synonym. `${sSchema}` 동적 스키마는 멀티 스키마(예: 원장/검증 환경) 라우팅 용도 추정 (xfdl:122 부모가 sSchema 전달) — 치환 정책은 §11/§12 Q-002 로 잔존.
- Excel sheet135 의 한글항목명(A 컬럼)/Type 셀은 정의서 misalignment(수치 코드 오정렬, Q-010 류) → **영문컬럼명 + NULL여부가 정본**. §9.1 한글의미는 As-Is xfdl 그리드 헤드 + 직역 보강.

### §9.4 audit 컬럼 To-Be 전환

| As-Is audit 그룹 | 컬럼 | To-Be 처리 |
|---|---|---|
| 그룹 1 (생성) | CREATED_OBJECT_TYPE / CREATED_OBJECT_ID / CREATED_PROGRAM_ID / CREATION_TIMESTAMP | mcm-core `McmAuditEntity` C_* 4 컬럼 매핑 |
| 그룹 2 (최종변경) | LAST_UPDATED_OBJECT_TYPE / LAST_UPDATED_OBJECT_ID / LAST_UPDATE_PROGRAM_ID / LAST_UPDATE_TIMESTAMP | mcm-core `McmAuditEntity` U_* 4 컬럼 매핑 |
| 그룹 3 (데이터종료) | DATA_END_STATUS / DATA_END_OBJECT_TYPE / DATA_END_OBJECT_ID / DATA_END_PROGRAM_ID / DATA_END_TIMESTAMP (5) | **To-Be 제거** (masterRuleList §9.2 선례 동일) |
| 그룹 4 (Archive) | ARCHIVE_COMPLETED_FLAG / ARCHIVED_EMPLOYEE_NUM / ARCHIVED_TIMESTAMP / ARCHIVE_PROGRAM_ID (4) | **To-Be 제거** |

비고: 본 화면은 **조회 전용 팝업** — audit write 자체가 없어 audit 컬럼은 SELECT 에도 미등장. Entity 차원에서는 형제 CRUD 화면(masterRuleList)과 동일 테이블을 공유하므로 McmAuditEntity 9 컬럼(C_* 4 + U_* 4 + VER 1) 적용. As-Is 별도 `RULE_VER`(r23/업무 버전) 은 mcm-core VER(@Version/낙관적 락) 과 별개 컬럼 유지(masterRuleList §9.2 Q-011 동일).

---

## §10. 코드값 / LoV

- 본 화면 자체 정의 코드값 / 정적 LoV / 콤보박스 ✗ (조회 전용 팝업 — 입력 콤보 없음).
- USE_TP (사용여부 Y/N), RULE_TP (구분) 등은 SELECT 반환되나 화면 미표시·미사용 — LoV 변환 대상 아님 (As-Is 보존).
- ref_Audit fragment 등 외부 공통 fragment 호출 ✗ (본 SQL 은 SELECT 1 개 — audit fragment 미사용).

---

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

| 항목 | As-Is (Oracle) | 위치 | To-Be (MSSQL) 전환 |
|---|---|---|---|
| 문자열 결합 | `'%' \|\| #{x} \|\| '%'` | Mapper.xml:27, 30 | `'%' + #{x} + '%'` 또는 `CONCAT('%', #{x}, '%')` |
| NULL 치환 | `NVL(OLD_RULE_ID,' ')` | Mapper.xml:25 | `ISNULL(OLD_RULE_ID,' ')` 또는 `COALESCE(OLD_RULE_ID,' ')` |
| 대소문자 무시 검색 | `UPPER(col) LIKE UPPER('%'\|\|#{x}\|\|'%')` | Mapper.xml:27, 30 | `UPPER(col) LIKE UPPER('%'+#{x}+'%')` (MSSQL collation 이 CI 면 UPPER 생략 가능 — As-Is 동작 보존 위해 UPPER 유지 권장) |
| 동적 스키마 (`${}`) | `${sSchema}.TB_MCA_RULE_MASTER` (없으면 `MCA_SOURCE.`) | Mapper.xml:17~24 | **As-Is 동일 유지 (사용자 확정 2026-06-04)** — `sSchema` 전달 시 해당 스키마, 미전달(기본) 시 `MCAAPUSER`. JPA 구현: 기본 경로 = `@Table(schema="MCAAPUSER")` 고정, 동적 경로(sSchema)는 개발 단계 native/별도 처리 |
| 스키마명 | `MCA_SOURCE.` (Oracle synonym) | Mapper.xml:22 | **To-Be `MCAAPUSER.TB_MCA_RULE_MASTER` 보존** (DMES-SECTION-MCA sheet135 정본 — masterRuleList §11 동일) |
| 테이블명 | TB_MCA_RULE_MASTER (As-Is) | Mapper.xml:19, 22 | **To-Be `TB_MCA_RULE_MASTER` 보존** (대문자 prefix) |
| edt_* "결함 코드" 초기값 | edt_ruleId / edt_ruleNm `text="결함 코드"` | xfdl:56, 58 | **To-Be 빈 값 정정** (화면 도메인 불일치 디자이너 잔재 — 사용자 결정 §12) |
| BPMN process id 불일치 | process id=`MasterJudgRuleListPop` ↔ xfdl Form id=`MasterRuleListPop` | bpmn:3 / xfdl:3 | **To-Be process id = `masterRuleListPop` 통일 정정** (xfdl Form id 기준 — 사용자 결정 §12) |
| Mapper namespace | MasterRuleListPopMapper | Mapper.xml:5 | masterRuleListPopMapper (또는 JPA Repository 흡수) |
| Java 패키지 | (Java UserTask 없음 — 해당 없음) | - | Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / 조회 Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleListPop.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1) |
| audit 컬럼 | (본 SQL 미사용 — SELECT only) | - | (조회 화면이므로 audit write 없음; Entity 차원에서는 McmAuditEntity 9 컬럼 적용 — 형제 CRUD 화면과 공유) |
| 통신 채널 | nexacro gfn_transaction (oasis RPC) | xfdl:125 | HTTP REST (cactus OASIS 표준) |

---

## §12. 결정 누적 (사용자 결정 / 보류)

> 활성 확인필요 = **0 건**. Q-003(부모 호출 화면)은 호출관계 조사로 **해소: 호출자 = masterRuleFrame·masterRuleData·masterRuleDataList** (2026-06-05). Q-001(PK)·owner·Q-002(동적 스키마)·영속성(JPA)은 사용자 확정 2026-06-04. 나머지는 본문 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 | 상태 |
|---|---|---|---|
| **edt_* "결함 코드" 초기값** | 화면 도메인(업무기준)과 불일치하는 디자이너 잔재 → **To-Be 빈 값 정정** | §3.2 / §11 | 결정 |
| **BPMN process id 불일치** | `MasterJudgRuleListPop` ↔ Form id `MasterRuleListPop` → **To-Be `masterRuleListPop` 통일** | §0 / §8.1 / §11 | 결정 |
| **그리드 편집 속성 잔재** | col1/col2 editmaxlength/editimemode 존재하나 편집 핸들러 ✗ → **To-Be 읽기 전용 표시** | §3.3 | 결정 |
| **SELECT 9 컬럼 vs 표시 2 컬럼** | 미표시 7 컬럼 As-Is 보존 (SELECT 동일) — To-Be 도 9 컬럼 SELECT 보존 | §6.1 | 결정 |
| **반환 값** | 더블클릭/확인 시 `{sRuleId, sRuleNm}` 2종 반환 (As-Is 보존) | §4 / §5.2 | 결정 |
| **호출 팝업** | 본 화면은 out-going 팝업 없음 (자신이 in-coming 팝업) | §5 | 결정 |
| **권한** | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | 기능 §8 | 결정 |
| **통신 채널** | OASIS REST (cactus 표준) | BPMN §2 | 결정 |
| **동적 스키마 `${sSchema}`** | **As-Is 동일 유지 — `<choose>` 보존: `sSchema` 전달 시 해당 스키마, 미전달(기본) 시 `MCAAPUSER` 사용** (사용자 확정 2026-06-04). JPA 구현: 기본 경로 = `@Table(schema=...)` 고정 스키마, 동적 경로(sSchema 전달)는 개발 단계 native/별도 처리 | §6 / §11 | **해소 (Resolved)** |
| **owner 스키마 / 컬럼 정밀도** | ~~DMES 테이블정의서 미등재~~ → **DMES-SECTION-MCA sheet135 정본 확정: owner=`MCAAPUSER`, 26 컬럼(업무 9 + audit 17)** (§9.1). 초기 MCM 오참조 정정 | §9.1 / §9.3 | **해소 (Resolved)** |
| **PK 확정 (RULE_ID 단일?)** | MCA sheet135 r24 `RULE_ID` NULL=N(PK) 정본 + 단일 키 패턴 → **단일 PK 확정** (masterRuleList §9.1 동일) | §9.1 | **해소 (Resolved)** |
| **부모 호출 화면** | **해소: 호출자 = masterRuleFrame·masterRuleData·masterRuleDataList** (호출관계 조사 2026-06-05) | §5.2 | **해소 (Resolved)** |
| **Java 패키지** | UserTask 없음 → 조회 Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleListPop.{service,dto}.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (RULE.md §"패키지 명명 규칙" §3-1) | §11 | 결정 |
| **영속성 방식 (JPA vs MyBatis)** | **JPA 확정** (cmb 화면군 공통 — 사용자 확정 2026-06-04, 기존 mcm-core 엔티티 JPA 정합) | 개발 §1 DEC-03 | **결정** |

---

## §13. 정합 게이트 자가 점검

| 게이트 | 확인 항목 | 결과 | 근거 |
|---|---|---|---|
| G1 | xfdl 컴포넌트 전수 (영역 5 + 조회조건 4(stc2+edt2) + 그리드 1 + 헤더/하단/제목 보조 3 = 13 전수) | ○ | §3 |
| G2 | 그리드 columns 전수 (3 cols: NO / RULE_ID / RULE_NM) | ○ | §3.3 |
| G3 | Dataset 컬럼 (ds_grdMain — ColumnInfo 미선언, 서버 응답 9 컬럼 동적 바인딩) | ○ | §3.3 |
| G4 | java 메서드 전수 (해당 없음 — UserTask 부재, mui 등가: 단일 CommonSelectTask) | ○ | §7 |
| G5 | Mapper.xml SQL 전수 (1 SELECT — GetRuleMasterList) | ○ | §6 |
| G6 | bpmn flow 노드 전수 (Start/End + Gateway + Task 1 = 4 노드, sequenceFlow 3) | ○ | §8.2, §8.3 |
| G7 | action 매트릭스 일치 (search 1 server + confirm/close/fold/더블클릭 client) | ○ | §4.5 |
| G8 | 식별자 cite (모든 본문 주장 file:line) | ○ | 본 문서 전수 |
| G9 | 활성 확인필요 = 0 (Q-003 부모 = 호출자 식별 해소 2026-06-05) — Q-001·Q-002·영속성 해소 | ○ | §12 |
| G10 | Runner 미적용 명시 | ○ | §0, 정합체크서 §D.4 |
