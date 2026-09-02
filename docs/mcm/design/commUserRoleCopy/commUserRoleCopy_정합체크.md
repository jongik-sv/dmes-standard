---
screenId: commUserRoleCopy
asIsId: CommUserRoleCopy
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 사용자 권한 일괄 등록 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 Q-NNN = **0 건** (Q-001 / Q-002 / Q-003 / Q-004 / Q-006 5건 일괄 해소 2026-05-31 — 정책 #1 / #2 / #6 / commUserMng 정합 / Q-005 / Q-007 / Q-008 기 해소 2026-05-30).
> **환경 제약 (사용자 결정 [§0])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §A.3 / §A.A-R12-1 / §D.4 = ✗ + 사유 명시.
>
> **§J 신설 (2026-06-04)**: 사용자 검수 이력 + Round 5 worker 재지시 결함 명세. 사용자 요구사항 [§13] "임의 ## 헤더 추가 금지" 의 명시 신설 정책 — Round 1~5 반복 설계 결정 누적 / As-Is 1:1 위반 (의도적) / 코드 결함 발견·수정 기록 보존 목적.
>
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **W5 패턴 적용 (Round 1~7, 2026-06-02 ~ 2026-06-05)**:
> - **W5-A** (Layout 3 컬럼 분할 + 셔틀): 좌 310 / 중앙 480 narrow / 셔틀 60 / 우 flex:1. **Round 6**: 중앙 Detail wrapper 폐기 + userTo grid 최상단 이동 + height 704 정렬
> - **W5-B** (Detail BindItem 정합): **N/A** — 본 화면은 셔틀 화면 + Detail 폼 부재. **Round 6**: 잔존 헤더 2 필드 (D-002/D-004) 도 D-V4 폐기로 완전 N/A
> - **W5-C** (Modal 정식 신설): **N/A** — 본 화면 팝업 ✗ (분석 §5 / 기능 §9 / 디자인 §6 "해당 없음" 보존)
> - **W5-D** (Grid editable:false 통일): 4 그리드 모두 적용
> - **W5-E** (Buttons commonTop + basic): Round 1 `btn_search + btn_save + btn_close` (신규). **Round 7**: D-V6 — btn_close 폐기 → ToBe **3 버튼 표준 (조회/초기화/저장)** = `[btn_search, btn_save]` 2 버튼
>
> **Round 5 결정 사항 (2026-06-04 사용자 명시)** — 본 화면 자체 결함 보정 (As-Is 1:1 위반):
> 1. **본인 (Copy 대상) 제외** — BE `searchUserList(pUserIdCopy)` SQL 본문 변경 + FE 재호출 정합
> 2. **권한 복사 save fix** — `entityManager.persist()` → `Repository.save()` 복원 + flush + target == source 가드
> 3. **userTo 그리드 selectable 제거** — CHK 컬럼 폐기 + 셔틀 우 "전체 복귀" semantics
>
> <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **Round 6 결정 사항 (2026-06-04 사용자 명시)** — UI 명확화 + 영역 제거:
> 1. **UI 라벨 명확화 (방향 의미) 6건** — "Copy 대상" → "권한 부여자 (source)" / "사용자 List" → "권한 복사 받을 대상 List" / "권한생성 대상" → "권한 복사 받을 대상자" 등 (D-V5)
> 2. **정보처리의뢰서 / 처리사유 영역 전체 제거** — D-001 ~ D-004 / D-011 / D-012 폐기. FE state / Input / Detail wrapper 제거 + BE `blankToNull` 정규화로 `SecUserRollHis` 에 null 적재 + V-003 분기 폐기 (D-V4)
> 3. **레이아웃 재정렬** — userTo 그리드 중앙 패널 **최상단** 이동 + height **704 px** 정렬 통일
>
> **Round 7 결정 사항 (2026-06-04~05 사용자 명시)** — 표준 버튼 축소:
> 1. **btn_close 완전 제거 (D-V6)** — `PageLayout.buttons` 배열 entry 삭제 + `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe **3 버튼 표준 (조회/초기화/저장)**. portal 탭 close = host 위임
>
> 상세는 §J 참조.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§13 / §1~§11 / §1~§9 / §1~§8 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | masterCodeMng 패턴 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (기능 §4.2 L-NNN / §5.1-1 GB-NNN / §9 P-NNN / 디자인 §6 P) | (해당 없음) | ✓ | ✓ | (해당 없음) | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§13] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §0 에 의해 신설 / **§J Round 5 사용자 검수 이력 = 2026-06-04 사용자 명시 worker 재지시로 신설**) | ✓ | ✓ | ✓ | ✓ | §0 환경 제약 + §J Round 1~5 사용자 검수 이력은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 11 (5 표준 외 + 6 추가: A-COPY-USER / A-COPY-ROLEGRP / A-INF-REQ / A-USER-TO / A-SHUTTLE / A-USER-FROM + TITLE/FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | 4 그리드 병렬 + 셔틀 구조의 As-Is 그대로 |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §0 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl + java) + D2 (Mapper.xml SQL) + D3 (외부 namespace SQL) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | **2026-05-31 갱신**: D3 외부 namespace 2종 모두 해소 — (1) `CommUserMngMapper.selectRoleMergeObject` → Q-001 해소 / 본 namespace 정정 (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` → Q-002 / Q-006 해소 / JPA Entity 흡수. To-Be D3 = 0 |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / oncellclick / onheadclick / oninput / onkeydown / onload 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.3 의 메서드 표 13 행으로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6.1 5 SQL 전수 + §6.2 외부 Mapper 2 SQL) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§0] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 1 | 1 | 1 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 G (grd_copyUser) | 3 | 3 | 3 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 GE-001 (grd_copyRoleGroup) | 2 | 2 | 2 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 GE-002 (grd_userTo) | 5 | 5 | 5 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 GE-003 (grd_userFrom) | 5 | 5 | 5 | (해당 없음) | - | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | 12 | 12 (D-001~D-012) | 12 | (해당 없음) | - | 0 | 0 | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 버튼 (B-NNN) | 5 (search/save/shuttle 2/fold) | 5 | 5 | (참조만) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 상태값 (ST-NNN) | 6 (CHK / infReqNoFlag / rowcount / END_ACTIVE_DATE / USE_TP / ~~USAGE_YN~~ → ST-006-NEW D.USE_TP) | 6 | (참조만) | (해당 없음) | - | 0 | 0 | ✓ |
| 코드값/LoV (LV-NNN) | 4 (WORKS_CODE / RESP_GBN / USE_TP / ~~USAGE_YN~~ → LV-004-NEW DEPT_INFO.USE_TP) | (참조만) | (참조만) | (해당 없음) | - | 0 (Q-001 해소 정책 #1 / Q-005 해소 / Q-007 해소 — Q-004 종속 / Q-008 부분 해소) | 0 | ✓ |
| Mapper.xml SQL ID (본 namespace) | 5 | 5 (§5.2 인용) | (해당 없음) | 5 (§1.1 + §2 sqlKey 인용) | - | 0 | 0 | ✓ |
| 외부 namespace SQL ID | **2 → 0 (To-Be 정정)**: (1) `CommUserMngMapper.selectRoleMergeObject` (As-Is 외부 호출 결함) → Q-001 해소 / 본 namespace 정정 (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` → Q-002/Q-006 해소 / JPA Entity 흡수 | 2 (§5.2) — To-Be 0 | (해당 없음) | 2 (§1.1 C6 = N 정정 후 + §2.3 + §3.2) — To-Be 0 | - | 0 (Q-001 / Q-002 / Q-006 해소 2026-05-31) | 0 | ✓ |
| BPMN 노드 / SequenceFlow | 7 노드 / 9 flow | (해당 없음) | (해당 없음) | 7 / 9 (§2 전수) | - | 0 (Q-003 해소 — As-Is 의도된 분리 보존) | 0 | ✓ |
| Java UserTask 클래스 | 1 (SaveRoleGroupCopy) | (해당 없음) | (해당 없음) | 1 (§2.3 + §3.1) | - | 0 (분석 §11 #14 / #15 / #16 / #17 To-Be 정정 결정) | 0 | ✓ |
| 사용 테이블 | 4 (TB_MCM_SEC_USER / TB_MCM_SEC_USER_MAPPING / TB_MCM_SEC_ROLEGROUP / TB_MCM_SEC_USER_ROLL_HIS) + ~~EAI 외부 2 (IF_GW01MMFSHD01 / IF_GW01MMFSHD02)~~ → To-Be DMES 자체 부서 마스터 1 (TB_MCM_DEPT_INFO) | (참조만) | (해당 없음) | (참조만) | - | 0 (Q-004 해소 2026-05-31 / 정책 #2) | 0 | ✓ |

> **§A.2 결과**: 모든 행 합 일치 — 발견 = 반영 + 확인필요 + 제외.

### A.3 manifest 행 수 ↔ 산출물 행 수 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| Runner classify.trace.json items[] 카운트 ↔ 분석.template 행 수 | **✗ (검증 미실시)** | 사용자 결정 [§0] — Runner config mui 미지원 으로 manifest 9 파일 미생성. 본 §A.3 = ✗ + 사유 명시 |

> **§A 결과**: A.1 (2 행 ✗ + 사유) + A.2 ✓ + A.3 (✗ + 사유) — **사용자 결정에 의한 미적용 ✗ 는 설계 미완성으로 판정하지 않는다** ([§0] 환경 제약 명시 + §D.4 동일 사유). 따라서 §A = **✓ (환경 제약 명시 조건)**.

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
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 사용자 권한 일괄 등록 (commUserRoleCopy) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commUserRoleCopy | MES: camelCase `{화면명}` | 01 A.3 — `CommUserRoleCopy` → `commUserRoleCopy` | ✓ |
| pageName | commUserRoleCopy | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | commUserRoleCopy | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | commUserRoleCopy | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | commUserRoleCopy.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commUserRoleCopy | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | (해당 없음 — P-NNN = 0) | (전체 공통) | 01 A.4.7 | (N/A) |
| 필드/컬럼/버튼 ID | S-001 / G-001~003 / GE-001-1~2 / GE-002-1~5 / GE-003-1~5 / B-001~005 / D-001~012 / DS-001~004 / LV-001~004 / ST-001~006 / V-001~801 / EX-001~003 / API-001~003 | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / 그리드 cell `text=` 1byte 일치 | (전수 일치 — 분석 §3.2 / §3.3 / §3.4) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `USER_ID` / `ROLE_GROUP_ID` / `INF_REQ_NO` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID — 본 화면은 4 그리드 병렬 + 셔틀 + 권한입력 형태로 5 표준 + 6 추가 (A-COPY-USER / A-COPY-ROLEGRP / A-INF-REQ / A-USER-TO / A-SHUTTLE / A-USER-FROM) | ✓ (사용자 요구사항 [§13] 가이드 §외 신설 ✗ — As-Is 영역 구조 보존을 위한 분할 추가) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — 본 화면은 TextBox 7 + Static 5 (표시) + Grid cell (checkbox / text) | ✓ | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — varchar(256) (Dataset STRING 256) / varchar(300) (D-002/D-004) / varchar(100) (D-005/D-006/S-001) 모두 cite | ✓ (분석 §9 + 기능 §3.2 + 디자인 §4) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commUserRoleCopy × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | commUserRoleCopy (§1) | commUserRoleCopy (§1.2) | commUserRoleCopy (frontmatter / §1.2) | commUserRoleCopy (process / serviceId) | commUserRoleCopy | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| pageName | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | ✓ |
| pageId | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | ✓ |
| serviceId | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (1 행: S-001) | §3.1 (1 행 동일) | §3.2 (1 행 좌표 포함) | (해당 없음 — BPMN 은 컬럼 단위 인용 ✗) | (분석 §11 To-Be 변환점) | ✓ |
| 컬럼ID (G-NNN grd_copyUser) | §3.3-A (3 행: G-001~G-003) | §3.2-A (3 행 동일) | §4.1 (3 행 동일) | (참조만) | (분석 §9.1) | ✓ |
| 컬럼ID (GE-001 grd_copyRoleGroup) | §3.3-B (2 행) | §3.2-B (2 행 동일) | §4.2 (2 행 동일) | (참조만) | (분석 §9.2) | ✓ |
| 컬럼ID (GE-002 grd_userTo) | §3.3-C (5 행) | §3.2-C (5 행 동일) | §4.3 (5 행 동일) | (참조만) | (분석 §9.1 / §9.2) | ✓ |
| 컬럼ID (GE-003 grd_userFrom) | §3.3-D (5 행) | §3.2-D (5 행 동일) | §4.4 (5 행 동일) | (참조만) | (분석 §9.1 + To-Be DEPT_NM 출처: TB_MCM_DEPT_INFO Q-004 해소) | ✓ |
| 상세 필드 (D-NNN 전수) | §3.4 (12 행: D-001~D-012) | §4.1 (12 행 동일) | §3.5 + §3.3/§3.5/§3.8/§3.9 (좌표 포함) | (참조만) | - | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (5 행: B-001~B-005) | §5.1 (5 행 동일) | §7 (5 행 동일) | §1.1 (search/save 2 API 트리거 매핑) | - | ✓ |
| 팝업ID (P-NNN 전수) | §5 ("해당 없음") | §9 ("해당 없음") | §6 ("해당 없음") | (해당 없음) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | §9.1 (TB_MCM_SEC_USER 본 5 + cactus-core 9 = 14) / §9.2 (TB_MCM_SEC_USER_MAPPING 본 2 + cactus-core 9 = 11) / §9.3 (TB_MCM_SEC_ROLEGROUP 본 2 + cactus-core 9 = 11) / §9.4 (TB_MCM_SEC_USER_ROLL_HIS 5컬럼 복합 PK + 본 3 + cactus-core 9 — JPA Entity SecUserRollHis 흡수 Q-002/Q-006) / §9.5-A (EAIUSER As-Is 인용 폐기) + §9.5-B (To-Be 신규 TB_MCM_DEPT_INFO 3+9=12 컬럼 Q-004) | §3.1 / §3.2 (G + GE 인용) | §4 (Grid 컬럼 인용) | §3.3 Entity 매핑 (5 Entity 재사용 — 정책 #6 (A)) | §11 변환점 (As-Is `MCMAPUSER.TB_MCM_SEC_*` 보존 / EAI 폐기 / TB_MCM_DEPT_INFO 신규) | ✓ |
| 상태코드 (statusCodes) | §10.1 (6 행: ST-001~ST-006) | §7 (6 행 동일) | (참조만) | (참조만) | - | ✓ |
| action 목록 | §1 (3 enum: searchUserList / search / save) | §5.2 (3 동일) | (참조만) | §1.1 (3 API + 3 action) + §2.1~§2.3 (3 흐름) + §4 (3 enum 매트릭스) | §6 BPMN 기능 식별자 안 | ✓ |
| Mapper.xml SQL ID | §6.1 (본 namespace 5 SQL) + §6.2 (외부 2 SQL) | §5.2 (action → SQL 매핑) | (참조만) | §1.1 (sqlKey 5 직접 + 2 외부 — UserTask 동적) + §6 (To-Be 명명 안) | §11 변환점 (Oracle → MSSQL) | ✓ |
| BPMN 노드 / SequenceFlow | §8 (7 노드 + 9 flow 전수) | (참조만) | (해당 없음) | §2 (3 action 흐름 + 모든 node id / sequenceFlow id 인용) + §6 (To-Be 명명 안) | - | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | ✓ |
| asIsId | CommUserRoleCopy | CommUserRoleCopy | CommUserRoleCopy | CommUserRoleCopy | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | commUserRoleCopy | ✓ |
| S-NNN 수 | 1 | 1 | 1 | (해당 없음) | ✓ |
| G-NNN 수 | 3 | 3 | 3 | (해당 없음) | ✓ |
| GE-NNN 수 | 12 (GE-001 2 + GE-002 5 + GE-003 5) | 12 | 12 | (해당 없음) | ✓ |
| D-NNN 수 | 12 | 12 | 12 | (해당 없음) | ✓ |
| B-NNN 수 | 5 | 5 | 5 | (참조만) | ✓ |
| P-NNN 수 | 0 | 0 | 0 | (참조만) | ✓ |
| ST-NNN 수 | 6 (ST-006 → ST-006-NEW Q-004 해소) | 6 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 | 4 (LV-004 → LV-004-NEW Q-004 해소) | (참조만) | (참조만) | (참조만) | ✓ |
| BPMN action 수 | 3 (searchUserList / search / save) | 3 | (참조만) | 3 (§2.1~§2.3) | ✓ |
| BPMN 노드 수 | 7 | (참조만) | (해당 없음) | 7 (§2 + §5 ExclusiveGateway) | ✓ |
| BPMN sequenceFlow 수 | 9 | (참조만) | (해당 없음) | 9 (§2 + §5) | ✓ |
| Mapper.xml SQL ID 수 | 5 본 + 2 외부 = 7 (To-Be: 5 본 + 0 외부 = 5 — Q-001/Q-002/Q-006 해소) | 7 (§5.2) | (참조만) | 7 (§1.1 + §2) | ✓ |
| Java UserTask 클래스 수 | 1 | (참조만) | (해당 없음) | 1 (§2.3 / §3.1) | ✓ |
| To-Be Entity 재사용 수 (정책 #6 (A)) | 5 (SecUser / SecUserMapping / SecRoleGroup / SecUserRollHis / DeptInfo — 모두 commUserMng 정본 재사용 / 자체 신설 ✗) | (참조만) | (해당 없음) | 5 (§3.3 신규 행) | ✓ |

### D.2 표준 enum 적용 검증

| 검증 항목 | 결과 | 사유 |
|---|---|---|
| 입력 유형 ⊆ TextBox / Static / Grid cell (3 종 사용) | ✓ | 5 enum 내 |
| 동작 유형 (B-NNN) ⊆ 7 enum | ✓ | search / save (2 enum) — 셔틀/접기는 클라이언트 전용 (enum 외) — 분석 §4.1 비고 명시 |
| 표시 형식 = 자료형(길이) 강제 | ✓ | varchar(256) / varchar(300) / varchar(100) — 분석 §3 cite |
| BPMN action 분기 enum | ✓ | searchUserList / search / save — 3 enum |

### D.3 명령 적용 검증 (자동 enum / 자동 행수)

| 자동 enum | 적용 결과 |
|---|---|
| 페이지 유형 자동 결정 (A~E 5값) | D (다중 그리드 — G 1 + GE 3 = 4 그리드 병렬) |
| L1~L5 자연 제외 enum | (해당 없음) — mui 환경은 designer.cs Visible=false / 주석 등 미존재. 5 SQL 모두 호출 (단 selectRoleMergeObject 본 Mapper 정의는 외부 Mapper 호출로 잔존 — Q-001) |
| 디자인설계서 §3.1 영역 enum | A-FILTER / A-COPY-USER (A-GRID) / A-COPY-ROLEGRP (A-GRID-EXT-1) / A-INF-REQ (A-DETAIL) / A-USER-TO (A-GRID-EXT-2) / A-SHUTTLE / A-USER-FROM (A-GRID-EXT-3) / A-BTN / A-TITLE / A-FOOTER / A-MAIN = 11 enum |

### D.4 manifest 9 파일 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| 1. manifest.lock.json 경로 | ✗ (생성 ✗) | 사용자 §0 — Runner mui 미지원 |
| 2. manifest.lock hash | ✗ | 동일 |
| 3. index hash | ✗ | 동일 |
| 4. discover trace hash | ✗ | 동일 |
| 5. classify trace hash | ✗ | 동일 |
| 6. fallback trace hash | ✗ | 동일 |
| 7. q-stable-key hash | ✗ | 동일 |
| 8. verify-report 결과 | ✗ | 동일 |
| 9. 동일 입력 재실행 byte diff 결과 | ✗ | 동일 |
| 10. enum 외 값 사용 여부 | ✓ (사용 ✗) | mui 환경에서 가이드 enum 외 신설 ✗ — 본 산출물 본문 검증 |
| 11. trace 누락 여부 | ✗ (trace 자체 미생성) | 동일 |
| 12. conflict 미해결 여부 | ✗ (conflict-report 자체 미생성) | 동일 |

> **§D.4 결과**: 9 행 + 추가 3 행 중 1 (enum 외 ✓) 외 모두 ✗ — 사용자 결정 [§0] 환경 제약으로 설계 미완성 판정 ✗.

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ + D.4 (✗ + 사유) — **사용자 결정에 의한 미적용 ✗** 이므로 §D = **✓ (환경 제약 명시 조건)**.

---

## §E. 분석 게이트 동기화 검증

### E.1 분석리포트 §13 게이트 ↔ 4 설계서 반영 일치

| 게이트 | 분석리포트 §13 | 기능설계서 일치 | 디자인설계서 일치 | BPMN설계서 일치 | 일치 결과 |
|---|---|---|---|---|---|
| G-A: xfdl 컴포넌트 전수 (64 행) | ✓ | ✓ (§3 / §4 / §5 / §10) | ✓ (§3 / §4 / §5 / §7 / §8) | (해당 없음) | ✓ |
| G-B: Mapper.xml 5 SQL + 외부 2 SQL 전수 | ✓ | ✓ (§5.2 action 매핑) | (해당 없음) | ✓ (§1.1 + §2 sqlKey 인용) | ✓ |
| G-C: Java 1 메서드 전수 | ✓ | (참조만) | (해당 없음) | ✓ (§2.3 / §3.1) | ✓ |
| G-D: BPMN flow 전수 (7 노드 + 9 flow + 3 action) | ✓ | (참조만) | (해당 없음) | ✓ (§2 + §4 + §5) | ✓ |
| G-E: cite 100% (모든 본문 file:line) | ✓ | ✓ | ✓ | ✓ | ✓ |
| G-F: Q-NNN 활성 = **0 건** (Q-001 / Q-002 / Q-003 / Q-004 / Q-006 5건 해소 2026-05-31 / Q-005 / Q-007 / Q-008 기 해소 2026-05-30) | ✓ | ✓ (Q-NNN 모두 해소 인용) | ✓ (디자인 frontmatter 갱신 인용) | ✓ (§1.2 / §3 / §4 / §6 / §7 모두 To-Be 정정 반영) | ✓ |
| G-G: As-Is 1:1 보존 + To-Be 정정 결정 별도 명시 | ✓ | ✓ (§10 / §11) | ✓ (§8 cssclass) | ✓ (§6 To-Be 식별자 정정) | ✓ |
| G-H: 환경 제약 — 미해결 ✗ | ✓ | ✓ (§0) | ✓ (§0) | ✓ (§0) | ✓ |
| G-I: To-Be 변환점 (Oracle → MSSQL + ref_Audit → cactus-core + Java import 정리) | ✓ (§11 15 행) | ✓ (참조) | (해당 없음) | ✓ (§3.3 Entity + §6 To-Be 식별자) | ✓ |
| G-J: 정합체크서 §A.3 / §D.4 ✗ + 사유 | ✓ (§0 사유 명시) | ✓ (§0 인용) | ✓ (§0 인용) | ✓ (§0 인용) | ✓ |

> **§E 결과**: 모든 게이트 ✓ — 분석리포트의 결정 / 게이트가 4 설계서에 동기.

---

## §F. To-Be Migration 검증

### F.1 As-Is → To-Be 결정 사항 일치 검증

| 항목 | 분석리포트 결정 | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 일치 |
|---|---|---|---|---|---|
| 스키마/테이블명 | `MCMAPUSER.TB_MCM_SEC_*` 보존 + **TB_MCM_DEPT_INFO 신규 (Q-004 해소 2026-05-31, 정책 #2)** | (참조만) | (참조만) | §3.3 Entity 매핑 + §6 To-Be 식별자 | ✓ |
| audit 컬럼 | As-Is `ref_Audit` 17 컬럼 → To-Be cactus-core 9 컬럼 (`C_*` / `U_*` / `VER`) | (참조만) | (참조만) | §3.3 Entity (CactusAuditEntity 상속) | ✓ |
| `SaveRoleGroupHis` 로그 메시지 오타 | `SaveRoleGroupCopy` 정정 | §10 M-011 인용 | (참조만) | §6 To-Be 식별자 (Java 로그 메시지 정정) | ✓ |
| `insertRollHis` 변수명 오타 | `insertRoleHis` 정정 | (참조만) | (참조만) | §6 To-Be 식별자 (Java 변수명 정정) | ✓ |
| `BCryptPasswordEncoder` 미사용 import | 제거 | (참조만) | (참조만) | §6 To-Be 식별자 (Java import 정리) | ✓ |
| BPMN process id | `CommUserRoleCopy` → `commUserRoleCopy` | (참조만) | (참조만) | §6 To-Be 식별자 + frontmatter | ✓ |
| Mapper namespace | `CommUserRoleCopyMapper` → JPA Repository 흡수 (`UserMappingRepository` 등) — Mapper.xml.asis 보존 | (참조만) | (참조만) | §3.2 Repository + §6 To-Be 식별자 | ✓ |
| Java 패키지 | `com.dongkuk.dmes.mui.task.ui.csa.CommUserRoleCopy.*` → Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.{service,dto}.*` (RULE.md §3-1) | (참조만) | (참조만) | §3.1 Service + §3.2 Repository + §3.3 Entity | ✓ |
| Oracle MERGE → MSSQL | mergeCommonCopyRoleGrp — MSSQL MERGE 또는 IF NOT EXISTS 패턴 (deadlock 권고) | (참조만) | (참조만) | §3.2 Repository (native query) | ✓ |
| Oracle SYSDATE → MSSQL | selectUserList WHERE END_ACTIVE_DATE > SYSDATE → MSSQL `GETDATE()` 또는 `CURRENT_TIMESTAMP` | (참조만) | (참조만) | §3.2 Repository | ✓ |
| ~~EAI 외부 인터페이스~~ → DMES 자체 부서 마스터 전환 | **Q-004 해소 2026-05-31 (정책 #2)**: As-Is `EAIUSER.IF_GW01MMFSHD01/02` 폐기 → `MCMAPUSER.TB_MCM_DEPT_INFO` LEFT JOIN. Entity `DeptInfo` commUserMng 정본 재사용 | (참조만) | (참조만) | §3.2 Repository (DeptInfoRepository 행 추가) + §3.3 Entity (DeptInfo 행 추가) + §6 To-Be 식별자 신규 행 | ✓ |
| 외부 namespace SQL 흡수 | **Q-001 / Q-002 / Q-006 해소 2026-05-31 (정책 #1 / #6)**: (1) `CommUserMngMapper.selectRoleMergeObject` (As-Is 외부 호출 결함) → 본 namespace `CommUserRoleCopyMapper.*` 정정 → JPA `UserMappingRepository` 흡수 (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` → JPA Entity `SecUserRollHis` (5컬럼 복합 PK) + `saveAll()` 흡수 (외부 Mapper.xml 신규 ✗, commUserMng SecUserRollHis 재사용) | (참조만) | (참조만) | §3.2 Repository (SecUserRollHisRepository 행 추가) + §3.3 Entity (SecUserRollHis 행) + §6 To-Be 식별자 신규 행 | ✓ |
| Optimistic Locking | cactus-core `VER` (@Version) — As-Is last-write-wins 자동 해결 | (참조만) | (참조만) | §3.3 Entity + §7 트랜잭션 정책 | ✓ |
| save → ds_userFrom 새로고침 | **Q-003 해소 2026-05-31**: BPMN flow 후속 Task 미연결 = As-Is 의도된 분리 (save 트랜잭션과 List 재조회 책임 분리) — xfdl 콜백 별도 호출로 채움 (xfdl:395). **To-Be 결정**: 보존 — React 등가물 (save mutation → searchUserList query refetch) 동일 패턴 | (V-503 인용) | (참조만) | §2.3 callback + §7 트랜잭션 정책 | ✓ |

### F.2 As-Is 1:1 보존 검증 (분석 단계)

| 항목 | 결과 | 사유 |
|---|---|---|
| xfdl Script 함수명 / 시그니처 | ✓ | 13 함수 그대로 보존 (`fn_search` / `fn_save` / `fn_searchUserList` / 셔틀 2 / 필터 3 / 콜백 1 / onload 1 / fn_button 1 / btn_fold 1 / fn_onHeadClick 1) |
| Mapper.xml SQL 본문 | ✓ (D-V3 예외) | 5 SQL 본 namespace 4 건 As-Is 1:1 (To-Be 정정은 §11 변환점 별도 명시). **`selectUserList` 1건만 Round 5 D-V3 의도적 위반** — Copy 대상 본인 제외 WHERE 절 추가 (§J.3 등재) |
| Java run() 메서드 본문 | ✓ (R5-2 fix 정합) | 외곽/내부 루프 구조 + 외부 Mapper 2 호출 + 본 Mapper 1 호출 모두 As-Is 보존. **Round 5 R5-2**: `entityManager.persist` (commit 안 됨 결함) → `Repository.save()` 복원 (commRoleGrpMng 동일 패턴 정합 — As-Is 1:1 무관 단순 fix) |
| BPMN node / sequenceFlow id | ✓ | 7 노드 + 9 flow 모든 id (StartEvent_1 / EndEvent_1 / ExclusiveGateway_1 / Task_selectUserList / selectCopyUserMap / selectCopyRoleGroupList / SaveRoleGroupCopy 등) 인용 그대로 |
| Java 로그 오타 / 변수명 오타 / 미사용 import | ✓ | 분석 §11 #13~#15 에 As-Is 보존 + To-Be 정정 결정 별도 명시 |
| **GE-002 (grd_userTo) UI 컴포넌트** | **✗ (D-V1 / D-V2 의도적 위반)** | Round 5 사용자 명시 — CHK 컬럼 폐기 + 셔틀 우 "전체 복귀" semantics. §J.3 D-V1 / D-V2 등재. As-Is 1:1 보존 ✗ + 사유 명시 |
| **GE-003 (grd_userFrom) — selectUserList 응답 본인 제외** | **✗ (D-V3 의도적 위반)** | Round 5 사용자 명시 — Copy 대상 본인 제외. §J.3 D-V3 등재. As-Is 1:1 보존 ✗ + 사유 명시 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **div_infReq 영역 (D-001~D-004 / D-011 / D-012)** | **✗ (D-V4 의도적 위반)** | Round 6 사용자 명시 — 정보처리의뢰서 / 처리사유 영역 전체 폐기. FE state / Input / Detail wrapper 제거 + BE blankToNull → SecUserRollHis null 적재. V-003 분기 폐기. §J.3 D-V4 등재. As-Is 1:1 보존 ✗ + 사유 명시 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-007 / D-008 / D-009 + 패널 헤더 라벨 텍스트** | **✗ (D-V5 의도적 위반)** | Round 6 사용자 명시 — "COPY 대상" / "권한생성 대상" / "사용자 List" → "권한 부여자 (source)" / "권한 복사 받을 대상자" / "권한 복사 받을 대상 List" (6건). 방향성 명확화. §J.3 D-V5 등재. As-Is 텍스트 1:1 보존 ✗ + 사유 명시 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **B-006 btn_close (commonTop basic 4)** | **✗ (D-V6 의도적 위반)** | Round 7 사용자 명시 — As-Is xfdl `commonTopButton` basic ["btn_close"] (xfdl:268) → ToBe `PageLayout.buttons` 배열에서 entry 삭제. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준. portal 탭 close = host 위임. §J.3 D-V6 등재. As-Is 1:1 보존 ✗ + 사유 명시 |

### F.3 결정 누적 (분석 §12)

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **audit 컬럼** | As-Is `ref_Audit` 17 컬럼 → To-Be cactus-core `CactusAuditEntity` 9 컬럼 | §9 / §11 |
| **스키마/테이블명** | As-Is `MCMAPUSER.TB_MCM_SEC_*` 그대로 보존 (대문자 prefix 유지) | §11 #6 |
| **EAI 인터페이스** | **Q-004 해소 2026-05-31 (정책 #2)** — EAI 폐기 → DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN. commUserMng selectCommDept Q-004 해소와 일괄 | §9.5-A / §9.5-B / §11 #18 |
| **외부 namespace 흡수** | **Q-001 / Q-002 / Q-006 해소 2026-05-31 (정책 #1 / #6)** — (1) `CommUserMngMapper.selectRoleMergeObject` → 본 namespace 정정 + JPA Repository 흡수 (2) `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` → JPA Entity SecUserRollHis (5컬럼 복합 PK upsert) + saveAll() 흡수. 외부 Mapper.xml 신규 ✗ | §6.1 #4 / §6.2 X-1 / §11 #16~#17 |
| **권한 / 접근 제어** | To-Be 권한 프로세스 (외부 모델) 위임. 본 화면 자체 권한 분기 ✗ | 기능설계서 §8 |
| **동시성 / Optimistic Locking** | cactus-core `VER` (@Version) 자동 적용 | §7.1 / §11 |
| **Java 패키지** | RULE.md §3-1 (Entity·Repository 모듈 단위 평탄 + Service·DTO 화면 단위) 적용 | §11.1 |
| **Java 로그/변수명 오타** | `SaveRoleGroupHis` → `SaveRoleGroupCopy` / `insertRollHis` → `insertRoleHis` 정정 | §11 #14 / #15 |
| **미사용 import** | `BCryptPasswordEncoder` / `PasswordEncoder` 제거 | §11 #13 |
| **save 후 ds_userFrom 새로고침** | As-Is xfdl 콜백 별도 호출 (xfdl:395) 그대로 보존 (BPMN flow 변경 ✗) | §7 |
| **하드코딩 enum 값** | WORKS_CODE='P' (Q-008 부분 해소 2026-05-30: Permission 추정 — DMES 별도 마스터 필요) / RESP_GBN='A' (Q-005 해소 2026-05-30: A=추가 확정) / USE_TP='Y' (LV-003) / ~~USAGE_YN='A'~~ → LV-004-NEW USE_TP='Y' (Q-007 해소 2026-05-31 — Q-004 종속 해소 / EAI 폐기) | §10 |
| **BPMN save flow 후속 task 미연결** | **Q-003 해소 2026-05-31** — As-Is 의도된 분리 (save 트랜잭션과 List 재조회 책임 분리) 보존. React 등가물 동일 패턴 (save mutation → searchUserList refetch) | §8.3 / §11 #19 |
| **Entity 재사용 (정책 #6 (A))** | **신규 결정 2026-05-31** — 본 화면 자체 Entity 신설 ✗. commUserMng 정본 5 Entity (SecUser / SecUserMapping / SecRoleGroup / SecUserRollHis / DeptInfo) 모두 재사용. 본 Service `CommUserRoleCopyService` 가 동일 Repository 의존성 주입 | §11 #20 / BPMN §3.3 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **§F 결과**: As-Is 1:1 보존 + To-Be 정정 결정 별도 명시. **Q-NNN 활성 = 0** (Q-001 / Q-002 / Q-003 / Q-004 / Q-006 5건 일괄 해소 2026-05-31 — 정책 #1 / #2 / #6 + commUserMng 정합). **Round 5~7 (2026-06-04~05 사용자 명시) As-Is 1:1 위반 (의도적) 6건 (D-V1 / D-V2 / D-V3 / D-V4 / D-V5 / D-V6) — §J.3 등재**. 사용자 결정에 의한 의도적 위반은 설계 미완성 판정 ✗ (§0 환경 제약 / Q-NNN 사용자 결정 해소와 동일 처리).

---

## §G. 확인필요 항목 집계 — 결정 완료

> 분석 단계 식별 항목 사용자 결정 완료 — **활성 확인필요 = 0 건**. 결정 누적 표는 분석리포트 §12 참조. 본문 반영 위치: §6 (SQL ID — 외부 namespace selectRoleMergeObject 본 namespace 정정 + mergePK Entity 흡수) / §8 (BPMN — save flow 분리 As-Is 보존) / §9 (audit cactus-core `McmAuditEntity` 9 컬럼 통일 + 부서 마스터 `TB_MCM_DEPT_INFO` 신설) / §10 (LV-001 WORKS_CODE='P' Permission 추정 / LV-002 RESP_GBN='A' Add 확정 / LV-004-NEW USE_TP='Y' EAI 등가물) / §11 (외부 namespace 폐기 + Entity 재사용 정책 #6 (A) + 패키지 표준).

| 결정 영역 | 결정 내용 | 본문 반영 |
|---|---|---|
| **외부 Mapper selectRoleMergeObject 중복** | As-Is Java `CommUserMngMapper.selectRoleMergeObject` 외부 호출 (java:52) 은 본 Mapper.xml #4 정본 (xml:39~50) 존재함에도 외부 namespace 호출된 결함. **To-Be**: 본 namespace `CommUserRoleCopyMapper.selectRoleMergeObject` 정정 → JPA `UserMappingRepository.findRoleMergeObject(...)` 흡수. CommUserMng namespace 외부 호출 자체 폐기 | 분석 §6.1 #4 / §7.1 / §11 #16 |
| **외부 Mapper TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK** | SQL 본문 = (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN) 5 컬럼 복합 PK upsert. **To-Be**: 외부 Mapper.xml 신규 ✗ → JPA Entity `SecUserRollHis extends McmAuditEntity` + Repository `SecUserRollHisRepository.saveAll()` 흡수 (정책 #6 (A)) | 분석 §6.2 X-1 / §9.4 / §11 #17 |
| **BPMN save flow 후속 task 미연결** | As-Is 의도된 분리 (FE 콜백 재조회 패턴 — xfdl:395 `fn_searchUserList()` 별도 호출) 보존 결정. save 트랜잭션과 List 재조회 책임 분리. React 등가물 (save mutation → searchUserList query refetch) 동일 패턴. BPMN flow 변경 ✗ | 분석 §8.3 / BPMN §2.3 / §7 / §11 #19 |
| **EAI 외부 인터페이스** | As-Is `EAIUSER.IF_GW01MMFSHD01` / `IF_GW01MMFSHD02` 직접 참조 → To-Be DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN 변환 (정책 #2 — commUserMng 와 일괄). USAGE_YN='A' → USE_TP='Y' 대응 (LV-004-NEW) | 분석 §6.1 / §9.5 / §11 #18 |
| **RESP_GBN='A' 코드 의미** | DMES rId105 #5 한글명 "구분(A:추가,D:삭제)" → **A=Add 확정** (Java 하드코딩 보존). commUserMng SaveRoleGroupHis.java:46(A)/60(D) 와 정합 | 분석 §10 LV-002 |
| **USAGE_YN='A' 코드 의미** | EAI 외부 — DMES MCM 정의서 미동봉 — Active 추정 (EAI 정책 종속). Q-004 종속 해소로 EAI 폐기되며 LV 자체 제거 → LV-004-NEW (TB_MCM_DEPT_INFO.USE_TP='Y') 대응 | 분석 §10 LV-004 |
| **WORKS_CODE='P' 코드 의미** | SampleErp B_COMM_CODE 미등재 — Permission/Privilege 추정 (DMES 별도 마스터 필요). 본 화면 자체는 As-Is 'P' 하드코딩 보존. DMES 코드 마스터 시드 데이터 정의 시 별도 결정 (본 화면 변환 ✗ 차단) | 분석 §10 LV-001 |
| **Entity 명명 (정책 #6 (A))** | 본 화면 자체 Entity ✗ — commUserMng 정본 5 Entity (`SecUser` / `SecUserMapping` / `SecRoleGroup` / `SecUserRollHis` + 신규 `DeptInfo`) 재사용. 본 Service `CommUserRoleCopyService` 가 동일 Repository 의존성 주입 | 분석 §11 #20 |
| **스키마/테이블명 (정책 #1)** | As-Is `MCMAPUSER.TB_MCM_SEC_*` / `MCMAPUSER.TB_MCM_DEPT_INFO` 대문자 prefix 보존. schema=`MCMAPUSER`. RoleGroup 테이블은 As-Is prefix ✗ → To-Be `MCMAPUSER.` 명시 적용 | 분석 §11.1 |
| **audit 컬럼 (cactus-core 정본)** | As-Is `ref_Audit` fragment 폐기 → cactus-core `McmAuditEntity` 상속 9 컬럼 (`C_*` / `U_*` 8 + `VER` 1). JPA `@PrePersist` / `@PreUpdate` 자동 채움 | 분석 §9 / §11 |
| **As-Is/To-Be 표준 우선 원칙 (정책 #4)** | 분석 단계 = As-Is 1:1 보존. To-Be 정정/제거 결정은 별도 명시 (§11). 환경 제약 (Runner / 가이드 mui 매핑) 만 ✗ 사유 명시 | 분석 §0 |
| **Java 패키지 (RULE.md §3-1)** | Service = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.service.*` / DTO = `com.dongkuk.dmes.mcm.csa.commUserRoleCopy.dto.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) | 분석 §7 / §11.1 |

> **§G 결과**: 활성 확인필요 = **0 건**. 본 화면 BE/FE 개발 진입 가능.

---

## §H. 4 종 설계서 인용 정합 / 5종 산출물 정합 (사용자 요구사항 §9)

| 산출물 1 | 산출물 2 | 인용 검증 항목 | 결과 |
|---|---|---|---|
| 분석리포트 | 기능설계서 | 분석 §1~§13 ↔ 기능 §1~§11 (4 식별자 + S/G/GE/D/B/P/ST/LV/Mapper SQL ID/V-NNN/M-NNN 모두 인용) | ✓ (기능 §11 인용 정합 표) |
| 분석리포트 | 디자인설계서 | 분석 §3 (UI 컴포넌트) ↔ 디자인 §1~§9 (영역 / 좌표 / cssclass / 그리드 옵션) | ✓ (디자인 §9 인용 정합 표) |
| 분석리포트 | BPMN설계서 | 분석 §6~§8 (SQL / Java / BPMN) ↔ BPMN §1~§7 (API / Task / sequenceFlow / Service / Repository) | ✓ (BPMN §8 인용 정합 표) |
| 기능설계서 | 디자인설계서 | 기능 §3.1 (S-001) / §3.2 (G/GE) / §4.1 (D) / §5.1 (B) / §9 (P) ↔ 디자인 §3.2~§3.10 (영역별 좌표) / §4 (그리드) / §5 (입력) / §7 (액션) | ✓ |
| 기능설계서 | BPMN설계서 | 기능 §5.2 (action → SQL 매핑) ↔ BPMN §1.1 (API) / §2 (action 흐름) / §4 (enum 매트릭스) | ✓ |
| 디자인설계서 | BPMN설계서 | 디자인 §1.2 (포털 영역 정본 → mcm:commUserRoleCopy) ↔ BPMN §1.1 (URL `/oasis/commUserRoleCopy/{action}`) | ✓ |
| 5 산출물 frontmatter 일치 | (전체) | screenId / asIsId / moduleId / moduleGroup / 작성일 / 작성자 5 산출물 1byte 동일 | ✓ |

> **§H 결과**: 모든 산출물 정합 ✓ — 분석리포트가 단일 원천 ([사용자 요구사항 §9 / §0.1.3]) 의 역할 수행.

---

## §I. 최종 판정

### I.1 §A ~ §J 9 절 결과 요약

| 절 | 결과 | 비고 |
|---|---|---|
| §A | ✓ (환경 제약 명시 조건 — A-R12-1 / A-R12-4 / A.3 ✗ + 사유) | A.2 합 일치 ✓ |
| §B | ✓ | 명명 룰 위반 0 |
| §C | ✓ | 5축 정합 일치 |
| §D | ✓ (환경 제약 명시 조건 — D.4 ✗ + 사유) | D.1/D.2/D.3 ✓ |
| §E | ✓ | 분석 게이트 동기 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §F | ✓ | As-Is 1:1 + To-Be 결정 별도 명시 + Round 5~7 As-Is 1:1 위반 (의도적) 6건 명시 (§J — D-V1~D-V6) |
| §G | ✓ (활성 0 건 — Q-001 / Q-002 / Q-003 / Q-004 / Q-006 5건 해소 2026-05-31 + Q-005 / Q-007 / Q-008 기 해소 2026-05-30) | Q-008 부분 해소 잔존 (DMES 코드 마스터 시드 정의 별도) — 본 화면 차단 ✗ |
| §H | ✓ | 5 산출물 정합 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §J (Round 6~7 갱신 2026-06-04~05) | ✓ | Round 1~7 사용자 검수 이력 / Round 5~7 worker 재지시 결함 명세 / As-Is 1:1 위반 (의도적) 6건 (D-V1 / D-V2 / D-V3 / D-V4 / D-V5 / D-V6) |
| §K (신설 2026-06-04~05) | ✓ | Round 별 본문 § 영향 cross-ref + W5 패턴 변경 매트릭스 |

### I.2 설계 완료 판정

> 본 화면 5 종 산출물은 **설계 완료** (사용자 요구사항 §0.1.4 — §A~§F 모두 ✓ 시 완료 / §A.3 + §D.4 의 ✗ 는 사용자 결정 [§0] 환경 제약으로 미완성 판정 ✗).
>
> 활성 확인필요 = **0 건** (Q-001 / Q-002 / Q-003 / Q-004 / Q-006 5건 일괄 해소 2026-05-31 — 정책 #1 / #2 / #6 + commUserMng 정합 / Q-005 / Q-007 / Q-008 기 해소 2026-05-30). 잔존 = Q-008 부분 해소 (DMES 코드 마스터 시드 데이터 정의 시 별도 결정 — 본 화면 차단 ✗).
>
> **해소 요약 (2026-05-31)**:
> 1. **Q-001 해소 (정책 #1)** — Java `CommUserMngMapper.selectRoleMergeObject` 외부 호출 결함 → 본 namespace `CommUserRoleCopyMapper.*` 정정 → JPA `UserMappingRepository` 흡수
> 2. **Q-002 / Q-006 해소 (정책 #6)** — `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` (5컬럼 복합 PK upsert) → JPA Entity `SecUserRollHis` + `saveAll()` 흡수. Entity = commUserMng 정본 재사용 (자체 신설 ✗ — 정책 #6 (A))
> 3. **Q-003 해소** — BPMN save flow 후속 task 미연결 = As-Is 의도된 분리 (FE 콜백 재조회 패턴) 보존
> 4. **Q-004 해소 (정책 #2)** — EAI `EAIUSER.IF_GW01MMFSHD01/02` 폐기 → DMES 자체 부서 마스터 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN. commUserMng 일괄
>
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **Round 5 결정 사항 (2026-06-04 사용자 명시)** — As-Is 1:1 위반 (의도적) 3건 적용 / 코드 결함 1건 수정. 상세 §J 참조.
> **Round 6 결정 사항 (2026-06-04 사용자 명시)** — As-Is 1:1 위반 (의도적) 2건 추가 (D-V4 정보처리의뢰서 영역 폐기 / D-V5 라벨 6건 갱신) + 레이아웃 재정렬 (userTo 그리드 최상단 + height 704). 상세 §J 참조.
> **Round 7 결정 사항 (2026-06-04~05 사용자 명시)** — As-Is 1:1 위반 (의도적) 1건 추가 (D-V6 btn_close 폐기). ToBe 3 버튼 표준 (조회/초기화/저장). 상세 §J 참조.
>
> **다음 단계**: 본 화면 BE/FE 개발 → 사용자 검수 → 통과 (Round 1~7 누적).

---

## §J. 사용자 검수 이력 + Round 5 worker 재지시 결함 명세

> **신설 사유**: Round 1~5 반복 설계 결정 누적 + As-Is 1:1 위반 (의도적) + Round 5 worker 재지시 코드 결함 (entityManager.persist transaction commit 안 됨) 기록 보존 목적. 사용자 요구사항 [§13] "임의 ## 헤더 추가 금지" 의 명시 신설 정책 적용 — §0 환경 제약 / commPermMng W5 패턴 등재와 동일 형식.

### J.1 Round 별 사용자 검수 이력

| Round | 일자 | 적용 변경 | 사용자 검수 결과 |
|---|---|---|---|
| Round 1 | 2026-06-02 | W5-A Layout 좌 310 / 중앙 480 narrow / 우 flex:1. W5-E `btn_close` 추가. UI 결함 D-1~D-7 일괄 보정 (셔틀 raw button → shared Button / CHK 컬럼 selectable+multiSelect+onRowSelect / D-002/D-004/D-005/D-006 raw input → shared Input / commonLeftButton 폐기 / ContentPanel 폭 1:1 보존 / ErrorModal 무조건 렌더) | 통과 (UI 정합 9 화면 일괄) |
| Round 2 | 2026-06-02 | W5-B/C 적용 검토 결과 N/A (셔틀 화면 + Detail 폼 부재 + 팝업 ✗). W5-D 4 그리드 editable:false 통일 | 통과 (W5 패턴 본 화면 적용 한정 — B/C 미해당) |
| Round 3 | 2026-06-03 | Detail wrapper 패턴 (marginTop:32 + border #d4dae0 + bg #fff + 28px gray header "권한생성 대상") + form row C 패턴 (좌 flex:1 + space-between) | 통과 |
| Round 4 | 2026-06-03 | (해당 없음 — Detail 폭 / Textarea rows / Find Button 위치 등 W5-D/E/F/G 본 화면 미해당) | 통과 (W5-D Grid editable:false 만 적용) |
| Round 5 | 2026-06-04 | **3 결함 보정 (사용자 명시)** + entityManager.persist commit 안 됨 결함 수정 — §J.2 / §J.3 상세 | 통과 (사용자 명시 결정 — As-Is 1:1 위반 3건 의도적 적용) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| Round 6 | 2026-06-04 | **UI 라벨 명확화 6건 (D-V5)** + **정보처리의뢰서 / 처리사유 영역 전체 제거 (D-V4)** + **레이아웃 재정렬** (userTo 최상단 + height 704) — §J.2 R6-1 / R6-2 / R6-3 상세 | 통과 (사용자 명시 결정 — As-Is 1:1 위반 2건 + 레이아웃 재정렬 의도적 적용) |
| Round 7 | 2026-06-04~05 | **btn_close 완전 제거 (D-V6)** — PageLayout.buttons entry 삭제 + handleClose dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장) — §J.2 R7-1 상세 | 통과 (사용자 명시 결정 — As-Is 1:1 위반 1건 의도적 적용. portal 탭 close = host 위임) |

### J.2 Round 5 worker 재지시 결함 명세 (2026-06-04)

| ID | 결함 / 변경 | 발견 경위 | 수정 위치 (코드) | 분류 |
|---|---|---|---|---|
| **R5-1** | **본인 (Copy 대상) 제외** — As-Is `selectUserList` SQL 본문은 전체 사용자 반환 → 자기 자신 권한을 자기에게 복사 = no-op (의미 없음). FE 가 사용자 List 에서 Copy 대상 본인을 표시하면 셔틀로 이동 시도 가능 → BE 안전망 통과 후 cnt=0 으로 끝남 (사용자 UX 혼란). | 사용자 명시 (Round 5) | BE `CommUserRoleCopyService.java:122~155` (searchUserList SQL `WHERE ... AND S.USER_ID <> :pUserIdCopy AND S.USER_EMP_NO <> :pUserIdCopy`) + FE `page.tsx:152~180` (`loadUserList(excludeUserIdCopy)` signature 확장) + `page.tsx:191~220` (handleSearch 후 재호출) + `page.tsx:314~357` (performSave 후 재호출 / 초기 onload 는 빈 문자열 → 전체 반환). 또한 BE `CommUserRoleCopyService.java:290~295` target == source 가드 추가 (no-op skip + 로그). | **As-Is 1:1 위반 (D-V3, 의도적)** — 사용자 명시 결함 보정 |
| **R5-2** | **권한 복사 save commit 안 됨** — Round 4 까지 일부 분기에서 `entityManager.persist()` 를 시도했으나 OASIS transaction 컨텍스트에서 commit 안 됨 (가이드 §6-B "@Transactional ✗" 정책상 EM persist 는 flush/commit 후크 누락). save 호출 후 cnt_save > 0 반환되나 실제 INSERT 미발행. | 코드 검토 (Round 5 worker) | BE `CommUserRoleCopyService.java:320~331` — `secUserMappingRepository.save(m)` (JpaRepository @Transactional 자체 정합) 로 복원. commRoleGrpMng SecRoleGroupMapping 복합 PK + @IdClass 동일 패턴 정상 동작 확인. `CommUserRoleCopyService.java:344` entityManager.flush() 추가 (트랜잭션 commit 단계 실패 시 명확한 예외 발생 위치 보장). | **코드 결함 수정 (As-Is 1:1 무관 — 단순 fix)** |
| **R5-3** | **userTo 그리드 selectable 제거** — Round 1~4 까지 userTo 그리드는 `selectable + multiSelect + onRowSelect` 적용으로 CHK 컬럼 native 렌더. Round 5 사용자 명시: "옮긴 사용자 = 복사 대상이라 체크 불필요. 잘못 옮긴 경우 전체 되돌리기". CHK 컬럼 제거 + handleShuttleRight semantics "선택행 복귀 + CHK=0 해제" → **"전체 복귀"**. | 사용자 명시 (Round 5) | FE `page.tsx:99~104` (USER_TO_COLUMNS 4 컬럼 — CHK 제거 1:1 보존 ✗) + `page.tsx:136~138` (userToSelectedKeys state 폐기 — userFrom 만 추적) + `page.tsx:266~291` (handleShuttleRight 전체 복귀로 변경) + `page.tsx:521~532` (selectable / multiSelect / onRowSelect 제거). | **As-Is 1:1 위반 (D-V1 + D-V2, 의도적)** — 사용자 명시 단순화 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **R6-1** | **UI 라벨 명확화 6건** — Round 5 까지 As-Is xfdl 텍스트 ("COPY 대상" / "권한생성 대상" / "사용자 List" / "권한복사 시킬 사용자" 등) 1:1 보존. Round 6 사용자 명시: "방향 의미가 모호하다 — source / target 명확히". 6건 일괄 갱신. | 사용자 명시 (Round 6) | FE `page.tsx` Section title / Panel header / SearchField label 일괄 변경 (As-Is text 1:1 보존 ✗). | **As-Is 1:1 위반 (D-V5, 의도적)** — UI 명확화 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **R6-2** | **정보처리의뢰서 / 처리사유 영역 전체 제거** — Round 5 까지 D-002 / D-004 입력 + Detail wrapper (marginTop:32 + DETAIL_TABLE_STYLE + 28px gray header) 유지. Round 6 사용자 명시: "DMES 표준 audit (C_USER/U_USER) 로 대체. 결재 흐름 흔적 제거". D-001~D-004 / D-011 / D-012 전체 폐기. | 사용자 명시 (Round 6) | FE `page.tsx` state `infReqNo` / `description` 제거 + Input 컴포넌트 제거 + 중앙 Detail wrapper 제거 + `handleSave` V-003 `infReqNoFlag` 분기 (window.confirm M-004 / M-005) 제거 → 즉시 `performSave` 호출. BE `CommUserRoleCopyService.java` `blankToNull` 정규화로 `SecUserRollHis.INF_REQ_NO` / `DESCRIPTION` null 적재. | **As-Is 1:1 위반 (D-V4, 의도적)** — DMES 표준 audit 대체 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **R6-3** | **레이아웃 재정렬** — Detail 영역 폐기 (R6-2) 로 중앙 패널 공간 발생 → userTo 그리드 **최상단** 으로 이동 + height **704 px** 정렬 통일 (좌측 패널 합산 높이 맞춤). 중앙 narrow 폭 480 보존. | 사용자 명시 (Round 6) | FE `page.tsx` 중앙 ContentPanel — 단일 GridPanel (height=704). | **레이아웃 조정 (As-Is 1:1 무관 — R6-2 연쇄)** |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **R7-1** | **btn_close 완전 제거** — Round 1~6 까지 W5-E 정합으로 As-Is xfdl `commonTopButton` basic ["btn_close"] (xfdl:268) → ToBe `PageLayout.buttons[2]` (action=`cancel`, window.history.back). Round 7 사용자 명시: "portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗". 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장). | 사용자 명시 (Round 7) | FE `page.tsx` `PageLayout.buttons` 배열에서 `btn_close` entry 삭제 + 미사용 `handleClose` dead code 제거. | **As-Is 1:1 위반 (D-V6, 의도적)** — portal 위임 |

### J.3 As-Is 1:1 위반 (의도적) 일람 — Round 5

| 위반 ID | As-Is 정본 인용 | To-Be 변경 | 사유 | 등재 위치 |
|---|---|---|---|---|
| **D-V1** | 분석 §3.3-C / 디자인 §3.6 / §4.3 — As-Is xfdl `grd_userTo` GE-002-1 (`CHK` 컬럼 `displaytype="checkboxcontrol"`) | CHK 컬럼 제거 — `selectable` 자체 미적용 | 옮긴 사용자 = 복사 대상이라 체크 불필요 (사용자 명시 R5-3) | 디자인설계서 §3.6 / §4.3 / frontmatter "Round 5 결정" / 본 §J.2 R5-3 |
| **D-V2** | 분석 §4.1 B-004 / 디자인 §3.7 / §7 — As-Is xfdl:425 `btn_right` "userTo CHK=1 → userFrom 복귀 + CHK=0 해제" | "userTo 전체 → userFrom 복귀" (existingIds 가드 + setUserTo([])) | 부분 복귀 use case 없음 (D-V1 의 연쇄). 잘못 옮긴 경우 전체 되돌리기 (사용자 명시 R5-3) | 디자인설계서 §3.7 / §7 (B-004) / frontmatter "Round 5 결정" / 본 §J.2 R5-3 |
| **D-V3** | 분석 §6.1 #1 `selectUserList` (xml:7~19) — As-Is SQL 본문 전체 사용자 반환 (Copy 대상 본인 포함) | `WHERE S.USER_ID <> :pUserIdCopy AND S.USER_EMP_NO <> :pUserIdCopy` 추가 (`pUserIdCopy` IS NULL OR 빈 문자열이면 미적용 = 초기 onload 전체 반환) | 자기 자신에게 자기 권한 복사 = no-op (의미 없음). FE UX 혼란 방지 (사용자 명시 R5-1) | 디자인설계서 §3.8 / §4.4 / frontmatter "Round 5 결정" / 본 §J.2 R5-1 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-V4** | 분석 §3.4 D-001~D-004 / D-011 / D-012 (xfdl:71~83) — As-Is `div_infReq` 2 행 header 입력 + Static 라벨 / 박스 | 영역 전체 폐기 — FE state / Input / Detail wrapper 제거 + BE `blankToNull` 정규화로 `SecUserRollHis.INF_REQ_NO` / `DESCRIPTION` 컬럼에 null 적재. V-003 `infReqNoFlag` 분기 (window.confirm M-004 / M-005) 자체 폐기 | 정보처리의뢰서 입력 = As-Is 결재 흐름 흔적 — DMES 표준 audit (C_USER/U_USER) 로 대체. 사용자 명시 R6-2 | 디자인설계서 §1.2 / §3.1 (A-INF-REQ 폐기) / §3.5 (좌표 도식 미보존) / §5.1 (D-001~D-004 폐기) / §7 (V-003 분기 폐기) / frontmatter "Round 6 결정" / 본 §J.2 R6-2 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-V5** | 분석 §3.4 D-007 / D-008 / D-009 — As-Is xfdl `edt_srch_cseq` text="COPY 대상" / "권한생성 대상" / "사용자 List" + 패널 헤더 텍스트 | "권한 부여자 (source)" / "권한 복사 받을 대상자" / "권한 복사 받을 대상 List" + 패널 헤더 / SearchField label / emptyMessage 6건 일괄 갱신 | 방향성 (source / target) 모호 → UX 명확화. 사용자 명시 R6-1 | 디자인설계서 §1.2 / §3.3 / §3.6 / §3.8 / §4.3 (emptyMessage) / §5.3 (D-007/D-008/D-009 라벨) / frontmatter "Round 6 결정" / 본 §J.2 R6-1 |
| <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-V6** | 분석 §4.1 B-006 등가 — As-Is xfdl `commonTopButton` basic ["btn_close"] (xfdl:268) | `PageLayout.buttons` 배열에서 `btn_close` entry 삭제 + `handleClose` dead code 제거. ToBe `[btn_search, btn_save]` 2 버튼만 | portal 탭 close = host 가 처리 — 화면 내부 닫기 버튼 무의미. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장). 사용자 명시 R7-1 | 디자인설계서 §1.2 / §3.9 (div_topMenu) / §7 (B-006 폐기) / frontmatter "Round 7 결정" / 본 §J.2 R7-1 |

> **§J 결과**: Round 1~7 누적 결정 + As-Is 1:1 위반 6건 (의도적) 명시 (D-V1 ~ D-V6) + Round 5 코드 결함 1건 수정 (As-Is 1:1 무관) + Round 6 레이아웃 재정렬 (R6-3). 사용자 검수 통과.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §K. Round 별 본문 § 영향 cross-ref + W5 패턴 변경 매트릭스

> 본 §K 는 §J Round 카탈로그를 산출물 본문 § 단위 영향으로 cross-ref. 디자인설계서 §J (Round 카탈로그) 와 1:1 정합. 변경 확정 시각 (✓/✗) 으로 worker 재실행 시 sanity check.

### K.1 Round 별 디자인설계서 영향 § cross-ref

| Round | 디자인설계서 본문 § 영향 | 결함 ID / D-NNN | W5 패턴 변경 | 변경 확정 |
|---|---|---|---|---|
| Round 1 | §1.2 / §3.1 / §3.7 / §7 (B-001~B-006) / §3.6 (selectable+CHK) | (UI 결함 보정 D-1~D-7) | W5-A 신설 / W5-E 신설 | ✓ |
| Round 2 | §4.1~§4.4 | (W5-B/C N/A 확정) | W5-D 적용 | ✓ |
| Round 3 | §3.1 (A-INF-REQ Detail wrapper) | (Detail 패턴) | W5-B (Detail 헤더만) | ✓ (Round 6 D-V4 로 폐기) |
| Round 4 | (본 화면 미해당) | - | - | ✓ |
| Round 5 | §3.6 / §3.7 / §4.3 / §4.4 / §7 (B-004) | D-V1 / D-V2 / D-V3 + R5-2 (save fix) | (변경 없음) | ✓ |
| Round 6 | §1.2 / §3.1 (A-INF-REQ 폐기 / A-USER-TO 704) / §3.3 / §3.5 (폐기) / §3.6 / §3.8 / §4.3 / §5.1 (폐기) / §5.3 / §7 (V-003 분기 폐기) | D-V4 / D-V5 + R6-3 (레이아웃) | W5-A 갱신 (중앙 Detail 폐기 + userTo 최상단 704) / W5-B 완전 N/A | ✓ |
| Round 7 | §1.2 / §3.9 / §7 (B-006 폐기) | D-V6 | W5-E 갱신 (4 버튼 → 3 버튼) | ✓ |

### K.2 As-Is 1:1 위반 (의도적) 누적 매트릭스

| 위반 ID | Round | 본문 § (디자인설계서) | 본문 § (정합체크서) | 등재 확정 |
|---|---|---|---|---|
| D-V1 | Round 5 | §3.6 / §4.3 / frontmatter | §F.2 / §J.3 | ✓ |
| D-V2 | Round 5 | §3.7 / §7 (B-004) / frontmatter | §F.2 / §J.3 | ✓ |
| D-V3 | Round 5 | §3.8 / §4.4 / frontmatter | §F.2 / §J.3 | ✓ |
| D-V4 | Round 6 | §1.2 / §3.1 / §3.5 / §5.1 / §7 / frontmatter | §F.2 / §J.3 | ✓ |
| D-V5 | Round 6 | §1.2 / §3.3 / §3.6 / §3.8 / §4.3 / §5.3 / frontmatter | §F.2 / §J.3 | ✓ |
| D-V6 | Round 7 | §1.2 / §3.9 / §7 / frontmatter | §F.2 / §J.3 | ✓ |

### K.3 W5 패턴 Round 별 상태 변화

| W5 패턴 | Round 1 | Round 5 | Round 6 | Round 7 |
|---|---|---|---|---|
| W5-A (Layout) | 좌 310 / 중앙 480 / 셔틀 60 / 우 flex:1 | 동일 | + Detail 폐기 / userTo 최상단 / height 704 | 동일 |
| W5-B (Detail BindItem) | N/A (Detail 부재) | N/A | **완전 N/A** (헤더 2 필드도 폐기) | 동일 |
| W5-C (Modal 신설) | N/A | N/A | N/A | N/A |
| W5-D (Grid editable:false) | 4 그리드 | 동일 (CHK 폐기) | 동일 | 동일 |
| W5-E (Buttons) | 4 버튼 [search/save/close + 표준 3+basic close] | 동일 | 동일 | **3 버튼 [search/save]** (close 폐기 D-V6) |

> **§K 결과**: Round 1~7 본문 § 영향 cross-ref 완료 + W5 패턴 변경 매트릭스 명시. Worker 재실행 시 본 §K 표 기준 sanity check 가능.
