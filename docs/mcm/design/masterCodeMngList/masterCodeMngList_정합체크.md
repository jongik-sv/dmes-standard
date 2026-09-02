---
screenId: masterCodeMngList
asIsId: MasterCodeMngList
moduleId: mcm
moduleGroup: cme
작성일: 2026-05-29 (W5 정합 + Round 2 카테고리 nowrap / 그리드 폭 확장 / V-702 cme 자동조회 예외: 2026-06-04)
작성자: Agent
---

# Master Code 상세조회 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 Q-NNN = 0 건 (사용자 결정 완료 — 분석 §12 결정 누적 표 참조).
> **환경 제약 (사용자 결정 [§10])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §D.4 = ✗ + 사유 명시.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§13 / §1~§10 / §1~§7 / §1~§7 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (기능 §4 D-NNN / 기능 §9 P-NNN / 디자인 §5.4 GB-NNN / BPMN §2.3) | (해당 없음 항목 0) | ✓ (4 / 5.1-1 / 9 보존) | ✓ (5.4 / 6 보존) | ✓ (2.3 / 3 보존) | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§11] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §10에 의해 신설 / §17 컬럼 1:1 = 사용자 요구사항 §17.2에 의해 신설) | ✓ | ✓ | ✓ | ✓ | §0 / §17 모두 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter (moduleGroup=cme — To-Be) |
| **A-T1A**: 분석리포트 §3.1 영역 수 7 (5 표준 + 2 추가: A-TITLE / A-FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | A-MAIN-LEFT/RIGHT 좌우 분할 추가 + TITLE/FOOTER |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §10 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl) + D2 (Mapper.xml SQL) 만 존재, D3 SP 의존 ✗. 본 화면은 D1+D2 만 (Java UserTask 0) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 미존재 (Oracle SP/함수/트리거 미사용 — Mapper.xml inline SQL 만) |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / oncellclick / onheadclick / onitemchanged / onload 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.4 의 메서드 표 13 행 + §17.4 cell-level 분해로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 4 SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§10] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 2 | 2 | 2 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 컬럼 (G-NNN) | 11 | 11 | 11 | (해당 없음) | - | 0 | 0 | ✓ |
| 확장 그리드 (GE-NNN) | 12 | 12 | 12 | (해당 없음) | - | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 버튼 (B-NNN) | 2 | 2 | 2 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 상태값 (ST-NNN) | 4 | 4 | (해당 없음) | (해당 없음) | - | 0 (ST-004 잔존 CHK / ST-003 dead code 가드 — As-Is 1:1 보존 결정) | 0 | ✓ |
| 코드값/LoV (LV-NNN) | 4 | (참조만) | (참조만) | (해당 없음) | - | 0 (SZ0000 As-Is 보존 / LV-004 To-Be 제거 결정) | 0 | ✓ |
| Mapper.xml SQL ID | 4 | 4 (§5.2 인용) | (해당 없음) | 4 (§6.4 sqlKey) | - | 0 (미사용 1 SQL `GetCodeMasterAllList` To-Be 제거 결정) | 1 (To-Be 제거) | ✓ |
| BPMN 노드 / SequenceFlow | 6 노드 / 6 flow | (해당 없음) | (해당 없음) | 6 / 6 (§2 전수) | - | 0 | 0 | ✓ |
| Java UserTask 클래스 | 0 | (해당 없음) | (해당 없음) | 0 (§3) | - | 0 | 0 | ✓ |
| 사용 테이블 | 3 (MASTER / DETAIL / CATEGORY — SELECT 만) | (참조만) | (해당 없음) | (참조만) | - | 0 | 0 | ✓ |
| xfdl Script function | 13 (§4.4 / §17.4) | (참조만 — §6 V-NNN 으로 매핑) | (참조만 — §4.3 UX-NNN) | (참조만) | - | 0 (개인화 5 라인 주석 / 자동 조회 주석 / dead code 가드 — As-Is 1:1 보존) | 0 | ✓ |
| Dataset (DS-NNN) | 5 | (참조만) | (참조만) | (참조만 — §5 DTO 매핑) | - | 0 (DS-005 ds_grdMainAll 잔존 + To-Be 제거 결정) | 0 | ✓ |
| 외부 url include (EX-NNN) | 3 (commonTopButton / commonRightButton / commonBottomStatus) | 3 (§5.2 / §6.9) | 3 (§5.3) | (해당 없음) | - | 0 | 0 | ✓ |
| div2 컴포넌트 (FX-NNN) | 4 (Static00 / cbo_categoryId / stc_master / div_rightMenu) | 4 (§3.2 표시 변환 / §5.2 toolbar) | 4 (§3.4 Toolbar) | (해당 없음) | - | 0 | 0 | ✓ |

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
| moduleGroup (ASIS) | cma — 한글명 **"Master 관리(원장)"** | (전체 공통) | xfdl 폴더 `nxuiMui/cma/` + Mapper 폴더 `mappers-cma/` + bpmn 폴더 `services/cma/` (ASIS 자산 위치) | ✓ (ASIS 위치) |
| moduleGroup (To-Be) | **cme** — 한글명 **"Master/업무기준(가동)"** | (전체 공통) | 사용자 결정 — 본 화면이 상세조회(조회 전용) 이라 cme 그룹으로 이동. 산출물 frontmatter / 메뉴 계층 / tsup entry / Service 패키지 모두 cme | ✓ (To-Be 이동) |
| 메뉴 계층 | 공통관리 (mcm) > Master/업무기준(가동) (cme) > Master Code 상세조회 (masterCodeMngList) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | masterCodeMngList | MES: camelCase 단일 토큰 (`{화면명}` — 모듈/그룹 토큰 ✗) | 01 A.3 — `MasterCodeMngList` → `masterCodeMngList` | ✓ |
| pageName | masterCodeMngList | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | masterCodeMngList | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | masterCodeMngList | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | masterCodeMngList.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/cme/masterCodeMngList | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 — moduleGroup 은 To-Be cme | ✓ |
| 팝업 ID 체계 | (해당 없음 — 본 화면 팝업 0) | (전체 공통) | 01 A.4.7 | ✓ |
| 필드/컬럼/버튼 ID | S-001~002 / G-001~011 / GE-001~012 / B-001~002 / FX-001~004 / EX-001~003 / DS-001~005 / LV-001~004 / ST-001~004 / V-001~802 / UX-001~007 / API-001~002 | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / 그리드 cell `text=` 1byte 일치 | (전수 일치 — 분석 §3.2 / §3.3 / §3.4) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `CODE_ID` / `CODE_NM` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum + 추가 2 (A-TITLE / A-FOOTER) — 사용자 요구사항 [§10] 가이드 §외 신설 ✗ → 디자인설계서 §3.1 에 5 표준 + 2 추가 명시 | ✓ (A-FILTER / A-MAIN-LEFT(=A-GRID) / A-MAIN-RIGHT(=A-GRID-EXT) / A-BTN 통합 / A-TITLE / A-FOOTER) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — 본 화면은 TextBox 2 (S-001/002) + Static (FX-001/003) + Combo (FX-002) + Grid cell (combo/mask) | ✓ | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — varchar(50) / varchar(180) / varchar(300) / varchar(120) 모두 cite | ✓ (분석 §9 + 기능 §3.2 + 디자인 §4) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | masterCodeMngList × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | masterCodeMngList (§1) | masterCodeMngList (§1.2) | masterCodeMngList (frontmatter / §1.2) | masterCodeMngList (process / serviceId) | masterCodeMngList | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup (To-Be) | cme | cme | cme | cme | cma → cme (To-Be 이동) | ✓ |
| pageName | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | ✓ |
| pageId | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | ✓ |
| serviceId | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (2 행: S-001 코드ID, S-002 코드명) | §3.1 (2 행 동일) | §3.2 (2 행 좌표 포함) | (해당 없음 — BPMN 은 컬럼 단위 인용 ✗) | (분석 §11 To-Be 변환점 + §9.1) | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 (11 행: G-001~G-011) | §3.2 (11 행 동일) | §4.1 (11 행 동일) | (참조만) | (분석 §9.1) | ✓ |
| 컬럼ID (GE-NNN 확장) | §3.4 (12 행: GE-001~GE-012) | §3.2 (12 행 동일) | §4.2 (12 행 동일) | (참조만) | (분석 §9.2) | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (2 행: B-001 / B-002) | §5.1 (2 행 동일) | §5.1 / §5.2 (B-001 div_main 상단 / B-002 div2 toolbar) | (참조만 — §1.1 API 트리거 매핑) | - | ✓ |
| 팝업ID (P-NNN 전수) | §5 (0 — "해당 없음") | §9 (동일) | §6 (동일) | (참조만) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | §9.1 (TB_MCM_CODE_MASTER 본 화면 SELECT 16 컬럼) / §9.2 (TB_MCM_CODE_DETAIL 본 화면 SELECT 13 컬럼) / §9.3 (TB_MCM_CODE_CATEGORY 본 화면 SELECT 3 컬럼) | §3.1 / §3.2 (G + GE 인용) | §4 (Grid 컬럼 인용) | §5 (DTO 매핑) | §11 변환점 (As-Is `MCMAPUSER.TB_MCM_*` 그대로 보존 — 사용자 결정) | ✓ |
| 상태코드 (statusCodes) | §10.1 (4 행: ST-001~ST-004) | §7 (4 행 동일) | §4.3 UX-NNN + §7.2 색상 강조 | (참조만) | - | ✓ |
| action 목록 | §1 (2 enum: search / searchDetail) | §5.2 (2 동일) | (참조만) | §1.1 (2 API + 2 action) + §2.1~§2.2 (2 흐름) | §6.2 BPMN 기능 식별자 안 | ✓ |
| Mapper.xml SQL ID | §6 (4 SQL 전수) | §5.2 (action → SQL 매핑) | (참조만) | §1.1 (sqlKey 3 종 직접 + 1 종 To-Be 제거) + §6.4 (To-Be 명명 안) | §11 변환점 (Oracle → MSSQL) | ✓ |
| BPMN 노드 / SequenceFlow | §8 (6 노드 + 6 flow 전수) | (참조만) | (해당 없음) | §2 (2 action 흐름 + 모든 node id / sequenceFlow id 인용) + §6.3 (To-Be 명명 안) | - | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | ✓ |
| asIsId | MasterCodeMngList | MasterCodeMngList | MasterCodeMngList | MasterCodeMngList | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup (To-Be) | cme | cme | cme | cme | ✓ |
| serviceId | masterCodeMngList | masterCodeMngList | masterCodeMngList | masterCodeMngList | ✓ |
| S-NNN 수 | 2 | 2 | 2 | (해당 없음) | ✓ |
| G-NNN 수 | 11 | 11 | 11 | (해당 없음) | ✓ |
| GE-NNN 수 | 12 | 12 | 12 | (해당 없음) | ✓ |
| B-NNN 수 | 2 | 2 | 2 (B-001 div_main 상단 + B-002 div2 toolbar) | (참조만) | ✓ |
| P-NNN 수 | 0 | 0 | 0 | (참조만) | ✓ |
| ST-NNN 수 | 4 | 4 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 | 4 | (참조만) | (참조만) | (참조만) | ✓ |
| FX-NNN 수 | 4 | 4 | 4 | (해당 없음) | ✓ |
| EX-NNN 수 | 3 | 3 | 3 | (해당 없음) | ✓ |
| DS-NNN 수 | 5 | (참조만) | (참조만) | (참조만 — §5 DTO 매핑) | ✓ |
| BPMN action 수 | 2 | 2 | (참조만) | 2 (§2.1~§2.2) | ✓ |
| Mapper SQL 수 | 4 | 4 | (참조만) | 4 (§6.4) | ✓ |
| BPMN 노드 수 | 6 | (참조만) | (참조만) | 6 (§6.3 + §2 흐름) | ✓ |
| BPMN sequenceFlow 수 | 6 | (참조만) | (참조만) | 6 (§2 흐름) | ✓ |
| xfdl Script function 수 | 13 | (참조만 — §6 V-NNN 으로 매핑) | (참조만 — §4.3 UX-NNN) | (참조만) | ✓ |

### D.2 BPMN 기능 식별자 = `{screenId}_{기능명}` (사용자 요구사항 [명명 규칙 정본])

| As-Is sequenceFlow name | To-Be 기능 식별자 | 검증 |
|---|---|---|
| search | masterCodeMngList_search | ✓ |
| searchDetail | masterCodeMngList_searchDetail | ✓ |

### D.3 테이블 명명 = `TB_{모듈명}_{역할}` (사용자 요구사항 [명명 규칙 정본])

| As-Is | To-Be 명명 안 |
|---|---|
| MCMAPUSER.TB_MCM_CODE_MASTER (synonym 미사용 — 본 화면 Mapper 직접 사용) | MCMAPUSER.TB_MCM_CODE_MASTER (사용자 결정 — As-Is 보존) |
| MCMAPUSER.TB_MCM_CODE_DETAIL | MCMAPUSER.TB_MCM_CODE_DETAIL |
| MCMAPUSER.TB_MCM_CODE_CATEGORY | MCMAPUSER.TB_MCM_CODE_CATEGORY |

> 사용자 결정: `MCMAPUSER` 스키마 + `TB_MCM_*` 대문자 prefix As-Is 보존. **본 화면은 Mapper 에서 synonym(`MCM_SOURCE.`) 미사용** — 이미 `MCMAPUSER.` 로 직접 참조하므로 추가 변환 ✗ (masterCodeMng 의 synonym → MCMAPUSER 변환 단계 불요).

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
| SequenceFlow_0grwghu (search) | ✓ As-Is 보존 | ✓ |
| SequenceFlow_02ocl0p (searchDetail) | ✓ | ✓ |
| SequenceFlow_1 / SequenceFlow_0av6mvx / SequenceFlow_0xwr48s / SequenceFlow_0vevv59 (4 nameless flow) | ✓ As-Is 보존 | ✓ |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ (스키마 As-Is 보존 결정) + D.4 ✗ + 사유 명시 (사용자 결정) + D.5 ✓ — **사용자 결정 사유에 따른 D.4 ✗ 는 설계 미완성으로 판정하지 않는다** → §D = **✓ (환경 제약 명시 조건)**.

---

## §E. As-Is 누락 0 점검 (사용자 요구사항 [§3, §4])

### E.1 xfdl 컴포넌트 전수

| xfdl 컴포넌트 종류 | 분석 §3 등재 수 | 검증 방법 | 결과 |
|---|---:|---|---|
| Form / Layout / Div (컨테이너) | A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-LEFT / A-MAIN-RIGHT / A-FOOTER + div_topMenu / div_rightMenu / div_bottom = 10 (분석 §3.1 + §4.3) | xfdl Div / Layout / Form 전수 grep | ✓ |
| Static (라벨) | stc_codeVal / stc_codeValMean / Static00 / stc_master = 4 (분석 §3.2 / §3.6) | xfdl `<Static ...>` 전수 grep | ✓ |
| Edit (TextBox) | edt_title / edt_codeVal / edt_codeNm = 3 (§3.1 / §3.2) | xfdl `<Edit ...>` 전수 grep | ✓ |
| Grid | grd_main (G-001~G-011) / grd_detail (GE-001~GE-012) = 2 그리드 + 23 컬럼 (분석 §3.3 / §3.4) | xfdl `<Grid ...>` 전수 grep | ✓ |
| Button | btn_fold / btn_excelDown = 2 (§4.1) | xfdl `<Button ...>` 전수 grep | ✓ |
| Combo | cbo_categoryId = 1 (§3.6 FX-002) | xfdl `<Combo ...>` 전수 grep | ✓ |
| Dataset | ds_grdMain / ds_grdDetail / ds_lovCategoryId / ds_chkYn / ds_grdMainAll = 5 (§3.7) | xfdl `<Dataset ...>` 전수 grep | ✓ |
| Script function | 13 메서드 (§4.4 / §17.4) | xfdl Script `this.X = function` 전수 grep | ✓ |
| 그리드 columns 전수 | G 11 + GE 12 = 23 컬럼 (§3.3 / §3.4 — formats / fields / 표시명 / bind / edittype / displaytype 모두 등재) | xfdl `<Cell ...>` 전수 grep | ✓ |

### E.2 Java 메서드 전수

| 클래스 | 메서드 수 | 분석 §7 등재 | 결과 |
|---|---:|---|---|
| (해당 없음 — UserTask 0) | 0 | §7 명시 ("해당 없음") | ✓ |

### E.3 Mapper.xml SQL ID 전수

| SQL ID | 분석 §6 등재 | 결과 |
|---|---|---|
| GetCodeMasterList | ✓ #1 | ✓ |
| GetCodeMasterAllList | ✓ #2 (사용 X — To-Be 제거 결정) | ✓ |
| GetCodeDetailList | ✓ #3 | ✓ |
| GetTbMcmCodeCategoryList | ✓ #4 | ✓ |

> 4 SQL 전수 등재.

### E.4 BPMN flow 전수

| BPMN 요소 | 분석 §8 등재 수 | 결과 |
|---|---:|---|
| startEvent | 1 (StartEvent_1) | ✓ |
| endEvent | 1 (EndEvent_1) | ✓ |
| exclusiveGateway | 1 (ExclusiveGateway_1, 2 outgoing) | ✓ |
| task (CommonSelectTask 3) | 3 | ✓ |
| userTask | 0 | ✓ |
| sequenceFlow | 6 (2 action 분기 + 4 chain) | ✓ |

### E.5 결함 처리 (사용자 요구사항 [§4])

| 결함 ID | 위치 | 처리 |
|---|---|---|
| `GetCodeMasterAllList` SQL 정의만 + 호출 ✗ | As-Is 보존 (분석 §6 #2) + To-Be 제거 결정 (Mapper.xml + DS-005 동시 제거) | ✓ |
| `ds_grdMainAll` Dataset 정의만 + 호출 ✗ | As-Is 보존 (분석 §3.7 / §10) + To-Be 제거 결정 | ✓ |
| `ds_grdDetail.CHK` 컬럼 정의 + 본 화면 Script 미사용 | As-Is 보존 (분석 §10.1 ST-004) — read-only 화면의 잔존 컬럼. To-Be 제거 권고 but 사용자 결정 대기 시 보존 | ✓ |
| `fn_search` 자동 호출 라인 주석 (xfdl:266) | As-Is 보존 (분석 §4.4 #2) + To-Be 동일 동작 (자동 조회 ✗) | ✓ |
| `grd_main oncellclick` 의 `this.rowpo == e.row` 가드 주석 (xfdl:365) | As-Is 보존 (분석 §4.4 #8) — 가드 비활성 | ✓ |
| `rowType != 2` 가드 dead code (xfdl:366) — 본 화면 신규 행 발생 불가 | As-Is 보존 (분석 §10.1 ST-003) + To-Be 단순화 가능 but 사용자 결정 대기 시 보존 | ✓ |
| `MASTER_CODE` 중복 SELECT (xml:47, 54 — GetCodeDetailList) | As-Is 보존 (분석 §6 #3 / §12) — 결과 Map 의 key 충돌 가능 | ✓ |
| BPMN process name "detailSave\n" (bpmn:3) | As-Is 보존 (분석 §8 / §11.1) — 실제는 조회 화면. To-Be 정정 권고 | ✓ |
| `CATEGORY_ID = 'SZ0000'` 하드코딩 (5회 nested scalar subquery) | As-Is 보존 (사용자 결정 — masterCodeMng 와 동일 결정) | ✓ |
| 개인화 5 라인 주석 (xfdl:249~256) — gfn_personalMultiGrid / gfn_personalMultiRowGridSearch / gfn_personalSetGrid | As-Is 보존 (분석 §4.4 #1) — 미적용 잔존 | ✓ |
| commonRightButton `visible="false"` 잔존 (외부 menu 호출용 — fn_button() 에서 btn_excelDown 등록) | As-Is 보존 (분석 §3.6 FX-004 / §4.4 #3) | ✓ |
| div2 좌우 분할 겹침 (div1 right=51.61% vs div2 left=49.19%) | As-Is 보존 (실 화면 의도된 overlap 가능) | ✓ |

> **§E 결과**: xfdl 모든 컴포넌트 전수 + Java 0 + Mapper.xml 4 SQL + BPMN 모든 flow + 결함 12 건 모두 As-Is 1:1 보존 + 결정 누적표 등재 — 누락 0 + 임의 정정 0.

---

## §F. To-Be 변환점 (Oracle → MSSQL) — 분석 §11 영향 SQL 정합

| 변환 항목 | 영향 SQL ID | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 검증 |
|---|---|---|---|---|---|
| `\|\|` 문자열 결합 → `+` 또는 CONCAT | GetCodeMasterList | (참조만) | (해당 없음) | §2.1 (xml:32 / 35 cite) | ✓ |
| UPPER(...) — MSSQL 동일 지원 | GetCodeMasterList | (참조만) | (해당 없음) | §2.1 (xml:35) | ✓ |
| 스키마 prefix `MCMAPUSER.` (synonym 미사용) → `MCMAPUSER.` (사용자 결정 — As-Is 보존, 변환 ✗) | (모든 SQL) | (참조만) | (해당 없음) | §6.4 (sqlKey To-Be 명명 안) | ✓ |
| scalar subquery in SELECT — MSSQL 동일 | GetCodeMasterList / GetCodeDetailList | - | - | §2.1 (xml:24~28) / §2.2 (xml:49~52, 59~94) | ✓ |
| nested scalar subquery in WHERE — MSSQL 동일 | GetCodeDetailList | - | - | §2.2 (xml:61~63 등) | ✓ |
| `NVL(subquery, fallback)` → `ISNULL(...)` 또는 `COALESCE(...)` | GetCodeDetailList | - | - | §2.2 (xml:59 / 66 / 73 / 80 / 87) | ✓ |
| `'SZ0000'` 카테고리 하드코딩 (DBMS 무관 — 하드코딩 그대로) | GetCodeDetailList | - | - | §2.2 (xml:64 / 71 / 78 / 85 / 92) | ✓ |
| MyBatis `<if>` dynamic SQL — DBMS 무관 | GetCodeMasterList / GetCodeDetailList | - | - | - | ✓ |
| `ROWNUM` / `(+)` / `DECODE` / `MERGE INTO` / `SYSDATE` / `TO_DATE` / `FROM DUAL` (해당 없음 — 본 화면 SELECT 만) | (없음) | - | - | - | ✓ |
| `ref_Audit` fragment — 본 화면 4 SQL 모두 SELECT (영향 ✗) | (없음) | - | - | - | ✓ |
| moduleGroup cma → cme 이동 | (SQL 영향 ✗ — 산출물/Service/UI 레벨만) | §1.2 (frontmatter) | §1.1 (page-id-badge / tsup entry) | §6.5 (Service 패키지) | ✓ |
| **정책 #4 (0) As-Is/To-Be 표준 우선 원칙 (2026-05-31 6 정책 결정 일괄 반영)** | (본 화면 직접 변경 ✗) | (해당 없음 — 직접 변경 ✗) | (해당 없음) | (해당 없음) | ✓ (cross-cutting 원칙 명시 — 본 화면 BIZ_SYSTEM_CODE/APPHOST/EAI 사용 ✗ → 직접 영향 ✗. 분석 §0 본문 행 추가로 정합) |
| **정책 #6 (A) csa 신규 Entity 명명 = As-Is 직역 (2026-05-31 6 정책 결정 일괄 반영)** | (본 화면 직접 변경 ✗ — cme 그룹, csa 아님) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ (cross-cutting 원칙 명시 — 분석 §11 #11 본문 행 추가로 정합) |

> **§F 결과**: 13 변환점 모두 분석리포트 §11 인용 + 영향 SQL 1:1 매핑 — 13 행 ✓ (기존 11 + 정책 #4 (0) / #6 (A) cross-cutting 2 행 추가, 2026-05-31). 본 화면은 SELECT 전용이라 INSERT/UPDATE/MERGE 관련 변환점 (SYSDATE / TO_DATE / FROM DUAL / ref_Audit) 영향 ✗. 정책 #4 (0) / #6 (A) 는 mcm 전체 cross-cutting 정책으로 본 화면 직접 영향 ✗ 이며 본문 명시만 수행.

---

## §G. 확인필요 항목 집계 — 결정 완료

> 활성 확인필요 = **0 건**. 결정 누적 표 (분석리포트 §12 — 15 행 = 본 화면 결정 13 행 + cross-cutting 정책 #4/#6 기록 2 행) 참조. 본문 반영 위치: §6 (SQL ID — 미사용 1 SQL To-Be 제거) / §9 (audit cactus-core 영향 없음 — 조회 전용) / §10 (ST-003 dead code / ST-004 CHK 잔존) / §11 (스키마 보존 / moduleGroup cma → cme).

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| As-Is/To-Be 표준 우선 원칙 (cross-cutting 정책 #4 (0)) | As-Is 1:1 보존 우선 원칙은 To-Be 개발 표준 (cactus-core audit / MSSQL / JPA / schema 명시) 와 충돌 시 To-Be 우선 — 본 화면은 SELECT 전용 + BIZ_SYSTEM_CODE/APPHOST/EAI 사용 ✗ → 직접 영향 ✗ (기록만) | 분석 §0 환경 제약 / §11 변환점 / 본 §G |
| Entity 명명 As-Is 직역 (cross-cutting 정책 #6 (A)) | csa 화면들의 신규 Entity 명명 = As-Is 직역. 본 화면 cma 그룹 (entity는 masterCodeMng 와 공유) 이라 직접 영향 ✗ — 기록만 | 분석 §11 변환점 / 본 §F |
| moduleGroup 이동 (본 화면 직접 결정) | ASIS cma → To-Be cme (Master/업무기준(가동)) — 본 화면 조회 전용 (상세조회). entity 는 masterCodeMng 와 공유 (mcm-core) | 분석 §0 / §1 / §11.1 / 본 §B.2 |
| schema/테이블명 (본 화면 직접 결정) | As-Is `MCMAPUSER.TB_MCM_CODE_*` (synonym 미사용) → To-Be 그대로 보존. 본 화면은 SELECT 전용으로 원장 (`MCM_SOURCE`) 결정 무관 | 분석 §11 #3 / 본 §F |
| audit / STATUS / fn_search 자동호출 / xfdl:366 가드 등 본 화면 결정 | 분석 §12 결정 누적표 13 행 (Q-NNN 0) — 본문 반영 위치는 §12 각 행의 "본문 반영" 컬럼 참조 | 분석 §12 |

---

## §H. 환경 제약 명시 종합 (사용자 요구사항 [§10] / [§13])

| # | 환경 제약 | 영향 절 | 처리 |
|---|---|---|---|
| 1 | Runner / R14-Step0 / manifest 9 파일 검증 미적용 | §A.1 (A-R12-1, A-R12-4) + §A.3 + §D.4 | ✗ + 사유 명시 ("Runner config mui 미지원 — 사용자 결정으로 생략") |
| 2 | 가이드 템플릿 WinForms 전제 항목은 mui 등가물로 매핑 | 분석리포트 §0 + 본 §A.1 (A-T1A / A-R12-3 / A-R12-5) | mui 등가 매핑 (designer.cs → xfdl Layout / cs Click+= → xfdl onclick / sp.sql @Case → BPMN sequenceFlow name 분기 / Mapper.xml inline SQL) |
| 3 | As-Is = Oracle (`\|\|` / UPPER / NVL / scalar subquery / `MCMAPUSER.` 직접) → To-Be = MSSQL `sample_dmes` `MCMAPUSER` 스키마 (As-Is 테이블명 보존). audit cactus-core 영향 ✗ (조회 전용) | §F + 분석 §11 | 11 변환점 명시 — 모든 결정 사항 본문 반영 |
| 4 | moduleGroup ASIS `cma` → To-Be `cme` 이동 (사용자 결정) | 모든 산출물 frontmatter / 메뉴 계층 / tsup entry / Service 패키지 / 정합체크서 §B.2 | cme 그룹 (Master/업무기준(가동)) 신규 등재. mcm-core 가 entity/repository 공유 흡수로 그룹 이동은 Service/DTO/UI 레벨 |
| 5 | masterCodeMng (등록/수정 화면) 와 entity 공유 — 본 화면은 SELECT 만 사용 | §9 / §11.1 / §F | 본 화면은 별도 entity 정의 ✗ — masterCodeMng 에서 정의한 cactus-core extended entity 재사용 |
| 6 | Java UserTask 0 개 — BPMN commonDbTask (CommonSelectTask) 만 사용 | §7 / 본 §A.2 / BPMN §3 | "해당 없음" 보존 |

> 모든 환경 제약 명시 + 정합체크서 §A / §D 의 ✗ 사유가 사용자 결정에 의한 미적용임을 명시 — 본 ✗ 는 **설계 미완성으로 판정하지 않는다**.

---

## §I. 정합체크 종합 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A 구조 동일성 + 누락 | ✓ (환경 제약 명시 조건) | A.1 2 행 ✗ + A.3 ✗ — 모두 사용자 결정 [§10] 사유 |
| §B 명명 규칙 | ✓ | 모든 행 ✓, MES 단일 룰 적용 + To-Be cme 그룹 이동 |
| §C 5축 정합 | ✓ | 15 일치 키 모두 ✓ |
| §D 반복 결정성 | ✓ (환경 제약 명시 조건) | D.4 9 파일 ✗ — 사용자 결정 [§10] 사유 |
| §E As-Is 누락 0 | ✓ | xfdl 전수 + Java 0 + Mapper 4 SQL + BPMN 6 flow + 결함 12 건 모두 As-Is 1:1 보존 |
| §F To-Be 변환점 | ✓ | 11 변환점 모두 cite (조회 전용으로 변환점 수 masterCodeMng 13개 대비 11개로 축소) |
| §G 결정 누적 (cma 정본 패턴) | (참조) | 활성 0 건 — 분석 §12 15 행 결정 누적표 + 본 §G 5 행 (cross-cutting 정책 #4/#6 기록 + 본 화면 직접 결정 3 행) |
| §H 환경 제약 명시 | ✓ | 6 환경 제약 모두 사유 등재 |
| §J 사용자 검수 이력 (Round 1~5) | ✓ | Round 1 (W5 축소 적용) / Round 2 (Master flex:2 + Detail maxWidth:560 + 카테고리 nowrap + V-702 cme 예외) / Round 5 (PK readOnly N/A 점검) — 5 카탈로그 모두 본문 반영 완료 |

> **설계 완성 판정**: §A ~ §F 6 개 절 모두 ✓ (환경 제약 ✗ 는 사용자 결정 사유 등재로 우회) + §J 5 카탈로그 본문 반영 완료 → **설계 완성**.

---

## §J. 사용자 검수 이력 (Round 1 ~ Round 5)

> 본 §J 는 masterCodeMngList 의 디자인설계서 본문 (§0 / §3.1.1 / §3.4.1 / §4.3 UX-008) 갱신과 정합 — 각 Round 결정 사항은 본문 본 절 위치에 반영 완료 (자체 추가 ✗, 분석/기능/BPMN 산출물 단일 원천 정합 유지).

| Round | 일자 | 변경 카탈로그 | 본문 반영 위치 | 정합 결과 |
|---|---|---|---|---|
| Round 1 | 2026-06-02 | csa 8 화면 W5 패턴 정합 시작 — 본 화면은 cme 그룹이지만 W5 표준 (A/D/E) **축소 적용** 결정 (B/C/G N/A — Detail 폼 부재 + SELECT-only) | 본 §J Round 1 + 디자인 §0.1 W5 A~G 매핑 표 | ✓ — csa 표준의 축소 적용 사유 본문 명시 |
| Round 2 | 2026-06-04 | **W5 A 축소 적용** — Master flex:2 / Detail flex:1 maxWidth:560 (≈ 2:1 비율 조정) | 디자인 §0.1 / §3.1.1 ContentPanel 비율 + 그리드 폭 확장 | ✓ — Master 그리드 11 컬럼 (1175 px) 정보 밀도 확보 |
| Round 2 | 2026-06-04 | **카테고리 라벨 nowrap 적용** — "카테고리:" 라벨 + Select wrapper 양쪽 `whiteSpace: nowrap` + `<span>` 자체 nowrap | 디자인 §3.4.1 (신규 절) | ✓ — Detail 폭 좁힘 시 라벨 줄바꿈 차단 |
| Round 2 | 2026-06-04 | **V-702 cme 자동조회 예외 정책** — csa 8 화면은 자동조회 ✓, 본 화면 cme 그룹은 자동조회 ✗. AsIs `//this.fn_search();` 주석 (xfdl:266) 정합 | 디자인 §0.1 W5 F + §4.3 UX-008 (신규 행) + 기능 §6.7 V-702 (기존 본문) | ✓ — cme 그룹 정책 본문 명시 |
| Round 5 | 2026-06-04 | **PK readOnly N/A** (점검 결과) — 본 화면은 SELECT-only → Detail 폼 부재 + 행 추가 부재 → PK readOnly 정책 적용 대상 없음 | 디자인 §0.2 csa 대비 비교표 (PK readOnly = N/A 행) | ✓ — 적용 대상 부재 사유 본문 명시 |

> **Round 2 적용 시점 환경 제약**: 본 화면은 cme 그룹 단독 SELECT-only 화면. csa 8 화면 W5 표준 (commUserMng 제외 7 화면) 의 모든 정합 정책 (W5 A~G) 중 **A (축소) / D (editable:false) / E (외부 버튼 wiring)** 3 가지만 적용 가능 (B/C/F/G 4 가지는 N/A 또는 예외 — §0.1 표 참조).

> **§J 결과**: Round 1 ~ Round 5 모두 본문 반영 완료 — 활성 확인필요 (§G) = 0 건 유지 + 본문 §0 / §3.1.1 / §3.4.1 / §4.3 UX-008 갱신 4 위치 모두 cross-ref 정합.
