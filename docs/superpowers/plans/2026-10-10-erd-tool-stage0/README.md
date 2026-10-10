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
| P10 | SSE 경로 미정 | 포털 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}` → BE `@RestController` | 포털 OASIS 프록시는 응답을 버퍼링한다(`arrayBuffer`). rest 경로는 스트림을 넘긴다. 이 경로는 m-mcm `lib/http/be-proxy.ts` 의 `forwardToBackend` 이고, 아래 "단계 0 구현 결정"의 "포털 SSE 확인"이 말하는 프록시와 같은 코드다 |

## Global Constraints

- 작업은 dev 에서 딴 워크트리 브랜치(`erd-stage0`)에서 한다. git 은 `/usr/bin/git` 으로 부른다(rtk 훅). 복합 셸 명령이 거절되면 나눠 부른다.
- JDK 21: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (`/usr/libexec/java_home -v 21` 은 이 PC 에서 JDK 26 을 돌려준다).
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

## 단계 0 구현 결정

구현 중 검토에서 나온 판정이다. 스펙 결정(D1~D20)은 바꾸지 않았다. 작업 기록은 SDD 원장에 있다. 수정 라운드에 함께 넣은 작은 수정(키 검증, 시험 보강, 오류 코드 정리 등)과 문서 수정(JDK 경로, screenId 개수)은 한 행씩 요약했고 하나씩 적지 않았다.

| # | 결정 | 이유 | 틀렸을 때 비용 |
|---|---|---|---|
| R4-1 | 명령 되돌리기는 속성 단위로 한다. 같은 속성을 나중에 바꾼 변경이 있으면(내 세션 포함) 충돌로 거절한다. 일괄 처리 뒤 참조 무결성을 다시 검사한다. | 오래된 명령을 되돌리면 모델이 깨졌기 때문이다(스펙 4.2·4.3, D18). | 되돌리기가 예상보다 자주 거절될 수 있다. |
| R4-2 | 명령 입력 오류는 타입 접근자와 null 검사로 `INVALID` 로 돌려준다. 예외는 마지막 방어선에서 잡는다. | 잘못된 입력이 날 예외로 샜다(스펙 4.5). | 비용은 크지 않다. |
| R4-3 | 공개 `apply` 는 `restore`·`restoreDiagram` 을 거절한다. 되돌리기만 내부 경로로 쓴다. | 클라이언트가 임의 값을 되살릴 수 있었다. | 내부 호출자가 `restore` 를 쓰려면 `undo()` 를 거쳐야 한다. |
| 엄격 명령 읽기 | 클라이언트 명령은 엄격한 읽기(`ErdCommandService` 의 파싱 단계)로 읽는다. 모델 JSON 읽기(`ErdModelCodec`)는 그대로 둔다. | 길이 3.7 이 3 으로, 문자열 "true" 가 true 로 바뀌었다. | "true" 문자열을 보내는 MCP·CLI 가 `INVALID` 를 받는다(의도한 동작). |
| R7-1 | DRAFT 에 소유자가 있을 때만 공동 편집자를 본다. 소유자가 없으면 모두 MDM003 이고 먼저 선점해야 한다. | 스펙 D15 는 소유자가 있다고 전제한다. 소유자가 없으면 아무도 쓰지 못한다는 `requireOwner` 불변식을 지킨다. | 해제 뒤 누군가 선점할 때까지 공동 편집자가 기다린다. |
| R7-2 | 소유자가 바뀌어도(인계·재선점) 공동 편집자 행은 DRAFT 에 남는다. 새 소유자가 지울 수 있다. SPI Javadoc 에 적는다. | 행이 버전에 붙어 있다. | 새 소유자가 뜻밖에 협업자를 물려받는다. |
| R7-3 | 공동 편집자의 역할은 검사하지 않는다. 목록은 소유자가 관리한다. | 스펙에 규정이 없다. 운영 인증(deferred 19번)과 함께 다시 본다. | steward 가 아닌 공동 편집자가 ERD DRAFT 를 고칠 수 있다. |
| 편집자 관리 | `ADD_EDITOR`·`REMOVE_EDITOR` 는 소유자만 한다. `ErdVersionService.requireOwnedDraft` 가 이미 지킨다. | 공동 편집자가 다른 편집자를 늘리면 소유자 관리 원칙이 깨진다. | 비용은 없다. |
| R8-1 | RELEASED 기준선이 없으면 확정 검사의 위반을 경고로만 보고하고 막지 않는다. D19 는 두 번째 버전부터 적용된다. | 첫 버전에서 레거시 위반이 모두 확정을 막았다. 단계 1 가져오기에는 아직 기준선이 없다. | 첫 확정 전에 추가한 비표준 컬럼이 경고로 지나간다. 단계 1 이 가져오기 시점 기준선을 둘 수 있다. |
| R8-2 | `lockRev` 는 `@Transactional(MANDATORY)` 로 하고 시험을 둔다(트랜잭션 안·밖). | 트랜잭션 밖에서는 잠금이 조용히 사라졌다(스펙 시험 5). | 비용은 없다. |
| R9-1 | 다이어그램 되돌리기는 현재 행이 그 rev 의 기록된 이후 값과 다르면 충돌로 거절한다. | 마지막 쓴 사람이 이기는 방식이었다(D18·4.3). | 다이어그램 되돌리기 거절이 늘어난다. |
| R9-2 | 다이어그램 명령은 현재 버전(DRAFT, 없으면 최신 RELEASED)의 소유자나 공동 편집자만 보낸다. DRAFT 가 꼭 있어야 하지는 않다. 공동 편집자는 소유자가 있을 때만 인정한다. | 다이어그램 명령에 권한 검사가 없었다(스펙 2.1·4.4, D6). | 소유하지 않은 steward 는 선점 전에 RELEASED 모델의 다이어그램을 못 옮긴다. |
| R9-3 | `baseRev` 가 현재 rev 보다 크면 `INVALID` 로 거절한다. | 미래 rev 를 받아들였다(4.3). | 비용은 없다. |
| R9-4 | 생략된 선택 boolean 은 엄격 파싱 전에 false 로 채운다. 명시한 null·틀린 타입은 `INVALID` 이다. | 엄격 읽기가 identifying 생략을 거절했다(4.1). | 플래그를 생략한 클라이언트가 조용히 false 를 받는다. |
| R9-5 | 다이어그램 복원의 읽기·삭제를 모델 범위로 좁힌다. | 다른 모델 행에 닿을 수 있었다. | 비용은 없다. |
| 수정 라운드에 넣은 작은 수정(요약) | 검토가 짚은 작은 지적은 수정 라운드에서 함께 고쳤다(키 검증, 시험 보강, 오류 코드 정리 등). | 라운드를 따로 만들 만큼 크지 않았다. | 비용은 없다. |
| 문서 수정(요약) | JDK 경로를 `/opt/homebrew/...openjdk@21` 로 고쳤고, screens README §3 의 screenId 개수를 표의 실제 수(19종, 보류 포함 20종)로 고쳤다. | `java_home -v 21` 은 JDK 26 을 돌려주고, 개수는 낡은 숫자였다. | 틀리면 Gradle 도구 오류가 바로 보인다. |
| R11-1 | SSE 재전송: 기록과 rev 는 `sync(sub)` 잡기 전에 읽는다. 잠금 안에서는 스냅샷 전송, `lastRev` 이하 건너뜀, 대기분 비우기만 한다. 재전송 스레드는 고정 풀(2~4개)이고 `@PreDestroy` 에서 끈다. | 재전송 스레드가 잠금을 쥔 채 풀 연결을 받아 풀이 고갈되고 `apply` 가 30초 멈췄다. | 비용은 없다. 보류분 따라잡기가 잠금 안에서 연결을 쓰는 좁은 틈이 남는다(deferred 28번). |
| Task 10 편차 | `ErdEditService` 는 `apply`·`undo` 를 `TransactionTemplate`(NOT_SUPPORTED)로 감싼다. 서비스와 DTO 는 lib 에 둔다. | OASIS 가 프로세스마다 트랜잭션을 열어 REQUIRED 로 합류하면 거절 때 `UnexpectedRollbackException` 이 난다. | 저장·복원이 DB 연결을 2개 쥔다(deferred 27번). |
| SSE 재전송 편차(Task 11a) | 구독 시 rev 는 `JdbcTemplate` 로 읽고, 재전송은 `erd-sse-replay` 풀에서 돈다. 발행은 구독자별 예외를 잡는다. | open-in-view 가 SSE 요청마다 JDBC 연결을 붙잡아 풀(2~3개)이 말랐다. | JPA 대신 JDBC 로 읽는 코드가 하나 늘었다. |
| R11b-1 | `CLAIM`·`RELEASE` 는 `NOT_SUPPORTED` 바깥 트랜잭션(자동 커밋)으로 돌린다. SSE 방송은 쓰기 뒤에 한다. | `JdbcTemplate` 이 OASIS 트랜잭션 연결을 같이 쓰면 커밋 전에 방송이 나간다. 델타는 이미 커밋 뒤에 발행한다. | 비용은 없다. |
| 포털 SSE 확인 | 수동 curl 대신 코드 읽기로 확인했다. 스트림은 통과하지만 GET 120초 제한으로 2분마다 끊긴다. 단계 0 은 포털을 고치지 않는다. | 단계 0 범위에 포털 변경이 없다. | `next start` 의 gzip 버퍼링이 이벤트를 늦출 수 있다. 단계 1 에서 브라우저로 확인한다. |
| 판정 시간 이월 | 사전 적재·일괄 판정 시간 측정을 단계 1 로 미룬다. | 시험 PDB(TPL_EMPTY 복제)의 사전이 비어 있다. | 스펙 5절 해당 행이 한 단계 더 열려 있다. |
| 병렬 레인 | Task 10(레인 A)과 Task 11a(레인 B)를 서로 다른 워크트리에서 병렬로 하고 `erd-stage0` 에 합쳤다. Task 12 는 문서(병렬)와 시험(11b 머지 뒤)으로 나눴다. | 사용자 지시(2026-10-10): 병렬 가능하면 병렬. | 파일이 겹치면 `ErdCommandService` 에서 충돌한다(겹치지 않았다). |
| 최종-권한 | erdEdit 권한 시드는 dmb 매트릭스(표준 관리자 EDIT, steward CONFIRM)를 쓴다. 메뉴 자리(단계 1)와 따로 정한다. | dma 매트릭스(steward READ)로는 어떤 MDM 역할도 선점·확정을 끝내지 못했다. 버전 관리 대상(레이아웃)과 같은 매트릭스다(P8). | 시드는 공유 DB 에 insert-if-absent 로 남는다. 넓히기는 쉽지만 좁히려면 행을 지워야 한다. |
| 최종-삭제 표지 | DRAFT 삭제와 새 버전(`copy`)은 `lockRev` 안에서 rev 를 올리고, 변경 기록에 출처 `SYSTEM` 인 표지 행을 넣는다. `changesSince` 는 표지를 넘으면 `reload` 를 돌려주고, 커밋 뒤 SSE `reload{rev}` 를 발행한다. 표지 앞 명령은 되돌리지 못한다. 출처 `SYSTEM` 은 예약어라 일반 명령으로는 보낼 수 없다. 삭제·복사는 모델 행 잠금을 OASIS 커밋까지 쥔다. | 삭제 뒤 rev 가 그대로라 열린 화면과 LLM 세션이 지운 DRAFT 를 계속 봤다(스펙 4.4, P1). | 변경 기록에 모델 명령이 아닌 행이 생긴다. 뒤 단계에서 `SYSTEM` 출처로 실제 명령을 보내야 하면 표지용 열을 따로 둬야 한다. 같은 모델의 저장이 삭제·복사 커밋까지 기다린다. |
| 최종-편집자 먼저 | 모델 명령은 엔진을 돌리기 전에 편집자인지 본다. CAS 갱신은 `beginDraftWrite` 가 그대로 한다. | 스펙 2.1 순서(선점 → 권한 → 충돌 → 검증)를 어겨, 편집자가 아닌 쪽이 충돌·검증 결과를 먼저 받았다. | 비용은 없다. |
| 최종-작은 수정(요약) | 거절에 소유자 id, `CLAIMED` 경고에 `claimedBy`·만료 시각을 필드로 넣는다. 처음 구독은 `hello{rev}` 를 먼저 보낸다(단계 1 화면과 `scripts/erd` 가 `hello`·`reload` 를 처리해야 한다). 소유자 id 는 DRAFT 가 없으면 null 이고, `claimedBy` 는 사용자 id 가 아니라 선점한 세션이다. 길이 초과는 `INVALID` 로 돌려준다. V6 에 `MODULE_ID` 고유 제약을 둔다. `ERD_MODEL_NOT_FOUND` 는 업무 오류(의미상 404)로 보낸다. 기준 제약 시험은 V1 표로 범위를 좁힌다. | 머지 뒤에는 V7 이나 계약 변경이 필요해 지금이 싸다. | 비용은 없다. |
| 최종-확정 취소 | ERD 는 단계 0 에 확정 취소 액션을 두지 않는다. 그래서 스펙 2.1-6 의 확정 취소 검사가 필요 없다. | RELEASED 를 DRAFT 로 되돌리는 경로가 없다. | 확정 취소를 넣는 단계에서 검사를 함께 만들어야 한다. |
| 최종-첫 DRAFT | 확정한 적 없는 모델의 유일한 DRAFT 는 지울 수 없다(MDM009). | 지우면 보기·새 버전은 대상이 없고, 모듈당 모델 하나 제약 때문에 다시 등록도 못 해 모듈이 막혔다. | 잘못 등록한 모델을 버릴 길이 없다(deferred 40번). |
| 최종-낡은 baseRev | 클라이언트 명령의 `baseRev` 와 현재 rev 사이에 삭제·새 버전 표지가 있으면 다시 읽으라는 안내와 함께 `INVALID` 로 거절한다. 되돌리기는 권한을 먼저 본다. | 새 DRAFT 는 요소 rev 를 올리지 않아 속성 충돌 검사가 통째 바뀐 모델을 알아보지 못했다. | 단계 1 화면과 `scripts/erd` 가 이 거절을 처리해야 한다. |
| 최종-확정 잠금 | 적용 시각을 지정한 확정(`requestedApplyFrom` 있음)은 확정 검사에서 모델 행을 먼저 잠근다. `validate` 는 잠그지 않는다. | 확정과 삭제가 서로 다른 순서로 잠가 ORA-00060 이 날 수 있었다. | 공통 확정 트랜잭션 밖에서 적용 시각을 넘기는 호출자는 `IllegalTransactionStateException` 을 받는다. |
| 최종-이월 | 연결 2개 점유 교착(deferred 27번)은 단계 2 착수 전에, 읽기 전용 화면 공유(38번)는 단계 1 착수 전에 고친다. 수명 주기 SSE(39번)는 단계 2 에서 한다. | 단계 0 에서는 동시 편집자가 적고 화면이 없다. | 해당 단계 착수가 늦어진다. |

---

## 뒤 단계 개요

단계 0 머지 뒤 각각 계획 문서를 쓴다(`docs/superpowers/plans/YYYY-MM-DD-erd-tool-stage1-import-viewer.md`, `…-stage2-edit-coedit.md`).

### 단계 1 — 가져오기·뷰어 (P1)

착수 전: 읽기 전용 사용자도 화면 상태를 공유하도록 `SET_VIEW` 를 READ 권한 경로로 옮긴다(deferred 38번).

할 일:
1. ERD 전용 DB 메타 조회(딕셔너리 뷰: 표·컬럼·코멘트·PK·UK·FK 컬럼 짝·인덱스·기본값). analog 뷰어는 고치지 않는다.
2. `importFromDb`·`import` 액션: 처음 가져오기(모델 비었을 때)와 다시 가져오기 차이 목록(`getDbDiff`), 고른 항목 반영(`applyDbDiff`). 논리명은 컬럼 사전·별칭 대조, 사전에 없는 토막은 `***`.
3. 관계 추정기: DB FK → 리포 dbml 문서 → SQL 조인(Java 문자열·mapper XML) → 칼럼명 규칙(PK·UK 같은 이름, 감사 칼럼 제외), 허브 칼럼 접기. 회귀 시험: MDM FK 53개 정답, 칼럼명 규칙 정밀도 ≥ 0.57·재현율 ≥ 0.78. 추정 관계는 `INFERRED` + `evidence`, 기각한 관계는 다시 가져와도 되살리지 않는다.
4. 화면(`m-mdm/pages/dma/erdEdit/page.tsx`): tsup entry·package exports·메뉴 leaf 시드, 캔버스(표 노드·관계선·점선)·컬럼 그리드(읽기)·검토 패널(표준 위반·추정 관계 확정·기각), 논리·물리 전환(F3)·보기 프리셋·접기·축소 시 이름만, SSE 구독과 델타 적용(바뀐 노드만 다시 그림). 캔버스 부품을 `@dk-oasis/shared` 로 복사(`react-flow` 진입점, `route-path`, `snap`, `viewport-guard`, `ContextMenu`, 손본 `shortcuts`·`FindWidget`·`ViewportGuard`) + mantine-aggrid-ui 문서·색인.
5. MCP 서버 `scripts/erd/erd-mcp.mjs`(새 의존성 `@modelcontextprotocol/sdk` — 착수 전 사용자 확인)와 읽기 도구: `getModelText`, `getCurrentView`, `getChangesSince`, `listViolations`, `listInferredRelations`, `getDbDiff`. 세션 이름 인자.
6. 포털 프록시 제한에서 `/erd/stream/` 을 뺀다(GET 120초 제한이 SSE 를 2분마다 끊는다). `next start` 의 gzip 버퍼링을 브라우저로 확인한다.
7. 소유자가 없는 RELEASED 버전에서는 아무도 다이어그램을 못 고친다(R7-1 의 결과). 화면과 MCP 가 이 경우에 분명한 안내 문구를 보여 준다.

완료 기준: MCM 표 55개를 가져와 추정 관계를 점선으로 그린다. MDM FK 는 `DB` 상태. 컬럼마다 표준 상태가 보인다. Claude 가 `getCurrentView` 로 화면에서 고른 표를 알아보고 질문에 답한다. 시험 2·3·10(스펙 6절).

### 단계 2 — 편집·동시 편집 (P2)

착수 전: 저장·복원의 연결 2개 점유 교착을 고치고 HTTP 단위 동시 저장 시험을 넣는다(deferred 27번).

할 일:
1. 화면 편집: 그리드 키보드 입력(Ctrl+Enter, Ctrl+Shift+Enter, F2), 논리명 디바운스 미리보기(`compare`), 관계 도구(비식별 4·식별 5, 이름 겹침 선택 창), 찾기(Ctrl+T·Ctrl+O·Ctrl+↑/↓), 자동 배치(dagre), 다이어그램 생성 마법사, 삭제 구분(Delete·Alt+Delete).
2. 두 층 모델(서버 확인 상태 + 대기 명령), 거절 시 되돌림과 알림, 연결 끊김 띠·재연결.
3. 접속자 이름표, 작업 중 표시, 공동 편집자 관리 화면, 변경 기록과 되돌리기(Ctrl+Z), 다시 가져오기 차이 반영 화면, 버전 막대(`VersionActionBar`)·확정.
4. MCP 쓰기 도구(`apply`, `confirmRelation`, `rejectRelation`, `undo`, `claimTable`, `releaseTable`)와 `scripts/erd/erd-cli.mjs`(기본 dry-run, `--apply`).

완료 기준: 사람 2명과 Claude 세션 2개가 한 모델을 함께 고치고, 충돌 알림과 되돌리기가 동작하며, 확정까지 마친다. 시험 7·8·9(스펙 6절).

