---
screenId: codeConfirm
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-26
작성자: Agent
---

# mdm — 마루 코드 버전 확정(검사 8항·적용시점·diff) 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-03 design.md D12 계승)**: `Mes-Guide.md` §4 의 5종 설계 산출물 게이트는
> As-Is → To-Be 이행을 전제한다. 이 화면은 **As-Is 레거시가 없는 신규 화면**이라 분석리포트가 없고 G1~G7 게이트도
> 성립하지 않는다. TSK-06-02~06-04 선례처럼 5종을 **기능설계서 1종**으로 줄인다. 근거 칸은 원천 설계
> `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`), 결정 `docs/mdm/adr/0002-version-confirm-without-approval.md`
> (이하 ADR-0002), 시안 `docs/mdm/design/basic/html/04-master-code.html` 탭7, 선행 설계 `docs/mdm/tasks/TSK-06-05/design.md`
> (이하 `§절`)다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeConfirm` /
> pageId `codeConfirm` / 페이지 유형 `L`(목록+상세) / tsup entry key `pages/dmc/codeConfirm/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 버전 확정 |
| 화면 식별자 | `codeConfirm` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드의 DRAFT 버전을 희망 apply_from 과 함께 RELEASED 로 확정한다. 확정 전에 검사 8항(10행) 결과 표와 직전 RELEASED 대비 diff·바뀐 카테고리 요약을 보인다. 거부가 하나라도 있으면 확정할 수 없고, 경고는 대화상자에서 확인해야 확정된다. 확정 트랜잭션(DRAFT → RELEASED, 직전 RELEASED 의 apply_to 닫기, 첫 확정이면 CREATED → INUSE)은 공통 버전 상태 서비스가 한 번에 한다. 결재 없이 담당자가 확정한다(ADR-0002). |
| 주요 사용자 | 담당자(`MDM_STEWARD`, dmc CONFIRM 세트 — 검사·확정) / 표준 관리자(`MDM_STD_ADMIN`, dmc READ 세트 — 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 버전 확정, 또는 코드 수정(`codeEdit`) 화면에서 내 DRAFT 를 고르고 `확정 이동` |

근거: 04:227-400(버전 상태와 적용시점), 04:401-421(상신 시 검사), ADR-0002 D1·D4·D5·D6, §1·§6.7.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dmc` | `docs/mdm/screens/README.md` §3, `MdmScreenGroup.DMC`(spec 의 `mdc` 는 오탈자, D1) |
| mesModule | `m-mdm` | 01 A.4.5 `m-{moduleId}` |
| 화면식별자 (screenId) | `codeConfirm` | `docs/mdm/screens/README.md` §3, 식별자 사전 §A.3.2 |
| pageName / pageId / serviceId | `codeConfirm` | screenId 동일값(MES 룰), BPMN process id |
| 페이지 유형 | `L`(목록+상세) — 좌 확정 대기 목록, 우 확정 폼·검사 결과·diff | §6.7 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/codeConfirm/{action}` | §6.5 |
| 주요 API path (BFF→BE) | `POST /oasis/codeConfirm/{action}` | 상동 |
| Frontend 파일명 | `m-mdm/pages/dmc/codeConfirm/page.tsx`(+ `api.ts`·`types.ts`·`checks.ts`·`ConfirmModal.tsx`) | `docs/mdm/screens/README.md` 경로 규약 |
| tsup entry key | `pages/dmc/codeConfirm/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`(READ), `validate`(EDIT), `confirm`(CONFIRM) | §6.5, D4 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 마스터코드(`dmc`) > 버전 확정(`codeConfirm`, MENU_SEQ `005`) | `DataInitializer.seedMdmCodeConfirmMenu()` 코드 시드(§6.8) |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-LIST` | 확정 대기 목록(좌, `cf-list`) | keyword 조회, MDM 원천 마루 코드의 DRAFT 마다 한 행 |
| `A-FORM` | 확정 폼(우 상단, `cf-form`) | 대상·상태 배지·잠금 배지, 직전 RELEASED, 희망 apply_from, 검사·확정 버튼 |
| `A-CHECKS` | 검사 결과 표(`cf-checks`) | 검사 10행(1·2·2-1·2-2·3·4·5·6·7·8), 거부 행 강조 |
| `A-DIFF` | diff(`cf-diff`) | 직전 RELEASED 대비 테이블·키·변경·이전·이후 |
| `A-CATE` | 바뀐 카테고리 요약(`cf-cate-summary`) | 카테고리별 적중 건수 변화, 추가·빠진 코드, 줄어든 카테고리 강조, 그대로인 카테고리 |
| `A-ERROR` | 오류 영역(`cf-error`) | 서버 거부 message 를 그대로 보인다 |
| `A-MODAL` | 확정 대화상자(`ConfirmModal`) | 경고 목록·경고 확인 체크·미래 적용 경고·확인 |

## 3. 조회조건 정의 (영역: A-LIST)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | `MARU_CODE_ID`·`MARU_CODE_NAME` | 검색어 | Input(`cf-keyword`) + 조회(`cf-search`) | N | (빈 값) | ID·이름 부분 일치. 비면 확정 대기 DRAFT 전체 | §6.5 search |

### 3.2 확정 대기 목록 (A-LIST)

| 컬럼 | 필드 | 비고 |
|---|---|---|
| ID / 이름 | `maruCodeId`·`maruCodeName` | |
| 버전 / 종류 | `verLabel`·`verKind` | `v1.001`·`MINOR` |
| 소유자 | `ownerId` | |
| 행 | `cf-row-{maruCodeId}-{ver}` | 누르면 `view(maruCodeId, ver)` |
| 빈 상태 | `cf-list-empty` | "확정할 DRAFT 가 없습니다" |

## 4. 상세 영역 필드 정의

### 4.1 확정 폼(A-FORM, `cf-form`)

| 필드 | 설명 | 근거 |
|---|---|---|
| 대상(`cf-target`) | `PROC_CD v1.001 MINOR` + 이름 + `VersionStatusBadge` + `DraftLockBadge`(현재 사용자와 소유자 비교) | §6.7-2 |
| 직전 RELEASED(`cf-previous`) | `직전 RELEASED v1.000 · 2024-01-01 00:00:00`. 없으면 "최초 버전 — 적용 순서 검사를 하지 않습니다" | 04:411, I3 |
| 희망 적용 시작 일시(`cf-apply-from`) | `datetime-local`(step 1초). 서버에는 `yyyy-MM-dd HH:mm:ss`(KST)로 보낸다 | I34 |
| 확정 결과(`cf-released`) | DRAFT 가 아니면 입력 대신 적용 구간 `from ~ to`·확정자(`requestedBy`)·확정 일시를 보인다(읽기 전용) | §6.7-2 |

### 4.2 검사 결과 표(A-CHECKS, `cf-checks`)

| 칸 | 설명 |
|---|---|
| 번호 | `1`·`2`·`2-1`·`2-2`·`3`·`4`·`5`·`6`·`7`·`8`(행 `cf-check-{no}`) |
| 검사 | 04 「상신 시 검사」 문구 요약 + 서버 `item`(enum 이름) |
| 결과(`cf-check-status-{no}`) | §10 라벨. REJECTED 행은 배경·글자 강조(`data-rejected="true"`) |
| 상세 | 이슈 message 와 itemKey(`ITEM:{code}`·`CATE:{cateId}`·`CATE_ITEM:{cateId},{code}`) |

### 4.3 diff(A-DIFF, `cf-diff`)

| 칸 | 설명 |
|---|---|
| 테이블 / 키 | `ITEM`·`CATE`·`CATE_ITEM` / D10 키 |
| 변경 | `ADDED` 추가 · `REMOVED` 삭제 · `CHANGED` 수정 |
| 이전 / 이후 | 값 맵을 `칼럼=값` 으로. 수정이면 바뀐 칼럼만 |
| 빈 상태 | `cf-diff-empty` — "변경된 행이 없습니다"(이때 4항은 거부, 최초 버전 제외) |

### 4.4 바뀐 카테고리 요약(A-CATE, `cf-cate-summary`)

카테고리마다 한 줄(`cf-cate-{cateId}`): `이름 (ID) · 이전 n건 → 이후 m건`, 새 카테고리·닫힘 표시, 추가·빠진 코드. 빠진 코드가 있거나
닫힌 카테고리는 "줄어듦"으로 강조한다(`data-reduced="true"`). 결과가 그대로인 카테고리는 `그대로: …` 한 줄. 기존 데이터에 미치는 영향은
검사하지 않고 diff 로 보여 주는 데 그친다(04:420).

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼 | 위치 | action | 활성 조건 |
|---|---|---|---|
| 조회(`cf-search`) | 목록 상단 | `search` | 늘 |
| 검사(`cf-validate`) | 확정 폼 | `validate` | DRAFT && `validate` 권한 |
| 확정(`cf-confirm`) | 확정 폼 | (대화상자 열기) | DRAFT && 소유자 본인 && `confirm` 권한 && 검사 결과 있음 && REJECTED 0건 && 검사한 apply_from 이 지금 입력값과 같음(I30) |
| 경고를 확인했습니다(`cf-ack`) | 대화상자 | — | 경고(2-1·2-2)가 있을 때만 보인다 |
| 확인(`cf-modal-ok`) | 대화상자 | `confirm` | 경고가 없거나 경고 확인을 체크함(I31) |

### 5.2 버튼별 동작 상세

| 동작 | 처리 | 근거 |
|---|---|---|
| 목록 행 선택 | `view(maruCodeId, ver)` — 헤더·대상 버전·직전 RELEASED·diff·카테고리 요약을 받는다. 입력·검사 결과를 비운다 | §6.5 view |
| 검사 | 입력을 `yyyy-MM-dd HH:mm:ss` 로 바꿔 `validate` 를 부른다(쓰기 없음). 10행·`futureApplyFrom` 을 받고, 보낸 apply_from 을 "검사한 값"으로 기억한다. 입력이 비면 오류 영역에 "적용 시작 일시를 입력하세요" | §6.5 validate, D3 |
| apply_from 변경 | 검사한 값과 달라지면 확정 버튼이 꺼진다 — 다시 검사해야 한다 | I30 |
| 확정 | 대화상자를 연다. 경고 목록과 체크, `futureApplyFrom` 이면 "적용 시작 일시가 미래입니다. 그 시각이 올 때까지 새 버전을 만들 수 없습니다. 적용 시각이 오기 전에는 확정 취소로 작성 중인 상태로 되돌릴 수 있습니다." 힌트 문장 "적용 시각이 지난 뒤에는 확정 취소를 할 수 없습니다." (확정 취소는 이 화면이 아니라 `codeMng` 버전에 있는 버튼) | D6·D7, ADR-0002 D8 |
| 확인 | `confirm(maruCodeId, ver, rowVersion, applyFrom, warningsAcknowledged)` — 경고가 없으면 `false`, 있으면 체크했을 때만 `true`. 성공 → 토스트 `확정했습니다` → `view`·`search` 다시 부름. 실패 → 대화상자를 닫고 서버 message 를 오류 영역에 그대로 | I31·I35, F11 |

ver 는 늘 문자열로 보내고(`2.000` 의 자릿수 보존), null·undefined 파라미터는 빼고 보낸다(I33, F23).

## 6. 입력값 검증 규칙 (서버 확정 검사, 04:401-421)

| 번호 | 검사 | 실패 시 | 비고 |
|---|---|---|---|
| 1 | 이 버전에 유효한 모든 코드값에 콤마·공백이 없다 | 거부 | 바뀐 행만이 아니라 V 의 모든 코드(I7) |
| 2 | 카테고리 해석(REGEX 문법·대상 칸) | 거부 | BASE 포함 |
| 2-1 | CATE_ITEM 에 이 버전에 없는 코드가 있다 | 경고 | |
| 2-2 | 해석 결과가 빈 카테고리 | 경고 | 2항에서 거부된 카테고리는 내지 않는다(D10) |
| 3 | apply_from 이 직전 RELEASED 의 apply_from 보다 엄격히 뒤 | 거부 | 최초 버전 면제. 과거 일시 허용(D3) |
| 4 | 직전 RELEASED 대비 추가·닫힘·변경 행이 있다 | 거부 | 최초 버전 면제(D2) |
| 5 | 배포 대상 시스템 | 보류 | 후속 Task 범위 |
| 6 | 계층 칸: 빈 중간 칸·같은 값의 앞 칸 불일치 | 거부 | |
| 7 | 추가 컬럼: 라벨 없는 번호에 값 | 거부 | |
| 8 | 계층 칸: `lvl_cnt` 뒤 칸에 값 | 거부 | |

서버 확정 거부 코드: MDM013(담당자 역할 없음), MDM003(DRAFT 소유자 아님), MDM001(row_version 불일치 — "다른 사용자가 수정했습니다.
다시 불러오세요"), MDM002(DRAFT 아님), MDM007(미적용 버전), MDM008(apply_from 순서), MDM010(검사 거부), MDM014(경고 미확인),
`REQUIRED_VALUE`·`INVALID_VALUE`(apply_from). 서버는 화면 판정을 믿지 않고 확정 트랜잭션 안에서 다시 검사한다(I23).

## 7. 상태 정의 및 상태별 제어

| 버전 상태 | 화면 |
|---|---|
| DRAFT(소유자 본인) | apply_from 입력·검사·확정 가능 |
| DRAFT(남의 것) | 검사는 가능, 확정 버튼 비활성(서버도 MDM003 으로 막는다). 잠금 배지 `잠김 · {소유자} 편집 중` |
| RELEASED | 읽기 전용 — 적용 구간·확정자·확정 일시. apply_from 이 미래면 상태 배지 "적용 대기" |

마루 코드 상태: 첫 RELEASED 의 apply_from 이 확정 시각 이하이면 확정 트랜잭션에서 CREATED → INUSE, 미래면 저장 상태 CREATED 로 두고
조회는 계산 상태를 보인다(§5 I24).

## 8. 권한 정의

| 역할 | dmc 권한 세트 | 이 화면에서 |
|---|---|---|
| `MDM_STEWARD` | `PERM_MDM_CONFIRM` | 조회·검사·확정(자기 DRAFT) |
| `MDM_STD_ADMIN` | `PERM_MDM_READ` | 조회(`search`·`view`)만. 검사·확정 버튼 비활성 |
| `SYSADMIN` | `PERM_ALL` | 버튼 RBAC 는 통과하나 담당자 역할이 없으면 서버가 MDM013 으로, 소유자가 아니면 MDM003 으로 막는다 |

## 9. 연동 화면 / 팝업

`codeEdit`(TSK-06-02) 화면의 `확정 이동`(`ver-confirm-move`)이 `openMdmPage("dmc/codeConfirm", {maruCodeId, ver})` 로 이 화면을
연다. 받은 값은 snapshot 에 남긴다(우선순위 handoff > snapshot). 확정 대화상자(`ConfirmModal`)는 스크린이 아니다(메뉴·OBJECT 없음).

## 10. 기타 열거형 (LoV)

| 열거 | 값 |
|---|---|
| 검사 결과 | `PASSED` 통과 · `WARNED` 경고 · `REJECTED` 거부 · `EXEMPT` 면제 · `DELEGATED` 공통 검사 · `DEFERRED` 보류 |
| diff 변경 | `ADDED` 추가 · `REMOVED` 삭제 · `CHANGED` 수정 |
| 카테고리 변화 | `NEW` 새 카테고리 · `CLOSED` 닫힘 · `CHANGED` 적중 변화 |
| 버전 종류 | `MAJOR` · `MINOR` |

## 11. 특이사항 / 설계 결정

- 시안 탭7 의 상신 일시·긴급 상신·긴급 사유·반려 사유·승인·반려 영역은 만들지 않는다(spec 제약, ADR-0002 결재 없는 확정).
- 3항은 SPI 계약상 공통 검사(DELEGATED)지만 `validate` 가 `ApplyFromOrderCheck` 결과로 통과·거부를 덮어 보인다(D3).
- 경고 목록은 MDM014 오류가 아니라 `validate` 응답에서 읽는다 — BPMN 안에서 던진 업무 오류는 message 만 온다(D6, F11).
- 미래 apply_from 경고는 서버 시계(`futureApplyFrom`)로만 판정하고 브라우저 시계를 보지 않는다(D7, I32).
- 소유자 본인 판정의 현재 사용자는 버튼 RBAC 훅(`useUserButtonRbac().userId`, `/api/auth/me`)에서 얻는다.
- 결정 목록은 `docs/mdm/tasks/TSK-06-05/design.md` 「담당자 확인 필요 결정」 이 정본이다.
