---
screenId: noticeMgmt
asIsId: 해당 없음 (To-Be only 신규 화면)
moduleId: mls
moduleGroup: lsh
작성일: 2026-09-03
작성자: Agent
---

# mls — 공지사항 관리 기능설계서

> **인용 정본 예외 (사용자 결정 2026-09-03)**: 본 화면은 **As-Is 레거시가 없는 To-Be only 신규 화면**이다.
> 따라서 `분석리포트`(§1~§17)가 존재하지 않으며, 통상의 "모든 표는 분석리포트 인용, 자체 추가 ✗"
> (`templates/기능설계서.template.md:14`) 제약을 충족할 수 없다. 사용자가 **설계 산출물을 기능설계서 1종으로
> 축소**하도록 결정하여 본 문서 1개만 작성한다. 근거와 한계는 §11.1 에 GAP 으로 등재한다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mls` / moduleGroup `lsh` / pageName `noticeMgmt` /
> pageId `noticeMgmt` / 페이지 유형 `B` / tsup entry key `pages/lsh/noticeMgmt/page`

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 공지사항 관리 |
| 화면 식별자 | `noticeMgmt` |
| 모듈 | `mls` (물류관리) / moduleGroup `lsh` (공지관리) |
| 화면 목적 | 공지사항 관리는 전사 공지사항의 등록·수정·삭제·게시상태 변경을 수행한다. |
| 주요 사용자 | 시스템 관리자 (SYSADMIN) |
| 접근 경로 | 포털 → 공통관리 → 공지관리 → 공지사항 관리 |

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mls` | 부속서 A.1.1 등재 |
| moduleGroup | `lsh` | 부속서 A.2.3 등재 (2026-09-03 신설 — 공지관리) |
| mesModule | `m-mls` | A.4.5 `m-{moduleId}` |
| 적용 명명 룰 | MES 룰 (단일 토큰 camelCase) | A.3.1 |
| 화면식별자 (screenId) | `noticeMgmt` | A.3.1 / A.3.2 등재 |
| pageName | `noticeMgmt` | A.4.2 MES 룰 — screenId 동일값 |
| pageId | `noticeMgmt` | A.4.3 MES 룰 — screenId 동일값 |
| serviceId | `noticeMgmt` | A.4.4 — screenId == serviceId |
| 페이지 유형 | `B` (조회 + 상세) | A-DETAIL 있음, D≥1, L=0, GE=0 |
| 주요 API path (UI→BFF) | `POST /api/mls/oasis/noticeMgmt/{action}` | A.5-4-1 |
| 주요 API path (BFF→BE) | `POST /oasis/noticeMgmt/{action}` | A.5-4-1 |
| Frontend 파일명 | `m-mls/pages/lsh/noticeMgmt/page.tsx` | 호스트 codegen `MODULE_PAGE_PACKAGES` 규약 |
| tsup entry key | `pages/lsh/noticeMgmt/page` | m-mls `tsup.config.ts` entry |
| 메뉴 계층 | 공통관리(`mcm`) > 공지관리(`lsh`) > 공지사항 관리(`noticeMgmt`) | mcm `DataInitializer.seedMlsMenus()` 시드 (2026-10-02). **메뉴는 공통관리 아래, 코드는 mls** (OBJECT `SYSTEM_CODE=mls`, componentPath `lsh/noticeMgmt`) |

### 1.3 기본값 채택 항목 (B.0-4)

| 항목 | 채택값 | 가이드 근거 | 변경 사유 |
|---|---|---|---|
| 화면 식별자 명명 | `noticeMgmt` (단일 토큰 camelCase) | A.3.1 + mls 관행 `*Mgmt` | - |
| As-Is 조회조건/그리드/버튼 전수 반영 | **해당 없음 — To-Be only 화면 (As-Is 없음)** | §A.1-3 Phase 0 | As-Is 부재. §11.1 GAP-001 |
| As-Is ↔ To-Be 매핑 문서 분리 | **해당 없음 — To-Be only 화면 (As-Is 없음)** | §A.2-4 SHOULD | 매핑 대상 없음 |
| body 최상위 키 | `master` 단일 | §A.5-4-3 | - |
| `rowStatus` 약속 | C / U / D / 미변경 행 전송 제외 | §A.5-4-3 + FE v2 §9-3 | - |
| 에러 응답 shape | Level A `meta` + Level B `errors` | §A.5-4-4 | - |
| 권한 표 축 | 행=기능 / 열=역할 (권한 큰 순) | §A.8-8 | - |
| API URL 형식 | `POST /api/{moduleId}/oasis/{serviceId}/{action}` | §A.5-4-1 | - |
| 테이블 명명 | `TB_MLS_NOTICE` (**대문자**) | A.12 `TB_{모듈}_{역할}` 구조 + mls 실자산 관행 | A.12.6 정규식은 lowercase 강제이나 `TB_MLS_SL_LOC` 등 mls 기 등재 자산이 전부 대문자. §11.1 GAP-002 |
| audit 컬럼 | cactus-core `CactusAuditEntity` 9 컬럼 자동 적용 | 02 §A.5-3-1 MUST | 컬럼 표 재기재 ✗ |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 제목·게시상태·게시기간으로 목록을 좁힌다 |
| `A-GRID` | 목록 그리드 | 조회 결과 목록. 행 클릭 시 A-DETAIL 에 상세를 표시한다 |
| `A-DETAIL` | 상세 폼 | 선택 건의 등록·수정 입력 영역 |
| `A-BTN` | 버튼 | `PageLayout.buttons` 로 주입 (A-TOOLBAR 신설 ✗) |

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 (SNAKE_CASE) | 화면 표시명 | 입력 방식 (5 enum) | 필수 (Y/N) | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `TITLE` | 제목 | TextBox | N | (빈값) | 부분 일치 (LIKE) |
| S-002 | `NOTICE_STATUS` | 게시상태 | ComboBox | N | 전체 | LV-001. 전체 선택 시 조건 미적용 |
| S-003 | `POST_START_DT` | 게시기간(시작) | DatePicker | N | (빈값) | 게시기간 교차 조건 하한 |
| S-004 | `POST_END_DT` | 게시기간(종료) | DatePicker | N | (빈값) | 게시기간 교차 조건 상한 |
| S-005 | `NOTICE_CATEGORY` | 공지 분류 | ComboBox | N | 전체 | LV-003. 요청 키 `noticeCategory`. 빈 값 = 전체, 허용 코드 밖이면 오류 (2026-10-02) |
| S-006 | `CONTENT_FORMAT` | 본문 형식 | ComboBox | N | 전체 | LV-002. 요청 키 `contentFormat`. 빈 값 = 전체, 허용 코드 밖이면 오류 (2026-10-02) |

> S-003 / S-004 는 **게시기간이 조회 구간과 겹치는 공지**를 찾는 범위 조건이다 (구간 교차).

### 3.2 조회 결과 (그리드 컬럼)

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 (3 enum) | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | `NOTICE_ID` | 공지번호 | PK. 서버 채번 (read-only) | Left | varchar(30) |
| G-002 | `TITLE` | 제목 | 공지 제목 | Left | varchar(200) |
| G-003 | `NOTICE_STATUS` | 게시상태 | LV-001 코드 → 한글 변환 (§3.3) | Center | varchar(10) |
| G-004 | `POST_START_DT` | 게시시작일 | 게시 개시일 | Center | date(10) |
| G-005 | `POST_END_DT` | 게시종료일 | 게시 종료일 | Center | date(10) |
| G-006 | `CONTENT_FORMAT` | 본문 형식 | LV-002 코드 (2026-10-02) | Center | varchar(10) |
| G-007 | `NOTICE_CATEGORY` | 공지 분류 | LV-003 코드 → 한글 변환 (§3.3) (2026-10-02) | Center | varchar(10) |
| G-008 | `PIN_YN` | 상단 고정 | `Y` / `N` (2026-10-02) | Center | char(1) |
| G-009 | `TARGET_SCOPE` | 게시 대상 | LV-004 코드 (2026-10-02 V4) | Center | varchar(10) |
| G-010 | `TARGET_ROLES` | 대상 역할 | 역할 ID 배열(정렬). `ALL` 이면 빈 배열. 이름은 FE 가 역할 목록(§12.5)으로 붙인다 | Left | string[] |

> ※ 등록자/등록일시는 cactus-core audit 9 컬럼(`C_USR_ID` / `C_AT`)을 그대로 표시한다 —
> 컬럼 표 재기재 ✗ (02 §A.5-3-1).
>
> **확장/서브 그리드**: 해당 없음 — 단일 그리드 화면.

### 3.3 코드값 표시 변환

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| `NOTICE_STATUS` | LV-001 | `DRAFT` → 작성중 / `POSTED` → 게시중 / `STOPPED` → 게시중지 |
| `CONTENT_FORMAT` | LV-002 | `TEXT` → 일반 글 / `MD` → 마크다운 / `HTML` → HTML |
| `NOTICE_CATEGORY` | LV-003 | `NORMAL` → 일반 / `MAINT` → 점검 / `URGENT` → 긴급 |
| `TARGET_SCOPE` | LV-004 | `ALL` → 전체 사용자 / `ROLE` → 특정 역할 |

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `NOTICE_ID` | 공지번호 | TextBox | N | (자동) | read-only. 신규 시 공란, 저장 후 서버 채번값 표시 |
| D-002 | `TITLE` | 제목 | TextBox | Y | (빈값) | 최대 200자 |
| D-003 | `CONTENT` | 내용 | TextBox | N | (빈값) | 여러 줄 입력. 최대 200,000자 (2026-10-02 — DB 4000자 제한 해제, 상한은 서버 검증 V-003). `CONTENT_FORMAT` 에 따라 해석 |
| D-004 | `NOTICE_STATUS` | 게시상태 | ComboBox | Y | `DRAFT` | LV-001 |
| D-005 | `POST_START_DT` | 게시시작일 | DatePicker | N | (빈값) | 게시중 전환 시 필수 (XV-002) |
| D-006 | `POST_END_DT` | 게시종료일 | DatePicker | N | (빈값) | 게시중 전환 시 필수 (XV-002) |
| D-007 | `CONTENT_FORMAT` | 본문 형식 | ComboBox | N | `TEXT` | LV-002. `HTML` 이면 서버가 저장 시 소독한다 (§6.4) |
| D-008 | `NOTICE_CATEGORY` | 공지 분류 | ComboBox | N | `NORMAL` | LV-003. 홈 목록에서 `URGENT` 가 위로 온다 (§12) |
| D-009 | `PIN_YN` | 상단 고정 | CheckBox | N | `N` | `Y` / `N`. 홈 목록 맨 위 고정 (§12) |

| D-010 | `TARGET_SCOPE` | 게시 대상 | Radio | N | `ALL` | LV-004. `ROLE` 이면 D-011 이 하나 이상 있어야 한다 (V-010) |
| D-011 | `TARGET_ROLES` | 대상 역할 | MultiSelect | 조건부 | (빈 배열) | 역할 ID 목록. 자식 테이블 `TB_MLS_NOTICE_TARGET`(NOTICE_ID, ROLE_ID) 에 저장. 선택 목록은 §12.5 |

> D-007~D-009 저장 규칙 (서버): 행에 **키가 없으면 저장된 값을 유지**하고, 키가 있는데 값이 비어 있으면 기본값으로 둔다.
> 세 컬럼을 모르는 이전 화면이 수정 행을 보내도 서식·고정이 풀리지 않게 하려는 것이다. 코드값은 앞뒤 공백을 걷고 대문자로
> 맞춘 뒤 검증한다. `PIN_YN` 은 불리언 `true`/`false` 도 받아 `Y`/`N` 으로 바꾼다.
>
> D-010·D-011 저장 규칙 (서버): `TARGET_SCOPE` 는 D-007~D-009 와 같은 규칙(키 없음 = 유지, 빈 값 = `ALL`)이다.
> `TARGET_ROLES` 는 JSON 배열과 콤마 문자열을 모두 받고, 대문자로 맞추고 중복을 합친다. 키가 없으면 저장된 대상을 유지하고,
> 있으면 그 목록으로 맞춘다(빠진 역할만 지우고 새 역할만 넣는다). 최종 범위가 `ALL` 이면 남은 대상 행을 지운다.
> 공지를 삭제(rowStatus D)하면 대상 행도 함께 지운다. 역할 ID 가 mcm 에 실제로 있는지는 DB 가 달라 확인하지 않는다.

### 4.2 라인 필드 (서브 그리드)

해당 없음 — 본 화면은 라인(서브 그리드) 영역이 없다.

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

| 버튼ID | 버튼명 | 위치 (toolbar / 본체 / 그리드셀) | To-Be action (7 enum) | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | toolbar | `search` | A-FILTER 조건으로 목록 재조회 |
| B-002 | 신규 | toolbar | (client) | 그리드에 빈 행 추가 + A-DETAIL 초기화. 서버 호출 ✗ |
| B-003 | 저장 | toolbar | `save` | 변경 행(C/U/D) 일괄 저장 후 재조회 |
| B-004 | 삭제 | toolbar | `save` (rowStatus=D) | 선택 행을 삭제 대상으로 표시. 실제 삭제는 B-003 |
| B-005 | 게시중지 | toolbar | `changeStatus` | 게시중 건만 활성. `STOPPED` 로 전이 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 그리드 셀 내부 버튼이 없다.

### 5.2 버튼별 동작 상세

| 버튼ID | 트리거 | 선행 조건 | 동작 (단계별) | 호출 액션 (action) |
|---|---|---|---|---|
| B-001 | 클릭 | 없음 | 1) A-FILTER 값 수집 2) `search` 호출 3) 그리드 바인딩 + A-DETAIL 초기화 | `search` |
| B-002 | 클릭 | 없음 | 1) 그리드에 temp 행 추가(rowStatus=C) 2) A-DETAIL 포커스 3) `NOTICE_STATUS`=`DRAFT` 기본값 | (없음) |
| B-003 | 클릭 | 변경 행 1건 이상 | 1) §6 검증 2) 변경 행만 `grids.master.rows` 전송 3) `save` 호출 4) 응답 `list` 재바인딩 5) 응답 `savedIds`(저장 C/U 한 NOTICE_ID 배열, 입력 행 순서, 신규는 서버 채번값, 삭제·미변경 행 제외 — 2026-10-02)로 저장한 행을 다시 선택 | `save` |
| B-004 | 클릭 | 그리드 행 선택 | 1) 선택 행 rowStatus=D 표시 2) 그리드에 삭제 표시 | (없음 — B-003 에서 전송) |
| B-005 | 클릭 | 선택 행 `NOTICE_STATUS`=`POSTED` | 1) 확인 모달 2) `changeStatus` 호출(`STOPPED`) 3) 재조회 | `changeStatus` |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | 선택 행의 값을 A-DETAIL 에 바인딩 |
| 행 더블클릭 | 해당 없음 |
| 헤더 클릭 | 클라이언트 정렬 |
| 페이지 변경 | 해당 없음 — 전건 조회 (페이징 미적용) |

## 6. 입력값 검증 규칙

### 6.1 필드별 검증

| 규칙ID | 대상 필드 | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | `TITLE` (D-002) | 필수. 공백만 입력 불가 | 제목은 필수입니다. |
| V-002 | `TITLE` (D-002) | 최대 200자 | 제목은 200자를 넘을 수 없습니다. |
| V-003 | `CONTENT` (D-003) | 최대 200,000자 (2026-10-02 — 종전 4000자) | 내용은 200,000자를 넘을 수 없습니다. |
| V-004 | `NOTICE_STATUS` (D-004) | 필수. LV-001 코드값만 허용 | 게시상태를 선택하세요. |
| V-005 | `CONTENT_FORMAT` (D-007) | 값이 있으면 LV-002 코드만 허용 | 본문 형식은 TEXT·MD·HTML 중 하나여야 합니다. |
| V-006 | `NOTICE_CATEGORY` (D-008) | 값이 있으면 LV-003 코드만 허용 | 공지 분류는 NORMAL·MAINT·URGENT 중 하나여야 합니다. |
| V-007 | `PIN_YN` (D-009) | 값이 있으면 `Y`/`N` 만 허용 | 상단 고정은 Y 또는 N 이어야 합니다. |
| V-008 | `TARGET_SCOPE` (D-010) | 값이 있으면 LV-004 코드만 허용 | 게시 대상은 ALL 또는 ROLE 이어야 합니다. |
| V-009 | `TARGET_ROLES` (D-011) | 각 항목이 `^[A-Z0-9_]{1,100}$` (대문자 정규화 뒤) | 대상 역할 ID 형식이 올바르지 않습니다: {값} |
| V-010 | `TARGET_ROLES` (D-011) | 최종 범위가 `ROLE` 이면 최종 대상이 1개 이상 (키가 없으면 저장된 대상으로 판정) | 게시 대상을 역할로 정했으면 역할을 하나 이상 고르세요. |

### 6.2 연관 검증 (여러 필드 조합)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | `POST_START_DT` 가 `POST_END_DT` 보다 늦음 | 게시시작일은 게시종료일보다 늦을 수 없습니다. |
| XV-002 | `NOTICE_STATUS`=`POSTED` 인데 게시기간 중 하나가 공란 | 게시중으로 변경하려면 게시기간을 입력하세요. |

### 6.3 검증 실행 순서

```
[저장] 클릭
  → 1단계: 필수값 체크
  → 2단계: 형식/범위 체크
  → 3단계: 연관 검증
  → 모두 통과 → 서버 요청
  → 실패 → 첫 번째 에러 필드로 포커스 이동 + 에러 메시지 표시
```

> 서버는 FE 검증을 신뢰하지 않고 V-001~V-010 / XV-001~XV-002 를 재검증한다
> (Mes-Guide §7 — "사용자 입력값 중 처리에 영향을 주는 값은 backend 에서 재검증").

### 6.4 HTML 본문 소독 (서버, 2026-10-02)

`CONTENT_FORMAT='HTML'` 인 행을 저장하면 서버가 본문을 소독한 뒤 저장한다(형식 키 없이 수정해도 저장된 형식이 HTML 이면
소독한다). 구현은 `mls/lib` 의 `NoticeHtmlSanitizer`(jsoup `Safelist.relaxed()` + `hr`·`s`·`del`·`ins`·`mark`)다.
허용 목록 방식이라 목록 밖의 것은 모두 빠진다.

| 제거 대상 | 예 |
|---|---|
| 위험 태그 | `script` · `iframe` · `object` · `embed` · `form`(`input` 포함) · `style` · `svg` |
| 이벤트 속성 | `onclick` · `onerror` · `onload` 등 `on*` 전부 |
| 인라인 스타일 | `style` 속성 |
| 위험 URL | `javascript:`(대소문자·제어문자 변형 포함) · `data:`. `a[href]` 는 http·https·mailto, `img[src]` 는 http·https 만 허용 |

- 오류로 거부하지 않고 걸러서 저장한다. 사용자는 저장 뒤 재조회한 본문에서 결과를 본다.
- 상대 경로 링크와 `#anchor` 링크도 프로토콜이 없어 제거된다(알려진 부작용).
- 홈 조회(noticeBoard)는 내려보낼 때 한 번 더 소독한다(§12).
- `MD` 본문 안의 날 HTML 은 서버가 손대지 않는다 — FE `MarkdownView` 가 HTML 토큰을 만들지 않고 글자 그대로 보여 주므로
  서버 처리가 필요 없다(팀장 확인 2026-10-02).

## 7. 상태 정의 및 상태별 제어

### 7.1 상태 정의

| 상태코드 | 한글명 | 설명 | 단순 표시값/동작 제어값 | 수정 가능 | 삭제 가능 |
|---|---|---|---|---|---|
| ST-001 `DRAFT` | 작성중 | 등록했으나 게시하지 않은 상태 | 동작 제어값 | Y | Y |
| ST-002 `POSTED` | 게시중 | 게시기간 내 노출 대상 | 동작 제어값 | Y | N |
| ST-003 `STOPPED` | 게시중지 | 게시를 중단한 상태 | 동작 제어값 | Y | Y |

### 7.2 상태 전이 규칙

```
DRAFT   → POSTED    저장 시 게시상태를 게시중으로 변경 (게시기간 필수 — XV-002)
POSTED  → STOPPED   B-005 게시중지
STOPPED → POSTED    저장 시 게시상태를 게시중으로 재변경
DRAFT   → (삭제)    rowStatus=D 저장
STOPPED → (삭제)    rowStatus=D 저장
```

### 7.3 상태별 필드 편집 가능 여부

| 필드 | 신규 | DRAFT | POSTED | STOPPED |
|---|---|---|---|---|
| `NOTICE_ID` (공지번호) | 자동 | 불가 | 불가 | 불가 |
| `TITLE` (제목) | 가능 | 가능 | 가능 | 가능 |
| `CONTENT` (내용) | 가능 | 가능 | 가능 | 가능 |
| `NOTICE_STATUS` (게시상태) | 가능 | 가능 | 가능 | 가능 |
| `POST_START_DT` (게시시작일) | 가능 | 가능 | 가능 | 가능 |
| `POST_END_DT` (게시종료일) | 가능 | 가능 | 가능 | 가능 |

### 7.4 상태별 버튼 활성/비활성

| 버튼 | 미선택 | DRAFT 선택 | POSTED 선택 | STOPPED 선택 |
|---|---|---|---|---|
| B-001 조회 | 활성 | 활성 | 활성 | 활성 |
| B-002 신규 | 활성 | 활성 | 활성 | 활성 |
| B-003 저장 | 비활성 | 활성 | 활성 | 활성 |
| B-004 삭제 | 비활성 | 활성 | **비활성** | 활성 |
| B-005 게시중지 | 비활성 | 비활성 | **활성** | 비활성 |

## 8. 권한 정의

| 기능 | ADMIN | MANAGER | USER | 비고 |
|---|---|---|---|---|
| 조회 | O | O | O | `search` |
| 신규등록 | O | O | X | `save` (rowStatus=C) |
| 수정 | O | O | X | `save` (rowStatus=U) |
| 삭제 | O | X | X | `save` (rowStatus=D). POSTED 건 삭제 불가 (§7.4) |
| 상태 변경 | O | O | X | `changeStatus` |

> RBAC 는 `TB_MCM_SEC_OBJ` / `TB_MCM_SEC_ROLE_MAPPING` 의 `OBJECT_ID='noticeMgmt'` 로 외부 위임한다
> (mcm-reference "권한 / 접근 제어 (RBAC 외부 위임)"). 본 화면 자체 권한 분기 없음.
> 시드(2026-10-02, mcm `DataInitializer.seedMlsMenus()`)는 `SYSADMIN × noticeMgmt × PERM_ALL` 한 행이다.
> 메뉴 위치: **메뉴는 공통관리(`mcm`) 아래 공지관리(`lsh`, MENU_SEQ 600 — cma·csa·cme·cmb·cmz 뒤), 코드는 mls** 다(사용자 요청 2026-10-02).
> 처음 시드한 물류관리(`mls`) 루트 아래 위치는 `relocateNoticeFolderToMcm()` 이 멱등 보정한다.
> `changeStatus` 는 같은 날 `PERM_ALL` 의 action 목록에 추가했다(그전에는 SYSADMIN 도 게시중지가 403).
> 위 표의 MANAGER·USER 열은 설계 의도이며, 해당 역할 매핑은 아직 시드하지 않았다.

## 9. 연동 화면 / 팝업

해당 없음 — 본 화면은 팝업·연동 화면이 없다. 게시중지 확인은 shared `MessageModal` 로 처리하며
별도 팝업 ID 부여 대상이 아니다.

## 10. 기타 열거형 (LoV)

| 열거형 (DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| LV-001 `NOTICE_STATUS` | `DRAFT` | 작성중 | 초기 등록 상태 (기본값) |
| LV-001 `NOTICE_STATUS` | `POSTED` | 게시중 | 게시기간 필수 (XV-002) |
| LV-001 `NOTICE_STATUS` | `STOPPED` | 게시중지 | B-005 로 전이 |

| LV-002 `CONTENT_FORMAT` | `TEXT` | 일반 글 | 기본값. 줄바꿈만 살려 표시 |
| LV-002 `CONTENT_FORMAT` | `MD` | 마크다운 | FE 가 마크다운으로 렌더링 |
| LV-002 `CONTENT_FORMAT` | `HTML` | HTML | 서버 소독 HTML (§6.4) |
| LV-003 `NOTICE_CATEGORY` | `NORMAL` | 일반 | 기본값 |
| LV-003 `NOTICE_CATEGORY` | `MAINT` | 점검 | 시스템 점검 안내 |
| LV-003 `NOTICE_CATEGORY` | `URGENT` | 긴급 | 홈 목록에서 고정 다음으로 위에 온다 |
| LV-004 `TARGET_SCOPE` | `ALL` | 전체 사용자 | 기본값 |
| LV-004 `TARGET_SCOPE` | `ROLE` | 특정 역할 | `TB_MLS_NOTICE_TARGET` 의 역할을 가진 사용자에게만 홈에 보인다 |

> LV-001~LV-004 는 코드 마스터 테이블에 등재하지 않고 **화면 인라인 상수**로 둔다 (BE 정본: `mls/lib` `NoticeCodes`).
> 근거는 mcm-reference `(cic)` 의 "부문구분 LoV 인라인 유지(마스터 등재 없음)" 선례다. 값이 3개로 고정이고,
> 같이 쓰는 곳은 홈 공지 목록(noticeBoard, §12)뿐이다.

## 11. 특이사항 / 설계 결정

### 11.1 [확인필요] / GAP 등재

> 본 화면은 분석리포트가 없으므로 (문서 상단 인용 정본 예외) 통상의 "분석리포트 §13 그대로 인용" 대신
> 본 절에서 GAP 을 직접 등재한다.

| ID | 항목 | 영향도 | 후속 조치 | 상태 |
|---|---|---|---|---|
| GAP-001 | **설계 가이드에 신규(To-Be only) 화면 규정이 없다.** `agent-directive/07-templates-writing-response.md:180` 은 "As-Is 자료 확인 없이 신규 기능을 창작하지 않는다", `08-prompt-operations-dispatch.md:27` 은 "신규 창작 금지" 를 MUST 로 두고, 분석리포트 §-1 SOP 30 Step / R14 Auto Manifest / §0.1~§0.5 / §4~§6 / 게이트 G1~G9 는 전부 As-Is 파일 grep 을 전제한다. To-Be only 규정은 §17 · §K.5 · analyze-service 면제 3곳뿐이다 | 높음 | 가이드에 "신규 화면 트랙" 절 신설 필요. 현재는 사용자 결정으로 기능설계서 1종만 작성 | open |
| GAP-002 | **테이블 명명 규칙이 실자산과 충돌한다.** `identifier-dictionary/04-decision-table-dispatch.md:112` 의 검증 정규식이 lowercase 를 100% 강제하는데, 실제 mls 등재 자산은 `TB_MLS_SL_LOC` · `TB_MLS_MOVE_TYPE` 로 전부 대문자다 (A.3.2 비고). mcm 도 `TB_MCM_SEC_*` 대문자이며 `mcm-reference.md:33` 이 대문자 보존을 정본으로 못박는다 | 중간 | 본 화면은 실자산 관행(`TB_MLS_NOTICE`)을 따른다. A.12.6 정규식 개정 필요 | open |
| GAP-003 | **`docs/external/KsmErpK/` 가 이 저장소에 없다.** `design/README.md` §3 은 그 경로 확인을 설계 착수 게이트로 두는데 `docs/external/` 에는 `BP` · `SampleErp` 만 있다 | 중간 | 템플릿 저장소의 경로 placeholder 미치환으로 보인다. 실제 고객사 착수 시 치환 필요 | open |
| GAP-004 | **`mls` 모듈에 OASIS 가 부팅된 적이 없다.** `mls/api/application.yml` 에 `cactus` 설정이 전무해 `CactusWebSecurityAutoConfiguration`(`@ConditionalOnProperty(cactus.jwt.secret)`) 과 `OasisAutoConfiguration` 이 모두 비활성이었다 | 높음 | 본 화면 구현과 함께 `cactus.jwt` / `cactus.security.client-key` / `cactus.oasis` 블록을 추가한다 (mcm · analog 선례) | resolved |
| GAP-005 | **`sample` 슬라이스 존치 여부.** `mls/lib` 의 `SampleInventoryItem*` 6종은 `@RestController` · Lombok 기반이라 OASIS 표준 위반이다 | 낮음 | 본 화면과 무관하게 존치. 정리는 별건 | open |

### 11.2 검토한 대안

| 대안 | 장점 | 단점 | 채택 여부 (O/X) | 사유 |
|---|---|---|---|---|
| `mcm` 모듈에 `cmn` 그룹 신설 | 배관 추가 없음 — 포털 · BFF · 권한 · 시드가 모두 mcm 소유 | 테스트 모듈을 별도로 두려는 사용자 의도와 어긋남 | X | 사용자가 "빈 모듈 mls 재활용" 선택 (2026-09-03) |
| `mnt` 등 신규 백엔드 모듈 생성 | 완전 격리 | Gradle · 포트 · yml · db · .env · FE앱 · page-registry · 기동 스크립트 전부 신설. 권한 · 메뉴는 여전히 mcm 소유라 mcm 도 수정 필요 | X | 배관이 화면 작업보다 큼 |
| **`mls` 빈 모듈 재활용** | 포트(8092) · SQLite db · `cactus-core`+`mcm-core` 의존 · FE앱 · `MLS_WAS_URL` BFF 라우팅이 이미 존재 | mls 는 Flyway enabled + `ddl-auto: none` 이라 DDL 을 직접 써야 함. OASIS 최초 부팅 필요(GAP-004) | O | 사용자 결정 2026-09-03 |
| 게시상태를 코드 마스터(`TB_MCM_CODE_*`)에 등재 | 타 화면 재사용 | 값 3개 고정 + 타 화면 공유 없음. mls → mcm 코드 마스터 교차 조회 배선 추가 필요 | X | §10 인라인 상수로 충분 |

## 12. 포털 홈 공지 목록 (noticeBoard, 2026-10-02)

포털 홈 화면은 **모든 로그인 사용자**가 보지만 `noticeMgmt` OBJECT 권한은 관리자 전용이다. 그래서 홈용 읽기 전용 조회를
별도 OASIS 서비스·OBJECT 로 분리한다. 쓰기 action 은 두지 않는다.

### 12.1 호출 계약

| 항목 | 값 |
|---|---|
| serviceId / OBJECT_ID | `noticeBoard` (SYSTEM_CODE `mls`) |
| BPMN | `mls/api/src/main/resources/services/lsh/noticeBoard.bpmn` — action `search` 하나 |
| Java | `com.dongkuk.dmes.mls.lsh.noticeBoard.service.NoticeBoardService` (빈 `noticeBoardService`) |
| API (UI→BFF) | `POST /api/mls/oasis/noticeBoard/search` |
| API (BFF→BE) | `POST /oasis/noticeBoard/search` |
| 요청 `params` | 비워도 된다(`{}`). 선택 키 `limit`(1~50, 없거나 범위 밖이면 50) 하나뿐 |
| 권한 | **AUTH_ONLY** — 로그인만 되면 누구나(§12.4). 무엇을 보여 줄지는 서비스가 현재 사용자 역할로 정한다 |
| 응답 | noticeMgmt search 와 같은 모양 — `data.result.list` (BPMN `output="result"`) |

### 12.2 조회 규칙

- `NOTICE_STATUS='POSTED'` 이고 오늘이 게시기간 안인 공지. 시작·종료가 비어 있으면 그쪽은 열린 구간으로 본다(경계일 포함).
- 게시 대상: `TARGET_SCOPE='ALL'` 이거나, `'ROLE'` 이고 현재 사용자의 역할 중 하나가 `TB_MLS_NOTICE_TARGET` 에 있는 공지.
  역할이 없거나 사용자 문맥이 없으면 전체 대상 공지만 보인다. `ROLE` 인데 대상 행이 없으면 아무에게도 보이지 않는다.
  SYSADMIN 도 예외 없이 같은 규칙이다(관리 화면 noticeMgmt 에서는 모든 공지를 본다).
- 상태값·기준일(서버 오늘)·사용자 역할은 서버가 정한다. 요청으로 조회 범위를 넓힐 수 없다.
- 정렬: `PIN_YN='Y'` 먼저 → `NOTICE_CATEGORY='URGENT'` 먼저 → `C_AT` 최신순(`C_AT` 이 비어 있으면 뒤) → `NOTICE_ID` 역순.
- 최대 50건.
- `CONTENT_FORMAT='HTML'` 본문은 내려보낼 때도 한 번 더 소독한다(§6.4).

### 12.3 응답 행 키

`NOTICE_ID`, `TITLE`, `CONTENT`, `CONTENT_FORMAT`, `NOTICE_CATEGORY`, `PIN_YN`, `POST_START_DT`, `POST_END_DT`, `C_USR_ID`, `C_AT`
— DB 컬럼명 SNAKE_CASE 그대로다. 날짜는 `yyyy-MM-dd`, `C_AT` 는 ISO-8601 UTC 시각 문자열(Java `Instant.toString()`, 예 `2026-10-02T04:35:17.123Z`)이다.

> 작성자 이름(`C_USR_NM`)은 넣지 않았다. 사용자 원장(`TB_MCM_SEC_USER`)은 mcm DB 에 있고 mls DB 와 파일이 달라 조인할 수
> 없다. 필요하면 FE 가 사용자 ID 로 이름을 붙이거나, mls 에 이름 조회 경로를 따로 둔다.

### 12.4 권한 — 로그인한 모든 사용자 (AUTH_ONLY)

| 위치 | 등록 값 |
|---|---|
| BFF `src/frontend/m-mcm/proxy.ts` `RBAC_POLICY.authOnlyPrefixes` | `/api/mls/oasis/noticeBoard/search` |
| BE `mcm-core` `EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES` | `noticeboard/search` (동기화용 — mls 에는 이 필터가 등록돼 있지 않아 실제 관문은 BFF) |

- secFavorite·secStartPgm 처럼 "본인 기준 데이터" 예외다. 홈 공지는 로그인한 모든 사용자 몫이고, 게시 대상은 서비스가
  `UserContextHolder` 의 역할로 거른다(§12.2·§12.5). 그래서 OBJECT·역할 매핑이 없고, 런타임에 만든 역할이나 역할이 없는
  사용자도 막히지 않는다.
- 같은 서비스의 다른 action(예: `noticeBoard/save`)은 목록에 없어 RBAC 로 판정된다(없는 action 이라 403). `search` 만 연다.
- 경과: 같은 날 처음에는 `PERM_SEARCH_ONLY` 권한 세트를 모든 역할에 매핑하는 방식이었다. 새로 만든 역할은 다음 부팅까지,
  역할이 없는 사용자는 아예 막히는 한계가 있어 AUTH_ONLY 로 바꿨다(팀장 결정 2026-10-02). 그 방식으로 이미 시드된 DB 에 남은
  `PERM_SEARCH_ONLY`·`noticeBoard` OBJECT·역할 매핑 행은 지우지 않는다 — search 하나만 주는 행이라 AUTH_ONLY 와 결과가 같아
  해가 없다. 시드 코드는 뺐다.

### 12.5 게시 대상 단위 — 역할 그룹이 아니라 역할 (2026-10-02)

| 확인한 것 | 결과 |
|---|---|
| BFF → BE 헤더 | `X-Authenticated-Role` 에 JWT `roles` 클레임을 `ROLE_` 를 떼고 대문자로 바꿔 콤마로 싣는다 (shared `oasis-proxy`, m-mcm `be-proxy.ts`) |
| JWT `roles` 의 내용 | mcm `McmAuthService.loadUserRoles` — 사용자 → 역할 그룹(`TB_MCM_SEC_USER_MAPPING`) → 역할(`TB_MCM_SEC_ROLEGROUP_MAPPING`)을 펼친 **역할 ID** 목록. 역할 그룹 ID 는 토큰에 없다 |
| mls 에서 읽는 곳 | cactus `ClientKeyFilter` 가 헤더를 `ROLE_{역할}` 권한으로 사전 인증하고, `JwtAuthenticationFilter` 가 그것을 `UserContextHolder` 의 `UserInfo.roles()` 로 옮긴다 (mdm `CactusMdmCurrentUser` 와 같은 경로) |
| 역할 그룹을 알려면 | mcm DB 의 `TB_MCM_SEC_USER_MAPPING` 을 읽어야 한다 — mls 는 다른 DB 라 피한다 |

따라서 대상은 **역할 ID** 로 지정한다. "역할 그룹에 게시" 는 그 그룹에 속한 역할들을 고르는 것으로 대신한다.
역할이 바뀐 사용자는 다시 로그인해야(토큰 재발급) 홈 공지 대상 판정이 바뀐다.

**관리 화면의 역할 선택 목록** — 기존 mcm OASIS 서비스를 그대로 쓴다.

| 항목 | 값 |
|---|---|
| 호출 | `POST /api/mcm/oasis/commRoleMng/search` (BPMN `services/csa/commRoleMng.bpmn`, `commRoleMngService.searchCmRole`) |
| params | `edtROLEID`(ID 부분 일치) · `edtROLENM`(이름 부분 일치) · `cboUSETP`(`Y` 사용 중만) — 모두 선택, `{}` 이면 전체 |
| 응답 | `data.result.ds_main[]` — `ROLE_ID`, `ROLE_NM`, `ROLE_DESC`, `USE_TP`, `MENU_ID`, `START_ACTIVE_DATE`, `END_ACTIVE_DATE`, `ROLE_GROUP_ID`, `ID` |
| 권한 | 권한키 `mcm/commrolemng/search`. 시드상 `SYSADMIN × commRoleMng × PERM_ALL` 이 있어 noticeMgmt 를 쓰는 관리자(SYSADMIN)는 추가 시드 없이 호출할 수 있다. SYSADMIN 이 아닌 역할에게 noticeMgmt 를 열면 그 역할에도 commRoleMng search 를 줘야 한다 |

