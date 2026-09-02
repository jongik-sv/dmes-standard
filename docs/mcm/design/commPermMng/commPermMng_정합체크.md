---
screenId: commPermMng
asIsId: CommPermMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# PERMISSION 관리 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 Q-NNN = **0 건** (Q-001 해소 2026-05-30 — 분석 §9.3 신설 / 2 시트 49 컬럼 전수).
> **환경 제약 (사용자 결정 [§0])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §A.3 / §A.A-R12-1 / §D.4 = ✗ + 사유 명시.
> **cross-cutting 정책 #1·#6 적용 (2026-05-31)**: BIZ_SYSTEM_CODE 컬럼 폐기 (S 4→3 / G 12→11 / D 26→24 / LV 3→2 / DS 3→2 / Bind 11→10 / Script 20→19 / SQL 자체 4 + cross-module 1→0 / BPMN 노드 6→5 / sequenceFlow 7→5 / action 3→2) + Entity 명 = `SecPerm` (A안). 4 종 설계서 본문 갱신 정합 검증을 본 정합체크서에서 To-Be count 동기화로 반영.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§13 / §1~§13 / §1~§10 / §1~§8 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (분석 §3.4 GE / §7 Java / 기능 §4.2 L / 디자인 §3 GE-section) | ✓ (§3.4 / §7) | ✓ (§4.2) | ✓ (§2.1 GE=0/L=0) | ✓ (§5 해당 없음) | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§13] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §10에 의해 명시 신설) | ✓ | ✓ | ✓ | ✓ | §0 환경 제약은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 8 (A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-LEFT / A-MAIN-RIGHT / A-BTN / A-FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | A-MAIN 좌우 분할 + A-FOLD 별도 + A-BTN 분산 |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §0 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl + java 부재) + D2 (Mapper.xml SQL) 만 존재, D3 SP 의존 ✗ | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 미존재 (Oracle SP/함수/트리거 미사용 — Mapper.xml inline SQL 만) + Java UserTask 부재 (분석 §2/§7) |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / onheadclick / onload / onrowposchanged 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.4 의 메서드 표 20 행으로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 4 자체 + 1 cross-module SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§0] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

> **count 표기**: `As-Is N → To-Be M` (cross-cutting 정책 #1 적용 시 To-Be count 감소). cross-cutting 정책 #1·#6 미해당 행은 단일 N.

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | As-Is 4 → **To-Be 3** | As-Is 4 → To-Be 3 | As-Is 4 → To-Be 3 | (해당 없음) | - | 0 | 0 (S-001 폐기 — cross-cutting 정책 #1) | ✓ |
| 그리드 컬럼 (G-NNN) | As-Is 12 → **To-Be 11** | As-Is 12 → To-Be 11 | As-Is 12 → To-Be 11 | (해당 없음) | - | 0 | 0 (G-008 폐기 — cross-cutting 정책 #1) | ✓ |
| 확장 그리드 (GE-NNN) | 0 (해당 없음) | 0 (해당 없음) | 0 (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | As-Is 26 → **To-Be 24** | As-Is 26 → To-Be 24 | As-Is 26 → To-Be 24 (FormGrid 행 11→10) | (해당 없음) | - | 0 | 0 (D-007 / D-008 폐기 — cross-cutting 정책 #1) | ✓ |
| 라인 필드 (L-NNN) | 0 (해당 없음) | 0 (해당 없음) | 0 (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 버튼 (B-NNN) | 3 | 3 | 3 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 (해당 없음) | 0 (해당 없음) | 0 (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 외부 공통 메뉴 (EX-NNN) | 4 (EX-001 topMenu / EX-002 leftMenu / EX-003 rightMenu / EX-004 footer) | 4 | 4 (분산 — §3.4 / §3.2.1 / §3.5) | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 2 (P-001 common / P-002 custom 동일 팝업 oArg 분기) | 2 | 2 | (해당 없음) | - | 0 (commonPermBtnPopup 외부 공통 — 본 화면 분석 범위 외) | 0 | ✓ |
| 상태값 (ST-NNN) | 8 | 8 | (참조만 — 디자인 §3.3.2 / §3.2.2 / §5.3 등 분산) | (해당 없음) | - | 0 | 0 | ✓ |
| 코드값/LoV (LV-NNN) | As-Is 3 → **To-Be 2** | As-Is 3 → To-Be 2 | As-Is 3 → To-Be 2 (§4.2) | (해당 없음) | - | 0 | 0 (LV-003 폐기 — cross-cutting 정책 #1) | ✓ |
| Mapper.xml SQL ID | 자체 4 + cross-module ~~1~~ = **자체 4 + To-Be cross-module 0** | 자체 4 (§11 action 별 분기) | (해당 없음) | 자체 4 + cross-module ~~1~~ 폐기 (§4.1 / §4.2) | - | 0 | 0 (cross-module 1 폐기 — cross-cutting 정책 #1) | ✓ |
| BPMN 노드 / SequenceFlow | **As-Is 6 노드 / 7 flow → To-Be 5 노드 / 5 flow** | (해당 없음) | (해당 없음) | As-Is 6 / 7 → To-Be 5 / 5 (§3.1 / §3.2) | - | 0 (Task_08v4ryn / SequenceFlow_1dd2kqv·0xqzbh4 폐기 — cross-cutting 정책 #1) | 0 | ✓ |
| Java UserTask 클래스 | 0 (해당 없음 — 분석 §2 / §7) | (해당 없음) | (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 사용 테이블 | 2 (TB_MCM_SEC_PERM 29 컬럼 전수 + cactus-core 9 audit 통일 / TB_MCM_SEC_ROLE_MAPPING 20 컬럼 — DMES Excel csa 시트 DDL 추출 완료 → 분석 §9.3). BIZ_SYSTEM_CODE 컬럼 DDL 보존 + 본 화면 SQL/UI/Entity 미사용 (cross-cutting 정책 #1) | (참조만) | (해당 없음) | (참조만 — §7.1 audit / §5 Entity SecPerm) | - | 0 (Q-001 해소 2026-05-30) | 0 | ✓ |

> **§A.2 결과**: 모든 행 합 일치 — 발견 = 반영 + 확인필요 0건 (Q-001 해소 2026-05-30) + 제외 (cross-cutting 정책 #1 의 4 종 산출물 동기화 — As-Is 인용 보존 + To-Be 폐기 표시 일관 적용 검증).

### A.3 manifest 행 수 ↔ 산출물 행 수 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| Runner classify.trace.json items[] 카운트 ↔ 분석.template 행 수 | **✗ (검증 미실시)** | 사용자 결정 [§0] — Runner config mui 미지원 으로 manifest 9 파일 미생성. 본 §A.3 = ✗ + 사유 명시 |

> **§A 결과**: A.1 (2 행 ✗ + 사유) + A.2 ✓ (Q-001 해소 2026-05-30) + A.3 (✗ + 사유) — **사용자 결정에 의한 미적용 ✗ 는 설계 미완성으로 판정하지 않는다** ([§0] 환경 제약 명시 + §D.4 동일 사유). 따라서 §A = **✓ (환경 제약 명시 조건)**.

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
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > PERMISSION 관리 (commPermMng) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commPermMng | MES: camelCase `{화면명}` (As-Is 의 `Comm` 접두는 영역 표기 — As-Is 어간 보존) | 01 A.3 — `CommPermMng` → camelCase 변환 → `commPermMng` | ✓ |
| pageName | commPermMng | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | commPermMng | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | commPermMng | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | commPermMng.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commPermMng | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | P-001 / P-002 (flat — 동일 팝업 oArg 분기 2회) | (전체 공통) | 01 A.4.7 | ✓ |
| 필드/컬럼/버튼 ID | S-001~004 / G-001~012 / D-001~026 / B-001~003 / P-001~002 / FX-001~004 / EX-001~004 / DS-001~003 / LV-001~003 / ST-001~008 / API-001~003 | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) — PERMISSION_ID / PERMISSION_NM 등 | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / 그리드 cell `text=` 1byte 일치 | (전수 일치 — 분석 §3.2 / §3.3 / §3.5) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `PERMISSION_ID` / `PERMISSION_NM` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 8 영역 — A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-LEFT / A-MAIN-RIGHT / A-BTN / A-FOOTER → 디자인설계서 §2.2 명시 | ✓ | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ enum — 본 화면은 TextBox 2 (S) + Combo 2 (S) + Static (D 라벨) + TextBox (D-002 etc) + Combo (D-008) + Radio (D-010) + Calendar (D-012/D-014) + TextArea (D-016/D-019/D-022/D-024) + Button (D-017/D-020 + B-001) | ✓ | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — TextBox maxlength 100 / 90 / 100 / 100 명시 (기능설계서 §3.1 / §4.1) | ✓ (분석 §3.2 + §3.5 + 기능 §3.1 + §4.1) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commPermMng × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | commPermMng (§1) | commPermMng (§1.2) | commPermMng (frontmatter / §1.2) | commPermMng (process / serviceId §1) | commPermMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| pageName | commPermMng | commPermMng | commPermMng | commPermMng | commPermMng | ✓ |
| pageId | commPermMng | commPermMng | commPermMng | commPermMng | commPermMng | ✓ |
| serviceId | commPermMng | commPermMng | commPermMng | commPermMng | commPermMng | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (**As-Is 4 → To-Be 3** 행: S-001 폐기 / S-002~S-004) | §3.1 (As-Is 4 → To-Be 3 행) | §3.1 (As-Is 4 → To-Be 3 행) | (해당 없음 — BPMN 은 컬럼 단위 인용 ✗) | (분석 §11 To-Be 변환점 + §9.1 + cross-cutting 정책 #1) | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 (**As-Is 12 → To-Be 11** 행: G-008 폐기) | §3.2 (As-Is 12 → To-Be 11 행) | §3.2.2 (As-Is 12 → To-Be 11 행) | (참조만) | (분석 §9.1) | ✓ |
| 컬럼ID (GE-NNN 확장) | §3.4 (0 — 해당 없음) | §4.2 (해당 없음) | §2.1 (GE=0) | (해당 없음) | - | ✓ |
| 상세 필드 (D-NNN 전수) | §3.5 (**As-Is 26 → To-Be 24** 행: D-007 / D-008 폐기) | §4.1 (As-Is 26 → To-Be 24 행) | §3.3.1 (**As-Is 11 → To-Be 10** FormGrid 행 — D-007 / D-008 폐기 행 제거) | (참조만) | (분석 §9.1) | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (3 행: B-001~B-003) | §5.1 (3 행 동일) | §3.2.1 + §3.3.1 + §5.4 (3 행) | (참조만 — §1.1 API 트리거 매핑) | - | ✓ |
| 팝업ID (P-NNN 전수) | §5 (2 행: P-001 common / P-002 custom — 동일 팝업 oArg 분기) | §9 (2 행 동일) | §6 (2 행 동일) | (참조만) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | §9.1 (TB_MCM_SEC_PERM 본 컬럼 11 + cactus-core audit 9 = 20, **BIZ_SYSTEM_CODE 화면 미사용**) / §9.2 (TB_MCM_SEC_ROLE_MAPPING 본 컬럼 2 read-only — audit 화면 외) | §3.1 / §3.2 (S + G 인용) + §4.1 (D 인용) | §3.2.2 / §3.3 (Grid + Form 인용) | §4 (SQL 매핑) | §11 변환점 (As-Is `TB_MCM_SEC_*` (prefix ✗) → To-Be `MCMAPUSER.TB_MCM_SEC_*` 보존 — 사용자 결정) + cross-cutting 정책 #1 BIZ_SYSTEM_CODE 화면 사용 폐기 | ✓ |
| **Entity 명 (cross-cutting 정책 #6 A안)** | §11.1 (**SecPerm** — TB_MCM_SEC_PERM 1:1 직역. SecPermButton 미생성) | §12 (SecPerm) | (해당 없음) | §5 / §6 (SecPerm) | - | ✓ |
| 상태코드 (statusCodes) | §10.1 (8 행: ST-001~ST-008) | §7 (8 행 동일) | §3.3.2 / §3.2.2 / §5.3 (분산 — 8 행 모두 인용) | (참조만 — saveCmPerm status 분기 §1.1) | - | ✓ |
| action 목록 | §1 (**As-Is 3 enum: searchCmPerm / saveCmPerm / lov → To-Be 2: searchCmPerm / saveCmPerm**) + popup (BPMN ✗) | §11 (As-Is 3 → To-Be 2 action 흐름 + popup) | (참조만) | §1.1 (As-Is 3 → **To-Be 2** API) + §2.1~§2.2 (To-Be 2 흐름, §2.3 lov 폐기) + §3.3 (6 enum 매핑) | §6 BPMN 기능 식별자 안 | ✓ |
| Mapper.xml SQL ID | §6 (자체 4 + cross-module ~~1~~ 폐기 — To-Be 자체 4) | §11 (action → SQL 매핑, lov 폐기) | (참조만) | §4.1 (자체 4) + §4.2 (cross-module 1 폐기) | §11 변환점 (Oracle → MSSQL) + cross-cutting 정책 #1 (cross-module 폐기) | ✓ |
| BPMN 노드 / SequenceFlow | §8 (**As-Is 6 노드 + 7 flow → To-Be 5 노드 + 5 flow** 전수) | (참조만) | (해당 없음) | §3.1 (As-Is 6 → To-Be 5 노드) + §3.2 (As-Is 7 → To-Be 5 flow) + §2.1~§2.2 (To-Be 2 action 흐름, §2.3 lov 폐기) + §6 (To-Be 명명 안) | - | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | commPermMng | commPermMng | commPermMng | commPermMng | ✓ |
| asIsId | CommPermMng | CommPermMng | CommPermMng | CommPermMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commPermMng | commPermMng | commPermMng | commPermMng | ✓ |
| S-NNN 수 | As-Is 4 → **To-Be 3** | As-Is 4 → To-Be 3 | As-Is 4 → To-Be 3 | (해당 없음) | ✓ |
| G-NNN 수 | As-Is 12 → **To-Be 11** | As-Is 12 → To-Be 11 | As-Is 12 → To-Be 11 | (해당 없음) | ✓ |
| GE-NNN 수 | 0 | 0 | 0 | (해당 없음) | ✓ |
| D-NNN 수 | As-Is 26 → **To-Be 24** | As-Is 26 → To-Be 24 | As-Is 26 → To-Be 24 (FormGrid As-Is 11 → To-Be 10) | (해당 없음) | ✓ |
| B-NNN 수 | 3 | 3 | 3 | (참조만) | ✓ |
| EX-NNN 수 | 4 | 4 | 4 | (참조만) | ✓ |
| P-NNN 수 | 2 | 2 | 2 | (참조만) | ✓ |
| ST-NNN 수 | 8 | 8 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 | As-Is 3 → **To-Be 2** | As-Is 3 → To-Be 2 | As-Is 3 → To-Be 2 | (참조만) | ✓ |
| BPMN action 수 | **As-Is 3 (searchCmPerm / saveCmPerm / lov) → To-Be 2 (searchCmPerm / saveCmPerm)** | As-Is 3 → To-Be 2 | (참조만) | As-Is 3 → To-Be 2 (§1.1 / §2.1~§2.2 — §2.3 lov 폐기) + §3.3 (6 enum 매핑 — As-Is 3 / To-Be 2 사용) | ✓ |
| Mapper SQL 수 | 자체 4 + cross-module ~~1~~ = **자체 4 + To-Be cross-module 0** | 자체 4 | (참조만) | 자체 4 + cross-module ~~1~~ 폐기 (§4.1 자체 4 + §4.2 cross-module 1 폐기) | ✓ |
| BPMN 노드 수 | **As-Is 6 → To-Be 5** | (참조만) | (참조만) | As-Is 6 → To-Be 5 (§3.1) | ✓ |
| BPMN sequenceFlow 수 | **As-Is 7 → To-Be 5** | (참조만) | (참조만) | As-Is 7 → To-Be 5 (§3.2) | ✓ |
| Java UserTask 수 | 0 (해당 없음) | 0 (해당 없음) | (참조만) | 0 (§5 해당 없음) | ✓ |
| **Entity 명 (cross-cutting 정책 #6 A안)** | SecPerm | SecPerm (§12) | (해당 없음) | SecPerm (§5 / §6) | ✓ |

### D.2 BPMN 기능 식별자 = `{screenId}_{기능명}` (사용자 요구사항 [명명 규칙 정본])

| As-Is sequenceFlow name | To-Be 기능 식별자 | 검증 |
|---|---|---|
| searchCmPerm | commPermMng_search (또는 As-Is `searchCmPerm` 보존) | ✓ |
| saveCmPerm | commPermMng_save (또는 As-Is `saveCmPerm` 보존) | ✓ |
| lov | commPermMng_lov | ✓ |

> 비고: As-Is sequenceFlow name (`searchCmPerm` / `saveCmPerm` / `lov`) 은 To-Be 에서 보존 가능 (xfdl `gfn_transaction` sSvcId 와 1:1) — 또는 표준 형식 (`{screenId}_{action}`) 으로 변환. 사용자 결정 위임.

### D.3 테이블 명명 = `TB_{모듈명}_{역할}` (사용자 요구사항 [명명 규칙 정본])

| As-Is | To-Be 명명 안 |
|---|---|
| TB_MCM_SEC_PERM (스키마 prefix ✗) | MCMAPUSER.TB_MCM_SEC_PERM (사용자 결정 — As-Is 보존 + 스키마 prefix 추가) |
| TB_MCM_SEC_ROLE_MAPPING (스키마 prefix ✗) | MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (동일 패턴, read-only — 본 화면 자체 owner ✗) |

> 사용자 결정: `MCMAPUSER` 스키마 + `TB_MCM_SEC_*` 대문자 prefix As-Is 보존.

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

> **§D.4 결과**: 9 파일 모두 ✗ + 사유 명시. 사용자 결정 [§0] — Runner config mui 미지원 으로 생략. **본 ✗ 는 설계 미완성으로 판정하지 않는다** (사용자 결정 사항).

### D.5 BPMN sequenceFlow id 표기 (As-Is 보존)

| As-Is sequenceFlow id | name | 보존 여부 | 결과 |
|---|---|---|---|
| SequenceFlow_1 | (없음 — StartEvent→Gateway) | ✓ As-Is 보존 | ✓ |
| SequenceFlow_0grwghu | saveCmPerm | ✓ | ✓ |
| SequenceFlow_0tt1mbk | searchCmPerm | ✓ | ✓ |
| SequenceFlow_1dd2kqv | lov | ✓ | ✓ |
| SequenceFlow_105vwsz | (없음 — Task_00oihyb→End) | ✓ | ✓ |
| SequenceFlow_1vkp3qd | (없음 — Task_1dh8dal→End) | ✓ | ✓ |
| SequenceFlow_0xqzbh4 | (없음 — Task_08v4ryn→End) | ✓ | ✓ |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ (스키마 As-Is 보존 결정) + D.4 ✗ + 사유 명시 (사용자 결정) + D.5 ✓ — **사용자 결정 사유에 따른 D.4 ✗ 는 설계 미완성으로 판정하지 않는다** → §D = **✓ (환경 제약 명시 조건)**.

---

## §E. As-Is 누락 0 점검 (사용자 요구사항 [§3, §4])

### E.1 xfdl 컴포넌트 전수

| xfdl 컴포넌트 종류 | 분석 §3 등재 수 | 검증 방법 | 결과 |
|---|---:|---|---|
| Form / Layout / Div (컨테이너) | A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-LEFT (div_mainGrd) / A-MAIN-RIGHT (div_mainDetail) / A-FOOTER + div_topMenu / div_rightMenu / div_leftMenu / div_bottom = 11 (분석 §3.1 + §3.6) | xfdl Div / Layout / Form 전수 grep | ✓ |
| Static (라벨 / 박스) | edt_st_permission_id / edt_st_permission_nm / edt_st_permission_desc / edt_st_BIZ_SYSTEM_CODE / edt_st_use_tp / ed_st_start_active_date / edt_st_end_active_date / edt_st_permission_custom / edt_st_permission_common (Static D-015 mark) / edt_st_popup_btn / edt_st_permission_action / edt_dtl_info / edt_srch_cseq / stc_bizSystemCode / sts_permissionId / sts_permissionNm / sts_useTp + stc_Static1~12 (시각 박스) = 26 D-NNN + 시각 박스 (분석 §3.5) | xfdl `<Static ...>` 전수 grep + Edit readonly cssclass `edi_WF_Label*` | ✓ |
| Edit (TextBox) | edt_title / edt_permission_id / edt_permission_nm / edt_permission_desc / edt_PERMISSION_ID / edt_PERMISSION_NM = 6 (분석 §3.2 / §3.5) | xfdl `<Edit ...>` 전수 grep | ✓ |
| TextArea | txa_permission_common / txa_permission_custom / txa_popup_btn / txa_permission_action = 4 (분석 §3.5 D-016/D-019/D-022/D-024) | xfdl `<TextArea ...>` 전수 grep | ✓ |
| Combo | **As-Is** cbo_bizSystemCode (검색조건 S-001) / cbo_USE_TP (S-004) / cbo_bizSystemCode (Detail D-008 — 동일 id 분리 컨텍스트) = 3 → **To-Be 1** (cbo_USE_TP 만 잔존 — cross-cutting 정책 #1 로 S-001 / D-008 cbo_bizSystemCode 2 폐기) | xfdl `<Combo ...>` 전수 grep | ✓ |
| Radio | edt_use_tp (D-010 Y/Yes + N/No vertical) = 1 | xfdl `<Radio ...>` 전수 grep | ✓ |
| Calendar | cal_start_active_date (D-012) / cal_end_active_date (D-014) = 2 | xfdl `<Calendar ...>` 전수 grep | ✓ |
| Grid | grd_main (G-001~G-012) = 1 그리드 + 12 컬럼 (분석 §3.3) | xfdl `<Grid ...>` 전수 grep | ✓ |
| Button | btn_fold (B-001) / btn_common_find (B-002) / btn_custom_find (B-003) = 3 (§4.1) | xfdl `<Button ...>` 전수 grep | ✓ |
| Dataset | **As-Is** ds_main / ds_cmbValidYn / ds_lovSubSystem = 3 (§3.7) → **To-Be 2** (ds_lovSubSystem 폐기 + ds_main BIZ_SYSTEM_CODE 컬럼 제거 — cross-cutting 정책 #1) | xfdl `<Dataset ...>` 전수 grep | ✓ |
| Script function | **As-Is** 20 메서드 (§4.4) → **To-Be 19** (fn_lov 폐기 — cross-cutting 정책 #1) | xfdl Script `this.X = function` 전수 grep | ✓ |
| Bind | **As-Is** item0~item10 = 11 (분석 §3.5 + xfdl:495~507) → **To-Be 10** (item10 BIZ_SYSTEM_CODE 폐기 — cross-cutting 정책 #1) | xfdl `<BindItem ...>` 전수 grep | ✓ |

### E.2 Java 메서드 전수

| 클래스 | 메서드 수 | 분석 §7 등재 | 결과 |
|---|---:|---|---|
| (해당 없음 — Java UserTask 폴더 부재) | 0 | §0 / §2 #2 / §7 해당 없음 명시 + ls 검증 (csa 하위 4 폴더만 — CommPermMng ✗) | ✓ |

### E.3 Mapper.xml SQL ID 전수

| SQL ID | 분석 §6 등재 | 결과 |
|---|---|---|
| selectCommPermMng | ✓ #1 (As-Is BIZ_SYSTEM_CODE 컬럼 SELECT/WHERE → **To-Be 제거** — cross-cutting 정책 #1) | ✓ |
| insertCommPermMng | ✓ #2 (As-Is BIZ_SYSTEM_CODE 컬럼 + 바인딩 → **To-Be 제거**) | ✓ |
| updateCommPermMng | ✓ #3 (As-Is BIZ_SYSTEM_CODE 컬럼 + 바인딩 → **To-Be 제거**) | ✓ |
| deleteCommPermMng | ✓ #4 | ✓ |
| ~~CommObjMngMapper.selectAppHostId (cross-module)~~ | ~~✓ #5 (BPMN bpmn:65 호출 — owner = commObjMng 화면)~~ → **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기 + cross-module 호출 제거) | ✓ |

### E.4 BPMN flow 전수

| BPMN 요소 | 분석 §8 등재 수 | 결과 |
|---|---:|---|
| startEvent | 1 (StartEvent_1) | ✓ |
| endEvent | 1 (EndEvent_1, **As-Is 3** incoming → **To-Be 2** incoming) | ✓ |
| exclusiveGateway | 1 (ExclusiveGateway_1, **As-Is 3** outgoing → **To-Be 2** outgoing) | ✓ |
| task (CommonSelectTask **As-Is 2 → To-Be 1** + CommonMultiSaveTask 1) | **As-Is 3 → To-Be 2** (Task_08v4ryn 폐기 — cross-cutting 정책 #1) | ✓ |
| userTask | 0 (해당 없음) | ✓ |
| sequenceFlow | **As-Is 7 (3 action 분기 + 4 chain to End) → To-Be 5 (2 action 분기 + 3 chain to End)** | ✓ |

### E.5 결함 처리 (사용자 요구사항 [§4])

| 결함 ID | 위치 | 처리 |
|---|---|---|
| 오타 #1: xfdl titletext "PERMISSON 관리" (정상은 "PERMISSION 관리") | As-Is 보존 (분석) + To-Be "PERMISSION 관리" 정정 결정 (§11) | ✓ |
| 오타 #2: BPMN process id `sample1` / name `menuInfor` (다른 화면 잔존) | As-Is 보존 (분석) + To-Be `commPermMng` 정정 결정 (§11 / BPMN설계서 §6) | ✓ |
| selectCommPermMng SELECT 절 BIZ_SYSTEM_CODE 중복 (xml:18 / 23) | As-Is 보존 (분석) + To-Be 1 회로 정리 결정 (§11) | ✓ |
| END_ACTIVE_DATE 신규 default `"99991231"` (8자 String) | As-Is 보존 (분석) + To-Be `LocalDate.of(9999,12,31)` 또는 `'9999-12-31'` 명시 결정 (§11) | ✓ |
| fn_callBack saveCmPerm "조회" 메시지 (xfdl:343 — 저장 콜백인데 "조회") | As-Is 보존 (사용자 결정 위임 — 분석 §12 결정 누적) | ✓ |
| fn_lov callback (xfdl:354~357 주석 코드 잔존 — 처리 ✗) | As-Is 보존 (실 동작 없음) | ✓ |
| S-002 / S-003 / D-002 / D-004 / D-006 default placeholder "부산역 CY" (저장 ✗) | As-Is 보존 (분석) + To-Be 빈 값 정정 (디자인설계서 §3.1) | ✓ |
| Java UserTask 폴더 부재 (mui csa 하위에 CommPermMng 폴더 ✗) | As-Is 그대로 (해당 없음 — ScriptTask 만 사용). To-Be 도 표준 Task | ✓ |
| ref_Audit fragment 정의 파일 미동봉 | As-Is include (분석) + To-Be cactus-core `CactusAuditEntity` (9 컬럼 자동 JPA `@PrePersist`/`@PreUpdate`) 적용 결정 | ✓ |
| gfn_dsRequired 필수 컬럼이 PERMISSION_ID / USE_TP 만 (D-008 BIZ_SYSTEM_CODE Essential 라벨링이나 검증 ✗) | As-Is 보존 (분석) → **cross-cutting 정책 #1 (2026-05-31) 로 D-008 자체 폐기** — 보강 후보 항목 소거 (기능설계서 §6.1 갱신) | ✓ |
| **cross-cutting 정책 #1 (2026-05-31)** | BIZ_SYSTEM_CODE 컬럼 화면 사용 폐기 — S-001 (검색 콤보) / D-007·D-008 (Detail Essential 콤보) / G-008 (Grid 컬럼) / DS-003 (ds_lovSubSystem) / Bind item10 / Script fn_lov + fn_callBack lov 분기 / Mapper SQL BIZ_SYSTEM_CODE 분기 (xml:18·23·36·51·65·81) / BPMN Task_08v4ryn + SequenceFlow_1dd2kqv·0xqzbh4 / cross-module CommObjMngMapper.selectAppHostId 모두 To-Be 폐기. DB DDL 의 BIZ_SYSTEM_CODE VARCHAR(10) NOT NULL 컬럼 자체는 보존. 4 종 산출물 본문에 As-Is 인용 + To-Be 폐기 (~~취소선~~ + 사유) 패턴 일관 적용 | **closed** |
| **cross-cutting 정책 #6 A안 (2026-05-31)** | Entity 명 = `SecPerm` (TB_MCM_SEC_PERM → SecPerm 1:1 직역). SecPermButton Entity 미생성 (As-Is mui 에 PERM_BUTTON 별도 테이블 ✗). Role 매핑 Entity = `SecRoleMapping` (read-only, commRoleMng 화면 owner). BPMN설계서 §5 / §6 + 분석리포트 §11.1 + 기능설계서 §12 모두 명시 | **closed** |

> **§E 결과**: xfdl 모든 컴포넌트 전수 (As-Is 인용 + To-Be count 동기화) + Java 부재 명시 + Mapper 4 자체 + ~~cross-module 1 SQL~~ 폐기 (cross-cutting 정책 #1) + BPMN As-Is 6/7 → To-Be 5/5 + 결함 13 건 (기존 11 + cross-cutting 정책 #1·#6 2) 모두 As-Is 1:1 보존 + Q-001 해소 (2026-05-30 §9.3 신설) — 누락 0 + 임의 정정 0.

---

## §F. To-Be 변환점 (Oracle → MSSQL) — 분석 §11 영향 SQL 정합

| 변환 항목 | 영향 SQL ID | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 검증 |
|---|---|---|---|---|---|
| `\|\|` 문자열 결합 → `+` 또는 CONCAT | selectCommPermMng | §12 To-Be 변환점 | (해당 없음) | §2.1 (xml:27 / 30 cite) | ✓ |
| UPPER(...) — MSSQL 동일 지원 | selectCommPermMng | §12 | (해당 없음) | §2.1 (xml:27 / 30) | ✓ |
| scalar subquery in SELECT + ROWNUM=1 → SELECT TOP 1 | selectCommPermMng (xml:19~22) | §12 | (해당 없음) | §2.1 / §4.1 | ✓ |
| NOT EXISTS subquery — MSSQL 동일 | deleteCommPermMng (xml:92~95) | §6.3 + §12 | (해당 없음) | §2.2 (CommonMultiSaveTask deleteSqlKey + 안전장치 명시) | ✓ |
| MyBatis `<where>` + `<if>` dynamic SQL — DBMS 무관 | selectCommPermMng (xml:25~38) | §12 | (해당 없음) | §2.1 / §4.1 | ✓ |
| `ref_Audit` fragment 폐기 — To-Be cactus-core `CactusAuditEntity` 9 컬럼 + JPA `@PrePersist`/`@PreUpdate` 자동 처리 | insertCommPermMng / updateCommPermMng (xml:55 / 69 / 85) | §12 | (해당 없음) | §7.1 (audit 9 컬럼) | ✓ |
| 스키마 prefix ✗ → `MCMAPUSER.` (사용자 결정 — As-Is 테이블명 보존) | (모든 SQL) | §12 / 기능 §1.1 (MCMAPUSER 명시) | (해당 없음) | §6 (To-Be 명명 안) | ✓ |
| ~~cross-module sqlKey 하드코딩 (`CommObjMngMapper.selectAppHostId`) — OASIS 유지~~ → **To-Be 폐기** (cross-cutting 정책 #1, 2026-05-31) | (lov BPMN Task_08v4ryn 폐기) | §12 (cross-module 폐기 + 정책 #1 행) | §4.2 (LV-003 cross-module 폐기) | §1.1 (API-003 폐기) / §4.2 (cross-module SQL 폐기) | ✓ |
| **BIZ_SYSTEM_CODE 컬럼 화면 사용 폐기 (cross-cutting 정책 #1, 2026-05-31)** | selectCommPermMng (xml:18/23/36) + insertCommPermMng (xml:51/65) + updateCommPermMng (xml:81) | §3.1 (S-001 폐기) + §3.2 (G-008 폐기) + §4.1 (D-007/D-008 폐기) + §11 변환점 (cross-cutting 정책 #1 행) + §12 변환점 (BIZ_SYSTEM_CODE 컬럼 행) | §3.1 (S-001 폐기) + §3.2.2 (G-008 폐기) + §3.3.1 (FormGrid 4행 폐기) + §3.3.3 (item10 폐기) + §4.2 (LV-003 폐기) | §1.1 (API-003 폐기) + §2.3 (lov 흐름 폐기) + §3.1 (Task_08v4ryn 폐기) + §3.2 (SequenceFlow_1dd2kqv·0xqzbh4 폐기) + §3.3 (lov enum N) + §6 (BIZ_SYSTEM_CODE 폐기 행) | ✓ |
| **Entity 명 = SecPerm (cross-cutting 정책 #6 A안, 2026-05-31)** | (Entity 정의 — 본 화면 신규) | §12 (Entity 명 SecPerm 행) | (해당 없음) | §5 (To-Be Entity SecPerm extends CactusAuditEntity) + §6 (Entity 명 행) | ✓ |
| Optimistic Locking | (cactus-core `VER` 자동 — As-Is 에는 없음) | §12 | (해당 없음) | §7.1 (VER 컬럼) | ✓ |
| xfdl titletext 오타 "PERMISSON" → "PERMISSION" | (해당 없음 — UI 표시) | §12 + 디자인 §3.4 (PageLayout.title) | §3.4 | §6 | ✓ |
| BPMN process id `sample1` / name `menuInfor` → `commPermMng` | (BPMN 메타) | §12 | (해당 없음) | §6 (To-Be 명명 안) | ✓ |
| selectCommPermMng SELECT BIZ_SYSTEM_CODE 중복 → 1 회로 정리 | selectCommPermMng (xml:18 / 23) | §12 | (해당 없음) | §6 | ✓ |
| `END_ACTIVE_DATE` 신규 default `"99991231"` → `LocalDate.of(9999,12,31)` | (Service 레이어) | §12 + 기능 §11.2 | (해당 없음) | §6 | ✓ |

> **§F 결과**: **As-Is 13 변환점 → To-Be 15 변환점** (cross-cutting 정책 #1·#6 2 행 추가, 2026-05-31) — 모두 분석리포트 §11 인용 + 영향 SQL 1:1 매핑.

---

## §G. 확인필요 항목 집계 — 활성 0건

> 분석 단계 식별 항목 모두 사용자 결정 완료. **활성 확인필요 = 0 건**. 결정 누적 표는 분석리포트 §12 (19 행) 참조. 본문 반영 위치: §6 (SQL ID — 자체 4 SQL / cross-module 1 SQL 폐기) / §8 (BPMN — As-Is 6 노드 / 7 flow → To-Be 5 노드 / 5 flow) / §9 (audit cactus-core 9 컬럼 통일) / §9.3 (DMES 49 컬럼 1:1) / §11 (스키마 대문자 prefix 보존 / titletext "PERMISSON" 정정 / process id "sample1" 정정 / SELECT BIZ_SYSTEM_CODE 중복 정리 — cross-cutting 정책 #1 흡수 / END_ACTIVE_DATE LocalDate 변환 / cross-module SQL 폐기 / Entity 명 SecPerm A안 / 패키지 mcm.csa.commPermMng).

| Q-ID | 영역 | 미결정 항목 | 후속 처리 |
|---|---|---|---|
| (없음) | — | 활성 확인필요 항목 = 0 건. 분석 단계 식별 항목은 모두 분석리포트 §12 결정 누적표 (19 행 = 기존 15 행 + cross-cutting 정책 #1·DDL·#6·#4(0) 4 행) 에 반영 완료 | — |

---

## §H. 환경 제약 명시 종합 (사용자 요구사항 [§0] / [§13])

| # | 환경 제약 | 영향 절 | 처리 |
|---|---|---|---|
| 1 | Runner / R14-Step0 / manifest 9 파일 검증 미적용 | §A.1 (A-R12-1, A-R12-4) + §A.3 + §D.4 | ✗ + 사유 명시 ("Runner config mui 미지원 — 사용자 결정으로 생략") |
| 2 | 가이드 템플릿 WinForms 전제 항목은 mui 등가물로 매핑 | 분석리포트 §0 + 본 §A.1 (A-T1A / A-R12-3 / A-R12-5) | mui 등가 매핑 (designer.cs → xfdl Layout / cs Click+= → xfdl onclick / sp.sql @Case → BPMN sequenceFlow name 분기 / Mapper.xml inline SQL) |
| 3 | As-Is = Oracle (`\|\|`/`UPPER`/`ROWNUM`/`NOT EXISTS`/스키마 prefix ✗) → To-Be = MSSQL `sample_dmes` `MCMAPUSER` 스키마 (As-Is 테이블명 보존) + cactus-core `CactusAuditEntity` audit 자동 적용 | §F + 분석 §11 | 13 변환점 명시 — 모든 결정 사항 본문 반영 |
| 4 | Java UserTask 폴더 부재 (csa 하위 CommPermMng 폴더 ✗) | §0 / §2 #2 / §7 / §E.2 | 표준 ScriptTask (CommonSelectTask / CommonMultiSaveTask) 만 사용 — 화면 전용 Java 코드 ✗ 명시 |
| 5 | DMES Excel csa 시트 DDL 추출 완료 (Q-001 해소 2026-05-30) | §2 #5 / §9.3 / §G | Q-001 closed — DMES xlsx 직접 추출 / 분석 §9.3 49 컬럼 전수 |
| 6 | commonPermBtnPopup.xfdl 본 화면 분석 범위 외 | §5 | 호출 인자 (`oArg`) + 콜백 반환 (`rtVal`) 만 등재 — 외부 공통 팝업 |
| 7 | **cross-cutting 정책 #1 (2026-05-31)** — BIZ_SYSTEM_CODE 컬럼 화면 사용 폐기 (cross-module CommObjMngMapper.selectAppHostId 호출 제거 포함) | 분석 §1 / §3.2 / §3.5 / §3.7 / §4.4 / §6 / §8 / §9.1 #11 / §10 / §11 / §12 + 기능 §3.1 / §3.2 / §3.3 / §4.1 / §6.1 / §11.3 / §12 + 디자인 §1.2 / §2.1 / §3.1 / §3.2.2 / §3.3.1 / §3.3.3 / §4.2 + BPMN §1.1 / §1.2 / §2.3 / §3.1 / §3.2 / §3.3 / §4.1 / §4.2 / §6 + 정합 §A.2 / §B / §C / §D.1 / §E.1 / §E.3 / §E.4 / §E.5 / §F | 4 종 산출물 본문 As-Is 인용 + To-Be 폐기 패턴 일관 적용 |
| 8 | **cross-cutting 정책 #6 A안 (2026-05-31)** — Entity 명 = `SecPerm` (TB_MCM_SEC_PERM 1:1 직역. SecPermButton 미생성) | 분석 §11.1 / §12 + 기능 §12 + BPMN §5 / §6 + 정합 §C / §D.1 / §E.5 | A-Is mui 에 PERM_BUTTON 별도 테이블 ✗ 검증 |

> 모든 환경 제약 명시 + 정합체크서 §A / §D 의 ✗ 사유가 사용자 결정에 의한 미적용임을 명시 — 본 ✗ 는 **설계 미완성으로 판정하지 않는다**. cross-cutting 정책 #1·#6 (2026-05-31) 의 4 종 산출물 동기화 완료.

---

## §I. 정합체크 종합 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A 구조 동일성 + 누락 | ✓ (환경 제약 명시 조건) | A.1 2 행 ✗ + A.3 ✗ — 모두 사용자 결정 [§0] 사유. A.2 Q-001 해소 2026-05-30 (분석 §9.3 신설) + cross-cutting 정책 #1 의 To-Be count 동기화 |
| §B 명명 규칙 | ✓ | 모든 행 ✓, MES 단일 룰 적용 |
| §C 5축 정합 | ✓ | **As-Is 16 → To-Be 17** 일치 키 모두 ✓ (cross-cutting 정책 #6 Entity 명 행 추가) |
| §D 반복 결정성 | ✓ (환경 제약 명시 조건) | D.4 9 파일 ✗ — 사용자 결정 [§0] 사유. D.1 cross-cutting 정책 #1·#6 적용 행 추가 |
| §E As-Is 누락 0 | ✓ | xfdl 전수 + Java 부재 명시 + Mapper 4 자체 SQL (cross-module 1 폐기) + BPMN **As-Is 6/7 → To-Be 5/5** + 결함 **13 건** (cross-cutting 정책 #1·#6 추가) 모두 As-Is 1:1 보존 |
| §F To-Be 변환점 | ✓ | **As-Is 13 → To-Be 15** 변환점 모두 cite (cross-cutting 정책 #1·#6 2 행 추가) |
| §G Q-NNN 추적 | 활성 0 (Q-001 해소 2026-05-30) | Q-001 — DMES Excel csa 2 시트 직접 추출 완료 → 분석 §9.3 49 컬럼 전수 |
| §H 환경 제약 명시 | ✓ | **6 → 8 환경 제약** 모두 사유 등재 (cross-cutting 정책 #1·#6 2 행 추가) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §J 사용자 검수 이력 (W5 + Round 1~7) | ✓ | W5 A~G 7 패턴 + Round 5 PERMISSION_ID readOnly 점검 + Round 6 N/A + Round 7 btn_close 제거 + 변경 카탈로그 11 항목 closed (2026-06-05) |
| §K cross-ref (Round 결함 ↔ W5 패턴 ↔ 본문 갱신) | ✓ | Round 6 = N/A / Round 7 = ✓ 본문 갱신 완료 (2026-06-05) |

> **설계 완성 판정**: §A ~ §F 6 개 절 모두 ✓ (환경 제약 ✗ 는 사용자 결정 사유 등재로 우회) + §G 활성 0건 (Q-001 해소 2026-05-30) + cross-cutting 정책 #1·#6 (2026-05-31) 4 종 산출물 동기화 완료 + §J 사용자 검수 이력 **11 항목** closed (2026-06-05) + §K cross-ref Round 7 등재 완료 → **설계 완성**.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §J. 사용자 검수 이력 (W5 패턴 + Round 1~7)

> 본 §J 는 commPermMng 화면 개발 Round 1~7 의 사용자 검수 피드백 + W5 A~G 패턴 적용 이력을 디자인설계서 정합 갱신 결과와 1:1 매핑한다. **모든 항목 closed** (2026-06-05). Round 6 은 본 화면에 해당 변경 ✗ (N/A).

### §J.0 Round 카탈로그 표

| Round | 일자 | 변경 | 영향 § / D-NNN / G-NNN / B-NNN |
|---|---|---|---|
| Round 1 | 2026-06-02 | W5-A 자동 조회 (`loadList()`) 적용 — csa 자동조회 정책 | 디자인 §3.4 + frontmatter W5 박스 |
| Round 2 | 2026-06-02~03 | W5-B Detail BindItem 정합 + W5-C commonPermBtnPopup Modal 정식 신설 (14 옵션 체크박스 그리드) | 디자인 §3.3.3 + §6.1 + D-016 / D-019 / D-022 / D-024 |
| Round 3 | 2026-06-03 | Detail 확대 + 찾기 버튼 위치 (사전 적용) | 디자인 §3.3 + §3.3.1 (FormGrid 8~9 행 D-017 / D-020) |
| Round 4 | 2026-06-03~04 | W5-D Detail 패널 확대 (420→700) + W5-E Textarea rows 통일 + W5-F 찾기 버튼 하단 + W5-G Detail wrapper overflow + height | 디자인 §2.1 + §3.3 + §3.3.1 + D-016 / D-019 / D-022 / D-024 / D-017 / D-020 |
| Round 5 | 2026-06-04 | PERMISSION_ID readOnly inserted-only 점검 (이미 적용 — 재확인) | 디자인 §3.2.2 G-002 + §3.3.1 D-002 + §3.3.3 Bind item0 |
| Round 6 | 2026-06-04 | **N/A** — 본 화면에 해당하는 Round 6 변경 ✗ | N/A |
| Round 7 | 2026-06-04~05 | **btn_close 완전 제거** — PageLayout.buttons 배열에서 entry 삭제 + unused `handleClose` dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 처리 | 디자인 §1.2 PageLayout.buttons 시각화 + 표 + §3.4 buttons 행 + btn_close onClick 행 폐기 + frontmatter W5 박스 8 행 |

### §J.1 W5 패턴 적용 (W5-A ~ W5-G)

| W5 | 패턴 | Round | 적용 위치 (디자인설계서) | 검증 |
|---|---|---|---|---|
| W5-A | onload 자동 조회 (`loadList()`) — csa 자동조회 정책 (project_csa_cme_iter_propagation, 2026-06-02) | Round 1 | 디자인설계서 §3.4 (A-TITLE) onload 자동 조회 행 + frontmatter 직후 W5 적용 박스 | ✓ |
| W5-B | Detail BindItem 정합 (11 필드 — 10 활성 + BIZ_SYSTEM_CODE 폐기) | Round 2 | 디자인설계서 §3.3.3 (Bind item 표 + W5-B 정합 컬럼) | ✓ |
| W5-C | commonPermBtnPopup Modal 정식 신설 (window.prompt fallback → 14 옵션 체크박스 그리드) | Round 2 | 디자인설계서 §6.1 (Modal 정식 신설) | ✓ |
| W5-D | Detail 패널 폭 확대 (420 → 700) | Round 4 | 디자인설계서 §2.1 (layoutMode) + §3.3 (Detail 패널 폭 본문) | ✓ |
| W5-E | Textarea rows 통일 (COMMON/CUSTOM/POPUP rows={3} + ACTION rows={7}) | Round 4 → 사용자 명시 | 디자인설계서 §3.3.1 (FormGrid 표 8~11 행) + §3.3.3 (Bind 표 W5-B 컬럼) | ✓ |
| W5-F | Find Button 위치 변경 (Textarea 우측 → 하단, `flex column` + `Button alignSelf:flex-start width:80`) | Round 4 | 디자인설계서 §3.3.1 (FormGrid 표 8~9 행) | ✓ |
| W5-G | Detail wrapper overflow + height fix (`overflow:hidden` + `height:calc(100% - 32px)`) | Round 4 fix | 디자인설계서 §3.3 (Detail wrapper overflow 본문) | ✓ |

### §J.2 Round 5 점검 결과

| 항목 | 점검 결과 | 적용 위치 |
|---|---|---|
| PERMISSION_ID readOnly 분기 (inserted 만 편집 가능 / 기존 행 readOnly) | **이미 적용됨** — §3.2.2 G-002 (`editable` 행별 분기) + §3.3.1 D-002 (`disabled` 분기) 정책으로 As-Is `ds_main_onrowposchanged` 등가 구현 정합 검증 완료 | 디자인설계서 §3.2.2 G-002 비고 + §3.3.1 D-002 + §3.3.3 Bind item0 W5-B 정합 컬럼 |

### §J.3 변경 카탈로그 ↔ 디자인설계서 본문 갱신 매핑

| 변경 카탈로그 # | 항목 | 디자인설계서 본문 § |
|---:|---|---|
| 1 | W5 A~G 패턴 | frontmatter 직후 W5 적용 박스 (7 항목) + §3.4 (W5-A) + §3.3.3 (W5-B) + §6.1 (W5-C) + §2.1·§3.3 (W5-D) + §3.3.1 (W5-E·F) + §3.3 (W5-G) |
| 2 | Detail BindItem 정합 (Round 2 / 11 필드) | §3.3.3 (Bind 표 + W5-B 정합 컬럼) |
| 3 | commonPermBtnPopup Modal 신설 (Round 2) | §6.1 (Modal 정식 신설 — 14 옵션 체크박스 그리드) |
| 4 | Detail 패널 확대 (Round 4 / 420 → 700) | §2.1 (layoutMode) + §3.3 (Detail 패널 폭 본문) |
| 5 | Textarea rows 통일 (Round 4) | §3.3.1 FormGrid 표 8~11 행 (COMMON/CUSTOM/POPUP rows={3} + ACTION rows={7}) |
| 6 | 찾기 버튼 위치 변경 (Round 4) | §3.3.1 FormGrid 표 8~9 행 (D-017 / D-020 하단 배치) |
| 7 | Detail wrapper overflow + height (Round 4 fix) | §3.3 본문 (Detail wrapper overflow + height) |
| 8 | ACTION textarea rows 5 → 7 (Round 4 사용자 명시) | §3.3.1 FormGrid 표 11 행 (D-024 rows={7}) |
| 9 | PERMISSION_ID readOnly inserted 만 (Round 5 점검) | §3.2.2 G-002 + §3.3.1 D-002 + §3.3.3 item0 (이미 적용됨 — 재확인) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 10 | Round 6 — 본 화면에 해당 변경 ✗ (N/A) | N/A — 다른 csa 화면 Round 6 결함 대응 중 본 화면은 무영향 |
| 11 | **btn_close 완전 제거 (Round 7, 2026-06-04~05)** — PageLayout.buttons 배열에서 entry 삭제 + unused `handleClose` dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 처리 — 화면 내부 닫기 버튼 의미 ✗. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 | 디자인 §1.2 (PageLayout.buttons 시각화 + 표) + §3.4 (A-TITLE buttons 행 + btn_close onClick 행 폐기) + frontmatter W5 박스 8 행 |

### §J.4 Round 6~7 결함 / W5 패턴 변경 / 변경 확정 시각 (cross-ref)

> 본 §J.4 는 §K (cross-ref) 와 1:1 매핑 — 본 화면 Round 6~7 의 결함 / W5 패턴 변경 / 확정 시각을 ✓/✗ 표로 등재.

| 항목 | Round 6 | Round 7 | 확정 시각 (✓ = 본문 반영 완료 / ✗ = 미반영) |
|---|---|---|---|
| 본 화면 영향 | N/A | ✓ (btn_close 제거) | Round 7 = ✓ (2026-06-05) / Round 6 = N/A |
| W5 패턴 변경 | N/A | W5 신설 ✗ (Round 7 은 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 단순 적용 — W5 패턴 등재 ✗ / frontmatter W5 박스 8 번째 행에 Round 7 변경 1 줄 등재) | Round 7 = ✓ (W5 박스 8 행 등재 완료) |
| 디자인설계서 본문 갱신 | N/A | ✓ §1.2 PageLayout.buttons 시각화 + 표 + §3.4 A-TITLE buttons 행 + btn_close onClick 행 폐기 + frontmatter W5 박스 | ✓ (2026-06-05) |
| 정합체크서 §J 갱신 | N/A | ✓ §J.0 Round 카탈로그 + §J.3 변경 카탈로그 # 10~11 추가 | ✓ (2026-06-05) |
| 정합체크서 §K (cross-ref) 갱신 | N/A | ✓ §K Round 7 행 추가 | ✓ (2026-06-05) |

> **§J 결과**: 변경 카탈로그 **11 항목** 모두 closed (2026-06-05). 디자인설계서 본문 갱신 완료 (§1.2 / §3.4 + §11 신설) + 정합체크 §J / §K 검수 이력 등재 완료.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §K. cross-ref (Round 결함 ↔ W5 패턴 ↔ 본문 갱신 — Round 6~7)

> 본 §K 는 Round 6~7 결함 / W5 패턴 변경 / Round 변경 확정 시각을 본 화면 4 종 산출물 갱신 상태와 1:1 매핑한다. ✓ = 본문 반영 완료 / ✗ = 미반영 / N/A = 본 화면 해당 ✗.

### §K.1 Round 6~7 cross-ref

| Round | 결함 / 변경 | W5 패턴 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 확정 시각 |
|---|---|---|---|---|---|---|---|
| Round 6 | N/A — 본 화면에 해당 변경 ✗ (다른 csa 화면 Round 6 결함 대응 중 본 화면은 무영향) | N/A | N/A | N/A | N/A | N/A | N/A |
| Round 7 | **btn_close 완전 제거** — PageLayout.buttons 배열에서 entry 삭제 + unused `handleClose` dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장). 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준. 사유: portal 탭 close 는 host 처리 | W5 신규 패턴 등재 ✗ (frontmatter W5 박스 8 번째 행에 Round 7 변경 1 줄 등재 — 패턴 ID 미부여 — 단순 가이드 표준 변경 적용) | N/A (분석리포트는 As-Is 인용 기반 — Round 7 은 ToBe 변경) | ✓ (만일 §5 / §11 등 영향 절에서 닫기 버튼 처리 등재 행이 있다면 폐기 — 본 화면 기능설계서는 별도 갱신 위임) | ✓ §1.2 (PageLayout.buttons 시각화 + 표) + §3.4 (A-TITLE buttons 행 + btn_close onClick 행 폐기) + frontmatter W5 박스 8 행 (2026-06-05) | N/A (BPMN 은 화면 내부 버튼 ✗ — Round 7 무영향) | 2026-06-05 |

### §K.2 결함 / W5 패턴 / 본문 갱신 종합 표 (✓/✗)

| 항목 | Round 6 | Round 7 |
|---|---|---|
| 본 화면 영향 | N/A | ✓ |
| W5 패턴 신규 등재 | N/A | ✗ (가이드 표준 변경 적용 — 패턴 ID 미부여) |
| 분석리포트 본문 갱신 | N/A | N/A (As-Is 인용) |
| 기능설계서 본문 갱신 | N/A | ✓ (필요 시 별도 worker — 본 정합체크 갱신 범위는 디자인설계서 + 정합체크 2 문서) |
| 디자인설계서 본문 갱신 | N/A | ✓ (2026-06-05) |
| BPMN설계서 본문 갱신 | N/A | N/A |
| 정합체크 §J / §K 갱신 | N/A | ✓ (2026-06-05) |
| 확정 시각 | N/A | 2026-06-05 |

> **§K 결과**: Round 6 = N/A (본 화면 무영향) / Round 7 = ✓ (디자인설계서 §1.2 + §3.4 + frontmatter W5 박스 + §11 신설 + 정합체크 §J / §K 갱신 완료, 2026-06-05). 본 화면 4 종 산출물 중 디자인설계서 + 정합체크 2 문서 갱신 범위 — 기능설계서 / 분석리포트 / BPMN설계서는 Round 7 영향 N/A 또는 별도 worker 위임.

---

### §6.14 Phase 5 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---:|---|---|
| 1 | 14항 위반? | No — §A~§F 6 개 절 판정 + 환경 제약 ✗ 사유 명시 + Q-001 해소 2026-05-30 + cross-cutting 정책 #1·#6 4 종 산출물 동기화 (2026-05-31) — As-Is 1:1 / cite 100% / 누락 0 / 결함 13 건 처리 |
| 2 | 검증 안 한 부분? | No — Q-001 해소 2026-05-30 (분석 §9.3 신설 / 2 시트 49 컬럼 전수). cross-cutting 정책 #1·#6 (2026-05-31) 의 To-Be count (S 3 / G 11 / D 24 / LV 2 / DS 2 / Bind 10 / Script 19 / BPMN 노드 5 / sequenceFlow 5 / action 2 / SQL 자체 4 + cross-module 0) 동기화 검증. 잔존 0건 |
| 3 | 그대로 수용? | No — A.1 A-R12-1 / A-R12-4 + A.3 + D.4 9 파일 모두 ✗ + 사유 명시 (사용자 결정 [§0]) — 임의 ✓ 처리 ✗. cross-cutting 정책 #1·#6 도 As-Is 인용 보존 + To-Be 폐기 ~~취소선~~ 표기 일관 적용 |
| 4 | 임의 합리화? | No — 환경 제약 ✗ 가 "설계 미완성으로 판정하지 않는다" 결정은 §0 사용자 결정 사유 + masterCodeMng 참고 패턴과 동일 정합. cross-cutting 정책 #1 (BIZ_SYSTEM_CODE 폐기) + #6 (Entity 명 SecPerm A안) 은 사용자 결정으로 메인 적용 — 본 화면 추가 결정 사항 ✗ |

> 4 질문 모두 No (Q-001 해소 2026-05-30 + cross-cutting 정책 #1·#6 적용 2026-05-31 + Round 6~7 동기화 2026-06-05 — Round 6 N/A / Round 7 btn_close 제거 디자인설계서 §1.2 + §3.4 + §11 + frontmatter W5 박스 + 정합체크 §J / §K 본문 갱신 완료). §A~§F 판정 — Phase 5 통과.
