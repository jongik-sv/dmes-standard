---
screenId: commObjMng
asIsId: CommObjMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29 (6 정책 결정 일괄 반영: 2026-05-31 / W5 정합 + Round 4/5 정책 동기화: 2026-06-02 ~ 2026-06-04 / Round 6~7 btn_close 제거: 2026-06-04 ~ 2026-06-05)
작성자: Agent
---

# OBJECT 관리 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 Q-NNN = **0 건** (Q-001 해소 2026-05-30 §9.6 신설 / 132 컬럼 등재 + **Q-NEW-001 해소 2026-05-31 — 6 정책 결정 #1 APP_HOST/BIZ_SYSTEM_CODE 폐기로 자동 해소**).
> **6 정책 결정 일괄 반영 (2026-05-31)**: #1 APP_HOST/BIZ_SYSTEM_CODE 폐기 + cma 정본 패턴 + schema=MCMAPUSER + 테이블명 As-Is 대문자 + Entity `mcm.entity.*` + Service/DTO `mcm.csa.commObjMng.{service|dto}` + JPA only + McmAuditEntity 상속 / #6 (A) Entity 명명 As-Is 직역 = SecObj/SecMenu/SecMenuFld/AppHost/SecRoleMapping (기존 mcm-core 와 공존)
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **W5 정합 + Round 4/5 정책 (2026-06-02 ~ 2026-06-04)**: csa 8 화면 W5 패턴 전파 (W5 A 레이아웃 / W5 B Detail wrapper / W5 C Form row / W5 D Grid editable:false / W5 E 버튼 row-state pre-disable 제거 / W5 F 자동조회 / W5 G BE 시간) + Round 4 (ACCESS_TP 2 enum / FORM_URL ToBe 라우팅 `{group}/{OBJECT_ID}`) + Round 5 (OBJECT_ID readOnly 정책). §J 사용자 검수 이력 절 신설.
> **Round 6~7 btn_close 제거 (2026-06-04 ~ 2026-06-05)**: AsIs xfdl commonTop basic 4 의 마지막 btn_close 를 ToBe 완전 폐기. PageLayout buttons 배열에서 entry 삭제 + 미사용 handleClose dead code 제거. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼 의미 ✗. Round 6 본 화면 영향 ✗ (N/A). §J 에 J-11 추가 등재 + §K Phase 5 동기화.
> **환경 제약 (사용자 결정 [§10])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §D.4 = ✗ + 사유 명시.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§14 / §1~§12 / §1~§8 / §1~§8 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (분석 §3.4 GE / §3.6 FX / §5 P / §7 Java / 기능 §4.2 L / §5.1-1 GB / §9 P / 디자인 §5.5 GB / §6 P / BPMN §2.4~6 4 action / §3 Java) | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§11/§13] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §10에 의해 신설) | ✓ | ✓ | ✓ | ✓ | §0 환경 제약은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 7 (5 표준 + 2 추가: A-TITLE / A-FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | A-MAIN-LEFT/RIGHT 좌우 분할 추가 + TITLE/FOOTER |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §10 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl) + D2 (Mapper.xml SQL) 만 존재, D3 SP 의존 ✗, Java UserTask ✗ | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 미존재 (Oracle SP/함수/트리거 미사용 — Mapper.xml inline SQL 만). UserTask Java ✗ — ScriptTask 만 |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / oncellclick / onheadclick / onitemchanged / onchanged / onload / onrowposchanged 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.4 의 메서드 표 20 행으로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 6 SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§10] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | As-Is 3 / **To-Be 정책 #1 = 2** (S-001 폐기) | 3→2 | 3→2 | (해당 없음) | - | 0 | 1 (S-001 — 정책 #1) | ✓ |
| 그리드 컬럼 (G-NNN) | As-Is 15 / **To-Be 정책 #1 = 14** (G-006 폐기) | 15→14 | 15→14 | (해당 없음) | - | 0 (STATUS row state — To-Be FE 동일 구현 결정) | 1 (G-006 — 정책 #1) | ✓ |
| 확장 그리드 (GE-NNN) | 0 | 0 | (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | As-Is 16 / **To-Be 정책 #1 = 15** (D-003 폐기) | 16→15 | 16→15 | (해당 없음) | - | 0 | 1 (D-003 — 정책 #1) | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 버튼 (B-NNN) | As-Is 10 / **Round 7 To-Be = 9** (B-004 btn_close 폐기) | 10→9 | 10→9 | (해당 없음) | - | 0 | 1 (B-004 — Round 7) | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 상태값 (ST-NNN) | 9 | 9 | (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 코드값/LoV (LV-NNN) | As-Is 4 / **To-Be 정책 #1 = 3** (LV-001 APPHOST 폐기 + LV-002→LV-001 / LV-003→LV-002 / LV-004→LV-003 재정렬) | (참조만) | (참조만) | (해당 없음) | - | 0 | 1 (LV-001 — 정책 #1) | ✓ |
| Mapper.xml SQL ID | As-Is 6 / **To-Be 정책 #1 = 5** (selectAppHostId 폐기) | 6→5 (§5.2 인용) | (해당 없음) | 6→5 (§6.4 sqlKey) | - | 0 | 1 (selectAppHostId — 정책 #1) | ✓ |
| BPMN 노드 / SequenceFlow | As-Is 7 노드 / 9 flow / **To-Be 정책 #1 = 6 노드 / 8 flow** (Task_0wm0wlq + SequenceFlow_1igvr9j 제거 — action enum 7→6) | (해당 없음) | (해당 없음) | 7→6 / 9→8 (§2 전수) | - | 0 | 1 노드 + 1 flow (정책 #1) | ✓ |
| Java UserTask 클래스 | 0 (해당 없음) | (해당 없음) | (해당 없음) | 0 (§3 해당 없음) | - | 0 | 0 | ✓ |
| 사용 테이블 | As-Is 5 (TB_MCM_SEC_OBJ 본 컬럼 14 + audit / TB_MCM_SEC_MENU read-only 2 / TB_MCM_SEC_MENU_FLD lov 4 / TB_MCM_APPHOST lov 1 / TB_MCM_SEC_ROLE_MAPPING EXISTS 1) + DMES §9.6 전수 132 컬럼 / **To-Be 정책 #1 = 4 테이블** (APPHOST 폐기) + DMES 108 컬럼 (APPHOST 24 + SEC_OBJ BIZ_SYSTEM_CODE 1 제외) | (참조만) | (해당 없음) | (참조만) | - | 0 (Q-001 해소 2026-05-30 + Q-NEW-001 해소 2026-05-31 — 정책 #1 자동 해소) | 1 테이블 (APPHOST — 정책 #1) | ✓ |
| xfdl Script 메서드 | 20 (As-Is 보존 — 메서드 자체는 유지, fn_lov 본문만 1 dataset 으로 축소) | (참조만) | (참조만) | (참조만) | - | 0 | 0 | ✓ |
| xfdl Bind | As-Is 16 BindItem / **To-Be 정책 #1 = 15** (item7 BIZ_SYSTEM_CODE 폐기) | (참조만) | (참조만) | (참조만) | - | 0 | 1 (item7 — 정책 #1) | ✓ |
| xfdl 외부 url include (EX-NNN) | 4 (commonTopButton / commonLeftButton / commonRightButton / commonBottomStatus) | (참조만) | (참조만) | (참조만) | - | 0 | 0 | ✓ |
| xfdl Dataset (DS-NNN) | As-Is 5 (ds_main / ds_access_tp / ds_lovSubSystem / ds_lovMenuId / ds_useTp) / **To-Be 정책 #1 = 4** (ds_lovSubSystem 폐기 + ds_main 의 BIZ_SYSTEM_CODE 컬럼 16→15) | (참조만) | (참조만) | (참조만) | - | 0 | 1 (ds_lovSubSystem — 정책 #1) | ✓ |

> **§A.2 결과**: 모든 행 합 일치 — 발견 = 반영 + 확인필요 + 제외. Q-001 해소 (2026-05-30 §9.6 신설) + Q-NEW-001 해소 (2026-05-31 — 정책 #1 APP_HOST/BIZ_SYSTEM_CODE 폐기 자동 해소). **활성 Q = 0**. To-Be 정책 #1 제외 카운트 총계: S 1 / G 1 / D 1 / LV 1 / SQL 1 / BPMN 1 노드 + 1 flow / 테이블 1 / Bind 1 / Dataset 1.

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
| moduleGroup | csa — 한글명 **"시스템관리"** | (전체 공통) | xfdl 폴더 `nxuiMui/csa/` + Mapper 폴더 `mappers-csa/` + bpmn 폴더 `services/csa/` 그대로 (사용자 결정 등재 — 2026-05-29) | ✓ |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > OBJECT 관리 (commObjMng) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commObjMng | MES: camelCase `{화면명}` (단일 토큰) | 01 A.3 / A.4.1 — `CommObjMng` → `commObjMng` (모듈 토큰 ✗, 그룹 토큰 ✗) | ✓ |
| pageName | commObjMng | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | commObjMng | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | commObjMng | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | commObjMng.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commObjMng | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | (해당 없음 — P-NNN 0개) | (전체 공통) | 01 A.4.7 | (N/A) |
| 필드/컬럼/버튼 ID | As-Is: S-001~003 / G-001~015 / D-001~016 / B-001~010 / EX-001~004 / DS-001~005 / LV-001~004 / ST-001~009 / V-001~901 / UX-001~012 / API-001~003 / **To-Be 정책 #1 제외**: S-001 / G-006 / D-003 / LV-001 / DS-003 (item7 Bind) → To-Be 활성 = S 2 / G 14 / D 15 / B 10 / EX 4 / DS 4 / LV 3 / ST 9 / V / UX 12 / API 3 | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / 그리드 cell `text=` / Edit.value 1byte 일치 | (전수 일치 — 분석 §3.2 / §3.3 / §3.5) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `OBJECT_ID` / `OBJECT_NM` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum + 추가 2 (A-TITLE / A-FOOTER) — 사용자 요구사항 [§11/§13] 가이드 §외 신설 ✗ → 디자인설계서 §3.1 에 5 표준 + 2 추가 명시 | ✓ (A-FILTER / A-MAIN-LEFT(=A-GRID) / A-MAIN-RIGHT(=A-DETAIL) / A-BTN 통합 / A-TITLE / A-FOOTER) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — As-Is: Combo 5 (S-001/S-003/D-003/D-004/D-010) + TextBox 9 (S-002/D-001/D-002/D-005~D-009/D-011/D-012/D-014) + Radio 1 (D-013) + Calendar 2 (D-015/D-016) / **To-Be 정책 #1**: Combo 3 (S-003/D-004/D-010) + TextBox 9 (변동 없음) + Radio 1 + Calendar 2 (S-001/D-003 폐기) | ✓ (모든 enum 5값 = TextBox / ComboBox / DatePicker / Radio + Grid cell) | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — varchar(50) / varchar(90) / varchar(100) 모두 cite | ✓ (분석 §9 + 기능 §4.1 + 디자인 §3.4) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commObjMng × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | commObjMng (§1) | commObjMng (§1.2) | commObjMng (frontmatter / §1.2) | commObjMng (process / serviceId) | commObjMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| pageName | commObjMng | commObjMng | commObjMng | commObjMng | commObjMng | ✓ |
| pageId | commObjMng | commObjMng | commObjMng | commObjMng | commObjMng | ✓ |
| serviceId | commObjMng | commObjMng | commObjMng | commObjMng | commObjMng | ✓ |
| 필드ID (S-NNN 전수) | As-Is §3.2 (3 행: S-001 BIZ SYSTEM, S-002 OBJECT, S-003 사용 여부) / **To-Be 정책 #1 = 2 행** (S-001 폐기) | §3.1 (As-Is 3 / To-Be 2) | §3.2 (As-Is 3 / To-Be 2 좌표 포함 + 좌측 시프트) | (해당 없음 — BPMN 은 컬럼 단위 인용 ✗) | (분석 §11 To-Be 변환점 #12) | ✓ |
| 컬럼ID (G-NNN 전수) | As-Is §3.3 (15 행: G-001~G-015) / **To-Be 정책 #1 = 14 행** (G-006 폐기) | §3.2 (15→14) | §4.1 (15→14) | (참조만) | (분석 §9.1 / §11 #12) | ✓ |
| 컬럼ID (GE-NNN 확장) | §3.4 (해당 없음) | §3.2 (해당 없음) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ |
| 필드ID (D-NNN 전수) | As-Is §3.5 (16 행: D-001~D-016) / **To-Be 정책 #1 = 15 행** (D-003 폐기) | §4.1 (16→15) | §3.4 (16→15 좌표 + cssclass + 후속 top 28px 시프트) | (참조만) | (분석 §9.1 + xfdl Bind §3.9 — item7 폐기) | ✓ |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 버튼ID (B-NNN 전수) | §4.1 (As-Is 10 행: B-001~B-010 / **Round 7 To-Be = 9 행** — B-004 btn_close 폐기) | §5.1 (10→9) | §5.1 / §5.2 / §5.3 / §5.4 (commonTopButton As-Is 4 → ToBe 3 + commonRightButton 4 + commonLeftButton 1 + btn_fold 1 = ToBe 9) | (참조만 — §1.1 API 트리거 매핑) | - | ✓ |
| 팝업ID (P-NNN 전수) | §5 (해당 없음) | §9 (해당 없음) | §6 (해당 없음) | (참조만 — 없음) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | As-Is: §9.1 (TB_MCM_SEC_OBJ 본 컬럼 14 + audit) / §9.2 (TB_MCM_SEC_MENU read-only 2) / §9.3 (TB_MCM_SEC_MENU_FLD lov 4) / §9.4 (TB_MCM_APPHOST lov 1) / §9.5 (TB_MCM_SEC_ROLE_MAPPING EXISTS 1) / **To-Be 정책 #1**: §9.1 본 컬럼 13 (BIZ_SYSTEM_CODE 폐기) + audit (McmAuditEntity 자동) / §9.2 동일 / §9.3 동일 / **§9.4 폐기** / §9.5 동일 = **4 테이블** | §3.1 / §3.2 / §4.1 (S + G + D 인용) | §3.4 / §4 (Detail Form + Grid 컬럼 인용) | §5 (DTO 매핑) | §11 변환점 (As-Is 일부 무명 prefix → To-Be `MCMAPUSER.TB_MCM_SEC_*` 명시 통일 + #12 APPHOST 폐기 + #13 Entity 명명) | ✓ |
| 상태코드 (statusCodes) | §10.1 (9 행: ST-001~ST-009) | §7 (9 행 동일) | §4.2 UX-NNN + §7.2 색상 강조 | (참조만 — saveCmObj status 분기) | - | ✓ |
| action 목록 | §1 (3 enum: searchCmObj / saveCmObj / lov + 가이드 표준 6 대비 매핑) | §5.2 (3 동일) | (참조만) | §1.1 (3 API + 3 action) + §2.1~§2.6 (3 흐름 + 4 "해당 없음") | §6.2 BPMN 기능 식별자 안 (As-Is 3 / To-Be 3 — action enum 자체는 보존, lov 본문만 1 dataset 축소) | ✓ |
| Mapper.xml SQL ID | As-Is §6 (6 SQL 전수) / **To-Be 정책 #1 = 5 SQL** (selectAppHostId 폐기) | §5.2 (action → SQL 매핑 / 6→5) | (참조만) | §1.1 (sqlKey 6→5 종) + §6.4 (To-Be 명명 안) | §11 변환점 (#9 ref_Audit → McmAuditEntity / #12 selectAppHostId 폐기) | ✓ |
| BPMN 노드 / SequenceFlow | As-Is §8 (7 노드 + 9 flow) / **To-Be 정책 #1 = 6 노드 + 8 flow** (Task_0wm0wlq + SequenceFlow_1igvr9j 제거) | (참조만) | (해당 없음) | §2 (3 action 흐름 + 모든 node id / sequenceFlow id 인용 — As-Is 7+9 / To-Be 6+8) + §6.3 (Task_0wm0wlq 폐기 명시) | - | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | commObjMng | commObjMng | commObjMng | commObjMng | ✓ |
| asIsId | CommObjMng | CommObjMng | CommObjMng | CommObjMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commObjMng | commObjMng | commObjMng | commObjMng | ✓ |
| S-NNN 수 | As-Is 3 / **To-Be 정책 #1 = 2** | 3→2 | 3→2 | (해당 없음) | ✓ |
| G-NNN 수 | As-Is 15 / **To-Be = 14** | 15→14 | 15→14 | (해당 없음) | ✓ |
| GE-NNN 수 | 0 | 0 | (해당 없음) | (해당 없음) | ✓ |
| D-NNN 수 | As-Is 16 / **To-Be = 15** | 16→15 | 16→15 | (해당 없음) | ✓ |
| L-NNN 수 | 0 | 0 | 0 | (해당 없음) | ✓ |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| B-NNN 수 | As-Is 10 / **Round 7 To-Be = 9** (B-004 폐기) | 10→9 | 10→9 | (참조만) | ✓ |
| P-NNN 수 | 0 | 0 | 0 | (참조만) | ✓ |
| ST-NNN 수 | 9 | 9 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 | As-Is 4 / **To-Be = 3** (LV-001 폐기 + 재정렬) | (참조만) | (참조만) | (참조만) | ✓ |
| BPMN action 수 | 3 (활성 3 + 가이드 표준 6 대비 4 "해당 없음" 매핑 — As-Is/To-Be 동일) | 3 | (참조만) | 3 (§2.1~§2.3) + 4 "해당 없음" (§2.4~§2.6) | ✓ |
| Mapper SQL 수 | As-Is 6 / **To-Be = 5** (selectAppHostId 폐기) | 6→5 | (참조만) | 6→5 (§6.4) | ✓ |
| BPMN 노드 수 | As-Is 7 / **To-Be = 6** (Task_0wm0wlq 폐기) | (참조만) | (참조만) | 7→6 (§6.3) | ✓ |
| BPMN sequenceFlow 수 | As-Is 9 / **To-Be = 8** (SequenceFlow_1igvr9j 폐기) | (참조만) | (참조만) | 9→8 (§2 흐름) | ✓ |
| xfdl Script 메서드 수 | 20 (As-Is/To-Be 동일 — fn_lov 본문만 1 dataset 축소) | (참조만) | (참조만) | (참조만) | ✓ |
| xfdl BindItem 수 | As-Is 16 / **To-Be = 15** (item7 폐기) | (참조만) | (참조만) | (참조만) | ✓ |
| xfdl Dataset 수 (DS-NNN) | As-Is 5 / **To-Be = 4** (ds_lovSubSystem 폐기) | (참조만) | (참조만) | (참조만) | ✓ |
| 외부 url include (EX-NNN) | 4 | (참조만) | (참조만 — §5.1~§5.4 인용) | (참조만) | ✓ |

### D.2 BPMN 기능 식별자 = `{screenId}_{기능명}` (사용자 요구사항 [명명 규칙 정본])

| As-Is sequenceFlow name | To-Be 기능 식별자 | 검증 |
|---|---|---|
| searchCmObj | commObjMng_searchCmObj | ✓ (As-Is 보존) |
| saveCmObj | commObjMng_saveCmObj | ✓ (As-Is 보존) |
| lov | commObjMng_lov | ✓ |

> **As-Is action 이름 (searchCmObj / saveCmObj) vs 가이드 표준 (search / save) mismatch**: As-Is 보존 권고. 가이드 표준 정합 시 rename 가능 (사용자 결정 위임).

### D.3 테이블 명명 = `TB_{모듈명}_{역할}` (사용자 요구사항 [명명 규칙 정본])

| As-Is | To-Be 명명 안 (6 정책 결정 #1 / #6 (A) 반영) |
|---|---|
| TB_MCM_SEC_OBJ (prefix 무) | MCMAPUSER.TB_MCM_SEC_OBJ + Entity `SecObj` (정책 #6 (A)) — `extends McmAuditEntity` |
| TB_MCM_SEC_MENU (prefix 무) | MCMAPUSER.TB_MCM_SEC_MENU + Entity `SecMenu` (read-only 조인) |
| MCMAPUSER.TB_MCM_SEC_MENU_FLD (As-Is 명시) | MCMAPUSER.TB_MCM_SEC_MENU_FLD (보존) + Entity `SecMenuFld` (lov) |
| ~~MCMAPUSER.TB_MCM_APPHOST (As-Is 명시)~~ | **폐기** (정책 #1) — 본 화면 의존 자산 0 + Entity `AppHost` 미생성 |
| TB_MCM_SEC_ROLE_MAPPING (prefix 무) | MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING + Entity `SecRoleMapping` (EXISTS 검증) |

> 사용자 결정 (2026-05-31): `MCMAPUSER` 스키마 + `TB_MCM_SEC_*` 대문자 prefix As-Is 보존 + 무명 prefix 는 To-Be 명시 추가 + Entity 명명 As-Is 직역 + APP_HOST 폐기.

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
| SequenceFlow_0tt1mbk (searchCmObj) | ✓ As-Is 보존 | ✓ |
| SequenceFlow_0grwghu (saveCmObj) | ✓ | ✓ |
| SequenceFlow_13avwvi (lov) | ✓ (As-Is targetRef=Task_0wm0wlq / **To-Be 정책 #1**: targetRef=Task_1lhctxq 직결) | ✓ |
| SequenceFlow_1 / 105vwsz / 1vkp3qd / 0pbcc9f (4 nameless flow) | ✓ As-Is 보존 | ✓ |
| ~~SequenceFlow_1igvr9j~~ (As-Is nameless / Task_0wm0wlq → Task_1lhctxq) | **To-Be 정책 #1 폐기** | ✓ |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ (스키마 As-Is 보존 + 무명 명시 추가 결정) + D.4 ✗ + 사유 명시 (사용자 결정) + D.5 ✓ — **사용자 결정 사유에 따른 D.4 ✗ 는 설계 미완성으로 판정하지 않는다** → §D = **✓ (환경 제약 명시 조건)**.

---

## §E. As-Is 누락 0 점검 (사용자 요구사항 [§3, §4])

### E.1 xfdl 컴포넌트 전수

| xfdl 컴포넌트 종류 | 분석 §3 등재 수 | 검증 방법 | 결과 |
|---|---:|---|---|
| Form / Layout / Div (컨테이너) | A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-LEFT / A-MAIN-RIGHT / A-FOOTER + div_topMenu / div_leftMenu / div_rightMenu / div_bottom / div_detail = 12 (분석 §3.1 + §3.7) | xfdl Div / Layout / Form 전수 grep | ✓ |
| Static (라벨 + 배경) | 라벨 Static (S-NNN 옆): stc_bizSystemCode / sts_objectId / sts_useTp = 3 + 배경 Static (D-NNN 배경): stc_Static1 / 4 / 5 / 8_00 / 2_00 / 2 / 3 / 6 / 7 / 8 / 81 / 7_00 / 9 / 10 / 11 / 12 = 16 / + 영역 라벨: edt_srch_cseq (라벨 Edit) / edt_dtl_info (라벨 Edit) = 추가 2 = 합 **21** (분석 §3.2 / §3.5) | xfdl `<Static ...>` 전수 grep | ✓ |
| Edit (TextBox + 라벨 readonly + 타이틀) | 입력 Edit: edt_OBJECT_ID / edt_object_id / edt_object_type / edt_service / edt_system_code / edt_param / edt_form_url / edt_out_access_ip / edt_id / edt_object_nm / edt_program_desc / edt_title = 12 + 라벨 Edit readonly (D-NNN 옆): edt_st_object_id / edt_st_system_code / edt_st_BIZ_SYSTEM_CODE / edt_st_bizSystemCode / edt_st_id / edt_st_object_nm / edt_st_program_desc / edt_st_object_type / edt_st_service / edt_st_access_tp / edt_st_form_url / edt_st_out_access_ip / edt_st_use_tp / edt_st_param / ed_st_start_active_date / edt_st_end_active_date = 16 + 영역 라벨 Edit: edt_srch_cseq / edt_dtl_info = 2 = 합 **30** (분석 §3.2 / §3.5) | xfdl `<Edit ...>` 전수 grep | ✓ |
| Grid | grd_main (G-001~G-015) = 1 그리드 + 15 컬럼 (분석 §3.3) | xfdl `<Grid ...>` 전수 grep | ✓ |
| Button | btn_fold = 1 (분석 §4.1 B-009) — 외부 등록 9 버튼은 commonTopButton / commonRightButton / commonLeftButton 의 외부 처리 | xfdl `<Button ...>` 전수 grep | ✓ |
| Combo | As-Is: cbo_bizSystemCode (div_search) / cbo_USE_TP (div_search) / cbo_bizSystemCode (div_detail 동명 이중 — 부모 path 다름) / cbo_folder (div_detail) / edt_access_tp (div_detail Combo) = **5** Combo / **To-Be 정책 #1 = 3 Combo** (cbo_bizSystemCode 양쪽 폐기) | xfdl `<Combo ...>` 전수 grep | ✓ |
| Calendar | cal_start_active_date / cal_end_active_date = 2 (분석 §3.5 D-015 / D-016) | xfdl `<Calendar ...>` 전수 grep | ✓ |
| Radio | edt_use_tp = 1 (분석 §3.5 D-013) | xfdl `<Radio ...>` 전수 grep | ✓ |
| Dataset | As-Is: ds_main / ds_access_tp / ds_lovSubSystem / ds_lovMenuId / ds_useTp = 5 / **To-Be 정책 #1 = 4** (ds_lovSubSystem 폐기 + ds_main 의 BIZ_SYSTEM_CODE 컬럼 16→15) | xfdl `<Dataset ...>` 전수 grep | ✓ |
| BindItem | As-Is: item0~item15 = 16 / **To-Be 정책 #1 = 15** (item7 폐기) | xfdl `<BindItem ...>` 전수 grep | ✓ |
| Script function | 20 메서드 (분석 §4.4) | xfdl Script `this.X = function` 전수 grep | ✓ |
| 그리드 columns 전수 | As-Is: G 15 컬럼 (분석 §3.3) / **To-Be 정책 #1 = G 14 컬럼** (G-006 BIZ_SYSTEM_CODE 폐기) | xfdl `<Cell ...>` 전수 grep | ✓ |

### E.2 Java 메서드 전수

해당 없음 — 본 화면은 UserTask Java 클래스 ✗ (csa Java 디렉토리에 CommObjMng 폴더 부재).

### E.3 Mapper.xml SQL ID 전수

| SQL ID | 분석 §6 등재 | 결과 |
|---|---|---|
| selectCommObjMng | ✓ #1 | ✓ |
| insertCommObjMng | ✓ #2 | ✓ |
| updateCommObjMng | ✓ #3 | ✓ |
| deleteCommObjMng | ✓ #4 | ✓ |
| ~~selectAppHostId~~ | ~~✓ #5~~ | **To-Be 정책 #1 폐기** |
| selectMenuId | ✓ #6 (To-Be 재번호 #5) | ✓ |

> As-Is: 6 SQL 전수 등재 (Mapper.xml 의 `<select|insert|update|delete>` 태그 grep 결과 = 6) / **To-Be 정책 #1 = 5 SQL** (selectAppHostId 폐기).

### E.4 BPMN flow 전수

| BPMN 요소 | 분석 §8 등재 수 | 결과 |
|---|---:|---|
| startEvent | 1 (StartEvent_1) | ✓ |
| endEvent | 1 (EndEvent_1 — 3 incoming) | ✓ |
| exclusiveGateway | 1 (ExclusiveGateway_1, 3 outgoing) | ✓ |
| task (CommonSelectTask 3 + CommonMultiSaveTask 1) | As-Is 4 / **To-Be 정책 #1 = 3** (CommonSelectTask 2 + CommonMultiSaveTask 1 — Task_0wm0wlq 폐기) | ✓ |
| userTask | 0 (해당 없음 — ScriptTask 만) | ✓ |
| sequenceFlow | As-Is 9 (3 action 분기 + 6 chain) / **To-Be 정책 #1 = 8** (SequenceFlow_1igvr9j 폐기) | ✓ |

### E.5 결함 처리 (사용자 요구사항 [§4])

| 결함 ID | 위치 | 처리 |
|---|---|---|
| 결함 #1: OBJECT_ID 자동 조합 핸들러 mismatch | D-004 핸들러 (xfdl:556) `{MENU_ID 전체}::{ID}` vs D-005 핸들러 (xfdl:565) `{MENU_ID 앞 3자}::{ID}` — As-Is 보존 (마지막 호출이 덮어쓰기로 동작) | ✓ As-Is 보존 + 분석 §10.1 ST-008 / §12 인용 |
| 결함 #2: `fn_msgSuccessSave` 변수 미선언 | xfdl:467 — 변수 미선언 = As-Is 잠재 ReferenceError. As-Is 보존 + To-Be 정정 위임 | ✓ As-Is 보존 + 분석 §4.4 #13 인용 |
| 결함 #3: SYSTEM_CODE 2회 중복 set | xfdl:419, 422 동일 행에서 `SYSTEM_CODE="MES"` 2회 set — As-Is 보존 | ✓ As-Is 보존 + 분석 §10.1 ST-003 인용 |
| 결함 #4: `ed_st_start_active_date` 라벨 id 오타 | xfdl:94 — 정상은 `edt_st_*` (다른 15 라벨은 모두 `edt_`). As-Is 보존 | ✓ As-Is 보존 + 분석 §3.5 D-015 / §12 인용 |
| 결함 #5: 라벨 더블 스페이스 ("외부  접속 주소") | xfdl:117 — 라벨 value 더블 스페이스 As-Is 보존 | ✓ As-Is 보존 + 분석 §3.5 D-012 / §12 인용 |
| 결함 #6: `cbo_bizSystemCode` xfdl id 동명 이중 | div_search 와 div_detail 양쪽에 동일 `cbo_bizSystemCode` id 존재 (xfdl:157 / 125). 부모 path 다르므로 동작 정상. As-Is 보존 | ✓ As-Is 보존 + 분석 §3.2 S-001 / §3.5 D-003 인용 |
| 결함 #7: 디자인 더미 값 (value="USD" / text="부산역 CY") | xfdl 의 모든 Edit 의 `value` / `text` 속성에 디자인 더미 값 잔존 — 실 사용 시 빈 값. As-Is 보존 + To-Be 빈 값으로 reset 권고 | ✓ As-Is 보존 + 분석 §3.5 / §12 인용 |
| 결함 #8: `fn_reset` 의 `cbo_USE_TP.set_index(1)` | xfdl:411 — index 1 = "N" 으로 초기화. 기본값 "Y" (xfdl:161 index=0) 와 mismatch. As-Is 보존 | ✓ As-Is 보존 + 분석 §4.4 #8 / §12 인용 |
| 결함 #9: D-004 핸들러 이름 mismatch | 핸들러 이름 `div_main_div_mainDetail_div_detail_cbo_bizSystemCode_onitemchanged` 인데 실 D-004 (cbo_folder) 의 이벤트. 이름 vs 실 부착 mismatch. As-Is 보존 | ✓ As-Is 보존 + 분석 §3.5 D-004 / §4.4 #19 인용 |
| 결함 #10: D-004 라벨 id mismatch | 라벨 `edt_st_bizSystemCode` value="MENU ID" — 라벨 id 가 bizSystemCode 인데 실 라벨은 MENU ID. As-Is 보존 | ✓ As-Is 보존 + 분석 §3.5 D-004 / 디자인 §3.4 인용 |
| 결함 #11: M-007 saveCmObj 분기 메시지 재사용 | saveCmObj 콜백에서 "조회 되었습니다" 문구 재사용 (xfdl:385) — As-Is 보존 (To-Be 정정 위임) | ✓ As-Is 보존 + 기능 §10 M-007 / BPMN §2.2 인용 |
| 결함 #12: deleteCommObjMng silent 미삭제 잠재 결함 | xfdl B-006 단계 사전 차단 통과 후 server `NOT EXISTS` 으로 차단 시 rowcount 0 (silent) — 사용자 인지 ✗. As-Is 보존 | ✓ As-Is 보존 + BPMN §4.2 인용 |
| 결함 #13: SUBSTR/INSTR 의 OBJECT_ID prefix 가 항상 `::` 포함 가정 | xml:26 — `::` 가 없는 OBJECT_ID 의 경우 SUBSTR 결과 부정확. As-Is 보존 (정합 보장 ✗) | ✓ As-Is 보존 + 분석 §11 #4 / §6 #1 인용 |
| 결함 #14: ROWNUM=1 의 정렬 정책 누락 | xml:24 — scalar subquery 가 임의 1 행 반환. To-Be MSSQL 변환 시 정렬 정책 명시 권고 | ✓ As-Is 보존 + 분석 §11 #3 인용 |
| 결함 #15: ref_Audit fragment 정의 파일 미동봉 | As-Is include 3 회 (분석) + To-Be cactus-core `CactusAuditEntity` (9 컬럼 자동 JPA `@PrePersist`/`@PreUpdate`) 적용 결정 | ✓ As-Is 보존 + 분석 §9.1 / §11 #9 인용 |

> **§E 결과**: xfdl 모든 컴포넌트 전수 + Java "해당 없음" 명시 + Mapper.xml 6 SQL + BPMN 모든 flow + 결함 15 건 모두 As-Is 1:1 보존 + 분석 §12 / 기능 §10 / BPMN §4.2 인용 — 누락 0 + 임의 정정 0.

---

## §F. To-Be 변환점 (Oracle → MSSQL) — 분석 §11 영향 SQL 정합

| 변환 항목 | 영향 SQL ID | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 검증 |
|---|---|---|---|---|---|
| `\|\|` 문자열 결합 → `+` 또는 CONCAT | selectCommObjMng (xml:30~31) / selectMenuId (xml:121) | (참조만) | (해당 없음) | §2.1 / §2.3 (SQL 본문 cite) | ✓ |
| UPPER(...) — MSSQL 동일 지원 | selectCommObjMng (xml:30~31) | (참조만) | (해당 없음) | §2.1 | ✓ |
| `ROWNUM = 1` (xml:24) → MSSQL `TOP 1` 또는 `SELECT TOP (1) ... ORDER BY ...` | selectCommObjMng (xml:24 — MENU_ID scalar subquery) | (참조만) | (해당 없음) | §2.1 | ✓ (정렬 정책 누락 — To-Be 결정 위임 명시) |
| `SUBSTR / INSTR / LENGTH` → MSSQL `SUBSTRING / CHARINDEX / LEN` | selectCommObjMng (xml:26 — ID 추출) | (참조만) | (해당 없음) | §2.1 | ✓ |
| scalar subquery in SELECT — MSSQL 동일 | selectCommObjMng (xml:22~25) | - | - | §2.1 | ✓ |
| 스키마 prefix 일부 명시 / 일부 무명 → 모두 `MCMAPUSER.*` 명시 통일 (사용자 결정) | 모든 SQL | (참조만) | (해당 없음) | §6.4 (sqlKey To-Be 명명 안) + §D.3 | ✓ |
| MyBatis `<where>` + `<if>` dynamic SQL — DBMS 무관 | selectCommObjMng | - | - | §2.1 | ✓ |
| `NOT EXISTS` 이중 subquery — MSSQL 동일 지원 | deleteCommObjMng (xml:101~110) | (참조만) | (해당 없음) | §2.2 | ✓ |
| GROUP BY + MAX 집계 — MSSQL 동일 | As-Is: selectAppHostId (xml:115) / selectMenuId (xml:121, 124) / **To-Be 정책 #1**: selectMenuId 만 | - | - | §2.3 | ✓ |
| `ref_Audit` fragment 폐기 — **To-Be 정책 #6 (A)**: `McmAuditEntity` 상속 (cma 정본) + JPA `@PrePersist`/`@PreUpdate` 자동 처리 (8 audit 컬럼) | insertCommObjMng / updateCommObjMng (3 회 호출) | - | - | Entity 레이어 자동 (§1 + §6) | ✓ |
| `NVL` / `DECODE` / `SYSDATE` / `TO_DATE` / `(+)` (Oracle 전용) | (해당 없음 — 본 화면 SQL 전수 grep 결과 0 회) | - | - | - | ✓ (N/A) |
| **APP_HOST / BIZ_SYSTEM_CODE 폐기 (정책 #1)** | S-001 / D-003 / G-006 / DS-001 BIZ_SYSTEM_CODE 컬럼 / DS-003 ds_lovSubSystem / item7 Bind / selectCommObjMng SELECT+WHERE+INSERT+UPDATE 분기 / selectAppHostId 전체 / BPMN Task_0wm0wlq + SequenceFlow_1igvr9j / fn_save 필수 4→3 | 5.1 §3.1 (S 2) / §3.2 (G 14) / §4.1 (D 15) / §6.1 V-002 (필수 3) / §5.2 (lov 1 SQL) | §3.2 (좌표 시프트 + 좌표 표) / §3.4 (D-003 폐기 + 후속 top 시프트) / §4.1 (G-006 폐기) / §4.2 UX-011 / §7.2 cssclass | §1.1 (lov 1 dataset) / §2.1 (SELECT/WHERE 분기) / §2.2 (INSERT/UPDATE 컬럼) / §2.3 (Task_0wm0wlq + SequenceFlow_1igvr9j 폐기) / §3.1 / §4.1 / §5.1 / §5.2 / §5.3 / §6.2 / §6.4 | ✓ |
| **Entity 명명 As-Is 직역 (정책 #6 (A))** | TB_MCM_SEC_OBJ → `SecObj` (본 owner, `extends McmAuditEntity`) / TB_MCM_SEC_MENU → `SecMenu` / TB_MCM_SEC_MENU_FLD → `SecMenuFld` / ~~AppHost~~ (정책 #1 폐기) / TB_MCM_SEC_ROLE_MAPPING → `SecRoleMapping` | - | - | §6.5 (UserTask 패키지 — Entity / Repository / Service / DTO 명시) | ✓ |
| **JPA only + 패키지 (정책 #1)** | Entity = `mcm.entity.*` (모듈 직속, 가이드 §3-1) / Repository = `mcm.repository.SecObjRepository` (native query 허용) / Service+DTO = `mcm.csa.commObjMng.{service|dto}.*` (가이드 §6-A-1/§7-1) / audit = `McmAuditEntity` 상속 (cma 정본) | - | - | §6.5 | ✓ |

> **§F 결과**: As-Is 11 변환점 + **To-Be 정책 #1/#6 (A) 3 신규 행** = **14 행** 모두 분석리포트 §11 인용 + 영향 SQL/Entity 1:1 매핑 — 14 행 ✓.

---

## §G. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 분석 단계 식별 항목 사용자 결정 완료 — 활성 확인필요 = **0 건**. 결정 내용은 분석리포트 §12 와 동일하며, 본 정합체크서 §A~§F 본문에 1:1 반영됨. 본문 반영 위치: §6 (SQL ID 6→5) / §8 (BPMN action 3 + 가이드 4 "해당 없음" + Task_0wm0wlq 폐기) / §9 (audit McmAuditEntity 통일 — 정책 #6 (A)) / §9.6 (DMES 132→108 컬럼) / §10 (LV-001 폐기 + 재정렬) / §11 (#9 McmAuditEntity + #12 APP_HOST 폐기 + #13 Entity 명명).

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| audit (cactus-core 정본) | `McmAuditEntity` 상속 (cma 정본 패턴) — 8 audit 컬럼 (`C_*` / `U_*` 8 + `VER` 1) JPA `@PrePersist` / `@PreUpdate` 자동 채움. As-Is `ref_Audit` fragment 3 회 호출 → To-Be Entity 레이어 자동 처리 | 분석 §9 / §11 / 본 §F |
| 스키마/테이블명 | `TB_MCM_SEC_OBJ` / `TB_MCM_SEC_MENU` / `TB_MCM_SEC_MENU_FLD` / `TB_MCM_SEC_ROLE_MAPPING` 대문자 보존 + `schema=MCMAPUSER` 통일 (As-Is 일부 명시 / 일부 무명 prefix 혼재 → To-Be 모두 명시) | 분석 §9 / §11.1 / 본 §B / §F |
| BIZ_SYSTEM_CODE 폐기 (정책 #1) | S-001 / D-003 cbo_bizSystemCode 콤보 + 컬럼 / LV-001 / BPMN Task_0wm0wlq 모두 폐기 (Q-NEW-001 동시 자동 해소) | 분석 §3 / §6 / §9 / §10 / §11 / 본 §C / §F |
| APPHOST 카탈로그 폐기 | §9.4 + §9.6.4 APPHOST 시트 카탈로그 폐기 (Q-NEW-001 자동 해소) | 분석 §9 / 본 §F |
| BPMN action enum 6 정합 | action 7→6 enum (lov 노드 제거) | 분석 §8 / BPMN §1.1 / 본 §C |
| As-Is OBJECT_ID 자동 조합 mismatch | D-004 핸들러 (xfdl:556) `{MENU_ID 전체}::{ID}` vs D-005 핸들러 (xfdl:565) `{MENU_ID 앞 3자}::{ID}` mismatch — As-Is 보존 (마지막 호출이 덮어쓰기 동작) | 분석 §10.1 / 본 §E |
| As-Is fn_msgSuccessSave 미선언 | xfdl:467 의 `fn_msgSuccessSave` 변수 미선언 = As-Is 잠재 ReferenceError. As-Is 보존 | 분석 §4.4 / 본 §E |
| As-Is SYSTEM_CODE 2회 중복 set | xfdl:419, 422 동일 행에서 `SYSTEM_CODE="MES"` 2회 set — As-Is 보존 | 분석 §10.1 / 본 §E |
| As-Is ed_st_* 오타 / 라벨 더블 스페이스 / cbo_bizSystemCode 동명 이중 / 디자인 더미 / cbo_USE_TP reset index | xfdl:94 `ed_st_start_active_date` 오타 / xfdl:117 "외부  접속 주소" 더블 스페이스 / div_search·div_detail 양쪽 동일 `cbo_bizSystemCode` id / `value="USD"`·`text="부산역 CY"` 디자인 더미 / xfdl:411 `cbo_USE_TP.set_index(1)` (기본값 "Y" index=0 와 mismatch) — 모두 As-Is 보존 | 분석 §3.5 등 / 본 §E |
| Entity 명명 (정책 #6 (A)) | `SecObj` / `SecMenu` / `SecMenuFld` / `SecRoleMapping` (`mcm.entity.*` 모듈 직속) — AppHost Entity 신설 ✗ (정책 #1 폐기). 기존 mcm-core Sec* legacy 와 공존 | 분석 §11.1 / 본 §F |
| As-Is/To-Be 표준 우선 원칙 | 정책 #4 (0) — As-Is 1:1 보존 최우선 + To-Be 정정/제거 결정은 본문 별도 명시 | 분석 §0 / 본 §H |

---

## §H. 환경 제약 명시 종합 (사용자 요구사항 [§10] / [§13])

| # | 환경 제약 | 영향 절 | 처리 |
|---|---|---|---|
| 1 | Runner / R14-Step0 / manifest 9 파일 검증 미적용 | §A.1 (A-R12-1, A-R12-4) + §A.3 + §D.4 | ✗ + 사유 명시 ("Runner config mui 미지원 — 사용자 결정으로 생략") |
| 2 | 가이드 템플릿 WinForms 전제 항목은 mui 등가물로 매핑 | 분석리포트 §0 + 본 §A.1 (A-T1A / A-R12-3 / A-R12-5) | mui 등가 매핑 (designer.cs → xfdl Layout / cs Click+= → xfdl onclick / sp.sql @Case → BPMN sequenceFlow name 분기 / Mapper.xml inline SQL / ref_Audit → cactus-core CactusAuditEntity) |
| 3 | As-Is = Oracle (`\|\|`/UPPER/ROWNUM/SUBSTR/INSTR/LENGTH/NOT EXISTS/`MCMAPUSER.`+무명 prefix 혼재) → To-Be = MSSQL `sample_dmes` `MCMAPUSER` 스키마 (As-Is 테이블명 보존) + **6 정책 결정 #6 (A)**: `McmAuditEntity` 상속 (cma 정본 패턴) audit 자동 적용 | §F + 분석 §11 | 14 변환점 명시 (As-Is 11 + To-Be 정책 3) — 모든 결정 사항 본문 반영 |
| 4 | UserTask Java 클래스 ✗ — ScriptTask 만 사용 | 분석 §7 + BPMN §3 | csa Java 디렉토리 ls 검증으로 부재 명시 |
| 5 | 가이드 표준 6 action enum 대비 — search/save 1:1 매핑 + 4 "해당 없음" + 추가 lov 1 enum | BPMN §1.1 + §2.4~§2.6 | 모든 4 "해당 없음" 사유 명시 |
| 6 | DMES Excel xlsx 컬럼 카탈로그 본격 추출 (Q-001 해소 2026-05-30 / Q-NEW-001 해소 2026-05-31 — 정책 #1 APP_HOST 폐기로 자동 해소) | §A.2 + §G + 분석 §9.6 / §12 | Q 모두 해소 (활성 0) |
| 7 | **6 정책 결정 일괄 반영 (2026-05-31)** — #1 APP_HOST/BIZ_SYSTEM_CODE 폐기 + cma 정본 패턴 + schema=MCMAPUSER + 테이블명 As-Is 대문자 + Entity `mcm.entity.*` + Service/DTO `mcm.csa.commObjMng.{service|dto}` + JPA only + McmAuditEntity 상속 / #2 (4)/#3/#5/#4 (0) cross-cutting / #6 (A) Entity 명명 As-Is 직역 = SecObj/SecMenu/SecMenuFld/AppHost/SecRoleMapping (기존 mcm-core 와 공존) | 분석 §11/§12 + 기능 §3/§4/§5/§6 + 디자인 §3/§4/§7 + BPMN §1/§2/§3/§4/§5/§6 + 정합 §A/§B/§C/§D/§E/§F/§G/§H | 4 산출물 본문 동기화 완료 |

> 모든 환경 제약 명시 + 정합체크서 §A / §D 의 ✗ 사유가 사용자 결정에 의한 미적용임을 명시 — 본 ✗ 는 **설계 미완성으로 판정하지 않는다**.

---

## §I. 정합체크 종합 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A 구조 동일성 + 누락 | ✓ (환경 제약 명시 조건) | A.1 2 행 ✗ + A.3 ✗ — 모두 사용자 결정 [§10] 사유. A.2 Q 모두 해소 (Q-001 2026-05-30 + Q-NEW-001 2026-05-31) |
| §B 명명 규칙 | ✓ | 모든 행 ✓, MES 단일 룰 적용 + To-Be 정책 #1 제외 카운트 반영 |
| §C 5축 정합 | ✓ | 15 일치 키 모두 ✓ (S 3→2 / G 15→14 / D 16→15 / Mapper 6→5 / BPMN 7→6 / 8→8 모두 As-Is/To-Be 정합) |
| §D 반복 결정성 | ✓ (환경 제약 명시 조건) | D.4 9 파일 ✗ — 사용자 결정 [§10] 사유. D.3 APP_HOST 폐기 + Entity 명명 직역 반영 |
| §E As-Is 누락 0 | ✓ | xfdl 전수 + Java "해당 없음" + Mapper 6→5 SQL + BPMN 9→8 flow + 결함 15 건 모두 As-Is 1:1 보존 |
| §F To-Be 변환점 | ✓ | 14 변환점 모두 cite (As-Is 11 + To-Be 정책 #1/#6 (A) 3 신규) |
| §G Q-NNN 추적 | (추적용) | **활성 0 건** (Q-001 해소 2026-05-30 + Q-NEW-001 해소 2026-05-31 — 정책 #1 자동 해소) |
| §H 환경 제약 명시 | ✓ | 7 환경 제약 모두 사유 등재 (6 정책 결정 추가) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §J 사용자 검수 이력 (2026-06-02 ~ 2026-06-05) | ✓ | W5 정합 (J-01 ~ J-07) + Round 4 (J-08 ACCESS_TP / J-09 FORM_URL) + Round 5 (J-10 OBJECT_ID readOnly) + Round 6 (J-11a N/A) + Round 7 (J-11b btn_close 제거) 총 12 항목 본문 반영. J.1 cross-ref + J.2 미반영 항목 (후속 worker) 명시 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **설계 완성 판정**: §A ~ §F 6 개 절 모두 ✓ (환경 제약 ✗ 는 사용자 결정 사유 등재로 우회) + §J W5 / Round 4/5 + Round 6/7 사용자 검수 이력 등재 → **설계 완성 + W5 정합 + Round 6~7 btn_close 제거 동기화 완료**.

---

## §J. 사용자 검수 이력 (W5 정합 + Round 4/5 정책 동기화, 2026-06-02 ~ 2026-06-04)

> 본 §J 는 5 종 설계 산출물 1차 완성 (2026-05-31) 이후, **csa 8 화면 W5 패턴 전파 + ToBe 구현 진행 중 사용자 결정 이슈**의 정책 결정과 본문 반영 이력을 기록한다. 각 항목은 디자인설계서 / 정합체크서 본문에 1:1 반영되어 있으며, As-Is 위반 여부 + 본문 반영 §위치 + 정책 사유를 명시한다.

| # | 변경 일자 | Round | 항목 | As-Is 위반 여부 | 결정 / 본문 반영 §위치 |
|---|---|---|---|---|---|
| J-01 | 2026-06-02 | W5 A | **레이아웃 (ContentBody root + column stacker div + Row1 (메인+Detail) + Row2 (sub1+sub2))** | **As-Is 보존** (좌우 분할 구조 1:1) — 자동 2x2 grid collapse 회피는 ToBe shared 컴포넌트 정합 결함의 정책 우회 | 디자인 §3.1.1 ContentPanel 비율 + 컬럼 스태커. 본 화면은 sub 그리드 0 이라 Row2 미사용 (표준 보존만 명시) |
| J-02 | 2026-06-02 | W5 B | **Detail wrapper (marginTop:32 + height:auto + 28px gray header "상세 정보" + border #d4dae0 + bg #fff)** | **As-Is 보존** (AsIs `edt_dtl_info "상세 정보"` 라벨 1:1 등가) — header 라인 정렬 정책은 ToBe wrapper 차원 보강 | 디자인 §3.1.2 Detail wrapper 배경 체계 |
| J-03 | 2026-06-02 ~ 2026-06-03 | W5 C | **Form row (다중 컴포넌트 행 flex+gap:8+space-between / 우측 버튼 width:110+flexShrink:0 / Button style width:100%)** | (해당 없음) | 디자인 §3.1.3 Form row 정렬 정책. 본 화면 적용 행 0 — csa 8 화면 표준 보존만 명시 |
| J-04 | 2026-06-03 | W5 D | **Grid editable:false 전체 + 날짜 toDateInputValue yyyy-MM-dd + code LABEL_MAP (USE_TP)** | **As-Is 보존** (Master 클릭→Detail 동기화 UX-001 BindItem 등가) — ToBe Master Grid 읽기 전용 + Detail 편집 전담 패턴 | 디자인 §4.1.1 ToBe Grid 편집 정책 |
| J-05 | 2026-06-03 | W5 E | **AsIs commonTopButton 정합 (btn_close 추가) + row-state pre-disable 제거 (isSearching \|\| isSaving 만) + 핸들러 V-NNN ErrorModal** | **As-Is 보존** (4 버튼 정합 = AsIs xfdl 보존) — row-state 사전 disable → 핸들러 진입 검증으로 정책 이동 (UX 단계 변경) | 디자인 §5.6 ToBe 버튼 활성화 정책. btn_close 는 §5.1 commonTopButton 표에 B-004 로 등재 |
| J-06 | 2026-06-02 | W5 F | **자동조회 (useEffect → loadList(DEFAULT_FILTERS))** | **As-Is 등가** (xfdl `gfn_formOnLoad(obj,true)` 1:1) | 디자인 §5.7 자동조회 정책. DEFAULT_FILTERS = `{OBJECT_ID:"", USE_TP:"Y"}` (S-001 폐기 반영) |
| J-07 | 2026-06-03 | W5 G | **BE 시간 (END_OF_TIME = LocalDateTime.of(9999,12,31,0,0,0) / parseLocalDateTime → T00:00:00)** | **As-Is 등가** (xfdl `END_ACTIVE_DATE="99991231"` 의 LocalDateTime 도메인 표현) | 디자인 §5.8 BE 시간 표준 정책 |
| J-08 | 2026-06-03 | Round 4 | **ACCESS_TP 2 옵션 (As-Is 3 enum `1 내부 neXacro` / `2 외부 neXacro` / `3 외부 url` → ToBe 2 enum `내부` / `외부`)** | **As-Is 위반 — ToBe 정책 결정** | 디자인 §4.1.2 ACCESS_TP 2 옵션 정책. LABEL_MAP 폐기 (value=label). DataInitializer DDL ALTER (VARCHAR(1)→VARCHAR(10)) + 기존 row 멱등 UPDATE (`1`/`2`→`내부` / `3`→`외부`). 사유: neXacro 종속 enum (1/2) ToBe 의미 없음, 외부 url 만 외부 호출 → 의미 단위 통합 |
| J-09 | 2026-06-03 | Round 4 | **FORM_URL ToBe 라우팅 (As-Is `${OBJECT_ID}.xfdl` → ToBe `{group}/{OBJECT_ID}`, 예: `csa/commObjMng`)** | **As-Is 위반 — ToBe 정책 결정** | 디자인 §4.1.3 FORM_URL ToBe 라우팅 정책. group = SEC_MENU.PARENT_MENU_ID. BE 신규 메서드 `findOneParentMenuIdByObjectId` + 응답 row 에 PARENT_MENU_ID 컬럼 추가. DataInitializer FORM_URL 멱등 UPDATE (SEC_MENU JOIN). UX-004 V-401~V-403 값 패턴만 ToBe 갱신 (분기 자체 보존). 사유: neXacro xfdl 파일명 ToBe 무의미 |
| J-10 | 2026-06-04 | Round 5 | **OBJECT_ID readOnly 정책 (Detail D-001 OBJECT ID Input `readOnly={selected.nativeeditor_status !== "inserted"}`)** | **As-Is 보존 + ToBe 정책 보강** (PK 변경 차단) | 디자인 §4.1.4 OBJECT_ID readOnly 정책. V-502 MENU_ID+ID 자동 합성 분기 보존 (신규 행만 유효). 사유: 기존 행 OBJECT_ID (PK) 변경 시 데이터 무결성 파괴 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| J-11a | 2026-06-04 | Round 6 | **N/A — 본 화면 영향 ✗** | (해당 없음) | Round 6 변경은 다른 화면 대상. 본 화면 본문 갱신 ✗ |
| J-11b | 2026-06-04 ~ 2026-06-05 | Round 7 | **btn_close (B-004) 완전 제거** — AsIs xfdl commonTop basic 4 의 마지막 btn_close 를 ToBe 완전 폐기 / PageLayout buttons 배열에서 entry 삭제 + 미사용 handleClose dead code 제거 / 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe 3 버튼 표준 (조회/초기화/저장) | **As-Is 위반 — ToBe 정책 결정** (B-004 폐기) | 디자인 §1.2 PageLayout buttons 3 / §2.2 구조도 commonTopButton 3 / §5.1 B-004 폐기 / §5.6 W5 E 표 B-004 행 폐기 / §8 자체 검증 B 활성 10→9 / §J Round 7 등재. 사유: portal 탭 close 는 host (PortalShell) 가 처리 — 화면 내부 닫기 버튼 의미 ✗ |

### J.1 변경 영향 요약 (4 산출물 cross-ref)

| 항목 | 디자인설계서 | 정합체크서 | BPMN 영향 | 기능설계서 영향 |
|---|---|---|---|---|
| J-01 ~ J-07 (W5 A~G) | §3.1.1 / §3.1.2 / §3.1.3 / §4.1.1 / §5.6 / §5.7 / §5.8 | 본 §J + §J.1 | (영향 ✗ — 화면 표시 정책만 변경) | (영향 ✗ — V-NNN 단계만 사전→사후 이동) |
| J-08 (ACCESS_TP 2 enum) | §4.1.2 | 본 §J | §1.1 lov dataset enum 본문 (3→2 enum) — **본 정합체크 결과 향후 BPMN 본문 갱신 필요** | §5.2 lov SQL 본문 — DDL ALTER + 멱등 UPDATE 정책 cite |
| J-09 (FORM_URL ToBe 라우팅) | §4.1.3 | 본 §J | §1.1 응답 row schema (PARENT_MENU_ID 신규) — **본 정합체크 결과 향후 BPMN 본문 갱신 필요** | §5.2 신규 SQL `findOneParentMenuIdByObjectId` — **본 정합체크 결과 향후 기능설계서 본문 갱신 필요** |
| J-10 (OBJECT_ID readOnly) | §4.1.4 | 본 §J | (영향 ✗) | §6.6 V-501/V-502 분기 신규 행 제한 — **본 정합체크 결과 향후 기능설계서 본문 갱신 필요** |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| J-11a (Round 6 N/A) | (영향 ✗) | 본 §J | (영향 ✗) | (영향 ✗) |
| J-11b (Round 7 btn_close 제거) | §1.2 / §2.2 / §5.1 / §5.6 / §8 / §J | 본 §J + §J.1 + §A.2 / §C / §D.1 / §I / §K | (영향 ✗ — BPMN saveCmObj 흐름 무관) | §5.1 B-004 폐기 — **본 정합체크 결과 향후 기능설계서 본문 갱신 필요** |

### J.2 미반영 항목 (본 동기화 작업 범위 외)

| 항목 | 미반영 사유 |
|---|---|
| 기능설계서 §5.2 신규 SQL `findOneParentMenuIdByObjectId` 본문 등재 | 본 worker 작업은 디자인설계서 + 정합체크서 동기화 범위. 기능설계서 본문 갱신은 후속 worker 작업으로 분리 (J.1 cross-ref 명시) |
| BPMN설계서 §1.1 응답 row schema 갱신 (PARENT_MENU_ID) | 동일 — BPMN 본문 갱신은 후속 worker 작업 |
| BPMN설계서 §1.1 ACCESS_TP lov dataset enum 본문 갱신 (3→2 enum) | 동일 |
| 기능설계서 §6.6 V-501 / V-502 신규 행 제한 본문 갱신 | 동일 |
| DataInitializer / Migration SQL 본문 등재 | 본 산출물은 설계 단계. 실제 SQL 본문은 코드 단계 (`db/migration` 또는 Java DataInitializer 클래스) 산출물 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 기능설계서 §5.1 B-004 btn_close 폐기 본문 갱신 (Round 7) | 본 worker 작업은 디자인설계서 + 정합체크서 동기화 범위. 기능설계서 본문 갱신은 후속 worker 작업으로 분리 (J.1 cross-ref 명시) |

---

## §K. Phase 5 자체 검증 (§6.14 4질문)

| 질문 | 답 |
|---|---|
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 1. 14항 위반? | **No** — §A~§F 6 절 모두 ✓ 판정. §A.3 / §A.A-R12-1 / §D.4 = ✗ + mui 사유 명시 (사용자 결정 사유 등재). 6 정책 결정 일괄 반영 완료 (2026-05-31). W5 정합 + Round 4/5 정책 (J-01 ~ J-10) §J 일괄 등재 완료 (2026-06-02 ~ 2026-06-04). Round 6 (J-11a N/A) + Round 7 btn_close 제거 (J-11b) §J 등재 완료 (2026-06-04 ~ 2026-06-05). |
| 2. 검증 안 한 부분? | **No** — Q-001 해소 (2026-05-30 §9.6 신설 / 132 컬럼). Q-NEW-001 해소 (2026-05-31 — 정책 #1 APP_HOST 폐기 자동 해소). **활성 Q = 0**. §J.2 미반영 항목은 본 worker 작업 범위 외로 명시 — 본 정합체크 미흡 ✗. Round 7 B-NNN 수 As-Is 10 → To-Be 9 (B-004 폐기) 반영 §A.2 / §C / §D.1 일관 갱신. |
| 3. 그대로 수용? | **No** — As-Is 결함 15 종 모두 §E.5 명시 + 4 설계서 본문 As-Is 보존. To-Be 결정/위임 별도 명시. 정책 #1 폐기 항목 + W5 정합 + Round 4/5 결정 + Round 7 btn_close 제거 모두 As-Is 인용 + ToBe 결정 명시 보존. |
| 4. 임의 합리화? | **No** — 가이드 표준 6 action enum 대비 본 화면 3 action 매핑 + 4 "해당 없음" 사유 명시 (BPMN §2.4~§2.6). To-Be 정책 #1 후 action enum 3 종 유지 (lov 본문만 1 dataset 축소). Round 4 ACCESS_TP / FORM_URL 변환 + Round 5 OBJECT_ID readOnly + Round 7 btn_close 제거 도 사용자 결정 사유 본문 명시 (portal 탭 close = host 처리). |

> Phase 5 모두 No → 5 종 설계 산출물 완성 + W5 정합 + Round 4/5 정책 + Round 6~7 btn_close 제거 본문 동기화 완료.
