---
screenId: codeEdit
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-24
작성자: Agent
---

# mdm — 마루 코드 수정 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-02 design.md 담당자 확인 필요 결정 D11)**: As-Is 레거시가 없는 신규
> 화면이라 5종 설계 산출물을 **기능설계서 1종**으로 줄인다. 표의 근거는 원천 설계
> `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`)와 `docs/mdm/tasks/TSK-06-02/design.md`(이하 `design`)다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeEdit` /
> pageId `codeEdit` / 페이지 유형 `B` / tsup entry key `pages/dmc/codeEdit/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 마루 코드 수정 |
| 화면 식별자 | `codeEdit` |
| 모듈 | `mdm` / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드 한 건의 헤더(이름·설명·계층 칸 수)와 추가 컬럼 라벨(attr01~attr10)을 경미 수정하고, 폐기(DEPRECATED)하며, 버전 목록을 보고 새 버전(빈·복원)·DRAFT 삭제·선점·해제·넘기기를 한다. 확정과 코드 행 편집은 다른 화면으로 이동만 한다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·편집) / 표준 관리자(`MDM_STD_ADMIN`, 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 마루 코드 수정, 또는 마루 코드 화면의 ID 링크·등록 성공 |

근거: 04 「화면」(04:812) "탭2 수정 — 카드 ①~③", 04 「추가 컬럼」(04:157), 04 「코드 삭제와 마루 코드 폐기」(04:485),
04 「버전 상태와 적용시점」(04:227), 04 「경미 수정(패치)」(04:522), design §6.8·§6.12.

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dmc` | design D1 |
| screenId / pageId / serviceId | `codeEdit` | MES 룰 |
| 페이지 유형 | `B`(조회 + 상세 카드 3개) | |
| API path | `POST /api/mdm/oasis/codeEdit/{action}` → BE `POST /oasis/codeEdit/{action}` | spec API 스펙 |
| Frontend 파일 | `m-mdm/pages/dmc/codeEdit/page.tsx`(+ `NewVersionModal.tsx`·`HandoverModal.tsx`·`buttons.ts`) | 모달은 스크린이 아니다(메뉴·OBJECT 없음) |
| tsup entry key | `pages/dmc/codeEdit/page` | |
| action 어휘 | `search`·`view`·`save`(saveHeader)·`execute`(deprecate)·`reg`(createVersion)·`restore`(restoreVersion)·`delete`(deleteDraft)·`lock`(acquire)·`unlock`(release)·`handover`(handover) | design §6.1. `lock`·`unlock`·`handover` 권한은 TSK-08-02 머지 뒤 연결(D-TSK-06-02-1) |
| 메뉴 계층 | 마루 MDM > 마스터코드 > 마루 코드 수정(`codeEdit`, 순번 002) | `DataInitializer.seedMdmMenus()` |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 코드 선택 | ComboBox(`code-pick`, 데이터 = `codeEdit/search`). 선택 전에는 "마루 코드를 고르세요" |
| `A-HEADER` | 카드 ① 헤더 | ID·원천(읽기), 상태(계산, `header-status`), 현재 버전·미적용, 이름·설명·계층 칸 수, [경미 수정 저장]·[폐기] |
| `A-LABEL` | 카드 ② 추가 컬럼 라벨 | attr01~attr10 라벨 입력(`label-attr01`~`label-attr10`). 저장은 카드 ① [경미 수정 저장]이 함께 보낸다 |
| `A-VERSION` | 카드 ③ 버전 목록 | 버전·종류·상태·적용 구간·확정 일시·소유자·설명. 행 선택, 버전 버튼 |
| `A-MODAL` | 새 버전·넘기기 모달 | `NewVersionModal`, `HandoverModal` |

## 3. 카드 ① 헤더·카드 ② 라벨 필드

| 필드ID | DB 컬럼명 | 표시명 | 입력 | 검증 |
|---|---|---|---|---|
| D-001 | `MARU_CODE_NAME` | 이름 | TextBox(`header-name`) | 필수 1~100자 |
| D-002 | `DESCRIPTION` | 설명 | Textarea(`header-desc`) | |
| D-003 | `LVL_CNT` | 계층 칸 수 | Select 0~5(`header-lvl`) | 줄이기: 현재 적용 버전 번호보다 `TO_VER` 가 큰 코드 행(열린 행 포함, 현재 적용 버전이 없으면 모든 행) 중 새 값 뒤 LVL 칸에 값이 있으면 MDM021(I19) |
| D-004~013 | `ATTR01_NAME`~`ATTR10_NAME` | attr01~attr10 | TextBox | 0~100자, 공백은 NULL |

낙관적 잠금: 헤더 저장·폐기는 `auditVer`(TB_MDM_CODE 감사 카운터 VER)를 보낸다. 다르면 MDM001 "다른 사용자가 수정했습니다.
다시 불러오세요" — 오류 모달을 닫으면 화면이 다시 불러온다. 헤더 저장은 저장 CREATED 이고 적용된 RELEASED 가 있으면 같은
트랜잭션에서 INUSE 로 저장한다(I18). DEPRECATED 이후에도 헤더 경미 수정은 허용한다(design D10).

## 4. 카드 ③ 버전 목록

| 컬럼 | 원천 | 표시 |
|---|---|---|
| 버전 | `VER`, `RESTORED_FROM` | "v1.001" + 복원이면 "(v1.000 복원)" |
| 종류 | `VER_KIND` | MAJOR/MINOR |
| 상태 | `STATUS`, `APPLY_FROM` | `VersionStatusBadge`(미래 적용 RELEASED 는 "적용 대기") |
| 적용 구간 | `APPLY_FROM`~`APPLY_TO` | |
| 확정 일시 | `RELEASED_AT` | |
| 소유자 | `OWNER_ID` | `DraftLockBadge`("선점 가능"/"편집 중(나)"/"잠김 · {owner} 편집 중"), DRAFT 에서만 |
| 설명 | `DESCRIPTION` | |

0행이면 `version-empty` "버전이 없습니다". 미적용 버전이 2개면 `ver-unapplied-warning` "미적용 버전이 2개입니다. 하나를 삭제하세요".

## 5. 버튼 및 기능 동작 정의

모든 버튼은 `flags.editable`(원천 MDM && 담당자)이 거짓이면 비활성이고, 권한은 `canDoButton(rbac,"codeEdit",action)` 으로 더
판정한다. 판정 순수 함수는 `buttons.ts` `versionButtons(view, selectedVer)`.

| 버튼(action) | 활성 조건 |
|---|---|
| 새버전(major)(`reg`) | `flags.canNewMajor` |
| 새버전(minor)(`reg`) | `flags.canNewMinor`. `minorLimit` 이면 비활성 + "major 를 올리십시오" |
| 삭제(`delete`) | 선택 DRAFT && owner==me(미적용 2개여도 활성) |
| 선점(`lock`) | 선택 DRAFT && owner 없음 && 미적용 1개 |
| 해제(`unlock`) | 선택 DRAFT && owner==me && 미적용 1개 |
| 넘기기(`handover`) | 선택 DRAFT && owner==me && 미적용 1개 |
| 확정 이동(이동만, 권한 action `confirm`) | 선택 DRAFT && owner==me && 미적용 1개 → `openMdmPage("dmc/codeConfirm",{maruCodeId,ver})` |
| 코드 편집(이동만, 권한 action `save`) | 선택 DRAFT && owner==me && 미적용 1개 → `openMdmPage("dmc/codeItemEdit",{maruCodeId,ver})` |
| 경미 수정 저장(`save`) | 미적용 < 2 |
| 폐기(`execute`) | 저장 상태 ≠ DEPRECATED && 미적용 0 (확인 "폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?") |

미적용 버전이 있어 새버전이 비활성이면 안내 "미적용 버전 {label} 이 있어 새 버전을 만들 수 없습니다". RELEASED·CANCELLED 행을
고르면 버전 조작 버튼은 모두 비활성이다.

새 버전 모달: 종류(major/minor, 불가한 쪽 비활성), 새 번호(`nextMajor`/`nextMinor`, 서버 값), 내용("빈 버전" 또는 RELEASED
버전마다 "v1.001 내용으로 채우기(복원)"), 안내 "가장 큰 번호는 철회·작성 중 버전을 포함한다. 복원은 원본과 현재의 차이를
DRAFT 에 채운다". [확인] → 빈 버전이면 `reg`, 복원이면 `restore`. 넘기기 모달: 받는 사람 사용자 ID → `handover`.

## 6. 서버 규칙 요약(design §5·§6.8)

| 규칙 | 오류 |
|---|---|
| 모든 쓰기 액션은 담당자 역할(I12) | MDM013 |
| 원천이 MDM 이 아닌 코드는 모든 쓰기 거부(I8) | MDM021 |
| 미적용 2개 이상: 헤더 저장·폐기·선점·해제·넘기기 거부, 새 버전 거부, DRAFT 삭제·조회 허용(I6, D7) | MDM007 / 새 버전 MDM006 |
| 새 버전·복원: 미적용(DRAFT 또는 미래 적용 RELEASED)이 있으면 거부(I5) | MDM006 |
| 채번: major = floor(max)+1, minor = max+0.001(소수부 999 상한 "major 를 올리십시오"), max 는 CANCELLED·DRAFT 포함 전체, major 상한 9998, 버전이 없으면 major 1.000 만 + BASE 재생성(I1~I4) | MDM021 |
| 폐기: 미적용 0개일 때만(2개 MDM007, 1개 MDM009), 이미 DEPRECATED 면 MDM009, 행은 지우지 않는다. 폐기 뒤 새 버전·복원 MDM009(I13) | |
| 폐기 뒤 CODE_LIST 는 빈 목록, MASTER 판정은 유지(I16) | |
| 복원: 원본은 RELEASED 이고 새 번호보다 작아야 한다. 세 표(코드·카테고리·CATE_ITEM)를 키로 비교해 차이만 DRAFT 에 채운다(I15) | MDM021 |
| DRAFT 삭제: 세 표에서 `FROM_VER=V` 행 삭제, `TO_VER=V` 행을 9999 로 되돌림(I14) | 소유자 아님 MDM003, rv MDM001 |
| 넘기기 대상은 담당자여야 한다 — 운영은 대상 조회 어댑터가 없어 늘 거부(design D3) | MDM005 |
