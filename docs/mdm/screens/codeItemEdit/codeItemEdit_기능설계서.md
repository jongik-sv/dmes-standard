---
screenId: codeItemEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-24
수정일: 2026-09-28 (카테고리 편집 codeCateEdit 를 [카테고리] 탭으로 합침, D-101)
작성자: Agent
---

# mdm — 코드 편집 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-03 design.md 담당자 확인 필요 결정 D12)**: `Mes-Guide.md` §4 의 5종 설계
> 산출물 게이트는 As-Is → To-Be 이행을 전제한다. 이 화면은 **As-Is 레거시가 없는 신규 화면**이라 분석리포트가 없고
> G1~G7 게이트도 성립하지 않는다. TSK-04-02 D14·TSK-04-03·TSK-04-04 D5 선례처럼 5종을 **기능설계서 1종**으로 줄인다.
> 근거 칸은 원천 설계 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`), 시안
> `docs/mdm/design/basic/html/04-master-code.html`(이하 `시안:행`, 카테고리는 탭5·6), 선행 설계
> `docs/mdm/tasks/TSK-06-03/design.md`(이하 `§절`)·`docs/mdm/tasks/TSK-06-04/design.md`(이하 `06-04 §절`)다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeItemEdit` /
> pageId `codeItemEdit` / 페이지 유형 `L`(그리드 편집) / tsup entry key `pages/dmc/codeItemEdit/page`
>
> **화면 통합 (2026-09-28 사용자 결정: 4화면→2화면 통합, D-101)**: 옛 카테고리 편집 화면(`codeCateEdit`, TSK-06-04)을 이 화면의
> [카테고리] 탭으로 합쳤다. 메뉴 leaf `codeCateEdit` 는 없어졌고 서버 OBJECT·서비스·BPMN `codeCateEdit` 는 남는다 — 카테고리
> 조회·REGEX 미리보기·되돌리기는 그 서비스를 그대로 부르고, 저장·검사는 이 화면 서비스 한 번으로 합쳤다(§5.2). 옛
> `docs/mdm/screens/codeCateEdit/codeCateEdit_기능설계서.md` 의 내용은 이 문서로 옮기고 지웠다.

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 코드 편집 |
| 화면 식별자 | `codeItemEdit` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드 하나의 버전 V 에서 코드 행(코드값·이름·약칭·순서·설명·계층 칸·추가 컬럼)을 선분(from_ver–to_ver)으로 편집하고, 카테고리(REGEX·TABLE) 정의와 TABLE 소속을 함께 편집한다. DRAFT 는 추가·수정·삭제·되돌리기, RELEASED 는 이름·약칭·순서·설명만 경미 수정, CANCELLED 는 읽기 전용 diff 다. 계층 트리와 카테고리 미리보기로 결과를 확인한다. 코드 행·카테고리·소속 변경은 [저장] 한 번으로 보낸다. |
| 주요 사용자 | 담당자(`MDM_STEWARD`, dmc CONFIRM 세트 — 편집·경미 수정) / 표준 관리자(`MDM_STD_ADMIN`, dmc READ 세트 — 조회·미리보기만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 코드 편집, 또는 마루 코드 화면(`codeMng`)의 버전 [코드 편집] 버튼(§9) |

근거: 04:820(화면 표 「코드 편집」 행), 04:40-65(행 조작·되돌리기), 04:522-549(경미 수정), 04:178-183(카테고리 정의 REGEX·TABLE),
04:489-504(카테고리 연쇄), 04:1027(BASE 예약), §0(entry-point `dmc`, D1), D-101.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dmc` | `docs/mdm/screens/README.md` §3, `MdmScreenGroup.DMC` |
| mesModule | `m-mdm` | 01 A.4.5 `m-{moduleId}` |
| 화면식별자 (screenId) | `codeItemEdit` | `docs/mdm/wbs.md:939`, 식별자 사전 §A.3.2 |
| pageName / pageId / serviceId | `codeItemEdit` | screenId 동일값(MES 룰), BPMN process id |
| 페이지 유형 | `L`(그리드 편집) + 트리·카테고리 탭, 미리보기·경미 수정 보조 패널 | §6.8, D-101 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/codeItemEdit/{action}`, 카테고리 탭 조회·미리보기·되돌리기는 `POST /api/mdm/oasis/codeCateEdit/{action}` | spec API 스펙, §6.6, 06-04 §2 |
| 주요 API path (BFF→BE) | `POST /oasis/codeItemEdit/{action}`, `POST /oasis/codeCateEdit/{action}` | 상동 |
| Frontend 파일명 | `m-mdm/pages/dmc/codeItemEdit/page.tsx`, 카테고리 탭은 `m-mdm/pages/dmc/codeItemEdit/cate/`(CategoryTab·useCategoryEdit·components) | `docs/mdm/screens/README.md` 경로 규약 |
| tsup entry key | `pages/dmc/codeItemEdit/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | codeItemEdit: `search`·`view`·`compare`(READ), `validate`·`save`·`restore`·`execute`(EDIT·CONFIRM) / codeCateEdit: `view`·`compare`(READ), `restore`(EDIT) | §6.6, D6(`MdmActions`), 06-04 D2 |
| 버튼 권한 OBJECT | 코드·저장·경미 수정은 `codeItemEdit`. 카테고리 탭의 추가·닫기·취소·REGEX 편집·TABLE 소속 이동도 `codeItemEdit` `save`(`editable && canDoButton(rbac, "codeItemEdit", "save")`) 하나로 판정한다 — 카테고리·소속 변경이 이 화면의 `save` 로 함께 저장되기 때문이다(옛 `codeCateEdit` `save` 권한은 더 쓰지 않는다, 결함 수정). `codeCateEdit` `restore` 는 이 화면에 없는, 서버 restore 를 직접 부르는 카테고리 되돌리기(서버 행)를 위해 남겨 둔 권한이다 | D-101, 2026-09-28 카테고리 권한 판정 결함 수정 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 마스터코드(`dmc`) > 코드 편집(`codeItemEdit`) | `DataInitializer.seedMdmCodeItemEditMenu()` 코드 시드. `codeCateEdit` leaf 는 `removeMergedMdmCodeMenus` 가 없앤다(D-101) |

## 2. 화면 영역 정의

```
┌ 코드 편집 ─────────────────────────────────── [조회] [저장] ┐
│ 마루 코드 [▼]  버전 [▼]  □ 닫힌 코드 보기                      │
│ (DRAFT) 편집 가능 · 소유자 · row_version                       │
├──────────────────────────────────────┬──────────────────────┤
│ [코드] [트리] [카테고리]              │ 카테고리 미리보기     │
│ 코드 탭: 코드 행 그리드               │ (공용 자리)           │
│ 트리 탭: 계층 트리                     │                      │
│ 카테고리 탭: 카테고리 목록+추가 |       ├──────────────────────┤
│   REGEX 편집 또는 TABLE transfer-list  │ 경미 수정 패널        │
│                                      │ (RELEASED 에서만)     │
└──────────────────────────────────────┴──────────────────────┘
```

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 마루 코드·버전 선택, 닫힌 코드 보기 |
| `A-STATUS` | 상태 줄 | 버전 상태 배지, 편집 가능 여부·소유자, `row_version = n`, 미적용 2개 경고 |
| `A-GRID` | [코드] 탭 | 코드 행 그리드(편집·변경 배지·행 이슈·동작 버튼), 거르기 표시 |
| `A-TREE` | [트리] 탭 | 계층 칸 트리(접기·펴기), 이 노드로 편집 |
| `A-CATE` | [카테고리] 탭 | 왼쪽 카테고리 목록(cateId·이름·defKind·변경 배지·행 이슈)+추가 폼, 오른쪽 REGEX 편집(`A-REGEX`) 또는 TABLE 소속 편집(`A-TRANSFER`). BASE 는 편집·닫기 없이 안내만 |
| `A-PREVIEW` | 카테고리 미리보기 | 오른쪽 한 자리. [코드]·[트리] 탭은 저장된 정의 기준(카테고리 선택, 콤보/목록·근거 모드, 경고), [카테고리] 탭은 고른 카테고리의 후보 정의 기준(REGEX 는 서버 재해석, TABLE 은 안내) |
| `A-PATCH` | 경미 수정 패널 | RELEASED 에서만. 이름·약칭·순서·설명 입력, 나머지는 잠김 |
| `A-BTN` | 버튼 | `MdmPageLayout.buttons`(조회·저장) |

탭 이름 옆 경고 아이콘(`code-tab-grid-issue`·`code-tab-cate-issue`)은 그 탭에 저장 검사 이슈가 있을 때 보인다.

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | `MARU_CODE_ID` | 마루 코드 | Select(`code-maru-select`) | Y | (없음) | `search` 결과(ID 순). 고르면 곧바로 `view` | §6.6 search |
| S-002 | `VER` | 버전 | Select(`code-ver-select`) | Y | DRAFT → 없으면 CANCELLED 아닌 최대 | 표시 `v1.008 상태`(소수 세 자리) | 04:275, §6.6 기본 버전 |
| S-003 | — | 닫힌 코드 | Checkbox(`code-closed-toggle`) | N | 끔 | 켜면 V 에서 닫힌 행(`closed`)을 흐린 색으로 덧붙인다 | §6.8 |

조회는 codeItemEdit `view` 를 먼저 부르고, 그 응답이 고른 버전으로 codeCateEdit `view` 를 따로 부른다(카테고리·TABLE 소속·
코드 목록). 카테고리 조회가 실패해도 코드 탭은 그대로 쓰고, 카테고리 탭에 `카테고리를 읽지 못했습니다: …`(`cate-load-error`)를
보인다. 저장하지 않은 변경이 있어도 마루 코드·버전을 바꾸면 확인 없이 다시 읽는다(합치기 전 두 화면과 같다).

### 3.2 조회 결과 (코드 탭 그리드 컬럼)

| 컬럼 | 필드 | 편집(DRAFT·editable) | 비고 |
|---|---|---|---|
| 코드 | `code` | 새 행만 | 기존 행은 잠김(불변 규칙 39) |
| 이름 / 약칭 / 순서 | `name`·`alterName`·`seq` | 예 | CHANGED 행의 바뀐 칸은 옛 값을 취소선으로 함께 보인다 |
| 1차 … {lvlCnt}차 | `lvl1`…`lvl5` | 예 | 마루 코드의 `lvl_cnt` 만큼만 보인다(동적 열) |
| (라벨) | `attr01`…`attr10` | 예 | 라벨(`attrNN_name`)이 있는 번호만 보인다(동적 열) |
| 설명 | `description` | 예 | D14 |
| 변경 | — | — | 배지 `추가`·`수정`·`삭제` + 행 이슈 문구(`code-row-issue-{code}`) |
| 동작 | — | — | DRAFT 만. 변경 행 `되돌리기`(restore), 변경 없는 행 `삭제`, 화면에서만 바꾼 행 `취소` |

변경·동작 칸은 값 없이 행 상태로 그리되, 상태(`__local|change`)를 두 칸(`__change`·`__action`) 값으로 싣고 툴팁을 끈다
(`tooltip: false`) — 값이 그대로인 칸은 ag-grid 가 다시 그리지 않아 저장 전 [취소]·"삭제" 배지가 안 보였다(D4).

### 3.3 카테고리 목록 (A-CATE 왼쪽)

| 컬럼 | 필드 | 비고 |
|---|---|---|
| ID / 이름 / 종류 | `cateId`·`cateName`·`defKind` | 배지로 종류(REGEX·TABLE) 표시 |
| 변경 | — | 배지 `추가`·`수정`·`닫기` |
| 행 이슈 | — | 저장 검사 카테고리 이슈 가운데 그 cateId 의 것(`cate-row-issue-{cateId}`) |
| 닫기·취소 버튼 | — | `cate-close-{cateId}`·`cate-undo-{cateId}` — **BASE 는 닫기를 렌더링하지 않는다**(06-04 수용 기준 2) |
| 추가 폼 | ID·이름·종류(Select) | `cate-add-id`·`cate-add-name`·`cate-add-kind`·`cate-add-submit` |

카테고리 탭 머리에는 `카테고리·소속 변경은 코드 변경과 함께 상단 [저장] 한 번으로 저장합니다` 와 `row_version = n`
(`cate-row-version`)을 보인다. 마루 코드를 고르기 전에는 `마루 코드를 고르세요`(`cate-empty`), BASE 를 고르면
`BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다`(`cate-base-readonly`). 행에 붙지 않는 이슈(소속 코드 이슈 등)는 탭 머리
목록(`cate-issues`)에 보인다.

## 4. 상세 영역 필드 정의

### 4.1 경미 수정 (A-PATCH)

| 필드 | 편집 | 근거 |
|---|---|---|
| 코드(`patch-code`) | 잠김(disabled) | 04:531·543, 시안:318 |
| 이름·약칭·순서·설명(`patch-name`·`patch-alter-name`·`patch-seq`·`patch-description`) | 가능 | 04:531 |
| 계층 칸·추가 컬럼(`patch-lvlN`·`patch-attrNN`) | 잠김(disabled) | 04:531, 수용 기준 5 |

설명 문구: `이름·약칭·순서·설명만 고친다. 코드·계층 칸·추가 컬럼 값은 잠기며 새 버전으로만 바꾼다`. 행을 고르지 않았으면 `그리드에서 고칠 행을 고르세요.`

### 4.2 REGEX 편집 (A-REGEX, `cate-regex-edit`)

| 필드 | 편집 | 근거 |
|---|---|---|
| 이름(`cate-regex-name`) | 가능(DRAFT·편집 가능) | |
| 대상 칸(`cate-regex-target`) | Select, `CategoryDefTarget` 전체(CODE·LVL1~5·ATTR01~10) | `CategoryOwner.MASTER_CODE.allowedDefTargets()` |
| 정규식(`cate-regex-expr`) | 가능 | 원천 04:183 — 화면은 정규식을 실행하지 않는다, 서버 `compare` 재해석만 |

### 4.3 TABLE 소속 편집 (A-TRANSFER, `cate-transfer`)

| 필드 | 설명 |
|---|---|
| 검색(`cate-transfer-search`) | 코드·이름 부분 일치(대소문자 무시) |
| 1차 필터(`cate-transfer-lvl1`) | 코드의 `lvl1` 값으로 좁힌다 |
| 가능(`cate-transfer-available`) / 소속(`cate-transfer-member`) | 좌우 목록, 전체선택 체크박스+건수 |
| `>`(`cate-transfer-move-right`) / `>>`(`cate-transfer-move-right-all`) | 선택·화면에 보이는 전체를 소속으로 옮긴다 |
| `<`(`cate-transfer-move-left`) / `<<`(`cate-transfer-move-left-all`) | 선택·화면에 보이는 전체를 소속에서 뺀다 |
| 미저장 표시(`cate-transfer-mark-{code}`) | 후보는 서버 코드(버전 V)에 코드 탭의 미저장 변경을 겹친 것이다. 코드를 적고 저장하지 않은 새 행은 `미저장` 으로 덧붙고, 삭제 표시한 코드는 `삭제 예정` 으로 표시되며 가능 쪽에서 빠진다(소속이면 소속 쪽에 남는다) |

### 4.4 카테고리 미리보기 (A-PREVIEW)

| 탭 | 내용 | 근거 |
|---|---|---|
| [코드]·[트리] (`code-preview`) | 카테고리 선택(`code-preview-cate`), 콤보(계층 단계 Select, 시뮬레이터 `combo()` 규칙)·목록·근거 모드, `CODE_LIST(...)` 제목, 경고. 저장된 정의 기준이다(codeItemEdit `compare`) | §6.8, D11 |
| [카테고리] (`cate-preview`) | 고른 카테고리가 REGEX 면 후보 defExpr·defTarget 의 서버 재해석(codeCateEdit `compare`) — 해당 건수(`cate-preview-summary`), 정규식 오류(`cate-preview-invalid`), 행 목록(코드·이름·대상 값·해당). TABLE 이면 `TABLE 카테고리는 소속 목록이 곧 결과입니다` 안내 | 06-04 §1, 04:183 |

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼 | 위치 | action | 표시 조건 |
|---|---|---|---|
| 조회 | 상단 | `view` | 늘 |
| 저장 | 상단 | `save` | 선택 버전이 `editable`(DRAFT·소유자·MDM·미적용 ≤ 1). 보낼 변경(세 그리드)이 하나도 없으면 비활성 |
| 코드 추가(`code-add`) | 코드 탭 그리드 머리 | `save` | 상동 |
| 이 노드로 편집(`code-tree-to-grid`) | 트리 탭 | — | 트리 노드를 골랐을 때 활성 |
| ✕ 거르기 풀기(`code-filter-clear`) | 그리드 제목 옆 | — | 거르기 중 |
| 카테고리 추가(`cate-add-submit`) | 카테고리 목록 하단 | (로컬, 저장 시 `save`) | `editable && codeItemEdit save` 권한 |
| 닫기(`cate-close-{cateId}`) | 카테고리 목록 행 | (로컬) | `editable && codeItemEdit save` 권한, BASE 아님, 화면에서 바꾸지 않은 행 |
| 취소(`cate-undo-{cateId}`) | 카테고리 목록 행 | — | `editable && codeItemEdit save` 권한, 화면에서만 바꾼(로컬) 카테고리 |
| REGEX 이름·대상 칸·정규식(`cate-regex-*`) | REGEX 편집 영역 | (로컬) | `editable && codeItemEdit save` 권한(옛 결함: `editable` 만 보고 잠기지 않았다) |
| TABLE 소속 이동(`cate-transfer-move-*`) | TABLE 편집 영역 | (로컬) | `editable && codeItemEdit save` 권한(옛 결함: `editable` 만 보고 잠기지 않았다) |
| 경미 수정 저장(`patch-save`) | 경미 수정 패널 | `execute` | `patchable`(RELEASED·MDM)이고 `patchBlocked` 가 아님 |

### 5.2 버튼별 동작 상세

| 동작 | 처리 | 근거 |
|---|---|---|
| 저장 | 세 그리드를 codeItemEdit `save` 한 번으로 보낸다(아래 계약). 성공 → 토스트 `저장했습니다` → 코드·카테고리를 모두 다시 읽기. 실패 → 오류 모달에 서버 메시지 → 같은 세 그리드로 `validate` 를 불러 코드 행 이슈는 그리드 행에, 카테고리 이슈는 카테고리 탭 목록 행(또는 탭 머리 목록)에 보이고 탭 이름에 경고 아이콘. 화면은 검사 결과로 저장을 막지 않는다(판정은 서버). 거부된 변경은 화면에 그대로 남는다 | §6.6 save 순서, F11, D-101 |
| 코드 추가 | 맨 앞에 새 행. 거르기 중이면 계층 칸을 선택 노드의 경로로 채운다 | §6.8 |
| 삭제 | 소속 TABLE 카테고리가 있으면 `카테고리 n개에서 함께 빠집니다. 삭제할까요?` 확인 | 04:489-500 |
| 되돌리기 | 카테고리 탭에 저장하지 않은 카테고리·소속 편집이 있으면 먼저 확인 모달(`저장하지 않은 카테고리 편집이 있습니다. 되돌리면 함께 사라집니다. 계속할까요?`) — [확인] 이어야 `restore` 로 서버 되돌리기 → 토스트 `되돌렸습니다` → 다시 읽기(카테고리 탭도 새로 읽어 편집이 사라진다). [취소] 는 아무 것도 하지 않는다(되돌리기 전 상태 그대로) | 04:50-65, 2026-09-28 결함 수정(재조회가 카테고리 편집을 경고 없이 버리던 것을 확인 모달로 막음) |
| 계층·코드 칸 편집 뒤 | 세 그리드로 `validate` 를 불러 이슈를 미리 보인다 | 시안:1071 |
| 경미 수정 저장 | `execute` → 토스트 `경미 수정했습니다` → 다시 읽기(같은 행 유지) | 04:522-549 |
| 카테고리 추가 | ID·이름·종류를 받아 로컬 목록에 `추가` 배지로 더한다. 저장 전까지 서버에 반영되지 않는다 | 06-04 §1 |
| 카테고리 닫기 | 로컬 목록에서 `닫기` 배지로 표시(저장 시 서버가 TABLE 이면 소속도 연쇄로 닫는다, 불변 규칙 12) | 04:504 |
| REGEX 값 변경 | 매 변경마다 codeCateEdit `compare` 를 불러 오른쪽 미리보기를 다시 그린다(정규식은 서버만 실행) | 04:183, 06-04 D1 갈래 3 |
| TABLE 소속 이동 | 화면 상태(Set)만 바꾼다 — 저장할 때 원래 소속과 비교해 diff 로 보낸다. `compare` 를 부르지 않는다. 카테고리 목록에 없는 카테고리(추가 뒤 취소해 목록에서 빠진 카테고리)와 닫은(DELETED) 카테고리의 소속 diff 는 저장 요청에 싣지 않는다 — 닫기는 서버가 소속을 함께 닫으므로(`MasterCodeCateSegmentOps.closeCategory`, 불변 규칙 12) 같이 보내면 `CATE_NOT_FOUND` 로 저장 전체가 거부된다(2026-09-28 결함 수정) | 06-04 §1 |

탭을 바꿔도 카테고리·소속 편집은 남는다(상태는 화면이 들고, 탭 본문은 그리기만 한다).

**합친 저장 계약 (codeItemEdit, D-101)**

| 호출 | params | grids | 응답 |
|---|---|---|---|
| `save` | `maruCodeId`·`ver`(문자열)·`rowVersion` | `rows`(코드 행 변경)·`categories`(카테고리 변경)·`members`(소속 변경) — 세 그리드를 **늘** 보낸다(빈 배열 가능, 빠뜨리면 서버 바인딩이 "No suitable method" 로 실패, F9) | `{ rowVersion, closedCategories }` |
| `validate` | `maruCodeId`·`ver` | `save` 와 같은 세 그리드 | `{ issues: [코드 행 이슈, itemKey = 코드], cateIssues: [카테고리·소속 이슈, codeCateEdit validate 의 issues 모양] }` |

- `rows` 행: `rowStatus` ADDED·CHANGED·DELETED + `code` + 값 칸(빈 칸 제외, CHANGED 는 행 전체 값).
- `categories` 행: `rowStatus` ADDED·CHANGED(`cateId`·`cateName`·`defKind`·`defExpr`·`defTarget`·`description` 전체)·DELETED(`cateId`).
- `members` 행: `rowStatus` ADDED·DELETED, `cateId`·`code`. 코드 탭에서 삭제 표시한 코드의 소속 행은 보내지 않는다(코드 삭제가 소속을
  함께 닫는다). 저장하지 않은 새 코드를 소속에 넣으면 ADDED 로 보낸다 — 서버는 코드 행 변경을 먼저 적용한 V 모습 위에서 카테고리를
  판정한다(D-101). 옮긴 뒤 코드 칸을 고쳐 후보에서 사라진 코드의 ADDED 는 뺀다.
- 한 트랜잭션이며 성공하면 `row_version` 이 1 오른다.

## 6. 입력값 검증 규칙 (서버 저장 검사, §6.3·06-04 §1.4)

### 6.1 코드 행 (`issues`)

| 이슈 코드 | 규칙 | 근거 |
|---|---|---|
| `CODE_REQUIRED` | 코드값이 비었다 | PK |
| `CODE_FORBIDDEN_CHAR` | 코드값·계층 칸 값에 콤마·공백(탭 포함) | 04:109·197 |
| `LVL_BEYOND_CNT` | `lvl_cnt` 뒤 칸에 값 | 04:112 |
| `LVL_GAP` | 값이 있는 칸 앞에 빈 칸 | 04:112 |
| `LVL_PARENT_MISMATCH` | 같은 값(그룹 값·코드값)이 이미 다른 앞 칸 아래에 있다(V 에 유효한 행 기준, 자기 코드 제외) | 04:112, D10 |
| `ATTR_WITHOUT_LABEL` | 라벨 없는 번호의 추가 컬럼 값 | 04:164 |
| `SEGMENT_OVERLAP` | V 에 이미 있는 코드를 추가, 한 요청에 같은 코드 둘 | 04:418 |
| `CODE_NOT_FOUND` | 수정·삭제 대상이 V 에 없다 | 입력 검사 |
| `SOURCE_EXTERNAL` | 원천 EXTERNAL 은 저장·경미 수정 불가 | 04:84·846 |

### 6.2 카테고리·소속 (`cateIssues`)

| 이슈 코드 | 규칙 | 근거 |
|---|---|---|
| `CATE_ID_REQUIRED` | cate_id 가 비었다 | PK |
| `CATE_ID_FORBIDDEN_CHAR` | cate_id 에 점·콤마·공백 | `MaruIdRules.FORBIDDEN_CHAR_PATTERN` |
| `CATE_NAME_REQUIRED` | cate_name 이 비었다 | |
| `INVALID_REGEX` | REGEX defExpr 이 `Pattern.compile` 실패 | 04:183, 불변 규칙 4 |
| `DEF_TARGET_NOT_ALLOWED` | REGEX defTarget 이 허용 목록 밖 | `CategoryOwner.MASTER_CODE.allowedDefTargets()` |
| `DEF_KIND_IMMUTABLE` | 저장된 defKind 와 다른 종류로 수정, 또는 소속 대상 카테고리가 TABLE 이 아니거나 같은 저장에서 닫힘 | 불변 규칙 1 |
| `CATE_ID_OVERLAP` | 이 버전에 이미 있는 cate_id 로 추가 | 04:47 |
| `CATE_NOT_FOUND` | 수정·닫기·소속 대상 카테고리가 V 에 없다 | 입력 검사 |
| `MEMBER_CODE_NOT_FOUND` | 소속에 넣는 코드가 이 버전에 없다(뺄 때는 검사하지 않는다) | 불변 규칙 5 |
| (MDM012) | BASE 는 모든 조작에서 거부 | 04:1027, 불변 규칙 2 |

화면은 `itemKey` 가 목록의 cateId 이고 `field` 가 `code` 가 아니면 그 목록 행에, 아니면(소속 코드 이슈 등) 탭 머리 목록에 보인다.
검사 대상은 이번에 바꾼(touched) 행뿐이다. 거부는 `MDM022 코드 저장 검사를 통과하지 못했습니다: <코드|ID>[<칸>] <이슈 코드> <문구>; …`.

## 7. 상태 정의 및 상태별 제어

| 버전 상태 | 편집 | 경미 수정 | 화면 |
|---|---|---|---|
| DRAFT(소유자·MDM·미적용 ≤ 1) | 가능 | — | 저장·코드 추가·동작 열·카테고리 추가·닫기, `편집 가능 · 소유자 x` |
| DRAFT(남의 것·미적용 2개) | 불가 | — | 읽기 전용, 미적용 2개면 `미적용 버전이 2개입니다. 하나를 삭제하세요` |
| RELEASED | 불가 | 가능(원천 MDM) | 읽기 전용 diff + 경미 수정 패널. 카테고리 탭은 목록·미리보기만 |
| CANCELLED | 불가 | 불가 | 읽기 전용 diff |
| 원천 EXTERNAL | 불가 | 불가 | `원천이 EXTERNAL 이라 조회 전용입니다` |

카테고리 탭의 편집 가능 여부와 `row_version` 은 codeItemEdit `view` 의 `selected` 하나를 따른다(저장이 하나이므로).

경미 수정 거부: 역할 없음 MDM013 → EXTERNAL MDM023 → 미적용 2개 MDM007 → 행 없음 MDM021 → from_ver 가 RELEASED 아님 MDM023 `PATCH_NOT_RELEASED` → 확정 전 버전(DRAFT·REQUESTED·APPROVED)이 같은 키에 from_ver 행을 가짐 MDM023 `DRAFT에서 고치세요`(D8). DRAFT 가 닫기만 한 키는 허용한다(04:544).

## 8. 권한 정의

| 역할 | dmc 권한 세트 | 이 화면에서 |
|---|---|---|
| `MDM_STEWARD` | `PERM_MDM_CONFIRM` | 조회·미리보기·검사·저장·되돌리기·경미 수정·카테고리 편집 |
| `MDM_STD_ADMIN` | `PERM_MDM_READ` | 조회·미리보기(`search`·`view`·`compare`) |
| `SYSADMIN` | `PERM_ALL` | 버튼은 모두 활성이나 DRAFT 소유자가 아니면 서버가 MDM003 으로 막는다 |

권한 키는 메뉴를 보지 않으므로 codeCateEdit 메뉴 leaf 가 없어져도 OBJECT·역할 매핑은 그대로다(D-101).

## 9. 연동 화면 / 팝업

마루 코드 화면(`codeMng`)의 버전 [코드 편집] 버튼이 `openMdmPage("dmc/codeItemEdit", { maruCodeId, ver })` 로 이 화면을 연다. 이 화면은
`useMdmPageParams("dmc/codeItemEdit", tabId, …)` 로 마운트 때와 자기 탭이 다시 활성화될 때 값을 한 번 꺼내 그 마루 코드·버전을 읽는다
(§6.10, D1). ver 가 RELEASED 여도 열리며 읽기 전용(diff 보기)이다. 새 버전·헤더 편집은 `codeMng` 몫이다(D11, D-101).

## 10. 기타 열거형 (LoV)

| 열거 | 값 |
|---|---|
| 코드 변경 표시 | `ADDED`(추가) · `CHANGED`(수정) · `REMOVED`(삭제) · `NONE` |
| 카테고리 변경 표시 | `ADDED`(추가) · `CHANGED`(수정) · `DELETED`(닫기) |
| 소속 변경 표시 | `ADDED` · `DELETED`(값이 없는 존재 여부뿐, `CHANGED` 없음) |
| transfer 후보 표시 | `미저장`(코드 탭에서 추가만 함) · `삭제 예정`(코드 탭에서 삭제 표시) |
| defKind | `REGEX` · `TABLE` |
| 미리보기 모드 | `콤보` · `목록·근거` |
| 근거 | `MATCH`·`NO_MATCH`·`TARGET_NULL`(REGEX), `MEMBER`·`NOT_MEMBER`(TABLE) |
| 미리보기 경고 | `CATE_ITEM_CODE_MISSING`(2-1) · `CATEGORY_EMPTY`(2-2) |

## 11. 특이사항 / 설계 결정

- 트리 순서: 코드 행이 있는 노드를 (seq, 값)으로 먼저, 그다음 순수 그룹을 값 순(시뮬레이터 `tree()`). 콤보 순서: 코드인 항목 먼저, 그 안은 값 순(시뮬레이터 `combo()`). 시안 JS 의 `ord` 는 따르지 않는다(§1.4, D9).
- [코드]·[트리] 탭의 미리보기는 저장된 정의 기준 읽기 전용이다(D11). 경미 수정은 배포 순번·알림을 건드리지 않는다(D7).
- `MdmActions` 는 닫힌 16개 상수 집합이라 `addCategory`·`closeCategory` 같은 세부 액션을 새로 만들지 않는다 — 카테고리·소속 변경은
  모두 `save` 의 두 그리드(`categories`·`members`) diff 로 흡수한다(06-04 D2). 합친 뒤에는 codeItemEdit `save` 의 세 그리드다(D-101).
- REGEX 미리보기(`compare`)는 저장 전 후보 정의로 서버 `MasterCodeCategoryResolver.resolve` 를 그대로 태운다. TABLE 은 재해석이
  필요 없어 `compare` 를 부르지 않는다(06-04 §1 갈래 3).
- 성능(06-04 수용 기준 4): transfer 이동(FE, 200ms)과 저장(BE, 800ms)을 나눠 잰다. E2E 왕복 시간은 게이팅하지 않는다(06-04 D4, CI 변동성).
- (미결) 카테고리 탭의 좌우 분할(목록 | 편집 영역)은 탭 본문 안이라 지금은 크기 고정(목록 36%) 배치다. 옛 카테고리 편집 화면은
  `resizable` 분할(`mdm.dmc.codeCateEdit`)이었으나 탭 본문 안에 resizable `ContentBody` 를 중첩한 선례가 없고 래퍼가 이를
  보장하지 않는다. shared 래퍼를 넓힐지, 고정 분할로 둘지 담당자 결정이 필요하다(Part B §4-3·§17). 크기 조절은 화면 좌우
  (`mdm.dmc.codeItemEdit`)·오른쪽 상하(`mdm.dmc.codeItemEdit.right`)만 한다.

### 11.1 결정 이력

| 일자 | 결정 | 근거 |
|---|---|---|
| 2026-09-24 | 코드 편집(TSK-06-03)·카테고리 편집(TSK-06-04) 을 따로 만든다 | TSK-06-03·06-04 design.md |
| 2026-09-28 | 사용자 결정: 4화면→2화면 통합, D-101 — 카테고리 편집을 이 화면 [카테고리] 탭으로 합치고, [저장] 하나가 코드 행·카테고리·소속을 codeItemEdit `save` 한 번(한 트랜잭션)으로 보낸다. 카테고리 조회·미리보기·되돌리기는 codeCateEdit 서비스 그대로, 메뉴 leaf 만 없앤다. 미리보기 자리는 하나로 모은다. 미저장 새 코드도 TABLE 후보에 보인다 | `docs/mdm/decisions.md` D-101 |

결정 목록 D1~D15 는 `docs/mdm/tasks/TSK-06-03/design.md`, 카테고리 쪽 결정은 `docs/mdm/tasks/TSK-06-04/design.md` 「담당자 확인 필요
결정」 이 정본이다.
