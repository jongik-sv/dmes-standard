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
| 접근 경로 | 포털 → 공지관리 → 공지사항 관리 |

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
| 메뉴 계층 | 공지관리(`lsh`) > 공지사항 관리(`noticeMgmt`) | 메뉴 등록은 사용자 담당 |

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

> S-003 / S-004 는 **게시기간이 조회 구간과 겹치는 공지**를 찾는 범위 조건이다 (구간 교차).

### 3.2 조회 결과 (그리드 컬럼)

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 (3 enum) | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | `NOTICE_ID` | 공지번호 | PK. 서버 채번 (read-only) | Left | varchar(30) |
| G-002 | `TITLE` | 제목 | 공지 제목 | Left | varchar(200) |
| G-003 | `NOTICE_STATUS` | 게시상태 | LV-001 코드 → 한글 변환 (§3.3) | Center | varchar(10) |
| G-004 | `POST_START_DT` | 게시시작일 | 게시 개시일 | Center | date(10) |
| G-005 | `POST_END_DT` | 게시종료일 | 게시 종료일 | Center | date(10) |

> ※ 등록자/등록일시는 cactus-core audit 9 컬럼(`C_USR_ID` / `C_AT`)을 그대로 표시한다 —
> 컬럼 표 재기재 ✗ (02 §A.5-3-1).
>
> **확장/서브 그리드**: 해당 없음 — 단일 그리드 화면.

### 3.3 코드값 표시 변환

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| `NOTICE_STATUS` | LV-001 | `DRAFT` → 작성중 / `POSTED` → 게시중 / `STOPPED` → 게시중지 |

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `NOTICE_ID` | 공지번호 | TextBox | N | (자동) | read-only. 신규 시 공란, 저장 후 서버 채번값 표시 |
| D-002 | `TITLE` | 제목 | TextBox | Y | (빈값) | 최대 200자 |
| D-003 | `CONTENT` | 내용 | TextBox | N | (빈값) | 여러 줄 입력. 최대 4000자 |
| D-004 | `NOTICE_STATUS` | 게시상태 | ComboBox | Y | `DRAFT` | LV-001 |
| D-005 | `POST_START_DT` | 게시시작일 | DatePicker | N | (빈값) | 게시중 전환 시 필수 (XV-002) |
| D-006 | `POST_END_DT` | 게시종료일 | DatePicker | N | (빈값) | 게시중 전환 시 필수 (XV-002) |

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
| B-003 | 클릭 | 변경 행 1건 이상 | 1) §6 검증 2) 변경 행만 `grids.master.rows` 전송 3) `save` 호출 4) 응답 `list` 재바인딩 | `save` |
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
| V-003 | `CONTENT` (D-003) | 최대 4000자 | 내용은 4000자를 넘을 수 없습니다. |
| V-004 | `NOTICE_STATUS` (D-004) | 필수. LV-001 코드값만 허용 | 게시상태를 선택하세요. |

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

> 서버는 FE 검증을 신뢰하지 않고 V-001~V-004 / XV-001~XV-002 를 재검증한다
> (Mes-Guide §7 — "사용자 입력값 중 처리에 영향을 주는 값은 backend 에서 재검증").

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

## 9. 연동 화면 / 팝업

해당 없음 — 본 화면은 팝업·연동 화면이 없다. 게시중지 확인은 shared `MessageModal` 로 처리하며
별도 팝업 ID 부여 대상이 아니다.

## 10. 기타 열거형 (LoV)

| 열거형 (DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| LV-001 `NOTICE_STATUS` | `DRAFT` | 작성중 | 초기 등록 상태 (기본값) |
| LV-001 `NOTICE_STATUS` | `POSTED` | 게시중 | 게시기간 필수 (XV-002) |
| LV-001 `NOTICE_STATUS` | `STOPPED` | 게시중지 | B-005 로 전이 |

> LV-001 은 코드 마스터 테이블에 등재하지 않고 **화면 인라인 상수**로 둔다 (mcm-reference `(cic)` 의
> "부문구분 LoV 인라인 유지(마스터 등재 없음)" 선례). 값이 3개로 고정이고 타 화면 공유가 없다.

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
