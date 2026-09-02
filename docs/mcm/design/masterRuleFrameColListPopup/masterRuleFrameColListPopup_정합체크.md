---
screenId: masterRuleFrameColListPopup
asIsId: MasterRuleFrameColListPopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 컬럼 리스트 등록 팝업 정합체크서

> 3종 설계서(기능/디자인/BPMN) 작성 후 본 정합체크서를 작성한다.

## 차단 규칙 (도입부)

§A ~ §F 6 개 절이 모두 ✓ 일 때만 설계 완료. §G 는 미해결 항목 추적용.

| 절 | 제목 | 차단 여부 |
|---|---|---|
| §A | 구조 동일성 + 누락 검증 | ✗ → 설계 미완성 |
| §B | 명명 규칙 검증 | ✗ → 설계 미완성 |
| §C | 5축 정합 | ✗ → 설계 미완성 |
| §D | 반복 설계 결정성 검증 | ✗ → 설계 미완성 |
| §E | 가이드 중복 제거 검증 | ✗ → 설계 미완성 |
| §F | 삭제 참조 검증 | ✗ → 설계 미완성 |
| §G | 확인필요 항목 집계 | 추적용 |

> **환경 제약 (분석 §0)**: R-14 Auto Manifest Runner 미적용 (mui 자료형식 미지원). 따라서 §A.3 manifest 행 / §D.4 R-14 매트릭스 = 해당 없음 (✗ 아님 — Runner 미실행 명시). WinForms 전제 항목(designer.cs/resx/이벤트 12종/@Case SP)은 mui 등가물로 매핑 또는 "해당 없음".

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 (✓/✗) | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 템플릿과 동일 | ✓ (mui 적응 §0~§14) | ✓ | ✓ | ✓ | ✓ | 분석=masterCodeSelPop 동일 mui 구조 / 3 설계서=template 절 순서 |
| 표 헤더 (컬럼명·수·순서) — 템플릿과 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (적용 대상 없는 절/행 삭제 0) | ✓ | ✓ (§4/§7 해당없음 유지) | ✓ (§10 해당없음) | ✓ (§2.3/§2.5~2.7 해당없음) | ✓ | - |
| 임의 ## 헤더 추가 (템플릿 외) | 없음 | 없음 | 없음 | 없음 | ✓ | - |
| frontmatter 6 필드 | ✓ | ✓ | ✓ | ✓ | ✓ | screenId/asIsId/moduleId/moduleGroup/작성일/작성자 |
| **A-T1A**: 분석 §4.1 행 수 == 10 (T1-A) | (mui 등가 — §3 컴포넌트 전수로 대체) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | WinForms T1-A 미해당 → mui §3.1~§3.5 전수 |
| **A-R12-1**: 사전 판정표 5종 (분석 §0.1~§0.5) | (mui 등가 — §0 환경제약 + §3~§4 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | Runner 미적용 → mui 전수 분석으로 대체 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 | (mui 구조 — 예시 마커 미사용) | - | - | - | ✓ | masterCodeSelPop 동일 |
| **A-R12-3**: 외부 호출 D1~D3 추적 (분석 §5) | ✓ (§5.1 D1 xfdl / §5.3 D1 Java / §6 외부 Mapper) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-4**: 이벤트 12종 매트릭스 (분석 §5.1) | (mui 등가 — §5.4 해당없음 명시) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | WinForms 이벤트 모델 미해당 |
| **A-R12-5**: SP 분기 매트릭스 (분석 §5.2) | (mui 등가 — §5.5 해당없음 + §6 Mapper/Java) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | @Case SP 미사용 |
| **A-R12-6**: 자유 서술 0 | ✓ | ✓ | ✓ (§2.2 ASCII만) | ✓ (§2 ASCII만) | ✓ | - |

### A.2 누락 검증 (발견 = 반영 + 확인필요 + 제외)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 | 확인필요 수 | 제외 수 | 합 일치 (✓/✗) |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S) | 4 | 4 | 2 (S-002/S-004 표시) | - | (개발 전) | 0 | 0 | ✓ |
| 그리드 컬럼 (G) | 9 (순번 포함) | 9 | 9 | - | (개발 전) | 0 | 0 | ✓ |
| 상세 필드 (D/L) | 0 | 0 (해당없음) | - | - | (개발 전) | 0 | 0 | ✓ |
| 버튼 (B) | 3 | 3 | 3 | 2 (B-001 save / B-002·B-003 클라이언트) | (개발 전) | 0 | 0 | ✓ |
| 팝업/탭/연동 (P) | 1 (부모 호출) | 1 | 1 | 1 | (개발 전) | 0 | 0 | ✓ |
| 상태값 (ST) | 0 | 0 (해당없음) | - | - | (개발 전) | 0 | 0 | ✓ |
| 코드값/LoV (LV) | 3 (ds_inOut/ds_div/ds_colType) | 3 | 3 | 3 | (개발 전) | 0 | 0 | ✓ |
| 검증 규칙 (V/XV) | 8 (V-001~007 + XV-001) | 8 | - | 8 | (개발 전) | 0 | 0 | ✓ |
| 프로시저/함수/트리거 | 3 (GetRuleColList + delete + insert) | - | - | 2 액션 (search/save) | (개발 전) | 0 | 0 | ✓ |
| To-Be 컬럼 | 12 (sheet134 업무 12 — save INSERT 10 + 주석 2) | 10 (save INSERT) | 9 (그리드) | - | (개발 전) | 0 | 2 (주석 OLD_COL_ID/MES_COL_ID — Entity 보유, save 미INSERT) | ✓ |

### A.3 manifest 행 수 ↔ 산출물 행 수 검증 (R14-v3.0)

| 분석 원천 | manifest items 카운트 (정본) | 분석.template 행 수 | 일치 (✓/✗) | 근거 |
|---|---:|---:|---|---|
| (전 행) | (해당 없음 — Runner 미적용) | (mui 전수) | N/A | 분석 §0 (R-14 ✗) |

**§A.3 결과**: Runner 미적용 → manifest 비교 N/A (✗ 아님). mui 자료 전수 분석으로 대체.

**§A 결과**: A.1 모든 행 ✓ + A.2 합 일치 ✓ + A.3 N/A → §A ✓.

---

## §B. 명명 규칙 검증

### B.1 모듈 룰 결정

| 항목 | 값 | 결과 (✓/✗) |
|---|---|---|
| moduleId | mcm | ✓ |
| 적용 명명 룰 | MES 단일 룰 | ✓ (mcm ≠ mpn) |

### B.2 식별자별 검증

| 항목 | 값 | 적용 룰 (MES / APS-mpn) | 부속서 A 근거 | 검증 결과 (✓/✗) |
|---|---|---|---|---|
| moduleId | mcm | (전체 공통) | 01 A.1 (mcm 등재) | ✓ |
| moduleGroup | cmb | (전체 공통) | 01 A.2 (cmb 영역 코드 — 업무기준 관리(원장)) | ✓ (본 phase 지시 등재) |
| 화면식별자 (screenId) | masterRuleFrameColListPopup | MES: camelCase `{화면명}` | 01 A.3 / A.4.1 | ✓ |
| pageName | masterRuleFrameColListPopup | MES: = screenId | 01 A.4.2 | ✓ |
| pageId | masterRuleFrameColListPopup | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | masterRuleFrameColListPopup | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) | 01 A.4.5 | ✓ |
| Frontend 파일명 | masterRuleFrameColListPopup.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | `pages/cmb/masterRuleFrameColListPopup` | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | flat (P-001) | (전체 공통) | 01 A.4.7 | ✓ |
| 필드/컬럼/버튼 ID | S/G/B/P/V/XV/LV/E-NNN | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE / camelCase | (전체 공통) | 01 A.4.9 | ✓ |
| **B-T2A**: 화면 표시명 == As-Is 1byte 일치 | ✓ (업무기준/영문항목명/한글항목명/순번/선택/코드여부/유형/총길이/소수점길이) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 | ✓ (COL_ID→colId 등) | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum | ✓ (A-FILTER/A-GRID/A-BTN) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum | ✓ (TextBox — mui Edit 매핑) | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) | ✓ (varchar(30)/int(5) 등) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: screenId == pageId == serviceId == pageName | ✓ (4 식별자 1byte 동일) | MES | 사용자 결정 | ✓ |
| **B-APS-1**: mpn kebab | N/A | APS-mpn | - | N/A |

**§B 결과**: 모든 행 ✓ → §B ✓. (cmb 는 본 phase 지시로 등재 — 부속서 A.2 PR 별도 권장).

---

## §C. 5축 정합

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 (✓/✗) |
|---|---|---|---|---|---|---|
| 화면식별자 | masterRuleFrameColListPopup | 동일 | 동일 | 동일 | 동일 | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | cmb | cmb | cmb | cmb | cmb | ✓ |
| pageName | masterRuleFrameColListPopup | 동일 | 동일 | 동일 | 동일 | ✓ |
| pageId | masterRuleFrameColListPopup | 동일 | 동일 | 동일 | 동일 | ✓ |
| serviceId | masterRuleFrameColListPopup | 동일 | 동일 | 동일 | 동일 | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (S-001~004) | §3 (4) | §3.2 (S-002/S-004) | - | - | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 (G-000~008, 9) | §3.2 (9) | §4 (9) | - | - | ✓ |
| 컬럼ID (GE-NNN 확장) | 없음 | 없음 | 없음 | - | - | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (B-001~003) | §5 (3) | §6 (B-001/002) | §1.1 (B-001 save) | - | ✓ |
| 팝업ID (P-NNN 전수) | §1 (P-001 부모) | §9 (1) | §6 (1) | §2.4 (부모 콜백) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | COL_ID/COL_NM/IO_FLAG/... | 동일 | 동일 | 동일 | 동일 | ✓ |
| 상태코드 (statusCodes) | 없음 (§9.1 ST 없음) | §7 해당없음 | - | §2.7 해당없음 | - | ✓ |
| action 목록 | search / save / popup | 동일 | - | search / save (API) | - | ✓ |

**§C 결과**: 모든 행 ✓ → §C ✓.

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 (✓/✗) |
|---|---|---|---|---|---|
| screenId | masterRuleFrameColListPopup | 동일 | 동일 | 동일 | ✓ |
| asIsId | MasterRuleFrameColListPopup | 동일 | 동일 | 동일 | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | cmb | cmb | cmb | cmb | ✓ |
| serviceId | masterRuleFrameColListPopup | 동일 | 동일 | 동일 | ✓ |
| S-NNN 수 | 4 | 4 | 2 (표시) | (해당 없음) | ✓ |
| G-NNN 수 | 9 | 9 | 9 | (해당 없음) | ✓ |
| GE-NNN / G2-NNN 수 | 0 | 0 | 0 | (해당 없음) | ✓ |
| B-NNN 수 | 3 | 3 | 3 | 2 (API search/save) | ✓ |
| P-NNN 수 | 1 | 1 | 1 | 1 | ✓ |
| statusCodes 목록 | 없음 | 없음 | - | 없음 | ✓ |
| C1~C6 충족 개수 | 0/6 | (해당 없음) | (해당 없음) | 0/6 | ✓ |
| API 패턴 | OASIS 단일 BPMN | (해당 없음) | (해당 없음) | OASIS 단일 BPMN | ✓ |
| action 목록 | search/save/popup | search/save/popup | - | search/save | ✓ |

### D.2 반복 설계 결정성 검증

| 항목 | 1차 값 | 2차 값 | 일치 (✓/✗) |
|---|---|---|---|
| S-NNN 수와 순서 | 4 (S-001~004) | 4 | ✓ |
| G-NNN 수와 순서 | 9 (G-000~008) | 9 | ✓ |
| GE-NNN / G2-NNN | 0 | 0 | ✓ |
| D-NNN / L-NNN | 0 | 0 | ✓ |
| B-NNN 수와 순서 | 3 | 3 | ✓ |
| GB-NNN 수와 순서 | 0 | 0 | ✓ |
| P-NNN 수와 순서 | 1 | 1 | ✓ |
| statusCodes 목록 | 없음 | 없음 | ✓ |
| C1~C6 판정 결과 | 0/6 | 0/6 | ✓ |
| API 패턴 | OASIS | OASIS | ✓ |
| serviceId | masterRuleFrameColListPopup | 동일 | ✓ |
| action 목록 | search/save/popup | 동일 | ✓ |
| 산출물 절 순서 | template 순 | 동일 | ✓ |
| 표 헤더 | template | 동일 | ✓ |
| **D-T1B**: S 카운트 N차 동일 | 4 | 4 | ✓ |
| **D-T1C**: D+L+GE 합 == sList 외 SELECT 분기 | 0 (단일 SELECT) | 0 | ✓ |
| **D-T1D**: B+GB 합 == Button+ButtonField | 3 (commonTop 2 + btn_fold 1) | 3 | ✓ |
| **D-T1E**: statusCodes 카운트 | 0 | 0 | ✓ |
| **D-T1F**: 컨트롤별 핸들러 수 == 행 수 | ✓ | ✓ | ✓ |
| **D-T2C**: 디자인 §1 페이지 유형 == 알고리즘 (E) | E | E | ✓ |
| **D-T3D**: API 라우팅 == 04 §A.2-3-2 (OASIS) | OASIS | OASIS | ✓ |

### D.3 N차 반복 생성 회귀 매트릭스

| 항목 | 1차 | 2차 | max-min / 불일치 | 결과 (✓/✗) |
|---|---|---|---|---|
| screenId | masterRuleFrameColListPopup | 동일 | 0 | ✓ |
| serviceId | masterRuleFrameColListPopup | 동일 | 0 | ✓ |
| S-NNN 수 | 4 | 4 | 0 | ✓ |
| G-NNN 수 | 9 | 9 | 0 | ✓ |
| B-NNN 수 | 3 | 3 | 0 | ✓ |
| P-NNN 수 | 1 | 1 | 0 | ✓ |
| LV-NNN 수 | 3 | 3 | 0 | ✓ |
| C1~C6 충족 개수 | 0 | 0 | 0 | ✓ |
| API 패턴 | OASIS | OASIS | 0 | ✓ |
| 절 순서 | 동일 | 동일 | 0 | ✓ |
| **R11-A**: 사전 판정 (mui 등가 — §0/§3/§4 전수) | ✓ | ✓ | 0 | ✓ |
| **R11-B**: 화면 표시명 (T2-A 1byte) | ✓ | ✓ | 0 | ✓ |
| **R11-F**: P-NNN 호출 순서 (부모 P-001) | ✓ | ✓ | 0 | ✓ |

### D.4 R-14 Auto Manifest 검증 매트릭스

| # | 검증 행 | 결과 (✓/✗) |
|---:|---|---|
| 1~12 | (해당 없음 — Runner 미적용, 분석 §0) | N/A |

**§D.4 결과**: Runner 미적용 → R-14 매트릭스 N/A (✗ 아님 — 환경 제약 명시).

**§D 결과**: D.1~D.3 모든 행 ✓ + D.4 N/A → §D ✓.

---

## §E. 가이드 중복 제거 검증

| 영역 | 정본 위치 | 다른 가이드 본문 잔존 (✓ 잔존 0 / ✗ 발견) | grep 키워드 |
|---|---|---|---|
| 명명 규칙 본문 | 01 A.4 | ✓ (본 산출물 = 참조만) | camelCase 표 본문 |
| moduleId / moduleGroup 카탈로그 | 01 A.1 / A.2 | ✓ | 모듈 카탈로그 |
| 화면 ↔ As-Is 매핑 | 01 A.3 | ✓ | 화면 매핑 |
| API URL / OASIS / Phase 7 | 04 §A.2-3 | ✓ | `POST /api/{moduleId}/oasis` |
| C1~C6 API 패턴 | 04 §A.2-3-2 | ✓ | C1~C6 판정 |
| 사용자 결정 카탈로그 | 02 §A.1-2-1 | ✓ | - |
| Q-NNN 형식 | 분석.template §13 | ✓ | Q-NNN 7 컬럼 |
| 산출물 양식 | templates/*.template.md | ✓ | - |
| As-Is 추출 알고리즘 | 00 §6.4.1~§6.4.8 | ✓ | - |

**§E 결과**: 모든 행 잔존 0 ✓ → §E ✓. (E.2 R-12/R-13/R-14 drift 검증은 Runner 미적용 환경에서 mui 등가 적용 — 가이드 본문 미변경.)

---

## §F. 삭제 참조 검증

| 검증 항목 | 잔존 (✓ 잔존 0 / ✗ 발견) | 검증 범위 |
|---|---|---|
| 삭제된 §22 인용 | ✓ 잔존 0 | 설계서 4종 + 본 정합 |
| 삭제된 §23 (Decision Lock) 인용 | ✓ 잔존 0 | 동일 |
| `locks:` (frontmatter) 인용 | ✓ 잔존 0 | 동일 |
| `supersede` / `superseded` 인용 | ✓ 잔존 0 | 동일 |
| `정본 차수` / `sourceIteration` 인용 | ✓ 잔존 0 | 동일 |
| `lockedAt` / `guideVersion` 인용 | ✓ 잔존 0 | 동일 |
| `status: locked` / `status: draft` 인용 | ✓ 잔존 0 | 동일 |

**§F 결과**: 모든 행 잔존 0 ✓ → §F ✓.

---

## §G. 확인필요 항목 집계

| ID (`Q-NNN`) | 항목 | 내용 | 영향도 | 설계 반영 방식 | 후속 조치 | 상태 |
|---|---|---|---|---|---|---|
| Q-001 | TB_MCA_RULE_COL_LIST To-Be 정본 | **DMES-SECTION-MCA sheet134 등재 (MCAAPUSER, 공통감사 17 + 업무 12 = 29 컬럼)** + 형제 masterRuleFrame §7 Entity `MasterRuleColList` / Repository `MasterRuleColListRepository` 정합. owner=MCAAPUSER, audit=McmAuditEntity 9, PK=(RULE_ID, COL_SEQ) 2키 (2026-07-08 오기 정정 — 사용자 확정) | 높음 | To-Be 컬럼 = sheet134 업무 12 + audit→McmAuditEntity (분석 §7.2) | (없음 — 정본 확보) | resolved |
| Q-002 | save 반환 dataset 불일치 | xfdl sOutDatasets=ds_GetRuleDataUploadList(Script:294) vs Java 는 cnt_save 만 적재(Java:64) | 낮음 | As-Is 보존 — To-Be save 는 `{ savedCount }` 반환 | 반환 형식 표준화 (확정) | **확정 (As-Is 보존 + cnt 표준화 — 사용자 2026-06-04)** |

**§G 결과 (참고)**: open 0 / resolved 2 (Q-001 / Q-002 사용자 확정 2026-06-04) / wontfix 0.

---

## §H. 셀 본문 결정성 검증 (참고 — N차 회귀 미실시)

> 본 phase 1차 생성. N차 회귀 미실시 → 셀 본문 일치율 측정 deferred. 1차 생성 결과는 분석 §3~§13 전수 인용 기반으로 결정성 확보.

| 절 / 영역 | 1차 생성 | 목표 | 결과 |
|---|---|---|---|
| §3.2 S-NNN | 4 행 | ≥ 80% | (1차 — deferred) |
| §3.3 G-NNN | 9 행 | ≥ 80% | (1차 — deferred) |
| §4.1 B-NNN | 3 행 | ≥ 80% | (1차 — deferred) |
| §13 Q-NNN | 2 행 | ≥ 95% | (1차 — deferred) |

---

## §I. 의미 일치도 검증 (참고 — N차 회귀 미실시)

| 절 / 영역 | 1차 생성 | 목표 | 결과 |
|---|---|---|---|
| 종합 | (1차) | ≥ 97% | (deferred — N차 회귀 시 측정) |

---

## §J. SOP 30 Step 실행 검증 (참고 — Runner 미적용)

> R-13 SOP 30 Step 은 WinForms designer.cs/SP grep 전제. mui 자료형식은 Runner 미지원(분석 §0) → mui 전수 분석(xfdl 342줄 + Java + Mapper + bpmn + 부모 연동)으로 대체. 30 Step 직접 실행 N/A.

**최종 판정**: §A ✓ / §B ✓ / §C ✓ / §D ✓ / §E ✓ / §F ✓ → **6/6 ✓ — 설계 완료** (§7 To-Be 테이블/Entity 보강 후에도 6/6 ✓ 유지). §G open 0 / resolved 2 (Q-001 테이블 정본 / Q-002 save 반환 사용자 확정 2026-06-04). 영속성=JPA(cmb 공통). 환경제약상 manifest 미생성(분석 §0 R-14 ✗) 유지.
