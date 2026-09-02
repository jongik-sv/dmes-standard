---
screenId: masterRuleDataUploadFilePopup
asIsId: MasterRuleDataUploadFilePopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterRuleDataUploadFilePopup_분석리포트.md
  - masterRuleDataUploadFilePopup_기능설계서.md
  - masterRuleDataUploadFilePopup_디자인설계서.md
  - masterRuleDataUploadFilePopup_BPMN설계서.md
  - masterRuleDataUploadFilePopup_정합체크.md
---

<!--
  본 산출물 = MasterRuleDataUploadFilePopup (일반 업무기준 등록(Excel Upload) / masterRuleDataUploadFilePopup) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗ (설계서에 없으면 설계로 환송).
  라우터 분기 3 (MES 개발, Mes-Guide §3) 의 진행 추적 정본. 정합체크서 §H / §G 로 수렴.
  ★ 본 화면은 부모 masterRuleData 의 자식 modal 팝업 — 부모 화면 개발 후 또는 동시 진행. 동적 컬럼/동적 테이블 가족 공통.
-->

# 일반 업무기준 등록(Excel Upload) (masterRuleDataUploadFilePopup) 개발 체크리스트

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
| §1 선행 결정 게이트 | 11 | 11 | 100% |
| §2 BE 기반 | 6 | 6 | 100% |
| §3 BE 서비스·BPMN | 6 | 6 | 100% |
| §4 검증·비즈니스 규칙 | 5 | 5 | 100% |
| §5 FE | 7 | 7 | 100% |
| §6 정합·회귀 게이트 | 8 | 8 | 100% |

> ★ 정합체크서 §H 최종 = **○ (설계 완료 — §D.4 manifest ✗ 의도 면제 / 활성 0건)**. 가족 확정(JPA / DDL on-demand / 동적 SQL 안전화 / McmAuditEntity / MCAAPUSER / SheetJS / 패키지 — 사용자 확정 2026-06-04) 적용. 본 팝업 고유 Q-101(동적 그리드 FE)/Q-102(삭제등록 confirm+가드)/Q-103(채번 namespace) 사용자 확정 2026-06-05.
>
> ★ 진행: 2026-07-09(완료) — **BE(단일 서비스 3액션 — Q-104 안전화·Q-103 채번 일원화·Q-105 audit·행번호 예외+테스트 8건) + BPMN(3분기 유효:true) + FE(재사용 Modal — SheetJS import A5/A6·3행 헤더 다운로드 라운드트립·Q-102 confirm/차단) + 부모 masterRuleData P-002 stub 정식 연동 해소 + RBAC sqlcmd + E2E 1 passed(업로드→등록→DB 실측→다운로드) — 개발 완료 (§6 8/8).** MasterRule 계열 6종 전체 완료.

---

## §1. 선행 결정 게이트 (P0 — 차단, MUST FIRST)

> 정합체크서 §H = ○ (manifest ✗ 의도 면제 / 활성 0건. Q-101·102·103 사용자 확정 2026-06-05). 가족 확정(DEC-03 JPA / DEC-Q104 동적 SQL 안전화 / DEC-Q105 audit / DDL on-demand) 사용자 확정 2026-06-04. 정합 §F / 분석 §12 에서 추출.

- [x] **DEC-01** 설계서 4종 간 충돌 — 충돌 없음 (정합 §A~§C 전 ✓) *(2026-07-09 착수 시 재확인 — §H ○ 유지)*
  - DoD: 충돌 없음 확인 (정합 §H ✓ 항목 / §D.4 외).
- [x] **DEC-02** 모듈/부모 확인 — mcm-core 존재 + **부모 masterRuleData 개발 완료(2026-07-08 — 형제 체크리스트 §6 8/8)** 확인. 메타 엔티티(RuleColList/RuleMaster) 부모 재사용 확정.
  - DoD: mcm-core 존재. 패키지 `com.dongkuk.dmes.mcm.*`. 부모 P-002 stub → 본 화면으로 해소.
- [x] **DEC-03** 영속성 방식 — **JPA** (cmb 공통, 사용자 확정 2026-06-04). 동적 테이블/컬럼은 native 동적 SQL + 안전화.
- [x] **DEC-Q001a** 메타 테이블 정의 — **해소** (DMES-SECTION-MCA sheet134/135, owner=MCAAPUSER). 부모 masterRuleData 엔티티 재사용.
- [x] **DEC-Q001b** 동적 데이터 테이블 To-Be 전략 — **확정: 'DDL on-demand'** (owner=MCAAPUSER — 사용자 2026-06-04).
- [x] **DEC-Q104** 동적 SQL 안전화 — **적용 확정** (`${pTable}` 화이트리스트 + 바인딩 — 사용자 2026-06-04) (분석 §11.1 C-006)
- [x] **DEC-Q105** audit — **McmAuditEntity 9 컬럼 적용 확정** (동적 테이블 native audit 세팅 — 사용자 2026-06-04) (분석 §9.4)
- [x] **DEC-Q101** 동적 그리드 빌드 (FE) — **FE 동일 구현 확정** (사용자 2026-06-05) (정합 §G Q-101 / 디자인 §4.3)
- [x] **DEC-Q102** 삭제등록 UX — **확정: confirm 메시지 + 미리보기 빈 상태 시 전건삭제 차단 가드** (사용자 2026-06-05) (정합 §G Q-102 / 기능 §6 R-106)
- [x] **DEC-Q103** 채번 namespace — **본 화면 매퍼 #3 일원화 확정** (사용자 2026-06-05) (정합 §G Q-103 / BPMN §6.3 RC-004)
- [x] **DEC-04(추가 확인)** As-Is `MCA_SOURCE` schema → To-Be **MCAAPUSER** (가족 확정 — 분석 §9.4/C-005).

> §1 전부 `[x]` — 2026-07-09 §2 진입.

---

## §2. BE 기반 — Entity · Migration · Repository · DTO

- [x] **ITEM-BE-01** mcm 모듈 확인 — mcm-core 존재 / 부모 masterRuleData 엔티티(RuleColList/RuleMaster) 재사용 확정.
  - 검증: 형제 화면 5종 기가동 — 본 화면 E2E 부모 경유 진입 성공으로 재확인.
- [x] **ITEM-BE-02** 컬럼정의 엔티티 — 부모 재사용. GetRuleColList 는 가족 공용 `MasterRuleColListRepository.searchRuleColDefsWithPk` 재사용 (As-Is Mapper #1 과 동일 SQL — JOIN RULE_MASTER/CODE_YN/PK_YN INFORMATION_SCHEMA 변환 C-001·C-004. COL_PREC_LEN 1컬럼 초과 반환은 FE 미사용 — As-Is ds_RuleColData 미선언 컬럼과 동일 무해).
- [x] **ITEM-BE-03** 업무기준 마스터 엔티티 — 부모 재사용 (lov 쿼리 JOIN 대상).
- [x] **ITEM-BE-04** 동적 데이터 영속 구조 — `TB_MCA_<업무기준ID>` native 동적 SQL. 테이블명 = pRuleId 정규식(`^[A-Za-z0-9_]{1,10}$`) 검증 후 서버 재조립 + pTable 대조(Q-104). 저장 컬럼 = 서버 조회 컬럼정의 화이트리스트(COL_ID 식별자 `^[A-Z0-9_]{1,30}$` 강제 — 2차 stored injection 차단, 가족 R0-3 선반영). RULE_VER/RULE_SEQ 서버 채번(행 값 미신뢰).
- [x] **ITEM-BE-05** DB 마이그레이션 — 메타 테이블 부모 공유(신규 없음), 동적 테이블 DDL on-demand 면제. E2E 시드 = 가족 공용 `MCAAPUSER.TB_MCA_E2ESRC`(시드 2행) 재사용.
- [x] **ITEM-BE-06** DTO — `MasterRuleDataUploadFilePopupSaveRequest` (pRuleId/pTable/pRegFlag — 분석 §4.4 sArgument 1:1, 3액션 공용. 업로드 행은 가족 To-Be grids 계약 `grids:{rows:{rows}}`).
  - 검증: `./gradlew :mcm-core:compileJava` → BUILD SUCCESSFUL.

---

## §3. BE 서비스 · BPMN (action별)

- [x] **ITEM-SVC-01** `.bpmn` 다이어그램 (actionGateway 3분기: search/save/searchCol) — bpmn-tool 생성.
  - 검증: `services/cmb/masterRuleDataUploadFilePopup.bpmn` — `bpmn-tool validate` → **유효:true** (경고 1: default flow — 가족 As-Is 패턴 동일, 비차단). serviceId=masterRuleDataUploadFilePopup, bean=camunda:class 일치, method/dto/output=result. As-Is UserTask 2종+CommonSelectTask 1종 → To-Be 단일 서비스 빈 3메서드 흡수 (가족 정합).
- [x] **ITEM-SVC-02** search 서비스 (GetMasterRuleDataPopup) — `SELECT * FROM {table}` 전건 (As-Is Mapper #2 — WHERE/ORDER 없음 보존, R-104).
  - 검증: 단위테스트 search_정상 — SQL `SELECT * FROM MCAAPUSER.TB_MCA_E2ESRC` 정확 일치 + ds_GetRuleDataUploadList 응답키. E2E 다운로드 "2건 조회" 실측.
- [x] **ITEM-SVC-03** search_col 서비스 → To-Be searchCol — 컬럼정의 + PK_YN (searchRuleColDefsWithPk 재사용 — §F.1 MSSQL 변환).
  - 검증: 단위테스트 searchCol_정상(11키 매핑 + ds_GetRuleColUploadList) + E2E 팝업 진입 "3건 조회"/헤더 "기준일자 (IN)" 실측.
- [x] **ITEM-SVC-04** save 서비스 (SaveMasterRuleFileUpload) — (조건부 전건 DELETE R-107) + ISNULL(MAX) 채번(Q-103 본 화면 일원화 — F-004 해소, C-002) + DATE `-` 제거·14자 절단(R-110) + RULE_VER='1'/RULE_SEQ=++max(R-109) + McmAuditEntity 8컬럼(Q-105 — F-006 해소, PGM_ID='masterRuleDataUploadFilePopup') + 반복 INSERT. atomic — 실패 시 예외 → OASIS process rollback (부분 성공 없음, 분석 §7.3).
  - 검증: 단위테스트 save_삭제등록/save_일반등록(화이트리스트 절단·채번·DATE 정규화·audit) + E2E DB 실측(§6 GATE-07).
- [x] **ITEM-SVC-ERR** 에러 매트릭스 — 업무기준 미선택(REQUIRED_VALUE)·형식/pTable/COL_ID 위반(INVALID_VALUE)·빈 업로드+삭제등록 차단(BUSINESS_ERROR — Q-102)·INSERT 실패 행번호 포함(MT-003/RC-001 — F-001 해소).
  - 검증: 단위테스트 가드_안전화/save_빈업로드_삭제등록차단/save_행번호예외("2행 등록 실패").
- [x] **ITEM-SVC-DYNSQL** 동적 SQL 안전화 (DEC-Q104) — 화이트리스트 + 바인딩.
  - 검증: `./gradlew :mcm-core:test --tests '*MasterRuleDataUploadFilePopup*'` → **BUILD SUCCESSFUL (8/8)** + 전체 회귀 `:mcm-core:test --rerun` 그린.

---

## §4. 검증 · 비즈니스 규칙 (R-NNN — 기능 §6)

- [x] **ITEM-VAL-01** R-101/R-104 호출 사전조건 — 부모 fn_excelUp 가드(업무기준 미선택 시 MSG-001 차단 — As-Is xfdl:718 1:1) + 팝업 내 sRuleId/sRuleNm read-only(R-102). 다운로드 MT-001 방어 가드.
  - 검증: 부모 page.tsx handleExcelUp(ruleSelected 가드) + Modal readOnly input + handleFileDown 가드. E2E 부모 경유 정상 경로 실측.
- [x] **ITEM-VAL-02** R-103 진입 시 컬럼정의 자동 조회(searchCol) → 동적 컬럼 빌드 (Excel 헤더 = COL_ID 매칭).
  - 검증: E2E — 팝업 진입 즉시 "3건 조회 되었습니다."(M-004) + 동적 헤더. import 시 5행 헤더 COL_ID 매칭(화이트리스트 밖 헤더 무시).
- [x] **ITEM-VAL-03** R-110 COL_TYPE=="DATE" 값 `-` 제거 + 14자 절단 — 서버.
  - 검증: 단위테스트 setParameter("c0","20260709") + E2E DB 실측 BASE_DT=2026-07-09/10 정상 캐스팅.
- [x] **ITEM-VAL-04** R-107/R-108 삭제등록 전건 선삭제 / false 시 INSERT 만 + Q-102 confirm·빈 상태 차단.
  - 검증: 단위테스트(DELETE 유/무 분기 + 차단) + E2E confirm 모달 "모든 데이터가 삭제된 후 재등록됩니다" 실측 → DB 전건 교체 확인(KRW/JPY → GBP/CHF).
- [x] **ITEM-VAL-05** R-109 RULE_VER "1" 고정 + RULE_SEQ maxRuleSeq+1 채번 / R-111 등록 성공 시 양 dataset clear.
  - 검증: DB 실측 RULE_VER=1.00/RULE_SEQ=1,2 재채번 + E2E 등록 후 미리보기 clear(GBP hidden) 실측.

---

## §5. FE — m-mcm 페이지 (modal popup + 동적그리드 Excel 등록)

- [x] **ITEM-FE-01** 팝업 scaffolding + portal 등록 — `MasterRuleDataUploadFilePopupModal`(재사용 Modal) + page.tsx(단독 미리보기). 부모 호출 계약(sRuleId/sRuleNm in / rtVal 미사용 — 닫기만) 정합.
- [x] **ITEM-FE-02** types / constants / api — 3 action(searchCol/search/save) 헬퍼 + Excel 배치 상수(A5 헤더/A6 데이터) + Q-102 메시지 상수.
- [x] **ITEM-FE-03** 팝업 골격 — 헤더 4버튼(다운로드/파일선택/등록/닫기) + 조회조건(업무기준/명 readonly + 삭제등록) + 그리드 + 상태바(M-001~M-008). fold 는 shared 미지원 보류(가족 D 유형).
- [x] **ITEM-FE-04** 조회조건 (S-001~S-003) — readonly 2 + chk_regFlag.
- [x] **ITEM-FE-05** ★ 동적 그리드 (DEC-Q101) — ds_RuleColData 기반 동적 컬럼(COL_NM 헤더 + `(IN)/(OUT)` 접미 + 셀 텍스트색 red/blue — As-Is 셀 배경색 shared 미지원 대체, 보류 D). 다운로드 XLSX 3행 헤더(IN·OUT/컬럼명/컬럼ID — 1~2행 여백 후 3~5행)로 **import(A5 헤더/A6 데이터)와 라운드트립 호환**.
- [x] **ITEM-FE-06** 버튼·파일처리 — 다운로드(search→XLSX)/파일선택(SheetJS import — 5행 COL_ID 헤더 매칭·빈행 skip·문자열화)/등록(Q-102 confirm+빈 상태 차단 → save → M-006 상태바+M-007 모달+R-111 clear)/닫기.
- [x] **ITEM-FE-LAST** portal 재내보내기 + 부모 → 팝업 E2E.
  - 검증: `pnpm build` → **FE BUILD OK** (선행: pull 유입 shared 소스/dist 불일치로 실패 → `shared pnpm build` 재빌드 후 해소 — 본 화면 코드 무관). 부모 P-002 stub 제거 → Modal 정식 연동.

---

## §6. 정합 · 회귀 게이트 (= 정합체크서 §H "개발 완료 게이트")

- [x] **ITEM-GATE-01** 정합키 일치 — pRuleId/pTable/pRegFlag + ds_GetRuleColUploadList/ds_GetRuleDataUploadList/cnt_import — repository.ts ↔ Service ↔ BPMN 3자 일치 (분석 §4.4).
- [x] **ITEM-GATE-02** 영역별 수량 — S(3)/G(가시 1 — As-Is 숨김 grd_Download 는 XLSX 직접 생성으로 흡수, 3행 헤더 등가)/B(4 + fold 보류 D)/P(1 호출원 — 부모 정식 연동).
- [x] **ITEM-GATE-03** As-Is 1:1 — 본화면 SQL 3(#1 lov 재사용/#2 SELECT * 보존/#3 채번 일원화 Q-103) + 외부 동적 delete/insert(#4/#5 — 안전화 native 흡수 C-006·C-007) / Java 메서드 2→서비스 3메서드 / BPMN 6노드+7flow→3분기 등가. 정정은 확정 결정(Q-102/103/104/105)만.
- [x] **ITEM-GATE-04** 안티패턴 — `@Transactional` 0 / 직접 fetch·alert·console 0 / BPMN bpmn-tool / `${}` 치환 0(전부 재조립+바인딩).
- [x] **ITEM-GATE-05** BE 회귀 — `./gradlew :mcm-core:test --rerun` → **BUILD SUCCESSFUL** (본 화면 8건 포함 전체 그린).
- [x] **ITEM-GATE-06** FE 빌드 — `pnpm build` → **FE BUILD OK** (shared 재빌드 포함).
- [x] **ITEM-GATE-07** E2E — `npx playwright test e2e/master-rule-data-upload-e2e.spec.ts` → **1 passed (12.7s)** — 부모 진입→E2ESRC→엑셀업→팝업(M-004 3건+동적 헤더)→fixture xlsx 업로드("Excel Data 2건"+GBP/CHF 미리보기)→삭제등록+등록(Q-102 confirm→M-007 완료 모달→M-006 "2건 저장"→R-111 clear)→다운로드(download 이벤트+M-002)→닫기.
    DB 실측(sqlcmd): 전건 교체 — `1|GBP|1900.5|2026-07-09` / `2|CHF|2050.25|2026-07-10`, RULE_VER=1.00·RULE_SEQ 재채번(R-109), BASE_DT 정규화(R-110), C_USR_ID=admin·C_PGM_ID=masterRuleDataUploadFilePopup(Q-105). 실측 후 시드 2행 복원.
- [x] **ITEM-GATE-08** 정합체크서 §H/§G 갱신 + Q-101/102/103 동기화 — 완료 (사용자 확정 2026-06-05, open→resolved).

---

## §7. 변경 이력 (개발 진행 로그)

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-06-05 | (생성) | - | 5종 설계서 기반 초안 생성. 정합 §H = ○ (Q-101/102/103 3건 open + §D.4 manifest ✗ 의도 면제). 가족 확정 적용 — §1 게이트 대부분 해소. 부모 masterRuleData 자식 팝업. |
| 2026-07-09 | §1~§6 전체 | → 개발 완료 (§6 8/8) | BE(단일 서비스 3액션 — Q-104 안전화(COL_ID 2차 방어)·Q-103 채번 일원화·Q-105 audit(F-006 해소)·행번호 예외(F-001 해소)·테스트 8) / BPMN 3분기(유효:true) / FE(재사용 Modal — SheetJS A5/A6 import·3행 헤더 다운로드 라운드트립·Q-102 confirm/차단·IN/OUT 텍스트색 대체 보류 D) / 부모 P-002 stub 정식 연동 해소 / RBAC sqlcmd(OBJ+RM 2행 — 팝업, 메뉴 비대상) / E2E 1 passed(12.7s — fixture xlsx 실업로드+DB 실측+시드 복원). |
| 2026-07-09 | E2E 보정 1건 | 스펙 수정 | 닫기 버튼 로케이터 strict 위반(모달 X aria-label "닫기" 중복) → `.last()` 한정. |
| 2026-07-09 | R0-3 코드리뷰 | 발견 5건 → 3건 수정·2건 기록 | H0/M1/L4 — [M] Modal searchCol stale 가드 부재(재오픈 race — colDefs 교차 오염) → colSeqRef+선리셋 수정. [L] filterCols 고정컬럼(RULE_VER/RULE_SEQ/audit 8) 명시 제외 누락(컬럼정의 동명 등록 시 MSSQL 264) → FIXED_COLS skip 수정. [L] BPMN process name As-Is 오기("일반 업무기준 컬럼조회") → 화면 타이틀로 정정(형제 정합). [L-기록] MAX 채번 동시성 = As-Is 1:1 승계(가족 공통 — 잠금 미도입). [L-기록] Excel 날짜 셀 로케일 포맷 엣지 = As-Is gfn_importExcel 범위 초과 — 보류(다운로드 양식 라운드트립은 안전). injection 잔여·atomic 결함·계약 불일치 0건. 수정 후 재검증: BE 8/8 그린 · FE 빌드 ✓ · E2E 1 passed · 시드 복원 |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천. §1 게이트(Q-101/102/103 포함) → §2~§5 한 항목씩 → §6 개발 완료 게이트(=정합 §H). 부모 masterRuleData 와 메타 엔티티 공유. **MasterRule 계열 6종 전체 개발 완료 (2026-07-09).**
