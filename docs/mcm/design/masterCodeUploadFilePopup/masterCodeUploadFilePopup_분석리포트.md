---
screenId: masterCodeUploadFilePopup
asIsId: MasterCodeUploadFilePopup
moduleId: mcm
moduleGroup: cma
pageName: masterCodeUploadFilePopup
pageId: masterCodeUploadFilePopup
serviceId: masterCodeUploadFilePopup
작성일: 2026-05-27
작성자: Agent
---

# masterCodeUploadFilePopup (마스터코드 파일 업로드 팝업) 분석리포트

> 본 문서 = 5종 산출물의 **단일 원천 (Single Source of Truth)**.
> 가이드 `docs/guide/design/templates/분석리포트.template.md` 의 절 제목·구조는 참고하되, 본 화면은 nexacro/xfdl + Oasis(Java+BPMN) + MyBatis 자산이므로 WinForms 전제 항목 (designer.cs / Visible=false / `+= new EventHandler` / @Case 분기 / Runner manifest 9 파일 / SOP 30 Step) 은 강제되지 않는다. mui 등가물로 매핑한다 (사용자 요구사항 §6 / §8 / §10).

## §0. 환경 제약

| 항목 | 내용 |
|---|---|
| 입력 원천 1 (UI) | nexacro `xfdl` v2.1 (단일 파일) |
| 입력 원천 2 (Service) | Oasis `Wow` UserTask (Java, single class) |
| 입력 원천 3 (Mapper) | MyBatis `*.xml` (1 SELECT) — 단, Save 가 호출하는 `delete` / `insert` 는 동일 모듈 공용 매퍼 `TB_MCM_CODE_DETAIL_Mapper.xml` 참조 |
| 입력 원천 4 (BPMN) | Camunda BPMN 2.0 (1 process, 2 분기) |
| Auto Manifest Runner | **미적용** (사용자 결정 + 메모리 `reference_legacy_erp_ddl_location.md` 기본 `enabled=false`) → 본 문서 §-1 / §0~16 의 manifest 9 파일 인용 절차 = 면제. 정합체크서 §D.4 = ✗ + 사유 명시. |
| SOP 30 Step | **미적용** — WinForms designer.cs / sp 분기 매트릭스 / 12 이벤트 grep 대상 자산 부재. mui 자산은 xfdl·java·xml·bpmn 4 원천으로 SOP 결과는 본 §3~§8 본 표 결과로 갈음. |
| As-Is DBMS | Oracle (Mapper.xml `TO_TIMESTAMP` / `SYSDATE`/`SYSTIMESTAMP` / `MERGE INTO ... USING DUAL` 흔적 — `TB_MCM_CODE_DETAIL_Mapper.xml:48 / :60 / :141 / :153 / :188`) |
| To-Be DBMS | MSSQL — §11 변환점 명시 |
| 작성 일자 | 2026-05-27 |

## §1. 화면 개요

### 1.1 식별자

| 항목 | 값 | 근거 |
|---|---|---|
| 화면명 | 마스터코드 등록(Excel Upload) | `MasterCodeUploadFilePopup.xfdl:3` titletext |
| 화면 식별자 (screenId) | masterCodeUploadFilePopup | (MES 단일 토큰 룰 `{화면명}` — 2026-05-28 가이드 정본) |
| As-Is 식별자 (asIsId) | MasterCodeUploadFilePopup | `MasterCodeUploadFilePopup.xfdl:3` Form@id |
| moduleId | mcm — 한글명 **"공통관리"** | 사용자 입력 |
| moduleGroup | cma — 한글명 **"Master 관리(원장)"** | 입력 자산 경로 `mappers-cma` / `services/cma` / `task/ui/cma` (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > Master 관리(원장) (cma) > 마스터코드 등록(Excel Upload) (masterCodeUploadFilePopup) | - |
| pageName / pageId / serviceId | masterCodeUploadFilePopup (3 식별자 동일) | MES 단일 룰 |
| BPMN process id (As-Is) | MasterCodeUploadFilePopup | `MasterCodeUploadFilePopup.bpmn:3` |
| BPMN process name | 마스터코드 등록(Excel Upload) | `MasterCodeUploadFilePopup.bpmn:3` |
| Front 파일명 (To-Be 안) | `masterCodeUploadFilePopup.tsx` | MES 룰 |
| 화면 성격 | **modal popup** (호출원: `MasterCodeMng.xfdl:778` `gfn_openPopup("modal", ...)`) |

### 1.2 화면 목적 (1 enum 패턴)

> masterCodeUploadFilePopup 은 MasterCodeUploadFilePopup 의 **등록**, **삭제**, **조회** 를 수행한다.

- **등록**: 엑셀 파일을 import 하여 `TB_MCM_CODE_DETAIL` 에 일괄 INSERT (java:47-66).
- **삭제**: `chk_regFlag` 체크 시 본 코드ID 의 모든 row 를 선 DELETE 후 재등록 (java:40-45).
- **조회 (다운로드용)**: 현재 등록된 row 를 가져와 `ds_grdDownload` 에 적재 → `gfn_exportExcel` 로 엑셀 내보내기 (xfdl:186-197 / xfdl:230-240).

### 1.3 화면 수정 이력 (xfdl 헤더 인용)

| 일자 | 작성자 | 설명 | 근거 |
|---|---|---|---|
| 2020.07.03 | 최규찬 | 최초 생성 | `MasterCodeUploadFilePopup.xfdl:145` |

## §2. 입력 자산 인벤토리

| # | 자료 구분 | 경로 (file) | 라인 수 | 분석 활용 결과 |
|---:|---|---|---:|---|
| 1 | xfdl (UI 정의 + xscript) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/cma/MasterCodeUploadFilePopup.xfdl` | 269 | §3 UI / §4 버튼 / §10 메시지 / §5 호출 출처(역추적) |
| 2 | Java UserTask | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/cma/MasterCodeUploadFilePopup/SaveMasterCodeFileUpload.java` | 79 | §7 트랜잭션 / §8 BPMN ↔ Java 매핑 |
| 3 | MyBatis Mapper (본 화면) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-cma/MasterCodeUploadFilePopupMapper.xml` | 20 | §6 SQL `GetCodeUploadList` |
| 4 | MyBatis Mapper (공용 — Save 가 사용) | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/persistence/mappers-Table_SOURCE/TB_MCM_CODE_DETAIL_Mapper.xml` | 578 (이 분석은 `delete`/`insert` 2 SQL 만 사용) | §6 SQL `delete` / `insert` |
| 5 | BPMN | `docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/cma/MasterCodeUploadFilePopup.bpmn` | 117 | §8 워크플로우 전수 |
| 6 | 호출원 xfdl (역추적) | `docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/cma/MasterCodeMng.xfdl` | (전체 미인용 / 778 line 인용) | §5 P-NNN 호출 출처 |
| 7 | DMES 테이블정의서 | `docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx` | (binary) | §9 사용 테이블 매핑 (참조 기반 — 본 분석에서 직접 컬럼 매핑은 Mapper 컬럼 카탈로그 §9 인용) |
| 8 | As-Is DDL `TB_MCM_CODE_DETAIL.sql` | `docs/external/SampleErp/tables/` | **부재** | §9 컬럼 카탈로그는 DMES Excel sheet36 (정본) + Mapper.xml if-block 통합. DDL 본문 (INDEX / 제약) 은 개발 단계 As-Is 운영 환경에서 추출 후 cactus-core JPA Entity 로 표현 (사용자 결정) |

## §3. UI 컴포넌트 전수 (xfdl)

### 3.1 영역 구성 (4 Div + 1 fold 버튼)

| ID | 종류 | 영역 명 | 위치 | 비고 | 근거 |
|---|---|---|---|---|---|
| (R-001) | Div | div_title | left=20, top=0, height=50 | 화면 타이틀 + 공용 상단 메뉴 (`commonTopButton.xfdl`) | xfdl:88-100 |
| (R-002) | Div | div_search | left=20, top=50, height=43 | 코드ID / 코드명 / 삭제등록 체크박스 — **조회조건 영역** | xfdl:102-113 |
| (R-003) | Button | btn_fold | top=93, height=15 | div_search 접기/펴기 (`gfn_fold`) | xfdl:6 / xfdl:263-266 |
| (R-004) | Div | div_main | left=20, top=btn_fold:5, right=20, bottom=30 | **메인 본문** — `grd_Upload` (보임) + `grd_Download` (숨김) 포함 | xfdl:7-87 |
| (R-005) | Div | div_bottom | left=0, height=20, bottom=0 | 공용 하단 상태바 (`commonBottomStatus.xfdl`) | xfdl:101 |

### 3.2 조회조건 (div_search 영역) — S-NNN

| ID | 표시명 (출처) | xfdl 컨트롤 | 종류 | bind / value | 읽기전용 | 코드/LoV | 기본값 | 필수 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| S-001 | 코드ID (Static stc_codeNm) | edt_MasterCode | Edit | this.sMasterCode (= 호출자가 전달한 `sMasterCode`) | true | - | "" (호출자 전달값) | N (read-only) | xfdl:105-106 / xfdl:159 / xfdl:162-164 |
| S-002 | 코드명 (Static stc_codeNm00) | edt_MasterCodeNm | Edit | this.sMasterCodeNm (= 호출자 전달 `sCodeNm`) | true | - | "" (호출자 전달값) | N (read-only) | xfdl:107-108 / xfdl:160 / xfdl:165-167 |
| S-003 | 삭제등록 (Static stc_flag) | chk_regFlag | CheckBox | (UI state — `value` 직접 read) | - | bool | false | N | xfdl:109-110 / xfdl:219 |

> S-001 / S-002 는 호출자 (`MasterCodeMng`) 가 modal 인자로 넘긴 `sMasterCode` / `sCodeNm` 을 read-only 로 표시. 사용자가 화면 안에서 변경 불가.

### 3.3 메인 그리드 G-NNN — grd_Upload (Excel Import 미리보기, 본 그리드만 사용자 가시)

`Grid id="grd_Upload"` (xfdl:10-43), binddataset=`ds_grdUpload` (xfdl:127-136), `selecttype="multiarea"`, `autofittype="col"`.

| ID | 그리드 | head 표시명 | bind 컬럼 | dataset 타입 | 사이즈 | 정렬 | 편집 | 근거 |
|---|---|---|---|---|---:|---|---|---|
| G-001 | grd_Upload | 코드ID | MASTER_CODE | STRING(256) | 80 | Left | (xfdl 기본) | xfdl:14 head / xfdl:26 head text / xfdl:34 body / xfdl:129 ds |
| G-002 | grd_Upload | 카테고리ID | CATEGORY_ID | STRING(256) | 80 | Left | (xfdl 기본) | xfdl:15 / xfdl:27 / xfdl:35 / xfdl:130 |
| G-003 | grd_Upload | 코드값 | CODE_VAL | STRING(256) | 80 | Left | (xfdl 기본) | xfdl:16 / xfdl:28 / xfdl:36 / xfdl:131 |
| G-004 | grd_Upload | 코드의미 | CODE_VAL_MEAN | STRING(256) | 80 | Left | (xfdl 기본) | xfdl:17 / xfdl:29 / xfdl:37 / xfdl:132 |
| G-005 | grd_Upload | 코드설명 | CODE_VAL_DESC | STRING(256) | 80 | Left | (xfdl 기본) | xfdl:18 / xfdl:30 / xfdl:38 / xfdl:133 |
| G-006 | grd_Upload | 정렬순서 | SORT_SEQ | STRING(256) | 80 | Left | (xfdl 기본) | xfdl:19 / xfdl:31 / xfdl:39 / xfdl:134 |

### 3.4 숨김 그리드 GE-NNN — grd_Download (Excel Export 용, `visible="false"`)

`Grid id="grd_Download"` (xfdl:44-84), binddataset=`ds_grdDownload`, `visible="false"`, `width=240`, `height=100`, `left=400 top=197`. **사용자에게 보이지 않음**. 용도: `fn_fileDown` 콜백에서 `gfn_exportExcel` 의 source 그리드로만 사용 (xfdl:237).

Format 의 `<Rows>` 는 head 2 행 + body 1 행 (xfdl:55-59) — `head row=0` = 한글 표시명, `head row=1` = 영문 컬럼명 (Excel 헤더로 export).

| ID | 그리드 | head[row=0] | head[row=1] | bind 컬럼 | dataset 타입 | 사이즈 | 근거 |
|---|---|---|---|---|---|---:|---|
| GE-001 | grd_Download (숨김) | 코드ID | MASTER_CODE | MASTER_CODE | STRING(256) | 80 | xfdl:61 head / xfdl:67 / xfdl:75 body / xfdl:119 ds |
| GE-002 | grd_Download (숨김) | 카테고리ID | CATEGORY_ID | CATEGORY_ID | STRING(256) | 80 | xfdl:62 / xfdl:68 / xfdl:76 / xfdl:120 |
| GE-003 | grd_Download (숨김) | 코드값 | CODE_VAL | CODE_VAL | STRING(256) | 80 | xfdl:63 / xfdl:69 / xfdl:77 / xfdl:121 |
| GE-004 | grd_Download (숨김) | 코드의미 | CODE_VAL_MEAN | CODE_VAL_MEAN | STRING(256) | 80 | xfdl:64 / xfdl:70 / xfdl:78 / xfdl:122 |
| GE-005 | grd_Download (숨김) | 코드설명 | CODE_VAL_DESC | CODE_VAL_DESC | STRING(256) | 80 | xfdl:65 / xfdl:71 / xfdl:79 / xfdl:123 |
| GE-006 | grd_Download (숨김) | 정렬순서 | SORT_SEQ | SORT_SEQ | STRING(256) | 80 | xfdl:66 / xfdl:72 / xfdl:80 / xfdl:124 |

> **차이점 정리**: `grd_Upload` (가시) = 사용자가 Excel 을 import 한 결과 보기 / `grd_Download` (숨김) = 서버 조회 결과를 받아 Excel export 만 수행. 두 dataset 의 컬럼 6 개는 동일 (`CODE_VER` 만 제외 — CODE_VER 은 서버 SELECT 시 반환되나 dataset 에 없음 — As-Is 보존, Excel export 대상 외).

### 3.5 dataset 컬럼 (xfdl `<Objects>` 전수)

`ds_grdUpload` (xfdl:127-136) + `ds_grdDownload` (xfdl:117-126) — 컬럼 6개 동일.

| dataset | 컬럼 ID | type | size |
|---|---|---|---:|
| ds_grdUpload | MASTER_CODE | STRING | 256 |
| ds_grdUpload | CATEGORY_ID | STRING | 256 |
| ds_grdUpload | CODE_VAL | STRING | 256 |
| ds_grdUpload | CODE_VAL_MEAN | STRING | 256 |
| ds_grdUpload | CODE_VAL_DESC | STRING | 256 |
| ds_grdUpload | SORT_SEQ | STRING | 256 |
| ds_grdDownload | MASTER_CODE | STRING | 256 |
| ds_grdDownload | CATEGORY_ID | STRING | 256 |
| ds_grdDownload | CODE_VAL | STRING | 256 |
| ds_grdDownload | CODE_VAL_MEAN | STRING | 256 |
| ds_grdDownload | CODE_VAL_DESC | STRING | 256 |
| ds_grdDownload | SORT_SEQ | STRING | 256 |

## §4. 버튼·액션 (B-NNN / GB-NNN)

> mui 의 버튼은 `commonTopButton.xfdl` 의 `fn_commonTop_onload` 에 동적 배열로 등록된다 (xfdl:174-182).

### 4.1 사용자 정의 버튼 (B-NNN) — `fn_button` 등록 (xfdl:173-183)

| ID | 버튼 식별자 | 라벨 | 핸들러 (xfdl method) | 동작 유형 (7 enum) | To-Be action (7 enum) | 비고 | 근거 |
|---|---|---|---|---|---|---|---|
| B-001 | btn_fileDown | 다운로드 | fn_fileDown | 조회 + 출력 | search → export | 서버 조회(`GetCodeUploadList`) 후 콜백에서 Excel export | xfdl:178 / xfdl:186-197 / xfdl:230-240 |
| B-002 | btn_fileUpload | 파일선택 | fn_fileUpload | 조회 (client side) | importExcel (client) | `gfn_importExcel` → ds_grdUpload 적재. 서버 호출 ✗ | xfdl:179 / xfdl:200-204 |
| B-003 | btn_fileSave | 등록 | fn_fileSave | 저장 | save | ds_grdUpload 를 server 로 전송, DELETE → INSERT | xfdl:180 / xfdl:212-223 |

### 4.2 기본 버튼 (B-기본)

| ID | 버튼 식별자 | 라벨 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|---|
| B-099 | btn_close | 닫기 | fn_close (기본 핸들러 — `gfn_popupClose`) | popup close | xfdl:181 / xfdl:255-260 |

> `btn_search` / `btn_confirm` 은 주석 처리되어 사용되지 않음 (xfdl:181).

### 4.3 그리드셀 인라인 버튼 (GB-NNN)

| 해당 없음 | grd_Upload 의 cell 에 ButtonField 정의 없음. grd_Download 동일. | — | xfdl:33-40 / xfdl:74-81 |

### 4.4 부수 트리거 (CheckBox / fold)

| ID | 트리거명 | 컨트롤 | 핸들러 | 동작 | 근거 |
|---|---|---|---|---|---|
| T-001 | div_search 접기/펴기 | btn_fold | btn_fold_onclick → `gfn_fold` | UI 접기/펴기 | xfdl:6 / xfdl:263-266 |
| T-002 | 삭제등록 토글 | chk_regFlag | (이벤트 핸들러 없음 — value 만 fn_fileSave 시 읽음) | UI state | xfdl:110 / xfdl:219 |

## §5. 호출 출처 (P-NNN — flat)

> 본 화면은 popup 이므로 **호출 출처 (= caller P-NNN)** 만 의미가 있고, 본 화면이 다른 popup 을 띄우는 경우는 없음 (xfdl 안에 OpenForm/openPopup 호출 ✗).

| P-NNN | 호출 유형 | 호출 화면 (file) | 호출 라인 | 트리거 | 전달 파라미터 | 콜백 | 근거 |
|---|---|---|---|---|---|---|---|
| P-001 | modal popup (역참조) | MasterCodeMng.xfdl | xfdl:778 | fn_addMasterCodeUploadFilePopup_onclick (ds_grdMain.rowposition != -1 조건) | `{sMasterCode: 메인 그리드 MASTER_CODE, sCodeNm: CODE_NM}` | fn_returnMasterCodeUploadFilePopupCallBack (return value 미사용 — rtVal null 체크 후 종료) | MasterCodeMng.xfdl:773-785 |

> P-001 의 호출 파라미터 `sMasterCode` / `sCodeNm` 은 본 화면 `fn_formAfterOnload` 에서 `gfn_Data_Return` 으로 수신 → div_search 의 edt_MasterCode / edt_MasterCodeNm 에 표시 (xfdl:159-167).

## §6. SQL ID 매트릭스

> 본 화면이 사용하는 SQL = 3 건. 본 화면 전용 매퍼는 `GetCodeUploadList` 1 건. `delete` / `insert` 는 **공용 매퍼** `TB_MCM_CODE_DETAIL_Mapper.xml` 의 dynamic SQL.

| SQL ID | 종류 | sqlKey (BPMN / Java 호출 식) | 매퍼 파일 (file:line) | trigger | 비고 |
|---|---|---|---|---|---|
| #1 | SELECT | `#{serviceId}Mapper.GetCodeUploadList` → `MasterCodeUploadFilePopupMapper.GetCodeUploadList` | `MasterCodeUploadFilePopupMapper.xml:7-19` | BPMN `Task_2` (action="search") | parameter: pCodeId. result map → `ds_GetCodeUploadList`. 본 화면 전용 매퍼. |
| #2 | DELETE | `TB_MCM_CODE_DETAIL_Mapper.delete` | `TB_MCM_CODE_DETAIL_Mapper.xml:17-21` | Java `SaveMasterCodeFileUpload` (pRegFlag="true" 일 때만) | dynamic where: `MASTER_CODE = #{param_MasterCode}` (java:43) — `${MYBATIS_WHERE}` 대입 |
| #3 | INSERT | `TB_MCM_CODE_DETAIL_Mapper.insert` | `TB_MCM_CODE_DETAIL_Mapper.xml:82-184` | Java `SaveMasterCodeFileUpload` (ds_grdUpload row 마다 호출) | dynamic insert. 본 화면에서 사용하는 컬럼: MASTER_CODE / CATEGORY_ID / CODE_VAL / CODE_VAL_MEAN / CODE_VAL_DESC / CODE_VER (= "1" 고정) / SORT_SEQ — java:50-56. Audit 컬럼은 **To-Be cactus-core `CactusAuditEntity` JPA listener 자동 채움** (사용자 결정 — As-Is `ref_Audit.insert_item / insert_value` include 폐기) |

### 6.1 SQL #1 SELECT 본문 1:1 인용 (`MasterCodeUploadFilePopupMapper.xml:7-19`)

```xml
<select id="GetCodeUploadList" parameterType="java.util.Map" resultType="java.util.Map">
    SELECT
          MASTER_CODE
        , CATEGORY_ID
        , CODE_VAL
        , CODE_VAL_MEAN
        , CODE_VAL_DESC
        , CODE_VER
        , SORT_SEQ
      FROM MCM_SOURCE.TB_MCM_CODE_DETAIL CDETAIL
     WHERE MASTER_CODE = #{pCodeId}
     ORDER BY CATEGORY_ID,SORT_SEQ
</select>
```

- 반환 컬럼 7 개 (CODE_VER 포함) — 단, 본 화면 dataset `ds_grdDownload` 에는 CODE_VER 컬럼이 정의되어 있지 않음 (xfdl:117-126) — As-Is 보존 (Excel export 대상 외, 사용자 결정).
- WHERE 절: `MASTER_CODE = #{pCodeId}` 단일 키.
- ORDER BY: CATEGORY_ID, SORT_SEQ (2-key).

### 6.2 SQL #2 DELETE 본문 1:1 인용 (`TB_MCM_CODE_DETAIL_Mapper.xml:17-21`)

```xml
<delete id="delete" parameterType="java.util.Map">
    DELETE
    FROM MCM_SOURCE.TB_MCM_CODE_DETAIL
    WHERE ${MYBATIS_WHERE}
</delete>
```

- 본 화면이 호출 시 `MYBATIS_WHERE = "MASTER_CODE = #{param_MasterCode}"` (java:43).
- 즉 본 코드ID 의 모든 row 삭제.

### 6.3 SQL #3 INSERT 본 화면이 사용하는 INSERT 컬럼 (Java param 기준)

Java `SaveMasterCodeFileUpload` 가 dynamic INSERT 에 넘기는 키 (java:50-56):

| 컬럼 | 값 출처 | 값 형식 |
|---|---|---|
| MASTER_CODE | ds_grdUpload[i].get("MASTER_CODE") | String (cast) |
| CATEGORY_ID | ds_grdUpload[i].get("CATEGORY_ID") | String |
| CODE_VAL | ds_grdUpload[i].get("CODE_VAL") | String |
| CODE_VAL_MEAN | ds_grdUpload[i].get("CODE_VAL_MEAN") | String |
| CODE_VAL_DESC | ds_grdUpload[i].get("CODE_VAL_DESC") | String |
| CODE_VER | **"1" 고정** (java:55) | String |
| SORT_SEQ | ds_grdUpload[i].get("SORT_SEQ") | String |

> `CODE_VAL_REF1~5` / `CODE_VAL_REMARK` 등은 본 화면에서 INSERT 하지 않음 — As-Is NULL 허용 보존 (사용자 결정). `ARCHIVE_*` / `DATA_END_*` 9 컬럼은 **To-Be 제거** (cactus-core 9 컬럼 적용).

## §7. Java 트랜잭션 분석

### 7.1 클래스 메타

| 항목 | 값 | 근거 |
|---|---|---|
| As-Is 클래스 FQN | com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.SaveMasterCodeFileUpload | java:1, java:18 |
| **To-Be 클래스 FQN** | `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | - |
| 인터페이스 | com.dongkuk.oasis.task.Wow (`implements Wow`) | java:13, java:18 |
| 메서드 | `public String run(Context context, Task task)` | java:20 |
| Logger | `@Slf4j` (lombok) | java:15, java:17 |
| 의존 (import) | CactusConstants / Context / IllegalTaskException / Task / CommonDaoUtil / TransactionalDao / Wow | java:7-13 |

### 7.2 입력 파라미터 (Context 추출)

| 키 | 출처 (xfdl) | java 처리 | 근거 |
|---|---|---|---|
| pCodeId | `gfn_setParam("pCodeId", this.sMasterCode)` (xfdl:218) | `(String)context.get("pCodeId").toString()` → 로컬 변수 `MasterCode` | java:27 |
| pRegFlag | `gfn_setParam("pRegFlag", this.div_search.form.chk_regFlag.value)` (xfdl:219) | `(String)context.get("pRegFlag").toString()` → 로컬 변수 `pRegFlag` | java:28 |
| ds_grdUpload | `sInDatasets = "ds_grdUpload=ds_grdUpload"` (xfdl:216) | `(ArrayList<HashMap<String,Object>>)context.get("ds_grdUpload")` | java:30-31 |

### 7.3 처리 흐름 (line-by-line)

| 단계 | 줄 | 동작 | 비고 |
|---|---:|---|---|
| S1 | java:22 | log.debug 시작 로깅 | "##########	Master Code 등록 엑셀IMPORT 저장 시작" |
| S2 | java:25 | `TransactionalDao dao = context.getDao();` | Oasis 트랜잭션 dao 획득 |
| S3 | java:27-28 | pCodeId / pRegFlag context 추출 | 위 §7.2 |
| S4 | java:30-31 | ds_grdUpload 캐스팅 | ArrayList<HashMap<String,Object>> |
| S5 | java:33 | param Map 생성 | HashMap<String,Object> — 재사용 buffer |
| S6 | java:35 | log.debug MasterCode 로깅 | - |
| S7 | java:37 | int cnt = 0 | 저장 성공 카운터 |
| S8 (선삭제) | java:40-45 | `if(pRegFlag.equals("true"))` 시: param.clear() → `param_MasterCode = MasterCode` → `MYBATIS_WHERE = "MASTER_CODE = #{param_MasterCode}"` → `dao.delete("TB_MCM_CODE_DETAIL_Mapper.delete", param)` | 본 MASTER_CODE 의 모든 row 일괄 삭제 |
| S9 (반복 INSERT) | java:47-66 | `for(int i=0; i<ds_grdUpload.size(); i++)` 마다: param.clear() → 7 컬럼 put → `dao.update("TB_MCM_CODE_DETAIL_Mapper.insert", param)` | dao.update 가 0 이하 (= insert 실패) 면 `throw new Exception("TB_MCM_CODE_DETAIL_Mapper.insert 에러발생")` (java:60). 그렇지 않으면 cnt++. |
| S10 | java:68 | `CommonDaoUtil.addDaoResultIntoContext(context, "cnt_import", cnt, null, true)` | result key = `cnt_import` → xfdl 콜백 `strErrorMsg["cnt_import"]` 로 표시됨 (xfdl:243) |
| S11 | java:70 | `return null` | 정상 종료 |
| S12 (예외) | java:71-75 | catch Exception → log.info / log.error → `throw new IllegalTaskException(e)` | Oasis 표준 예외 wrap. BPMN 차원 트랜잭션 rollback. |

### 7.4 트랜잭션 경계

- `TransactionalDao` 의 의미상 (Oasis 표준): UserTask 단위 = 1 트랜잭션. **DELETE + 모든 row INSERT 가 atomic** — 한 row 라도 INSERT 실패 (= dao.update <= 0) 시 Exception → IllegalTaskException → BPMN 차원 rollback → 모든 DELETE / INSERT 취소.
- 따라서 **부분 성공 케이스 없음** (전부 성공 or 전부 rollback).
- xfdl 콜백 `case "save"` (xfdl:241-250) 도 nErrorCode == 0 인 경우만 "마스터코드 등록이 완료되었습니다." 표시 (As-Is atomic 트랜잭션 보존 — 부분 실패 ✗, 전체 rollback. 사용자 결정).

### 7.5 비기능 결함 / 잠재 이슈

| ID | 결함 | 위치 | 영향 |
|---|---|---|---|
| F-001 | `param.clear()` 후 재사용 — DELETE 단계의 `MYBATIS_WHERE` / `param_MasterCode` key 가 다음 INSERT iter 시작 시 clear 됨 (java:49 `param.clear()`) — **정상**. 단, 만약 향후 보강 시 param 분리 미수행하면 키 잔존 위험. | java:33, 41, 49 | low |
| F-002 | `dao.update(...) <= 0` 시 `throw new Exception(...)` — 일반 `Exception` 사용. checked exception 강제 + outer catch 에서 IllegalTaskException 으로 wrap 됨. log 측면에서 원인 row index 미포함 → 디버깅 어려움. | java:58-61 | mid (운영 디버깅) |
| F-003 | `(String)ds_grdUpload.get(i).get("XXX")` cast — Excel 셀이 number 로 import 된 경우 ClassCastException 위험. **To-Be `String.valueOf(...)` 방어 보강** (사용자 결정). | java:50-56 | mid |
| F-004 | CODE_VER 을 무조건 "1" 고정 (java:55). 코드 버전 관리가 무의미하거나 의도된 단순 기본값. | java:55 | low |
| F-005 | `chk_regFlag` 미체크 시 (= pRegFlag="false") DELETE 없이 INSERT 만 → PK (MASTER_CODE+CATEGORY_ID+CODE_VAL) 중복 시 INSERT 실패 가능. **To-Be 사전 검증 추가** (preview 단계 PK 중복 체크 — 사용자 결정). | java:40 | high (실패 시 전체 rollback) |

## §8. BPMN 워크플로우 전수

### 8.1 process 메타

| 항목 | 값 | 근거 |
|---|---|---|
| process id | MasterCodeUploadFilePopup | bpmn:3 |
| process name | 마스터코드 등록(Excel Upload) | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |
| basePackage 변수 | `#{basePackage}SaveMasterCodeFileUpload` | bpmn:41. **As-Is**: `com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.` 주입. **To-Be**: `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.` 주입 (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |
| serviceId 변수 | `#{serviceId}Mapper.GetCodeUploadList` | bpmn:19 (runtime 에 `MasterCodeUploadFilePopup` 주입) |

### 8.2 flow 노드 전수

| ID | 종류 | name | incoming | outgoing | 비고 | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | Start Event | — | SequenceFlow_1 | - | bpmn:4-6 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | (no name) | SequenceFlow_1 | SequenceFlow_0grwghu / SequenceFlow_0r4u7xr | action 분기 (search / save) | bpmn:26-33 |
| Task_2 | task (CommonSelectTask) | 마스터코드 조회 | SequenceFlow_0grwghu | SequenceFlow_0lnje1n | sqlKey=`#{serviceId}Mapper.GetCodeUploadList`, resultKey=`ds_GetCodeUploadList` | bpmn:11-25 |
| UserTask_09dxtkf | userTask | 마스터코드 Import | SequenceFlow_0r4u7xr | SequenceFlow_1p74ti7 | class=`#{basePackage}SaveMasterCodeFileUpload` | bpmn:37-46 |
| EndEvent_1 | endEvent | End Event | SequenceFlow_0lnje1n / SequenceFlow_1p74ti7 | — | 단일 EndEvent (양 분기 수렴) | bpmn:7-10 |

### 8.3 sequenceFlow 전수

| ID | source | target | name (action) | 비고 | 근거 |
|---|---|---|---|---|---|
| SequenceFlow_1 | StartEvent_1 | ExclusiveGateway_1 | — | - | bpmn:34 |
| SequenceFlow_0grwghu | ExclusiveGateway_1 | Task_2 | search | xfdl `sSvcID="search"` (xfdl:188) | bpmn:35 |
| SequenceFlow_0r4u7xr | ExclusiveGateway_1 | UserTask_09dxtkf | save | xfdl `sSvcID="save"` (xfdl:214) | bpmn:47 |
| SequenceFlow_0lnje1n | Task_2 | EndEvent_1 | — | search 종료 | bpmn:36 |
| SequenceFlow_1p74ti7 | UserTask_09dxtkf | EndEvent_1 | — | save 종료 | bpmn:48 |

### 8.4 Task_2 (search) 확장 속성

| property | value | 근거 |
|---|---|---|
| modelerTemplate | com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate | bpmn:11 |
| class | com.dongkuk.oasis.task.commonDbTask.CommonSelectTask | bpmn:15 |
| paramKey | (empty) | bpmn:16 |
| isServiceResult | true | bpmn:17 |
| dao | (empty) | bpmn:18 |
| sqlKey | `#{serviceId}Mapper.GetCodeUploadList` | bpmn:19 |
| resultKey | ds_GetCodeUploadList | bpmn:20 |

### 8.5 UserTask_09dxtkf (save) 확장 속성

| property | value | 근거 |
|---|---|---|
| modelerTemplate | com.dongkuk.dmes.UserTask | bpmn:37 |
| nextBranchSpel | (empty) | bpmn:40 |
| class | `#{basePackage}SaveMasterCodeFileUpload` | bpmn:41 |

### 8.6 action ↔ B-NNN ↔ flow 매트릭스

| sSvcID (xfdl) | 호출 함수 (xfdl) | B-NNN | sequenceFlow (bpmn) | target node | sqlKey / class |
|---|---|---|---|---|---|
| search | fn_fileDown (xfdl:186-197) | B-001 | SequenceFlow_0grwghu | Task_2 | `MasterCodeUploadFilePopupMapper.GetCodeUploadList` |
| (없음 — client 처리) | fn_fileUpload (xfdl:200-204) | B-002 | (서버 호출 없음) | — | `gfn_importExcel` (nexacro client API) |
| save | fn_fileSave (xfdl:212-223) | B-003 | SequenceFlow_0r4u7xr | UserTask_09dxtkf | As-Is `com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.SaveMasterCodeFileUpload` / To-Be `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) |

## §9. 사용 테이블

### 9.1 테이블 인벤토리

| # | 테이블명 (전체 식별자) | 용도 | CRUD | 본 화면 트리거 |
|---:|---|---|---|---|
| 1 | **`MCM_SOURCE.TB_MCM_CODE_DETAIL` (원장 schema 명시 — synonym 아님 / DMES Excel sheet36 r2 정본은 동일 테이블의 운영 read 동기화본 `MCMAPUSER.TB_MCM_CODE_DETAIL`)** | 마스터 코드 상세 (코드 카테고리·값·의미) | C/R/D | INSERT (java:58), SELECT (`MasterCodeUploadFilePopupMapper.GetCodeUploadList`), DELETE (java:44) — UPDATE 미사용. 본 화면 = **원장 편집 화면 (Excel Upload → INSERT/DELETE)** 이므로 To-Be 정본 schema = `MCM_SOURCE` (2026-05-29 사용자 명시 정정). |

> **3 schema 구조 (2026-05-29 사용자 명시 정정)**: **`MCM_SOURCE`** (원장 — 본 화면 DML 대상: Excel Upload → 원장 INSERT/DELETE) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임). As-Is mui DB테이블명세서 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`): "스키마: MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합. As-Is mui Mapper.xml 의 `MCM_SOURCE.` prefix 는 synonym 이 아니라 **원장 schema 명시**. selPop = 운영 read 화면 → `MCMAPUSER.VI_MCM_CODE_ACCESS` 와 반대 결정 (본 화면 = 원장 편집).

### 9.2 컬럼 카탈로그 (TB_MCM_CODE_DETAIL — DMES Excel sheet36 (30 컬럼 정본) + As-Is Mapper.xml if-block 본 화면 사용 매핑)

> DMES Excel sheet36 추출 으로 컬럼 정본 30 개 확보. As-Is Mapper.xml dynamic if-block 의 컬럼명과 본 화면 사용 여부를 매핑. As-Is DDL `TB_MCM_CODE_DETAIL.sql` 별도 파일은 부재 — **To-Be**: cactus-core JPA Entity 로 INDEX / 제약조건 표현 (사용자 결정).

| 컬럼명 | 본 화면 사용 (Y/N) | 본 화면 값 출처 | 카탈로그 출처 (file:line) |
|---|---|---|---|
| MASTER_CODE | Y | ds_grdUpload[i].MASTER_CODE | TB_MCM_CODE_DETAIL_Mapper.xml:27 / xml:85 |
| CATEGORY_ID | Y | ds_grdUpload[i].CATEGORY_ID | xml:28 / xml:86 |
| CODE_VAL | Y | ds_grdUpload[i].CODE_VAL | xml:29 / xml:87 |
| CODE_VAL_MEAN | Y | ds_grdUpload[i].CODE_VAL_MEAN | xml:30 / xml:88 |
| CODE_VAL_REF1 | N | - | xml:31 / xml:89 |
| CODE_VAL_REF2 | N | - | xml:32 / xml:90 |
| CODE_VAL_REF3 | N | - | xml:33 / xml:91 |
| CODE_VAL_REF4 | N | - | xml:34 / xml:92 |
| CODE_VAL_REF5 | N | - | xml:35 / xml:93 |
| CODE_VAL_DESC | Y | ds_grdUpload[i].CODE_VAL_DESC | xml:36 / xml:94 |
| CODE_VAL_REMARK | N | - | xml:37 / xml:95 |
| CODE_VER | Y | **"1" 고정** (java:55) | xml:38 / xml:96 |
| SORT_SEQ | Y | ds_grdUpload[i].SORT_SEQ | xml:39 / xml:97 |
| LAST_UPDATED_OBJECT_TYPE | (audit 자동) | ref_Audit.insert_item | xml:40 / xml:102 |
| LAST_UPDATED_OBJECT_ID | (audit 자동) | ref_Audit.insert_item | xml:41 / xml:103 |
| LAST_UPDATE_PROGRAM_ID | (audit 자동) | ref_Audit.insert_item | xml:42 / xml:104 |
| LAST_UPDATE_TIMESTAMP | (audit 자동) | ref_Audit.insert_item | xml:44-50 / xml:105 |
| DATA_END_STATUS | (audit 자동) | ref_Audit.insert_item_dataend (조건부) | xml:52 / xml:106 |
| DATA_END_OBJECT_TYPE | (audit 자동) | ref_Audit | xml:53 / xml:107 |
| DATA_END_OBJECT_ID | (audit 자동) | ref_Audit | xml:54 / xml:108 |
| DATA_END_PROGRAM_ID | (audit 자동) | ref_Audit | xml:55 / xml:109 |
| DATA_END_TIMESTAMP | (audit 자동) | ref_Audit | xml:57-63 / xml:110 |
| ARCHIVE_COMPLETED_FLAG | N | - | xml:65 / xml:111 |
| ARCHIVED_EMPLOYEE_NUM | N | - | xml:66 / xml:112 |
| ARCHIVED_TIMESTAMP | N | - | xml:67-73 / xml:113 |
| ARCHIVE_PROGRAM_ID | N | - | xml:74 / xml:114 |
| CREATED_OBJECT_TYPE | (audit 자동) | ref_Audit.insert_item | xml:98 |
| CREATED_OBJECT_ID | (audit 자동) | ref_Audit.insert_item | xml:99 |
| CREATED_PROGRAM_ID | (audit 자동) | ref_Audit.insert_item | xml:100 |
| CREATION_TIMESTAMP | (audit 자동) | ref_Audit.insert_item | xml:101 |

### 9.3 PK 추정 (mergePK 의 ON 절로부터)

`TB_MCM_CODE_DETAIL_Mapper.xml:196-198` 의 `MERGE INTO ... ON` 절 매칭 컬럼:

| PK 후보 컬럼 | 근거 |
|---|---|
| MASTER_CODE | xml:196 |
| CATEGORY_ID | xml:197 |
| CODE_VAL | xml:198 |

> 즉 As-Is 의 자연 PK = `(MASTER_CODE, CATEGORY_ID, CODE_VAL)` 3-컬럼 복합. CODE_VER 가 PK 에 미포함 → 버전 컬럼이 있어도 단일 row 유지.

### 9.4 DMES Excel 매핑 (정본 확정)

> DMES Excel sheet36 (CODE_DETAIL) 추출 결과 (Bash + Python xml 파싱):

| Excel 정보 | 값 |
|---|---|
| Table 명 | `MCMAPUSER.TB_MCM_CODE_DETAIL` (sheet36 r2 정본) |
| 항목 수 | 30 컬럼 |
| 한글명 | "마스터코드값" (sheet36 r3) |
| 핵심 컬럼 (한글의미 / Type / 자릿수) | MASTER_CODE / VARCHAR / 50 (PK) — Excel sheet36 r7 |
|   | CATEGORY_ID / VARCHAR / 180 — sheet36 r8 |
|   | CODE_VAL / VARCHAR / 50 — sheet36 r9 |
|   | CODE_VAL_MEAN / VARCHAR / 120 — sheet36 r10 |
|   | CODE_VAL_REF1~5 / VARCHAR / 300 — sheet36 r11~r15 |
|   | CODE_VAL_DESC / VARCHAR / 300 — sheet36 r16 |
|   | CODE_VAL_REMARK / VARCHAR / 300 — sheet36 r17 (As-Is 본 화면 미사용 / **To-Be 보존** — 사용자 결정) |
|   | CODE_VER / NUMBER / 8,2 — sheet36 r18 |
|   | SORT_SEQ / NUMBER / 8 — sheet36 r19 |
|   | audit 17 컬럼 (CREATED_/LAST_UPDATED_/DATA_END_/ARCHIVE_ × 4 그룹) — sheet36 r20~r36 |

> **To-Be (2026-05-29 사용자 명시 정정)**: **`MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema — 본 화면 DML 대상)**. DMES Excel sheet36 r2 의 `MCMAPUSER.TB_MCM_CODE_DETAIL` 은 **운영 read 동기화본** (다른 모듈/뷰 SELECT 대상) 이며, **본 화면은 원장 편집 화면 (Excel Upload → INSERT/DELETE)** 이므로 schema = `MCM_SOURCE` 가 정본. 3 schema 구조 (`MCM_SOURCE` 원장 / `MCMAPUSER` 운영 read / `MCM_BACKUP` 백업본) 는 §9.1 비고 참조. 미사용 컬럼 보존/제거: `CODE_VAL_REF1~5` / `CODE_VAL_REMARK` 보존 / `DATA_END_*` + `ARCHIVE_*` (audit 그룹 3·4 9 컬럼) **제거** (cactus-core 9 컬럼 적용 — 3 schema 모두 동일 적용).

## §10. 코드값 / LoV

### 10.1 본 화면 직접 LoV 호출

| 해당 없음 — xfdl 안에 NewCodeQuery / GeneralDialog / LovPopup 호출 ✗ | (xfdl 전수 확인) |

### 10.2 ref_Audit (감사 컬럼 표준)

- `ref_Audit.insert_item` / `ref_Audit.insert_value` / `ref_Audit.update` (다수 mapper 공용 fragment) — 본 화면 INSERT 시 자동 포함 (xml:115 / xml:180).
- 본 mapper 가 어떤 fragment 파일을 include 하는지는 외부 (mybatis config). **To-Be**: cactus-core `CactusAuditEntity` 9 컬럼 적용으로 fragment 자체 폐기 (사용자 결정).

### 10.3 chk_regFlag 의미 (단순 enum)

| 값 | 의미 | 트리거 |
|---|---|---|
| true | 본 MASTER_CODE 의 기존 row 전체 삭제 후 INSERT | java:40 |
| false (or null) | 선 삭제 없이 INSERT — PK 중복 시 실패 | java:40 |

## §11. As-Is → To-Be DB 변환점 (Oracle → MSSQL)

### 11.1 SQL 식 단위 변환점

| # | As-Is (Oracle) | 위치 | To-Be (MSSQL) | 영향 |
|---:|---|---|---|---|
| C-001 | `TO_TIMESTAMP('${ARCHIVED_TIMESTAMP}')` (Oracle 함수) | `TB_MCM_CODE_DETAIL_Mapper.xml:48 / :60 / :141 / :153 / :167 / :221 / :234 / :245 / :309 / :321 / :334` | `CONVERT(DATETIME2, '${ARCHIVED_TIMESTAMP}', ...)` 또는 `TRY_CONVERT(DATETIME2, ...)` | INSERT / UPDATE 의 timestamp 컬럼 — 본 화면 INSERT 는 audit fragment 의 insert_value 가 SYSDATE/SYSTIMESTAMP literal 처리 (xml:139-141) 이므로 fragment 자체를 MSSQL 용으로 교체 필요 |
| C-002 | `SYSDATE` / `SYSTIMESTAMP` 키워드 매치 (xml:47 / xml:60 / xml:140 / xml:152) | TB_MCM_CODE_DETAIL_Mapper.xml | `SYSDATETIME()` / `GETDATE()` / `SYSUTCDATETIME()` | audit fragment 의 timestamp 자동 발행 |
| C-003 | `MERGE INTO ... USING (SELECT ... FROM DUAL) ON (...)` (Oracle 구문) | TB_MCM_CODE_DETAIL_Mapper.xml:187-200 | MSSQL `MERGE` 구문 (서브쿼리에 `FROM DUAL` 제거, MSSQL 은 `(VALUES (...)) AS T(...)` 형태) | 본 화면은 mergePK 미사용 → 영향 없음. 단, 공용 mapper 재사용 시 다른 화면 영향 |
| C-004 | `${MYBATIS_WHERE}` literal substitution | java:43 / xml:10 / xml:20 / xml:78 | 본 분기는 ANSI SQL 호환 → 변경 없음 | low |
| C-005 | `MCM_SOURCE.TB_MCM_CODE_DETAIL` schema prefix (mui Mapper.xml — **원장 schema 명시 / synonym 아님**) | MasterCodeUploadFilePopupMapper.xml:16 / TB_MCM_CODE_DETAIL_Mapper.xml:9 / 19 / 25 / 83 / 188 | **`MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema)** — 본 화면 = Excel Upload → 원장 INSERT/DELETE 수행 (2026-05-29 사용자 명시 정정). MSSQL 도 동일 schema 명 보존 (3 schema 구조 §11.3 참조). | 모든 SQL 의 FROM/INTO 절 |
| C-006 | Oracle 컬럼명 (UPPER + UNDERSCORE) | 본 화면 7 컬럼 | MSSQL 도 동일 가능 (대소문자 무관 collation) — 단, To-Be Entity Java 명명 = camelCase (masterCode 등) | mapper resultType=Map 사용 시 영향 없음 / Entity 매핑 시 column 어노테이션 필요 |

### 11.2 파일 업로드 처리 영향 (Oracle → MSSQL 변환과 무관한 영향)

- **xfdl `gfn_importExcel` 자체는 nexacro client 처리 — 서버 DBMS 변경 영향 없음** (xfdl:203).
- **To-Be Excel parsing**: SheetJS (FE) — 사용자 결정.
- **To-Be 전송 spec**: REST API JSON (행 배열) — 사용자 결정. As-Is OASIS gfn_transaction 컨벤션 유지.

### 11.3 To-Be 테이블 명명 제안 / 3 schema 구조 (2026-05-29 사용자 명시 정정)

| As-Is | To-Be 후보 (모듈 룰 `TB_{모듈명}_{역할}`) | 비고 |
|---|---|---|
| `MCM_SOURCE.TB_MCM_CODE_DETAIL` (mui Mapper.xml — **원장 schema 명시 / synonym 아님**) | **`MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema)** | 본 화면 = Excel Upload → 원장 INSERT/DELETE (원장 편집 화면). 2026-05-29 사용자 명시 정정. |

#### 11.3.1 3 schema 구조 (2026-05-29 사용자 명시)

| schema | 역할 | 본 화면 관계 | 비고 |
|---|---|---|---|
| **`MCM_SOURCE`** | 원장 (편집/DML 대상) | **본 화면 DML 대상** (Excel Upload → INSERT/DELETE) | As-Is mui Mapper.xml 의 `MCM_SOURCE.` prefix = synonym 아니라 원장 schema 명시 |
| **`MCMAPUSER`** | 운영 read 동기화본 | 본 화면 직접 사용 ✗ (다른 모듈/뷰 SELECT 대상) | DMES Excel sheet36 r2 의 schema. 동기화 화면이 MCM_SOURCE → MCMAPUSER 로 row copy. selPop 등 운영 read 화면은 `MCMAPUSER.VI_MCM_CODE_ACCESS` 사용 |
| **`MCM_BACKUP`** | 백업본 | 본 화면 직접 사용 ✗ | 동기화 화면 사이클 위임 (별도 worker 진행 중) |

근거: As-Is mui DB테이블명세서 `docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5` — "스키마: MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합.

### 11.4 audit 9 컬럼 3 schema 통일 적용 (2026-05-29 사용자 명시)

audit 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`) = cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 자동 적용. **3 schema (`MCM_SOURCE` / `MCMAPUSER` / `MCM_BACKUP`) 모두 동일 적용** — 동기화 시 row copy 정합 위해. 가이드 02 §A.5-3-1 정본 / BackEnd 가이드 §8-1 MUST.

## §12. 결정 후보 / Q-NNN

활성 확인필요 = **0 건**. 사용자 결정 완료.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **스키마/테이블명 (2026-05-29 사용자 명시 정정)** | As-Is `MCM_SOURCE.TB_MCM_CODE_DETAIL` (mui Mapper.xml — **원장 schema 명시, synonym 아님**) → **To-Be `MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema)**. 본 화면 INSERT/DELETE = 원장 DML 정합. 근거: mui DB테이블명세서 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`) "스키마: MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기. selPop = 운영 read 화면 → `MCMAPUSER.VI_MCM_CODE_ACCESS` 와 반대 결정 (본 화면 = 원장 편집). | §9 / §11.1 (C-005) / §11.3 |
| **3 schema 구조 (2026-05-29 사용자 명시 정정)** | **`MCM_SOURCE`** (원장 — 본 화면 DML 대상: Excel Upload → INSERT/DELETE) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임). | §9.1 / §11.3.1 |
| **audit 컬럼 (3 schema 통일 적용)** | As-Is `ref_Audit` fragment → To-Be cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`). **3 schema (MCM_SOURCE / MCMAPUSER / MCM_BACKUP) 모두 동일 적용** (동기화 시 row copy 정합). 가이드 02 §A.5-3-1 정본 / BackEnd 가이드 §8-1 MUST. DATA_END_*/ARCHIVE_* 9 컬럼 제거. | §9 / §11.4 |
| **`CODE_VAL_REMARK`** | DDL 정의 존재 / As-Is 미사용 → **To-Be 보존** (사용자 결정) | §9 |
| **DDL 본문 (INDEX / 제약)** | 개발 단계 As-Is 운영 환경에서 추출 후 MSSQL 변환 (cactus-core JPA `@Entity` 로 INDEX / FK 등 표현) | §11 |
| **`ds_grdDownload` CODE_VER 누락** | As-Is 보존 (Excel export 대상 외 — 의도된 동작) | §3.4 |
| **INSERT 컬럼 (CODE_VAL_REF1~5 등 미공급)** | As-Is NULL 허용 보존 (Excel import 컬럼만 INSERT, 나머지는 NULL) | §6 |
| **부분 실패 UX** | As-Is atomic 트랜잭션 보존 (전체 rollback) — To-Be 동일 (단순성) | §7 / 기능 §10 |
| **Excel cell type cast (F-003)** | To-Be `toString()` 방어 보강 (안정성) | BPMN §5 |
| **chk_regFlag=false PK 중복 (F-005)** | To-Be 사전 검증 추가 (preview 단계 PK 중복 체크) | 기능 §6 |
| **Excel parsing 라이브러리** | SheetJS (FE) — As-Is Nexacro `gfn_importExcel` 동등 기능 | 디자인 §3 |
| **전송 spec** | JSON (row 배열) — As-Is OASIS gfn_transaction 컨벤션 유지 | BPMN §2 |
| **Java 패키지** | `com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.*` → **Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.{service,dto}.*`** (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | §7 / BPMN §4 |
| **권한** | To-Be 외부 권한 프로세스 위임 | 기능 §8 |
| **동시성 / Optimistic Locking** | cactus-core `VER` (@Version) 자동 적용 | §9 / §11 |

## §13. 정합 게이트 자가 점검

| Gate | 점검 항목 | 결과 | 비고 |
|---|---|---|---|
| G-1 | xfdl Form@id == BPMN process@id == asIsId | ✓ | 모두 "MasterCodeUploadFilePopup" |
| G-2 | xfdl titletext == BPMN process@name | ✓ | "마스터코드 등록(Excel Upload)" |
| G-3 | xfdl `sSvcID` 값 ("search" / "save") == BPMN sequenceFlow@name | ✓ | bpmn:35 / bpmn:47 |
| G-4 | xfdl `sUrl` (xfdl:189 `"cma::MasterCodeUploadFilePopup"`) → BPMN service location | ✓ | `services/cma/MasterCodeUploadFilePopup.bpmn` 일치 |
| G-5 | BPMN sqlKey `#{serviceId}Mapper.GetCodeUploadList` → mapper namespace + select id | ✓ | `MasterCodeUploadFilePopupMapper.GetCodeUploadList` (`MasterCodeUploadFilePopupMapper.xml:5 / 7`) |
| G-6 | xfdl `sOutDatasets` ds_GetCodeUploadList == BPMN Task_2 resultKey | ✓ | bpmn:20 / xfdl:191 |
| G-7 | xfdl `sInDatasets="ds_grdUpload=ds_grdUpload"` → java `context.get("ds_grdUpload")` | ✓ | xfdl:216 / java:31 |
| G-8 | xfdl `gfn_setParam` 파라미터 (pCodeId, pRegFlag) → java context.get | ✓ | xfdl:218-219 / java:27-28 |
| G-9 | BPMN UserTask class `#{basePackage}SaveMasterCodeFileUpload` → java FQN | ✓ | bpmn:41 / java:1 + 18 |
| G-10 | xfdl 컬럼 6 ↔ INSERT 7 컬럼 (= 6 + CODE_VER 고정) | ✓ (CODE_VER 외 동일) | xfdl:127-136 / java:50-56 |
| G-11 | xfdl `ds_grdDownload` 6 컬럼 ↔ SQL `GetCodeUploadList` 7 컬럼 (CODE_VER 미포함) | ○ (As-Is 보존 — Excel export 대상 외, 사용자 결정) | xfdl:117-126 / Mapper.xml:8-15 |
| G-12 | xfdl 콜백 `strErrorMsg["cnt_import"]` ↔ java `addDaoResultIntoContext(... "cnt_import" ...)` | ✓ | xfdl:243 / java:68 |
| G-13 | xfdl 콜백 `strErrorMsg["ds_GetCodeUploadList"]` ↔ BPMN resultKey | ✓ | xfdl:233 / bpmn:20 |

> 전 게이트 ✓.

## §14. 커버리지 매트릭스

| 영역 | 발견 (xfdl/java/xml/bpmn 자산 카운트) | 본 보고서 반영 | Q-NNN | 자연제외 |
|---|---:|---:|---:|---:|
| xfdl Div | 4 | 4 (§3.1) | 0 | 0 |
| xfdl Static | 3 | 3 (§3.2) | 0 | 0 |
| xfdl Edit | 3 (edt_title / edt_MasterCode / edt_MasterCodeNm) | 3 (§3.1 / §3.2) | 0 | 0 |
| xfdl CheckBox | 1 | 1 (§3.2 S-003) | 0 | 0 |
| xfdl Button (xfdl native) | 1 (btn_fold) | 1 (§4.4 T-001) | 0 | 0 |
| xfdl Button (commonTopButton 동적) | 4 (btn_fileDown / btn_fileUpload / btn_fileSave / btn_close) | 4 (§4.1 / §4.2) | 0 | 0 |
| xfdl Grid | 2 | 2 (§3.3 / §3.4) | 0 | 0 |
| xfdl Dataset | 2 (ds_grdUpload / ds_grdDownload) | 2 (§3.5) | 0 | 0 |
| xfdl method | 9 (onload / formAfterOnload / fn_button / fn_fileDown / fn_fileUpload / fn_callImportBack / fn_fileSave / fn_callBack / fn_close / btn_fold_onclick) | 10 (§4 / §7.2 / §7.3 / §10) | 0 | 0 |
| Mapper SQL (본 화면 전용) | 1 (GetCodeUploadList) | 1 (§6) | 0 | 0 |
| Mapper SQL (공용 — Save 사용) | 2 (delete / insert) | 2 (§6) | 0 | 0 |
| Java 메서드 | 1 (run) | 1 (§7) | 0 | 0 |
| BPMN node | 5 (Start / EG / Task_2 / UserTask / End) | 5 (§8.2) | 0 | 0 |
| BPMN sequenceFlow | 5 | 5 (§8.3) | 0 | 0 |

**합계**: 발견 자산 100% 본 보고서 반영. 자연제외 0건. Q-NNN 활성 11건.
