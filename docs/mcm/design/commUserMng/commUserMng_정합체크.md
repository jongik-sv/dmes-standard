---
screenId: commUserMng
asIsId: CommUserMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-06-05
작성자: Agent
---

# 사용자 관리 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 Q-NNN = **0 건** (2026-05-31 6 정책 결정 일괄 적용으로 13건 해소 — 분석 §12).
> **환경 제약 (사용자 결정 [§10])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §A.3 / §A.A-R12-1 / §D.4 = ✗ + 사유 명시.
> **2026-05-31 갱신**: 6 정책 결정 일괄 반영. 정책 #1 (mcm-core 보존 + McmAuditEntity + Entity `mcm.entity.*` + Service `mcm.csa.commUserMng.*` + schema=MCMAPUSER) / 정책 #2 (EAI → TB_MCM_DEPT_INFO) / 정책 #3 (12 항목 — A 오타 / B 폐기 SQL / C Entity 흡수 / D 빈 콤보 미반영 / E 자연 흡수 / F yml + 신규 페이지 / G PortalShell+RBAC / H schema 보존) / 정책 #4 (As-Is/To-Be 표준 우선) / 정책 #6 (Entity 직역).
> **2026-06-04 갱신 (Round 5)**: 사용자 검수 결과 본 화면 = csa 7 + cme 1 화면의 **W5 reference (정본)** 로 확정. 결함 3 건 (J-014 부서 LoV 모달 신설 / J-015 DEPT 시드 4 row 추가 / J-016 USER_ID readOnly 회귀 점검) 모두 본문 + 코드 + 정합체크 동시 갱신 — `feedback_q_resolution_propagation.md` 정합. 신규 Q-NNN 등재 ✗. 상세 = §J.8.
> **2026-06-04 갱신 (Round 6)**: 계정생성 (B-001) / 수정 (B-004) / 계정삭제 (B-002) 3 버튼 → **"저장" 1 버튼 통합 (`saveCmUser` 단일 action)**. master row 의 `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete 분기. END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 applyDelete + today 정정 (계정삭제 동작 fix). Detail D-019 정보처리의뢰서 / D-020 처리사유 제거. 상세 = §J.9 + §K.
> **2026-06-05 갱신 (Round 7)**: AsIs xfdl `btn_close` (commonTop basic 4 의 마지막) → ToBe **완전 제거**. PageLayout buttons 배열 entry 삭제 + unused `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 → ToBe **3 버튼 표준 (조회/초기화/저장)**. 사유: portal 탭 close 는 host 가 처리. 상세 = §J.9 + §K.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§18 / §1~§11 / §1~§7 / §1~§7 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (기능 §4.2 L-NNN 해당 없음 / §5.1-1 GB-NNN 해당 없음 / 디자인 §5.7 GB 해당 없음) | (해당 없음) | ✓ | ✓ | (해당 없음) | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§13] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §10에 의해 신설 + §17 / §18 = 사용자 요구사항 §17.2 명시 신설) | ✓ | ✓ | ✓ | ✓ | §0 / §17.2 / §18 은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 10 (5 표준 + 5 추가: A-TITLE / A-FOLD / A-MAIN-RIGHT-TOP / A-MAIN-RIGHT-BOT / A-POPUP-DEL / A-FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | A-MAIN 3단 분할 (LEFT/CENTER/RIGHT 상하) + Form 내부 모달 + TITLE/FOOTER |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §10 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl + java) + D2 (Mapper.xml SQL) 만 존재, D3 SP 의존 ✗ + 외부 EAI 테이블 (EAIUSER.IF_DSHRMMCMHD02) 1 종 cite | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 미존재 (Oracle SP/함수/트리거 미사용 — Mapper.xml inline SQL 만). 외부 EAI 테이블 Q-002 등재 |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / oncellclick / onheadclick / onkeydown / onrowposchanged / onchanged / onload 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.4 / §10 의 메서드 표 34 행으로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 20 SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§10] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치 + 본 화면 특화 NNN 확장)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 3 | 3 | 3 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 컬럼 (G-NNN) | 17 | 17 | 17 | (해당 없음) | - | 0 (Q-014 해소 2026-05-31) | 0 | ✓ |
| 보유 역할 그리드 (GR-NNN) | 2 | 2 | 2 | (해당 없음) | - | 0 | 0 | ✓ |
| 추가 가능 역할 그리드 (GL-NNN) | 2 | 2 | 2 | (해당 없음) | - | 0 | 0 | ✓ |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 상세 필드 (D-NNN) | 20 (AsIs 보존) | 20 | 20 | (해당 없음) | **ToBe 미반영 = D-013/014/015 (Q-005) + D-019/020 (Round 6, 모달 DP-005/006 만 유지)** | 0 (Round 6 — D-019/020 정보처리의뢰서 / 처리사유 Detail 제거 결정) | 0 | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업 내부 필드 (DP-NNN) | 6 | 6 | 6 | (해당 없음) | - | 0 | 0 | ✓ |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 버튼 (B-NNN) | 18 (AsIs 보존) | 18 | 18 | (해당 없음) | **ToBe 통합/제거 = B-001/B-002/B-004 (Round 6 — "저장" 통합) + B-005 (Round 7 — 완전 제거). 신규 = B-004' 저장 + B-NEW 초기화 + B-019 부서 검색 (Round 5) → ToBe 16 + 신규 3** | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 3 | 3 | 3 | (해당 없음) | - | 0 (Q-013 해소 2026-05-31 — P-003 신규 FE 페이지 결정) | 0 | ✓ |
| 상태값 (ST-NNN) | 11 | 11 | (참조만) | (참조만) | - | 0 (Q-014 해소) | 0 | ✓ |
| 코드값/LoV (LV-NNN) | 8 | (참조만) | (참조만) | (해당 없음) | - | 0 (LV-005 Q-002 해소 / LV-006 Q-005 해소 2026-05-31) | 0 | ✓ |
| Mapper.xml SQL ID | 20 | 20 (§5.2 인용 11 + §6 인용 9 외부) | (해당 없음) | 20 (§6.4 sqlKey + §6.5 외부) | - | 0 | 5 (To-Be 제거 결정 — Q-003 해소 2026-05-31) | ✓ |
| BPMN 노드 / SequenceFlow | 18 노드 / 26 flow | (해당 없음) | (해당 없음) | 18 / 26 (§2.1~§2.11 전수 + §3 + §4) | - | 0 | 0 | ✓ |
| Java UserTask 클래스 | 7 | (해당 없음) | (해당 없음) | 7 (§3) | - | 0 | 0 | ✓ |
| xfdl Script 메서드 | 34 (§10) | (참조만) | (참조만) | (참조만) | - | 0 | 0 | ✓ |
| 사용 테이블 | 6 (TB_MCM_SEC_USER / TB_MCM_SEC_USER_MAPPING / TB_MCM_SEC_USER_PWD / TB_MCM_SEC_ROLEGROUP / TB_MCM_SEC_USER_HIS / TB_MCM_SEC_USER_ROLL_HIS — 분석 §9.1 154 컬럼) + **신규 1 (TB_MCM_DEPT_INFO — 정책 #2 / Q-002 해소 / §9.1.7 11 컬럼)** | (참조만) | (해당 없음) | (참조만) | - | 0 (Q-002 해소 2026-05-31) | 0 | ✓ |
| 검증 룰 (V-NNN) | 30 (V-001~V-007 / V-101~V-108 / V-201~V-207 / V-301~V-308 / V-401 / V-501~V-503 / V-601~V-604 / V-701~V-704 / V-801~V-806) | 30 | (참조만) | (해당 없음) | - | 0 | 0 | ✓ |
| 메시지 (M-NNN) | 34 (§10) | 34 (§10 인용) | (참조만) | (참조만) | - | 0 | 0 | ✓ |
| 결함 (F-NNN) | 14 (§10.2) | (참조만) | (참조만) | (참조만) | - | 0 (F-001~F-014 모두 As-Is 보존 + To-Be 정정/폐기/미반영 결정 완료 2026-05-31) | 0 | ✓ |

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
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 사용자 관리 (commUserMng) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commUserMng | MES: camelCase `{화면명}` (모듈/그룹 토큰 ✗) | 01 A.3 — `CommUserMng` → `commUserMng` | ✓ |
| pageName | commUserMng | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | commUserMng | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | commUserMng | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | commUserMng.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commUserMng | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | P-001 / P-002 / P-003 (flat) | (전체 공통) | 01 A.4.7 | ✓ |
| 필드/컬럼/버튼 ID | S-001~003 / G-001~017 / GR-001~002 / GL-001~002 / D-001~020 / DP-001~006 / B-001~018 / P-001~003 / FX-001~008 / DS-001~007 / LV-001~008 / ST-001~011 / V-001~806 / M-001~034 / F-001~014 / T-001~027 (T-026/T-027 신규 추가 2026-05-31) / UX-001~009 / P-1~P-6-A (정책 결정 행) | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) — schema = `MCMAPUSER` (정책 #1 / #3 (H)) | (전체 공통) | 01 A.4.9 | ✓ |
| Entity 명명 (정책 #6 (A)) | SecUser / SecUserMapping / SecUserPwd / SecRoleGroup / SecUserHis / SecUserRollHis / DeptInfo (7 Entity — `mcm.entity.*` 직속) | (정책 #1 / #6 (A)) | 분석 §11.1 | ✓ |
| Service / DTO 패키지 (정책 #1) | `mcm.csa.commUserMng.{service\|dto}` (cma 정본 패턴) | (정책 #1) | 분석 §11.0 P-1 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / 그리드 cell `text=` 1byte 일치 | (전수 일치 — 분석 §3.2 / §3.3 / §3.4 / §3.5 / §3.6 / §3.7) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `USER_ID` / `USER_EMP_NO` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum + 추가 5 (A-TITLE / A-FOLD / A-MAIN-RIGHT-TOP / A-MAIN-RIGHT-BOT / A-POPUP-DEL / A-FOOTER) — 사용자 요구사항 [§13] 가이드 §외 신설 ✗ → 디자인설계서 §3.1 에 5 표준 + 5 추가 명시 | ✓ (A-FILTER / A-MAIN-LEFT / A-MAIN-CENTER / A-MAIN-RIGHT-TOP/-BOT / A-BTN 통합 / A-TITLE / A-FOLD / A-POPUP-DEL / A-FOOTER) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — 본 화면은 TextBox (S-001 + D 다수) + Combo (S-002/003 + D-012~015) + Calendar (D-005/006) + Radio (D-016/018) + Static (라벨/메시지) + Grid cell (combo/text) | ✓ | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — varchar(90) / varchar(10) / varchar(300) / STRING(256) 모두 cite | ✓ (분석 §3.6 + 기능 §4.1 + 디자인 §3.4) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commUserMng × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | commUserMng (§1) | commUserMng (§1.2) | commUserMng (frontmatter / §1.2) | commUserMng (process id / serviceId) | commUserMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| pageName | commUserMng | commUserMng | commUserMng | commUserMng | commUserMng | ✓ |
| pageId | commUserMng | commUserMng | commUserMng | commUserMng | commUserMng | ✓ |
| serviceId | commUserMng | commUserMng | commUserMng | commUserMng | commUserMng | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (3 행: S-001 사용자 / S-002 사용 여부 / S-003 내부 외부 구분) | §3.1 (3 행 동일) | §3.2 (3 행 좌표 포함) | (해당 없음 — BPMN 은 컬럼 단위 인용 ✗) | (분석 §11 To-Be 변환점) | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 (17 행: G-001~G-017) | §3.2 (17 행 동일) | §4.1 (17 행 동일) | (참조만) | (분석 §17.4.1) | ✓ |
| 컬럼ID (GR-NNN 전수) | §3.4 (2 행: GR-001~GR-002) | §3.2 (2 행 동일) | §4.2 (2 행 동일) | (참조만) | (분석 §17.4.4) | ✓ |
| 컬럼ID (GL-NNN 전수) | §3.5 (2 행: GL-001~GL-002) | §3.2 (2 행 동일) | §4.3 (2 행 동일) | (참조만) | (분석 §17.4.5) | ✓ |
| 상세필드ID (D-NNN 전수) | §3.6 (20 행: D-001~D-020) | §4.1 (20 행 동일) | §3.4 (20 행 좌표 포함) | (참조만) | (분석 §17.4.3 updateCommUser 12 컬럼) | ✓ |
| 팝업 내부 필드 (DP-NNN 전수) | §3.7 (6 행: DP-001~DP-006) | §4.3 (6 행 동일) | §3.7 (6 행 좌표 포함) | (참조만) | - | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (18 행: B-001~B-018) | §5.1 (18 행 동일) | §5.1 / §5.2 / §5.3 / §5.4 / §5.5 / §5.6 (5+1+2+4+4+2 = 18) | (참조만 — §1.2 액션 트리거 매핑) | - | ✓ |
| 팝업ID (P-NNN 전수) | §3.7 + §3.9 (3 행: P-001 / P-002 / P-003) | §9 (3 행 동일) | §6 (3 행 동일) | (참조만) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | §6 + §17.4 (TB_MCM_SEC_USER 본 컬럼 17 / TB_MCM_SEC_USER_MAPPING / TB_MCM_SEC_USER_PWD / TB_MCM_SEC_ROLEGROUP / TB_MCM_SEC_USER_HIS / TB_MCM_SEC_USER_ROLL_HIS) + **TB_MCM_DEPT_INFO (§9.1.7 신규)** | §3.1 / §3.2 / §4.1 (G + GR + GL + D 인용) | §4 (Grid 컬럼 인용) | §5 (DTO 매핑) | §11 변환점 (**schema = `MCMAPUSER` 보존 — 정책 #1 / #3 (H) / Q-011 해소 2026-05-31 + EAI → TB_MCM_DEPT_INFO 신설 — 정책 #2 / Q-002 해소**) | ✓ |
| 상태코드 (statusCodes) | §10 + §10.1 (11 행: ST-001~ST-011) | §7 (11 행 동일) | §4.4 UX-NNN + §7.2 색상 강조 | (참조만 — Java status 분기) | - | ✓ |
| action 목록 | §1 + §8 (11 enum: searchCmUser / saveCmUser / regCmUser / deleteCmUser / reRegCmUser / searchUserRoleGrp / saveUserRoleGrp / searchRoleGrp / pwdinit / saveUserRoleGrpCopy / commonUserDept) | §5.2 (11 동일) | (참조만) | §1.2 (11 API + 11 action) + §2.1~§2.11 (11 흐름) + §6.2 (To-Be 명명) | §6.5 가이드 6 enum vs As-Is 11 enum 차이 명시 | ✓ |
| Mapper.xml SQL ID | §6 (20 SQL 전수) | §5.2 (action → SQL 매핑) | (참조만) | §1.2 (sqlKey 직접 명시) + §6.4 (To-Be sqlKey 명명) | §11 변환점 (Oracle → MSSQL) | ✓ |
| BPMN 노드 / SequenceFlow | §8.1 + §8.2 (18 노드 + 26 flow 전수) | (참조만) | (해당 없음) | §1 + §2 (11 흐름) + §3 (UserTask 7) + §4 (Task 7) | - | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | commUserMng | commUserMng | commUserMng | commUserMng | ✓ |
| asIsId | CommUserMng | CommUserMng | CommUserMng | CommUserMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commUserMng | commUserMng | commUserMng | commUserMng | ✓ |
| S-NNN 수 | 3 | 3 | 3 | (해당 없음) | ✓ |
| G-NNN 수 | 17 | 17 | 17 | (해당 없음) | ✓ |
| GR-NNN 수 | 2 | 2 | 2 | (해당 없음) | ✓ |
| GL-NNN 수 | 2 | 2 | 2 | (해당 없음) | ✓ |
| D-NNN 수 | 20 | 20 | 20 | (해당 없음) | ✓ |
| DP-NNN 수 | 6 | 6 | 6 | (해당 없음) | ✓ |
| B-NNN 수 | 18 | 18 | 18 (총합) | (참조만) | ✓ |
| P-NNN 수 | 3 | 3 | 3 | (참조만) | ✓ |
| ST-NNN 수 | 11 | 11 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 | 8 | (참조만) | (참조만) | (참조만) | ✓ |
| BPMN action 수 | 11 | 11 | (참조만) | 11 (§1.2 + §2) | ✓ |
| Mapper SQL 수 | 20 (활성 14 + 미사용 6) | 20 | (참조만) | 20 (§4 + §6.4) | ✓ |
| BPMN 노드 수 | 18 (StartEvent 1 + EndEvent 1 + Gateway 1 + Task 7 + UserTask 7 + 외 1=Task_0v3mxy0 — bpmn 본문 정수, 7+1=8 Task) | (참조만) | (참조만) | 18 (§3 UserTask 7 + §4 Task 7 + 외 4 = 18) | ✓ |
| BPMN sequenceFlow 수 | 26 | (참조만) | (참조만) | 26 (§2 흐름) | ✓ |
| Java UserTask 수 | 7 | (참조만) | (참조만) | 7 (§3) | ✓ |

### D.2 BPMN 기능 식별자 = `{screenId}_{기능명}` (사용자 요구사항 [명명 규칙 정본])

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

### D.3 테이블 명명 = `TB_{모듈명}_{역할}` (사용자 요구사항 [명명 규칙 정본]) — schema 정책 #1 / #3 (H) / Q-011 해소

| As-Is | To-Be 명명 안 |
|---|---|
| MCMAPUSER.TB_MCM_SEC_USER | **`MCMAPUSER.TB_MCM_SEC_USER` 확정 (정책 #1 / #3 (H) / Q-011 해소)** — As-Is 그대로 |
| MCMAPUSER.TB_MCM_SEC_USER_MAPPING | **`MCMAPUSER.TB_MCM_SEC_USER_MAPPING` 확정** |
| MCMAPUSER.TB_MCM_SEC_USER_PWD | **`MCMAPUSER.TB_MCM_SEC_USER_PWD` 확정** |
| (스키마 미지정) TB_MCM_SEC_ROLEGROUP | **`MCMAPUSER.TB_MCM_SEC_ROLEGROUP` 확정** |
| (스키마 미지정) TB_MCM_SEC_USER_HIS | **`MCMAPUSER.TB_MCM_SEC_USER_HIS` 확정** |
| (스키마 미지정) TB_MCM_SEC_USER_ROLL_HIS | **`MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS` 확정** |
| ~~EAIUSER.IF_DSHRMMCMHD02~~ | **`MCMAPUSER.TB_MCM_DEPT_INFO` 신설 (정책 #2 / Q-002 해소 / 분석 §9.1.7 11 컬럼)** — EAI 폐기 + DMES 자체 부서 마스터 |

> 사용자 결정 확정 (2026-05-31): schema = `MCMAPUSER` + 테이블명 As-Is 대문자 `TB_MCM_*` 보존 + EAI → 신규 `TB_MCM_DEPT_INFO` 마스터 신설.

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

| As-Is sequenceFlow id | name | 보존 여부 | 결과 |
|---|---|---|---|
| SequenceFlow_1 (Start → Gateway) | (없음) | ✓ As-Is 보존 | ✓ |
| SequenceFlow_0grwghu (saveCmUser) | saveCmUser | ✓ | ✓ |
| SequenceFlow_0tt1mbk (searchCmUser) | searchCmUser | ✓ | ✓ |
| SequenceFlow_0bb4b1a (searchUserRoleGrp) | searchUserRoleGrp\n | ✓ | ✓ |
| SequenceFlow_0e90wtm | (없음) | ✓ | ✓ |
| SequenceFlow_saveUserRoleGrp | saveUserRoleGrp | ✓ | ✓ |
| SequenceFlow_searchRoleGrp | searchRoleGrp | ✓ | ✓ |
| SequenceFlow_07entyn | (없음) | ✓ | ✓ |
| SequenceFlow_0eh8isc (pwdinit) | pwdinit | ✓ | ✓ |
| SequenceFlow_0v64ch1 | (없음) | ✓ | ✓ |
| SequenceFlow_19ojhvj | (없음) | ✓ | ✓ |
| SequenceFlow_105vwsz / 0alv1bb / 1gwazq0 / 0ugd21v / 0ssupae / 1944t12 / 0hchiuv / 1766mr8 / 0g8pzip / 05p4q2h / 1c1ioow / 01hi7kv / 15dc55q / 07aq563 / 0l2kcue (15 flow) | (name 일부) | ✓ As-Is 보존 | ✓ |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ (스키마 보존 결정) + D.4 ✗ + 사유 명시 + D.5 ✓ — **사용자 결정 사유에 따른 D.4 ✗ 는 설계 미완성으로 판정하지 않는다** → §D = **✓ (환경 제약 명시 조건)**.

---

## §E. As-Is 누락 0 점검 (사용자 요구사항 [§3, §4])

### E.1 xfdl 컴포넌트 전수

| xfdl 컴포넌트 종류 | 분석 §3 / §17.1 등재 수 | 검증 방법 | 결과 |
|---|---:|---|---|
| Form / Layout / Div (컨테이너) | 13 (div_bottom / div_main / div_mainGrd / div_rightMenu / div_mainDetail / div_detail / div_dept_cd / div_roleGrpId / div_rightRole / div_roleGrpIdList / div_rightRoleList / div_title / div_topMenu / div_search / div_deletePopup / div_search00 / div_leftMenu = 17, 합산 13 영역) | xfdl `<Div ...>` 전수 grep | ✓ |
| Static (라벨박스 cssclass=stc_WF_Box) | 21 (분석 §17.1 stc_Static1~30 — 본 화면 사용분) | xfdl `<Static ...>` 전수 grep | ✓ |
| Edit (TextBox + 라벨 readonly) | 35 (입력 + 라벨 합) | xfdl `<Edit ...>` 전수 grep | ✓ |
| Calendar | 3 (cal_start_active_date / cal_end_active_date in div_detail + cal_end_active_date in div_search00) | xfdl `<Calendar ...>` 전수 grep | ✓ |
| Combo | 5 (cbo_IN_OUT_EMP_TP / cbo_USE_TP / edt_in_out_emp_tp / edt_group_id1~3) | xfdl `<Combo ...>` 전수 grep | ✓ |
| Radio | 2 (rdo_PwdReset / rdo_SSOReset) | xfdl `<Radio ...>` 전수 grep | ✓ |
| Button | 9 (btn_fold / btn_PwdReset / btn_RoleCopy / btn_SSOPwdReset / btn_reRegister / btn_close (popup) / btn_save (popup) + 외부 commonTopButton 등록 5 = 14 + commonRightButton 등록 6 = 18 total B-NNN) | xfdl `<Button ...>` + commonTop/Right 등록 grep | ✓ |
| ImageViewer | 1 (img_MsgImg in div_deletePopup) | xfdl `<ImageViewer ...>` grep | ✓ |
| Grid | 3 (grd_main G-001~017 + grd_userRolegrp GR-001~002 + grd_rolegrpList GL-001~002) | xfdl `<Grid ...>` 전수 grep | ✓ |
| Dataset | 7 (ds_main / ds_userRolegrp / ds_rolegrpList / ds_inOutEmpTp / ds_useTp / ds_mainAll / ds_pwdtmp) | xfdl `<Dataset ...>` 전수 grep | ✓ |
| Script function | 34 (§10 메서드 표) | xfdl Script `this.X = function` 전수 grep | ✓ |
| 그리드 columns 전수 | G 17 + GR 2 + GL 2 = 21 컬럼 (§3.3 / §3.4 / §3.5 + §17.2 — formats / fields / 표시명 / bind / displaytype / combo 모두 등재) | xfdl `<Cell ...>` 전수 grep | ✓ |
| Bind (BindItem) | 14 (item0~13 — D-NNN bind) | xfdl `<BindItem ...>` 전수 grep | ✓ |

### E.2 Java 메서드 전수

| 클래스 | 메서드 수 | 분석 §7 등재 | 결과 |
|---|---:|---|---|
| DeleteCommUserMng | 1 (`run(Context, Task)`) | §7.3 (모든 라인 cite) | ✓ |
| PasswordInit | 1 (`run(Context, Task)`) | §7.5 (SSO/단건 2 분기 cite) | ✓ |
| RegCommUserMng | 1 (`run(Context, Task)`) | §7.2 (status="inserted" 분기 + bcrypt + 이력 cite) | ✓ |
| ReRegCommUserMng | 1 (`run(Context, Task)`) | §7.4 (단건 + UserException + 이력 cite) | ✓ |
| SaveCommUserMng | 1 (`run(Context, Task)`) | §7.1 (status="updated" 분기만 + 주석 처리 cite) | ✓ |
| SaveRoleGroupCopyHis | 1 (`run(Context, Task)`) | §7.7 (selectRoleMergeObject + mergePK cite) | ✓ |
| SaveRoleGroupHis | 1 (`run(Context, Task)`) | §7.6 (inserted/deleted RESP_GBN 분기 cite) | ✓ |

### E.3 Mapper.xml SQL ID 전수 (CommUserMngMapper namespace)

| SQL ID | 분석 §6 등재 | 결과 |
|---|---|---|
| selectCommUser | ✓ #1 | ✓ |
| selectCommUserAll | ✓ #2 | ✓ |
| selectCommUserForSave | ✓ #3 (사용 X — Q-003) | ✓ |
| insertCommUser | ✓ #4 | ✓ |
| updateCommUser | ✓ #5 | ✓ |
| deleteCmUser | ✓ #6 | ✓ |
| deleteCommUser | ✓ #7 (사용 X — Q-003) | ✓ |
| deleteCommUserMapping | ✓ #8 (사용 X — Q-003) | ✓ |
| deleteCommUserPwd | ✓ #9 (사용 X — Q-003) | ✓ |
| selectCommUserRoleGrp | ✓ #10 | ✓ |
| insertCommUserRoleGrp | ✓ #11 | ✓ |
| deleteCommUserRoleGrp | ✓ #12 | ✓ |
| selectCommRoleGrpList | ✓ #13 | ✓ |
| updateCommonPwdInit | ✓ #14 (사용 X — Q-003) | ✓ |
| mergeCommonPwdInit | ✓ #15 | ✓ |
| mergeCommonCopyRoleGrp | ✓ #16 | ✓ |
| updateCommonSSOPwdInit | ✓ #17 | ✓ |
| selectCommDept | ✓ #18 | ✓ |
| selectRoleMergeObject | ✓ #19 | ✓ |
| updateReRegUser | ✓ #20 | ✓ |

### E.3-1 외부 namespace SQL ID

| SQL ID | 분석 §6.1 등재 | 결과 |
|---|---|---|
| TB_MCM_SEC_USER_HIS_Mapper.insert | ✓ X-1 (Q-004) | ✓ |
| TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK | ✓ X-2 (Q-004) | ✓ |

### E.4 BPMN flow 전수

| BPMN 요소 | 분석 §8 등재 수 | 결과 |
|---|---:|---|
| startEvent | 1 (StartEvent_1) | ✓ |
| endEvent | 1 (EndEvent_1, incoming 11) | ✓ |
| exclusiveGateway | 1 (ExclusiveGateway_1, outgoing 11) | ✓ |
| task (CommonSelectTask 5 + CommonMultiSaveTask 1 + CommonInsertTask 1) | 7 | ✓ |
| userTask (com.dongkuk.dmes.UserTask) | 7 | ✓ |
| sequenceFlow | 26 | ✓ |

### E.5 결함 처리 (사용자 요구사항 [§4])

| 결함 ID | 위치 | 처리 |
|---|---|---|
| F-001: xfdl:411 "역활" comment | As-Is 보존 + **To-Be 정정 (정책 #3 (A) / Q-006 해소 / T-026)** | ✓ |
| F-002: xfdl:789 / 813 "역활" 메시지 | As-Is 보존 + **To-Be "역할" 정정 결정 (정책 #3 (A) / Q-006 해소 / T-026)** | ✓ |
| F-003: xfdl:794 `div_buttom` 오타 (NullReferenceException 버그) | As-Is 보존 + **To-Be `div_bottom` 정정 결정 (정책 #3 (A) / Q-007 해소 / T-027)** | ✓ |
| F-004: xfdl:825 `nErrorCode.DEPT_CD` 비표준 처리 | As-Is 보존 + Q-008 해소 (2026-05-30) — `libTran.xjs:287/362/394` 추적으로 As-Is 결함 (2번째 인자 number 에 객체 프로퍼티 접근) 확정. To-Be `strErrorMsg.DEPT_CD` 정정 결정 | ✓ |
| F-005: SaveCommUserMng.java:42~57 / 68~83 inserted/deleted 주석 | As-Is 보존 + **To-Be 미반영 결정 (정책 #3 (B) / Q-009 해소) — Reg/DeleteCommUserMng 가 별도 흡수** | ✓ |
| F-006: xfdl:956~984 fn_modify "팝업코드 확인" 전체 주석 | As-Is 보존 + To-Be 제거 결정 | ✓ |
| F-007: xfdl:1076~1093 / 1139~1152 fn_delete ROWTYPE_DELETE 검증 주석 | As-Is 보존 + To-Be 제거 결정 | ✓ |
| F-008: xfdl:130 / 138 / 139 GROUP_ID1~3 빈 콤보 (innerdataset="") | As-Is 보존 + **To-Be 신규 UI 미반영 결정 (정책 #3 (D) / Q-005 해소 / T-025) — Detail 콤보 자체 제거** | ✓ |
| F-009: xml:187 selectCommRoleGrpList SYSDATE/NVL Oracle 함수 | As-Is 보존 + To-Be MSSQL 변환 (T-002 / T-003) | ✓ |
| F-010: xml:24 / 255 EAIUSER.IF_DSHRMMCMHD02 외부 EAI | As-Is 보존 + **To-Be DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 (정책 #2 / Q-002 해소)** | ✓ |
| F-011: xml:28~30 `||` Oracle 결합 | As-Is 보존 + To-Be MSSQL `+` (T-004) | ✓ |
| F-012: xml:204 / 228 MERGE INTO ... USING DUAL Oracle | As-Is 보존 + To-Be MSSQL MERGE (T-001) | ✓ |
| F-013: xml:280~281 TO_DATE Oracle | As-Is 보존 + To-Be MSSQL TRY_CONVERT (T-005) | ✓ |
| F-014: xfdl:411 roleSearch IE/Chrome 호환 코드 | As-Is 보존 + **To-Be 폐기 (정책 #3 (E) / Q-010 해소 / T-024) — Next.js 16 모던 브라우저 + AG Grid onRowSelected 자연 흡수** | ✓ |

> **§E 결과**: xfdl 모든 컴포넌트 전수 + Java 모든 메서드 + Mapper.xml 20 SQL + BPMN 26 flow + 결함 14 건 모두 As-Is 1:1 보존 + Q-NNN 등재 — 누락 0 + 임의 정정 0.

---

## §F. To-Be 변환점 (Oracle → MSSQL sample_dmes + ref_Audit → cactus-core + PWD 정책) — 분석 §11 영향 SQL 정합

| 변환 항목 | 영향 SQL ID / 노드 | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 검증 |
|---|---|---|---|---|---|
| T-001 MERGE INTO ... USING DUAL → MSSQL MERGE (FROM 제거) 또는 IF EXISTS 패턴 | mergeCommonPwdInit / mergeCommonCopyRoleGrp | (참조만) | (해당 없음) | §7 T-01 | ✓ |
| T-002 SYSDATE → GETDATE() | selectCommRoleGrpList | (참조만) | (해당 없음) | §7 T-02 | ✓ |
| T-003 NVL → ISNULL | selectCommRoleGrpList | (참조만) | (해당 없음) | §7 T-03 | ✓ |
| T-004 `||` 결합 → MSSQL `+` 또는 CONCAT | selectCommUser / selectCommDept | (참조만) | (해당 없음) | §7 T-04 | ✓ |
| T-005 TO_DATE(str, 'YYYYMMDD') → TRY_CONVERT(date, str, 112) | updateReRegUser | (참조만) | (해당 없음) | §7 T-05 | ✓ |
| T-006 UPPER(...) — MSSQL 동일 지원 | selectCommUser / selectCommDept | (참조만) | (해당 없음) | (변환 ✗ 동일) | ✓ |
| T-007 **(정책 #1 / #3 (H) / Q-011 해소)** schema = `MCMAPUSER` 보존 + 테이블명 As-Is 대문자 `TB_MCM_SEC_*` 보존 확정 | 모든 SQL | (참조만) | (해당 없음) | §6.4 sqlKey + §7 T-06 | ✓ |
| T-008 **(정책 #2 / Q-002 해소)** EAI 폐기 + DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` 신설 (11 컬럼) | selectCommUser DEPT_NM (scalar → LEFT JOIN) / selectCommDept (단독 조회) | §3.3 LV-005 / §5.2 / §10 P-002 | §1.2 / §3.4 / §4.1 / §6 P-002 | §1.2 / §2.11 / §7 T-07 | ✓ |
| T-009 **(정책 #1)** `ref_Audit` fragment 폐기 — **`McmAuditEntity` (mcm-core 기존 자산 보존 + cma 정본 패턴)** 9 컬럼 + JPA `@PrePersist`/`@PreUpdate` 자동 처리 | 모든 INSERT/UPDATE SQL (13 회 include) | (참조만) | (해당 없음) | §6.1 (mcm-core 의존성) + §7 T-08 | ✓ |
| T-010 Spring Security BCrypt 라이브러리 호환 | RegCommUserMng / PasswordInit / ReRegCommUserMng | (참조만) | (해당 없음) | §6.1 + §7 T-14 | ✓ |
| T-011 **(정책 #3 (F) / Q-012 해소)** `CactusConstants.DEFAULT_PASSWORD` → `CommUserMngPasswordProperties.getDefault()` (yml prefix `commUserMng.password.*`, FQN `mcm.csa.commUserMng.config.CommUserMngPasswordProperties`). 기존 `mcm-core/security/password/McmPasswordProperties` 보존 | RegCommUserMng:50 / PasswordInit:49 / ReRegCommUserMng:53 | §5.3 / §9 P-003 | §1.2 / §6 P-003 | §6.1 + §7 T-15 | ✓ |
| T-012 **(정책 #3 (F) / Q-013 해소)** nexacro WebBrowser RSA pwChg.html → 신규 FE 페이지 `m-mcm/app/password-change/page.tsx` + 신규 BE `POST /oasis/commUserMng/changePassword` (기존 `/oasis/secUser/resetPassword` 보존) | fn_pwInit / WebBrowser 흐름 | §5.3 / §9 (P-003) | §1.2 + §6 (P-003) | §7 T-09 | ✓ |
| T-013 **(정책 #3 (E) / Q-014 해소)** Grid STATUS row state (Nexacro auto) → AG Grid 기본 row state 자연 흡수 (`getRowClass` / `rowSelection`) — 별도 STATUS 컬럼 신규 미반영 | G-001 | §3.2 G-001 | §4.1 G-001 | (해당 없음) | ✓ |
| T-014 `gfn_dsRequired` 공통 함수 → React-Hook-Form / Zod | V-002 / V-102 / V-202 | §6 V-002 / V-102 / V-202 | (참조만) | (해당 없음) | ✓ |
| T-015 **(정책 #3 (G) / Q-015 해소)** 권한 컨텍스트 통합 (gv_AppWorkFrameSet / gds_btn_list → PortalShell + RBAC React Context, `useRbac("mcm:csa:commUserMng:user")`) | fn_formBeforeOnload 권한 분기 | §5.3 / §8.2 | §4.4 UX-009 | §7 T-13 | ✓ |
| T-016 commonDynamic.xfdl → **shared `LookupModal` (Round 5 2026-06-04 확정 — J-014) + BE 신규 action `searchDeptLov` (DTO + Service + Repository + BPMN serviceTask) + 선택 시 DEPT_CD + DEPT_NM 동시 set** | D-007 (div_dept_cd) | §9 (P-002) | §1.2 + §3.4 + §3.4.4 + §5.4 B-019 + §6 (P-002) | §7 T-10 + searchDeptLovTask | ✓ |
| T-017 commonTopButton / commonLeftButton / commonRightButton → PortalShell PageLayout buttons / Toolbar | FX-001 / FX-002 / FX-003 / FX-004 / FX-005 | (참조만) | §1.2 / §5.1~§5.6 | (해당 없음) | ✓ |
| T-018 commonBottomStatus → PortalShell footer / Toast / Snackbar | FX-007 | §7.1 | §1.2 | (해당 없음) | ✓ |
| T-019 `gfn_message` → MessageModal / Toast 표준 | 모든 V-NNN 메시지 | §7.1 | (참조만) | (해당 없음) | ✓ |
| T-020 nexacro Form 내 모달 Div → @dk-oasis/shared/modal | A-POPUP-DEL / B-017 / B-018 | §9 (P-001) | §1.2 + §6 (P-001) + §3.7 | (해당 없음) | ✓ |
| T-021 IllegalTaskException / UserException cactus-core 동일 | 모든 Java task | (참조만) | (참조만) | §6.1 | ✓ |
| T-022 CactusConstants 상수 cactus-core 동일 이관 | RegCommUserMng / PasswordInit / ReRegCommUserMng | (참조만) | (참조만) | §6.1 | ✓ |
| T-023 **(정책 #3 (C) / Q-004 해소)** 외부 namespace history Mapper → JPA Entity `SecUserHis` / `SecUserRollHis` + Repository.saveAll() 흡수. 별도 Mapper.xml 신규 ✗ | DeleteCommUserMng / RegCommUserMng / ReRegCommUserMng / SaveRoleGroupHis / SaveRoleGroupCopyHis | §5.2 (각 action Mapper Entity 흡수) | (해당 없음) | §1.2 / §2.3~§2.10 / §6.4 + §7 T-12 | ✓ |
| T-024 **(정책 #3 (E) / Q-010 해소)** nexacro Dataset onrowposchanged → AG Grid onRowSelected 자연 흡수. roleSearch IE/Chrome 호환 플래그 폐기 | ds_main_onrowposchanged / xfdl:411 roleSearch | §6.8 V-701 | §4.4 UX-001 | (해당 없음) | ✓ |
| T-025 **(정책 #3 (D) / Q-005 해소)** GROUP_ID 빈 콤보 신규 UI 미반영 — Detail 콤보 D-013~015 자체 제거. ds_main 컬럼 보존만 | D-013 / D-014 / D-015 | §3.3 LV-006 / §4.1 D-013~015 | §3.4 (취소선) | (해당 없음) | ✓ |
| **T-026 (신규 — 정책 #3 (A) / Q-006 해소)** "역활" → "역할" 오타 정정 (xfdl 3 hits 본문 메시지) | M-028 / M-029 / xfdl:411 comment / xfdl:789 / xfdl:813 | §10 M-028 / M-029 | (참조만) | (해당 없음) | ✓ |
| **T-027 (신규 — 정책 #3 (A) / Q-007 해소)** `div_buttom` → `div_bottom` 오타 정정 (NullReferenceException 버그) | xfdl:794 (fn_callBack saveUserRoleGrp error) | §6.9 V-801 | (참조만) | (해당 없음) | ✓ |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| **T-028 (신규 — Round 6 2026-06-04)** 계정생성 / 수정 / 계정삭제 3 버튼 → **"저장" 1 버튼 통합 (`saveCmUser` 단일 action)**. master row 의 `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete 분기. END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 applyDelete + today 정정 (계정삭제 동작 fix). Detail D-019 / D-020 제거 (모달 DP-005/DP-006 만 보존). | B-001 / B-002 / B-004 / D-019 / D-020 / saveCmUser / regCmUser / deleteCmUser | §5.1 B-001/B-002/B-004/B-004' / §4.1 D-019/D-020 | §1.2 / §3.4 D-019/D-020 / §5.1 / §6 P-001 | §1.2 (saveCmUser 분기) / §2.1~§2.4 (통합) / §6.2 (To-Be 명명) | ✓ |
| **T-029 (신규 — Round 7 2026-06-05)** AsIs `btn_close` (commonTop basic 4 의 마지막) → ToBe **완전 제거**. PageLayout buttons 배열 entry 삭제 + unused `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe **3 버튼 표준 (조회/초기화/저장)**. 사유: portal 탭 close 는 host 가 처리. | B-005 / fn_close / handleClose | §5.1 B-005 | §1.2 / §5.1 B-005 / §5.1.1 | (해당 없음) | ✓ |

> **§F 결과**: **29 변환점** (T-028 / T-029 신규 추가 2026-06-04~05 Round 6~7) — 모두 cite + 영향 SQL/노드 1:1 매핑.

---

## §G. 결정 누적 (As-Is 분석 시점 확인필요 항목 — 사용자 결정 완료)

> 활성 확인필요 = **0 건**. 결정 내용은 분석 §6 / §9 / §10 / §11 + 기능 §3 / §4 / §5 / §6 / §8 / §10 + 디자인 §1.2 / §3.4 / §4.1 / §4.4 / §6 + BPMN §1.2 / §2 / §6.1 / §6.4 / §7 본문에 직접 반영.

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| 스키마/테이블명 (정책 #1 (6)(7)) | As-Is `TB_MCM_SEC_*` 대문자 보존 + schema=`MCMAPUSER` 명시 | 분석 §9 / §11.1 / §C / §F T-007 |
| BIZ_SYSTEM_CODE 폐기 (정책 #1) | (영향 ✗ — 본 화면 미사용) | - |
| EAI → DMES 부서 마스터 (정책 #2) | EAIUSER.IF_DSHRMMCMHD02 → TB_MCM_DEPT_INFO (schema=MCMAPUSER) JOIN 변환 | 분석 §6 / §9.1.7 / §11 / §F T-008 |
| 미사용 SQL 5종 폐기 | selectCommUserForSave / deleteCommUser / deleteCommUserMapping / deleteCommUserPwd / updateCommonPwdInit 신규 미반영 | 분석 §6 / §F T-011 |
| 외부 namespace SQL JPA 흡수 | TB_MCM_SEC_USER_HIS_Mapper.insert / mergePK → JPA SecUserHis / SecUserRollHis saveAll() 흡수 | 분석 §6.1 / §11.1 / §F T-023 |
| LoV 미설정 콤보 폐기 | edt_group_id1~3 (innerdataset="") 신규 UI 미반영 | 분석 §3.5 / 기능 §3.2 §4.1 / 디자인 §3.4 / §F T-025 |
| "역활" 오타 정정 | "역활" → "역할" (xfdl:411 / 789 / 813) | 분석 §11 / §F T-026 |
| div_buttom 오타 정정 | div_buttom → div_bottom (xfdl:794) | 분석 §11 / §F T-027 |
| SaveCommUserMng 주석 코드 | inserted / deleted 분기 신규 미반영 (별도 클래스 분리) | 분석 §7.1 / §11 / 기능 F-005 |
| nexacro roleSearch 자연 흡수 | To-Be 모던 브라우저 + React state — 별도 가드 불필요 | 분석 §11 / §F T-024 / 기능 F-014 |
| Grid STATUS AG Grid 자연 흡수 | AG Grid rowClassRules + CSS | 분석 §11 / §F T-013 |
| 비밀번호 정책 외부화 | application.yml prefix `commUserMng.password.*` / 신규 위치 `mcm.csa.commUserMng.config.CommUserMngPasswordProperties` (기존 mcm-core 자산 보존) | 분석 §11 / §F T-011 |
| 비밀번호 변경 페이지 신규 | 신규 FE `m-mcm/app/password-change/page.tsx` + 신규 BE `/oasis/commUserMng/changePassword` (기존 자산 보존) | 분석 §11 / §F T-012 |
| PortalShell + RBAC 통합 | nexacro 권한 → React Context (정책 #1) | 분석 §11 / §F T-015 |
| Entity 명명 As-Is 직역 (정책 #6 (A)) | SecUser / SecUserMapping / SecUserPwd / SecRoleGroup / SecUserHis / SecUserRollHis (`mcm.entity.*` 모듈 직속) | 분석 §11.1 / §B |
| audit (cactus-core 정본) | McmAuditEntity 상속 (정책 #1 (10)) | 분석 §9 / §F |
| As-Is/To-Be 표준 우선 원칙 (정책 #4 (0)) | As-Is 1:1 보존도 To-Be 개발 표준 충돌 시 To-Be 우선 | 분석 §0 / §E |

---

## §H. 환경 제약 명시 종합 (사용자 요구사항 [§10] / [§13])

| # | 환경 제약 | 영향 절 | 처리 |
|---|---|---|---|
| 1 | Runner / R14-Step0 / manifest 9 파일 검증 미적용 | §A.1 (A-R12-1, A-R12-4) + §A.3 + §D.4 | ✗ + 사유 명시 ("Runner config mui 미지원 — 사용자 결정으로 생략") |
| 2 | 가이드 템플릿 WinForms 전제 항목은 mui 등가물로 매핑 | 분석리포트 §0 + 본 §A.1 (A-T1A / A-R12-3 / A-R12-5) | mui 등가 매핑 (designer.cs → xfdl Layout / cs Click+= → xfdl onclick / sp.sql @Case → BPMN sequenceFlow name 분기 / Mapper.xml inline SQL) |
| 3 | As-Is = Oracle (MERGE/SYSDATE/TO_DATE/`||`/MCMAPUSER.) → To-Be = MSSQL `sample_dmes` (스키마 Q-011) + cactus-core `CactusAuditEntity` audit 자동 적용 | §F + 분석 §11 | 25 변환점 명시 — 모든 결정 사항 본문 반영 |
| 4 | nexacro WebBrowser RSA pwChg.html → Next.js 별도 페이지 신규 설계 | §F T-012 / §9 P-003 / §6 P-003 (디자인) / §7 T-09 (BPMN) | Q-013 결정 필요 |
| 5 | 가이드 템플릿 BPMN action 6 enum 강제 ✗ — As-Is 11 enum 보존 (사용자 결정 — 사용자 관리 도메인 특성) | 분석 §1 / 기능 §5.2 / BPMN §1.2 + §6.5 | 11 enum 1:1 보존 명시 |
| 6 | `EAIUSER.IF_DSHRMMCMHD02` 외부 EAI HR 마스터 연계 | §F T-008 / Q-002 | 별도 인터페이스 결정 필요 |

> 모든 환경 제약 명시 + 정합체크서 §A / §D 의 ✗ 사유가 사용자 결정에 의한 미적용임을 명시 — 본 ✗ 는 **설계 미완성으로 판정하지 않는다**.

---

## §I. 정합체크 종합 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A 구조 동일성 + 누락 | ✓ (환경 제약 명시 조건) | A.1 2 행 ✗ + A.3 ✗ — 모두 사용자 결정 [§10] 사유 |
| §B 명명 규칙 | ✓ | 모든 행 ✓, MES 단일 룰 적용 + Entity 명명 (정책 #6 (A)) + Service 패키지 (정책 #1) 추가 |
| §C 5축 정합 | ✓ | 18 일치 키 모두 ✓ + DB 컬럼명 schema=MCMAPUSER 보존 + TB_MCM_DEPT_INFO 신설 (정책 #2) 명시 |
| §D 반복 결정성 | ✓ (환경 제약 명시 조건) | D.4 9 파일 ✗ — 사용자 결정 [§10] 사유. D.3 스키마/테이블 확정 (정책 #1 / #3 (H) / Q-011 해소) |
| §E As-Is 누락 0 | ✓ | xfdl 전수 + Java 7 클래스 전수 + Mapper 20 SQL + 외부 2 + BPMN 26 flow + 결함 14 건 모두 As-Is 1:1 보존 + 결함 14 모두 To-Be 결정 (정책 #1~#6) |
| §F To-Be 변환점 | ✓ | **29 변환점** (T-026/T-027 2026-05-31 + T-028/T-029 신규 추가 2026-06-04~05 Round 6~7) — 모두 cite |
| §G Q-NNN 추적 | ✓ | **활성 = 0 건** (15 → 13 → 0). 2026-05-31 6 정책 결정 일괄 반영. 2026-06-02 iter#2~iter#4 + 2026-06-04 Round 5 (J-014/J-015/J-016) + **2026-06-04~05 Round 6~7 (J-017/J-018)** 사용자 검수 결과는 §J 로 별도 등재 — 신규 Q ✗ |
| §H 환경 제약 명시 | ✓ | 6 환경 제약 모두 사유 등재 |

> **설계 완성 판정**: §A ~ §F 6 개 절 모두 ✓ (환경 제약 ✗ 는 사용자 결정 사유 등재로 우회) + §G 활성 = 0 → **설계 완성 (Q-NNN 잔존 0)**.

---

## §J. 사용자 검수 결과 반영 이력 (2026-06-02 iter#2)

> 본 절은 ToBe 코드 구현 후 사용자 검수에서 발견된 결함을 본문 갱신과 함께 추적한다. 사용자 메모리 `feedback_q_resolution_propagation.md` 정합 — 단순 "해소됨" 표시 ✗, 본문 §§ 갱신 + 코드 수정 + 정합체크 등재 동시 진행.

### J.1 사용자 검수 발견 결함 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-001 | 디자인 §3.1 ContentPanel 비율 | iter#1 에서 3 패널 균등 분할 (`flex=1` 모두) → 좌측 사용자목록 다컬럼인데 너무 좁고, 우측 역할그룹 2 컬럼인데 너무 넓음 | "그리드 width를 늘려라" (좌측) / "역할그룹 width 축소" | 디자인 §3.1 / §3.1.1 — Left flex:1, Center 480px, Right 380px 명시 | page.tsx 859: `<ContentPanel width={480}>` / 1138: `<ContentPanel width={380}>` |
| J-002 | 디자인 §3.4 Detail 시작 Y 좌표 | Detail 패널이 양 그리드의 grid-panel-header (32px) 보다 위에서 시작 → "툭 튀어나옴" | "높이를 맞춰라" | 디자인 §3.1.1 — Detail 자체 헤더 "상세 정보" (height=32px) 추가 명시 | page.tsx 860~888 — wrapper div + grid-panel-header 등가 헤더 |
| J-003 | 디자인 §3.4 Detail 폼 행 정렬 | iter#1 에서 라벨/입력 컬럼 정렬 불일치 (특히 부서코드+부서명, Radio+Button 행) | "정렬해라" | 디자인 §3.4.1 — 행별 내부 flex 정책 (코드 120/부서명 flex / Radio 120 / Button 110) | page.tsx 932~951 / 1014~1054 / 1076~1101 |
| J-004 | 디자인 §5.1 / §5.4 / §5.5 버튼 활성화 | iter#1 에서 모든 버튼이 행 선택/변경/key set 사전 disabled → 클릭조차 불가 | "권한 있는 버튼은 항상 활성, 클릭 시 validation" | 디자인 §5.1.1 / §5.4.1 / §5.5.1 — RBAC 권한 기반 활성화 + 사전 disabled 제거 정책 명시 | page.tsx 753~796 (PageLayout buttons) / 1024 / 1047 / 1110 / 1130 / 1136 / 1166 / 1172 — 사전 disabled 제거 |
| J-005 | 디자인 §5.1 초기화 버튼 | iter#1 에서 AsIs 없는 "초기화" (btn_reset) 임의 추가 | "ASIS대로 진행, 임의 판단 변경 금지" | 디자인 §5.1.1 — "초기화 (btn_reset) 부재" 명시 | page.tsx 753~796 — btn_reset 제거 + btn_close (닫기) 추가 (AsIs xfdl:455 commonTop 정합) |
| J-006 | 디자인 §5.4 B-016 계정 재생성 | "계정 재생성" 텍스트 wrap 안 되어 버튼 영역 밖 overflow | "wrap 처리" | 디자인 §3.4.1 — Button width=110 + wrap 허용 명시 | page.tsx 1124~1134 — `<div style={{width:110}}>` wrapper |
| J-007 | (가이드 정합) | 개발 가이드: 코드 수정 후 설계 동기화 명시 — iter#1 에서 누락 | "수정 완료되면 설계에 반영하라고 명시" | 본 §J 신설 + 디자인설계서 §3.1.1 / §3.4.1 / §5.1.1 / §5.4.1 / §5.5.1 신규 sub-section 추가 | 본 정합체크서 §J 신설 |

### J.2 신규 Q-NNN 등재 ✗

iter#2 작업은 **AsIs 위반 정정** + **가이드 정본 영역 반영** 만 포함하며 신규 미해결 결정 사항 ✗. 모든 결함은 본문 갱신 + 코드 수정 + §J 등재로 즉시 해소.

### J.3 다음 검수 사이클 가드

- iter#3 부터는 본 §J 의 J-001~J-007 7 항목이 회귀하지 않도록 변경 PR 시 본문 + 코드 동시 갱신 강제.
- 다른 8 화면 (csa 7 + cme 1) 도 동일 결함 잠재 — `feedback_design_thoroughness.md` 정합으로 iter#2 작업 시 동일 검수 사이클 적용.

### J.4 iter#3 추가 결함 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-008 | 디자인 §3.1 Detail 상단 정렬 | iter#2 의 "상세 정보" 헤더가 양 그리드의 **grid-panel-header (사용자 목록 1건 / 행추가 행삭제)** 와 정렬되어 있었음 → 사용자는 한 단계 더 아래 **column-header (사용자ID*\|사번*\|...)** 와 정렬하도록 요구 | "더 내려서 라인에 맞도록 하라" (스크린샷 빨간 화살표 ↓) | 디자인 §3.1.1 — Detail 헤더 **2 줄 구조** 명시 (line 1 = panel-header 자리 빈 32px / line 2 = column-header 자리 "상세 정보" 28px) | [page.tsx:860-893](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L860) — `<div height=32 빈>` + `<div height=28 "상세 정보">` 2 줄 wrapper |
| J-009 | 디자인 §3.4 Detail 폼 정렬 의미 재해석 | iter#2 의 "정렬" 을 **좌측 정렬** 으로만 해석 → 실제 의미는 **비슷한 배열의 행은 동일 패턴으로 정렬** (좌측 입력 + 우측 동일 너비 버튼 정렬). 3 행 (역할그룹 복사 / 비밀번호 초기화 / SSO 초기화) 모두 버튼이 우측에 동일 너비 (110px) 로 정렬되어야 함 | "비슷한 배열의 컴포넌트가 동일한 정렬을 가지도록. 버튼 크기 동일하게 우측 정렬, 다른 것은 좌측 정렬" | 디자인 §3.4.1 — 행 내부 flex 정책 변경: 좌측 입력/Radio = **flex:1** (좌측 정렬, 가변 너비) + 우측 버튼 = **width:110px 고정** (우측 정렬, 3 행 동일). `justify-content: space-between` 으로 강제 분리 | [page.tsx:1014-1101](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L1014) — 3 행 모두 `display:flex justifyContent:space-between` + 입력 `flex:1` + 버튼 `width:110` |
| J-010 | 기능 §3 / 디자인 §4.1 그리드 인라인 편집 | iter#1/#2 의 USER_COLUMNS 가 `editable: true` (다수 셀) → 그리드 셀에서 직접 편집 가능. 본 화면은 **행 클릭 → Detail 폼에서 수정** 패턴이라 그리드 인라인 편집은 의도 ✗ | "그리드의 행이 편집모드로 전환되지 않게" | 디자인 §4.1.1 (신규) — `editable: false` 강제 명시 + Detail 폼 양방향 bind 만 활성 | [page.tsx:140-176](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L140) — 13 컬럼 모두 `editable: false` |
| J-011 | BPMN/기능 시간 처리 정합 | iter#2 의 END_OF_TIME = `LocalDateTime.of(9999, 12, 31, 23, 59, 59)` → AsIs Mapper `#{END_ACTIVE_DATE}` 직접 바인딩 + xfdl "99991231" 8자 → Oracle DATE 자동 변환 시 **00:00:00**. ToBe 가 23:59:59 로 처리하면 AsIs DB 와 1 일 6 시간 미만 차이로 비즈니스 영향. | "AS-IS 의 시분초 background 처리를 제대로 파악하고 동일하게" | 기능 §3.2 (G-005/G-006) / BPMN §1.2 (action insertCommUser/updateCommUser) / 본 §F (T-AsIs-시간) — AsIs Oracle DATE 시분초 자동 00:00:00 처리 명시 | [CommUserMngService.java:80-90](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/csa/commUserMng/service/CommUserMngService.java#L80) — END_OF_TIME 9999-12-31 23:59:59 → **9999-12-31 00:00:00** 정정. parseLocalDateTime 의 yyyy-MM-dd/yyyyMMdd 입력 → `T00:00:00` 보존 (기존 정합). |

### J.5 AsIs 시간 처리 분석 (J-011 결정 근거)

| 항목 | AsIs | ToBe (iter#2 이전) | ToBe (iter#3) |
|---|---|---|---|
| xfdl Calendar `cal_start_active_date` | dateformat="yyyy-MM-dd" UI 표시, dataset 값 = 8자 yyyyMMdd | DatePicker `<input type=date>` 값 = yyyy-MM-dd | (동일) |
| xfdl 행추가 default START | `gfn_today()` (yyyyMMdd) | today.atStartOfDay() = yyyy-MM-dd **00:00:00** | (동일 유지) |
| xfdl 행추가 default END | "99991231" (8자 문자열) | END_OF_TIME = 9999-12-31 **23:59:59** ❌ | END_OF_TIME = 9999-12-31 **00:00:00** ✓ |
| Mapper insertCommUser START/END | `#{...}` 직접 바인딩 → Oracle DATE 자동 변환 시 시분초 00:00:00 | parseLocalDateTime: yyyyMMdd → `T00:00:00` ✓ | (동일 유지) |
| Mapper updateReRegUser START/END | `TO_DATE(#{...}, 'YYYYMMDD')` → Oracle DATE 00:00:00 | reRegister: LocalDate.now().atStartOfDay() + END_OF_TIME (23:59:59) ❌ | reRegister END_OF_TIME → **00:00:00** ✓ |
| 결과 DB 저장 값 (START) | yyyy-MM-dd 00:00:00 (Oracle DATE) | yyyy-MM-dd 00:00:00 (LocalDateTime) ✓ | (동일) |
| 결과 DB 저장 값 (END default 9999) | 9999-12-31 00:00:00 (Oracle DATE) | 9999-12-31 23:59:59 ❌ | 9999-12-31 **00:00:00** ✓ |

→ iter#3 정합 후 AsIs ↔ ToBe 시간 처리 100% 일치.

### J.6 iter#4 추가 결함 (2026-06-02)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-012 | 디자인 §3.1.1 Detail 위/아래 흰색 빈공간 | iter#3 의 line 1 (panel-header 자리, 32px) 이 **흰색** → 좌·우 그리드의 panel-header (#f4f6f8 회색) 와 색 불일치 + 보기 싫음. 폼 본문 끝난 후 아래 영역도 **흰색** → 양 그리드의 row body 빈 공간과 비교 시 부자연스러움 | "상세 정보 위아래 흰색 빈공간은 뭐야.. 보기싫게" | 디자인 §3.1.2 (신규) — wrapper outer background = **#f4f6f8** + line 1 background = **#f4f6f8** + 폼 본문 div background = **#f4f6f8** + table cell 만 흰색 (DETAIL_VALUE_CELL 정본 유지) | [page.tsx:860-902](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L860) — outer/line 1/폼 본문 모두 회색 |
| J-013 | 디자인 §3.4.2 버튼 크기 통일 | iter#3 의 wrapper width=110 만으로는 form-button 의 기본 `padding:0 12px` + `white-space:nowrap` 때문에 Button 자체 너비는 텍스트 길이에 맞춰짐 → "역할그룹등록"/"비밀번호 초기화"/"SSO 초기화" 텍스트 길이가 다 달라서 버튼 크기 불일치 | "버튼 크기도 맞추라했고" | 디자인 §3.4.2 — Button 에 명시적 `style={{ width: "100%" }}` 강제. wrapper width=110 + Button width:100% 이면 모든 버튼이 정확히 110px 동일 너비 | [page.tsx:1029, 1063, 1097, 1127](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L1029) — 4 버튼 모두 `style={{ width: "100%" }}` 추가 |

### J.7 사용자 의도 재해석 정리

iter#1 → iter#2 → iter#3 → iter#4 4 사이클에서 사용자의 "정렬"/"높이 맞추기" 표현 의미 변화:

| iter | 사용자 표현 | 1차 해석 (잘못) | 실제 의도 (반영) |
|---|---|---|---|
| iter#1 → iter#2 | "높이를 맞춰라" | Detail 헤더 추가 (32px) | grid panel-header 32px 와 정렬만 |
| iter#2 → iter#3 | "더 내려서 라인에 맞도록" | 단일 헤더를 더 아래로 이동 | grid **column-header** 라인과 정렬 (= 2 줄 헤더) |
| iter#2 → iter#3 | "정렬해라" | 좌측 정렬 통일 | **비슷한 행은 동일 패턴** (좌측 입력 + 우측 동일 너비 버튼 우측 정렬) |
| iter#3 → iter#4 | "흰색 빈공간 보기싫게" | (해당 없음 — 신규) | wrapper 전체 + 폼 본문 **#f4f6f8 회색화** (흰색 area = table cell 만) |
| iter#3 → iter#4 | "버튼 크기도 맞추라" | wrapper width=110 통일 | **Button width:100%** 명시 + form-button white-space:nowrap padding 무력화 |

→ iter#4 시점 모든 사용자 지시 1:1 반영 완료. 향후 iter 에서 회귀 방지를 위해 본 §J.7 의도 매핑 참조.

### J.8 Round 5 (2026-06-04) — 사용자 검수 결과 W5 reference 확정 + 부서 LoV 모달 신설

> 2026-06-04 사용자 검수 결과 본 화면 `commUserMng` 을 csa 7 + cme 1 화면의 **W5 reference (W5 A~G 정본)** 로 확정. 다른 화면은 본 화면 패턴을 정합 기준으로 삼는다. Round 5 발견 결함 3 건 (J-014 / J-015 / J-016) 본문 + 코드 + 정합체크 동시 갱신 — `feedback_q_resolution_propagation.md` 정합.

#### J.8.1 발견 결함

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-014 | 디자인 §3.4 D-007 부서코드 | iter#4 까지 D-007 은 코드 Input + 부서명 Input 만 (직접 타이핑 가능). AsIs `commonDynamic` 트리거 대체 영역이 비어 있어 LoV 미사용 + 부서명 자동 lookup 부재. | "부서코드는 직접 입력 ✗ → 검색 버튼 + LoV 모달 + 선택 시 코드+명 자동 set" | 디자인 §1.2 (Modal 표) / §3.4 D-007 행 / §3.4.4 (Round 5 신규) / §4.1 G-008 / §5.4 B-019 (신규) / §5.4.1 B-019 정책 / §6 P-002 — 모두 갱신 | (1) FE [page.tsx:39](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L39) — `import { LookupModal } from "@dk-oasis/shared/lookup"`. (2) [page.tsx:777-797](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L777) — `fetchDeptLov` + `handleDeptLovPick` (DEPT_CD/DEPT_NM 동시 set). (3) [page.tsx:1018-1053](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L1018) — D-007 cell 재구성 (readOnly Input 100 + Button 56 + readOnly Input flex:1). (4) [page.tsx:1362-1375](src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx#L1362) — `<LookupModal>` 마운트. (5) BE [CommUserMngService.java:666-690](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/csa/commUserMng/service/CommUserMngService.java#L666) — `searchDeptLov` action. (6) BE DTO `CommUserMngSearchDeptLovRequest.java` 신규. (7) BPMN [commUserMng.bpmn:271-287](src/backend/mcm/api/src/main/resources/services/csa/commUserMng/commUserMng.bpmn#L271) — `searchDeptLovTask` serviceTask + flow. |
| J-015 | DataInitializer 부서 시드 | LoV 모달 정상 동작 확인을 위해 추가 부서 row 가 필요. 기존 3 row (DEPT_001~DEPT_003) 만으로는 검색/페이징 검수 어려움. | "부서 4개 추가" (인사팀 / 재무팀 / 영업1팀 / 품질관리팀) | 디자인 §3.4.4 시드 데이터 7 row 표 명시 | [DataInitializer.java:594-628](src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java#L594) — `seedMcmDeptInfo()` 메서드 내 DEPT_004 ~ DEPT_007 4 row `insertIfAbsent()` 추가. UPPER_DEPT_CD = DEPT_001, USE_TP = 'Y', audit fragment 동일. |
| J-016 | 디자인 §4.1 G-002 USER_ID readOnly | Round 5 점검 (회귀 검사) — USER_ID 는 inserted 신규 행에서만 편집, 기존 행 readOnly 가 W5 reference. | (이미 적용 — W5 reference 정합 확인) | 디자인 §4.1 G-002 (`Y (D-001 Essential 연동)` + `N (기존 행 편집 불가)` 보존) — 이전 iter (#2~#4) 에 적용 완료, Round 5 회귀 ✗ | 코드 변경 ✗ — 정합 확인만 (회귀 가드) |

#### J.8.2 BE 신규 action `searchDeptLov` 명세 (2026-06-04)

| 항목 | 값 |
|---|---|
| action 명 | `searchDeptLov` |
| HTTP path | `POST /oasis/commUserMng/searchDeptLov` |
| Request DTO | `mcm.csa.commUserMng.dto.CommUserMngSearchDeptLovRequest` (필드: `keyword: String`) |
| Service method | `CommUserMngService.searchDeptLov(CommUserMngSearchDeptLovRequest)` |
| Repository | `DeptInfoRepository.findDeptLov(keyword)` (또는 동등 query) — `TB_MCM_DEPT_INFO` LIKE 검색 (DEPT_CD / DEPT_NM 두 컬럼 OR) |
| 응답 | `{ result: [{DEPT_CD: String, DEPT_NM: String}, ...] }` (또는 동등 Map) |
| BPMN serviceTask | `searchDeptLovTask` (`camunda:class=commUserMngService`, `method=searchDeptLov`) |
| BPMN flow | `flow_searchDeptLov` (actionGateway → searchDeptLovTask) + `flow_searchDeptLov_end` (→ `endSearchDeptLov`) |
| 트랜잭션 | read-only (조회 전용) |

#### J.8.3 W5 reference 확정 — 다른 화면 정합 기준

본 §J.8.1 의 D-007 부서 LoV 패턴 (readOnly Input + 검색 Button + readOnly Input + shared `LookupModal` + BE `search*Lov` action + 선택 시 코드+명 동시 set) 은 **csa 7 + cme 1 화면의 W5 정본**. 다른 화면이 비슷한 LoV 셀 (부서 / 분류코드 / 마스터 코드 등) 을 추가할 때 본 패턴을 그대로 정합한다. 회귀 방지를 위해 본 §J.8 을 참조한다.

#### J.8.4 신규 Q-NNN 등재 ✗

J-014 / J-015 / J-016 모두 사용자 결정 즉시 본문 + 코드 + 정합체크 갱신으로 해소. 미해결 결정 사항 ✗ → 신규 Q-NNN 등재 ✗.

### J.9 Round 6~7 (2026-06-04~05) — 통합 "저장" 버튼 + btn_close 제거

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->

> Round 6 (2026-06-04) + Round 7 (2026-06-05) 사용자 검수 결과 본 화면의 ToBe 상단 버튼바를 가이드 §6-E 정합 (조회/초기화/저장/닫기) → **3 버튼 표준 (조회/초기화/저장)** 으로 단순화 + AsIs 5 버튼 (계정생성/계정삭제/조회/수정/닫기) → ToBe 3 버튼 + 통합 "저장" 의 `nativeeditor_status` 분기로 등가 책임 흡수.

#### J.9.1 발견 결함

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 코드 반영 |
|---|---|---|---|---|---|
| J-017 | 디자인 §5.1 상단 버튼 / §3.4 D-019/D-020 | iter#1~Round 5 까지 AsIs 5 버튼 (B-001 계정생성 / B-002 계정삭제 / B-003 조회 / B-004 수정 / B-005 닫기) 보존 → ToBe 책임 분기 (Insert / Update / Delete 3 버튼) 가 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) 정합 ✗ + 사용자 UX 결정: master row 의 `nativeeditor_status` 만으로 분기 가능 → 1 버튼 통합이 자연. | "계정생성/수정/계정삭제 → 저장 1 버튼 통합 / END_ACTIVE_DATE sentinel 9999-12-31 감지 시 applyDelete + today 정정 / Detail D-019 정보처리의뢰서 / D-020 처리사유 제거 (모달 DP-005/006 만 유지)" | 디자인 §1.2 / §3.4 D-019/D-020 / §5.1 B-001/B-002/B-004/B-004' / §5.1.1 / §6 P-001 / 정합 §F T-028 / 본 §J.9 신설 / §K cross-ref 신설 | (1) FE PageLayout buttons → [조회 / 초기화 / 저장] 3 entry. (2) handleSave → `saveCmUser` 단일 action — master row 의 `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete 분기. (3) applyDelete 가 END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 today 로 정정. (4) Detail D-019 / D-020 jsx 제거 (모달 DP-005/006 보존). (5) BE `saveCmUser` action 통합 — 기존 regCmUser / deleteCmUser 책임 흡수. |
| J-018 | 디자인 §1.2 / §5.1 B-005 btn_close | AsIs xfdl `btn_close` (commonTop basic 4 의 마지막) → ToBe 에서 portal 탭 close 는 host 가 처리하므로 화면 내부 닫기 버튼 의미 ✗. iter#2 에서 임시로 B-005 닫기 entry 보존 → Round 7 에서 완전 제거 결정. unused `handleClose` dead code 도 제거. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준. | "btn_close 완전 제거 / handleClose dead code 제거" | 디자인 §1.2 / §5.1 B-005 / §5.1.1 / 정합 §F T-029 / 본 §J.9 신설 / §K cross-ref 신설 | (1) FE PageLayout buttons 배열에서 `btn_close` entry 삭제. (2) unused `handleClose` 함수 제거 (dead code). (3) `btn_close` 핸들러 import 제거. |

#### J.9.2 `saveCmUser` 통합 action 명세 (Round 6)

| 항목 | 값 |
|---|---|
| action 명 | `saveCmUser` (통합) |
| HTTP path | `POST /oasis/commUserMng/saveCmUser` (기존 경로 보존) |
| Request 분기 | master row 의 `nativeeditor_status` (`inserted` / `updated` / `deleted`) |
| applyInsert | `nativeeditor_status="inserted"` → regCmUser 책임 흡수 (검증 V-201~V-207 + bcrypt + 이력 SecUserHis) |
| applyUpdate | `nativeeditor_status="updated"` → 기존 saveCmUser 책임 (검증 V-301~V-308 + updateCommUser SQL) |
| applyDelete | `nativeeditor_status="deleted"` → deleteCmUser 책임 흡수 + **END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 today (`LocalDate.now()`) 로 정정** (계정삭제 동작 fix — AsIs xfdl:1112 `getColumn("END_ACTIVE_DATE")=="99991231"` 등가 분기) |
| 트랜잭션 | write (Insert/Update/Delete 통합 단일 트랜잭션) |
| BPMN 영향 | regCmUser / deleteCmUser flow → saveCmUser flow 로 통합. Gateway 분기 emit `taskParam.nativeeditor_status` |

#### J.9.3 Detail D-019 / D-020 제거 영향

| 항목 | Round 5 이전 | Round 6 이후 |
|---|---|---|
| Detail D-019 정보처리의뢰서 (edt_infReqNo) | ✓ Detail 표시 | ✗ Detail 제거 |
| Detail D-020 처리사유 (edt_description) | ✓ Detail 표시 | ✗ Detail 제거 |
| 모달 DP-005 정보처리의뢰서 (계정삭제 modal) | ✓ 유지 | ✓ 유지 (영향 ✗) |
| 모달 DP-006 처리사유 (계정삭제 modal) | ✓ 유지 | ✓ 유지 (영향 ✗) |
| ds_main 컬럼 INF_REQ_NO / DESCRIPTION bind | ✓ Detail + 모달 양방향 | ✓ 모달 한방향만 (Detail bind 제거) |

→ ToBe 사용자가 정보처리의뢰서/처리사유를 입력하는 경로 = **계정삭제 모달 (B-002 트리거 → Round 6 후 통합 저장 applyDelete 분기) 단 1 곳**. Detail 폼에서는 입력 불가 — 계정삭제 시점에만 의미 있는 메타데이터로 책임 명확화.

#### J.9.4 W5 패턴 G (Round 6 신설) — 통합 "저장" 버튼 정합 기준

본 §J.9.1 의 통합 "저장" 패턴 (master row `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete + END_ACTIVE_DATE sentinel 정정) 은 csa 7 + cme 1 화면의 **W5 패턴 G 정본**. 다른 화면이 Insert/Update/Delete 3 버튼 → "저장" 1 버튼 통합을 적용할 때 본 패턴을 그대로 정합한다.

#### J.9.5 신규 Q-NNN 등재 ✗

J-017 / J-018 모두 사용자 결정 즉시 본문 + 코드 + 정합체크 갱신으로 해소. 미해결 결정 사항 ✗ → 신규 Q-NNN 등재 ✗.

---

## §K. Round 변경 확정 시각 cross-ref (라운드 단위)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->

> 본 §K 는 라운드 단위로 본 화면의 본문 / 코드 / 정합체크서 갱신 확정 시각을 cross-ref 한다. iter#1~Round 5 는 §J.1~§J.8 에 등재되어 본 절은 Round 6~7 이후 (라운드 패턴 도입 시) 만 신규 등재.

### §K.1 라운드 카탈로그 (확정 ✓/✗)

| Round | 일자 | 결함 발견 (J-NNN) | 본문 §§ 갱신 | 코드 수정 | 정합체크서 §J/K 갱신 | W5 패턴 영향 |
|---|---|---|---|---|---|---|
| iter#1 | 2026-06-01 | (초기 구현) | ✓ (초기) | ✓ | ✓ §J.1 | A~F 초기 적용 |
| iter#2 | 2026-06-02 | J-001~J-007 | ✓ §3.1~§5.5 | ✓ page.tsx 다수 | ✓ §J.1 | B / D 신설 |
| iter#3 | 2026-06-02 | J-008~J-011 | ✓ §3.1.1~§3.4.2 / §4.1 | ✓ page.tsx 다수 + CommUserMngService.java | ✓ §J.4~§J.5 | B / C / D 정합 |
| iter#4 | 2026-06-02 | J-012 / J-013 | ✓ §3.1.2 / §3.4.3 | ✓ page.tsx | ✓ §J.6~§J.7 | F 신설 |
| **Round 5** | **2026-06-04** | **J-014 / J-015 / J-016** | **✓ §1.2 / §3.4 / §3.4.4 / §4.1 G-008 / §5.4 B-019 / §6 P-002** | **✓ page.tsx + DataInitializer.java + CommUserMngService.java + CommUserMngSearchDeptLovRequest.java + commUserMng.bpmn** | **✓ §J.8 + §F T-016** | **E 신설 — W5 reference 확정** |
| **Round 6** | **2026-06-04** | **J-017** | **✓ 디자인설계서 §1.2 / §3.4 D-019/D-020 / §5.1 / §5.1.1 / §6 P-001 + §J (신설)** | **✓ FE PageLayout buttons + handleSave (nativeeditor_status 분기) + applyDelete END_ACTIVE_DATE sentinel + Detail D-019/D-020 jsx 제거 + BE saveCmUser 통합** | **✓ §A.2 (D-NNN/B-NNN 행) / §F T-028 (신규) / §I / §J.9 (신설) / §K** | **G 신설** |
| **Round 7** | **2026-06-05** | **J-018** | **✓ 디자인설계서 §1.2 / §5.1 B-005 / §5.1.1 + §J (라운드 카탈로그 갱신)** | **✓ FE PageLayout buttons 배열 btn_close entry 삭제 + handleClose dead code 제거 + import cleanup** | **✓ §F T-029 (신규) / §I / §J.9 (J-018 추가) / §K** | **D 보존 (3 버튼에도 동일 적용)** |

### §K.2 W5 패턴 A~G 회귀 가드

| 패턴 | 정본 § (디자인설계서) | Round 5 | Round 6 | Round 7 |
|---|---|---|---|---|
| A — 모듈 통합 가이드 (mcm/csa) | §1.2 | ✓ | ✓ | ✓ |
| B — Detail 폼 행 정렬 | §3.4.1~§3.4.3 | ✓ | ✓ (D-019/020 제거 후에도 정렬 보존) | ✓ |
| C — 그리드 인라인 편집 금지 | §4.1 + §4.4 UX-001 | ✓ | ✓ | ✓ |
| D — RBAC 권한 기반 활성화 | §5.1.1 / §5.4.1 / §5.5.1 | ✓ | ✓ (통합 저장도 RBAC) | ✓ (3 버튼 표준에도 동일) |
| E — LookupModal LoV 패턴 | §3.4.4 / §5.4 B-019 / §6 P-002 | ✓ (신설) | ✓ | ✓ |
| F — Detail 배경색 체계 | §3.1.2 | ✓ | ✓ | ✓ |
| **G — 통합 "저장" 버튼 (`saveCmUser` nativeeditor_status 분기)** | §5.1 B-004' / §6 P-001 | (해당 없음 — Round 6 신설) | **✓ (신설)** | ✓ |

### §K.3 신규 Q-NNN 등재 ✗

Round 6 / Round 7 모두 사용자 결정 즉시 본문 + 코드 + 정합체크 동시 갱신으로 해소. 미해결 결정 사항 ✗ → 신규 Q-NNN 등재 ✗. 회귀 방지를 위해 본 §K.2 의 W5 패턴 A~G 정합 기준을 모든 라운드 검수에서 참조한다.
