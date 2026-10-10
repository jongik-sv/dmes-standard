# ERD 도구 단계 0(기반) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ERD 모델을 MDM 버전 객체(`ERD_MODEL`)로 저장하고, 화면·MCP·CLI 가 함께 쓸 명령 API(서버 판정, 속성 단위 충돌, 델타 기록)와 실시간 채널(SSE)을 만든다. 화면은 만들지 않는다.

**Architecture:** 모듈 하나의 모델 전체를 `TB_MDM_ERD_MODEL_VER.MODEL_JSON` 에 둔다. 순수 Java 명령 엔진이 JSON 모델에 명령 묶음을 적용해 "바뀐 요소(델타)·역명령·경고" 또는 "거절" 을 돌려준다. 명령 서비스는 모델 행을 잠가 명령을 하나씩 처리하고, 결과를 명령 기록에 남긴 뒤 커밋 후 SSE 로 델타를 퍼뜨린다. OASIS 서비스 `erdEdit` 가 HTTP 입구이고, SSE 만 MDM 의 첫 `@RestController` 로 둔다(OASIS 프록시는 응답을 모았다가 보내므로 스트림을 못 넘긴다).

**Tech Stack:** Java 21, Spring Boot, JPA(Hibernate) + 네이티브 SQL, Jackson 2(`com.fasterxml`), Oracle(Flyway), OASIS BPMN 서비스, Spring MVC `SseEmitter`, JUnit 5.

**Spec:** [docs/superpowers/specs/2026-10-10-erd-tool-design.md](../../specs/2026-10-10-erd-tool-design.md) (결정 D1~D20). 미룬 기능은 [docs/erd-tool/deferred.md](../../../erd-tool/deferred.md).

**뒤 단계:** 단계 1(가져오기·뷰어)·단계 2(편집·동시 편집) 계획은 단계 0 이 dev 에 머지된 뒤 실제 인터페이스를 보고 쓴다. 할 일 목록과 완료 기준은 이 문서 끝 "뒤 단계 개요" 에 있다.

**문서 구성:** 이 README 에 공통 내용을 두고, Task 는 아래 "Task 문서" 표의 6개 파일에 나눠 둔다. Task 를 맡은 사람은 README 와 해당 파일을 함께 읽는다.

## 스펙과 다르게 정한 점

계획을 쓰며 코드를 조사한 결과로 정했다. 스펙의 결정(D1~D20)을 바꾸지는 않고, 구현 세부만 정한다.

| # | 스펙 | 계획 | 이유 |
|---|---|---|---|
| P1 | `_VER` 에 `REV` | rev 를 **모델 단위**(`TB_MDM_ERD_MODEL.REV`)로 둔다 | 버전 밖 다이어그램 명령도 같은 rev 를 쓰고, 새 DRAFT 를 만들어도 `getChangesSince` 가 끊기지 않는다 |
| P2 | 표준 검사기는 단계 1 | **단계 0** 으로 당긴다 | 명령 판정의 "경고" 와 확정 검사(D19)가 표준 판정을 쓴다 |
| P3 | "사전 캐시" | 사전을 **요청마다 한 번** 읽는다. 캐시하지 않는다 | 기존 불변 규칙 I26(`TermDictionaryLoader` 주석). 요청 하나 안에서는 컬럼 수백 개를 한 번에 판정한다 |
| P4 | 표준 상태 5종 | `NEW` 를 더해 6종 | 사전 단어로 만들 수 있지만 컬럼 사전에 아직 없는 이름. 경고만 하고 확정은 막지 않는다 |
| P5 | `_rev` 값 `[rev, 세션]` | `{"rev":213,"session":"…"}` 객체 | Jackson record 로 바로 읽는다 |
| P6 | (없음) | 모델에 `_tombstones`(지운 요소 → rev·세션) | `NOT_FOUND` 응답에 지운 세션과 rev 를 담는다(스펙 4.5) |
| P7 | 오류 코드 4종 | `NEEDS_CHOICE` 추가 | 논리명 후보가 여럿이거나 관계 추가 시 이름이 겹치면 선택을 요구한다(스펙 4.1) |
| P8 | "확정 요청" | 소유자가 **직접 확정** | ADR-0002(결재 없음). 동작은 같다 |
| P9 | 명령 이름 | OASIS 액션은 MDM 어휘 16종(`MdmActions`)으로 매핑한다(Task 10 표) | 액션이 RBAC 키이고 어휘 시험이 있다 |
| P10 | SSE 경로 미정 | 포털 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}` → BE `@RestController` | 포털 OASIS 프록시는 응답을 버퍼링한다(`arrayBuffer`). rest 경로(`forwardToBackend`)는 스트림을 넘긴다 |

## Global Constraints

- 작업은 dev 에서 딴 워크트리 브랜치(`erd-stage0`)에서 한다. git 은 `/usr/bin/git` 으로 부른다(rtk 훅). 복합 셸 명령이 거절되면 나눠 부른다.
- JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`.
- Gradle 은 `--max-workers=2` 이하. 백엔드 명령은 `src/backend/mdm` 에서 `../gradlew` 로 부른다.
- Oracle 시험은 항상 `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests <클래스>` 로 부른다. 도커·SQLite 금지. Bash timeout 600000ms.
- 시험 시간 예산: 바뀐 범위만 시험하고 항목마다 15분 상한. 리포 전체 시험은 하지 않는다. 마지막 Task 에서 바뀐 모듈(mdm `:lib:test`, `:api:test`, mcm 시드 시험) 전체를 한 번 돈다.
- Flyway 는 `node .claude/skills/flyway-migration-add/scripts/migration_tool.mjs` 로 채번한다(리포 루트에서). 머지된 V1~V5 는 주석 한 줄도 고치지 않는다.
- JPA 연관관계(`@ManyToOne` 등) 금지. 엔티티는 `CactusAuditEntity` 를 상속한다. 리포지토리는 메서드 없는 `JpaRepository` 로 둔다(규칙 21). 상태·JSON 쓰기는 `EntityManager` 네이티브 SQL 로 한다(`RuleSetWrites` 선례).
- 감사 9칼럼: `C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER`. 버전 표는 마지막 칼럼 이름이 `AUD_VER` 다(D-034).
- Oracle DDL: 대문자 식별자, `VARCHAR2(n CHAR)`, JSON CLOB 에는 `CHECK (... IS JSON STRICT)`.
- 주석·문서·커밋 제목은 한국어. 커밋 형식은 `type(scope): 제목`, 끝에 아래 두 줄을 붙인다.
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
  ```
- push 금지. dev 머지는 조정자 허가 뒤에 하고, 머지 전에 레인 커밋을 1개로 합친다(squash).
- Spring Boot 4 의 HTTP JSON 은 Jackson 3(`tools.jackson`)이다. 이 계획의 모델·명령 코드는 Jackson 2(`com.fasterxml`) `JsonNode` 를 쓰므로, OASIS 응답으로 내보낼 때는 `ErdModelCodec.MAPPER.convertValue(..., Map)` 로 일반 Map·List 로 바꾸고, SSE 는 `ErdModelCodec.MAPPER` 로 만든 문자열을 보낸다(`MdmJsonLists` 주석).
- 새 패키지는 `com.dongkuk.dmes.mdm.dma.erdEdit` 아래에 둔다. 화면 규약의 `{dto,service}` 에 더해 `model`·`engine`·`standard`·`stream` 하위 패키지를 쓴다.

## Review Focus

1. 한 묶음 안에서 앞 명령이 만든 요소(보낸 쪽이 정한 id)를 뒤 명령이 참조한다 → 성공해야 한다. 시험: Task 4 `batchRefersToElementCreatedEarlier`.
2. DRAFT 가 없는(RELEASED 만 있는) 모델에 모델 명령을 보낸다 → `NOT_EDITOR` 와 "새 버전(copy)을 먼저 만드세요" 안내. 다이어그램 명령은 DRAFT 없이도 된다. 시험: Task 9 `modelCommandWithoutDraftIsNotEditor`, `diagramCommandWithoutDraftApplies`.
3. 표를 지우면 그 표를 부모로 둔 다른 표의 관계와 그 표의 키도 사라지고, 되돌리기 한 번으로 모두 돌아온다. 시험: Task 5 `deleteParentTableRemovesRelationsAndUndoRestoresAll`.
4. 논리명에 사전에 없는 토막(공백·괄호·영문 포함)이 있다 → 물리명을 지어내지 않고 `NEEDS_CHOICE` 로 토막별 상태를 돌려준다. 시험: Task 6 `addColumnWithUnknownTokenNeedsChoice`.
5. SSE 가 끊긴 구독자가 `sinceRev` 로 다시 붙는다 → 빠진 델타를 순서대로 먼저 받고, 500건을 넘으면 `reload` 이벤트 하나만 받는다. 시험: Task 11 `reconnectReplaysMissedDeltas`, `reconnectTooFarSendsReload`.

---

## 파일 구조

```
src/backend/mdm/api/src/main/resources/
  db/migration/mdm/oracle/V6__erd_model.sql                 (Task 2)
  services/dma/erdEdit.bpmn                                  (Task 10)
src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/
  contract/version/VersionTarget.java                        (Task 2: ERD_MODEL)
  contract/version/VersionCoEditorSpi.java                   (Task 7)
  common/version/DefaultVersionTableRegistry.java            (Task 2)
  common/version/VersionSpiRegistry.java                     (Task 7)
  common/version/DefaultVersionWriteGuard.java               (Task 7)
  contract/common/MdmErrorCode.java                          (Task 8: ERD_MODEL_NOT_FOUND)
  entity/MdmErdModel.java, MdmErdModelVer.java(+Id), MdmErdEditor.java(+Id),
  entity/MdmErdCmdLog.java(+Id), MdmErdDiagram.java, MdmErdDiagramNode.java(+Id), MdmErdClaim.java(+Id)   (Task 2)
  repository/MdmErd*Repository.java (7개)                     (Task 2)
  dma/erdEdit/model/   ErdModel, ErdModelInfo, ErdTable, ErdColumn, ErdKey, ErdRelation,
                       ErdCardinality, ErdEvidence, ErdParentRef, PropRev, ErdModelCodec      (Task 3)
  dma/erdEdit/engine/  ErdCommand, ErdCommandEngine, ApplyOutcome, ErdChange, ErdRejection,
                       ErdWarning, ErdIds, ErdNaming, ErdDomainSpec                          (Task 4·5·6)
  dma/erdEdit/standard/ ErdColumnStatus, ErdStandardJudge, ErdDictionary, ErdDictionaryLoader (Task 6)
  dma/erdEdit/service/ ErdModelStore, ErdDiagramStore, ErdCommandLogStore, ErdCommandService,
                       ErdVersionService, ErdCoEditors, ErdConfirmCheck, ErdDraftDeletion,
                       ErdEditService                                                       (Task 7~10)
  dma/erdEdit/dto/     ErdEditRequest, ErdApplyResult, ErdModelView, ErdChangesView          (Task 9·10)
  dma/erdEdit/stream/  ErdEventHub, ErdPresence, ErdStreamController                         (Task 11)
src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  model/ErdModelCodecTest, engine/ErdCommandEngineTableColumnTest,
  engine/ErdCommandEngineRelationTest, standard/ErdStandardJudgeTest                         (Task 3~6)
src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/
  ErdSchemaTest, ErdCoEditorGuardTest, ErdVersionServiceTest, ErdCommandServiceTest,
  ErdEditOasisHttpTest, ErdStreamTest                                                       (Task 2·7~11)
src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java         (Task 10)
docs/mdm/screens/README.md, docs/mdm/screens/erdEdit/erdEdit_기능설계서.md,
docs/guide/design/identifier-dictionary/01-modules-and-screens.md                           (Task 1)
```

---

## Task 문서

| 파일 | Task |
|---|---|
| [01-schema.md](01-schema.md) | Task 1: 화면 식별자 등재와 기능설계서<br>Task 2: 스키마(V6)·버전 대상·엔티티 |
| [02-model-engine.md](02-model-engine.md) | Task 3: 모델 타입과 JSON 코덱<br>Task 4: 명령 엔진 1 — 표·컬럼·키, 충돌, 되돌리기 |
| [03-relation-standard.md](03-relation-standard.md) | Task 5: 명령 엔진 2 — 관계<br>Task 6: 표준 판정기와 논리명 자동 채움 |
| [04-version.md](04-version.md) | Task 7: 공동 편집자 SPI (버전 엔진)<br>Task 8: ERD 버전 서비스와 확정·삭제 SPI |
| [05-command-service.md](05-command-service.md) | Task 9: 명령 서비스 — 직렬화·기록·다이어그램·변경 조회·되돌리기 |
| [06-oasis-sse-close.md](06-oasis-sse-close.md) | Task 10: OASIS `erdEdit` 서비스·BPMN·권한 시드<br>Task 11: 실시간 채널(SSE)·접속자·작업 중 표시<br>Task 12: 단계 0 마감 — 바뀐 모듈 시험과 문서 |

---

## 뒤 단계 개요

단계 0 머지 뒤 각각 계획 문서를 쓴다(`docs/superpowers/plans/YYYY-MM-DD-erd-tool-stage1-import-viewer.md`, `…-stage2-edit-coedit.md`).

### 단계 1 — 가져오기·뷰어 (P1)

할 일:
1. ERD 전용 DB 메타 조회(딕셔너리 뷰: 표·컬럼·코멘트·PK·UK·FK 컬럼 짝·인덱스·기본값). analog 뷰어는 고치지 않는다.
2. `importFromDb`·`import` 액션: 처음 가져오기(모델 비었을 때)와 다시 가져오기 차이 목록(`getDbDiff`), 고른 항목 반영(`applyDbDiff`). 논리명은 컬럼 사전·별칭 대조, 사전에 없는 토막은 `***`.
3. 관계 추정기: DB FK → 리포 dbml 문서 → SQL 조인(Java 문자열·mapper XML) → 칼럼명 규칙(PK·UK 같은 이름, 감사 칼럼 제외), 허브 칼럼 접기. 회귀 시험: MDM FK 53개 정답, 칼럼명 규칙 정밀도 ≥ 0.57·재현율 ≥ 0.78. 추정 관계는 `INFERRED` + `evidence`, 기각한 관계는 다시 가져와도 되살리지 않는다.
4. 화면(`m-mdm/pages/dma/erdEdit/page.tsx`): tsup entry·package exports·메뉴 leaf 시드, 캔버스(표 노드·관계선·점선)·컬럼 그리드(읽기)·검토 패널(표준 위반·추정 관계 확정·기각), 논리·물리 전환(F3)·보기 프리셋·접기·축소 시 이름만, SSE 구독과 델타 적용(바뀐 노드만 다시 그림). 캔버스 부품을 `@dk-oasis/shared` 로 복사(`react-flow` 진입점, `route-path`, `snap`, `viewport-guard`, `ContextMenu`, 손본 `shortcuts`·`FindWidget`·`ViewportGuard`) + mantine-aggrid-ui 문서·색인.
5. MCP 서버 `scripts/erd/erd-mcp.mjs`(새 의존성 `@modelcontextprotocol/sdk` — 착수 전 사용자 확인)와 읽기 도구: `getModelText`, `getCurrentView`, `getChangesSince`, `listViolations`, `listInferredRelations`, `getDbDiff`. 세션 이름 인자.

완료 기준: MCM 표 55개를 가져와 추정 관계를 점선으로 그린다. MDM FK 는 `DB` 상태. 컬럼마다 표준 상태가 보인다. Claude 가 `getCurrentView` 로 화면에서 고른 표를 알아보고 질문에 답한다. 시험 2·3·10(스펙 6절).

### 단계 2 — 편집·동시 편집 (P2)

할 일:
1. 화면 편집: 그리드 키보드 입력(Ctrl+Enter, Ctrl+Shift+Enter, F2), 논리명 디바운스 미리보기(`compare`), 관계 도구(비식별 4·식별 5, 이름 겹침 선택 창), 찾기(Ctrl+T·Ctrl+O·Ctrl+↑/↓), 자동 배치(dagre), 다이어그램 생성 마법사, 삭제 구분(Delete·Alt+Delete).
2. 두 층 모델(서버 확인 상태 + 대기 명령), 거절 시 되돌림과 알림, 연결 끊김 띠·재연결.
3. 접속자 이름표, 작업 중 표시, 공동 편집자 관리 화면, 변경 기록과 되돌리기(Ctrl+Z), 다시 가져오기 차이 반영 화면, 버전 막대(`VersionActionBar`)·확정.
4. MCP 쓰기 도구(`apply`, `confirmRelation`, `rejectRelation`, `undo`, `claimTable`, `releaseTable`)와 `scripts/erd/erd-cli.mjs`(기본 dry-run, `--apply`).

완료 기준: 사람 2명과 Claude 세션 2개가 한 모델을 함께 고치고, 충돌 알림과 되돌리기가 동작하며, 확정까지 마친다. 시험 7·8·9(스펙 6절).

