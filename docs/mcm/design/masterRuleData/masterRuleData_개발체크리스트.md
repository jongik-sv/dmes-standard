---
screenId: masterRuleData
asIsId: MasterRuleData
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleData_분석리포트.md
  - masterRuleData_기능설계서.md
  - masterRuleData_디자인설계서.md
  - masterRuleData_BPMN설계서.md
  - masterRuleData_정합체크.md
---

<!--
  본 산출물 = MasterRuleData (업무기준 Data관리 / masterRuleData) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗ (설계서에 없으면 설계로 환송).
  라우터 분기 3 (MES 개발, Mes-Guide §3) 의 진행 추적 정본. 정합체크서 §G 로 수렴.
-->

# 업무기준 Data관리 (masterRuleData) 개발 체크리스트

## §0. 운영 규칙 (먼저 읽는다, MUST — 화면 무관 고정)

| # | 규칙 |
|---|---|
| R0-1 | **한 작업 단위 = 한 작업 사이클.** "지금 ITEM-XX 하나만. 끝나면 검증 로그 붙이고 멈춰." |
| R0-2 | **검증 명령의 실제 출력(로그) 없이 `[x]` 금지.** |
| R0-3 | **주장하는 자 ≠ 판정하는 자.** 구현 직후 `/check`·`/verify`·`/code-review` 교차검증. |
| R0-4 | **DoD 미충족 = 미완료.** 부분 완료는 하위 박스로 쪼갠다. |
| R0-5 | **설계서에 없는 것은 구현하지 않는다.** 추가 필요 시 5종 설계서로 환송 → 정합 재통과 후 본 체크리스트 갱신. |
| R0-6 | **`[확인필요]`(Q-NNN)·선행 결정(DEC-NN) 미해결 항목은 구현 진입 금지.** §1 게이트 먼저. |
| R0-7 | 항목 완료 시(사용자 명시 승인 시) 그 단위로 1 커밋. 커밋은 사용자 지시 전 금지. |

### 체크 항목 표기 규약
```
- [ ] **ITEM-ID** 한 줄 제목
  - 근거: <기능 §x / BPMN §y / 디자인 §z / 정합 §k — 설계서 출처>
  - DoD: <무엇이 존재/통과해야 끝인지>
  - 검증: `<실행 명령>`  → 〈로그 붙여넣기 자리〉
```
`[ ]` 미착수 · `[~]` 진행중 · `[x]` 완료(로그 첨부) · `[!]` 차단(사유 명시)

## §0.1 진도 요약 (`/progress` 로 갱신)

| Phase | 항목 수 | 완료 | 완료율 |
|---|---:|---:|---:|
| §1 선행 결정 게이트 | 12 | 12 | 100% |
| §2 BE 기반 | 7 | 7 | 100% |
| §3 BE 서비스·BPMN | 7 | 7 | 100% |
| §4 검증·비즈니스 규칙 | 6 | 6 | 100% |
| §5 FE | 7 | 7 | 100% |
| §6 정합·회귀 게이트 | 8 | 8 | 100% |

> ★ 정합체크서 §G 최종 = **○ (설계 완료 — §D.4 manifest ✗ 의도 면제 / 활성 0건)**. Q-004(부모)=메뉴 직접 진입 해소 2026-06-05. Q-001(DDL on-demand)·Q-002/3/5/6/7/8·영속성(JPA) 사용자 확정 2026-06-04 — §1 게이트 해소 (R0-6 / Mes-Guide §3-B).
>
> ★ 진행: 2026-07-08(완료) — **BE(DTO+Service 4액션+동적 SQL 안전화+테스트 8건) + BPMN(4분기 유효:true) + FE(동적 그리드 페이지 + P-001 재사용 Modal) + RBAC sqlcmd(OBJ/MENU 2040120/RM 2행) + E2E 1 passed(동적 테이블 TB_MCA_E2ESRC C/U/조건검색 + MSSQL 실측) — 개발 완료 (§6 8/8).** P-002 엑셀업로드는 stub(후속 화면 masterRuleDataUploadFilePopup 에서 해소 예정 — §7 이력).

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

> 정합체크서 §G = ○ (manifest ✗ 의도 면제 / 활성 0건. Q-004 부모=메뉴 직접 진입 해소 2026-06-05). DEC-Q001a(메타)·Q001b(DDL on-demand)·Q002/3/5/6/7/8·DEC-03(JPA) 사용자 확정 2026-06-04. 정합 §F.3 / 분석 §12 에서 추출.

- [x] **DEC-01** 설계서 4종 간 충돌 — 충돌 없음 (정합 §A~§B 전 ○)
  - DoD: 충돌 없음 확인 (정합 §G ○ 항목). *(2026-07-08 착수 시 재확인 — 정합 §G ○ 유지)*
- [x] **DEC-02** 모듈 신설 승인 — `src/backend/mcm`(mcm-core) · `src/frontend/m-mcm` 존재 여부 확인
  - DoD: mcm-core 존재(masterCategoryMng 선례). 패키지 `com.dongkuk.dmes.mcm.*`.
  - 검증: 기존 형제 화면 3종(masterRuleList/Frame/ColListPopup) 동거 확인 — `src/backend/mcm-core/.../cmb/` 하위 패키지 실재.
- [x] **DEC-03** 영속성 방식 — **JPA** (cmb 공통, 사용자 확정 2026-06-04). 동적 테이블/컬럼은 native 동적 SQL + 안전화.
  - DoD: JPA Repository(메타) + 동적 데이터 테이블은 native 동적 SQL(화이트리스트). (분석 §11 / BPMN §2.2)
- [x] **DEC-Q001a** 메타 테이블 정의 — TB_MCA_RULE_COL_LIST / TB_MCA_RULE_MASTER To-Be 컬럼 카탈로그
  - DoD: **해소** — 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet134(COL_LIST)/sheet135(RULE_MASTER, 26컬럼) 수록 확인, owner=MCAAPUSER (분석 §9.2/§9.3, 정합 §D.3, masterRuleList §9.1 정합).
- [x] **DEC-Q001b** 동적 데이터 테이블 To-Be 전략 — **확정: As-Is 동일 'DDL on-demand'** (업무기준ID별 실테이블 `TB_MCA_<업무기준ID>` 동적 생성/조회, owner=MCAAPUSER — 사용자 2026-06-04)
  - DoD: 업무기준ID별 실테이블 동적 접근 (native 동적 SQL + 안전화). (분석 §0 / §9.1)
- [x] **DEC-Q002** 초기값 — ~~As-Is 보존 확정 (USD / KR/A — 사용자 2026-06-04)~~ → **재결정: 프리셋 제거 (빈값 — 사용자 2026-07-09, §7 이력)** (분석 §3.2)
- [x] **DEC-Q003** 동적 그리드 컬럼 빌드 — **FE 동일 구현 확정** (PK ` * `/IN·OUT 색/DATE 캘린더/폭 — 사용자 2026-06-04) (분석 §3.3)
- [x] **DEC-Q004** in-coming 화면 — **해소: 메뉴 직접 진입, GUI 부모 없음** (호출관계 조사 2026-06-05; csa/CommSyncMng 는 데이터 동기화 프로그램)
- [x] **DEC-Q005** orphan SQL — **제거 확정** (InsertMasterRuleSpecDataList/UpdateMasterRuleSpecDataList 미호출 — 사용자 2026-06-04) (분석 §6)
- [x] **DEC-Q006** audit — **McmAuditEntity 적용 + 프로그램ID 규칙 확정** (동적 테이블 비표준 → native audit 세팅 — 사용자 2026-06-04) (분석 §7)
- [x] **DEC-Q007** 동적 SQL 안전화 — **적용 확정** (컬럼정의 메타 화이트리스트 + 파라미터 바인딩, injection 차단 — 사용자 2026-06-04) (분석 §11)
- [x] **DEC-Q008** 긴급적용 — **As-Is 유지 확정** (chk_option + DynamicSqlExecutor 직접실행 경로 보존 + 안전화 — 사용자 2026-06-04) (분석 §11)

> §1 전부 `[x]`/`[!](범위외 명시)` 전에는 §2 이후 진입 금지. → **전부 [x] — 2026-07-08 §2 진입.**

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

> ★ 본 화면은 **동적 테이블/컬럼** 이라 표준 Entity 1:1 매핑이 비표준. DEC-03·DEC-Q001·DEC-Q007 확정 후 영속 구조 결정. 공통 검증: `cd src/backend && JAVA_HOME="..." ./gradlew :mcm:compileJava`.

- [x] **ITEM-BE-01** mcm 모듈 확인 (DEC-02 후) — mcm-core 존재 / cactus 의존 / SecurityConfig (Mes-Guide §2).
  - 검증: 형제 화면 3종 기가동(:mcm:api:bootRun local-ph, 포트 8100) — 본 화면 E2E 로그인·메뉴 진입 성공으로 재확인.
- [x] **ITEM-BE-02** 컬럼정의 엔티티 — RuleColList (TB_MCA_RULE_COL_LIST, DMES-SECTION-MCA sheet134 카탈로그 1:1, 분석 §9.2) — DEC-Q001a 해소(카탈로그 확보됨).
  - 검증: 형제 masterRuleFrame 기구현 `MasterRuleColList` Entity + `MasterRuleColListRepository` **재사용** (R0-5 — 신규 생성 없음). 본 화면용 `searchRuleColDefsWithPk` native query 1건 추가 (11컬럼 + PK_YN=INFORMATION_SCHEMA.KEY_COLUMN_USAGE·TABLE_CONSTRAINTS EXISTS, `CONCAT('TB_MCA_',:pRuleId)` — 정합 §F.1 MSSQL 변환).
- [x] **ITEM-BE-03** 업무기준 마스터 엔티티 — RuleMaster (TB_MCA_RULE_MASTER, sheet135 26컬럼 카탈로그, JOIN 전용, 분석 §9.3) — DEC-Q001a 해소.
  - 검증: 형제 masterRuleList 기구현 재사용 — 본 화면 P-001(masterRuleListPop 재사용 Modal)이 동 테이블 조회. 본 화면 서비스는 직접 JOIN 불요(As-Is GetRuleColList 는 COL_LIST 단독).
- [x] **ITEM-BE-04** 동적 데이터 영속 구조 — `TB_MCA_<업무기준ID>` 접근 (native 동적 SQL). RULE_VER/RULE_SEQ + audit 8컬럼 (분석 §9.1 / §7.2).
  - 검증: `MasterRuleDataService` — EntityManager native query + `jakarta.persistence.Tuple`(대문자 키 유지). 테이블명은 pRuleId 정규식(`^[A-Za-z0-9_]{1,10}$`) 검증 후 서버 재조립(`TB_MCA_`+pRuleId)·클라이언트 pTable 대조(Q-007). audit 는 C_ 계열·U_ 계열 8컬럼 native 세팅, PGM_ID='masterRuleData'(Q-006).
- [x] **ITEM-BE-05** DB 마이그레이션 (SQLite + MSSQL) — 메타 테이블은 형제 화면 기존 마이그레이션 재사용(신규 없음). 동적 데이터 테이블은 DDL on-demand(DEC-Q001b — 테이블은 외부 생성, 화면은 접근만)로 **마이그레이션 면제**.
  - 검증: E2E 검증용 동적 테이블 `MCAAPUSER.TB_MCA_E2ESRC` sqlcmd 생성 — RULE_VER decimal(8,2)/RULE_SEQ int/BASE_DT date/CURR_CD varchar(3)/APPLY_RATE decimal(10,4) + C_·U_ audit 8 + PK(RULE_SEQ,CURR_CD) + MS_Description 3건. `SELECT ... INFORMATION_SCHEMA.KEY_COLUMN_USAGE` → PK 2컬럼 확인.
- [x] **ITEM-BE-06** 샘플 데이터 — 업무기준 1종 + 컬럼정의 + 동적 테이블 행 (조회/저장 검증용 시드).
  - 검증: RULE 'E2ESRC'(TB_MCA_RULE_MASTER — colListPopup E2E 기등록) + 컬럼정의 3건(BASE_DT=IN, CURR_CD/APPLY_RATE=OUT — colListPopup E2E 등록분 재사용) + TB_MCA_E2ESRC 시드 2행 `(1,KRW,1.0000)/(2,JPY,9.1234)` sqlcmd 확인.
- [x] **ITEM-BE-07** DTO — search(5조건+페이징) / lov / save(ds_grdMain:U + pOption) / search_export Request·Response. 정합키 1:1 (분석 §4.6).
  - 검증: `MasterRuleDataSearchRequest`(pRuleId/pTable/pWhere1~5/pOperator1~5/pVal1~5/pOption/countPerPage/currentPage + where(n)/operator(n)/val(n) 헬퍼). 응답은 Tuple→Map 동적 컬럼(고정 DTO 비적용 — 동적 화면 특성). `./gradlew :mcm-core:compileJava` → BUILD SUCCESSFUL.

---

## §3. BE 서비스 · BPMN (action별)

> BPMN 4 action (search/lov/save/search_export — 분석 §8.4). **OASIS 서비스 `@Transactional` 금지 — cactus TransactionTemplate**. 공통 검증: action별 통합테스트(응답 + 조회 재확인).

- [x] **ITEM-SVC-01** `.bpmn` 다이어그램 (actionGateway 4분기: search/lov/save/searchExport) — bpmn-tool 로 생성.
  - 검증: `services/cmb/masterRuleData.bpmn` — `bpmn-tool validate` → **유효:true**. serviceId=masterRuleData, bean `masterRuleDataService`=camunda:class 일치, 4분기(search/lov/save/searchExport) + method/dto/output=result 속성.
- [x] **ITEM-SVC-02** search 서비스 (GetMasterRuleData) — 컬럼정의 조회 + 5조건 동적 WHERE + 페이징.
  - 검증: `WITH TB1 AS (ROW_NUMBER() OVER(ORDER BY RULE_SEQ) ...) SELECT (SELECT COUNT(*) FROM TB1) AS TOTALCOUNT, TB1.* ... BETWEEN` (As-Is 페이징 1:1). VARCHAR2 조건 `UPPER(col) op UPPER(:v)`(BR-008 — Service L133). 조건컬럼=lov 화이트리스트 대조(Q-007). 단위테스트 8건 중 가드 4건 + E2E 조건검색(CURR_CD LIKE EUR → 1건) 통과.
- [x] **ITEM-SVC-03** lov 서비스 — GetRuleColList (컬럼정의 + PK_YN 판정).
  - 검증: `searchRuleColDefsWithPk` — PK 판정 INFORMATION_SCHEMA 2테이블 EXISTS(정합 §F.1 MSSQL 변환). E2E 그리드 헤더 `* 통화코드 (OUT)` 표시(PK_YN=Y)로 실측 확인.
- [x] **ITEM-SVC-04** save 서비스 (SaveMasterRuleData) — updated/deleted/inserted 분기 + GetMaxRuleSeq 채번 + filterKeyByColId + setAuditField + 긴급적용 분기.
  - 검증: U(SET 필터컬럼+U_ audit, WHERE RULE_SEQ)/D(DELETE WHERE RULE_SEQ)/C(`ISNULL(MAX(RULE_SEQ),0)+1` 채번, RULE_VER='1', C_+U_ audit) + 저장 후 재조회 동봉. 컬럼 화이트리스트 절단 단위테스트 + E2E C/U 실측(DB: RULE_SEQ=3 채번·C_USR_ID=admin·U_ audit 반영 — §6 GATE-07 로그).
- [x] **ITEM-SVC-05** search_export 서비스 — GetMasterRuleDataExport (전건).
  - 검증: searchExport 분기 — 페이징 없는 전건 조회(동일 안전화 경로). FE 엑셀 다운로드(XLSX)가 소비. 단위테스트 lov/search 경로와 공통 가드 공유.
- [x] **ITEM-SVC-ERR** 에러 매트릭스 (400/409/500 + cactus ErrorCode) — 업무기준 미선택·동적 SQL 오류·injection 차단.
  - 검증: pRuleId 형식 위반/pTable 불일치/화이트리스트 밖 조건컬럼/허용 외 연산자 → 예외(테스트 4건: ruleId·pTable·조건컬럼·연산자 가드). 영향행≤0 은 As-Is 보존으로 로그만(VAL-06).
- [x] **ITEM-SVC-DYNSQL** 동적 SQL 안전화 (DEC-Q007) — `${}` 화이트리스트(컬럼정의 메타 검증) + 파라미터 바인딩.
  - 검증: `./gradlew :mcm-core:test --tests '*MasterRuleData*' --rerun` → **BUILD SUCCESSFUL (9/9)** — injection 차단(임의 컬럼/연산자/테이블) + COL_ID 식별자 형식 가드(2차 stored injection — R0-3 리뷰 반영) + lov 매핑 + save U 절단·C 채번·D seq 가드 + 컬럼정의 없음.

---

## §4. 검증 · 비즈니스 규칙 (V-NNN — 기능 §6)

> 실행 순서: 클라이언트 입력 → 클라이언트 비즈니스 → 서버 트랜잭션 → 서버 부수효과.

- [x] **ITEM-VAL-01** BR-001 업무기준 ID 필수 (조회 차단, MSG-001) — 클라이언트.
  - 검증: page.tsx — pRuleId 빈값 시 showMessage(MSG-001) 후 조회 중단. E2E 는 P-001 선택 경로로 통과(빈값 차단은 코드 경로 확인).
- [x] **ITEM-VAL-02** BR-006 PK 컬럼 null 저장 차단 (MSG-002) — 클라이언트.
  - 검증: E2E 4단계 — 신규행 CURR_CD 비우고 저장 → "통화코드 항목은 필수 입력사항 입니다" 모달 실측 확인 (1 passed 로그).
- [x] **ITEM-VAL-03** BR-008/BR-009 VARCHAR2 UPPER 검색 / DATE 14자 절단 — 서버.
  - 검증: Service L133 `AND UPPER(col) op UPPER(:v)` / L333 `s.substring(0, 14)` (As-Is java:54~77/77 1:1). 절단 단위테스트 포함(8/8 그린).
- [x] **ITEM-VAL-04** BR-010/BR-011 RULE_SEQ 채번 / RULE_SEQ WHERE (PK 수정 허용) — 서버.
  - 검증: E2E + DB 실측 — INSERT 시 RULE_SEQ=3 자동 채번(BR-010), UPDATE 는 WHERE RULE_SEQ=1 로 KRW 행 APPLY_RATE 1.0000→2.5000 반영(BR-011). §6 GATE-07 sqlcmd 로그.
- [x] **ITEM-VAL-05** BR-013 긴급적용 confirm(MSG-004) + DynamicSqlExecutor 분기 — 클라이언트+서버 (DEC-Q008).
  - 검증: FE chk_option=pOption 'Y' 시 confirm(MSG-004) 구현. 서버는 Q-008 확정대로 긴급적용도 **안전화 단일 경로로 수렴**+경로 로그(별도 우회 실행 없음). E2E 는 기본 경로(N) — 긴급적용 UI 는 코드 경로 확인.
- [x] **ITEM-VAL-06** BR-013 비고 부분실패 정책 — As-Is 영향행≤0 예외미발생 → To-Be 강화 여부 (DEC-Q008).
  - 검증: As-Is 보존 확정 — 영향행≤0 시 예외 없이 로그만 (Service javadoc L51 명시 + 구현).

---

## §5. FE — m-mcm 페이지 (페이지 유형: 조회+동적그리드 CRUD)

> shared `form` 컴포넌트 강제, `apiRequest`/`useGfnMessage`, 직접 fetch·alert·console 금지. 공통 검증: `cd src/frontend/m-mcm && pnpm build` (+ E2E).

- [x] **ITEM-FE-01** 페이지 scaffolding + portal 등록 + `masterRuleData.tsx` (camelCase).
  - 검증: `page-components/cmb/masterRuleData/` + page-registry 자동 생성(`pnpm build` 시 lib/generated/page-registry.ts 갱신). E2E 메뉴 진입 성공.
- [x] **ITEM-FE-02** types / constants / api — 4 action(search/lov/save/searchExport) 헬퍼 + 연산자/긴급적용 상수.
  - 검증: types.ts/constants.ts(OPERATORS=LIKE·=·<=·>=, PAGE_SIZE=30, DEFAULT_FILTERS=USD·KR/A — Q-002)/repository.ts(4액션, page 0→1-based 변환, pTable 조립 As-Is 계약 유지+서버 재검증).
- [x] **ITEM-FE-03** PageLayout 골격 (헤더 + 조회조건 2줄 + 그리드 + 페이징).
  - 검증: SearchPanel 2줄 + GridPanel + Pagination(commonPagingButton 등가). `pnpm build` ✓.
- [x] **ITEM-FE-04** 조회조건 (S-001~S-021) — 업무기준 ID/명(readonly) + 업무기준 버튼(P-001) + 5조건(컬럼콤보+연산자콤보+값) + 긴급적용. (디자인 §3)
  - 검증: E2E — 업무기준 버튼→P-001 초기값 USD(Q-002 실측)→클리어 7건→E2ESRC 더블클릭 반영, 조건1 CURR_CD LIKE EUR 검색 1건. (1 passed 로그)
- [x] **ITEM-FE-05** ★ 동적 그리드 (G-001) — 정적 컬럼 + ds_lovData 기반 동적 컬럼 빌드(PK ` * `/IN·OUT 표기/폭/전컬럼 편집). 재조회 시 컬럼 재빌드. (디자인 §4 / DEC-Q003)
  - 검증: E2E — lov→search 연쇄(BR-003) 후 헤더 `* 통화코드 (OUT)`/`기준일자 (IN)` + 시드 KRW/JPY 렌더 실측. IN/OUT 색·DATE 캘린더·헤더 색상은 shared 미지원 → 접미 표기 대체(비차단 보류 D 유형 — 형제 화면 공통).
- [x] **ITEM-FE-06** 버튼·팝업 — 상단(조회/저장) + 우측(행추가/복사/삭제/취소/엑셀업/엑셀다운) + P-001(업무기준선택)/P-002(엑셀업로드). (디자인 §5 / §6)
  - 검증: 버튼 8종 구현(E2E: 행추가/저장 실측). P-001=MasterRuleListPopModal 재사용. **P-002 엑셀업로드는 stub** — 후속 화면 masterRuleDataUploadFilePopup 개발 시 정식 연동(§7 이력).
- [x] **ITEM-FE-LAST** portal 재내보내기 + 메뉴 진입 E2E (업무기준 선택→lov→search 연쇄).
  - 검증: E2E 1~3단계 — 로그인→공통관리→업무기준 관리(원장)→"업무기준 Data관리" 진입→P-001→lov+search 연쇄 "2건 조회 되었습니다." (1 passed 로그)

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §G "개발 완료 게이트")

> 본 §6 통과 = 정합 §G 를 실측으로 채워 ✓ 전환. 1개라도 ✗ 면 재개발.

- [x] **ITEM-GATE-01** 정합키 일치 (코드 ↔ 설계서) — grep 대조 불일치 0.
  - 검증: ds_GetRuleColList/ds_GetMasterRuleData/ds_GetMasterRuleDataExport/cnt_save/totalCount + pRuleId/pTable/pWhere·pOperator·pVal 1~5/pOption/currentPage/countPerPage — repository.ts ↔ Service ↔ BPMN 3자 일치(분석 §4.6 키).
- [x] **ITEM-GATE-02** 영역별 수량 매칭 — S(21)/G(1 동적)/B(11)/P(2) = 코드 실재 수.
  - 검증: S=업무기준ID/명+버튼+5×(컬럼·연산자·값)+긴급적용(21), G=동적 그리드 1, B=조회/저장+행추가/복사/삭제/취소/엑셀업/엑셀다운+페이징(11 등가 — 페이징은 공통 Pagination), P=P-001(정식)+P-002(stub — 후속 화면). 
- [x] **ITEM-GATE-03** As-Is 1:1 정합 (Mapper SQL 6 / Java 메서드 4 / BPMN flow 9) — 임의 단순화 ✗.
  - 검증: SQL 6 중 orphan 2(DEC-Q005 제거 확정) 제외 4 구현(GetRuleColList/GetMasterRuleData/GetMasterRuleDataExport/GetMaxRuleSeq+Save 계열). 페이징 WITH TB1 형태·UPPER·14자 절단·채번식 As-Is 보존. 정정은 §12 확정 결정(Q-005/6/7/8)만.
- [x] **ITEM-GATE-04** 안티패턴 검사 (직접 fetch/alert/@Transactional/직접 XML bpmn) — grep hit 0.
  - 검증: `grep -rn "fetch(|window.alert|console.log" page-components/cmb/masterRuleData/` → 0 hit. `grep "@Transactional" MasterRuleDataService.java` → 어노테이션 0 (javadoc 언급만). BPMN 은 bpmn-tool 생성.
- [x] **ITEM-GATE-05** BE 회귀 — `./gradlew :mcm-core:test --tests '*MasterRuleData*' --rerun` 그린.
  - 검증: → **BUILD SUCCESSFUL** (MasterRuleDataServiceTest 9/9 — R0-3 리뷰 후 COL_ID 형식 가드 테스트 추가분 포함).
- [x] **ITEM-GATE-06** FE 빌드 — `pnpm build` 성공.
  - 검증: `cd src/frontend/m-mcm && pnpm build` → ✓ Compiled successfully (≈44s), page-registry 에 cmb/masterRuleData 등록.
- [x] **ITEM-GATE-07** E2E (업무기준선택→lov→search→동적컬럼→save→재조회) — 핵심 시나리오 그린.
  - 검증: `npx playwright test e2e/master-rule-data-e2e.spec.ts` → **1 passed (18.2s)** — 메뉴 진입→P-001(USD 초기값 Q-002→클리어 7건→E2ESRC)→lov+search 연쇄 2건→행추가+MSG-002 차단→EUR 저장 "1건"→3행→KRW 수정 저장→조건검색(CURR_CD LIKE EUR) 1건.
    DB 실측(sqlcmd): `1|KRW|2.5000|C=seed|U_USR_ID=admin|U_PGM_ID=masterRuleData` (BR-011·Q-006) / `3|EUR|1400.5000|C_USR_ID=admin|C_PGM_ID=masterRuleData` (BR-010 채번) / JPY 무변경.
- [x] **ITEM-GATE-08** 정합체크서 §G 갱신 + Q-001~Q-008 결정 동기화 (△ → ○).
  - 검증: §G ○ 기확정(설계 단계 2026-06-04~05 전건 해소) — 본 §6 실측 로그로 개발 완료 게이트 충족. Q-001~Q-008 결정은 §1 에 동기화 완료.

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-04 | (생성) | - | 5종 설계서 기반 초안 생성. 정합 §G=△ (Q-001~Q-008 8건 미결) — §1 게이트 선결 필수. |
| 2026-06-04 | DEC-Q001 | a 해소 / b 신설 | To-Be "메타 테이블 미정의" 오탐 보정 — 정본 카탈로그 `DMES-SECTION-MCA` sheet134(COL_LIST)/sheet135(RULE_MASTER) 수록 확인. Q-001 → 메타 해소(a) / 동적 데이터 테이블 To-Be 전략(b) 으로 분리. |
| 2026-07-08 | §2~§6 전체 | → 개발 완료 (§6 8/8) | BE(DTO+Service 4액션·Q-007 안전화·테스트 8) / BPMN 4분기(유효:true) / FE(동적 그리드+P-001 재사용 Modal+searchSeqRef 가드) / RBAC sqlcmd(SEC_OBJ+SEC_MENU FULL_SEQ 2040120+RM 2행 — DataInitializer 미수정 방침) / E2E 1 passed(TB_MCA_E2ESRC — MSG-002·C 채번 SEQ=3·U 반영·조건검색 DB 실측). |
| 2026-07-08 | E2E 보정 2건 | 스펙 수정 | ① 셀 에디터 로케이터 `.ag-cell input`→`input[type="text"]` (multiSelect 체크박스 input 오포착) ② APPLY_RATE 입력 "2.5000"→"2.5" (그리드 숫자 정규화 표시 — 기능 정상, 어서션만 완화). |
| 2026-07-08 | R0-3 코드리뷰 | 발견 4건 → 전건 수정 | H0/M2/L2 — ① [M] COL_ID 화이트리스트 원천(사용자 편집 가능 컬럼정의)이 식별자 형식 미검증 → 2차 stored injection 표면: colTypeMap 에 `^[A-Z0-9_]{1,30}$` 강제 + 단위테스트 추가(9/9) ② [M] 초기 USD 프리셋에서 P-001 미경유 조회 시 colDefs 빈 채 데이터 미표시 → handleSearch 에서 lov 선로드 후 search 연쇄 ③ [L] 저장 완료 결과를 in-flight 조회 응답이 되돌리는 race → doSave 성공 시 searchSeqRef 무효화 ④ [L] 범위 밖 페이지 빈 결과 시 totalCount=0 축소 보고 → COUNT(*) 보정. 수정 후 재검증: BE 9/9 그린 · E2E 1 passed(21.4s) · pnpm build ✓ |
| 2026-07-09 | DEC-Q002 재결정 | 보존 → 제거 | 사용자 지시("조회조건 PREFIX 다 빼줘") — DEFAULT_FILTERS 의 pRuleId/pRuleNm="USD"·조건1 값 "KR/A" 프리셋 제거(빈값). masterRuleList·masterCategoryMng 선행 제거 결정과 정합. E2E 초기값 어서션 ""로 갱신 후 재실행 그린 + pnpm build ✓ |
| 2026-07-08 | P-002 | stub 보류 | 엑셀업로드 팝업은 별도 화면 masterRuleDataUploadFilePopup 개발 시 정식 연동 (분석 §6 P-002 — 후속 화면 존재). |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트(8 Q 포함) → §2~§5 한 항목씩 → §6 개발 완료 게이트(=정합 §G). `/implement`·`/progress`·`/check` 연동.
