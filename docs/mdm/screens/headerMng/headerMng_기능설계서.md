---
screenId: headerMng
asIsId: 해당 없음 (To-Be only 신규 화면)
moduleId: mdm
moduleGroup: dmb
작성일: 2026-09-24
작성자: Agent
---

# mdm — 전문 헤더 정의 기능설계서

> **인용 정본 예외(선례 [DEC-001](../../../ai-build-log/DEC-001_noticeMgmt-on-mls.md) 결정 2, TSK-04-03 D8)**: As-Is 레거시가 없는
> To-Be only 신규 화면이라 설계 산출물을 기능설계서 1종으로 줄였다. 근거는 원천 설계 `docs/mdm/design/basic/03-interface-layout.md`
> (이하 `03:행`)와 시안 `docs/mdm/design/basic/html/03-interface-layout.html`(이하 `시안`)이다. 구현 설계·테스트는
> [TSK-05-02 design.md](../../tasks/TSK-05-02/design.md) 가 정본이다.
>
> **Frontend 개발 연계 값** — mesModule `m-mdm` / moduleGroup `dmb` / pageName `headerMng` / pageId `headerMng` /
> 페이지 유형 `B` / tsup entry key `pages/dmb/headerMng/page`

## 1. 화면 개요

| 항목 | 내용 | 근거 |
|---|---|---|
| 화면명 | 전문 헤더 정의 | wbs.md TSK-05-02, screens/README §3 |
| 화면 식별자 | `headerMng` (= OBJECT_ID = serviceId = BPMN process id) | screens/README §5 |
| 모듈 | `mdm` / moduleGroup `dmb`(레이아웃) | screens/README §2, design.md D1 |
| 화면 목적 | EAI 공통 헤더·구간 헤더(헤더 레이아웃)를 컬럼 사전 항목으로 정의하고, 헤더를 바꾸면 그 헤더를 쌓은 전문 전체의 영향(오프셋·총 길이)을 보인다 | 03 「구조: 전문 = EAI 헤더 + 업무 본문」 |
| 주요 사용자 | 표준 관리자(MDM_STD_ADMIN) 편집, 담당자(MDM_STEWARD) 조회 | ADR-0003 D5, DataInitializer `seedMdmObjectRbac(…, "dmb")` |
| 접근 경로 | 포털 → 마루 MDM → 레이아웃 → 전문 헤더 정의 | spec entry-point(메뉴 이름), design.md D1 |
| API | `POST /api/mdm/oasis/headerMng/{search,view,save}` (BFF) → `POST /oasis/headerMng/{action}` | TRD §3 |
| 파일 | `m-mdm/pages/dmb/headerMng/page.tsx`, 서비스 `mdm/lib/…/dmb/headerMng/service/HeaderMngService.java`, BPMN `services/dmb/headerMng.bpmn` | screens/README §5 |

## 2. 화면 영역

| 영역 | 내용 | testid |
|---|---|---|
| A-FILTER | 검색어(헤더 이름 부분 일치) | `header-search-keyword` |
| A-LIST | 헤더 목록 — 헤더 ID·이름·EAI·인코딩·길이·항목 수·사용 전문 수. 없으면 "조회된 헤더가 없습니다" | `header-list`, `header-list-empty` |
| A-DETAIL | 헤더 ID(읽기)·헤더 이름*·EAI 코드·EAI 이름·인코딩(EUC-KR/UTF-8)·패딩 규칙·헤더 길이 계산값 `N 바이트 (M항목)` | `header-form-name`, `header-form-eai`, `header-form-eai-name`, `header-form-encoding`, `header-form-pad-rule`, `header-length` |
| A-IMPACT | 사용 전문(헤더 변경 영향도) — 전문 이름·송신→수신·쌓인 순서·총 길이 | `header-usage` |
| A-ITEMS | 헤더 항목 그리드 — 순서(행 드래그)·항목명·표준 물리명·채움·오프셋·길이·위치·기본값 + [+ 항목 추가]·[+ FILLER]·[삭제] | `header-items`, `header-item-add-column`, `header-item-add-filler` |
| A-ITEM-DETAIL | 항목 상세(공용 `LayoutItemDetail`) | `item-detail`, `item-detail-*` |
| POPUP | 컬럼 사전 검색(공용 `ColumnPickModal`) — 사전 검색 결과에서 고른 행만 항목이 된다 | `column-pick-*` |

## 3. 데이터·계산 규칙

- **인코딩·패딩은 EAI 가 소유한다**(design.md D2). 헤더 상세에서 EAI 코드를 넣으면 그 EAI 의 이름·인코딩·패딩을 함께 편집하고, 저장하면
  이 헤더 버전 행의 `EAI_CODE` 에 그 EAI 가 기록된다. EAI 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전 중 그 EAI 를 주장하는 가장 늦게 적용 시작한 버전으로 해석한다(D-148, 아래 §9). `TB_MDM_EAI.HEADER_LAYOUT_ID` 는 더 이상 운영이 읽지 않는다. EAI 가 없는 헤더(시스템 구간 헤더 등)는
  전문의 EAI 인코딩을 따른다.
- **항목 오프셋은 이 헤더 안 상대값**(0부터), 헤더 길이 = 항목 길이 합(FILLER 포함)(03 「자동 계산」, 불변 I2·I3).
- 항목 길이 = FILLER 길이 / 숫자 표현 자리수(NUM_FORMAT WIDTH) / 도메인 조립기의 유효 길이(불변 I4). 화면은 편집 즉시 다시 계산하고(I11),
  저장값은 서버가 다시 계산한다 — 화면이 보낸 OFFSET·LENGTH 는 읽지 않는다.
- fill_kind 별 입력 칸(시안 표, 불변 I6): 닫힌 칸은 disabled 이고 fill_kind 를 바꾸면 비워진다. AUTO 기본값은 SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID.
- **헤더 저장 = 사용 전문 재계산**(design.md D7): 같은 트랜잭션에서 이 헤더를 쌓은 전문 전체의 본문 오프셋·총 길이를 다시 민다(항목 길이는
  저장된 값). 전문별 상수 재정의는 헤더 항목의 **물리명**으로 다시 짝짓고, 빠졌거나 CONST 가 아니게 된 항목의 재정의는 지운다(응답
  `droppedOverrides`). 업무 버전(`VERSION`)은 올리지 않는다(TSK-05-03). 감사 `VER` 은 오르므로 그 전문을 띄워 둔 사용자는 다음 저장에서
  MDM001 을 받는다(의도된 동작).
- 상수 값은 코드값(영문·숫자) 전제다(TSK-05-01 D9). 화면 입력 검사로 막지는 않는다.

## 4. 버튼·동작

| 버튼 | 권한(action) | 동작 |
|---|---|---|
| 조회 | search | `search`(target 생략=HEADER) → 목록·EAI 목록 |
| 신규 | save | 빈 상세·항목 |
| 저장 | save | 화면 선검사(서버와 같은 `Lnn[seq]` 문구) → 사용 전문이 있으면 확인 창 "이 헤더를 쓰는 전문 N건의 오프셋·총 길이가 다시 계산됩니다. 저장할까요?" → `save`(grid `items` 늘 전송) → 토스트 → 재조회·재선택 |
| 목록 행 클릭 | view | 상세·항목(파생값)·사용 전문 |
| + 항목 추가 | save | 컬럼 사전 팝업 → `search target=COLUMN`(D8). 결과가 없으면 "컬럼 사전에 없습니다. 먼저 컬럼 사전에 등재하세요", [선택] 비활성 |
| + FILLER / 삭제 | save | 화면 상태만 바꾼다 |

[신규]·[저장]·항목 추가 버튼은 `canDoButton(rbac, "headerMng", "save")` 가 거짓이면 숨긴다(담당자는 조회만).

## 5. API 요청·응답(행 키 UPPER_SNAKE)

| action | 요청 | 응답 `data.result` |
|---|---|---|
| search | params `target`(`HEADER`·`COLUMN`), `keyword` | HEADER: `headers[{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, ENCODING, ITEM_COUNT, TOTAL_LENGTH, USED_BY_COUNT, VER}]`, `eais[…]` / COLUMN: `columns[{PHYS_NAME, COLUMN_NAME, LABEL_LONG, DISPLAY_NAME, DOMAIN_ID, DOMAIN_NAME, DATA_TYPE, LENGTH, SCALE, UNIT_CODE}]`(최대 100) |
| view | params `layoutId` | `header{…}`, `items[…파생값·OFFSET·LENGTH]`, `usedBy[{LAYOUT_ID, LAYOUT_NAME, SND_SYSTEM, RCV_SYSTEM, HEADER_SEQ, TOTAL_LENGTH}]`, `units[…]` |
| save | params `layoutId?, ver?, layoutName, eaiCode?, eaiName?, encoding?, padRule?`; grid `items[{SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE, FILLER_LENGTH}]`(행 순서가 SEQ) | `layoutId, ver, totalLength, recalculated[{LAYOUT_ID, LAYOUT_NAME, TOTAL_LENGTH_BEFORE, TOTAL_LENGTH_AFTER}], droppedOverrides` |

## 6. 거부(서버 검사, 메시지 `헤더 저장 거부: Lnn[seq] 문구; …`)

| 코드 | 조건 |
|---|---|
| L01 | DATA·CONST·AUTO 항목의 컬럼이 컬럼 사전에 없다(수용 기준 1 — 앱이 DB FK 보다 먼저 거부) |
| L02 | fill_kind 의 닫힌 칸에 값이 있다(수용 기준 5) |
| L03 | 필수 칸이 비었다(fill_kind·컬럼·AUTO 종류·FILLER 길이 ≥ 1) |
| L04 | AUTO 종류가 네 가지가 아니다 |
| L05 | 전송 단위와 단위 항목을 함께 넣었다 |
| L06 | 같은 헤더에 같은 컬럼을 두 번 넣었다 |
| L07 | 항목 길이를 파생할 수 없다 |
| L08 | 숫자 표현 형식 위반(숫자가 아닌 도메인·형식 문자열·암묵 소수 자리) |
| L11 | 헤더 이름이 비었다 / 새 EAI 에 이름·인코딩이 없다 / 대상이 헤더 레이아웃이 아니다 |
| MDM001 | 요청 `ver` ≠ DB `VER`(동시 수정) — "다른 사용자가 수정했습니다. 다시 불러오세요" |

05-03 몫(값 유효 식·전송 단위 차원·자리 용량·unit_item 대상)은 이 화면이 검사하지 않는다(design.md D7).

## 7. 권한

| 기능 | MDM_STD_ADMIN | MDM_STEWARD | SYSADMIN |
|---|---|---|---|
| 조회(search·view) | O | O | O |
| 저장(save) | O | X | O |

## 8. 알려진 한계·인계

- html "구간 종류 [미결]"·AUTO(MSG_LENGTH) 세는 범위·SEND_TIME 날짜/시각 분할은 저장하지 않는다(TSK-05-01 F24).
- 헤더별 인코딩 칸은 스키마에 없다(D2 — 반려되면 V9 마이그레이션).

## 9. D-144 3단계 — 버전 관리 변경 (이 장이 위 §3~§8 의 버전·EAI 서술보다 우선한다)

정본은 [ADR-0006](../../adr/0006-object-versioning-major-minor.md) 3단계 결과 절과 [decisions D-148](../../decisions.md)이다.

- 저장은 내 DRAFT 를 `ver`·`rowVersion` 으로 덮어쓸 뿐 버전을 만들지 않고 사용 전문을 바꾸지 않는다(I18 폐지, "다시 계산" 확인창 없음).
  확정된 헤더는 읽기 전용이라 [새 버전(major)]·[새 버전(minor)] 로 DRAFT 를 만든 뒤 고치고, [확정] 은 `dmb/layoutConfirm`(전문·헤더 공용)에서 한다.
  헤더 변경은 확정 apply_from 부터 사용 전문에 반영되고, 확정 화면이 사용 전문별 총 길이 전후(`187 → 190`)와 동시 전환을 알린다.
- 사용 전문 표에 버전·상태 열이 있다. 목록에도 헤더 버전·상태 열이 있다.
- **헤더 이름은 부모 행(버전 없음)이라 DRAFT 저장 때 바로 반영되고 확정 기록에 남지 않는다**(판정 P3-8). 길이·항목 오프셋에는 영향이 없다.
- **EAI 는 버전 대상이 아니다**: 그 EAI 를 쓰는 전문이 있으면 인코딩·패딩 변경을 거부한다. EAI 표준 헤더는 시각 T 해석이고 헤더 확정은
  `TB_MDM_EAI.HEADER_LAYOUT_ID` 를 옮기지 않는다. 표준 헤더가 바뀌는 확정은 `EAI_STANDARD_HEADER_SWITCH` 경고를 확인해야 한다(P3-15·P3-17).
- 헤더 확정 취소가 쌓은 RELEASED 전문 버전의 구간 합성을 깨면 거부하고 사용 전문 목록을 알린다(P3-22).
