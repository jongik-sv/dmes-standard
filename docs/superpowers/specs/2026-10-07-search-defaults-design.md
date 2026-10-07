# 조회 조건 칸별 사용자 기본값 — 1단계 설계

- 작성: 2026-10-07, 레인 search-defaults(회차 notice-fill2), 브랜치 `feat/search-defaults`
- 상태: 설계안(사용자 확인 대기). 이 문서는 설계까지이며 제품 코드는 바꾸지 않았다.
- 관련: `2026-10-06-popout-carry-state-design.md`(탭 이어받기), `2026-10-02-widget-foundation-design.md` §4(사용자 개인 테이블 선례), shared 그리드 개인화(`grid-personalize.ts`)

## 0. 목표와 범위

고객 요청은 「사용자별 업무에 맞는 조회조건을 기본값으로 설정하여 조건 입력 실수·누락 방지」다. 이번 단계에서는 다음을 만든다.

- 사용자가 조회 칸마다 기본값 규칙을 직접 정한다. 규칙 종류는 고정 값, 상대 날짜, 마지막 조회값이고, 기간(From~To)은 한 줄에서 함께 정한다.
- 화면을 열면 규칙으로 계산한 값이 조회 칸에 들어간다. 마운트 때 자동 조회하는 화면은 기본값이 들어간 뒤에 조회한다.
- 설정은 조회 영역 오른쪽 위의 설정 아이콘에서 연다. 모습과 조작감은 그리드 설정(`GridSettingsMenu`·`GridSettingsOverlay`)과 맞춘다.
- 모든 화면에 적용한다. 기존 화면은 shared `SearchArea`·`SearchField` 확장만으로 혜택을 받게 하고, 그렇게 되지 않는 화면은 최소 수정 목록으로 관리한다. 새 화면은 표준 사용법만 따르면 기능이 켜진다.

이번 범위가 아닌 것(확장 여지만 둔다):

- 관리자가 사용자·부서·역할별로 정하는 기본값 배포, 공정 자동 입력, 선택 제한·값 고정.
- MDM 표준 용어(meta) 단위로 여러 화면에 함께 적용되는 공통 기본값.
- 조업일 기준 시각(예: 08:00 이전은 전일로 본다) 같은 업무 달력 규칙.

## 1. 현황 집계 (2026-10-07, dev 09952ba5)

조사 방법: sonnet/medium agent 하나가 `src/frontend/m-*` 를 grep 과 대표 화면 열람으로 훑었다. 화면별 표는 부록 A 에 있다.

### 1.1 규모

| 모듈 | SearchArea 화면 | SearchField 칸 |
|---|---|---|
| m-mcm | 18 (page 17 + `WidgetListTab` 1) | 55 |
| m-mdm | 12 | 34 |
| m-mls | 1 (`noticeMgmt`) | 6 |
| 실화면 합계 | 31 | 95 |
| m-design-dummy (참고) | 7 | 23 |
| m-mpn·m-mpp·m-mqc·m-analog | 0 | 0 |

- 지시서의 「약 42개」 는 실화면 31개, 데모 7개, SearchArea 없이 조회 칸을 직접 그린 m-mdm 확정 대기 화면 4개(`codeConfirm`·`ruleConfirm`·`layoutConfirm`·`ruleSetConfirm`)를 합친 수와 같다.
- 실화면 31개는 모두 `<SearchArea onSearch=…>` 를 쓴다.

### 1.2 칸 형식 (실화면 95칸)

| 형식 | 칸 수 | 비고 |
|---|---|---|
| `type="text"` | 34 | |
| `type="select"` | 22 | |
| `type="radio"` | 0 | 데모에만 4칸 |
| children(직접 그린 칸) | 39 | 아래 표 |

children 칸 39개의 내역은 다음과 같다.

| 부품 | 칸 수 | 화면 |
|---|---|---|
| shared `Input` | 13 | m-mdm 8개 화면 |
| shared `Select` | 6 | m-mdm 5개 화면 |
| shared `DatePicker` | 4 | `screenUsageStat`, `noticeMgmt` (둘 다 `label="~"` 짝) |
| `IdPicker`(마루 코드·데이터 선택 팝업) | 2 | `codeItemEdit`, `dataItemMng` |
| `Checkbox` | 1 | `codeItemEdit` |
| 원시 `<input>`·`<button>`·조건 행 | 13 | `masterRuleData`·`masterRuleDataList`·`masterRuleFrame` (팝업 결과 표시와 돋보기 버튼) |

`ComboBox`·코드 콤보·날짜 범위 전용 부품은 조회 영역에서 한 번도 쓰이지 않는다.

### 1.3 칸 식별자

| 상태 | 칸 수 |
|---|---|
| `name` 있음 | 70 (그중 `meta` 문자열 8, `meta={false}` 19) |
| `name` 없음, `label` 만 있음 | 25 |

- `name` 은 MDM 컬럼 사전 키이고 화면 상태의 키와 다를 수 있다(예: `commObjMng` 의 상태 키 `edt_OBJECT_ID`, `name="OBJECT_ID"`).
- `label` 은 한 화면 안에서도 겹친다(`&nbsp;` 버튼 칸, `~` 칸).

### 1.4 상태 관리·자동 조회·초기화

| 패턴 | 설명 | 화면 수 |
|---|---|---|
| A | `useCarryState("filters", DEFAULT)` 객체 하나, 칸 변경은 `setFilters((p) => ({ ...p, k: v }))` | 22 |
| B | 칸마다 `useCarryState` | 6 |
| C | 일반 `useState` | 3 |

- 칸의 `onChange` 는 모두 함수형 갱신이거나 setter 를 그대로 넘긴다. `setX({ ...x, k: v })` 처럼 지난 상태를 복사하는 꼴은 실화면에서 0건이다(grep 확인). 부작용이 있는 `onChange` 도 없다.
- 마운트 때 자동 조회하는 화면은 12개다: `masterCategoryMng`, `masterCodeMng`, `masterRuleList`, `commMenuMng`, `commObjMng`, `commPermMng`, `commRoleGrpMng`, `commRoleMng`, `commUserMng`, `commUserRoleCopy`, `mdmCacheMng`, `noticeMgmt`.
- m-mdm 목록 화면들은 「첫 진입 자동 조회 없음」 정책이다(2026-10-02 사용자 요청).
- 조회 조건 초기화 버튼은 m-mcm 5개 화면에만 있다(`id: "btn_reset"`, 본문은 `setFilters(DEFAULT_FILTERS)`): `commMenuMng`, `commObjMng`, `commPermMng`, `commRoleGrpMng`, `commRoleMng`. `commUserMng` 은 `handleReset` 함수만 있고 버튼에 연결돼 있지 않다. `btn_reset` id 를 다른 뜻(행 변경 취소 등)으로 쓰는 화면은 없다(grep 확인).
- 날짜 칸 초기값은 `screenUsageStat` 이 「오늘-30일 ~ 오늘」, `noticeMgmt` 가 빈 값이다.
- `codeMng`·`dataMng` 는 handoff(다른 화면에서 넘어옴)로 열리면 조건을 비우고 조회한다.

### 1.5 확인한 shared 사실

- `SearchField` 는 값을 갖지 않는 제어 컴포넌트다. children 을 주면 `type`·`value`·`onChange` 는 쓰이지 않는다.
- 화면 키 `pageId` 는 `{moduleId}:{componentPath}` 이고 `useTabPage()` 로 얻는다. 분리 창(`PortalPageWindow`)도 같은 값을 쓴다. 그리드 개인화의 `screenKey` 도 이 값이다.
- 포털 탭은 전환할 때 언마운트되지 않는다(`display` 만 바꾼다). 화면은 탭을 열 때와 브라우저를 새로 고칠 때만 마운트된다.
- 최근 입력값(`search-history-store`)은 `pageId` 가 `mpn:` 으로 시작하는 화면에서만 켜지는데, m-mpn 에는 SearchArea 화면이 없어 지금은 실제로 쓰이지 않는다. 저장 시점은 `search-history-bus` 의 「실제 조회」 이벤트다.
- MCM 의 사용자 개인 테이블(즐겨찾기·시작 화면·위젯)은 mcm-core 엔티티(스키마 `MCMAPUSER`)와 OASIS BPMN 서비스로 만들고, Flyway 마이그레이션 없이 로컬은 `ddl-auto: update`, 개발계·운영계는 dbml·tables 문서 등재 후 사전 생성한다.

## 2. 결정 요약과 사용자 결정 항목

| # | 항목 | 선택지 | 추천안 | 근거 절 |
|---|---|---|---|---|
| D1 | 저장 위치 | A 서버 DB + 브라우저 거울 / B localStorage 만 | **A** | §5 |
| D2 | 스키마 관리 | A 위젯·즐겨찾기 선례(ddl-auto + dbml 등재, Flyway 없음) / B 이 테이블만 Flyway 도입 | **A** | §5.2 |
| D3 | 칸 식별 키 | A 새 prop `defaultKey`, 없으면 `name` / B `name` 만 / C `label` 까지 허용 | **A** | §3 |
| D4 | 초기화 버튼 동작 | A 사용자 기본값으로 되돌림 / B 코드 기본값으로 되돌림 | **A** | §6.6 |
| D5 | 마지막 조회값 저장 | A PC별 localStorage / B 서버 | **A** | §4.4 |
| D6 | SearchArea 를 안 쓰는 확정 대기 4화면 | A 이번 범위에서 제외 / B SearchArea 로 바꿔 포함 | **A** | §7.4 |
| D7 | 화면 키 | A `pageId` 그대로(그리드 개인화와 같음) / B `{moduleId}:{OBJECT_ID}` 로 정규화 | **A** | §3.1 |

사용자에게 확인받을 것: D1~D7 추천안을 한꺼번에 승인하는지, 특히 D1(서버 저장)으로 백엔드 레인이 하나 늘어나는 것을 받아들이는지.

## 3. 칸 식별

### 3.1 저장 키

저장 키는 `(사용자, pageId, fieldKey)` 다.

- `pageId`: `useTabPage().pageId`. 그리드 개인화와 같은 키라서, 메뉴를 다시 등록해 `componentPath` 가 바뀌면 두 기능의 저장값이 함께 끊긴다. 동작이 한 가지라 설명하기 쉽다(D7). 포털 밖(`pageId` 가 빈 값)에서는 기능을 끈다.
- `fieldKey`: `defaultKey ?? name`. 둘 다 없으면 그 칸은 기본값 대상이 아니다(D3).
  - `name` 을 그대로 쓰면 70칸이 화면 수정 없이 대상이 된다.
  - `name` 이 없는 칸에 `name` 을 새로 달면 MDM 툴팁 동작까지 바뀐다(사전에 없는 이름은 흐린 글자 툴팁). 그래서 툴팁과 무관한 `defaultKey` 를 따로 둔다.
  - `label` 은 쓰지 않는다. 한글 문구가 바뀌면 키가 끊기고, `&nbsp;`·`~` 는 한 화면 안에서 겹친다.
- 기간의 To 칸: SearchArea 가 `label="~"` 칸을 앞 칸과 짝으로 묶을 때 짝 정보(From 칸의 키)를 컨텍스트로 넘긴다. To 칸에 자기 키가 없으면 `{From 키}~to` 를 쓴다. 기존 기간 칸 2쌍은 수정 없이 키를 얻는다.
- 한 SearchArea 안에서 같은 `fieldKey` 가 두 번 등록되면 개발 모드에서 경고하고 나중 칸을 대상에서 뺀다.
- 한 화면에 SearchArea 가 둘 이상이면(탭마다 조회 영역이 있는 화면) 두 번째부터 `defaultsScope="{이름}"` 을 준다. 저장 키는 `{defaultsScope}.{fieldKey}` 가 된다. 주지 않으면 같은 `pageId` 의 칸끼리 키가 겹칠 수 있다.

### 3.2 meta 의 역할

- MDM 표준 용어(`meta`, 없으면 `name`)는 저장 키가 아니라 속성(`FIELD_META`)으로 함께 저장한다.
- 나중에 관리자가 「공정」 처럼 여러 화면에 걸친 규칙을 만들 때 이 속성으로 칸을 찾는다. 이번 단계에서는 읽지 않는다.
- 나중의 우선순위(참고): 관리자 고정 > 사용자 화면별 기본값 > 관리자 배포 기본값(meta 단위) > 코드 기본값.

## 4. 규칙 모델

### 4.1 값 종류와 쓸 수 있는 규칙

칸의 값 종류는 `SearchField` 의 `type` 으로 정한다(§7.2 에서 `type="date"` 를 더한다).

| 값 종류 | 사용 안 함 | 고정 값 | 상대 날짜 | 마지막 조회값 |
|---|---|---|---|---|
| text | ○ | ○ | | ○ |
| select·radio | ○ | ○ (선택지 중 하나, `""`=전체 포함) | | ○ |
| date | ○ | ○ | ○ | ○ |

### 4.2 규칙 표현 (JSON, 칸 하나당 하나)

```ts
type SearchDefaultRule =
  | { kind: "fixed"; value: string }
  | { kind: "relative"; base: "today" | "monthStart" | "monthEnd"; months?: number; days?: number }
  | { kind: "last" };
// "사용 안 함" 은 규칙을 저장하지 않는 것으로 표현한다(행 없음).
```

- 규칙에는 판 번호를 두지 않는다. 모르는 `kind` 를 만나면 그 칸은 규칙이 없는 것으로 보고 개발 모드에서 경고한다.
- 고정 값이 지금 선택지에 없으면(코드가 폐기됨) 넣지 않는다. 설정 창은 그 행에 「선택지에 없는 값」 표시를 한다.

### 4.3 상대 날짜

설정 창은 아래 이름표를 제공하고, 저장은 §4.2 의 `base`·`months`·`days` 조합으로 한다.

| 이름표 | 저장값 |
|---|---|
| 당일 | `{ base: "today" }` |
| 전일 | `{ base: "today", days: -1 }` |
| N일 전 / N일 후 | `{ base: "today", days: -N }` / `{ days: N }` (N 은 0~366) |
| 당월 1일 | `{ base: "monthStart" }` |
| 당월 말일 | `{ base: "monthEnd" }` |
| 전월 1일 | `{ base: "monthStart", months: -1 }` |
| 전월 말일 | `{ base: "monthEnd", months: -1 }` |
| N개월 전 같은 날 | `{ base: "today", months: -N }` |

계산 순서는 다음과 같다.

1. 기준일은 브라우저 지역 시각의 오늘이다. shared `today()` 를 쓰고 UTC 기반 `toISOString()` 은 쓰지 않는다(자정 전후 하루가 밀리는 결함을 피한다). 운영 PC 는 Asia/Seoul 이다.
2. 기준일이 속한 달을 `months` 만큼 옮긴다(1월에서 -1 이면 전년 12월).
3. `base` 로 날을 정한다. `today` 는 기준일의 날을 쓰되 옮긴 달의 말일을 넘으면 말일로 줄인다(3월 31일에서 -1개월은 2월 28일, 윤년은 29일). `monthStart` 는 1일, `monthEnd` 는 그 달 말일이다.
4. `days` 를 더한다(달·해 경계를 넘을 수 있다).
5. `YYYY-MM-DD` 로 만든다. shared `DatePicker` 의 값 형식과 같다.

계산 함수는 shared 의 순수 함수(`resolveSearchDefault(rule, now)`)로 두고 `now` 를 인자로 받아 시험한다.

### 4.4 기간(From~To)

- 저장은 칸 단위다. From 칸과 To 칸이 각각 규칙을 갖는다. 「한 번에 정하기」 는 설정 창이 한 줄에 두 칸을 함께 보여 주고 묶음 선택지로 두 규칙을 한꺼번에 채우는 방식으로 한다.
- 묶음 선택지: 당일~당일, 전일~전일, 최근 7일(6일 전~당일), 최근 30일(29일 전~당일), 당월(1일~당일), 당월 전체(1일~말일), 전월 전체(전월 1일~전월 말일).
- 계산한 From 이 To 보다 늦으면 두 값을 넣지 않고(코드 기본값 유지) 개발 모드에서 경고한다. 설정 창도 저장할 때 같은 검사를 한다.

### 4.5 마지막 조회값

- 사용자가 실제로 조회한 순간의 값을 저장한다. 시점은 최근 입력값과 같이 `search-history-bus` 의 `emitSearch(pageId)` 다(조회 버튼, Enter). 자동 조회(§6.4)는 사용자가 한 조회가 아니므로 저장하지 않는다.
- 저장소: localStorage `dmes:search-last:v1:{userId}:{pageId}` = `{ [fieldKey]: value }`. 한 화면에 키 하나이고, 규칙이 `last` 가 아닌 칸도 함께 적는다. 그래야 나중에 규칙을 「마지막 조회값」 으로 바꾸었을 때 바로 값이 있다.
- 서버에 두지 않는 이유(D5): 조회할 때마다 서버에 쓰는 비용이 생기고, 마지막 값은 그 PC 에서 하던 일의 연속이라는 성격이 강하다.
- 최근 입력값과의 관계: 최근 입력값은 텍스트 칸의 「최근 8개 목록」 드롭다운(APS 전용)이고, 마지막 조회값은 「칸마다 하나」 이며 모든 화면·값 종류에 쓴다. 저장 키와 저장소는 따로 두고 같은 이벤트를 구독한다. 둘을 합치는 일은 이번 범위가 아니다.

## 5. 저장 위치 (D1 추천: 서버 DB + 브라우저 거울)

### 5.1 판정 근거

| 기준 | 서버 + 거울 | localStorage 만 |
|---|---|---|
| PC 를 옮겨도 유지 | ○. 현장 공용 PC 와 사무 PC 를 오가는 사용자에게 필요하다 | ✕. PC 마다 다시 정해야 한다 |
| 관리자 배포로 확장 | 같은 서비스에 정책 테이블만 더한다 | 서버로 옮기는 이전 작업이 생긴다 |
| 첫 렌더 때 동기로 읽기 | 거울이 있으면 ○, 그 PC 의 첫 사용이면 서버 응답을 기다린다(§6.3) | ○ |
| 구현 크기 | 백엔드 레인 하나(S~M) 추가 | 작다 |
| 선례 | 위젯·즐겨찾기·시작 화면 | 그리드 개인화 |

기본값은 「업무에 맞춘 사용자 설정」 이라 PC 가 아니라 사람을 따라가야 한다. 그리드 열 너비처럼 화면 크기에 묶인 설정과 성격이 다르다. 그래서 서버 저장을 추천한다.

### 5.2 테이블 (mcm-core, 스키마 `MCMAPUSER`, 감사 컬럼은 `McmAuditEntity` 9컬럼)

**`TB_MCM_SEC_USER_SRCH_DFLT`** — 사용자 조회 칸 기본값

| 컬럼 | 형 | 설명 |
|---|---|---|
| `USER_ID` (PK) | VARCHAR(30) | 인증 컨텍스트 사용자 |
| `PAGE_ID` (PK) | VARCHAR(200) | `pageId` |
| `FIELD_KEY` (PK) | VARCHAR(100) | §3.1 의 `fieldKey` |
| `RULE_JSON` | VARCHAR(1000) | §4.2 규칙. 세 방언에서 같은 형을 쓰려고 LOB 대신 문자열로 둔다 |
| `FIELD_META` | VARCHAR(50) | MDM 표준 용어. 없으면 NULL(§3.2) |
| `FIELD_LABEL` | VARCHAR(100) | 저장할 때의 라벨. 나중에 관리 화면에서 사람이 알아보는 용도 |

- 위젯 설계 §4.1 과 같이 관리한다(D2). 로컬 SQLite 는 `ddl-auto: update` 로 생기고, 개발계·운영계(Oracle·PostgreSQL)는 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 등재해 사전 생성한다. MCM 사용자 개인 테이블에는 Flyway 를 두지 않는 것이 선례다. 지시서의 「Flyway 개요」 요구와 다르므로 결정 항목으로 올렸다.
- 관리자 배포를 넣을 때는 이 테이블을 넓히지 않고 정책 테이블(가칭 `TB_MCM_SRCH_DFLT_POLICY`: 범위 종류·범위 ID·`PAGE_ID` 또는 `FIELD_META`·`FIELD_KEY`·`RULE_JSON`·잠금 종류)을 따로 둔다. 사용자 테이블의 의미가 「내가 정한 값」 하나로 유지된다.

### 5.3 서비스 (OASIS `secSrchDflt`, `/api/mcm/oasis/secSrchDflt/{action}`)

| action | 입력 | 동작 |
|---|---|---|
| `search` | 없음 | 사용자의 모든 행을 돌려준다(미리 받기용) |
| `savePage` | `pageId`, 행 목록(`fieldKey`·`ruleJson`·`fieldMeta`·`fieldLabel`) | 그 화면의 행을 통째로 바꾼다(지우고 다시 넣기, 한 트랜잭션) |
| `resetPage` | `pageId` | 그 화면의 행을 지운다 |

- `userId` 는 즐겨찾기·위젯처럼 인증 컨텍스트 값으로 강제로 바꾼다(IDOR 방지).
- 서버 검사: `ruleJson` 이 JSON 이고 `kind` 가 세 가지 중 하나인지, `months`·`days` 가 정수이고 범위(±120개월, ±3660일) 안인지, 화면당 행 50개 이하인지. 위반하면 `BusinessException(ErrorCode.INVALID_VALUE, 메시지)` 로 거절한다.
- 서비스 클래스에는 `@Transactional` 을 붙이지 않고 교체의 원자성은 별도 쓰기 빈에서 확보한다(위젯 `SecWidgetTabWriter` 와 같은 방식).
- 두 PC 에서 같은 화면을 저장하면 나중 저장이 이긴다.

### 5.4 브라우저 쪽 저장소 (`search-defaults-store.ts`)

- shared 의 모듈 단일 인스턴스를 `globalThis` 에 캐시한다(tsup entry 분리 때문에 인스턴스가 겹치는 함정, `search-history-bus` 와 같은 처리).
- 거울: localStorage `dmes:search-dflt:v1:{userId}` = `{ [pageId]: { [fieldKey]: rule } }`.
- 상태: `idle` → `ready(mirror)` → `ready(server)`. 거울이 없으면 `loading` 을 거친다. 서버 실패는 `ready(mirror)` 또는 `ready(empty)` 로 끝내고 콘솔에만 남긴다(기본값이 안 들어갈 뿐 화면은 동작한다).
- 미리 받기: 포털 셸이 사용자를 확인한 직후 `preloadSearchDefaults(userId)` 를 한 번 부른다. 분리 창은 처음 SearchArea 가 마운트될 때 부른다.
- 서버 응답이 거울과 달라도 이미 마운트된 화면에는 다시 넣지 않는다(값이 갑자기 바뀌는 일을 막는다). 다음에 여는 화면부터 새 값을 쓴다.
- 사용자가 바뀌면(`subscribeCurrentUser`) 메모리 캐시를 비우고 새로 받는다.

## 6. 적용 시점

### 6.1 구조: SearchArea 등록소

- `SearchArea` 가 컨텍스트로 등록소를 내려준다. 각 `SearchField` 는 대상이 될 때(§7.1) 다음을 등록한다: `fieldKey`, 값 종류, `label`, `meta`, 선택지, 지금 값 읽기, 값 넣기(지금의 `onChange` 를 ref 로 부른다), 짝 정보.
- 등록은 `useIsomorphicLayoutEffect` 에서 하고 ref 는 렌더마다 갱신한다. 렌더 횟수는 늘지 않는다(carry 등록소와 같은 방식).
- children 을 들여다보지 않는다. Fragment·조건부 칸 안쪽에 있어도 등록이 된다.

### 6.2 넣는 순서 (마운트 1회)

1. 생략 조건을 본다. 다음 중 하나면 넣지 않는다.
   - `SearchArea defaults={false}`(화면 단위 끄기).
   - `useCarryRestored()` 가 true(분리 창이 원래 탭의 값으로 시작함).
   - `pageId` 나 사용자 ID 가 없다.
2. 저장소가 `ready` 면 바로, `loading` 이면 준비될 때까지 기다렸다가 넣는다. 기다리는 한도는 1.5초이고, 넘으면 넣지 않고 끝낸다.
3. SearchArea 의 layout effect(자식 칸들의 등록이 끝난 뒤 같은 커밋)에서 규칙이 있는 칸마다 값을 계산해 `onChange(값)` 을 부른다. 지금 값과 같으면 부르지 않는다.
4. 다시 넣지 않는다. 다음 커밋에서 칸 값이 계산값과 다르면 개발 모드에서만 경고한다(「조회 칸 onChange 가 함수형 갱신이 아니어서 앞 칸 값이 사라졌을 수 있다」).
   - 다시 넣기를 하지 않는 이유: handoff·화면 문맥처럼 화면 effect 가 `setKeyword("")` 등으로 직접 정한 값은 SearchField 의 `onChange` 를 거치지 않아 「고친 칸」 으로 표시되지 않는다. 다시 넣기를 하면 그 값을 사용자 기본값으로 덮어 §6.3 의 우선순위가 깨진다.
   - 여러 칸을 한 번에 넣어도 값이 사라지지 않으려면 `onChange` 가 함수형 갱신이어야 한다. 지금 실화면은 모두 그렇다(§1.4). 이 조건은 가이드 규칙과 스킬의 흔한 실수에 넣는다(§9).
5. 끝나면 「적용 완료」 로 표시한다. 그 뒤 처음 등록되는 칸(탭 안의 조건부 칸)은 등록할 때 한 번 넣는다.

- 기다리는 동안 사용자가 고친 칸(SearchField 가 감싼 `onChange` 로 판정)은 넣지 않는다.
- layout effect 에서 넣으므로 첫 화면에 코드 기본값이 잠깐 보였다가 바뀌는 깜빡임이 없다. 거울이 없는 첫 사용 PC 에서만 서버 응답 뒤에 값이 바뀐다.

### 6.3 우선순위

carry 복원 > handoff 등 화면의 명시 동작 > 사용자 기본값 > 코드 기본값

- carry 복원은 §6.2 의 1단계에서 넣지 않는 것으로 지킨다.
- handoff(`codeMng`·`dataMng`)는 화면의 passive effect 에서 조건을 비우고 조회한다. 사용자 기본값은 그보다 먼저(layout effect) 들어가므로 handoff 가 덮어쓴다. 구현 레인이 두 화면에서 이 순서를 시험으로 확인한다.
- 다만 그 PC 에 사본이 없어 서버 응답을 기다린 뒤 넣는 경우에는 넣기가 handoff 보다 늦다. 등록 때 값과 달라진 칸은 넣지 않지만, handoff 가 코드 기본값과 같은 값(빈 값)으로 비우면 값만으로 구별할 수 없다. 그래서 늦게 넣을 때 `defaults` 를 다시 읽는다. handoff 로 조건을 정하는 화면은 handoff 때 `<SearchArea defaults={!handoffActive}>` 로 넣기를 막는다(구현 2026-10-07, 단계 3 이 codeMng·dataMng 에 적용).

### 6.4 첫 자동 조회

마운트 effect 에서 바로 조회하는 화면은 사용자 기본값이 빠진 채 조회한다. React 는 자식 effect 를 부모 effect 보다 먼저 돌리지만, 부모 effect 는 첫 렌더 때의 상태를 잡고 있다. layout effect 에서 넣어도, 동기 재렌더 전에 앞 커밋의 passive effect 가 먼저 실행되므로 결과는 같다. 그래서 칸에는 기본값이 보이는데 목록은 코드 기본값으로 조회된 상태가 된다.

해결: `SearchArea` 에 `autoSearch` prop 을 둔다.

```tsx
<SearchArea onSearch={handleSearch} autoSearch>
```

- §6.2 가 끝난 뒤(넣을 것이 없거나 생략 조건이어도 끝난 것으로 본다) 다음 커밋의 effect 에서 `onSearch` 를 한 번 부른다. 그 커밋의 `onSearch` 는 새 상태를 잡고 있다.
- `useCarryRestored()` 가 true 면 부르지 않는다(화면의 `useCarryRefetch` 가 맡는다).
- 자동 조회는 `emitSearch` 를 내지 않는다(최근 입력값·마지막 조회값에 남기지 않는다).
- 자동 조회 12개 화면은 마운트 조회 effect 를 지우고 `autoSearch` 를 단다(§7.3). **이 수정이 들어가기 전에는 사용자가 기본값을 저장할 수 없어야 한다**(설정 UI 레인을 이 레인 뒤에 머지한다, §10).

### 6.5 탭·새로 고침

- 탭 전환은 마운트가 아니므로 다시 넣지 않는다. 사용자가 바꾼 조건이 유지된다.
- 브라우저를 새로 고치면 탭 화면이 다시 마운트되어 기본값이 다시 들어간다. 새로 연 것과 같다.

### 6.6 초기화 버튼 (D4 추천: 사용자 기본값으로)

- `PageButton` 에 `resetsSearch?: boolean` 을 더한다. 생략하면 `id === "btn_reset"` 일 때 true 로 본다(초기화 버튼 5개가 모두 이 id 이고 다른 뜻으로 쓰는 곳은 없다).
- `PageLayout` 은 그 버튼의 `onClick` 을 부른 직후 `emitSearchReset(pageId)` 를 낸다. SearchArea 는 이 이벤트를 받아 §6.2 의 3~4단계를 다시 한다.
- 같은 클릭 안에서 화면의 `setFilters(DEFAULT)` 와 기본값 넣기가 순서대로 묶여 처리되므로 결과는 「코드 기본값 위에 사용자 기본값」 이다. 화면 수정은 없다.
- 「마지막 조회값」 규칙인 칸은 초기화 때 넣지 않고 코드 기본값으로 둔다. 초기화는 조건을 비우려는 동작이기 때문이다.

## 7. 기존 화면 하위 호환과 이전

### 7.1 대상 칸 판정

| 조건 | 대상 여부 |
|---|---|
| 내장 입력(`type` text·select·radio·date), `fieldKey` 있음 | 대상 |
| children 칸, `SearchField` 에 `value`·`onChange` 를 함께 줌, `fieldKey` 있음 | 대상(§7.2) |
| children 칸, `SearchField` 에 `value`·`onChange` 없음 | 대상 아님(지금 동작 그대로) |
| `fieldKey` 없음 | 대상 아님 |
| `defaultable={false}` | 대상 아님 |

새 prop 은 모두 선택이고 기본값에서 지금 DOM·동작이 바뀌지 않는다. 바뀌는 것은 「등록된 칸이 하나라도 있으면 조회 영역 오른쪽 위에 설정 아이콘이 생긴다」 하나다.

### 7.2 SearchField 확장

| prop | 형 | 설명 |
|---|---|---|
| `type` | `"text" \| "select" \| "radio" \| "date"` | `"date"` 추가: 내장 입력으로 shared `DatePicker` 를 그린다. children 이 있으면 그리기는 children 에 맡기고 `type` 은 값 종류로만 쓴다 |
| `defaultKey` | `string` | 기본값 저장 키. 없으면 `name` |
| `defaultable` | `boolean` | `false` 면 이 칸은 기본값 대상이 아니다. 기본 `true` |

- children 칸의 묶기: `<SearchField label="기간" name="postStartDt" type="date" value={f.from} onChange={setFrom}><DatePicker … /></SearchField>` 처럼 SearchField 에도 같은 `value`·`onChange` 를 준다. 그리기와 e2e 의 `data-testid` 는 children 이 그대로 맡는다.
- 새 화면 표준: 날짜 칸은 `type="date"` 내장 입력을 쓰고, 기간은 `type="date"` 두 칸을 `label="~"` 짝으로 쓴다.
- `SearchArea` 확장: `defaults?: boolean`(기본 `true`), `autoSearch?: boolean`(기본 `false`), `defaultsScope?: string`(§3.1).

### 7.3 화면 수정 목록

**수정 없이 혜택(마운트 자동 조회가 없고 내장 입력에 `name` 있음)**: `masterCodeMngList`, `commSyncMng`, `domainMng`, `termMng`, `unitMng`(1칸), `layoutMng`(select 3칸), `ruleMng`(select 2칸), `screenUsageStat`(텍스트 4칸), `WidgetListTab`(클라이언트 필터 화면, 구현 레인이 동작 확인).

**최소 수정 ①: 자동 조회 12개 화면**: 마운트 조회 effect 를 지우고 `autoSearch` 를 단다. 화면마다 3~6줄이다. 같은 effect 에서 콤보 목록을 받는 등 다른 일을 하면 그 부분은 남긴다.
`masterCategoryMng`, `masterCodeMng`, `masterRuleList`, `commMenuMng`, `commObjMng`, `commPermMng`, `commRoleGrpMng`, `commRoleMng`, `commUserMng`, `commUserRoleCopy`, `mdmCacheMng`, `noticeMgmt`

**최소 수정 ②: children 칸 묶기**: SearchField 에 `value`·`onChange`(·`type`·`options`)를 더한다. 칸마다 1~3줄이다.
- `Input`·`Select` 19칸: `columnMng`, `headerMng`, `layoutMng`, `codeMng`, `dataMng`, `ruleMng`, `ruleSetMng`, `dataItemMng`
- `DatePicker` 4칸(2쌍): `screenUsageStat`, `noticeMgmt`. `type="date"` 를 함께 준다.

**최소 수정 ③: 키 없는 칸**: 대상으로 삼을 칸에 `defaultKey` 를 단다. `unitMng` 「검색어」, `dataItemMng` 의 입력 4칸, `ruleSetMng` 2칸, `columnMng` 1칸 등이다. 정확한 목록은 구현 레인이 grep 으로 다시 뽑는다.

**대상 아님(그대로 둔다)**: `IdPicker` 칸, 팝업 결과를 보여 주는 읽기 전용 칸과 돋보기 버튼, `Checkbox` 칸, 조건 행(`masterRuleData`·`masterRuleDataList`·`masterRuleFrame`), `codeItemEdit`(handoff 로 고른 코드가 조회 기준). 이 칸들은 `value`·`onChange` 를 SearchField 에 주지 않았으므로 아무것도 하지 않아도 대상에서 빠진다.

**데모(m-design-dummy)**: 고치지 않는다.

### 7.4 SearchArea 를 쓰지 않는 확정 대기 4화면 (D6)

`codeConfirm`·`ruleConfirm`·`layoutConfirm`·`ruleSetConfirm` 은 목록 머리의 검색어 칸 하나다. 기본값의 쓸모가 작아 이번에는 제외하고, 가이드의 「조회 칸은 SearchArea 로」 규칙 위반 목록에 올려 둔다.

### 7.5 확인용 샘플 화면 (2026-10-07 사용자 요청)

칸 형식과 조건을 한 화면에 모아 기본값 동작을 눈과 e2e 로 확인하는 샘플 화면을 만든다.

- 위치: m-mcm 의 포털 메뉴 화면(예: `page-components/cmz/searchDefaultsSample`, 메뉴 「조회 기본값 샘플」). 기본값은 `pageId` 와 사용자 ID 가 있어야 동작하므로 포털 밖의 독립 앱인 m-design-dummy 에는 두지 않는다. 메뉴는 로컬 시드에만 등록하고 운영 메뉴에는 넣지 않는다. 정확한 폴더와 메뉴 등록 방식은 구현 레인이 기존 cmz 화면의 등록 방식을 보고 정한다.
- 서버 조회는 하지 않는다. `onSearch` 는 아래 「조회 기록」 에 그 순간의 조건 값을 한 줄씩 쌓는다. 그래서 자동 조회가 기본값을 넣은 뒤에 한 번만 불렸는지 바로 보인다.

**조회 영역 A** (`autoSearch`, 초기화 버튼 `btn_reset` 있음)

| 칸 | 형식 | 확인할 규칙 |
|---|---|---|
| 품번 | `type="text"`, `name` | 고정 값, 마지막 조회값 |
| 상태 | `type="select"`, 첫 항목 「전체」 | 고정 값(`""` 전체 포함), 선택지에 없는 고정 값 |
| 구분 | `type="radio"` | 고정 값 |
| 기준일 | `type="date"` 한 칸 | 고정 날짜, 당일·전일·N일 전·당월 말일 |
| 조회 기간 ~ | `type="date"` 두 칸 `label="~"` 짝 | 묶음 선택지 전부, From 이 To 보다 늦은 규칙 |
| 작업장 | children `Input` + SearchField `value`·`onChange` 묶기 | 고정 값 |
| 공정 | children `Select` + 묶기, `type="select"`·`options` | 고정 값 |
| 등록 기간 ~ | children `DatePicker` 짝 + 묶기, `type="date"` | 상대 날짜(전월 1일 ~ 전월 말일) |
| 메모 | `name` 없음, `defaultKey="memo"` | 키 없는 칸을 `defaultKey` 로 대상으로 만들기 |
| 비고 | `defaultable={false}` | 설정 창에 나오지 않음 |
| 품목 선택 | children 돋보기 버튼 + 읽기 전용 칸, 묶기 없음 | 대상 아님(설정 창에 나오지 않음) |
| 포함 여부 | children `Checkbox`, 묶기 없음 | 대상 아님 |

**조회 영역 B** (`defaultsScope="tab2"`, `autoSearch` 없음): 텍스트 한 칸과 날짜 한 칸. A 와 같은 `name` 을 일부러 써서 저장 키가 섞이지 않는지 본다.

**조회 영역 C** (`defaults={false}`): 텍스트 한 칸. 설정 아이콘이 없고 기본값이 들어가지 않는지 본다.

**화면 아래 확인 패널**

- 조회 기록: 시각, 출처(자동·버튼·Enter), 그때의 조건 값 JSON.
- 지금 조건 값 JSON, 저장된 규칙 JSON(거울), 마지막 조회값 JSON.
- 「오늘」 바꾸기: 개발 모드에서만 보이는 날짜 입력. 상대 날짜 계산의 기준일을 바꿔(예: 2026-01-31, 2028-02-29) 월 경계·윤년을 화면에서 확인한다. 이 값은 샘플 화면에만 쓰이고 저장소·다른 화면에는 영향이 없다(계산 함수가 `now` 를 인자로 받으므로 샘플이 넘긴다).

**샘플로 확인할 시나리오**(e2e 와 수동 확인 공통)

1. 규칙이 없을 때: 코드 기본값 그대로, 자동 조회 1회.
2. 영역 A 의 모든 칸에 규칙을 저장하고 탭을 닫았다 다시 열기: 기본값이 들어간 뒤 자동 조회 1회, 조회 기록의 값이 칸 값과 같음.
3. 탭 전환 뒤 돌아오기: 다시 넣지 않음.
4. 칸을 바꾸고 [초기화]: 사용자 기본값으로 돌아가고, 「마지막 조회값」 칸은 코드 기본값.
5. 버튼 조회 뒤 다시 열기: 「마지막 조회값」 칸에 직전 조회 값.
6. 탭을 새 창으로 분리: 분리 창이 이어받은 값을 유지하고 기본값을 덮지 않음, 자동 조회를 다시 하지 않음.
7. 「내 기본값 초기화」: 규칙이 지워지고 다음 열기부터 코드 기본값.
8. 영역 B·C 의 키 분리와 끄기.

## 8. 설정 UI

### 8.1 버튼

- 조회 영역(`.search-area`) 오른쪽 위 모서리에 설정 아이콘(`IconSettings` 16px, `ActionIcon` subtle·gray·24px)을 겹쳐 놓는다. `GridSettingsOverlay` 처럼 평소에는 흐리고, 조회 영역에 마우스가 오거나 초점이 들어오면 진해진다. 마지막 칸과 겹치지 않게 조회 영역 오른쪽에 아이콘 폭만큼 여백을 둔다.
- 툴팁·`aria-label` 은 「조회 기본값」, `data-testid="search-settings-menu"`.
- 등록된 칸이 없거나, `defaults={false}` 이거나, 사용자 ID 가 없으면 그리지 않는다.

### 8.2 메뉴 (`SearchSettingsMenu`, 항목 이름은 `search-settings-labels.ts` 한곳에 둔다)

| 순서 | 항목 | 동작 |
|---|---|---|
| 1 | 기본값 설정… | 설정 창을 연다 |
| 2 | 지금 조건을 기본값으로 | 등록된 칸의 지금 값을 「고정 값」 규칙으로 저장한다. 날짜 칸은 그대로 날짜로 고정되므로, 확인 창에서 「날짜 칸은 상대 날짜로 바꾸려면 설정 창을 쓰라」 고 안내한다 |
| 3 | 내 기본값 초기화… (빨강) | 확인 뒤 `resetPage`. 지금 칸 값은 바꾸지 않는다 |

### 8.3 설정 창

- shared 모달 표준을 따르고 제목은 「조회 기본값 설정」 이다.
- 표 한 줄이 칸 하나이고, 기간 짝은 한 줄로 묶는다.

| 열 | 내용 |
|---|---|
| 칸 | 라벨(기간은 「조회 기간 (시작 ~ 끝)」) |
| 방식 | `Select`: 사용 안 함 / 고정 값 / 상대 날짜(날짜 칸만) / 마지막 조회값. 기간 줄은 「묶음」 선택지(§4.4)도 함께 보인다 |
| 값 | 방식에 맞는 입력: 텍스트는 `Input`, select·radio 는 그 칸의 선택지를 쓴 `Select`, 날짜 고정은 `DatePicker`, 상대 날짜는 이름표 `Select` + N 입력 |
| 오늘 기준 | 계산 결과 미리보기(예: `2026-09-01 ~ 2026-09-30`). 「마지막 조회값」 은 저장된 값이나 「없음」 |

- 창 머리에 일괄 옵션 「이 화면 모든 칸: [사용 안 함] [마지막 조회값]」 을 둔다(2026-10-07 사용자 결정). 누르면 모든 줄(기간 짝 포함)의 방식을 그것으로 채운다. 고정 값·상대 날짜는 칸마다 직접 고른다. 저장 모양(칸별 규칙 행)은 바꾸지 않는다.
- 아래쪽 단추는 [이 화면 초기화] [취소] [저장] 이다. [이 화면 초기화] 는 창 안의 모든 줄을 「사용 안 함」 으로 돌리고, [저장] 을 눌러야 서버에 반영된다.
- 저장·초기화는 이 조회 영역 칸의 규칙만 바꾼다. 서버 `savePage` 가 화면(pageId)의 행 전체를 바꾸므로, 같은 화면의 다른 영역(`defaultsScope`)과 지금 등록되지 않은 칸의 규칙을 합쳐 보낸다. 합친 결과가 비면 `resetPage` 를 부른다.
- 이름표로 나타낼 수 없는 규칙(JSON 으로 넣은 `monthStart`+`days` 등)은 「사용자 지정(그대로 둠)」 으로 보이고, 그 줄을 고치지 않으면 그대로 저장한다.
- [저장]은 `savePage` 를 부르고 거울을 갱신한 뒤 계산값을 지금 칸에 바로 넣는다. 조회는 하지 않는다.
- 저장 실패는 메시지를 보이고 창을 닫지 않는다.
- 대화 상자(`role="dialog"`) 안의 SearchArea 는 기본값 기능 전체를 끈다. 아이콘도 없고 값도 넣지 않는다.
  - 팝업은 부모 탭과 같은 `pageId` 를 쓰므로, 켜 두면 부모 화면 칸과 `name` 이 같은 팝업 칸에 부모 규칙이 들어간다. 지금 해당 팝업은 `cmz/masterRuleListPop`, `cmz/masterRuleDataUploadFilePopup` 이다.
  - 모달 위 모달에서 Esc·Tab 이 꼬이는 일도 피한다(그리드 설정과 같은 이유).
  - 판정은 GridSettingsOverlay 처럼 마운트 때 DOM 조상으로 한다.

### 8.4 의존 칸 (`dependsOn`, 2026-10-07 사용자 결정)

- 「어떤 칸이 바뀌면 다른 칸을 비우고 기본값으로 다시 채운다」 는 동작은 shared 가 맡는다. 화면은 `<SearchField dependsOn="{기준 칸 키}">` 로 선언만 하고, 조건을 비우는 코드를 두지 않는다.
- 기준 칸 값이 바뀐 커밋 뒤에 SearchArea 가 의존 칸을 처음 등록 때 값(코드 기본값)으로 비우고, 칸 규칙(사용 안 함·마지막 조회값·설정 값)으로 다시 채운다. 새 선택지에 없는 값은 넣지 않는다(보류하지 않는다). 같은 커밋에서 화면이 직접 바꾼 의존 칸은 그대로 둔다.
- 선택지가 기준 칸을 따라 바뀌는 칸(서버에서 받는 선택지, 예: 데이터마다 다른 카테고리)은 기준 칸이 바뀐 뒤 10초 안에 선택지 내용이 바뀌면 새 선택지로 다시 판정한다. 옛 선택지로 넣은 값은 고치고, 새 선택지에만 있는 값은 그때 넣는다. 사용자가 그 칸을 고치면 그만둔다. 마운트 때 선택지를 기다리며 보류한 값도 이 경로로 들어간다.
- 화면이 선택지를 받은 뒤 바로 조회한다면 선택지를 `flushSync` 로 커밋한 뒤 조회 조건을 읽는다(다시 채운 값이 커밋돼야 조회가 그 값을 본다). 기본값 처리 코드가 아니라 커밋 순서 보장이다.
- 기본값 기능이 꺼진 영역(`defaults={false}`·대화 상자 안)도 비우기는 한다. 분리 창이 이어받은 값으로 시작한 영역은 코드 기본값을 모르므로 빈 값으로 비운다(빈 값이 선택지에 없는 select 는 두고 규칙만 넣는다).
- 저장소를 기다리는 동안 바뀐 기준 칸은 넣기가 끝난 뒤 처리한다. 초기화 커밋과, 초기화가 넣은 기준 칸 값 때문에 생긴 바로 뒤 커밋에서는 마지막 조회값을 넣지 않는다(§6.6).
- 첫 적용 화면은 m-mdm `dataItemMng` 다. 마루 데이터 칸(`defaultKey="maruDataId"`)이 기준이고, 키·이름·카테고리·닫힌 항목이 의존 칸이다. 마루 데이터 칸의 우선순위는 handoff > 사용자 기본값 > snapshot > 첫 항목이다.

### 8.5 끄는 방법

- 화면 전체: `<SearchArea defaults={false}>`. 아이콘도 사라진다.
- 칸 하나: `<SearchField defaultable={false}>`.

## 9. 스킬·가이드 갱신 목록

| 파일 | 바꿀 내용 |
|---|---|
| `.claude/skills/mantine-aggrid-ui/references/components/search-area.md` | 「사용자 기본값」 변형 절 추가(동작 개요·대상 판정·`autoSearch`·`defaultKey`·`defaultable`·`defaults={false}`), props 표에 새 prop, 표준 사용 예를 `type="date"` 기간으로 바꿈, 흔한 실수에 「마운트 effect 로 자동 조회」·「children 칸에 value·onChange 를 SearchField 에 안 줌」·「name 없는 칸에 label 로 기대함」·「조회 칸 onChange 를 `setFilters({ ...filters, k: v })` 로 씀」 추가, 실제 사용 예 갱신 |
| `.claude/skills/mantine-aggrid-ui/references/components/search-settings-menu.md` (새 문서) | 내부 부품 설명(그리드 설정 메뉴와 같은 형식) |
| `.claude/skills/mantine-aggrid-ui/references/components/llms.txt`·`llms-full.txt` | `node scripts/ui_docs.mjs index --write`·`full --write` 로 다시 만든다 |
| `.claude/skills/mantine-aggrid-ui/SKILL.md` | 조회 영역 규칙 요약에 「자동 조회는 `autoSearch`」·「날짜는 `type="date"`」 한 줄씩 |
| `.claude/skills/mantine-aggrid-ui/references/screen-patterns.md` | 목록 화면 골격의 조회 영역 예를 새 표준으로 바꾸고 마운트 조회 effect 를 뺀다 |
| `.claude/skills/mantine-aggrid-ui/references/examples/*`(list-detail·master-detail·grid-edit) | 예제의 조회 영역·자동 조회를 같은 방식으로 맞춘다 |
| `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` | SearchArea·SearchField 절에 기본값 기능, 키 규칙, 끄는 법 |
| `docs/guide/FrontEnd/standard-v2/part-c-master-sample.md` | 마스터 샘플의 조회 영역 코드를 새 표준으로 |
| `docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md` | 규칙: 조회 칸에 `name` 또는 `defaultKey` 필수, 마운트 자동 조회는 `autoSearch` 로만, 조회 칸 `onChange` 는 함수형 갱신(`setFilters((p) => ({ ...p, k: v }))`) |
| `docs/guide/FrontEnd/standard-v2/frontend-standard/04-templates.md` | 화면 템플릿의 조회 영역 |
| `docs/guide/design/ui-design/01-overview-and-rules.md`(조회 영역 규칙)·`03-template-and-sample.md` | 조회 영역 오른쪽 위 설정 아이콘, 날짜 기간 표기 |
| `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` | 새 테이블 등재 |

## 10. 구현 단계 (레인 분할)

| 단계 | 레인 | 내용 | 크기 | 선행 |
|---|---|---|---|---|
| 1 | shared-core | 규칙 계산 순수 함수·저장소(거울·마지막 조회값)·등록소·SearchField 확장(`type="date"`·`defaultKey`·`defaultable`·children 묶기)·SearchArea 넣기 흐름·`autoSearch`·초기화 이벤트. vitest(계산 경계값, 넣기·확인 반복, carry 복원 생략, 늦은 준비, 고친 칸 보호, `autoSearch` 1회) | L | 없음 |
| 2 | backend | 엔티티·저장소·서비스·쓰기 빈·`secSrchDflt.bpmn`·서비스 시험(IDOR·검사·교체 원자성)·dbml/tables 등재 | M | 없음(1과 병렬) |
| 1b | sample | §7.5 샘플 화면과 로컬 메뉴 등록. 1 의 동작을 화면에서 확인하는 기준이 된다. 설정 UI 가 오기 전에는 확인 패널에서 규칙 JSON 을 직접 넣는 개발 모드 입력으로 시험한다 | S~M | 1 (같은 레인에서 이어서 해도 된다) |
| 3 | screens | §7.3 최소 수정 ①②③, 화면별 시험 보정, e2e 2건(`commUserMng` 자동 조회, `noticeMgmt` 기간) | M | 1 |
| 4 | settings-ui | 설정 아이콘·메뉴·설정 창·서버 연동·포털 셸 미리 받기 | M | 1, 2(계약만 있으면 모의로 먼저 진행 가능) |
| 5 | docs | §9 전부 | M | 1·4 의 API 확정 |

- 머지 순서: 1·1b·2 → 3 → 4 → 5. 4 가 머지되면 §7.5 시나리오 전체를 샘플 화면에서 e2e 로 돌린다. 4 를 3 보다 먼저 머지하면 사용자가 기본값을 저장했을 때 자동 조회 12개 화면이 칸 값과 다른 조건으로 조회하게 된다.
- 1·1b 만 머지된 상태는 안전하다. 규칙을 저장하는 화면은 샘플 화면뿐이고, 샘플의 「서버 저장」은 샘플 화면 자신의 pageId 규칙만 저장한다. 실화면에는 넣을 값이 없으므로 화면 동작이 그대로다(백엔드 2 가 먼저 들어가 API 로는 저장할 수 있지만 부르는 UI 가 없다).
- 3 과 4 는 병렬로 개발할 수 있다(머지만 3 이 먼저).
- 5 는 4 와 함께 진행해도 된다.

## 11. 시험 계획

- 계산: 1월의 전월 1일·말일, 3월 31일의 1개월 전(평년·윤년), 12월 31일의 익일, `days` 로 해를 넘는 경우, 자정 직전 시각.
- 넣기 흐름(React Testing Library): 함수형 갱신 화면에서 모든 칸이 한 번에 들어가는지, 지난 상태를 복사하는 화면에서 개발 모드 경고가 나오는지, handoff 처럼 화면 effect 가 정한 값을 덮지 않는지, carry 복원이면 넣지 않는지, 저장소가 늦게 준비될 때 고친 칸을 덮지 않는지, 1.5초를 넘으면 포기하는지, `autoSearch` 의 `onSearch` 가 넣은 값으로 정확히 한 번 불리는지, `emitSearch` 를 내지 않는지.
- 초기화: `btn_reset` 클릭 뒤 사용자 기본값이 남는지, 「마지막 조회값」 칸은 코드 기본값으로 가는지.
- 서버: 다른 사용자 ID 를 본문에 넣어도 인증 사용자로 저장되는지, 잘못된 `ruleJson`·범위 초과를 거절하는지, `savePage` 중간 실패 때 이전 행이 남는지.
- 회귀: 기존 SearchArea·SearchField 시험과 골든(있으면) 그대로 통과, 등록 칸이 없는 화면의 DOM 이 같은지.
- 화면 확인: §7.5 샘플 화면의 시나리오 1~8. 칸 형식별(텍스트·select·radio·날짜·기간·children 묶기·키 없는 칸·대상 아님) 동작을 한 화면에서 본다.

## 12. 위험과 열린 점

- 메뉴를 다시 등록해 `componentPath` 가 바뀌면 그 화면의 기본값이 끊긴다(그리드 개인화와 같다). 메모리 기록상 MDM 메뉴를 새 메뉴로 대체하는 계획이 있으므로, 그 작업 뒤에 기본값을 정하도록 안내하거나 D7-B 로 바꾼다.
- 사용자 ID 가 화면 마운트보다 늦게 확인되는 경우(새로 고침 직후 탭 복원)는 §6.2 의 기다림으로 처리한다. 한도 1.5초가 실제로 충분한지 구현 레인이 로컬에서 측정한다.
- `autoSearch` 를 달지 않은 새 화면이 마운트 조회를 하면 같은 불일치가 생긴다. 가이드 규칙과 스킬의 흔한 실수에 넣고, 구현 레인 1 이 개발 모드 경고(등록 칸에 기본값을 넣었는데 넣기 전에 같은 화면에서 조회 요청이 나갔으면 경고)를 넣을 수 있는지 검토한다.
- `screenUsageStat` 은 코드 기본값이 이미 「오늘-30일 ~ 오늘」 이다. 사용자 규칙이 없으면 그대로 쓰므로 충돌은 없다.

## 13. 구현 반영 (2026-10-07, 단계 1·1b)

구현·리뷰·브라우저 확인 중에 설계보다 구체화하거나 바꾼 점이다. 코드는 `shared/src/layout/search-defaults/area.ts`·`store.ts` 가 정본이다.

- 초기화(§6.6): 같은 클릭 안에서는 화면이 비우기 전 값이 보이므로, 초기화 이벤트를 받으면 예약만 하고 화면이 비운 값이 커밋된 다음 layout effect 에서 넣는다. 그래서 `PageButton.onClick` 은 조회 조건을 동기로 비워야 한다(비동기로 비우는 화면은 `resetsSearch: false` 로 두고 직접 `emitSearchReset` 을 부른다).
- 늦은 넣기와 handoff(§6.3): 등록 때 칸 값을 기준값으로 적어 두고, 저장소가 늦게 준비돼 나중에 넣을 때는 기준값에서 바뀐 칸을 덮지 않는다. handoff 가 코드 기본값과 같은 값(빈 값)으로 정하면 값만으로 구별할 수 없으므로, handoff 화면은 `defaults={!handoffActive}` 로 끈다(단계 3).
- 서버에서 받는 선택지: 고정 값이 아직 선택지에 없으면 최대 10초 보류했다가 선택지가 생기고 칸이 그대로면 넣는다. `autoSearch` 는 보류한 값이 있으면 조회를 최대 1.5초 미룬다. 그 안에 넣으면 넣은 값으로 조회하고, 넘으면 보류를 버리고 지금 값으로 조회한다(먼저 「전체」로 조회한 뒤 칸만 바뀌는 불일치를 막는다).
- StrictMode: 다시 등록할 때 한 칸씩 다시 넣으면 기간 짝 검사(§4.4)를 건너뛰므로, 한 번 판정한 칸은 넣지 않기로 했어도 처리한 칸으로 기록한다.
- 늦게 나타난 칸(조건부 칸): 등록 때 바로 넣지 않고 같은 커밋의 layout effect 에서 한꺼번에 넣는다. 함께 나타난 기간 짝을 같이 검사하려는 것이다.
- 저장소(§5.4): 서버 미리 받기가 실패하면 60초 안에는 다시 묻지 않는다(화면마다 재요청하지 않게). 미리 받기 응답이 오기 전에 저장·초기화한 화면은 늦은 응답이 덮지 않는다. 다른 창(분리 창)이 거울을 바꾸면 `storage` 이벤트로 이 창의 메모리도 따라간다. 사용자가 바뀌면 다른 사용자 항목을 지우고, 로그아웃 중의 빈 사용자 통지는 무시한다.
- 사용자 확인에 실패하면 1.5초를 기다리지 않고 바로 끝낸다(`autoSearch` 는 코드 기본값으로 조회한다).
- 저장·초기화 범위(리뷰 반영): 메뉴의 「내 기본값 초기화」 는 resetPage 가 아니라 이 영역에 지금 보이는 칸의 규칙만 지운다(같은 화면 다른 영역·지금 없는 조건부 칸 규칙은 남는다, 확인 창 문구도 「지금 보이는 칸」). 저장·초기화는 저장소가 서버 값을 받은 뒤(source=server)에만 한다 — 받기 전·실패 상태에서 합쳐 저장하면 서버의 다른 규칙을 지우므로 메뉴 항목을 비활성으로 두고 설정 창은 안내와 함께 저장을 막는다. 남기는 행은 서버에서 받은 칸 메타·이름을 이어 붙이고, 기간 To 칸 이름은 「{시작 칸 이름} (끝)」 으로 저장한다. 저장 뒤에는 규칙이 바뀐 칸(과 기간 짝)만 지금 칸에 넣는다.
- 다른 창이 거울을 바꾸면(storage 이벤트) 바뀐 화면의 칸 메타·이름을 모르므로 source 를 거울로 낮추고 서버에서 다시 받는다. 다시 받기 전에는 저장을 막는다(다른 창이 넣은 행의 메타를 빼고 저장하지 않게). 내용이 같은 거울 갱신은 무시한다.
- 설정 창을 연 뒤 서버 값이 오면 사용자가 고치지 않은 줄만 서버 규칙으로 다시 만든다(낡은 거울 값으로 다른 칸 규칙을 덮지 않게).
- 알려진 한계: 기간 시작>끝 검사는 「오늘」 하나로만 본다(예: 「당월 1일 ~ 전일」 은 매월 1일에만 뒤집혀 그날은 넣지 않는다). 거울이 없는 첫 진입에서 저장소 응답이 화면의 첫 조회보다 늦으면, 첫 조회는 코드 기본값으로 하고 의존 칸만 뒤늦게 채워질 수 있다. 선택지가 기준 칸을 따라 바뀌는 칸은 새 선택지가 올 때까지(화면의 선택지 요청 동안) 옛 선택지로 판정한 값이 보인다 — 그 사이 [조회] 를 누르거나 선택지 요청이 실패하면 그 값으로 조회된다. 비우기만 하고 채우기를 미루면 선택지가 고정된 칸은 채울 계기가 없어서 이렇게 둔다.
- 화면은 선언만 한다(2026-10-07 사용자 결정): 기본값을 넣고 비우는 처리 코드를 화면에 두지 않는다. 칸 묶기(`value`·`onChange`·`defaultKey`), 자동 조회(`autoSearch`), 의존 칸(`dependsOn`), 끄기(`defaults`·`defaultable`) 선언으로 끝낸다(§8.4).
- 설정 UI(단계 4): `SearchSettings`(아이콘·메뉴·확인 창·설정 창)는 SearchArea 의 내부 부품이고 index 로 내보내지 않는다(Part B §18 등록 대상 아님). 아이콘은 form 안에 있으므로 `type="button"`, 메뉴·창은 portal 이고 안에 form·submit 이 없어 조회가 일어나지 않는다. 스타일은 부품이 `<style href precedence>` 로 직접 넣는다.

## 부록 A. 화면별 조회 영역 현황 (2026-10-07, dev 09952ba5)

경로는 m-mcm 이 `src/frontend/m-mcm/page-components/`, m-mdm 이 `src/frontend/m-mdm/pages/`, m-mls 가 `src/frontend/m-mls/pages/` 기준이다. 괄호 안 숫자는 근거 줄이다.

- 상태 패턴: A 는 `useCarryState("filters")` 객체 하나, B 는 칸마다 `useCarryState`, C 는 일반 `useState`.
- 자동 조회: Y 는 마운트 때 조회, N 은 없음.
- 형식의 (c) 는 children 칸이다.

### m-mcm

| 화면 | 칸 | 형식 | name / meta | 패턴 | 자동 조회 | 날짜 초기값 |
|---|---|---|---|---|---|---|
| cma/masterCategoryMng | 4 | text 4 | 4 / 0 | A (80) | Y (118) | - |
| cma/masterCodeMng | 2 | text 2 | 2 / 0 | A (251) | Y (372) | - |
| cmb/masterRuleData | 5 | (c) 원시 input 2·버튼 1·조건 행 1·체크 1 | 2 / 0 | A (81) | N (업무기준 ID 필수, 179) | - |
| cmb/masterRuleDataList | 4 | (c) 원시 input 2·버튼 1·조건 행 1 | 2 / 0 | A (76) | N (팝업 선택 뒤, 205) | - |
| cmb/masterRuleFrame | 4 | (c) 원시 input 2·버튼 2 | 2 / 0 | A (114) | N | - |
| cmb/masterRuleList | 2 | text 2 | 2 / 0 | A (75) | Y (109) | - |
| cme/masterCodeMngList | 2 | text 2 | 2 / 0 | A (98) | N (196) | - |
| csa/commMenuMng | 3 | text 2·select 1 | 3 / 0 | A (396) | Y (523) | - |
| csa/commObjMng | 2 | text 1·select 1 | 2 / 0 | A (215) | Y (304) | - |
| csa/commPermMng | 3 | text 2·select 1 | 3 / 2 | A (242) | Y (301) | - |
| csa/commRoleGrpMng | 3 | text 2·select 1 | 3 / 2 | A (302) | Y (423) | - |
| csa/commRoleMng | 3 | text 2·select 1 | 3 / 0 | A (279) | Y (527) | - |
| csa/commSyncMng | 2 | text 1·select 1 | 2 / 2(false) | B (101) | N (결과 목록 없음) | - |
| csa/commUserMng | 3 | text 1·select 2 | 3 / 1 | A (292) | Y (424) | - |
| csa/commUserRoleCopy | 1 | text 1 | 1 / 1 | B (135) | Y (237) | - |
| csa/commWidgetMng/WidgetListTab | 3 | text 1·select 2 | 3 / 3(false 1) | C (155) | 미확인(클라이언트 필터, 187) | - |
| csa/mdmCacheMng | 3 | text 1·select 2 | 3 / 3(false) | A (176) | Y (318) | - |
| csa/screenUsageStat | 6 | text 4·(c) DatePicker 2 | 4 / 1 | A (47) + `submitted` (49) | N | 오늘-30일 ~ 오늘 (types.ts 132) |

### m-mdm

| 화면 | 칸 | 형식 | name / meta | 패턴 | 자동 조회 | 날짜 초기값 |
|---|---|---|---|---|---|---|
| dma/columnMng | 2 | (c) Input 2 | 1 / 1(false) | B (98) | N (169) | - |
| dma/domainMng | 2 | text 1·select 1 | 2 / 1(false) | A (69) | N (118) | - |
| dma/termMng | 3 | text 3 | 3 / 1(false) | A (42) | N (94) | - |
| dma/unitMng | 2 | text 1·select 1 | 1 / 0 | A (59) | N (118) | - |
| dmb/headerMng | 1 | (c) Input 1 | 1 / 1(false) | B (65) | N (123) | - |
| dmb/layoutMng | 4 | (c) Input 1·select 3 | 4 / 1(false) | A (106) | N (189) | - |
| dmc/codeItemEdit | 3 | (c) IdPicker·Select·Checkbox | 0 / 0 | C (108) | N (handoff 로 선택, 198) | - |
| dmc/codeMng | 2 | (c) Input·Select | 2 / 2(false) | B (95) + `appliedCarry` (101) | N (262) | - |
| dmd/dataItemMng | 5 | (c) IdPicker·Input 2·Select 2 | 0 / 0 | C (109) | 부분(첫 데이터 선택, 338) | - |
| dmd/dataMng | 3 | (c) Input 2·Select | 1 / 1(false) | B (79) + `appliedCarry` (86) | N (237) | - |
| dme/ruleMng | 3 | (c) Input·select 2 | 3 / 2(false) | A (78) + `applied` (79) | N (159) | - |
| dme/ruleSetMng | 4 | (c) Input 3·Select | 2 / 2(false) | A (49) + `applied` (50) | N (72) | - |

### m-mls

| 화면 | 칸 | 형식 | name / meta | 패턴 | 자동 조회 | 날짜 초기값 |
|---|---|---|---|---|---|---|
| lsh/noticeMgmt | 6 | text 1·select 3·(c) DatePicker 2 | 4 / 0 | A (106) | Y (265) | 빈 값 (types.ts 163) |

### SearchArea 를 쓰지 않는 화면

| 화면 | 조회 칸 | 상태 | 자동 조회 |
|---|---|---|---|
| m-mdm `codeConfirm`·`ruleConfirm`·`layoutConfirm`·`ruleSetConfirm` | 검색어 `Input` 하나 + 조회 버튼 | `useCarryState("keyword")` | Y |

### m-design-dummy (참고, 고치지 않음)

ChartDashboard, MasterData, MasterDetail, OperationsDashboard, QualityWorkflow, ResizableLayoutCatalog, WorkOrderGantt 7개 화면, 23칸(select 9·radio 4·text 4·children 6). 모두 `name` 이 없고 날짜는 고정 문자열이다.
