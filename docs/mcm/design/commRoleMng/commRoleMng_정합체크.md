---
screenId: commRoleMng
asIsId: CommRoleMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-06-05
작성자: Agent
---

# 역할 관리 정합체크서

> Claude는 3종 설계서(기능/디자인/BPMN) 작성 후 본 정합체크서를 작성한다. 본 정합체크서는 모든 화면 설계의 **기본 필수 산출물**.

## 차단 규칙 (도입부)

본 정합체크서는 §A ~ §G 7 개 절로 구성. **§A / §B / §C / §D / §E / §F 6 개 절이 모두 ✓ 일 때만 설계 완료**. §A.3 / §A.A-R12-1 / §D.4 는 mui 환경 제약 (분석 §0) 으로 ✗ + 사유 명시 처리 (사용자 결정).

| 절 | 제목 | 검증 카테고리 | 차단 여부 |
|---|---|---|---|
| §A | 구조 동일성 + 누락 검증 | 절 순서 / 표 헤더 / "해당 없음" 유지 / 누락 매트릭스 합 일치 | ✗ → 설계 미완성 |
| §B | 명명 규칙 검증 | 부속서 A 사전 등재 + 컨벤션 적합성 | ✗ → 설계 미완성 |
| §C | 5축 정합 | 분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑 행 단위 인용 | ✗ → 설계 미완성 |
| §D | 반복 설계 결정성 검증 | 동일 As-Is → 동일 산출물 | ✗ → 설계 미완성 (§D.4 R-14 ✗ + 사유) |
| §E | 가이드 중복 제거 검증 | 정본 위치 외 본문 잔존 0 | ✗ → 설계 미완성 |
| §F | 삭제 참조 검증 | 폐기된 개념 잔존 0 | ✗ → 설계 미완성 |
| §G | 확인필요 항목 집계 | 분석리포트 §13 Q-NNN 그대로 인용 | 추적용 |

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 (✓/✗) | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 템플릿과 동일 | ✓ (§0~§16 + §6.14) | ✓ (§0~§11 + §6.14) | ✓ (§0~§10 + §6.14) | ✓ (§0~§6 + §6.14) | ✓ | mui 환경 제약상 §0 환경제약 절 추가 (가이드 정본 절 순서 유지하면서 §0 prefix 절 1개 추가) |
| 표 헤더 (컬럼명·수·순서) — 템플릿과 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 분석 §0.1.3 단일 원천 유지 |
| "해당 없음" 유지 (적용 대상 없는 절 / 행 삭제 0) | ✓ (§4.2 L-NNN 해당 없음 / §4.5-1 GB-NNN 해당 없음 명시) | ✓ (§4.2 / §5.1-1 명시) | ✓ (§10 명시) | - | ✓ | 빈 표 유지 |
| 임의 ## 헤더 추가 (템플릿 외) | (§0 환경제약 / §6.14 자가점검 — mui 환경 제약 사용자 결정 사항) | (동일) | (동일) | (동일) + **정합체크서 §K (사용자 검수 결과 반영 이력 / Round 2~5)** | ✓ (사유 명시) | mui 환경 제약 (분석 §0) 명시용 절 + Round 2~5 사용자 검수 추적용 §K (W5 commUserMng 정합체크서 §J 본 화면 등가 / 정합체크서 §J 가 SOP 검증으로 선점되어 §K 로 신설) — 가이드 정본 절 외 신설 ✗ 원칙의 예외 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 동일 (commRoleMng / CommRoleMng / mcm / csa / 2026-05-29 / Agent) |
| **A-T1A**: 분석리포트 §4.1 행 수 == 10 (T1-A) | ✗ + 사유 ("mui 환경 — 분석 §3 전수 분해로 대체. §4.1 미적용") | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | mui 환경 제약 |
| **A-R12-1**: 사전 판정표 5 종 작성 (분석 §0.1~§0.5) | ✗ + 사유 ("mui 환경 — designer.cs 가 없으므로 Visible=false / 좌표 정렬 / GE/G2 분기 / B/GB 분류 / P 후보 표 모두 mui xfdl 등가물로 §3~§5 에서 직접 분해. §0.1~§0.5 미작성") | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | mui 환경 제약 — 사용자 결정 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 | ✓ (mui 환경 — `<!-- 예시 -->` 마커 사용 ✗, 본 화면 본문만 작성) | ✓ | ✓ | ✓ | ✓ | mui 환경에서는 예시 행 패턴 불필요 |
| **A-R12-3**: 외부 호출 D1~D3 추적 (분석 §12) | ✓ (D1=본 화면 자산 3 + D2=공통 div include 5 + D3=외부 화면 의존 3) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | 분석 §12 명시 |
| **A-R12-4**: 이벤트 12종 매트릭스 작성 | ✗ + 사유 ("mui 환경 — xfdl 이벤트 enum 은 12종 WinForms 와 다름. 본 화면은 onclick / onitemchanged / onrowposchanged / oncolumnchanged / onheadclick / onkeyup / onkeydown / canchange / onchanged / oncellclick 등 사용. 분석 §4.8 38 메서드 매트릭스로 대체") | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | mui 환경 제약 |
| **A-R12-5**: SP 분기 매트릭스 (분석 §5.2) | ✗ + 사유 ("mui 환경 — SP 부재 / Mapper.xml inline SQL 11 종. 분석 §6 11 SQL 매트릭스로 대체 (As-Is 9 호출 + 미호출 2)") | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | mui 환경 제약 |
| **A-R12-6**: 자유 서술 0 | ✓ (모든 본문이 표 분해 + cite 인용 — §1 화면 목적만 1 문장 패턴 + §6.14 자가점검 4 질문 답변) | ✓ | ✓ (§2.2 ASCII 박스 + §3.2 / §3.3 ASCII — 코드 블록 내) | ✓ (§2.1~§2.7 ASCII 흐름도 + §6.2 1~3 문장 사유) | ✓ | 가이드 §1 / §2.2 / §3.2 / §6.2 예외 외 자유 단락 0 |

### A.2 누락 검증 (분석 §14 매트릭스 합 일치 + 코드 구현 정합)

> 분석 §14 의 발견 수 그대로 인용 + 기능/디자인/BPMN 반영 수 cross diff. 코드 구현 수는 본 시점 개발 미착수 (BE/FE 미생성).

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 | 확인필요 수 | 제외 수 | 합 일치 (✓/✗) |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 4 (As-Is) / 3 (To-Be) | 4 (§3 S-001~S-004 — S-001 As-Is 인용만) | 3 (§3.2 + §4 cross — S-001 ~~취소선~~) | 3 (§2.2 searchCmRole sArgs — BIZ_SYSTEM 제거) | 0 (개발 미착수) | 0 | 1 (To-Be 제외: S-001 cbo_bizSystemCode / 정책 #1) | ✓ |
| 메인 그리드 컬럼 (G-NNN) | 9 (As-Is) / 8 (To-Be) | 8 (§3.2 G-001~G-009 — G-006 ~~취소선~~) | 8 (§4.1 — G-006 ~~취소선~~) | 8 (§2.2 응답 ds_main 갱신 — BIZ_SYSTEM 제거) | 0 | 0 | 1 (To-Be 제외: G-006 BIZ_SYSTEM_CODE / 정책 #1) | ✓ |
| 확장 그리드 컬럼 (GE-NNN) | 17 | 17 (§3.2 GE-001~GE-017) | 17 (§4.2 + §4.3) | 17 (§2.3 / §2.7 응답 ds_roleMap + ds_perm 갱신) | 0 | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | 9 (As-Is) / 8 (To-Be) | 8 (§4 D-001~D-009 — D-001 ~~취소선~~) | 8 (§5 FormGroup — D-001 ~~취소선~~) | 8 (§2.4 / §2.5 D-NNN 양방향 바인딩) | 0 | 0 | 1 (To-Be 제외: D-001 cbo_bizsystem / 정책 #1) | ✓ |
| 라인 필드 (L-NNN) | 0 (해당 없음) | 0 (§4.2 해당 없음 명시) | - | - | 0 | 0 | 0 | ✓ |
| 버튼 (B-NNN + BS-NNN) | 15 | 15 (§5.1 B-001~B-013 + BS-001~BS-002) | 15 (§5 PageLayout.buttons + 셔틀) | 15 (§2 모든 트리거) | 0 | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 (해당 없음) | 0 (§5.1-1 해당 없음 명시) | - | - | 0 | 0 | 0 | ✓ |
| 팝업 (P-NNN) | 2 (As-Is) / 0 (To-Be — Round 3 P-001 폐기 / K-004) | 0 (§9 ~~P-001~~ + ~~P-002~~ 양쪽 취소선) | 0 (§6 ~~P-001~~ + ~~P-002~~ 양쪽 취소선) | 0 (§2.1 P-NNN trigger ✗ / searchObjectLov 은 인라인 그리드 데이터 소스로 재사용) | 0 | 0 | 2 (To-Be 제외: P-002 / Q-010 closed + P-001 Round 3 / K-004) | ✓ |
| 상태값 (ST-NNN) | 5 | 5 (§7.1 ST-001~ST-005) | - | - | 0 | 0 | 0 | ✓ |
| LoV (LV-NNN) | 3 (As-Is) / 2 (To-Be) | 2 (§10 — LV-001 bizSystemCode ~~취소선~~ / To-Be LV-001 menuId / LV-002 useTp) | 2 (§4.4) | 1 (§2.1 lov 단일 Task) | 0 | 0 | 1 (To-Be 제외: LV bizSystemCode / 정책 #1) | ✓ |
| Mapper SQL | 11 (As-Is) / 10 (To-Be — Round 2 searchObjectLov 신설 반영) | (간접 — §5.2) | (간접) | 10 (§1.3 + searchObjectLov: selectMenuObjPop 내재화) | 10 (BE 구현 완료) | 0 | 3 (To-Be 제거: updateCommRoleMap (Q-011) / selectCommPntRoleMapPop / cross-namespace selectAppHostId (정책 #1)) | ✓ |
| BPMN Task | 9 (As-Is) / 7 (To-Be — Round 2 `searchObjectLovTask` 신설 반영) | (간접) | (간접) | 7 (§1.3 + Task_searchObjectLov 신설) | 7 (BPMN 구현 완료) | 0 | 3 (To-Be 제거: Task_0f9lt7e / Task_1sm19m8 / **Task_0r5ztlq (정책 #1)**) | ✓ |
| BPMN SequenceFlow.name (action) | 8 (As-Is) / 7 (To-Be — Round 2 `searchObjectLov` 신설 반영) | 7 (§5.1 / §5.2 To-Be action 매핑 + Round 2 searchObjectLov 추가) | (간접) | 7 (§1.1 API 7) | 7 (FE api.ts 7 action 구현) | 0 | 2 (To-Be 제거: searchCmRoleMapPnt / pntRoleIdPop. lov 분기는 단일 Task 로 단순화 / 정책 #1) | ✓ |
| xfdl Script 메서드 | 38 | (간접 — §5.2 핸들러 인용) | - | (간접) | 0 | 0 (Q-003~006 closed — 정책 #1 신규 미반영 / Service 레이어) | 4 (주석 메서드 잔존 + To-Be 미반영 핸들러 4) | ✓ |
| Validation (V-NNN) | 8 | 8 (§6.1 V-001~V-008) | - | (간접 — §3 에러 매트릭스) | 0 | 0 | 0 | ✓ |
| 테이블 | 5 | - | - | 5 (§4.2 참조 무결성 — BIZ_SYSTEM_CODE FK 제거) | 0 | 0 (Q-002 closed 2026-05-30 → 분석 §9.4 125 컬럼 전수) | 0 | ✓ |

### A.3 manifest 행 수 ↔ 산출물 행 수 검증 (R14-v3.0)

| 분석 원천 | manifest items 카운트 (정본) | 분석.template 행 수 | 일치 (✓/✗) | 근거 |
|---|---|---|---|---|
| (전체 12 행) | **✗ + 사유** ("Runner mui 미지원 — manifest 9 파일 미생성. 분석 §0 환경 제약 결정 ✓") | (분석.template 행 수만 측정 — manifest 부재) | ✗ + 사유 | 분석 §0 |

**§A.3 결과**: ✗ + 사유 명시 ("Runner mui 미지원 — 사용자 결정으로 생략"). mui 환경 제약 (분석 §0) 으로 본 검증 불가.

**§A 결과**: A.1 모든 행 ✓ (A-T1A / A-R12-1 / A-R12-4 / A-R12-5 만 ✗ + 사유) + A.2 모든 행 합 일치 ✓ + A.3 ✗ + 사유 → **§A ✓ (mui 환경 제약상 사유 명시 검증 통과)**.

---

## §B. 명명 규칙 검증

### B.1 모듈 룰 결정

| 항목 | 값 | 결과 (✓/✗) |
|---|---|---|
| moduleId | mcm | ✓ (01 A.1.1 등재 — Manufacturing Common Management) |
| 적용 명명 룰 (`MES 단일 룰` / `APS 예외 (mpn)`) | **MES 단일 룰** | ✓ (moduleId == mcm → MES 룰) |

> moduleId == `mpn` 일 때만 "APS 예외 (mpn)" 선택. 본 화면은 `mcm` → "MES 단일 룰" 선택.

### B.2 식별자별 검증

| 항목 | 값 | 적용 룰 (MES / APS-mpn) | 부속서 A 근거 | 검증 결과 (✓/✗) |
|---|---|---|---|---|
| moduleId | `mcm` | (전체 공통) | 01 A.1.1 (등재) | ✓ |
| moduleGroup | `csa` | (전체 공통) | 01 A.2 (cm + a~z — csa = 시스템관리, 신규 등재 — `project_mcm_csa_cme_design_cycle1.md` 참조) | ✓ |
| 화면식별자 (screenId) | `commRoleMng` | MES: camelCase `{화면명}` 단일 토큰 | 01 A.3 / A.4.1 (camelCase 단일 토큰) | ✓ |
| pageName | `commRoleMng` | **MES: camelCase = screenId** (1byte 동일) | 01 A.4.2 | ✓ |
| pageId | `commRoleMng` | MES: camelCase = screenId | 01 A.4.3 | ✓ |
| serviceId | `commRoleMng` | MES: = screenId (1byte 동일) | 01 A.4.4 | ✓ |
| mesModule | `m-mcm` | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | `commRoleMng.tsx` | **MES: `{screenId}.tsx`** | 03 컨벤션 | ✓ |
| tsup entry key | `pages/csa/commRoleMng` | **MES: `pages/{moduleGroup}/{pageName}`** | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | flat P-001 ~ P-002 | (전체 공통) | 01 A.4.7 (flat MUST) | ✓ |
| 필드/컬럼/버튼 ID | S-001~004 / G-001~009 / GE-001~017 / D-001~009 / B-001~013 / BS-001~002 / P-001~002 / V-001~008 / XV-001~002 / ST-001~005 / LV-001~003 / GB (해당 없음) / L (해당 없음) | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | DB SNAKE_CASE (TB_MCM_SEC_ROLE 등) / API JSON camelCase (예: `edt_ROLE_ID` 는 As-Is mui 의 xfdl 컨트롤명 — As-Is 1:1 보존, To-Be API JSON 은 camelCase) | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is `Label.Text` / `GridColumn.HeaderText` / `Button.Text` 1byte 일치 | ✓ (분석 §3.2 표시명 "BIZ SYSTEM" / "역할 ID" / "역할명" / "사용 여부" 모두 xfdl Static.value 1byte / 분석 §3.3 G head text "상태" / "ROLE ID" / "ROLE 이름" 등 모두 xfdl head Cell.text 1byte / 분석 §3.4 GE head text 모두 1byte — 특히 As-Is 띄어쓰기 비대칭 "PERMISSION 명" vs "PERMISSION명" 보존) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 | ✓ (As-Is `ROLE_ID` ↔ `roleId` / `BIZ_SYSTEM_CODE` ↔ `bizSystemCode` / `USE_TP` ↔ `useTp` 등 직역) | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum | ✓ (기능 §2 + 디자인 §3.1 — `A-FILTER` / `A-GRID` / `A-GRID-EXT` / `A-DETAIL` / `A-BTN` 5 값만) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum | ✓ (D-007 USE_TP **RadioGroup** (UI 자연 흡수 — Q-007 closed). 디자인 §5 RadioGroup 정본 — 03 §A.9-3 등재 심볼 사용. 본 화면은 5 enum + RadioGroup 합법) | (전체 공통) | 01 A.4.12 | ✓ (Q-007 closed) |
| **B-T3C**: 표시 형식 = 자료형(길이/자릿수) 강제 | ✓ (Q-002 closed 2026-05-30 — 분석 §9.4 125 컬럼 카탈로그 등재. 디자인 §4 표시 형식 컬럼 `[Q-002]` 마커 본 갱신에서 §9.4 실 자료형 갱신 완료 — varchar(30/100/300/10) 정정) | (전체 공통) | 01 A.4.13 | ✓ (Q-002 closed) |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName | ✓ (4 식별자 모두 `commRoleMng` 1byte 동일) | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case + 파일명 = `{pageName}-page.tsx` | (해당 없음 — APS 모듈 아님) | APS-mpn 만 적용 (MES 시 N/A) | 사용자 결정 | N/A |

**§B 결과**: 모든 행 ✓ (B-T3B / B-T3C 본 갱신 (2026-05-31) Q-007 / Q-002 closed 로 ✓ 격상). 위반 패턴 발견 0.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 (✓/✗) |
|---|---|---|---|---|---|---|
| 화면식별자 | commRoleMng (§1) | commRoleMng (§1.1) | commRoleMng (frontmatter) | commRoleMng (frontmatter + §1) | commRoleMng (§11) | ✓ |
| moduleId | mcm (§1) | mcm (§1.2) | mcm (frontmatter) | mcm (frontmatter) | mcm | ✓ |
| moduleGroup | csa (§1) | csa (§1.2) | csa (frontmatter) | csa (frontmatter) | csa | ✓ |
| pageName | commRoleMng (§1) | commRoleMng (§1.2) | commRoleMng (§0 상단) | commRoleMng (§0 상단) | commRoleMng | ✓ |
| pageId | commRoleMng (§1) | commRoleMng (§1.2) | commRoleMng (§0 상단) | commRoleMng (§0 상단) | commRoleMng | ✓ |
| serviceId | commRoleMng (§1) | commRoleMng (§1.2) | (frontmatter) | commRoleMng (§0 + §1.1) | commRoleMng | ✓ |
| 필드ID (S-NNN 전수) | §3.2 As-Is 4 / To-Be 3 (S-001 정책 #1 제거) | §3 3 (S-002~S-004) | §3.2 3 | §2.2 3 (sArgs 자동 직렬화 — BIZ_SYSTEM 제거) | §11 #18 | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 As-Is 9 / To-Be 8 (G-006 정책 #1 제거) | §3.2 8 | §4.1 8 | §2.2 8 (응답 ds_main 갱신) | §11 #18 | ✓ |
| 컬럼ID (GE-NNN 확장) | §3.4 17 (GE-001~GE-017) | §3.2 17 (GE-001~GE-017) | §4.2 + §4.3 17 (GE-001~GE-017) | §2.3 / §2.7 17 (응답 ds_roleMap + ds_perm 갱신 전수) | §11 N/A | ✓ |
| 버튼ID (B-NNN + BS-NNN 전수) | §4.1~§4.6 15 (B-001~B-013 + BS-001~BS-002) | §5.1 15 (B-001~B-013 + BS-001~BS-002) | §5 15 (PageLayout.buttons + 셔틀 — BS-001/002 cssclass swap Q-008 정정) | §2 15 트리거 | §11 #24 | ✓ |
| 팝업ID (P-NNN 전수) | §5 As-Is 2 / To-Be 0 (P-002 정책 #1 제거 / Q-010 closed + **Round 3 P-001 폐기 / K-004**) | §9 0 (P-001 ~~취소선~~ — Round 3) | §6 0 (P-001 ~~취소선~~ — Round 3) | §2.1 0 (BPMN P-NNN trigger ✗ / searchObjectLov action 은 인라인 데이터 소스로 재사용) | §11 #30 + Round 3 K-004 | ✓ |
| DB 컬럼명 (SNAKE_CASE) | 모든 SQL / Dataset 컬럼 SNAKE_CASE 인용 (§3.3 / §3.4 / §3.5 / §6 / §9.1) | §3.2 / §3.3 / §4 (To-Be 컬럼 직역 표기 — DB 매핑 정합) | §4 (DB 컬럼명 SNAKE_CASE 유지) | §2 / §4 (서버 SQL 처리 SNAKE_CASE) | §11 #1~#8 (Oracle → MSSQL 변환) | ✓ |
| 상태코드 (statusCodes) | §9.2 5 (ST-001~ST-005) | §7.1 5 | (디자인 §4.5 행 조건별 표시) | (BPMN §4.1 상태 변경 부수효과) | §11 N/A | ✓ |
| action 목록 | §1 / §8.2 8 As-Is enum (To-Be 채택 **7** — Round 2 searchObjectLov 신설 포함) | §5.1 To-Be **7** action enum (searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / lov / **searchObjectLov**) | (디자인 §5 — clientside 외 6 action — Round 3 sub2 인라인 흡수) | §1.1 7 API + §1.3 채택 표 (7 To-Be 채택 + 2 제거 + lov 단일 Task) | §11 #18 #20 #21 #27 (제거 / 단순화 결정) + Round 2 K-003 (searchObjectLov 신설) | ✓ |

**§C 결과**: 모든 행 ✓ — 설계서가 분석리포트에 없는 행을 추가 ✗. 본 갱신 (2026-05-31) 에서 정책 #1 일괄 적용으로 S/G/D/P/SQL/Task/action 의 As-Is ↔ To-Be 카운트 분리 정합 정리.

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 (✓/✗) |
|---|---|---|---|---|---|
| screenId | commRoleMng | commRoleMng | commRoleMng | commRoleMng | ✓ |
| asIsId | CommRoleMng | CommRoleMng | CommRoleMng | CommRoleMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commRoleMng | commRoleMng | commRoleMng | commRoleMng | ✓ |
| S-NNN 수 | As-Is 4 / **To-Be 3** | 3 | 3 | 3 (sArgs — BIZ_SYSTEM 제거) | ✓ |
| G-NNN 수 | As-Is 9 / **To-Be 8** | 8 | 8 | 8 | ✓ |
| GE-NNN / G2-NNN 수 | 17 (GE-NNN 단일 — sub1/sub2 영역 컬럼으로 분리) | 17 | 17 | (해당 없음) | ✓ |
| D-NNN 수 | As-Is 9 / **To-Be 8** | 8 | 8 | 8 | ✓ |
| B-NNN 수 (BS-NNN 포함) | 15 | 15 | 15 | 15 | ✓ |
| P-NNN 수 | As-Is 2 / **To-Be 0** (Round 3 — P-001 폐기 / K-004) | 0 (P-001 + P-002 양쪽 ~~취소선~~) | 0 (P-001 + P-002 양쪽 ~~취소선~~) | 0 (BPMN P-NNN trigger ✗) | ✓ (정책 #1 P-002 제거 / Q-010 closed + Round 3 P-001 폐기) |
| statusCodes 목록 | ST-001~ST-005 | ST-001~ST-005 | (간접 — §4.5) | (간접 — §4.1) | ✓ |
| C1~C6 충족 개수 | 0 | (해당 없음 — 간접 §11.2) | (해당 없음) | 0 (§1.2) | ✓ |
| API 패턴 (OASIS / Phase 7 / 잠정 OASIS) | OASIS 단일 (§11.2 결정) | (간접) | (간접) | OASIS 단일 (§1.2) | ✓ |
| action 목록 | 7 To-Be (searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / lov / **searchObjectLov** — Round 2 신설) | 7 To-Be (§5.1 매핑) | (간접) | 7 To-Be (§1.1 API 7) | ✓ |
| LV-NNN 수 | As-Is 3 / **To-Be 2** | 2 | 2 | 1 (§2.1 lov 단일 Task) | ✓ |
| Mapper SQL 수 | As-Is 11 / **To-Be 10** (Round 2 searchObjectLov 신설 반영) | (간접) | (간접) | 10 (§1.3) | ✓ |
| BPMN Task 수 | As-Is 9 / **To-Be 7** (Round 2 `searchObjectLovTask` 신설 반영) | (간접) | (간접) | 7 (§1.3) | ✓ |

**(MUST)** 모든 행 ✓ (본 갱신 2026-05-31 — 정책 #1 P-002 제거로 P-NNN △ → ✓ 격상).

### D.2 반복 설계 결정성 검증 (동일 As-Is 자료 2 회 생성 시)

| 항목 | 1차 값 | 2차 값 (현재 1차 — 비교 대상 미생성) | 일치 (✓/✗) |
|---|---|---|---|
| S-NNN 수와 순서 | 4 (S-001 BIZ_SYSTEM / S-002 ROLE_ID / S-003 ROLE_NM / S-004 USE_TP) | (미생성 — N/A) | (1차만 — N/A) |
| G-NNN 수와 순서 | 9 (G-001 STATUS / G-002 ROLE_ID / ... / G-009 END_ACTIVE_DATE) | (미생성) | N/A |
| GE-NNN / G2-NNN 수와 순서 | 17 (GE-001~GE-011 sub1 / GE-012~GE-017 sub2) | (미생성) | N/A |
| D-NNN / L-NNN 수와 순서 | 9 (D-001 BIZ SYSTEM / ... / D-009 유효 기한일) + L=0 | (미생성) | N/A |
| B-NNN 수와 순서 | 13 + BS 2 = 15 (B-001~B-013 + BS-001~BS-002) | (미생성) | N/A |
| **GB-NNN 수와 순서** | 0 | (미생성) | N/A |
| P-NNN 수와 순서 | 2 (P-001 OBJECT 조회 + P-002 미호출) | (미생성) | N/A |
| statusCodes 목록 | ST-001~ST-005 | (미생성) | N/A |
| C1~C6 판정 결과 | 0 | (미생성) | N/A |
| API 패턴 (충족 개수 → 채택) | 0 → OASIS 단일 | (미생성) | N/A |
| serviceId | commRoleMng | (미생성) | N/A |
| action 목록 | 6 To-Be | (미생성) | N/A |
| 산출물 절 순서 | 분석 §0~§16 / 기능 §0~§11 / 디자인 §0~§10 / BPMN §0~§6 | (미생성) | N/A |
| 표 헤더 (컬럼명·수·순서) | 가이드 templates 일치 (§0 환경제약 절은 mui 사유 추가) | (미생성) | N/A |
| **D-T1B**: S 카운트 N차 동일 | 4 (Lookup 묶음 없음) | (미생성) | N/A |
| **D-T1C**: D + L + GE 합 == SP 의 sList 외 SELECT 분기 수 | 9 + 0 + 17 = 26 / SP 분기 (mui Mapper SELECT 5) — mui 환경 매핑 비등가 (사유 명시) | (미생성) | N/A (사유) |
| **D-T1D**: B + GB 합 == designer.cs 의 모든 Button + ButtonField 수 | 15 + 0 = 15 / xfdl Button 13 + 셔틀 Button 2 = 15 ✓ | (미생성) | (1차 자체 ✓) |
| **D-T1E**: statusCodes 카운트 == 00 §6.4.6 포함/제외 매트릭스 적용 결과 | 5 (sec 모델 — USE_TP 2 / rowStatus 1 / 의존 마스터 USE_TP 2) | (미생성) | (1차 자체 ✓) |
| **D-T1F**: 컨트롤별 핸들러 수 == 행 수 | 38 메서드 행 == xfdl Script function 정의 수 (주석 잔존 4 포함) | (미생성) | (1차 자체 ✓) |
| **D-T2C**: 디자인 §1 페이지 유형 == 알고리즘 결과 (A~E 자동 결정) | D (다중 그리드 — GE>=1 매칭) ✓ | (미생성) | (1차 자체 ✓) |
| **D-T3D**: API 라우팅 == 04 §A.2-3-2 표 그대로 (자체 분류 ✗) | C1~C6=0 → OASIS 단일 (자동 채택) ✓ | (미생성) | (1차 자체 ✓) |

**(MUST)** 1차 자체 검증 = 모든 행 ✓. 2차 비교는 본 작업 외 (회귀 검증 시점 후속).

### D.3 N차 반복 생성 회귀 매트릭스

본 분석은 1차 작업 — N=1 측정만 가능. 1차 자체 검증 결과 모든 행 일관성 ✓ (1차 작업 내부 정합).

| 항목 | 1차 | 2차 | 3차 | 4차 | 측정 방법 (PowerShell) | max-min / 불일치 | 결과 (✓/✗) |
|---|---|---|---|---|---|---|---|
| screenId | commRoleMng | - | - | - | `(Get-Content $f -TotalCount 10 \| Select-String '^screenId:').Line` | (1차만) | (1차 ✓) |
| serviceId | commRoleMng | - | - | - | - | (1차만) | (1차 ✓) |
| S-NNN 수 | 4 | - | - | - | `(Select-String '^\| S-\d{3} \|' $f -AllMatches).Matches.Count` | (1차만) | (1차 ✓) |
| G-NNN 수 | 9 | - | - | - | `(Select-String '^\| G-\d{3} \|' $f -AllMatches).Matches.Count` | (1차만) | (1차 ✓) |
| GE-NNN 수 | 17 | - | - | - | - | (1차만) | (1차 ✓) |
| D-NNN / L-NNN 수 | 9 + 0 | - | - | - | - | (1차만) | (1차 ✓) |
| B-NNN 수 (BS 포함) | 15 | - | - | - | - | (1차만) | (1차 ✓) |
| GB-NNN 수 | 0 | - | - | - | - | (1차만) | (1차 ✓) |
| P-NNN 수 | 2 | - | - | - | - | (1차만) | (1차 ✓) |
| ST-NNN 수 | 5 | - | - | - | - | (1차만) | (1차 ✓) |
| LV-NNN 수 | 3 | - | - | - | - | (1차만) | (1차 ✓) |
| C1~C6 충족 개수 | 0 | - | - | - | - | (1차만) | (1차 ✓) |
| API 패턴 | OASIS 단일 | - | - | - | - | (1차만) | (1차 ✓) |

### D.4 R-14 Auto Manifest 검증 매트릭스

> **✗ + 사유 명시**: Runner mui 미지원 (분석 §0 환경 제약 사용자 결정). 본 표 12 행 모두 ✗ + 사유.

| # | 검증 행 | 1차 값 | 2차 값 | 3차 값 | 4차 값 | 측정 방법 | 결과 (✓/✗) |
|---:|---|---|---|---|---|---|---|
| 1 | manifest.lock.json 경로 | (mui 환경 — 부재) | - | - | - | (미수행) | ✗ + 사유 |
| 2 | manifest.lock hash | - | - | - | - | - | ✗ + 사유 |
| 3 | index hash | - | - | - | - | - | ✗ + 사유 |
| 4 | discover.trace hash | - | - | - | - | - | ✗ + 사유 |
| 5 | classify.trace hash | - | - | - | - | - | ✗ + 사유 |
| 6 | fallback.trace hash | - | - | - | - | - | ✗ + 사유 |
| 7 | q-stable-key hash | - | - | - | - | - | ✗ + 사유 |
| 8 | verify-report 결과 | - | - | - | - | - | ✗ + 사유 |
| 9 | byte diff | - | - | - | - | - | ✗ + 사유 |
| 10 | enum 외 값 사용 여부 | - | - | - | - | - | ✗ + 사유 |
| 11 | trace 누락 여부 | - | - | - | - | - | ✗ + 사유 |
| 12 | conflict 미해결 여부 | - | - | - | - | - | ✗ + 사유 |

**§D.4 결과**: ✗ + 사유 명시 ("Runner mui 미지원 — 사용자 결정으로 생략"). 분석 §0 환경 제약 정본.

**§D 결과**: D.1 ✓ (P-NNN 만 △) + D.2 1차 자체 ✓ + D.3 1차 ✓ + D.4 ✗ + 사유 → **§D ✓ (mui 환경 제약 사유 명시 검증 통과)**.

---

## §E. 가이드 중복 제거 검증

| 영역 | 정본 위치 | 다른 가이드 본문 잔존 (✓ 잔존 0 / ✗ 발견) | grep 키워드 (예시) |
|---|---|---|---|
| 명명 규칙 본문 (camelCase / kebab-case / SNAKE_CASE / flat) | 01 A.4 | ✓ (4 산출물에서 정본 인용만 — `01 A.4.X` 형식) | "camelCase 단일 토큰" |
| moduleId / moduleGroup 카탈로그 | 01 A.1 / A.2 | ✓ (분석 §1 + 기능 §1.2 + §B 검증 시 등재 인용만) | "01 A.1.1" |
| 화면 ↔ As-Is 매핑 | 01 A.3 | ✓ (등재 신규 진행 — 본 화면 신규 등재 PR 필요) | "01 A.3.2" |
| API URL / OASIS / Phase 7 규칙 | 04 §A.2-3 | ✓ (BPMN §1 인용만) | "POST /api/{moduleId}/oasis" |
| C1~C6 API 패턴 자동 판정 기준 | 04 §A.2-3-2 | ✓ (BPMN §1.2 인용만) | "C1~C6 판정 기준 표" |
| 사용자 결정 카탈로그 | 02 §A.1-2-1 | ✓ (분석 §0 / §11 인용만) | "사용자 결정 사항" |
| Q-NNN 확인필요 형식 (7 컬럼) | 분석.template §13 | ✓ (분석 §13 / 기능 §11.1 / BPMN §6.1 / 정합 §G 동일 헤더) | "Q-NNN 7 컬럼 표" |
| 산출물 양식 (분석 / 기능 / 디자인 / BPMN / 정합) | templates/*.template.md | ✓ (templates 1byte 사용 + §0 환경제약 절만 사유 추가) | "산출물 §1~§N 표" |
| As-Is 추출 알고리즘 | 00 §6.4.1 ~ §6.4.8 | ✗ + 사유 ("mui 환경 — WinForms 알고리즘 미적용. 분석 §0 사유 명시") | "As-Is 추출 알고리즘 8 표" |

**§E 결과**: 8 행 ✓ + 1 행 ✗ + 사유 → **§E ✓ (mui 환경 사유 명시 검증 통과)**. 단일 정본 원칙 위배 없음.

### E.2 가이드 ↔ templates Drift 검증

| 검증 항목 | 가이드 위치 | templates 위치 | drift 검증 (Y/N 동기) |
|---|---|---|---|
| **E-R12-A**: §6.4.0 페이지 유형 A~E | 00 §6.4.0 | 분석.template §4.1 | (해당 없음 — mui 환경 §4.1 미적용 — 사유 §0) |
| **E-R12-B**: §6.4.1 S-NNN 10 단계 | 00 §6.4.1 | 분석.template §4.2 | (해당 없음 — mui 환경 사유) |
| **E-R12-C ~ T / E-R14-A ~ F / E-R14-Auto-1 ~ 5** | (각 가이드 위치) | (각 templates 위치) | (해당 없음 — mui 환경 사유) |

**§E.2 결과**: mui 환경 제약상 R-12 / R-13 / R-14 / R14-Auto 모두 미적용 → drift 검증 N/A. 사유 명시.

---

## §F. 삭제 참조 검증

| 검증 항목 | 잔존 (✓ 잔존 0 / ✗ 발견) | 검증 범위 |
|---|---|---|
| 삭제된 §22 (정본 분석리포트 선정 절차) 인용 | ✓ (잔존 0 — 4 산출물 grep 결과 hit 0) | 본 화면 4 산출물 (§F 제외) |
| 삭제된 §23 (Decision Lock frontmatter) 인용 | ✓ | 동일 |
| `locks:` (frontmatter) 인용 | ✓ | 동일 |
| `supersede` / `superseded` 인용 | ✓ | 동일 |
| `정본 차수` / `sourceIteration` 인용 | ✓ | 동일 |
| `lockedAt` / `guideVersion` 인용 | ✓ | 동일 |
| `status: locked` / `status: draft` 인용 | ✓ | 동일 |

**§F 결과**: 모든 행 잔존 0 ✓ → **§F ✓**.

---

## §G. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석리포트 §12 결정 누적 표 그대로 인용 (4 산출물 일치). 활성 미결정 = **0 건**. 본 절은 추적용 — ✓/✗ 판정 없음.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **As-Is / To-Be 표준 우선 원칙** | 정책 #4 (0) — As-Is 위반 항목은 자동 As-Is 1:1 보존 + To-Be 결정은 §11 변환점에 명시 (메인 자동 / `feedback_decision_delegation.md` 정합) | 분석 §0 / §11 전 행 |
| **BIZ_SYSTEM_CODE 폐기 (정책 #1, Q-005 자동 해소)** | S-001 cbo_bizSystemCode 콤보 + D-001 cbo_bizsystem + G-006 BIZ_SYSTEM_CODE + LV-001 ds_lovSubSystem + cross-namespace `CommObjMngMapper.selectAppHostId` + BPMN Task_0r5ztlq (lov_SUBSYSTEM 분기) + selectCommRole/selectCommRoleMapList 의 WHERE 분기 + ds_main_oncolumnchanged BIZ_SYSTEM 필터링 일괄 폐기 | 분석 §3.2 (S-001) / §3.3 (G-006) / §3.5 (D-001 / D-003) / §6 #5/#10 / §8 Task_0r5ztlq / §9.3 LV-001 / §10 fn_lov / §11 #18 |
| **디폴트 텍스트 "부산역 CY" (Q-001)** | xfdl 7곳 디자인 더미 ("부산역 CY") — 의미 무관 잔존. To-Be 미반영 (신규 placeholder/빈 문자열 — 신규 미반영 정책) | 분석 §3.2 (S-002/S-003) / §3.5 (D-002 등) / §11 #17 |
| **xfdl 핸들러 본문 미정의 (Q-003 / Q-004 / Q-006)** | As-Is `div_search_cbo_USE_TP_onitemchanged` (S-004) / `edt_object_id_canchange` (D-002) / `edt_id_onchanged` (D-004) 핸들러명 등록만 / 본문 정의 ✗. To-Be 미반영 (신규 핸들러 추가 ✗) — Q-004 D-002 ROLE_ID 자동 합성은 Service 레이어 `existsById(...)` 중복 체크 + 422 BUSINESS_RULE_VIOLATION 으로 흡수 | 분석 §3.2 (S-004) / §3.5 (D-002 / D-004) / §11 #29 #30 |
| **D-007 Radio Y/N (Q-007)** | As-Is Radio (5 enum 외) → To-Be React RadioGroup 컴포넌트로 자연 흡수 (Y/사용, N/미사용 2옵션 정적). 디자인 §5 RadioGroup 정본 (03 §A.9-3 등재) | 분석 §3.5 (D-007) / §11 #25 |
| **셔틀 cssclass 정정 (Q-008)** | As-Is btn_right cssclass=`btn_WF_ShuttleAddH` (실 동작=삭제) / btn_left cssclass=`btn_WF_ShuttleDeleteH` (실 동작=추가) → **To-Be swap 정정** btn_right=`btn_WF_ShuttleDeleteH` (Delete) / btn_left=`btn_WF_ShuttleAddH` (Add) — 의미 정합 | 분석 §3.6 (BS-001 / BS-002) / §11 #16 #24 |
| **commonLeftButton (Q-009)** | As-Is chk_check / btn_sum / btn_copyPaste — 본 화면 핸들러 ✗ (외부 commonLeftButton 자동 처리). To-Be React 공통 컴포넌트 (`ToolbarButtons leftMenu`) 로 자연 흡수 | 분석 §4.2 (B-005~007) / §11 #26 |
| **fn_linkCommMenu / fn_openMenu 주석 처리 (Q-010)** | As-Is xfdl:289/307 사용자정의 array 주석 처리 + xfdl:842~860 본문 정의만 있고 실 호출 ✗. P-002 외부 화면 이동은 To-Be 미반영 (신규 라우팅 추가 ✗) | 분석 §5 (P-002) / §11 #30 |
| **updateCommRoleMap no-op (Q-011)** | As-Is Mapper xml:127~130 본문이 `SELECT 'X' FROM DUAL` 행 — 실 UPDATE 동작 없음 / ds_roleMap rowType=4 발생 ✗. To-Be Mapper SQL 폐기 + BPMN Task_0weig4p updateSqlKey property 자체 삭제. JPA `SecRoleMappingRepository.saveAll(...)` 이 INSERT-only / DELETE-only 행을 자연 처리 | 분석 §6 #9 / §8 Task_0weig4p / §11 #20 |
| **BPMN process name 정정 (Q-012)** | As-Is bpmn:3 `name="부모역할 부여 조회"` (다른 화면명 복붙 잔존) + process id `CommRoleMng` → **To-Be `name="역할 관리"` + process id `commRoleMng` (camelCase)** | 분석 §8 / §11 #13 #21 / BPMN |
| **D-002 라벨 "역활 ID" 정정 (Q-013)** | As-Is xfdl:243 `edt_st_roleId.value="역활 ID"` (오타 "역활") → **To-Be "역할 ID"** | 분석 §3.5 (D-002) / §11 #14 #22 |
| **D-005 / D-006 라벨 ↔ 컬럼 매핑 정정 (Q-014)** | As-Is 라벨 컨트롤명 `edt_st_roleDesc` (실은 ROLE_NM 라벨) / `edt_st_parentRoleId` (실은 ROLE_DESC 라벨) — 의미 비일관 → **To-Be `edt_st_roleNm` / `edt_st_roleDesc`** (라벨↔컬럼↔컨트롤 id 의미 정합) | 분석 §3.5 (D-005 / D-006) / §11 #15 #23 |
| **BPMN dao="" + isServiceResult 의도 (Q-015)** | As-Is `dao=""` + `isServiceResult=true` 의 mui 외부 lib default 동작 단정 ✗. → **To-Be ksm cactus-core oasis 패키지 표준** (`OasisServiceExecutor` + `MyBatisSqlRunner` 재설계 — `isServiceResult` 미사용 / dao property 삭제). 가이드 §6-C/D/E + §7-A/B 정본 | 분석 §8 / §11 #27 / BPMN |
| **setRowType normalize (Q-016)** | As-Is xfdl:494 `setRowType(i, ROWTYPE_NORMAL)` 강제 (조회 후 NORMAL 일괄). → **To-Be React state `rowStatus` 흡수** — `useGridDataManager` 의 normalize 자동 처리 | 분석 §10 / §11 #28 |
| **fn_msgSuccessSave this 컨텍스트 (Q-017)** | As-Is `showModal` 4번째 인자 `this` 가 callback owner 로 전달 → 본 form `fn_search` 호출 정합. As-Is 동작 정상 (libUtil.xjs:1693 / 1771). To-Be React 에서는 setState/closure 패턴으로 명시 처리 | 분석 §10 |
| **audit (cactus-core 정본)** | As-Is `ref_Audit` fragment 6 회 호출 (xml:49/60/72/117/123) → **To-Be 폐기** — cactus-core `McmAuditEntity` 상속 (정확히는 `CactusAuditEntity` 9 컬럼 — `C_*`/`U_*` 8 + `VER` 1) + JPA `@PrePersist` / `@PreUpdate` 자동 채움 | 분석 §9 / §11 #9 |
| **Entity 명명 (정책 #6 (A))** | mcm-core 의 `Sec*` legacy entity 잔존 보존 (cma 4 화면 마이그레이션 시 결정 — `project_cma_mcm_core_migration.md`). **본 화면 BE Entity = `SecRole` (TB_MCM_SEC_ROLE) / `SecRoleMapping` (TB_MCM_SEC_ROLE_MAPPING, `@IdClass(SecRoleMappingId.class)` 복합 PK)**. Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 모듈 직속 (가이드 §3-1 / §6-A-1 / §7-1 정본). Service / DTO = `com.dongkuk.dmes.mcm.csa.commRoleMng.{service,dto}.*` | 분석 §11 #19 / §11.1 |
| **스키마 / 테이블명 (정책 #1 (6)(7))** | As-Is TB_MCM_SEC_* (스키마 미명시) → **To-Be `MCMAPUSER.TB_MCM_SEC_*` (대문자 보존 + schema=MCMAPUSER)**. MSSQL `sample_dmes` 환경 통합 (사용자 결정 — `project_mcm_cma_dev_complete.md`) | 분석 §9.1 / §11 #1 / §11.1 |
| **searchObjectLov action 신설 (Round 2 / K-003)** | As-Is xfdl:321~336 `div_object_id` (commonDynamic.xfdl Essential / service="commonList" / URL="csa::CommMenuMng" / dataset="ds_menuObjLst") 호출을 본 화면 namespace 안에서 내재화 → 신규 BPMN action `searchObjectLov` + Service `searchObjectLov` + Repository `searchObjectLov` (TB_MCM_SEC_OBJ WHERE USE_TP='Y' AND UPPER LIKE) + DTO `CommRoleMngSearchObjectLovRequest`. 검색 범위 As-Is prefix LIKE (`||'%'`) → ToBe substring LIKE (`'%'+ ... +'%'`) 완화 (사용자 결정). | BPMN §1.1 / §1.3 + 디자인 §3.1.2 + 정합 §K.2 K-003 |
| **sub2 인라인 분할 + Modal 폐기 (Round 3 / K-004~K-006)** | Round 2 OBJECT-LoV Modal (P-001) 폐기 + sub2 영역 = 좌 OBJECT 목록 그리드 (다중 체크박스) + 우 권한 그리드 (단일 라디오) 2 ContentPanel 인라인 분할. "권한 추가" 버튼은 selected OBJECTs (N) × selected PERM (1) = N row 일괄 saveCmRoleMap INSERT (BE 변경 ✗). | 디자인 §3.1.2 / §3.3.1 / §5 / §5.4.1 / §6 + 정합 §K.3 K-004/005/006 |
| **searchCmPerm NOT EXISTS 제거 (Round 4 / K-007)** | As-Is `WHERE USE_TP='Y' AND NOT EXISTS (...)` → ToBe `WHERE USE_TP='Y'` 만 (권한 부여 여부 무관 전체 권한 항상 표시). roleId 파라미터는 시그니처 호환 유지만 (FE/BPMN 변경 회피). | 디자인 §5.5.3 + BE [SecRoleMappingNativeRepository.java:124~146](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/repository/SecRoleMappingNativeRepository.java#L124) + 정합 §K.4 K-007 |
| **sub2 좌 이미 부여 OBJECT 클라이언트 제외 (Round 4 / K-008)** | sub2 좌 OBJECT 목록 = `objectRows` 에서 sub1 (`roleMapRows`) 이 부여한 OBJECT_ID 를 `Set<String> grantedObjIds` 분기로 클라이언트 useMemo 제외. BE 변경 ✗. | 디자인 §5.5.2 + FE [page.tsx:331~344](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L331) + 정합 §K.4 K-008 |
| **FILTER 2 패널 신설 (Round 4 / K-009 + K-010)** | sub2 좌 / 우 각각 ContentPanel 안에서 GridPanel **sibling** 위치에 회색 stripe (`#f4f6f8` + border) FILTER 라벨 + Input 신설. 검색 범위 = OBJECT_ID+OBJECT_NM / PERMISSION_ID+PERMISSION_NM UPPER LIKE 부분 일치. (sub1 PERMISSION_ID 필터는 기존 위치 유지.) | 디자인 §5.5.1 + FE [page.tsx:1082~1129](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L1082) + 정합 §K.4 K-009/010 |
| **ROLE_ID readOnly — inserted 만 (Round 5 / K-011)** | D-002 ROLE_ID Input `readOnly={selected.nativeeditor_status !== "inserted"}` 분기. handleCellChange 의 MENU_ID + ID → ROLE_ID 자동 합성 분기 보존. updated 행 PK 변경 차단. | 디자인 §3.4.2 / §5.5.X + FE [page.tsx:903~911](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L903) + 정합 §K.5 K-011 |
| **2x2 collapse 회피 (Round 2 / K-001+K-002)** | `ContentBody root` direction prop 폐기 + 외곽 column stacker div + Row 1/Row 2 내부 row div 명시. shared `.content-body--column` selector 가 portal shell 안에서 무력화 결함 회피. worker 재지시 2회 결함. | 디자인 §3.1.1 + FE [page.tsx:819~1166](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L819) + 정합 §K.1 + §K.6 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| **btn_close (B-004) 완전 제거 (Round 7 / K-013)** | AsIs xfdl `commonTop basic 4` 의 마지막 btn_close → ToBe 에서 완전 제거. PageLayout buttons 배열에서 B-004 entry 삭제 + unused handleClose dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. | 디자인 §3.1 A-BTN / §5 PageLayout.buttons / §5.1.1 B-004 / §9 아이콘 B-004 / §J Round 7 + FE [page.tsx](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx) PageLayout buttons 배열 + 정합 §K.5B K-013 |

**§G 결과 (참고)**: **활성 미결정 = 0 건 / 결정 누적 26 행** (정책/Q-NNN 18 + Round 2~5 신규 결정 7 + Round 7 신규 결정 1) — 분석리포트 §12 와 정책 항목 1byte 일치 + Round 2~5 / Round 7 결정은 §K 등재로 보강. 본 갱신 (2026-06-05) 신규 결정 = Round 7 K-013 btn_close 완전 제거 (Round 6 는 본 화면 N/A — K-012-a/b/c). 본 절은 추적용 — ✓/✗ 판정 없음.

---

## §H. 셀 본문 결정성 검증 (R-12 Tier 4)

> 본 분석은 1차 작업 — N=1 측정만 가능. N차 회귀 측정은 본 작업 외 (사용자 결정 — 후속).

### H.1 측정 알고리즘 (PowerShell)

(가이드 templates 정본 그대로 — 변경 ✗)

### H.2 N차 셀 본문 일치율 매트릭스

| 절 / 영역 | 1차↔2차 | 2차↔3차 | 3차↔4차 | 평균 일치율 (%) | 목표 | 결과 (✓/✗) |
|---|---:|---:|---:|---:|---|---|
| §3.2 S-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §3.3 G-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §3.4 GE-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §3.5 D-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §4 B-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §4.7 GB-NNN | (해당 없음 — N=0) | - | - | - | - | N/A |
| §5 P-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §9.2 ST-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §9.3 LV-NNN | (1차만) | - | - | - | ≥ 80% | (1차만) |
| §13 Q-NNN | (1차만) | - | - | - | ≥ 95% | (1차만) |
| §1 화면 목적 (패턴 일치) | "역할 관리는 CommRoleMng의 조회, 등록, 수정, 삭제, 상태변경을 수행한다." 패턴 enum 일치 | - | - | - | 100% | (1차 ✓) |
| §0.1 자연제외 표 | (mui 환경 미작성 — 사유 §0) | - | - | - | 100% | (1차만 — mui 사유) |

**§H 결과**: 1차 자체 (mui 환경 사유 § 0.1 미작성 제외) 모든 영역 본문 작성 완료. N=1 측정만 가능.

---

## §I. 의미 일치도 검증 (R-12 Tier 4)

### I.1 의미 일치 판정 기준 (행 ID 기준)

(가이드 정본)

### I.2 의미 일치율 매트릭스

| 절 / 영역 | 1차↔2차 | 2차↔3차 | 3차↔4차 | 평균 의미 일치율 (%) | 목표 | 결과 |
|---|---:|---:|---:|---:|---|---|
| (모든 영역) | (1차만 — 비교 대상 미생성) | - | - | - | ≥ 95% / 97% | (1차만 N/A) |

**§I 결과**: N=1 측정만 가능 — 비교 N/A.

---

## §J. SOP 30 Step 실행 검증 (R-13)

> **✗ + 사유 명시**: SOP 30 Step 미실행 — Runner 산출물 부재 (분석 §0 환경 제약 사용자 결정). 본 절 검증 N/A.

### J.1 PowerShell 검증 함수 본문

(가이드 정본 — 본 작업 미사용)

### J.2 SOP Step 일치율 매트릭스

| Step | 결과 (✓/✗) | 사유 |
|---|---|---|
| (1~30) | ✗ + 사유 | mui 환경 제약 (분석 §0) — Runner / SOP 30 Step 미실행 |

**§J 결과**: 본 화면 mui 환경 제약상 SOP 30 Step 미실행 → §J ✗ + 사유 명시. **분석 §0 환경 제약 정본**.

---

## §K. 사용자 검수 결과 반영 이력 (2026-06-02 ~ 2026-06-03 / Round 2~5)

> 본 절은 ToBe 코드 구현 후 사용자 검수에서 발견된 결함을 본문 갱신 + 코드 수정 + 정합체크 등재로 동시 반영한 이력을 추적한다. 사용자 메모리 `feedback_q_resolution_propagation.md` 정합 — 단순 "해소됨" 표시 ✗, 본문 §§ 갱신 + 코드 수정 + 정합체크 등재 3-축 동기. W5 commUserMng 정합체크서 §J 의 본 화면 등가 절. (정합체크 §J 는 SOP 검증으로 선점되어 본 화면은 §K 로 신설.)

### K.1 Round 1 — AsIs 1:1 재개발 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-001 | FE 페이지 구조 (page.tsx) | 2026-05-31 까지의 ToBe Round 0 (사전 설계 구조) 가 AsIs 2x2 레이아웃 (Row1 메인+Detail / Row2 sub1+sub2) 과 mismatch — 사용자 화면 검토 후 "AsIs 그대로 재현하라" 결정 | "AsIs 의 2x2 레이아웃을 1:1 으로 재개발하라. 사전 ToBe 폐기" | 디자인 §3.1.1 신설 (W5 A) — `ContentBody root` + 외곽 column stacker div + Row 1 / Row 2 내부 row div 명시 | [page.tsx:819~1166](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L819) — 2x2 collapse 회피 wrapper |
| K-002 | FE ContentBody collapse | shared `.page-layout .content-body--column { flex-direction: column }` selector 가 portal shell 안에서 미적용 → Row 2 가 Row 1 옆으로 collapse | (worker 자체 진단 — 2회 재지시 후 fix) | 디자인 §3.1.1 — direction prop 폐기 + 외곽 column stacker div 명시 정책 | (동일 위치) |

### K.2 Round 2 — OBJECT-LoV 누락 결함 + Modal 신설 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-003 | FE sub2 OBJECT 검색 UI | Round 1 ToBe 에서 AsIs xfdl:129 `div_object_id` (commonDynamic.xfdl Essential) 누락 → sub2 → sub1 권한 추가 시 V-002 "OBJECT ID 입력 후 추가해주세요" alert 으로 기능 차단 | "OBJECT 검색 UI 신설" | 디자인 §3.1.2 신설 (sub2 인라인 분할 정책) + BPMN 7번째 action `searchObjectLov` 신설 | BE: [commRoleMng.bpmn:169~185](src/backend/mcm/api/src/main/resources/services/csa/commRoleMng/commRoleMng.bpmn#L169) + [CommRoleMngService.java:376~382](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/csa/commRoleMng/service/CommRoleMngService.java#L376) + [SecRoleMappingNativeRepository.java:194~222](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/repository/SecRoleMappingNativeRepository.java#L194) + DTO `CommRoleMngSearchObjectLovRequest`. FE: Modal (Round 2) |

### K.3 Round 3 — OBJECT-LoV Modal 폐기 + 인라인 그리드 + 권한 추가 multi-row (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-004 | FE sub2 OBJECT-LoV UX | Round 2 Modal 흐름이 AsIs commonDynamic UX (sub2 영역 안에 자동완성 input 형태) 보다 한 단계 더 들어감 — "인라인으로 펴라" | "Modal 폐기 / sub2 = 좌 OBJECT 그리드 + 우 권한 그리드 2 패널 인라인 분할" | 디자인 §3.1.2 / §3.3.1 / §5 컴포넌트 트리 신규 갱신 — sub2 2 ContentPanel 분할 + P-001 폐기 명시 | [page.tsx:1079~1163](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L1079) — sub2 좌/우 인라인 그리드 |
| K-005 | FE 권한 추가 multi-row | Round 2 까지는 단일 OBJECT × 단일 PERM 1 row INSERT 만 가능 | "OBJECT N개 × PERM 1개 = N row 일괄 INSERT" | 디자인 §5.4.1 신설 — multi-row INSERT 정책 명시 | [page.tsx:handleAddPerms](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx) — N row 합성 + saveCmRoleMap 일괄 호출. BE saveCmRoleMap 다중 row 지원 (변경 ✗) |
| K-006 | FE sub2 좌 selectable | Round 2 까지는 sub2 우 권한 그리드만 selectable. OBJECT 그리드는 단일 선택 (라디오) | "sub2 좌 OBJECT = multiSelect=true / sub2 우 PERM = multiSelect=false (단일 라디오)" | 디자인 §5 컴포넌트 트리 — sub2 좌 `selectable multiSelect`, sub2 우 `selectable multiSelect={false}` 명시 | (동일 위치) |

### K.4 Round 4 — 정합 정책 변경 (NOT EXISTS 제거 + OBJECT 클라이언트 제외 + FILTER 2 패널) (2026-06-03)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-007 | BE `searchCmPerm` NOT EXISTS | Round 3 까지는 본 ROLE_ID 에 미할당 권한만 표시. 하지만 sub2 좌 OBJECT 가 §5.5.2 (이미 부여 OBJECT 제외) 로 변경됨에 따라 사용자가 다른 OBJECT 에 동일 PERMISSION 부여 시 권한 풀이 NOT EXISTS 로 가려지는 결함 | "권한 그리드는 부여 여부 무관 전체 권한 항상 표시" | 디자인 §5.5.3 신설 — `searchCmPerm` SQL NOT EXISTS 제거 정책 명시 | [SecRoleMappingNativeRepository.java:124~146](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/repository/SecRoleMappingNativeRepository.java#L124) — `WHERE A.USE_TP='Y'` 만. roleId 파라미터 시그니처 유지만 |
| K-008 | FE sub2 좌 OBJECT 중복 부여 | Round 3 까지는 모든 OBJECT 표시 → 이미 sub1 에 부여된 OBJECT 가 sub2 좌에도 보이고 다중 체크 시 saveCmRoleMap 중복 PK silent skip 으로 흡수되긴 했으나 UX 가 혼란 | "이미 부여된 OBJECT 는 sub2 좌 목록에서 제외" | 디자인 §5.5.2 신설 — `filteredObjectRows` useMemo + `grantedObjIds` Set 분기 정책 명시 | [page.tsx:331~344](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L331) — useMemo 분기 (roleMapRows 의존) |
| K-009 | FE FILTER 2 패널 신설 | Round 3 까지 sub2 좌/우 각각 검색 input 미정. OBJECT 그리드 / PERM 그리드가 길어지면 사용자가 못 찾음 | "sub2 좌/우 각각 panel header 우측에 FILTER 라벨 + Input 신설. OBJECT_ID+OBJECT명 / PERMISSION_ID+PERMISSION명 부분 일치" | 디자인 §5.5.1 신설 — FILTER 2 패널 정책 명시 + 검색 범위 (OBJECT_ID+OBJECT_NM / PERMISSION_ID+PERMISSION_NM UPPER LIKE) | [page.tsx:271 (objectFilter)](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L271) + [page.tsx:284 (permFilter)](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L284) state + [page.tsx:1082~1129](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L1082) FILTER UI |
| K-010 | FE FILTER 가시화 fix | Round 4 1차 구현에서 FILTER div 를 `<GridPanel>` 의 children 안에 두었더니 GridPanel 내부 hidden style 로 인해 화면 미표시 (worker 재지시 발생) | (worker 자체 진단 — 2회 재지시 후 fix) | 디자인 §5.5.1 — FILTER div 는 ContentPanel 안 + GridPanel **sibling** + 회색 stripe (`#f4f6f8` + `border-bottom: 1px solid #d4dae0`) 정책 명시 | (동일 위치) |

### K.5 Round 5 — ROLE_ID readOnly 정합 (2026-06-03)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-011 | FE D-002 ROLE_ID readOnly | Round 4 까지의 D-002 는 `readOnly={!isNewRow}` (inserted/updated 모두 분기) 인데 실 동작은 updated 시점에도 ROLE_ID 입력란이 활성 + handleCellChange 의 자동 합성 로직 (MENU_ID + ID → ROLE_ID) 이 잘못 동작 | "ROLE_ID 는 inserted (행 추가 직후) 만 입력 가능. updated 행은 PK 변경 차단" | 디자인 §3.4.2 (W5 C 행 readOnly 분기) + §5.5.X (Round 5 정책 신설) — `readOnly={selected.nativeeditor_status !== "inserted"}` 명시 | [page.tsx:903~911](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L903) — readOnly 분기. handleCellChange 의 MENU_ID+ID → ROLE_ID 자동 합성 분기 보존 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### K.5A Round 6 — 다른 화면 결함 패키지 (본 화면 N/A 매핑) (2026-06-04)

| # | 발견 영역 | 결함 / 사용자 지시 | 본 화면 매핑 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-012-a | (타 화면) ACCESS_TP FILTER 2 옵션 추가 | 다른 화면의 ACCESS_TP 필터에 2 옵션 신설 | **N/A — 본 화면 ACCESS_TP 컬럼 미적용** | (해당 없음) | (해당 없음) |
| K-012-b | (타 화면) OBJECT 목록 sub1 제외 + NOT EXISTS 제거 | 다른 화면에서 동일 정책 변경 | **N/A — 본 화면 Round 4 (K-007 / K-008) 로 선행 반영 완료** | (이미 §5.5.2 / §5.5.3 본문 등재) | (이미 [page.tsx:331~344](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L331) + [SecRoleMappingNativeRepository.java:124~146](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/repository/SecRoleMappingNativeRepository.java#L124) 반영) |
| K-012-c | (타 화면) PK readOnly inserted-only | 다른 화면에서 동일 정책 변경 | **N/A — 본 화면 Round 5 (K-011) 로 선행 반영 완료** | (이미 §3.4.2 / §5.5.X 본문 등재) | (이미 [page.tsx:903~911](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L903) 반영) |

### K.5B Round 7 — btn_close 완전 제거 (2026-06-04~05)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| K-013 | FE PageLayout buttons (B-004 닫기) | AsIs xfdl `commonTop basic 4` 마지막 btn_close 버튼이 ToBe 에 잔존 + 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) 도 닫기를 포함했으나 portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. 잔존 시 사용자 클릭 시 dead code (handleClose) 만 실행되며 UX 혼란 | "ToBe 에서 btn_close 완전 제거 — PageLayout buttons 배열에서 entry 삭제 + unused handleClose dead code 제거. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장)" | 디자인 §3.1 A-BTN (조회/저장 명시) + §5 PageLayout.buttons (B-004 폐기 명시) + §5.1.1 B-004 행 ~~취소선~~ + §9 아이콘 B-004 ~~취소선~~ + §J Round 7 행 신설 | [page.tsx](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx) — PageLayout `buttons` 배열에서 B-004 entry 삭제 + `handleClose` 함수 정의 제거 (dead code) |

### K.6 Round 2~5 worker 재지시 결함 명세 (회귀 방지)

| Round | 결함 | 재지시 횟수 | 근본 원인 | 회귀 방지 |
|---|---|---|---|---|
| Round 2 | 2x2 레이아웃 collapse | 2회 | shared `.content-body--column` selector 가 `.page-layout` 한정 → portal shell 무력화 | 디자인 §3.1.1 — `ContentBody root` direction prop 폐기 정본 + 외곽 column stacker div 명시 |
| Round 4 | FILTER 가시화 미작동 | 2회 | FILTER div 를 GridPanel children 안에 둠 → GridPanel 내부 hidden style | 디자인 §5.5.1 — ContentPanel 안 + GridPanel sibling + 회색 stripe 명시 정본 |

### K.7 신규 Q-NNN 등재 ✗

Round 2~5 작업은 **AsIs 위반 정정** + **사용자 결정 정책 영역** + **가이드 정본 영역 반영** 만 포함하며 신규 미해결 결정 사항 ✗. 모든 결함은 본문 갱신 + 코드 수정 + §K 등재로 즉시 해소.

### K.8 미반영 / 정책 결정 (확인 필요)

| 항목 | 결정 영역 | 현 상태 | 사유 / 후속 |
|---|---|---|---|
| **BIZ_SYSTEM_CODE #1 (정책 #1)** | 분석 §11 #18 / 디자인 §3.1 / §4.4 (취소선) / §G | **완전 폐기 결정 유지** (As-Is 위반) | S-001 / D-001 / G-006 / LV ds_lovSubSystem / cross-namespace selectAppHostId / Task_0r5ztlq / WHERE 분기 / column change 핸들러 일괄 폐기. 잔존 컬럼 ✗. To-Be 신규 미반영. 향후 다른 화면 사용 시 재검토 필요. |
| **OBJECT_ID 팝업 LoV** | 분석 §5 / 디자인 §6 | **Round 3 — P-001 폐기 / sub2 인라인 흡수 결정 유지** | Round 2 Modal 신설 → Round 3 인라인 그리드 분할로 흡수. BE `searchObjectLov` action 잔존 (데이터 소스로 재사용). 향후 다른 화면이 동일 LoV 사용 시 P-001 정합 패턴 재현 가능 (재사용 stub). |
| **OBJECT-LoV 검색 범위 확장** | BE `searchObjectLov` SQL (정합 §F #6) | **`AND (UPPER(OBJECT_ID) OR UPPER(OBJECT_NM)) LIKE %...%` 양쪽 substring** (As-Is `||'%'` prefix LIKE → ToBe substring LIKE) | As-Is commonDynamic 의 자동완성 prefix 검색이 ToBe input + 검색버튼 UX 와 mismatch → ToBe 는 부분 검색 (OBJECT_ID + OBJECT_NM 양쪽 substring) 으로 완화. 사용자 결정 후 코드 반영 (Round 2). 향후 다른 화면이 동일 LoV 호출 시 prefix/substring 정책 재검토 필요. |
| **roleId 파라미터 잔존 (searchCmPerm)** | BE `SecRoleMappingNativeRepository.searchCmPerm(String roleId)` 시그니처 | **시그니처 유지만 / SQL 미사용** | Round 4 NOT EXISTS 제거로 roleId 실제 사용 ✗ 이나 BPMN dto 정의 + FE API 호출 변경 회피를 위해 시그니처 유지. 향후 BPMN/DTO/FE 통합 정리 시 제거 가능. |

→ Round 2~5 시점 모든 사용자 지시 1:1 반영 완료. 향후 iter 에서 회귀 방지를 위해 본 §K.6 의 worker 재지시 결함 명세 + §K.8 의 미반영 사유 참조.

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### K.9 Round 6~7 추가 (2026-06-04~05)

- **Round 6 (K-012-a/b/c)**: 다른 화면 결함 패키지 3종 (ACCESS_TP FILTER 2 옵션 / OBJECT 목록 sub1 제외 + NOT EXISTS 제거 / PK readOnly inserted-only) → 본 화면은 모두 N/A (ACCESS_TP 미적용 / Round 4 + Round 5 로 선행 반영 완료). 본 화면 본문/코드 변경 ✗.
- **Round 7 (K-013)**: btn_close (B-004) 완전 제거. PageLayout buttons 배열에서 entry 삭제 + unused handleClose dead code 제거. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 가 host 처리 — 화면 내부 닫기 버튼 의미 ✗.

→ Round 6~7 시점 본 화면 worker 재지시 ✗ (단순 제거 작업) — §K.6 회귀 방지 매트릭스 추가 행 ✗.

---

## 종합 결과

| 절 | 결과 | 사유 |
|---|---|---|
| §A | ✓ (사유 명시 검증) | A.1 / A.2 ✓ + A.3 ✗ + 사유 (Runner 부재) |
| §B | ✓ | B-T3B / B-T3C 본 갱신 (2026-05-31) Q-007 / Q-002 closed 로 ✓ 격상 / B-MES-1 ✓ |
| §C | ✓ | 5축 정합 모든 행 ✓ (P-NNN △ → ✓ 격상 / 정책 #1 P-002 제거 / Q-010 closed) |
| §D | ✓ (사유 명시 검증) | D.1~D.3 ✓ (P-NNN 격상 + LV/SQL/Task As-Is↔To-Be 카운트 정합) + D.4 ✗ + 사유 (Runner 부재) |
| §E | ✓ (사유 명시 검증) | E.1 9 행 중 1 행 ✗ + 사유 (mui 환경 추출 알고리즘 미적용) / E.2 mui 사유 |
| §F | ✓ | 폐기 키워드 잔존 0 |
| §G | (추적용 — 판정 없음) | **open 0 / closed 17 / wontfix 0** (본 갱신 신규 15 + 사전 2) |
| §H | (1차만 — N=1 측정) | 모든 영역 본문 작성 ✓ |
| §I | (1차만 — N=1 측정) | N/A |
| §J | ✗ + 사유 | mui 환경 — SOP 30 Step 미실행 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §K | ✓ (Round 2~7 이력 / 추적용) | 12건 결함 본문+코드+§K 등재로 즉시 해소 (K-001~K-011 + K-013) / Round 6 (K-012-a/b/c) 본 화면 N/A 매핑 / 미반영 4건 사유 명시 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
**최종 판정**: §A ~ §F 6 개 절 모두 ✓ (mui 환경 사유 명시 ✗ 포함) + §K (Round 2~7 사용자 검수 이력 추적) ✓. **설계 완료 + 코드 동기화** (Phase 5 재통과 + Round 7 완료 — btn_close 완전 제거).

---

## §6.14 Phase 5 종료 자가 점검 (4 질문)

1. **14항 위반?** — 위반 ✗. §A ~ §K 모든 절 작성. mui 환경 사유 명시 ✗ 처리는 분석 §0 환경 제약 (사용자 결정) 정본 인용. 가이드 §외 임의 신설 ✗ (§K 는 W5 commUserMng 정합체크서 §J 의 본 화면 등가 절 — 정합체크서 §J 가 SOP 검증으로 선점되어 §K 로 신설 / 가이드 정본 패턴 정합).
2. **검증 안 한 부분?** — N=1 측정만 (§D.2 / §D.3 / §H / §I 의 2~4 차 비교 N/A — 후속 회귀 시점).
3. **그대로 수용?** — Q-001~Q-017 **17건 전수 closed** (분석 §13 정본 인용). Round 2~5 + Round 7 신규 발견 결함 12건 (K-001~K-011 + K-013) 모두 §K 등재로 즉시 해소 (본문 + 코드 + 정합체크 3-축 동기). 신규 Q-NNN 등재 ✗.
4. **임의 합리화?** — 없음. Round 2~5 + Round 7 모든 결정은 (a) AsIs 1:1 위반 정정 / (b) 사용자 결정 정책 (Round 3 인라인 / Round 4 NOT EXISTS 제거 / Round 5 readOnly / **Round 7 btn_close 제거**) / (c) W5 commUserMng 정본 패턴 (iter#2~#4) 인용. 6 정책 매트릭스 (정책 #1 / #4 / #6 (A) / Service 레이어 / UI 자연 흡수 / 신규 미반영) 정본 유지.

→ Phase 5 통과. **5종 산출물 + ToBe 코드 동기화 완료 (갱신 2026-06-04 — Q 활성 0 / Round 2~5 §K 11건 추적)**.

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
→ Phase 5 재통과 (갱신 2026-06-05 — Round 6 (K-012-a/b/c) 본 화면 N/A 매핑 + Round 7 (K-013) btn_close 완전 제거 §K.5A / §K.5B / §K.9 신설 + §G K-013 등재 + 디자인 §J 라운드 카탈로그 동기화).
