---
screenId: masterCodeSelPop
asIsId: MasterCodeSelPop
moduleId: mcm
moduleGroup: cma
작성일: 2026-07-08
작성자: Agent
artifactType: 개발체크리스트  # 6번째 산출물 (개발 단계 — 4종 설계 정합 검증 대상 아님)
sourceDesignDocs:
  - masterCodeSelPop_분석리포트.md
  - masterCodeSelPop_기능설계서.md
  - masterCodeSelPop_디자인설계서.md
  - masterCodeSelPop_BPMN설계서.md
  - masterCodeSelPop_정합체크.md
---

<!--
  본 산출물 = MasterCodeSelPop (마스터코드 선택 팝업 / masterCodeSelPop) 개발 진행 체크리스트.
  단일 원천: 같은 폴더의 5종 설계 산출물. 자체 요구사항 추가 ✗.
  ★ 본 화면은 cma 계열 선행 커밋("MCM Migration - Master관리 (원장) 개발")에서 BE(Service/DTO) +
  FE(MasterCodeSelPopDialog) + BPMN 이 **전부 구현 완료**돼 있던 화면이다 (단위테스트·호출 부모·E2E 만 부재).
  masterRuleDataList(P-002 호출 부모) 개발 사이클(2026-07-08~09)에서 선행 자산을 검증·연동했다 — 체크리스트는 사후 정리분.
-->

# 마스터코드 선택 팝업 (masterCodeSelPop) 개발 체크리스트

## §0. 운영 규칙 (먼저 읽는다, MUST — 화면 무관 고정)

| # | 규칙 |
|---|---|
| R0-1 | **한 작업 단위 = 한 작업 사이클.** |
| R0-2 | **검증 명령의 실제 출력(로그) 없이 `[x]` 금지.** |
| R0-3 | **주장하는 자 ≠ 판정하는 자.** 구현 직후 `/code-review` 교차검증. |
| R0-4 | **DoD 미충족 = 미완료.** |
| R0-5 | **설계서에 없는 것은 구현하지 않는다.** 선행 구현 자산은 재사용 우선 (중복 구현 금지). |
| R0-6 | **`[확인필요]`(Q-NNN) 미해결 항목은 구현 진입 금지.** — 본 화면 활성 미결정 0건 (분석 §12, 전건 2026-05-29 확정). |
| R0-7 | 커밋은 사용자 지시 전 금지. |

## §0.1 진도 요약

| Phase | 항목 수 | 완료 | 완료율 |
|---|---:|---:|---:|
| §1 선행 자산 확인 게이트 | 3 | 3 | 100% |
| §2 검증 보강 (본 사이클 신규) | 2 | 2 | 100% |
| §3 호출 부모 연동 | 1 | 1 | 100% |
| §4 정합·회귀 게이트 | 5 | 5 | 100% |

> ★ 진행: 2026-07-08~09(완료) — **선행 커밋 자산(BE Service/DTO + FE Dialog + BPMN output=items) 전부 재사용(무수정)** + 본 사이클 보강: 단위테스트 5건 신설, masterRuleDataList P-002 정식 연동(2안 — 사용자 확정), RBAC 선행 등재 확인, E2E 경유 실측, 검색어 기본값 "USD" 프리셋 제거(사용자 2026-07-09 — 가족 공통).

---

## §1. 선행 자산 확인 게이트

- [x] **DEC-01** 활성 확인필요 0건 — 분석 §12 결정 누적 전건 확정(2026-05-29): 3 schema 구조 / VI_MCM_CODE_ACCESS 정본 DDL / C-005(PUBLIC SYNONYM → schema 명시 a 안) / CATEGORY_NM 출처 / MASTER_CODE 비노출·edt_codeNm 표시·Enter 비활성 As-Is 보존.
- [x] **DEC-02** 선행 구현 자산 확인 — **BE·FE·BPMN 전부 기존 커밋 실재**: BE `cma.masterCodeSelPop.{dto.MasterCodeSelPopSearchRequest, service.MasterCodeSelPopService}` (native + `:pValueLike` 바인딩 — C-001 흡수, List 반환) / FE `MasterCodeSelPopDialog.tsx, api.ts, types.ts, index.ts` / BPMN `services/cma/masterCodeSelPop.bpmn` (camunda:class=masterCodeSelPopService, method=search, dto FQN 일치, **output=items**).
  - 이력: 개발 중 BE 를 "미구현" 으로 오판(이미 cp 덮어쓰기 후 grep 한 순서 오류)해 Service/DTO 를 재작성·BPMN/Modal 중복 생성했다가, **전건 git 원복·제거로 선행 자산 무수정 보존** (§5 이력 — 커밋 전 정합 확인에서 발견·정정 2026-07-09).
- [x] **DEC-03** 응답 계약 — 선행 구현 그대로: output=items (grids.items.rows — cma 4화면 통일 패턴, api.ts 파싱 경로). Service List 반환, M-001 건수는 FE rows.length 산출.

---

## §2. 검증 보강 (본 사이클 신규)

- [x] **ITEM-TEST-01** 단위테스트 신설 — `MasterCodeSelPopServiceTest` 5건 (선행 구현 대상): CODE_VAL 분기 SQL+`%v%` 바인딩 / CODE_VAL_MEAN 분기 / pCodeId 공란 if 미진입+pValue null→'%%'(V-001·V-003 As-Is 보존) / pDiv 도메인 밖 미진입(바인딩 전용 — injection 표면 없음) / 행 매핑(SELECT 순서→대문자 키).
  - 검증: `./gradlew :mcm-core:test --tests '*MasterCodeSelPop*' --rerun` → **BUILD SUCCESSFUL (5/5)**.
- [x] **ITEM-FE-01** 검색어 기본값 프리셋 제거 — Dialog `DEFAULT_CODE_VAL "USD"→""` (사용자 2026-07-09 — 업무기준 가족 화면 조회조건 프리셋 일괄 제거. 실호출 경로는 sCodeVal=셀값 전달이라 무영향).

---

## §3. 호출 부모 연동

- [x] **ITEM-LINK-01** masterRuleDataList P-002 정식 연동 (2안 — 사용자 확정 2026-07-08): `import { MasterCodeSelPopDialog } from "../../cma/masterCodeSelPop"` (index 진입점), props {open, sCodeId=COL_ID, sCodeNm=COL_NM, sCodeVal=셀값, title="마스터코드 조회"(As-Is P-004), onSelect=no-op(As-Is 콜백 미정의 보존), onClose}.

---

## §4. 정합 · 회귀 게이트

- [x] **ITEM-GATE-01** 정합키 — pCodeId/pDiv/pValue ↔ api.ts SearchRequest ↔ BPMN dto ↔ Service DTO(@JsonProperty) 4자 일치. 응답 grids.items.rows ↔ api.ts 파싱 ↔ output=items 일치.
- [x] **ITEM-GATE-02** As-Is 1:1 — Mapper SQL 1(GetCodeDetailList — if 2분기+ORDER BY)/BPMN flow 3/Grid 5컬럼/반환 {sCodeVal,sCodeValMean} 보존. V-001/V-003 As-Is 결함 보존(설계 확정), V-004 는 선행 Dialog 가 V-201 로 흡수.
- [x] **ITEM-GATE-03** 안티패턴 — Service `@Transactional` 0 / FE 직접 fetch 0 (api.ts=apiRequest) / BPMN bpmn-tool 관리.
- [x] **ITEM-GATE-04** RBAC — SEC_OBJ 'masterCodeSelPop'(cma/masterCodeSelPop) + RM(SYSADMIN/PERM_ALL) **선행 등재 확인** (sqlcmd 실측). 팝업 화면 — SEC_MENU 비대상.
- [x] **ITEM-GATE-05** E2E — masterRuleDataList 경유 P-002 실측: 마스터코드 셀 클릭→Dialog 자동조회(sCodeVal 프리셋 LIKE → "1건")→검색어 클리어 전체 4건(V-003)→더블클릭 반환(부모 no-op)→닫힘. (`master-rule-data-list-e2e.spec.ts` 1 passed — masterRuleDataList GATE-07 로그 참조. 코드 시드 = TB_MCM_CODE_* 'CURR_CD' 그룹 4행 sqlcmd)

---

## §5. 변경 이력

| 일자 | 항목 | 상태 변경 | 비고/증거 |
|---|---|---|---|
| 2026-07-08 | (생성) | - | 설계 5종(2026-05-27, 활성 미결정 0) 기반. masterRuleDataList(P-002 부모) 사이클에서 선행 자산 검증·연동. |
| 2026-07-08 | §2~§4 | → 완료 | 단위테스트 5건 신설 / P-002 정식 연동(2안) / RBAC 선행 등재 확인 / E2E 경유 실측 / 코드 시드(CURR_CD 그룹 4행). |
| 2026-07-09 | DEC-02 정정 | 오판 정정 | "BE 미구현" 판단은 **오판** — cp 덮어쓰기 후 grep 한 순서 오류. 선행 커밋에 BE(Service/DTO)도 완전 구현 실재 확인 → 재작성분 git 원복, 단위테스트만 선행 구현 기준으로 유지(5/5 그린). 선행 자산 최종 무수정(프리셋 제거 1건 제외). |
| 2026-07-09 | ITEM-FE-01 | 프리셋 제거 | 사용자 지시("조회조건 PREFIX 다 빼줘") — DEFAULT_CODE_VAL "USD"→"". |

---

**개발체크리스트**. 5종 설계 산출물 단일 원천 + 선행 구현 자산(BE/FE/BPMN) 전부 재사용. 본 사이클 = 검증 보강 + 호출 부모 연동.
