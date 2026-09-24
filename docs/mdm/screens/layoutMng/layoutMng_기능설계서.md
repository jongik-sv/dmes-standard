---
screenId: layoutMng
asIsId: 해당 없음 (To-Be only 신규 화면)
moduleId: mdm
moduleGroup: dmb
작성일: 2026-09-24
작성자: Agent
---

# mdm — 전문 레이아웃 기능설계서

> **인용 정본 예외(선례 [DEC-001](../../../ai-build-log/DEC-001_noticeMgmt-on-mls.md) 결정 2, TSK-04-03 D8)**: As-Is 레거시가 없는
> To-Be only 신규 화면이라 설계 산출물을 기능설계서 1종으로 줄였다. 근거는 원천 설계 `docs/mdm/design/basic/03-interface-layout.md`
> (이하 `03`)와 시안 `docs/mdm/design/basic/html/03-interface-layout.html`(이하 `시안`)이다. 구현 설계·테스트는
> [TSK-05-02 design.md](../../tasks/TSK-05-02/design.md) 가 정본이다. 등록 검증 7종 중 #2·#3·#4·#7, 버전·스냅샷·직렬화는
> TSK-05-03 이 이 화면에 더한다.
>
> **Frontend 개발 연계 값** — mesModule `m-mdm` / moduleGroup `dmb` / pageName `layoutMng` / pageId `layoutMng` /
> 페이지 유형 `B` / tsup entry key `pages/dmb/layoutMng/page`

## 1. 화면 개요

| 항목 | 내용 | 근거 |
|---|---|---|
| 화면명 | 전문 레이아웃 | wbs.md TSK-05-02, screens/README §3 |
| 화면 식별자 | `layoutMng` (= OBJECT_ID = serviceId = BPMN process id) | screens/README §5 |
| 모듈 | `mdm` / moduleGroup `dmb`(레이아웃) | design.md D1 |
| 화면 목적 | 전문 = EAI 헤더(적층) + 업무 본문. 헤더를 쌓고 상수만 재정의하며, 본문 항목을 컬럼 사전에서 골라 순서·채움 방식·표현 형식을 정한다. 오프셋·총 길이는 자동 계산이다 | 03 「구조」·「자동 계산과 등록 검증」 |
| 주요 사용자 | 표준 관리자 편집, 담당자 조회 | ADR-0003 D5 |
| 접근 경로 | 포털 → 마루 MDM → 레이아웃 → 전문 레이아웃 | spec entry-point(메뉴 이름), design.md D1 |
| API | `POST /api/mdm/oasis/layoutMng/{search,view,save}` | TRD §3 |
| 파일 | `m-mdm/pages/dmb/layoutMng/page.tsx`, `LayoutMngService.java`, `services/dmb/layoutMng.bpmn` | screens/README §5 |

## 2. 화면 영역

| 영역 | 내용 | testid |
|---|---|---|
| A-FILTER | 검색어·헤더·송신 시스템·수신 시스템 | `layout-search-keyword` |
| A-LIST | 전문 목록 — ID·전문 이름·총 길이·송신→수신·헤더 구성(`이름 (길이) + …`)·본문 항목 수·버전. 없으면 "조회된 전문이 없습니다" | `layout-list`, `layout-list-empty` |
| A-BASIC | 레이아웃 ID·버전(읽기), 전문 이름*, EAI, 송신*·수신* 시스템, 총 길이 계산값 `헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트` | `layout-form-name`, `layout-form-eai`, `layout-form-snd`, `layout-form-rcv`, `layout-total-length` |
| A-STACK | 헤더 구성 — 순서(행 드래그)·헤더·EAI·길이·위치·재정의한 상수·[상수 편집]·[빼기] + [+ 헤더 추가]. **헤더 안 항목의 구성·길이를 바꾸는 입력이 없다** | `layout-header-stack`, `layout-header-add`, `const-edit-open-{seq}` |
| A-BODY | 헤더 요약 줄 `헤더 N — 본문 첫 오프셋 N` + 본문 항목 그리드(순서·항목명·표준 물리명·채움·오프셋·길이·위치·도메인(파생)·설정) + [+ 항목 추가]·[+ FILLER]·[삭제] | `layout-body-summary`, `layout-items`, `layout-item-add-column`, `layout-item-add-filler` |
| A-ITEM-DETAIL | 항목 상세(공용) — 채움 방식·컬럼(읽기)·파생 타입·길이/단위/도메인(읽기)·전송 단위/단위 항목·부호 자리/0 채움/암묵 소수점/표현 자리수·기본값·FILLER 길이·오프셋/길이 | `item-detail-*` |
| POPUP | 헤더 추가(`header-pick-modal`), 상수 편집(`const-edit-modal`), 컬럼 사전 검색(`column-pick-*`) | |

## 3. 데이터·계산 규칙

- **헤더 구성·길이는 전문에서 잠긴다**(수용 기준 3, 불변 I8): `save` 는 헤더 항목을 받는 입력이 없고, 헤더 레이아웃·헤더 항목 행을 쓰지 않는다.
  헤더 길이는 헤더 정의의 `TOTAL_LENGTH` 를 그대로 쓴다.
- **EAI 를 고르면 그 EAI 표준 헤더를 헤더 구성 1번에 넣는다**(I14). 이미 있으면 다시 넣지 않는다. 서버도 같은 규칙을 적용한다.
- **3층 기본값**(03:23, I10): 헤더 템플릿이 기본값을 제안하고, 이 전문이 상수를 확정하며, AUTO 만 송신 시점에 채운다. 상수 편집 표에는
  CONST 항목만 나오고(AUTO·FILLER 제외), 헤더 기본값 칸은 텍스트다. 빈 값은 "재정의 없음"이다. 재정의는 `TB_MDM_LAYOUT_CONST` 에만 쓴다.
  실효값(view `EFFECTIVE_VALUE`) = CONST: 재정의 ?? 헤더 기본값 / AUTO: `(송신 시 채움: 종류)` / DATA·FILLER: 없음.
- **오프셋**: 헤더의 메시지 시작 위치 = 앞 헤더 길이 합, 본문 항목 오프셋 = 메시지 절대값(헤더 합에서 시작), 총 길이 = 헤더 합 + 본문 합(I1~I3).
  M201: 헤더 130(100 + 30) + 본문 57 = 187, 본문 첫 오프셋 130.
- 항목 길이·fill_kind 칸·숫자 표현 형식은 headerMng 기능설계서 §3 과 같다. NUM_FORMAT 문자열은 `SIGN=Y|N;ZERO=Y|N;SCALE=n;WIDTH=n`(design.md D3).
- 편집(추가·삭제·드래그·채움 방식·표현 자리수·FILLER 길이·헤더 쌓기/빼기)은 서버 호출 없이 즉시 다시 계산한다(I11). 저장값은 서버가 다시 계산한다.
- 이 작업의 저장은 업무 버전(`VERSION`)을 올리지 않는다(I17 — 버전·스냅샷은 TSK-05-03).

## 4. 버튼·동작

| 버튼 | 권한 | 동작 |
|---|---|---|
| 조회 | search | `search`(target 생략=LAYOUT) → 목록·시스템·EAI·헤더 |
| 신규 | save | 빈 기본 속성·헤더 구성·본문 |
| 저장 | save | 화면 선검사 → `save`(grid `headers`·`consts`·`items` 셋을 늘 전송) → 토스트 → 재조회·재선택 |
| 목록 행 클릭 | view | 기본 속성·헤더 구성(헤더별 항목·재정의·실효값)·본문 |
| + 헤더 추가 | save | `search target=HEADER` 결과(헤더 항목 포함) 팝업에서 행 클릭. 이미 쌓인 헤더는 목록에서 뺀다 |
| 상수 편집 | (조회 가능) | CONST 항목만, [적용] 은 화면 상태만 바꾼다. 담당자는 읽기 전용으로 연다 |
| + 항목 추가 / + FILLER / 삭제 | save | 컬럼 사전 팝업(`search target=COLUMN`) 선택 또는 FILLER. 화면 상태만 바꾼다 |

## 5. API 요청·응답

| action | 요청 | 응답 `data.result` |
|---|---|---|
| search | params `target`(`LAYOUT`·`HEADER`·`COLUMN`), `keyword`, `headerLayoutId`, `sndSystem`, `rcvSystem` | LAYOUT: `layouts[{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, SND_SYSTEM, RCV_SYSTEM, HEADER_SUMMARY, ITEM_COUNT, TOTAL_LENGTH, LAYOUT_VERSION, VER}]`, `systems`, `eais`, `headers[{LAYOUT_ID, LAYOUT_NAME, TOTAL_LENGTH}]` / HEADER: `headers[{…, EAI_CODE, items[헤더 항목]}]` / COLUMN: headerMng 와 같다 |
| view | params `layoutId` | `layout{…, TOTAL_LENGTH, HEADER_LENGTH, LAYOUT_VERSION, VER}`, `headers[{SEQ, HEADER_LAYOUT_ID, HEADER_NAME, EAI_CODE, TOTAL_LENGTH, OFFSET, items[…, DEFAULT_VALUE, OVERRIDE_VALUE, EFFECTIVE_VALUE]}]`, `items[본문]`, `units` |
| save | params `layoutId?, ver?, layoutName, eaiCode?, sndSystem, rcvSystem`; grid `headers[{SEQ, HEADER_LAYOUT_ID}]`, `consts[{HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE}]`, `items[…]` | `layoutId, ver, totalLength, headerLength` |

OASIS 는 알 수 없는 grid 를 무시한다 — 헤더 항목 grid 를 끼워 보내도 `success=true` 이고 헤더 행은 바뀌지 않는다(Build 실측).

## 6. 거부(메시지 `전문 저장 거부: Lnn[seq] 문구; …`)

L01~L08 은 headerMng 와 같다(본문 항목 기준). 추가로:

| 코드 | 조건 |
|---|---|
| L09 | 헤더 구성: HEADER 가 아닌 레이아웃·없는 헤더·같은 헤더 중복 |
| L10 | 상수 재정의 대상이 이 전문에 쌓인 헤더의 CONST 항목이 아니다(AUTO·DATA·FILLER·없는 순번·쌓이지 않은 헤더) |
| L11 | 전문 이름이 비었다 / 송신·수신 시스템이 없거나 모른다 / EAI 가 없다 / 대상이 전문 레이아웃이 아니다 |
| MDM001 | 동시 수정 |

## 7. 권한

| 기능 | MDM_STD_ADMIN | MDM_STEWARD | SYSADMIN |
|---|---|---|---|
| 조회(search·view)·상수 편집 보기 | O | O | O |
| 저장(save) | O | X | O |

## 8. 알려진 한계·인계

- 등록 거부 #2(값 유효 식)·#3(전송 단위 차원)·#4(자리 용량)·#7(unit_item 대상), 버전 증가·스냅샷·직렬화, `MdmDomainReferenceSpi(LAYOUT_ITEM)`
  는 TSK-05-03 몫이다(design.md D7).
- 헤더를 전문마다 고를지 송수신 시스템으로 자동 정할지는 원천이 미결이다 — 이 화면은 EAI 표준 헤더 자동 부착 + 수동 추가를 한다(F25).

## 9. TSK-05-03 추가 — 등록 검증·샘플 전문·버전·영향도

구현 설계·테스트 정본은 [TSK-05-03 design.md](../../tasks/TSK-05-03/design.md) 다. §8 의 "TSK-05-03 몫" 항목은 이 절로 닫는다.

### 9.1 탭 구성(오른쪽 패널)

| 탭(testid) | 내용 | 액션 |
|---|---|---|
| 편집(`layout-tab-edit`, 기본) | §2 의 05-02 편집 화면 그대로 | search·view·save |
| 등록 검증·샘플 전문(`layout-tab-check`) | 현재 편집 상태로 등록 거부 7종 표(#·거부 조건·코드·결과·메시지) + 본문 DATA 항목 예시 값 → 인코딩 바이트 기준 한 줄(눈금자·구역 색·가운뎃점·구간 표·파싱 결과) | validate·execute(쓰지 않는다) |
| 버전·영향도(`layout-tab-version`) | 버전 이력(버전·저장 일시·저장자·변경·총 길이·전환 방식) + 변경 분류 표(시안 5행) + 스냅샷 미리보기·JSON·엑셀 내려받기 + 영향 전문 목록 | view(versions)·export·search(IMPACT) |

- 전문을 고르지 않았으면 검증·샘플 탭은 안내만 보인다. 영향 전문 목록은 전문 선택과 무관하게 쓴다.
- [신규] 는 편집 탭으로 돌아간다. 목록 선택은 요청을 늘리지 않는다(버전 이력은 view 응답에 실린다). export 는 버전 탭에서 이력 행을 고르거나 탭에 들어갈 때만 부른다.
- 검증·렌더 버튼은 validate·execute 권한(표준 관리자)만 보인다. 담당자는 조회·내려받기만 한다.
- 저장 성공 토스트 문구 `저장했습니다.` 는 그대로다.

### 9.2 액션·요청·응답(행 키 UPPER_SNAKE)

| action | 요청 | 응답(`data.result`) |
|---|---|---|
| search(target=IMPACT) | `keyword` — 컬럼 표준 물리명 또는 도메인 표준명·이름(둘 다 맞으면 합친다) | `impacts[{COLUMN_PHYS, COLUMN_NAME, DOMAIN_NAME, LAYOUT_ID, LAYOUT_NAME, LAYOUT_KIND, SEQ, ITEM("3 코일 두께 (158 / 4)"), SND_RCV("L2 → MES"), USED_BY_COUNT(헤더만), IMPACT}]` — 안 쓰는 컬럼은 `IMPACT="레이아웃에서 쓰지 않는다"` 한 줄 |
| view(추가 키) | 그대로 | `versions[{LAYOUT_VERSION, SAVED_AT(yyyy-MM-dd HH:mm KST), SAVED_BY, TOTAL_LENGTH, SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY}]`(최신부터) |
| save(추가 키) | 그대로 | `layoutVersion, versionCreated, switchMode, changeSummary`. `ver` 는 버전을 올린 뒤의 감사 VER |
| validate | save 와 같은 params, grid `headers`·`consts`·`items` | `checks[{NO, CONDITION, CODE, RESULT(PASS/FAIL/WARN), MESSAGES[]}]`(7행), `otherIssues[{CODE, SEQ, FIELD, MESSAGE}]`, `passed` |
| execute | save 칸 + `sendTime`(yyyyMMddHHmmss, 없으면 서버 KST)·`seq`(없으면 1), grid `headers`·`consts`·`items`·`samples[{COLUMN_PHYS, VALUE}]` | `encoding, totalBytes, line, segments[{INDEX, ZONE, HEADER_SEQ, ZONE_LABEL, SEQ, NAME, COLUMN_PHYS, FILL_KIND, OFFSET, LENGTH, POSITION, TEXT}], parsed[{COLUMN_PHYS, NAME, VALUE}], errors[{SEQ, COLUMN_PHYS, MESSAGE}], issues[]` — 초안 이슈가 있으면 `issues` 만 |
| export | `layoutId`, `layoutVersion`(없으면 최신) | `layoutId, layoutVersion, fileBase("layout-{id}-v{n}"), snapshot(계약 스냅샷), names{물리명: 표시명}`. 버전이 없으면 `스냅샷 출력 거부: L11 저장된 버전이 없습니다` |

headerMng.save 응답에 `versioned[{LAYOUT_ID, LAYOUT_VERSION, SWITCH_MODE, CREATED}]` 가 더해진다(그 헤더를 쌓은 전문마다 버전 기록).

### 9.3 등록 거부 7종(03 원문 순서)과 새 코드

| 행 | 거부 조건 | 코드 | 판정 |
|---|---|---|---|
| 1 | 본문 항목의 컬럼이 컬럼 사전에 없음 | L01 | §6 |
| 2 | CONST 값이 도메인 유효 식 위반 | **L12** | 본문 CONST 기본값·헤더 CONST 기본값(헤더 저장)·전문 상수 재정의 값을 ① 타입 변환 ② 표준식(도메인 화면 판정기) ③ 인코딩 바이트 ≤ 항목 길이로 본다. 판정 불가(CODE·MASTER)는 경고(WARN)이고 저장을 막지 않는다 |
| 3 | 전송 단위의 차원 불일치 | **L13** | 전송 단위가 단위 마스터에 없다 / 도메인 기준 단위가 없다 / 차원이 다르다 |
| 4 | 숫자 표현 자리 부족 | **L14** | 폭 < (정수 자리 + 전송 단위 증가 자리 + 소수 자리 + 소수점 문자 + 부호). 문구 `표현 자리 {w}는 도메인 {이름}(숫자 {p},{s})를 담지 못합니다` |
| 5 | FILLER 가 아닌 항목에 길이 직접 입력 | L02(`FILLER_LENGTH` 칸만) | §6 |
| 6 | trans_unit 과 unit_item 동시 입력 | L05 | §6 |
| 7 | unit_item 이 같은 레이아웃의 항목을 가리키지 않음 | **L15** | 단위 항목이 같은 목록의 다른 항목 물리명이 아니다 |

나머지 L 코드는 표 밖 이슈(`otherIssues`)로 보인다. 저장은 L01~L15 를 모두 모은 뒤 하나라도 있으면 쓰기 전에 거부한다. 헤더 저장도 헤더 항목에 L12~L15 를 건다(`헤더 저장 거부: L12[…] …`).

### 9.4 버전·전환 방식

- 저장해 스냅샷(버전 번호 제외)이 바뀌면 새 버전 = max(최신 이력, 현재 버전) + 1, 같으면 만들지 않는다. 최초 1. 헤더를 저장하면 그 헤더를 쌓은 전문마다 같은 규칙. 배포는 하지 않는다.
- 전환 방식: 여분(FILLER) 안에 항목을 쪼개 넣기·CONST 값·기본 속성만 바뀌면 **순차 전환**, 항목 길이·순서·헤더 구성·형식(타입·숫자 형식·단위·인코딩)·삽입·삭제·총 길이가 바뀌면 **동시 전환**. 최초 등록은 `-`.
- 변경 요약 예: `여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)`, `상수 송신공정구분 L2 → L3`, `헤더 구성 변경`.

### 9.5 샘플 전문 표시 규칙

숫자는 왼쪽 0(형식이 공백 채움이면 왼쪽 공백), 문자는 오른쪽 공백, 공백은 `·` 로 보인다. 구역 색은 첫째 헤더·둘째 헤더·본문·FILLER 네 가지(셋째 헤더부터 앞 두 색을 돌려 쓴다). 구간에 마우스를 올리면 `{구역} {이름} {위치}`(1부터, 길이 1이면 한 숫자). 넘치는 값·인코딩이 담지 못하는 문자는 잘라내지 않고 그 칸을 `#` 로 채운 뒤 항목 오류로 보인다. AUTO 는 SEND_TIME(항목 길이 14·8·6 → `yyyyMMddHHmmss`·`yyyyMMdd`·`HHmmss`)·MSG_LENGTH(전문 총 길이)·SEQ·LAYOUT_ID(대리키)로 채운다.

### 9.6 testid(추가)

탭 `layout-tab-edit`·`layout-tab-check`·`layout-tab-version` / 검증 `layout-check-run`·`layout-check-table`·`layout-check-row-{n}`·`layout-check-result-{n}`·`layout-check-message-{n}`·`layout-check-other` / 샘플 `sample-input-{COLUMN_PHYS}`·`sample-render`·`sample-ruler`·`sample-line`·`sample-seg-{index}`(`data-zone`, `title`)·`sample-length`·`sample-segments`·`sample-parsed-{COLUMN_PHYS}`·`sample-errors` / 버전 `version-list`·`version-list-empty`·`change-class-table`·`snapshot-preview`·`snapshot-download-json`·`snapshot-download-excel` / 영향도 `impact-keyword`·`impact-search`·`impact-list`·`impact-list-empty`.

### 9.7 권한(추가)

| 기능 | MDM_STD_ADMIN | MDM_STEWARD | SYSADMIN |
|---|---|---|---|
| 등록 검증(validate)·샘플 렌더(execute) | O | X | O |
| 버전 이력 보기·스냅샷 내려받기(export)·영향 전문(search) | O | O | O |

새 권한 시드는 없다 — validate·execute 는 PERM_MDM_EDIT, export·search 는 PERM_MDM_READ 에 이미 있다.
