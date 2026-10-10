# ERD 도구 단계 1(가져오기·뷰어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DB 스키마(MCM·MDM)를 ERD 모델로 가져와 관계를 추정하고, m-mdm 화면에서 캔버스·그리드로 보며 추정 관계를 확정·기각하고, Claude 가 MCP 읽기 도구로 모델과 화면 선택 상태를 읽게 한다.

**Architecture:** 백엔드는 단계 0 의 `erdEdit` 서비스에 읽기 경로(`view` 의 `kind`, `compare` 의 `kind`)와 새 `import` 액션을 더한다. 가져오기는 딕셔너리 뷰를 읽어 모델 요소를 만들고, 관계 추정기가 DB FK·리포 문서·SQL 조인·칼럼명 규칙으로 관계를 붙인 뒤, 엔진의 `restore` 명령 하나로 한 번에 넣는다(되돌리기 가능, rev·기록·SSE 를 그대로 거친다). 화면은 shared 로 복사한 React Flow 부품 위에 ERD 전용 노드·선을 그리고, SSE 델타로 모델을 갱신한다. MCP 서버는 OASIS 를 감싸는 stdio 서버다.

**Tech Stack:** Java 21, Spring Boot 4, JPA + 네이티브 SQL·`JdbcTemplate`, Oracle 딕셔너리 뷰(`ALL_*`), OASIS BPMN, React 19 + `@xyflow/react` 12.12.0, Mantine·AG Grid(shared 래퍼), vitest, node `.mjs` + `node:test`, `@modelcontextprotocol/sdk` + `zod`.

**Spec:** [docs/superpowers/specs/2026-10-10-erd-tool-design.md](../../specs/2026-10-10-erd-tool-design.md) (D1~D20). 단계 0 계획과 결정: [../2026-10-10-erd-tool-stage0/README.md](../2026-10-10-erd-tool-stage0/README.md) ("스펙과 다르게 정한 점" P1~P10, "단계 0 구현 결정"). 미룬 기능: [docs/erd-tool/deferred.md](../../../erd-tool/deferred.md).

**문서 구성:** 이 README 에 공통 내용과 Task 사이 인터페이스를 둔다. Task 는 아래 "Task 문서" 표의 6개 파일에 있다. Task 를 맡은 사람은 README 와 해당 파일을 함께 읽는다. 인터페이스 이름·필드·JSON 모양은 이 README 의 "인터페이스" 절이 정본이다.

## 단계 1 에서 정한 점

계획을 쓰며 코드를 조사한 결과로 정했다(조사: 단계 0 백엔드, 가져오기·추정, 화면, MCP·CLI). 스펙 결정(D1~D20)은 바꾸지 않는다.

| # | 주제 | 계획 | 이유 |
|---|---|---|---|
| S1 | 읽기 전용 화면 공유(deferred 38) | `SET_VIEW` 를 `view` 액션의 `kind=SET_VIEW` 로 옮긴다. `execute` 의 `SET_VIEW` 는 지운다 | `view` 는 이미 READ 권한 액션이다. BPMN·어휘·시드를 바꾸지 않는다 |
| S2 | 가져오기 쓰기 경로 | 엔진 `restore` 명령 하나(`sinceRev`=현재 rev, 요소 upsert)로 넣는다. 새 엔진 명령을 만들지 않는다 | `restore` upsert 는 `_rev` 를 지우고 모든 속성에 새 rev·세션을 찍으며, 역명령이 생겨 되돌릴 수 있다(`ErdCommandEngine.restore`). 공개 `apply` 는 계속 `restore` 를 거절한다(R4-3). 서비스 안 경로만 쓴다 |
| S3 | 가져오기 액션 | BPMN 15번째 액션 `import`(어휘 `MdmActions.IMPORT`, EDIT 권한). `kind=FROM_DB` 만 둔다 | 첫 가져오기는 쓰기다. 다시 가져오기 반영(`applyDbDiff`)은 스펙 7절대로 단계 2 다 |
| S4 | 다시 가져오기 차이 | 차이 목록은 읽기(`compare` 의 `kind=DB_DIFF`, READ). 반영은 단계 2 | 스펙 7절: "다시 가져오기 차이" 는 P2. 단계 0 README 의 단계 1 개요가 `applyDbDiff` 를 적은 것은 요약 오류로 본다 |
| S5 | 표준 상태 조회 | `view` 의 `kind=STATUS` 가 컬럼별 상태·쓰인 도메인·상태별 수·판정 시간을 돌려준다 | 단계 0 에는 컬럼별 상태를 주는 경로가 없다. 스펙 3.1 "읽을 때 계산" 을 지킨다. 캐시는 두지 않는다(P3) |
| S6 | 추정 근거(문서·SQL 조인) | 리포를 훑는 node 스크립트 `scripts/erd/erd-hints.mjs` 가 모듈별 근거 파일을 `src/backend/mdm/api/src/main/resources/erd/hints/<module>.json` 으로 만든다. 서버는 클래스패스에서 읽는다. 파일이 없으면 그 근거만 빠진다 | 배포 서버에는 docs·소스가 없다. 근거 파일은 커밋하고, 코드가 바뀌면 다시 만든다 |
| S7 | 허브 칼럼 접기 | 후보를 모두 `INFERRED` 관계로 저장하고, 새 필드 `ErdRelation.candidateRank`(허브가 아니면 null, 가장 가까운 후보 1, 나머지 2..n)를 둔다. 화면은 1 만 그리고 나머지를 "다른 후보 n개" 로 접는다 | 접힌 후보도 검토 패널에서 확정·기각해야 한다. 기각한 후보를 남겨 다시 가져와도 되살리지 않는다(스펙 3.1) |
| S8 | 첫 배치 | 가져오기가 다이어그램 "전체"(업무영역 "기본")를 만들고 표를 이름순 격자(가로 8개, 간격 280×220)로 놓는다. 자동 배치(dagre)는 단계 2 | 다이어그램이 없으면 아무것도 그리지 않는다(3.2절). 같은 묶음에 다이어그램 명령을 넣을 수 있다 |
| S9 | 논리명 채우기 | 물리명이 컬럼 사전에 있으면 그 논리명·도메인, 별칭(`TB_MDM_COLUMN_SYSTEM`)에 있으면 대응 컬럼의 논리명·도메인, 둘 다 아니면 `reverse(phys)` 결과(모르는 토막 `***`). `SYSTEM_CODE` 는 보지 않는다 | 단계 0 판정기도 별칭을 시스템 구분 없이 본다. 같은 별칭이 여러 컬럼에 걸리면 `COLUMN_ID` 가 가장 작은 것을 쓴다 |
| S10 | 회귀 시험 기준 | 칼럼명 규칙(연구 변형 `x`)의 **표 짝** 정밀도 ≥ 0.57, 재현율 ≥ 0.78 을 MDM **V1 표**(FK 53개)로 단언한다. MCM 후보 수는 L_MAIN 에서 재서 기록만 한다 | 시험 PDB(TPL_EMPTY 복제)에는 MCM 표가 없고 MDM FK 는 V6 포함 59개다. 연구 수치는 표 짝 기준이다(컬럼 짝은 0.43/0.69) |
| S11 | 메뉴 위치 | `dma`(용어·도메인) 폴더에 leaf `erdEdit` 를 둔다. 화면은 `pages/dma/erdEdit/page.tsx`. 새 폴더를 만들지 않는다 | 백엔드 패키지·BPMN 이 이미 `dma` 다. 폴더를 새로 만들면 FE·BE·시더 세 곳을 맞춰야 한다(I20). 권한 매트릭스는 단계 0 의 dmb 그대로 |
| S12 | shared 부품 | 새 서브패스 `@dk-oasis/shared/react-flow` 하나에 복사본을 모은다. `@xyflow/react` 12.12.0·`@dagrejs/dagre` 를 shared `dependencies` 에 더하고, m-mdm 의존은 그대로 둔다 | 룰 세트 편집기를 건드리지 않는다(스펙 2.2, deferred 15). m-mdm 에서 빼면 tsup 이 룰 세트 편집기 번들에 xyflow 를 넣는다. 같은 버전이라 pnpm 이 한 벌로 묶는다(`pnpm why` 로 확인) |
| S13 | ERD 전용 부품 위치 | 표 노드·관계선·이름표·델타 적용기는 화면 폴더(`pages/dma/erdEdit/`)에 둔다 | ERD 모델 타입을 알아야 동작한다(Part B §18-1) |
| S14 | 화면의 쓰기 | 단계 1 화면이 쓰는 것은 모델 등록(`reg`), 첫 가져오기(`import`), 관계 확정·기각(`save` 의 `confirmRelation`·`rejectRelation`)뿐이다. 두 층 모델은 단계 2 다. 화면은 응답을 받은 뒤 반영한다 | 스펙 7절 단계 1 범위 |
| S15 | 포털 SSE 제한 | `be-proxy.ts` `backendTimeoutMs` 에 GET `/erd/stream/` 분기를 더해 24시간(유한값)을 준다 | Node `setTimeout` 은 2^31-1ms 를 넘으면(Infinity 포함) 1ms 로 줄여 바로 끊는다 |
| S16 | MCP 의존성 | 루트 `package.json`(`@dk-oasis/repository-tools`)의 `dependencies` 에 `@modelcontextprotocol/sdk`·`zod` 를 정확한 버전으로 고정하고 루트 `pnpm-lock.yaml` 을 커밋한다. 버전은 설치 시점에 공개된 지 14일이 지난 것 중 최신을 고른다 | 사용자 승인(2026-10-10). 스킬 공용 헬퍼의 "외부 의존성 0" 규칙은 `scripts/erd/erd-mcp.mjs` 에만 예외로 둔다. `erd-hints.mjs` 는 의존성 없이 쓴다 |
| S17 | `getModelText` 위치 | `erd-mcp.mjs` 안의 순수 함수가 `view`(모델) + `view kind=STATUS`(상태·도메인 이름)로 텍스트를 만든다 | 서버 액션을 늘리지 않는다. node 시험으로 형식을 고정한다 |

## Global Constraints

- 작업은 dev 에서 딴 워크트리 브랜치(`erd-stage1`, 레인을 나누면 `erd-stage1-<레인>`)에서 한다. git 은 `/usr/bin/git` 으로 부른다. 복합 셸 명령이 거절되면 나눠 부른다.
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
- Gradle 은 `--max-workers=2` 이하. 백엔드 명령은 `src/backend/mdm`(또는 `src/backend/mcm`)에서 `../gradlew` 로 부른다.
- Oracle 시험은 `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests <클래스>` 로 부른다. 도커·SQLite 금지(Oracle 컨테이너는 이미 떠 있다). Bash timeout 600000ms.
- 시험 시간 예산: 바뀐 범위만 시험하고 항목마다 15분 상한. 마지막 Task 에서 바뀐 모듈 전체를 한 번 돈다.
- Flyway 새 파일이 필요하면 `node .claude/skills/flyway-migration-add/scripts/migration_tool.mjs` 로 채번한다. 머지된 V1~V6 은 고치지 않는다. (이 계획은 새 V 파일을 만들지 않는다.)
- JPA 연관관계 금지. 리포지토리는 메서드 없는 `JpaRepository`(규칙 21). 딕셔너리 뷰 읽기는 `JdbcTemplate` 을 쓴다(analog 뷰어의 템플릿은 쓰지 않는다: `maxRows` 5001 상한·허용 스키마 5개·10초 제한).
- Jackson: HTTP 는 Jackson 3, 모델·명령 코드는 Jackson 2(`com.fasterxml`). OASIS 응답은 `ErdModelCodec.MAPPER.convertValue(..., Map)`(단계 0 의 `plain()`), SSE 는 `ErdModelCodec.MAPPER` 문자열.
- 서비스 쓰기 경로는 단계 0 규칙을 지킨다: `ErdEditService` 에 `@Transactional` 을 붙이지 않고, 모델 명령은 `outsideTx`(NOT_SUPPORTED) 안에서 `ErdCommandService` 를 부른다. `ErdModelStore.lockRev` 는 `MANDATORY` 다.
- 프런트: 화면 모듈은 Mantine·AG Grid 를 직접 import 하지 않고 shared 래퍼만 쓴다. 로컬 `.css` import 금지(`<style href precedence>`, Local-Rules §17). 색은 `--color-*`·`--spacing-*`·`--font-size-*` 토큰만(§8). React Flow 규칙 Local-Rules §19·§33. 그리드 규칙 §20·§30·§31·§39.
- 프런트 검증 명령(`src/frontend` 에서): `pnpm --filter @dk-oasis/shared build`, `pnpm --filter @dk-oasis/shared test:unit`, `pnpm --filter "@dk-oasis/m-mdm^..." build && pnpm --filter @dk-oasis/m-mdm test`, `pnpm --filter @dk-oasis/m-mdm lint`, `pnpm --filter @dk-oasis/mcm test`. m-mdm 시험은 shared 를 `dist` 로 풀므로 shared 를 바꾸면 먼저 빌드한다.
- 새 shared 부품은 같은 Task 에서 Part B §1 허용 목록 표, `mantine-aggrid-ui` 스킬 문서(`.claude/skills/mantine-aggrid-ui/references/components/<이름>.md`)·`scripts/ui_docs.mjs` 의 `GROUPS`·`EXPORT_FILES` 를 갱신하고 `node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs index --write`·`full --write`·`coverage` 를 돈다.
- node 스크립트: ESM `.mjs`, node 18.17 하한(`import.meta.dirname`·`toSorted`·`readdirSync({recursive})` 금지), 시험은 `node:test`(`node --test scripts/erd/tests/`). MCP 서버는 stdout 을 프로토콜에만 쓰고 로그는 stderr 로 보낸다.
- 브라우저 확인은 ego-browser 스킬을 쓴다(사용자 전역 지침).
- 주석·문서·커밋 제목은 한국어. 커밋 형식 `type(scope): 제목`, 끝에 아래 두 줄.
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
  ```
- push 금지. dev 머지는 조정 세션 허가 뒤(조정 세션이 없으면 사용자에게 묻는다). 머지 전에 레인 커밋을 1개로 합친다(`node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase`), 머지는 `--ff-only`.

## Review Focus

1. 가져오는 스키마에 PK 없는 표·복합 PK·UNIQUE 를 부모로 둔 FK·자기 참조 FK 가 있다 → 표·키·관계가 모두 들어오고 무결성 검사를 통과한다. 시험: Task 3 `importBuildsCompositeUniqueAndSelfReference`.
2. 다른 스키마에 같은 이름의 표가 있다(`TB_MCM_CODE_*` 가 MCM_SOURCE 와 MCMAPUSER 에 모두 있음) → 메타 조회는 OWNER 로 모든 조인을 묶어 섞이지 않는다. 시험: Task 2 `readerJoinsEveryDictionaryViewOnOwner`.
3. 같은 모델에 가져오기를 두 번 보낸다(두 탭) → 둘째는 "표가 이미 있다" `INVALID` 이고 rev 는 한 번만 오른다. 시험: Task 4 `secondImportIsInvalid`.
4. SSE 가 끊겼다가 다시 붙는 동안 `reload` 를 받는다(DRAFT 새로 만듦) → 화면은 모델 전체를 다시 읽고 끊김 띠를 내린다. 시험: Task 8 `streamReloadRefetchesModel`.
5. 컬럼 500개가 넘는 모델에서 확대율을 50% 밑으로 줄인다 → 노드는 이름만 그리고 컬럼 행 DOM 을 만들지 않는다. 시험: Task 9 `zoomBelowHalfRendersNamesOnly`.

---

## 파일 구조

```
src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  model/ErdRelation.java                         (Task 3: candidateRank)
  dbmeta/  ErdDbMeta, ErdDbMetaReader                                        (Task 2)
  infer/   ErdRelationInferrer, ErdHints, ErdHintsLoader, InferredRelation    (Task 3)
  importing/ ErdImportBuilder, ErdDbDiff, ErdDbDiffItem                       (Task 4·5)
  standard/ErdDictionary.java, ErdDictionaryLoader.java (논리명 조회 추가)     (Task 4)
  service/ErdCommandService.java (applyImport), ErdEditService.java (view kind·compare kind·importModel)  (Task 1·4·5)
  dto/ErdEditRequest.java, ErdStatusView.java                                 (Task 5)
src/backend/mdm/api/src/main/resources/
  services/dma/erdEdit.bpmn                       (Task 4: import 흐름)
  erd/hints/mcm.json, erd/hints/mdm.json           (Task 10 이 생성)
src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/
  MdmOasisActionVocabularyTest.java                (Task 4: 15개)
  dma/erdEdit/ErdDbMetaReaderTest, ErdInferRegressionTest, ErdImportTest, ErdReadKindsTest  (Task 2~5)
src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  infer/ErdRelationInferrerTest, importing/ErdImportBuilderTest, importing/ErdDbDiffTest     (Task 3~5)
src/frontend/shared/src/components/react-flow/   (Task 6: 복사한 캔버스 부품)
src/frontend/shared/tests/unit/react-flow-*.unit.test.ts                      (Task 6)
src/frontend/m-mcm/lib/http/be-proxy.ts, m-mcm/tests/http/be-proxy.test.ts      (Task 6)
src/frontend/m-mdm/pages/dma/erdEdit/
  page.tsx, ErdViewer.tsx, api.ts, types.ts                                   (Task 7·9)
  state/ model-delta.ts, useErdModel.ts, useErdStream.ts, view-sync.ts         (Task 7)
  canvas/ ErdTableNode.tsx, ErdRelationEdge.tsx, erd-geometry.ts, erd-flow.ts, PresenceTag.tsx, erd-styles.ts  (Task 8)
  panels/ TopBar.tsx, DiagramTree.tsx, ColumnGrid.tsx, ReviewPanel.tsx          (Task 9)
src/frontend/m-mdm/tests/dma/erdEdit/*.test.ts                                 (Task 7~9)
src/frontend/m-mdm/tsup.config.ts, package.json, m-mcm/lib/generated/page-registry.ts  (Task 9)
src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java,
  mcm/api/src/test/resources/init/data-initializer-fingerprint.golden.txt      (Task 9: 메뉴 leaf)
scripts/erd/ erd-hints.mjs, erd-mcp.mjs, lib/oasis.mjs, lib/model-text.mjs, lib/hints-dbml.mjs, lib/hints-sql.mjs  (Task 10·11)
scripts/erd/tests/*.test.mjs                                                    (Task 10·11)
package.json, pnpm-lock.yaml, .mcp.json                                          (Task 11)
docs/erd-tool/deferred.md, docs/superpowers/specs/2026-10-10-erd-tool-design.md §5,
docs/mdm/screens/erdEdit/erdEdit_기능설계서.md                                    (Task 1·12)
```

---

## 인터페이스 (정본)

### OASIS `erdEdit` 액션 추가분

모든 요청은 단계 0 과 같이 `POST /api/mdm/oasis/erdEdit/{action}`, 본문 `{"meta":{"menuId":"erdEdit"},"params":{...}}`, 값은 `data.result`. 새 요청 필드는 `ErdEditRequest` 에 문자열·숫자로 더한다.

| 액션 | `kind` | 요청 | 응답(`data.result`) | 권한 | Task |
|---|---|---|---|---|---|
| `view` | `SET_VIEW` | `modelId`, `session`, `viewJson`(`{"diagramId":"d-1","selectedTables":["t-1"]}`) | `{"ok":true}`. SSE 에 연결되지 않은 세션이면 `INVALID` 거절(단계 0 동작 유지) | READ | 1 |
| `view` | `STATUS` | `modelId`, `ver`(생략하면 현재) | `ErdStatusView` 아래 | READ | 5 |
| `compare` | `DB_DIFF` | `modelId` | `ErdDbDiffView` 아래 | READ | 5 |
| `import` | `FROM_DB` | `modelId`, `baseRev`, `session`, `source` | `ErdImportResult` 아래 | EDIT | 4 |

`kind` 가 없으면 각 액션은 단계 0 동작 그대로다. 모르는 `kind` 는 단계 0 `execute` 가 "지원하지 않는 kind" 를 막는 방식과 똑같이 막는다(구현자는 `ErdEditService.execute` 의 `default` 분기를 그대로 따른다. 오류 코드는 `MdmErrors.invalid` → `INVALID_INPUT`(MDM021)).

```jsonc
// ErdStatusView
{ "modelId": "mcm", "ver": "1.000", "rev": 12,
  "statuses": { "c-…": "OK" },                     // ErdColumnStatus 이름: OK|ALIAS|NEW|TYPE|DOMAIN|MISS
  "domains":  { "12": { "name": "아이디", "dataType": "VARCHAR2", "length": 30, "scale": null } },  // 모델에 쓰인 domainId 만
  "counts":   { "OK": 10, "ALIAS": 0, "NEW": 3, "TYPE": 0, "DOMAIN": 1, "MISS": 40 },
  "elapsedMs": 85 }                                // 사전 적재 + 판정 시간

// ErdDbDiffView
{ "modelId": "mcm", "rev": 12, "schema": "MCMAPUSER",
  "items": [ { "id": "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM",
               "kind": "COLUMN_CHANGED",            // TABLE_ADDED|TABLE_REMOVED|COLUMN_ADDED|COLUMN_REMOVED|COLUMN_CHANGED|FK_ADDED|FK_REMOVED
               "table": "TB_MCM_SEC_MENU", "column": "MENU_NM",
               "before": { "dataType": "VARCHAR2", "length": 100, "scale": null, "notNull": true },
               "after":  { "dataType": "VARCHAR2", "length": 200, "scale": null, "notNull": true } } ] }

// ErdImportResult  = ErdApplyResult(단계 0) 필드 + summary
{ "applied": true, "rev": 1, "changes": [...], "warnings": [...], "rejection": null,
  "summary": { "tables": 58, "columns": 712, "keys": 70,
               "relations": { "DB": 0, "INFERRED": 104 }, "diagramId": "d-all" } }
```

- 차이 항목 `id` 는 `<kind>:<표>[.<컬럼>]` 이고, FK 는 `FK_ADDED:<자식표>(<컬럼,…>)><부모표>(<컬럼,…>)` 다. 물리명으로 맞춘다(모델 요소 UUID 는 DB 에 없다).
- `COLUMN_CHANGED` 는 `dataType`·`length`·`scale`·`notNull` 가운데 하나라도 다를 때만 낸다. 논리명·주석은 비교하지 않는다.

### 모델 필드 추가

- `ErdRelation.candidateRank`: `Integer`, JSON 이름 `candidateRank`, 기본 null. 단계 0 모델 JSON(필드 없음)도 그대로 읽힌다. 엔진 명령(`addRelation` 등)은 이 값을 쓰지 않고, `_rev` 대상 속성도 아니다.

### 가져오기 내부 경로

```java
// ErdCommandService — 서비스 안에서만 부른다. 공개 apply 는 restore 를 계속 거절한다.
public ErdApplyResult applyImport(String modelId, long baseRev, String userId, String session, String source,
                                  ErdCommand.Restore restore, List<JsonNode> diagramCommands)
```

- 같은 트랜잭션에서 단계 0 의 `apply` 순서(잠금 → baseRev → DRAFT·편집자 → 표지 → 엔진 → CAS → 기록 → 커밋 뒤 발행)를 그대로 거친다. 엔진은 `allowRestore=true` 로 부른다.
- 모델에 표가 하나라도 있으면 엔진을 부르기 전에 `INVALID`("이미 표가 있습니다", hint "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요") 로 거절한다.

### 메타 조회·추정기

```java
public record ErdDbMeta(String owner, List<Table> tables, List<Constraint> constraints, List<Index> indexes) {
  public record Table(String name, String comment, List<Column> columns) {}
  public record Column(String name, int position, String dataType, Integer length, Integer precision, Integer scale,
                       boolean nullable, String defaultValue, String comment) {}
  public record Constraint(String name, String table, String type /*P|U|R*/, List<String> columns,
                           String refTable, List<String> refColumns /*R 만, 위치 순*/) {}
  public record Index(String name, String table, boolean unique, List<String> columns) {}
}
// ErdDbMetaReader(@Component, JdbcTemplate): ErdDbMeta read(String owner)
//   ALL_TABLES·ALL_TAB_COMMENTS·ALL_TAB_COLUMNS·ALL_COL_COMMENTS·ALL_CONSTRAINTS·ALL_CONS_COLUMNS·ALL_INDEXES·ALL_IND_COLUMNS,
//   모든 조인을 OWNER 로 묶는다. BIN$ 와 flyway_schema_history 를 뺀다. 제약 이름이 SYS_ 로 시작하는 NOT NULL CHECK 는 읽지 않는다.

public record InferredRelation(String childTable, List<String> childColumns, String parentTable, List<String> parentColumns,
                               String state /*DB|INFERRED*/, List<ErdEvidence> evidence, Integer candidateRank) {}
// ErdRelationInferrer(순수): List<InferredRelation> infer(ErdDbMeta meta, ErdHints hints)
// ErdHints(순수 record): List<Ref> refs; record Ref(String kind /*DOC|SQL_JOIN*/, String childTable, List<String> childColumns,
//                                                 String parentTable, List<String> parentColumns, String ref)
// ErdHintsLoader(@Component): ErdHints load(String module)  — 클래스패스 erd/hints/<module>.json, 없으면 빈 값
```

### 근거 파일 `erd/hints/<module>.json` (Task 10 이 만들고 Task 3 이 읽는다)

```json
{ "module": "mcm", "generatedBy": "scripts/erd/erd-hints.mjs", "generatedAt": "2026-10-11T10:00:00Z",
  "refs": [ { "kind": "DOC", "child": { "table": "TB_MCM_SEC_MENU", "columns": ["OBJECT_ID"] },
              "parent": { "table": "TB_MCM_SEC_OBJ", "columns": ["OBJECT_ID"] },
              "ref": "docs/mcm/erd/csa-menu.dbml:494" } ] }
```

- 표·컬럼 이름은 대문자 물리명이고 스키마 접두는 뺀다. `refs` 는 (kind, child, parent) 로 중복을 없애고 `ref` 순으로 정렬한다(파일이 다시 만들어도 같게).

### SSE (단계 0 그대로, 화면·MCP 가 처리할 것)

이벤트 `hello{rev}`(처음 구독만), `change`(ErdDelta), `reload{rev}`, `presence`(전체 목록), `claim`(전체 목록), `ping`. 화면 경로 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}?session=<세션>&sinceRev=<rev>&source=UI`.

### MCP 도구 (단계 1 은 읽기만)

| 도구 | 입력 | 부르는 OASIS | 출력 |
|---|---|---|---|
| `getModelText` | `modelId`, `diagram?` | `view` + `view kind=STATUS` | 아래 텍스트 |
| `getCurrentView` | `modelId`, `session?` | `view`(모델 대신 `presence` 만 씀) | 화면 세션(`source=UI`)마다 다이어그램 이름·선택한 표 물리명·논리명 |
| `getChangesSince` | `modelId`, `rev` | `view` + `sinceRev` | `{rev, reload, deltas}` 요약 텍스트 + JSON |
| `listViolations` | `modelId`, `status?` | `view` + `view kind=STATUS` | 상태가 OK·ALIAS 가 아닌 컬럼 목록 |
| `listInferredRelations` | `modelId`, `includeFolded?` | `view` | `INFERRED` 관계(근거·후보 순위) |
| `getDbDiff` | `modelId` | `compare kind=DB_DIFF` | 차이 항목 |

`getModelText` 형식(스펙 2.3 예시를 확장):

```
# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12
TB_MCM_SEC_MENU 메뉴 {
  MENU_ID 메뉴아이디 VARCHAR2(30) PK NN [아이디]
  OBJECT_ID 오브젝트아이디 VARCHAR2(50) FK>TB_MCM_SEC_OBJ.OBJECT_ID? [아이디] !NEW
}
Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)
```

- 컬럼 줄: `물리명 논리명 타입(길이[,스케일]) [PK] [NN] [FK>부모표.부모컬럼[?]] [도메인이름] [!상태]`. `?` 는 추정 관계, `!상태` 는 OK·ALIAS 가 아닐 때만. `diagram` 을 주면 그 다이어그램의 표만 쓴다. 기각한 관계와 `candidateRank`>1 인 후보는 쓰지 않는다.

---

## Task 문서

| 파일 | Task |
|---|---|
| [01-backend-read.md](01-backend-read.md) | Task 1: 읽기 전용 화면 공유(SET_VIEW → view)<br>Task 2: DB 메타 조회<br>Task 3: 관계 추정기와 회귀 시험 |
| [02-backend-import.md](02-backend-import.md) | Task 4: 첫 가져오기(`import` 액션)<br>Task 5: 표준 상태·DB 차이 읽기 |
| [03-frontend-shared.md](03-frontend-shared.md) | Task 6: shared `react-flow` 부품 복사와 포털 SSE 제한 |
| [04-frontend-viewer.md](04-frontend-viewer.md) | Task 7: 화면 상태(API·델타 적용·SSE 구독·화면 공유)<br>Task 8: 캔버스(표 노드·관계선·이름표)<br>Task 9: 화면 조립·검토 패널·메뉴 등록 |
| [05-scripts.md](05-scripts.md) | Task 10: 추정 근거 생성 스크립트<br>Task 11: MCP 읽기 서버 |
| [06-close.md](06-close.md) | Task 12: 단계 1 마감 — 실제 가져오기·브라우저 확인·측정·문서 |

## 의존 관계와 레인

병렬 상한(사용자 지시 2026-10-10): 동시에 도는 레인(워크트리 브랜치·세션)은 6개 이하, 레인이나 세션 하나가 동시에 띄우는 서브에이전트는 10개 이하.

```
레인 BE1 : Task 1                                   (짧다. 먼저 합친다)
레인 BE2 : Task 2 ─ Task 3 ─ Task 4 ─ Task 5         (Task 4 는 BE1 이 합쳐진 뒤 rebase 하고 시작)
레인 FE1 : Task 6
레인 FE2 : Task 7 ─ Task 8 ─ Task 9                  (Task 8 은 FE1 이 합쳐진 뒤 rebase 하고 시작)
레인 S1  : Task 10
레인 S2  : Task 11
마감     : Task 12 (모든 레인이 합쳐진 뒤)
```

- 레인은 서로 다른 파일을 고친다. 겹치는 곳은 두 군데다. Task 1 과 Task 4·5 가 `ErdEditService` 를 고치므로 BE1 을 먼저 합친다. Task 6 의 shared 부품을 Task 8 이 쓰므로 FE1 을 먼저 합친다.
- 레인 S1 의 Task 10 은 근거 파일을 `mdm/api/src/main/resources/erd/hints/` 에만 쓰고, Task 3 은 그 파일이 없어도 동작한다(시험은 직접 만든 `ErdHints` 를 쓴다).
- Oracle 시험은 PC 단위 잠금으로 하나씩 돈다. 같은 워크트리에서 Gradle 을 동시에 돌리지 않는다.
- 직접 연 pane·레인·이름 붙인 에이전트는 작업이 끝나면 바로 닫는다. 머지한 워크트리는 `git worktree remove`(`--force` 금지), 브랜치는 `git branch -d` 로 정리한다.
- Task 9 와 Task 11 은 백엔드 새 경로(Task 1·4·5)를 쓴다. 단위 시험은 가짜 응답으로 하고, 실제 연결은 Task 12 에서 확인한다.
- Task 9 는 mcm 시더와 지문 골든을 고친다. 레인 BE 는 mcm 을 고치지 않는다.

---

## 뒤 단계 개요 — 단계 2 (편집·동시 편집)

착수 전: 저장·복원의 연결 2개 점유 교착을 고치고 HTTP 단위 동시 저장 시험을 넣는다(deferred 27번).

할 일(단계 0 README 의 단계 2 개요에 더해):
1. 다시 가져오기 반영(`applyDbDiff`): `import` 의 `kind=APPLY_DIFF` 로 고른 차이 항목을 `restore` 하나로 넣는다. 확정·기각한 관계는 유지한다(D10).
2. 자동 배치(dagre)와 다이어그램 생성 마법사.
3. 두 층 모델, 화면 편집, MCP·CLI 쓰기 도구.
