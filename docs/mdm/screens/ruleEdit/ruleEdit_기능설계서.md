---
screenId: ruleEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 06 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dme
작성일: 2026-09-24
작성자: Agent
---

# mdm — 룰 화면 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-04-02 D14·TSK-04-04 선례)**: As-Is 레거시가 없는 신규 화면이라 5종을 **기능설계서 1종**으로
> 줄인다. 근거는 원천 설계(`docs/mdm/design/basic/06-business-rule.md`)와 `docs/mdm/tasks/TSK-08-02/design.md` 다.
>
> **카드별 절** — 이 화면은 카드 슬롯(`pages/dme/ruleEdit/cards.ts`)으로 넓어진다. TSK-08-02 가 카드 ①②③⑧을 만들었고,
> TSK-08-03(열 설정 표·입력 계약·피벗 — 표 카드 아래 섹션)과 TSK-08-04(값 테스트·테스트 결과·테스트 케이스 카드)는
> 이 문서에 **§5.x 카드 절을 더한다**. 기존 절은 고치지 않는다. 카드 ⑦ 배포 대상은 보류다(D11).
>
> **Frontend 개발 연계 값** — mesModule `m-mdm` / moduleGroup `dme` / pageName `ruleEdit` / pageId `ruleEdit` / 포털 pageId
> `mdm:dme/ruleEdit` / tsup entry key `pages/dme/ruleEdit/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 룰 화면 |
| 화면 식별자 | `ruleEdit` |
| 모듈 | `mdm` / moduleGroup `dme`(업무기준) |
| 화면 목적 | 룰 하나의 헤더·버전·의사결정표·활용처를 한 화면에서 보고 고친다. 편집은 DRAFT 소유자만 한다(06 「DRAFT 소유권」, 수용 4) |
| 주요 사용자 | 담당자(`MDM_STEWARD`) — 편집은 DRAFT 소유자만 / 표준 관리자 — 조회만 |
| 접근 경로 | 포털 → 마루 MDM > 업무기준 > 룰 화면, 또는 룰 목록(`ruleMng`)의 룰 ID·등록 성공·활용처 링크 |

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dme` | design D1 |
| screenId = serviceId = OBJECT_ID | `ruleEdit` | design I23 |
| 주요 API path | UI→BFF `POST /api/mdm/oasis/ruleEdit/{action}`, BFF→BE `POST /oasis/ruleEdit/{action}` | design §6.1 |
| Frontend 파일 | `m-mdm/pages/dme/ruleEdit/page.tsx`, `cards.ts`, `cards/*`, `decision-table/*`, `state/useRuleEdit.ts` | design §2.1-FE·FT |
| action 어휘 | `search`·`view`(READ), `save`·`delete`·`copy`·`lock`·`unlock`·`handover`(EDIT) | design §6.1 |
| 화면 간 이동 | `@/dme/rule-handoff`(`openRuleEdit`·`takeRuleEditTarget`) | design D9·I28 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-TOP` | 상단 바 | 룰 고르기(ID·룰명 앞부분 20건), 현재 룰 ID·룰명, 버전 고르기, 버전 상태·잠금 배지, 외부 원천이면 "조회 전용" 배지, 알림, MDM001 이면 "다시 불러오기" |
| `C-1` | ① 헤더 | §5.1 |
| `C-2` | ② 버전 | §5.2 |
| `C-3` | ③ 의사결정표 | §5.3 |
| `C-8` | ⑧ 활용처 | §5.4 |

룰을 고르기 전에는 "룰을 고르세요 …" 빈 상태만 보인다. 카드는 16칸 격자에 `span` 만큼 놓인다(①·② 8칸씩, ③·⑧ 16칸).

## 3. 편집 가능 여부 (서버 판정)

화면은 편집 여부를 스스로 계산하지 않고 `view` 응답의 두 값만 따른다(I7).

| 값 | 규칙(서버) | 화면에서 켜는 것 |
|---|---|---|
| `editable` | 원천 MDM && 선택 버전 DRAFT && 소유자 = 나 | 의사결정표 편집(DECISION 만) |
| `headerEditable` | 원천 MDM && (미적용 버전에 소유자가 있으면 그 소유자 = 나, 없으면 담당자 역할) | 헤더 입력·헤더 저장·폐기 |

카드 안 버튼은 `canDoButton(rbac, "ruleEdit", action)` 도 함께 본다 — 권한이 없으면 숨기지 않고 비활성이다(§6.7.0).

## 4. 상단 바 (A-TOP)

| 필드ID | 화면 표시명 | 입력 방식 | 설명 |
|---|---|---|---|
| T-001 | 룰 | TextBox + [찾기] | `search{keyword}` → 결과 버튼 목록. 누르면 `view{maruRuleId}` |
| T-002 | 버전 | ComboBox | 고르면 `view{maruRuleId, ver}` |
| T-003 | (배지) | 표시 | `VersionStatusBadge`·`DraftLockBadge`("편집 중(나)"·"잠김 · {소유자} 편집 중"·"선점 가능") |

`view` 에 버전을 주지 않으면 서버가 고른다: 미적용 DRAFT → 그 밖의 미적용 → 현재 RELEASED → 가장 큰 버전(§6.3.1).
저장 안 한 변경이 있는 채 룰·버전을 바꾸면 확인을 받는다(§6.9).

## 5. 카드

### 5.1 카드 ① 헤더 (`RuleHeaderCard`)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 설명 |
|---|---|---|---|---|---|
| H-001 | `MARU_RULE_ID` | 룰 ID | 표시 | — | |
| H-002 | `MARU_RULE_NAME` | 룰명 | TextBox | Y | 100자 이하 |
| H-003 | `DESCRIPTION` | 설명 | Textarea | N | |
| H-004 | `USAGE_NOTE` | 활용처 메모 | Textarea | N | |
| H-005 | `SOURCE_KIND`/`SOURCE_SYSTEM` | 원천 | 표시 | — | `MDM` 또는 `EXTERNAL · 시스템` |

| 버튼 | action | 규칙 |
|---|---|---|
| 헤더 저장 | `save{part: HEADER, maruRuleId, maruRuleName, description, usageNote}` | 버전과 무관하게 바로 저장(06:913). 마지막 저장이 이긴다 |
| 폐기 → 폐기 확인 | `delete{maruRuleId, target: RULE}` | INUSE 일 때만 보이고 두 번 눌러야 한다(06:766). 미적용 버전이 있으면 비활성(서버도 거부, I9) |

### 5.2 카드 ② 버전 (`RuleVersionCard`)

표: 버전(누르면 그 버전을 연다)·상태 배지·적용 구간·소유자·base.

| 버튼 | action | 켜지는 조건(화면) | 서버 판정 |
|---|---|---|---|
| 새 버전 | `copy{maruRuleId}` → 새 버전으로 다시 불러온다 | MDM && 미적용 버전 없음 && DEPRECATED 아님 | 직전 RELEASED 복사(I5), 미적용 버전이 있으면 MDM006(수용 5) |
| 확정 이동 | — | `confirmScreenReady`(지금 false — 확정 화면 TSK-08-05 가 켠다) | — |
| 삭제 | `delete{maruRuleId, ver, rowVersion, target: VERSION}` | DRAFT && 소유자 = 나 | 공통 `VersionStateService.deleteDraft`(I6) |
| 선점 | `lock{maruRuleId, ver, rowVersion}` | 소유자 없는 DRAFT 에서만 보인다 | 공통 `DraftOwnershipService.acquire` |
| 해제 | `unlock{…}` | DRAFT && 소유자 = 나 | `release` |
| 넘기기 | `handover{…, newOwnerId}` | DRAFT && 소유자 = 나, 대상 ID 입력 | `handover`(대상 담당자 검사는 포트 — D5) |

미적용 버전이 있으면 "미적용 버전 N 이 있어 새 버전을 만들 수 없습니다(한 번에 하나)" 를 보인다. 모든 쓰기 뒤에는 `view` 를 다시 불러
row_version 을 서버 값으로 맞춘다. 거부가 MDM001 이면 "다른 창에서 바뀌었습니다. 다시 불러오세요" 와 [다시 불러오기] 를 준다.

### 5.3 카드 ③ 의사결정표 (`DecisionTableCard`)

**적중 정책**(DECISION 만): FIRST·UNIQUE·PRIORITY·COLLECT·ANY 와 한 줄 설명. 산출(DERIVE) 룰은 "산출 룰은 열 설정(TSK-08-03)에서
편집한다" 안내와 읽기 전용 표.

**그리드 열**(3줄 머리 — shared `AgDataGrid` 열 그룹, D8):

| 열 | 머리(위 → 아래) | 칸 | 편집 |
|---|---|---|---|
| 행 | 행 | 행 번호(`seq`, 기본 행은 "기본") + `row N`(새 행은 "새 행"), 드래그 손잡이(NORMAL 만), 누르면 행 선택 | — |
| 조건 2 타입 | 조건 → 변수 → OP·하한·상한 | `c{varId}_op`·`_left`·`_right` | OP 는 `opsFor` 드롭다운, 상한은 구간 op 일 때만 |
| 조건 1 타입 | 조건 → 변수 → OP·값(String 이면 값·목록) | `op`·`left` | IN·NOT IN 값은 콤마·줄바꿈으로 끊는다 |
| 조건 Equal | 조건 → 변수 → 무관·값 | `na`(체크)·`left` | 무관을 켜면 `{op:NA}` |
| 조건 Expression | 조건 → 변수 → 무관·식 | `na`·`expr` | 읽기 전용(D7 — 식 편집은 08-03·08-04) |
| 결과 Value / Expression | 결과 → 변수 → 값 / 식 | `val` / `expr` | 값만 편집, 식은 읽기 전용 |
| 행 설명 | 행 설명 | `note` | 편집 |
| 검사 | 검사 | 행별 "오류 n · 경고 m"(서버 결과면 "(서버)") | — |
| 삭제 | 삭제 | ✕ | 편집 가능할 때 |

변수 머리(가운데 줄): 표시명·물리명·값 타입 배지(`Number(2)`·`일자`·`코드`·`String`·`Boolean`·`자유식`·`타입 없음`)·표시 타입
배지(`Equal`·`1 타입`·`2 타입`·결과 `상수`/`식`), 툴팁은 설명·도메인명. 타입은 서버가 해석한 값만 쓴다(I16).

**op 목록**(06:310, 순서 고정): String 9 · Number 11 · 일자 11 · 코드 도메인 String 10(+IN 카테고리) · Boolean 4 · 2 타입은 끝에
구간 넷. 셀 편집 규칙은 design §6.7.4 표를 따른다(I19).

| 버튼 | 동작 |
|---|---|
| 행 추가 | 조건 셀 모두 `-`, 결과 셀 없음, 기본 행 앞(임시 ID 는 음수, 지운 번호를 다시 쓰지 않는다) |
| 기본 행 추가 | 기본 행이 없을 때만 |
| 되돌리기 | 마지막으로 불러온 상태로 |
| 표 저장 | `save{part: TABLE, maruRuleId, ver, rowVersion, hitPolicy}` + `grids.rows.rows[{rowId, rowKind, cells(JSON 문자열), note?}]`(보이는 순서, seq 는 서버가 정한다 — I10). 조건 전부 `-` 인 행(ALL_NA_ROW 오류)이 있어도 저장한다(D3) |

**강조**: base 버전 대비 새 행(초록)·바뀐 칸(노랑, `ast` 는 견주지 않는다 — I22), 선택 행의 `-` 가 아닌 조건 칸(테두리), 검사
이슈가 걸린 칸(오류 붉게·경고 노랗게). 색은 shared 그리드 셀 상태 클래스만 쓴다.

**검사**: 저장 안 한 변경이 있으면 화면 JS 즉시 검사(evalex `analyzeRule`, I13), 없으면 서버 검사(`view.issues`)를 보인다. 행 이슈는
"오류/경고 [코드] 행 a, b — 메시지", 표 단위(VALUE_GAP·NULL_GAP)는 "표 단위 검사" 줄에 모은다. 표 저장 응답이 오면 저장 전 화면
검사(임시 ID 를 발급 번호로 바꾼 것)와 서버 검사를 견주어 "화면·서버 검사 일치" 또는 "서버 결과가 기준" 을 보인다(수용 7).
화면 분석기가 예외를 내는 칸(값 칸이 없는 셀 등)이 있으면 "화면 검사를 할 수 없는 칸이 있습니다(저장하면 서버가 검사한다)".

### 5.4 카드 ⑧ 활용처 (`RuleUsageCard`)

활용처 메모, 이 룰을 담은 룰 세트(ID·이름·상태)와 세트 안 의존 룰(이 룰이 읽는 이름을 만드는 룰)·역의존 룰(이 룰이 만드는 이름을
읽는 룰). 룰 ID 는 룰 화면 링크, 세트는 글자로만 둔다(세트 화면 TSK-08-06 이 없다).

## 6. 입력값 검증 규칙

| 규칙ID | 대상 | 검증 | 판정 |
|---|---|---|---|
| V-001 | 헤더 룰명 | 필수, 100자 이하 | 서버(화면은 빈 값이면 저장 버튼을 막는다) |
| V-002 | 표 셀 | 셀 JSON 모양(키 일곱, 문자열 값, 그 버전의 var_id) | 서버 `RuleCellsCodec.validateShape`(I17) |
| V-003 | 표 행 | 기본 행은 DECISION 에 하나까지, 기존 row_id 는 그 DRAFT 에 있던 것만 | 서버(I10) |
| V-004 | 겹침·빈틈·도달 불가 | 이슈로 알리고 저장은 막지 않는다 | 화면(즉시)·서버(저장 응답) 동치(수용 7, D3) |

값 테스트·저장 시 검사 20여 종은 TSK-08-04 가 이 절에 더한다.

## 7. 상태 정의 및 상태별 제어

| 버전 상태 | 표 편집 | 새 버전 | 삭제·해제·넘기기 | 선점 |
|---|---|---|---|---|
| DRAFT(소유자 = 나) | O | X(미적용) | O | — |
| DRAFT(다른 소유자) | X | X | X | — (버튼 없음) |
| DRAFT(소유자 없음) | X | X | X | O |
| REQUESTED·APPROVED·적용 전 RELEASED | X | X | X | — |
| 현재 RELEASED(미적용 없음) | X | O | — | — |

룰 상태 DEPRECATED 면 새 버전을 거부한다. EXTERNAL 룰은 모든 쓰기를 거부하고 "조회 전용" 배지를 단다.

## 8. 권한 정의

| 기능 | SYSADMIN | MDM_STEWARD | MDM_STD_ADMIN | 비고 |
|---|---|---|---|---|
| 조회(`search`·`view`) | O | O | O | 비소유자도 된다(수용 4) |
| 헤더·표 저장(`save`) | O | O(서버: D6·소유자) | X | |
| 새 버전(`copy`) | O | O | X | 서버 담당자 역할 검사 |
| 삭제·선점·해제·넘기기 | O | O(서버: 소유자) | X | 선점은 공통 서비스가 담당자 역할을 본다 |

## 9. 연동 화면 / 팝업

| 대상 | 방식 |
|---|---|
| 룰 목록(`ruleMng`) → 이 화면 | `openRuleEdit` — sessionStorage 대상 + `mdm-rule-edit-target` 이벤트 + `portal-open-tab`(`mdm:dme/ruleEdit`). 이 화면은 마운트할 때 대상을 한 번 읽고 지우며, 열린 뒤에는 이벤트를 듣는다 |
| 활용처의 룰 링크 → 이 화면(다른 룰) | 같은 방식 |
| 확정 화면(`ruleConfirm`, TSK-08-05) | 아직 없음 — 확정 이동 버튼 비활성 |

## 10. 기타 열거형 (LoV)

| 열거형 | 코드값 | 표시 |
|---|---|---|
| op 코드 | `NA`·`EQ`·`NE`·`LT`·`LE`·`GT`·`GE`·`IN`·`NOT_IN`·`CODE_IN`·`CONTAINS`·`INSTR`·`IS_NULL`·`NOT_NULL`·구간 넷 | `-`·`=`·`<>`·`<`·`<=`·`>`·`>=`·`IN`·`NOT IN`·`IN 카테고리`·`CONTAINS`·`INSTR`·`IS NULL`·`IS NOT NULL`·(구간은 코드 그대로, I18) |
| `HIT_POLICY` | FIRST·UNIQUE·PRIORITY·COLLECT·ANY | 좌동 |
| `DISP_TYPE`(06 표기) | `Equal`·`1`·`2`·`Expression`·`Value` | Equal·1 타입·2 타입·식·상수 |

## 11. 특이사항 / 설계 결정

| ID | 항목 | 근거 |
|---|---|---|
| N-1 | 식(Expression) 칸은 읽기 전용이고 저장에 받은 그대로 되돌려 보낸다 | design D7 |
| N-2 | 겹침·ALL_NA_ROW 오류가 있어도 표를 저장한다(거부 정책은 TSK-08-04) | design D3 |
| N-3 | 의사결정표 그리드는 열 구조·편집 여부·버전이 바뀌면 새로 마운트한다(열 정의가 바뀌면 ag-grid 머리 그룹 셀이 null 그룹을 읽어 죽는다 — e2e 실측) | design Build 이탈 B9 |
| N-4 | 카드 ⑦ 배포 대상은 그리지 않는다 | design D11 |
