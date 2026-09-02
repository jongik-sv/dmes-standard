---
screenId: commRoleGrpMng
asIsId: CommRoleGrpMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 역할 그룹 관리 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 확인필요 항목 = **0 건** (분석리포트 §12 결정 누적표 15 행 본문 직접 반영).
> **환경 제약 (사용자 결정 [§10])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §D.4 = ✗ + 사유 명시.
> **2026-05-31 갱신**: 정책 #1 (BIZ SYSTEM 콤보 제거) / 셔틀 cssclass 정정 / PARENT_ROLE_ID SELECT 추가 / BPMN process name 정정 / Service PK 중복 검증 / React state 자연 흡수 일괄 적용.
> **2026-06-02 Round 2/3/5 갱신**: AsIs 1:1 재개발 (4분할 채택 후 메뉴트리 영역 제거로 3분할 + 2-chain) + ROLE_GROUP_ID readOnly inserted 만 적용 → §J 신설.
> **2026-06-04 갱신**: 디자인설계서 §8 W5 A~G 패턴 본 화면 직접 등재 → §J.4 등재.
> **2026-06-04~05 갱신**: Round 6 (PK readOnly — 본 화면 N/A) + Round 7 (btn_close 완전 제거) → §J.5 신설 + §K 신설.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§13 / §1~§11 / §1~§7 / §1~§7 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§11 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (기능 §4.2 L-NNN / §5.1-4 GB / §9 P-NNN / 디자인 §5.5 GB / §6 P / BPMN §3 Java UserTask) | (해당 없음 — 분석은 §5 P / §7 Java / §4.5 GB 가 "해당 없음") | ✓ | ✓ | ✓ | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§11] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 + §-1 4질문 = 사용자 요구사항 §10 / §6.14 에 의해 신설) | ✓ | ✓ | ✓ | ✓ | §0 + §-1 은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 9 (5 표준 + 4 추가: A-TITLE / A-FOLD / A-MAIN-CENTER / A-FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | 9 영역 = TITLE + FILTER + FOLD + MAIN-TOP-LEFT + MAIN-TOP-RIGHT + MAIN-BOT-LEFT + MAIN-CENTER + MAIN-BOT-RIGHT + FOOTER |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §10 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl 만 — Java UserTask 부재) + D2 (Mapper.xml SQL) 만 존재, D3 SP 의존 ✗ | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 미존재 (Oracle SP/함수/트리거 미사용 — Mapper.xml inline SQL 만) |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / oncellclick / onheadclick / onitemchanged / oncolumnchanged / onkeyup / onload / onrowposchanged 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.6 의 메서드 표 32 행으로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 10 SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§10] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 3 활성 (1 폐기 — S-001 정책 #1) | 3 | 3 | (해당 없음) | - | 0 | 1 (S-001) | ✓ |
| 메인 그리드 컬럼 (G-NNN) | 7 활성 (1 폐기 — G-005 정책 #1) | 7 | 7 | (해당 없음) | - | 0 | 1 (G-005) | ✓ |
| 확장 그리드 1 (GE1-NNN — 현재 역할) | 8 | 8 | 8 | (해당 없음) | - | 0 (PARENT_ROLE_ID SELECT 추가 결정 — 분석 §12) | 0 | ✓ |
| 좌측 보조 트리 (LT-NNN — 메뉴 구조) | 1 | 1 | 1 | (해당 없음) | - | 0 (LT 핸들러 As-Is 보존 결정 — 분석 §12) | 0 | ✓ |
| 확장 그리드 2 (GE2-NNN — 전체 역할) | 7 | 7 | 7 | (해당 없음) | - | 0 (PARENT_ROLE_ID SELECT 추가 결정 — 분석 §12) | 0 | ✓ |
| 상세 필드 (D-NNN) | 6 활성 (1 폐기 — D-002 정책 #1) | 6 | 6 | (해당 없음) | - | 0 (D-001 Service 흡수 / D-002 자동 해소 — 분석 §12) | 1 (D-002) | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 본 화면 버튼 (B-NNN) | 3 | 3 | 3 | (해당 없음) | - | 0 (셔틀 cssclass 의미 정정 결정 — 분석 §12) | 0 | ✓ |
| 외부 commonTopButton (EX-NNN) | 5 | 5 | 5 | (참조만 — trigger 매핑) | - | 0 | 0 | ✓ |
| 외부 commonLeftButton (EX2-NNN) | 3 | 3 | 3 | (해당 없음) | - | 0 | 0 | ✓ |
| 외부 commonRightButton (EX3-NNN) | 4 | 4 | 4 | (참조만) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 외부 화면 이동 (EX-005) | 1 | 1 | 1 | (해당 없음) | - | 0 | 0 | ✓ |
| 상태값 (ST-NNN) | 8 활성 (1 폐기 — ST-007 정책 #1) | 8 | (해당 없음) | (참조만) | - | 0 | 1 (ST-007) | ✓ |
| 코드값/LoV (LV-NNN) | 2 활성 (1 폐기 — LV-001 정책 #1) | (참조만) | (참조만) | (참조만) | - | 0 (selectAppHostId 외부 namespace 자동 폐기 — 분석 §12) | 1 (LV-001) | ✓ |
| Dataset (DS-NNN) | 4 활성 (1 폐기 — DS-005 정책 #1) | (참조만) | (참조만) | (참조만) | - | 0 | 1 (DS-005) | ✓ |
| BindItem (BI-NNN) | 6 활성 (1 폐기 — BI-007 정책 #1) | (참조만) | (참조만) | (해당 없음) | - | 0 | 1 (BI-007) | ✓ |
| Mapper.xml SQL ID | 10 (selectCommRoleGrp/Map/Role/MenuObjTree 의 컬럼 To-Be 변경) | 10 (§5.2 인용) | (해당 없음) | 10 (§6.4 sqlKey, lov 외부 namespace 폐기) | - | 0 (selectAppHostId 자동 폐기 + PARENT_ROLE_ID SELECT 추가 — 분석 §12) | 0 | ✓ |
| BPMN 노드 / SequenceFlow | 9 활성 노드 (Task_1erud76 폐기) / 13 활성 flow (SequenceFlow_0gdqjne + _0bmn2j8 폐기) | (해당 없음) | (해당 없음) | 9 / 13 (§2 전수) | - | 0 (process name="역할 그룹 관리" To-Be 정정 — 분석 §12) | 1 노드 + 2 flow | ✓ |
| Java UserTask 클래스 | 0 (해당 없음 — As-Is 부재) | (해당 없음) | (해당 없음) | 0 (§3 — "해당 없음" 보존) | - | 0 | 0 | ✓ |
| 사용 테이블 | 8 (TB_MCM_SEC_ROLEGROUP / ROLEGROUP_MAPPING / ROLE / ROLE_MAPPING / USER_MAPPING / MENU / MENU_FLD / OBJ — As-Is Mapper 등재 + DMES Excel 카탈로그 §9.9 196 컬럼 전수 + cactus-core audit 9 통일) | (참조만) | (해당 없음) | (참조만) | - | 0 (DMES csa 시트 정합 §9.9 확인 완료) | 0 | ✓ |

> **§A.2 결과**: 모든 행 합 일치 — 발견 = 반영 + 확인필요 + 제외.

### A.3 manifest 행 수 ↔ 산출물 행 수 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| Runner classify.trace.json items[] 카운트 ↔ 분석.template 행 수 | **✗ (검증 미실시)** | 사용자 결정 [§10] — Runner config mui 미지원 으로 manifest 9 파일 미생성. 본 §A.3 = ✗ + 사유 명시 |

> **§A 결과**: A.1 (2 행 ✗ + 사유) + A.2 ✓ + A.3 (✗ + 사유) — **사용자 결정에 의한 미적용 ✗ 는 설계 미완성으로 판정하지 않는다** ([§10] 환경 제약 명시 + §D.4 동일 사유). 따라서 §A = **✓ (환경 제약 명시 조건)**.

---

## §B. 명명 규칙 검증

### B.1 모듈 룰 결정 (선행 단계)

| 항목 | 값 | 결과 |
|---|---|---|
| moduleId | mcm | ✓ |
| 적용 명명 룰 | MES 단일 룰 | ✓ (mcm ≠ mpn → APS 예외 미적용) |

### B.2 식별자별 검증

| 항목 | 값 | 적용 룰 | 부속서 A 근거 | 검증 결과 |
|---|---|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | (전체 공통) | 사용자 결정 + 정본 (5 모듈 mpn/mpp/mls/mqc/mcm) | ✓ |
| moduleGroup | csa — 한글명 **"시스템관리"** | (전체 공통) | xfdl 폴더 `nxuiMui/csa/` + Mapper 폴더 `mappers-csa/` + bpmn 폴더 `services/csa/` 그대로 (사용자 결정 등재) | ✓ |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 역할 그룹 관리 (commRoleGrpMng) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commRoleGrpMng | MES: 단일 토큰 camelCase `{화면명}` (사용자 요구사항 — 모듈명·그룹명 토큰 ✗) | 01 A.3 + 메모리 reference_naming_standards | ✓ |
| pageName | commRoleGrpMng | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | commRoleGrpMng | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | commRoleGrpMng | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | commRoleGrpMng.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commRoleGrpMng | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | (해당 없음 — P-NNN 없음) | (전체 공통) | 01 A.4.7 | (N/A) |
| 필드/컬럼/버튼 ID | S-001~004 / G-001~008 / GE1-001~008 / GE2-001~007 / LT-001 / D-001~007 / B-001~003 / EX-001~005 / EX2-001~003 / EX3-001~004 / DS-001~005 / BI-001~007 / LV-001~003 / ST-001~009 / V-001~1005 / UX-001~008 / API-001~007 | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.value/text` / 그리드 cell `text=` 1byte 일치 | (전수 일치 — 분석 §3.2~§3.7) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `ROLE_GROUP_ID` / `ROLE_GROUP_NM` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum + 추가 4 (A-TITLE / A-FOLD / A-MAIN-CENTER / A-FOOTER) — 사용자 요구사항 [§10] 가이드 §외 신설 ✗ → 디자인설계서 §3.1 에 5 표준 + 4 추가 명시 | ✓ (A-FILTER / A-MAIN-TOP-LEFT (=A-GRID) / A-MAIN-TOP-RIGHT (=A-DETAIL) / A-MAIN-BOT-LEFT (=A-GRID-EXT1+A-TREE) / A-MAIN-BOT-RIGHT (=A-GRID-EXT2) / A-MAIN-CENTER (=A-SHUTTLE) / A-TITLE / A-FOLD / A-FOOTER = 9 영역) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — 본 화면은 TextBox 3 + ComboBox 3 + Radio 1 + Calendar 2 + Static 다수 (라벨) + Grid cell (checkbox/tree) | ✓ | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — varchar(90) / varchar(100) / int 등 cite | ✓ (분석 §9 + 기능 §4 + 디자인 §4) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commRoleGrpMng × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | commRoleGrpMng (§1) | commRoleGrpMng (§1.2) | commRoleGrpMng (frontmatter / §1.2) | commRoleGrpMng (process / serviceId) | commRoleGrpMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| pageName | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | ✓ |
| pageId | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | ✓ |
| serviceId | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (3 활성 + 1 폐기: ~~S-001 BIZ SYSTEM~~ / S-002 역할 그룹ID / S-003 역할 그룹명 / S-004 사용 여부) | §3.1 (3 활성) | §3.2 (3 활성) | (해당 없음) | (분석 §11 #16 / §11.0) | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 (7 활성 + 1 폐기 ~~G-005~~) | §3.2 (7 활성) | §4.1 (7 활성) | (참조만) | (분석 §9.1) | ✓ |
| 컬럼ID (GE1-NNN — 현재 역할) | §3.4 (8 행: GE1-001~GE1-008) | §3.2 (8 행 동일) | §4.2 (8 행 동일) | (참조만) | (분석 §9.2 + §9.3) | ✓ |
| 컬럼ID (LT-NNN — 메뉴 트리) | §3.5 (1 행: LT-001) | §3.2 (1 행 동일) | §4.3 (1 행 동일) | (참조만) | (분석 §9.6) | ✓ |
| 컬럼ID (GE2-NNN — 전체 역할) | §3.6 (7 행: GE2-001~GE2-007) | §3.2 (7 행 동일) | §4.4 (7 행 동일) | (참조만) | (분석 §9.3) | ✓ |
| 필드ID (D-NNN 상세) | §3.7 (6 활성 + 1 폐기 ~~D-002 BIZ SYSTEM~~) | §4.1 (6 활성) | §3.4 (6 활성) | (참조만) | (분석 §9.1 / §11 #16) | ✓ |
| BindItem (BI-NNN) | §3.9 (6 활성 + 1 폐기 ~~BI-007~~) | (참조만) | (참조만) | (참조만) | (To-Be 정책 #1) | ✓ |
| Dataset (DS-NNN) | §3.8 (4 활성 + 1 폐기 ~~DS-005 ds_lovSubSystem~~) | (참조만) | (참조만) | §5 DTO 매핑 | (To-Be 정책 #1) | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (3 행: B-001~B-003) | §5.1 (3 행 동일) | §5.1 (3 행 동일) | (참조만 — §1.1 API 트리거 매핑) | - | ✓ |
| 외부 버튼 (EX-NNN / EX2-NNN / EX3-NNN) | §4.2~§4.4 (5 + 3 + 4 = 12 행) | §5.1-1~§5.1-3 (12 행 동일) | §5.2~§5.4 (12 행 동일) | (참조만) | - | ✓ |
| 팝업ID (P-NNN 전수) | §5 (해당 없음) | §9 (해당 없음 + EX-005 외부 화면 1) | §6 (해당 없음 + EX-005 1) | (해당 없음) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | §9.1 (ROLEGROUP 본 컬럼 7 + cactus-core audit 9 = 16) / §9.2 (ROLEGROUP_MAPPING 본 컬럼 2 + cactus-core 9 = 11) / §9.3 (ROLE 본 컬럼 7 + cactus-core 9 = 16) / §9.4 (ROLE_MAPPING 본 컬럼 2 + cactus-core 9 = 11) / §9.5 (USER_MAPPING 본 컬럼 2 + cactus-core 9 = 11) / §9.6 (MENU 본 컬럼 9 + cactus-core 9 = 18) / §9.7 (MENU_FLD 본 컬럼 6 + cactus-core 9 = 15) / §9.8 (OBJ 본 컬럼 1 + cactus-core 9 = 10) | §3.1 / §3.2 / §4.1 (G + GE + D 인용) | §4 (Grid 컬럼 인용) + §3.4 (Detail 인용) | §5 (DTO 매핑) | §11 변환점 (As-Is `TB_MCM_SEC_*` → To-Be `MCMAPUSER.TB_MCM_SEC_*` 보존 — 사용자 결정) | ✓ |
| 상태코드 (statusCodes) | §10.1 (8 활성 + 1 폐기 ~~ST-007~~) | §7 (8 활성) | §4.5 UX-NNN + §7.2 색상 강조 | (참조만 — saveCmRoleGrp status 분기) | - | ✓ |
| action 목록 | §1 (**6 enum**: searchCmRoleGrp / saveCmRoleGrp / searchCmRoleGrpMap / saveCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu — lov 폐기) | §5.2 (6 동일) | (참조만) | §1.1 (6 API + 6 action) + §2.2~§2.7 (6 흐름, §2.1 lov 폐기) | §6.2 BPMN 기능 식별자 안 | ✓ |
| Mapper.xml SQL ID | §6 (10 SQL 전수 — selectAppHostId 외부 namespace 호출 To-Be 폐기 / PARENT_ROLE_ID SELECT 추가 / BIZ_SYSTEM_CODE 컬럼 폐기) | §5.2 (action → SQL 매핑) | (참조만) | §1.1 (sqlKey) + §6.4 (To-Be 명명 안 — lov 외부 namespace 폐기) | §11 변환점 + §11.0 Q 해소표 | ✓ |
| BPMN 노드 / SequenceFlow | §8 (As-Is 10 노드 + 15 flow → **To-Be 9 활성 노드 + 13 활성 flow**, Task_1erud76 / SequenceFlow_0gdqjne / _0bmn2j8 폐기) | (참조만) | (해당 없음) | §2 (6 action 흐름) + §6.3 (To-Be 명명 안) | §6.1 process name "역할 그룹 관리" 정정 | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | ✓ |
| asIsId | CommRoleGrpMng | CommRoleGrpMng | CommRoleGrpMng | CommRoleGrpMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | commRoleGrpMng | ✓ |
| S-NNN 수 (활성/As-Is) | 3 / 4 | 3 / 4 | 3 / 4 | (해당 없음) | ✓ |
| G-NNN 수 (활성/As-Is) | 7 / 8 | 7 / 8 | 7 / 8 | (해당 없음) | ✓ |
| GE1-NNN 수 | 8 | 8 | 8 | (해당 없음) | ✓ |
| GE2-NNN 수 | 7 | 7 | 7 | (해당 없음) | ✓ |
| LT-NNN 수 | 1 | 1 | 1 | (해당 없음) | ✓ |
| D-NNN 수 (활성/As-Is) | 6 / 7 | 6 / 7 | 6 / 7 | (해당 없음) | ✓ |
| B-NNN 수 | 3 | 3 | 3 | (참조만) | ✓ |
| EX-NNN 수 (TopButton) | 5 | 5 | 5 | (참조만) | ✓ |
| EX2-NNN 수 (LeftButton) | 3 | 3 | 3 | (해당 없음) | ✓ |
| EX3-NNN 수 (RightButton) | 4 | 4 | 4 | (참조만) | ✓ |
| P-NNN 수 | 0 (해당 없음) | 0 (해당 없음) | 0 (해당 없음) | (해당 없음) | ✓ |
| ST-NNN 수 (활성/As-Is) | 8 / 9 | 8 / 9 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 (활성/As-Is) | 2 / 3 | (참조만) | (참조만) | (참조만) | ✓ |
| DS-NNN 수 (활성/As-Is) | 4 / 5 | (참조만) | (참조만) | (참조만) | ✓ |
| BI-NNN 수 (활성/As-Is) | 6 / 7 | (참조만) | (참조만) | (참조만) | ✓ |
| BPMN action 수 | **6** (lov 폐기) | 6 | (참조만) | 6 (§2.2~§2.7) | ✓ |
| Mapper SQL 수 | 10 (To-Be SQL 본문 변경 — BIZ_SYSTEM_CODE 컬럼 폐기 / PARENT_ROLE_ID SELECT 추가) | 10 | (참조만) | 10 (§6.4 — lov 외부 mapper 폐기) | ✓ |
| BPMN 노드 수 | **9 활성** (As-Is 10 → Task_1erud76 폐기) | (참조만) | (참조만) | 9 (§2 + §6.3) | ✓ |
| BPMN sequenceFlow 수 | **13 활성** (As-Is 15 → SequenceFlow_0gdqjne + _0bmn2j8 폐기) | (참조만) | (참조만) | 13 (§2 흐름) | ✓ |
| Java UserTask 수 | 0 (해당 없음) | (해당 없음) | (해당 없음) | 0 (§3 해당 없음) | ✓ |
| xfdl Script 메서드 수 | 32 (활성 31 + 주석 1) | (참조만 — V-001~V-1005 검증 룰) | (참조만) | (참조만) | ✓ |

### D.2 BPMN 기능 식별자 = `{screenId}_{기능명}` (사용자 요구사항 [명명 규칙 정본])

| As-Is sequenceFlow name | To-Be 기능 식별자 | 검증 |
|---|---|---|
| ~~lov~~ | **To-Be 폐기** (정책 #1 — selectAppHostId 외부 namespace + action 7→6 enum 자동 정합, 분석 §12) | ✓ |
| searchCmRoleGrp | commRoleGrpMng_searchCmRoleGrp | ✓ |
| saveCmRoleGrp | commRoleGrpMng_saveCmRoleGrp | ✓ |
| searchCmRoleGrpMap | commRoleGrpMng_searchCmRoleGrpMap | ✓ |
| saveCmRoleGrpMap | commRoleGrpMng_saveCmRoleGrpMap | ✓ |
| searchCmRole | commRoleGrpMng_searchCmRole | ✓ |
| searchCmRoleGrpMenu (As-Is name 끝에 줄바꿈 `&#10;` — To-Be 정정) | commRoleGrpMng_searchCmRoleGrpMenu | ✓ |

### D.3 테이블 명명 = `TB_{모듈명}_{역할}` (사용자 요구사항 [명명 규칙 정본])

| As-Is | To-Be 명명 안 |
|---|---|
| TB_MCM_SEC_ROLEGROUP | MCMAPUSER.TB_MCM_SEC_ROLEGROUP (사용자 결정 — As-Is 보존) |
| TB_MCM_SEC_ROLEGROUP_MAPPING | MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING |
| TB_MCM_SEC_ROLE | MCMAPUSER.TB_MCM_SEC_ROLE |
| TB_MCM_SEC_ROLE_MAPPING | MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING |
| TB_MCM_SEC_USER_MAPPING | MCMAPUSER.TB_MCM_SEC_USER_MAPPING |
| TB_MCM_SEC_MENU | MCMAPUSER.TB_MCM_SEC_MENU |
| TB_MCM_SEC_MENU_FLD | MCMAPUSER.TB_MCM_SEC_MENU_FLD |
| TB_MCM_SEC_OBJ | MCMAPUSER.TB_MCM_SEC_OBJ |

> 사용자 결정: `MCMAPUSER` 스키마 + `TB_MCM_SEC_*` 대문자 prefix As-Is 보존 (cma 4 화면 정책 동일).

### D.4 manifest 9 파일 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| manifest.lock.json hash 검증 | **✗** | Runner config mui 미지원 — 사용자 결정으로 생략 |
| index.json | **✗** | (동일) |
| discover.trace.json | **✗** | (동일) |
| classify.trace.json | **✗** | (동일) |
| fallback.trace.json | **✗** | (동일) |
| q-stable-key.json | **✗** | (동일) |
| conflict-report.json (미존재 확인) | **✗** | (동일) |
| verify-report.json (pass=true 확인) | **✗** | (동일) |
| error.log (ERROR/FATAL 0 확인) | **✗** | (동일) |

> **§D.4 결과**: 9 파일 모두 ✗ + 사유 명시. 사용자 결정 [§10] — Runner config mui 미지원 으로 생략. **본 ✗ 는 설계 미완성으로 판정하지 않는다** (사용자 결정 사항).

### D.5 BPMN sequenceFlow id 표기 (As-Is 보존)

| As-Is sequenceFlow id | 보존 여부 | 결과 |
|---|---|---|
| ~~SequenceFlow_0gdqjne (lov)~~ | **To-Be 폐기** (정책 #1 — 분석 §12) | ✓ |
| SequenceFlow_0tt1mbk (searchCmRoleGrp) | ✓ | ✓ |
| SequenceFlow_0grwghu (saveCmRoleGrp) | ✓ | ✓ |
| SequenceFlow_11y43nf (searchCmRoleGrpMap) | ✓ | ✓ |
| SequenceFlow_109h9q1 (saveCmRoleGrpMap) | ✓ | ✓ |
| SequenceFlow_13bmd6q (searchCmRole) | ✓ | ✓ |
| SequenceFlow_0oowkcm (searchCmRoleGrpMenu — name 끝 `&#10;` 줄바꿈은 To-Be 정정 제거) | ✓ (정정) | ✓ |
| SequenceFlow_1 / 1vkp3qd / 105vwsz / 1tgyodp / 11vs9ef / 0p8l9xo / 1qe8l6w (7 활성 nameless flow) / ~~0bmn2j8~~ (Task_1erud76 → End — To-Be 폐기) | ✓ As-Is 보존 / 1 폐기 | ✓ |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ (스키마 As-Is 보존 결정) + D.4 ✗ + 사유 명시 (사용자 결정) + D.5 ✓ — **사용자 결정 사유에 따른 D.4 ✗ 는 설계 미완성으로 판정하지 않는다** → §D = **✓ (환경 제약 명시 조건)**.

---

## §E. As-Is 누락 0 점검 (사용자 요구사항 [§3, §4])

### E.1 xfdl 컴포넌트 전수

| xfdl 컴포넌트 종류 | 분석 §3 등재 수 | 검증 방법 | 결과 |
|---|---:|---|---|
| Form / Layout / Div (컨테이너) | A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-TOP-LEFT / A-MAIN-TOP-RIGHT / A-MAIN-BOT-LEFT / A-MAIN-CENTER / A-MAIN-BOT-RIGHT / A-FOOTER + div_topMenu / div_leftMenu (mainGrd) / div_rightMenu (mainGrd) / div_rightMenu (subGrd2) / div_detail (mainDetail) = 15 (분석 §3.1 + §3.3 + §3.4 등) | xfdl Div / Layout / Form 전수 grep | ✓ |
| Static (라벨) | stc_bizSystemCode / sts_roleGroupId / sts_roleGroupNm / sts_useTp / Static00 (FX-001 카테고리 — D 영역 별도 — N/A 본 화면) / edt_st_* 7 (Detail 라벨) / stc_Static1~12 7 (Detail 배경) = 18 (Detail 라벨 7 + Detail 배경 7 + S 라벨 4) | xfdl `<Static ...>` + `<Edit ... cssclass="edi_WF_*Label*" ...>` 전수 grep | ✓ |
| Edit (TextBox / Title 라벨) | edt_title / edt_ROLE_GROUP_ID / edt_ROLE_GROUP_NM / edt_role_group_id / edt_role_group_nm / edt_role_group_desc / edt_rol_grp_list / edt_roleMapList / edt_auth_list / edt_auth_list2 / edt_rolefilter / 7 Detail 라벨 Edit = 18 | xfdl `<Edit ...>` 전수 grep | ✓ |
| Grid | grd_main (G-001~G-008) / grd_sub1 (GE1-001~GE1-008) / grd_M0F1 (LT-001) / grd_sub2 (GE2-001~GE2-007) = 4 그리드 + 24 컬럼 | xfdl `<Grid ...>` 전수 grep | ✓ |
| Button | btn_fold / btn_right (B-002) / btn_left (B-003) = 3 (§4.1) | xfdl `<Button ...>` 전수 grep | ✓ |
| Combo | cbo_bizSystemCode (S-001) / cbo_USE_TP (S-004) / cbo_subSystemCode (D-002) = 3 | xfdl `<Combo ...>` 전수 grep | ✓ |
| Calendar | cal_start_active_date (D-006) / cal_end_active_date (D-007) = 2 | xfdl `<Calendar ...>` 전수 grep | ✓ |
| Radio | edt_use_tp (D-005) = 1 | xfdl `<Radio ...>` 전수 grep | ✓ |
| Dataset | ds_role / ds_main / ds_roleGrpMap / ds_menuTreeList / ds_lovSubSystem = 5 (§3.8) | xfdl `<Dataset ...>` 전수 grep | ✓ |
| BindItem | item0/5/6/7/8/9/1 = 7 (§3.9) | xfdl `<BindItem ...>` 전수 grep | ✓ |
| Script function | 32 메서드 (§4.6) — 활성 31 + 주석 1 (`div_main_div_subGrd1_grd_sub1_onkeydown`) | xfdl Script `this.X = function` 전수 grep | ✓ |
| 그리드 columns 전수 | G 8 + GE1 8 + LT 1 + GE2 7 = 24 컬럼 (§3.3 / §3.4 / §3.5 / §3.6) | xfdl `<Cell ...>` 전수 grep | ✓ |

### E.2 Java 메서드 전수

| 클래스 | 메서드 수 | 분석 §7 등재 | 결과 |
|---|---:|---|---|
| (Java UserTask 부재 — 해당 없음) | 0 | §7 "해당 없음" + 사유 명시 (디렉토리 ls 직접 확인) | ✓ |

### E.3 Mapper.xml SQL ID 전수

| SQL ID | 분석 §6 등재 | 결과 |
|---|---|---|
| selectCommRoleGrp | ✓ #1 | ✓ |
| insertCommRoleGrp | ✓ #2 | ✓ |
| updateCommRoleGrp | ✓ #3 | ✓ |
| deleteCommRoleGrp | ✓ #4 | ✓ |
| selectCommRoleGrpMap | ✓ #5 | ✓ |
| insertCommRoleGrpMap | ✓ #6 | ✓ |
| updateCommRoleGrpMap | ✓ #7 (더미 DUAL) | ✓ |
| deleteCommRoleGrpMap | ✓ #8 | ✓ |
| selectCommRole | ✓ #9 | ✓ |
| selectMenuObjTree | ✓ #10 | ✓ |
| ~~CommObjMngMapper.selectAppHostId~~ | **To-Be 폐기** (정책 #1 — BIZ SYSTEM 콤보 폐기로 외부 namespace 호출 자동 제거, 분석 §12) | ✓ |

> 10 SQL 전수 등재 + 외부 namespace 인용 1 건 (To-Be 폐기 결정 — 분석 §12) 명시.

### E.4 BPMN flow 전수

| BPMN 요소 | 분석 §8 등재 수 (As-Is / **To-Be 활성**) | 결과 |
|---|---:|---|
| startEvent | 1 / 1 (StartEvent_1) | ✓ |
| endEvent | 1 / 1 (EndEvent_1) | ✓ |
| exclusiveGateway | 1 / 1 (ExclusiveGateway_1, **6 outgoing** — lov 폐기) | ✓ |
| task (CommonSelectTask + CommonMultiSaveTask) | 7 / **6** (Task_1erud76 폐기) | ✓ |
| userTask | 0 / 0 | ✓ |
| sequenceFlow | 15 / **13** (6 action 분기 + 7 task → end, lov flow + Task_1erud76→End 폐기) | ✓ |

### E.5 결함 처리 (사용자 요구사항 [§4])

| 결함 ID | 위치 | 처리 |
|---|---|---|
| 결함 #1: LT 그리드 oncellclick / onmousemove 핸들러 Script 본문 미정의 | xfdl:94 | As-Is 보존 + To-Be 신규 핸들러 정의 ✗ (분석 §12 결정 누적표 — As-Is 동작 ✗ 유지) |
| 결함 #2: D-001 ROLE_GROUP_ID canchange 핸들러 본문 미정의 | xfdl:238 | As-Is 보존 + To-Be Service 레이어 PK 중복 검증 흡수 (분석 §11.1 #15) |
| 결함 #3: D-002 BIZ SYSTEM onitemchanged 핸들러 본문 미정의 | xfdl:263 | As-Is 보존 + To-Be 정책 #1 으로 D-002 콤보 자체 폐기 (분석 §11.1 #16) |
| 결함 #4: selectAppHostId — 본 화면 namespace 가 아닌 `CommObjMngMapper` 외부 namespace 인용 | bpmn:140 | As-Is 보존 + To-Be 정책 #1 으로 lov action / BIZ SYSTEM 콤보 폐기로 외부 호출 자체 제거 (분석 §11.1 #16) |
| 결함 #5: 셔틀 cssclass 와 동작 의도 반대 — `btn_right` (cssclass=ShuttleAddH) ↔ `fn_removeRoleMapRow` (제외) / `btn_left` (cssclass=ShuttleDeleteH) ↔ `fn_appendRoleMapRow` (추가) | xfdl:119~120 vs 773~788 | As-Is 보존 (분석) + **To-Be 정정 결정** — cssclass 의미와 동작 일치 (분석 §11.1 #17) |
| 결함 #6: GE1 onkeydown 본문 전체 주석 (Ctrl+C 의 grdCopy_Paste 미활성) | xfdl:812~817 | As-Is 보존 + To-Be 활성화 ✗ (분석 §12 결정 누적표) |
| 결함 #7: BPMN action 7 (lov 포함) vs 사용자 사전 명시 "6 enum" 불일치 | 사용자 사전 ↔ As-Is | 정책 #1 으로 lov 폐기 → To-Be action **6 enum** 일치 (분석 §12 결정 누적표) |
| 결함 #8: selectCommRoleGrpMap / selectCommRole SELECT 절에 PARENT_ROLE_ID 누락 (GE1-004 / GE2-004 binding 미표시 가능성) | xml:85~98 / 128~143 | As-Is 보존 (분석) + **To-Be SELECT 절 추가 정정** (분석 §6 #5/#9 / §9.3 #7) |
| 결함 #9: BPMN process name `"부모역할 부여 조회"` — 본 화면 업무와 불일치 (As-Is 부정확) | bpmn:3 | As-Is 보존 (분석) + **To-Be `name="역할 그룹 관리"` 정정** (분석 §11.1) |
| 결함 #10: `commonDynamic_onload` 본문 전체 주석 처리 (xfdl 라이프사이클 hook 미사용) | xfdl:390~405 | As-Is 보존 + To-Be 신기능 추가 ✗ (분석 §12 결정 누적표 — 주석 보존) |
| 결함 #11: `ds_main_onrowposchanged` 의 `e.reason != 52` 분기 의도 명세 부재 (Nexacro auto rowposition reason 코드) | xfdl:757 | As-Is 보존 + To-Be React state 자연 흡수 — useEffect dependency 로 rowposition 변경 시점에만 chain 호출 (분석 §4.6 #20) |
| 결함 #12: updateCommRoleGrpMap 의 더미 `SELECT 'X' FROM DUAL` (실 UPDATE ✗) | xml:113~116 | As-Is 보존 (CommonMultiSaveTask 의 updateSqlKey 요구로 정의 보존) — 실 동작 ✗ |
| 결함 #13: deleteCommRoleGrpMap 의 NOT EXISTS 검증 코드 주석 처리 | xml:122~125 | As-Is 보존 — 주석 보존 |
| 결함 #14: BPMN searchCmRoleGrpMenu sequenceFlow name 끝 줄바꿈 `&#10;` | bpmn:130 | As-Is 보존 + To-Be 정정 결정 (줄바꿈 제거) — BPMN §6.2 명시 |
| 결함 #15: 셔틀 div_buttonGrp 의 ondragmove / ondrop (xfdl:50 div_subGrd1) — Script 본문 핸들러 미정의 | xfdl:50 / Script 본문 미발견 | As-Is 보존 — drag-and-drop 기능 활성화 ✗ |
| 결함 #16: DMES Excel csa 영역 시트 정합 | docs/external/DMES/DMES-SECTION-MCM_테이블정의서.xlsx | §9.9 8 시트 196 컬럼 전수 카탈로그 추출 완료 (분석 §9.9) |

> **§E 결과**: xfdl 모든 컴포넌트 전수 + Java 부재 사유 + Mapper.xml 10 SQL + BPMN 15 flow + 결함 16 건 모두 As-Is 1:1 보존 + 분석 §12 결정 누적표 (15 행) 본문 직접 반영 — 누락 0 + 임의 정정 0.

---

## §F. To-Be 변환점 (Oracle → MSSQL) — 분석 §11 영향 SQL 정합

| 변환 항목 | 영향 SQL ID | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 검증 |
|---|---|---|---|---|---|
| `ROWNUM = 1` → MSSQL `TOP 1` | selectCommRoleGrp (xml:17 scalar subquery) | (참조만) | (해당 없음) | §2.2 (xml:17 cite) | ✓ |
| `\|\|` 문자열 결합 → `+` 또는 CONCAT | selectCommRoleGrp (xml:22 / 25) | (참조만) | (해당 없음) | §2.2 (xml:22 / 25 cite) | ✓ |
| UPPER(...) — MSSQL 동일 | selectCommRoleGrp | (참조만) | (해당 없음) | §2.2 (xml:22 / 25) | ✓ |
| NOT EXISTS correlated subquery — MSSQL 동일 | deleteCommRoleGrp / selectCommRole | (참조만) | (해당 없음) | §2.3 / §2.6 | ✓ |
| `ref_Audit` fragment 폐기 — cactus-core `CactusAuditEntity` 9 컬럼 자동 | 모든 INSERT/UPDATE SQL (5 회 — insertCommRoleGrp xml:46/56 / updateCommRoleGrp xml:68 / insertCommRoleGrpMap xml:104/109) | (참조만) | (해당 없음) | Entity 레이어 자동 | ✓ |
| CTE `WITH MROLE AS / MENU AS / MENU1 AS` — MSSQL 동일 지원 | selectMenuObjTree | (참조만) | (해당 없음) | §2.7 | ✓ |
| `START WITH ... CONNECT BY PRIOR` → MSSQL `WITH RECURSIVE` | selectMenuObjTree (xml:213~214, 229) | (참조만) | (해당 없음) | §2.7 — **재귀 패턴 재작성 필요** | ✓ |
| `CONNECT_BY_ISLEAF` → MSSQL 재귀 CTE 의 `NOT EXISTS (child)` 또는 클라이언트 처리 | selectMenuObjTree (xml:223) | (참조만) | (해당 없음) | §2.7 | ✓ |
| `SYS_CONNECT_BY_PATH` → MSSQL 재귀 CTE 누적 컬럼 | selectMenuObjTree (xml:224, 230) | (참조만) | (해당 없음) | §2.7 | ✓ |
| `TO_CHAR(MENU_SEQ, '00000000')` → MSSQL `FORMAT` 또는 `RIGHT('00000000' + CAST AS VARCHAR), 8)` | selectMenuObjTree | (참조만) | (해당 없음) | §2.7 | ✓ |
| outer-join `(+)` → MSSQL `LEFT JOIN ... ON ...` | selectMenuObjTree (xml:242) | (참조만) | (해당 없음) | §2.7 (xml:242 cite) | ✓ |
| implicit JOIN (콤마 카테시안) → MSSQL `INNER JOIN ... ON ...` 권장 | selectCommRoleGrpMap (xml:93~95) / selectMenuObjTree (xml:158~162) | (참조만) | (해당 없음) | §2.4 / §2.7 | ✓ |
| `ROWNUM` 의사컬럼 → MSSQL `ROW_NUMBER() OVER (...)` 또는 OFFSET/FETCH | selectCommRoleGrp (xml:17) / selectMenuObjTree (xml:237) | (참조만) | (해당 없음) | §2.2 / §2.7 | ✓ |
| `DUAL` 가상 테이블 → MSSQL `SELECT 'X'` (FROM 절 없음) | updateCommRoleGrpMap (xml:114~115) | (참조만) | (해당 없음) | §2.5 | ✓ |

> **§F 결과**: 14 변환점 모두 분석리포트 §11 인용 + 영향 SQL 1:1 매핑 — 14 행 ✓.

---

## §G. 확인필요 항목 집계 — 결정 완료

> 분석 단계 식별 항목 사용자 결정 완료 — **활성 확인필요 = 0 건**. 결정 누적 표는 분석리포트 §12 참조 (15 행). 본문 반영 위치: 분석 §3 (LT 핸들러 As-Is 보존 / D-001 Service 흡수 / BIZ SYSTEM UI 폐기) / §4.1 + §11.1 #17 (셔틀 cssclass 정정) / §4.6 #2/#20/#26 (commonDynamic_onload / e.reason / GE1 onkeydown As-Is 보존) / §6 #5/#9 + §9.3 #7 (PARENT_ROLE_ID SELECT 추가) / §6 + §8 + §11.1 #16 (lov / Task_1erud76 / SequenceFlow_0gdqjne+_0bmn2j8 / 외부 namespace selectAppHostId 일괄 폐기 → BPMN action 6 enum 정합) / §9 + §11.1 #5 (cactus-core `McmAuditEntity` 9 컬럼 통일) / §11.1 (스키마 `MCMAPUSER.TB_MCM_SEC_*` 보존 + Entity 명명 `SecRoleGroup*` 모듈 직속 평탄 + BPMN process name "역할 그룹 관리" 정정).
>
> **2026-05-31 갱신**: 정책 #1 (BIZ SYSTEM 콤보 제거) / Service PK 중복 검증 흡수 / As-Is 동작 ✗ 보존 / To-Be 정정 / React state 자연 흡수 5 카테고리로 일괄 처리.

---

## §H. 환경 제약 명시 종합 (사용자 요구사항 [§10] / [§13])

| # | 환경 제약 | 영향 절 | 처리 |
|---|---|---|---|
| 1 | Runner / R14-Step0 / manifest 9 파일 검증 미적용 | §A.1 (A-R12-1, A-R12-4) + §A.3 + §D.4 | ✗ + 사유 명시 ("Runner config mui 미지원 — 사용자 결정으로 생략") |
| 2 | 가이드 템플릿 WinForms 전제 항목은 mui 등가물로 매핑 | 분석리포트 §0 + 본 §A.1 (A-T1A / A-R12-3 / A-R12-5) | mui 등가 매핑 (designer.cs → xfdl Layout / cs Click+= → xfdl onclick / sp.sql @Case → BPMN sequenceFlow name 분기 / Mapper.xml inline SQL — 본 화면 Java UserTask 부재) |
| 3 | As-Is = Oracle (ROWNUM/`\|\|`/UPPER/NOT EXISTS/`(+)`/CTE/CONNECT BY/SYS_CONNECT_BY_PATH/TO_CHAR mask/ROWNUM/DUAL) → To-Be = MSSQL `sample_dmes` `MCMAPUSER` 스키마 (As-Is 테이블명 보존) + cactus-core `CactusAuditEntity` audit 자동 적용 | §F + 분석 §11 | 14 변환점 명시 — 모든 결정 사항 본문 반영 |
| 4 | Java UserTask 자산 부재 — As-Is 1:1 보존 정책으로 BPMN 의 commonDbTask 만 To-Be 매핑 (별도 Service Java 클래스 신규 작성 ✗) | 분석 §0 / §2 / §7 + 기능 §5.2 / BPMN §3 | "해당 없음" + 사유 명시 + 디렉토리 ls 직접 확인 결과 |
| 5 | 외부 화면 이동 1 건 (EX-005 "사용자 관리" → CommObjMng 메뉴 ID `csa/csa::CommObjMng`) — modal 팝업 ✗ | 분석 §5 + 기능 §9 + 디자인 §6 | "해당 없음" (P-NNN) + 외부 화면 이동 별도 명시 |

> 모든 환경 제약 명시 + 정합체크서 §A / §D 의 ✗ 사유가 사용자 결정에 의한 미적용임을 명시 — 본 ✗ 는 **설계 미완성으로 판정하지 않는다**.

---

## §I. 정합체크 종합 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A 구조 동일성 + 누락 | ✓ (환경 제약 명시 조건) | A.1 2 행 ✗ + A.3 ✗ — 모두 사용자 결정 [§10] 사유 |
| §B 명명 규칙 | ✓ | 모든 행 ✓, MES 단일 토큰 룰 적용 |
| §C 5축 정합 | ✓ | 22 일치 키 모두 ✓ |
| §D 반복 결정성 | ✓ (환경 제약 명시 조건) | D.4 9 파일 ✗ — 사용자 결정 [§10] 사유 |
| §E As-Is 누락 0 | ✓ | xfdl 전수 + Java 부재 사유 + Mapper 10 SQL + BPMN 15 flow + 결함 14 건 모두 As-Is 1:1 보존 |
| §F To-Be 변환점 | ✓ | 14 변환점 모두 cite |
| §G 확인필요 항목 추적 | (추적용) | **활성 0 건** — 분석리포트 §12 결정 누적표 15 행 본문 직접 반영 |
| §H 환경 제약 명시 | ✓ | 5 환경 제약 모두 사유 등재 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §J 사용자 검수 이력 | (추적용) | 2026-06-02 Round 2/3/5 + 2026-06-04 W5 + **2026-06-04~05 Round 6 (N/A) + Round 7 (btn_close 폐기)** — J-001~J-010 10 항목 본문/코드 동시 갱신 + 신규 Q ✗ |
| §K 라운드 카탈로그 | (추적용) | Round 1~7 일자 / 영향 §·D-NNN·G-NNN·B-NNN / 확정 시각 ✓ — 본 화면 라운드 변경 매트릭스 |

> **설계 완성 판정**: §A ~ §F 6 개 절 모두 ✓ (환경 제약 ✗ 는 사용자 결정 사유 등재로 우회) → **설계 완성**.

---

## §J. 사용자 검수 결과 반영 이력 (2026-06-02 ~ 2026-06-04)

> 본 절은 ToBe 코드 구현 후 사용자 검수에서 발견된 결함을 본문 갱신과 함께 추적한다. 메모리 `feedback_q_resolution_propagation.md` 정합 — 단순 "해소됨" 표시 ✗, 본문 §§ 갱신 + 코드 수정 + 정합체크 등재 동시 진행. commUserMng §J 패턴 정합 (J-001~J-013).

### J.1 Round 2 — AsIs 1:1 재개발 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 (인용) | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-001 | 디자인 §1.2 / §2 — 레이아웃 | iter#1 의 ToBe 레이아웃이 AsIs xfdl 와 완전 불일치 (단순 1 패널 구성 등) | "AsIs/ToBe 레이아웃 완전 불일치. AsIs 1:1 재개발 하라" (2026-06-02) | 디자인 §1.2 / §1.2.1 / §1.2.2 / §3.4.1 / §3.4.3 신규 신설. **4분할 (Row1 메인+Detail / Row2 메뉴트리+sub1+셔틀+sub2)** 채택 | page.tsx round-2 commit — `<ContentBody root>` + column stacker + Row1 (flex:1) + Row2 (flex:1) 도입 |
| J-002 | 디자인 §4.5 UX — chain 호출 | iter#1 단일 호출 → AsIs xfdl:753~770 `ds_main_onrowposchanged` 의 3 회 fn_run 미반영 | (Round 2 AsIs 분석 결과) | 디자인 §4.5 UX-010 / §4.5.1 — **3-chain auto load** (searchCmRoleGrpMap + searchCmRole + searchCmRoleGrpMenu) | page.tsx — `loadSubGrids` 내부 `Promise.all([rm, rl, mn])` |
| J-003 | 디자인 §3.5 — 트리 도입 | AsIs grd_M0F1 메뉴 트리 미반영 | (Round 2 AsIs 분석 결과) | shared `<Tree>` 도입 명시 | page.tsx round-2 — Tree import + 메뉴트리 panel |

### J.2 Round 3 — 메뉴 구조 트리 영역 제거 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 (인용) | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-004 | 디자인 §1.2 / §3.5 — 메뉴 트리 | Round 2 에서 4분할로 메뉴 트리 추가했으나 ToBe 에서 불필요 판단 | "메뉴 구조 트리 영역 제거" (2026-06-02) | §1.2 박스 그림 4분할 → **3분할** (sub1 + 셔틀 + sub2). §3.5 → §3.5.1 (ToBe BOT-LEFT 구성) + §3.5.2 (As-Is 보존만) 분리 | page.tsx — Tree import 제거, BOT-LEFT 의 메뉴트리 panel 삭제, sub1 단독 배치 |
| J-005 | 디자인 §4.5 UX — chain 단순화 | Round 2 의 3-chain 중 `searchCmRoleGrpMenu` 가 메뉴트리 폐기로 불필요 | (Round 3 정합) | §4.5.1 — **3-chain → 2-chain** (searchCmRoleGrpMap + searchCmRole 만). `searchCmRoleGrpMenu` 호출은 FE 제거 / BE action 본체는 보존 명시 | page.tsx — `Promise.all([rm, rl])` 2 항목, `apiSearchCmRoleGrpMenu` import 제거 |
| J-006 | 디자인 §4.3 LT-001 | LT 메뉴 트리 ToBe 미구현 | (Round 3 정합) | §3.5 / §4.3 본문에 "ToBe 미구현" 명시 (As-Is 보존표만 유지) | (해당 없음) |

### J.3 Round 5 — ROLE_GROUP_ID readOnly inserted 만 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 (인용) | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-007 | 디자인 §3.4 D-001 readOnly 정책 | iter#1/#2/#3 의 D-001 ROLE_GROUP_ID 가 모든 행에서 편집 가능 → 기존 행 PK 변조 위험 | "ROLE_GROUP_ID 는 신규 행만 편집 가능하게" (2026-06-02) | §3.4.1 (`readOnly 정책` 컬럼 신설) + §3.4.2 신규 sub-section (PK guard 식 명시) + §4.5 UX-011 / UX-012 추가 | page.tsx 804: `readOnly={selected.nativeeditor_status !== "inserted"}` / `updateDetailField` 내부 `if (fieldName === "ROLE_GROUP_ID" && r.nativeeditor_status !== "inserted") return;` 가드 |
| J-008 | 디자인 §5 — 신규 행 PK 초기화 | 신규 행 추가 시 PK 자동 채움이 있으면 사용자 입력 강제 ✗ | (Round 5 정합) | §4.5 UX-012 — `handleRowAdd` 시 `ROLE_GROUP_ID: ""` 강제 초기화 명시 | page.tsx 463: `ROLE_GROUP_ID: "", // PK 사용자 입력 강제` |

### J.4 W5 A~G 패턴 동기화 (2026-06-04)

| # | 발견 영역 | 결함 | 사용자 지시 (인용) | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-009 | 디자인 §8 W5 패턴 종합 | csa 8 화면 표준 W5 A~G 패턴을 본 화면 본문에 직접 등재 누락 | "csa 7 + cme 1 화면 iter 정합 정책 일괄 적용" (`project_csa_cme_iter_propagation.md`) | 디자인설계서 §8 신규 신설 (W5 A~G 7 행 + Round 별 변경 일자 표). §1.2 / §3.4 / §4.5 / §5.2 의 sub-section 정본 위치 인덱스 명시 | (해당 없음 — 본문 직접 등재만, 코드는 이미 W5 패턴 적용 완료) |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### J.5 Round 6 — PK readOnly inserted-only (2026-06-04~05) — 본 화면 N/A

| # | 발견 영역 | 결함 | 사용자 지시 (인용) | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-010 | (csa 8 화면 일괄 PK readOnly 라운드 — 본 화면 N/A) | (해당 없음 — Round 5 에서 이미 적용) | "csa 8 화면 PK readOnly inserted-only 정합" | (해당 없음 — Round 5 §3.4.2 / §4.5 UX-011·012 본문 직접 반영분 유지) | (해당 없음 — page.tsx round-5 commit 유지) |

### J.6 Round 7 — btn_close 완전 제거 (2026-06-04~05)

| # | 발견 영역 | 결함 | 사용자 지시 (인용) | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-011 | 디자인 §1.2 / §5.2 / §5.2.1 / §8 / §8.1 | AsIs xfdl 의 btn_close (commonTop basic 4 의 마지막) 를 ToBe 에서 보존 시 portal 탭 host close 와 중복 — 화면 내부 닫기 버튼 의미 ✗ | "AsIs xfdl 의 btn_close → ToBe 에서 완전 제거" / "portal 탭 close 는 host 가 처리" (2026-06-04~05) | 디자인 §1.2 (PageLayout.buttons 4 → 3 박스 + 표 행 갱신) / §5.2 EX-004 행 폐기 표시 / §5.2.1 (3 종 표 + 닫기 행 폐기 표시) / §8 W5 E (4 → 3 버튼 갱신) / §8.1 (Round 7 행 신규) / §-1 (4 질문 갱신) | page.tsx — PageLayout buttons 배열에서 btn_close entry 삭제 + unused `handleClose` dead code 제거 |

### J.7 신규 Q-NNN 등재 ✗

Round 2/3/5/6/7 + 2026-06-04 동기화 작업은 **AsIs 위반 정정 (Round 2)** + **사용자 결정 즉시 반영 (Round 3 / 5 / 7)** + **가이드 정본 영역 반영 (W5 / Round 6 N/A)** 만 포함하며 신규 미해결 결정 사항 ✗. 모든 결함은 본문 갱신 + 코드 수정 + 본 §J 등재로 즉시 해소. §G 활성 = **0 건** 유지.

### J.8 회귀 방지 가드

- 이후 iter 에서 본 §J 의 J-001 ~ J-011 11 항목이 회귀하지 않도록 변경 PR 시 본문 + 코드 동시 갱신 강제.
- 특히 J-005 (FE searchCmRoleGrpMenu 호출 제거) / J-007 (D-001 readOnly inserted 만) / **J-011 (btn_close 완전 제거 — PageLayout buttons 배열 + handleClose dead code)** 는 코드 회귀 가능성이 가장 높음 → CR 시 우선 점검 대상.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §K. 라운드 카탈로그 (cross-ref — 본 화면 라운드 변경 매트릭스)

| Round | 일자 | 변경 | 영향 §/D-NNN/G-NNN/B-NNN | 확정 시각 |
|---|---|---|---|---|
| Round 1 | 2026-05-29 | 초안 5 패널 As-Is 1:1 | 디자인 §1~§8 초안 / 정합 §A~§I 초안 | ✓ |
| Round 1.1 | 2026-05-31 | Q 12 건 일괄 해소 (정책 #1 / Q-006 / lov 폐기) | 분석 §12 / 디자인 §3.2 (S-001 폐기) / §4.1 (G-005 폐기) / §3.4.1 (D-002 폐기) / §3.6 (B-002·003 cssclass 정정) | ✓ |
| Round 2 | 2026-06-02 | AsIs 1:1 재개발 — 4분할 + 3-chain auto load | 디자인 §1.2 / §1.2.1 / §1.2.2 / §3.4.1 / §3.4.3 / §4.5 UX-010 / §4.5.1 / 정합 §J.1 | ✓ |
| Round 3 | 2026-06-02 | 메뉴 구조 트리 영역 제거 — 3분할 + 2-chain | 디자인 §1.2 / §3.5 / §4.3 (LT-001 ToBe 미구현) / §4.5.1 (3-chain → 2-chain) / 정합 §J.2 | ✓ |
| Round 5 | 2026-06-02 | ROLE_GROUP_ID readOnly inserted 만 | 디자인 §3.4.1 / §3.4.2 / §4.5 UX-011·012 / D-001 / 정합 §J.3 | ✓ |
| W5 동기화 | 2026-06-04 | csa 8 화면 표준 W5 A~G 본 화면 직접 등재 | 디자인 §8 / §8.1 / 정합 §J.4 | ✓ |
| **Round 6** | **2026-06-04~05** | (csa 8 화면 PK readOnly 일괄 라운드 — 본 화면 N/A) | (해당 없음 — Round 5 에서 이미 적용) / 정합 §J.5 | ✓ (N/A) |
| **Round 7** | **2026-06-04~05** | btn_close 완전 제거 — W5 E 4 → 3 버튼 표준 | 디자인 §1.2 / §5.2 EX-004 / §5.2.1 / §8 W5 E / §8.1 / B-NNN (B-001~003 영향 ✗ — EX-NNN 카테고리만) / 정합 §J.6 / §K | ✓ |

### K.1 본 라운드 결함 / W5 패턴 변경 / Round 결정 시각 표

| 항목 | Round 1 | Round 1.1 | Round 2 | Round 3 | Round 5 | W5 | Round 6 | **Round 7** |
|---|---|---|---|---|---|---|---|---|
| 본문 갱신 (디자인) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | (N/A) | **✓** |
| 본문 갱신 (정합) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | (N/A) | **✓** |
| 코드 반영 (page.tsx) | ✓ | ✓ | ✓ | ✓ | ✓ | (이미 적용) | (N/A) | **✓** |
| 결함 ID | - | 결함 #1~#16 | J-001~J-003 | J-004~J-006 | J-007~J-008 | J-009 | J-010 (N/A) | **J-011** |
| W5 패턴 변경 | - | - | A/B/C 도입 | - | D 정합 | A~G 직접 등재 | - | **E (4 → 3)** |
| 사용자 결정 시각 | 초안 | 2026-05-31 | 2026-06-02 | 2026-06-02 | 2026-06-02 | 2026-06-04 | 2026-06-04~05 | **2026-06-04~05** |

---

## §-1. §6.14 Phase 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | No — §A.1 의 구조 동일성 모두 ✓ + §A.2 의 합 일치 모두 ✓ + §B 명명 모두 ✓ + §C 5축 모두 ✓ + §E As-Is 누락 0 모두 ✓ + §F 변환점 14 모두 ✓ + §J 11 항목 정합 + §K 라운드 카탈로그 정합 |
| 2 | 검증 안 한 부분? | No — 분석 §12 결정 누적표 15 행 본문 직접 반영 (cma 4 화면 정본 패턴 정합). §G 활성 = 0. **2026-06-02 Round 2/3/5 + 2026-06-04 W5 + 2026-06-04~05 Round 6 (N/A) + Round 7 (btn_close 폐기) 동기화 → §J.5/§J.6/§K 신설 + 디자인설계서 §1.2 / §5.2 / §5.2.1 / §8 / §8.1 / §-1 직접 등재** |
| 3 | 그대로 수용? | Yes — 정책 #1 (BIZ SYSTEM 콤보 제거) 으로 lov action 폐기 → action **6 enum** 으로 사용자 사전 명시 일치 (분석 §12 결정 누적표) + Round 2 AsIs 1:1 재개발 + Round 3 메뉴트리 제거 + Round 5 PK readOnly inserted 만 + W5 A~G + **Round 7 btn_close 완전 제거 (W5 E 4 → 3 버튼)** 모두 수용 |
| 4 | 임의 합리화? | No — 가이드 §외 임의 신설 없음. 환경 제약 §H 5 행 + 결함 §E.5 16 건 + 분석 §12 결정 누적표 15 행 + §J 11 항목 + §K 라운드 카탈로그 모두 정합 |

> 4 질문 모두 통과 → Phase 5 정합체크서 작성 완료. **2026-05-31 분석 §12 결정 누적표 15 행 본문 직접 반영 / 활성 = 0 / 2026-06-02 Round 2+3+5 §J 신설 / 2026-06-04 W5 A~G §J.4 등재 / 2026-06-04~05 Round 6 (N/A) + Round 7 btn_close 폐기 §J.5/§J.6/§K 등재 완료**.
