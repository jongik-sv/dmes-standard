# MDM 화면 메타 연동과 값 검증 구현 계획 (B·C)

> **For agentic workers:** 이 계획은 워크플로(병렬 작업 + 작업별 리뷰)로 실행한다. 각 작업은 자기 절만 읽으면 된다. 정본 설계는 spec 이다.

**Goal:** 화면 캡션·머리글/라벨 툴팁을 MDM 컬럼 사전에서 자동으로 채우고(B), 화면 즉시 검증과 서버 저장 검증을 MDM 정의로 한다(C).

**Spec:** `docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md` (§4 화면 계약, §6.1 서버 API 는 병렬 작업 사이의 고정 계약이다)

**통합 브랜치:** `feat/mdm-bc` (A2 `feat/mdm-cache-a2` 위). 어느 워크트리에도 체크아웃해 두지 않는다.

## Global Constraints

- 작업 시작: 격리 워크트리 안에서 `git checkout -B bc/<작업ID> feat/mdm-bc`. 커밋은 그 브랜치에만 한다. 끝나면 브랜치 이름을 보고한다.
- 프런트 준비: `pnpm -C src/frontend install --frozen-lockfile`. shared 를 쓰는 패키지 시험 전 `pnpm -C src/frontend --filter @dk-oasis/shared build`(격리 워크트리 안에서만 — 메인 체크아웃 `/Users/jji/project/dmes-standard` 에서는 절대 build 하지 않는다).
- 프런트 시험: `pnpm -C src/frontend --filter @dk-oasis/shared exec vitest run <경로>`, `pnpm -C src/frontend --filter @dk-oasis/shared exec tsc --noEmit -p tsconfig.json`, 패키지별 `--filter @dk-oasis/<pkg> test`. 화면에서 `@mantine/*`·`ag-grid-*` 직접 import 금지(`python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <경로>` 0건).
- 백엔드 시험: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :cactus-core:test --tests 'com.dongkuk.dmes.cactus.mdm.*'` (시스템 java 로는 toolchain 21 탐지가 실패한다). mls 는 `cd src/backend/mls && JAVA_HOME=… ../gradlew :lib:test --tests '<클래스>'` 처럼 모듈 폴더에서. `gradlew --stop`·도커·서버 기동/중지 금지. 사용자 서버(5100/8100/8092/8096) 건드리지 않는다.
- 프런트 node_modules: 격리 워크트리에는 없다. `pnpm -C src/frontend install --frozen-lockfile` 로 설치한다(pnpm 저장소가 있어 빠르다). 메인 체크아웃 node_modules 를 심볼릭 링크로 빌리지 않는다(메인 shared/dist 는 다른 상태다).
- 주석·문서·커밋 메시지는 한국어, 기존 코드 관례를 따른다. 커밋 끝 줄 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- spec §4 의 이름·타입, §6.1 의 시그니처를 바꾸지 않는다. 꼭 바꿔야 하면 보고서에 이유와 함께 적는다(다른 작업이 그 이름을 쓴다).
- 서브에이전트를 띄우지 않는다. 질문하려고 멈추지 않는다 — 스스로 정하고 보고서에 "결정:" 으로 남긴다.

## Review Focus

1. 포털 밖(공급자 없음)에서 AgDataGrid·FormGroup 이 예전과 똑같이 그려지는가 — 기존 화면 회귀 0.
2. `mdmMeta` 가 없는 모듈(analog·mdm)·401·403 에서 로그인 화면으로 튕기지 않고, 요청을 반복하지 않는가.
3. tsup 분리 빌드에서 공급자와 그리드/폼이 같은 컨텍스트·store 를 보는가(globalThis 단일화).
4. 서버 검증이 `rowStatus`·`rowKey`·`_` 키 때문에 엔진 예외를 내지 않는가, 삭제 행을 건너뛰는가.
5. 평가 도중 HTTP 를 부르지 않는가(미리 받기 + 캐시 전용), 캐시 부재가 검증 불가로 정확히 분류되는가.

## 병렬 묶음

| 단계 | 작업 | 모델·effort | 의존 |
|---|---|---|---|
| 1 | T1 서버 검증기 (cactus-core) | opus·high | A2 |
| 1 | T2 화면 메타 공통 (shared: mdm-meta, AgDataGrid·FormGroup 캡션·툴팁, 포털 공급자) | opus·high | — |
| 1 | T3 식 평가기 shared 이전 | sonnet·high | — |
| 2 | T4 화면 검증 (shared validate·그리드 mdmValidate·fieldErrors) | opus·high | T2·T3 |
| 2 | T5 서버 파일럿 (mls noticeMgmt save) + 백엔드 가이드 §11.2 | sonnet·high | T1 |
| 3 | T6 화면 파일럿 (mls noticeMgmt) + 프런트 가이드·스킬 문서 | sonnet·high | T4·T5 |

파일 소유: T1 만 `src/backend/cactus-core/**/mdm/**` 를 고친다. T2·T4 만 `shared/src/components/grid/AgDataGrid.tsx`·`form/FormGroup.tsx`·`shared/src/mdm-meta/**` 를 고친다(T4 는 T2 뒤). T3 만 `m-mdm/src/evalex/**`·`shared/src/evalex/**` 를 고친다.

---

### T1: 서버 검증기 (cactus-core)

**Files:** Create `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/mdm/{MdmValidator,MdmValidationRequest,MdmValidationResult,MdmCachedDefinitions(이름 자유: 캐시 전용 조회기)}.java`, Modify `MdmAutoConfiguration.java`, `MdmClientProperties.java`(validation.on-unavailable), `MdmMetaService.java`(캐시만 읽기 메서드 하나 정도), Test `src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/mdm/MdmValidatorTest.java` 등.

**Interfaces:** spec §6.1 그대로. `BusinessException`·`ErrorCode`·`ErrorDetail` 은 cactus-core `common`·`web/response` 의 기존 클래스. 엔진: `kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator(DefinitionLookup, MdmEvaluator)`, `rule.MdmRuleEngine(MdmEvaluator, DefinitionLookup)`, `expr.MdmEvaluator(EngineLookups)`, `spi.EngineLookups(definitions, codes, codeEff, masters, functions)`.

**요구:** spec §6.2 1~7, §6.3, §6.4, §2 C4~C9. 특히
- 평가 중 캐시 부재 판별을 예외 문구에 기대지 않는다(엔진 `EngineEvaluationException` 은 원인을 잃는다). 검증 한 번마다 부재를 기록하는 조회기 래퍼 등으로 판별한다. 엔진 평가는 가상 스레드에서 돈다 — ThreadLocal 은 전달되지 않는다.
- 미리 받기의 식 AST 훑기: `MdmColumnMeta.Expr.ast`·룰 정의 안의 식 AST 에서 `FUNCTION` 노드 이름 `CODE`·`MASTER`·`MASTER_AT` 의 첫 인자 상수. AST 모양은 엔진 `AstExporter`·`docs/mdm/engine-contract.md` 를 본다.
- 길이 code point, 소수 자리(NUMBER(p,s)) 검사는 엔진 전에 cactus 에서.
- 문구는 spec §5 와 같은 꼴(캡션 = labelMid → labelLong → labelShort → columnName → 원래 키).

**시험(TDD, 먼저 실패 확인):** spec §9 cactus-core 항목 전부. FakeMetaFeed·MutableClock 이 이미 있다. "평가 중 HTTP 0회" 는 가짜 피드 호출 수로 확인한다.

### T2: 화면 메타 공통 (shared)

**Files:** Create `src/frontend/shared/src/mdm-meta/{types.ts,names.ts,store.ts,context.tsx,caption.ts,MdmMetaCard.tsx,index.ts}`, 시험 `src/frontend/shared/tests/unit/mdm-meta/*.test.ts(x)`(기존 shared 시험 폴더 관례를 따른다). Modify `shared/src/components/grid/AgDataGrid.tsx`, `shared/src/components/form/FormGroup.tsx`, 포털 탭 본문을 감싸는 `shared/src/portal-shell/portal-shell.tsx`(탭 Provider 근처), shared `package.json` exports·tsup 엔트리(서브패스 `./mdm-meta`), 루트 색인. 스킬 문서 `.claude/skills/mantine-aggrid-ui/` 의 컴포넌트 문서·색인(`MdmMetaCard`, `mdm-meta` 훅, AgDataGrid·FormGroup 새 prop).

**Interfaces:** spec §4 그대로(validate.ts 는 T4 몫 — 만들지 않는다).

**요구:** spec §2 B1~B8, §4 "기존 shared 변경" 중 `mdmValidate`·`fieldErrors` 를 뺀 전부.
- store: 한 틱(마이크로태스크 또는 16ms) 동안 모은 물리명을 모듈마다 POST 한 번 `/api/{module}/mdmMeta/columns` 본문 `{"names":[...]}` → 응답 `{items:{이름:메타}, missing:[], unavailable:[]}`. 도메인은 `/domains` 본문 `{"domainIds":[...]}`. 5분 보관, 진행 중 공유, unavailable 은 보관하지 않는다(다음 요청 때 다시). 404·401·403·네트워크 실패 → 그 모듈 끔. `apiRequest` 를 쓰지 않는다(401 리다이렉트) — `shared/src/http` 의 리다이렉트 없는 경로(`getJson` 계열)를 보고 POST 판을 만든다. 인증 헤더·쿠키 처리는 기존 함수와 같게.
- 컨텍스트·store 모두 `globalThis` 키로 단일화(`shared/src/portal-shell/tab-page-context.ts` 23-33 행 방식).
- 공급자 module 기본값: `useTabPage().pageId` 의 `:` 앞부분.
- AgDataGrid: `header` 선택 칸. `header` 를 읽던 모든 곳(엑셀 내보내기 등, grep 으로 찾는다)이 해석한 캡션을 쓰게. 머리글 툴팁은 AG Grid v33 사용자 툴팁 컴포넌트(`tooltipComponent` + `headerTooltip` 은 비지 않은 문자열)로 `MdmMetaCard`. 화면이 `headerTooltip`·`headerComponent` 를 주면 그대로 둔다.
- FormGroup: `name`·`meta`·`label` 선택·`tip` ReactNode. 기존 포털 툴팁(라벨 mouseenter·focus) 구조를 그대로 써서 ReactNode 를 띄운다.
- 공급자 밖에서는 렌더 결과가 예전과 같아야 한다(스냅샷·DOM 비교 시험).

**시험:** spec §9 shared 항목 중 B 몫. fetch 는 가짜로.

### T3: 식 평가기 shared 이전

**Files:** Move `src/frontend/m-mdm/src/evalex/**` → `src/frontend/shared/src/evalex/**`. shared exports·tsup 엔트리에 `./evalex`. `m-mdm/src/evalex/index.ts` 는 `export * from "@dk-oasis/shared/evalex"` 로(필요하면 내부 경로를 쓰던 m-mdm 파일을 고친다). 평가기 단위 시험 중 평가기만 보는 것은 shared 로 옮기고, 코퍼스 시험(`m-mdm/tests/evalex-corpus.test.ts` 등)은 m-mdm 에 남겨 `@dk-oasis/m-mdm/evalex` 경유로 그대로 통과시킨다.

**요구:** 동작 변경 0. `@dk-oasis/m-mdm/evalex` 를 쓰는 곳(grep)이 모두 그대로 컴파일·통과. shared 가 m-mdm 을 import 하지 않는다. evalex 가 쓰는 외부 의존(decimal 라이브러리 등)을 shared `package.json` 에 더한다(lockfile 갱신).

**시험:** m-mdm 전체 시험, shared 옮긴 시험, 두 패키지 tsc.

### T4: 화면 검증 (shared)

**Files:** Create `shared/src/mdm-meta/validate.ts`(+ index 내보내기), 시험. Modify `AgDataGrid.tsx`(`mdmValidate`, `fieldErrors`), 필요하면 `shared/src/http` 에 서버 `ErrorDetail` 을 `fieldErrors` 모양으로 바꾸는 함수(`toFieldErrors(error, grid?)`) — 이미 있는 `extractBackendFieldErrors` 를 먼저 본다. 스킬 문서 갱신.

**Interfaces:** spec §4 validate.ts 그대로. 평가기는 `../evalex`(T3 결과, 통합 브랜치에 있다).

**요구:** spec §5 전부, §2 C1·C2·C5. 셀 오류 표시는 `cellClassRules` 계열 + 셀 툴팁. 서버 오류가 같은 칸에 있으면 서버 문구.

**시험:** spec §9 shared C 항목.

### T5: 서버 파일럿 + 백엔드 가이드

**Files:** Modify `src/backend/mls/lib/src/main/java/.../lsh/noticeMgmt/service/NoticeMgmtService.java`(save), 시험, `docs/guide/BackEnd/Backend-Implementation-Guide.md` §11.2 "저장 검증(MdmValidator)".

**요구:** spec §7 서버 부분. 공지 테이블 DDL(mls Flyway·엔티티)의 칸 길이·NOT NULL 과 MDM 정의(로컬 `src/backend/data/mdm.db` `TB_MDM_COLUMN` + `TB_MDM_DOMAIN`)를 비교해, MDM 이 DB 보다 엄격하지 않은 칸만 `columns(...)` 에 넣는다. 비교 표를 보고서에 남긴다. 기존 `validateRow` 수작업 검사는 지우지 않는다(겹쳐도 된다). `MdmValidator` 빈이 없을 때(cactus.mdm.enabled=false)도 저장이 되게 `ObjectProvider` 로 받는다.

**시험:** NoticeMgmtService 단위 시험에 MdmValidator 가짜/실제를 넣어 오류 시 BusinessException·정상 시 저장.

### T6: 화면 파일럿 + 프런트 가이드

**Files:** Modify m-mls `pages/lsh/noticeMgmt/**`(또는 실제 경로), 시험. `docs/guide/FrontEnd/` 에 "MDM 캡션·툴팁·검증" 사용법(어느 문서인지는 RULE.md 라우팅과 Local-Rules.md 를 보고 정한다). 스킬 문서 최종 점검.

**요구:** spec §7 화면 부분 — MDM 에 있는 칸(`TITLE`·`CATEGORY` 등)의 그리드 `header` 를 비워 MDM 캡션이 보이게, 그리드 `mdmValidate`, 폼이 있으면 `FormGroup name` + `useMdmValidation`, 저장 실패 시 서버 오류를 `fieldErrors` 로. 그리드 키가 UPPER_SNAKE 라 자동 매칭된다.

**시험:** 화면 vitest(가짜 fetch 로 캡션·검증), tsc, audit.
