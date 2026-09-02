---
screenId: masterRuleDataList
asIsId: MasterRuleDataList
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleDataList_분석리포트.md
  - masterRuleDataList_기능설계서.md
  - masterRuleDataList_디자인설계서.md
  - masterRuleDataList_BPMN설계서.md
  - masterRuleDataList_정합체크.md
---

<!--
  본 산출물 = MasterRuleDataList (업무기준 상세조회 / masterRuleDataList) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗ (설계서에 없으면 설계로 환송).
  라우터 분기 3 (MES 개발, Mes-Guide §3) 의 진행 추적 정본. 정합체크서 §G 로 수렴.
-->

# 업무기준 상세조회 (masterRuleDataList) 개발 체크리스트

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
| §1 선행 결정 게이트 | 9 | 9 | 100% |
| §2 BE 기반 | 6 | 6 | 100% |
| §3 BE 서비스·BPMN | 5 | 5 | 100% |
| §4 검증·비즈니스 규칙 | 4 | 4 | 100% |
| §5 FE | 7 | 7 | 100% |
| §6 정합·회귀 게이트 | 8 | 8 | 100% |

> ★ 정합체크서 §G 최종 = **○ (설계 완료 — §D.4 manifest ✗ 의도 면제 / 활성 0건)**. Q-004(부모)=메뉴 직접 진입 해소·Q-009 변수명 정정 확정 2026-06-05. Q-001a(메타 수록)·Q-001b(DDL on-demand)·Q-002/3/7·영속성(JPA) 사용자 확정 2026-06-04 — §1 게이트 해소 (R0-6 / Mes-Guide §3-B).
>
> ★ 진행: 2026-07-08(완료) — **BE(DTO+Service 3액션 조회 전용 — Q-007 안전화·Q-009 변수명 정정+테스트 6건) + BPMN(3분기 유효:true) + FE(읽기전용 동적 그리드 + 마스터코드 셀클릭 P-002=선행 MasterCodeSelPopDialog 재사용 + P-001 재사용 Modal) + RBAC sqlcmd(OBJ/MENU 2040130/RM 2행) + E2E 1 passed(P-002 연동 실측 포함) — 개발 완료 (§6 8/8).** 사용자 결정(2026-07-08): P-002 는 stub 아닌 **동시 구현(2안)** — masterCodeSelPop BE 완성으로 정식 연동.

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

> 정합체크서 §G = ○ (manifest ✗ 의도 면제 / 활성 0건. Q-004 부모=메뉴 진입 해소·Q-009 변수명 정정 확정 2026-06-05). DEC-Q001a(메타)·Q001b(DDL on-demand)·Q002/3/7·DEC-03(JPA) 사용자 확정 2026-06-04. 정합 §F.3 / 분석 §12 에서 추출.

- [x] **DEC-01** 설계서 4종 간 충돌 — 충돌 없음 (정합 §A~§B 전 ○) *(2026-07-08 착수 시 재확인 — 정합 §G ○ 유지)*
  - DoD: 충돌 없음 확인 (정합 §G ○ 항목).
- [x] **DEC-02** 모듈 신설 승인 — `src/backend/mcm`(mcm-core) · `src/frontend/m-mcm` 존재 여부 확인
  - DoD: mcm-core 존재(masterCategoryMng / masterRuleData 선례). 패키지 `com.dongkuk.dmes.mcm.*`.
  - 검증: 형제 화면 5종(masterRuleList/Frame/ListPop/ColListPopup/Data) 동거 실재 + E2E 로그인·메뉴 진입 성공.
- [x] **DEC-03** 영속성 방식 — **JPA** (cmb 공통, 사용자 확정 2026-06-04). 동적 테이블/컬럼은 native 동적 SQL + 안전화. 본 화면은 조회 전용(저장 분기 없음).
  - DoD: JPA Repository(메타) + 동적 데이터 테이블은 native 동적 SQL(화이트리스트). (분석 §11 / BPMN §2.2)
- [x] **DEC-Q001a** 메타 테이블 정의 — TB_MCA_RULE_COL_LIST / TB_MCA_RULE_MASTER To-Be 컬럼 카탈로그
  - DoD: **해소** — 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` sheet134(COL_LIST)/sheet135(RULE_MASTER, 26컬럼) 수록 확인, owner=MCAAPUSER (분석 §9.2/§9.3, 정합 §D.3, masterRuleList §9.1 정합).
- [x] **DEC-Q001b** 동적 데이터 테이블 To-Be 전략 — **확정: As-Is 동일 'DDL on-demand'** (업무기준ID별 실테이블 `TB_MCA_<업무기준ID>` 동적 조회, owner=MCAAPUSER — 사용자 2026-06-04)
  - DoD: 업무기준ID별 실테이블 동적 접근 (native 동적 SQL + 안전화). 본 화면은 조회만(INSERT/UPDATE/DELETE 없음). (분석 §0 / §9.1)
- [x] **DEC-Q002** 초기값 — ~~As-Is 보존 확정 (edt_ruleId/edt_ruleNm="USD" — 사용자 2026-06-04)~~ → **재결정: 프리셋 제거 (빈값 — 사용자 2026-07-09, §7 이력)** (분석 §3.2)
- [x] **DEC-Q003** 동적 그리드 컬럼 빌드 — **FE 동일 구현 확정** (DATE 캘린더/폭 13×len/CODE_YN 파란밑줄·포인터 클릭 — 사용자 2026-06-04) (분석 §3.3)
- [x] **DEC-Q004** in-coming 화면 — **해소: 메뉴 직접 진입, GUI 부모 없음** (호출관계 조사 2026-06-05) (분석 §5.2)
- [x] **DEC-Q007** 동적 SQL 안전화 — **적용 확정** (컬럼정의 메타 화이트리스트 + 파라미터 바인딩, `${pTable}`/`${pWhereN}`/`${pOperatorN}`/`${pValN}` injection 차단 — 사용자 2026-06-04) (분석 §11)
- [x] **DEC-Q009** Java 변수명 정정 — **To-Be 정정 확정** (`pTable=pRuleId` 혼동 해소 — 사용자 2026-06-05) (분석 §7.1 / §11)
  - 검증: To-Be DTO/Service 는 ruleId(검증·재조립 원천)와 table(조립 결과)을 의미대로 분리 — `requireRuleId`/`qualifiedTable` (Service javadoc 명시).

> §1 전부 `[x]`/`[!](범위외 명시)` 전에는 §2 이후 진입 금지. 본 화면은 조회 전용이라 masterRuleData 의 DEC-Q005(orphan)/Q006(audit)/Q008(긴급적용) 비해당. → **전부 [x] — 2026-07-08 §2 진입.**

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

> ★ 본 화면은 **동적 테이블/컬럼** 이라 표준 Entity 1:1 매핑이 비표준. 조회 전용(저장 엔티티/채번/audit 불필요). 공통 검증: `./gradlew :mcm-core:compileJava`.

- [x] **ITEM-BE-01** mcm 모듈 확인 (DEC-02 후) — mcm-core 존재 / cactus 의존 / SecurityConfig (Mes-Guide §2).
  - 검증: 형제 화면 기가동(:mcm:api:bootRun local-ph, 포트 8100) — 본 화면 E2E 메뉴 진입 성공으로 재확인.
- [x] **ITEM-BE-02** 컬럼정의 엔티티 — RuleColList — masterRuleData 와 공유.
  - 검증: 형제 기구현 `MasterRuleColList` Entity + `MasterRuleColListRepository` **재사용** (R0-5 — 신규 생성 없음). lov 는 `searchRuleColDefsWithPk` 재사용 — 본 화면 As-Is GetRuleColList(JOIN RULE_MASTER + MASTER_CODE_DIV AS CODE_YN + PK_YN 서브쿼리)와 동일 SQL 확인 (분석 §6.1 #1 ↔ Repository 쿼리 1:1).
- [x] **ITEM-BE-03** 업무기준 마스터 엔티티 — RuleMaster — masterRuleData 와 공유.
  - 검증: 형제 기구현 재사용 — lov 쿼리의 JOIN 대상 + P-001(masterRuleListPop 재사용 Modal)이 동 테이블 조회.
- [x] **ITEM-BE-04** 동적 데이터 조회 구조 — `TB_MCA_<업무기준ID>` 읽기 접근 (native 동적 SQL). ROW_NUMBER 페이징 + 5조건 동적 WHERE (READ only).
  - 검증: `MasterRuleDataListService` — EntityManager native + Tuple(대문자 키). 테이블명 = pRuleId 정규식(`^[A-Za-z0-9_]{1,10}$`) 검증 후 서버 재조립 + pTable 대조(Q-007). 조건컬럼 = 컬럼정의 화이트리스트(+COL_ID 식별자 `^[A-Z0-9_]{1,30}$` 강제 — 형제 R0-3 리뷰 반영 동일) + RULE_VER/RULE_SEQ. 연산자 4종. 값 전부 바인딩.
- [x] **ITEM-BE-05** DB 마이그레이션 — 메타 테이블은 형제 기존 재사용(신규 없음). 동적 데이터 테이블 = DDL on-demand(마이그레이션 면제). E2E 시드 = 형제 사이클의 `MCAAPUSER.TB_MCA_E2ESRC`(2행) + 본 화면용 보강: 컬럼정의 `CURR_CD.MASTER_CODE_DIV='Y'`(BR-008 셀클릭 대상) sqlcmd UPDATE.
  - 검증: sqlcmd — `COLDEF: BASE_DT=N / CURR_CD=Y / APPLY_RATE=N` 확인.
- [x] **ITEM-BE-06** DTO — search(5조건+페이징) / lov / search_export Request. 정합키 1:1 (분석 §4.6). 저장 DTO 없음(조회 전용).
  - 검증: `MasterRuleDataListSearchRequest` (pRuleId/pTable/pWhere1~5/pOperator1~5/pVal1~5/countPerPage/currentPage — pOption 없음) + where(n)/operator(n)/val(n) 헬퍼. `compileJava` BUILD SUCCESSFUL.

---

## §3. BE 서비스 · BPMN (action별)

> BPMN 3 action (search/lov/search_export — 분석 §8.4, save 없음). **OASIS 서비스 `@Transactional` 금지**.

- [x] **ITEM-SVC-01** `.bpmn` 다이어그램 (actionGateway 3분기: search/lov/searchExport) — bpmn-tool 생성.
  - 검증: `services/cmb/masterRuleDataList.bpmn` — `bpmn-tool validate` → **유효:true** (경고 1: default flow 미설정 — 형제 masterRuleData 4분기와 동일 As-Is 패턴, 비차단). serviceId=masterRuleDataList, bean `masterRuleDataListService`=camunda:class 일치, method/dto/output=result.
- [x] **ITEM-SVC-02** search 서비스 (GetMasterRuleDataList) — 컬럼정의 조회 + 5조건 동적 WHERE + 페이징 + 변수명 정정(Q-009).
  - 검증: `WITH TB1 AS (ROW_NUMBER() OVER(ORDER BY RULE_SEQ) ...) ... BETWEEN` (As-Is Mapper #2 1:1). VARCHAR2 조건 `UPPER(col) op UPPER(:v)`(BR-007 — As-Is java:54~82 의 UPPER 문자열 치환을 바인딩으로 안전화). 빈 페이지 totalCount COUNT(*) 보정(형제 R0-3 반영 동일). 단위테스트 search_정상 — SQL 형태/바인딩 검증.
- [x] **ITEM-SVC-03** lov 서비스 — GetRuleColList (컬럼정의 + PK_YN + CODE_YN).
  - 검증: `searchRuleColDefsWithPk` 재사용 (PK 판정 INFORMATION_SCHEMA — 정합 §F.1. PK_YN 은 본 화면 그리드 빌드 미사용이나 As-Is SELECT 1:1 보존). CODE_YN 은 E2E 마스터코드 셀 실측으로 확인.
- [x] **ITEM-SVC-04** search_export 서비스 — GetMasterRuleDataListExport (전건, 페이징 없음).
  - 검증: `SELECT * FROM {table} ORDER BY RULE_SEQ` (As-Is Mapper #3 1:1). 단위테스트 searchExport_정상 + E2E 엑셀다운 "2건 Export" 실측.
- [x] **ITEM-SVC-DYNSQL** 동적 SQL 안전화 (DEC-Q007) — 화이트리스트 + 파라미터 바인딩.
  - 검증: `./gradlew :mcm-core:test --tests '*MasterRuleDataList*' --rerun` → **BUILD SUCCESSFUL (6/6)** — ruleId 형식/pTable 대조/조건컬럼/연산자/COL_ID 식별자(2차 stored)/컬럼정의없음 가드 + search/export SQL 검증.

---

## §4. 검증 · 비즈니스 규칙 (V-NNN — 기능 §6)

- [x] **ITEM-VAL-01** BR-001 업무기준 ID 필수 (조회 차단, MSG-001 "업무기준 ID는 필수입니다.") — 클라이언트.
  - 검증: page.tsx handleSearch/loadData — pRuleId 빈값 시 ErrorModal(MSG-001). 서버도 REQUIRED_VALUE 이중 가드(테스트 가드_ruleId).
- [x] **ITEM-VAL-02** BR-007 VARCHAR2 UPPER 검색 / BR-006 DATE 캘린더 표시 — 서버/클라이언트.
  - 검증: Service — VARCHAR2 조건 UPPER 양변(단위테스트 `UPPER(CURR_CD) LIKE UPPER(:v1)` + NUMBER 는 미적용 확인). DATE 캘린더는 읽기 전용 화면이라 표시만 — 서버 문자열 그대로 렌더 (shared 편집 캘린더 비대상 — 보류 D 유형, 형제 공통).
- [x] **ITEM-VAL-03** BR-008 마스터코드 셀(CODE_YN="Y") 파란 밑줄·포인터 + 클릭 시 P-002(MasterCodeSelPop) 호출 — 클라이언트.
  - 검증: E2E 5단계 — CURR_CD 셀 span(밑줄 렌더) 실재 + 클릭 → "마스터코드 조회" Dialog + 자동조회(sCodeVal=KRW 프리셋 → "1건") 실측. As-Is 콜백 no-op 보존 — 더블클릭 후 부모 그리드 무변경 확인 (E2E 7단계).
- [x] **ITEM-VAL-04** BR-009/BR-010/BR-011 RULE_SEQ 정렬+페이징 / 재조회 시 동적 컬럼 재빌드 / 엑셀 Export 업무기준ID 있을 때만 — 서버/클라이언트.
  - 검증: 페이징 SQL ROW_NUMBER(ORDER BY RULE_SEQ)+BETWEEN. 동적 컬럼 = colDefs useMemo 재빌드(P-001 재선택 시 lov 재로드). 엑셀다운 가드 = ruleSelected+colDefs (미충족 시 MSG-001). E2E 8단계 다운로드 파일명 `masterRuleDataList_E2ESRC` 실측.

---

## §5. FE — m-mcm 페이지 (페이지 유형: 조회+동적그리드 읽기전용)

- [x] **ITEM-FE-01** 페이지 scaffolding + portal 등록.
  - 검증: `page-components/cmb/masterRuleDataList/` + page-registry `"cmb/masterRuleDataList"` 등재 (pnpm build 자동 생성). E2E 메뉴 진입 성공.
- [x] **ITEM-FE-02** types / constants / api — 3 action(search/lov/searchExport) 헬퍼 + 연산자 상수.
  - 검증: types.ts/constants.ts(OPERATORS 4종, PAGE_SIZE=30, DEFAULT_FILTERS=USD·조건값 공란 — 분석 §3.2 정합)/repository.ts(3액션, page 0→1-based, pTable As-Is 계약+서버 재검증).
- [x] **ITEM-FE-03** PageLayout 골격 (헤더 + 조회조건 + 그리드 + 페이징). 긴급적용 체크박스 없음.
  - 검증: SearchArea + GridPanel + Pagination. 상단 버튼 = 조회 1종(B-001), 우측 = 엑셀다운 1종(B-002) — As-Is §4.1/§4.2 수량 1:1.
- [x] **ITEM-FE-04** 조회조건 (S-001~S-020) — 업무기준 ID/명(readonly, 초기값 "USD") + 업무기준 버튼(P-001) + 5조건.
  - 검증: E2E 2단계 — P-001 초기값 USD(Q-002 실측)→클리어 7건→E2ESRC 더블클릭 반영. 4단계 조건1=통화코드 LIKE KRW → "1건". (sSchema oArg 는 To-Be 기본 스키마 MCAAPUSER 로 흡수 — 가족 공통)
- [x] **ITEM-FE-05** ★ 동적 그리드 (G-001, 읽기전용) — 정적 1컬럼(순번) + 동적 컬럼(COL_NM 헤더 그대로/폭 13×len/CODE_YN 파란밑줄·포인터). PK ` * `/IN·OUT 접미/edittype 없음.
  - 검증: E2E 3단계 — 헤더 "통화코드"/"기준일자" (접미 없는 평탄 헤더 — masterRuleData 와 차이 실측) + KRW/JPY 렌더 + CURR_CD 셀 클릭 span 실재.
- [x] **ITEM-FE-06** 버튼·팝업 — 상단(조회) + 우측(엑셀다운) + P-001(업무기준선택)/P-002(마스터코드 셀 클릭).
  - 검증: P-001 = MasterRuleListPopModal 재사용. **P-002 = 선행 커밋의 MasterCodeSelPopDialog 재사용 (2안 — 동시 구현 사용자 확정 2026-07-08)**: masterCodeSelPop BE 완성(별도 체크리스트) 후 정식 연동 — props {sCodeId=COL_ID, sCodeNm=COL_NM, sCodeVal=셀값, title="마스터코드 조회"(As-Is P-004), onSelect=no-op(As-Is 콜백 미정의 보존)}.
- [x] **ITEM-FE-LAST** portal 재내보내기 + 메뉴 진입 E2E.
  - 검증: E2E 1~3단계 — 로그인→공통관리→업무기준 관리(원장)→"업무기준 상세조회" 진입→P-001→lov+search 연쇄 "2건 조회 되었습니다." (1 passed 로그 — §6 GATE-07)

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §G "개발 완료 게이트")

- [x] **ITEM-GATE-01** 정합키 일치 (코드 ↔ 설계서) — grep 대조 불일치 0.
  - 검증: ds_GetRuleColList/ds_GetMasterRuleDataList/ds_GetMasterRuleDataListExport + pRuleId/pTable/pWhere·pOperator·pVal 1~5/currentPage/countPerPage — repository.ts ↔ Service ↔ BPMN 3자 일치(분석 §4.6).
- [x] **ITEM-GATE-02** 영역별 수량 매칭 — S(20)/G(1 정적+동적)/B(4)/P(2) = 코드 실재 수.
  - 검증: S=ID/명/버튼+5×(컬럼·연산자·값)=20 등가, G=동적 그리드 1(정적 순번 1+동적 N), B=조회/엑셀다운/fold(보류 D)/업무기준=4 중 3 구현+fold 보류, P=P-001(재사용)+P-002(정식 연동 — 2안).
- [x] **ITEM-GATE-03** As-Is 1:1 정합 (Mapper SQL 3 / Java 메서드 1 / BPMN flow 7) — 임의 단순화 ✗.
  - 검증: SQL 3종 전수 구현(GetRuleColList/GetMasterRuleDataList/GetMasterRuleDataListExport — orphan 없음). 페이징 CTE 형태·UPPER·13×len 폭·COL_NM 평탄 헤더·콜백 no-op 보존. 정정은 확정 결정(Q-007/Q-009)만.
- [x] **ITEM-GATE-04** 안티패턴 검사 (직접 fetch/alert/@Transactional/직접 XML bpmn) — grep hit 0.
  - 검증: `grep -rn "fetch(|window.alert|console.log" page-components/cmb/masterRuleDataList/` → 0. Service `@Transactional` 어노테이션 0. BPMN bpmn-tool 생성.
- [x] **ITEM-GATE-05** BE 회귀 — 그린.
  - 검증: `./gradlew :mcm-core:test --tests '*MasterRuleDataList*' --tests '*MasterCodeSelPop*' --rerun` → **BUILD SUCCESSFUL** (6+4=10/10).
- [x] **ITEM-GATE-06** FE 빌드 — `pnpm build` 성공.
  - 검증: → **FE BUILD OK** — page-registry 에 cmb/masterRuleDataList 등재.
- [x] **ITEM-GATE-07** E2E (업무기준선택→lov→search→동적컬럼→마스터코드 셀클릭→P-002 + 엑셀다운) — 핵심 시나리오 그린.
  - 검증: `npx playwright test e2e/master-rule-data-list-e2e.spec.ts` → **1 passed (19.2s)** — 메뉴 진입→P-001(USD→클리어 7건→E2ESRC)→lov+search 연쇄 2건→평탄 헤더/KRW·JPY→조건검색(CURR_CD LIKE KRW) 1건→마스터코드 셀 클릭→P-002 자동조회 1건(원화)→검색어 클리어 4건(V-003)→유로 더블클릭 no-op 닫힘(부모 무변경)→엑셀다운 download(`masterRuleDataList_E2ESRC`)+"2건 Export".
- [x] **ITEM-GATE-08** 정합체크서 §G 갱신 + Q-004/Q-009 결정 동기화.
  - 검증: §G ○ 기확정(설계 단계 전건 해소) — 본 §6 실측 로그로 개발 완료 게이트 충족. Q-009 정정은 §1/ITEM-SVC-02 에 반영 명시.

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-05 | (생성) | - | 5종 설계서 기반 초안 생성. 정합 §G=○ (잔여 Q-004 부모 별도 phase / Q-009 변수명 정정 / manifest ✗). 본 화면 조회 전용 — save/orphan/긴급적용 비대상, MasterCodeSelPop 셀 클릭 추가. |
| 2026-07-08 | P-002 방침 | 사용자 확정 (2안) | stub 보류 대신 **masterCodeSelPop 동시 구현** — 선행 커밋(FE Dialog+BPMN)에 BE 만 완성해 정식 연동 (masterCodeSelPop_개발체크리스트 신설). |
| 2026-07-08 | §2~§6 전체 | → 개발 완료 (§6 8/8) | BE(DTO+Service 3액션·Q-007 안전화(COL_ID 2차 방어 포함)·Q-009 정정·테스트 6) / BPMN 3분기(유효:true) / FE(읽기전용 동적 그리드·CODE_YN 셀클릭 P-002·searchSeqRef 가드·lov 선로드 연쇄 — 형제 R0-3 반영 선적용) / RBAC sqlcmd(SEC_OBJ+SEC_MENU FULL_SEQ 2040130+RM 2행) / 코드 시드(CURR_CD 그룹 4행 + E2ESRC CURR_CD CODE_YN=Y) / E2E 1 passed(19.2s). |
| 2026-07-09 | DEC-Q002 재결정 | 보존 → 제거 | 사용자 지시("조회조건 PREFIX 다 빼줘") — DEFAULT_FILTERS 의 pRuleId/pRuleNm="USD" 프리셋 제거(빈값). masterCodeSelPop 검색어 기본값 "USD" 도 동시 제거(가족 공통). E2E 초기값 어서션 ""로 갱신 후 재실행 그린 + pnpm build ✓ |
| 2026-07-08 | E2E 보정 1건 | 스펙 수정 | 마스터코드 셀 span 로케이터 strict mode 위반(ag-grid 래퍼 span 중복 매칭) → `.ag-cell-value > span` 로 한정. |
| 2026-07-08 | R0-3 코드리뷰 | 발견 1건 → 수정 | H0/M0/L1 (2화면 통합 리뷰 — masterCodeSelPop BE 포함): [L] lov 연쇄에 stale 응답 가드 부재(늦은 lov 가 최신 colDefs 를 덮어 rows 와 불일치 가능) → loadLov 도 searchSeqRef 캡처, stale 이면 setColDefs skip + null 반환으로 후속 search 연쇄 중단. injection 잔여 경로·계약 불일치 0건(리뷰 보고서 — CactusResponseConverter grids/data 분기, DTO Gson 필드 바인딩까지 교차 확인). 수정 후 재검증: E2E 재실행 그린 · pnpm build ✓ |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트(Q 포함) → §2~§5 한 항목씩 → §6 개발 완료 게이트(=정합 §G). `/implement`·`/progress`·`/check` 연동.
