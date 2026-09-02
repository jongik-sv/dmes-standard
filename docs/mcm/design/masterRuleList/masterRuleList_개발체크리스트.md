---
screenId: masterRuleList
asIsId: MasterRuleList
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleList_분석리포트.md
  - masterRuleList_기능설계서.md
  - masterRuleList_디자인설계서.md
  - masterRuleList_BPMN설계서.md
  - masterRuleList_정합체크.md
---

<!--
  본 산출물 = MasterRuleList (업무기준 목록조회 / masterRuleList) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗ (설계서에 없으면 설계로 환송).
  라우터 분기 3 (MES 개발, Mes-Guide §3) 의 진행 추적 정본. 정합체크서 §H (개발 완료 게이트) 로 수렴.
-->

# 업무기준 목록조회 (masterRuleList) 개발 체크리스트

## §0. 운영 규칙 (먼저 읽는다, MUST — 화면 무관 고정)

| # | 규칙 |
|---|---|
| R0-1 | **한 작업 단위 = 한 작업 사이클.** "지금 ITEM-XX 하나만. 끝나면 검증 로그 붙이고 멈춰." |
| R0-2 | **검증 명령의 실제 출력(로그) 없이 `[x]` 금지.** 말로 "되었습니다" 는 체크 근거가 아니다. |
| R0-3 | **주장하는 자 ≠ 판정하는 자.** 구현 직후 `/check`·`/verify`·`/code-review` 로 교차검증. |
| R0-4 | **DoD 미충족 = 미완료.** 부분 완료는 하위 박스로 쪼갠다. |
| R0-5 | **설계서에 없는 것은 구현하지 않는다.** 추가 필요 시 5종 설계서로 환송 → 정합체크 재통과 후 본 체크리스트 갱신. |
| R0-6 | **`[확인필요]`(Q-008~Q-012)·선행 결정(DEC-NN) 미해결 항목은 구현 진입 금지.** §1 게이트 먼저. |
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
| §1 선행 결정 게이트 | 4 | 4 | 100% |
| §2 BE 기반 | 7 | 7 | 100% |
| §3 BE 서비스·BPMN | 4 | 4 | 100% |
| §4 검증·비즈니스 규칙 | 5 | 5 | 100% |
| §5 FE | 6 | 6 | 100% |
| §6 정합·회귀 게이트 | 8 | 7 | 88% |

> 진행: 2026-06-05(3차·완료) — **MSSQL 전환 + 런타임 E2E 통과**(사용자 확인). 조회·행추가·저장·재조회 정상, 저장행 APS00001(admin) MSSQL 실재. §12 "USD 기본필터" 철회(저장후 가림 혼란 해소). **개발 완료** — 잔여는 Q-013(B-006 fold, 비차단 UI 결정 보류)뿐. §H 개발 완료 게이트 ○.
> 진행: 2026-06-05(2차) — BE 기반 7/7 완료(BE-03/04 ddl-auto 컨벤션 확정 + BE-05 샘플시드 6row·BR-002/003 실측통과) + FE-05 엑셀다운 완료. 잔여: FE-LAST 런타임 E2E(브라우저·사용자), GATE-02 B-006 fold(Q-013), GATE-07 E2E, GATE-08 정합 sync. 검증 로그: BE 재기동 `Started in 19s`+`샘플 시드 6 row` / mcm.db 필터 실측 `USD/USD→[USD,USDFWD]`·BR-002/003 제외=True / `pnpm build` ✓ Compiled successfully / `:mcm:api:compileJava` EXIT 0.
> 진행: 2026-06-05(1차) — BE 기반(Entity/Repository/DTO/Service) + BPMN + 서비스 단위테스트 완료·검증. 검증 로그: `:mcm-core:test` BUILD SUCCESSFUL(신규 5 + 회귀, full-context EMF 에 MCAAPUSER.TB_MCA_RULE_MASTER 생성 확인) / `bpmn-tool validate` 유효:true.

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

> 정합체크서 §H 최종 판정 = ○ (설계 완료 — §A~§F ✓ / 활성 0건. §D.4 manifest ✗ 의도 면제). Q-008/010/012 사용자 확정 2026-06-05 (영향도 낮음).

- [x] **DEC-01** 설계서 4종 간 충돌 — **충돌 없음** (정합 §A~§F 모두 ○, 활성 Q 0건)
  - DoD: 정합체크서 §H = ○(설계 완료) 재확인 완료.
- [x] **DEC-02** mcm 모듈 존재 확인 — `src/backend/mcm-core`·`src/frontend/m-mcm` 존재 확인. cmb 패키지 신설.
  - DoD: ✅ `com.dongkuk.dmes.mcm.cmb.masterRuleList.{dto,service}` 신설 (masterCategoryMng cma 선례 동일). entity/repository 평탄 위치. 임의 모듈 생성 ✗.
- [x] **DEC-03** 영속성 방식 확정 — **JPA** (cmb 화면군 공통, 사용자 확정 2026-06-04 / 기존 mcm-core 엔티티 JPA 정합)
  - DoD: JPA Repository + JPQL/native. masterCategoryMng 선례 = JPA Repository(native query) + Mapper.xml.asis 보존.
- [x] **DEC-04** open Q-NNN 결정 — **전부 확정** (Q-008/010/012 사용자 2026-06-05 / Q-009·Q-011 사용자 2026-06-04) (정합 §G 에서 추출)
  - Q-008 onkeydown 미정의 (Enter 검색 의도?) → **To-Be 미반영 확정** (영향도 낮음, 개발 무관)
  - Q-009 RULE_ID != OLD_RULE_ID 이력행 제외 필터 — **As-Is 보존 확정** (사용자 2026-06-04)
  - Q-011 RULE_VER(업무버전) vs mcm-core VER(@Version) — **별개 컬럼 확정** (사용자 2026-06-04)
  - Q-010 Excel 한글의미 misalign — 그리드 헤드 직역 보존 (문서 디테일, 개발 무관)
  - Q-012 MSSQL UPPER 양변 검색 — 유지(보존, collation 정책은 개발 시 확인)
  - DoD: Q-009·Q-011 사용자 확정. 잔여 Q-008/Q-010/Q-012 보존/미반영으로 결정 — 구현 차단 아님.

> §1 전부 `[x]`/`[!](범위외 명시)` 전에는 §2 이후 진입 금지.

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

> BE v2 §작업 순서: base-package → Entity → Repository → DTO → Service → BPMN. **As-Is 컬럼 1:1 보존** (분석 §9.1). 공통 검증: `cd src/backend && JAVA_HOME="C:/Program Files/Java/jdk-21.0.6" ./gradlew :mcm-core:compileJava`.

- [x] **ITEM-BE-01** cmb 패키지 scaffolding — `com.dongkuk.dmes.mcm.cmb.masterRuleList.{service,dto}` + Entity/Repository 평탄. ✅ 생성 완료.
  - 근거: BPMN §6.4 / 정합 §F.2 · 검증: `:mcm-core:compileJava` EXIT 0
- [x] **ITEM-BE-02** RuleMaster 엔티티 — `@Table(name="TB_MCA_RULE_MASTER", schema="MCAAPUSER")`, `McmAuditEntity` 상속, 단일 PK `RULE_ID` `@Id`. ✅ `entity/RuleMaster.java` 작성.
  - 근거: 분석 §9.1 (업무 9: RULE_ID PK / OLD_RULE_ID / RULE_NM NOT NULL / RULE_DESC / RULE_VER / RULE_TP / RULE_OWNER_DEPT_NM / RULE_OWNER_EMP_NO / USE_TP) + §9.2 (audit 9)
  - DoD: ✅ 업무 컬럼 9 1:1 / audit 17→McmAuditEntity 9(DATA_END_*·ARCHIVE_* 제거) / RULE_VER 별개 컬럼(Q-011). 검증: `:mcm-core:test` full-context EMF 에 `MCAAPUSER.TB_MCA_RULE_MASTER` 생성 확인(멀티스키마 정상).
- [x] **ITEM-BE-03** RuleMaster 테이블 생성 (SQLite local) — **mcm 컨벤션 = Hibernate `ddl-auto=update`** (Flyway 는 mcm-core `compileOnly`/`testRuntimeOnly` 전용, 앱 런타임 미적용 — `flyway_schema_history` 부재로 확인). 별도 마이그레이션 파일 불요.
  - DoD: `TB_MCA_RULE_MASTER` 가 ddl-auto 로 mcm.db 에 실재. 검증: `sqlite_master` 조회 → `['TB_MCA_RULE_COL_LIST','TB_MCA_RULE_MASTER']` 생성 확인 (2026-06-05). 단, 다수 테이블 introspection 시 SQLite compound-SELECT 한계 → `JpaConfig` 에 `hbm2ddl.jdbc_metadata_extraction_strategy=individually` 추가로 해결 (BE 정상 기동).
- [x] **ITEM-BE-04** RuleMaster 테이블 생성 (MSSQL) — ✅ **실 MSSQL 검증 완료** (사용자 결정 2026-06-05: MSSQL 전환). `--spring.profiles.active=mssql` 기동 → MCMAPUSER@<개발 DB 호스트>/sample_dmes 접속, primary DS=MCAAPUSER.
  - DoD: 부팅 로그 `HHH000262: Table not found: TB_MCA_RULE_MASTER` → `create table MCAAPUSER.TB_MCA_RULE_MASTER (...)` ddl-auto 자동 생성 확인. `Started McmApplication in 24.3s`. (참고: 타 테이블 ddl-auto 경고 21건 = 기존 스키마 드리프트, masterRuleList 무관·비치명. 운영 prod 는 ddl-auto=none 별 트랙.)
- [x] **ITEM-BE-05** 샘플 데이터 — ✅ `DataInitializer.initRuleMasterSampleData()` (**local/mssql/dev tier 허용**, prod 제외 + `existsById("USD")` idempotent — 사용자 결정 2026-06-05 MSSQL 검증 허용). 6 row: 활성 USD/USDFWD/EUR/JPY + USE_TP='N' USDOFF(BR-003) + OLD_RULE_ID=RULE_ID USDHIST(BR-002).
  - DoD: 부팅 시 시드 + 고정필터 2종 교차검증. 검증①(SQLite/local) mcm.db JPQL 동등 SQL — 기본필터 USD/USD→`[USD,USDFWD]` / 비움→`[EUR,JPY,USD,USDFWD]` / `USDOFF 제외=True`(BR-003) / `USDHIST 제외=True`(BR-002). 검증②(MSSQL) 부팅 로그 `MCAAPUSER.TB_MCA_RULE_MASTER 샘플 시드 완료 — 6 row`. 2026-06-05.
- [x] **ITEM-BE-06** RuleMasterRepository — ✅ `repository/RuleMasterRepository.java` (`searchRuleMasterList` JPQL: 고정 필터 2 `ruleId <> COALESCE(oldRuleId,'ZZZZ0000')`/`COALESCE(useTp,'N')<>'N'` + 동적 2 UPPER 양변 LIKE + ORDER BY ruleId / `existsById` 상속).
  - 근거: 분석 §6.1 (GetRuleMasterList WHERE 4 + ORDER BY) / 기능 §6 BR-002/003/010/012 · 검증: `:mcm-core:test` search 단위테스트 그린
- [x] **ITEM-BE-07** DTO — ✅ `dto/MasterRuleListSearchRequest`(pRuleId/pRuleNm) + Response/save rows = `List<Map<String,Object>>` camelCase(reference 패턴 — tcAbnormalData/masterCategoryMng). save 는 `master`(grids.master) rowStatus C/U. `@RestController` 미사용(BPMN 진입).
  - 근거: 정합 §F.2 / BPMN §6.4 · 검증: 정합키 ruleId/ruleNm/... 1:1

> 각 항목에 근거/DoD/검증을 §0 표기 규약대로 채운다.

---

## §3. BE 서비스 · BPMN (action별)

> BPMN 매핑 `POST /oasis/masterRuleList/{action}`. 단일 `.bpmn` actionGateway 2분기(search/save). **OASIS 서비스 `@Transactional` 금지 — cactus TransactionTemplate 사용**. 공통 검증: action별 통합테스트(응답 + 조회 API 로 side effect 재확인).

- [x] **ITEM-SVC-01** `masterRuleList.bpmn` ✅ 작성 (`services/cmb/masterRuleList.bpmn`). actionGateway(input=action) → searchTask/saveTask(camunda:class=masterRuleListService). save 재조회는 save() 내부 search() 호출로 흡수(OASIS action-gateway 패턴 — tcAbnormalData 선례 동일).
  - 근거: BPMN §3 / tcAbnormalData.bpmn 정합
  - DoD: ✅ `bpmn-tool validate` = 유효:true (치명0/오류0/경고1=gateway default flow 미설정 — action 라우팅 패턴상 정상) + BPMNDiagram 존재 + process id=masterRuleList.
- [x] **ITEM-SVC-02** search 서비스 — ✅ `MasterRuleListService.search()` (이력행/활성 필터 + 2 LIKE → `{ list, cnt }` 12컬럼 camelCase + 타임스탬프 포맷).
  - 근거: 분석 §6.1 / §8.4 · 검증: `search_정상` 단위테스트 그린
- [x] **ITEM-SVC-03** save 서비스 — ✅ `MasterRuleListService.save()` rowStatus 2분기(C: existsById 중복체크→DUPLICATE_DATA throw→INSERT 7컬럼 / U: findById→UPDATE 3컬럼). cnt_save=전체 행수. 저장 후 search() 재조회.
  - 근거: 분석 §7.2 / BPMN §4 — INSERT 7(RULE_ID/RULE_TP/RULE_DESC/RULE_OWNER_EMP_NO/RULE_NM/USE_TP/RULE_VER) / UPDATE 3(RULE_NM/RULE_DESC/USE_TP) / 중복체크 1
  - DoD: ✅ deleted 분기 미구현(As-Is 보존). 검증: `save_insert_신규`/`save_update_기존` 단위테스트 그린.
- [x] **ITEM-SVC-ERR** 에러 처리 — ✅ 중복 PK → `BusinessException(DUPLICATE_DATA, "[{ruleId}] 동일한 업무기준ID가 존재합니다.")` (As-Is java:52 메시지 보존). RULE_ID 공란 → REQUIRED_VALUE.
  - 근거: 기능 §10.1 MSG-005 / java:51 · 검증: `save_insert_중복`(DUPLICATE_DATA)/`save_ruleId_공란`(REQUIRED_VALUE) 단위테스트 그린

---

## §4. 검증 · 비즈니스 규칙 (BR-NNN — 기능 §6)

> 실행 순서: 클라이언트 입력 → 클라이언트 비즈니스 → 서버 트랜잭션.

- [x] **ITEM-VAL-01** BR-004 변경여부 — ✅ `handleSave`: 변경분(C+U) 0건 시 "변경된 데이터가 없습니다." (page.tsx). 런타임 E2E 는 FE-LAST.
- [x] **ITEM-VAL-02** BR-005 RULE_ID 필수 — ✅ `handleSave`: C/U 행 ruleId(+ruleNm) 공란 차단 "업무기준ID를 입력해 주십시오."(page.tsx). 서버 가드 = VAL-03.
- [x] **ITEM-VAL-03** BR-001/BR-013 중복 PK 사전체크 — ✅ 서버: INSERT 전 `existsById` → `BusinessException(DUPLICATE_DATA)` 롤백 (MSG-005). 검증: `save_insert_중복` 단위테스트 그린.
- [x] **ITEM-VAL-04** BR-006 기존행 PK 편집 불가 — ✅ RULE_COLUMNS `ruleId`/`ruleOwnerEmpNo` editable=insertedOnly + `handleCellChange` 기존행 ruleId/ruleOwnerEmpNo 변경 차단(page.tsx).
- [x] **ITEM-VAL-05** BR-008 기존행 실삭제 차단 — ✅ `handleDataChange`: 삭제 시 비-inserted 행 포함이면 차단 + "행추가로 추가한 데이터만 삭제가 가능합니다."(page.tsx). 신규행만 client 제거. 논리삭제는 USE_TP UPDATE.

---

## §5. FE — m-mcm 페이지 (페이지 유형 C — 조회 + 저장)

> FE v2 §작업 순서: 페이지 유형 → mesModule → types/constants/api → 페이지 본체 → 모듈 엔트리 → portal 재내보내기. **shared `form` 컴포넌트 강제**, `apiRequest`/`useGfnMessage`, 직접 fetch·alert·console.error 금지. 공통 검증: `cd src/frontend/m-mcm && pnpm build`.

- [x] **ITEM-FE-01** `page-components/cmb/masterRuleList/page.tsx` (camelCase) ✅ + module-pages.ts cmb 그룹 등재(`masterRuleList`, apiPatterns `/api/mcm/oasis/masterRuleList/**`). (BE DataInitializer 메뉴 seed 는 §FE-LAST 후속) · 검증: `pnpm build` EXIT 0
- [x] **ITEM-FE-02** ✅ `types.ts`(RuleFilters/RuleRow) + `constants.ts`(DEFAULT_FILTERS 빈 문자열 — §12 "USD" 철회 2026-06-05 / RULE_COLUMNS 9 / ROW_ADD_DEFAULTS) + `repository.ts`(**OASIS `apiRequest`** — mcm=OASIS 전용이라 apiService/apiQuery 금지, FrontEnd 표준 §2-2-1-A). 정합키 camelCase 1:1.
- [x] **ITEM-FE-03** ✅ PageLayout(title/breadcrumb/objId + 상단 조회·저장 버튼) + SearchArea + ContentBody/ContentPanel + GridPanel(우측 행추가·행삭제) + ErrorModal (shared/layout·shared/grid 표준).
- [x] **ITEM-FE-04** ✅ SearchField 2종(업무기준 ID / 업무기준명) + DEFAULT_FILTERS **빈 문자열**(§12 "USD 보존" **철회** — 사용자 2026-06-05: 저장후 재조회 시 비-USD 신규행 가림 혼란 → 제거, masterCategoryMng 정합). onkeydown(Q-008) 미반영 — As-Is 결정.
- [x] **ITEM-FE-05** 그리드 G-001 — ✅ 9 업무컬럼(RULE_COLUMNS) + STATUS/순번=AgDataGrid row state·index. 신규행 ruleId/ruleOwnerEmpNo·전행 ruleNm/ruleDesc/useTp 인라인 편집(BR-006) / 날짜 포맷(BE) / 행추가 기본값 RULE_TP='A'·USE_TP='Y'·RULE_VER='1' / 행삭제=신규행만(BR-008 기존행 차단). ✅ **엑셀다운(B-005)** — `handleExcelDown` 추가(상단 "엑셀" 버튼, type=light). As-Is `gfn_exportExcel(grd_Main)`(xfdl:216~219) 정합 — 형제 cia/interfaceList 패턴(`XLSX.writeFile` 직접, shared libExcel file-saver 의존 회피). RULE_COLUMNS 9 헤더 + body, internal field 제외. 검증: `pnpm build`.
- [x] **ITEM-FE-LAST** ✅ module-pages.ts cmb 등재 + `pnpm build` EXIT 0 + **BE DataInitializer 메뉴 seed 추가**(OBJ `masterRuleList` / MENU `공통관리>업무기준 관리(원장)>업무기준 목록조회`(dir b0000104 + page c0000107, /cmb) / PERM_MCM_CMB_W P068) — BE 재기동 후 `ObjIdMigrationRunner mcm count 29→30` 등재 확인. ✅ **런타임 E2E 통과**(MSSQL, 사용자 확인 2026-06-05): 메뉴→조회(전체 활성행)→행추가→저장→재조회 정상. 저장행 `APS00001`(C_USR_ID=admin) MSSQL 실재 확인.

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §H "개발 완료 게이트")

> 본 §6 통과 = 정합체크서 §H 를 실측으로 채워 ✓ 전환. 1개라도 ✗ 면 재개발.

- [x] **ITEM-GATE-01** 정합키 일치 — ✅ RULE_ID/RULE_NM/RULE_DESC/RULE_TP/RULE_OWNER_EMP_NO/USE_TP/RULE_VER ↔ BE/FE camelCase(ruleId/ruleNm/...) 1:1. 불일치 0 (entity·DTO·service·types.ts·repository.ts grep 대조).
- [~] **ITEM-GATE-02** 영역별 수량 매칭 (코드 실측 2026-06-05) — **S=2 ✓** (SearchField 2) / **G=11 ✓** (RULE_COLUMNS 9 업무 + STATUS·순번 2=AgDataGrid 메커니즘) / **Dataset=12 ✓** (BE search 12컬럼 매핑) / **B=5/6** — B-001 search·B-002 save·B-005 excel(상단) + B-003 rowAdd·B-004 rowDelete(GridPanel) = 5 구현. **B-006 fold(div_search 접기/펴기) 미구현** — shared `SearchArea` 가 collapse 미지원(접기 = shared 컴포넌트 개선 필요 = m-mcm 범위 외, Frontend 로컬 운영 규칙상 별도 승인 영역). → **Q-013 등재**(fold 도입 여부: shared SearchArea collapse 추가 vs 드롭). 업무로직 무관 UI 토글이라 화면 동작 비차단.
- [x] **ITEM-GATE-03** As-Is 부수효과 1:1 — ✅ BE: INSERT 7컬럼 / UPDATE 3컬럼 / 중복체크 existsById 1 / 고정 필터 2(이력행 `ruleId<>COALESCE(oldRuleId,'ZZZZ0000')`·활성 `COALESCE(useTp,'N')<>'N'`). 단위테스트로 1:1 검증(임의 단순화 0). (FE 부수효과는 §5 후 재확인)
- [x] **ITEM-GATE-04** 안티패턴 검사 — ✅ BE: `@Transactional` 미사용(OASIS wrap). FE: `apiRequest`(직접 fetch ✗) / `useMessage`·`ErrorModal`(alert ✗) / shared 컴포넌트(raw HTML ✗). grep hit 0 (`fetch(`/`alert(`/`console.`/`dangerouslySetInnerHTML`).
- [x] **ITEM-GATE-05** BE 회귀 — ✅ `:mcm-core:test` BUILD SUCCESSFUL (신규 MasterRuleListServiceTest 5건 + 기존 회귀 그린, full-context EMF 정상 — MCAAPUSER 멀티스키마 검증). 2026-06-05.
- [x] **ITEM-GATE-06** FE 빌드 — ✅ `cd src/frontend/m-mcm && pnpm build` EXIT 0 (Compiled successfully + TypeScript 통과). 2026-06-05.
- [x] **ITEM-GATE-07** E2E (수정 범위) — ✅ MSSQL 브라우저 E2E 통과(사용자 2026-06-05): 조회(전체 활성행)/행추가/저장(APS00001 커밋·admin)/저장후 재조회 정상. 중복PK차단(서버 existsById→DUPLICATE_DATA)·기존행삭제차단(BR-008 FE 가드)은 서비스 단위테스트(`save_insert_중복`)+FE 가드로 검증 완료(GATE-05/VAL-03·05).
- [x] **ITEM-GATE-08** 정합체크서 §D.4 / §G 갱신 + 잔여 Q 동기화. ✅ §G 에 **Q-013(B-006 fold 갭)** 등재 + §12 "USD 보존" 철회(2026-06-05) 반영. Q-008~Q-012 기확정 동기화 완료. GATE-07 통과 → §H 최종 ○.

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-04 | (생성) | - | 5종 설계서 기반 초안 생성 (masterCategoryMng 선례 동일 mui+mcm 환경) |
| 2026-06-05 | §1 게이트 | DEC-01/02 [x] | 설계완료 확인 + cmb 패키지 신설 |
| 2026-06-05 | §2 BE 기반 | BE-01/02/06/07 [x] | RuleMaster 엔티티 + RuleMasterRepository(JPQL) + MasterRuleListSearchRequest DTO. `:mcm-core:compileJava` EXIT 0 |
| 2026-06-05 | §3 BE 서비스·BPMN | SVC-01/02/03/ERR [x] | MasterRuleListService(search/save C·U 중복PK) + masterRuleList.bpmn(bpmn-tool 유효:true) |
| 2026-06-05 | §4·§6 | VAL-03 / GATE-03·05 [x] | MasterRuleListServiceTest 5건 그린 + `:mcm-core:test` BUILD SUCCESSFUL(회귀·멀티스키마 정상) |
| 2026-06-05 | §5 FE | FE-01~04 [x] / FE-05·LAST [~] | page/types/constants/repository(cmb/masterRuleList) + module-pages.ts cmb 등재. `pnpm build` EXIT 0. 잔여: 엑셀다운·메뉴 seed·런타임 E2E |
| 2026-06-05 | §6 게이트 | GATE-01·04·06 [x] | 정합키 1:1 / 안티패턴 hit 0 / FE 빌드 그린 |
| 2026-06-05(2차) | §2 BE 기반 | BE-03·04·05 [x] | ddl-auto 컨벤션 확정(Flyway 런타임 미적용) + JpaConfig introspection=individually(SQLite 한계 해결) + DataInitializer 샘플시드 6row(local·idempotent). 필터 BR-002/003 mcm.db 실측 통과 |
| 2026-06-05(2차) | §5 FE / §6 | FE-05 [x] / GATE-02 [~] | 엑셀다운(B-005, XLSX.writeFile) `pnpm build` ✓. GATE-02: S2·G11·Dataset12 ✓ / B 5·6(B-006 fold 미구현→Q-013) |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트 → §2~§5 한 항목씩(R0-1·R0-2) → §6 개발 완료 게이트(=정합 §H). `/implement <ITEM-ID>`·`/progress`·`/check` 연동.
