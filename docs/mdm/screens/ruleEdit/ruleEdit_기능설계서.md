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
> TSK-08-03(열 설정 표·입력 계약 — 표 카드 아래 섹션)과 TSK-08-04(값 테스트·테스트 결과·테스트 케이스 카드)는
> 이 문서에 **§5.x 카드 절을 더한다**. 기존 절은 고치지 않는다. 카드 ⑦ 배포 대상은 보류다(D11).
>
> **2026-09-28 — 피벗 보기 섹션과 조건 열 `axis` 제거.** 피벗은 결과 열 그룹(`res_grp`/`grp_cond`)이 조건식으로 표현하던
> 것을 표로 한 번 더 펼쳐 놓은 것뿐이었고 엔진은 축을 읽지 않았다. 두 표현 중 그룹만 남긴다. 아래 절에서 이
> 둘을 언급하지 않는다.
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
| action 어휘 | `search`·`view`(READ), `save`·`delete`·`copy`·`lock`·`unlock`·`handover`·`validate`·`execute`(EDIT, `execute` 는 TSK-08-04 값 테스트) | design §6.1, TSK-08-04 design D3 |
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
| 확정 이동 | — | `confirmScreenReady`(TSK-08-05 부터 true) && MDM 원천 && 선택 버전 DRAFT. 누르면 버전 확정(`dme/ruleConfirm`)을 그 룰·버전으로 연다 | — |
| 삭제 | `delete{maruRuleId, ver, rowVersion, target: VERSION}` | DRAFT && 소유자 = 나 | 공통 `VersionStateService.deleteDraft`(I6) |
| 선점 | `lock{maruRuleId, ver, rowVersion}` | 소유자 없는 DRAFT 에서만 보인다 | 공통 `DraftOwnershipService.acquire` |
| 해제 | `unlock{…}` | DRAFT && 소유자 = 나 | `release` |
| 넘기기 | `handover{…, newOwnerId}` | DRAFT && 소유자 = 나, 대상 ID 입력 | `handover`(대상 담당자 검사는 포트 — D5) |
| **확정 취소** | `delete{maruRuleId, ver, rowVersion, target: CONFIRM}` | **서버 판정값 `versions[].cancelConfirmable` 만 따른다**(ADR-0002 D8, TSK-02-01 D4-1). `RELEASED && apply_from > now && owner==me && 미적용 1개`. 확인창에 **06 교차 효과**(이 룰을 멤버로 가진 룰 세트와 이 룰의 결과를 쓰는 다른 룰의 확정이 잠시 막히고, 재확정하면 풀림)를 알린다 | 공통 `VersionStateService.cancelConfirm` — `RELEASED` 아니면 MDM002, 이미 적용됐으면 MDM025, 직전 구간 복회 값이 어긋나면 MDM001 |

> 확정 취소 버튼(action `delete`, `target: CONFIRM`)은 04 `codeEdit` 와 **같은 액션·같은 target 문자열**을 쓴다 — 액션
> 어휘 16종이 늘지 않는다(D8-13). `target` 은 `VERSION`(DRAFT 삭제)·`RULE`(폐기)·`CONFIRM`(확정 취소) 3종이다.

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
| 표 저장 | `save{part: TABLE, maruRuleId, ver, rowVersion, hitPolicy}` + `grids.rows.rows[{rowId, rowKind, cells(JSON 문자열), note?}]`(보이는 순서, seq 는 서버가 정한다 — I10). ~~조건 전부 `-` 인 행(ALL_NA_ROW 오류)이 있어도 저장한다(D3)~~ → TSK-08-04 부터 저장 시 검사 ERROR 가 하나라도 있으면 쓰기 전에 거부한다(§6.1). 거부되면 표 아래 `dt-save-rejected` 와 오류 창이 뜨고 편집은 남는다 |

**강조**: base 버전 대비 새 행(초록)·바뀐 칸(노랑, `ast` 는 견주지 않는다 — I22), 선택 행의 `-` 가 아닌 조건 칸(테두리), 검사
이슈가 걸린 칸(오류 붉게·경고 노랗게). 색은 shared 그리드 셀 상태 클래스만 쓴다.

**검사**: 저장 안 한 변경이 있으면 화면 JS 즉시 검사(evalex `analyzeRule`, I13), 없으면 서버 검사(`view.issues`)를 보인다. 행 이슈는
"오류/경고 [코드] 행 a, b — 메시지", 표 단위(VALUE_GAP·NULL_GAP)는 "표 단위 검사" 줄에 모은다. 표 저장 응답이 오면 저장 전 화면
검사(임시 ID 를 발급 번호로 바꾼 것)와 서버 검사를 견주어 "화면·서버 검사 일치" 또는 "서버 결과가 기준" 을 보인다(수용 7).
화면 분석기가 예외를 내는 칸(값 칸이 없는 셀 등)이 있으면 "화면 검사를 할 수 없는 칸이 있습니다(저장하면 서버가 검사한다)".

### 5.4 카드 ⑧ 활용처 (`RuleUsageCard`)

활용처 메모, 이 룰을 담은 룰 세트(ID·이름·상태)와 세트 안 의존 룰(이 룰이 읽는 이름을 만드는 룰)·역의존 룰(이 룰이 만드는 이름을
읽는 룰). 룰 ID 는 룰 화면 링크, 세트는 글자로만 둔다(세트 화면 TSK-08-06 이 없다).

### 5.5 카드 ④ 값 테스트 (`ValueTestCard`, TSK-08-04)

근거: `docs/mdm/tasks/TSK-08-04/design.md` §6.5·§6.7, 06 「값 테스트」. 액션 `execute`(EDIT 권한, 원장에 쓰지 않는다 — 수용 3).

| 요소 | 내용 |
|---|---|
| 대상(`vt-target`) | 편집할 수 있고 고른 버전이 DRAFT 면 첫 항목 `편집본 · 버전 N 저장 전`(기본값, 값 `BODY`), 그 뒤 `버전 N · 상태`(값 `V:N`) 전부 |
| 모드 설명(`vt-mode`) | "본문 정의"(표 카드의 저장 안 한 행·적중 정책으로 돌린다, 변수는 그 DRAFT 의 저장된 열) / "저장된 버전"(서버가 원장에서 읽어 판정). 열 설정 초안이 dirty 면 "열 설정 초안은 반영하지 않습니다"(`vt-col-draft`) |
| 입력 줄(`vt-field-<NAME>`) | 입력 계약(`always` ∪ 행별 필수·선택)의 이름마다 라벨·물리명·타입 배지·계약 배지("조건·키 필수"/"N행 필수"/"N행 선택")·**키 보냄** 확인란(`vt-key-<NAME>`, 기본 켬)·값 칸(`vt-input-<NAME>`, placeholder "비우면 NULL")·설명·도메인. 키 보냄 끔 = 레코드에 키 없음(MISSING_KEY), 빈 칸 = 키 있고 값 null(필수면 REQUIRED_NULL) |
| 돌리기 | `execute{maruRuleId, target, ver, hitPolicy?, inputJson}` + BODY 면 `grids.rows`. 서버 오류(요청 상한 등 MDM021)는 카드 안 `vt-error` 에 보인다 |
| 케이스로 저장 | 이름(`vt-case-name`)이 있어야 켜진다. 같은 대상·같은 입력으로 방금 돌린 결과가 있으면 그 결과를 기대값으로 싣는다(`save` part `CASE`) |

도메인 표준 식·예시 값은 보이지 않는다(view 에 표준 식이 없고 컬럼 사전에 예시 칼럼이 없다 — TSK-08-04 build-log B7·B8 보고).

### 5.6 카드 ⑤ 테스트 결과 (`TestResultCard`, TSK-08-04)

결과 없음이면 `vt-result-empty`. 결과가 오면 대상·"판정함/판정 오류"·평가 시각(`vt-result-target`), 판정 오류(단계·코드·메시지,
`vt-result-errors`), 결과 변수 표(`vt-result-values`, 결과 열 그룹이면 "그룹 열 N개 가운데 라벨 물리명"), 적중 행("{seq}행 (row_id id)",
기본 행이면 "어느 행도 참이 아니어서 기본 행"), 경고·깨진 셀·뺀 행. 결과가 표 카드에 보이는 정의(BODY 또는 같은 버전·같은 row_version·
저장 안 한 변경 없음)면 표 카드에 칠하고 "적중 행은 위 의사결정표에 칠했다"(`vt-result-on-table`), 아니면 그 버전의 읽기 전용 표
(`vt-result-table`)를 따로 칠한다 — 적중 행 초록(`ag-row-test-hit`), 첫 거짓 칸 붉음(`cell-test-false`), 그룹 고른 열 강조·나머지 흐림.
BODY 결과 뒤 표가 바뀌면 칠한 것을 지우고 "표가 바뀌어 값 테스트 결과를 지웠습니다. 다시 돌리세요."(`dt-test-stale`).

### 5.7 카드 ⑥ 테스트 케이스 (`TestCaseCard`, TSK-08-04)

`TB_MDM_RULE_TEST_CASE · 버전과 무관`. 열 `case_id · 이름 · 입력 · 기대 · 결과(대상) · 동작`(줄 `tc-row-<caseId>`), 없으면 "테스트 케이스가
없습니다"(`tc-empty`). 머리 "모두 돌리기"는 ④ 의 대상·입력으로 `execute{runCases: true}` 를 부르고 결과 배지(`tc-badge-<caseId>`)
"통과"/"실패 · 불일치 키"/"돌려 보기만"(기대값 없음)을 보인다. 기대 JSON 은 결과 변수 이름 → 값과 `hit`(적중 행 하나면 row_id 숫자,
여럿이면 배열, 기본 행이면 기본 행 row_id). 동작: "불러오기"(④ 입력 칸 채움, 키가 없는 변수는 키 보냄 끔), "기대값 갱신"(모두 돌리기
결과로, 담당자), "삭제"(한 번 더 눌러 "삭제 확인", 담당자). 쓰기는 `save` part `CASE`(`caseId`·`rowVersion` 조건, 삭제는 `caseDeleted`)이고
DRAFT·소유와 무관하게 담당자면 된다.

## 6. 입력값 검증 규칙

| 규칙ID | 대상 | 검증 | 판정 |
|---|---|---|---|
| V-001 | 헤더 룰명 | 필수, 100자 이하 | 서버(화면은 빈 값이면 저장 버튼을 막는다) |
| V-002 | 표 셀 | 셀 JSON 모양(키 일곱, 문자열 값, 그 버전의 var_id) | 서버 `RuleCellsCodec.validateShape`(I17) |
| V-003 | 표 행 | 기본 행은 DECISION 에 하나까지, 기존 row_id 는 그 DRAFT 에 있던 것만 | 서버(I10) |
| V-004 | 겹침·빈틈·도달 불가 | 이슈로 알린다. TSK-08-04 부터 ALL_NA_ROW 와 UNIQUE 표의 OVERLAP 은 저장을 거부하고 나머지는 경고다(§6.1) | 화면(즉시)·서버(저장 응답) 동치(수용 7 — 분석기 코드만 견준다) |

값 테스트·저장 시 검사 20여 종은 TSK-08-04 가 이 절에 더한다.

### 6.1 저장 시 검사 (TSK-08-04)

근거: `docs/mdm/tasks/TSK-08-04/design.md` §6.1(검사 × 적용 지점 정본)·§6.3·§6.4, 06 「저장 시 검사」. 공용 검사기
`common/rule/check/RuleSaveValidator` 를 표 저장(TABLE)·열 적용(COLUMNS)·값 테스트 본문(TEST_BODY)이 함께 부른다. 거부는 **쓰기 전**이다 —
ERROR 가 하나라도 있으면 저장이 롤백되고 행·적중 정책·row_version·행 카운터가 그대로다. 거부 메시지는
`룰 저장 거부: <코드> <메시지>; …`(MDM021), 경고는 저장 응답 issues 에 분석 이슈 뒤로 붙어 표 카드 "서버 저장 검사"(`dt-server-checks`)에 보인다.

| 검사 | TABLE | COLUMNS | 값 테스트 BODY |
|---|---|---|---|
| 타입·op 허용·범위 자리·경계 순서(한쪽 빈 구간은 1 타입 op 로 바꿔 저장)·목록(정렬·중복 제거)·`=` 패턴·CONTAINS·INSTR | 거부 | — | 셀 오류(그 행을 판정에서 뺀다) |
| Expression(서버 재파싱·AST 덮어쓰기·참조 변수·같은 변수 대소 비교 2회) | 거부 | 거부(08-03 파싱) | 셀 오류 |
| 생성해 보기(셀 텍스트 생성·컴파일) | 거부 | — | 셀 오류 |
| 미완성(NORMAL 행 조건 키 없음·결과 셀 없음) | 거부 | — | NA 로 판정 + 경고 |
| 도달 불가(ALL_NA_ROW 거부·UNREACHABLE 경고)·겹침(UNIQUE 만 거부)·빈틈(경고) | 거부/경고 | — | — |
| 룰 세트 순서(순서·순환 거부, 같은 결과 변수 중복 경고) | 거부/경고 | 거부/경고 | — |
| MDM 참조(`MASTER`·`MASTER_AT` 대상·카테고리·attr 라벨) | 거부 | 거부 | — |
| 코드 참조(값 없음 경고, `CODE_IN` 카테고리 없음 거부)·도메인 범위·필수 컬럼 IS NULL | 경고(카테고리 없음만 거부) | — | — |
| 입력 계약 변경·Expression 결과 타입(저장된 케이스로) | 경고 | 경고 | — |
| 요청 크기 상한(행 수·셀 길이·입력 JSON 길이·키 수·케이스 수) | 거부 | — | 거부 |

EXTERNAL 룰은 저장 자체가 막히므로 검사를 돌리지 않는다. 상한 값은 `RuleLimits` 한 곳에 있다(design D6).

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
| 값 테스트(`execute`) | O | O | X | 비소유 담당자·DRAFT 아닌 버전도 된다. 원장에 쓰지 않는다(TSK-08-04) |
| 테스트 케이스 저장·삭제(`save` part `CASE`) | O | O(서버: 담당자 MDM013) | X | 버전·DRAFT 소유와 무관(TSK-08-04) |

## 9. 연동 화면 / 팝업

| 대상 | 방식 |
|---|---|
| 룰 목록(`ruleMng`) → 이 화면 | `openRuleEdit` — sessionStorage 대상 + `mdm-rule-edit-target` 이벤트 + `portal-open-tab`(`mdm:dme/ruleEdit`). 이 화면은 마운트할 때 대상을 한 번 읽고 지우며, 열린 뒤에는 이벤트를 듣는다 |
| 활용처의 룰 링크 → 이 화면(다른 룰) | 같은 방식 |
| 이 화면 → 확정 화면(`ruleConfirm`, TSK-08-05) | 카드 ② `확정 이동` — `openMdmPage("dme/ruleConfirm", {maruRuleId, ver: String(선택 버전)})`(`mdm:dme/ruleConfirm` 탭). 활성 = `confirmScreenReady` && MDM 원천 && 선택 버전 DRAFT(08-05 I40). 소유자 판정은 확정 화면·서버가 한다 |

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
