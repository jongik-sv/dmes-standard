---
screenId: codeCateEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-24
작성자: Agent
---

# mdm — 카테고리 편집(REGEX·TABLE) 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-03 design.md D12 계승)**: `Mes-Guide.md` §4 의 5종 설계 산출물 게이트는
> As-Is → To-Be 이행을 전제한다. 이 화면은 **As-Is 레거시가 없는 신규 화면**이라 분석리포트가 없고 G1~G7 게이트도
> 성립하지 않는다. TSK-06-02·06-03 선례처럼 5종을 **기능설계서 1종**으로 줄인다. 근거 칸은 원천 설계
> `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`), 시안 `docs/mdm/design/basic/html/04-master-code.html`
> 탭5·6(이하 `시안:행`), 선행 설계 `docs/mdm/tasks/TSK-06-04/design.md`(이하 `§절`)다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeCateEdit` /
> pageId `codeCateEdit` / 페이지 유형 `L`(목록+편집) / tsup entry key `pages/dmc/codeCateEdit/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 카테고리 편집 |
| 화면 식별자 | `codeCateEdit` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드 하나의 버전 V 에서 카테고리(REGEX·TABLE) 정의를 추가·수정·닫고, TABLE 카테고리의 코드 소속을 transfer-list 로 편집한다. REGEX 는 defExpr·defTarget 을 입력하면 서버가 재해석한 결과(미리보기)를 그대로 보인다(화면은 정규식을 실행하지 않는다). BASE(cate_id="BASE")는 예약 카테고리라 편집·닫기를 할 수 없다. |
| 주요 사용자 | 담당자(`MDM_STEWARD`, dmc CONFIRM 세트 — 편집) / 표준 관리자(`MDM_STD_ADMIN`, dmc READ 세트 — 조회·미리보기만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 카테고리 편집, 또는 코드 편집(`codeEdit`) 화면의 `카테고리 편집` 버튼(D5) |

근거: 04:178-183(카테고리 정의 REGEX·TABLE), 04:489-504(카테고리 연쇄), 04:1027(BASE 예약), §1(entry-point `dmc`, D1).

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mdm` | `docs/mdm/screens/README.md` §2 |
| moduleGroup | `dmc` | `docs/mdm/screens/README.md` §3, `MdmScreenGroup.DMC` |
| mesModule | `m-mdm` | 01 A.4.5 `m-{moduleId}` |
| 화면식별자 (screenId) | `codeCateEdit` | `docs/mdm/screens/README.md` §3, 식별자 사전 §A.3.2 |
| pageName / pageId / serviceId | `codeCateEdit` | screenId 동일값(MES 룰), BPMN process id |
| 페이지 유형 | `L`(목록+편집) — 좌 카테고리 목록, 우 REGEX/TABLE 편집+미리보기 | §1 |
| 주요 API path (UI→BFF) | `POST /api/mdm/oasis/codeCateEdit/{action}` | §2 |
| 주요 API path (BFF→BE) | `POST /oasis/codeCateEdit/{action}` | 상동 |
| Frontend 파일명 | `m-mdm/pages/dmc/codeCateEdit/page.tsx` | `docs/mdm/screens/README.md` 경로 규약 |
| tsup entry key | `pages/dmc/codeCateEdit/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`view`·`compare`(READ), `validate`·`save`·`restore`(EDIT·CONFIRM) | §2, D2(`MdmActions` 6개만 재사용) |
| 메뉴 계층 | 마루 MDM(`mdm`) > 마스터코드(`dmc`) > 카테고리 편집(`codeCateEdit`) | `DataInitializer.seedMdmCodeCateEditMenu()` 코드 시드 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 마루 코드·버전 선택 |
| `A-STATUS` | 상태 줄 | 버전 상태 배지, 편집 가능 여부·소유자, `row_version = n` |
| `A-LIST` | 카테고리 목록(좌) | 카테고리 행(cateId·이름·defKind·변경 배지) + 추가 폼. BASE 는 편집·닫기 버튼 없음 |
| `A-REGEX` | REGEX 편집(우) | 이름·대상 칸·정규식 입력(REGEX 카테고리를 골랐을 때만) |
| `A-TRANSFER` | TABLE 소속 편집(우) | 좌(가능)/우(소속) transfer-list, 검색·attr(lvl1) 필터, 전체선택, `>`/`>>`/`<`/`<<`(TABLE 카테고리를 골랐을 때만) |
| `A-PREVIEW` | 미리보기(하) | REGEX 서버 재해석 결과(해당 건수·행별 근거). TABLE 은 "해당 없음" 안내 |
| `A-BTN` | 버튼 | `MdmPageLayout.buttons`(조회·저장) |

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 | 근거 |
|---|---|---|---|---|---|---|---|
| S-001 | `MARU_CODE_ID` | 마루 코드 | Select(`cate-maru-select`) | Y | (없음) | `search` 결과(ID 순). 고르면 곧바로 `view` | §2 search |
| S-002 | `VER` | 버전 | Select(`cate-ver-select`) | Y | DRAFT → 없으면 CANCELLED 아닌 최대 | 표시 `v1.008 상태` | 04:275, §2 기본 버전 |

### 3.2 카테고리 목록 (A-LIST)

| 컬럼 | 필드 | 비고 |
|---|---|---|
| ID / 이름 / 종류 | `cateId`·`cateName`·`defKind` | 배지로 종류(REGEX·TABLE) 표시 |
| 변경 | — | 배지 `추가`·`수정`·`닫기` |
| 편집·닫기 버튼 | — | `cate-close-{cateId}` — **BASE 는 렌더링하지 않는다**(수용 기준 2) |
| 추가 폼 | ID·이름·종류(Select) | `cate-add-id`·`cate-add-name`·`cate-add-kind`·`cate-add-submit` |

## 4. 상세 영역 필드 정의

### 4.1 REGEX 편집(A-REGEX, `cate-regex-edit`)

| 필드 | 편집 | 근거 |
|---|---|---|
| 이름(`cate-regex-name`) | 가능(DRAFT·편집 가능) | |
| 대상 칸(`cate-regex-target`) | Select, `CategoryDefTarget` 전체(CODE·LVL1~5·ATTR01~10) | `CategoryOwner.MASTER_CODE.allowedDefTargets()` |
| 정규식(`cate-regex-expr`) | 가능 | 원천 04:183 — 화면은 정규식을 실행하지 않는다, 서버 `compare` 재해석만 |

### 4.2 TABLE 소속 편집(A-TRANSFER, `cate-transfer`)

| 필드 | 설명 |
|---|---|
| 검색(`cate-transfer-search`) | 코드·이름 부분 일치(대소문자 무시) |
| 1차 필터(`cate-transfer-lvl1`) | 코드의 `lvl1` 값으로 좁힌다 |
| 가능(`cate-transfer-available`) / 소속(`cate-transfer-member`) | 좌우 목록, 전체선택 체크박스+건수 |
| `>`(`cate-transfer-move-right`) / `>>`(`cate-transfer-move-right-all`) | 선택·화면에 보이는 전체를 소속으로 옮긴다 |
| `<`(`cate-transfer-move-left`) / `<<`(`cate-transfer-move-left-all`) | 선택·화면에 보이는 전체를 소속에서 뺀다 |

### 4.3 미리보기(A-PREVIEW, `cate-preview`)

| 필드 | 설명 |
|---|---|
| 해당 건수(`cate-preview-summary`) | `hitCount / total` |
| 정규식 오류(`cate-preview-invalid`) | `invalidExpression` 이면 노출 |
| 행 목록 | 코드·이름·대상 값·해당 여부(그리드) |

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼 | 위치 | action | 표시 조건 |
|---|---|---|---|
| 조회 | 상단 | `view` | 늘 |
| 저장 | 상단 | `save` | 선택 버전이 `editable`(DRAFT·소유자·MDM·미적용 ≤ 1) |
| 카테고리 추가(`cate-add-submit`) | 목록 하단 | (로컬, 저장 시 `save`) | 편집 가능하고 `save` 권한 |
| 닫기(`cate-close-{cateId}`) | 목록 행 | (로컬) | 편집 가능하고 BASE 가 아님 |
| 취소(`cate-undo-{cateId}`) | 목록 행 | — | 화면에서만 바꾼(로컬) 카테고리 |

### 5.2 버튼별 동작 상세

| 동작 | 처리 | 근거 |
|---|---|---|
| 저장 | 카테고리 그리드(`rowStatus` ADDED·CHANGED·DELETED)와 소속 그리드(`rowStatus` ADDED·DELETED, `cateId`+`code`)를 함께 `save` 로 보낸다. 성공 → 토스트 `저장했습니다` → 다시 읽기. 실패 → 오류 모달에 서버 메시지 | §2 save, F11 |
| 카테고리 추가 | ID·이름·종류를 받아 로컬 목록에 `추가` 배지로 더한다. 저장 전까지 서버에 반영되지 않는다 | §1 |
| 닫기 | 로컬 목록에서 `닫기` 배지로 표시(저장 시 서버가 TABLE 이면 소속도 연쇄로 닫는다, 불변 규칙 12) | 04:504 |
| REGEX 값 변경 | 매 변경마다 `compare` 를 불러 미리보기를 다시 그린다(정규식은 서버만 실행) | 04:183, D1 갈래 3 |
| TABLE 소속 이동 | 화면 상태(Set)만 바꾼다 — 저장할 때 원래 소속과 비교해 diff 로 보낸다. `compare` 를 부르지 않는다 | §1 |

## 6. 입력값 검증 규칙 (서버 저장 검사, §1.4)

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

검사 대상은 이번에 바꾼(touched) 카테고리·소속 행뿐이다. 거부는 `MDM022 코드 저장 검사를 통과하지 못했습니다: <ID>[<칸>] <이슈 코드> <문구>; …`.

## 7. 상태 정의 및 상태별 제어

| 버전 상태 | 편집 | 화면 |
|---|---|---|
| DRAFT(소유자·MDM·미적용 ≤ 1) | 가능 | 저장·카테고리 추가·닫기 열, `편집 가능 · 소유자 x` |
| DRAFT(남의 것·미적용 2개) | 불가 | 읽기 전용 |
| RELEASED·CANCELLED | 불가 | 읽기 전용(카테고리 목록·미리보기만) |

## 8. 권한 정의

| 역할 | dmc 권한 세트 | 이 화면에서 |
|---|---|---|
| `MDM_STEWARD` | `PERM_MDM_CONFIRM` | 조회·미리보기·검사·저장·되돌리기 |
| `MDM_STD_ADMIN` | `PERM_MDM_READ` | 조회·미리보기(`search`·`view`·`compare`) |
| `SYSADMIN` | `PERM_ALL` | 버튼은 모두 활성이나 DRAFT 소유자가 아니면 서버가 MDM003 으로 막는다 |

## 9. 연동 화면 / 팝업

`codeEdit`(TSK-06-02) 화면의 `카테고리 편집`(`ver-cate-edit`) 버튼이 이 화면을 마루코드+버전 컨텍스트로 연다(D5). 코드 행
자체(계층·이름 등)는 `codeItemEdit`(TSK-06-03) 몫이다.

## 10. 기타 열거형 (LoV)

| 열거 | 값 |
|---|---|
| 카테고리 변경 표시 | `ADDED`(추가) · `CHANGED`(수정) · `DELETED`(닫기) |
| 소속 변경 표시 | `ADDED` · `DELETED`(값이 없는 존재 여부뿐, `CHANGED` 없음) |
| defKind | `REGEX` · `TABLE` |
| 미리보기 근거 | `MATCH`·`NO_MATCH`·`TARGET_NULL` |

## 11. 특이사항 / 설계 결정

- `MdmActions` 는 닫힌 16개 상수 집합이라 `addCategory`·`closeCategory` 같은 세부 액션을 새로 만들지 않는다 — 카테고리·소속
  변경은 모두 `save` 하나의 두 그리드(`categories`·`members`) diff 로 흡수한다(D2).
- REGEX 미리보기(`compare`)는 저장 전 후보 정의로 서버 `MasterCodeCategoryResolver.resolve` 를 그대로 태운다. TABLE 은
  재해석이 필요 없어 `compare` 를 부르지 않는다(§1 갈래 3).
- 성능(수용 기준 4): 이동(FE, 200ms)과 저장(BE `CodeCateEditService.save` 전체, 800ms)을 나눠 잰다. E2E 왕복 시간은
  게이팅하지 않는다(D4, CI 변동성).
- 결정 목록은 `docs/mdm/tasks/TSK-06-04/design.md` 「담당자 확인 필요 결정」 이 정본이다.
