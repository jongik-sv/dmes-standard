---
screenId: codeItemEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-24
작성자: Agent
---

# mdm — 코드 편집 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-03 design.md 담당자 확인 필요 결정 D12)**: `Mes-Guide.md` §4 의 5종 설계
> 산출물 게이트는 As-Is → To-Be 이행을 전제한다. 이 화면은 **As-Is 레거시가 없는 신규 화면**이라 분석리포트가 없고
> G1~G7 게이트도 성립하지 않는다. TSK-04-02 D14·TSK-04-03·TSK-04-04 D5 선례처럼 5종을 **기능설계서 1종**으로 줄인다.
> 근거 칸은 원천 설계 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`), 시안
> `docs/mdm/design/basic/html/04-master-code.html`(이하 `시안:행`), 선행 설계 `docs/mdm/tasks/TSK-06-03/design.md`(이하 `§절`)다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeItemEdit` /
> pageId `codeItemEdit` / 페이지 유형 `L`(그리드 편집) / tsup entry key `pages/dmc/codeItemEdit/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 코드 편집 |
| 화면 식별자 | `codeItemEdit` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드 하나의 버전 V 에서 코드 행(코드값·이름·약칭·순서·설명·계층 칸·추가 컬럼)을 선분(from_ver–to_ver)으로 편집한다. DRAFT 는 추가·수정·삭제·되돌리기, RELEASED 는 이름·약칭·순서·설명만 경미 수정, CANCELLED 는 읽기 전용 diff 다. 계층 트리와 카테고리 미리보기로 결과를 확인한다. |
| 주요 사용자 | 담당자(`MDM_STEWARD`, dmc CONFIRM 세트 — 편집·경미 수정) / 표준 관리자(`MDM_STD_ADMIN`, dmc READ 세트 — 조회·미리보기만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 코드 편집 |

근거: 04:820(화면 표 「코드 편집」 행), 04:40-65(행 조작·되돌리기), 04:522-549(경미 수정), §0(entry-point `dmc`, D1).

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dmc` | `docs/mdm/screens/README.md` §3, `MdmScreenGroup.DMC` |
| mesModule | `m-mdm` | 01 A.4.5 `m-{moduleId}` |
| 화면식별자 (screenId) | `codeItemEdit` | `docs/mdm/wbs.md:939`, 식별자 사전 §A.3.2 |
| pageName / pageId / serviceId | `codeItemEdit` | screenId 동일값(MES 룰), BPMN process id |
| 페이지 유형 | `L`(그리드 편집) + 트리·미리보기 보조 패널 | §6.8 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/codeItemEdit/{action}` | spec API 스펙, §6.6 |
| 주요 API path (BFF→BE) | `POST /oasis/codeItemEdit/{action}` | 상동 |
| Frontend 파일명 | `m-mdm/pages/dmc/codeItemEdit/page.tsx` | `docs/mdm/screens/README.md` 경로 규약 |
| tsup entry key | `pages/dmc/codeItemEdit/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`·`compare`(READ), `validate`·`save`·`restore`·`execute`(EDIT·CONFIRM) | §6.6, D6(`MdmActions`) |
| 메뉴 계층 | 마루 MDM(`mdm`) > 마스터코드(`dmc`) > 코드 편집(`codeItemEdit`) | `DataInitializer.seedMdmCodeItemEditMenu()` 코드 시드 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 마루 코드·버전 선택, 닫힌 코드 보기 |
| `A-STATUS` | 상태 줄 | 버전 상태 배지, 편집 가능 여부·소유자, `row_version = n`, 미적용 2개 경고 |
| `A-GRID` | 코드 편집 탭 | 코드 행 그리드(편집·변경 배지·행 이슈·동작 버튼), 거르기 표시 |
| `A-TREE` | 트리 보기 탭 | 계층 칸 트리(접기·펴기), 이 노드로 편집 |
| `A-PREVIEW` | 카테고리 미리보기 | 카테고리 선택, 콤보/목록·근거 모드, 경고 |
| `A-PATCH` | 경미 수정 패널 | RELEASED 에서만. 이름·약칭·순서·설명 입력, 나머지는 잠김 |
| `A-BTN` | 버튼 | `MdmPageLayout.buttons`(조회·저장) |

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | `MARU_CODE_ID` | 마루 코드 | Select(`code-maru-select`) | Y | (없음) | `search` 결과(ID 순). 고르면 곧바로 `view` | §6.6 search |
| S-002 | `VER` | 버전 | Select(`code-ver-select`) | Y | DRAFT → 없으면 CANCELLED 아닌 최대 | 표시 `v1.008 상태`(소수 세 자리) | 04:275, §6.6 기본 버전 |
| S-003 | — | 닫힌 코드 | Checkbox(`code-closed-toggle`) | N | 끔 | 켜면 V 에서 닫힌 행(`closed`)을 흐린 색으로 덧붙인다 | §6.8 |

### 3.2 조회 결과 (그리드 컬럼)

| 컬럼 | 필드 | 편집(DRAFT·editable) | 비고 |
|---|---|---|---|
| 코드 | `code` | 새 행만 | 기존 행은 잠김(불변 규칙 39) |
| 이름 / 약칭 / 순서 | `name`·`alterName`·`seq` | 예 | CHANGED 행의 바뀐 칸은 옛 값을 취소선으로 함께 보인다 |
| 1차 … {lvlCnt}차 | `lvl1`…`lvl5` | 예 | 마루 코드의 `lvl_cnt` 만큼만 보인다(동적 열) |
| (라벨) | `attr01`…`attr10` | 예 | 라벨(`attrNN_name`)이 있는 번호만 보인다(동적 열) |
| 설명 | `description` | 예 | D14 |
| 변경 | — | — | 배지 `추가`·`수정`·`삭제` + 행 이슈 문구(`code-row-issue-{code}`) |
| 동작 | — | — | DRAFT 만. 변경 행 `되돌리기`(restore), 변경 없는 행 `삭제`, 화면에서만 바꾼 행 `취소` |

## 4. 상세 영역 필드 정의 (영역: A-PATCH, 경미 수정)

| 필드 | 편집 | 근거 |
|---|---|---|
| 코드(`patch-code`) | 잠김(disabled) | 04:531·543, 시안:318 |
| 이름·약칭·순서·설명(`patch-name`·`patch-alter-name`·`patch-seq`·`patch-description`) | 가능 | 04:531 |
| 계층 칸·추가 컬럼(`patch-lvlN`·`patch-attrNN`) | 잠김(disabled) | 04:531, 수용 기준 5 |

설명 문구: `이름·약칭·순서·설명만 고친다. 코드·계층 칸·추가 컬럼 값은 잠기며 새 버전으로만 바꾼다`. 행을 고르지 않았으면 `그리드에서 고칠 행을 고르세요.`

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼 | 위치 | action | 표시 조건 |
|---|---|---|---|
| 조회 | 상단 | `view` | 늘 |
| 저장 | 상단 | `save` | 선택 버전이 `editable`(DRAFT·소유자·MDM·미적용 ≤ 1) |
| 코드 추가(`code-add`) | 그리드 머리 | `save` | 상동 |
| 이 노드로 편집(`code-tree-to-grid`) | 트리 탭 | — | 트리 노드를 골랐을 때 활성 |
| ✕ 거르기 풀기(`code-filter-clear`) | 그리드 제목 옆 | — | 거르기 중 |
| 경미 수정 저장(`patch-save`) | 경미 수정 패널 | `execute` | `patchable`(RELEASED·MDM)이고 `patchBlocked` 가 아님 |

### 5.2 버튼별 동작 상세

| 동작 | 처리 | 근거 |
|---|---|---|
| 저장 | 화면 변경 목록(`rowStatus` ADDED·CHANGED·DELETED, 빈 칸 제외)을 `save` 로 보낸다. 성공 → 토스트 `저장했습니다` → 다시 읽기. 실패 → 오류 모달에 서버 메시지 → 같은 변경으로 `validate` 를 불러 행마다 이슈를 보인다. 화면은 검사 결과로 저장을 막지 않는다(판정은 서버) | §6.6 save 순서, F11 |
| 코드 추가 | 맨 앞에 새 행. 거르기 중이면 계층 칸을 선택 노드의 경로로 채운다 | §6.8 |
| 삭제 | 소속 TABLE 카테고리가 있으면 `카테고리 n개에서 함께 빠집니다. 삭제할까요?` 확인 | 04:489-500 |
| 되돌리기 | `restore` 로 즉시 서버 되돌리기 → 토스트 `되돌렸습니다` → 다시 읽기 | 04:50-65 |
| 계층·코드 칸 편집 뒤 | `validate` 로 이슈를 미리 보인다 | 시안:1071 |
| 경미 수정 저장 | `execute` → 토스트 `경미 수정했습니다` → 다시 읽기(같은 행 유지) | 04:522-549 |

### 5.3 그리드 동작

- 한 번 클릭으로 편집한다. 편집 가능한 DRAFT 가 아니면 모든 칸이 잠긴다.
- 행 선택은 경미 수정 가능 버전에서만 바꾼다(편집 중 다시 그리기 방지, design.md 「Build 이탈」 B7).
- 코드가 0건이면 `보일 코드가 없습니다`(`code-grid-empty`).

## 6. 입력값 검증 규칙 (서버 저장 검사, §6.3)

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

검사 대상은 이번에 바꾼 행(touched)뿐이다. 거부는 `MDM022 코드 저장 검사를 통과하지 못했습니다: <코드>[<칸>] <이슈 코드> <문구>; …`.

## 7. 상태 정의 및 상태별 제어

| 버전 상태 | 편집 | 경미 수정 | 화면 |
|---|---|---|---|
| DRAFT(소유자·MDM·미적용 ≤ 1) | 가능 | — | 저장·코드 추가·동작 열, `편집 가능 · 소유자 x` |
| DRAFT(남의 것·미적용 2개) | 불가 | — | 읽기 전용, 미적용 2개면 `미적용 버전이 2개입니다. 하나를 삭제하세요` |
| RELEASED | 불가 | 가능(원천 MDM) | 읽기 전용 diff + 경미 수정 패널 |
| CANCELLED | 불가 | 불가 | 읽기 전용 diff |
| 원천 EXTERNAL | 불가 | 불가 | `원천이 EXTERNAL 이라 조회 전용입니다` |

경미 수정 거부: 역할 없음 MDM013 → EXTERNAL MDM023 → 미적용 2개 MDM007 → 행 없음 MDM021 → from_ver 가 RELEASED 아님 MDM023 `PATCH_NOT_RELEASED` → 확정 전 버전(DRAFT·REQUESTED·APPROVED)이 같은 키에 from_ver 행을 가짐 MDM023 `DRAFT에서 고치세요`(D8). DRAFT 가 닫기만 한 키는 허용한다(04:544).

## 8. 권한 정의

| 역할 | dmc 권한 세트 | 이 화면에서 |
|---|---|---|
| `MDM_STEWARD` | `PERM_MDM_CONFIRM` | 조회·미리보기·검사·저장·되돌리기·경미 수정 |
| `MDM_STD_ADMIN` | `PERM_MDM_READ` | 조회·미리보기(`search`·`view`·`compare`) |
| `SYSADMIN` | `PERM_ALL` | 버튼은 모두 활성이나 DRAFT 소유자가 아니면 서버가 MDM003 으로 막는다 |

## 9. 연동 화면 / 팝업

없음. 카테고리 편집은 TSK-06-04(`codeCateEdit`), 새 버전·헤더 편집은 TSK-06-02(`codeEdit`) 몫이다(D11).

## 10. 기타 열거형 (LoV)

| 열거 | 값 |
|---|---|
| 변경 표시 | `ADDED`(추가) · `CHANGED`(수정) · `REMOVED`(삭제) · `NONE` |
| 미리보기 모드 | `콤보` · `목록·근거` |
| 근거 | `MATCH`·`NO_MATCH`·`TARGET_NULL`(REGEX), `MEMBER`·`NOT_MEMBER`(TABLE) |
| 미리보기 경고 | `CATE_ITEM_CODE_MISSING`(2-1) · `CATEGORY_EMPTY`(2-2) |

## 11. 특이사항 / 설계 결정

- 트리 순서: 코드 행이 있는 노드를 (seq, 값)으로 먼저, 그다음 순수 그룹을 값 순(시뮬레이터 `tree()`). 콤보 순서: 코드인 항목 먼저, 그 안은 값 순(시뮬레이터 `combo()`). 시안 JS 의 `ord` 는 따르지 않는다(§1.4, D9).
- 미리보기는 저장된 정의 기준 읽기 전용이다(D11). 경미 수정은 배포 순번·알림을 건드리지 않는다(D7).
- 결정 목록 D1~D15 는 `docs/mdm/tasks/TSK-06-03/design.md` 「담당자 확인 필요 결정」 이 정본이다.
