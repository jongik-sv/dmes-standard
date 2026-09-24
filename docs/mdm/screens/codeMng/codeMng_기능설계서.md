---
screenId: codeMng
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-24
작성자: Agent
---

# mdm — 마루 코드 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-02 design.md 담당자 확인 필요 결정 D11)**: As-Is 레거시가 없는 신규
> 화면이라 5종 설계 산출물을 **기능설계서 1종**으로 줄인다(unitMng·termMng·domainMng·columnMng 선례). 표의 근거는
> 원천 설계 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`)와 선행 Design 산출물
> `docs/mdm/tasks/TSK-06-02/design.md`(이하 `design`)다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeMng` /
> pageId `codeMng` / 페이지 유형 `B` / tsup entry key `pages/dmc/codeMng/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 마루 코드 |
| 화면 식별자 | `codeMng` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드(`TB_MDM_CODE`) 목록을 현재 버전·미적용 버전·상태와 함께 조회하고, MDM 원천 마루 코드를 새로 등록한다. 등록하면 첫 버전 1.000 DRAFT 와 예약 카테고리 BASE 가 함께 생기고 등록자가 DRAFT 를 선점한다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·등록) / 표준 관리자(`MDM_STD_ADMIN`, 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 마루 코드 |

근거: 04 「화면」(04:812) "탭1 조회·등록", 04 「구조: 마루 코드 → 버전 · 코드 · 카테고리」(04:18), design §6.7·§6.11,
`MdmPermissions.MATRIX` DMC 그룹(`STD_ADMIN→READ`, `STEWARD→CONFIRM`).

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dmc` | `docs/mdm/screens/README.md` §2, design D1 |
| mesModule | `m-mdm` | 01 A.4.5 |
| screenId / pageId / serviceId | `codeMng` | MES 룰(동일값) |
| 페이지 유형 | `B`(조회 + 등록 카드) | |
| API path (UI→BFF) | `POST /api/mdm/oasis/codeMng/{action}` | spec API 스펙 |
| API path (BFF→BE) | `POST /oasis/codeMng/{action}` | |
| Frontend 파일 | `m-mdm/pages/dmc/codeMng/page.tsx` | README 경로 규약 |
| tsup entry key | `pages/dmc/codeMng/page` | `m-mdm/tsup.config.ts` |
| action 어휘 | `search`·`reg`(method `register`) | design §6.1, I21 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 마스터코드(`dmc`) > 마루 코드(`codeMng`, 순번 001) | `DataInitializer.seedMdmMenus()` 코드 시드 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 마루 코드(ID·이름)·상태 |
| `A-GRID` | 목록 그리드 | 조회 결과. ID 를 누르면 마루 코드 수정(codeEdit) 탭이 그 코드로 열린다 |
| `A-REG` | 등록 카드 | ID·이름·설명·계층 칸 수 입력, 원천 MDM 읽기 전용 표기 |
| `A-BTN` | 버튼 | `PageLayout.buttons`(조회) + 등록 카드 [저장] |

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `MARU_CODE_ID`, `MARU_CODE_NAME` | 마루 코드 | TextBox(`code-search-keyword`) | N | (빈값) | ID 대소문자 무시·이름 부분 일치. LIKE 와일드카드 문자는 글자로 본다 |
| S-002 | (계산) | 상태 | Select(`code-search-status`) | N | 전체 | CREATED/INUSE/DEPRECATED — **계산 상태** 기준(저장 CREATED 라도 적용된 RELEASED 가 있으면 INUSE) |

### 3.2 조회 결과 (그리드 컬럼, `code-list`)

| 컬럼 | 원천 | 설명 |
|---|---|---|
| 마루 코드 ID | `MARU_CODE_ID` | 링크 — `openMdmPage("dmc/codeEdit", {maruCodeId})` |
| 이름 | `MARU_CODE_NAME` | |
| 원천 | `SOURCE_KIND` | MDM/EXTERNAL |
| 현재 버전 | 계산 | `apply_from ≤ now < apply_to` 인 RELEASED 번호 "v1.001". 없고 RELEASED 가 있으면 "배포 대기 v{최대 RELEASED}", RELEASED 가 없으면 "미확정"(I17, 04 「버전 상태와 적용시점」 04:227) |
| 상태 | 계산 | 표시 상태(I18). 조회는 DB 를 쓰지 않는다 |
| 미적용 버전 | 계산 | DRAFT 또는 미래 적용 RELEASED. "없음" / "v1.000 DRAFT" / 여럿이면 ", " 연결 |

건수는 GridPanel 머리의 "N건", 0건이면 `code-list-empty` "조회된 마루 코드가 없습니다". 배포 대상 수 열은 두지 않는다
(PRD §2 규칙 7 보류, `screens/README.md` §6).

## 4. 등록 카드 필드 정의 (영역: A-REG)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_CODE_ID` | 마루 코드 ID | TextBox(`code-reg-id`, 50자) | Y | | 안내 "영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 데이터 ID 와 한 이름 공간". 형식 검사는 서버(I9) |
| D-002 | `MARU_CODE_NAME` | 이름 | TextBox(`code-reg-name`, 100자) | Y | | |
| D-003 | `DESCRIPTION` | 설명 | Textarea(`code-reg-desc`) | N | | |
| D-004 | `LVL_CNT` | 계층 칸 수 | Select 0~5(`code-reg-lvl`) | N | 0 | 04 「계층과 다목적 분류」(04:97) |
| D-005 | `SOURCE_KIND` | 원천 | 읽기 전용 "MDM"(`code-reg-source`) | — | MDM | 서버로 보내지 않는다. 배포 대상 시스템·원천 선택·EXTERNAL 등록 없음(보류) |

## 5. 버튼 및 기능 동작 정의

| 버튼 | action | 권한 | 동작 |
|---|---|---|---|
| 조회 | `search` | READ | S-001·S-002 로 목록 재조회 |
| 저장(등록 카드, `code-reg-save`) | `reg` | EDIT(`canDoButton(rbac,"codeMng","reg")`) | 필수값(ID·이름)만 화면에서 막고 서버 호출. 성공: 토스트 "등록했습니다" → 폼 초기화 → 목록 재조회 → codeEdit 탭을 그 코드로 연다. 실패: `ErrorModal`(서버 `meta.message`) |

서버 `reg` 순서(design §6.7): 담당자 가드(MDM013) → 입력 정규화 → ID 규칙(MDM021) → 이름·계층 칸 수·원천(MDM021) →
TB_MDM_CODE·TB_MDM_DATA 중복(MDM011) → `TB_MDM_CODE`(CREATED, MDM) → `TB_MDM_CODE_VER`(1.000, DRAFT, MAJOR,
OWNER_ID = 요청 사용자, ROW_VERSION 0) → `TB_MDM_CODE_CATE`(BASE, REGEX `.*`, CODE, from 1.000, to 9999). 세 INSERT 는
OASIS 액션 하나의 트랜잭션이다(I7).

## 6. 입력값 검증 규칙

| 규칙 | 조건 | 오류 |
|---|---|---|
| ID 형식 | `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, 1~50자, 점·콤마·공백 없음(04 「식별자」 "컬럼 물리명 규칙과 같다", design D8) | MDM021 |
| ID 이름 공간 | TB_MDM_CODE·TB_MDM_DATA 어디에도 없을 것(04 「구조」, I10) | MDM011 "마루 코드·마루 데이터에 같은 ID 가 있습니다" |
| 이름 | 1~100자 | MDM021 |
| 계층 칸 수 | 0~5 | MDM021 |
| 원천 | 비우거나 MDM | MDM021 |
| 역할 | 담당자(`MDM_STEWARD`) | MDM013 |

## 7. 상태 정의

표시 상태는 §3.2 의 계산값이다. 저장 상태 전이(CREATED→INUSE 저장, →DEPRECATED)는 마루 코드 수정 화면(codeEdit)과
확정(06-05)이 한다.

## 8. 화면 간 이동

`openMdmPage("dmc/codeEdit", {maruCodeId})`(`m-mdm/src/shell/page-handoff.ts`, design §6.10). 받는 화면은
`useMdmPageParams` 로 한 번만 꺼낸다.
