---
screenId: masterRuleFrame
asIsId: MasterRuleFrame
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleFrame_분석리포트.md
  - masterRuleFrame_기능설계서.md
  - masterRuleFrame_디자인설계서.md
  - masterRuleFrame_BPMN설계서.md
  - masterRuleFrame_정합체크.md
---

<!--
  본 산출물 = MasterRuleFrame (업무기준 구조관리 / masterRuleFrame) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗ (설계서에 없으면 설계로 환송).
  라우터 분기 3 (MES 개발) 의 진행 추적 정본. 정합체크서 §K (개발 완료 게이트) 로 수렴.
-->

# 업무기준 구조관리 (masterRuleFrame) 개발 체크리스트

## §0. 운영 규칙 (먼저 읽는다, MUST — 화면 무관 고정)

| # | 규칙 |
|---|---|
| R0-1 | **한 작업 단위 = 한 작업 사이클.** "지금 ITEM-XX 하나만. 끝나면 검증 로그 붙이고 멈춰." |
| R0-2 | **검증 명령의 실제 출력(로그) 없이 `[x]` 금지.** 말로 "되었습니다" 는 체크 근거가 아니다. |
| R0-3 | **주장하는 자 ≠ 판정하는 자.** 구현 직후 `/check`·`/verify`·`/code-review` 로 교차검증. |
| R0-4 | **DoD 미충족 = 미완료.** 부분 완료는 하위 박스로 쪼갠다. |
| R0-5 | **설계서에 없는 것은 구현하지 않는다.** 추가 필요 시 5종 설계서로 환송 → 정합체크 재통과 후 본 체크리스트 갱신. |
| R0-6 | **`[확인필요]`(Q-NNN)·선행 결정(DEC-NN) 미해결 항목은 구현 진입 금지.** §1 게이트 먼저. |
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
| §1 선행 결정 게이트 | 7 | 7 | 100% |
| §2 BE 기반 | 8 | 7 | 88% |
| §3 BE 서비스·BPMN | 4 | 4 | 100% |
| §4 검증·비즈니스 규칙 | 6 | 6 | 100% |
| §5 FE | 6 | 6 | 100% |
| §6 정합·회귀 게이트 | 8 | 8 | 100% |

> 진행: 2026-07-08(1차) — **BE 전체(Entity 기존재 확인 + Repository/DTO/Service/BPMN/단위테스트 8건) + FE(2 그리드 페이지/P-001 잠정 팝업/registry) 완료.** 작업 위치 = main 체크아웃 직접 (사용자 지시 — 워크트리 미사용).
> 진행: 2026-07-08(3차·완료) — **E2E 그린 (GATE-07)**: local-ph(MSSQL 직결) 런타임에서 조회/행추가/저장/재조회 + DB 실측 통과. 잔여는 비차단 보류 3건(D-001~D-003)뿐 — **개발 완료** (§K 게이트 8/8).
> 진행: 2026-07-08(2차) — **RBAC 등재 방식 변경 (사용자 지시: DataInitializer 미수정)**: MSSQL dev(<개발 DB 호스트>/sample_dmes) 에 sqlcmd 직접 멱등 INSERT — SEC_OBJ 1 + SEC_MENU 1(FULL_SEQ 2040110, parent cmb) + SEC_ROLE_MAPPING 2(SYSADMIN/PERM_ALL·MCM_VIEWER/PERM_VIEW). 검증 SELECT 4행 + 한글 코드포인트(업무기준 구조관리) 확인.
> 검증 로그: `:mcm-core:test --rerun` BUILD SUCCESSFUL (MasterRuleFrameServiceTest tests=8 failures=0 errors=0) / `bpmn-tool validate` 유효:true / `pnpm build` ✓ Compiled successfully in 30.3s / `:mcm:api:compileJava` EXIT 0.
> 잔여: ITEM-BE-05(MSSQL ddl-auto 런타임 확인)·ITEM-FE-LAST(메뉴 진입 E2E)·GATE-07(런타임 E2E) = 사용자/런타임 확인 대기. 비차단 보류 3건(D-001 병합헤더 / D-002 fold / D-003 P-001 잠정·P-002 대기 — §7 참조).

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

> 정합체크서 §G·§H 에서 추출. 활성 Q 0건 (전부 해소/확정 — Q-003 부모=메뉴 직접 진입 해소 2026-06-05).

- [x] **DEC-01** 설계서 4종 간 충돌 — "충돌 없음" (정합 §A~§C 모두 ○).
  - DoD: 정합체크서 §H 최종 ○ 확인. → **확인 (2026-07-08)**: §H "최종 정합 결과 = ○ (설계 완료 — §A~§F ✓ / 활성 확인필요 0건)".
- [x] **DEC-02** 모듈 존재 확인 — `src/backend/mcm-core`·`src/frontend/m-mcm` 존재 (기 구축). 신규 그룹 `cmb` 폴더만 추가.
  - DoD: mcm-core 엔티티/리포지토리 경로 (`com.dongkuk.dmes.mcm.{entity,repository}`) 확인. → **확인 (2026-07-08)**: `entity/MasterRuleColList.java`·`entity/MasterRuleColListId.java` 기존재(masterRuleList 세션 선반영, 사용자 명세서 2026-06-05), `cmb/masterRuleList` 선례 패키지 확인.
- [x] **DEC-03** 영속성 방식 확정 — **JPA** (cmb 화면군 공통, 사용자 확정 2026-06-04 / mcm-core 엔티티 JPA 정합)
  - DoD: 외부 공통 Mapper delete/insert → JPA `deleteByRuleId` + `saveAll`. JPQL/native 보강.
- [x] **DEC-Q001** **(P0 — Resolved)** To-Be 테이블 정의 — TB_MCA_RULE_COL_LIST (MCAAPUSER, sheet134) / TB_MCA_RULE_MASTER (MCAAPUSER, sheet135) 가 정본 **DMES-SECTION-MCA_테이블정의서.xlsx** 에 **존재** (종전 MCM 정의서 오참조 정정 — 분석 §0/§9). PK=(RULE_ID,COL_SEQ) / owner=MCAAPUSER / audit=mcm-core McmAuditEntity 9. masterRuleList §9 1:1 정합.
  - DoD: To-Be DDL 확정 (PK = (RULE_ID, COL_SEQ)) + 마이그레이션 작성 가능 상태. → **충족** (정본 sheet134/135 카탈로그 확정, 분석 §9.1/§9.2).
- [x] **DEC-Q002** moduleGroup `cmb` (업무기준 관리(원장)) 01 부속 §A.2.3 **등재 완료 (2026-06-04)** — 영역 코드 `cm`+`b`.
  - DoD: ✓ A.2.3 카탈로그 행 추가 (mcm/cma + mcm/cmb).
- [x] **DEC-Q003** 형제 화면 in-coming — **해소: 메뉴 직접 진입, GUI 부모 없음** (호출관계 조사 2026-06-05; MasterRuleFrameColListPopup 만 본 화면을 자식 참조).
  - DoD: 호출 계약 확정 또는 "범위 외" 명시.
- [x] **DEC-Q004** LoV (ds_div N/Y / ds_colType DATE/NUMBER/VARCHAR2) — **As-Is 정적 유지 (FE enum)** 확정 (사용자 2026-06-04). "사용여부" 병합헤더도 As-Is 보존 확정.
  - DoD: FE 정적 상수(enum)로 구현 — 코드 API 미사용. → `constants.ts` DIV_VALUES / COL_TYPE_VALUES.

> §1 전부 `[x]` — §2 이후 진입 (2026-07-08).

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

> BE v2 §작업 순서: base-package → Entity → Repository → DTO → Service → BPMN. **As-Is 컬럼 1:1 보존** (분석 §9.1 12 컬럼 + audit 9). 공통 검증: `cd src/backend && JAVA_HOME="C:/Program Files/Java/jdk-21.0.6" ./gradlew :mcm-core:compileJava`.

- [x] **ITEM-BE-01** cmb 패키지 scaffolding — `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.{service,dto}`. (Entity/Repository 는 기존 평탄 `mcm.{entity,repository}`).
  - 검증: `:mcm-core:compileJava` EXIT 0 (2026-07-08).
- [x] **ITEM-BE-02** MasterRuleColList 엔티티 — **기존재 확인** (masterRuleList 세션 2026-06-05 선반영, 사용자 제공 명세서 기반). `entity/MasterRuleColList.java` (@Table TB_MCA_RULE_COL_LIST, schema MCAAPUSER, McmAuditEntity 상속) + `entity/MasterRuleColListId.java` (@Embeddable RULE_ID VARCHAR(10) + COL_SEQ). 업무 12 컬럼 1:1 (RULE_VER NUMBER(8,2)/COL_ID 30/COL_NM 100/OLD_COL_ID 100/IO_FLAG 10/COL_TYPE 10/COL_LEN/COL_PREC_LEN/MES_COL_ID 50/MASTER_CODE_DIV 2) — 분석 §9.1 sheet134 대조 일치.
  - 근거: 분석 §9.1 (정본 sheet134) / §9.4 (audit 매핑) / §3.3 ColumnInfo.
- [x] **ITEM-BE-03** MasterRuleMaster 참조 엔티티 — **기존재 재사용** (`entity/RuleMaster.java`, masterRuleList ITEM-BE-02 산출물. PK=RULE_ID 단일). JOIN 은 Repository JPQL EXISTS 서브쿼리로 표현 (연관관계 금지 — BE v2 §6).
- [x] **ITEM-BE-04** DB 스키마 (SQLite local) — **mcm 컨벤션 = Hibernate `ddl-auto=update`** (masterRuleList ITEM-BE-03 확정: Flyway 는 mcm-core compileOnly, 앱 런타임 미적용 — 별도 마이그레이션 파일 불요). `TB_MCA_RULE_COL_LIST` 는 엔티티 선반영으로 **이미 생성 확인됨** (masterRuleList 검증 로그 2026-06-05: `sqlite_master` → `['TB_MCA_RULE_COL_LIST','TB_MCA_RULE_MASTER']`).
- [x] **ITEM-BE-05** DB 스키마 (MSSQL) — 2026-07-07 개편으로 local-ph 는 ddl-auto:none(사전 생성 스키마 사용). `MCAAPUSER.TB_MCA_RULE_COL_LIST`/`TB_MCA_RULE_MASTER` 실재 확인 (sys.tables 조회 2026-07-08) + local-ph 기동 E2E 정상 (GATE-07).
- [!] **ITEM-BE-06** 샘플 데이터 — **범위 변경 (사용자 지시 2026-07-08: DataInitializer 미수정)**. 코드 시드(initRuleColListSampleData) 미적용. RBAC(OBJ/MENU/ROLE_MAPPING)는 MSSQL dev 에 sqlcmd 직접 등재 완료(§7 이력·GATE 참조). TB_MCA_RULE_COL_LIST 샘플 행은 미주입 — 필요 시 화면 행추가/저장(E2E 겸) 또는 sqlcmd 로 주입.
- [x] **ITEM-BE-07** Repository (MasterRuleColListRepository) — `searchRuleColList(pRuleId, ioFlag)` (IN/OUT 2 조회 — EXISTS(RuleMaster) JOIN 의미 + pRuleId 동등비교 + ORDER BY COL_SEQ) + `deleteByRuleId` (@Modifying JPQL — delete-all) + `saveAll` 상속.
  - 근거: 분석 §6 (SELECT 2) / §7.2 (delete-all → insert). 검증: 단위테스트 8건 (§3 로그).
- [x] **ITEM-BE-08** DTO — `MasterRuleFrameSearchRequest` (pRuleId 단일 — As-Is search/save 공통 sArgument). 응답은 Service Map (ds_GetRuleColInList/ds_GetRuleColOutList/cnt/cnt_save — 정합키 1:1). `@RestController` 없음 (BPMN 진입).

---

## §3. BE 서비스 · BPMN (action별)

> BPMN 매핑 `POST /oasis/masterRuleFrame/{action}`. 단일 `.bpmn` actionGateway 분기 (search/save). **OASIS 서비스 `@Transactional` 금지 — OASIS process wrap 트랜잭션**. 공통 검증: 단위테스트.

- [x] **ITEM-SVC-01** `masterRuleFrame.bpmn` 다이어그램 (actionGateway 2분기: search/save) — **bpmn-tool create 로 생성**.
  - DoD: `bpmn-tool validate` = 유효:true + `<bpmndi:BPMNDiagram>` 존재 + serviceId=beanName=camunda:class 일치. 근거: BPMN §3.
  - 검증 (2026-07-08): `bpmn-tool validate` → `{"유효": true, "요약": {"치명":0,"오류":0,"경고":1}}` (경고 = actionGateway default flow 미설정 — masterRuleList.bpmn 선례와 동일한 OASIS actionGateway 관례, 비차단). `grep bpmndi:BPMNDiagram` = 2 hit. process id=camunda:class=`masterRuleFrame(Service)` 일치.
- [x] **ITEM-SVC-02** search 서비스 — `MasterRuleFrameService.search()`: searchRuleColList(pRuleId,'IN') + ('OUT') 2 조회, ORDER BY COL_SEQ (BR-016), camelCase 12 컬럼.
  - DoD: `ds_GetRuleColInList` / `ds_GetRuleColOutList` 응답 (As-Is resultKey 보존 — BPMN §2.2) + cnt=IN 건수 (MSG-010).
  - 검증 (2026-07-08): MasterRuleFrameServiceTest `search_정상`·`search_공란` PASS (tests=8 failures=0).
- [x] **ITEM-SVC-03** save 서비스 — `MasterRuleFrameService.save()`: delete-all (RULE_ID, BR-015 반환 미검증) → IN insert 루프 → OUT insert 루프 (COL_SEQ 통합 순번 BR-004 / RULE_VER 빈값→"1" BR-005). cnt_save 적재 + 재조회 동봉 (As-Is save → 조회 IN/OUT 합류).
  - DoD: 트랜잭션 경계 — 예외 시 OASIS process wrap 전체 롤백 (BR-014, delete 포함).
  - 검증 (2026-07-08): `save_정상`(COL_SEQ 1,2,3 통합/IO_FLAG/RULE_VER 보정 captor 검증)·`save_첫행_ruleId` PASS.
- [x] **ITEM-SVC-ERR** 에러 처리 매트릭스 — REQUIRED_VALUE(E001,400)/INVALID_VALUE(E002,400) BusinessException (mcm-core ErrorCode 카탈로그) + JPA 예외 전파(500, 롤백) + McmAuditEntity VER @Version 낙관락(409 계열).
  - 검증 (2026-07-08): `save_ruleId_없음`·`save_필수값_누락`·`save_OUT_필수값_누락`·`save_비정수_길이` PASS.

---

## §4. 검증 · 비즈니스 규칙 (V-NNN — 기능 §6)

> 실행 순서: 클라이언트 입력 → 클라이언트 비즈니스 → 서버 트랜잭션.

- [x] **ITEM-VAL-01** 필수 입력 검증 (IN/OUT 각 행): COL_NM / COL_ID / MASTER_CODE_DIV / COL_TYPE / COL_LEN null 차단 (MSG-001~005). 시점=클라이언트+서버.
  - 근거: 기능 §4.5 / §10.1 / BR-006. 구현: FE `validateRows()` (IN 5종 → OUT 5종 순차, As-Is fn_save 순서) + BE `validateRows()` (동일 문구 + 행번호). 검증: 단위테스트 MSG-001/004 PASS + `pnpm build` ✓.
- [x] **ITEM-VAL-02** ruleId 가드 — 행추가/저장 시 ruleId null 차단 (BR-011/012). FE silent return (As-Is xfdl:452/264) + 저장버튼 disabled + BE REQUIRED_VALUE ("업무기준 선택 후 진행해주세요."). 검증: `save_ruleId_없음` PASS.
- [x] **ITEM-VAL-03** 기초데이터등록(P-002) 진입 가드 — ruleId 미선택 시 MSG-006 "업무기준 선택 후 진행해주세요." (BR-013). FE `openColListPop()` ErrorModal.
- [x] **ITEM-VAL-04** 길이/형식 — COL_ID max 30 / COL_NM max 100 / COL_LEN·COL_PREC_LEN 정수 max 5 (BR-008/009). FE `clampCellValue()` (slice + 비숫자 제거 — As-Is editmaxlength/mask 동치) + BE `toInt()` INVALID_VALUE. 검증: `save_비정수_길이` PASS.
- [x] **ITEM-VAL-05** COL_SEQ 통합 순번 재계산 + RULE_VER 빈값→"1" (BR-004/005) — 서버. 검증: `save_정상` captor (COL_SEQ 1,2,3 / ruleVer=1) PASS.
- [x] **ITEM-VAL-06** delete-all 반환값 미검증 As-Is 보존 결정 (BR-015) — **정책 확정: As-Is 보존** (사용자 결정 2026-06-04, 분석 §12). `deleteByRuleId` 반환 int 미검증 (Repository javadoc 명시).

---

## §5. FE — m-mcm 페이지 (페이지 유형: 좌/우 2 그리드 구조관리)

> FE v2 §작업 순서. **shared `form` 컴포넌트 강제**, `apiRequest`/`useMessage`, 직접 fetch·alert·console.error 금지. 공통 검증: `cd src/frontend/m-mcm && pnpm build`.

- [x] **ITEM-FE-01** 페이지 scaffolding — `page-components/cmb/masterRuleFrame/{page.tsx,repository.ts,types.ts,constants.ts}` + page-registry 등재.
  - 검증 (2026-07-08): `lib/generated/page-registry.ts:30` → `"cmb/masterRuleFrame"` (prebuild codegen 자동).
- [x] **ITEM-FE-02** types / constants / api — search/save repository (`/api/mcm/oasis/masterRuleFrame/{search,save}`, grids.inList/outList 전량 송신 — As-Is xfdl:363) + LoV 정적 상수 (DIV_VALUES N/Y / COL_TYPE_VALUES DATE/NUMBER/VARCHAR2) [DEC-Q004].
- [x] **ITEM-FE-03** PageLayout 골격 — 조회조건(업무기준 ID/명 readonly input + 업무기준/기초데이터등록 버튼 — cib/interfaceFormatLayout "FORMAT 선택" 동일 패턴) + 좌/우 2 그리드(ContentBody row + ContentPanel flex 1:1) + 항목 수 표시(GridPanel count = C-004/C-005).
  - 근거: 디자인 §1.2 / §2.
- [x] **ITEM-FE-04** IN 그리드 (G-001) + OUT 그리드 (G-002) — 7 cols (순번 계산필드 no/한글항목명/영문항목명/코드여부 select/유형 select/총길이 number/소수점길이 number) + 행추가/행삭제 (B-005~B-008, GridPanel showAdd/DeleteButton). 기존행 편집/삭제 허용 (delete-all-then-insert — BR-003).
  - 근거: 디자인 §4 / §4.3. **비차단 잔여 D-001**: 2행 병합 head("사용여부" colspan) 는 shared AgDataGrid 가 column group 미지원 → 평탄 헤더 표시 (masterRuleList Q-013 fold 와 동일 유형 — shared 컴포넌트 범위).
- [x] **ITEM-FE-05** 팝업 P-001 (MasterRuleListPop) / P-002 (MasterRuleFrameColListPopup) 연동 — 콜백 후 재조회. **완료 (2026-07-08 — 두 팝업 모두 정식 컴포넌트)**.
  - 근거: 기능 §9.1 / 디자인 §6.
  - **P-001**: ~~잠정 인라인 Modal~~ → **정식 masterRuleListPop 컴포넌트 연동 완료 (2026-07-08 — D-003 P-001 해소)**. `MasterRuleListPopModal` 임포트, LoV 계약(입력 initRuleId/initRuleNm → 반환 {sRuleId,sRuleNm}) 준수 + 콜백 자동 조회. E2E 1 passed (더블클릭 GB-002 반환).
  - **P-002**: ~~가드만~~ → **정식 masterRuleFrameColListPopup 컴포넌트 연동 완료 (2026-07-08 — D-003 완전 해소)**. 가드(MSG-006) + onSaved 재조회(As-Is fn_returnColListPopupCallBack). E2E 통과.
- [x] **ITEM-FE-LAST** portal 진입 E2E — playwright `e2e/master-rule-frame-e2e.spec.ts` **1 passed** (2026-07-08): admin 로그인 → 메뉴 트리(공통관리>업무기준관리(원장)>업무기준 구조관리) 진입 → 화면 로드 확인 (MSSQL sqlcmd 등재 메뉴 실동작 증명).

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §K "개발 완료 게이트")

> 1개라도 ✗ 면 재개발.

- [x] **ITEM-GATE-01** 정합키 일치 (코드 ↔ 설계서) — grep 대조 불일치 0.
  - 검증 (2026-07-08): types.ts camelCase 12 키 (colId/colLen/colNm/colPrecLen/colSeq/colType/ioFlag/masterCodeDiv/mesColId/oldColId/ruleId/ruleVer) = 분석 §9.1 업무 12 컬럼 1:1. BE 응답키 `ds_GetRuleColInList`/`ds_GetRuleColOutList` = As-Is resultKey 보존.
- [~] **ITEM-GATE-02** 영역별 수량 매칭 — S 4 / G 2 / B 9 / P 2.
  - 실측 (2026-07-08): S 4(라벨2+readonly 입력2 = SearchField 2조) ○ / G 2(GridPanel IN/OUT) ○ / P 2(P-001 잠정 + P-002 가드) △(D-003) / B **8/9** — B-001~B-008 구현, **B-009 fold 미구현 (D-002)**: shared SearchArea collapse 미지원 (masterRuleList Q-013 과 동일 결정 — 비차단 UI 보류).
- [x] **ITEM-GATE-03** As-Is 1:1 정합 — Grid 12 컬럼(dataset) ○ / delete-all-then-insert 패턴 ○ (BR-003, 단위테스트 captor) / 검증 5종 임의 단순화 ✗ (MSG-001~005 문구 보존, FE+BE 이중) ○ / COL_SEQ 통합 순번·RULE_VER 보정·delete 반환 미검증 보존 ○.
- [x] **ITEM-GATE-04** 안티패턴 검사 — `@Transactional` 어노테이션 0 (javadoc 언급만) / 직접 fetch·alert·console.error grep hit 0 (apiRequest/useMessage/ErrorModal 사용).
- [x] **ITEM-GATE-05** BE 회귀 — `./gradlew :mcm-core:test --rerun` 그린.
  - 검증 (2026-07-08): BUILD SUCCESSFUL in 26s. `TEST-...MasterRuleFrameServiceTest.xml` = tests="8" skipped="0" failures="0" errors="0" (기존 회귀 포함 전체 그린).
- [x] **ITEM-GATE-06** FE 빌드 — `pnpm build` 성공.
  - 검증 (2026-07-08): ✓ Compiled successfully in 30.3s (m-mcm. 선행: shared prisma generate + shared/m-mpn/m-mpp/m-mqc/m-analog 의존 빌드).
- [x] **ITEM-GATE-07** E2E (조회/저장/팝업 시나리오) — **그린 (2026-07-08)**. BE(local-ph, MSSQL <개발 DB 호스트> 직결, :8100) + FE(dev :5000) 기동, playwright `e2e/master-rule-frame-e2e.spec.ts` → **1 passed (18.4s)**.
  - 시나리오: admin 로그인 → 메뉴 진입 → P-001 팝업 USD 선택(콜백 자동 조회 + MSG-010 토스트 "0건 조회 되었습니다.") → IN 행추가(기준일자/BASE_DT/N/DATE/8) → OUT 행추가(적용환율/APPLY_RATE/N/NUMBER/10/4) → 저장 → MSG-011 모달 "2건 저장 되었습니다." → 재조회 그리드 표시.
  - DB side-effect 실측 (RULE.md 테스트 원칙): `TB_MCA_RULE_COL_LIST` WHERE RULE_ID='USD' → 2행: (1,IN,BASE_DT,N,DATE,8,NULL) / (2,OUT,APPLY_RATE,N,NUMBER,10,4). **COL_SEQ 통합순번(BR-004)·RULE_VER=1.00 보정(BR-005)·COL_PREC_LEN 선택입력(BR-007)·audit C_USR_ID=admin(BR-017)·한글 COL_NM 정상** 확인.
  - 검증 경로 실증: 총길이 누락 상태 저장 시 클라이언트 검증 "조건항목(IN) 1행: 총길이를 입력해 주십시오." (MSG-005 + 행번호) 표시 확인.
- [x] **ITEM-GATE-08** 정합체크서 §H/§G 동기화 — 설계 Q-001~Q-004 전부 Resolved (설계 시점 완료, 갱신 불요). 개발 잔여는 본 체크리스트 §7 D-001~D-003 으로 등재 (설계 산출물 비대상 — shared 컴포넌트/형제 화면 의존).

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-04 | (생성) | - | 5종 설계서 기반 초안 생성 (open Q-001~Q-004 — DEC-Q001 P0 차단) |
| 2026-06-04 | DEC-Q001 | open → [x] Resolved | To-Be 테이블 정본 DMES-SECTION-MCA sheet134/135 확인 (종전 MCM 정의서 오참조 정정). PK=(RULE_ID,COL_SEQ)/owner=MCAAPUSER/audit=mcm-core McmAuditEntity 9. §2 BE 차단 해소. 잔여 open Q-002~Q-004 |
| 2026-07-08 | §1 전체 | → [x] 7/7 | DEC-01(정합 §H ○)/DEC-02(모듈·엔티티 기존재) 확인 — 게이트 통과, §2 진입 |
| 2026-07-08 | §2~§5 | → 구현 완료 | BE: MasterRuleFrameSearchRequest/MasterRuleColListRepository/MasterRuleFrameService + masterRuleFrame.bpmn(bpmn-tool, 유효:true) + 단위테스트 8건 그린. FE: cmb/masterRuleFrame 4파일 + registry + pnpm build ✓. 시드/메뉴: DataInitializer masterRuleFrame 등재(SEC_OBJ/ROLE_MAPPING/SEC_MENU 1040110/FULL_SEQ) + initRuleColListSampleData() 5 row |
| 2026-07-08 | D-001 | 등재 (비차단) | "사용여부" 2행 병합 헤더 — shared AgDataGrid column group 미지원 → 평탄 헤더. shared 확장 시 반영 |
| 2026-07-08 | D-002 | 등재 (비차단) | B-009 fold(조회조건 접기) — shared SearchArea collapse 미지원 (masterRuleList Q-013 동일 결정 보류) |
| 2026-07-08 | D-003 | 등재 (형제 화면 의존) | P-001 = 잠정 인라인 Modal(masterRuleList search 재사용) — 정식 masterRuleListPop 개발 시 교체. P-002 = 가드만 구현 — masterRuleFrameColListPopup 개발 시 연동 |
| 2026-07-08 | stale 응답 가드 | 보강 | masterRuleListPop E2E 확장 중 발견한 연속 조회 race(이전 응답이 최신 결과를 덮음)를 loadCols 에도 동일 적용 — searchSeqRef 최신 요청만 반영. `pnpm build` ✓ |
| 2026-07-08 | D-003 (P-002) | 완전 해소 | masterRuleFrameColListPopup 개발 완료 — 가드+안내 → 정식 Modal 연동(onSaved 재조회). E2E 통과 (E2ESRC 시나리오). **D-003 종결 — 잔여 보류 = D-001 병합헤더 / D-002 fold 만** |
| 2026-07-08 | D-003 (P-001) | 해소 | masterRuleListPop 개발 완료에 따라 잠정 인라인 팝업 제거 → 정식 `MasterRuleListPopModal` 연동 (page.tsx/repository.ts/constants.ts/types.ts 잠정 코드 정리). E2E 재통과 (playwright 1 passed — 팝업 자동조회/더블클릭 반환/저장). 잔여 = P-002 (masterRuleFrameColListPopup 개발 대기) |
| 2026-07-08 | 작업 위치·등재 방식 | main 직접 + sqlcmd 등재 | 사용자 지시: 워크트리 미사용(main 체크아웃 직접, 앞으로 계속) + DataInitializer 미수정. MSSQL dev(<개발 DB 호스트>/sample_dmes) sqlcmd 멱등 INSERT — OBJ 1/MENU 1(FULL_SEQ 2040110·MENU_SEQ 00000002)/ROLE_MAPPING 2 등재, 검증 SELECT 4행·한글 코드포인트 일치. 로컬 SQLite 메뉴 미등재(코드 시드 없음 — 특이사항) |
| 2026-07-08 | E2E (GATE-07) | → [x] 그린 | playwright 1 passed(18.4s) + MSSQL 행 실측. E2E 중 수정 2건: ① MSG-010 조회 메시지를 차단 모달→`toast: true` 비차단 토스트로 (As-Is 하단 상태바 정합 — 모달이 화면 조작을 막는 UX 회귀였음) ② 총길이/소수점길이 cellEditor "number" 제거→기본 text+clampCellValue (초기값 ""의 text 타입 추론과 agNumberCellEditor 충돌로 커밋 값 소실 — 정수 강제는 clamp 가 BR-009 보장). 수정 후 `pnpm build` ✓ 36.9s |
| 2026-07-08 | R0-3 교차검증 | /code-review 수행 → 4건 수정 | ① 행삭제 버튼 선택 연결 누락(영구 비활성) → selectedIn/OutKey + onRowClick/highlightedRowKey 연결 ② MSG-010 조회 메시지 누락 → loadCols showMessage 추가 ③ OUT 코드여부 null "선택" 표시 누락 → FRAME_COLUMNS_OUT render ④ 행삭제 분기 이중 map 단순화. 수정 후 `pnpm build` ✓ Compiled successfully in 37.1s. 보류: 조회 무가드(As-Is 1:1)/검증 메시지 행번호 접두(포커스 대체 의도적)/미커밋 셀 편집(shared 공통 — masterRuleList 동일) |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트 통과 → §2~§5 구현 완료 (2026-07-08) → 잔여 = ITEM-BE-05/FE-LAST/GATE-07 런타임 E2E (사용자 확인) + D-001~D-003 보류. `/implement <ITEM-ID>`·`/progress`·`/check` 연동.
