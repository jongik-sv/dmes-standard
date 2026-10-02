# 위젯 기반(A) — 위젯 계약 · 자유 배치 보드 · 사용자 위젯 탭 · 서버 저장

- 날짜: 2026-10-02
- 출처: `docs/idea.md` §위젯 기능
- 시안: [`assets/2026-10-02-widget-foundation-mockups/widget-home.html`](assets/2026-10-02-widget-foundation-mockups/widget-home.html) — 브라우저로 열어 직접 끌고 크기를 바꿔 볼 수 있다. 시안은 동작 시연에 gridstack 을 쓰고 화면 폭 전환 없이 24칸 고정이다. 실제 구현은 react-grid-layout(W-D2)이고 폭 전환은 §3.2 를 따른다.
- 영향 화면: 포털 홈 `src/frontend/m-mcm/page-components/home/`(2026-10-02 시안으로 만든 미커밋 변경 위에 얹는다)

## 0. 범위와 사용자 결정

위젯 정의(사용자 원문): "위젯은 자유롭게 배치할 수 있는 조각 프로그램(화면 컴포넌트)이다."
→ 위젯 하나 = 화면 컴포넌트 하나 = 프로그램 하나. 쿼리 표·차트·md 같은 범용 위젯도 "설정을 받는 위젯 프로그램"으로 다룬다.

`docs/idea.md` 의 위젯 기능 전체를 네 하위 과제로 나누고 이 문서는 **A** 만 다룬다.

| 순서 | 하위 과제 | 내용 | 이 문서 |
|---|---|---|---|
| A | 위젯 기반 | 위젯 계약, 위젯 등록부 코드 생성, 자유 배치 보드, 사용자 위젯 탭, 잠금, 서버 저장, 홈 위젯 이전 | ✅ |
| B | 위젯관리 화면 | 위젯 등록·목록·기본 크기, 홈 기본 배치 지정(관리자) | — |
| C | 범용 위젯·설정 편집 | 쿼리 표·차트·md/html·웹 주소 위젯, 설정 스키마 편집 화면, 위젯 안 화면·외부 링크 | — |
| D | 특수 위젯 | 웹검색, AI 챗봇 | — |

사용자가 고른 것:

| 질문 | 답 |
|---|---|
| 자유 배치 방식 | **격자 + 위로 당김** — 칸에 붙고 겹치지 않으며 빈칸이 생기면 아래 위젯이 위로 당겨진다 |
| 크기 조정 | **자유롭게** — 네 변·네 모서리 어디서나 끌어 폭·높이를 따로 바꾼다 |
| 홈과 탭 | **홈 안의 위젯 탭** — 첫 탭이 「홈」, 사용자가 탭을 더 만든다 |
| 잠금 | **사용자 잠금** — 사용자가 자기 탭 전체나 위젯 하나를 잠근다 |
| 격자 엔진 | **react-grid-layout 도입**(1안) |
| 권한 | **RBAC 는 이번 범위에서 뺀다** — 모든 로그인 사용자가 등록된 위젯을 모두 놓을 수 있다 |

제외(A 범위 밖): 관리자 고정·관리자 기본 배치 편집(B), 위젯 인스턴스 설정 편집 화면(C), 위젯 권한, 부서 공용 탭 배포, 위젯끼리 연동(한 위젯 선택이 다른 위젯을 거름), 좁은 화면 배치 따로 편집, 실시간 공동 편집.

## 1. 구조

| 위치 | 단위 | 역할 |
|---|---|---|
| shared `@dk-oasis/shared/widget` | `WidgetBoard` | react-grid-layout 감싸기. 격자·편집 모드·잠금·키보드 이동 |
| 〃 | `WidgetFrame` | 위젯 공통 틀. 제목 줄·새로 고침·「화면 열기」·로딩·오류 경계 |
| 〃 | `WidgetTabs` | 위젯 탭 줄. 선택·추가·이름 바꾸기·지우기·순서 바꾸기·잠금 |
| 〃 | `WidgetPicker` | [위젯 추가] 서랍. 이름 검색, 눌러 추가, 끌어 놓기 |
| 〃 | `WidgetWorkspace` | 탭 + 보드 + 편집 흐름(편집·완료·취소)을 묶는다. 저장·불러오기는 주입받는다 |
| 〃 | `widget-layout.ts` | 순수 함수(검증·기본 배치 맞춤·추가 자리·키보드 이동·변경 비교). React·DOM 무관 |
| m-mcm | `scripts/generate-widget-registry.mjs` → `lib/generated/widget-registry.ts` | 위젯 등록부 코드 생성 |
| m-mcm·각 모듈 | `widgets/{group}/{name}/` | 위젯 프로그램 본체 |
| m-mcm | `page-components/home/` | 인사말·긴급 공지 띠 + `WidgetWorkspace` |
| mcm-core | `widget` 패키지 + mcm api `services/roleManagement/secWidget.bpmn` | 탭·배치 저장 |

- 탭·보드·틀·서랍은 업무 도메인에 묶이지 않으므로 shared 공통 컴포넌트로 새로 등록한다(CLAUDE.md 행동강령, Part B §18). 같은 작업에서 `mantine-aggrid-ui` 스킬의 컴포넌트 문서와 색인을 갱신한다.
- 기존 행 단위 `DashboardBoard`(`@dk-oasis/shared/dashboard`)는 바꾸지 않는다. 지금은 홈만 쓰고 있으므로, 홈이 옮겨 간 뒤 지울지 사용자에게 따로 묻는다(삭제는 사용자 승인 사항). `DashboardCard`·`KpiTile`·`Sparkline` 등 카드 안 부품은 위젯 본체가 그대로 쓴다.
- 새 의존성 `react-grid-layout`(MIT, 2.2.4)은 shared `dependencies` 에만 넣고 `pnpm why` 로 한 벌인지 확인한다(Part B §3 의존성). v2 API 는 구현 계획 단계에서 설치 버전 문서로 확인한다.

## 2. 위젯 계약

### 2.1 폴더와 파일

```
widgets/mcm/notice/
  widget.meta.ts   // 메타 정보(가벼움) — 등록부가 정적 import
  widget.tsx       // 본체 — 보드에 놓일 때 지연 로딩(default export)
```

메타와 본체를 나누는 이유: [위젯 추가] 서랍은 모든 위젯의 이름·설명·크기를 보여 줘야 하지만 본체(차트·그리드 등)까지 다 불러올 필요는 없다.

### 2.2 타입(shared `@dk-oasis/shared/widget`)

```ts
export interface WidgetSize { w: number; h: number }   // 격자 칸 수

export interface WidgetMeta {
  /** "{모듈}.{이름}" — 저장 키. 바꾸면 사용자 배치에서 그 위젯이 빠진다(§4.4). */
  id: string;
  title: string;
  description?: string;
  defaultSize: WidgetSize;
  minSize?: WidgetSize;        // 기본 { w: 4, h: 6 }
  maxSize?: WidgetSize;        // 기본 제한 없음(가로는 격자 폭까지)
  /** 자동 새로 고침 주기(초). 없으면 자동 새로 고침 없음. 최소 30. */
  refreshSec?: number;
  /** 제목 줄 「화면 열기」가 여는 포털 화면(componentPath). */
  linkPageId?: string;
  /** 한 탭에 여러 번 놓을 수 있는지(기본 true). */
  multiple?: boolean;
  /** 제목 옆 작은 부제(예: "전일 기준"). */
  subtitle?: string;
  /** 본문 안쪽 여백(기본 true). 그리드처럼 칸을 꽉 채우는 위젯은 false. */
  bodyPadding?: boolean;
}

export interface WidgetProps {
  /** 보드 안 고유 ID — 같은 위젯을 두 번 놓아도 구분한다. */
  instanceId: string;
  size: WidgetSize;
  /** 인스턴스 설정. A 에서는 늘 null(설정 편집은 C). */
  config: unknown;
  /** 새로 고침 신호. 값이 바뀌면 위젯이 다시 조회한다. */
  refreshKey: number;
}

export type WidgetComponent = (props: WidgetProps) => ReactNode;
```

- 위젯 본체는 제목 줄을 그리지 않는다. 제목·새로 고침·「화면 열기」·로딩·오류 표시는 `WidgetFrame` 이 맡는다.
- 위젯 본체가 자기 높이를 정하지 않는다. 틀이 준 칸을 채우고, 넘치면 본문 안에서 스크롤한다.
- 위젯이 진행 중 조회를 알려야 하면 `useWidgetStatus()` 훅으로 틀에 `loading`·`error(message, retry)` 를 알린다(틀이 공통 모양으로 그린다).
- 제목 줄에 위젯 고유 버튼·배지를 두려면 `<WidgetHeaderActions>` 안에 그린다(틀의 제목 줄로 포털된다).
- 차트처럼 본문 픽셀 크기가 필요하면 `useWidgetBodySize()` 로 `{ width, height }` 를 읽는다.
- 위젯 안에서 포털 화면을 열 때는 기존 `openPortalTab` 을 쓴다.

### 2.3 등록부 코드 생성

- `generate-widget-registry.mjs` 는 `generate-page-registry.mjs` 와 같은 방식으로 m-mcm `widgets/**` 와 `MODULE_PAGE_PACKAGES` 의 각 모듈 `widgets/**` 를 훑는다. prebuild·predev 훅에 붙인다.
- 생성물:

```ts
export const WIDGET_REGISTRY: Record<string, {
  meta: WidgetMeta;                               // 정적 import
  load: () => Promise<{ default: unknown }>;      // 지연 import
}> = { ... };
```

- 생성 시 검사: `widget.meta.ts` 에 `id: "{group}.{name}"` 문자열이 폴더와 같게 있는지, `widget.tsx` 가 짝으로 있는지, ID 중복이 없는지 확인하고 어기면 생성을 실패시킨다. 크기 범위(`defaultSize` 가 min·max 안인지)는 shared `validateWidgetMeta` 가 실행 시 검사해 콘솔 오류를 내고 범위 안으로 자른다(메타는 TS 라 생성 스크립트가 값을 읽지 않는다).

## 3. 화면과 상호작용

### 3.1 홈 화면 배치

```
[인사말 · 날짜 · 제품군 선택]                        [배치 편집]
[긴급 공지 띠(있을 때만)]
(홈) (내 생산) (품질 모니터) (+)                       ← 위젯 탭 줄
┌────────── 24칸 격자 ──────────┐
│ 위젯 …                         │
└───────────────────────────────┘
```

- 인사말·긴급 공지 띠는 탭 밖에 그대로 둔다(모든 탭 공통).
- 제품군 선택(지금 샘플 데이터 필터)은 인사말 줄에 남긴다. 위젯끼리 연동은 범위 밖이므로, 지금처럼 샘플 위젯이 읽는 화면 수준 값으로만 둔다.

### 3.2 격자 규격

| 항목 | 값 |
|---|---|
| 가로 칸 | 작업 공간 폭(사이드바 제외, 서랍 자리 포함) ≥960px 24칸 · ≥768px 12칸 · 그 밖 1칸(W-D13·W-D14) |
| 세로 한 칸 | 20px |
| 위젯 간격 | 8px(`--spacing-sm`) |
| 당김 | 세로(위로) 당김. 겹침 없음 |
| 저장 | 넓은 화면 배치 하나만 저장. 중간·좁은 화면은 넓은 화면 배치를 위→아래·왼→오른 순서로 다시 흘려 자동 계산 |
| 편집 | 넓은 화면(24칸)에서만 한다. 중간·좁은 화면에서는 [배치 편집]이 비활성이고 「넓은 화면에서 편집할 수 있습니다」 안내를 띄운다(W-D12) |

### 3.3 보기 모드(기본)

- 끌기·크기 조절 손잡이가 보이지 않는다. 위젯 제목 줄에 새로 고침(↻)과 「화면 열기」(↗, `linkPageId` 있을 때)만 있다.
- 탭 선택은 마지막으로 본 탭을 기억한다(localStorage `dmes:widget:lastTab:{userId}`, per-viewer 편의 값).

### 3.4 편집 모드([배치 편집] → [완료]·[취소])

- 들어가면 격자 눈금이 옅게 보이고, 오른쪽에 [위젯 추가] 서랍이 열린다.
- **옮기기**: 제목 줄을 끌어 아무 칸에나 놓는다. 끄는 동안 놓일 자리(그림자)가 보이고 다른 위젯이 비켜난다.
- **크기 조절**: 네 변·네 모서리 8곳 손잡이를 끈다. 칸 단위로 붙고 `minSize`·`maxSize` 범위에서만 바뀐다. 끄는 동안 「w×h」 크기를 이름표로 보인다.
- **추가**: 서랍에서 위젯을 누르면 맨 아래 왼쪽에 기본 크기로 놓고 그 자리로 스크롤한다. 서랍에서 격자로 끌어 원하는 자리에 놓을 수도 있다. `multiple: false` 위젯이 이미 탭에 있으면 서랍 항목이 비활성이다.
- **빼기**: 위젯 제목 줄 ✕. 확인 창 없이 빼고 [취소]로 되돌린다.
- **잠금(위젯)**: 위젯 제목 줄 자물쇠. 잠긴 위젯은 끌기·크기 조절·빼기가 안 되고, 다른 위젯이 옮겨져도 자리를 지킨다(react-grid-layout `static`).
- **키보드**: 위젯 제목 줄에 초점을 두고 ←→↑↓ 한 칸 옮기기, Shift+←→↑↓ 폭·높이 한 칸 조절, Delete 빼기, Escape 편집 취소.
- **[완료]**: 바뀐 것이 있으면 서버에 저장한 뒤 보기 모드로 돌아간다. 저장 중에는 버튼이 비활성이다.
- **[취소]**: 편집 시작 시점 배치로 되돌린다. 바뀐 것이 있으면 확인 창(「변경 내용을 버릴까요?」)을 띄운다.
- 편집 중 다른 탭으로 가면 그 탭도 편집 모드로 보이고, [완료]는 바뀐 탭을 모두 저장한다. 단 잠긴 탭으로 가면 그 탭의 격자는 고정된 채 보인다.
- 편집 모드에서 탭 메뉴는 **이름 바꾸기만** 쓸 수 있고, 바꾼 이름은 [완료] 때 함께 저장된다. 잠금·옮기기·지우기·기본 배치 되돌리기는 보기 모드에서만 쓴다(§3.5).

### 3.5 위젯 탭

- 「홈」 탭은 늘 첫 자리이고 지울 수 없다. 이름도 바꿀 수 없다.
- (+): 「새 탭」을 만들고 이름 칸에 바로 초점을 둔다. 새 탭은 비어 있고 편집 모드로 들어간다. [완료]를 눌러야 저장되고, [취소]하면 새 탭도 사라진다.
- 보기 모드의 탭 메뉴 작업(잠금·옮기기·지우기·기본 배치 되돌리기·이름 바꾸기)은 누르는 즉시 서버에 저장한다.
- 탭 메뉴(⋯): 이름 바꾸기 · 잠금/잠금 풀기 · 왼쪽·오른쪽으로 옮기기 · 지우기(확인 창). 「홈」 탭 메뉴에는 잠금과 **기본 배치로 되돌리기**(확인 창)만 있다.
- **탭 잠금**: 잠긴 탭은 [배치 편집] 버튼이 비활성이고 탭 이름 옆에 자물쇠가 보인다. 실수로 배치가 흐트러지는 것을 막는 용도다.
- 탭 이름은 1~20자이고 같은 사용자 안에서 중복을 허용하지 않는다. 탭은 사용자당 최대 10개, 위젯은 탭당 최대 30개다.

### 3.6 「홈」 탭 기본 배치

- 사용자가 「홈」 탭을 한 번도 저장하지 않았으면 코드의 기본 배치(`m-mcm` `HOME_DEFAULT_LAYOUT`)를 보여 준다.
- 저장하면 그때부터 사용자 배치를 쓴다. 「기본 배치로 되돌리기」는 서버의 사용자 「홈」 배치를 지운다.
- 관리자가 기본 배치를 편집하는 기능은 B 에서 이 상수를 DB 값으로 바꾼다.

## 4. 저장

### 4.1 테이블(mcm-core, 스키마 `MCMAPUSER`, 감사 컬럼은 `McmAuditEntity` 9컬럼)

**`TB_MCM_SEC_USER_WIDGET_TAB`** — 사용자 위젯 탭

| 컬럼 | 형 | 설명 |
|---|---|---|
| `USER_ID` (PK) | VARCHAR(30) | 인증 컨텍스트 사용자 |
| `TAB_ID` (PK) | VARCHAR(30) | `home` 또는 `tab-{n}` |
| `TAB_NM` | VARCHAR(60) | 탭 이름(「홈」 은 저장값 무시하고 고정 표시) |
| `TAB_SEQ` | INTEGER | 탭 순서(「홈」=0) |
| `LOCK_YN` | CHAR(1) | 탭 잠금 |

**`TB_MCM_SEC_USER_WIDGET`** — 탭에 놓인 위젯 인스턴스

| 컬럼 | 형 | 설명 |
|---|---|---|
| `USER_ID` (PK) | VARCHAR(30) | |
| `TAB_ID` (PK) | VARCHAR(30) | FK → 탭 |
| `INST_ID` (PK) | VARCHAR(40) | 인스턴스 ID(탭 안 고유) |
| `WIDGET_ID` | VARCHAR(100) | `WidgetMeta.id` |
| `POS_X` · `POS_Y` · `SIZE_W` · `SIZE_H` | INTEGER | 넓은 화면 격자 좌표·크기 |
| `LOCK_YN` | CHAR(1) | 위젯 잠금 |
| `CONFIG_JSON` | VARCHAR(4000) | 인스턴스 설정. A 에서는 늘 NULL(C 에서 쓴다). 세 방언에서 같은 형으로 쓰려고 LOB 대신 문자열로 둔다 |

- 탭 한 줄 + 인스턴스 여러 줄로 나누는 이유: C 의 인스턴스 설정, B 의 「이 위젯을 쓰는 사용자」 조회·위젯 폐기 처리가 줄 단위를 필요로 한다.
- 즐겨찾기(`TB_MCM_SEC_USER_FAVORITE`)와 같은 방식으로 관리한다: 로컬은 `ddl-auto: update` 로 생기고, 개발계·운영계 스키마는 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 등재해 사전 생성한다(mcm 의 사용자 개인 테이블은 Flyway 마이그레이션을 두지 않는다). 컬럼 형은 Oracle·PostgreSQL·SQLite 에서 모두 쓸 수 있는 것만 쓴다.

### 4.2 서비스(OASIS `secWidget`, `/api/mcm/oasis/secWidget/{action}`)

| action | 입력 | 동작 |
|---|---|---|
| `search` | — | 사용자의 탭 전체와 인스턴스 전체를 돌려준다 |
| `saveTab` | 탭(id·이름·순서·잠금) + 인스턴스 목록 | 그 탭을 통째로 바꾼다(인스턴스 지우고 다시 넣기, 한 트랜잭션) |
| `deleteTab` | tabId | 탭과 인스턴스를 지운다. `home` 은 거절 |
| `reorderTabs` | tabId 순서 목록 | `TAB_SEQ` 를 다시 매긴다 |
| `resetHome` | — | 사용자 `home` 탭과 인스턴스를 지운다 |

- `userId` 는 즐겨찾기(`SecFavoriteService`)처럼 인증 컨텍스트 값으로 강제로 바꾼다(IDOR 방지). 본문의 `userId` 는 무시한다.
- 서버 검사: 탭 이름 1~20자·중복 금지, 탭 10개·위젯 30개 한도, 좌표·크기는 0 이상 정수이고 `POS_X + SIZE_W ≤ 24`. 위반하면 `BusinessException(ErrorCode.INVALID_VALUE·DUPLICATE_DATA·BUSINESS_ERROR, 메시지)` 로 거절하고 화면은 메시지를 보인다. 서비스 클래스에는 `@Transactional` 을 붙이지 않고(OASIS 파라미터명 바인딩), 탭 교체·삭제의 원자성은 별도 빈 `SecWidgetTabWriter` 의 `@Transactional` 메서드로 확보한다.
- 서버는 위젯 ID 가 등록부에 있는지 모른다(등록부는 프런트 코드 생성물). 모르는 ID 처리는 프런트가 한다(§4.4).
- 동시 편집: 두 PC 에서 같은 탭을 저장하면 나중 저장이 이긴다(탭 단위 전체 교체). 충돌 감지는 범위 밖이다.

### 4.3 불러오기 흐름

1. 홈이 열리면 `search` 를 부른다. 응답 전에는 탭 줄과 격자 자리에 뼈대(skeleton)를 보인다.
2. 응답의 「홈」 탭이 없으면 `HOME_DEFAULT_LAYOUT` 을 쓴다.
3. 각 탭 배치를 `widget-layout.ts` 의 `sanitizeLayout` 으로 검증한다(격자 밖 좌표 자르기, 겹침은 당김으로 풀기, 크기를 min·max 로 자르기).

### 4.4 등록부에 없는 위젯

- 코드에서 위젯이 사라졌거나 ID 가 바뀐 경우다. 보기 모드에서는 그리지 않는다(빈자리는 당김으로 메워진다).
- 편집 모드에서는 「없는 위젯: {WIDGET_ID}」 회색 칸으로 보이고 ✕ 로만 뺄 수 있다. 사용자가 그 탭을 저장하면 같이 사라진다.

## 5. 기존 홈 위젯 이전

`home-widgets.tsx`·`NoticeCard`·`NotificationCard` 의 위젯 11개를 `m-mcm/widgets/home/*` 로 옮긴다.

| 지금 ID | 새 ID | 기본 자리(x,y) · 크기(w×h) | 비고 |
|---|---|---|---|
| kpi | `home.kpi` | 0,0 · 24×6 | 샘플 |
| notice | `home.notice` | 0,6 · 10×16 | 실제 조회(noticeBoard). `linkPageId` = 공지관리 |
| notifications | `home.notifications` | 10,6 · 7×16 | 샘플 |
| quickLinks | `home.quickLinks` | 17,6 · 7×16 | 사용자 즐겨찾기 |
| monthly | `home.monthly` | 0,22 · 9×13 | 샘플 차트 |
| equipment | `home.equipment` | 9,22 · 6×13 | 샘플 차트 |
| process | `home.process` | 15,22 · 9×13 | 샘플 차트 |
| workOrders | `home.workOrders` | 0,35 · 14×14 | 샘플 그리드 |
| alarms | `home.alarms` | 14,35 · 10×7 | 샘플 |
| defect | `home.defect` | 14,42 · 10×7 | 샘플 차트 |
| shipments | `home.shipments` | 0,49 · 24×10 | 샘플 그리드 |

- 이 표가 `HOME_DEFAULT_LAYOUT` 이다(시안과 같다). 기본 배치에서는 아무 위젯도 잠그지 않는다(시안의 「주요 지표」 잠금은 잠금 동작을 보이기 위한 예시다).

- 지금 카드 안 내용(조회·그리드·차트·선택 상태)은 그대로 옮기고 카드 바깥(제목 줄)만 `WidgetFrame` 으로 바꾼다. `DashboardCard` 의 `subtitle` 은 메타 `subtitle` 로, `actions` 는 `<WidgetHeaderActions>` 로, `children(size)` 는 `useWidgetBodySize()` 로 옮긴다.
- 공지 위젯·긴급 공지 띠·알림 위젯이 공지 목록과 선택 상태를 함께 쓰므로, 화면 수준 상태 대신 `page-components/home/notice-store.ts`(구독형 저장소)에 둔다. 「내용 보기」는 공지를 고르고 공지 위젯이 현재 탭에 있으면 그 위젯으로 스크롤한다(다른 탭의 위젯을 열지는 않는다 — 위젯끼리 연동은 범위 밖).
- 기존 localStorage `dmes:dash:v3:{userId}:mcm.home.layout` 은 읽지 않는다(행 단위 배치라 좌표로 옮길 근거가 약하다). 처음에는 모두 새 기본 배치로 보인다.
- `LayoutControls.tsx` 는 `WidgetWorkspace` 의 편집 버튼으로 대체한다.

## 6. 오류 처리

| 상황 | 동작 |
|---|---|
| 위젯 본체 로딩 실패·렌더 중 예외 | 그 위젯 틀 안에만 「위젯을 불러오지 못했습니다 [다시 시도]」. 다른 위젯·보드는 영향 없음(위젯별 오류 경계) |
| 위젯 조회 실패(`useWidgetStatus` error) | 틀 안에 메시지와 [다시 시도] |
| `search` 실패 | 「홈」 탭을 코드 기본 배치로 보이고 탭 줄 위에 「저장한 위젯 화면을 불러오지 못했습니다 [다시 시도]」 띠. 이 상태에서는 [배치 편집] 비활성(빈 상태를 저장해 덮어쓰지 않게) |
| `saveTab` 실패 | 알림(notification)으로 메시지를 보이고 편집 모드와 변경 내용을 유지한다 |
| 서버 검사 거절 | 서버 메시지를 그대로 알림으로 보인다 |

## 7. 시험

- **shared 단위**(`tests/unit/widget-layout.unit.test.ts`): `sanitizeLayout`(격자 밖·겹침·min/max), 기본 배치 맞춤, 추가 자리(맨 아래 왼쪽), 키보드 옮기기·크기 조절(잠긴 위젯 비켜 가기), 변경 비교.
- **shared 컴포넌트**: `WidgetFrame` 오류 경계(본체 예외 시 다른 위젯 유지), `WidgetTabs` 「홈」 삭제 불가·이름 규칙, `WidgetWorkspace` 편집→취소 시 원상 복구.
- **코드 생성**: ID 중복·폴더 불일치·크기 범위 위반에서 실패하는지.
- **백엔드**(SQLite): `SecWidgetServiceTest` — IDOR 치환, 탭·위젯 한도, 이름 중복, `home` 삭제 거절, `saveTab` 전체 교체, `resetHome`. OASIS 서비스 시험 `SecWidgetOasisServiceTest`.
- **E2E**(ego-browser): 배치 편집 → 위젯 끌기·8방향 크기 조절·추가·빼기 → 완료 → 새로 고침 후 유지, 위젯 잠금 시 다른 위젯이 비켜 감, 탭 추가·이름 바꾸기·잠금·지우기, 「홈」 기본 배치로 되돌리기.

## 8. 결정 기록

| ID | 결정 | 이유 |
|---|---|---|
| W-D1 | 위젯 = 화면 컴포넌트 = 프로그램. 범용 위젯도 설정 받는 프로그램 | 사용자 정의. 코드 위젯·설정형 위젯 구분이 없어져 체계가 하나가 된다 |
| W-D2 | 격자 + 세로 당김, react-grid-layout | 사용자 선택. 자유 배치·8방향 크기 조절·`static` 잠금을 기본 제공 |
| W-D3 | 24칸 × 세로 20px | 손으로 끌 때 거의 자유롭게 느껴지면서 칸 정렬은 유지 |
| W-D4 | 넓은 화면 배치만 저장 | 화면 폭별 편집은 사용 빈도 대비 복잡도가 크다(YAGNI) |
| W-D5 | 편집은 [완료]·[취소] 명시 저장 | 서버 저장이라 끌 때마다 저장하면 요청이 많고 되돌리기가 어렵다 |
| W-D6 | 탭 한 줄 + 인스턴스 여러 줄 테이블 | C 의 인스턴스 설정·B 의 위젯 폐기 처리가 줄 단위를 필요로 한다 |
| W-D7 | 「홈」 미저장이면 코드 기본 배치 | 관리자 기본 배치 화면(B) 전까지 가장 단순한 출발점 |
| W-D8 | 기존 행 배치 localStorage 는 이전하지 않음 | 행 단위 → 좌표 변환 근거가 약하고 미커밋 신규 화면이라 쌓인 사용자 값이 거의 없다 |
| W-D9 | 기존 `DashboardBoard` 는 이번에 지우지 않음 | 삭제는 사용자 승인 사항. 홈 이전 후 따로 묻는다 |
| W-D10 | 메타(`widget.meta.ts`)와 본체(`widget.tsx`) 분리 | 서랍은 전체 메타만 필요, 본체는 지연 로딩 |
| W-D11 | 동시 편집은 나중 저장 승리 | 개인 화면이라 충돌 가능성이 낮다 |
| W-D12 | 편집은 24칸 화면에서만 | 좁은 화면에서 옮긴 결과를 넓은 화면 좌표로 되돌릴 규칙이 없다. 다시 흘린 배치는 보기 전용으로 둔다 |
| W-D13 | 칸 수·편집 가능 판정은 서랍 자리를 포함한 작업 공간 바깥 폭으로 한다. 보드가 잰 폭은 격자 픽셀 폭으로만 쓴다 | 서랍을 열면 보드가 좁아져 칸 수가 진동한 결함(E2E D1) |
| W-D14 | 24칸 문턱을 1200 에서 960px 로 낮춘다(2026-10-02 사용자 결정) | 1440 창+사이드바(1160)와 1280 노트북+사이드바(약 1000)에서도 24칸 배치·편집을 쓰게 |
