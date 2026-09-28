---
screenId: ruleConfirm
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-26
작성자: Agent
---

# mdm — 룰 버전 확정(확정 검사·적용시점·diff) 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-04-02 D14·TSK-08-02 선례)**: As-Is 레거시가 없는 신규 화면이라 5종을 **기능설계서 1종**으로
> 줄인다. 목차는 `ruleEdit_기능설계서.md` 의 1~11 을 따른다. 근거 칸은 원천 설계 `docs/mdm/design/basic/06-business-rule.md`(이하 `06:행`),
> 결정 `docs/mdm/adr/0002-version-confirm-without-approval.md`(이하 ADR-0002), 시안 `docs/mdm/design/basic/html/06-business-rule.html`
> 「상신」(배치 참고용), 선행 설계 `docs/mdm/tasks/TSK-08-05/design.md`(이하 `§절`)다. 화면 구조는 `dmc/codeConfirm`(TSK-06-05)을 복제했다.
>
> **Frontend 개발 연계 값** — mesModule `m-mdm` / moduleGroup `dme` / pageName `ruleConfirm` / pageId `ruleConfirm` / 포털 pageId
> `mdm:dme/ruleConfirm` / tsup entry key `pages/dme/ruleConfirm/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 버전 확정 |
| 화면 식별자 | `ruleConfirm` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dme`(업무기준) |
| 화면 목적 | 업무 룰의 DRAFT 버전을 희망 apply_from 과 함께 RELEASED 로 확정한다. 확정 전에 확정 검사 4항(저장 시 검사 전부·비어 있음·값 테스트·결과 변수 참조)과 적용 순서 결과 표, 입력 계약 변경, 직전 RELEASED 대비 row_id diff 를 보인다. 거부가 하나라도 있으면 확정할 수 없고, 경고(입력 계약 변경은 따로)는 대화상자에서 확인해야 확정된다. 확정 트랜잭션(DRAFT → RELEASED, 직전 RELEASED 의 apply_to 닫기, apply_from 이 지났으면 CREATED → INUSE)은 공통 버전 상태 서비스가 한 번에 한다. 결재 없이 담당자가 확정한다(ADR-0002). |
| 주요 사용자 | 담당자(`MDM_STEWARD`, dme CONFIRM 세트 — 검사·확정) / 표준 관리자(`MDM_STD_ADMIN`, dme READ 세트 — 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 버전 확정, 또는 룰 화면(`ruleEdit`) 카드 ② 에서 MDM 원천 DRAFT 를 고르고 `확정 이동` |

근거: 06:1124-1135(상신 시 검사), 06:1253-1277(버전 비교), 06:232(계약 변경 경고), ADR-0002 D4·D5·D6, §1·§6.8.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dme` | `docs/mdm/screens/README.md` §3(spec 의 `mdr` 은 오탈자, D1) |
| mesModule | `m-mdm` | 01 A.4.5 `m-{moduleId}` |
| 화면식별자 (screenId) | `ruleConfirm` | 식별자 사전 §A.3.2 |
| pageName / pageId / serviceId | `ruleConfirm` | screenId 동일값(MES 룰), BPMN process id |
| 페이지 유형 | `L`(목록+상세) — 좌 확정 대기 목록, 우 확정 폼·검사 결과·계약 변경·diff | §6.8 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/ruleConfirm/{action}` | §6.5 |
| Frontend 파일명 | `m-mdm/pages/dme/ruleConfirm/page.tsx`(+ `api.ts`·`types.ts`·`checks.ts`·`ConfirmModal.tsx`) | `docs/mdm/screens/README.md` 경로 규약 |
| tsup entry key | `pages/dme/ruleConfirm/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`(READ), `validate`(EDIT), `confirm`(CONFIRM) | §6.5 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 업무기준(`dme`) > 버전 확정(`ruleConfirm`, MENU_SEQ `003`, FULL_SEQ `5050300`) | `DataInitializer.seedMdmRuleConfirmMenu()`(§6.9) |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-LIST` | 확정 대기 목록(좌, `rc-list`) | keyword(`rc-keyword`)·조회(`rc-search`). MDM 원천 룰의 DRAFT 마다 한 행(`rc-row-{룰ID}-{ver}`) = 룰 ID·이름·종류·버전·소유자. 비면 "확정할 DRAFT 가 없습니다"(`rc-list-empty`) |
| `A-FORM` | 확정 폼(`rc-form`) | 대상 `QLTY_GRD_JDG 버전 2 · DECISION`(`rc-target`)·상태 배지·잠금 배지, 직전 RELEASED(`rc-previous`), 희망 apply_from(`rc-apply-from`), 검사(`rc-validate`)·확정(`rc-confirm`). DRAFT 가 아니면 읽기 전용 확정 결과(`rc-released`) |
| `A-CHECKS` | 검사 결과 표(`rc-checks`) | 항목 4행(`rc-check-{item}`) + 적용 순서 1행(`rc-check-APPLY_FROM`). 결과 칸 `rc-check-status-{item}`, 거부 행 강조 |
| `A-CONTRACT` | 입력 계약 변경(`rc-contract`) | 계약 변경 경고 목록과 안내, 또는 상태 문구(§5.4) |
| `A-DIFF` | row_id diff(`rc-diff`) | 건수 요약(`rc-diff-counts`), 같은 행 보기 토글(`rc-diff-show-same`), 행(`rc-diff-{rowId}`) |
| `A-ERROR` | 오류 영역(`rc-error`) | 서버 거부 message 를 그대로 보인다(I39) |
| `ConfirmModal` | 확정 대화상자 | 일반 경고 확인란(`rc-ack`), 계약 변경 확인란(`rc-contract-ack`), 미래 적용 경고(`rc-future-warning`), 확인(`rc-modal-ok`)·취소(`rc-modal-cancel`) |

## 3. 편집(확정) 가능 여부 (서버 판정)

화면의 버튼 비활성은 안내일 뿐이고 서버가 확정 직전에 모든 검사를 다시 한다(I28). 서버 판정 순서는 공통 확정
트랜잭션(`DefaultVersionStateService.confirm`)이다: 담당자 역할(MDM013) → DRAFT 로드 → 소유자(MDM003) → row_version(MDM001) →
DRAFT(MDM002) → 미적용 하나(MDM007) → apply_from 순서(MDM008) → 확정 검사 SPI(ERROR → MDM010, 경고 미확인 → MDM014).
EXTERNAL 원천 룰은 `validate`·`confirm` 을 거부한다.

## 4. 상단 바 (A-LIST)

이 화면에는 룰 화면 같은 상단 바가 없다. 왼쪽 확정 대기 목록이 그 자리다. keyword 는 룰 ID·룰명 부분 일치이고 정렬은 룰 ID
오름차순이다. 행을 누르면 그 룰·버전으로 `view` 를 부른다(ver 는 정수, I37). 확정에 성공하면 목록을 다시 부른다.

## 5. 영역

### 5.1 확정 폼 (A-FORM)

| 항목 | 표시·입력 | 비고 |
|---|---|---|
| 대상 | `{룰 ID} 버전 {ver} · {룰 종류}` + 룰명 + `VersionStatusBadge` + `DraftLockBadge` | |
| 직전 RELEASED | `직전 RELEASED 버전 {ver} · {apply_from}`, 없으면 "최초 버전 — 적용 순서 검사를 하지 않습니다" | `view.previous` |
| 희망 적용 시작 일시 | `datetime-local`(step 1초) → 서버에 `yyyy-MM-dd HH:mm:ss`(KST)로 보낸다 | I38 |
| 검사 | `validate` — 쓰기 없음. RBAC `validate` 가 없으면 비활성 | I27 |
| 확정 | 활성 = DRAFT && 소유자 본인 && `confirm` 권한 && 검사 결과 있음 && 거부 0건 && 적용 순서 거부 아님 && 검사한 apply_from 이 지금 입력값과 같음 | I34 |
| 확정 결과(`rc-released`) | DRAFT 가 아니면 적용 구간·확정자·확정 일시. 방금 확정했으면 "직전 버전 {n} 의 적용을 닫았습니다"(`rc-closed-previous`) | `closedPreviousVer` |

### 5.2 검사 결과 표 (A-CHECKS)

| 행 | 제목 | 거부 조건 |
|---|---|---|
| `SAVE_CHECKS` | 저장 시 검사 전부 | 저장 시 검사(STORED) ERROR |
| `NOT_EMPTY` | 비어 있음 | 변수 0개 또는 행 0개 |
| `TEST_CASES` | 값 테스트 | 기대값 있는 케이스 하나라도 불일치·판정 오류. 상세에 `전체 · 기대값 있음 · 통과 · 실패` 요약 |
| `RESULT_VAR_RELEASED` | 결과 변수 참조 | 읽는 이름을 만드는 다른 룰에 RELEASED 버전이 하나도 없음 |
| `APPLY_FROM` | 적용 순서 | apply_from 이 직전 RELEASED apply_from 보다 뒤가 아님(같으면 거부). 최초 버전은 면제 |

결과 라벨: PASSED 통과 · WARNED 경고 · REJECTED 거부 · EXEMPT 면제. 상세 칸은 이슈 message 와 itemKey(`ROW:15,16;VAR:2`·`CASE:3`·`NAME:FOO`)다.

### 5.3 확정 대화상자 (`ConfirmModal`)

- 일반 경고(계약 변경이 아닌 WARNING)가 있으면 목록과 "경고를 확인했습니다"(`rc-ack`).
- 입력 계약 변경 경고(`code = CONTRACT_CHANGED`)가 있으면 따로 강조한 목록과 "입력 계약 변경을 확인했습니다"(`rc-contract-ack`).
- 필요한 확인란을 모두 체크하기 전에는 확인이 비활성이다. 경고가 있으면 `warningsAcknowledged=true`, 없으면 `false` 로 보낸다(I35). 대화상자를 다시 열면 확인란이 풀린다.
- 서버가 준 `futureApplyFrom` 이 참이면 "적용 시작 일시가 미래입니다. 그 시각이 올 때까지 이 룰의 새 버전을 만들 수 없습니다. 적용 시각이 오기 전에는 확정 취소로 작성 중인 상태로 되돌릴 수 있습니다." 를 보인다. 브라우저 시계는 보지 않는다(I36). 힌트 문장으로 **06 교차 효과**를 알린다(D8-10) — "확정 취소를 하면 이 룰을 멤버로 가진 룰 세트와 이 룰의 결과를 쓰는 다른 룰의 확정이 잠시 막힙니다. 다시 확정하면 풀립니다." 확정 취소 버튼은 이 화면이 아니라 `ruleEdit` 버전에 있다.
- 성공하면 토스트 "확정했습니다" 뒤 `view`·`search` 를 다시 부른다.

### 5.4 입력 계약 변경 (A-CONTRACT)

| 상태 | 문구 |
|---|---|
| 최초 버전 | "최초 버전 — 비교할 직전 RELEASED 가 없습니다" |
| 검사 전 | "검사를 하면 직전 RELEASED 대비 입력 계약 변경을 보입니다" |
| 저장 시 검사 거부 | "저장 시 검사 오류가 있어 계약 변경을 보지 못했습니다"(I41 — 검사기가 앞 단계 ERROR 면 원장 검사를 건너뛴다) |
| 계약 변경 있음 | 경고 목록 + "적용 시점부터 이 키를 보내지 않거나 NULL 을 보내는 호출은 판정 오류가 됩니다" |
| 변경 없음 | "직전 RELEASED 대비 입력 계약 변경 없음" |

### 5.5 row_id diff (A-DIFF)

건수 요약 `추가 n · 삭제 n · 수정 n · 같음 n`. 표 = 행 번호·변경(추가·삭제·수정·같음)·순서(이전→이후)·바뀐 칸(`changedVarIds` 를
변수 라벨로)·이전 셀·이후 셀. 같은 행(SAME)은 기본으로 접고 "같은 행 보기" 로 편다. 바뀐 행이 없으면 "바뀐 행이 없습니다"(`rc-diff-empty`).

## 6. 입력값 검증 규칙

| 항목 | 규칙 | 오류 |
|---|---|---|
| apply_from | 필수. 비우고 검사하면 화면이 "적용 시작 일시를 입력하세요" 를 보인다 | 서버: `REQUIRED_VALUE` / 형식 오류 `INVALID_VALUE`(field `applyFrom`) |
| apply_from 순서 | 직전 RELEASED apply_from 보다 엄격히 뒤. 과거 일시는 허용 | MDM008 |
| 확정 검사 4항 | §5.2 | MDM010 |
| 경고 확인 | 경고가 있는데 `warningsAcknowledged=false` | MDM014 |
| 동시 수정 | row_version 불일치 / 이미 확정됨 | MDM001 / MDM002 |

적용시점 하한(리드타임·긴급)과 룰 참조 검사(배포 대상 시스템 기준)는 하지 않는다(PRD §2 규칙 7, spec 수용 기준 3).

## 7. 상태 정의 및 상태별 제어

| 대상 버전 상태 | 희망 apply_from 입력 | 검사 | 확정 |
|---|---|---|---|
| DRAFT(소유자 = 나) | O | O(`validate` 권한) | O(§5.1 조건) |
| DRAFT(다른 소유자) | O | O | X |
| RELEASED 등 DRAFT 아님 | 읽기 전용(확정 결과 표시) | X | X |

apply_from 이 확정 시각 이전이면 확정 트랜잭션이 룰 상태를 CREATED → INUSE 로 올린다. 미래면 저장 상태는 CREATED 로 두고 조회
화면은 계산 상태(apply_from 이 지나면 INUSE)를 보인다(ADR-0002 D6).

## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 조회(`search`·`view`) | O | O | O | |
| 검사(`validate`) | O | O | X | 쓰기 없음 |
| 확정(`confirm`) | O | O(서버: 담당자 MDM013·소유자 MDM003) | X | CONFIRM 세트에만 있다(EDIT 세트 밖) |

## 9. 연동 화면 / 팝업

| 대상 | 방식 |
|---|---|
| 룰 화면(`ruleEdit`) → 이 화면 | 카드 ② `확정 이동` — `openMdmPage("dme/ruleConfirm", {maruRuleId, ver})`. 이 화면은 handoff 를 한 번 꺼내 ver 를 정수로 바꿔 `view` 를 부르고 snapshot 에 남긴다(handoff > snapshot) |
| 확정 대화상자 | `ConfirmModal`(스크린이 아님, OBJECT 없음) |

## 10. 기타 열거형 (LoV)

| 열거형 | 코드값 | 표시 |
|---|---|---|
| 검사 결과 | PASSED·WARNED·REJECTED·EXEMPT | 통과·경고·거부·면제 |
| diff 종류 | ADDED·REMOVED·CHANGED·SAME | 추가·삭제·수정·같음 |
| 검사 항목 | SAVE_CHECKS·NOT_EMPTY·TEST_CASES·RESULT_VAR_RELEASED·(APPLY_FROM) | 저장 시 검사 전부·비어 있음·값 테스트·결과 변수 참조·적용 순서 |

## 11. 특이사항 / 설계 결정

- 시안 「상신」의 긴급 상신·긴급 사유·상신 일시·결재 흐름 영역은 만들지 않는다(spec 제약, ADR-0002).
- 경고는 모두 확인 대상이다(D3). 입력 계약 변경은 호출하는 쪽을 깨는 변경이라 확인란을 따로 둔다(D4). 서버 계약은 불리언 하나(`warningsAcknowledged`)다.
- 경고 목록은 MDM014 오류가 아니라 `validate` 응답에서 읽는다. BPMN 안에서 던진 업무 오류는 봉투에 message 만 온다(D9).
- diff 는 서버가 셀 JSON 을 정규화해 Java 로 비교한다(D8). 같은 행도 내려오며 화면이 접는다(D12).
