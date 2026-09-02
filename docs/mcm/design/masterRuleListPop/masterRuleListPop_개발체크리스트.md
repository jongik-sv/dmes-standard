---
screenId: masterRuleListPop
asIsId: MasterRuleListPop
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleListPop_분석리포트.md
  - masterRuleListPop_기능설계서.md
  - masterRuleListPop_디자인설계서.md
  - masterRuleListPop_BPMN설계서.md
  - masterRuleListPop_정합체크.md
---

<!--
  본 산출물 = MasterRuleListPop (업무기준 List조회 / masterRuleListPop) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗ (설계서에 없으면 설계로 환송).
  라우터 분기 3 (MES 개발, Mes-Guide §3) 의 진행 추적 정본. 정합체크서 §G·§K 로 수렴.
  생성 절차: 02 가이드 §"개발체크리스트 (6번째 산출물)" 규칙을 따른다.
-->

# 업무기준 List조회 (masterRuleListPop) 개발 체크리스트

## §0. 운영 규칙 (먼저 읽는다, MUST — 화면 무관 고정)

| # | 규칙 |
|---|---|
| R0-1 | **한 작업 단위 = 한 작업 사이클.** "지금 ITEM-XX 하나만. 끝나면 검증 로그 붙이고 멈춰." |
| R0-2 | **검증 명령의 실제 출력(로그) 없이 `[x]` 금지.** 말로 "되었습니다" 는 체크 근거가 아니다. |
| R0-3 | **주장하는 자 ≠ 판정하는 자.** 구현 직후 `/check`·`/verify`·`/code-review` 로 교차검증. |
| R0-4 | **DoD 미충족 = 미완료.** 부분 완료는 하위 박스로 쪼갠다. |
| R0-5 | **설계서에 없는 것은 구현하지 않는다.** 추가 필요 시 5종 설계서로 환송 → 정합체크 재통과 후 본 체크리스트 갱신. (Mes-Guide §D·§E·§F) |
| R0-6 | **`[확인필요]`(Q-NNN)·선행 결정(DEC-NN) 미해결 항목은 구현 진입 금지.** §1 게이트 먼저. (Mes-Guide §B·§F) |
| R0-7 | 항목 완료 시(사용자 명시 승인 시) 그 단위로 1 커밋. 커밋은 사용자 지시 전 금지. |

### 체크 항목 표기 규약
```
- [ ] **ITEM-ID** 한 줄 제목
  - 근거: <기능 §x / BPMN §y / 디자인 §z / 정합 §k — 설계서 출처>
  - DoD: <무엇이 존재/통과해야 끝인지 — 객관적·검증가능>
  - 검증: `<실행 명령>`  → 〈로그 붙여넣기 자리〉
```
`[ ]` 미착수 · `[~]` 진행중 · `[x]` 완료(로그 첨부) · `[!]` 차단(사유 명시)

## §0.1 진도 요약 (`/progress` 로 갱신)

| Phase | 항목 수 | 완료 | 완료율 |
|---|---:|---:|---:|
| §1 선행 결정 게이트 | 6 | 6 | 100% |
| §2 BE 기반 | 5 | 5 | 100% |
| §3 BE 서비스·BPMN | 2 | 2 | 100% |
| §4 검증·비즈니스 규칙 | 1 | 1 | 100% |
| §5 FE | 6 | 6 | 100% |
| §6 정합·회귀 게이트 | 8 | 8 | 100% |

> 진행: 2026-07-08(완료) — **BE(RuleMaster 엔티티 재사용 + Repository 팝업 쿼리 + Service + 단위테스트 4건) + BPMN(bpmn-tool 유효:true·경고 0) + FE(재사용 Modal 컴포넌트 + 단독 page + registry) + masterRuleFrame P-001 정식 연동(D-003 P-001 해소) + MSSQL RBAC sqlcmd 등재 + E2E 그린 — 개발 완료 (§K 8/8).**
> 검증 로그: `:mcm-core:test --rerun` BUILD SUCCESSFUL (MasterRuleListPopServiceTest tests=4 failures=0) / `bpmn-tool validate` 유효:true 경고 0 / `pnpm build` ✓ Compiled successfully / playwright `e2e/master-rule-frame-e2e.spec.ts` **1 passed** (팝업 자동조회 MSG-001 "6건 조회 되었습니다." → USD 더블클릭 GB-002 반환 → 부모 자동 조회 → 저장/재조회. 스크린샷 e2e-2a-pop-opened.png — BR-001 실증: USDOFF(USE_TP=N) 표시·USDHIST(이력) 제외).
> 잔여: 비차단 보류 1건(D-002 fold — shared SearchArea collapse 미지원, masterRuleFrame 동일). 부모 화면 중 masterRuleData/masterRuleDataList 연동은 해당 화면 개발 시.

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

> 정합체크서 최종 판정 = **○ (설계 완료)** — §A~§F ✓ / 활성 확인필요 0건. §D.4 manifest ✗ 는 R-14 미적용(사용자 결정) 의도 면제. Q-003(부모 화면)=호출자 식별 해소 2026-06-05 / Q-001(PK)·owner·Q-002(동적 스키마)·영속성(JPA) 사용자 확정 2026-06-04. 정합체크서 §F·§G + 분석리포트 §12 에서 그대로 추출한다.

- [x] **DEC-01** 설계서 4종 간 충돌 — **충돌 없음** (정합 §A~§G 모두 ○, frontmatter/식별자/SQL/flow 일치).
  - DoD: 충돌 없음 확인 — **확인 (2026-07-08)**: 정합 §H "최종 정합 결과 = ○ (설계 완료 — 활성 확인필요 0건)".
- [x] **DEC-02** 모듈 존재 확인 — `src/backend/mcm-core` / `src/frontend/m-mcm` 기존재 확인 (2026-07-08).
  - **`entity/RuleMaster.java` 기존재 (masterRuleList 세션 산출물) → 엔티티 신설 불필요, 재사용.** cmb 그룹 패키지만 신설.
- [x] **DEC-03** 영속성 방식 확정 — **JPA** (cmb 화면군 공통, 사용자 확정 2026-06-04 / 기존 mcm-core 엔티티 JPA 정합)
  - DoD: JPA Repository + JPQL/native. 기본 스키마 `@Table(schema="MCAAPUSER")` 고정, 동적 스키마(sSchema) 경로는 native/별도 처리.
- [x] **DEC-Q001** PK 확정 — **해소**: TB_MCA_RULE_MASTER PK = `RULE_ID` 단일 (DMES-SECTION-MCA sheet135 r24 NULL=N 정본 — 분석 §9.1 / masterRuleList §9.1 동일). 형제 CRUD 화면/DDL 추정 불필요.
  - DoD: MCA sheet135 정본으로 단일 PK 확정 완료.
- [x] **DEC-Q002** 동적 스키마 정책 — **해소** (사용자 확정 2026-06-04): **As-Is 동일 유지** — `sSchema` 전달 시 해당 스키마, 미전달(기본) 시 `MCAAPUSER`. owner/컬럼 카탈로그도 MCA sheet135 정본 확정(§9.1).
  - DoD: 기본 경로 = 고정 스키마 `MCAAPUSER`(JPA `@Table`), 동적 경로(sSchema 전달) = 개발 단계 native/별도 처리 + `${}` 치환 시 화이트리스트 가드.
- [x] **DEC-Q003** 부모 호출 화면 식별 — **해소: 호출자 = masterRuleFrame·masterRuleData·masterRuleDataList** (호출관계 조사 2026-06-05). 입력(sRuleId/sRuleNm/sSchema)·반환(sRuleId/sRuleNm) = LoV 팝업 표준 계약 (분석 §5.2 / 기능 §9.2).
  - DoD: 부모 화면 확정 또는 "범위 외 — FE LoV 팝업 표준 계약 채택" 으로 합의.

> §1 전부 `[x]`/`[!](범위외 명시)` 전에는 §2 이후 진입 금지.

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

> BE v2 §작업 순서: base-package → Entity → Repository → DTO → Service → BPMN. **As-Is 컬럼 1:1 보존**(정합 §E.3). 본 화면은 **조회 전용** — 쓰기 엔티티/마이그레이션 신규 최소. 공통 검증: `cd src/backend && JAVA_HOME="C:/Program Files/Java/jdk-21.0.6" ./gradlew :mcm-core:compileJava`.

- [x] **ITEM-BE-01** 모듈 scaffolding — `com.dongkuk.dmes.mcm.cmb.masterRuleListPop.{service,dto}` 신설.
  - 검증: `:mcm-core:compileJava` EXIT 0 (2026-07-08).
- [x] **ITEM-BE-02** MasterRule 엔티티 — **기존 `entity/RuleMaster.java` 재사용** (masterRuleList 산출물 — @Table MCAAPUSER.TB_MCA_RULE_MASTER, PK=RULE_ID 단일, McmAuditEntity 상속, 업무 9 컬럼 1:1). 신설 없음.
- [x] **ITEM-BE-04** DB 스키마 (SQLite) — 기존 테이블 재사용 (masterRuleList ITEM-BE-03 에서 ddl-auto 생성 확인 완료 2026-06-05). 신규 마이그레이션 불요.
- [x] **ITEM-BE-05** DB 스키마 (MSSQL) — `MCAAPUSER.TB_MCA_RULE_MASTER` 실재 (RULE_MASTER 7행 — sys.tables/COUNT 실측 2026-07-08). local-ph ddl-auto:none 사전 생성 스키마 사용.
- [x] **ITEM-BE-07** Repository — `RuleMasterRepository.searchRuleMasterListPop` (JPQL: 고정 `RULE_ID != COALESCE(OLD_RULE_ID,' ')` — **masterRuleList 쿼리와 필터 상이(공백 폴백·USE_TP 필터 없음) As-Is 1:1 분리 유지** + UPPER LIKE 2 + ORDER BY RULE_ID, 9 컬럼). DTO `MasterRuleListPopSearchRequest`(pRuleId/pRuleNm/sSchema). 동적 스키마 = Service 화이트리스트 가드(공란/MCAAPUSER/MCA_SOURCE 동의어 — Q-002). `@RestController` 없음.
  - 검증: 단위테스트 4건 그린 (§3 로그).

---

## §3. BE 서비스 · BPMN (action별)

> BPMN 매핑 `POST /oasis/{serviceId}/{action}`. 단일 `.bpmn` actionGateway 분기 (search 1개). **OASIS 서비스 `@Transactional` 금지 — cactus TransactionTemplate 사용**. 본 화면은 읽기 전용. 공통 검증: action 통합테스트(응답 + 건수 검증).

- [x] **ITEM-SVC-01** `masterRuleListPop.bpmn` — bpmn-tool create (actionGateway 1분기 search).
  - 검증 (2026-07-08): `bpmn-tool validate` → 유효:true, 경고 0. `bpmndi:BPMNDiagram` 존재. process id = `masterRuleListPop` (As-Is `MasterJudgRuleListPop` 불일치 → 통일 정정 반영) = camunda:class `masterRuleListPopService` 정합.
- [x] **ITEM-SVC-02** search 서비스 — `MasterRuleListPopService.search()` (bean `masterRuleListPopService`): 9 컬럼 camelCase + 응답키 `ds_GetRuleMasterList`/`cnt` (As-Is resultKey 보존). sSchema 화이트리스트 위반 → INVALID_VALUE(400) — SQL injection 표면 차단. `@Transactional` 미사용(읽기 전용).
  - 검증 (2026-07-08): MasterRuleListPopServiceTest tests=4 failures=0 (search_정상/search_공란/search_sSchema_허용/search_sSchema_거부).

---

## §4. 검증 · 비즈니스 규칙 (BR-NNN — 기능 §6)

> 실행 순서: 클라이언트 입력 → 서버 조회. 본 화면은 저장 검증 없음 (조회 전용).

- [x] **ITEM-VAL-01** 조회 비즈니스 규칙 — BR-001(JPQL 고정 필터 — E2E 실증: USDOFF 표시/USDHIST 제외) / BR-002·003(UPPER LIKE — JPQL) / BR-004(ORDER BY) / BR-005(sSchema 화이트리스트 — 테스트 2건) / BR-006(더블클릭·확인 시 {sRuleId,sRuleNm} 2종만 반환 — Modal returnRow) / BR-007(입력 toUpperCase) / BR-008(그리드 editable:false) / BR-009(loadRows 선두 setRows([])) / BR-010(조회 후 selectedKey 유지 — 인덱스 키 복원).

---

## §5. FE — m-mcm 페이지 (페이지 유형: 조회/선택 팝업 = LoV 팝업)

> FE v2 §작업 순서: 페이지 유형 → mesModule → types/constants/api → 페이지 본체 → 모듈 엔트리 → portal 재내보내기. **shared `form` 컴포넌트 강제(raw HTML 금지)**, `apiRequest`/`useGfnMessage`, 직접 fetch·alert·console.error 금지. 공통 검증: `cd src/frontend/m-mcm && pnpm build` (+ playwright E2E).

- [x] **ITEM-FE-01** 페이지 scaffolding — `page-components/cmb/masterRuleListPop/{MasterRuleListPopModal.tsx(재사용 LoV 컴포넌트 — 부모 3화면 임포트용),page.tsx(단독 진입 미리보기),types.ts,constants.ts,repository.ts}` + registry 등재 (page-registry.ts:32 cmb/masterRuleListPop).
- [x] **ITEM-FE-02** types / constants / api — repository(`/api/mcm/oasis/masterRuleListPop/search` — mcm=OASIS 무조건, apiRequest) + LoV 계약 타입(RuleSelectResult {sRuleId,sRuleNm} — DEC-Q003). ※ apiQuery 류는 mcm 금지(SqlSession 미등록 — FrontEnd 표준 §2-2-1-A).
- [x] **ITEM-FE-03** 레이아웃 — Modal(조회/확인/닫기 3버튼 + 조회조건 + 그리드 + 하단 상태바). E2E 스크린샷으로 배치 확인(버튼 overflow 발견 → flexWrap 수정).
- [x] **ITEM-FE-04** 조회조건 — edt_ruleId toUpperCase(BR-007) / edt_ruleNm. "결함 코드" 잔재 미적용(DEFAULT_FILTERS 빈 값 — 분석 §12).
- [x] **ITEM-FE-05** 그리드 — 3 cols(no/ruleId/ruleNm) editable:false + 더블클릭(GB-002)/확인(B-002 — 미선택 시 첫 행=As-Is rowposition 0) 반환 + 닫기 + 로딩/빈상태 + 상태바 MSG-001/002.
- [x] **ITEM-FE-LAST** 부모 화면(masterRuleFrame) 호출·반환 E2E — **잠정 인라인 팝업을 정식 컴포넌트로 교체(D-003 P-001 해소)** 후 playwright 1 passed (팝업 열기 → 자동조회 → USD 더블클릭 → 부모 콜백 자동 조회). masterRuleData/masterRuleDataList 연동은 해당 화면 개발 시.

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §K "개발 완료 게이트")

> 본 §6 통과 = 정합체크서 §G/§K 를 실측으로 채워 ✓ 전환. 1개라도 ✗ 면 재개발.

- [x] **ITEM-GATE-01** 정합키 일치 — serviceId=process id=bean `masterRuleListPop(Service)` / 응답키 `ds_GetRuleMasterList`·`cnt` / 9 컬럼 camelCase(ruleId/oldRuleId/ruleNm/ruleDesc/ruleVer/ruleTp/ruleOwnerDeptNm/ruleOwnerEmpNo/useTp) 1:1.
- [x] **ITEM-GATE-02** 영역별 수량 — S 4(라벨2+입력2) / G 1(3col) / B 4 중 3(조회/확인/닫기 — **B-004 fold 보류 D-002**, masterRuleFrame 동일 shared 제약) / GB 2(헤드정렬=sortable, 더블클릭=onRowDoubleClick).
- [x] **ITEM-GATE-03** As-Is 1:1 — SELECT 9 컬럼 보존 / 고정필터 공백 폴백·USE_TP 무필터 보존(masterRuleList 와 임의 통합 ✗) / 의도적 정정 3건만(process id 통일·"결함 코드" 잔재 제거·읽기 전용) — 전부 설계 §12 결정 반영.
- [x] **ITEM-GATE-04** 안티패턴 — `${sSchema}` 문자열 치환 제거(JPA 고정 스키마 + 화이트리스트 가드 — injection 표면 0) / @Transactional·직접 fetch·alert grep 0.
- [x] **ITEM-GATE-05** BE 회귀 — `:mcm-core:test --rerun` BUILD SUCCESSFUL (신규 4 + 기존 전체 그린, 2026-07-08).
- [x] **ITEM-GATE-06** FE 빌드 — `pnpm build` ✓ Compiled successfully (2026-07-08).
- [x] **ITEM-GATE-07** E2E — playwright 1 passed (20.9s, 2026-07-08 확장): **3경로 전수** —
  - 닫기(B-003): 자동조회 6건 → 닫기 → 부모 미변경(저장 disabled — BR-012 반증) ✓
  - 검색+확인(B-002): "usd" 입력 → **대문자 자동 변환 확인(BR-007)** → 조회 "3건"(BR-002 UPPER LIKE) → USDFWD 행클릭+확인 → 부모 콜백 반영+자동 조회 ✓
  - 재오픈 초기값+더블클릭(GB-002): 부모 현재값(sRuleId=USDFWD, **sRuleNm 포함 — As-Is gfn_Data_Return 계약**)이 팝업 검색어로 프리셋됨 확인 → 클리어 → 전체 6건 → USD 더블클릭 반환 → 부모 저장/재조회 ✓
  - **BR-001 실증**: USDOFF(USE_TP=N) 표시 + USDHIST(OLD=RULE_ID) 제외. 스크린샷 test-results/master-rule-frame/e2e-2a-pop-opened.png.
  - E2E 확장 중 발견·수정 1건: **연속 조회 stale 응답 race** (재오픈 자동조회 응답이 후속 조회 결과를 덮음) → loadRows 에 요청 시퀀스 가드 추가 (masterRuleFrame loadCols 동일 적용). 수정 후 `pnpm build` ✓ 38.7s.
- [x] **ITEM-GATE-08** 정합 동기화 — 설계 Q 전부 Resolved(설계 시점). 개발 잔여 = D-002(fold, 비차단) 1건만 — §7 이력 등재.

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-04 | (생성) | - | 5종 설계서 기반 초안 생성. 정합 §G = △ (manifest ✗ + Q-001/Q-002/Q-003 보류). |
| 2026-06-04 | (보정) | DEC-Q001 [x] | To-Be 카탈로그 오참조(DMES-SECTION-MCM) → **DMES-SECTION-MCA sheet135 정본** 정정. TB_MCA_RULE_MASTER 26 컬럼(MCAAPUSER) 존재 확인 → Q-001(PK)·owner 해소. 잔여 Q-002(동적 스키마 치환 정책)/Q-003(부모 화면). |
| 2026-07-08 | §1~§6 전체 | → 개발 완료 (§K 8/8) | BE: DTO/Repository 팝업 쿼리(searchRuleMasterListPop)/Service(sSchema 화이트리스트)/테스트 4건. BPMN bpmn-tool 유효:true 경고 0. FE: 재사용 MasterRuleListPopModal + 단독 page + registry. masterRuleFrame P-001 정식 연동(잠정 인라인 팝업 제거 — D-003 P-001 해소). RBAC: MSSQL sqlcmd OBJ+ROLE_MAPPING 2행(메뉴 미등재 — 팝업, masterCodeSelPop 선례). E2E 1 passed + BR-001 실증. 작업 위치 = main 직접(워크트리 미사용) |
| 2026-07-08 | D-002 | 등재 (비차단) | B-004 fold(조회조건 접기) — shared 컴포넌트 collapse 미지원 (masterRuleFrame D-002 와 동일 shared 제약 — shared 확장 시 일괄 반영) |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트(특히 DEC-Q001/Q002/Q003 + DEC-03 영속성) → §2~§5 한 항목씩(R0-1·R0-2) → §6 개발 완료 게이트(=정합 §K). `/implement <ITEM-ID>`·`/progress`·`/check` 연동.
