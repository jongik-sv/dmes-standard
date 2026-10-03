# 위젯 B·C·D — 위젯관리 · 부서별 기본 배치 · 범용 위젯 · 정보·미디어·AI 위젯

- 날짜: 2026-10-02
- 선행: [위젯 기반(A)](2026-10-02-widget-foundation-design.md) — dev 병합(1237bd00). 이 문서는 A 위에 얹고, A 의 결정(W-D1~W-D15)은 바꾸지 않는 한 그대로 따른다.
- 출처: `docs/idea.md` §위젯 기능, 2026-10-02 사용자 문답
- 진행: 사용자 부재 중 자율 개발(스펙·계획 승인 위임). 단계별(B→C→D) 리뷰·E2E 통과 뒤 dev 병합, push 없음.

## 0. 범위와 사용자 결정

| 과제 | 이 문서 범위 |
|---|---|
| **B 위젯관리** | 위젯 목록·사용 여부, 코드 위젯 메타 덮어쓰기, 전사·부서별 「홈」 기본 배치 편집 |
| **C 범용 위젯** | 관리자가 코드 없이 정의: 쿼리 표·차트·숫자, md, html, 웹 주소, 링크 모음 |
| **D 특수 위젯** | 환율, 날씨, 미디어(이미지·동영상), AI 챗봇 |

사용자 결정(2026-10-02):

| 질문 | 답 |
|---|---|
| B 범위 | 목록·사용 여부, 이름·설명·크기 덮어쓰기, 홈 기본 배치 편집. **권한(RBAC)은 뺀다** |
| 사용 중지된 위젯이 사용자 탭에 있을 때 | **자리를 지키고 빈 칸**(「사용 중지된 위젯입니다」)을 그린다. 사용자는 ✕ 로 뺄 수 있다. 다시 사용하면 내용이 돌아온다 |
| 기본 배치 변경 시 이미 「홈」을 저장한 사용자 | **영향 없음** |
| 기본 배치 단위 | **부서별 기본 배치도 둔다**. 사용자는 지금처럼 자기 「홈」을 따로 배치한다 |
| 설계 산출물 | 이 스펙이 설계 정본(5종 산출물 작성 안 함 — 레거시 As-Is 없는 신규 화면) |
| 범용 위젯 정의 주체 | **관리자가 정의, 사용자는 놓기만**(배치·크기·탭은 A 그대로 사용자 몫) |
| 범용 유형 | 쿼리 표·차트·숫자, md, html, 웹 주소·화면 링크 |
| 쿼리 데이터소스 | **모듈 DB 선택**. 이번에는 mcm 만 실행하고 다른 모듈은 같은 실행기를 붙이면 되게 둔다 |
| SQL 매개변수 | **시스템 변수만**(`:userId` 등) |
| html 스크립트 | **둘 다** — 기본은 정화, 관리자가 「스크립트 허용」을 켜면 격리 iframe |
| 웹검색 위젯 | **뺀다**(브라우저로 충분). 대신 환율·날씨·웹페이지 링크·미디어 위젯 |
| LLM | **공급자 교체형** — OpenAI 호환(사내 Ollama·vLLM 포함)·Claude API 를 설정으로 고른다 |
| 챗봇 역할 | 일반 대화 + 포털 화면 안내 + 데이터 질의(관리자가 지정한 쿼리 위젯만 도구로) |
| 환율·날씨 출처 | **키 없는 공개 API 기본**(Open-Meteo·Frankfurter), 국내 기관 API 는 키를 넣으면 쓰는 두 번째 제공자. 일자별 환율은 DB 에 쌓는다 |
| 미디어 파일 | **업로드 + 주소 둘 다** |
| 챗봇 대화 기록 | **사용자별 저장** |
| shared `widget/*` 변경 | **허락** — 위젯 모듈 안에서는 필요한 대로 확장·수정. 다른 shared 컴포넌트는 새로 만들기만 한다 |

제외: 위젯별·역할별 권한, 사용자 인스턴스 설정 편집(사용자는 놓기만), 웹검색, 다른 모듈 DB 실제 실행(mcm 만), 위젯끼리 연동, 챗봇 스트리밍 응답, 실시간 공동 편집.

## 1. 개념 — 위젯 정의 두 갈래

A 의 W-D1(위젯 = 프로그램)을 유지하면서 관리자가 코드 없이 위젯을 만들 수 있게, 위젯을 두 갈래로 나눈다.

| 갈래 | ID | 본체 | 메타 출처 | 관리자가 바꿀 수 있는 것 |
|---|---|---|---|---|
| **코드 위젯** | `{group}.{name}` (예: `home.notice`) | `widgets/{group}/{name}/widget.tsx` | `widget.meta.ts` + DB 덮어쓰기 행 | 이름·부제·설명·크기·새로 고침·화면 열기·여러 번·사용 여부 |
| **정의 위젯** | `def.{key}` (예: `def.k3x9q2ab`) | **위젯 유형**의 렌더러(`widget-types/{type}/renderer.tsx`) | DB 정의 행 | 위 항목 전부 + 유형별 설정(SQL·md·URL 등) |

- **위젯 유형**도 코드 프로그램이다. 유형 하나 = 폴더 하나(`type.meta.ts` + `renderer.tsx` + `editor.tsx`). 유형 렌더러는 정의 설정(`definition`)을 받아 그린다. 새 유형은 개발자가 폴더를 추가해 늘린다(W-D1 유지: 범용 위젯도 "설정을 받는 위젯 프로그램").
- **정의 설정**(관리자 값, `TB_MCM_WIDGET_DEF.CONFIG_JSON`)과 **인스턴스 설정**(사용자 배치 값, `TB_MCM_SEC_USER_WIDGET.CONFIG_JSON`)은 다른 값이다. 이번 범위에서 인스턴스 설정은 계속 null 이다(사용자는 놓기만).
- 코드 위젯의 DB 행은 **덮어쓰기가 있을 때만** 생긴다. 행이 없으면 코드 메타 그대로, 사용 중으로 본다(동기화 작업 없음).

### 1.1 실행 시 등록부(runtime registry)

화면은 다음 셋을 합쳐 실행 시 등록부를 만든다. 합치는 일은 shared 순수 함수 `mergeWidgetRegistry` 가 한다(단위 시험 대상).

```
코드 등록부(WIDGET_REGISTRY, 생성물)
  + 유형 등록부(WIDGET_TYPE_REGISTRY, 생성물)
  + DB 정의·덮어쓰기 행(widgetDef/list 응답)
  → WidgetRegistry (사용 중지 항목 포함, meta.disabled 로 표시)
```

| 경우 | 결과 |
|---|---|
| 코드 위젯 + 덮어쓰기 행 없음 | 코드 메타 그대로 |
| 코드 위젯 + 덮어쓰기 행 | 행의 비어 있지 않은 값이 코드 메타를 덮는다. `USE_YN='N'` 이면 `disabled: true` |
| 덮어쓰기 행만 있고 코드 위젯이 없음 | 등록부에 넣지 않는다(코드에서 사라진 위젯 = A §4.4 「없는 위젯」) |
| 정의 행 + 유형 등록부에 유형 있음 | 행 메타 + `load` = 유형 렌더러를 감싸 `definition` 을 넘기는 본체 |
| 정의 행 + 유형이 없음 | 등록부에 넣지 않는다(없는 위젯) + 콘솔 경고 |

- `widgetDef/list` 가 실패하면 코드 등록부만으로 보이고 **[배치 편집]을 막는다**. 정의 위젯이 「없는 위젯」으로 보이는 상태에서 저장하면 사용자 탭에서 정의 위젯이 지워지기 때문이다(A §4.4). 탭 줄 위에 「위젯 정의를 불러오지 못했습니다 [다시 시도]」 띠를 보인다.
- 사용 중지(`disabled`)와 없는 위젯은 다르다. 사용 중지 위젯은 등록부에 남아 저장할 때 보존된다.

## 2. shared `@dk-oasis/shared/widget` 변경 (계약 고정)

```ts
export interface WidgetMeta {
  // A 의 필드 전부 유지 +
  /** 관리자가 사용 중지. 서랍에 안 보이고, 놓인 자리는 빈 칸으로 그린다. */
  disabled?: boolean;
  /** "code" | "def" — 서랍·관리 화면 표시용. 없으면 "code". */
  kind?: "code" | "def";
  /** 정의 위젯의 유형 ID(예: "query-table"). 코드 위젯은 없음. */
  typeId?: string;
}

export interface WidgetProps {
  instanceId: string;
  size: WidgetSize;
  config: unknown;          // 인스턴스 설정(이번에도 늘 null)
  refreshKey: number;
  /** 정의 위젯의 정의 설정(TB_MCM_WIDGET_DEF.CONFIG_JSON 파싱값). 코드 위젯은 null. */
  definition: unknown | null;
  /** 위젯 ID(정의 위젯이 자기 defId 로 서버를 부를 때 쓴다). */
  widgetId: string;
  /** 틀 제목(등록부 meta.title). 선택 — 쿼리 표 엑셀 파일 이름에 쓴다(2026-10-03 추가, §17.5). */
  title?: string;
}

/** 위젯 유형 — 정의 위젯의 본체. widget-types/{type}/ 폴더 하나. */
export interface WidgetTypeMeta {
  id: string;                 // "query-table" — 폴더 이름과 같다
  title: string;              // "쿼리 표"
  description?: string;
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  bodyPadding?: boolean;
  /** 새 정의를 만들 때 넣는 초기 설정. */
  initialConfig: unknown;
}

export interface WidgetTypeEditorProps<C = unknown> {
  value: C;
  onChange: (next: C) => void;
  /** 편집기가 검사한 오류(저장 막기용). 빈 배열이면 저장 가능. */
  onValidate?: (errors: string[]) => void;
}

export interface WidgetTypeRegistryEntry {
  meta: WidgetTypeMeta;
  loadRenderer: () => Promise<{ default: unknown }>;  // (props: WidgetProps) => ReactNode
  loadEditor: () => Promise<{ default: unknown }>;    // (props: WidgetTypeEditorProps) => ReactNode
}
export type WidgetTypeRegistry = Readonly<Record<string, WidgetTypeRegistryEntry>>;

/** widgetDef/list 응답 한 줄(서버 DTO 그대로, 화면이 파싱). */
export interface WidgetDefRow {
  widgetId: string;
  srcTp: "C" | "D";           // C=코드 위젯 덮어쓰기, D=정의 위젯
  typeId: string | null;
  title: string | null; subtitle: string | null; description: string | null;
  defW: number | null; defH: number | null; minW: number | null; minH: number | null;
  maxW: number | null; maxH: number | null;
  refreshSec: number | null; linkPageId: string | null;
  multipleYn: "Y" | "N" | null; useYn: "Y" | "N";
  config: unknown | null;     // CONFIG_JSON 파싱값
}

export function mergeWidgetRegistry(
  code: WidgetRegistry, types: WidgetTypeRegistry, defs: readonly WidgetDefRow[]
): WidgetRegistry;
```

| 단위 | 변경 |
|---|---|
| `widget-registry.ts`(새 파일) | `mergeWidgetRegistry` 순수 함수. 정의 위젯의 `load` 는 유형 렌더러를 불러와 `definition` 을 끼워 넣는 본체를 돌려준다 |
| `WidgetFrame` | `meta.disabled` 면 본체를 불러오지 않고 「사용 중지된 위젯입니다」 빈 칸(보기·편집 모두). 편집 모드에서는 ✕ 로 뺄 수 있다. 본체에 `definition`·`widgetId` 를 넘긴다 |
| `WidgetPicker` | `disabled` 항목은 보이지 않는다. `kind:"def"` 항목에 유형 이름을 작은 글씨로 보인다 |
| `WidgetWorkspace` | 새 props: `registryStatus?: "ready" \| "loading" \| "error"`(기본 ready. loading·error 면 [배치 편집]을 막고, error 면 띠와 `onRetryRegistry?` [다시 시도]), `typeTitles?: Record<유형ID, 이름>`(서랍이 정의 위젯 옆에 유형 이름을 보인다), `singleTab?: { title: string }`(탭 줄 숨김, 「홈」 탭 하나만 — 관리자 기본 배치 편집용), `homeDefault` 는 그대로(화면이 서버 값 또는 코드 상수를 넘긴다) |
| `WidgetStore` | 변경 없음. 관리자 기본 배치 편집은 같은 인터페이스를 구현한 어댑터로 붙인다(`saveTab`→`saveLayout`, `resetHome`→`deleteLayout`, `load`→그 키의 배치) |
| `index.ts` | 새 타입·함수 export |
| 문서 | `mantine-aggrid-ui` 스킬 `references/components/widget.md` 와 색인 갱신 |

## 3. 위젯 유형 등록부와 폴더

```
src/frontend/m-mcm/widget-types/{typeId}/
  type.meta.ts    // export const meta: WidgetTypeMeta
  renderer.tsx    // default export (props: WidgetProps) => ReactNode — props.definition 사용
  editor.tsx      // default export (props: WidgetTypeEditorProps) => ReactNode — 관리 화면 설정 칸
```

- `generate-widget-registry.mjs` 가 `widget-types/*` 도 훑어 `lib/generated/widget-type-registry.ts`(`WIDGET_TYPE_REGISTRY`)를 쓴다. 검사: `id` 가 폴더 이름과 같은지, 세 파일이 다 있는지, ID 중복. 어기면 생성 실패.
- 유형 ID 는 소문자·숫자·하이픈. 이번 유형 11개:

| 유형 ID | 이름 | 과제 | 기본 크기 |
|---|---|---|---|
| `query-table` | 쿼리 표 | C | 12×12 |
| `query-chart` | 쿼리 차트 | C | 12×12 |
| `query-number` | 쿼리 숫자 | C | 12×6 |
| `markdown` | 글(md) | C | 8×10 |
| `html` | html | C | 8×10 |
| `web` | 웹 주소 | C | 12×16 |
| `links` | 링크 모음 | C | 6×10 |
| `exchange` | 환율 | D | 8×10 |
| `weather` | 날씨 | D | 8×8 |
| `media` | 미디어 | D | 8×10 |
| `chat` | AI 챗봇 | D | 8×18 |

## 4. 저장 (mcm-core, 스키마 `MCMAPUSER`, 감사 컬럼은 `McmAuditEntity` 9컬럼)

A 와 같은 방식: 로컬은 `ddl-auto: update`, 개발계·운영계는 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 등재해 사전 생성(Flyway 없음). 컬럼 형은 Oracle·PostgreSQL·SQLite 공통. **긴 문자열**(`CONFIG_JSON`·`CONTENT`)은 `@Lob` 을 쓰지 않고(PostgreSQL 에서 oid 로 매핑됨) `@JdbcTypeCode(SqlTypes.LONG32VARCHAR)` 로 둔다 — SQLite 시험에서 4000자 넘는 값 저장·조회를 확인한다.

### 4.1 `TB_MCM_WIDGET_DEF` — 위젯 정의·덮어쓰기 (B·C·D)

| 컬럼 | 형 | 설명 |
|---|---|---|
| `WIDGET_ID` (PK) | VARCHAR(100) | 코드 위젯 ID 또는 `def.{key}` |
| `SRC_TP` | CHAR(1) | `C` 코드 덮어쓰기 · `D` 정의 |
| `TYPE_ID` | VARCHAR(40) | 정의 위젯 유형. `C` 는 NULL |
| `TITLE` | VARCHAR(100) | `D` 는 필수, `C` 는 NULL 이면 코드 값 |
| `SUBTITLE` | VARCHAR(100) | |
| `DESCRIPTION` | VARCHAR(400) | |
| `DEF_W`·`DEF_H`·`MIN_W`·`MIN_H`·`MAX_W`·`MAX_H` | INTEGER | NULL 이면 코드(또는 유형) 값 |
| `REFRESH_SEC` | INTEGER | NULL 이면 없음(`C` 는 코드 값). 30 미만 거절 |
| `LINK_PAGE_ID` | VARCHAR(200) | 「화면 열기」 pageId |
| `MULTIPLE_YN` | CHAR(1) | NULL 이면 코드 값(기본 Y) |
| `USE_YN` | CHAR(1) | 기본 Y |
| `DATA_SRC` | VARCHAR(20) | 쿼리 유형의 실행 모듈(`mcm`). 그 밖 유형은 NULL |
| `CONFIG_JSON` | LONG32VARCHAR | 정의 설정(유형별 §6). `C` 는 NULL |

- `def.{key}` 의 key 는 서버가 만든다(소문자+숫자 8자, **첫 글자는 소문자** — shared `validateWidgetMeta` 의 ID 정규식 `^[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$` 를 통과해야 한다. 중복이면 다시).
- `DATA_SRC` 를 `CONFIG_JSON` 밖에 두는 이유: 실행 모듈별 조회·검사를 SQL 로 하려고.

### 4.2 `TB_MCM_WIDGET_DEFAULT_LAYOUT` — 「홈」 기본 배치 (B)

| 컬럼 | 형 | 설명 |
|---|---|---|
| `LAYOUT_KEY` (PK) | VARCHAR(30) | `*` 전사 · 그 밖 `DEPT_CD` |
| `INST_ID` (PK) | VARCHAR(40) | |
| `WIDGET_ID` | VARCHAR(100) | |
| `POS_X`·`POS_Y`·`SIZE_W`·`SIZE_H` | INTEGER | 24칸 좌표 |
| `LOCK_YN` | CHAR(1) | 기본 배치에서 잠근 위젯(사용자 「홈」 에 복사될 때 잠금 유지) |

- 한 키의 행이 하나라도 있으면 그 키의 배치가 있다고 본다. 빈 기본 배치는 두지 않는다(YAGNI).
- **적용 순서**: 사용자 `DEPT_CD` → `TB_MCM_DEPT_INFO.UPPER_DEPT_CD` 를 따라 위로(최대 10단, 순환 방지) → `*` → 없으면 화면 코드 상수 `HOME_DEFAULT_LAYOUT`.
- 기본 배치는 사용자 「홈」을 저장한 적 없는 사용자와 「기본 배치로 되돌리기」를 누른 사용자에게만 보인다(이미 저장한 사용자는 영향 없음).

### 4.3 `TB_MCM_WIDGET_MEDIA` — 미디어 파일 (D)

| 컬럼 | 형 | 설명 |
|---|---|---|
| `FILE_ID` (PK) | VARCHAR(40) | 서버 생성(UUID 하이픈 제거 32자) |
| `ORIG_NM` | VARCHAR(200) | 원래 파일 이름 |
| `CONTENT_TYPE` | VARCHAR(100) | 허용 목록 값만 |
| `FILE_SIZE` | BIGINT | 바이트 |

- 파일 본체는 DB 가 아니라 `dmes.widget.media-dir`(기본 `./data/widget-media`) 아래 `{FILE_ID}`(확장자 없음)로 둔다. 경로는 FILE_ID 로만 만들어 경로 조작을 막는다.
- 허용: `image/png`·`image/jpeg`·`image/gif`·`image/webp`(10MB 이하), `video/mp4`·`video/webm`(100MB 이하). **SVG 는 받지 않는다**. 형식은 확장자와 파일 앞 바이트(매직 넘버)를 함께 본다.

### 4.4 `TB_MCM_EXCHANGE_RATE` — 일자별 환율 (D)

| 컬럼 | 형 | 설명 |
|---|---|---|
| `RATE_DATE` (PK) | CHAR(8) | `yyyyMMdd` |
| `BASE_CUR` (PK) | CHAR(3) | 기준 통화(`KRW`) |
| `QUOTE_CUR` (PK) | CHAR(3) | 대상 통화 |
| `RATE` | NUMERIC(20,8) | 대상 통화 1단위의 기준 통화 값(1 USD = 1,380.12 KRW) |
| `SOURCE` | VARCHAR(20) | `frankfurter`·`koreaexim` |

### 4.5 `TB_MCM_SEC_USER_WIDGET_CHAT` — 챗봇 대화 기록 (D)

| 컬럼 | 형 | 설명 |
|---|---|---|
| `USER_ID` (PK) | VARCHAR(30) | 인증 컨텍스트 |
| `INST_ID` (PK) | VARCHAR(40) | 위젯 인스턴스 |
| `MSG_SEQ` (PK) | INTEGER | 1부터 |
| `ROLE_TP` | VARCHAR(10) | `user`·`assistant` |
| `CONTENT` | LONG32VARCHAR | 본문 |
| `LINKS_JSON` | VARCHAR(4000) | 답에 붙은 화면 링크 `[{pageId,title}]` |

- 인스턴스당 최근 100개만 남긴다(넘으면 오래된 것부터 지움). 사용자가 위젯을 빼도 기록은 남고 [새 대화]로 지운다.

## 5. 서비스 (OASIS, 계약 고정)

공통: 요청은 CactusRequest 표준(params·grids), 응답은 `data.result`. `userId`·`deptCd` 는 언제나 인증 컨텍스트 값으로 바꾼다(IDOR 방지, A 와 같음). 서비스 클래스에 `@Transactional` 을 붙이지 않고 원자성은 별도 Writer 빈으로 확보한다(A 와 같음).

### 5.1 사용자용 — 로그인만 되면 누구나(AUTH_ONLY)

BE `EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES` 와 FE `m-mcm/proxy.ts` `authOnlyPrefixes` 에 함께 등록한다.

| 서비스/action | 입력 | 출력 | 과제 |
|---|---|---|---|
| `widgetDef/list` | — | `{ defs: WidgetDefRow[], homeDefault: WidgetItem[] \| null, homeDefaultKey: string \| null }` — 사용자 부서 기준 기본 배치(§4.2 순서), 없으면 null. **모든 사용자가 부르므로 `configJson` 에서 서버 전용 키를 지우고 돌려준다**(`query-*`: `sql`, `chat`: `systemPrompt`·`dataQueryDefIds`). 관리자 `commWidgetMng/search` 는 전부 돌려준다. **화면 목록에서 숨길 뿐 비밀 보장은 아니다** — `chat` 의 `systemPrompt` 와 고른 쿼리 위젯의 ID·제목·설명은 매 요청 LLM 지시문·도구 설명으로 들어가 대화로 드러날 수 있다(2026-10-03 보안 지적, §6 `chat` 편집기 안내) | B |
| `widgetData/run` | `defId` | `{ columns: string[], rows: [...], truncated: boolean }` | C |
| `widgetExt/exchange` | `base`(KRW), `symbols`(목록), `days`(1~90) | `{ latest: [{cur, rate, diff, date}], history: [{date, cur, rate}] }` | D |
| `widgetExt/weather` | `lat`, `lon` | `{ current: {temp, code, wind, humidity}, daily: [{date, min, max, code, pop}] }` | D |
| `widgetChat/history` | `instId` | `{ messages: [{seq, role, content, links}] }` | D |
| `widgetChat/send` | `instId`, `defId`, `message`(1~2000자) | `{ reply: {seq, role, content, links} }` | D |
| `widgetChat/reset` | `instId` | — | D |
| 미디어 파일 | FE `GET /api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/{fileId}` → BE `GET /api/mcm/widgetMedia/file/{fileId}`(REST 신경로 규약: `/api/{module}/rest/{objId}/{action}/{backendPath}`) | 바이너리(`nosniff`, `inline`, Range 지원) | D |

- `widgetData/run` 은 **defId 만 받는다. 요청 본문의 SQL 은 어떤 경우에도 실행하지 않는다.** 정의가 `USE_YN='Y'` 이고 유형이 `query-*` 일 때만 실행한다.
- `widgetChat/send` 는 `defId` 정의가 `chat` 유형이고 사용 중일 때만 동작한다.

### 5.2 관리자용 — 위젯관리 화면 메뉴 권한(RBAC)으로 보호

화면 objId `commWidgetMng`. 기존 화면처럼 `SEC_OBJ`·`SEC_MENU` 에 등록하고 역할 매핑으로 권한을 준다(권한 관리 기능을 새로 만들지 않는다는 뜻이지, 관리 화면을 아무에게나 연다는 뜻이 아니다). 로컬 시드는 기존 CSA 화면을 등록한 방식을 따른다.

| action | 입력 | 동작 |
|---|---|---|
| `search` | — | `{ defs, usage }` — 정의·덮어쓰기 행 전체(+`userCount`)와 `usage`(`TB_MCM_SEC_USER_WIDGET` 에서 `WIDGET_ID` 별 DISTINCT `USER_ID` 수, DB 행이 없는 코드 위젯 포함) |
| `save` | 정의 행 1개 | `D` 신규면 ID 생성 후 insert, 그 밖 upsert. 검사 §5.3 |
| `delete` | `widgetId` | `D` 는 사용자 수 0 일 때만 지운다(그 밖 거절: 「사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요」). `C` 는 덮어쓰기 행을 지운다(= 코드 값으로 되돌리기). action 이름은 PERM_ALL 의 기존 토큰 `delete` 를 쓴다 |
| `previewQuery` | `dataSrc`, `sql` | 저장 전 SQL 시험 실행. 관리자 본인 시스템 변수로, 행 상한 50 |
| `searchLayouts` | — | 기본 배치가 있는 키 목록 `[{layoutKey, deptNm, count}]` |
| `loadLayout` | `layoutKey`, `effective`(Y·N) | 그 키의 배치 `{ layoutKey, sourceKey, items }`. `effective='Y'` 이고 그 키에 행이 없으면 그 부서의 상위 부서 → `*` 순서로 처음 찾은 배치를 돌려주고 `sourceKey` 에 실제 키를 적는다(새 부서 배치의 시작점). 아무것도 없으면 `items=[]`·`sourceKey=null`(화면이 코드 상수를 쓴다) |
| `saveLayout` | `layoutKey` + 위젯 목록 | 그 키를 통째로 바꾼다(지우고 다시 넣기, 한 트랜잭션). 좌표 검사는 A 와 같음 |
| `deleteLayout` | `layoutKey` | 그 키의 배치를 지운다 |
| `searchDepts` | `keyword` | 부서 고르기(`TB_MCM_DEPT_INFO` `USE_TP='Y'`) — 기존 부서 조회가 재사용 가능하면 그것을 쓴다 |
| 미디어 올리기 | FE `POST /api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload`(multipart, 필드 `file`) → BE `POST /api/mcm/commWidgetMng/upload` | `{ fileId, origNm, contentType, size }` |

- PERM_ALL 토큰: `search`·`save`·`delete` 는 기존 값, `previewQuery`·`searchLayouts`·`loadLayout`·`saveLayout`·`deleteLayout`·`searchDepts`·`upload` 는 Task 0 에서 `DataInitializer` 에 더했다(여기 없는 action 은 SYSADMIN 도 403).
- 실행되는 action 은 **URL 경로의 action 하나뿐**이다. 요청 본문 `params`·`grids` 에 `action` 키가 있으면 cactus `CactusRequestConverter` 가 BPMN 시작 전에 E002 로 거절한다(2026-10-03 보안 지적 — 본문 값이 경로 action 을 덮어쓰면 URL 로 판정한 권한과 BPMN 이 분기하는 action 이 달라진다). 그래서 action 별 권한(예: `previewQuery` 만 빼고 주기)과 §5.1 AUTH_ONLY 의 서비스/action 단위 개방이 실제 실행 범위와 같다.

### 5.3 서버 검사

- 공통: `TITLE` 1~50자, 크기는 1 이상 정수이고 `MIN ≤ DEF ≤ MAX`, `DEF_W ≤ 24`, `REFRESH_SEC` 은 NULL 또는 30~86400.
- `D` 는 `TYPE_ID` 필수. 서버는 유형 목록을 모르므로(프런트 생성물) 형식만 본다(`^[a-z0-9-]{1,40}$`). 알 수 없는 유형은 화면이 「없는 위젯」으로 처리한다.
- 쿼리 유형(`query-*`): `DATA_SRC` 는 지금 `mcm` 만 허용(그 밖: 「아직 지원하지 않는 모듈입니다」). `CONFIG_JSON.sql` 은 §7.1 검사를 저장 때도 한다.
- `CONFIG_JSON` 은 JSON 으로 파싱되어야 하고 200KB 이하.
- `html` 의 `allowScript`, `web` 의 URL 은 §6 규칙.

## 6. 유형별 정의 설정(`CONFIG_JSON`)

| 유형 | 설정 | 렌더러 동작 |
|---|---|---|
| `query-table` | `{ sql, columns?: [{field, header?, width?, align?: "left"\|"right"\|"center", format?: "number"\|"date"\|"text"}] }` | `widgetData/run` 결과를 `AgDataGrid`(shared)로. `columns` 없으면 결과 컬럼 전부. `truncated` 면 아래에 「상위 500행만 표시」 |
| `query-chart` | `{ sql, chartType: "bar"\|"line"\|"area"\|"pie", xField, series: [{field, label?}] }` | shared `charts` 컴포넌트로. 본문 크기는 `useWidgetBodySize` |
| `query-number` | `{ sql, labelField, valueField, unitField?, unit?, format?: "number"\|"percent" }` | 결과 행마다 숫자 타일(최대 8개). shared `KpiTile` 재사용 |
| `markdown` | `{ markdown }` | `marked` → `dompurify` 정화 → 포털 안에 그대로 |
| `html` | `{ html, allowScript: boolean }` | `false`: `dompurify` 정화 후 포털 안에. `true`: `<iframe sandbox="allow-scripts" srcdoc>` — **`allow-same-origin` 은 절대 넣지 않는다**(둘을 함께 주면 sandbox 를 벗어난다). 높이는 위젯 칸을 채운다 |
| `web` | `{ url }` | http(s) 만. 포털과 같은 출처 주소는 거절(화면은 `links` 로). `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer">` + 제목 줄 [새 탭으로 열기]. 사이트가 iframe 을 막으면(X-Frame-Options·CSP) 브라우저가 빈 화면을 보이므로, 본문 아래에 「화면이 보이지 않으면 [새 탭으로 열기]」 안내를 늘 둔다 |
| `links` | `{ items: [{label, kind: "page"\|"url", pageId?, url?}] }` | 목록. `page` 는 `openPortalPage`, `url` 은 새 탭(`noopener`) |
| `exchange` | `{ base: "KRW", currencies: string[], days: number }` | 최신 환율 표(전일 대비 ▲▼) + `days` 일 추이 작은 선 차트(`Sparkline`) |
| `weather` | `{ locations: [{name, lat, lon}] }` | 지점별 현재 기온·날씨 아이콘·바람·습도 + 3일 예보. 지점이 둘 이상이면 위쪽 탭 |
| `media` | `{ items: [{kind: "image"\|"video"\|"youtube", src, caption?}], intervalSec?: number, fit: "contain"\|"cover" }` | `src` 는 `media:{fileId}`(업로드) 또는 http(s) 주소. 여러 개면 `intervalSec`(기본 8초) 슬라이드 + 좌우 버튼. YouTube 는 `https://www.youtube-nocookie.com/embed/{id}` iframe |
| `chat` | `{ systemPrompt, welcome?, pageGuide: boolean, dataQueryDefIds: string[] }` | 대화 목록 + 입력 칸 + [새 대화]. 답의 `links` 는 [열기] 버튼(`openPortalPage`). 편집기의 시스템 프롬프트 칸 아래 안내 문구: 「도우미의 역할·말투·지켜야 할 규칙. 화면 목록에서는 숨기지만 대화 중에 사용자에게 드러날 수 있으니 비밀(내부 주소·인증키·공개하지 않는 정책 문구 등)은 넣지 마세요.」 |

- 편집기(`editor.tsx`)는 관리 화면 오른쪽 상세 영역에 들어간다. 쿼리 유형 편집기는 SQL 입력 칸(고정폭 글꼴 textarea) + [쿼리 시험] 버튼(`previewQuery`) + 결과 컬럼으로 필드 고르기를 둔다. 시스템 변수 목록을 편집기 안에 안내한다.

## 7. 쿼리 실행기 (C)

mcm-core `widget.query` 패키지의 `WidgetQueryExecutor`. mcm 업무 코드에 기대지 않고 `DataSource` 만 받게 만들어, 다른 모듈이 같은 클래스를 자기 DataSource 로 붙일 수 있게 한다(다른 모듈 실제 연결은 범위 밖).

### 7.1 SQL 검사(저장·미리보기·실행 모두)

1. 주석(`--`, `/* */`)과 문자열 리터럴을 걷어 낸 뒤 판단한다.
2. 첫 낱말이 `SELECT` 또는 `WITH` 여야 한다.
3. 끝의 `;` 하나는 지우고, 그 밖에 `;` 가 있으면 거절(여러 문장 금지).
4. 낱말 단위로 `INSERT UPDATE DELETE MERGE DROP ALTER CREATE TRUNCATE GRANT REVOKE EXEC EXECUTE CALL COMMIT ROLLBACK INTO PRAGMA ATTACH DETACH` 가 있으면 거절(`SELECT … INTO` 포함).
5. 이름 붙은 변수는 §7.2 목록만 허용. 모르는 `:name` 이 있으면 거절(시간 표기 `'10:30'` 은 리터럴이라 2단계에서 걷힌다).
6. 읽기 전용 트랜잭션이 막지 못하는 함수는 낱말 단위로 거절한다(2026-10-03 보안 지적, 「쓸 수 없는 함수가 있습니다: …」). PostgreSQL `pg_terminate_backend` `pg_cancel_backend` `pg_advisory_*` `pg_try_advisory_*` `pg_sleep*` `set_config` `pg_notify` `pg_reload_conf` `pg_rotate_logfile` `pg_read_file` `pg_read_binary_file` `pg_ls_dir` `pg_stat_file` `lo_import` `lo_export` `dblink*` `query_to_xml*` `cursor_to_xml*`, Oracle `UTL_HTTP` `UTL_TCP` `UTL_SMTP` `UTL_FILE` `UTL_INADDR` `HTTPURITYPE` `DBMS_LOCK` `DBMS_PIPE` `DBMS_ALERT` `DBMS_SCHEDULER` `DBMS_JOB` `DBMS_SQL` `DBMS_XMLGEN` `DBMS_XMLQUERY`, SQLite `load_extension`, SQL Server `OPENROWSET` `OPENDATASOURCE` `OPENQUERY`. 따옴표·대괄호 식별자로 불러도 걸리게 이 단계는 식별자 안 글자도 보고, 이스케이프로 이름을 숨길 수 있는 PostgreSQL `U&"…"` 식별자는 받지 않는다. `DBMS_` 전체를 막지는 않는다(`DBMS_LOB.SUBSTR` 같은 CLOB 조회). 이 목록은 **보조 방어선**이고 근본 대책은 실행기에 읽기 권한만 가진 DB 계정의 DataSource 를 붙이는 것이다(§7 실행기 운영 주의 — 아직 앱 기본 DataSource 를 쓴다).

### 7.2 시스템 변수

| 변수 | 값 |
|---|---|
| `:userId` | 인증 사용자 ID |
| `:deptCd` | 사용자 부서 코드(없으면 NULL) |
| `:today` | `yyyyMMdd` 문자열(서버 시간대 Asia/Seoul) |
| `:yesterday` | 어제 `yyyyMMdd` |
| `:monthStart` | 이달 1일 `yyyyMMdd` |
| `:now` | `java.sql.Timestamp` 현재 시각 |

### 7.3 실행 안전장치

- `NamedParameterJdbcTemplate`, `setMaxRows(501)`(501행이면 500행만 돌려주고 `truncated=true`), `setQueryTimeout(10초)`, `setFetchSize(100)`.
- 별도 트랜잭션(`TransactionTemplate`, `readOnly=true`)으로 실행하고 **늘 롤백**한다. `readOnly` 는 SQLite 에서 효과가 없으므로 §7.1 검사가 1차 방어선이다.
- 결과 값은 JSON 직렬화 가능한 형으로 바꾼다(`Timestamp`→ISO 문자열, `BigDecimal`→숫자, `Clob`→문자열 4000자까지).
- **결과 캐시**: 키 `(defId, SQL 이 쓰는 시스템 변수 값들)`, 30초. 사용자 여러 명의 자동 새로 고침이 같은 SQL 을 반복하지 않게 한다. 정의를 저장하면 그 defId 캐시를 비운다.
- 실행 오류는 DB 메시지를 그대로 내보내지 않는다. 사용자에게는 「위젯 데이터를 불러오지 못했습니다」, 서버 로그에는 defId 와 원인. 관리자 `previewQuery` 는 DB 메시지를 보여 준다(SQL 작성을 도우려고).

## 8. 외부 정보 (D)

### 8.1 환율

- 제공자 인터페이스 `ExchangeRateProvider`: `fetch(base, symbols, from, to) → [{date, cur, rate}]`.
  - 기본 `FrankfurterProvider` — `https://api.frankfurter.dev/v1/{from}..{to}?symbols=KRW,USD,…` 를 EUR 기준으로 받아 「1 외화 = KRW ÷ X」 교차 계산으로 「1 외화 = n KRW」 를 저장한다(유럽중앙은행 기준, 키 없음, 영업일만 있음. 처음 적은 base=KRW 역수 방식에서 구현 때 바꿨다. Frankfurter 는 VND 를 주지 않는다).
  - `KoreaEximProvider` — `dmes.widget.ext.exchange.koreaexim-key` 가 있을 때 쓴다(한국수출입은행 매매기준율).
  - 고르기: `dmes.widget.ext.exchange.provider`(`frankfurter` 기본·`koreaexim`).
- 조회 흐름: DB 에서 기간 값을 읽고, 빠진 날짜가 있으면(오늘 포함, 하루 한 번만 시도) 제공자로 채워 넣은 뒤 돌려준다. 제공자 실패면 DB 에 있는 값만 돌려주고 `stale: true` 를 붙인다.
- `dmes.widget.ext.enabled=false` 면 외부 호출을 하지 않는다(망 분리 환경).

### 8.2 날씨

- `WeatherProvider`: 기본 `OpenMeteoProvider`(`https://api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=3`, 키 없음).
- 캐시: 좌표(소수 둘째 자리 반올림)별 10분. 실패면 「날씨 정보를 불러오지 못했습니다」.
- 날씨 코드 → 이름·아이콘 표는 렌더러가 갖는다(WMO 코드).

### 8.3 공통

- HTTP 는 `RestClient` + 연결·읽기 시간 제한(3초·5초). **시험은 모두 가짜 HTTP**(`MockRestServiceServer`)로 하고 실제 네트워크를 쓰지 않는다.

## 9. AI 챗봇 (D)

### 9.1 LLM 공급자

```java
interface LlmClient {
  LlmReply chat(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools);
}
```

| 구현 | 설정(`dmes.widget.llm.*`) |
|---|---|
| `OpenAiCompatibleLlmClient` | `provider=openai`, `base-url`(예: 사내 Ollama `http://host:11434/v1`), `model`, `api-key`(없어도 됨) — `/chat/completions` + tools |
| `AnthropicLlmClient` | `provider=anthropic`, `model`(기본 `claude-sonnet-5-5`), `api-key` — Messages API + tool use |
| `FakeLlmClient` | `provider` 가 없으면 이것. 「AI 연결이 설정되지 않았습니다. 관리자에게 문의하세요.」 를 돌려준다. 시험은 각본을 넣을 수 있는 가짜를 쓴다 |

- 키는 서버 설정(환경 변수)에만 둔다. 화면·DB·로그에 남기지 않는다.
- 구현 담당은 LLM 코드를 쓰기 전에 `claude-api` 스킬을 먼저 불러 API 형식을 확인한다.

### 9.2 도구(tool) 호출

| 도구 | 켜는 조건 | 동작 |
|---|---|---|
| `find_screen(keyword)` | `pageGuide=true` | **그 사용자가 볼 수 있는 메뉴**(`secUser/myMenus` 와 같은 조회)에서 이름에 keyword 가 든 화면 최대 10개 `[{pageId, title, path}]`. 답에 쓰인 화면은 `links` 로 함께 돌려준다 |
| `run_widget_query(defId)` | `dataQueryDefIds` 에 든 defId 만 | §7 실행기로 실행(행 상한 50). 목록에 없는 defId 는 거절. 도구 설명에 각 정의의 제목·설명을 넣어 모델이 고르게 한다 |

- 모델이 SQL 을 만들어 실행하는 기능은 두지 않는다.
- 도구 반복은 최대 4번. 넘으면 그때까지의 답을 돌려준다.
- 문맥: 저장된 대화 최근 20개 + 이번 질문. 시스템 프롬프트 앞에 「너는 DMES 포털의 도우미다. 오늘은 {today}, 사용자는 {userNm}({deptNm}).」 를 붙인다.
- 실패(시간 초과 60초·공급자 오류): 「답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.」 를 assistant 로 저장하지 않고 오류로 돌려준다. 사용자 메시지는 저장한다.

## 10. 위젯관리 화면 (`mcm:csa/commWidgetMng`)

`page-components/csa/commWidgetMng/`. FE 표준(shared 래퍼, `mantine-aggrid-ui` 스킬, `PageLayout`)을 따른다. 탭 둘.

### 10.1 「위젯 목록」 탭

```
[검색: 이름·ID] [구분: 전체·코드·정의] [사용: 전체·사용·중지]           [새 위젯 ▾(유형 고르기)]
┌ 목록 그리드 ─────────────────────┐┌ 상세 ─────────────────────────────────────┐
│ ID · 이름 · 구분 · 유형 · 사용 ·   ││ 공통: 이름·부제·설명·기본/최소/최대 크기·   │
│ 기본 크기 · 사용자 수 · 덮어씀     ││       새로 고침·화면 열기·여러 번·사용        │
│                                   ││ 유형 설정(editor.tsx) — 정의 위젯만           │
│                                   ││ 미리보기(WidgetFrame, 기본 크기)              │
│                                   ││ [저장] [되돌리기/삭제]                       │
└───────────────────────────────────┘└──────────────────────────────────────────┘
```

- 목록 = 코드 등록부 + 유형 등록부 + `commWidgetMng/search` 를 `mergeWidgetRegistry` 와 같은 규칙으로 합친 것(사용 중지 포함). 코드 위젯은 덮어쓴 칸이 있으면 「덮어씀」 표시.
- 코드 위젯 상세: 공통 칸의 자리 표시(placeholder)에 코드 값을 보인다. 비우면 코드 값. [코드 값으로 되돌리기] = `delete`.
- 정의 위젯 상세: 공통 칸 + 유형 편집기. [삭제]는 사용자 수 0 일 때만 활성.
- 미리보기: 저장 전 값으로 그린다. 쿼리 유형은 `previewQuery` 결과로 그린다(아직 저장 전이라 `widgetData/run` 을 못 부른다 — 렌더러에 미리보기 데이터 주입 경로를 둔다: `WidgetProps.definition` 에 `__preview: { columns, rows }` 를 얹어 넘기면 렌더러가 서버를 부르지 않는다).
- 바뀐 값이 있는데 다른 행을 고르면 「저장하지 않은 변경을 버릴까요?」.

### 10.2 「기본 배치」 탭

```
┌ 배치 목록 ───────┐┌ 보드 ─────────────────────────────────────────┐
│ ● 전사(*)        ││ [배치 편집] → 서랍·끌기·크기(A 와 같음)         │
│ ○ 생산팀(D100)   ││ [완료]=saveLayout  [기본 배치 지우기]=deleteLayout │
│ [부서 추가]       ││                                                │
└──────────────────┘└────────────────────────────────────────────────┘
```

- 보드는 `WidgetWorkspace singleTab` + 관리자 어댑터 store. 서랍에는 사용 중인 위젯만 보인다.
- 전사 배치가 없으면 코드 상수 `HOME_DEFAULT_LAYOUT` 을 보여 주고, 저장하면 그때 `*` 행이 생긴다.
- [부서 추가]: 부서 고르기 → 그 부서 배치를 새로 만든다. 시작 배치는 그 부서에 지금 적용되는 배치(위 부서 → 전사 → 코드 상수)를 복사한다.

## 11. 홈 화면 변경

- `page.tsx` 는 `widgetDef/list` 를 불러 `mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs)` 로 등록부를 만들어 `WidgetWorkspace` 에 넘긴다. 응답 전에는 코드 등록부로 보이되 [배치 편집]을 막는다(정의 위젯 손실 방지).
- `homeDefault` 는 응답의 `homeDefault` 가 있으면 그것, 없으면 `HOME_DEFAULT_LAYOUT`.
- `widgetDef/list` 응답 전 → `registryStatus="loading"`, 실패 → `registryStatus="error"` (§1.1).

## 12. 오류 처리

| 상황 | 동작 |
|---|---|
| 정의 조회 실패 | 코드 등록부로 보이고 [배치 편집] 막음 + 띠 |
| 사용 중지 위젯 | 자리 유지 + 「사용 중지된 위젯입니다」 빈 칸. 편집 모드 ✕ 로 빼기 |
| 쿼리 실행 실패 | 위젯 틀 안 「위젯 데이터를 불러오지 못했습니다 [다시 시도]」(`useWidgetStatus`) |
| 외부 정보 실패 | 마지막 값이 있으면 보이고 「갱신 실패」 작은 표시, 없으면 틀 안 오류 |
| 챗봇 실패 | 입력 칸 위 오류 문구, 보낸 질문은 목록에 남는다 |
| 미디어 파일 없음 | 그 항목 자리에 「파일을 찾을 수 없습니다」 |
| 관리 화면 저장 거절 | 서버 메시지를 알림으로 |

## 13. 시험

- **shared 단위**: `mergeWidgetRegistry`(덮어쓰기·사용 중지·유형 없음·코드 없음), `WidgetFrame` 사용 중지 빈 칸, `WidgetPicker` 사용 중지 숨김, `WidgetWorkspace` `registryStatus`·`typeTitles`·`singleTab`.
- **코드 생성**: 유형 폴더 검사(ID 불일치·파일 누락·중복) 실패.
- **유형 렌더러·편집기**(vitest): 각 유형 최소 1개 — html 정화/iframe sandbox 속성(`allow-same-origin` 없음), web 같은 출처 거절, links 동작, 쿼리 표 `__preview` 경로.
- **백엔드(SQLite, 도커 금지)**: 정의 저장 검사·ID 생성·삭제 거절(사용 중), 기본 배치 부서 상위 탐색·순환 방지, `widgetDef/list` 응답, SQL 검사기(허용·거절 사례 표), 실행기 행 상한·롤백·캐시, 환율 빈 날짜 채우기·EUR 교차 계산(가짜 HTTP), 날씨 캐시(가짜 HTTP), 미디어 형식·크기·SVG 거절·경로 조작, 챗봇 도구 반복·허용 defId·기록 100개 유지(가짜 LLM). OASIS BPMN 계약 시험(A 의 `SecWidgetBpmnActionTest` 방식).
- **E2E**(ego-browser, 끝나면 브라우저 닫기): 관리 화면에서 코드 위젯 이름 덮어쓰기 → 홈 서랍에 반영, 사용 중지 → 홈에 빈 칸, 정의 위젯(쿼리 표·md·링크·환율·날씨·미디어·챗봇) 만들기 → 홈에 놓기, 전사·부서 기본 배치 편집 → 새 사용자 홈에 반영.

## 14. 진행 단계와 병합

| 단계 | 내용 |
|---|---|
| B | §1·§2·§4.1·§4.2·§5(B 몫)·§10·§11 + 유형 등록부 생성기 |
| C | §6 C 유형 7개 + §7 |
| D | §4.3~4.5·§6 D 유형 4개·§8·§9 |

계약(이 문서의 §2·§4·§5)은 착수 전에 고정됐다고 보고, 팀원은 파일 소유권을 나눠 B·C·D 를 **동시에** 만든다. 통합 확인·E2E 는 B→C→D 순서로 하고, 시험·리뷰·E2E 를 통과하면 dev 에 병합한다(push 없음). D 가 늦어지면 B·C 만 먼저 병합할 수 있게 커밋을 단계별로 나눈다. 여러 팀원이 함께 건드리는 접점(`shared/widget/index.ts`, `package.json`, `proxy.ts`, `EndpointPermissionFilter`, `csa-menu-tables.md`·`.dbml`, `application*.yml`, 메뉴 시드)은 팀장이 맡는다.

## 15. 결정 기록

| ID | 결정 | 이유 |
|---|---|---|
| W-D16 | 위젯을 코드 위젯·정의 위젯 두 갈래로, 정의 위젯은 "유형(코드) + 정의 설정(DB)" | 관리자가 코드 없이 만들면서도 W-D1(위젯 = 프로그램)을 유지 |
| W-D17 | 코드 위젯 DB 행은 덮어쓸 때만 | 코드↔DB 동기화 작업을 없앤다 |
| W-D18 | 등록부 병합은 화면(shared 순수 함수)에서 | 등록부가 프런트 생성물이라 서버는 위젯 목록을 모른다(A §4.2) |
| W-D19 | 정의 조회 실패 시 [배치 편집] 막기 | 정의 위젯이 「없는 위젯」으로 보이는 상태의 저장이 사용자 배치를 지운다 |
| W-D20 | 사용 중지 = 자리 유지 + 빈 칸 | 사용자 결정 |
| W-D21 | 기본 배치는 부서 → 상위 부서 → 전사 → 코드 상수 | 사용자 결정(부서별). 상위 부서 상속으로 관리 수를 줄인다 |
| W-D22 | 위젯관리 화면은 기존 메뉴 RBAC 로 보호, 사용자용 서비스만 AUTH_ONLY | 「권한 관리를 뺀다」 = 위젯별 권한을 뺀다는 뜻. SQL 을 쓰는 화면을 모두에게 열지 않는다 |
| W-D23 | 쿼리 실행은 defId 만 받고 SQL 검사 + 늘 롤백 + 행·시간 상한 + 30초 캐시 | 사용자 요청에 SQL 이 실리지 않게. SQLite 는 readOnly 가 듣지 않아 검사기가 1차 방어 |
| W-D24 | 실행기는 DataSource 만 받는 독립 클래스, 실행은 mcm 만 | 사용자 결정(모듈 선택)에 열어 두되 이번 범위를 줄인다 |
| W-D25 | html 은 정화 기본, 스크립트 허용 시 `sandbox="allow-scripts"`(같은 출처 없음) | 사용자 결정(둘 다). same-origin 을 함께 주면 격리가 깨진다 |
| W-D26 | 환율·날씨는 서버 대리 호출 + 캐시, 키 없는 공개 API 기본 | 사용자 결정. 키·망 정책을 서버에서 한 곳에 관리 |
| W-D27 | LLM 은 `LlmClient` 공급자 교체형, 설정 없으면 가짜 | 사용자 결정. 밤사이 개발·시험이 키 없이 돈다 |
| W-D28 | 챗봇 데이터 질의는 관리자가 지정한 쿼리 위젯만 도구로 | 모델이 임의 SQL 을 만들지 않게 |
| W-D29 | 미디어는 디스크 저장 + DB 메타, SVG 금지, 매직 넘버 검사 | 사용자 결정(업로드+주소). SVG 는 스크립트를 품을 수 있다 |
| W-D30 | 긴 문자열은 `LONG32VARCHAR` | `@Lob` 은 PostgreSQL 에서 oid 로 매핑돼 방언 간 다르게 동작 |

## 16. 구현 결과·남은 일 (2026-10-03)

### 16.1 결과

- 계획 14개 과제를 모두 구현했고, 과제별 리뷰·통합 리뷰·보안 리뷰를 거쳤다. 시험: 백엔드 `cactus-core`·`mcm-core`·`mcm:api` 통과, 같은 변환기를 쓰는 `mls`·`mpn`·`mqc`·`mpp`·`mdm` api 컴파일 확인, 프런트 shared·m-mcm vitest 통과.
- E2E(워크트리 서버 8101·5101, ego-browser)로 확인한 것: 쿼리 시험(`:userId`)·금지 SQL 거절, 11개 유형 렌더(날씨·환율 실제 값), html 정화와 `sandbox="allow-scripts"`, web 같은 출처 거절, 미디어 올리기·내려받기(Range 206, nosniff, POST·다른 경로 403), 챗봇 기록 유지(가짜 공급자), 사용 중지 빈 칸, 전사 기본 배치 → 저장하지 않은 홈에 반영, 코드 위젯 덮어쓰기와 되돌리기.

### 16.2 구현하며 바뀐 것

| 항목 | 바뀐 내용 |
|---|---|
| 환율 기본 공급자 | Frankfurter 는 `?symbols=KRW,USD,…`(EUR 기준)로 받아 「KRW ÷ X」 교차 계산한다. VND 는 Frankfurter 가 주지 않아 고를 수 있는 통화에서 뺐다 |
| 위젯관리 저장 | cactus 요청 변환기가 params 의 null 값을 받으면 요청 전체가 실패하므로, 화면이 null·undefined 키를 빼고 보낸다(`dropNullParams`) |
| OASIS 본문 `action` | 본문 params·grids 의 `action` 키가 경로 action 을 덮어써 URL 로 판정한 권한과 BPMN 분기가 어긋날 수 있었다. 이제 E002 로 거절하고, 경로 action 을 마지막에 넣는다(cactus-core, 전 모듈 공통) |
| 미디어 내려받기 AUTH_ONLY | 접두 대신 GET·HEAD 와 정확한 경로(`…/widgetMedia/file/{32자}`)만 인증만 본다. 올리기는 위젯관리 권한키로 판정한다 |
| 미디어 올리기 상한 | BFF 본문 상한 101MB, be-proxy 미디어 경로 시간 제한 5분, multipart 상한 초과는 400(E002) |

### 16.3 남은 일

- **쿼리 실행기 전용 DataSource**: 읽기 권한만 가진 DB 계정으로 실행기를 분리한다. 지금은 앱 기본 DataSource 를 쓰고, 함수 거절 목록은 보조 방어선이다(§7.1-6).
- **BFF 본문 상한 전역 확대**: `proxyClientMaxBodySize=101mb` 가 `/api/*` 전체에 적용된다. 업로드 경로만 미들웨어를 거치지 않게 하거나 앞단 Nginx 에서 경로별로 상한을 준다.
- **환율 호출 남용**: 통화 조합·기간을 바꿔 가며 부르면 매번 외부를 호출한다. 정의에 든 통화로 허용 목록 제한, 통화 단위 시도 기록, 속도 제한, KoreaExim 일 1회 적재가 필요하다.
- **챗봇 남용**: `instId` 를 바꾸면 인스턴스당 100개 상한이 의미가 없고 LLM 비용이 늘어난다. 사용자별 호출·기록 상한이 필요하다(배치 행 존재 검사는 부서·코드 기본 배치 사용자를 막으므로 쓰지 않는다).
- **운영 환경 확인**: MSSQL 에서 `;` 없이 이어 쓴 여러 문장 판정, 운영 context path(`/mcm/api`)에서 BE 필터 판정, WildFly·Nginx 의 본문 101MB 허용, 챗봇 최대 응답 시간(도구 5회 × 공급자 제한 시간, 약 123초)과 앞단 시간 제한.
- **KoreaExim**: CNH/CNY 표기 차이를 실제 키로 검증하지 않았다.
- **shared**: `PieChart` 범례의 「건」 고정 단위와 같은 이름 항목의 key 중복(기존 컴포넌트 변경이라 승인 뒤).

## 17. 메모장 위젯 `memo` (2026-10-03 추가)

사용자 요청: 「메모장 위젯 — 텍스트·md·html 형태」. 결정: 공용·개인 **둘 다**(관리자가 정의에서 종류를 고른다), 형식은 **쓰는 사람이 메모마다 고른다**.

### 17.1 정의 설정(`CONFIG_JSON`)

`{ "scope": "shared" | "personal", "format": "text" | "md" | "html", "content": string }`

- `shared`(공용 메모): 관리자가 위젯관리 유형 편집기에서 형식을 고르고 `content` 를 쓴다. 모든 사용자는 읽기만 한다. 서버 저장은 기존 정의 저장(`commWidgetMng/save`) 그대로다.
- `personal`(개인 메모): `format` 은 새 메모의 처음 형식, `content` 는 쓰지 않는다(빈 문자열). 사용자가 홈의 위젯 안에서 쓰고 자기만 본다.
- 검사: `scope`·`format` 은 위 값만, `content` 20,000자 이하. 기본값 `{ scope: "personal", format: "text", content: "" }`. 유형 크기 기본 8×10, 최소 4×6.

### 17.2 개인 메모 저장 — `TB_MCM_SEC_USER_WIDGET_MEMO`

| 컬럼 | 형식 | 설명 |
|---|---|---|
| `USER_ID` | varchar(50) PK | 인증 정보에서만 얻는다 |
| `INST_ID` | varchar(40) PK | 배치 칸 ID(`WidgetProps.instanceId`) |
| `DEF_ID` | varchar(100) | 정의 위젯 ID(`def.xxxxxxxx`) |
| `FMT` | varchar(10) | `text`·`md`·`html` |
| `CONTENT` | `LONG32VARCHAR`(W-D30) | 20,000자 이하 |
| 감사 컬럼 | | 기존 엔티티 공통(`U_AT` = 마지막 저장 시각) |

### 17.3 서비스 `widgetMemo` (AUTH_ONLY — 로그인만 되면 부른다)

| action | params | 결과(`data.result`) |
|---|---|---|
| `load` | `instId` | `{ memo: { instId, defId, format, content, updatedAt } \| null }` |
| `save` | `instId`, `defId`, `format`, `content` | `{ memo: {…같은 모양} }` |

- `userId` 는 늘 `SecurityIdentity` 에서 얻고, 조회·저장은 `(userId, instId)` 로만 한다(다른 사용자 메모 접근 불가).
- `save` 검사(E002): `instId` 1~40자 `[A-Za-z0-9_-]`, `defId` 가 **사용 중인 `memo` 유형 정의이고 `scope=personal`**, `format` 허용값, `content` 20,000자 이하, 사용자당 메모 100개 이하(새 `instId` 저장 때만 센다, 「메모는 100개까지 저장할 수 있습니다」). 이 상한은 잠금 없이 센 **근사 상한**이다 — 동시에 새 메모를 저장하면 동시에 열린 트랜잭션 수만큼 넘을 수 있다(저장 공간 남용 방지용이라 허용, 2026-10-03 보안 리뷰).
- BFF `proxy.ts` authOnly 접두 `/api/mcm/oasis/widgetMemo/`, BE `EndpointPermissionFilter` AUTH_ONLY 에 `widgetmemo/` 추가. BPMN `services/roleManagement/widgetMemo.bpmn`(`widgetChat.bpmn` 방식).

### 17.4 화면

- 렌더러: `text` = 줄바꿈 유지 글, `md` = 기존 글(md) 위젯과 같은 마크다운 보기, `html` = 정화 보기(script·on*·inline style·iframe 제거, 기존 html 위젯 `allowScript=false` 와 같은 경로).
- 개인 메모: 마운트 때 `load`, 보기 모드에 [편집]. 편집 모드 = 형식 선택(텍스트·md·html) + 입력칸 + 글자 수 + [저장]·[취소]. 저장 실패는 입력칸 위 오류 문구, 쓰던 글은 남긴다. 메모가 없으면 「메모가 없습니다. [편집]을 눌러 쓰세요」. 관리 화면 미리보기(저장소 없음)에서는 `load`·`save` 를 부르지 않고 「미리보기에서는 저장하지 않습니다」.
- 공용 메모: 보기만, 편집 버튼 없음.
- 유형 편집기: 종류(공용·개인) 선택, 형식 선택, 공용이면 내용 입력칸(형식에 맞는 편집기). 개인이면 「사용자가 홈에서 직접 씁니다. 형식은 새 메모의 처음 형식입니다」.

### 17.5 함께 넣은 것과 남은 일 (2026-10-03)

- **쿼리 표 엑셀 내려받기**: 표 아래 줄에 행 수(잘렸으면 「상위 500행만 표시합니다」)와 [엑셀]. 보이는 행(≤500)·컬럼 순서·제목 그대로, 값은 서버 원래 값(숫자는 숫자). 파일 이름 「{위젯 제목}_{yyyyMMdd}.xlsx」(못 쓰는 글자는 `_`, 80자). 겹치는 컬럼 제목은 「(2)」를 붙인다. 위젯 제목은 `WidgetProps.title`(§2)로 받는다. SheetJS 는 문자열을 수식으로 쓰지 않는다(보안 리뷰 실측).
- **홈 스크롤**: 포털 `.page-layout` 이 overflow:hidden·높이 고정이라 `.mcm-home` 이 남은 높이를 차지하고 스스로 스크롤한다(`scrollbar-gutter: stable`).
- **위젯 화면 PDF**: `WidgetWorkspace` 에 선택 속성 `pdfTarget?: RefObject<HTMLElement | null>` 을 더했다. 주면 도구 줄 [배치 편집] 앞에 [PDF] 단추가 생기고(편집 중 비활성), 대상을 shared `printElementAsPage`(`utils/libPrint.ts`)로 찍는다. 그림 캡처는 다른 출처 iframe 을 못 읽으므로 브라우저 인쇄를 쓰고, 용지를 대상 크기(scrollWidth × scrollHeight) 한 장으로 잡는다(19,200px 를 넘으면 zoom 으로 줄임). 파일 이름은 「{탭 이름}_{yyyyMMdd}」. 홈은 `.mcm-home` 전체(인사말·공지 띠·탭 줄·보드)를 넘긴다. 스크립트 허용 html 위젯의 srcdoc 맨 앞에 인쇄 색 유지 style(`print-color-adjust: exact`)을 넣었다(sandbox·정화 규칙은 그대로). srcdoc 문서는 HTML 명세상 doctype 이 없거나 앞에 다른 것이 있어도 늘 표준(no-quirks) 모드라 doctype 앞에 붙여도 모드가 바뀌지 않으므로 doctype 을 찾는 정규식은 두지 않는다(연속 주석에서 지수적으로 역추적하던 정규식을 없앴다). 인쇄 정리는 `afterprint` 에서 하고, `print()` 가 바로 돌아오는 브라우저를 위해 돌아온 뒤 1000ms 안전망 타이머로도 정리한다(`print()` 가 던지면 즉시). 대상 후손의 `visibility` 는 상속에 맡겨 후손의 의도된 hidden(ag-grid `.ag-invisible` 등)을 덮지 않고, 탭 메뉴·⋯·(+)·불러오기 실패 띠 [다시 시도]에도 `data-print-hide` 를 달았다.
- **남은 일**
  - PDF 는 인쇄 창에서 대상을 「PDF로 저장」으로 골라야 한 장으로 나온다(프린터는 A4 로 자른다). 그리드·메모처럼 위젯 안쪽에 스크롤이 있는 영역은 지금 보이는 부분만 찍힌다. 외부 웹 주소 위젯은 그 사이트의 인쇄 스타일을 따른다. 확인한 브라우저는 Chrome 뿐이다(`print()` 가 바로 돌아오는 브라우저는 인쇄 전에 스타일이 정리될 수 있다).
  - 위젯을 빼거나 기본 배치가 바뀌어 칸 ID 가 사라져도 그 칸의 개인 메모 행은 남고 100개 상한에 포함된다. 자동 정리는 「홈」을 저장하지 않은 사용자의 기본 배치 칸 메모를 잘못 지울 수 있어 넣지 않았다.
  - 개인 메모를 쓰다가 저장하지 않고 탭을 옮기거나 화면을 떠나면 쓰던 글은 사라진다(임시 저장 없음).
  - 위젯관리 [기본 배치] 보드의 개인 메모 칸은 실제 칸이라, 관리자가 거기서 저장하면 관리자 본인 메모가 된다.
  - widgetMemo AUTH_ONLY 는 기존 widgetChat 처럼 서비스 접두로 연다. BPMN action 을 더하면 `WidgetMemoBpmnActionTest` 가 실패하므로 그때 AUTH_ONLY 범위를 다시 검토한다.
