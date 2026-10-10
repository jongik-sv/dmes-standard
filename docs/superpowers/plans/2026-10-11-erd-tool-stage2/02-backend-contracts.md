# ERD 도구 단계 2 — Task 4·5: 서버 계약(rowVersion·version·시한 접속자·dryRun)과 다시 가져오기 반영

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-28)·Review Focus·인터페이스(정본)는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [01-backend-engine.md](01-backend-engine.md) · [README](README.md) · 다음: [03-scripts.md](03-scripts.md)

레인 BE2 가 Task 4 → 5 를 차례로 한다. 브랜치는 `erd-stage2-be2` 이고, deferred 27 수정이 머지된 dev(`25bc64ff3` 이후)에서 딴다. 코드는 모두 dev 의 것을 읽는다(옛 워크트리 `erd-stage2-pre` 는 지웠다).

README Review Focus 가운데 이 문서의 Task 에 속하는 것:
- 3 → Task 4 `dryRunRollsBackWithoutLogOrEvent`
- 4 → Task 4 `mcpWriteAppearsInPresenceAndExpires`
- 5 의 뒤쪽 → Task 5 `applyDiffRejectsStaleItemIds` (앞쪽 `fkAddedKeepsDecidedRelationState` 는 BE1 Task 3)

deferred 27 수정이 정한 규칙(README "착수 전")을 이 문서의 모든 코드가 지킨다.
- 쓰기 액션은 OASIS 트랜잭션에 합류한다. 거절·시험 실행의 되돌리기는 `ErdCommandService.Discard`(합류면 JDBC savepoint, 새 트랜잭션이면 rollback-only) 하나로 한다.
- 커밋 뒤 SSE 는 `ErdEventHub` 의 구독자별 상한 큐(256)와 보내기 스레드(4~32)로만 나간다. 새 이벤트 `version` 과 접속자 변경·만료도 `enqueue` 를 거친다.
- 허브의 DB 읽기는 `dbRead`(동시에 1개) 안에서만 하고 구독자 잠금을 쥔 채 읽지 않는다. 요청 스레드의 커밋 뒤 콜백(`afterCommit`)은 DB 를 읽지 않는다.
- 권한 확인과 쓰기 가드 사이의 경쟁은 MDM003·MDM002 오류로 나간다(합류 경로에서 `throw e`). 이 동작을 바꾸지 않는다.

이 문서의 경로 약어:
- `L/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `LT/` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `AT/` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`

명령은 모두 `src/backend/mdm` 에서 부른다. 먼저 `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 을 한다. Bash timeout 은 600000ms 로 준다. Oracle 시험 명령의 머리는 아래와 같다. 아래 Run 줄은 모두 이 머리를 그대로 적는다. 한 번에 4~5개 클래스만 묶는다(heavy 슬롯 대기와 600000ms 상한).

```bash
DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone
```

---

### Task 4: 서버 계약 — rowVersion, byUserId, CLAIM 응답, dryRun, SSE version, 시한 접속자

**Files:**
- Modify: `L/dto/ErdApplyResult.java`(rowVersion·dryRun), `L/dto/ErdImportResult.java`(rowVersion), `L/dto/ErdEditRequest.java`(dryRun)
- Create: `L/dto/ErdClaimResult.java`, `L/stream/ErdVersionEvent.java`
- Modify: `L/engine/ErdRejection.java`(byUserId — BE2 소유, README 레인 표)
- Modify: `L/stream/ErdDelta.java`(rowVersion), `L/stream/ErdPresence.java`(expiresAt), `L/stream/ErdEventHub.java`(claimFor·version·touch·sweep)
- Modify: `L/service/ErdCommandService.java`, `L/service/ErdEditService.java`, `L/service/ErdCommandLogStore.java`(userAt), `L/service/ErdModelStore.java`(flush)
- Create: `AT/ErdTestClient.java`(시험 공용), `AT/ErdStage2ContractTest.java`, `AT/ErdPresenceTouchTest.java`
- Modify: `AT/ErdImportTest.java`(rowVersion 한 줄)

**Interfaces:**
- Consumes:
  - deferred 27 수정(dev `25bc64ff3`): `ErdCommandService.Discard`, `ErdEventHub.enqueue`·`dbRead`·`afterCommit`·`attachForTest`·`addListenerForTest`, `VersionWriteGuard.beginDraftWrite(...)` 의 반환값(올린 뒤 ROW_VERSION).
  - BE1 Task 2 Step 1~5(t2a, 이 Task 의 Step 16 에서만): `ApplyOutcome.Applied.touchedTables() : List<String>`.
- Produces (README 정본 그대로):
  - `record ErdApplyResult(boolean applied, long rev, Long rowVersion, boolean dryRun, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection)`
  - `record ErdImportResult(boolean applied, long rev, Long rowVersion, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection, Summary summary)`
  - `record ErdRejection(..., Long byRev, String bySession, String byUserId, JsonNode current, JsonNode choices, String ownerId)` + 단계 1 생성자 두 개 + `withByUserId(String)`
  - `record ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion, List<ErdChange> changes)` + 6칸 생성자(rowVersion null)
  - `record ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables, String at, String expiresAt)` + 6칸 생성자(expiresAt null)
  - `record ErdVersionEvent(String modelId, String ver, String status, String ownerId, List<String> editors, long rowVersion, String reason, String userId, String at)`
  - `record ErdClaimResult(boolean ok, String claimedBy, String userId, String expiresAt)` — `execute kind=CLAIM` 의 `data.result`
  - `ErdCommandService.apply(..., List<JsonNode> raw, boolean dryRun)`, `undo(..., boolean dryRun)` — 기존 6칸·5칸 서명은 그대로 둔다
  - `ErdCommandLogStore.userAt(String modelId, long rev) : Optional<String>`
  - `ErdEventHub.claimFor(...) : ErdClaimResult`, `versionNow(modelId, reason, userId) : ErdVersionEvent`, `publishVersion(ErdVersionEvent)`, `touch(modelId, session, userId, source, List<String> touchedTables)`, `touchClaims(modelId, session, userId, source, List<ErdClaimView>)`, `sweepPresence(Instant now)`, `static isTimedSource(String)`
  - SSE 이벤트 `version`, `change.rowVersion`, `presence[].expiresAt`

이 Task 에서 정하는 규칙:

| 항목 | 규칙 |
|---|---|
| `rowVersion` | 묶음에 모델 명령이 있어 `beginDraftWrite` 를 지났으면 그 반환값이다. 다이어그램 명령만 있는 묶음·거절·`dryRun` 은 null 이다. 같은 값을 그 rev 의 SSE `change` 에 싣는다. `getChangesSince`·재전송 델타는 null 이다(S2-16) |
| `dryRun` 순서 | 잠금 → `baseRev` → DRAFT·편집자 → 표지 → 엔진(무결성 포함) → 다이어그램 판정 → CLAIMED 경고 → `Discard.run()` 으로 되돌림. `beginDraftWrite`·`writeJson`·`setRev`·`log.insert` 를 부르지 않고 커밋 뒤 콜백을 하나도 걸지 않는다(합류 경로에서 savepoint 로 되돌려도 바깥 커밋은 일어나므로, 걸어 둔 콜백은 돈다) |
| `dryRun` 결과 | `applied=false`, `dryRun=true`, `rowVersion=null`, `rev`=잠근 뒤 읽은 지금 rev. 통과 여부는 `rejection == null`. 거절도 `dryRun=true` 로 돌려준다. 접속자 표시를 바꾸지 않는다 |
| `import` 와 `dryRun` | `import` 는 `dryRun` 을 받지 않는다. `dryRun:true` 면 MDM021 이다(시험 실행인 줄 알고 보낸 가져오기가 실제로 쓰이지 않게) |
| `byUserId` | 거절의 `byRev` 가 있으면 `TB_MDM_ERD_CMD_LOG.USER_ID` 를 그 rev 로 찾아 넣는다. 없거나 `byRev` 가 null 이면 null. 엔진은 계속 null 로 만든다 |
| CLAIM 응답 | 표시를 쓰면 `{ok:true, claimedBy:내 세션, userId:나, expiresAt}`. 다른 세션이 쥐고 있으면 `{ok:false, claimedBy, userId, expiresAt}`(같은 연결로 읽은 그 행). 키가 동시에 겹친 경우는 상대 행이 아직 커밋 전이라 셋 다 null 이다. `expiresAt` 은 마이크로초까지 자른 ISO-8601(저장 칸 TIMESTAMP(6) 과 같은 글) |
| `version` 본문 | 동작과 같은 트랜잭션 안에서 영속성 문맥을 내보낸(`ErdModelStore.flush`) 뒤 `JdbcTemplate` 으로 읽는다. 엔티티는 네이티브 CAS 뒤에 낡을 수 있어 쓰지 않는다. 보내기는 커밋 뒤에 `enqueue` 로 한다. 동작이 실패(예외)하면 보내지 않는다 |
| `version` SUBSCRIBE | 재생 읽기와 같은 `dbRead` 한 번에서 읽고, 보내기 스레드가 재생분 바로 뒤, 큐보다 먼저 보낸다 |
| 확정 | `confirm` 은 지금처럼 `applyFrom`(`yyyy-MM-dd HH:mm:ss`, `RuleConfirmService.parseApplyFrom`)이 필수다. 이 Task 는 확정 입력을 바꾸지 않고 커밋 뒤 `version` 만 더한다. 화면·MCP·시험은 이 칸을 보낸다 |
| 시한 접속자 | `source` 가 MCP·CLI 이고 요청에 `session` 이 있을 때만 만든다. 같은 모델·세션의 SSE 구독이 있으면 아무것도 하지 않는다. 항목 = (마지막 반영 쓰기의 표) ∪ (그 세션의 살아 있는 작업 중 표시 표), `expiresAt` = 지금 + 600초. 새로 생기거나 `selectedTables` 가 바뀌면 방송, 만료만 늘면 방송하지 않는다. 핑 주기(15초)가 지난 항목을 지우고, 지운 것이 있는 모델에만 방송한다 |
| 시한 접속자 시점 | 반영된 쓰기는 커밋 뒤 콜백에서 `publish` 다음에 `touch(…, 표 목록)` 한다(DB 를 읽지 않는다). 읽기·거절된 쓰기는 요청 스레드에서 `touch(…, null)`. CLAIM·RELEASE 는 요청 스레드에서 같은 트랜잭션 연결로 그 모델의 표시 목록을 읽어 `touchClaims` 에 넘긴다 |

- [ ] **Step 1: 시험 공용 클라이언트 — `AT/ErdTestClient.java`**

`ErdStreamTest`·`ErdEditOasisHttpTest` 의 HTTP·SSE 코드를 한곳에 둔다. 이 Task 와 Task 5 의 새 시험 세 개가 쓴다.

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;

/** 단계 2 서버 시험 공용 — OASIS 호출과 SSE 구독(ErdStreamTest·ErdEditOasisHttpTest 방식). 기본 역할은 MDM_STEWARD 다. */
final class ErdTestClient {

    final ObjectMapper om = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private final int port;
    private final String key;

    ErdTestClient(int port, String key) {
        this.port = port;
        String env = System.getenv("BACKEND_CLIENT_KEY");
        this.key = env != null && !env.isBlank() ? env : key;
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        return call(action, user, "MDM_STEWARD", params);
    }

    JsonNode call(String action, String user, String role, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", key)
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    /** SSE 를 연다. 받은 이벤트를 "이름|data" 로 큐에 넣는다. sinceRev 가 음수면 새 구독(hello 부터)이다. */
    BlockingQueue<String> open(String modelId, String session, long sinceRev, String user) {
        BlockingQueue<String> q = new LinkedBlockingQueue<>();
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/mdm/erd/stream/" + modelId
                        + "?session=" + session + "&sinceRev=" + sinceRev))
                .header("X-Client-Key", key).header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", "MDM_STEWARD").header("Accept", "text/event-stream").GET().build();
        http.sendAsync(req, HttpResponse.BodyHandlers.ofInputStream()).thenAccept(res -> {
            try (var br = new BufferedReader(new InputStreamReader(res.body(), StandardCharsets.UTF_8))) {
                String line;
                String event = "message";
                while ((line = br.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        event = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        q.add(event + "|" + line.substring(5).trim());
                        event = "message";
                    }
                }
            } catch (Exception ignored) {
                // 시험이 끝나면 연결이 닫힌다
            }
        });
        return q;
    }

    /** 이름이 event 이고 본문이 match 를 만족하는 첫 이벤트의 본문. 10초 안에 없으면 실패한다. */
    JsonNode next(BlockingQueue<String> q, String event, Predicate<JsonNode> match) throws Exception {
        long end = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < end) {
            String s = q.poll(500, TimeUnit.MILLISECONDS);
            if (s == null || !s.startsWith(event + "|")) continue;
            JsonNode body = om.readTree(s.substring(event.length() + 1));
            if (match.test(body)) return body;
        }
        throw new AssertionError(event + " 이벤트(조건에 맞는 것)가 10초 안에 오지 않았습니다");
    }

    /** 처음으로 event 가 올 때까지 받은 이벤트 전부(그 이벤트 포함). */
    List<String> until(BlockingQueue<String> q, String event) throws Exception {
        List<String> seen = new ArrayList<>();
        long end = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < end) {
            String s = q.poll(500, TimeUnit.MILLISECONDS);
            if (s == null) continue;
            seen.add(s);
            if (s.startsWith(event + "|")) return seen;
        }
        throw new AssertionError(event + " 이벤트가 10초 안에 오지 않았습니다: " + seen);
    }

    /** ms 동안 event 가 오지 않아야 한다. */
    void assertNone(BlockingQueue<String> q, String event, long ms) throws Exception {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            String s = q.poll(100, TimeUnit.MILLISECONDS);
            if (s != null && s.startsWith(event + "|")) throw new AssertionError("오지 않아야 할 " + event + ": " + s);
        }
    }

    List<JsonNode> cmd(String json) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return out;
    }

    /** presence 목록에서 그 세션의 항목. 없으면 null. */
    static JsonNode entry(JsonNode list, String session) {
        for (JsonNode p : list) if (p.path("session").asText().equals(session)) return p;
        return null;
    }

    /** HTTP 응답의 null 칸. OASIS 응답 직렬화가 null 칸을 빼더라도 같은 뜻으로 본다. */
    static boolean nullish(JsonNode n) {
        return n == null || n.isNull() || n.isMissingNode();
    }

    static void await(BooleanSupplier cond, String what) throws InterruptedException {
        long end = System.currentTimeMillis() + 5_000;
        while (!cond.getAsBoolean()) {
            if (System.currentTimeMillis() > end) throw new AssertionError(what);
            Thread.sleep(50);
        }
    }
}
```

- [ ] **Step 2: 실패하는 시험 작성 — `AT/ErdStage2ContractTest.java`(결과 칸·dryRun·byUserId·CLAIM 응답)**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static com.dongkuk.dmes.mdm.dma.erdEdit.ErdTestClient.nullish;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdPresence;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 단계 2 서버 계약(README 인터페이스 정본) — rowVersion, dryRun, byUserId, CLAIM 응답, SSE version.
 * dryRun 은 두 경로를 본다: HTTP(OASIS 트랜잭션에 합류 → savepoint)와 서비스 직접 호출(새 트랜잭션 → rollback-only).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdStage2ContractTest.KEY)
@ActiveProfiles("local")
class ErdStage2ContractTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-s2-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    ErdTestClient c;

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        c = new ErdTestClient(port, KEY);
    }

    long rev() {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", Long.class);
    }

    long rowVersion() {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", Long.class);
    }

    int logCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mcm'", Integer.class);
    }

    String modelJson() {
        return jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", String.class);
    }

    /** owner 가 t-1(TB_A) 을 만들고(rev 1, 세션 s-o) kim 을 공동 편집자로 넣은 뒤, kim 이 논리명을 바꾼다(rev 2, 세션 s-k). */
    void seedPeerEdit() throws Exception {
        assertThat(commands.apply("mcm", 0, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]")).applied()).isTrue();
        versions.addEditor("mcm", "kim", "owner");
        assertThat(commands.apply("mcm", 1, "kim", "s-k", "UI",
                c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"비\"}}]")).applied()).isTrue();
    }

    @Test
    void saveRestoreAndChangeCarryRowVersion() throws Exception {
        var q = c.open("mcm", "ui-a", 0, "owner");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-a") != null);       // 구독이 살아 있다
        JsonNode res = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "session", "s-o", "source", "UI",
                "commandsJson", "[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]")).at("/data/result");
        assertThat(res.path("applied").asBoolean()).as(res.toString()).isTrue();
        assertThat(res.path("dryRun").asBoolean()).isFalse();
        assertThat(res.path("rowVersion").asLong()).isEqualTo(rowVersion());
        JsonNode change = c.next(q, "change", d -> d.path("rev").asLong() == 1);
        assertThat(change.path("rowVersion").asLong()).isEqualTo(rowVersion());
        // 다이어그램 명령만 있는 묶음은 ROW_VERSION 을 올리지 않는다 → null
        long before = rowVersion();
        JsonNode diag = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 1, "session", "s-o", "source", "UI",
                "commandsJson", "[{\"op\":\"addDiagram\",\"id\":\"d-s2-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]")).at("/data/result");
        assertThat(diag.path("applied").asBoolean()).as(diag.toString()).isTrue();
        assertThat(nullish(diag.path("rowVersion"))).as(diag.toString()).isTrue();
        assertThat(rowVersion()).isEqualTo(before);
        assertThat(nullish(c.next(q, "change", d -> d.path("rev").asLong() == 2).path("rowVersion"))).isTrue();
        // 되돌리기도 같은 규칙
        JsonNode undone = c.call("restore", "owner", Map.of("modelId", "mcm", "rev", 1, "session", "s-o", "source", "UI"))
                .at("/data/result");
        assertThat(undone.path("applied").asBoolean()).as(undone.toString()).isTrue();
        assertThat(undone.path("rowVersion").asLong()).isEqualTo(before + 1).isEqualTo(rowVersion());
        // 재전송·getChangesSince 의 델타는 rowVersion 이 없다(S2-16)
        JsonNode since = c.call("view", "owner", Map.of("modelId", "mcm", "sinceRev", 0)).at("/data/result");
        assertThat(since.path("deltas").size()).isEqualTo(3);
        assertThat(nullish(since.at("/deltas/0/rowVersion"))).as(since.toString()).isTrue();
    }

    /** Review Focus 3. CONFLICT 가 날 묶음과 통과할 묶음 모두 rev·명령 기록·ROW_VERSION·SSE·접속자가 그대로다. */
    @Test
    void dryRunRollsBackWithoutLogOrEvent() throws Exception {
        seedPeerEdit();                                                                            // rev 2
        List<ErdDelta> published = new CopyOnWriteArrayList<>();
        Runnable off = hub.addListenerForTest("mcm", published::add);
        try {
            long rev = rev();
            long rv = rowVersion();
            int logs = logCount();
            String json = modelJson();
            // 1) HTTP — OASIS 트랜잭션에 합류해 savepoint 로 되돌린다
            JsonNode conflict = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-d1",
                    "source", "MCP", "dryRun", true,
                    "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"씨\"}}]")).at("/data/result");
            assertThat(conflict.path("dryRun").asBoolean()).as(conflict.toString()).isTrue();
            assertThat(conflict.path("applied").asBoolean()).isFalse();
            assertThat(conflict.path("rev").asLong()).isEqualTo(rev);
            assertThat(conflict.at("/rejection/code").asText()).isEqualTo("CONFLICT");
            assertThat(conflict.at("/rejection/byUserId").asText()).isEqualTo("kim");
            JsonNode pass = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 2, "session", "claude-d1",
                    "source", "MCP", "dryRun", true, "commandsJson",
                    "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"설명\"}},"
                            + "{\"op\":\"addDiagram\",\"id\":\"d-s2-2\",\"areaName\":\"a\",\"diagramName\":\"b\"}]")).at("/data/result");
            assertThat(pass.path("dryRun").asBoolean()).as(pass.toString()).isTrue();
            assertThat(pass.path("applied").asBoolean()).isFalse();
            assertThat(nullish(pass.path("rejection"))).isTrue();
            assertThat(nullish(pass.path("rowVersion"))).isTrue();
            assertThat(pass.path("rev").asLong()).isEqualTo(rev);
            assertThat(pass.path("changes").size()).isGreaterThanOrEqualTo(2);                  // 표 변경 + 다이어그램
            JsonNode undo = c.call("restore", "owner", Map.of("modelId", "mcm", "rev", 2, "session", "claude-d1",
                    "source", "MCP", "dryRun", true)).at("/data/result");
            assertThat(undo.path("dryRun").asBoolean()).as(undo.toString()).isTrue();
            assertThat(nullish(undo.path("rejection"))).as(undo.toString()).isTrue();
            // 2) 서비스 직접 호출 — 새 트랜잭션이라 rollback-only 로 되돌린다
            ErdApplyResult direct = commands.apply("mcm", 1, "owner", "s-o", "UI",
                    c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"씨\"}}]"), true);
            assertThat(direct.dryRun()).isTrue();
            assertThat(direct.rejection().code()).isEqualTo("CONFLICT");
            assertThat(direct.rejection().byUserId()).isEqualTo("kim");
            ErdApplyResult directPass = commands.apply("mcm", 2, "owner", "s-o", "UI",
                    c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"설명\"}}]"), true);
            assertThat(directPass.rejection()).isNull();
            assertThat(directPass.applied()).isFalse();
            assertThat(directPass.rowVersion()).isNull();
            assertThat(directPass.rev()).isEqualTo(rev);
            ErdApplyResult directUndo = commands.undo("mcm", 2, "owner", "s-o", "UI", true);
            assertThat(directUndo.dryRun()).isTrue();
            assertThat(directUndo.rejection()).isNull();
            // 아무것도 바뀌지 않았다
            assertThat(rev()).isEqualTo(rev);
            assertThat(rowVersion()).isEqualTo(rv);
            assertThat(logCount()).isEqualTo(logs);
            assertThat(modelJson()).isEqualTo(json);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = 'd-s2-2'", Integer.class)).isZero();
            Thread.sleep(500);
            assertThat(published).as("dryRun 은 델타를 발행하지 않는다").isEmpty();
            assertThat(hub.presence("mcm")).extracting(ErdPresence::session).doesNotContain("claude-d1");
        } finally {
            off.run();
        }
    }

    @Test
    void conflictAndNotFoundCarryByUserId() throws Exception {
        seedPeerEdit();                                                                            // rev 2 = kim
        ErdApplyResult conflict = commands.apply("mcm", 1, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"씨\"}}]"));
        assertThat(conflict.rejection().code()).isEqualTo("CONFLICT");
        assertThat(conflict.rejection().byRev()).isEqualTo(2L);
        assertThat(conflict.rejection().bySession()).isEqualTo("s-k");
        assertThat(conflict.rejection().byUserId()).isEqualTo("kim");
        assertThat(commands.apply("mcm", 2, "kim", "s-k", "UI",
                c.cmd("[{\"op\":\"deleteTable\",\"id\":\"t-1\"}]")).applied()).isTrue();          // rev 3
        JsonNode gone = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 2, "session", "s-o", "source", "UI",
                "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"c\"}}]")).at("/data/result/rejection");
        assertThat(gone.path("code").asText()).as(gone.toString()).isEqualTo("NOT_FOUND");
        assertThat(gone.path("byRev").asLong()).isEqualTo(3);
        assertThat(gone.path("byUserId").asText()).isEqualTo("kim");
        ErdApplyResult invalid = commands.apply("mcm", 3, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-404\",\"set\":{\"comment\":\"c\"}}]"));
        assertThat(invalid.rejection().code()).isEqualTo("INVALID");
        assertThat(invalid.rejection().byUserId()).isNull();
    }

    @Test
    void claimResultNamesHolder() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        JsonNode a = c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1",
                "session", "claude-a", "source", "MCP")).at("/data/result");
        assertThat(a.path("ok").asBoolean()).as(a.toString()).isTrue();
        assertThat(a.path("claimedBy").asText()).isEqualTo("claude-a");
        assertThat(a.path("userId").asText()).isEqualTo("erd-mcp-a");
        Instant until = Instant.parse(a.path("expiresAt").asText());
        assertThat(Duration.between(Instant.now(), until).getSeconds()).isBetween(590L, 600L);
        JsonNode b = c.call("execute", "erd-mcp-b", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1",
                "session", "claude-b", "source", "MCP")).at("/data/result");
        assertThat(b.path("ok").asBoolean()).as(b.toString()).isFalse();
        assertThat(b.path("claimedBy").asText()).isEqualTo("claude-a");
        assertThat(b.path("userId").asText()).isEqualTo("erd-mcp-a");
        assertThat(b.path("expiresAt").asText()).isEqualTo(a.path("expiresAt").asText());
        c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "RELEASE", "tableId", "t-1", "session", "claude-a"));
        JsonNode again = c.call("execute", "erd-mcp-b", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1",
                "session", "claude-b", "source", "MCP")).at("/data/result");
        assertThat(again.path("ok").asBoolean()).as(again.toString()).isTrue();
        assertThat(again.path("claimedBy").asText()).isEqualTo("claude-b");
    }
}
```

`AT/ErdImportTest.java` 의 `importsMdmSchemaWithDbRelationsAndDiagram` 에서 `assertThat(res.path("rev").asLong()).isEqualTo(1);` 다음 줄에 넣는다.

```java
        assertThat(res.path("rowVersion").asLong())
                .isEqualTo(jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mdm' AND STATUS = 'DRAFT'", Long.class));
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest'`
Expected: 컴파일 실패. `ErdApplyResult.dryRun()`·`rowVersion()`, `ErdRejection.byUserId()`, `ErdCommandService.apply(…, boolean)`·`undo(…, boolean)` 이 없다.

- [ ] **Step 4: 구현 — 결과·이벤트 레코드와 요청 칸**

`L/dto/ErdApplyResult.java` 전체:

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import java.util.List;

/**
 * 명령 묶음 적용 결과(README 정본). 거절이면 applied=false 이고 rev 는 지금 모델 rev 다(아무것도 쓰지 않았다).
 * rowVersion 은 모델 명령이 DRAFT 행의 ROW_VERSION 을 올렸을 때 올린 뒤 값이다. 다이어그램 명령만 있는 묶음·거절·dryRun 은 null.
 * dryRun 이면 applied=false 이고 통과 여부는 rejection == null 이다(S2-15).
 */
public record ErdApplyResult(boolean applied, long rev, Long rowVersion, boolean dryRun, List<ErdChange> changes,
                             List<ErdWarning> warnings, ErdRejection rejection) {

    public static ErdApplyResult rejected(long rev, ErdRejection r) {
        return new ErdApplyResult(false, rev, null, false, List.of(), List.of(), r);
    }

    /** 시험 실행 결과로 바꾼다 — 아무것도 쓰지 않았으므로 applied=false·rowVersion=null 이다. */
    public ErdApplyResult asDryRun() {
        return new ErdApplyResult(false, rev, null, true, changes, warnings, rejection);
    }
}
```

`L/dto/ErdImportResult.java` 의 레코드 줄을 바꾼다.

```java
public record ErdImportResult(boolean applied, long rev, Long rowVersion, List<ErdChange> changes, List<ErdWarning> warnings,
                              ErdRejection rejection, Summary summary) {
```

`L/dto/ErdClaimResult.java`(새):

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

/**
 * execute kind=CLAIM 응답(S2-26). ok 와 상관없이 지금 그 표를 쥔 세션·사용자·만료 시각(ISO-8601)을 준다.
 * 같은 표를 다른 세션이 동시에 처음 표시해 쥔 세션을 읽지 못했으면 셋 다 null 이다.
 */
public record ErdClaimResult(boolean ok, String claimedBy, String userId, String expiresAt) {
}
```

`L/stream/ErdVersionEvent.java`(새):

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.List;

/**
 * 버전 수명 주기 SSE 이벤트 {@code version}(S2-12, deferred 39). rev 를 올리지 않고 명령 기록에 남지 않는다.
 * ver·status·ownerId·editors·rowVersion 은 그 시점에 view(ver 없음)가 돌려줄 값과 같다. 확정 뒤에는 확정한 버전이다.
 * reason: SUBSCRIBE·CONFIRM·LOCK·UNLOCK·HANDOVER·ADD_EDITOR·REMOVE_EDITOR. userId 는 동작한 사용자(SUBSCRIBE 는 구독한 사용자), at 은 ISO-8601.
 */
public record ErdVersionEvent(String modelId, String ver, String status, String ownerId, List<String> editors,
                              long rowVersion, String reason, String userId, String at) {
}
```

`L/stream/ErdDelta.java` 의 레코드 줄과 생성자를 바꾼다(상수·`isMarker` 는 그대로).

```java
public record ErdDelta(String modelId, long rev, String userId, String session, String source, Long rowVersion,
                       List<ErdChange> changes) {

    /** rowVersion 이 없는 델타 — 재전송·getChangesSince·표시 행은 ROW_VERSION 을 기록하지 않는다(S2-16). */
    public ErdDelta(String modelId, long rev, String userId, String session, String source, List<ErdChange> changes) {
        this(modelId, rev, userId, session, source, null, changes);
    }
```

`L/stream/ErdPresence.java` 전체:

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.List;

/**
 * 접속자 한 세션의 화면 상태(스펙 D16·D18). getCurrentView(MCP, 단계 1)가 이 값을 읽는다.
 * at·expiresAt 은 ISO-8601 문자열이다 — SSE 는 Jackson 2(ErdModelCodec, java.time 모듈 없음), OASIS 응답은 Jackson 3 으로 나가므로 둘 다 그대로 쓰는 형식으로 둔다.
 * expiresAt: SSE 구독자 항목은 null, MCP·CLI 시한 항목(S2-11)은 만료 시각.
 */
public record ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables,
                          String at, String expiresAt) {

    /** SSE 구독자 항목 — 구독이 끊길 때 지우므로 만료가 없다. */
    public ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables, String at) {
        this(session, userId, source, diagramId, selectedTables, at, null);
    }
}
```

`L/engine/ErdRejection.java` 전체:

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 거절(스펙 4.2·4.5). hint 는 "다음에 할 일" 문장이다. ownerId 는 {@code NOT_EDITOR} 일 때 그 버전의 소유자(공동 편집자 등록을
 * 부탁할 사람, 스펙 4.5)다 — DRAFT 가 없어 소유자가 없으면 null 이고, 다른 코드에서는 늘 null 이다.
 * byUserId 는 byRev 를 남긴 사용자다(S2-13). 엔진은 null 로 만들고 서비스가 명령 기록에서 찾아 {@link #withByUserId} 로 채운다.
 */
public record ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                           String property, Long byRev, String bySession, String byUserId,
                           JsonNode current, JsonNode choices, String ownerId) {
    public static final String INVALID = "INVALID";
    public static final String CONFLICT = "CONFLICT";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NEEDS_CHOICE = "NEEDS_CHOICE";
    public static final String NOT_EDITOR = "NOT_EDITOR";

    /** 단계 1 모양(byUserId 없음). */
    public ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                        String property, Long byRev, String bySession, JsonNode current, JsonNode choices, String ownerId) {
        this(code, commandIndex, message, hint, elementId, property, byRev, bySession, null, current, choices, ownerId);
    }

    /** 소유자 칸이 없는 거절(NOT_EDITOR 밖의 모든 코드). */
    public ErdRejection(String code, int commandIndex, String message, String hint, String elementId,
                        String property, Long byRev, String bySession, JsonNode current, JsonNode choices) {
        this(code, commandIndex, message, hint, elementId, property, byRev, bySession, null, current, choices, null);
    }

    public ErdRejection withByUserId(String userId) {
        return new ErdRejection(code, commandIndex, message, hint, elementId, property, byRev, bySession, userId,
                current, choices, ownerId);
    }

    /** 클라이언트 묶음의 자리로 바꾼 거절. */
    public ErdRejection atIndex(int index) {
        return new ErdRejection(code, index, message, hint, elementId, property, byRev, bySession, byUserId,
                current, choices, ownerId);
    }
}
```

`L/dto/ErdEditRequest.java` 에 칸을 더한다. `private Boolean warningsAcknowledged;` 다음 줄:

```java
    /** save·restore 시험 실행(S2-15). true 면 판정만 하고 아무것도 쓰지 않는다. 없으면 false. import 는 받지 않는다. */
    private Boolean dryRun;
```

`public Boolean getWarningsAcknowledged() { … }` 다음 줄에 `public Boolean getDryRun() { return dryRun; }`, `public void setWarningsAcknowledged(Boolean v) { … }` 다음 줄에 `public void setDryRun(Boolean v) { this.dryRun = v; }` 를 넣는다.

`L/service/ErdCommandLogStore.java` 의 `markerBetween` 다음에 넣는다.

```java
    /**
     * 그 rev 를 남긴 사용자(S2-13 — 충돌·삭제 거절의 byUserId). 쓰기 트랜잭션 안(거절 직후)에서 부르므로 readOnly 를 붙이지 않는다
     * ({@link #markerBetween} 과 같다).
     */
    public Optional<String> userAt(String modelId, long rev) {
        List<?> rows = em.createNativeQuery("SELECT USER_ID FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = ? AND REV = ?")
                .setParameter(1, modelId).setParameter(2, rev).getResultList();
        return rows.stream().findFirst().map(String.class::cast);
    }
```

- [ ] **Step 5: 구현 — `ErdCommandService` 의 rowVersion·byUserId·dryRun**

`apply` 와 `undo` 를 아래로 바꾼다(기존 6칸·5칸 서명은 그대로 남겨 단계 0·1 시험과 `applyImport` 가 그대로 컴파일된다).

```java
    /** 클라이언트 명령 묶음 적용. {@code restore}·{@code restoreDiagram} 은 거절한다(R4-3). */
    public ErdApplyResult apply(String modelId, long baseRev, String userId, String session, String source, List<JsonNode> raw) {
        return apply(modelId, baseRev, userId, session, source, raw, false);
    }

    /**
     * @param dryRun true 면 잠금 → baseRev → DRAFT·편집자 → 표지 → 엔진(무결성 포함) → 다이어그램 판정까지 돌고 쓰기 전에 되돌린다(S2-15).
     *               결과는 applied=false·dryRun=true·rowVersion=null 이고 통과 여부는 rejection == null 이다. 기록·rev·ROW_VERSION·SSE·접속자는 그대로다.
     */
    public ErdApplyResult apply(String modelId, long baseRev, String userId, String session, String source, List<JsonNode> raw,
                                boolean dryRun) {
        ErdApplyResult res = baseRev < 0
                ? rejectedNow(modelId, invalid(0, "baseRev 는 0 이상이어야 합니다", "getChangesSince 가 준 rev 를 쓰세요"))
                : applyInternal(modelId, baseRev, userId, session, source, raw, Opts.client(dryRun));
        return dryRun ? res.asDryRun() : res;
    }
```

```java
    /**
     * 명령 하나 되돌리기(스펙 D18). 저장된 역명령을 새 명령으로 보낸다 — 충돌 판정은 엔진 Restore 가 한다(그 뒤에 같은 속성을 고친
     * 변경이 있으면 CONFLICT). 역명령은 {@code restore}·{@code restoreDiagram} 을 담으므로 직접 보내기 금지를 풀고 보낸다.
     */
    public ErdApplyResult undo(String modelId, long rev, String userId, String session, String source) {
        return undo(modelId, rev, userId, session, source, false);
    }

    /** @param dryRun true 면 되돌리기 판정만 하고 쓰지 않는다(S2-15). */
    public ErdApplyResult undo(String modelId, long rev, String userId, String session, String source, boolean dryRun) {
        ErdApplyResult res = undoInternal(modelId, rev, userId, session, source, dryRun);
        return dryRun ? res.asDryRun() : res;
    }

    private ErdApplyResult undoInternal(String modelId, long rev, String userId, String session, String source, boolean dryRun) {
        String[] inv = log.inverse(modelId, rev).orElse(null);
        if (inv == null) {
            return ErdApplyResult.rejected(store.rev(modelId), invalid(0, "없는 rev 입니다: " + rev, "변경 기록에서 rev 를 고르세요"));
        }
        List<JsonNode> raw = new ArrayList<>();
        try {
            ErdModelCodec.MAPPER.readTree(inv[0]).forEach(raw::add);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        if (raw.isEmpty()) {
            return ErdApplyResult.rejected(store.rev(modelId), invalid(0, "되돌릴 내용이 없는 변경입니다: rev " + rev, "다른 rev 를 고르세요"));
        }
        // 다이어그램 요소의 충돌 판정 재료: 되돌릴 rev 가 남긴 변경 후 값.
        Map<String, JsonNode> expectedAfter = new HashMap<>();
        for (ErdChange c : log.changes(modelId, rev).orElse(List.of())) {
            if (c.kind().startsWith("diagram")) expectedAfter.put(c.kind() + "|" + c.id(), c.value());
        }
        return applyInternal(modelId, -1, userId, session, source, raw, Opts.undo(expectedAfter, rev, dryRun));
    }
```

`applyImport` 의 마지막 줄을 `return applyInternal(modelId, baseRev, userId, session, source, raw, Opts.firstImport());` 로 바꾼다.

`applyInternal` 의 javadoc·서명·본문 전체를 아래로 바꾼다.

```java
    /**
     * 경로별 선택. 클라이언트 명령·되돌리기·첫 가져오기가 각자 팩토리로 만든다.
     *
     * @param expectedAfter 되돌리기일 때만: 되돌릴 rev 의 변경 후 다이어그램 행(충돌 판정용). 클라이언트 명령이면 null.
     * @param undoOf 되돌리기일 때만: 되돌릴 rev. 그 뒤에 표시 행(DRAFT 삭제·새 DRAFT)이 있으면 INVALID. 클라이언트 명령이면 -1.
     * @param requireEmptyModel 첫 가져오기일 때만 true: 잠근 뒤 모델에 표가 있으면 INVALID.
     * @param dryRun 판정만 하고 쓰기 전에 되돌린다(S2-15).
     */
    private record Opts(boolean allowRestore, Map<String, JsonNode> expectedAfter, long undoOf, boolean requireEmptyModel,
                        boolean dryRun) {
        static Opts client(boolean dryRun) {
            return new Opts(false, null, -1, false, dryRun);
        }

        static Opts undo(Map<String, JsonNode> expectedAfter, long rev, boolean dryRun) {
            return new Opts(true, expectedAfter, rev, false, dryRun);
        }

        static Opts firstImport() {
            return new Opts(true, null, -1, true, false);
        }
    }

    /** @param baseRev 음수면 잠근 뒤의 현재 rev 를 쓴다(되돌리기 — 잠그기 전에 rev 를 읽으면 사이에 낡을 수 있다) */
    private ErdApplyResult applyInternal(String modelId, long baseRev, String userId, String session, String source,
                                         List<JsonNode> raw, Opts o) {
        if (userId == null || userId.isBlank() || userId.length() > 50) {
            return rejectedNow(modelId, invalid(0, "userId 는 1~50자여야 합니다", "로그인한 사용자 id 를 넣으세요"));
        }
        if (session == null || session.isBlank() || session.length() > 100) {
            return rejectedNow(modelId, invalid(0, "session 은 1~100자여야 합니다", "세션 이름을 넣으세요"));
        }
        if (source == null || !SOURCES.contains(source)) {
            return rejectedNow(modelId, invalid(0, "source 는 UI·MCP·CLI 중 하나입니다", "호출 경로에 맞는 값을 넣으세요"));
        }
        if (raw == null || raw.isEmpty() || raw.size() > MAX_BATCH) {
            return rejectedNow(modelId, invalid(0, "명령은 1~" + MAX_BATCH + "건이어야 합니다", "나눠서 보내세요"));
        }
        // 클라이언트 묶음에서의 자리를 따로 적어 둔다 — 모델·다이어그램 명령이 섞여도 거절 위치는 클라이언트가 보낸 자리다.
        List<ErdCommand> modelCmds = new ArrayList<>();
        List<Integer> modelIdx = new ArrayList<>();
        List<ErdDiagramCommand> diagramCmds = new ArrayList<>();
        List<Integer> diagramIdx = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            JsonNode n = raw.get(i);
            if (n == null || !n.isObject()) {
                return rejectedNow(modelId, invalid(i, "명령은 JSON 객체여야 합니다", "{\"op\":\"...\", ...} 모양으로 보내세요"));
            }
            String op = n.path("op").asText("");
            if (!o.allowRestore() && (op.equals("restore") || op.equals("restoreDiagram"))) {
                return rejectedNow(modelId, invalid(i, "restore 는 직접 보낼 수 없습니다", "되돌리기는 undo(restore 액션)를 쓰세요"));
            }
            try {
                if (ErdDiagramCommand.isDiagramOp(op)) {
                    diagramCmds.add(ErdStrictReader.read(n, ErdDiagramCommand.class));
                    diagramIdx.add(i);
                } else {
                    modelCmds.add(ErdStrictReader.read(ErdStrictReader.withOptionalBooleans(n, op), ErdCommand.class));
                    modelIdx.add(i);
                }
            } catch (JsonProcessingException e) {
                return rejectedNow(modelId, invalid(i, "명령 JSON 을 읽을 수 없습니다: " + ErdStrictReader.brief(e),
                        "op 와 필드 이름·값 형식(숫자·불리언은 따옴표 없이)을 확인하세요"));
            } catch (IllegalArgumentException e) {
                return rejectedNow(modelId, invalid(i, "명령 JSON 을 읽을 수 없습니다: " + e.getMessage(),
                        "op 와 필드 이름·값 형식을 확인하세요"));
            }
        }
        boolean modelBatch = !modelCmds.isEmpty();
        // 명령 기록에 남길 묶음. 잠근 뒤 만드는 묶음(Task 5 APPLY_DIFF)이 여기에 더한다.
        List<JsonNode> logged = new ArrayList<>(raw);
        // 사전은 요청마다 한 번, 모델 명령이 있을 때만 읽는다(I26). 모델 행을 잠그기 전에 읽어 잠금 시간을 줄인다.
        ErdNaming dict = modelBatch ? dictionaries.load() : null;
        return tx.execute(status -> {
            Discard discard = new Discard(status);
            long rev = store.lockRev(modelId);
            if (baseRev > rev) {
                // 앞선 rev 를 주장하면 §4.3 의 속성별 충돌 판정(요소 rev > baseRev)이 꺼진다.
                discard.run();
                return ErdApplyResult.rejected(rev, invalid(0, "baseRev 가 현재 rev(" + rev + ")보다 큽니다", "getChangesSince 로 받은 rev 를 쓰세요"));
            }
            long newRev = rev + 1;
            long engineBase = baseRev < 0 ? rev : baseRev;
            MdmErdModelVer draft = store.draft(modelId).orElse(null);
            if (modelBatch && draft == null) {
                discard.run();
                return ErdApplyResult.rejected(rev, notEditor("DRAFT 가 없습니다", "copy 로 새 버전을 먼저 만드세요", null));
            }
            // 권한은 충돌·검증(엔진)보다 먼저 본다(스펙 2.1 순서: 잠금 → 권한 → 충돌 → 검증). 판정은 쓰기 가드(beginDraftWrite)와
            // 같은 규칙이고, 가드는 아래에서 row_version CAS 를 위해 그대로 부른다.
            if (modelBatch && !isEditor(draft, userId)) {
                discard.run();
                return ErdApplyResult.rejected(rev, notEditor("이 DRAFT 를 고칠 권한이 없습니다",
                        "소유자(" + draft.getOwnerId() + ")에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", draft.getOwnerId()));
            }
            // 다이어그램 명령만 있으면 DRAFT 가 없어도 된다 — 다이어그램은 버전 밖이다(스펙 D6). 표 존재는 지금 보이는 버전으로 확인한다.
            MdmErdModelVer shown = draft != null ? draft : store.current(modelId);
            var modelVer = shown.getVer();
            // 다이어그램은 DRAFT 가 없어도 고치지만 편집자(소유자·공동 편집자)만 고친다(R7-1 과 같은 규칙, 보이는 버전 기준).
            if (!diagramCmds.isEmpty() && !isEditor(shown, userId)) {
                discard.run();
                return ErdApplyResult.rejected(rev, notEditor("이 모델의 다이어그램을 고칠 권한이 없습니다",
                        "소유자(" + shown.getOwnerId() + ")에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", shown.getOwnerId()));
            }
            // 권한 다음, 엔진(충돌·검증) 전에: 기준 rev 뒤에 DRAFT 가 지워지거나 새로 만들어졌으면(표시 행) 모델 JSON 이 통째로 바뀐 것이다.
            // 요소 rev 로는 그 교체가 보이지 않으므로 여기서 막는다. 잠근 뒤에 봐야 사이에 낀 copy·삭제를 놓치지 않는다.
            long since = o.undoOf() >= 0 ? o.undoOf() : baseRev;
            if (since >= 0 && since < rev && log.markerBetween(modelId, since, rev)) {
                discard.run();
                return ErdApplyResult.rejected(rev, o.undoOf() >= 0
                        ? invalid(0, "rev " + o.undoOf() + " 뒤에 DRAFT 가 지워지거나 새로 만들어져 되돌릴 수 없습니다",
                                "지금 DRAFT 에서 한 변경만 되돌리세요. getChangesSince 가 reload 를 주면 모델을 다시 읽으세요")
                        : invalid(0, "baseRev(" + baseRev + ") 뒤에 DRAFT 가 지워지거나 새로 만들어졌습니다",
                                "getChangesSince 가 reload 를 주면 모델을 다시 읽고(view) 새 rev 를 baseRev 로 다시 보내세요"));
            }
            // 모델 JSON 은 엔진이나 placeTables(표 존재 확인)가 쓸 때만 읽는다 — 표를 끌어 옮기는 moveNodes 는 자주 오므로 파싱을 아낀다.
            boolean needModel = modelBatch || diagramCmds.stream().anyMatch(c -> c instanceof ErdDiagramCommand.PlaceTables);
            ErdModel model = needModel ? ErdModelCodec.read(shown.getModelJson()) : null;
            if (o.requireEmptyModel() && !model.tables.isEmpty()) {
                discard.run();
                return ErdApplyResult.rejected(rev, invalid(0,
                        "이미 표가 있습니다(" + model.tables.size() + "개). 첫 가져오기는 표가 없는 모델에만 합니다",
                        "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요"));
            }
            List<ErdChange> changes = new ArrayList<>();
            List<ErdWarning> warnings = new ArrayList<>();
            ArrayNode inverse = ErdModelCodec.MAPPER.createArrayNode();
            Long rowVersion = null;
            if (modelBatch) {
                ApplyOutcome out = new ErdCommandEngine(dict).apply(model, engineBase, newRev, session, modelCmds);
                if (out instanceof ApplyOutcome.Rejected r) {
                    discard.run();
                    return ErdApplyResult.rejected(rev, withUser(modelId, atClientIndex(r.rejection(), modelIdx)));
                }
                var applied = (ApplyOutcome.Applied) out;
                if (!o.dryRun()) {
                    VersionRef ref = new VersionRef(VersionTarget.ERD_MODEL, modelId, draft.getVer());
                    try {
                        rowVersion = writeGuard.beginDraftWrite(ref, draft.getRowVersion(), userId);
                    } catch (BusinessException e) {
                        // 소유자도 공동 편집자도 아니면 MDM003, DRAFT 가 아니면 MDM002. 그 밖의 오류(MDM001 낡은 row_version 등)는 그대로 던진다.
                        // 위의 권한 검사를 지났으므로 여기서 MDM003 은 드물다(사이에 소유자가 바뀐 경우 등) — 그래도 같은 모양으로 돌려준다.
                        // 단 OASIS 트랜잭션에 합류했으면 그대로 던진다: 가드의 TransactionTemplate 이 실패하며 바깥 트랜잭션을 이미 rollback-only 로
                        // 표시했으므로 거절(성공 응답)로 돌려주면 커밋이 S001 이 된다. 던지면 업무 오류(MDM002·MDM003)로 나간다.
                        if (discard.joined()) throw e;
                        if (isGuardCode(e, MdmErrorCode.NOT_DRAFT)) {
                            discard.run();
                            return ErdApplyResult.rejected(rev, notEditor("DRAFT 가 아닙니다(" + e.getMessage() + ")", "copy 로 새 버전을 먼저 만드세요",
                                    draft.getOwnerId()));
                        }
                        if (!isGuardCode(e, MdmErrorCode.NOT_DRAFT_OWNER)) throw e;
                        discard.run();
                        return ErdApplyResult.rejected(rev, notEditor("이 DRAFT 를 고칠 권한이 없습니다(" + e.getMessage() + ")",
                                "소유자(" + draft.getOwnerId() + ")에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", draft.getOwnerId()));
                    }
                    // writeJson 은 em.clear() 한다 — 이 뒤에는 draft·shown 엔티티를 다시 읽지 않고 미리 꺼낸 값(modelVer)만 쓴다.
                    store.writeJson(ref, ErdModelCodec.write(applied.next()));
                }
                model = applied.next();
                changes.addAll(applied.changes());
                warnings.addAll(applied.warnings());
                for (ErdCommand inv : applied.inverse()) inverse.add(typed(ErdCommand.class, inv));
            }
            if (!diagramCmds.isEmpty()) {
                try {
                    var res = diagrams.apply(modelId, model, diagramCmds, diagramIdx, userId, o.expectedAfter());
                    changes.addAll(res.changes());
                    inverse.add(typed(ErdDiagramCommand.class, res.inverse()));
                } catch (ErdDiagramStore.ErdDiagramReject r) {
                    discard.run();
                    return ErdApplyResult.rejected(rev, withUser(modelId, r.rejection));
                }
            }
            warnings.addAll(claimedWarnings(modelId, session, tablesOf(changes)));
            if (o.dryRun()) {
                // 판정은 모두 지났다. 다이어그램 행 쓰기와 모델 행 잠금을 savepoint(합류) 또는 rollback-only(새 트랜잭션)로 버린다.
                // 커밋 뒤 콜백을 걸지 않는다 — 합류 경로는 savepoint 로 되돌려도 바깥 커밋이 일어나 걸어 둔 콜백이 돈다.
                discard.run();
                return new ErdApplyResult(false, rev, null, true, changes, warnings, null);
            }
            store.setRev(modelId, newRev);
            log.insert(modelId, newRev, modelVer, userId, session, source,
                    ErdCommandLogStore.write(logged), ErdCommandLogStore.write(inverse), changes);
            ErdDelta delta = new ErdDelta(modelId, newRev, userId, session, source, rowVersion, List.copyOf(changes));
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    hub.publish(delta);
                }
            });
            return new ErdApplyResult(true, newRev, rowVersion, false, changes, warnings, null);
        });
    }
```

`atClientIndex` 를 바꾸고, 그 아래에 도움 함수 셋을 넣는다.

```java
    /** 엔진은 모델 명령끼리만 센 자리를 돌려준다. 클라이언트 묶음의 자리로 바꾼다. */
    private static ErdRejection atClientIndex(ErdRejection r, List<Integer> modelIdx) {
        int i = r.commandIndex();
        if (i < 0 || i >= modelIdx.size()) return r;
        return r.atIndex(modelIdx.get(i));
    }

    /** byRev 를 남긴 사용자를 명령 기록에서 찾아 넣는다(S2-13). byRev 가 없으면 그대로. */
    private ErdRejection withUser(String modelId, ErdRejection r) {
        if (r.byRev() == null) return r;
        return r.withByUserId(log.userAt(modelId, r.byRev()).orElse(null));
    }

    /** 표 변경과 컬럼 변경의 표(단계 1 방식). 지운 컬럼(value null)·키·관계는 못 잡는다 — Task 5 가 엔진의 touchedTables 로 넓힌다. */
    private static List<String> tablesOf(List<ErdChange> changes) {
        return changes.stream().filter(c -> c.kind().equals("table") || c.kind().equals("column"))
                .map(c -> c.kind().equals("table") ? c.id() : (c.value() == null ? null : c.value().path("table").asText(null)))
                .filter(Objects::nonNull).distinct().sorted().toList();
    }

    /** 다른 세션이 작업 중인 표를 건드렸으면 CLAIMED 경고(스펙 4.5 — claimedBy·expiresAt 을 싣는다). */
    private List<ErdWarning> claimedWarnings(String modelId, String session, Collection<String> tables) {
        if (tables.isEmpty()) return List.of();
        List<ErdWarning> out = new ArrayList<>();
        hub.claims(modelId).stream()
                .filter(cl -> tables.contains(cl.tableId()) && !cl.session().equals(session))
                .forEach(cl -> out.add(new ErdWarning("CLAIMED", cl.tableId(),
                        cl.session() + " 가 " + cl.expiresAt() + " 까지 작업 중인 표입니다", cl.session(), cl.expiresAt())));
        return out;
    }
```

import 에 `java.util.Collection` 을 더한다. 쓰지 않게 된 `java.util.Set` 은 `SOURCES` 가 계속 쓰므로 남긴다.

- [ ] **Step 6: 구현 — `ErdEventHub.claimFor`, `ErdEditService` 의 dryRun·CLAIM 응답·import rowVersion**

`ErdEventHub` 의 `claim` 메서드를 아래 세 메서드로 바꾼다. import 에 `com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdClaimResult`, `java.time.temporal.ChronoUnit`, `java.util.Optional` 을 더한다.

```java
    /**
     * 표 하나를 작업 중으로 표시하고 지금 그 표를 쥔 세션을 돌려준다(S2-26). 다른 세션이 아직 만료되지 않은 표시를 갖고 있으면 빼앗지 않고
     * ok=false 와 그 세션을 준다. 같은 표를 다른 세션이 동시에 처음 표시해 키가 겹치면 상대 행은 아직 커밋 전이라 읽히지 않으므로
     * claimedBy 는 null 이다. 호출자 트랜잭션(OASIS)이 있으면 그 연결로 쓰고 읽으며, 방송은 커밋 뒤에 한다({@link #afterCommit}).
     */
    public ErdClaimResult claimFor(String modelId, String tableId, String session, String userId, long ttlSeconds) {
        Instant at = Instant.now().truncatedTo(ChronoUnit.MICROS); // EXPIRES_AT 은 TIMESTAMP(6) — 돌려주는 글과 저장 값을 같게
        Timestamp now = Timestamp.from(at);
        Instant until = at.plusSeconds(ttlSeconds);
        Timestamp untilTs = Timestamp.from(until);
        int n;
        try {
            n = jdbc.update("""
                MERGE INTO TB_MDM_ERD_CLAIM T
                USING (
                       SELECT ? AS ERD_MODEL_ID
                            , ? AS TABLE_UUID
                         FROM DUAL
                      ) S
                   ON (T.ERD_MODEL_ID = S.ERD_MODEL_ID AND T.TABLE_UUID = S.TABLE_UUID)
                 WHEN MATCHED THEN UPDATE
                         SET T.SESSION_NM = ?
                           , T.USER_ID    = ?
                           , T.EXPIRES_AT = ?
                           , T.U_USR_ID   = ?
                           , T.U_AT       = ?
                       WHERE T.SESSION_NM = ?
                          OR T.EXPIRES_AT <= ?
                 WHEN NOT MATCHED THEN INSERT
                       (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
                       VALUES (S.ERD_MODEL_ID, S.TABLE_UUID, ?, ?, ?, ?, ?, ?, ?, 0)
                """, modelId, tableId, session, userId, untilTs, userId, now, session, now,
                    session, userId, untilTs, userId, now, userId, now);
        } catch (DuplicateKeyException e) {
            n = 0; // 같은 표를 다른 세션이 동시에 처음 표시했다 — 먼저 들어간 쪽이 이긴다
        }
        if (n > 0) {
            afterCommit(() -> refreshClaims(modelId));
            return new ErdClaimResult(true, session, userId, until.toString());
        }
        return holder(modelId, tableId)
                .map(h -> new ErdClaimResult(false, h.session(), h.userId(), h.expiresAt()))
                .orElseGet(() -> new ErdClaimResult(false, null, null, null));
    }

    /** 단계 1 모양(성공 여부만). */
    public boolean claim(String modelId, String tableId, String session, String userId, long ttlSeconds) {
        return claimFor(modelId, tableId, session, userId, ttlSeconds).ok();
    }

    /** 지금 그 표를 쥔 살아 있는 표시. 호출자 트랜잭션 연결로 읽는다. */
    private Optional<ErdClaimView> holder(String modelId, String tableId) {
        return jdbc.query("""
                SELECT TABLE_UUID
                     , SESSION_NM
                     , USER_ID
                     , EXPIRES_AT
                  FROM TB_MDM_ERD_CLAIM
                 WHERE ERD_MODEL_ID = ?
                   AND TABLE_UUID = ?
                   AND EXPIRES_AT > ?
                """, (rs, i) -> new ErdClaimView(rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getTimestamp(4).toInstant().toString()), modelId, tableId, Timestamp.from(Instant.now()))
                .stream().findFirst();
    }
```

`ErdEditService` 를 고친다.

1. `save` 의 마지막 줄 `return plain(commands.apply(modelId, r.getBaseRev(), me, session, source, list));` 를 `return plain(commands.apply(modelId, r.getBaseRev(), me, session, source, list, dryRun(r)));` 로 바꾸고, javadoc 끝에 ` dryRun 이면 판정만 한다(S2-15).` 를 붙인다.
2. `restore` 의 마지막 줄을 `return plain(commands.undo(modelId, r.getRev(), me, session, source, dryRun(r)));` 로 바꾼다.
3. `importModel` 의 첫 두 줄을 아래로 바꾼다.

```java
        String modelId = requireModelId(r);
        if (dryRun(r)) throw MdmErrors.invalid("import 는 dryRun 을 받지 않습니다. 차이는 compare kind=DB_DIFF 로 먼저 보세요");
        if (!isKind(r, "FROM_DB")) throw MdmErrors.invalid("import 의 kind 는 FROM_DB 입니다: " + r.getKind());
```

4. `importModel` 의 반환 두 줄을 바꾼다.

```java
        return plain(new ErdImportResult(res.applied(), res.rev(), res.rowVersion(), res.changes(), warnings, res.rejection(),
                res.applied() ? built.summary() : null));
```

5. `execute` 의 CLAIM 반환 줄과 주석을 바꾼다.

```java
                // S2-26: ok 와 상관없이 지금 그 표를 쥔 세션을 준다. OASIS 트랜잭션 연결로 쓰고, 허브는 커밋 뒤에 SSE 로 알린다(deferred 27).
                return plain(hub.claimFor(modelId, tableId, session, me, CLAIM_TTL_SECONDS));
```

6. `kind(r)` 아래에 넣는다.

```java
    private static boolean dryRun(ErdEditRequest r) {
        return Boolean.TRUE.equals(r.getDryRun());
    }
```

- [ ] **Step 7: 시험 통과 확인과 커밋**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest' --tests '*ErdCommandServiceTest' --tests '*ErdCoEditorGuardTest'`
Expected: `ErdStage2ContractTest` 4건 PASS. 나머지는 기존 건수 그대로 PASS.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStreamTest' --tests '*ErdEditOasisHttpTest' --tests '*ErdImportTest'`
Expected: 기존 건수 그대로 PASS 다(`claimReleaseAndPresenceThroughOasis` 는 `ok` 칸을 그대로 받는다. `ErdImportTest` 는 새 `rowVersion` 단언을 포함한다).

`dryRunRollsBackWithoutLogOrEvent` 의 HTTP 경로가 `UnexpectedRollbackException`(S001)으로 실패하면, dryRun 경로가 `Discard.run()` 대신 `status.setRollbackOnly()` 를 부른 것이다. 합류 경로는 savepoint 로만 되돌려야 한다.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(erd): 저장 결과·델타에 rowVersion, 시험 실행 dryRun, 거절 byUserId, CLAIM 응답에 쥔 세션

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 8: 실패하는 시험 작성 — SSE `version`**

`AT/ErdStage2ContractTest.java` 에 넣는다.

```java
    /** S2-12. 구독 직후(재전송 뒤) SUBSCRIBE 하나, 동작마다 커밋 뒤 하나. 값은 그때 view 와 같고 rev·명령 기록은 그대로다. */
    @Test
    void versionEventsFollowLifecycle() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        var q = c.open("mcm", "ui-a", 0, "owner");
        List<String> head = c.until(q, "version");
        assertThat(head.stream().filter(s -> s.startsWith("change|")).count()).as(head.toString()).isEqualTo(1); // 재전송이 먼저
        JsonNode sub = c.om.readTree(head.get(head.size() - 1).substring("version|".length()));
        assertThat(sub.path("reason").asText()).isEqualTo("SUBSCRIBE");
        assertThat(sub.path("userId").asText()).isEqualTo("owner");
        assertSameAsView(sub);

        c.call("execute", "owner", Map.of("modelId", "mcm", "kind", "ADD_EDITOR", "userId", "kim"));
        JsonNode added = c.next(q, "version", v -> v.path("reason").asText().equals("ADD_EDITOR"));
        assertThat(added.path("editors").toString()).isEqualTo("[\"kim\"]");
        assertThat(added.path("userId").asText()).isEqualTo("owner");
        assertSameAsView(added);

        c.call("execute", "owner", Map.of("modelId", "mcm", "kind", "REMOVE_EDITOR", "userId", "kim"));
        JsonNode removed = c.next(q, "version", v -> v.path("reason").asText().equals("REMOVE_EDITOR"));
        assertThat(removed.path("editors").size()).as("deleteById 가 flush 전이어도 같은 트랜잭션에서 내보낸 뒤 읽는다").isZero();
        assertSameAsView(removed);

        JsonNode view = c.call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        String ver = view.path("ver").asText();
        JsonNode unlock = c.call("unlock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", view.path("rowVersion").asLong()));
        long rvUnlocked = unlock.at("/data/result/rowVersion").asLong();
        JsonNode unlocked = c.next(q, "version", v -> v.path("reason").asText().equals("UNLOCK"));
        assertThat(nullish(unlocked.path("ownerId"))).isTrue();
        assertThat(unlocked.path("rowVersion").asLong()).isEqualTo(rvUnlocked);
        assertSameAsView(unlocked);

        JsonNode lock = c.call("lock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rvUnlocked));
        long rvLocked = lock.at("/data/result/rowVersion").asLong();
        JsonNode locked = c.next(q, "version", v -> v.path("reason").asText().equals("LOCK"));
        assertThat(locked.path("ownerId").asText()).isEqualTo("owner");
        assertSameAsView(locked);

        // 넘기기는 시험 환경에서 MDM005(담당자 조회 어댑터 없음) — 실패한 동작은 version 을 내지 않는다
        JsonNode handover = c.call("handover", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rvLocked, "newOwnerId", "lee"));
        assertThat(handover.at("/meta/code").asText()).as(handover.toString()).isEqualTo("MDM005");
        c.assertNone(q, "version", 700);

        // 확정: applyFrom 은 필수다(RuleConfirmService.parseApplyFrom, yyyy-MM-dd HH:mm:ss)
        JsonNode confirm = c.call("confirm", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rvLocked,
                "applyFrom", "2030-01-01 00:00:00", "warningsAcknowledged", true));
        assertThat(confirm.at("/data/result/ok").asBoolean()).as(confirm.toString()).isTrue();
        JsonNode confirmed = c.next(q, "version", v -> v.path("reason").asText().equals("CONFIRM"));
        assertThat(confirmed.path("status").asText()).isEqualTo("RELEASED");
        assertThat(confirmed.path("ver").asText()).isEqualTo(ver);
        assertSameAsView(confirmed);

        assertThat(rev()).as("버전 이벤트는 rev 를 올리지 않는다").isEqualTo(1);
        assertThat(logCount()).as("버전 이벤트는 명령 기록에 없다").isEqualTo(1);
    }

    void assertSameAsView(JsonNode ev) throws Exception {
        JsonNode v = c.call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        assertThat(ev.path("modelId").asText()).isEqualTo("mcm");
        assertThat(ev.path("ver").asText()).isEqualTo(v.path("ver").asText());
        assertThat(ev.path("status").asText()).isEqualTo(v.path("status").asText());
        assertThat(ev.path("ownerId").asText(null)).isEqualTo(v.path("ownerId").asText(null));
        assertThat(ev.path("editors")).isEqualTo(v.path("editors"));
        assertThat(ev.path("rowVersion").asLong()).isEqualTo(v.path("rowVersion").asLong());
        assertThat(ev.path("at").asText()).isNotBlank();
    }
```

- [ ] **Step 9: 시험이 실패하는지 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest.versionEventsFollowLifecycle'`
Expected: FAIL. `c.until(q, "version")` 이 "version 이벤트가 10초 안에 오지 않았습니다" 로 실패한다.

- [ ] **Step 10: 구현 — `ErdEventHub` 의 version, `ErdModelStore.flush`, `ErdEditService` 알림**

`ErdEventHub` 를 고친다. import 에 `com.dongkuk.dmes.mdm.common.version.VersionNumbers`, `java.math.BigDecimal` 을 더한다.

1. `Sub` 에 칸 두 개를 더하고 생성자를 바꾼다.

```java
        final String modelId;
        final String session;
        /** 구독한 사용자(SUBSCRIBE version 의 userId). 시험용 구독은 null. */
        final String userId;
        final SseEmitter emitter;
```

```java
        /** 재생 읽기 결과. 비우기 스레드가 큐보다 먼저 보낸다. */
        volatile ErdChangesView replay;
        /** 재생과 같이 읽은 버전 상태(SUBSCRIBE). 재생분 바로 뒤에 보낸다. */
        volatile ErdVersionEvent replayVersion;
```

```java
        Sub(String modelId, String session, String userId, SseEmitter emitter) {
            this.modelId = modelId;
            this.session = session;
            this.userId = userId;
            this.emitter = emitter;
        }
```

2. `subscribe` 의 `Sub sub = new Sub(modelId, session, emitter);` 를 `Sub sub = new Sub(modelId, session, userId, emitter);` 로, `attachForTest` 의 생성을 `new Sub(modelId, session, null, emitter)` 로 바꾼다.

3. `replay` 의 읽기 부분을 바꾼다. 재생 기록과 버전 상태를 같은 `dbRead` 한 번에서 차례로 읽는다(허브의 DB 읽기는 동시에 하나).

```java
    private void replay(Sub sub, long sinceRev) {
        try {
            record Read(ErdChangesView snapshot, ErdVersionEvent version) {}
            // 구독마다 버전 상태 하나(S2-12 SUBSCRIBE). 보내기는 재생분 바로 뒤, 큐(presence·claim·실시간 델타)보다 먼저다.
            Read read = dbRead(() -> new Read(commandsProvider.getObject().changesSince(sub.modelId, sinceRev),
                    versionNow(sub.modelId, "SUBSCRIBE", sub.userId)));
            Runnable pause = replayPauseForTest;
            if (pause != null) pause.run();
            synchronized (sub) {
                sub.replaySince = sinceRev;
                sub.replay = read.snapshot();
                sub.replayVersion = read.version();
                sub.replaying = false;
            }
            schedule(sub);
        } catch (RuntimeException e) {
            log.warn("ERD SSE 재생 실패 model={} session={} — 구독 해제", sub.modelId, sub.session, e);
            sub.dropped = true;
            pinger.execute(() -> drop(sub));
            completeLater(sub, e);
        }
    }
```

4. `drain` 의 재생 보내기 부분을 바꾼다.

```java
                    ErdChangesView replay = s.replay;
                    if (replay != null) {
                        s.replay = null;
                        sendReplay(s, replay, s.replaySince);
                        ErdVersionEvent version = s.replayVersion;
                        s.replayVersion = null;
                        if (version != null && !s.dropped) send(s, "version", version);
                        continue;
                    }
```

5. `// ── 접속자 ──` 줄 바로 위에 넣는다.

```java
    // ── 버전 이벤트(S2-12) ─────────────────────────────────────────────

    /**
     * 지금 버전 상태 — view(ver 없음)가 돌려줄 값과 같다: DRAFT 가 있으면 그것, 없으면 가장 높은 RELEASED. 버전 행이 없으면 null.
     * JdbcTemplate 으로 읽는다. 동작 뒤 이벤트는 호출자(ErdEditService)가 같은 트랜잭션 안에서 영속성 문맥을 내보낸 뒤 부른다 —
     * 엔티티는 네이티브 CAS 뒤에 낡은 값을 가질 수 있다. 구독 직후 이벤트는 읽기 스레드가 {@link #dbRead} 안에서 부른다.
     */
    public ErdVersionEvent versionNow(String modelId, String reason, String userId) {
        record Row(BigDecimal ver, String status, String ownerId, long rowVersion) {}
        List<Row> rows = jdbc.query("""
                SELECT VER
                     , STATUS
                     , OWNER_ID
                     , ROW_VERSION
                  FROM TB_MDM_ERD_MODEL_VER
                 WHERE ERD_MODEL_ID = ?
                   AND STATUS IN ('DRAFT', 'RELEASED')
                 ORDER BY CASE STATUS WHEN 'DRAFT' THEN 0 ELSE 1 END
                        , VER DESC
                """, (rs, i) -> new Row(rs.getBigDecimal(1), rs.getString(2), rs.getString(3), rs.getLong(4)), modelId);
        if (rows.isEmpty()) return null;
        Row v = rows.get(0);
        List<String> editors = jdbc.queryForList(
                "SELECT USER_ID FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ? ORDER BY USER_ID",
                String.class, modelId, v.ver());
        return new ErdVersionEvent(modelId, VersionNumbers.plain(v.ver()), v.status(), v.ownerId(), List.copyOf(editors),
                v.rowVersion(), reason, userId, Instant.now().toString());
    }

    /** 버전 이벤트를 커밋 뒤에(트랜잭션 밖이면 바로) 그 모델의 구독자 큐에 넣는다. 소켓 쓰기는 보내기 스레드가 한다. */
    public void publishVersion(ErdVersionEvent event) {
        afterCommit(() -> {
            for (Sub s : subs.getOrDefault(event.modelId(), List.of())) enqueue(s, Out.event("version", event));
        });
    }
```

`L/service/ErdModelStore.java` 의 `rev` 메서드 다음에 넣는다. import 에 `org.springframework.transaction.support.TransactionSynchronizationManager` 를 더한다.

```java
    /** 영속성 문맥의 쓰기를 DB 로 내보낸다. 같은 트랜잭션의 값을 JdbcTemplate 으로 읽기 전에 부른다(버전 이벤트 S2-12). */
    public void flush() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) em.flush();
    }
```

`ErdEditService` 를 고친다.

1. `execute` 의 첫 두 case 를 바꾼다.

```java
            case "ADD_EDITOR" -> {
                versions.addEditor(modelId, requireText(r.getUserId(), "userId", 50), me); // USER_ID 50자
                announce(modelId, "ADD_EDITOR");
            }
            case "REMOVE_EDITOR" -> {
                versions.removeEditor(modelId, requireText(r.getUserId(), "userId"), me);
                announce(modelId, "REMOVE_EDITOR");
            }
```

2. `lock`·`unlock`·`handover`·`confirm` 을 바꾼다. `confirm` 의 `applyFrom` 필수 입력은 그대로다.

```java
    public Map<String, Object> lock(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rv = ownership.acquire(ref(modelId, r.getVer()), rowVersion(r), currentUser.userId());
        announce(modelId, "LOCK");
        return Map.of("rowVersion", rv);
    }

    public Map<String, Object> unlock(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rv = ownership.release(ref(modelId, r.getVer()), rowVersion(r), currentUser.userId());
        announce(modelId, "UNLOCK");
        return Map.of("rowVersion", rv);
    }

    public Map<String, Object> handover(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rv = ownership.handover(ref(modelId, r.getVer()), rowVersion(r), currentUser.userId(),
                requireText(r.getNewOwnerId(), "newOwnerId"));
        announce(modelId, "HANDOVER");
        return Map.of("rowVersion", rv);
    }

    /** 소유자 직접 확정(계획 P8). 확정 검사는 공통 서비스가 ErdConfirmCheck 를 부른다. applyFrom 은 필수다(yyyy-MM-dd HH:mm:ss). */
    public Map<String, Object> confirm(ErdEditRequest r) {
        String modelId = requireModelId(r);
        VersionRef ref = ref(modelId, r.getVer());
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(r.getApplyFrom());
        stateService.confirm(new ConfirmCommand(ref, rowVersion(r), applyFrom, currentUser.userId(),
                Boolean.TRUE.equals(r.getWarningsAcknowledged())));
        announce(modelId, "CONFIRM");
        return Map.of("ok", true);
    }
```

3. `dryRun(r)` 아래에 넣는다.

```java
    /**
     * 버전 수명 주기 이벤트(S2-12). 동작이 끝난 같은 OASIS 트랜잭션 안에서 영속성 문맥을 내보내고 지금 상태를 읽어,
     * 커밋 뒤에 허브 전달 실행기로 보낸다. 동작이 예외로 끝나면 여기까지 오지 않으므로 보내지 않는다.
     */
    private void announce(String modelId, String reason) {
        store.flush();
        var event = hub.versionNow(modelId, reason, currentUser.userId());
        if (event != null) hub.publishVersion(event);
    }
```

- [ ] **Step 11: 시험 통과 확인과 커밋**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest' --tests '*ErdStreamTest' --tests '*ErdEditOasisHttpTest' --tests '*ErdVersionServiceTest'`
Expected: `ErdStage2ContractTest` 5건 PASS. `ErdStreamTest` 는 기존 건수 PASS 다(`freshSubscribeSendsHelloFirst` 의 첫 이벤트는 여전히 `hello` 이고, `version` 은 재전송 뒤에 온다).

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdEventHubQueueTest'`
Expected: 3건 PASS(시험용 구독은 재생을 하지 않으므로 `version` 을 받지 않는다).

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(erd): SSE version 이벤트 — 구독 직후와 확정·선점·해제·넘기기·편집자 추가·빼기 뒤 버전 상태

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 12: 실패하는 시험 작성 — `AT/ErdPresenceTouchTest.java`**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdPresence;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** MCP·CLI 시한 접속자(S2-11). MCP 는 SSE 를 구독하지 않으므로 요청이 접속자 항목을 만들거나 늘리고, 600초 뒤 핑 주기가 지운다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdPresenceTouchTest.KEY)
@ActiveProfiles("local")
class ErdPresenceTouchTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-presence-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    ErdTestClient c;

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        c = new ErdTestClient(port, KEY);
        hub.sweepPresence(Instant.now().plusSeconds(3600)); // 앞 시험이 남긴 시한 항목을 지운다
    }

    ErdPresence presence(String session) {
        return hub.presence("mcm").stream().filter(p -> p.session().equals(session)).findFirst().orElse(null);
    }

    /** Review Focus 4. */
    @Test
    void mcpWriteAppearsInPresenceAndExpires() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        versions.addEditor("mcm", "erd-mcp-a", "owner");
        var q = c.open("mcm", "ui-a", 1, "owner");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-a") != null);
        JsonNode saved = c.call("save", "erd-mcp-a", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-1a2b3c4d",
                "source", "MCP", "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"메모\"}}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
        JsonNode list = c.next(q, "presence", l -> ErdTestClient.entry(l, "claude-1a2b3c4d") != null);
        JsonNode e = ErdTestClient.entry(list, "claude-1a2b3c4d");
        assertThat(e.path("source").asText()).isEqualTo("MCP");
        assertThat(e.path("userId").asText()).isEqualTo("erd-mcp-a");
        assertThat(e.path("selectedTables").toString()).isEqualTo("[\"t-1\"]");
        assertThat(Duration.between(Instant.parse(e.path("at").asText()), Instant.parse(e.path("expiresAt").asText())))
                .isEqualTo(Duration.ofSeconds(600));
        assertThat(ErdTestClient.nullish(ErdTestClient.entry(list, "ui-a").path("expiresAt"))).isTrue(); // SSE 항목은 만료가 없다
        // 600초가 지난 뒤의 핑 주기: 시한 항목만 지우고 다시 방송한다
        hub.sweepPresence(Instant.now().plusSeconds(601));
        c.next(q, "presence", l -> ErdTestClient.entry(l, "claude-1a2b3c4d") == null && ErdTestClient.entry(l, "ui-a") != null);
        assertThat(presence("claude-1a2b3c4d")).isNull();
        assertThat(presence("ui-a")).isNotNull();
        // 지울 것이 없으면 방송하지 않는다
        hub.sweepPresence(Instant.now().plusSeconds(601));
        c.assertNone(q, "presence", 700);
    }

    @Test
    void readsExtendAndClaimsShapeSelectedTables() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addTable\",\"id\":\"t-2\",\"phys\":\"TB_B\",\"logical\":\"비\"}]"));
        Map<String, Object> read = Map.of("modelId", "mcm", "session", "claude-r", "source", "MCP");
        c.call("view", "erd-mcp-a", read);
        ErdPresence first = presence("claude-r");
        assertThat(first).isNotNull();
        assertThat(first.source()).isEqualTo("MCP");
        assertThat(first.selectedTables()).isEmpty();
        assertThat(first.expiresAt()).isNotNull();
        // UI 출처는 시한 항목을 만들지 않는다(SSE 구독이 접속자를 만든다)
        c.call("view", "owner", Map.of("modelId", "mcm", "session", "ui-x", "source", "UI"));
        assertThat(presence("ui-x")).isNull();
        // 작업 중 표시는 그 세션의 표를 넣는다
        JsonNode claim = c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-2",
                "session", "claude-r", "source", "MCP"));
        assertThat(claim.at("/data/result/ok").asBoolean()).as(claim.toString()).isTrue();
        assertThat(presence("claude-r").selectedTables()).containsExactly("t-2");
        // 읽기는 표 목록을 바꾸지 않고 만료만 늘린다
        Thread.sleep(1100);
        c.call("view", "erd-mcp-a", read);
        ErdPresence later = presence("claude-r");
        assertThat(later.selectedTables()).containsExactly("t-2");
        assertThat(Instant.parse(later.expiresAt())).isAfter(Instant.parse(first.expiresAt()));
        // 해제하면 빠진다
        c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "RELEASE", "tableId", "t-2", "session", "claude-r",
                "source", "MCP"));
        assertThat(presence("claude-r").selectedTables()).isEmpty();
        // SSE 로 붙은 세션이면 시한 항목을 만들지 않는다
        var q = c.open("mcm", "claude-s", 1, "erd-mcp-b");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "claude-s") != null);
        c.call("view", "erd-mcp-b", Map.of("modelId", "mcm", "session", "claude-s", "source", "MCP"));
        assertThat(presence("claude-s").expiresAt()).isNull();
        // 시험 실행은 접속자 표시를 바꾸지 않는다
        versions.addEditor("mcm", "erd-mcp-a", "owner");
        c.call("save", "erd-mcp-a", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-d", "source", "MCP", "dryRun", true,
                "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"메모\"}}]"));
        assertThat(presence("claude-d")).isNull();
    }
}
```

- [ ] **Step 13: 시험이 실패하는지 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdPresenceTouchTest'`
Expected: 컴파일 실패. `ErdEventHub.sweepPresence(Instant)` 가 없다.

- [ ] **Step 14: 구현 — 시한 접속자(touch·touchClaims·sweep)**

`ErdEventHub` 를 고친다. import 에 `java.util.HashSet`, `java.util.Set`, `java.util.TreeMap`, `java.util.TreeSet` 을 더한다.

1. 상수 `QUEUE_CAP` 아래에 넣는다.

```java
    /** MCP·CLI 시한 접속자의 수명(S2-11). 작업 중 표시 TTL(ErdEditService.CLAIM_TTL_SECONDS)과 같다. */
    static final long PRESENCE_TTL_SECONDS = 600;
```

2. `presence` 맵 선언 아래에 넣는다.

```java
    /** MCP·CLI 시한 항목의 재료(S2-11). written = 마지막 반영 쓰기가 건드린 표, claimed = 그 세션의 작업 중 표시(표 → 만료 시각). */
    private record Timed(List<String> written, Map<String, Instant> claimed) {}

    /** 키는 presence 와 같다. 시한 항목을 만들고 지우는 일은 {@link #timedLock} 안에서 한다. */
    private final Map<String, Timed> timed = new ConcurrentHashMap<>();
    private final Object timedLock = new Object();
```

3. `pingAll` 을 바꾼다. 정리에서 난 예외가 주기 작업을 멈추지 않게 잡는다(`scheduleAtFixedRate` 는 예외가 나면 다음 실행을 하지 않는다).

```java
    private void pingAll() {
        try {
            sweepPresence(Instant.now());
        } catch (RuntimeException e) {
            log.warn("ERD 시한 접속자 정리 실패", e);
        }
        Map<String, Object> body = Map.of("at", Instant.now().toString());
        subs.values().forEach(list -> list.forEach(s -> enqueue(s, Out.event("ping", body))));
    }
```

4. `broadcastPresence` 아래에 넣는다.

```java
    /** 시한 접속자를 만드는 출처. UI 는 SSE 구독이 접속자를 만든다. */
    public static boolean isTimedSource(String source) {
        return "MCP".equals(source) || "CLI".equals(source);
    }

    /**
     * MCP·CLI 요청의 시한 접속자(S2-11). touchedTables 가 null 이면 읽기다 — 표 목록은 그대로 두고 만료만 늘린다. 반영된 쓰기는
     * 커밋 뒤 콜백에서 건드린 표를 넘긴다(DB 를 읽지 않는다). 같은 모델·세션의 SSE 구독이 있으면 아무것도 하지 않는다.
     */
    public void touch(String modelId, String session, String userId, String source, List<String> touchedTables) {
        touchTimed(modelId, session, userId, source,
                touchedTables == null ? null : List.copyOf(new TreeSet<>(touchedTables)), null);
    }

    /** CLAIM·RELEASE 뒤: 그 세션의 작업 중 표시 부분을 다시 정한다. claims 는 호출자가 같은 트랜잭션 연결로 읽은 그 모델의 목록이다. */
    public void touchClaims(String modelId, String session, String userId, String source, List<ErdClaimView> claims) {
        Map<String, Instant> mine = new TreeMap<>();
        for (ErdClaimView cl : claims) {
            if (cl.session().equals(session)) mine.put(cl.tableId(), Instant.parse(cl.expiresAt()));
        }
        touchTimed(modelId, session, userId, source, null, mine);
    }

    /** 새로 생기거나 selectedTables 가 바뀌면 방송한다. 만료만 늘면 방송하지 않는다. */
    private void touchTimed(String modelId, String session, String userId, String source,
                            List<String> written, Map<String, Instant> claimed) {
        if (session == null || session.isBlank() || !isTimedSource(source)) return;
        if (subs.getOrDefault(modelId, List.of()).stream().anyMatch(s -> !s.dropped && s.session.equals(session))) return;
        String k = key(modelId, session);
        Instant now = Instant.now();
        boolean changed;
        synchronized (timedLock) {
            Timed old = timed.getOrDefault(k, new Timed(List.of(), Map.of()));
            Timed t = new Timed(written != null ? written : old.written(), claimed != null ? claimed : old.claimed());
            timed.put(k, t);
            TreeSet<String> tables = new TreeSet<>(t.written());
            t.claimed().forEach((table, until) -> {
                if (until.isAfter(now)) tables.add(table);
            });
            List<String> selected = List.copyOf(tables);
            ErdPresence prev = presence.put(k, new ErdPresence(session, userId, source, null, selected, now.toString(),
                    now.plusSeconds(PRESENCE_TTL_SECONDS).toString()));
            changed = prev == null || prev.expiresAt() == null || !prev.selectedTables().equals(selected);
        }
        if (changed) broadcastPresence(modelId);
    }

    /**
     * 시한 접속자 정리(S2-11). 핑 주기(15초)가 지금 시각으로 부른다. expiresAt 이 now 이전인 항목을 지우고, 지운 것이 있는 모델에만
     * presence 를 다시 방송한다(지운 것이 없으면 아무것도 보내지 않는다). 시험은 600초 뒤 시각을 넣어 부른다.
     */
    public void sweepPresence(Instant now) {
        Set<String> models = new HashSet<>();
        synchronized (timedLock) {
            for (Map.Entry<String, ErdPresence> e : presence.entrySet()) {
                String exp = e.getValue().expiresAt();
                if (exp == null || Instant.parse(exp).isAfter(now)) continue;
                if (presence.remove(e.getKey(), e.getValue())) {
                    timed.remove(e.getKey());
                    models.add(e.getKey().substring(0, e.getKey().indexOf('\u0000')));
                }
            }
        }
        models.forEach(this::broadcastPresence);
    }
```

`ErdCommandService.applyInternal` 을 고친다(세 곳).

1. `Long rowVersion = null;` 다음 줄에 `List<String> touched = List.of();` 를 넣는다.
2. `for (ErdCommand inv : applied.inverse()) inverse.add(typed(ErdCommand.class, inv));` 다음 줄에 `touched = tablesOf(applied.changes());` 를 넣는다(Step 15 에서 엔진 값으로 바꾼다).
3. 커밋 뒤 콜백을 바꾼다.

```java
            ErdDelta delta = new ErdDelta(modelId, newRev, userId, session, source, rowVersion, List.copyOf(changes));
            List<String> touchedTables = touched;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    hub.publish(delta);
                    // MCP·CLI 시한 접속자(S2-11) — 반영된 쓰기가 건드린 표. 허브가 UI 출처를 거른다. DB 를 읽지 않는다.
                    hub.touch(modelId, session, userId, source, touchedTables);
                }
            });
```

`ErdEditService` 를 고친다.

1. `view` 를 둘로 나눈다. 지금의 `public Object view(ErdEditRequest r) {` 와 다음 줄 `String modelId = requireModelId(r);` 를 `private Object viewOf(String modelId, ErdEditRequest r) {` 한 줄로 바꾸고, 그 위에 새 `view` 를 둔다. 모델이 없으면 `viewOf` 가 먼저 던지므로 없는 모델의 항목을 만들지 않는다.

```java
    public Object view(ErdEditRequest r) {
        String modelId = requireModelId(r);
        Object out = viewOf(modelId, r);
        touch(modelId, r, currentUser.userId());
        return out;
    }
```

2. `dbDiff` 의 반환 줄을 바꾼다.

```java
        ErdDbDiffView out = new ErdDbDiffView(modelId, rev, schema, ErdDbDiff.diff(m, metaReader.read(schema)));
        touch(modelId, r, currentUser.userId());
        return plain(out);
```

3. `save`·`restore` 의 반환을 바꾼다(반영된 쓰기는 `ErdCommandService` 가 커밋 뒤 표와 함께 넣는다).

```java
        ErdApplyResult res = commands.apply(modelId, r.getBaseRev(), me, session, source, list, dryRun(r));
        if (!res.applied()) touch(modelId, r, me);
        return plain(res);
```

```java
        ErdApplyResult res = commands.undo(modelId, r.getRev(), me, session, source, dryRun(r));
        if (!res.applied()) touch(modelId, r, me);
        return plain(res);
```

4. `importModel` 의 `List<ErdWarning> warnings = new ArrayList<>(res.warnings());` 앞에 `if (!res.applied()) touch(modelId, r, me);` 를 넣는다.
5. `execute` 의 CLAIM·RELEASE 를 바꾸고, switch 뒤 `return Map.of("ok", true);` 앞에 `touch(modelId, r, me);` 를 넣는다.

```java
            case "CLAIM" -> {
                // 칸 크기(TABLE_UUID 50, SESSION_NM 100)를 넘으면 ORA-12899(S001) 대신 입력 오류. DB 를 읽기 전에 본다.
                String tableId = requireText(r.getTableId(), "tableId", 50);
                String session = requireMax(session(r, me), "session", 100);
                store.rev(modelId); // 없는 모델이면 FK 오류 대신 ERD_MODEL_NOT_FOUND
                // S2-26: ok 와 상관없이 지금 그 표를 쥔 세션을 준다. OASIS 트랜잭션 연결로 쓰고, 허브는 커밋 뒤에 SSE 로 알린다(deferred 27).
                var res = hub.claimFor(modelId, tableId, session, me, CLAIM_TTL_SECONDS);
                touchClaims(modelId, r, me);
                return plain(res);
            }
            case "RELEASE" -> {
                String tableId = requireText(r.getTableId(), "tableId");
                hub.release(modelId, tableId, session(r, me)); // CLAIM 과 같다
                touchClaims(modelId, r, me);
                return Map.of("ok", true);
            }
```

6. `announce` 아래에 넣는다.

```java
    /**
     * MCP·CLI 요청의 시한 접속자(S2-11). 세션 이름을 실어 온 요청만, 시험 실행(dryRun)은 빼고. 읽기라 표 목록은 바꾸지 않는다 —
     * 반영된 쓰기의 표는 ErdCommandService 가 커밋 뒤에 넣는다. UI 출처는 허브가 거른다.
     */
    private void touch(String modelId, ErdEditRequest r, String me) {
        if (!notBlank(r.getSession()) || dryRun(r)) return;
        hub.touch(modelId, r.getSession().trim(), me, sourceOrNull(r), null);
    }

    /** CLAIM·RELEASE 뒤: 같은 트랜잭션 연결로 그 모델의 표시 목록을 읽어(방금 쓴 행이 보인다) 작업 중 표시 부분을 다시 정한다. */
    private void touchClaims(String modelId, ErdEditRequest r, String me) {
        String source = sourceOrNull(r);
        if (!notBlank(r.getSession()) || !ErdEventHub.isTimedSource(source)) return;
        hub.touchClaims(modelId, r.getSession().trim(), me, source, hub.claims(modelId));
    }

    /** 접속자 표시용 출처. 읽기 액션은 source 를 검사하지 않으므로 모르는 값이면 null(시한 항목을 만들지 않는다). */
    private static String sourceOrNull(ErdEditRequest r) {
        String s = notBlank(r.getSource()) ? r.getSource().trim().toUpperCase(Locale.ROOT) : "UI";
        return SOURCES.contains(s) ? s : null;
    }
```

- [ ] **Step 15: 시험 통과 확인과 커밋**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdPresenceTouchTest' --tests '*ErdStage2ContractTest' --tests '*ErdStreamTest' --tests '*ErdEditOasisHttpTest'`
Expected: `ErdPresenceTouchTest` 2건, `ErdStage2ContractTest` 5건 PASS. 나머지는 기존 건수 PASS.

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdEventHubQueueTest'`
Expected: 3건 PASS. 핑 주기의 정리는 지운 항목이 없으면 아무것도 보내지 않으므로 이벤트 수가 그대로다.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(erd): MCP·CLI 시한 접속자 — 요청이 접속자 항목을 만들거나 늘리고 600초 뒤 핑 주기에 지움

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 16: (BE1 Task 2 머지 뒤) 접속자 `selectedTables` 를 엔진의 `touchedTables` 로**

README 의존 [BE1:Task 2 → BE2:Task 4]. 이 단계 전에 dev 에 BE1 Task 2 가 있는지 본다(워크트리 루트에서).

```bash
/usr/bin/git show dev:src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/engine/ApplyOutcome.java | grep -n "touchedTables"
```

Expected: `List<String> touchedTables` 가 든 줄 하나. 없으면 이 단계를 멈추고 조정 세션에 알린다. 있으면 `/usr/bin/git rebase dev` 를 한다.

`AT/ErdPresenceTouchTest.java` 에 실패하는 시험을 넣는다. 키 변경은 표·컬럼 델타를 만들지 않으므로 단계 1 방식(`tablesOf`)으로는 표가 빠진다.

```java
    /** deferred 25: 키·관계·컬럼 삭제처럼 표 델타가 없는 변경도 그 표를 접속자 표시에 넣는다(엔진 touchedTables). */
    @Test
    void mcpKeyChangeTouchesItsTable() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"COL_A\",\"logical\":\"가\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        versions.addEditor("mcm", "erd-mcp-a", "owner");
        JsonNode saved = c.call("save", "erd-mcp-a", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-k", "source", "MCP",
                "commandsJson", "[{\"op\":\"addKey\",\"id\":\"k-1\",\"table\":\"t-1\",\"kind\":\"UK\",\"name\":\"UX_TB_A_1\",\"columns\":[\"c-1\"]}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
        ErdTestClient.await(() -> presence("claude-k") != null, "시한 항목이 생기지 않았다");
        assertThat(presence("claude-k").selectedTables()).containsExactly("t-1");
    }
```

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdPresenceTouchTest.mcpKeyChangeTouchesItsTable'`
Expected: FAIL. `selectedTables` 가 빈 목록이다.

`ErdCommandService.applyInternal` 의 `touched = tablesOf(applied.changes());` 를 `touched = applied.touchedTables();` 로 바꾼다.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdConcurrentSaveHttpTest' --tests '*ErdPresenceTouchTest' --tests '*ErdStage2ContractTest'`
Expected: `ErdConcurrentSaveHttpTest` 6건(deferred 27 시험 — 머지 전마다 다시 돈다), `ErdPresenceTouchTest` 3건, `ErdStage2ContractTest` 5건 PASS.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdCommandServiceTest' --tests '*ErdStreamTest' --tests '*ErdEditOasisHttpTest' --tests '*ErdImportTest'`
Expected: 모두 기존 건수 그대로 PASS.

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdEventHubQueueTest'`
Expected: 3건 PASS.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(erd): 시한 접속자 표시에 엔진 touchedTables — 키·관계·컬럼 삭제도 그 표를 표시

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

---

### Task 5: 다시 가져오기 반영(`import kind=APPLY_DIFF`), 미리보기 타입 대응, CLAIMED 넓히기, 실패 경로 시험

**Files:**
- Modify: `L/dto/ErdEditRequest.java`(itemsJson)
- Create: `L/dto/ErdDiffApplyResult.java`
- Modify: `L/service/ErdCommandService.java`(applyDiff, 잠근 뒤 묶음 만들기, CLAIMED), `L/service/ErdEditService.java`(APPLY_DIFF, 미리보기, `compare` plain)
- Modify: `src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn`(문서 글만, 액션 수 15 그대로)
- Create: `AT/ErdApplyDiffTest.java`, `LT/service/ErdPreviewColumnTest.java`
- Modify: `AT/ErdStage2ContractTest.java`(CLAIMED·tokens), `AT/ErdEditOasisHttpTest.java`(deferred 36, 여유가 있으면)

**Interfaces:**
- Consumes (BE1, 이 Task 착수 전에 dev 에 있어야 한다):
  - Task 1: `ErdTypeMapping.physicalOf(String dataType, Integer length, Integer scale) : ErdTypeMapping.PhysType(dataType, length, scale)`.
  - Task 2: `ApplyOutcome.Applied.touchedTables()`.
  - Task 3: `ErdDiffApplier.build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev) : Built(Restore restore, Summary summary, List<String> staleIds)`(5인자, 새 id 몸통은 UUID. 6인자 `Supplier<String> idSource` 판은 시험용이고 공급자는 접두어 없는 몸통을 준다), `ErdDiffApplier.Summary`. `staleIds` 에는 지금 차이 목록에 없는 id 와 자식·부모를 풀 수 없는 `FK_ADDED` id 가 함께 든다.
  - Task 4: `Opts`, `withUser`, `claimedWarnings`, `touched` 변수.
- Produces:
  - `record ErdDiffApplyResult(boolean applied, long rev, Long rowVersion, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection, ErdDiffApplier.Summary summary)`
  - `ErdCommandService.applyDiff(String modelId, long baseRev, String userId, String session, String source, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds) : ErdDiffApplyResult`
  - OASIS `import kind=APPLY_DIFF {modelId, baseRev, itemsJson, session, source}` → `data.result` = `ErdDiffApplyResult`(README 정본 JSON)
  - `compare`(kind 없음)의 결과가 `plain()` 을 거친다. 미리보기 타입은 `ErdTypeMapping` 을 따른다.

이 Task 에서 정하는 규칙:

| 항목 | 규칙 |
|---|---|
| 입력 | `itemsJson` 은 문자열 id 의 JSON 배열이다. 빈 글자 항목은 MDM021, 겹치는 id 는 하나로 친다. 1~500개가 아니면 MDM021. `baseRev` 가 없으면 MDM021. `dryRun:true` 는 MDM021(Task 4) |
| 잠금 밖 | 스키마 메타(`ErdDbMetaReader.read`)와 사전(`dictionaries.load()`)을 잠그기 전에 한 번씩 읽는다. 사전 하나를 차이 만들기와 엔진에 같이 쓴다 |
| 잠금 안 | `applyInternal` 의 `save` 와 같은 순서(잠금 → `baseRev` → DRAFT·편집자 → 표지)를 지난 뒤, 잠근 모델로 `ErdDiffApplier.build` 를 부른다. 모델에 표가 없으면 INVALID("먼저 import kind=FROM_DB 로 가져오세요"). 낡은 id 가 하나라도 있으면 INVALID(README 정본 모양: `elementId` = 첫 낡은 id, `property` = `itemsJson`, `choices` = 낡은 id 전부). 둘 다 `Discard.run()` 으로 되돌리고 아무것도 쓰지 않는다 |
| 넣기 | `restore` 하나, `sinceRev` = 요청 `baseRev`, `allowRestore=true`. 명령 기록에는 그 `restore` 하나를 남긴다. 되돌리기(`restore` 액션)로 되돌릴 수 있다 |
| 결과 | 반영이면 `summary` 는 빌더 값, 거절이면 null. `rowVersion` 은 Task 4 규칙 그대로 |
| 미리보기 | `previewStatus` 의 임시 컬럼 타입을 `ErdTypeMapping.physicalOf` 로 만든다(`copyDomain` 과 같은 대응, S2-3) |
| CLAIMED | 경고 대상 표를 엔진 `touchedTables` 로 넓힌다(deferred 25). 다이어그램 명령은 표 경고 대상이 아니다(단계 1 그대로) |

- [ ] **Step 1: 착수 조건 확인과 rebase**

```bash
/usr/bin/git show dev:src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/standard/ErdTypeMapping.java | grep -n "physicalOf\|record PhysType"
/usr/bin/git show dev:src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/importing/ErdDiffApplier.java | grep -n "public static Built build\|record Summary\|record Built\|idSource"
```

Expected: 두 파일이 있고 위 서명이 보인다. 하나라도 없으면 멈추고 조정 세션에 알린다. 있으면 `/usr/bin/git rebase dev` 를 한다.

BE1 과 맞춘 사실(README 엔진 절): 서비스는 5인자 `build` 를 부른다(새 id 몸통은 UUID, 접두어는 빌더가 붙인다). `PhysType` 은 `ErdTypeMapping` 안의 레코드라 `ErdTypeMapping.PhysType` 으로 쓴다. 위 grep 에서 둘 중 하나라도 다르면 멈추고 조정 세션에 알린다.

- [ ] **Step 2: 실패하는 시험 작성 — `AT/ErdApplyDiffTest.java`**

시험 PDB(TPL_EMPTY 복제)에는 MDMAPUSER 만 있으므로 `ErdImportTest` 처럼 MDM 스키마를 가져온 뒤, 모델에서 컬럼 길이를 바꿔 `COLUMN_CHANGED` 를 만든다. DB 는 고치지 않는다.

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static com.dongkuk.dmes.mdm.dma.erdEdit.ErdTestClient.nullish;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 다시 가져오기 반영(S2-14) — BPMN import 흐름까지 HTTP 로 태운다. 시험 PDB 의 MDMAPUSER 를 가져와 모델만 바꿔 차이를 만든다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdApplyDiffTest.KEY)
@ActiveProfiles("local")
class ErdApplyDiffTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-applydiff-key";
    static final String CHANGED = "COLUMN_CHANGED:TB_MDM_ERD_CLAIM.SESSION_NM";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    ErdTestClient c;

    @BeforeEach
    void clean() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        c = new ErdTestClient(port, KEY);
        assertThat(c.call("reg", "owner", Map.of("modelId", "mdm", "moduleId", "mdm", "schemaName", "MDMAPUSER", "modelName", "MDM"))
                .at("/meta/success").asBoolean()).isTrue();
    }

    long rev() {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mdm'", Long.class);
    }

    int logCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm'", Integer.class);
    }

    JsonNode model() throws Exception {
        return c.om.readTree(c.call("view", "owner", Map.of("modelId", "mdm")).at("/data/result/model").asText());
    }

    static String columnId(JsonNode model, String table, String column) {
        String tid = null;
        for (var it = model.path("tables").fields(); it.hasNext(); ) {
            var e = it.next();
            if (e.getValue().path("phys").asText().equals(table)) tid = e.getKey();
        }
        for (var it = model.path("columns").fields(); it.hasNext(); ) {
            var e = it.next();
            if (e.getValue().path("table").asText().equals(tid) && e.getValue().path("phys").asText().equals(column)) return e.getKey();
        }
        throw new AssertionError("컬럼 없음: " + table + "." + column);
    }

    List<String> diffIds() throws Exception {
        List<String> ids = new ArrayList<>();
        c.call("compare", "owner", Map.of("modelId", "mdm", "kind", "DB_DIFF")).at("/data/result/items")
                .forEach(i -> ids.add(i.path("id").asText()));
        return ids;
    }

    JsonNode applyDiff(long baseRev, List<String> ids) throws Exception {
        return c.call("import", "owner", Map.of("modelId", "mdm", "kind", "APPLY_DIFF", "baseRev", baseRev,
                "session", "ui-owner", "source", "UI", "itemsJson", c.om.writeValueAsString(ids)));
    }

    /** 가져오기(rev 1) 뒤 모델에서 SESSION_NM 길이를 하나 줄인다(rev 2, 세션 sessionNm). 원래 길이를 돌려준다. */
    int importAndShrink(String sessionNm) throws Exception {
        JsonNode imported = c.call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", 0,
                "session", "ui-owner", "source", "UI"));
        assertThat(imported.at("/data/result/applied").asBoolean()).as(imported.toString()).isTrue();
        JsonNode m = model();
        String cid = columnId(m, "TB_MDM_ERD_CLAIM", "SESSION_NM");
        int len = m.at("/columns/" + cid + "/length").asInt();
        JsonNode saved = c.call("save", "owner", Map.of("modelId", "mdm", "baseRev", 1, "session", sessionNm, "source", "UI",
                "commandsJson", "[{\"op\":\"updateColumn\",\"id\":\"" + cid + "\",\"set\":{\"length\":" + (len - 1) + "}}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
        assertThat(diffIds()).contains(CHANGED);
        return len;
    }

    /** Review Focus 5 의 뒤쪽. 낡은 id 를 섞으면 INVALID 이고 아무것도 들어가지 않는다. 고친 목록은 restore 하나로 들어간다. */
    @Test
    void applyDiffRejectsStaleItemIds() throws Exception {
        int len = importAndShrink("ui-owner");                                                     // rev 2
        int logs = logCount();
        JsonNode stale = applyDiff(2, List.of(CHANGED, "COLUMN_ADDED:TB_X.Y")).at("/data/result");
        assertThat(stale.path("applied").asBoolean()).as(stale.toString()).isFalse();
        assertThat(stale.at("/rejection/code").asText()).isEqualTo("INVALID");
        assertThat(stale.at("/rejection/elementId").asText()).isEqualTo("COLUMN_ADDED:TB_X.Y");
        assertThat(stale.at("/rejection/property").asText()).isEqualTo("itemsJson");
        assertThat(stale.at("/rejection/choices").toString()).isEqualTo("[\"COLUMN_ADDED:TB_X.Y\"]");
        assertThat(stale.at("/rejection/message").asText()).contains("1개");
        assertThat(nullish(stale.path("summary"))).isTrue();
        assertThat(nullish(stale.path("rowVersion"))).isTrue();
        assertThat(rev()).isEqualTo(2);
        assertThat(logCount()).isEqualTo(logs);
        String cid = columnId(model(), "TB_MDM_ERD_CLAIM", "SESSION_NM");
        assertThat(model().at("/columns/" + cid + "/length").asInt()).isEqualTo(len - 1);

        JsonNode ok = applyDiff(2, List.of(CHANGED)).at("/data/result");
        assertThat(ok.path("applied").asBoolean()).as(ok.toString()).isTrue();
        assertThat(ok.path("rev").asLong()).isEqualTo(3);
        assertThat(ok.path("rowVersion").asLong()).isEqualTo(jdbc.queryForObject(
                "SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mdm' AND STATUS = 'DRAFT'", Long.class));
        assertThat(ok.at("/summary/items").asInt()).isEqualTo(1);
        assertThat(ok.at("/summary/columnsChanged").asInt()).isEqualTo(1);
        assertThat(model().at("/columns/" + cid + "/length").asInt()).isEqualTo(len);
        assertThat(diffIds()).doesNotContain(CHANGED);
        assertThat(jdbc.queryForObject("SELECT CMD_JSON FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm' AND REV = 3", String.class))
                .contains("\"op\":\"restore\"");
        // 반영도 변경 기록의 rev 하나라 되돌릴 수 있다
        JsonNode undone = c.call("restore", "owner", Map.of("modelId", "mdm", "rev", 3, "session", "ui-owner", "source", "UI"));
        assertThat(undone.at("/data/result/applied").asBoolean()).as(undone.toString()).isTrue();
        assertThat(model().at("/columns/" + cid + "/length").asInt()).isEqualTo(len - 1);
    }

    /** restore 의 sinceRev 는 요청 baseRev 다 — 차이를 읽은 뒤의 편집을 조용히 덮지 않는다. */
    @Test
    void applyDiffConflictsWithEditAfterBaseRev() throws Exception {
        importAndShrink("ui-other");                                                               // rev 2
        JsonNode r = applyDiff(1, List.of(CHANGED)).at("/data/result");
        assertThat(r.path("applied").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.at("/rejection/code").asText()).isEqualTo("CONFLICT");
        assertThat(r.at("/rejection/byRev").asLong()).isEqualTo(2);
        assertThat(r.at("/rejection/byUserId").asText()).isEqualTo("owner");
        assertThat(rev()).isEqualTo(2);
    }

    @Test
    void applyDiffNeedsImportedModelAndValidItems() throws Exception {
        JsonNode empty = applyDiff(0, List.of("TABLE_ADDED:TB_MDM_ERD_CLAIM")).at("/data/result");
        assertThat(empty.at("/rejection/code").asText()).as(empty.toString()).isEqualTo("INVALID");
        assertThat(empty.at("/rejection/message").asText() + empty.at("/rejection/hint").asText()).contains("FROM_DB");
        assertThat(rev()).isZero();
        Map<String, Object> base = new HashMap<>(Map.of("modelId", "mdm", "kind", "APPLY_DIFF", "baseRev", 0));
        assertThat(c.call("import", "owner", base).at("/meta/code").asText()).isEqualTo("MDM021");          // itemsJson 없음
        for (String bad : List.of("[]", "{}", "[\"\"]", "[1]", "oops")) {
            base.put("itemsJson", bad);
            assertThat(c.call("import", "owner", base).at("/meta/code").asText()).as(bad).isEqualTo("MDM021");
        }
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 501; i++) many.add("COLUMN_ADDED:TB_X.C" + i);
        base.put("itemsJson", c.om.writeValueAsString(many));
        assertThat(c.call("import", "owner", base).at("/meta/code").asText()).isEqualTo("MDM021");
        base.put("itemsJson", "[\"TABLE_ADDED:TB_X\"]");
        base.put("dryRun", true);
        assertThat(c.call("import", "owner", base).at("/meta/code").asText()).isEqualTo("MDM021");
    }
}
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdApplyDiffTest'`
Expected: FAIL. 세 시험 모두 `import` 가 `kind=APPLY_DIFF` 를 MDM021("import 의 kind 는 FROM_DB 입니다")로 막아 `/data/result` 가 비어 있다(`applied` 단언, `rejection/code` 단언에서 실패). `applyDiffNeedsImportedModelAndValidItems` 의 첫 단언이 먼저 실패한다.

- [ ] **Step 4: 구현 — 요청 칸, 결과 레코드, `ErdCommandService.applyDiff`**

`L/dto/ErdEditRequest.java`: `kind` 주석의 `import: FROM_DB` 를 `import: FROM_DB·APPLY_DIFF` 로 바꾸고, `private String commandsJson;` 다음에 칸을 더한다.

```java
    /** import kind=APPLY_DIFF 의 고른 차이 항목 id(compare kind=DB_DIFF 의 items[].id) JSON 배열 문자열. */
    private String itemsJson;
```

getter `public String getItemsJson() { return itemsJson; }` 와 setter `public void setItemsJson(String v) { this.itemsJson = v; }` 를 `commandsJson` 의 것 다음에 넣는다.

`L/dto/ErdDiffApplyResult.java`(새):

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDiffApplier;
import java.util.List;

/** import kind=APPLY_DIFF 응답(README S2-14) = ErdApplyResult 칸(dryRun 없음) + summary. 거절이면 summary 는 null 이다. */
public record ErdDiffApplyResult(boolean applied, long rev, Long rowVersion, List<ErdChange> changes, List<ErdWarning> warnings,
                                 ErdRejection rejection, ErdDiffApplier.Summary summary) {

    public static ErdDiffApplyResult of(ErdApplyResult r, ErdDiffApplier.Summary summary) {
        return new ErdDiffApplyResult(r.applied(), r.rev(), r.rowVersion(), r.changes(), r.warnings(), r.rejection(),
                r.applied() ? summary : null);
    }
}
```

`ErdCommandService` 를 고친다. import 에 `com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta`, `com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiffApplyResult`, `com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDiffApplier`, `com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary`, `java.util.concurrent.atomic.AtomicReference`, `java.util.function.Function` 을 더한다.

1. Task 4 의 `Opts` 레코드 전체를 아래로 바꾸고, 그 위에 `LockedBuild` 를 둔다.

```java
    /** 잠근 모델로 만든 묶음(APPLY_DIFF). rejection 이 있으면 restore 는 null 이다. */
    private record LockedBuild(ErdCommand.Restore restore, ErdRejection rejection) {
        static LockedBuild rejected(ErdRejection r) {
            return new LockedBuild(null, r);
        }
    }

    /**
     * 경로별 선택. 클라이언트 명령·되돌리기·첫 가져오기·다시 가져오기 반영이 각자 팩토리로 만든다.
     *
     * @param expectedAfter 되돌리기일 때만: 되돌릴 rev 의 변경 후 다이어그램 행(충돌 판정용). 클라이언트 명령이면 null.
     * @param undoOf 되돌리기일 때만: 되돌릴 rev. 그 뒤에 표시 행(DRAFT 삭제·새 DRAFT)이 있으면 INVALID. 클라이언트 명령이면 -1.
     * @param requireEmptyModel 첫 가져오기일 때만 true: 잠근 뒤 모델에 표가 있으면 INVALID.
     * @param dryRun 판정만 하고 쓰기 전에 되돌린다(S2-15).
     * @param preloaded 호출자가 잠그기 전에 읽은 사전(APPLY_DIFF — 차이 만들기와 엔진이 같이 쓴다). 없으면 null.
     * @param atLock 잠근 뒤(표지 검사 다음) 그 모델로 묶음을 만드는 단계(APPLY_DIFF). 없으면 null.
     */
    private record Opts(boolean allowRestore, Map<String, JsonNode> expectedAfter, long undoOf, boolean requireEmptyModel,
                        boolean dryRun, ErdNaming preloaded, Function<ErdModel, LockedBuild> atLock) {
        static Opts client(boolean dryRun) {
            return new Opts(false, null, -1, false, dryRun, null, null);
        }

        static Opts undo(Map<String, JsonNode> expectedAfter, long rev, boolean dryRun) {
            return new Opts(true, expectedAfter, rev, false, dryRun, null, null);
        }

        static Opts firstImport() {
            return new Opts(true, null, -1, true, false, null, null);
        }

        static Opts applyDiff(ErdNaming dict, Function<ErdModel, LockedBuild> atLock) {
            return new Opts(true, null, -1, false, false, dict, atLock);
        }
    }
```

2. `applyInternal` 의 묶음 크기 검사를 바꾼다(잠근 뒤 만드는 묶음은 들어올 때 비어 있다).

```java
        if (o.atLock() == null && (raw == null || raw.isEmpty() || raw.size() > MAX_BATCH)) {
            return rejectedNow(modelId, invalid(0, "명령은 1~" + MAX_BATCH + "건이어야 합니다", "나눠서 보내세요"));
        }
```

3. `boolean modelBatch = !modelCmds.isEmpty();` 와 사전 줄을 바꾼다.

```java
        boolean modelBatch = !modelCmds.isEmpty() || o.atLock() != null;
```

```java
        ErdNaming dict = o.preloaded() != null ? o.preloaded() : (modelBatch ? dictionaries.load() : null);
```

4. `o.requireEmptyModel()` 검사 블록 바로 다음에 넣는다.

```java
            if (o.atLock() != null) {
                // 잠근 모델로 묶음을 만든다(APPLY_DIFF: 차이 다시 계산 → id 검사 → restore 하나). 거절이면 아무것도 쓰지 않는다.
                LockedBuild b = o.atLock().apply(model);
                if (b.rejection() != null) {
                    discard.run();
                    return ErdApplyResult.rejected(rev, b.rejection());
                }
                modelCmds.add(b.restore());
                modelIdx.add(0);
                logged.add(typed(ErdCommand.class, b.restore()));
            }
```

5. `applyImport` 다음에 넣는다.

```java
    /**
     * 다시 가져오기 반영(S2-14, D10). 메타·사전은 호출자가 잠그기 전에 읽어 넘긴다. 잠근 뒤 그 모델로 차이를 다시 계산하고 고른 id 가
     * 모두 있는지 본 다음 restore 하나로 넣는다. restore 의 sinceRev 는 요청 baseRev 다 — 지금 rev 로 두면 차이를 읽은 뒤의 남의 편집을
     * 조용히 덮는다. 순서는 save 와 같다(잠금 → baseRev → DRAFT·편집자 → 표지 → 차이·id → 엔진 → CAS → 기록 → 커밋 뒤 발행).
     */
    public ErdDiffApplyResult applyDiff(String modelId, long baseRev, String userId, String session, String source,
                                        ErdDbMeta meta, ErdDictionary dict, List<String> itemIds) {
        if (baseRev < 0) {
            return ErdDiffApplyResult.of(rejectedNow(modelId,
                    invalid(0, "baseRev 는 0 이상이어야 합니다", "compare kind=DB_DIFF 를 읽은 rev 를 쓰세요")), null);
        }
        AtomicReference<ErdDiffApplier.Summary> summary = new AtomicReference<>();
        Function<ErdModel, LockedBuild> atLock = model -> {
            if (model.tables.isEmpty()) {
                return LockedBuild.rejected(invalid(0, "모델에 표가 없습니다. 먼저 import kind=FROM_DB 로 가져오세요",
                        "import kind=FROM_DB 로 첫 가져오기를 하세요"));
            }
            ErdDiffApplier.Built b = ErdDiffApplier.build(model, meta, dict, itemIds, baseRev);
            if (!b.staleIds().isEmpty()) return LockedBuild.rejected(staleItems(b.staleIds()));
            summary.set(b.summary());
            return new LockedBuild(b.restore(), null);
        };
        ErdApplyResult res = applyInternal(modelId, baseRev, userId, session, source, List.of(), Opts.applyDiff(dict, atLock));
        return ErdDiffApplyResult.of(res, summary.get());
    }

    /** README 정본 모양: elementId = 첫 낡은 id, choices = 낡은 id 전부. 부모·자식을 풀 수 없는 FK_ADDED 도 낡은 id 로 온다. */
    private static ErdRejection staleItems(List<String> stale) {
        return new ErdRejection(ErdRejection.INVALID, 0, "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 " + stale.size() + "개가 있습니다",
                "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", stale.get(0), "itemsJson", null, null, null,
                null, ErdModelCodec.MAPPER.valueToTree(stale), null);
    }
```

- [ ] **Step 5: 구현 — `ErdEditService.importModel` 의 APPLY_DIFF**

import 에 `com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiffApplyResult`, `java.util.LinkedHashSet` 을 더한다.

`importModel` 의 kind 검사 줄(Task 4 의 dryRun 검사 다음)을 바꾼다.

```java
        if (isKind(r, "APPLY_DIFF")) return applyDiff(modelId, r);
        if (!isKind(r, "FROM_DB")) throw MdmErrors.invalid("import 의 kind 는 FROM_DB·APPLY_DIFF 입니다: " + r.getKind());
```

`importModel` 다음에 넣는다.

```java
    static final int MAX_DIFF_ITEMS = 500;

    /**
     * 다시 가져오기 반영(S2-14). 스키마 메타와 사전은 잠그기 전에 읽는다(사전 뷰 읽기는 길다). 잠금 안의 판정은 ErdCommandService 가 한다.
     * 거절도 성공 응답에 rejection 을 담는다(save 와 같다).
     */
    private Map<String, Object> applyDiff(String modelId, ErdEditRequest r) {
        if (r.getBaseRev() == null) throw MdmErrors.invalid("baseRev 는 필수입니다");
        List<String> ids = itemIds(r.getItemsJson());
        String me = currentUser.userId();
        String session = session(r, me);
        String source = source(r);
        ErdDbMeta meta = metaReader.read(moduleAndSchema(modelId)[1]);
        ErdDiffApplyResult res = commands.applyDiff(modelId, r.getBaseRev(), me, session, source, meta, dictionaries.load(), ids);
        if (!res.applied()) touch(modelId, r, me);
        return plain(res);
    }

    /** itemsJson = 차이 항목 id 의 JSON 배열 문자열(OASIS params 는 배열을 싣지 못한다). 1~500개, 빈 글자 없음, 겹치면 하나로. */
    static List<String> itemIds(String json) {
        JsonNode arr;
        try {
            arr = ErdModelCodec.MAPPER.readTree(json == null ? "" : json);
        } catch (JsonProcessingException e) {
            throw MdmErrors.invalid("itemsJson 을 읽을 수 없습니다: " + e.getOriginalMessage());
        }
        if (arr == null || !arr.isArray()) throw MdmErrors.invalid("itemsJson 은 차이 항목 id 배열 JSON 이어야 합니다");
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (JsonNode n : arr) {
            if (!n.isTextual() || n.asText().isBlank()) {
                throw MdmErrors.invalid("itemsJson 의 항목은 빈 글자가 아닌 문자열이어야 합니다(compare kind=DB_DIFF 의 items[].id)");
            }
            ids.add(n.asText().trim());
        }
        if (ids.isEmpty() || ids.size() > MAX_DIFF_ITEMS) {
            throw MdmErrors.invalid("고른 차이 항목은 1~" + MAX_DIFF_ITEMS + "개여야 합니다(지금 " + ids.size() + "개)");
        }
        return List.copyOf(ids);
    }
```

`ErdImportTest.importNeedsFromDbKindEditorAndTables` 의 `kind=APPLY_DIFF` 단언(itemsJson 없음)은 이제 `itemIds` 의 MDM021 로 그대로 통과한다. 고치지 않는다.

- [ ] **Step 6: BPMN 문서 글과 계약 검사**

`erdEdit.bpmn` 의 프로세스 `<bpmn:documentation>` 마지막 문장을 바꾼다. 흐름·작업·액션 수(15)는 그대로다.

old:
```
import 는 kind=FROM_DB(첫 가져오기)만 받는다. 메서드 이름은 importModel 이다(import 는 Java 예약어).
```
new:
```
import 는 kind=FROM_DB(첫 가져오기)와 kind=APPLY_DIFF(다시 가져오기 반영, itemsJson — 단계 2 S2-14)를 받는다. save·restore 는 dryRun(시험 실행, S2-15)을 받는다. 확정·선점·해제·넘기기·편집자 추가·빼기는 커밋 뒤 SSE version 을 낸다(S2-12). 메서드 이름은 importModel 이다(import 는 Java 예약어).
```

리포 루트에서 부른다.

```bash
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .
```
Expected: ERROR 0.

- [ ] **Step 7: 시험 통과 확인과 커밋**

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdApplyDiffTest' --tests '*ErdImportTest' --tests '*MdmOasisActionVocabularyTest' --tests '*ErdStage2ContractTest'`
Expected: `ErdApplyDiffTest` 3건 PASS. `MdmOasisActionVocabularyTest` 는 액션 15개 그대로 PASS. 나머지 기존 건수 PASS.

`applyDiffRejectsStaleItemIds` 의 반영 단계가 CONFLICT 로 실패하면 `ErdDiffApplier` 가 `sinceRev` 로 요청 `baseRev`(2)가 아닌 값을 쓴 것이다. `applyDiffConflictsWithEditAfterBaseRev` 만 실패하면 반대로 지금 rev 를 쓴 것이다. 둘 다 BE1 Task 3 의 빌더 문제이므로 조정 세션에 알린다.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(erd): 다시 가져오기 반영 import kind=APPLY_DIFF — 잠근 모델로 차이를 다시 계산해 고른 항목을 restore 하나로

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 8: 실패하는 시험 작성 — 미리보기 타입 대응과 `compare` 모양**

`LT/service/ErdPreviewColumnTest.java`(새, DB 없이 도는 단위 시험):

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** 미리보기 임시 컬럼의 타입이 copyDomain 과 같은 대응(ErdTypeMapping.physicalOf, S2-3)을 따른다. */
class ErdPreviewColumnTest {

    @Test
    void stringDomainPreviewsAsVarchar2() {
        ErdColumn c = ErdEditService.previewColumn("MENU_NM", Optional.of(new ErdDomainSpec(7L, "명", "STRING", 100, null)));
        assertThat(c.phys).isEqualTo("MENU_NM");
        assertThat(c.domainId).isEqualTo(7L);
        assertThat(c.dataType).isEqualTo("VARCHAR2");
        assertThat(c.length).isEqualTo(100);
        assertThat(c.scale).isNull();
    }

    @Test
    void booleanAndTimestampDomainsUsePhysicalTypes() {
        ErdColumn yn = ErdEditService.previewColumn("USE_YN", Optional.of(new ErdDomainSpec(8L, "여부", "BOOLEAN", null, null)));
        assertThat(yn.dataType).isEqualTo("VARCHAR2");
        assertThat(yn.length).isEqualTo(1);
        ErdColumn ts = ErdEditService.previewColumn("REG_DT", Optional.of(new ErdDomainSpec(9L, "일시", "DATE", null, 6)));
        assertThat(ts.dataType).isEqualTo("TIMESTAMP(6)");
        assertThat(ts.length).isNull();
        assertThat(ts.scale).isNull();
    }

    @Test
    void noDomainLeavesTypeEmpty() {
        ErdColumn c = ErdEditService.previewColumn("ABC_ZZ", Optional.empty());
        assertThat(c.domainId).isNull();
        assertThat(c.dataType).isNull();
    }
}
```

`AT/ErdStage2ContractTest.java` 에 넣는다. 이 시험은 `compare` 응답 모양을 고정하는 회귀 시험이다(바꾸기 전에도 통과할 수 있다).

```java
    /** compare(kind 없음)의 tokens 는 plain() 을 거친 일반 JSON 이다(README Jackson 규칙). 화면 ErdNameToken 모양과 같다. */
    @Test
    void compareTokensArePlainJson() throws Exception {
        JsonNode r = c.call("compare", "owner", Map.of("logical", "역할아이디")).at("/data/result");
        assertThat(r.path("tokens").isArray()).as(r.toString()).isTrue();
        JsonNode t = r.path("tokens").get(0);
        assertThat(t.path("seq").isInt()).as(t.toString()).isTrue();
        assertThat(t.path("surface").isTextual()).isTrue();
        assertThat(t.path("status").asText()).isIn("MATCHED", "SYNONYM", "AMBIGUOUS", "NO_ABBR", "UNKNOWN");
        assertThat(t.path("candidates").isArray()).isTrue();
        assertThat(r.path("physName").isTextual()).isTrue();
        assertThat(r.path("status").isTextual()).isTrue();
    }
```

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdPreviewColumnTest'`
Expected: 컴파일 실패. `ErdEditService.previewColumn` 이 없다.

- [ ] **Step 9: 구현 — `previewColumn`, `compare` plain**

`ErdEditService` 의 `previewStatus` 를 아래 두 메서드로 바꾼다. import 에 `com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping` 을 더한다.

```java
    /** 미리보기용 컬럼. 타입은 추천 도메인을 물리 타입으로 바꾼 값이다(S2-3 — copyDomain 과 같은 대응). 도메인이 없으면 타입도 없다. */
    static ErdColumn previewColumn(String phys, Optional<ErdDomainSpec> dom) {
        ErdColumn c = new ErdColumn();
        c.table = "t-preview";
        c.phys = phys;
        dom.ifPresent(x -> {
            ErdTypeMapping.PhysType p = ErdTypeMapping.physicalOf(x.dataType(), x.length(), x.scale());
            c.domainId = x.domainId();
            c.dataType = p.dataType();
            c.length = p.length();
            c.scale = p.scale();
        });
        return c;
    }

    /** 컬럼 하나짜리 임시 모델로 표준 판정을 부른다. 아직 타입을 고르지 않은 입력이므로 추천 도메인의 물리 타입을 쓴다. */
    private static ErdColumnStatus previewStatus(ErdDictionary d, String phys, Optional<ErdDomainSpec> dom) {
        ErdModel m = ErdModel.empty("preview", "preview");
        ErdTable t = new ErdTable();
        t.phys = "TB_PREVIEW";
        m.tables.put("t-preview", t);
        m.columns.put("c-preview", previewColumn(phys, dom));
        t.columnOrder.add("c-preview");
        return ErdStandardJudge.judge(m, d).get("c-preview");
    }
```

`compare` 의 마지막 줄 `return out;` 을 `return plain(out);` 으로 바꾼다(`NameToken`·`TermEntry` 레코드를 Jackson 2 로 일반 Map·List 로 바꿔 내보낸다).

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdPreviewColumnTest'`
Expected: 3건 PASS.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest' --tests '*ErdEditOasisHttpTest'`
Expected: `compareTokensArePlainJson` 를 포함해 PASS. `compareGivesPhysPreview` 도 PASS.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
feat(erd): 논리명 미리보기의 도메인 타입을 물리 타입 대응으로, compare 결과를 plain 으로

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 10: CLAIMED 넓히기(deferred 25)**

`AT/ErdStage2ContractTest.java` 에 실패하는 시험을 넣는다.

```java
    /** deferred 25: 표·컬럼 델타가 없는 변경(키)도 다른 세션이 작업 중인 표면 CLAIMED 경고를 붙인다. */
    @Test
    void claimedWarnsOnKeyChange() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"COL_A\",\"logical\":\"가\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        assertThat(hub.claim("mcm", "t-1", "claude-b", "erd-mcp-b", 600)).isTrue();
        ErdApplyResult r = commands.apply("mcm", 1, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"addKey\",\"id\":\"k-1\",\"table\":\"t-1\",\"kind\":\"UK\",\"name\":\"UX_TB_A_1\",\"columns\":[\"c-1\"]}]"));
        assertThat(r.applied()).isTrue();
        assertThat(r.warnings()).filteredOn(w -> w.code().equals("CLAIMED"))
                .extracting(com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning::elementId).containsExactly("t-1");
    }
```

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest.claimedWarnsOnKeyChange'`
Expected: FAIL. CLAIMED 경고가 없다(키 델타에는 `table`·`column` 종류가 없다).

`ErdCommandService.applyInternal` 의 `warnings.addAll(claimedWarnings(modelId, session, tablesOf(changes)));` 를 `warnings.addAll(claimedWarnings(modelId, session, touched));` 로 바꾸고, 이제 쓰지 않는 `tablesOf` 메서드와 그것만 쓰던 `import java.util.Objects;` 를 지운다. 경고·접속자가 같은 표 목록(엔진 `touchedTables`)을 쓴다.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStage2ContractTest' --tests '*ErdStreamTest' --tests '*ErdCommandServiceTest'`
Expected: 모두 PASS. `ErdStreamTest.claimByOtherSessionWarnsButDoesNotBlock`(표 변경)도 그대로 PASS 다.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
fix(erd): CLAIMED 경고를 엔진 touchedTables 로 — 키·관계·컬럼 삭제도 작업 중인 표면 경고(deferred 25)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 11: (여유가 있으면) deferred 28 확인**

README "착수 전" 은 deferred 27 수정이 28(구독자 잠금 안의 DB 읽기)도 닫았다고 적었다. 코드로 확인만 하고 고치지 않는다.

```bash
grep -n "dbRead(\|synchronized (s)\|synchronized (sub)" src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/stream/ErdEventHub.java
```

Expected: `dbRead(` 호출은 `replay`(읽기 스레드, 구독자 잠금 밖), `drain` 의 빈 칸 채우기(두 `synchronized (s)` 블록 사이), `runClaimRefresh`(읽기 스레드) 세 곳이다. 어느 것도 `synchronized` 블록 안에 없다. 그렇게 보이면 레인 보고에 "deferred 28: 25bc64ff3 로 닫힘, 확인함(ErdEventHub drain·replay)" 한 줄을 적는다. 마감(Task 16)이 deferred.md 처리 칸을 채운다. 블록 안에 있으면 고치지 않고 조정 세션에 알린다.

- [ ] **Step 12: (여유가 있으면) deferred 36 — 실패 경로 HTTP 시험**

`AT/ErdEditOasisHttpTest.java` 를 고친다. 역할을 주는 호출을 더하고 시험 하나를 넣는다. RBAC 거부(403)는 BFF 몫이라 여기 두지 않는다(`DmeOasisHttpTest` 주석과 같다). import 에 `java.util.HashMap` 을 더한다.

```java
    JsonNode call(String action, String user, String role, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    long draftRowVersion() {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", Long.class);
    }

    /** deferred 36 — 실패 경로가 S001 이 아니라 업무 오류 코드로 오고, 실패한 동작은 아무것도 바꾸지 않는다. */
    @Test
    void failurePathsAreBusinessErrors() throws Exception {
        reg();
        assertThat(call("view", "owner", Map.of("modelId", "mcm", "ver", "9.999")).at("/meta/code").asText()).isEqualTo("MDM029");
        JsonNode view = call("view", "owner", Map.of("modelId", "mcm"));
        String ver = view.at("/data/result/ver").asText();
        long rv = view.at("/data/result/rowVersion").asLong();
        assertThat(call("unlock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rv + 5)).at("/meta/code").asText())
                .isEqualTo("MDM001");
        // 사전에 없는 토막의 컬럼(MISS) — 첫 확정은 경고로만 알린다(R8-1). 확인 없이 확정하면 MDM014.
        call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "commandsJson",
                "[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                        + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"ZZQX_QWV\",\"logical\":\"모름\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        Map<String, Object> confirm = new HashMap<>(Map.of("modelId", "mcm", "ver", ver, "rowVersion", draftRowVersion(),
                "applyFrom", "2030-01-01 00:00:00"));
        assertThat(call("confirm", "kim", confirm).at("/meta/code").asText()).isEqualTo("MDM003");               // 소유자가 아니다
        assertThat(call("confirm", "owner", "MDM_STD_ADMIN", confirm).at("/meta/code").asText()).isEqualTo("MDM013"); // 담당자 역할이 없다
        JsonNode noAck = call("confirm", "owner", confirm);
        assertThat(noAck.at("/meta/code").asText()).as(noAck.toString()).isEqualTo("MDM014");
        confirm.put("warningsAcknowledged", true);
        assertThat(call("confirm", "owner", confirm).at("/data/result/ok").asBoolean()).isTrue();
        // 두 번째 버전에서 새로 더한 위반 컬럼은 확정을 막는다(D19) → MDM010
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET APPLY_FROM = ADD_MONTHS(APPLY_FROM, -240) WHERE ERD_MODEL_ID = 'mcm'");
        String ver2 = call("copy", "owner", Map.of("modelId", "mcm", "verKind", "MINOR")).at("/data/result/ver").asText();
        long rev = jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", Long.class);
        JsonNode added = call("save", "owner", Map.of("modelId", "mcm", "baseRev", rev, "commandsJson",
                "[{\"op\":\"addColumn\",\"id\":\"c-2\",\"table\":\"t-1\",\"phys\":\"ZZQX_QWZ\",\"logical\":\"모름2\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        assertThat(added.at("/data/result/applied").asBoolean()).as(added.toString()).isTrue();
        JsonNode blocked = call("confirm", "owner", Map.of("modelId", "mcm", "ver", ver2, "rowVersion", draftRowVersion(),
                "applyFrom", "2031-01-01 00:00:00", "warningsAcknowledged", true));
        assertThat(blocked.at("/meta/code").asText()).as(blocked.toString()).isEqualTo("MDM010");
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND VER = ?", String.class,
                new java.math.BigDecimal(ver2))).isEqualTo("DRAFT");
    }
```

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdEditOasisHttpTest'`
Expected: 새 시험을 포함해 PASS. 이 시험은 지금 코드의 동작을 고정하므로 처음부터 통과할 수 있다. 실패하면 단언을 실제 코드에 맞추기 전에 원인을 본다.
- MDM014 단언이 실패하면 `ZZQX_QWV` 가 복제 사전에서 MISS 가 아닌 것이다. `view kind=STATUS` 로 그 컬럼의 상태를 확인하고, MISS 인 다른 물리명을 찾아 바꾼다.
- MDM013 단언이 MDM003 이면 공통 확정 서비스의 검사 순서가 `requireSteward` → `requireOwner` 가 아니다. 단언 순서를 실제 순서로 바꾸고 레인 보고에 적는다.

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -F - <<'EOF'
test(erd): erdEdit 실패 경로 HTTP 시험 — 없는 버전·낡은 rowVersion·소유자·역할·경고 미확인·확정 검사(deferred 36)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

- [ ] **Step 13: 머지 전 회귀**

서버 레인은 머지 전마다 deferred 27 시험을 다시 돈다(README "착수 전").

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdConcurrentSaveHttpTest' --tests '*ErdStage2ContractTest' --tests '*ErdPresenceTouchTest'`
Expected: `ErdConcurrentSaveHttpTest` 6건, `ErdStage2ContractTest` 7건, `ErdPresenceTouchTest` 3건 PASS.

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdImportTest' --tests '*ErdApplyDiffTest' --tests '*ErdReadKindsTest'`
Expected: `ErdApplyDiffTest` 3건과 나머지 기존 건수 PASS(MDMAPUSER 를 가져오는 시험 묶음이라 따로 돈다).

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdCommandServiceTest' --tests '*ErdStreamTest' --tests '*ErdEditOasisHttpTest' --tests '*ErdVersionServiceTest' --tests '*ErdCoEditorGuardTest'`
Expected: 모두 PASS(`ErdEditOasisHttpTest` 는 Step 12 를 했으면 1건 늘어난다).

Run: `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*MdmOasisActionVocabularyTest'`
Expected: PASS(액션 15개 그대로).

Run: `../gradlew :lib:test --max-workers=2 --tests '*ErdEventHubQueueTest' --tests '*ErdPreviewColumnTest' --tests 'com.dongkuk.dmes.mdm.dma.erdEdit.*'`
Expected: 모두 PASS. `ErdEventHubQueueTest` 3건.

그 뒤 조정 세션에 머지 허가를 받는다. 허가가 나면 README Global Constraints 대로 레인 커밋을 하나로 합치고(`node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase`) `--ff-only` 로 머지한다. 합친 커밋 제목은 `feat(erd): 단계 2 서버 계약 — rowVersion·version·시한 접속자·dryRun·byUserId·CLAIM 응답·APPLY_DIFF` 로 한다.

---

## 계획 작성자 메모

- Task 4 는 약 1,700줄로 권장 상한(700줄)을 넘는다(Task 5 는 약 700줄). README 가 Task 4 에 결과 칸·dryRun·byUserId·CLAIM 응답·version·시한 접속자를 함께 맡겼고, `applyInternal` 전체 코드(약 170줄)를 실었기 때문이다. 나누려면 t4a = Step 1~7(결과 칸·dryRun·byUserId·CLAIM, 약 800줄), t4b = Step 8~11(version), t4c = Step 12~16(시한 접속자, Step 16 은 BE1 Task 2 머지 뒤)으로 자른다. 각 묶음은 자기 커밋이 있고 앞 묶음에만 기댄다.
- README 의 `touch(modelId, session, userId, source, touchedTables)` 하나로는 CLAIM·RELEASE 의 "작업 중 표시 부분을 다시 계산" 을 할 수 없다(`touch` 는 DB 를 읽지 않는다). 그래서 `touchClaims(…, List<ErdClaimView>)`, `sweepPresence(Instant now)`(시험이 미래 시각으로 부름), `static isTimedSource` 를 공개로 더했다. 표시 목록은 `ErdEditService` 가 같은 트랜잭션 연결로 읽어 넘긴다.
- CLAIM 응답: 두 세션이 같은 표를 동시에 처음 표시해 키가 겹친 경우는 상대 행이 커밋 전이라 `claimedBy`·`userId`·`expiresAt` 이 모두 null 이다. README 정본 예시에는 이 경우가 없다.
- 넘기기(`handover`)는 시험 환경에서 늘 MDM005 라 성공 뒤의 `version HANDOVER` 를 시험하지 못한다. 실패하면 이벤트가 없다는 것만 본다(`versionEventsFollowLifecycle`). 마감에서도 확인하지 않는다(README "Task 16 이 더할 새 행").
- `import` 에 `dryRun:true` 가 오면 MDM021 로 막게 했다. README 는 `import` 의 dryRun 을 정하지 않았다. 시험 실행인 줄 알고 보낸 가져오기가 실제로 쓰이는 일을 막는다.
- `ErdDiffApplier.build` 의 `Supplier<String> idSource` 는 "접두어 없는 UUID 본문을 돌려주고 빌더가 접두어를 붙인다" 로 보았다. Supplier 는 접두어를 모르기 때문이다. BE1 javadoc 이 다르면 Task 5 Step 1 의 절차대로 인자를 바꾼다. (정합 검토: 01 과 같다. 서비스는 5인자 `build` 를 부르게 고쳤다.)
- `ErdTypeMapping.PhysType` 은 README 의 "E.standard.ErdTypeMapping … public record PhysType" 을 `ErdTypeMapping` 안의 레코드로 읽었다. 최상위 레코드면 Task 5 Step 1 의 절차대로 바꾼다. (정합 검토: 01 Step 3 이 `ErdTypeMapping` 안의 레코드로 만든다. README 에 적었다.)
- 미리보기 단위 시험 `LT/service/ErdPreviewColumnTest.java` 는 lib 시험 폴더에 있지만 `service` 패키지(BE2 소유 `E/service/**`)의 새 파일이다. BE1 의 lib 시험(standard·engine·importing)과 겹치지 않는다. `previewColumn` 은 시험을 위해 package-private 정적 메서드로 둔다.
- 시험 공용 `AT/ErdTestClient.java` 를 새로 두었다(README 파일 구조에 없다). 새 시험 세 개가 HTTP·SSE 코드를 되풀이하지 않게 한다.
- HTTP 시험의 null 칸(`rowVersion`·`rejection`·`summary`)은 `nullish`(null 이거나 빠짐)로 본다. OASIS 응답 직렬화가 null 칸을 빼더라도 같은 뜻으로 보기 위해서다. 서비스 직접 호출 시험은 정확히 null 을 본다. 마감에서 화면이 빠진 칸을 null 로 읽는지 확인한다.
- `compareTokensArePlainJson` 은 응답 모양을 고정하는 회귀 시험이라 바꾸기 전에도 통과할 수 있다. `plain()` 의 실패 시험은 따로 만들 수 없다(Jackson 3 도 같은 레코드를 비슷하게 직렬화한다).
- deferred 36 의 범위: RBAC 거부(READ 역할의 save·execute 403)는 BFF 몫이라 넣지 않았다. MDM013·MDM014 의 기대는 공통 확정 서비스의 검사 순서와 복제 사전의 MISS 판정에 기대므로 Step 12 에 실패 때의 확인 절차를 적었다.
- 반영된 쓰기의 접속자 갱신은 커밋 뒤 콜백에서 `publish` 다음에 한다. 그래서 MCP 의 `save` HTTP 응답과 `presence` 방송 사이에 짧은 틈이 있다. `mcpKeyChangeTouchesItsTable` 은 `await` 로 기다린다.
- `version SUBSCRIBE` 는 재생 기록과 같은 `dbRead` 한 번에서 읽는다. 구독 하나가 허브 DB 읽기 칸을 쥐는 시간이 버전 행 읽기 두 번만큼 늘어난다. `ErdConcurrentSaveHttpTest.burstWithTwoOpenStreamsDeliversEveryRevToBoth` 가 이 경로를 함께 돈다.
