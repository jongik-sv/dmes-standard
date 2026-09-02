---
screenId: masterRuleFrameColListPopup
asIsId: MasterRuleFrameColListPopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleFrameColListPopup_분석리포트.md
  - masterRuleFrameColListPopup_기능설계서.md
  - masterRuleFrameColListPopup_디자인설계서.md
  - masterRuleFrameColListPopup_BPMN설계서.md
  - masterRuleFrameColListPopup_정합체크.md
---

<!--
  본 산출물 = MasterRuleFrameColListPopup (업무기준 컬럼 리스트 등록 팝업 / masterRuleFrameColListPopup) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗.
-->

# 업무기준 컬럼 리스트 등록 팝업 (masterRuleFrameColListPopup) 개발 체크리스트

## §0. 운영 규칙 (먼저 읽는다, MUST — 화면 무관 고정)

| # | 규칙 |
|---|---|
| R0-1 | **한 작업 단위 = 한 작업 사이클.** |
| R0-2 | **검증 명령의 실제 출력(로그) 없이 `[x]` 금지.** |
| R0-3 | **주장하는 자 ≠ 판정하는 자.** 구현 직후 `/check`·`/verify`·`/code-review` 교차검증. |
| R0-4 | **DoD 미충족 = 미완료.** |
| R0-5 | **설계서에 없는 것은 구현하지 않는다.** 추가 필요 시 5종 설계서로 환송. |
| R0-6 | **`[확인필요]`(Q-NNN)·선행 결정(DEC-NN) 미해결 항목은 구현 진입 금지.** §1 게이트 먼저. |
| R0-7 | 항목 완료 시(사용자 명시 승인 시) 그 단위로 1 커밋. 커밋은 사용자 지시 전 금지. |

### 체크 항목 표기 규약
```
- [ ] **ITEM-ID** 한 줄 제목
  - 근거: <기능 §x / BPMN §y / 디자인 §z / 정합 §k>
  - DoD: <검증가능한 완료 조건>
  - 검증: `<실행 명령>`  → 〈로그 자리〉
```
`[ ]` 미착수 · `[~]` 진행중 · `[x]` 완료(로그 첨부) · `[!]` 차단(사유 명시)

## §0.1 진도 요약 (`/progress` 로 갱신)

| Phase | 항목 수 | 완료 | 완료율 |
|---|---:|---:|---:|
| §1 선행 결정 게이트 | 4 | 4 | 100% |
| §2 BE 기반 | 6 | 6 | 100% |
| §3 BE 서비스·BPMN | 4 | 4 | 100% |
| §4 검증·비즈니스 규칙 | 8 | 8 | 100% |
| §5 FE | 6 | 6 | 100% |
| §6 정합·회귀 게이트 | 8 | 8 | 100% |

> 진행: 2026-07-08(완료) — **BE(엔티티/Repository 재사용 + 메타 native query + Service + 테스트 5건) + BPMN(유효:true) + FE(재사용 Modal + frame P-002 정식 연동 — D-003 완전 해소) + RBAC sqlcmd + E2E 그린 — 개발 완료 (§K 8/8).** PK 3키 표기 오기는 착수 전 2키로 정정(사용자 확정 — §7 이력).
> 검증 로그: `:mcm-core:test --rerun` MasterRuleFrameColListPopupServiceTest tests=5 failures=0 / `bpmn-tool validate` 유효:true / `pnpm build` ✓ / playwright **1 passed** (E2ESRC 소스 테이블 메타 3건 조회 → 일괄 IN 적용(E-001 등가) → XV-001 confirm → "3건 저장" → 부모 재조회 IN 1/OUT 2 + MSSQL 실측).
> E2E 발견·수정 2건: ① COL_LEN — date/decimal 컬럼에서 CHARACTER_MAXIMUM_LENGTH NULL → COALESCE(문자max, 숫자precision, 날짜precision) 보강 (As-Is DATA_LENGTH 전 타입 값 의미 보존) ② COL_TYPE — MSSQL 타입(int/decimal/datetime)이 LoV 도메인 밖 → 문자→VARCHAR2/숫자→NUMBER/일시→DATE 매핑 보강 (As-Is Oracle 타입-도메인 자연 일치의 의미 보존). colPrecLen=NUMERIC_PRECISION 은 As-Is DATA_PRECISION 1:1 보존(C-003 — As-Is 도 scale 아닌 precision).

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

- [x] **DEC-01** 설계서 4종 충돌 — 확인 (2026-07-08): 정합 §H 6/6 ✓. 단, **PK 3키 표기 오기 발견** → 사용자 확정으로 2키 정정(분석/체크리스트/정합 7곳 — sheet134·형제 §9.1·구현 엔티티 정합).
- [x] **DEC-02** 모듈 존재 — 확인 (2026-07-08): mcm-core/m-mcm 기존재. 패키지 = `com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.*` (RULE.md 정본 — 체크리스트 초안의 com.dongkuk 표기는 형제 화면 선례에 따라 dongkuk 평탄 정정).
- [x] **DEC-03** 영속성 방식 — **JPA** (cmb 공통, 사용자 확정 2026-06-04 / mcm-core 엔티티 JPA 정합)
  - DoD: save = JPA `MasterRuleColListRepository.deleteByRuleId` + `saveAll` (형제 masterRuleFrame 정합). Q-002: 반환 `{ savedCount }` 표준화(미사용 dataset 제거) 확정.
- [x] **DEC-Q01 (Q-001)** TB_MCA_RULE_COL_LIST To-Be 정본 — **Resolved**: DMES-SECTION-MCA sheet134 (MCAAPUSER) 등재 + 형제 masterRuleFrame §7 Entity `MasterRuleColList`/Repository `MasterRuleColListRepository` 정합. owner=MCAAPUSER, audit=mcm-core `McmAuditEntity` 9 컬럼(그룹3·4 제거), PK=(RULE_ID, COL_SEQ) 2키 *(2026-07-08 오기 정정 — 사용자 확정, 구현 엔티티 MasterRuleColListId 정합)*.
  - 근거: 정합 §G Q-001(resolved) / 분석 §7.2 / §9.2.
  - DoD: ✓ 업무 12 컬럼(save INSERT 10 + 주석 2) + owner + audit 정책 확정 (DMES sheet134 등재로 별도 등재 PR 불필요).

> §1 전부 `[x]`/`[!]` 전에는 §2 이후 진입 금지.

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

> 공통 검증: `cd src/backend && JAVA_HOME=... ./gradlew :mcm:compileJava`.

- [x] **ITEM-BE-01** scaffolding — `com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.{service,dto}` 신설. `:mcm-core:compileJava` EXIT 0.
- [x] **ITEM-BE-02** `MasterRuleColList` 엔티티 — **기존재 재사용** (masterRuleFrame 산출물, PK=(RULE_ID,COL_SEQ) 2키). 이하 초안 서술 참조: (`com.dongkuk.dmes.mcm.entity` — 형제 masterRuleFrame §7 동일 테이블 동일 엔티티) — DMES sheet134 업무 12 컬럼 1:1 (RULE_VER/RULE_ID/COL_SEQ/COL_ID/COL_NM/OLD_COL_ID/IO_FLAG/COL_TYPE/COL_LEN/COL_PREC_LEN/MES_COL_ID/MASTER_CODE_DIV) + audit=`McmAuditEntity` 상속(9). PK=(RULE_ID, COL_SEQ) 2키 *(2026-07-08 오기 정정)*. 정밀도(sheet134) 일치. Lombok 금지. **이미 존재 시 재사용**.
  - 근거: 분석 §7.2 / §9.2 / BPMN §2.4.
- [x] **ITEM-BE-03** DB 스키마 (SQLite) — 기존 테이블 재사용 (masterRuleFrame ITEM-BE-04 확인 완료). 마이그레이션 불요.
- [x] **ITEM-BE-04** DB 스키마 (MSSQL) — TB_MCA_RULE_COL_LIST 실재 (E2E 저장 실측 2026-07-08).
- [x] **ITEM-BE-05** `MasterRuleColListRepository` — deleteByRuleId/saveAll **재사용** + 신규 `searchSourceTableColumns` native query (INFORMATION_SCHEMA+sys.extended_properties — C-001~004, NOT IN 19 보존, ORDER BY ORDINAL_POSITION 결정론 보강). 이하 초안 서술 참조: (`com.dongkuk.dmes.mcm.repository` — 형제 masterRuleFrame §7 정합) — `deleteByRuleId(ruleId)` + `saveAll(rows)` (전체 재등록 패턴). **이미 존재 시 재사용**.
  - 근거: 분석 §5.3 / §11.2 (DELETE WHERE RULE_ID + INSERT loop).
- [x] **ITEM-BE-06** DTO — `MasterRuleFrameColListPopupSearchRequest`(pRuleId/pTable). search 응답 `{ds_grdRuleCol, cnt}`(As-Is resultKey 보존) / save 응답 `{savedCount}`(Q-002). `@RestController` 없음.

---

## §3. BE 서비스 · BPMN (action별)

> BPMN 매핑 `POST /oasis/masterRuleFrameColListPopup/{action}`. 단일 actionGateway 2분기(search/save). **OASIS 서비스 `@Transactional` 금지 — cactus TransactionTemplate**.

- [x] **ITEM-SVC-01** `masterRuleFrameColListPopup.bpmn` — bpmn-tool create. validate 유효:true(경고 1 = default flow — OASIS 관례). serviceId=process id=bean 일치.
- [x] **ITEM-SVC-02 (search)** — `MasterRuleFrameColListPopupService.search()`: TABLE_SCHEMA='MCAAPUSER'(To-Be owner 정본 — C-004 괄호 옵션 채택), pTable=FE 조립 "TB_MCA_"+ruleId, 파라미터 가드(REQUIRED_VALUE). E2E 실측: E2ESRC 3컬럼 메타 + MS_Description 한글 코멘트 표시. 테스트 search_정상/파라미터_가드 PASS.
- [x] **ITEM-SVC-03 (save)** — deleteByRuleId → COL_SEQ 재채번 saveAll (RULE_VER=1 고정, OLD/MES_COL_ID 미설정 — As-Is 주석 보존). OASIS wrap 단일 트랜잭션. 테스트 save_정상(captor)/가드/필수누락 PASS + E2E DB 실측(IN 1/OUT 2, COL_SEQ 1~3).
- [x] **ITEM-SVC-ERR** — REQUIRED_VALUE/INVALID_VALUE(400) BusinessException + JPA 예외 전파(500 롤백).

---

## §4. 검증 · 비즈니스 규칙 (V-NNN — 기능 §6)

> 실행 순서(기능 §6.3): IN/OUT 존재 → 행별 필수 → 저장 확인.

- [x] **ITEM-VAL-01/02 (V-001/002)** IN·OUT 존재 — 클라이언트 validateRows 선두 (문구 1:1).
- [x] **ITEM-VAL-03~07 (V-003~007)** 행별 필수 5종 — 클라(행번호 접두 + 토스트/상태바) + 서버(Service.validateRows — 문구 1:1, 테스트 PASS). 셀 포커스는 shared 그리드 미지원 → 행번호 접두로 대체(형제 화면 정합).
- [x] **ITEM-VAL-08 (XV-001)** 저장 확인 confirm — showMessage(alertType confirm) 문구 1:1. E2E 실측(모달 표시→확인→저장).

---

## §5. FE — m-mcm 페이지 (페이지 유형 E — 모달 팝업)

> **shared `form` 컴포넌트 강제**, `apiRequest`/`useGfnMessage`. 직접 fetch·alert·console.error 금지. 공통 검증: `cd src/frontend/m-mcm && pnpm build`.

- [x] **ITEM-FE-01** scaffolding — `cmb/masterRuleFrameColListPopup/{MasterRuleFrameColListPopupModal.tsx(재사용),page.tsx(미리보기 — masterRuleListPop 조합),types.ts,constants.ts,repository.ts}` + registry 등재.
- [x] **ITEM-FE-02** types/constants/api — repository(search/save, apiRequest OASIS) + LV-001~003 정적 상수.
- [x] **ITEM-FE-03** Modal 골격 — title "업무기준 구조 등록 팝업"(As-Is titletext), 등록/닫기 + 일괄 적용 툴바.
- [x] **ITEM-FE-04** A-FILTER — 부모 ruleId/ruleNm read-only 표시.
- [x] **ITEM-FE-05** A-GRID — 9컬럼 편집 그리드 + 일괄 IN/OUT(E-001 기능 등가: 그리드 상단 콤보+적용, CHK=Y 대상). **보류(D-001 유형)**: head 2행 병합·헤더 내장 콤보·CHK 체크박스 셀 = shared 미지원 → 평탄 헤더·상단 콤보·select Y/N 대체.
- [x] **ITEM-FE-06** 버튼/연동 — 등록(V검증→XV-001 confirm→save→savedCount 토스트→닫기) + 부모 masterRuleFrame P-002 정식 배선(onSaved→loadCols — As-Is fn_returnColListPopupCallBack). **fold(B-003)는 D-002 유형 보류**(shared 미지원 — 형제 화면 동일).

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §K)

- [x] **ITEM-GATE-01** 정합키 — serviceId/bean/process id 일치, ds_grdRuleCol·savedCount·camelCase 9키 1:1.
- [x] **ITEM-GATE-02** 수량 — S 4 / G 9 / B 3 중 2+E-001(fold 보류 D-002) / P 1(부모 연동) / V 7+XV 1 / LV 3 ○.
- [x] **ITEM-GATE-03** As-Is 1:1 — delete-all→insert 보존 / NOT IN 19 보존 / OLD·MES 주석 보존 / savedCount(Q-002 확정만 변경).
- [x] **ITEM-GATE-04** 안티패턴 — @Transactional·직접 fetch·alert 0. ${} 동적 스키마 제거(바인딩 쿼리).
- [x] **ITEM-GATE-05** BE 회귀 — :mcm-core:test 그린 (신규 5 + 전체).
- [x] **ITEM-GATE-06** FE 빌드 — pnpm build ✓.
- [x] **ITEM-GATE-07** E2E — playwright 1 passed: E2ESRC 선택 → 기초데이터등록 → 메타 3건(BASE_DT/기준일자·VARCHAR2) → chk=Y+일괄 IN → 등록 confirm → "3건 저장" → 부모 재조회(IN 1/OUT 2) + MSSQL 실측(COL_SEQ 1~3·RULE_VER 1.00·audit admin). 스크린샷 e2e-6/7/8. E2E 발견 보강 2건(COL_LEN COALESCE·COL_TYPE 도메인 매핑 — §0.1).
- [x] **ITEM-GATE-08** 정합 동기화 — Q-001/002 resolved 유지 + PK 2키 정정 반영(§7). 잔여 = 병합헤더·fold 등 shared 제약 보류(형제 D-001/D-002 유형).

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-04 | (생성) | - | 5종 설계서 기반 초안 생성 (Q-001/Q-002 open) |
| 2026-06-04 | DEC-Q01 (Q-001) | open → resolved | DMES-SECTION-MCA sheet134 (MCAAPUSER, 29 컬럼) 등재 확인 + 형제 masterRuleFrame §7 Entity `MasterRuleColList` 정합. §7 To-Be 컬럼 매핑 보강 (분석/기능/BPMN/정합 동기화) |
| 2026-07-08 | PK 표기 정정 | 오기 → 2키 확정 | 설계 4문서의 "RULE_ID+RULE_VER+COL_SEQ" 3키 표기는 오기(sheet134 KEY·형제 §9.1·구현 엔티티 = (RULE_ID,COL_SEQ) 2키) — 사용자 확정으로 7곳 정정 후 착수 |
| 2026-07-08 | §1~§6 전체 | → 개발 완료 (§K 8/8) | BE(메타 native query + Service + 테스트 5) / BPMN / FE(재사용 Modal + frame P-002 정식 연동 — D-003 완전 해소) / RBAC sqlcmd(OBJ+RM 2행, 메뉴 미등재 — 팝업) / E2E 1 passed(E2ESRC 소스 테이블 시나리오 + MSSQL 실측). E2E 발견 보강 2건: COL_LEN COALESCE(전 타입 길이 — As-Is DATA_LENGTH 의미), COL_TYPE 도메인 매핑(숫자→NUMBER/일시→DATE — As-Is 타입-LoV 자연 일치 의미). colPrecLen=NUMERIC_PRECISION 은 As-Is DATA_PRECISION 1:1 보존 |
| 2026-07-08 | searchSourceTableColumns | NOT IN 보강 | masterRuleData Q-006(To-Be audit=C_ 계열·U_ 계열) 정합 — 소스컬럼 조회 NOT IN 제외 목록에 To-Be audit 9종(C_USR_ID,C_AT,C_SVC_ID,C_PGM_ID,U_USR_ID,U_AT,U_SVC_ID,U_PGM_ID,VER) 추가(As-Is 19종 유지). TB_MCA_E2ESRC(To-Be audit 보유 테이블) 소스 조회 시 업무 컬럼만 노출 — 기존 E2E "3건" 어서션 유지 확인 |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트(특히 DEC-Q01) → §2~§5 한 항목씩 → §6 개발 완료 게이트.
