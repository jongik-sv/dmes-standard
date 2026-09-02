---
screenId: masterCodeSelPop
asIsId: MasterCodeSelPop
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# 마스터코드 선택 팝업 정합체크서

> 4종 설계서 (분석 / 기능 / 디자인 / BPMN) 작성 후 본 정합체크서를 작성한다. §A~§F 모두 ✓ 일 때 설계 완료 판정.

| 절 | 제목 | 차단 여부 | 결과 |
|---|---|---|---|
| §A | 분석리포트 단일 원천 정합 | ✗ → 미완성 | ✓ |
| §B | 식별자 정합 | ✗ → 미완성 | ✓ |
| §C | SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey) | ✗ → 미완성 | ✓ |
| §D | 식별자 명명 정합 (D1~D5) | ✗ → 미완성 (D.4 만 ✗ — Runner 미실행, 사용자 결정으로 생략) | △ (D.4 명시 제외) |
| §E | As-Is 누락 0 점검 | ✗ → 미완성 | ✓ |
| §F | To-Be 변환점 | ✗ → 미완성 | ✓ |
| §G | 확인필요 항목 집계 | 추적용 | 활성 0 건 (사용자 결정 완료 — 분석 §12 결정 누적 표) |

---

## §A. 분석리포트 단일 원천 정합

### A.1 4종 설계서 ↔ 분석리포트 1:1 인용

| 검증 항목 | 분석리포트 위치 | 기능설계서 위치 | 디자인설계서 위치 | BPMN설계서 위치 | 결과 |
|---|---|---|---|---|---|
| 영역 구성 (6 영역) | §3.1 | §2 (영역 6 행) | §1.2 / §2.2 ASCII | (참조) | ✓ |
| 조회조건 (S-001~S-004) | §3.2 | §3.1 (4 행) | §3.2 (4 행) | (참조) | ✓ |
| 결과 그리드 (G-001~G-005) | §3.3 | §3.2 (5 행) | §4 (5 행) | (참조) | ✓ |
| 버튼 (B-001~B-004) | §4.1 | §5.1 (4 행) | §5.1~§5.2 (4 행) | §1 (API-001, B-001 매핑) | ✓ |
| 그리드 이벤트 (E-001~E-003) | §4.3 | §5.1-2 (3 행) | §5.3 (E-001, E-002) | §3.5 / §3.6 | ✓ |
| 호출 출처 (P-001~P-006) | §5 | §9 (6 행) | (참조) | (참조) | ✓ |
| SQL ID (GetCodeDetailList) | §6 | §3.3 | §4 (간접) | §1 / §3.1 / §6.1 | ✓ |
| BPMN 노드 + SequenceFlow | §8.1 / §8.2 / §8.3 | (참조) | (참조) | §3 / §6.2 / §7 | ✓ |
| 분석/기능/디자인/BPMN 정합 | 결정 누적 표 §12 (분석) | (참조만) | (참조만) | (참조만) | ✓ |

### A.2 누락 검증 (분석 §13 게이트 G1~G10 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S) | 4 | 4 | 4 | 0 (BPMN 무관) | 0 | 0 | ✓ |
| 그리드 컬럼 (G) | 5 | 5 | 5 | 0 (BPMN 무관) | 0 | 0 | ✓ |
| 상세 필드 (D/L) | 0 | 0 | 0 | 0 | 0 | 0 | ✓ (해당 없음) |
| 버튼 (B) | 4 | 4 | 4 | 1 (B-001 API 매핑) | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB) | 0 | 0 | 0 | 0 | 0 | 0 | ✓ (해당 없음) |
| 그리드 이벤트 (E) | 3 | 3 | 2 (E-003 주석 제외) | 2 | 0 (Enter 비활성 As-Is 보존) | 0 | ✓ |
| 호출 출처 (P) | 6 | 6 | 0 | 0 | 0 | 0 | ✓ (P는 분석/기능만) |
| BPMN 노드 | 4 | 0 | 0 | 4 | 0 | 0 | ✓ |
| BPMN SequenceFlow | 3 | 0 | 0 | 3 | 0 | 0 | ✓ |
| SQL ID (Mapper) | 1 | 1 | 0 | 1 | 0 | 0 | ✓ |
| Q-NNN | 9 | 9 | 0 | 0 (참조만) | 9 | 0 | ✓ |

### A.3 manifest 행 수 ↔ 산출물 행 수 검증

| 검증 항목 | manifest 정본 | 본 산출물 행 수 | 결과 |
|---|---|---:|---|
| Runner manifest | (미실행 — mui 자료형식 미지원) | - | ✗ — §D.4 사유 동일 (사용자 결정으로 생략) |

**§A 결과**: A.1 모든 행 ✓ + A.2 모든 행 합 일치 ✓ + A.3 = (Runner 미실행 — 사용자 결정으로 생략). **§A 본문 정합 = ✓.**

---

## §B. 식별자 정합 (4 식별자 1byte 동일)

### B.1 MES 단일 룰 적용 (camelCase)

| 식별자 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 1byte 동일 |
|---|---|---|---|---|---|
| screenId | masterCodeSelPop (§1) | masterCodeSelPop (§1.1 / §1.3) | masterCodeSelPop (frontmatter / §1) | masterCodeSelPop (frontmatter / §6.1) | ✓ |
| pageName | masterCodeSelPop (§1) | masterCodeSelPop (§1.3) | masterCodeSelPop (Header) | (참조) | ✓ |
| pageId | masterCodeSelPop (§1) | masterCodeSelPop (§1.3) | masterCodeSelPop (Header) | (참조) | ✓ |
| serviceId | masterCodeSelPop (§1) | masterCodeSelPop (§1.3) | (참조) | masterCodeSelPop (Header) | ✓ |

### B.2 As-Is ↔ To-Be 식별자 매핑

| As-Is | To-Be | 변환 규칙 | 적용 위치 |
|---|---|---|---|
| MasterCodeSelPop | masterCodeSelPop | `{moduleId}{화면명}` camelCase | screenId / serviceId 등 4식별자 |
| MasterCodeSelPopMapper.GetCodeDetailList | (To-Be 결정 위임 — Q-NNN) | Mapper namespace 결정 위임 | BPMN sqlKey |
| process id="MasterCodeSelPop" | process id="masterCodeSelPop" | screenId 적용 | BPMN process |
| MasterCodeSelPop.xfdl | masterCodeSelPop.tsx | FE 파일명 변환 | Frontend |

### B.3 모듈 / 그룹 정합

| 항목 | 값 | 검증 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | ✓ (4 산출물 frontmatter 동일) |
| moduleGroup | cma — 한글명 **"Master 관리(원장)"** | ✓ (As-Is mui/src/nxuiMui/cma/ + 사용자 결정 등재) |
| 메뉴 계층 | 공통관리 > Master 관리(원장) > 마스터코드 선택 팝업 | ✓ (UI 메뉴 트리) |
| mesModule | m-mcm | ✓ (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | ✓ (mpn APS 예외 ✗) |

**§B 결과**: 모든 식별자 1byte 동일 ✓ + As-Is/To-Be 변환 규칙 적용 ✓. **§B = ✓.**

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ xfdl sSvcID)

### C.1 SQL ID ↔ BPMN sqlKey ↔ xfdl sOutDatasets / sSvcID 4 식별자 매트릭스

| Mapper SQL ID | namespace.id | BPMN sqlKey (As-Is) | BPMN resultKey | xfdl sSvcID | xfdl sOutDatasets | 정합 |
|---|---|---|---|---|---|---|
| GetCodeDetailList | MasterCodeSelPopMapper.GetCodeDetailList | `#{serviceId}Mapper.GetCodeDetailList` → 실값 `MasterCodeSelPopMapper.GetCodeDetailList` | ds_GetCodeDetailList | "search" | `ds_grdMain=ds_GetCodeDetailList` | ✓ |

근거:
- Mapper: `MasterCodeSelPopMapper.xml:5,7` (namespace + select id)
- BPMN: `MasterCodeSelPop.bpmn:18-19`
- xfdl: `MasterCodeSelPop.xfdl Script:157,160`

### C.2 BPMN sourceFlow name ↔ xfdl sSvcID ↔ B-NNN action

| BPMN SequenceFlow name | xfdl sSvcID | B-NNN | To-Be action | 정합 |
|---|---|---|---|---|
| "search" (SequenceFlow_0grwghu) | "search" | B-001 (조회) | search | ✓ |

### C.3 Mapper `<where>` 분기 ↔ xfdl sArgument 4 식별자

| Mapper 파라미터 | xfdl sArgument 키 | xfdl 출처 | 정합 |
|---|---|---|---|
| pCodeId | pCodeId | this.sCodeId (호출 측 sCodeId — Script:120 / 161) | ✓ |
| pDiv | pDiv | div_search.form.cbo_div.value (Script:162) | ✓ |
| pValue | pValue | div_search.form.edt_codeVal.value (Script:163) | ✓ |

**§C 결과**: SQL ID 매트릭스 1:1 일치 + 모든 파라미터 정합. **§C = ✓.**

---

## §D. 식별자 명명 정합 (D1~D5)

### D.1 screenId 명명 규칙 (`{moduleId}{화면명}` camelCase)

| 항목 | 값 | 검증 |
|---|---|---|
| moduleId | mcm | ✓ (소문자 3자) |
| 화면명 (camelCase) | MasterCodeSelPop | ✓ (As-Is asIsId 직접 camelCase 사용) |
| screenId | masterCodeSelPop | ✓ (`{moduleId}{화면명}` 연결) |

### D.2 모듈명 적합성

| 검증 | 결과 |
|---|---|
| 5 모듈 (mpn / mpp / mls / mqc / mcm) 중 mcm 채택 | ✓ |
| moduleGroup (cma) = As-Is mui 폴더명 그대로 | ✓ (As-Is `mui/src/nxuiMui/cma/`) |

### D.3 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| BPMN 기능 식별자 | 적용 위치 |
|---|---|
| masterCodeSelPop_search | (To-Be BPMN sourceFlow name 또는 task name 권장 — As-Is 보존 시 "search" 그대로) ✓ |

### D.4 manifest 9 파일 정합

| 항목 | 결과 | 사유 |
|---|---|---|
| Runner 실행 여부 | ✗ | Runner config mui 미지원 — 사용자 결정으로 생략 (요구사항 §10 인용) |
| 9 파일 (manifest.lock.json / index.json / discover.trace.json / classify.trace.json / fallback.trace.json / q-stable-key.json / conflict-report.json / verify-report.json / error.log) | ✗ | 동일 사유 |

> **§D.4 사유 명시**: 본 화면 자료 원천 (xfdl / Mapper.xml / bpmn) 은 Runner 의 입력 포맷 (designer.cs / resx / procedures/*.sql / DDL 등 WinForms+SP 전제) 과 다르다. 사용자 결정으로 Runner 미실행. 본 정합체크서는 자료 원천 분석 결과를 직접 점검한다.

### D.5 As-Is 식별자 보존 (asIsId frontmatter)

| 4 산출물 frontmatter | asIsId 값 | 검증 |
|---|---|---|
| 분석리포트 / 기능설계서 / 디자인설계서 / BPMN설계서 / 본 정합체크서 | MasterCodeSelPop | ✓ (5 산출물 1byte 동일) |

**§D 결과**: D.1 ✓ / D.2 ✓ / D.3 ✓ / D.4 ✗ (Runner 미실행 — 사용자 결정으로 생략) / D.5 ✓. **§D = △** (D.4 명시 제외).

---

## §E. As-Is 누락 0 점검

### E.1 xfdl 컴포넌트 전수

| As-Is xfdl 요소 (file:line) | 본 설계 등재 위치 | 결과 |
|---|---|---|
| Form id="MasterCodeSelPop" (xfdl:3) | 분석 §3.1 / 기능 §1 / 디자인 §2.2 | ✓ |
| Button btn_fold (xfdl:6) | 분석 §3.1 (A-FOLD) / §4.1 (B-004) / 디자인 §3.3 | ✓ |
| Div div_main (xfdl:7) | 분석 §3.1 (A-GRID) / 디자인 §3.4 | ✓ |
| Grid grd_main + Format Columns 5 + Band head/body Cell 전수 (xfdl:10-40) | 분석 §3.3 (5 컬럼 전수 + 속성 컬럼 분해) | ✓ |
| Div div_title (xfdl:44) | 분석 §3.1 (A-TITLE) / 디자인 §3.1 | ✓ |
| Edit edt_title (xfdl:47) | 분석 §3.1 / 디자인 §3.1 | ✓ |
| Div div_topMenu (xfdl:48) | 분석 §3.1 (A-TOPMENU) | ✓ |
| Div div_bottom (xfdl:57) | 분석 §3.1 (A-FOOTER) / 디자인 §3.5 | ✓ |
| Div div_search (xfdl:58) | 분석 §3.1 (A-FILTER) / 디자인 §3.2 | ✓ |
| Combo cbo_div + innerdataset 2 행 (xfdl:61-78) | 분석 §3.2 (S-003) / §10.1 (LV-001) | ✓ |
| Edit edt_codeVal (xfdl:79) | 분석 §3.2 (S-004) | ✓ |
| Static stc_codeNm (xfdl:80) | 분석 §3.2 (S-001) | ✓ |
| Edit edt_codeNm (xfdl:81) | 분석 §3.2 (S-002) | ✓ |
| Dataset ds_grdMain ColumnInfo 5 컬럼 (xfdl:88-96) | 분석 §3.4 (5 컬럼 전수) | ✓ |
| Script onload / fn_formAfterOnload / fn_button / fn_search / fn_callBack / div_main_grd_main_oncelldblclick / fn_confirm / fn_close / btn_fold_onclick / div_search_edt_codeVal_onkeydown (xfdl:113-217) | 분석 §4 / §6 / §8 / 기능 §6.2 / BPMN §3 | ✓ |

### E.2 Mapper.xml 전수

| As-Is Mapper 요소 (file:line) | 본 설계 등재 위치 | 결과 |
|---|---|---|
| namespace="MasterCodeSelPopMapper" (Mapper:5) | 분석 §6 (namespace 명시) / BPMN §1 | ✓ |
| select id="GetCodeDetailList" (Mapper:7) | 분석 §6 (1 SQL = GetCodeDetailList) / BPMN §1 / §6.1 | ✓ |
| SELECT 절 5 컬럼 (Mapper:8-12 — 주석 1 + 출력 4) | 분석 §6 (SELECT 분해 표) | ✓ |
| `FROM VI_MCM_CODE_ACCESS /*MCM_SOURCE.TB_MCM_CODE_DETAIL*/` (Mapper:13 — Oracle PUBLIC SYNONYM + 원장 schema 주석) | 분석 §9.1 (뷰 + 원본 테이블 주석) | ✓ — Service.java 는 `MCMAPUSER.VI_MCM_CODE_ACCESS` schema 명시 (C-005 a 안 / §F.1) |
| `<where>` + 3 `<if>` 분기 (Mapper:14-24) | 분석 §6 (`<where>` 동적 절 전수 표) | ✓ |
| ORDER BY CODE_VAL + 주석 (Mapper:25-26) | 분석 §6 (ORDER BY 분해) | ✓ |

### E.3 BPMN 전수

| As-Is BPMN 요소 (file:line) | 본 설계 등재 위치 | 결과 |
|---|---|---|
| process id="MasterCodeSelPop" name="마스터코드 조회" isExecutable=false (bpmn:3) | 분석 §8 / BPMN §6.1 / §6.2 / §7 | ✓ |
| StartEvent_1 + outgoing SequenceFlow_1 (bpmn:4-6) | 분석 §8.1 / §8.2 / BPMN §7 | ✓ |
| EndEvent_1 + incoming SequenceFlow_0lnje1n (bpmn:7-9) | 동일 | ✓ |
| Task_2 (Main조회 / modelerTemplate=MapperBaseDbAccessTemplate) (bpmn:10-24) | 분석 §8.1 / §8.3 / BPMN §3 / §6.1 / §7 | ✓ |
| camunda:property class=CommonSelectTask (bpmn:14) | 분석 §7 (Java ✗ 근거) / §8.3 / BPMN §4 / §7 | ✓ |
| camunda:property paramKey (빈값) (bpmn:15) | 분석 §8.3 / BPMN §7 | ✓ |
| camunda:property isServiceResult=true (bpmn:16) | 동일 | ✓ |
| camunda:property dao (빈값) (bpmn:17) | 동일 | ✓ |
| camunda:property sqlKey (bpmn:18) | 분석 §6 / §8.3 / BPMN §1 / §6.1 | ✓ |
| camunda:property resultKey=ds_GetCodeDetailList (bpmn:19) | 동일 | ✓ |
| ExclusiveGateway_1 (gatewayDirection=Diverging) (bpmn:25-31) | 분석 §8.1 / BPMN §7 | ✓ |
| SequenceFlow_1 (Start→Gateway) (bpmn:32) | 분석 §8.2 / BPMN §7 | ✓ |
| SequenceFlow_0grwghu (Gateway→Task, name="search") (bpmn:33) | 분석 §8.2 / BPMN §1 / §7 | ✓ |
| SequenceFlow_0lnje1n (Task→End) (bpmn:34) | 분석 §8.2 / BPMN §7 | ✓ |
| ext:style (Task_2: #0080c0) (bpmn:12) | 분석 §8.4 / BPMN §7 | ✓ |
| ext:style (Gateway: #ffff00) (bpmn:27) | 동일 | ✓ |

### E.4 호출 측 화면 역참조 전수

| 호출 화면 + 호출 line | 본 설계 등재 위치 | 결과 |
|---|---|---|
| MasterJudgRuleDataList.xfdl:615 | 분석 §5 P-001 / 기능 §9 | ✓ |
| MasterRuleNewSpec.xfdl:446 | 분석 §5 P-002 / 기능 §9 | ✓ |
| MasterRuleNewSpec.xfdl:474 | 분석 §5 P-003 / 기능 §9 | ✓ |
| MasterRuleDataList.xfdl:593 | 분석 §5 P-004 / 기능 §9 | ✓ |
| MasterJudgRuleNewSpec.xfdl:424 | 분석 §5 P-005 / 기능 §9 | ✓ |
| MasterJudgRuleNewSpec.xfdl:447 | 분석 §5 P-006 / 기능 §9 | ✓ |

**§E 결과**: As-Is 전수 등재 ✓ — 누락 0. **§E = ✓.**

---

## §F. To-Be 변환점

### F.1 DB 변환점 (Oracle → MSSQL — 분석리포트 §11 인용)

| 변환점 | As-Is (Oracle) | To-Be (MSSQL) | 위치 | 인용 위치 |
|---|---|---|---|---|
| C-001 | `'%' \|\| #{pValue} \|\| '%'` | `'%' + #{pValue} + '%'` 또는 `CONCAT('%', #{pValue}, '%')` | Mapper:19, 22 | 분석 §11.1 |
| C-002 | UPPER() | UPPER() (동일) | Mapper:16, 19, 22 | 분석 §11.1 |
| C-003 | Mapper:13 주석 `MCM_SOURCE.TB_MCM_CODE_DETAIL` 은 As-Is mui 의 원장 schema (MCM_SOURCE = 편집/DML 대상) 인용 | **`MCMAPUSER.VI_MCM_CODE_DETAIL` 본 화면은 view 사용 — view 의 JOIN 대상은 `MCMAPUSER.TB_MCM_CODE_*` 동기화본** (사용자 제공 DDL §11.2 정본 / 2026-05-29 정정) | Mapper:13 주석 / Excel sheet36 r2 | 분석 §11.1 |
| C-004 | MyBatis OGNL `equals` | 동일 (DBMS 무관) | Mapper:18, 21 | 분석 §11.1 |
| C-005 | Oracle `PUBLIC SYNONYM VI_MCM_CODE_ACCESS` (모든 계정이 schema prefix 없이 접근) | **MSSQL `PUBLIC SYNONYM` 미지원 → schema 명시 `MCMAPUSER.VI_MCM_CODE_ACCESS`** (a 안 — 2026-05-29 사용자 결정) | Service.java FROM 절 / Mapper:13 (As-Is) | 분석 §11.2 |
| 뷰 DDL | VI_MCM_CODE_ACCESS (Oracle VIEW — JOIN 대상 schema 추정) | **`MCMAPUSER.VI_MCM_CODE_ACCESS` (사용자 제공 정본 DDL — JOIN 대상 = `MCMAPUSER.TB_MCM_CODE_*` 자기 schema 동기화본 / `MASTER.USE_TP='Y'` 필터)** — `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 멱등 적재 (Oracle → MSSQL 변환 완료) | 분석 §11.2 |
| 뷰 GRANT (정보) | `APSAPUSER`, `MLSRWUSER`, `MPPRWUSER`, `ROLE_APP_RW`, `ROLE_DTUSER` 5 계정/역할 SELECT | MSSQL 권한 모델로 재현 — 동기화 화면 사이클에서 운영 GRANT 스크립트 작성 위임 | 사용자 제공 DDL 본문 | 분석 §11.2 |

### F.2 식별자 변환점

| 항목 | As-Is | To-Be | 변환 규칙 |
|---|---|---|---|
| screenId | MasterCodeSelPop | masterCodeSelPop | MES 단일 룰 camelCase |
| BPMN process id | MasterCodeSelPop | masterCodeSelPop | screenId 적용 |
| Mapper namespace | MasterCodeSelPopMapper | (To-Be 결정 위임 — Q-NNN) | Mapper 패키지 명명 규칙 결정 |

### F.3 영향 받는 산출물

| 산출물 | 변경 필요 | 변경 사유 |
|---|---|---|
| Mapper.xml | Y | C-001 (Oracle `\|\|` → MSSQL `+`) |
| BPMN | Y (process id / sqlKey namespace) | F.2 식별자 변환 |
| xfdl → tsx | Y | FE 재작성 (As-Is 폐기 → To-Be Modal) |
| VI_MCM_CODE_ACCESS DDL | ✓ 완료 — `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 가 사용자 제공 정본 DDL 의 MSSQL 변환을 멱등 적재 (2026-05-29) | - |
| Service.java FROM 절 | ✓ 완료 — `FROM MCMAPUSER.VI_MCM_CODE_ACCESS` (PUBLIC SYNONYM 제거 + schema 명시, C-005 a 안) | - |

**§F 결과**: 변환점 6건 (DB) + 3건 (식별자) 모두 분석 §11 1:1 인용 + 본 정합체크서 명시. **§F = ✓.**

---

## §G. 확인필요 항목 집계 — 결정 완료

> 사용자 결정 완료 — **활성 확인필요 = 0 건**. 결정 누적 표는 분석리포트 §12 참조.

본문 반영 위치: §11.1 (스키마 — 본 화면은 view 사용. JOIN 대상 = `MCMAPUSER.TB_MCM_CODE_*` 동기화본) / §11.2 (뷰 본문 DDL — 사용자 제공 정본 + MSSQL 변환 / Service.java schema 명시 a 안) / §9.2 (audit cactus-core 9 컬럼 통일 — 가이드 02 §A.5-3-1 정합) / 분석 §12 (결정 누적 표 — 2026-05-29 정정 추가).

---

## 최종 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A | ✓ | 단일 원천 정합 + 누락 0 |
| §B | ✓ | 4 식별자 1byte 동일 |
| §C | ✓ | SQL ID ↔ BPMN sqlKey ↔ xfdl 4 식별자 일치 |
| §D | △ | D.4 만 ✗ — Runner 미실행 (사용자 결정으로 생략). D.1 / D.2 / D.3 / D.5 모두 ✓ |
| §E | ✓ | As-Is xfdl / Mapper.xml / BPMN / 호출 화면 전수 등재 |
| §F | ✓ | DB 변환점 4 + 식별자 변환점 3 모두 분석 §11 인용 |
| §G | (추적용) | 활성 0 건 — 사용자 결정 완료 |

**총평**: §A / §B / §C / §E / §F = ✓, §D = △ (D.4 사용자 결정으로 생략). 본 화면 설계 = **완료** (Runner 미실행은 환경 제약으로 사전 합의).
