## §K. 코드 구현 정합 (개발 완료 게이트 — 신설)

<!-- 검증 대상: 설계서 5종 ↔ 실제 코드 (BE Entity / DTO / Service / BPMN + FE types / GRID_COLS / Search / Buttons) 의 1:1 일치. -->
<!-- 본 §K 는 설계 완료 시점이 아닌 **개발 완료 시점**에 채운다. 설계 단계에서는 모든 행 "(미작성 — 개발 후 채움)" 표시. -->
<!-- BE/FE 개발 가이드 §12-3 (BE) / §13-4 (FE) 의 1:1 대조 체크리스트와 동일 의미. -->

### K.1 영역별 수량 매칭

| 영역 | 설계서 정의 수 (분석.template) | 실제 코드 수 | 일치 (✓/✗) | 비고 (차이 사유 — Q-NNN 또는 §6-A 위반) |
|---|---:|---:|---|---|
| Entity 컬럼 (§7) |  |  |  |  |
| 검색조건 (§3 S-NNN) |  |  |  |  |
| 그리드 컬럼 (§4.3 G-NNN) |  |  |  |  |
| 첨부 그리드 컬럼 (§4.3 GE-NNN) |  |  |  |  |
| 상세 필드 (§4.4 D-NNN / L-NNN) |  |  |  |  |
| 본체 버튼 (§4.5 B-NNN) |  |  |  |  |
| 그리드셀 버튼 (§4.5-1 GB-NNN) |  |  |  |  |
| 팝업 (§4.6 P-NNN) |  |  |  |  |
| 상태값 (§9.1 ST-NNN) |  |  |  |  |
| LoV 매핑 (§10 LV-NNN) |  |  |  |  |
| 검증 규칙 (§6 V-NNN) |  |  |  |  |

### K.2 동적 변환 검증 (캐싱 컬럼 금지)

| 컬럼 ID | 설계서 표시 ("편집 여부 N" + 근거) | 코드 처리 (저장 컬럼 ✗ / 동적 변환 ✓) | 결과 (✓/✗) |
|---|---|---|---|
| 외부 JOIN 컬럼 (예: G-013 jobNm — STUFF + P001) |  |  |  |
| LoV 변환 컬럼 (예: G-041 inspStatusNm — Q003) |  |  |  |
| 외부 집계 컬럼 (예: G-044 docNm — P_MOLD_ATTACH STUFF) |  |  |  |
| 계산 컬럼 (예: G-029 avgRepairCycle) |  |  |  |

### K.3 안티패턴 검사 (BE/FE 가이드 §6-A 적용)

| 안티패턴 | 적용 여부 (✗ = 안 한 것 — 정상) | 위반 시 영향 항목 |
|---|---|---|
| 6-A-1 외부 JOIN 컬럼을 Entity 저장 컬럼으로 임의 추가 |  | Entity 컬럼 수 ✗ |
| 6-A-2 설계서 항목 임의 축소 |  | 해당 영역 수 ✗ |
| 6-A-3 설계서 미명시 정책 임의 광범위 적용 |  | 정책 명시 누락 위반 |
| 6-A-4 사용자 동의 없는 단순화/캐싱 결정 |  | 사용자 동의 절차 위반 |
| 외부 도메인 시뮬레이션 Entity 임의 생성 (BE §11-X / FE §12-X) |  | 도메인 경계 침범 |

### K.4 결과

- 모든 ✓ → §K 통과 → BE 가이드 §12-3 / FE 가이드 §13-4 의 "정합체크서 §K" 항목 ✓ 인정.
- 한 항목이라도 ✗ → §K 미통과 → BE §12-4 / FE §13-5 의 재개발 의무 사이클 발동.
- **§K 통과 조건**: K.1 + K.2 + K.3 + **K.5** 모두 ✓ (K.5 는 As-Is 가 있는 경우 MUST, 없으면 "해당 없음" 으로 통과).

### K.5 SP 부수효과 매트릭스 (As-Is 1:1 강제 검증 — 컬럼 단위 + UI 자동 연동 + 표준 라이브러리)

<!-- 분석리포트 §17.2 (Case × E-NNN 매트릭스) + §17.2-T1/T2/T3/T4 인용. -->
<!-- 매 행 = As-Is 부수효과 1건 (컬럼/이벤트/라이브러리 1건). case 단위 묶음 ✓ 금지. -->
<!-- BE/FE 개발 가이드 §12-3 (BE) / §13-4 (FE) 의 "As-Is 정합 매트릭스" 의무 산출물. -->

#### K.5.0 절대 원칙 (모든 §K.5.N 보다 우선 — 위반 시 즉시 ✗ 재개발 의무)

> **🚨 본 §K.5.0 은 §K.5 전체에 우선하는 절대 원칙. 본 §K.5 의 어떤 조항도 본 §K.5.0 을 회피하는 근거로 사용될 수 없다.**

**§K.5.0.1 As-Is 정의 1:1 보존 — 임의 변경 절대 금지**:
- 분석리포트 §17.0.1 의 보존 대상 (화면 구조 / 컬럼 / 상태값 / 데이터 동작 / 자동 연동 / 검증 로직) 변경은 **사용자 명시 결정 (§G Q-NNN 등재 → 사용자 동의)** 없이 불가.
- 임의 변경 근거 표현 (`"효율 위해 단순화"` / `"MES 표준에 맞춤"` / `"시간 단축"` / `"분량이 커서"` / `"유사하므로 동일"`) 이 ✗/△ 행 사유에 등장하면 = **✗ 자동 재개발 의무**.

**§K.5.0.2 코드 정의 완전 분석 의무 — Skip 금지**:
- §17.2-T1/T2/T3/T4 의 모든 행이 §K.5 의 행과 1:1 매핑되어야 함. 매핑 빈 행 = ✗.
- BE quote 가 `"(미구현)"` 으로 표기된 행은 ✗ (Q-NNN deferred 인 경우만 △).
- 모든 ✓/△/✗ 행에 `As-Is file:line + quote` + `BE file:line + quote (또는 미구현 사유 + Q-NNN)` 동시 보유.

**§K.5.0.3 검증 단계 의무 — 3단계 차단 조항**:
- 1단계: §K.5.1 ~ §K.5.4 (As-Is 1:1 정합 + As-Is 외 BE 동작 + 미구현) 모두 작성
- 2단계: §K.5.5 self-check 통과 (T1~T4 1:1 매핑 + quote 보유 + 임의 변경 사유 명시)
- 3단계: §K.5.6 임의 변경 검증 통과 (사유 없는 분리/통합/값 변경 0건)
- 3단계 모두 통과해야 §K.5 ✓ 가능. 한 단계라도 실패 = ✗ 자동 전환.

#### K.5.1 As-Is 정합 매트릭스 (E-NNN 단위 1:1 — 컬럼 / 이벤트 / 라이브러리)

> **(MUST — 강제 형식)**:
> 1. 매 행 = 분석리포트 §17.2-T4 (SP case 컬럼) 또는 §17.2-T1/T2/T3 (UI 컴포넌트 / 이벤트 / 라이브러리) 의 1건. ID 1:1 매핑.
> 2. **컬럼 단위 1:1** — INSERT N 컬럼 = N 행 / UPDATE SET N 컬럼 = N 행 / SELECT N 컬럼 = N 행 / JOIN N 개 = N 행 / WHERE N 조건 = N 행.
> 3. **조건부 분기** (IF/ELSE/NOT EXISTS/CASE WHEN) = 별도 행. **사전 검증** = 별도 행.
> 4. 모든 행에 As-Is `file:line + quote` + BE `file:line + quote` 의무. 누락 시 ✓ 금지 → ✗ 자동.
> 5. △ 행 (Q-deferred) 은 §G Q-NNN ID 인용 + 사유 명시.

| Case | E-ID | 부수효과 (1 컬럼 / 1 분기 / 1 이벤트 / 1 라이브러리) | As-Is 코드 위치 | As-Is 코드 quote | BE 코드 위치 | BE 코드 quote | 일치 |
|---|---|---|---|---|---|---|---|
| (예: iMoldInfo) | E-01 | 사전 검증 — P_MOLD_INFO EXISTS 차단 | `procedures/soPMA005.sql:590-598` | `if exists(select 1 from P_MOLD_INFO ...) begin select 'WR', ... return end` | `MoldMasterService.java:233-237` | `if (repository.existsById(id)) { errors.add(...); continue; }` | ✓ |
| (예: iMoldInfo) | E-02 | P_MOLD_INFO INSERT — CoCd | `procedures/soPMA005.sql:613+625` | `(CoCd, ...) VALUES (@CoCd, ...)` | `MoldMasterService.java:239` | `m.setCoCd(coCd);` | ✓ |
| (예: iMoldInfo) | E-04 | P_MOLD_INFO INSERT — MOLD_STATUS = 'A' (hardcode) | `procedures/soPMA005.sql:615+627` | `(... MOLD_STATUS ...) VALUES (..., 'A', ...)` | `MoldMasterService.java:242` | `m.setMoldStatus(blankOr((String) row.get("moldStatus"), STATUS_WAIT));` (STATUS_WAIT='3') | **✗** (Master-NN — 신규 등록 MOLD_STATUS 값 다름) |
| (예: iMoldInfo) | E-05 | B_ITEM_INFO 조건부 INSERT 검증 (NOT EXISTS) | `procedures/soPMA005.sql:650` | `if not exists (select 1 from B_ITEM_INFO ...)` | (BE 미구현) | (B_ITEM_INFO master 부재) | △ (Q-MasterDomain-deferred) |
| (예: UI 이벤트) | EV-001 | grid1 행 선택 변경 → grid2 자동 갱신 | `masterCodeMng.cs:373-395` | `public override void OnGridRowSelectionChanged(...) { ... grid2.Clear(); LoadGeneral(selectedAttachNo); }` | (To-Be FE 미구현 — masterCodeMng/masterCategoryMng 분리 결정 없음) | (분리 결정 사유 없음) | **✗** (임의 분리 — §K.5.6 위반) |
| (예: 표준 라이브러리) | L-001 | AttachmentManager(grid2) — wwAttachmentFile 자동 표시 | `masterCodeMng.cs:118-120` | `attachment = new AttachmentManager(grid2); attachment.DisplayColumns = new AttachmentColumn[] { ... }; attachment.Initialize();` | (To-Be 미구현) | (메인 화면 grid2 자체 부재) | **✗** (분리 결정 사유 없음) |

#### K.5.2 As-Is 외 BE 동작 (X-NNN — 사용자 결정 필요)

> As-Is 본체에 없는 BE 자체 동작. As-Is 정합 원칙상 임의 추가 = ✗ (§K.5.0.1 위반).
> X-NNN 행마다 §12 결정 후보 ID 또는 §G Q-NNN ID 인용 의무.

| X-ID | BE 동작 (As-Is 외) | BE 코드 위치 | BE 코드 quote | As-Is 검색 결과 | 사유 / 사용자 결정 ID |
|---|---|---|---|---|---|
| (예) X-1 | scrapMoldInfo 사전 검증 — 첨부파일 존재 시 폐기 차단 | `MoldMasterService.java:294-302` | `if (attachCount > 0) { errors.add(...); continue; }` | As-Is uScrap 본체에 사전 검증 없음 | (사용자 결정 ID 미인용 → §K.5.6 위반 → ✗) |
| ... | ... | ... | ... | ... | ... |

#### K.5.3 BE 미구현 일괄 판정 (BE 자체가 없는 화면 — Q-NNN deferred 묶음)

> 본 화면 전체가 BE 미구현 (예: mls 모듈 미구축) 인 경우 case 단위 그룹 판정 가능.
> 단, **§17.2 의 모든 E-NNN 행은 As-Is `file:line + quote` 보유** (BE 부분만 일괄 "(미구현)" 표기 허용).

| Case | E-NNN 범위 | BE 위치 | 일치 | Q-NNN |
|---|---|---|---|---|
| (예: sReqList) | E-01 ~ E-21 (21 행) | (BE 미구현) | △ (전체) | Q-MLS-deferred |
| ... | ... | ... | ... | ... |

#### K.5.4 판정 종합

| 판정 | 건수 | 의미 |
|---|---:|---|
| ✓ (As-Is 정합) | (N) | As-Is + BE quote 둘 다 보유 + 동등 |
| △ (사유 명시 deferred) | (M) | Q-NNN ID 인용 + 사용자 동의 |
| ✗ (누락 — 보강 필요) | (K) | Master-NN / Polish-NN 등 누락 ID 부여 |
| X-N (As-Is 외 BE) | (L) | §12 사용자 결정 ID 인용 의무 |

#### K.5.5 self-check (✓ 처리 차단 조항 — MUST)

> **(MUST)** 본 §K.5.5 가 모두 통과해야 §K.5 ✓ 인정. 한 항목이라도 미통과 = §K 미통과 → §12-4 (FE §13-5) 재개발 의무.

**A. 추출 완전성 검증 (§K.5.0.2)**:
- [ ] 모든 행의 "As-Is 코드 위치" 필드 = `file:line` 형식 (정규식 `[^/]+\.(sql|cs)(\.designer)?:L?\d+` 매치)
- [ ] 모든 행의 "As-Is 코드 quote" 필드 = 비어있지 않음 (코드 본문 한 줄 이상)
- [ ] 모든 ✓ 행의 "BE 코드 위치" 필드 = `file:line` 형식
- [ ] 모든 ✓ 행의 "BE 코드 quote" 필드 = 비어있지 않음
- [ ] 위 4 조건 중 하나라도 누락된 ✓ 행 = **0건** (있으면 해당 행 ✗ 로 자동 전환)
- [ ] §17.2-T1/T2/T3/T4 의 모든 항목이 §K.5.1 의 행과 1:1 매핑 (누락 0건)
- [ ] 모든 △ 행에 §G Q-NNN ID 인용 (예: `Q-MasterDomain-deferred` / `Q-MLS-deferred` / `Q-LoV-deferred`)

**B. 수량 동일성 검증 (§17.4 ↔ §K.5)**:
- [ ] §17.4 의 T1 (As-Is 컴포넌트 수) = §K.5.1 의 컴포넌트 행 수 동일
- [ ] §17.4 의 T2 (이벤트 수) = §K.5.1 의 이벤트 행 수 동일
- [ ] §17.4 의 T3 (표준 라이브러리 수) = §K.5.1 의 라이브러리 행 수 동일
- [ ] §17.4 의 T4 (SP case 컬럼 E-NNN 수) = §K.5.1 의 컬럼 행 수 동일

#### K.5.6 임의 변경 검증 (§K.5.0.1 — ✓ 처리 차단 조항 — MUST)

> **(MUST)** ✗ 자동 전환 패턴 — 본 §K.5.6 에 등재된 임의 변경 검출 시 즉시 ✗.

**C. 임의 변경 검출 표** (각 항목에 대해 0건 검증):

- [ ] **화면 구조 임의 분리/통합** — As-Is 1 화면이 To-Be N 화면으로 분리되었으나 §G Q-NNN 또는 §12 결정 ID 인용 없음 → ✗
- [ ] **컴포넌트 임의 제거** — As-Is 의 Grid/Btn/Txt 중 하나가 To-Be 에 매핑 안 됨 (T1 행에 To-Be 위치 빈 행) → ✗
- [ ] **이벤트 자동 연동 누락** — As-Is 의 OnGridRowSelectionChanged / OnGridCellDoubleClick 등이 To-Be 에 대응 코드 없음 (T2 행 미매핑) → ✗
- [ ] **표준 라이브러리 호출 누락** — As-Is 의 AttachmentManager / AutoFillup / RfdCustomerDialog 등이 To-Be 에 대응 처리 없음 (T3 행 미매핑) → ✗
- [ ] **상태값 hardcode 임의 변경** — As-Is `'8'` → To-Be `'9'` 같은 변경 사유 없음 → ✗
- [ ] **테이블 임의 교체** — As-Is `P_JIG_HISTORY` → To-Be `P_MOLD_INFO.CUR_SL_CD` 같은 변경 사유 없음 → ✗
- [ ] **PK 키 단순화** — As-Is 5 키 → To-Be 단일 IDENTITY 변경 사유 없음 → ✗
- [ ] **컬럼 누락** — INSERT/UPDATE 의 As-Is 컬럼 중 To-Be Entity 에 부재 (Entity 컬럼 추가 결정 없음) → ✗
- [ ] **As-Is 외 BE 동작** (§K.5.2 X-NNN) 모든 행에 §12 결정 후보 ID 또는 §G Q-NNN ID 인용 보유

**위반 사례 (참조용 — 동일 실수 차단)**:
- ✗ As-Is masterCodeMng = 통합 화면 (grid1+grid2) → To-Be masterCodeMng + masterCategoryMng popup 임의 분리 (사유 없음)
- ✗ As-Is uScrap MOLD_STATUS='8' → To-Be STATUS_SCRAPPED='9' 임의 변경
- ✗ As-Is uMoldChange 신규 행 MOLD_STATUS='8' → To-Be '3' 임의 변경
- ✗ As-Is uJigReturn P_JIG_HISTORY UPDATE → To-Be P_MOLD_INFO.CUR_SL_CD 임의 테이블 변경
- ✗ As-Is P_MOLD_ATTACH PK 4키 → To-Be 단일 attachId 임의 PK 변경

#### K.5.7 판정 규칙

- **§K.5.5 (A+B) + §K.5.6 (C) 모두 통과** → §K.5 ✓ 인정
- 한 항목이라도 미통과 → §K 미통과 → §12-4 (FE §13-5) 재개발 의무 발동
- **As-Is 가 없는 경우 (To-Be only)**: 본 §K.5 = "해당 없음" 1줄 기록 후 통과

> §K 신설로 인한 일관성 점검 (템플릿 메타):
> - 본 §K 의 표 형식 (헤더 순서, 정렬, ✓/✗ 표기) 이 §A~§J 와 일치한다.
> - §A.2 의 "코드 구현 수" 열 추가가 본 §K.1 과 의미 일관성 유지한다.
> - §G Q-NNN 집계가 §K 의 차이 사유 등재와 정합.
> - 최종 판정 표 (§A~§J + §D.4) 에 §K 가 누락되지 않게 추가됨.
> - §K.5 (SP 부수효과) 가 분석리포트 §17 의 입력에 의존 — As-Is 가 있는 경우 §17 작성 없이는 §K.5 검증 불가.

---

## 최종 판정

| 절 | 결과 (✓/✗) |
|---|---|
| §A 구조 동일성 + 누락 |  |
| §B 명명 규칙 |  |
| §C 5축 정합 |  |
| §D 결정성 |  |
| §E 가이드 중복 제거 + drift |  |
| §F 삭제 참조 |  |
| **§H 셀 본문 결정성** (R-12 신설) |  |
| **§I 의미 일치도** (R-12 신설) |  |
| **§J SOP 30 Step 실행 검증** (R-13 신설) |  |
| **§K 코드 구현 정합** (신설 — 개발 완료 게이트) |  |
| **§D.4 R-14 Auto Manifest 검증 매트릭스** (R-14 신설 — 12 행) |  |

**§A / §B / §C / §D / §E / §F / §H / §I / §J + §D.4 모두 ✓** → **설계 완료**.
**§K 추가 ✓** → **개발 완료** (BE 가이드 §12-3 / FE 가이드 §13-4 통과 인정).
**§K 가 ✗ 인 경우** → BE §12-4 / FE §13-5 의 재개발 의무 사이클 발동. 모든 ✗ 항목이 ✓ 가 될 때까지 반복.

**(MUST — R-14)** Agent 가 manifest 9 파일을 생성하지 않는다 (00 §0.2.0 9 원칙). 외부 deterministic Auto Manifest Runner 가 생성한 결과를 인용만 한다. R14-Step0 (분석.template §-1) ✓ + §D.4 12 행 모두 ✓ 일 때만 R-14 통과.
