# 위젯 B·C·D(위젯관리·범용·특수 위젯) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 이 계획은 사용자 부재 중 **Workflow 팀원(effort xhigh) 병렬 실행**용이다. 팀원 한 명이 Task 하나를 맡고, 같은 워크트리에서 **파일 소유권**을 나눠 동시에 일한다. 팀원은 자기 Task 와 「팀 운영 규칙」, 스펙만 읽으면 일할 수 있게 썼다.

**Goal:** 관리자가 위젯을 켜고 끄고(덮어쓰기 포함), 코드 없이 쿼리·글·html·웹 주소·링크·환율·날씨·미디어·AI 챗봇 위젯을 정의하고, 전사·부서별 「홈」 기본 배치를 정하게 한다. 사용자는 A 처럼 자기 탭에 놓고 배치한다.

**Architecture:** 위젯을 코드 위젯(`{group}.{name}`)과 정의 위젯(`def.{key}` = 위젯 유형 코드 + DB 정의 설정) 두 갈래로 나누고, 화면이 shared `mergeWidgetRegistry` 로 코드 등록부·유형 등록부·DB 행을 합친다. 서버(mcm OASIS)는 정의·기본 배치·쿼리 실행·외부 정보·미디어·챗봇을 맡고, 사용자용 서비스는 AUTH_ONLY, 관리자용은 위젯관리 메뉴 RBAC 로 보호한다.

**Tech Stack:** React 19 · Next 16 · TypeScript · Mantine 9 · ag-grid 33 · react-grid-layout 2.2.4 · vitest 3 · Spring Boot(Java 21) · Spring JDBC/JPA(Hibernate 6) · OASIS BPMN · JUnit 5·Mockito·AssertJ · H2(시험) · RestClient + MockRestServiceServer

**Spec:** [`docs/superpowers/specs/2026-10-02-widget-admin-generic-design.md`](../specs/2026-10-02-widget-admin-generic-design.md) — 계획은 스펙을 근거로 한다. 둘 다 읽는다. 선행 스펙: [`2026-10-02-widget-foundation-design.md`](../specs/2026-10-02-widget-foundation-design.md)(A).

## Global Constraints

- 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/widget-admin`, 브랜치 `worktree-widget-admin`(dev 23bb325a 기준). push 없음.
- JDK 21: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (시스템 기본 java 는 17 이라 툴체인 오류가 난다).
- 스키마 `MCMAPUSER`, 감사 컬럼 `McmAuditEntity` 9컬럼, Flyway 없음(로컬 `ddl-auto: update`), 컬럼 형은 Oracle·PostgreSQL·SQLite 공통. 긴 문자열은 `@JdbcTypeCode(SqlTypes.LONG32VARCHAR)`(`@Lob` 금지).
- OASIS 서비스 클래스에 `@Transactional` 금지 — 원자성은 별도 Writer 빈의 `@Transactional` 메서드(A 의 `SecWidgetTabWriter` 방식). 사용자 ID 는 늘 인증 컨텍스트(요청 본문 userId 무시).
- 응답 계약: OASIS `output="result"`(Map), BPMN `grid` 속성 금지, 목록 입력은 `grids.{이름}.rows`(A `secWidget.bpmn`·`SecWidgetBpmnActionTest` 참고).
- 격자 24칸, 세로 한 칸 20px, 위젯 탭당 30개, 좌표 0 이상 정수, `POS_X + SIZE_W ≤ 24`.
- 쿼리: 행 상한 위젯 500·미리보기 50·챗봇 도구 50, 시간 제한 10초, 결과 캐시 30초, 늘 롤백.
- 미디어: 이미지 png·jpeg·gif·webp ≤ 10MB, 동영상 mp4·webm ≤ 100MB, SVG 금지, 매직 넘버 검사.
- 챗봇: 메시지 1~2000자, 인스턴스당 기록 100개, 문맥 최근 20개, 도구 반복 4번, 응답 시간 제한 60초.
- 외부 HTTP: 연결 3초·읽기 5초, 시험은 가짜 HTTP 만(실제 네트워크 금지).
- UI 문구는 한국어. shared 컴포넌트·Mantine 래퍼 규칙은 `mantine-aggrid-ui` 스킬을 따른다.
- 도커 금지. 백엔드 저장소 시험은 H2 메모리 또는 Mockito.

## Review Focus

1. **정의 조회 실패·로딩 중 저장** — `widgetDef/list` 가 실패하거나 아직 안 왔을 때 사용자가 배치를 저장하면 정의 위젯이 사용자 탭에서 사라진다. 기대: 편집 자체가 막힌다. → Task 1(`registryStatus` 시험)·Task 3(홈 화면이 loading·error 를 넘기는지 시험).
2. **쿼리 SQL 우회** — 주석·문자열 안 `;`, `SELECT ... INTO`, `FOR UPDATE`, PostgreSQL `::text` 캐스트, 대소문자 섞인 금지어, 리터럴 안 `:time`. 기대: 쓰기·여러 문장은 막고 정상 SELECT 는 통과. → Task 6(SqlGuard 사례 표 시험).
3. **SQL·프롬프트 노출** — 일반 사용자가 `widgetDef/list` 로 관리자 SQL·시스템 프롬프트를 볼 수 있으면 안 된다. 기대: 서버 전용 키가 빠진다. → Task 2(목록 응답 시험).
4. **html·웹 주소 격리** — 스크립트 허용 html 의 iframe 에 `allow-same-origin` 이 들어가거나, 포털과 같은 출처 웹 주소를 iframe 에 띄우면 격리가 깨진다. 기대: 속성 고정·같은 출처 거절. → Task 8(속성 만드는 순수 함수 시험).
5. **미디어 경로·형식 위조** — `../` 가 든 fileId, 확장자만 png 인 SVG·HTML, 크기 초과. 기대: 거절. → Task 10(저장소·검사 시험).

---

## 팀 운영 규칙 (모든 팀원 공통 — 반드시 지킨다)

1. **작업 위치**: 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/widget-admin` 안에서만 쓴다. 메인 체크아웃 `/Users/jji/project/dmes-standard`(다른 경로)는 읽기만 하고, 거기 떠 있는 서버(8100·5100 등)는 건드리지 않는다.
2. **git**: 훅이 `git` 을 바꿔 쓰므로 늘 **`/usr/bin/git`** 을 쓴다. 금지: `add -A`·`add .`·`commit -a`·`stash`·`reset`·`checkout --`·`restore`·`rebase`·`merge`·`push`·브랜치 바꾸기.
   - 커밋은 **경로 지정**으로 한다: 새 파일은 `/usr/bin/git add <내 새 파일들>` 후 `/usr/bin/git commit -m "<메시지>" -- <내 파일·폴더 경로들>`. 경로 지정 커밋은 다른 팀원이 스테이징한 파일을 섞지 않는다.
   - `index.lock` 오류면 5초 뒤 다시(최대 6회).
   - 메시지: `feat(widget): …`·`test(widget): …` 처럼 Conventional Commits 한국어 제목, 본문 첫 줄 `쉬운 설명: …`(비개발자용 한두 문장), 마지막 줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
3. **파일 소유권**: 자기 Task 의 **소유** 목록 밖 파일은 고치지 않는다. Task 0 계약 파일(아래 표)은 읽기 전용이다 — 바꿔야 하면 바꾸지 말고 보고서 `contractIssues` 에 적고, 계약에 맞춰 우회한다. `src/frontend/m-mcm/lib/generated/*` 는 커밋하지 않는다(팀장이 통합 때 다시 만든다). 로컬 확인용 `node scripts/generate-widget-registry.mjs` 실행은 된다.
4. **동시 작업**: 다른 팀원이 같은 워크트리에서 동시에 고친다. 남의 파일 컴파일·타입 오류로 빌드·시험이 깨지면 고치지 말고 3분 뒤 다시(최대 5회). 그래도 안 되면 보고서에 적고, 파일 단위 시험으로 자기 범위를 최대한 검증한다. shared dist 가 잠깐 사라져 `Cannot find module '@dk-oasis/shared/…'` 가 나면 1~2분 뒤 다시.
5. **백엔드 시험**: `src/backend` 에서 `JAVA_HOME=… ./gradlew :mcm-core:test --tests "<내 패키지>.*" --console=plain`·`./gradlew :mcm:api:test --tests "<내 클래스>" --console=plain` 처럼 **자기 시험만** 돌린다. gradlew 는 PC 전역 heavy 슬롯(2개)을 자동으로 잡으므로 기다림은 정상이다. 필터 없는 전체 시험은 팀장 몫이다. 결과는 `mcm-core/build/test-results/test/TEST-*.xml` 의 `tests=… failures=0 errors=0` 으로 확인한다(`-q` 는 성공 시 아무것도 찍지 않는다).
6. **프런트 시험**: `pnpm vitest run <파일>`(shared·m-mcm 각 폴더에서). m-mcm 전체 타입 검사는 m-mcm 폴더에서 `../../../.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep <내 경로>` 로 줄을 세우고 자기 파일 오류만 본다. **금지**: `next build`·`pnpm dev`·서버 기동·브라우저(E2E 는 팀장), shared `pnpm build`(Task 1 만).
7. **m-mcm 시험 환경**: vitest `environment: "node"`, 시험 파일 `tests/**/*.test.ts`·`page-components/**/*.test.ts`·`widget-types/**/*.test.ts`. 렌더 시험 대신 **순수 함수(.ts)로 로직을 빼서** 시험한다. 시험 파일은 `@dk-oasis/shared` 를 런타임 import 하지 않는다(타입 import 는 된다).
8. **스킬**: 프런트는 `mantine-aggrid-ui`(필수, 워크트리 범위 변형이 있으면 그것), 백엔드 OASIS·BPMN 은 `oasis-project-support`·`bpmn-skill`, 끝나면 `oasis-contract-check`. 구현은 `superpowers:test-driven-development` 순서(실패하는 시험 → 구현 → 통과 → 커밋). LLM 코드는 `claude-api` 를 먼저.
9. **질문 없음**: 팀장·사용자에게 물을 수 없다. 스펙·계획이 정하지 않은 것은 스펙 방향에 맞는 가장 단순한 선택을 하고 보고서 `decisions` 에 한 줄씩 적는다.
10. **주석·문구**: 주변 코드의 관례(한국어 주석, 스펙 절 번호 인용)를 따른다. 사용자에게 보이는 문구는 스펙 문구를 그대로 쓴다.
11. **끝내기 전 확인**: 자기 시험 전부 통과, 자기 파일 타입 오류 0, 커밋 완료, `git status --short` 에 자기 소유 파일이 남지 않음.
12. **mcm-core 는 늘 컴파일되는 상태로 둔다(백엔드 팀원 5명이 같은 모듈을 컴파일한다).** Java TDD 의 「실패하는 시험」 단계를 컴파일 오류로 만들지 않는다: ① 먼저 **컴파일되는 뼈대**(클래스·메서드 시그니처, 본문은 `throw new UnsupportedOperationException("TODO")`)를 쓰고 ② 시험을 쓰고 ③ 돌려 **단언 실패**를 확인한 뒤 ④ 구현한다. 서로 참조하는 파일은 모두 쓴 다음에 gradle 을 돌린다. 반쯤 쓴 Java 파일을 남겨 둔 채 오래 생각하지 않는다. gradle 은 슬롯 2개로 줄을 서므로 **돌리는 횟수를 줄인다**(시험·구현을 묶어서, 실패 확인은 한 번).
13. **gradle 동시 실행 오류**: `in use by another Gradle instance`·잠금 시간 초과·`Could not create service of type …` 는 다른 팀원 실행과 겹친 것이다. 1분 뒤 다시.
14. **워크트리 격리 가드**: 이 세션은 git 대상 판정이 어려운 명령을 거절한다 — 변수(`$f`)·따옴표 없는 글롭(`*.java`)·`$(…)` 가 섞인 복합 명령, heredoc 안 `sed` 등. 명령은 **단순한 명령 여러 개로 나누고**, 경로는 리터럴로, 글롭에는 따옴표를 붙이고, 파일 수정은 Edit·Write 도구로 한다. 거절되면 같은 명령을 다시 보내지 말고 쪼갠다.
15. **금지 도구**: `AskUserQuestion`, 계획 모드(EnterPlanMode·ExitPlanMode), brainstorming·writing-plans 스킬, **Agent(서브에이전트) 도구**(effort 를 지정할 수 없고 메모리를 더 쓴다). 혼자 끝까지 한다.
16. **m-mcm tsc 기준선은 오류 0**(팀장이 형제 패키지 m-analog·mdm·mls·mpn·mpp·mqc dist 를 빌드해 두었다, 2026-10-02 23:59). 생기는 오류는 진행 중인 팀원 작업에서 온다 — 자기 경로 오류만 0 으로 만든다. 형제 패키지 `tsup`·`pnpm build` 는 다시 돌리지 않는다.

### Task 0 계약 파일 (완료 · 읽기 전용)

| 파일 | 내용 |
|---|---|
| `src/frontend/shared/src/widget/types.ts` | `WidgetMeta.disabled·kind·typeId`, `WidgetProps.definition·widgetId`, `WidgetTypeMeta`, `WidgetTypeEditorProps`, `WidgetTypeEditorComponent`, `WidgetTypeRegistryEntry`, `WidgetTypeRegistry`, `WidgetDefRow` |
| `src/frontend/shared/src/widget/widget-registry.ts` | `mergeWidgetRegistry`, `toWidgetDefRow`, `applyWidgetOverride`, `defWidgetMeta`, `defWidgetLoader` |
| `src/frontend/shared/src/widget/WidgetWorkspace.tsx` 의 `WidgetWorkspaceProps` | `registryStatus?`, `onRetryRegistry?`, `typeTitles?`, `singleTab?` (선언만 — 동작은 Task 1) |
| `src/frontend/m-mcm/scripts/*widget-registry*` | `widget-types/{id}/type.meta.ts·renderer.tsx·editor.tsx` → `lib/generated/widget-type-registry.ts`(`WIDGET_TYPE_REGISTRY`). `_` 로 시작하는 폴더는 건너뛴다 |
| `src/frontend/m-mcm/proxy.ts`, `mcm-core …/security/endpoint/EndpointPermissionFilter.java` | AUTH_ONLY: `widgetDef/list`, `widgetData/run`, `widgetExt/*`, `widgetChat/*`, 미디어 내려받기는 GET·HEAD + 정확한 경로 `rest/widgetMedia/file/api/mcm/widgetMedia/file/{32자}` 만(스펙 §16.2) |
| `src/backend/mcm/api/…/init/DataInitializer.java` | 위젯관리 메뉴(`csa/commWidgetMng`) 시드, PERM_ALL 토큰 `previewQuery·searchLayouts·loadLayout·saveLayout·deleteLayout·searchDepts·upload` |
| `mcm-core …/widget/def/entity/WidgetDef.java`, `…/def/repository/WidgetDefRepository.java`, `…/def/WidgetDefSavedEvent.java` | `TB_MCM_WIDGET_DEF` 엔티티(필드 = 스펙 §4.1)·저장소(`findAllByOrderByWidgetIdAsc`, `findBySrcTpOrderByWidgetIdAsc`)·저장 이벤트 `record WidgetDefSavedEvent(String widgetId)` |
| `mcm-core …/widget/query/WidgetQueryRunner.java`, `WidgetQueryResult.java` | `runDefinition(defId, maxRows)`, `preview(dataSrc, sql, maxRows)`, `validateSql(sql)` / `record WidgetQueryResult(List<String> columns, List<Map<String,Object>> rows, boolean truncated)` |
| `mcm-core …/widget/common/WidgetUserContext.java`, `WidgetUserContextResolver.java` | `current()` → `WidgetUserContext(userId, userNm, deptCd, deptNm, deptChain)`, `deptChain(deptCd)` (순환·10단 상한) |
| `src/frontend/m-mcm/page-components/csa/commWidgetMng/LayoutTab.tsx` | 자리 표시 `export function LayoutTab()` — Task 5 가 통째로 바꾼다 |
| `src/frontend/m-mcm/vitest.config.mts` | `widget-types/**/*.test.ts` 포함 |

경로 약어: `mcm-core …` = `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm`, 시험은 `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm`. mcm api 리소스 = `src/backend/mcm/api/src/main/resources`, mcm api 시험 = `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm`.

### 화면 전용 키 규칙(Task 4·7·13·14 공통)

정의 설정(`CONFIG_JSON`)에서 **`__` 로 시작하는 키는 화면 전용**이다. 위젯관리 화면(Task 4)은 저장 직전에 최상위 `__*` 키를 지운다. 쿼리 유형 편집기(Task 7)는 [쿼리 시험] 결과를 `__preview: { columns, rows, truncated }` 로 value 에 넣고, 쿼리 렌더러는 `definition.__preview` 가 있으면 서버를 부르지 않고 그것을 그린다(관리 화면 미리보기용).

### 의존 관계와 실행 순서

| Task | 범위 | 선행 | 갈래 |
|---|---|---|---|
| 1 | shared 위젯 동작(사용 중지 칸·서랍·registryStatus·singleTab·typeTitles·문서) | — | B FE |
| 2 | 백엔드 정의·기본 배치·위젯관리 서비스 | — | B BE |
| 3 | 홈 화면 연결 | 1 | B FE |
| 4 | 위젯관리 화면 — 위젯 목록 탭·화면 틀 | 1 | B FE |
| 5 | 위젯관리 화면 — 기본 배치 탭 | 1 | B FE |
| 6 | 쿼리 실행기·widgetData | — | C BE |
| 7 | 쿼리 유형 3종(표·차트·숫자) | — | C FE |
| 8 | 콘텐츠 유형 4종(md·html·웹 주소·링크) | — | C FE |
| 9 | 환율·날씨 백엔드 | — | D BE |
| 10 | 미디어 백엔드 + BFF 바이너리 | — | D BE |
| 11 | 챗봇 백엔드(LLM 공급자·도구·기록) | — | D BE |
| 12 | 환율·날씨 유형 | — | D FE |
| 13 | 미디어 유형 | — | D FE |
| 14 | 챗봇 유형 | — | D FE |
| I1~I5 | 통합·문서·전체 시험·리뷰·E2E·병합 | 1~14 | 팀장 |

Task 3·4·5 는 Task 1 의 shared 빌드가 끝난 뒤 시작한다(새 props 동작이 dist 에 있어야 한다). 나머지는 계약만으로 동시에 시작한다.

---

### Task 1: shared 위젯 동작 (B)

**소유:** `src/frontend/shared/src/widget/` 의 `WidgetFrame.tsx`·`WidgetPicker.tsx`·`WidgetWorkspace.tsx`(props 선언 아래 구현부)·`WidgetBoard.tsx`·`WidgetTabs.tsx`·`styles.tsx`·`constants.ts`·`widget-layout.ts`·`frame-context.ts`·`index.ts`, 시험 `src/frontend/shared/tests/unit/widget-{frame,picker,workspace,board,tabs}.unit.test.ts`, 문서 `.claude/skills/mantine-aggrid-ui/references/components/widget.md`·그 색인(`references/components/` 의 목록 파일·`llms-full.txt` 에서 widget 항목).

**Interfaces:**
- Consumes: Task 0 계약 타입, 기존 A 컴포넌트.
- Produces(Task 3·4·5 가 쓴다): `WidgetWorkspace` 의 `registryStatus`·`onRetryRegistry`·`typeTitles`·`singleTab` 동작, `WidgetPicker` 의 `typeTitles?: Readonly<Record<string,string>>` prop, `WidgetFrame` 의 사용 중지 칸. 테스트 ID: 사용 중지 칸 `data-widget-disabled="true"`, 띠 `data-testid="{testId}-registry-error"`, 다시 시도 버튼 `data-action="retry-registry"`.

**요구(스펙 §1.1·§2·§11·§12):**
- `WidgetFrame`: `entry.meta.disabled` 면 본체 `load()` 를 부르지 않는다. 제목 줄에는 제목만(새로 고침·「화면 열기」 없음, 자동 새로 고침 타이머 없음). 본문 자리에 「사용 중지된 위젯입니다」(`data-widget-disabled="true"`, 회색 점선 테두리, 가운데 정렬). 편집 모드의 ✕(빼기)·자물쇠는 평소와 같다. 보기 모드에서도 자리를 지킨다(숨기지 않는다).
- `WidgetPicker`: `meta.disabled` 항목은 목록에서 뺀다. `meta.kind === "def"` 이고 `typeTitles[meta.typeId]` 가 있으면 제목 아래 작은 글씨로 유형 이름을 보인다. `multiple:false` 처리 그대로.
- `WidgetWorkspace`:
  - `registryStatus`(기본 `"ready"`): `"loading"`·`"error"` 면 [배치 편집] 버튼 비활성(`title` 「위젯 목록을 불러오는 중입니다」·「위젯 정의를 불러오지 못했습니다」). `"error"` 면 탭 줄 위 띠 「위젯 정의를 불러오지 못했습니다」 + `onRetryRegistry` 가 있으면 [다시 시도]. 편집 중에 `"error"` 로 바뀌는 경우는 없다고 보되, 바뀌면 [완료]를 막는다.
  - `typeTitles` 를 `WidgetPicker` 로 넘긴다.
  - `singleTab={{title}}`: 탭 줄(`WidgetTabs`)을 그리지 않고 그 자리에 `title` 을 굵게 보인다. 「홈」 탭 하나만 다룬다(`store.load()` 결과에서 home 만, 없으면 `homeDefault`). 편집 흐름([배치 편집]·[완료]=`store.saveTab(home)`·[취소])은 그대로. 마지막 탭 기억(localStorage)은 쓰지 않는다. 탭 메뉴·새 탭(+) 없음.
  - 기존 `search` 실패 띠·편집 막기는 그대로 둔다.
- `index.ts` 에 새 export 가 필요하면 더한다(Task 0 export 는 이미 있다).
- 문서: `widget.md` 에 「정의 위젯·유형」, 「사용 중지 칸」, 새 props 4개, `mergeWidgetRegistry` 사용 예를 더하고 색인을 갱신한다(CLAUDE.md 공통 컴포넌트 행동강령).

**시험(파일 끝에 추가, 기존 시험은 그대로 통과):**
- `widget-frame.unit.test.ts`: 사용 중지 entry → `load` 가 한 번도 불리지 않고 「사용 중지된 위젯입니다」가 보인다. 새로 고침 버튼이 없다. 편집 모드에서 ✕ 를 누르면 `onRemove(instId)`.
- `widget-picker.unit.test.ts`(새 파일, 기존 `widget-board.unit.test.ts` 의 `createRoot`+`act` 방식): 사용 중지 항목이 목록에 없다. def 항목 아래 `typeTitles` 이름이 보인다.
- `widget-workspace.unit.test.ts`: `registryStatus="loading"` → [배치 편집] disabled, 띠 없음. `"error"` → disabled + 띠 + [다시 시도] 누르면 `onRetryRegistry` 1회. `singleTab` → 탭 줄 없음, 제목 보임, 편집→위젯 추가→[완료] 하면 `store.saveTab` 이 `tabId:"home"` 으로 1회.

- [ ] **Step 1:** 위 시험을 먼저 쓰고 `cd src/frontend/shared && pnpm vitest run tests/unit/widget-frame.unit.test.ts tests/unit/widget-picker.unit.test.ts tests/unit/widget-workspace.unit.test.ts` 로 실패를 확인한다.
- [ ] **Step 2:** `WidgetFrame`·`WidgetPicker`·`WidgetWorkspace` 를 구현한다(스타일은 `styles.tsx` 토큰 사용).
- [ ] **Step 3:** 같은 명령으로 통과 확인 + `pnpm vitest run tests/unit/widget-board.unit.test.ts tests/unit/widget-tabs.unit.test.ts tests/unit/widget-layout.unit.test.ts tests/unit/widget-registry.unit.test.ts` 회귀 확인.
- [ ] **Step 4:** shared 빌드: `cd src/frontend/shared && ../../../.claude/skills/dflow-dev/scripts/heavy.sh pnpm build` → `dist/widget.js`·`dist/types/widget/WidgetWorkspace.d.ts` 갱신 확인(Task 3·4·5 가 이 dist 를 쓴다).
- [ ] **Step 5:** 문서 갱신 후 커밋(`feat(shared): 위젯 사용 중지 칸·정의 상태·관리자 단일 탭을 추가한다`).

---

### Task 2: 백엔드 정의·기본 배치·위젯관리 서비스 (B)

**소유:** `mcm-core …/widget/def/**`(Task 0 파일은 메서드 추가만 허용 — 기존 시그니처 변경 금지), `mcm-core …/widget/layout/**`(새), `mcm-core …/widget/admin/**`(새), 시험 `…/test/…/widget/{def,layout,admin}/**`, mcm api 리소스 `services/roleManagement/widgetDef.bpmn`·`services/csa/commWidgetMng.bpmn`, mcm api 시험 `widget/WidgetDefBpmnActionTest.java`·`widget/CommWidgetMngBpmnActionTest.java`.

**Interfaces:**
- Consumes: `WidgetDef`/`WidgetDefRepository`/`WidgetDefSavedEvent`, `WidgetQueryRunner`(구현은 Task 6 — 시험에서는 mock), `WidgetUserContextResolver`, A 의 `SecUserWidgetRepository`(읽기만, 사용자 수 집계는 자기 저장소·쿼리로), `DeptInfoRepository`.
- Produces:
  - 엔티티 `widget/layout/entity/WidgetDefaultLayout`(`TB_MCM_WIDGET_DEFAULT_LAYOUT`, 복합키 `LAYOUT_KEY`·`INST_ID`, 스펙 §4.2) + `WidgetDefaultLayoutId` + 저장소 + `WidgetLayoutWriter`(`@Transactional replace(layoutKey, rows)`·`delete(layoutKey)`).
  - OASIS `widgetDef`(빈 `widgetDefService`) action `list` → `result`: `{ defs: [Map], homeDefault: [Map] | null, homeDefaultKey: String | null }`. def Map 키: `widgetId, srcTp, typeId, title, subtitle, description, defW, defH, minW, minH, maxW, maxH, refreshSec, linkPageId, multipleYn, useYn, dataSrc, configJson`(문자열). homeDefault Map 키: `instId, widgetId, posX, posY, sizeW, sizeH, lockYn`.
  - OASIS `commWidgetMng`(빈 `commWidgetMngService`) action: `search`·`save`·`delete`·`previewQuery`·`searchLayouts`·`loadLayout`·`saveLayout`·`deleteLayout`·`searchDepts`(입출력 아래 표). 모든 action `output="result"`.

| action | params / grids | result |
|---|---|---|
| `search` | — | `{ defs: [def Map + userCount] }` (configJson 전부) |
| `save` | params: def Map 키 전부(`widgetId` 는 신규 D 면 빈 값) | `{ def: def Map }` (생성된 widgetId 포함) |
| `delete` | params: `widgetId` | `{ deleted: widgetId }` |
| `previewQuery` | params: `dataSrc`, `sql` | `{ columns, rows, truncated }` ← `queryRunner.preview(dataSrc, sql, 50)` |
| `searchLayouts` | — | `{ layouts: [{ layoutKey, deptNm, count }] }` (`*` 의 deptNm 은 「전사」, 전사 먼저 그다음 deptNm 순) |
| `loadLayout` | params: `layoutKey`, `effective`(Y·N) | `{ layoutKey, sourceKey, items: [homeDefault Map] }` (스펙 §5.2) |
| `saveLayout` | params: `layoutKey` / grids: `widgets.rows`(homeDefault Map) | `{ layoutKey, count }` |
| `deleteLayout` | params: `layoutKey` | `{ layoutKey }` |
| `searchDepts` | params: `keyword`(없으면 전체) | `{ depts: [{ deptCd, deptNm, upperDeptCd }] }` 최대 50, `USE_TP='Y'`, 코드·이름 앞부분 일치(대소문자 무시) |

**요구(스펙 §4.1·§4.2·§5.1~5.3):**
- `widgetDef/list`: 모든 정의·덮어쓰기 행. **`configJson` 에서 서버 전용 키를 지운다**: `typeId` 가 `query-` 로 시작하면 `sql`, `chat` 이면 `systemPrompt`·`dataQueryDefIds`(파싱 실패한 JSON 은 `null` 로). 기본 배치는 `WidgetUserContextResolver.current().deptChain()` 순서 → `*` 에서 처음 행이 있는 키. 없으면 `homeDefault=null`·`homeDefaultKey=null`.
- `save` 검사(어기면 `BusinessException(ErrorCode.INVALID_VALUE, 메시지)`, 중복은 `DUPLICATE_DATA`):
  - 공통: `srcTp` C·D, `title` 은 D 필수·1~50자(C 는 NULL 또는 1~50자), 크기 칸은 NULL 또는 1 이상 정수, 같은 축 MIN ≤ DEF ≤ MAX(둘 다 있을 때), `DEF_W ≤ 24`, `refreshSec` NULL 또는 30~86400, `multipleYn`·`useYn` Y·N(NULL 허용 — useYn NULL 이면 Y), 문자열 길이는 컬럼 길이 이하.
  - C: `widgetId` 가 코드 ID 형식 `^[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$` 이고 `def.` 로 시작하지 않는다. `typeId`·`dataSrc`·`configJson` 은 NULL 로 저장한다.
  - D: 신규면 `def.` + 소문자 1 + 소문자·숫자 7(`SecureRandom`, 있으면 다시) ID 를 만든다. 수정이면 기존 D 행이어야 한다(C 행을 D 로 바꾸기 금지). `typeId` 는 `^[a-z0-9]+(-[a-z0-9]+)*$` 1~40자, `configJson` 은 JSON 객체로 파싱되고 200KB 이하. 유형별: `query-*` → `dataSrc` 는 `mcm` 만(그 밖 「아직 지원하지 않는 모듈입니다」), `config.sql` 을 `queryRunner.validateSql` 로 검사. `web` → `config.url` 이 `http://`·`https://` 절대 주소. `links` → `items[].kind=url` 이면 http(s), `page` 면 `pageId` 필수. `media` → `items[].src` 가 `media:` + 32자 16진수 또는 http(s). `html` → `allowScript` 는 불리언(없으면 false).
  - 저장·삭제 뒤 `ApplicationEventPublisher` 로 `WidgetDefSavedEvent(widgetId)`.
- `search` 의 `userCount`: `TB_MCM_SEC_USER_WIDGET` 에서 `WIDGET_ID` 별 DISTINCT `USER_ID` 수(JPQL `select w.widgetId, count(distinct w.userId) … group by`). 코드 위젯 중 DB 행이 없는 것의 사용자 수는 화면이 몰라도 된다 — **대신 `usage` 맵도 돌려준다**: `{ defs: [...], usage: { widgetId: count } }`(행 없는 코드 위젯 포함 전체).
- `delete`: D 는 사용자 수 0 일 때만(그 밖 「사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요」), C 는 덮어쓰기 행 삭제. 없는 ID 는 「위젯 정의를 찾을 수 없습니다」.
- 기본 배치: `layoutKey` 는 `*` 또는 `TB_MCM_DEPT_INFO` 에 있는 `DEPT_CD`. 저장 검사는 A 와 같다(위젯 30개 이하, `instId` 1~40자 `^[A-Za-z0-9_-]+$` 탭 안 중복 금지, `widgetId` 1~100자, 좌표·크기 0 이상 정수·크기 1 이상, `POS_X + SIZE_W ≤ 24`, `lockYn` Y·N). 빈 목록 저장은 거절(「위젯이 하나도 없는 기본 배치는 저장할 수 없습니다. 지우려면 기본 배치 지우기를 쓰세요」).
- `loadLayout effective=Y`: 키에 행이 없으면 `deptChain(layoutKey)` 의 상위들(자기 다음부터) → `*` 순서로 처음 찾은 배치와 `sourceKey`. `layoutKey='*'` 면 `*` 만 본다.
- BPMN 두 개는 A `secWidget.bpmn` 과 같은 모양(actionGateway 분기, `camunda:class` = 빈 이름, `method` = action, `output="result"`). `widgetDef.bpmn` 은 `services/roleManagement/`, `commWidgetMng.bpmn` 은 `services/csa/`(screenUsageStat 과 같은 곳).

**시험:**
- `def/WidgetDefServiceTest`(Mockito): 목록이 query 의 `sql`·chat 의 `systemPrompt`·`dataQueryDefIds` 를 지운다(다른 키는 유지), 깨진 JSON 은 null. 부서 D100 배치가 있으면 D100, 없고 상위 D10 이 있으면 D10, 없으면 `*`, 아무것도 없으면 null.
- `admin/CommWidgetMngServiceTest`(Mockito): 신규 D ID 형식(`^def\.[a-z][a-z0-9]{7}$`)·중복 시 다시 생성, C 에 typeId 를 줘도 NULL 로 저장, C→D 전환 거절, 크기 MIN>DEF 거절, DEF_W 25 거절, refreshSec 10 거절, query 의 dataSrc `mls` 거절, query 저장 시 `validateSql` 호출(mock 이 던지면 저장 안 됨), web `javascript:` 거절, media src `media:../../etc` 거절, 저장·삭제 시 이벤트 발행, 사용 중 D 삭제 거절, C 삭제 = 행 삭제, `previewQuery` 위임(행 상한 50).
- `layout/CommWidgetLayoutTest`(Mockito 또는 H2): 없는 부서 키 거절, 빈 목록 거절, `POS_X+SIZE_W=25` 거절, instId 중복 거절, `effective=Y` 상위 부서 대체·`sourceKey`, `searchLayouts` 의 전사 먼저.
- `def/WidgetDefaultLayoutRepositoryJpaTest`(H2, `ScreenUsageJpaTestConfig` 방식의 자기 설정 클래스): 저장·키별 조회·키 삭제, `WidgetDef` 의 CONFIG_JSON 에 5,000자 문자열 저장·조회(LONG32VARCHAR 확인).
- mcm api `WidgetDefBpmnActionTest`·`CommWidgetMngBpmnActionTest`: `SecWidgetBpmnActionTest` 방식으로 분기 목록(`list` / 9개 action), 빈 이름, `method`=action, `output=result`, `grid` 속성 없음, 서비스 메서드 존재(리플렉션).

- [ ] **Step 1:** 엔티티·저장소·Writer 와 JPA 시험 → 실패 확인 → 구현 → 통과(`./gradlew :mcm-core:test --tests "com.dongkuk.dmes.mcm.widget.layout.*" --tests "com.dongkuk.dmes.mcm.widget.def.*"`).
- [ ] **Step 2:** `WidgetDefService`(list) 시험 → 구현 → 통과.
- [ ] **Step 3:** `CommWidgetMngService`(정의 search·save·delete·previewQuery) 시험 → 구현 → 통과. 서비스 클래스가 너무 커지면 기본 배치 action 은 `CommWidgetLayoutService` 로 나누고 BPMN 이 두 빈을 부르게 한다.
- [ ] **Step 4:** 기본 배치 action 시험 → 구현 → 통과.
- [ ] **Step 5:** BPMN 두 개 + BPMN 계약 시험 → `./gradlew :mcm:api:test --tests "com.dongkuk.dmes.mcm.widget.*"` 통과 → `oasis-contract-check` 로 점검.
- [ ] **Step 6:** 커밋(엔티티·서비스·BPMN 을 2~3개 커밋으로 나눠도 된다).

---

### Task 3: 홈 화면 연결 (B) — Task 1 뒤

> **배정 변경(2026-10-03):** 이 Task 는 **Workflow 2(`widget-bcd-team-2`)** 팀원이 맡는다. **Workflow 1(`widget-bcd-team`)에서 이 Task 의 build·review·fix 로 배정된 에이전트는 파일을 고치지도, 시험을 돌리지도 말고 즉시 끝낸다** — build·fix 면 `status:"done"`, `summary:"Workflow 2 로 이관됨 — 작업 없음"`, `commits:[]`, `files:[]`, `tests:"-"`, review 면 `verdict:"pass"`, `findings:[]`, `testsRerun:"-"`. Workflow 2 팀원은 이 표시를 무시하고 Task 를 수행한다. (Task 0 에서 새 props 타입이 dist 에 이미 있으므로 Task 1 완료를 기다리지 않고 시작한다.)

**소유:** `src/frontend/m-mcm/page-components/home/page.tsx`, 새 `page-components/home/widget-defs.ts`·`page-components/home/widget-defs.test.ts`.

**Interfaces:**
- Consumes: Task 1 의 `WidgetWorkspace` props, shared `mergeWidgetRegistry`·`toWidgetDefRow`, `WIDGET_REGISTRY`·`WIDGET_TYPE_REGISTRY`(생성물), `HOME_DEFAULT_LAYOUT`, Task 2 의 `widgetDef/list` 응답.
- Produces: `fetchWidgetDefs(): Promise<{ rawDefs: Record<string, unknown>[]; homeDefault: WidgetItem[] | null }>`(widget-defs.ts — shared 런타임을 import 하지 않는다. page.tsx 가 `rawDefs` 를 shared `toWidgetDefRow` 로 바꾸고 null 은 버린다. Task 5 는 자기 파일에서 따로 부른다), `homeItemsFromRows(rows): WidgetItem[]`.

**요구(스펙 §11):**
- `widget-defs.ts`: `widgetDef/list` 호출(기존 `widget-store.ts` 의 `call`·`unwrap` 방식과 같은 envelope 규칙. 시험이 shared 런타임을 import 하지 않도록 `toWidgetDefRow` 와 같은 변환을 이 파일에서 하지 말고, **변환 함수는 순수 함수로 분리**해 `homeItemsFromRows`(posX→x 등, lockYn→locked, config null)만 시험한다. `toWidgetDefRow` 는 page.tsx 쪽에서 shared 를 써서 부른다).
- `page.tsx`: 상태 `registryStatus`(`"loading"` → 응답 `"ready"` / 실패 `"error"`), `defs`, `homeDefault`. `registry = useMemo(() => mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs), [defs])`, `typeTitles = useMemo(...)`(유형 등록부에서), `homeDefault` 는 응답 값이 있으면 그것, 없으면 `HOME_DEFAULT_LAYOUT`. `onRetryRegistry` 는 다시 부르기. `WidgetWorkspace` 에 `registryStatus`·`onRetryRegistry`·`typeTitles` 를 넘긴다. **`homeDefault` 가 응답으로 바뀌면 WidgetWorkspace 가 「홈」 미저장 사용자의 기본 배치를 다시 계산하는지 확인**하고, 다시 계산하지 않으면 `key` 를 써서 응답 뒤 한 번 다시 마운트한다.
- 인사말·긴급 공지 띠·공지 저장소는 그대로.
- **확인 필수**: `WidgetWorkspace` 는 탭을 한 번 불러와 상태로 들고 있다. 등록부가 loading(코드 위젯만) → ready(정의 위젯 포함)로 바뀔 때, 이미 불러온 탭의 정의 위젯 항목이 `sanitizeLayout`·보드 필터에서 **잘려 나가 상태에서 사라지지 않는지** shared 소스(`WidgetWorkspace.tsx`·`widget-layout.ts`·`WidgetBoard.tsx`)를 읽어 확인한다. 사라질 수 있으면 `widgetDef/list` 응답(성공·실패)이 올 때까지 `WidgetWorkspace` 를 마운트하지 말고 뼈대(skeleton)를 보인다. 실패면 코드 등록부로 마운트하고 `registryStatus="error"`(편집 막힘). 판단과 근거를 보고서 `decisions` 에 적는다.

**시험:** `widget-defs.test.ts` — `homeItemsFromRows`(문자열 숫자 변환, lockYn Y→true, 빈 배열), 응답 envelope 해제(실패 meta.success=false → throw, `homeDefault:null` 유지)를 `fetch` 가짜로(`tests/csa/screenUsageStat/support/fetch-mock.ts` 방식 참고).

- [ ] **Step 1:** 시험 작성 → `cd src/frontend/m-mcm && pnpm vitest run page-components/home/widget-defs.test.ts` 실패 확인.
- [ ] **Step 2:** `widget-defs.ts`·`page.tsx` 구현 → 시험 통과 → tsc(자기 파일 오류 0).
- [ ] **Step 3:** 커밋(`feat(mcm): 홈이 위젯 정의·부서 기본 배치를 불러와 실행 시 등록부로 그린다`).

---

### Task 4: 위젯관리 화면 — 위젯 목록 탭·화면 틀 (B) — Task 1 뒤

> **배정 변경(2026-10-03):** 이 Task 는 **Workflow 2(`widget-bcd-team-2`)** 팀원이 맡는다. **Workflow 1(`widget-bcd-team`)에서 이 Task 의 build·review·fix 로 배정된 에이전트는 파일을 고치지도, 시험을 돌리지도 말고 즉시 끝낸다** — build·fix 면 `status:"done"`, `summary:"Workflow 2 로 이관됨 — 작업 없음"`, `commits:[]`, `files:[]`, `tests:"-"`, review 면 `verdict:"pass"`, `findings:[]`, `testsRerun:"-"`. Workflow 2 팀원은 이 표시를 무시하고 Task 를 수행한다. (Task 0 에서 새 props 타입이 dist 에 이미 있으므로 Task 1 완료를 기다리지 않고 시작한다.)

**소유:** `src/frontend/m-mcm/page-components/csa/commWidgetMng/` 의 `page.tsx`·`WidgetListTab.tsx`·`WidgetDetailForm.tsx`·`WidgetPreview.tsx`·`api.ts`·`types.ts`·`form-model.ts`·`styles` 파일(새로 만들면), 시험 `page-components/csa/commWidgetMng/*.test.ts`(Task 5 의 `layout-*.test.ts` 제외). `LayoutTab.tsx`·`layout-*.ts` 는 Task 5 소유 — import 만 한다.

**Interfaces:**
- Consumes: Task 2 `commWidgetMng/search·save·delete`, shared `mergeWidgetRegistry`·`applyWidgetOverride`·`defWidgetMeta`·`defWidgetLoader`·`toWidgetDefRow`·`WidgetFrame`·`WidgetHeaderActions`, `WIDGET_REGISTRY`·`WIDGET_TYPE_REGISTRY`, 유형 편집기 계약 `WidgetTypeEditorProps`, `LayoutTab`(Task 5).
- Produces: 화면 `mcm:csa/commWidgetMng`(page-registry 가 `page-components/csa/commWidgetMng/page.tsx` 를 잡는다 — `node scripts/generate-page-registry.mjs` 로 확인), 테스트 ID `widget-admin-page`·`widget-admin-grid`·`widget-admin-detail`·`widget-admin-save`·`widget-admin-delete`·`widget-admin-new`·`widget-admin-preview`.

**요구(스펙 §10.1):**
- `page.tsx`: `PageLayout title="위젯 관리"` + 탭 「위젯 목록」(WidgetListTab)·「기본 배치」(`LayoutTab`). 다른 CSA 화면(`screenUsageStat`·`commSyncMng`)의 구조·스타일 관례를 따른다.
- 목록: `form-model.ts` 의 순수 함수 `buildAdminRows(code, types, defs, usage)` → 행 `{ widgetId, title, kind: "코드"|"정의", typeTitle, useYn, defaultSize("w×h"), userCount, overridden(boolean), def?: WidgetDefRow }`. 코드 위젯은 DB 행이 없어도 전부 보인다. 정의 위젯 중 유형이 등록부에 없는 것도 「알 수 없는 유형」으로 보인다(관리자가 지울 수 있게). 검색(이름·ID), 구분·사용 필터. 그리드는 shared 래퍼(AgDataGrid 등, `mantine-aggrid-ui` 규칙).
- [새 위젯 ▾]: 유형 등록부 목록(제목·설명)에서 고르면 빈 상세(제목 = 유형 제목, 크기 = 유형 기본, config = `initialConfig` 복사, useYn Y)를 연다.
- 상세(`WidgetDetailForm`): 공통 칸(이름·부제·설명·기본/최소/최대 크기·새로 고침 주기·화면 열기 pageId·여러 번 허용·사용) — 코드 위젯은 자리 표시에 코드 값, 비우면 NULL. 정의 위젯은 공통 칸 + 유형 편집기(`WIDGET_TYPE_REGISTRY[typeId].loadEditor()` 를 `React.lazy` 로, `value=config`, `onChange`, `onValidate`). 검사(`form-model.ts` 순수 함수 `validateDefForm(form)` — 서버 §5.3 과 같은 규칙의 화면 판)·편집기 오류가 있으면 [저장] 비활성 + 오류 목록.
- 저장: `stripScreenOnlyKeys(config)`(최상위 `__*` 키 제거, 순수 함수) 후 `configJson = JSON.stringify(...)` 로 `save`. 성공하면 목록 새로 고침·그 행 선택. 실패 메시지는 알림.
- 삭제/되돌리기: 정의 위젯 [삭제](사용자 수 0 일 때만 활성, 확인 창), 코드 위젯 [코드 값으로 되돌리기](덮어쓰기 행이 있을 때만, 확인 창) → `delete`.
- 미리보기(`WidgetPreview`): 저장 전 값으로 entry 를 만든다 — 코드 위젯 `{ meta: applyWidgetOverride(code.meta, formRow), load: code.load }`, 정의 위젯 `{ meta: defWidgetMeta(formRow, type), load: defWidgetLoader(type, config) }`(config 에 `__preview` 가 있으면 그대로 넘긴다). `WidgetFrame` 을 기본 크기 비율(폭 = 미리보기 영역 × w/24, 높이 = h×20 + (h−1)×8 px)로 그린다. 값이 바뀌면 entry 를 새로 만들되 300ms 디바운스.
- 바뀐 값이 있는데 다른 행을 고르면 「저장하지 않은 변경을 버릴까요?」.
- `api.ts`: `searchWidgetDefs()`·`saveWidgetDef(row)`·`deleteWidgetDef(widgetId)` — `screenUsageStat/api.ts` 와 같은 envelope 규칙(`createJsonApiClient`).

**시험:** `form-model.test.ts` — `buildAdminRows`(코드 행 없는 위젯·덮어쓴 위젯·사용 중지·알 수 없는 유형·사용자 수), `validateDefForm`(제목 필수·크기 범위·DEF_W 25·refreshSec 10), `stripScreenOnlyKeys`(`__preview` 제거, 중첩 키는 유지), 폼↔행 변환(빈 칸 → null). `api.test.ts` — envelope 해제·실패 throw.

- [ ] **Step 1:** 순수 함수 시험 → 실패 → `form-model.ts`·`api.ts` 구현 → 통과.
- [ ] **Step 2:** `page.tsx`·`WidgetListTab`·`WidgetDetailForm`·`WidgetPreview` 구현 → tsc 자기 파일 오류 0 → `node scripts/generate-page-registry.mjs` 로 화면 등록 확인.
- [ ] **Step 3:** 커밋(`feat(mcm): 위젯관리 화면(위젯 목록·상세·미리보기)을 추가한다`).

---

### Task 5: 위젯관리 화면 — 기본 배치 탭 (B) — Task 1 뒤

> **배정 변경(2026-10-03):** 이 Task 는 **Workflow 2(`widget-bcd-team-2`)** 팀원이 맡는다. **Workflow 1(`widget-bcd-team`)에서 이 Task 의 build·review·fix 로 배정된 에이전트는 파일을 고치지도, 시험을 돌리지도 말고 즉시 끝낸다** — build·fix 면 `status:"done"`, `summary:"Workflow 2 로 이관됨 — 작업 없음"`, `commits:[]`, `files:[]`, `tests:"-"`, review 면 `verdict:"pass"`, `findings:[]`, `testsRerun:"-"`. Workflow 2 팀원은 이 표시를 무시하고 Task 를 수행한다. (Task 0 에서 새 props 타입이 dist 에 이미 있으므로 Task 1 완료를 기다리지 않고 시작한다.)

**소유:** `src/frontend/m-mcm/page-components/csa/commWidgetMng/LayoutTab.tsx`(자리 표시를 통째로 바꾼다)·`layout-api.ts`·`layout-store.ts`·`layout-model.ts`·`DeptPicker.tsx`, 시험 `page-components/csa/commWidgetMng/layout-*.test.ts`.

**Interfaces:**
- Consumes: Task 1 `WidgetWorkspace singleTab`·`typeTitles`, Task 2 `commWidgetMng/searchLayouts·loadLayout·saveLayout·deleteLayout·searchDepts`, `widgetDef/list`(정의 목록 — 등록부 합치기용), shared `mergeWidgetRegistry`·`toWidgetDefRow`, `HOME_DEFAULT_LAYOUT`(`@/page-components/home/home-layout`).
- Produces: `export function LayoutTab()`(props 없음), `createLayoutStore(layoutKey, initial): WidgetStore`.

**요구(스펙 §10.2):**
- 왼쪽: 배치 목록(`searchLayouts`) — 「전사(*)」는 늘 첫 줄(행이 없어도 「코드 기본값 사용 중」으로 보인다), 부서 배치는 「부서명(코드) · n개」. [부서 추가] → `DeptPicker`(검색 칸 + 결과 목록, `searchDepts`) → 고르면 그 부서를 목록에 임시로 넣고 고른다(아직 저장 전 표시).
- 오른쪽: 고른 키의 보드 — `WidgetWorkspace singleTab={{ title: "전사 기본 배치" | "{부서명} 기본 배치" }}`, `registry` = `mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs)`(사용 중지 위젯은 서랍에 안 보인다 — Task 1), `typeTitles`, `store = createLayoutStore(...)`, `key={layoutKey}`.
- `createLayoutStore`: `load()` → `loadLayout(layoutKey, effective=Y)` 결과 items 가 있으면 `[{ tabId:"home", name:"홈", seq:0, locked:false, items }]`, 없으면 `[]`(WidgetWorkspace 가 `homeDefault=HOME_DEFAULT_LAYOUT` 을 쓴다). `saveTab(tab)` → `saveLayout(layoutKey, tab.items)`. `resetHome()`·`deleteTab`·`reorderTabs` 는 쓰지 않으므로 거절(Error). 상속 배치(`sourceKey ≠ layoutKey`)를 보고 있으면 보드 위에 「{sourceKey 이름} 배치를 물려받아 보이는 중입니다. 저장하면 이 부서 배치가 생깁니다」.
- [기본 배치 지우기](행이 있는 키만 활성, 확인 창) → `deleteLayout` → 목록·보드 새로 고침(`key` 바꿔 다시 마운트).
- `widgetDef/list` 실패면 `registryStatus="error"` 로 넘긴다(편집 막힘).

**시험:** `layout-model.test.ts` — 배치 목록 정렬(전사 먼저, 없으면 자리 추가), 표시 이름, `layout-store` 의 load 변환(items 있음/없음/상속)·saveTab 위임·거절 action. `layout-api.test.ts` — envelope·params(effective=Y)·grids.widgets.rows 모양.

- [ ] **Step 1:** 시험 → 실패 → `layout-model.ts`·`layout-store.ts`·`layout-api.ts` → 통과.
- [ ] **Step 2:** `LayoutTab.tsx`·`DeptPicker.tsx` → tsc 자기 파일 오류 0.
- [ ] **Step 3:** 커밋(`feat(mcm): 위젯관리 기본 배치 탭(전사·부서)을 추가한다`).

---

### Task 6: 쿼리 실행기·widgetData (C)

**소유:** `mcm-core …/widget/query/**`(Task 0 의 `WidgetQueryRunner`·`WidgetQueryResult` 는 읽기 전용), `mcm-core …/widget/data/**`(새), 시험 `…/test/…/widget/{query,data}/**`, mcm api 리소스 `services/roleManagement/widgetData.bpmn`, mcm api 시험 `widget/WidgetDataBpmnActionTest.java`.

**Interfaces:**
- Consumes: `WidgetDefRepository`, `WidgetDefSavedEvent`, `WidgetUserContextResolver`, mcm 기본 `DataSource`·`PlatformTransactionManager`.
- Produces: `@Component WidgetQueryExecutor implements WidgetQueryRunner`(빈은 하나만), `SqlGuard`(순수 클래스: `static Validated check(String sql)` → 정리된 SQL·쓰인 변수 목록, 위반 시 `BusinessException(INVALID_VALUE, 메시지)`), OASIS `widgetData`(빈 `widgetDataService`) action `run` params `defId` → `result: { columns, rows, truncated }`.

**요구(스펙 §7):**
- `SqlGuard`: §7.1 순서 그대로. 문자열 리터럴(`'…'`, `''` 이스케이프 포함), 따옴표 식별자(`"…"`), 주석(`--` 줄, `/* */`)을 걷어 낸 뒤 판단. 끝 `;` 하나 허용. 금지 낱말은 **단어 경계·대소문자 무시**. 변수는 `(?<!:):([A-Za-z_][A-Za-z0-9_]*)`(PostgreSQL `::` 캐스트 제외) 중 §7.2 목록만. 메시지 예: 「SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다」, 「문장은 하나만 쓸 수 있습니다」, 「쓸 수 없는 낱말이 있습니다: UPDATE」, 「알 수 없는 변수입니다: :foo (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)」.
- `WidgetQueryExecutor`:
  - `runDefinition(defId, maxRows)`: 정의 없음 → 「위젯 정의를 찾을 수 없습니다」, `USE_YN='N'` → 「사용 중지된 위젯입니다」, 유형이 `query-` 아님 → 「쿼리 위젯이 아닙니다」, `dataSrc ≠ mcm` → 「아직 지원하지 않는 모듈입니다」. config 의 `sql` 을 검사·실행. 결과 캐시 키 = `defId + maxRows + (쓰인 시스템 변수 이름=값들)`, 30초(`Clock` 주입해 시험). DB 오류는 로그(defId·원인)만 남기고 「위젯 데이터를 불러오지 못했습니다」.
  - `preview(dataSrc, sql, maxRows)`: 같은 검사, 캐시 없음, DB 오류 메시지를 그대로 담아 던진다(「쿼리 오류: …」).
  - `validateSql(sql)`: `SqlGuard.check`.
  - 실행: `TransactionTemplate`(readOnly, 전파 REQUIRES_NEW) 안에서 `NamedParameterJdbcTemplate` 로 `setMaxRows(maxRows+1)`·`setQueryTimeout(10)`·`setFetchSize(100)` 를 건 `PreparedStatementCreator`, 끝나면 `status.setRollbackOnly()`. 시스템 변수는 쓰인 것만 바인딩(`:today` 등 `yyyyMMdd`, Asia/Seoul, `Clock` 주입). 값 변환: `Timestamp`/`Date`/`LocalDateTime` → ISO 문자열, `BigDecimal`·정수 → 숫자, `Clob` → 문자열 4000자, `byte[]` → null, 그 밖 `toString`. 컬럼 이름은 `ResultSetMetaData.getColumnLabel`.
  - `@EventListener WidgetDefSavedEvent` → 그 defId 캐시 키 전부 비우기.
- `widgetData.run`: 사용자 컨텍스트는 실행기가 resolver 로 얻는다. 서비스는 `defId` 만 읽어 `runDefinition(defId, 500)`.

**시험:**
- `query/SqlGuardTest`(표 형식 `@ParameterizedTest`):
  - 통과: `SELECT 1`, `select * from t where a = :userId`, `WITH x AS (SELECT 1 a) SELECT a FROM x`, `SELECT 1;`, `SELECT col::text FROM t`, `SELECT 'a;b' FROM t`, `SELECT '10:30' FROM t`, `SELECT 1 -- ; drop\n`, `SELECT /* update */ 1`, `SELECT "update" FROM t`.
  - 거절: `UPDATE t SET a=1`, `SELECT 1; SELECT 2`, `select * into x from t`, `SELECT * FROM t FOR UPDATE`, `DeLeTe FROM t`, `SELECT 1; DROP TABLE t`, `PRAGMA x`, `select :foo`, `EXEC p`, `` (빈 문자열), `   `, `SELECT 1;;`.
- `query/WidgetQueryExecutorTest`(H2 메모리 DataSource + `DataSourceTransactionManager`, 표 하나 만들어 600행): 500 상한·`truncated`, 컬럼 순서, `:userId`·`:deptCd`(resolver mock)·`:today`(고정 Clock) 바인딩, 쓰이지 않은 변수 미바인딩, 캐시 30초 안 재사용·지나면 다시 조회(Clock 이동), 이벤트로 캐시 비우기, 사용 중지·비쿼리·없는 정의·mls 거절, DB 오류 시 사용자 메시지 고정·preview 는 원인 포함, 실행 뒤 연결의 트랜잭션이 롤백됨(실행 중 쓰기 시도가 검사에서 막히는 것과 별개로 `readOnly`·롤백 설정 확인 — `TransactionTemplate` 속성 단언).
- `data/WidgetDataServiceTest`: `defId` 없으면 거절, 500 위임.
- mcm api `WidgetDataBpmnActionTest`: 분기 `run`, 빈 `widgetDataService`, output=result.

- [ ] **Step 1:** `SqlGuardTest` → 실패 → `SqlGuard` → 통과.
- [ ] **Step 2:** 실행기 시험 → 실패 → `WidgetQueryExecutor` → 통과.
- [ ] **Step 3:** `widgetData` 서비스·BPMN·계약 시험 → 통과 → `oasis-contract-check`.
- [ ] **Step 4:** 커밋.

---

### Task 7: 쿼리 유형 3종 — 표·차트·숫자 (C)

> **리뷰 배정 변경(2026-10-03):** 이 Task 의 리뷰는 팀장이 따로 띄운 리뷰어(sonnet)가 맡는다. **Workflow 1(`widget-bcd-team`)의 `review:T7` 에이전트는 파일을 읽거나 시험을 돌리지 말고 즉시 끝낸다** — `verdict:"pass"`, `findings:[]`, `testsRerun:"팀장 별도 리뷰로 이관"`. 팀장이 띄운 리뷰어는 이 표시를 무시하고 리뷰한다.

**소유:** `src/frontend/m-mcm/widget-types/query-table/**`·`query-chart/**`·`query-number/**`·`_query/**`(공용 도우미: api·SQL 편집 칸·데이터 훅·서식·필드 고르기, 시험 포함).

**Interfaces:**
- Consumes: `WidgetProps`(definition·widgetId·refreshKey·size), `useWidgetStatus`·`useWidgetBodySize`·`WidgetHeaderActions`(shared widget), shared 차트(`@dk-oasis/shared/charts` 의 LineChart·StackedColumnChart·PieChart·DonutChart·HBarChart 중 맞는 것)·`KpiTile`(`@dk-oasis/shared/dashboard`)·그리드 래퍼, Task 6 `widgetData/run`, Task 2 `commWidgetMng/previewQuery`.
- Produces: 유형 `query-table`·`query-chart`·`query-number`(각 `type.meta.ts`·`renderer.tsx`·`editor.tsx`), `_query/api.ts` 의 `runWidgetQuery(defId)`·`previewWidgetQuery(dataSrc, sql)`(둘 다 `{ columns: string[]; rows: Record<string, unknown>[]; truncated: boolean }`).

**요구(스펙 §3·§6):**
- `type.meta.ts`: 스펙 §3 표의 id·title·기본 크기(12×12·12×12·12×6), `minSize` 4×4, `bodyPadding`(표 false, 나머지 기본), `initialConfig`(표 `{ sql: "", columns: [] }`, 차트 `{ sql: "", chartType: "bar", xField: "", series: [] }`, 숫자 `{ sql: "", labelField: "", valueField: "", format: "number" }`). 설명 한 줄.
- 렌더러 공통(`_query/useQueryData.ts`): `definition.__preview` 가 있으면 그것을 쓰고 서버를 부르지 않는다. 없으면 `runWidgetQuery(widgetId)` — `refreshKey` 가 바뀌면 다시. 로딩·오류는 `useWidgetStatus`(오류 메시지 「위젯 데이터를 불러오지 못했습니다」 + 다시 시도). 결과 0행이면 「표시할 데이터가 없습니다」.
- 표: `columns` 설정이 없으면 결과 컬럼 전부. `header`·`width`·`align`·`format`(number 천 단위 구분, date `yyyy-MM-dd`). `truncated` 면 아래 「상위 500행만 표시합니다」. 칸을 꽉 채운다.
- 차트: `chartType` bar(세로 막대) / line / area(선 차트의 영역 옵션, 없으면 line) / pie(첫 계열만). `xField` 가 x 축, `series[].field` 값은 숫자로. 크기는 `useWidgetBodySize`.
- 숫자: 결과 행마다 타일(최대 8개) — 라벨 `labelField`, 값 `valueField`(`format` number=천 단위, percent=소수 1자리 + %), 단위는 `unitField` 값 또는 `unit`.
- 편집기 공통(`_query/SqlEditor.tsx`): 고정폭 textarea(행 8 이상), 아래에 시스템 변수 안내(`:userId :deptCd :today :yesterday :monthStart :now`), [쿼리 시험] → `previewWidgetQuery("mcm", sql)` → 성공하면 `onChange({ ...value, __preview: result })` 와 결과 요약(n행·컬럼 목록), 실패하면 서버 메시지. `onValidate`: SQL 비면 「SQL 을 입력하세요」, 차트는 xField·series 1개 이상, 숫자는 labelField·valueField. 필드 고르기 select 는 `__preview.columns`(없으면 직접 입력 칸).
- `_query/format.ts`(순수): 숫자·날짜·퍼센트 서식, 차트 데이터 변환(`toChartData(rows, xField, series)`), 숫자 타일 변환(`toNumberTiles(rows, cfg)`), 표 컬럼 정의 변환(`toColumnDefs(columns, cfg)`), 편집기 검사(`validateQueryConfig(typeId, cfg)`).

**시험:** `_query/format.test.ts`(서식·변환·검사 전부), `_query/api.test.ts`(envelope·params `defId`/`dataSrc`·`sql`). 렌더러는 tsc 로 확인.

- [ ] **Step 1:** 순수 함수 시험 → 실패 → 구현 → 통과(`cd src/frontend/m-mcm && pnpm vitest run widget-types/_query`).
- [ ] **Step 2:** 유형 세 폴더 구현 → `node scripts/generate-widget-registry.mjs`(생성 성공 확인, 커밋하지 않음) → tsc 자기 파일 오류 0.
- [ ] **Step 3:** 커밋(`feat(mcm): 쿼리 표·차트·숫자 위젯 유형을 추가한다`).

---

### Task 8: 콘텐츠 유형 4종 — 글(md)·html·웹 주소·링크 모음 (C)

**소유:** `src/frontend/m-mcm/widget-types/markdown/**`·`html/**`·`web/**`·`links/**`·`_content/**`(공용 도우미·시험).

**Interfaces:**
- Consumes: shared `MarkdownView`·`MarkdownField`(또는 `MarkdownEditor`)·`NoticeBodyView`/정화 함수(공개 export 를 `src/frontend/shared/package.json` exports 에서 확인), `openPortalPage`·`WidgetHeaderActions`(shared widget), 포털 메뉴 조회(사이드바가 쓰는 `secUser/myMenusTree` 등 기존 API — m-mcm 코드에서 찾아 쓴다).
- Produces: 유형 `markdown`·`html`·`web`·`links`, 순수 함수 `_content/html-frame.ts` 의 `htmlFrameProps(html)` → `{ sandbox: "allow-scripts", srcDoc: string, referrerPolicy: "no-referrer" }`, `_content/web.ts` 의 `checkWebUrl(url, portalOrigin)` → `{ ok: true, url } | { ok: false, message }`·`webFrameProps(url)`.

**요구(스펙 §6):**
- `markdown`: 기본 8×10, `initialConfig { markdown: "" }`. 렌더러 `MarkdownView`(정화 포함인지 확인 — 아니면 shared 정화 함수를 거친다). 편집기 md 입력 칸(shared 편집기 재사용, 없으면 textarea) + 미리보기는 관리 화면 미리보기가 맡는다.
- `html`: 기본 8×10, `initialConfig { html: "", allowScript: false }`. `allowScript=false` → shared 정화 함수로 정화해 포털 안에 그린다(스크립트·`on*` 속성 제거). `true` → `<iframe {...htmlFrameProps(html)} />` 칸을 채운다 — **sandbox 값은 정확히 `"allow-scripts"`**(`allow-same-origin` 금지 — W-D25). 편집기: html textarea + 「스크립트 허용」 체크(켜면 경고 문구 「스크립트는 포털과 분리된 칸에서 실행됩니다. 포털 화면·로그인 정보에는 접근할 수 없습니다」).
- `web`: 기본 12×16, `initialConfig { url: "" }`, `bodyPadding:false`. `checkWebUrl`: http(s) 절대 주소만, 포털과 같은 출처는 거절(「포털 화면은 링크 모음 위젯으로 여세요」). 렌더러: `<iframe src sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer">` + `WidgetHeaderActions` 의 [새 탭으로 열기](`window.open(url, "_blank", "noopener")`) + 본문 아래 작은 안내 「화면이 보이지 않으면 [새 탭으로 열기]를 누르세요」. 편집기: 주소 칸 + 즉시 검사 메시지.
- `links`: 기본 6×10, `initialConfig { items: [] }`. 항목 `{ label, kind: "page"|"url", pageId?, url? }`. 렌더러: 목록 — page 는 `openPortalPage(pageId)`, url 은 새 탭(`noopener`). 편집기: 항목 추가·삭제·위아래 이동, 종류 고르기, page 는 메뉴에서 고르기(검색 select, 실패하면 pageId 직접 입력), url 은 http(s) 검사. `onValidate`: 이름 비면, url 형식 틀리면 오류.

**시험:** `_content/html-frame.test.ts`(sandbox 값이 정확히 `allow-scripts`, `allow-same-origin` 없음, srcDoc 그대로), `_content/web.test.ts`(http·https 통과, `javascript:`·`data:`·상대 주소·같은 출처 거절, `webFrameProps` sandbox 값), `_content/links.test.ts`(항목 검사·이동 순수 함수).

- [ ] **Step 1:** 순수 함수 시험 → 실패 → 구현 → 통과(`pnpm vitest run widget-types/_content`).
- [ ] **Step 2:** 유형 네 폴더 → 생성 스크립트 확인 → tsc 자기 파일 오류 0.
- [ ] **Step 3:** 커밋(`feat(mcm): 글·html·웹 주소·링크 모음 위젯 유형을 추가한다`).

---

### Task 9: 환율·날씨 백엔드 (D)

**소유:** `mcm-core …/widget/ext/**`(새), 시험 `…/test/…/widget/ext/**`, mcm api 리소스 `services/roleManagement/widgetExt.bpmn`, mcm api 시험 `widget/WidgetExtBpmnActionTest.java`.

**Interfaces:**
- Produces: 엔티티 `ExchangeRate`(`TB_MCM_EXCHANGE_RATE`, 스펙 §4.4, 복합키) + 저장소 + `ExchangeRateWriter`(upsert), `ExchangeRateProvider`(`FrankfurterProvider`·`KoreaEximProvider`), `WeatherProvider`(`OpenMeteoProvider` — 2026-10-09 수집 전환 뒤 삭제), 설정 `WidgetExtProperties`(`dmes.widget.ext.enabled`(기본 true), `.exchange.provider`(frankfurter), `.exchange.frankfurter-base-url`(`https://api.frankfurter.dev/v1`), `.exchange.koreaexim-key`(빈 값), `.exchange.koreaexim-base-url`(`https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`), `.weather.base-url`(`https://api.open-meteo.com/v1/forecast` — 2026-10-09 삭제)), OASIS `widgetExt`(빈 `widgetExtService`) action `exchange`·`weather`(입출력 스펙 §5.1).

**요구(스펙 §8):**
- `exchange`: params `base`(KRW 만 — 그 밖 거절), `symbols`(쉼표 문자열 또는 grids, 3자리 대문자, 1~10개), `days`(1~90, 기본 30). 흐름: DB 에서 `[오늘-days, 오늘]` 값을 읽고, 오늘 또는 빠진 영업일 구간이 있으면(같은 날 같은 통화 묶음은 하루 한 번만 시도 — 메모리 `Map<String, LocalDate>`) 제공자로 받아 upsert. 제공자 실패면 DB 값만 + `stale: true`. `latest` = 통화별 가장 최근 날짜 값과 그 전 값의 차(`diff`). 역수 변환: Frankfurter `base=KRW` 응답의 `rates.USD = 0.000724` → 「1 USD = 1/0.000724 KRW」, 소수 8자리 반올림(HALF_UP).
- Frankfurter 요청: 구간 `GET {base-url}/{from}..{to}?base=KRW&symbols=USD,EUR`(응답 `{"base":"KRW","start_date":…,"end_date":…,"rates":{"2026-09-30":{"USD":0.000724,…},…}}`), 하루면 `GET {base-url}/{date}?base=KRW&symbols=…`(응답 `{"date":…,"rates":{…}}`). 두 모양 모두 파싱.
- KoreaExim(키가 있을 때만, provider=koreaexim): `GET {url}?authkey=KEY&searchdate=yyyyMMdd&data=AP01` → 배열 `[{ "cur_unit":"USD","deal_bas_r":"1,380.5", … }, { "cur_unit":"JPY(100)", … }]`. 쉼표 제거, `(100)` 단위는 100 으로 나눈다. 날짜별로 하루씩 부른다(최대 days 번 — 주말은 빈 배열).
- `weather`: params `lat`(−90~90)·`lon`(−180~180). 캐시 키 = 소수 둘째 자리 반올림 좌표, 10분(`Clock` 주입). 응답 매핑: `current.temperature_2m→temp`, `weather_code→code`, `wind_speed_10m→wind`, `relative_humidity_2m→humidity`, `daily.time[i]→date`, `temperature_2m_min/max`, `weather_code`, `precipitation_probability_max→pop`. 실패 → 「날씨 정보를 불러오지 못했습니다」(캐시에 이전 값이 있으면 그것 + `stale: true`).
- `enabled=false` 면 외부 호출 없이 DB·캐시 값만(없으면 빈 결과 + `disabled: true`).
- HTTP: `RestClient`(연결 3초·읽기 5초 — `SimpleClientHttpRequestFactory` 또는 JDK `HttpClient` 팩토리), 빈으로 `RestClient.Builder` 를 받아 시험에서 `MockRestServiceServer.bindTo(builder)` 로 묶는다.

**시험:** `ext/FrankfurterProviderTest`(구간·하루 응답 파싱, 역수·반올림, 오류 → 예외), `ext/KoreaEximProviderTest`(쉼표·JPY(100)·빈 배열), `ext/ExchangeServiceTest`(H2 또는 Mockito: 빈 구간만 요청, 하루 한 번 시도, 실패 시 stale, diff 계산, 입력 검사), `ext/OpenMeteoProviderTest`(매핑 — 2026-10-09 클래스 삭제와 함께 제거), `ext/WeatherServiceTest`(캐시 10분·좌표 반올림·실패 시 이전 값 stale·enabled=false), mcm api `WidgetExtBpmnActionTest`.

- [ ] **Step 1~4:** 제공자 → 환율 서비스 → 날씨 서비스 → BPMN·계약 시험 순서로 TDD, 각 단계 `./gradlew :mcm-core:test --tests "com.dongkuk.dmes.mcm.widget.ext.*"` 통과.
- [ ] **Step 5:** `oasis-contract-check` → 커밋.

---

### Task 10: 미디어 백엔드 + BFF 바이너리 (D)

**소유:** `mcm-core …/widget/media/**`(새), 시험 `…/test/…/widget/media/**`, `src/backend/mcm/api/src/main/resources/application.yml` 의 `spring.servlet.multipart.*` 와 `dmes.widget.media-dir` 키(이 키들만), 필요하면 `src/frontend/m-mcm/lib/http/be-proxy.ts` 와 그 시험(바이너리·멀티파트·Range 전달이 깨질 때만).

**Interfaces:**
- Produces: 엔티티 `WidgetMedia`(`TB_MCM_WIDGET_MEDIA`, 스펙 §4.3) + 저장소, `WidgetMediaStorage`(`save(MultipartFile) → WidgetMedia`, `open(fileId) → Resource`), `@RestController WidgetMediaController`:
  - `POST /api/mcm/commWidgetMng/upload`(multipart 필드 `file`) → JSON `{ "fileId", "origNm", "contentType", "size" }`(오류는 기존 REST 오류 응답 관례 — `SampleNoticeController`·전역 예외 처리 확인).
  - `GET /api/mcm/widgetMedia/file/{fileId}` → `ResponseEntity<Resource>`, `Content-Type`(저장값), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename*=UTF-8''…`, `Cache-Control: private, max-age=86400`, Range 지원(Spring MVC 가 `Resource` 본문에 Range 를 처리하는지 시험으로 확인).

**요구(스펙 §4.3·§5):**
- `fileId` = UUID 하이픈 제거 32자. 경로는 `media-dir/{fileId}` 만(`^[0-9a-f]{32}$` 아니면 404 — 경로 조작 차단). `media-dir` 기본 `./data/widget-media`(실행 폴더 기준, 없으면 만든다).
- 형식 검사: 확장자(png·jpg·jpeg·gif·webp·mp4·webm) **와** 앞 바이트 매직 넘버(PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WEBP `RIFF....WEBP`, MP4 `....ftyp`, WEBM `1A 45 DF A3`)가 같은 종류여야 한다. 저장 `CONTENT_TYPE` 은 매직 넘버로 정한 값. SVG·html 등은 「올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)」. 크기 초과 「이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다」.
- multipart 한도: `spring.servlet.multipart.max-file-size: 100MB`, `max-request-size: 101MB`(mcm api `application.yml`).
- **BFF 확인**: `src/frontend/m-mcm/lib/http/be-proxy.ts` 의 `forwardToBackend` 가 (1) multipart 요청 본문을 바이트 그대로 넘기는지(`req.text()`·JSON 파싱이면 깨진다), (2) 바이너리 응답을 스트림·바이트로 넘기는지, (3) `Range`·`Content-Range`·`Accept-Ranges`·`Content-Disposition`·`X-Content-Type-Options` 헤더를 통과시키는지 읽어서 확인하고, 깨지는 부분만 고친다(기존 동작은 그대로 — 그 파일의 기존 시험이 있으면 함께 통과).
- 권한: 다운로드 경로는 Task 0 에서 AUTH_ONLY, 업로드는 위젯관리 RBAC(`upload` 토큰). BE 필터가 REST 경로 `/api/mcm/{objId}/{action}/…` 를 PermKey 로 읽는지 `PermKey.parseUrl` 을 보고 확인해 보고서에 적는다.

**시험:** `media/WidgetMediaStorageTest`(임시 폴더: png 저장·열기, 확장자 png + 내용 SVG 거절, 크기 초과 거절, 이상한 fileId 거절), `media/WidgetMediaControllerTest`(`MockMvc` standalone: 업로드 200 JSON, 다운로드 헤더 3종, `Range: bytes=0-9` → 206·`Content-Range`, 없는 파일 404). be-proxy 를 고쳤다면 그 단위 시험.

- [ ] **Step 1~3:** 저장소 → 컨트롤러 → BFF 점검 순서로 TDD.
- [ ] **Step 4:** 커밋.

---

### Task 11: 챗봇 백엔드 — LLM 공급자·도구·기록 (D)

**소유:** `mcm-core …/widget/chat/**`(새), 시험 `…/test/…/widget/chat/**`, mcm api 리소스 `services/roleManagement/widgetChat.bpmn`, mcm api 시험 `widget/WidgetChatBpmnActionTest.java`.

**Interfaces:**
- Consumes: `WidgetDefRepository`, `WidgetQueryRunner`(구현 Task 6 — 시험에서 mock), `WidgetUserContextResolver`, 포털 메뉴 조회(사용자가 볼 수 있는 화면 — `secUser/myMenus` 를 처리하는 기존 서비스 메서드를 찾아 읽기 전용으로 쓴다).
- Produces: `LlmClient` 인터페이스(`LlmReply chat(String system, List<LlmMessage> messages, List<LlmTool> tools)`), 구현 `OpenAiCompatibleLlmClient`·`AnthropicLlmClient`·`FakeLlmClient`, 설정 `dmes.widget.llm.provider`(빈 값=fake)·`.base-url`·`.model`·`.api-key`·`.timeout-sec`(60)·`.max-tokens`(1024), 엔티티 `WidgetChatMessage`(`TB_MCM_SEC_USER_WIDGET_CHAT`, 스펙 §4.5) + 저장소 + `WidgetChatWriter`, OASIS `widgetChat`(빈 `widgetChatService`) action `history`·`send`·`reset`(스펙 §5.1).

**요구(스펙 §9):**
- **먼저 `claude-api` 스킬을 불러** Messages API 요청·응답·tool use 형식을 확인한다. SDK 의존성은 더하지 않고 `RestClient` 로 HTTP 를 직접 부른다(Anthropic: `POST {base-url 기본 https://api.anthropic.com}/v1/messages`, 헤더 `x-api-key`·`anthropic-version: 2023-06-01`, 모델 기본 `claude-sonnet-5-5`. OpenAI 호환: `POST {base-url}/chat/completions`, `Authorization: Bearer`(키 있을 때), `tools`/`tool_calls`).
- `send(instId, defId, message)`: 메시지 1~2000자(그 밖 거절), 정의가 `chat` 유형·사용 중이어야 한다. 사용자 메시지를 먼저 저장(`MSG_SEQ` = 그 인스턴스 최대+1). 문맥 = 저장 기록 최근 20개. 시스템 프롬프트 = 「너는 DMES 포털의 도우미다. 오늘은 {yyyy-MM-dd}, 사용자는 {userNm}({deptNm 없으면 생략}).」 + 줄바꿈 + 정의 `systemPrompt`. 도구 반복 최대 4번. 최종 답과 `links`(find_screen 이 돌려준 화면 중 답에 쓰인 것 — 단순하게 이번 대화 차례에 find_screen 이 돌려준 화면 전부, 최대 5개)를 assistant 로 저장하고 돌려준다. 공급자 오류·시간 초과 → assistant 저장 없이 `BusinessException(BUSINESS_ERROR, "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.")`.
- 도구: `find_screen(keyword)` — `pageGuide=true` 일 때만 제공. 사용자가 볼 수 있는 메뉴 중 이름에 keyword 가 든 화면 최대 10개 `[{pageId, title, path}]`(pageId 는 포털이 여는 값 — 사이드바 메뉴가 쓰는 componentPath/모듈 접두 규칙을 코드에서 확인). `run_widget_query(defId)` — `dataQueryDefIds` 가 비어 있지 않을 때만, 목록에 없는 defId 는 도구 오류 결과로 돌려준다(예외로 대화를 끊지 않는다). 결과는 `columns`·`rows`(최대 50)를 JSON 문자열 8,000자로 자른다. 도구 설명에 각 정의의 제목·설명을 넣는다.
- 기록: 인스턴스당 100개 초과분을 오래된 것부터 지운다(Writer 의 한 트랜잭션). `history` 는 오래된 순 전부, `reset` 은 그 인스턴스 기록 전부 삭제. 모두 인증 사용자 기준(IDOR).
- 키·프롬프트를 로그에 남기지 않는다.

**시험:** `chat/AnthropicLlmClientTest`·`chat/OpenAiCompatibleLlmClientTest`(`MockRestServiceServer`: 요청 헤더·본문 모양, 일반 답, tool_use/tool_calls 파싱, 오류 → 예외), `chat/WidgetChatServiceTest`(각본 가짜 LlmClient: 일반 답 저장, 도구 1회 후 답, 반복 상한 4, 허용 안 된 defId 도구 오류, pageGuide=false 면 find_screen 미제공, 2001자 거절, 비chat 정의 거절, 공급자 오류 시 assistant 미저장·사용자 메시지는 저장, 100개 유지, 문맥 20개), `chat/FakeLlmClientTest`, mcm api `WidgetChatBpmnActionTest`.

- [ ] **Step 1:** `claude-api` 스킬 확인 → 공급자 시험 → 구현 → 통과.
- [ ] **Step 2:** 엔티티·Writer·서비스 시험 → 구현 → 통과.
- [ ] **Step 3:** BPMN·계약 시험 → `oasis-contract-check` → 커밋.

---

### Task 12: 환율·날씨 유형 (D)

> **배정 변경(2026-10-03):** 이 Task 는 **Workflow 2(`widget-bcd-team-2`)** 팀원이 맡는다. **Workflow 1(`widget-bcd-team`)에서 이 Task 의 build·review·fix 로 배정된 에이전트는 파일을 고치지도, 시험을 돌리지도 말고 즉시 끝낸다** — build·fix 면 `status:"done"`, `summary:"Workflow 2 로 이관됨 — 작업 없음"`, `commits:[]`, `files:[]`, `tests:"-"`, review 면 `verdict:"pass"`, `findings:[]`, `testsRerun:"-"`. Workflow 2 팀원은 이 표시를 무시하고 Task 를 수행한다.

**소유:** `src/frontend/m-mcm/widget-types/exchange/**`·`weather/**`·`_ext/**`(공용 api·서식·날씨 코드표·시험).

**Interfaces:**
- Consumes: Task 9 `widgetExt/exchange`·`widgetExt/weather` 응답, shared `Sparkline`·`useWidgetStatus`·`useWidgetBodySize`.
- Produces: 유형 `exchange`(기본 8×10, `initialConfig { base: "KRW", currencies: ["USD","EUR","JPY","CNY"], days: 30 }`, refreshSec 은 관리자가 정한다), `weather`(기본 8×8, `initialConfig { locations: [{ name: "서울", lat: 37.5665, lon: 126.978 }] }`).

**요구(스펙 §6·§8):**
- 환율 렌더러: 표(통화·「1 USD」 같은 단위·값 천 단위 소수 2자리·전일 대비 ▲▼ 색), 통화마다 `days` 일 추이 `Sparkline`, `stale` 면 제목 줄에 작은 「갱신 실패」. JPY 는 「100 JPY」 단위로 보인다(값 ×100).
- 날씨 렌더러: 지점이 둘 이상이면 위쪽 작은 탭. 현재 기온(소수 1자리 ℃)·날씨 아이콘·이름(WMO 코드표 `_ext/weather-codes.ts` — 0 맑음, 1~3 구름, 45·48 안개, 51~57 이슬비, 61~67 비, 71~77 눈, 80~82 소나기, 85·86 소낙눈, 95~99 뇌우)·바람(m/s — Open-Meteo 기본 km/h 면 변환)·습도, 3일 예보 줄(요일·최저/최고·강수확률).
- 편집기: 환율 — 통화 다중 선택(USD·EUR·JPY·CNY·GBP·AUD·CAD·CHF·HKD·SGD·VND·THB), 기간(7·30·90일). 날씨 — 지점 목록 편집(이름·위도·경도), 빠른 추가 버튼(서울 37.5665/126.9780, 인천 37.4563/126.7052, 포항 36.0190/129.3435, 당진 36.8898/126.6458, 부산 35.1796/129.0756), 범위 검사.

**시험:** `_ext/format.test.ts`(환율 단위·JPY 100·diff 기호·서식, 바람 단위 변환, 요일), `_ext/weather-codes.test.ts`(대표 코드 매핑·모르는 코드 「알 수 없음」), `_ext/api.test.ts`(params 모양·envelope), 편집기 검사 순수 함수.

- [ ] **Step 1~3:** 순수 함수 TDD → 유형 두 폴더 → 생성 스크립트·tsc 확인 → 커밋.

---

### Task 13: 미디어 유형 (D)

> **배정 변경(2026-10-03):** 이 Task 는 **Workflow 2(`widget-bcd-team-2`)** 팀원이 맡는다. **Workflow 1(`widget-bcd-team`)에서 이 Task 의 build·review·fix 로 배정된 에이전트는 파일을 고치지도, 시험을 돌리지도 말고 즉시 끝낸다** — build·fix 면 `status:"done"`, `summary:"Workflow 2 로 이관됨 — 작업 없음"`, `commits:[]`, `files:[]`, `tests:"-"`, review 면 `verdict:"pass"`, `findings:[]`, `testsRerun:"-"`. Workflow 2 팀원은 이 표시를 무시하고 Task 를 수행한다.

**소유:** `src/frontend/m-mcm/widget-types/media/**`(시험 포함, 공용 도우미가 필요하면 `widget-types/media/` 안에 둔다).

**Interfaces:**
- Consumes: Task 10 업로드(`POST /api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload`, multipart 필드 `file`)·다운로드 경로, `WidgetHeaderActions`.
- Produces: 유형 `media`(기본 8×10, `bodyPadding:false`, `initialConfig { items: [], intervalSec: 8, fit: "contain" }`), 순수 함수 `mediaSrc(src)`(`media:{id}` → `/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/{id}`, http(s) 그대로, 그 밖 null), `youtubeEmbed(url)`(watch·youtu.be·shorts·embed 주소 → `https://www.youtube-nocookie.com/embed/{id}`, 아니면 null).

**요구(스펙 §6):**
- 렌더러: 항목 하나면 그대로, 여럿이면 `intervalSec`(최소 3초) 자동 넘김 + 좌우 버튼 + 점 표시, 마우스를 올리면 멈춘다. image → `<img>`(fit), video → `<video controls muted playsInline>`(자동 넘김 중에는 재생 끝날 때 다음으로), youtube → iframe(`allow="encrypted-media; picture-in-picture"`, `allowFullScreen`). 캡션이 있으면 아래 띠. 불러오기 실패 항목은 「파일을 찾을 수 없습니다」.
- 편집기: [파일 올리기](input file, accept=이미지·동영상, 올리는 중 표시, 실패 메시지) → `{ kind, src: "media:{fileId}" }` 추가, [주소로 추가](이미지·동영상·YouTube 주소, 종류 자동 판정), 항목 캡션·순서·삭제, 넘김 간격·맞춤 방식. `onValidate`: 항목 0개면 「미디어를 하나 이상 넣으세요」, 잘못된 주소.

**시험:** `media/media.test.ts` — `mediaSrc`·`youtubeEmbed`(여러 주소 형태, 잘못된 주소), 종류 판정(`guessKind(url)`), 간격 최소값, 편집기 검사.

- [ ] **Step 1~3:** 순수 함수 TDD → 렌더러·편집기 → 생성 스크립트·tsc → 커밋.

---

### Task 14: 챗봇 유형 (D)

> **배정 변경(2026-10-03):** 이 Task 는 **Workflow 2(`widget-bcd-team-2`)** 팀원이 맡는다. **Workflow 1(`widget-bcd-team`)에서 이 Task 의 build·review·fix 로 배정된 에이전트는 파일을 고치지도, 시험을 돌리지도 말고 즉시 끝낸다** — build·fix 면 `status:"done"`, `summary:"Workflow 2 로 이관됨 — 작업 없음"`, `commits:[]`, `files:[]`, `tests:"-"`, review 면 `verdict:"pass"`, `findings:[]`, `testsRerun:"-"`. Workflow 2 팀원은 이 표시를 무시하고 Task 를 수행한다.

**소유:** `src/frontend/m-mcm/widget-types/chat/**`(시험 포함).

**Interfaces:**
- Consumes: Task 11 `widgetChat/history·send·reset`, Task 2 `commWidgetMng/search`(편집기에서 쿼리 위젯 고르기), `openPortalPage`·`useWidgetStatus`.
- Produces: 유형 `chat`(기본 8×18, `minSize` 6×10, `bodyPadding:false`, `initialConfig { systemPrompt: "", welcome: "무엇을 도와드릴까요?", pageGuide: true, dataQueryDefIds: [] }`).

**요구(스펙 §6·§9):**
- 렌더러: 처음에 `history(instanceId)` — 없으면 `welcome` 을 assistant 말풍선처럼 보인다(저장 안 함). 목록(사용자 오른쪽·도우미 왼쪽 말풍선, 도우미 답은 `MarkdownView` 로), 답의 `links` 는 [열기] 버튼(`openPortalPage(pageId)`). 입력 칸(Enter 보내기, Shift+Enter 줄바꿈, 2000자 제한·남은 글자), 보내는 동안 「답을 기다리는 중…」·입력 막기, 실패면 입력 칸 위 오류(보낸 질문은 목록에 남김). 제목 줄 [새 대화](`WidgetHeaderActions`, 확인 후 `reset`). 새 메시지가 오면 맨 아래로 스크롤. `definition` 은 화면에 필요한 `welcome` 만 쓴다(서버 전용 키는 `widgetDef/list` 가 지운다).
- 편집기: 시스템 프롬프트 textarea, 첫 인사 칸, 「포털 화면 안내」 체크, 「데이터 질의에 쓸 쿼리 위젯」 다중 선택(`commWidgetMng/search` 결과 중 `typeId` 가 `query-` 로 시작하고 사용 중인 정의 — 제목(ID)). 안내 문구: 「AI 연결(공급자·키)은 서버 설정(dmes.widget.llm.*)에서 정합니다」.

**시험:** `chat/chat.test.ts` — 메시지 목록 병합(기록 + 낙관적 사용자 메시지 + 답), 글자 수 제한, 링크 변환, envelope·params(`instId`·`defId`·`message`), 편집기 검사(쿼리 위젯 목록 거르기).

- [ ] **Step 1~3:** 순수 함수 TDD → 렌더러·편집기 → 생성 스크립트·tsc → 커밋.

---

## 통합 (팀장)

### I1: 생성물·전체 프런트 확인
- [ ] `cd src/frontend/m-mcm && node scripts/generate-widget-registry.mjs && node scripts/generate-page-registry.mjs` → `lib/generated/*` 커밋.
- [ ] shared: `pnpm test:unit` 전체, `pnpm build`. m-mcm: `pnpm test:unit`, `pnpm test:scripts`, `heavy.sh pnpm exec tsc --noEmit -p tsconfig.json` 오류 0.

### I2: 전체 백엔드 확인
- [ ] `JAVA_HOME=… ./gradlew :mcm-core:test :mcm:api:test --console=plain` 통과(실패는 원인별로 담당 범위를 고친다).

### I3: 문서·설정
- [ ] `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 새 테이블 5개(§4.1~4.5) 등재.
- [ ] mcm api `application.yml` 에 `dmes.widget.ext.*`·`dmes.widget.llm.*`(키는 환경 변수 자리만)·`dmes.widget.media-dir` 기본값과 주석.
- [ ] 스펙 끝에 구현 결과·남은 일 절 추가.

### I4: 전체 리뷰
- [ ] 브랜치 전체를 여러 관점(정확성·보안·계약 일치·화면 문구)으로 리뷰하고 확인된 결함을 고친다.

### I5: E2E·병합
- [ ] ego-browser 로 스펙 §13 E2E 시나리오(끝나면 브라우저 닫기).
- [ ] dev 병합(push 없음) → 로컬 서버 반영·화면 확인 → 워크트리 정리 여부 판단.
