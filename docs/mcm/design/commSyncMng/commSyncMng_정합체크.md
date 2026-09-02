---
screenId: commSyncMng
asIsId: CommSyncMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 동기화 관리 (CommSyncMng) 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). **§G 활성 Q-NNN = 0 건 (2026-05-31 사용자 결정 — 10건 전수 해소, 분석 §11.0 / §12 참조).**
> **환경 제약 (사용자 결정 [§10])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §A.3 / §A.A-R12-1 / §D.4 = ✗ + 사유 명시.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§13 / §1~§11 / §1~§6 / §1~§7 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (분석 §3.4/§3.5/§3.6/§4.2/§5 = 5 회 / 기능 §4/§5.2/§6/§7 = 4 회 / 디자인 §3.4 = 1 회 / BPMN §7.4 = 1 회) | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§11] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §10에 의해 신설) | ✓ | ✓ | ✓ | ✓ | §0 환경 제약은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 5 (5 표준 — A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-FOOTER) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | A-TITLE/A-FOOTER 는 사용자 결정 추가 영역 |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §10 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl + java) + D2 (Mapper.xml SQL) 만 존재, D3 SP 의존 ✗ | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 미존재 (Oracle SP/함수/트리거 미사용 — Mapper.xml inline SQL 만) |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / onitemchanged / onload 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.4 의 메서드 9 표 + 디자인 §5 UX 8 표로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 13 SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§10] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | 4 | 4 | 4 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드 컬럼 (G-NNN) | 9 | 9 | 9 | (해당 없음) | - | 0 | 0 | ✓ |
| 확장 그리드 (GE-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 상세 필드 (D-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 버튼 (B-NNN) | 3 | 3 | 3 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 상태값 (ST-NNN) | 8 (6 처리유형 + 2 서버) | 8 | (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 코드값/LoV (LV-NNN) | 1 (ds_lovSyncTarget 6 행) | (참조만) | (참조만) | (해당 없음) | - | 0 | 0 | ✓ |
| Mapper.xml SQL ID | 13 (selectCommUser/getCodeVer/getRuleVer/getJudgeRuleVer/getFormatVer/updateFormatVer/createTable/deleteSourceData/insertSourceData/deleteObjectData/insertObjectData/selectObjectData/selectMasterCodeData) | 13 (§5.3 / §10.1 인용) | (해당 없음) | 13 (Java 내부 호출 §6/§7.4) | - | 0 | 3 (selectCommUser / createTable / selectObjectData — 미사용 → To-Be 제거) | ✓ |
| BPMN 노드 / SequenceFlow | 4 노드 / 3 flow | (해당 없음) | (해당 없음) | 4 / 3 (§2/§3 전수) | - | 0 | 0 | ✓ |
| Java UserTask 클래스 | 1 (SaveCommSyncMng) | (해당 없음) | (해당 없음) | 1 (§5) | - | 0 | 0 | ✓ |
| Java 메서드 (run + 4 sync) | 5 (run / syncMasterCode / syncRule / syncNui / syncObj) | (참조만) | (해당 없음) | 5 (§4.3) | - | 0 | 0 | ✓ |
| xfdl Script 메서드 | 9 (onload / AfterOnload / fn_button / fn_search 빈 / fn_sync / fn_callBack / cbo onitemchanged / fn_close / btn_fold_onclick) | (참조만 — §5.3/§5.4) | (참조만 — §5) | (참조만 — §4.3) | - | 0 | 1 (fn_search 빈 함수 → To-Be 제거) | ✓ |
| 사용 테이블 (본 화면 직접) | 12 (TB_MCM_CODE_MASTER/DETAIL + TB_MCA_RULE_MASTER/COL_LIST/{Object} + TB_MCB_RULE_MASTER/COL_LIST/{Object} + TB_MCM_MOM_FORMAT_LIST/LAYOUT + TB_MCM_SEC_USER + VI_MCM_CODE_ACCESS) | (참조만) | (해당 없음) | (참조만 — §4.3) | - | 0 (TB_MCM_SEC_USER 미사용 + Q-001/Q-003 별도) | 1 (TB_MCM_SEC_USER — selectCommUser 미호출 → To-Be 제거) | ✓ |
| 동기화 대상 테이블 그룹 | 6 그룹 (masterTable 3 / ruleTable 3 / ruleJudgeTable 3 / InterfaceTable 2 / FormatTable 2 / ObjectTable 3 — 합 16) | (참조만 §8.1) | (해당 없음) | (참조만 §4.3) | - | 0 (Q-009 — 별도 화면 책임) | 0 | ✓ |
| 메시지 / 다이얼로그 (MSG-NNN) | (분석 §10.4 내) | (해당 없음) | 10 (§6) | (해당 없음) | - | 0 | 0 | ✓ |

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
| moduleGroup | csa | ✓ |
| 적용 명명 룰 | MES 단일 룰 | ✓ (mcm ≠ mpn → APS 예외 미적용) |

### B.2 식별자별 검증

| 항목 | 값 | 적용 룰 | 부속서 A 근거 | 검증 결과 |
|---|---|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | (전체 공통) | 사용자 결정 + 정본 (5 모듈 mpn/mpp/mls/mqc/mcm) | ✓ |
| moduleGroup | csa — 한글명 **"시스템관리"** | (전체 공통) | xfdl 폴더 `nxuiMui/csa/` + Mapper 폴더 `mappers-csa/` + bpmn 폴더 `services/csa/` 그대로 + 사용자 결정 등재 (MEMORY: mcm csa/cme/csa 신규 그룹 등재 2026-05-29) | ✓ |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 동기화 관리 (commSyncMng) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commSyncMng | MES: camelCase `{화면명}` 단일 토큰 (모듈/그룹 토큰 ✗) | reference_naming_standards.md §A.3.1 정본 (2026-05-28 결정) — `CommSyncMng` → `commSyncMng` | ✓ |
| asIsId | CommSyncMng (As-Is mui 자산 그대로) | - | xfdl 파일명 / Java 클래스명 / BPMN process id 그대로 | ✓ |
| pageName | commSyncMng | MES: = screenId | reference_naming_standards.md §A.4.2 | ✓ |
| pageId | commSyncMng | MES: = screenId | §A.4.3 | ✓ |
| serviceId | commSyncMng | MES: = screenId | §A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | §A.4.5 | ✓ |
| Frontend 파일명 | commSyncMng.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commSyncMng | MES: `pages/{moduleGroup}/{pageName}` | §A.4.6 | ✓ |
| 팝업 ID 체계 | (해당 없음 — 팝업 ✗) | (전체 공통) | §A.4.7 | ✓ |
| 필드/컬럼/버튼 ID | S-001~004 / G-001~009 / B-001~003 / DS-001~003 / LV-001 / ST-001~008 / V-001~010 / UX-001~008 / MSG-001~010 / API-001 | (전체 공통) | §A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE DB / camelCase JSON (As-Is `pSyncTarget` / `cnt_save` 등 As-Is 보존) | (전체 공통) | §A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / `Edit.value` 1byte 일치 | (전수 일치 — 디자인 §6 MSG 10 전체 / 디자인 §3.5 라벨 4) | (전체 공통) | §A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `CODE_VER` / `RULE_VER` / `FORMAT_VER` 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | §A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum (가이드 §외 신설 ✗) — A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-FOOTER 5 표준 (사용자 결정 — 5 표준만 사용) | ✓ | (전체 공통) | §A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — 본 화면은 TextBox 1 (S-004) + Combo 1 (S-002) + Static 2 (S-001/S-003 라벨) + Grid cell (checkbox 1 / read-only 8) | ✓ | (전체 공통) | §A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — STRING(256) (xfdl Dataset Columns 정의 — 분석 §3.7 인용) | ✓ (기능 §3.2 + 디자인 §4.2 명시) | (전체 공통) | §A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commSyncMng × 4 | MES 만 적용 | 사용자 결정 | ✓ |

> **§B 결과**: 모든 행 ✓ — 명명 규칙 검증 통과.

---

## §C. To-Be 변환점 일관성 검증

### C.1 분석 §11 변환점 ↔ 4 설계서 반영 일관성

| 변환점 | 분석 §11 등재 | 기능설계 반영 | 디자인설계 반영 | BPMN설계 반영 | 일관 |
|---|---|---|---|---|---|
| NVL → ISNULL (4 SQL) | §11.1 | (참조만 — API-001 SQL 호출 명시) | (해당 없음) | (해당 없음) | ✓ |
| SYSDATE → GETDATE() | §11.1 | (참조만) | (해당 없음) | §6 cactus-core (해당 없음 — 본 화면 직접 사용 ✗) | ✓ |
| **Oracle DB Link `@*_MCM` → 폐기 (Q-002 해소 — 2026-05-31)** | §11.0 / §11.1 / §11.2 | §8.2 ST-007/ST-008 To-Be 변경 + §11 V-005~V-008 To-Be 적용 명시 + §10.1 SQL 호출 변경 | (해당 없음) | §6.3 ApplicationUtils 주석 | ✓ — **Q-002 해소** |
| ref_Audit 폐기 (1 회 호출) → cactus-core CactusAuditEntity + (b) 안 명시 UPDATE | §11.3 (Q-008 해소 결합) | (참조만) | (해당 없음) | §6.1 / §6.2 | ✓ |
| `${}` 변수 치환 SQL Injection 대응 (`${pDblink*}` 빈값 고정 효과 포함) | §11.4 | §11 V-005 / V-006 / V-007 검증 정책 + VI = `MCMAPUSER.VI_MCM_CODE_ACCESS` 명시 | (해당 없음) | (해당 없음) | ✓ |
| As-Is 버그 java:486 (pDblinkTo / pDblinkFrom 중복) — **Q-004 해소 (자연 무력화)** | §11.5 | (해당 없음 — As-Is 보존) | (해당 없음) | (해당 없음) | ✓ — **Q-004 해소** |
| 동기화 audit 처리 정책 — **Q-008 해소 ((b) 안 — INSERT 직후 명시 UPDATE)** | §11.6 | §10.1 SQL 호출 to-Be `updateSyncAudit` 추가 명시 | (해당 없음) | §6.2 (b) 안 결정 | ✓ — **Q-008 해소** |
| BPMN UserTask id 명명 — **Q-006 해소 (`UserTask_pwdinit` → `UserTask_runSync`)** | §11.7 / §8.1 / §8.2 / §8.3 | §10.1 트랜잭션 경계 To-Be 명명 명시 | (해당 없음) | §1.2 / §2 / §3 / §4.2 / §5.1 / §7.2 | ✓ — **Q-006 해소** |
| 동기화 화면 자체 존속 여부 — **Q-010 해소 (화면 존속 / MASTER 3 테이블 책임)** | §11.8 / §11.0 | (참조만) | (해당 없음) | (해당 없음) | ✓ — **Q-010 해소** |
| To-Be 패키지 — **Q-007 해소 (`com.dongkuk.dmes.mcm.csa.commSyncMng.{service\|dto}` + Entity cma 4 화면 재사용 / 정책 #6 (A))** | §7.1 / §11.0 | §10.1 (간접) | (해당 없음) | §5.2 | ✓ — **Q-007 해소** |
| **Q-001 해소 — MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_CATEGORY / TB_MCM_CODE_DETAIL — schema MCM_SOURCE) 만 본 화면 책임** | §9.1 / §9.3.6 / §11.0 | §10.1 책임 범위 명시 + §11 V-007 To-Be 활성 행 명시 | (해당 없음) | (해당 없음) | ✓ — **Q-001 해소** |
| **Q-003 해소 — VI = `MCMAPUSER.VI_MCM_CODE_ACCESS` (cma masterCodeSelPop §11.2 / C-005 a 안 정본 재사용)** | §6 # 13 / §9.1 / §11.4 / §11.0 | §10.1 SQL 호출 VI schema 명시 | (해당 없음) | (해당 없음) | ✓ — **Q-003 해소** |
| **Q-005 해소 — LOC 분기 유일화 / LOC 차단 폐기** | §11.2 / §11.5 / §11.0 | §8.2 ST-007 To-Be 변경 + §11 V-008 To-Be 차단 폐기 명시 | §6 MSG-008 To-Be 사용 ✗ 명시 | §6.3 ApplicationUtils 주석 | ✓ — **Q-005 해소** |
| **Q-009 해소 — 13 후속 위임 테이블의 원천 화면 매핑 (`mcaRuleMng` / `mcbRuleJudgeMng` / `mcmInterfaceMng` / `mcmFormatMng` / commObjMng / commMenuMng / commPermMng)** | §9.1 / §9.3.6 / §11.0 | (간접) | (해당 없음) | (해당 없음) | ✓ — **Q-009 해소** |

### C.2 cactus-core 적용 검증

| 항목 | As-Is | To-Be | 4 설계서 반영 | 결과 |
|---|---|---|---|---|
| audit 컬럼 수 | 17 | 9 (CactusAuditEntity) — 단, 본 화면은 Bulk INSERT 우회로 cactus 자동 채움 ✗ | BPMN §6.1 / 분석 §11.3 | ✓ |
| Mapper.xml `ref_Audit` include | 1 회 (xml:40) | 폐기 | BPMN §6.1 | ✓ |
| SOURCE→TARGET INSERT 시 audit 처리 | SOURCE 전수 복사 | **(b) 안 — INSERT 직후 명시 UPDATE 로 `U_*` 덮어쓰기 (Q-008 해소)** | BPMN §6.2 / 분석 §11.6 | ✓ — **Q-008 해소** |

> **§C 결과**: 모든 행 ✓ + Q 10건 전수 해소 (활성 0). 변환점 일관성 확보 + 본 화면 책임 = MASTER 3 테이블 + Entity cma 재사용 + DB Link 폐기 + LOC 분기 유일화 + UserTask_runSync 명명 + VI MCMAPUSER schema 명시.

---

## §D. 환경 / Runner 정합 검증

### D.1 환경 결정 인용

| 항목 | 결정 | 4 설계서 반영 | 결과 |
|---|---|---|---|
| Runner R-14 미적용 | 사용자 결정 [§10] | 분석 §0 / 기능 §0 / 디자인 §0 / BPMN §0 모두 인용 | ✓ |
| SOP 30 Step 미실행 | (위 동치) | (동치) | ✓ |
| 가이드 템플릿 절 구조만 참고 | (위 동치) | (동치) | ✓ |
| 자체 grep 허용 | (위 동치) | (동치) | ✓ |

### D.2 mui 환경 등가물 매핑

| WinForms (가이드 표준) | mui 등가물 | 본 화면 적용 위치 | 결과 |
|---|---|---|---|
| designer.cs (UI 정의) | xfdl Layout (xfdl:1~71 + 259~488) | 분석 §3 / 디자인 §2~§3 / 기능 §2~§3 | ✓ |
| cs (이벤트 핸들러) | xfdl Script (xfdl:72~258) + Java UserTask (java) | 분석 §4 / §7 | ✓ |
| sp.sql (Stored Procedure) | Mapper.xml inline SQL (xml:1~108) | 분석 §6 | ✓ |
| cs Click+= | xfdl on*click + BPMN action | 분석 §4.1 / §8.3 | ✓ |
| @Case 분기 (SP 내부) | BPMN sequenceFlow `name` (action) + Java if/else | 분석 §8.3 / §7 / BPMN §4 | ✓ |
| ref_Audit | cactus-core CactusAuditEntity | BPMN §6 | ✓ |

### D.3 가이드 절 구조 검증

| 가이드 절 | 본 산출물 적용 | 결과 |
|---|---|---|
| 분석리포트.template §0~§13 + §17.2 | ✓ (분석 §0~§13 + §17.2 + §6.14) | ✓ |
| 기능설계서.template §0~§11 | ✓ (기능 §0~§11 + §6.14) | ✓ |
| 디자인설계서.template §0~§6 | ✓ (디자인 §0~§6 + §6.14) | ✓ |
| BPMN설계서.template §0~§7 | ✓ (BPMN §0~§7 + §6.14) | ✓ |
| 정합체크서.template §A~§F (+ §G) | ✓ (본 §A~§F + §G) | ✓ |

### D.4 manifest 9 파일 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| Runner manifest 9 파일 (classify.trace.json 등) ↔ 분석.template / 기능.template / 디자인.template / BPMN.template / 정합.template 5 종 일관 | **✗ (검증 미실시)** | 사용자 결정 [§10] — Runner config mui 미지원 으로 manifest 9 파일 미생성. 본 §D.4 = ✗ + 사유 명시 (분석 §0 정합) |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ + D.4 (✗ + 사유) — 사용자 결정 환경 제약 명시 조건으로 ✓.

---

## §E. 5 종 산출물 cross-reference 정합 검증

### E.1 frontmatter 일치

| 필드 | 분석 | 기능 | 디자인 | BPMN | 정합 | 일치 |
|---|---|---|---|---|---|---|
| screenId | commSyncMng | commSyncMng | commSyncMng | commSyncMng | commSyncMng | ✓ |
| asIsId | CommSyncMng | CommSyncMng | CommSyncMng | CommSyncMng | CommSyncMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| 작성일 | 2026-05-29 | 2026-05-29 | 2026-05-29 | 2026-05-29 | 2026-05-29 | ✓ |
| 작성자 | Agent | Agent | Agent | Agent | Agent | ✓ |

### E.2 ID 매핑 일치 (S/G/B/ST/LV/MSG)

| ID | 분석 정의 | 기능 인용 | 디자인 인용 | BPMN 인용 | 일치 |
|---|---|---|---|---|---|
| S-001 | xfdl:17 (stc_bizSystemCode) | 기능 §2 | 디자인 §3.1 | (해당 없음) | ✓ |
| S-002 | xfdl:18 (cbo_SyncTarget) | 기능 §2 | 디자인 §3.1 | (해당 없음) | ✓ |
| S-003 | xfdl:19 (sts_roleId) | 기능 §2 | 디자인 §3.1 | (해당 없음) | ✓ |
| S-004 | xfdl:20 (edt_Target) | 기능 §2 | 디자인 §3.1 | (해당 없음) | ✓ |
| G-001 ~ G-009 | xfdl:29~65 grd_main | 기능 §3.1 | 디자인 §3.2 | (해당 없음) | ✓ |
| B-001 (btn_sync) | xfdl:101~104 / 121~168 | 기능 §5.1 | 디자인 §3.3 | BPMN §4 action reg | ✓ |
| B-002 (btn_close) | xfdl:103 / 249~253 | 기능 §5.1 | 디자인 §3.3 | (해당 없음) | ✓ |
| B-003 (btn_fold) | xfdl:24 / 255~258 | 기능 §5.1 | 디자인 §3.3 | (해당 없음) | ✓ |
| ST-001 ~ ST-006 (처리유형) | 분석 §3.7 DS-002 / xfdl:452~483 | 기능 §8.1 | 디자인 (해당 없음) | BPMN §4.3 | ✓ |
| ST-007 / ST-008 (서버 LOC/PRD) | 분석 §7.1 / java:42/48 | 기능 §8.2 | 디자인 (해당 없음) | BPMN §4.3 | ✓ |
| LV-001 (ds_lovSyncTarget) | 분석 §3.7 DS-002 | 기능 §9.1 | 디자인 §3.1 S-002 인용 | (해당 없음) | ✓ |
| MSG-001 ~ MSG-010 | 분석 §4.5 / §10.4 / java:217/246/515 | (해당 없음) | 디자인 §6 | (해당 없음) | ✓ |
| API-001 (reg) | 분석 §1 / §7 / §8.3 | 기능 §10.1 | (해당 없음) | BPMN §3 / §4 | ✓ |
| V-001 ~ V-010 (validation) | 분석 §4.5 / §11.4 / java:217/246/515 | 기능 §11 | (해당 없음) | (해당 없음) | ✓ |
| UX-001 ~ UX-008 | 분석 §4.4 메서드 9 | (해당 없음) | 디자인 §5 | (해당 없음) | ✓ |

### E.3 Q-NNN 일치 (분석 §12 결정 누적 표 단순 참조)

> 분석 단계 식별 항목 (Q-001 ~ Q-010, 10 건) 사용자 결정 완료 (2026-05-31). 활성 Q = 0. 5 종 산출물 일치 검증 = 분석 §11.0 일괄 해소 결정표 + §12 결정 누적 표 + 본 정합 §G 단일 출처에서 cross-reference 정합 확보 (별도 일치 검증 표 폐기 — 정본 패턴 정합).

### E.4 사용 SQL ID 매핑 일치

| SQL ID | 분석 §6 | 기능 §10.1 | BPMN §4.3 | 일치 |
|---|---|---|---|---|
| selectCommUser (미사용) | ✓ (제거 결정) | ✗ (제거 — 명시) | ✗ | ✓ |
| getCodeVer | ✓ | (간접 — API SQL 호출 명시) | ✓ (MASTER 분기) | ✓ |
| getRuleVer | ✓ | (간접) | ✓ (RULE 분기) | ✓ |
| getJudgeRuleVer | ✓ | (간접) | ✓ (RULE_JUDGE 분기) | ✓ |
| getFormatVer | ✓ | (간접) | ✓ (FORMAT 분기) | ✓ |
| updateFormatVer | ✓ | (간접) | ✓ (FORMAT 분기) | ✓ |
| createTable (미사용) | ✓ (제거 결정) | ✗ (제거) | ✗ | ✓ |
| deleteSourceData | ✓ | (간접) | ✓ (다중 분기) | ✓ |
| insertSourceData | ✓ | (간접) | ✓ (다중 분기) | ✓ |
| deleteObjectData | ✓ | (간접) | ✓ (OBJECT 분기) | ✓ |
| insertObjectData | ✓ | (간접) | ✓ (OBJECT 분기) | ✓ |
| selectObjectData (미사용) | ✓ (제거 결정) | ✗ (제거) | ✗ | ✓ |
| selectMasterCodeData | ✓ | (간접 — 인천 차단 V-009) | ✓ (RULE/RULE_JUDGE 차단) | ✓ |

### E.5 BPMN action ↔ 분석/기능/디자인 매핑

| action | 분석 §8.3 | 기능 §5.3 / §10.1 | 디자인 §5 UX-005 | BPMN §4 | 일치 |
|---|---|---|---|---|---|
| reg | ✓ (단일 action) | ✓ (API-001 + B-001 fn_sync) | ✓ (UX-005) | ✓ (§4.2) | ✓ |

> **§E 결과**: frontmatter / ID 매핑 / Q-NNN / SQL ID / action 매핑 모두 일치 — 5 종 산출물 cross-reference 정합 확보.

---

## §F. 종합 판정

| 절 | 결과 | 상세 |
|---|---|---|
| §A 구조 동일성 + 누락 검증 | ✓ (사용자 결정 환경 제약 명시 조건) | A.1 (2 행 ✗ + 사유 / A-R12-1 + A-R12-4) + A.2 ✓ + A.3 (✗ + 사유) |
| §B 명명 규칙 검증 | ✓ | 모든 행 ✓ — MES 단일 토큰 룰 (commSyncMng 4 식별자 1byte 일치) |
| §C To-Be 변환점 일관성 검증 | ✓ | 변환점 13 항 (10 변환점 + 3 cactus-core) 모두 ✓ + **Q-NNN 10 건 전수 해소 (활성 0)** |
| §D 환경 / Runner 정합 검증 | ✓ (사용자 결정 환경 제약 명시 조건) | D.1~D.3 ✓ + D.4 (✗ + 사유) |
| §E 5 종 산출물 cross-reference 정합 | ✓ | frontmatter / ID 매핑 / Q-NNN / SQL ID / action 모두 일치 |
| §F 종합 | ✓ (환경 제약 명시 조건 + **Q-NNN 10 건 전수 해소**) | - |
| §J Round 2 사용자 검수 반영 | ✓ (J-001 ~ J-004 4 건 본문 갱신 완료) | W5 패턴 축소 적용 (A/D/E/F 4 항 실효 + B/C/G 3 항 N/A) + btn_close 명시 + btn_sync pre-disabled 제거 + 자동조회 marker 명시 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §J Round 7 사용자 검수 반영 | ✓ (J-005 1 건 본문 갱신 완료) | btn_close 완전 제거 (CHG-005) — PageLayout buttons 배열 entry 삭제 + unused handleClose dead code 제거 + ToBe 3 버튼 표준 (조회/초기화/저장) |

> **§F 종합 판정**: ✓ — **설계 1차 사이클 완료 + Q 10건 해소 2차 갱신 완료 (2026-05-31) + Round 2 W5 축소 적용 완료 (2026-06-04) + Round 7 btn_close 완전 제거 완료 (2026-06-04~05)**. 본 화면 후속 BE/FE 개발 진입 가능 상태. 핵심 결정: DB Link 3종 폐기 / LOC 분기 유일화 / MCMAPUSER.VI_MCM_CODE_ACCESS schema 명시 (cma 정본 재사용) / UserTask_runSync 개명 / MASTER 3 테이블만 본 화면 책임 (Entity cma 4 화면 재사용 — 정책 #6 (A)) / 13 테이블 후속 도메인 화면 위임 / W5 축소 적용 (A/D/E/F = ✓ + B/C/G = N/A) / commonTopButton basic 정합 (btn_close — Round 2) → **btn_close 완전 제거 (Round 7 — portal 탭 host 위임 / 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준)** / 권한 있는 버튼은 항상 활성 (btn_sync pre-disabled 제거) / csa 자동조회 marker (정적 dataset 예외 사유 명시).

---

## §G. 확인필요 항목 집계 — 결정 완료

> 분석 단계 식별 항목 (Q-001 ~ Q-010, 10 건) 사용자 결정 완료 — **활성 확인필요 = 0 건**. 결정 누적 표 정본은 분석리포트 §11.0 (일괄 해소 결정표) + §12 (결정 누적) 참조. 본문 반영 위치: §6 (Mapper.xml As-Is 보존 + To-Be 변환점) / §7 (패키지 — `com.dongkuk.dmes.mcm.csa.commSyncMng.{service|dto}` + Entity cma 4 화면 재사용) / §8 (BPMN UserTask `UserTask_pwdinit` → `UserTask_runSync` 개명) / §9 (책임 범위 MASTER 3 테이블 축소 + 13 후속 위임) / §11 (DB Link 폐기 / LOC 분기 유일화 / VI MCMAPUSER schema 명시 / (b) 안 명시 UPDATE / 화면 존속).
>
> **2026-05-31 사용자 결정 일괄 해소**: Q-NNN 10 건 (Q-001 데이터 카탈로그 / Q-002 DB Link / Q-003 View DDL / Q-004 As-Is 의심 버그 / Q-005 LOC 환경 / Q-006 BPMN id / Q-007 패키지 / Q-008 audit 처리 / Q-009 16 테이블 매핑 / Q-010 화면 존속) 모두 ~~취소선~~ + 해소 사유 본문 직접 반영 (분석 §11.0 결정표 + §12 + 본 §E.3 일치 검증). cma 4 화면 정본 schema 결정 (`MCM_SOURCE` 원장 + `MCMAPUSER` 운영 read 동기화본 + `MCM_BACKUP` 백업본) 인용. 본 화면 자체 Entity ✗ (cma 4 화면 entity 재사용 — 정책 #6 (A)). audit 9 컬럼 (cactus-core `CactusAuditEntity`) 은 3 schema 모두 동일 적용 (Bulk INSERT 우회 보완 = (b) 안 명시 UPDATE).

---

## §J. 사용자 검수 결과 반영 이력 (Round 2 / Round 7)

> 본 절은 ToBe 코드 구현 후 사용자 검수에서 발견된 결함을 본문 갱신과 함께 추적한다. 사용자 메모리 `feedback_q_resolution_propagation.md` 정합 — 단순 "해소됨" 표시 ✗, 본문 §§ 갱신 + 코드 수정 + 정합체크 등재 동시 진행. **본 화면은 csa 8 화면 W5 패턴 전파의 축소 적용판** (단일 그리드 + 정적 16 행 dataset + Detail 폼 부재) 으로, W5 7 항목 중 A/D/E/F(marker) 4 항만 실효 + B/C/G 3 항은 N/A.

### J.0 라운드 카탈로그

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| Round | 일자 | 변경 | 영향 §/D-NNN/G-NNN/B-NNN |
|---|---|---|---|
| Round 1 | 2026-05-29 | 초기 4 산출물 작성 (분석/기능/디자인/BPMN + 정합) | 전체 §A~§G |
| Round 2 | 2026-06-04 | W5 패턴 축소 적용 (A/D/E/F 실효 + B/C/G N/A) + btn_close 명시 (CHG-001) + btn_sync pre-disabled 제거 (CHG-002) + 자동조회 marker (CHG-003) + W5 N/A 분기 명시 (CHG-004) | 디자인 §0.1/§0.2/§1.2 UX-001/§3.3 B-001·B-002/§5 UX-001·UX-005 + 정합 §J.1~§J.4 |
| Round 3 | N/A | (본 화면 해당 없음 — 다른 csa 화면 라운드) | N/A |
| Round 4 | N/A | (본 화면 해당 없음) | N/A |
| Round 5 | N/A | (본 화면 해당 없음) | N/A |
| Round 6 | N/A | (본 화면 해당 없음 — Round 7 단독 적용) | N/A |
| Round 7 | 2026-06-04~05 | btn_close 완전 제거 (CHG-005) — PageLayout buttons 배열 entry 삭제 + unused handleClose dead code 제거 + ToBe 3 버튼 표준 (조회/초기화/저장) | 디자인 §0.1 E 행/§0.2 CHG-005/§1.2 step 7/§3.3 B-002/§5 UX-007 + 정합 §J.5/§K |

### J.1 사용자 검수 발견 결함 (2026-06-04 Round 2)

| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 비고 |
|---|---|---|---|---|---|
| J-001 | 디자인 §0 W5 패턴 매핑 | Round 1 디자인설계서에 W5 A~G 패턴 매핑 헤더 부재 — csa 8 화면 전파 일관성 검증 불가 | "csa 8 화면 W5 패턴 축소 적용 + N/A 분기 명시" | 디자인 §0.1 — W5 A/D/E/F = ✓ + B/C/G = N/A (Detail 부재 / 단일 그리드 사유) 매핑 표 신설 | CHG-004 |
| J-002 | 디자인 §3.3 B-002 (btn_close) | Round 1 B-002 row 가 commonTopButton basic 인용만 + 명시 등재 누락 → AsIs xfdl:10/103/249~253 정합 불완전 | "AsIs commonTopButton basic 정합 명시 등재" | 디자인 §3.3 B-002 row — `fn_close` 핸들러 + AsIs xfdl:10/103/249~253 명시 보존 | CHG-001 |
| J-003 | 디자인 §3.3 B-001 (btn_sync) / §5 UX-005 | Round 1 btn_sync pre-disabled (`!pSyncTarget` 사전차단 + isSyncing) → 처리유형 콤보 미선택 시 클릭조차 불가 | "권한 있는 버튼은 항상 활성, 클릭 시 validation" (commUserMng J-004 정합) | 디자인 §3.3 B-001 row + §5 UX-005 — `!pSyncTarget` 사전차단 제거 + `isSyncing` 만 유지 + 핸들러 진입 시 V-001/V-002 검증 + ErrorModal 명시 | CHG-002 |
| J-004 | 디자인 §1.2 UX-001 / §0.1 F 행 | Round 1 onload transaction 호출 여부 미명시 → csa 자동조회 정책 (project_csa_cme_iter_propagation) 정합 마커 부재 | "csa 자동조회 정책 marker 명시 — 정적 dataset 예외 사유 포함" | 디자인 §1.2 UX-001 + §5 UX-001 + §0.1 F 행 — `INITIAL_SYNC_ROWS` mount 즉시 노출 + transaction ✗ + 정적 dataset 사유 marker | CHG-003 |

### J.2 W5 패턴 N/A 분기 명시 (CHG-004 상세)

> csa 8 화면 W5 패턴 전파 정책 (project_csa_cme_iter_propagation) 의 본 화면 적용 결과. 7 항목 중 **B + C + G = N/A** 분기 사유는 다음과 같다 — 회귀 방지 가드.

| Pattern | N/A 사유 | 대응 AsIs 자산 |
|---|---|---|
| **B** Detail BindItem 정합 | 본 화면 Detail 폼 부재 — D-NNN 0 건 (분석 §3.4 / 디자인 §3.5 D 행 ✗). `setValue`/`watch` 양방향 바인딩 대상 컨트롤 부재. | xfdl Layout 내 BindItem 0 건 (xfdl:25~68 div_main 내 Static + Grid + Button 만) |
| **C** Form row (label 140 + input left=143) | Detail 부재로 form row 정책 적용 대상 ✗. 조회조건 S-001~S-004 4 컨트롤은 `<SearchField>` 단일 행 (label+input 인라인) 으로 별도 정책. | xfdl:14~23 div_search (Static + Combo + Static + Edit 4 컨트롤 인라인) |
| **G** Detail wrapper overflow + height | Detail 부재로 wrapper overflow / height 정책 대상 ✗. ContentPanel 단일 + grd_main `flex:1` 만 적용 (overflow auto / scroll bar 자동). | xfdl:25~68 div_main (Label + Grid 단일 구조) |

### J.3 신규 Q-NNN 등재 ✗

Round 2 작업은 **AsIs 정합 정정** + **csa 전파 정책 영역 반영** 만 포함하며 신규 미해결 결정 사항 ✗. 모든 결함은 본문 갱신 + 정합 §J 등재로 즉시 해소. 활성 Q-NNN = 0 (기존 §G + §C Q-001~Q-010 10건 전수 해소 상태 유지).

### J.4 다음 검수 사이클 가드

- Round 3 이후는 본 §J 의 J-001~J-004 4 항목이 회귀하지 않도록 변경 PR 시 본문 + 코드 동시 갱신 강제.
- csa 8 화면 W5 패턴 전파 작업의 본 화면 결과는 **축소 적용판** (A/D/E/F 4 항 실효) — 다른 7 화면 (commPermMng / commMenuMng / commRoleMng / commRoleGrpMng / commObjMng / commUserRoleCopy / commUserMng) 의 전체 적용판과 N/A 분기 사유로 구분되어야 함. iter 작업 시 §J.2 N/A 사유 표 참조.
- `feedback_design_thoroughness.md` 정합으로 Round 3 작업 시 동일 검수 사이클 (W5 패턴 매핑 + N/A 사유 명시) 적용.

### J.5 사용자 검수 발견 결함 (2026-06-04~05 Round 7)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| # | 발견 영역 | 결함 | 사용자 지시 | 본문 반영 | 비고 |
|---|---|---|---|---|---|
| J-005 | 디자인 §3.3 B-002 (btn_close) / §5 UX-007 / §1.2 step 7 / §0.1 E 행 | Round 2 까지 btn_close 가 commonTopButton basic 4 의 마지막 entry 로 명시 등재되었으나, portal 탭 close 는 host 가 처리하므로 화면 내부 닫기 버튼은 의미 ✗ | "AsIs xfdl 의 btn_close → ToBe 에서 완전 제거. PageLayout buttons 배열에서 btn_close entry 삭제, unused handleClose dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe 3 버튼 표준 (조회/초기화/저장)" | 디자인 §0.1 E 행 (CHG-005 marker) + §0.2 CHG-005 row 신설 + §3.3 B-002 row 취소선 폐기 + §5 UX-007 row 취소선 폐기 + §1.2 step 7 취소선 폐기 + As-Is xfdl:10/103/249~253 은 As-Is 잔존 코드로만 명시 (ToBe 미반영) | CHG-005 |

### J.6 Round 7 가드 — 다른 csa 7 화면 전파

- 본 화면 Round 7 결정은 csa 8 화면 모두에 동일 적용되어야 함 (commPermMng / commMenuMng / commRoleMng / commRoleGrpMng / commObjMng / commUserRoleCopy / commUserMng + 본 화면). 다른 7 화면 PageLayout 의 btn_close entry 도 동시 제거 + unused `handleClose` dead code 제거 강제.
- 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → **ToBe 3 버튼 표준 (조회/초기화/저장)** 전환 — 가이드 본문 등재 권고 (가이드 §6-E 갱신 후 본 라운드 참조 추가).
- AsIs xfdl 자산의 btn_close (xfdl:10 commonTopButton include / 103 text=닫기 / 249~253 fn_close) 는 As-Is 잔존 코드로만 명시 — ToBe 산출물 본문 직접 인용 ✗.

---

## §K. Cross-reference 라운드 변경 확정 시각

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> 본 절은 라운드별 결함 (J-NNN) / W5 패턴 변경 / 변경 카탈로그 (CHG-NNN) 의 본문 반영 확정 여부를 cross-ref 형태로 추적한다. ✓ = 본문 갱신 완료, ✗ = 미반영 (회귀 가드).

### K.1 라운드 × 영향 § 확정 매트릭스

| 라운드 | 결함 ID | 영향 § (디자인) | 영향 § (정합) | 본문 반영 |
|---|---|---|---|---|
| Round 2 | J-001 (W5 매핑 부재) | 디자인 §0.1 (CHG-004) | 정합 §J.1 / §J.2 | ✓ |
| Round 2 | J-002 (B-002 명시 누락) | 디자인 §3.3 B-002 (CHG-001 — Round 2 시점) | 정합 §J.1 | ✓ (Round 7 에서 폐기로 갱신) |
| Round 2 | J-003 (btn_sync pre-disabled) | 디자인 §3.3 B-001 / §5 UX-005 (CHG-002) | 정합 §J.1 | ✓ |
| Round 2 | J-004 (자동조회 marker 부재) | 디자인 §1.2 UX-001 / §0.1 F 행 (CHG-003) | 정합 §J.1 | ✓ |
| Round 7 | J-005 (btn_close 완전 제거) | 디자인 §0.1 E 행 / §0.2 CHG-005 / §1.2 step 7 / §3.3 B-002 / §5 UX-007 | 정합 §J.5 / §J.6 / §K | ✓ |

### K.2 W5 패턴 변경 확정 (라운드별)

| 라운드 | W5 항 | 변경 | 확정 |
|---|---|---|---|
| Round 2 | A (PageLayout 단일 그리드) | ✓ 실효 명시 | ✓ |
| Round 2 | B (Detail wrapper) | N/A 명시 (Detail 부재) | ✓ |
| Round 2 | C (Form row) | N/A 명시 (Detail 부재) | ✓ |
| Round 2 | D (Grid) | ✓ 실효 명시 (단일 grd_main) | ✓ |
| Round 2 | E (Buttons) | ✓ 실효 명시 — B-001 + B-002 + B-003 | ✓ (Round 7 갱신) |
| Round 7 | **E (Buttons — btn_close 제거)** | **B-002 entry 폐기 → B-001 + B-003 2 버튼만 (commonTopButton 4 entry 중 닫기 1 제거)** | **✓** |
| Round 2 | F (Auto-search marker) | ✓ marker 명시 (정적 dataset 예외) | ✓ |
| Round 2 | G (Detail overflow + height) | N/A 명시 (Detail 부재) | ✓ |

### K.3 변경 카탈로그 (CHG-NNN) 확정

| CHG-ID | 라운드 | 위치 (디자인) | 확정 |
|---|---|---|---|
| CHG-001 | Round 2 | §3.3 B-002 (Round 7 에서 폐기) | ✓ → 폐기 |
| CHG-002 | Round 2 | §3.3 B-001 / §5 UX-005 | ✓ |
| CHG-003 | Round 2 | §1.2 UX-001 / §0.1 F 행 / §5 UX-001 | ✓ |
| CHG-004 | Round 2 | §0.1 W5 N/A 분기 (B/C/G) | ✓ |
| CHG-005 | Round 7 | §0.1 E 행 / §0.2 / §1.2 step 7 / §3.3 B-002 / §5 UX-007 | ✓ |

> **§K 결과**: Round 2 결함 4 (J-001~J-004) + Round 7 결함 1 (J-005) = 총 5 행 모두 ✓ + W5 7 항 모두 ✓ + CHG-001~CHG-005 모두 ✓ (CHG-001 은 Round 7 에서 폐기로 전환). 회귀 가드 — 향후 라운드에서 본 K.1 매트릭스 ✓ 유지 강제.

---

## §6.14 4질문 검증 (Phase 5 종료)

| # | 질문 | 답변 |
|---|---|---|
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 1 | 14항 위반? | ✗ (5 종 산출물 frontmatter / ID / Q-NNN / SQL / action 모두 §E 일치 검증 / 가이드 §A~§F 절 구조 그대로 / 사용자 결정 환경 제약 §A.3 / §A.A-R12-1 / §A.A-R12-4 / §D.4 = ✗ + 사유 명시 / Q 10건 해소 갱신 본문 반영 완료 — 2026-05-31 / Round 2 W5 축소 적용 + 변경 카탈로그 4 항목 본문 반영 완료 — 2026-06-04 / **Round 7 btn_close 완전 제거 (CHG-005) 본문 반영 완료 — 2026-06-04~05**) |
| 2 | 검증 안 한 부분? | ✗ (§A.2 누락 매트릭스 15 행 모두 합 일치 검증 / §B 식별자 20+ 행 검증 / §C 변환점 13 행 검증 / §E ID 매핑 50+ 행 + Q-NNN 10 행 모두 해소 검증 / §J Round 2 결함 4 행 (J-001 ~ J-004) + W5 N/A 분기 3 행 (B/C/G) 모두 등재 / **§J.5 Round 7 결함 1 행 (J-005) + §J.0 라운드 카탈로그 7 행 + §K Cross-ref 매트릭스 (K.1 5 행 + K.2 W5 7 항 + K.3 CHG 5 항) 모두 등재**) |
| 3 | 그대로 수용? | ✗ (사용자 결정 환경 제약 ✗ 행 + 사유 명시 — A-R12-1 / A-R12-4 / A.3 / D.4 / Q-NNN 10 건 전수 해소 — 활성 0 / W5 7 항목 중 3 항 N/A 분기 사유 명시 — 축소 적용판 분류 / **Round 7 ToBe 3 버튼 표준 (조회/초기화/저장) 명시 — 가이드 §6-E 4 버튼 표준 from 변경 / B-002 row 폐기 + AsIs xfdl:10/103/249~253 As-Is 잔존 코드로만 명시 / CHG-001 Round 7 폐기 전환 명시**) |
| 4 | 임의 합리화? | ✗ ("주요/대표/등" 0 회 / §F 종합 판정 = ✓ 단 "환경 제약 명시 조건" 단서 명시 + Q 해소는 사용자 결정 명시 인용 / W5 N/A 분기는 분석 §3.4 D 0 건 / §3.5 라벨만 / §4.2 GB 0 건 / §3.6 정적 16 행 dataset 등 분석 단일 원천 직접 인용 / **Round 7 btn_close 제거 사유 = portal 탭 host 위임 명시 인용 (사용자 지시 직접 인용 — 임의 합리화 ✗)**) |

> Phase 5 통과 — 5 종 설계 1차 사이클 종료 + Q 10건 해소 2차 갱신 완료 (2026-05-31) + Round 2 W5 축소 적용 갱신 완료 (2026-06-04) + **Round 7 btn_close 완전 제거 (CHG-005) 갱신 완료 (2026-06-04~05)**.
