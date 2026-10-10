# ERD 도구 단계 0 — Task 9: 명령 서비스

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P10)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [04-version.md](04-version.md) · [README](README.md) · 다음: [06-oasis-sse-close.md](06-oasis-sse-close.md)

### Task 9: 명령 서비스 — 직렬화·기록·다이어그램·변경 조회·되돌리기

**Files:**
- Create: `.../dma/erdEdit/service/{ErdCommandService,ErdCommandLogStore,ErdDiagramStore}.java`
- Create: `.../dma/erdEdit/dto/{ErdApplyResult,ErdChangesView,ErdDiagramCommand}.java`
- Create: `.../dma/erdEdit/stream/ErdEventHub.java` (이 Task 에서는 `publish` 만, Task 11 에서 구독을 더한다)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdCommandServiceTest.java`

**Interfaces:**
- Consumes: Task 4~8 전부.
- Produces:
  - `record ErdDelta(String modelId, long rev, String userId, String session, String source, List<ErdChange> changes)` — SSE `change` 이벤트 본문이자 `getChangesSince` 항목(`stream` 패키지).
  - `sealed interface ErdDiagramCommand` — `AddDiagram(id, areaName, diagramName, sortSeq)`, `UpdateDiagram(id, set)`, `DeleteDiagram(id)`, `PlaceTables(diagram, List<Node> nodes)`(`record Node(String table, int x, int y)`), `MoveNodes(diagram, List<Node> nodes)`, `SetFold(diagram, List<String> tables, String foldMode)`, `RemoveFromDiagram(diagram, List<String> tables)`. JSON `op` 이름은 소문자 낙타형(`addDiagram` …).
  - `ErdCommandService.apply(String modelId, long baseRev, String userId, String session, String source, List<JsonNode> commands) : ErdApplyResult` — 명령 JSON 을 `op` 로 나눠 모델 명령은 엔진, 다이어그램 명령은 `ErdDiagramStore` 로 보낸다.
  - `record ErdApplyResult(boolean applied, long rev, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection)`.
  - `ErdCommandService.changesSince(String modelId, long sinceRev) : ErdChangesView` — `record ErdChangesView(long rev, boolean reload, List<ErdDelta> deltas)`, 500건 초과면 `reload=true`·`deltas` 빈 목록.
  - `ErdCommandService.undo(String modelId, long rev, String userId, String session, String source) : ErdApplyResult`.
  - `ErdEventHub.publish(ErdDelta delta)`.

판정 순서(모델 명령이 있을 때):
1. `lockRev` 로 모델 행을 잠근다. `newRev = rev + 1`.
2. DRAFT 가 없으면 `NOT_EDITOR`("DRAFT 가 없습니다", hint "copy 로 새 버전을 먼저 만드세요").
3. 엔진 적용. 거절이면 아무것도 쓰지 않고 거절을 돌려준다(트랜잭션 롤백).
4. `writeGuard.beginDraftWrite(ref, draft.getRowVersion(), userId)` — MDM003 이면 `NOT_EDITOR` 로 바꿔 돌려준다(hint "소유자에게 공동 편집자 등록을 요청하세요").
5. JSON 쓰기 → 다이어그램 명령 처리 → `setRev(newRev)` → 명령 기록 INSERT.
6. 커밋 뒤(`TransactionSynchronization.afterCommit`) `hub.publish(delta)`.

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class ErdCommandServiceTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
    }

    List<JsonNode> cmds(String json) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return out;
    }

    @Test
    void applyWritesJsonRevLogAndPublishes() throws Exception {
        List<ErdDelta> seen = new CopyOnWriteArrayList<>();
        hub.addListenerForTest("mcm", seen::add);
        ErdApplyResult r = commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmds("""
                [{"op":"addTable","id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        assertThat(r.applied()).isTrue();
        assertThat(r.rev()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG", Integer.class)).isEqualTo(1);
        assertThat(seen).singleElement().satisfies(d -> assertThat(d.changes()).hasSize(1));
    }

    @Test
    void rejectionWritesNothing() throws Exception {
        ErdApplyResult r = commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmds("""
                [{"op":"addTable","id":"t-1","phys":"bad name","logical":"x"}]"""));
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isZero();
    }

    @Test
    void strangerIsNotEditorButCoEditorWrites() throws Exception {
        assertThat(commands.apply("mcm", 0, "stranger", "s", "MCP", cmds("""
                [{"op":"addTable","phys":"TB_A","logical":"에이"}]""")).rejection().code()).isEqualTo("NOT_EDITOR");
        versions.addEditor("mcm", "mate", "owner");
        assertThat(commands.apply("mcm", 0, "mate", "claude-a", "MCP", cmds("""
                [{"op":"addTable","phys":"TB_A","logical":"에이"}]""")).applied()).isTrue();
    }

    @Test
    void modelCommandWithoutDraftIsNotEditor() throws Exception {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00'");
        var r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","phys":"TB_A","logical":"에이"}]"""));
        assertThat(r.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(r.rejection().hint()).contains("copy");
    }

    @Test
    void diagramCommandWithoutDraftApplies() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00'");
        var r = commands.apply("mcm", 1, "viewer", "ui-v", "UI", cmds("""
                [{"op":"addDiagram","id":"d-1","areaName":"시스템관리","diagramName":"메뉴·권한"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-1","x":40,"y":40}]}]"""));
        assertThat(r.applied()).isTrue();
        assertThat(r.changes()).extracting(c -> c.kind()).contains("diagram", "diagramNode");
    }

    @Test
    void changesSinceAndTooFar() throws Exception {
        for (int i = 0; i < 3; i++) {
            commands.apply("mcm", i, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"phys\":\"TB_A" + i + "\",\"logical\":\"x\"}]"));
        }
        var v = commands.changesSince("mcm", 1);
        assertThat(v.deltas()).extracting(ErdDelta::rev).containsExactly(2L, 3L);
        assertThat(v.reload()).isFalse();
        jdbc.update("UPDATE TB_MDM_ERD_MODEL SET REV = 9999 WHERE ERD_MODEL_ID='mcm'");
        assertThat(commands.changesSince("mcm", 1).reload()).isTrue();
    }

    @Test
    void undoRestoresPreviousState() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        commands.apply("mcm", 1, "owner", "ui", "UI", cmds("""
                [{"op":"updateTable","id":"t-1","set":{"logical":"바뀜"}}]"""));
        var r = commands.undo("mcm", 2, "owner", "ui", "UI");
        assertThat(r.applied()).isTrue();
        String json = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        assertThat(json).contains("\"logical\":\"에이\"");
    }

    @Test
    void concurrentAppliesKeepRevContiguous() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        List<Future<ErdApplyResult>> fs = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            int n = i;
            fs.add(pool.submit(() -> commands.apply("mcm", 0, "owner", "s" + (n % 3), "UI",
                    cmds("[{\"op\":\"addTable\",\"phys\":\"TB_C" + n + "\",\"logical\":\"x\"}]"))));
        }
        for (var f : fs) assertThat(f.get(60, TimeUnit.SECONDS).applied()).isTrue();
        pool.shutdown();
        List<Long> revs = jdbc.queryForList("SELECT REV FROM TB_MDM_ERD_CMD_LOG ORDER BY REV", Long.class);
        assertThat(revs).containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L, 11L, 12L);
        String json = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        for (int i = 0; i < 12; i++) assertThat(json).contains("TB_C" + i);
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `… heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdCommandServiceTest'`
Expected: 컴파일 실패.

- [ ] **Step 3: 구현 — `ErdDelta`, `ErdEventHub`(publish 만)**

```java
// stream/ErdDelta.java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import java.util.List;

/** 커밋된 명령 하나의 델타(스펙 4.4). SSE change 이벤트·getChangesSince 항목. */
public record ErdDelta(String modelId, long rev, String userId, String session, String source, List<ErdChange> changes) {
}

// stream/ErdEventHub.java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;

/** 모델별 실시간 구독자 묶음. Task 11 에서 SSE 구독·접속자를 더한다. 서버 1대 가정(스펙 5절). */
@Component
public class ErdEventHub {

    private final Map<String, List<Consumer<ErdDelta>>> listeners = new ConcurrentHashMap<>();

    public void publish(ErdDelta delta) {
        listeners.getOrDefault(delta.modelId(), List.of()).forEach(l -> l.accept(delta));
    }

    /** 시험·내부 구독. 돌려준 Runnable 로 해지한다. */
    public Runnable addListenerForTest(String modelId, Consumer<ErdDelta> listener) {
        listeners.computeIfAbsent(modelId, k -> new CopyOnWriteArrayList<>()).add(listener);
        return () -> listeners.getOrDefault(modelId, List.of()).remove(listener);
    }
}
```

- [ ] **Step 4: 구현 — `ErdCommandLogStore`, `ErdDiagramStore`, `ErdCommandService`**

```java
// service/ErdCommandLogStore.java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Component;

/** TB_MDM_ERD_CMD_LOG 쓰기·읽기. 감사 칼럼은 네이티브 SQL 에 직접 쓴다(ADR-0001). */
@Component
public class ErdCommandLogStore {

    static final int MAX_REPLAY = 500;
    private final EntityManager em;

    public ErdCommandLogStore(EntityManager em) {
        this.em = em;
    }

    public void insert(String modelId, long rev, BigDecimal modelVer, String userId, String session, String source,
                       String cmdJson, String inverseJson, List<ErdChange> changes) {
        em.createNativeQuery("""
                INSERT INTO TB_MDM_ERD_CMD_LOG (ERD_MODEL_ID, REV, MODEL_VER, USER_ID, SESSION_NM, SOURCE,
                  CMD_JSON, INVERSE_JSON, CHANGES_JSON, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""")
                .setParameter(1, modelId).setParameter(2, rev).setParameter(3, modelVer).setParameter(4, userId)
                .setParameter(5, session).setParameter(6, source).setParameter(7, cmdJson).setParameter(8, inverseJson)
                .setParameter(9, write(changes)).setParameter(10, userId).setParameter(11, userId).executeUpdate();
    }

    /** sinceRev 다음부터. 개수가 MAX_REPLAY 를 넘으면 empty(호출자가 reload 로 바꾼다). */
    public Optional<List<ErdDelta>> since(String modelId, long sinceRev, long currentRev) {
        if (currentRev - sinceRev > MAX_REPLAY) return Optional.empty();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT REV, USER_ID, SESSION_NM, SOURCE, CHANGES_JSON FROM TB_MDM_ERD_CMD_LOG
                 WHERE ERD_MODEL_ID = ? AND REV > ? ORDER BY REV""")
                .setParameter(1, modelId).setParameter(2, sinceRev).getResultList();
        List<ErdDelta> out = new ArrayList<>();
        for (Object[] r : rows) {
            out.add(new ErdDelta(modelId, ((Number) r[0]).longValue(), (String) r[1], (String) r[2], (String) r[3],
                    read(clob(r[4]))));
        }
        return Optional.of(out);
    }

    /** 되돌리기 재료: [inverseJson, session]. */
    public Optional<String[]> inverse(String modelId, long rev) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("SELECT INVERSE_JSON, SESSION_NM FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = ? AND REV = ?")
                .setParameter(1, modelId).setParameter(2, rev).getResultList();
        return rows.stream().findFirst().map(r -> new String[]{clob(r[0]), (String) r[1]});
    }

    static String clob(Object o) {
        try {
            return o instanceof java.sql.Clob c ? c.getSubString(1, (int) c.length()) : (String) o;
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    static String write(Object o) {
        try {
            return ErdModelCodec.MAPPER.writeValueAsString(o);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    static List<ErdChange> read(String json) {
        try {
            return ErdModelCodec.MAPPER.readValue(json, new TypeReference<List<ErdChange>>() {});
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

`ErdDiagramStore` 는 `ErdDiagramCommand` 를 받아 `TB_MDM_ERD_DIAGRAM`·`_NODE` 를 네이티브 SQL 로 고치고, 고친 행마다 `ErdChange` 를 돌려준다(kind `diagram` 은 id = DIAGRAM_ID, kind `diagramNode` 는 id = `DIAGRAM_ID:TABLE_UUID`, value = 행 JSON). 역명령은 고치기 전 행을 담은 같은 형식의 `restoreDiagram` 명령이다. 규칙:
- `placeTables` 는 표 id 가 지금 모델(`store.current(modelId)` 의 JSON)에 있어야 한다. 없으면 `INVALID`.
- 같은 다이어그램에 같은 표를 두 번 놓으면 위치만 바꾼다(PK 가 같으므로 MERGE).
- `foldMode` 는 `NONE|KEYS|NAME`.

```java
// dto/ErdDiagramCommand.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "op")
@JsonSubTypes({
        @JsonSubTypes.Type(value = ErdDiagramCommand.AddDiagram.class, name = "addDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.UpdateDiagram.class, name = "updateDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.DeleteDiagram.class, name = "deleteDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.PlaceTables.class, name = "placeTables"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.MoveNodes.class, name = "moveNodes"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.SetFold.class, name = "setFold"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.RemoveFromDiagram.class, name = "removeFromDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.RestoreDiagram.class, name = "restoreDiagram")
})
public sealed interface ErdDiagramCommand {
    record Node(String table, int x, int y) {}
    record AddDiagram(String id, String areaName, String diagramName, Integer sortSeq) implements ErdDiagramCommand {}
    record UpdateDiagram(String id, Map<String, Object> set) implements ErdDiagramCommand {}
    record DeleteDiagram(String id) implements ErdDiagramCommand {}
    record PlaceTables(String diagram, List<Node> nodes) implements ErdDiagramCommand {}
    record MoveNodes(String diagram, List<Node> nodes) implements ErdDiagramCommand {}
    record SetFold(String diagram, List<String> tables, String foldMode) implements ErdDiagramCommand {}
    record RemoveFromDiagram(String diagram, List<String> tables) implements ErdDiagramCommand {}
    /** 되돌리기 전용. elements 는 ErdChange(kind diagram|diagramNode). */
    record RestoreDiagram(List<com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange> elements) implements ErdDiagramCommand {}

    static boolean isDiagramOp(String op) {
        return switch (op) {
            case "addDiagram", "updateDiagram", "deleteDiagram", "placeTables", "moveNodes", "setFold",
                 "removeFromDiagram", "restoreDiagram" -> true;
            default -> false;
        };
    }
}
```

```java
// service/ErdDiagramStore.java (핵심부)
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdIds;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.springframework.stereotype.Component;

/** 다이어그램(버전 밖) 명령. 결과는 델타·역명령으로 돌려준다. 거절은 ErdDiagramReject 로 던진다. */
@Component
public class ErdDiagramStore {

    public record Result(List<ErdChange> changes, ErdDiagramCommand inverse) {}

    public static final class ErdDiagramReject extends RuntimeException {
        public final ErdRejection rejection;
        ErdDiagramReject(ErdRejection r) { super(r.message(), null, false, false); this.rejection = r; }
    }

    private final EntityManager em;

    public ErdDiagramStore(EntityManager em) {
        this.em = em;
    }

    public Result apply(String modelId, ErdModel model, List<ErdDiagramCommand> cmds, int indexOffset, String userId) {
        LinkedHashMap<String, JsonNode> before = new LinkedHashMap<>();
        for (int i = 0; i < cmds.size(); i++) {
            int index = indexOffset + i;
            switch (cmds.get(i)) {
                case AddDiagram a -> {
                    String id = a.id() == null ? ErdIds.newId('d') : a.id();
                    remember(before, "diagram", id);
                    em.createNativeQuery("""
                            INSERT INTO TB_MDM_ERD_DIAGRAM (DIAGRAM_ID, ERD_MODEL_ID, AREA_NAME, DIAGRAM_NAME, SORT_SEQ,
                              C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                            VALUES (?, ?, ?, ?, ?, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""")
                            .setParameter(1, id).setParameter(2, modelId).setParameter(3, a.areaName())
                            .setParameter(4, a.diagramName()).setParameter(5, a.sortSeq() == null ? 0 : a.sortSeq())
                            .setParameter(6, userId).setParameter(7, userId).executeUpdate();
                }
                case PlaceTables p -> {
                    requireDiagram(p.diagram(), index);
                    for (Node n : p.nodes()) {
                        if (!model.tables.containsKey(n.table())) throw reject(index, "모델에 없는 표입니다: " + n.table(), n.table());
                        remember(before, "diagramNode", p.diagram() + ":" + n.table());
                        mergeNode(p.diagram(), n, userId);
                    }
                }
                case MoveNodes mv -> {
                    requireDiagram(mv.diagram(), index);
                    for (Node n : mv.nodes()) {
                        remember(before, "diagramNode", mv.diagram() + ":" + n.table());
                        int updated = em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET POS_X = ?, POS_Y = ?, U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                                .setParameter(1, n.x()).setParameter(2, n.y()).setParameter(3, userId)
                                .setParameter(4, mv.diagram()).setParameter(5, n.table()).executeUpdate();
                        if (updated == 0) throw reject(index, "다이어그램에 없는 표입니다: " + n.table(), n.table());
                    }
                }
                case SetFold f -> {
                    if (!Set.of("NONE", "KEYS", "NAME").contains(f.foldMode())) throw reject(index, "foldMode 는 NONE·KEYS·NAME 입니다", f.diagram());
                    for (String t : f.tables()) {
                        remember(before, "diagramNode", f.diagram() + ":" + t);
                        em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET FOLD_MODE = ?, U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                                .setParameter(1, f.foldMode()).setParameter(2, userId).setParameter(3, f.diagram()).setParameter(4, t).executeUpdate();
                    }
                }
                case RemoveFromDiagram r -> {
                    for (String t : r.tables()) {
                        remember(before, "diagramNode", r.diagram() + ":" + t);
                        em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                                .setParameter(1, r.diagram()).setParameter(2, t).executeUpdate();
                    }
                }
                case UpdateDiagram u -> {
                    requireDiagram(u.id(), index);
                    remember(before, "diagram", u.id());
                    for (var e : u.set().entrySet()) {
                        String col = switch (e.getKey()) {
                            case "areaName" -> "AREA_NAME";
                            case "diagramName" -> "DIAGRAM_NAME";
                            case "sortSeq" -> "SORT_SEQ";
                            default -> throw reject(index, "고칠 수 없는 속성입니다: " + e.getKey(), u.id());
                        };
                        em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM SET " + col + " = ?, U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ?")
                                .setParameter(1, e.getValue()).setParameter(2, userId).setParameter(3, u.id()).executeUpdate();
                    }
                }
                case DeleteDiagram d -> {
                    requireDiagram(d.id(), index);
                    for (String nodeKey : nodeKeys(d.id())) remember(before, "diagramNode", nodeKey);
                    remember(before, "diagram", d.id());
                    em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?").setParameter(1, d.id()).executeUpdate();
                    em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ?").setParameter(1, d.id()).executeUpdate();
                }
                case RestoreDiagram rd -> {
                    // FK 순서: 다이어그램 되살리기 → 노드 → 다이어그램 지우기
                    List<ErdChange> ordered = new ArrayList<>(rd.elements());
                    ordered.sort(Comparator.comparingInt(e -> e.kind().equals("diagram") ? (e.value() == null ? 2 : 0) : 1));
                    for (ErdChange e : ordered) {
                        remember(before, e.kind(), e.id());
                        restoreRow(modelId, e, userId);
                    }
                }
            }
        }
        List<ErdChange> changes = new ArrayList<>(), restore = new ArrayList<>();
        before.forEach((key, prev) -> {
            String kind = key.substring(0, key.indexOf('|')), id = key.substring(key.indexOf('|') + 1);
            JsonNode after = row(kind, id);
            changes.add(new ErdChange(kind, id, after == null ? ErdChange.DELETE : ErdChange.UPSERT, after));
            restore.add(new ErdChange(kind, id, prev == null ? ErdChange.DELETE : ErdChange.UPSERT, prev));
        });
        return new Result(changes, new RestoreDiagram(restore));
    }

    private void remember(Map<String, JsonNode> before, String kind, String id) {
        before.computeIfAbsent(kind + "|" + id, k -> row(kind, id));
    }

    /** 행 JSON. diagram: {id, areaName, diagramName, sortSeq}, diagramNode: {diagram, table, x, y, foldMode}. 없으면 null. */
    @SuppressWarnings("unchecked")
    JsonNode row(String kind, String id) {
        ObjectNode o = ErdModelCodec.MAPPER.createObjectNode();
        if (kind.equals("diagram")) {
            List<Object[]> rows = em.createNativeQuery(
                    "SELECT AREA_NAME, DIAGRAM_NAME, SORT_SEQ FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ?")
                    .setParameter(1, id).getResultList();
            if (rows.isEmpty()) return null;
            Object[] r = rows.get(0);
            return o.put("id", id).put("areaName", (String) r[0]).put("diagramName", (String) r[1])
                    .put("sortSeq", ((Number) r[2]).intValue());
        }
        String[] k = id.split(":", 2);
        List<Object[]> rows = em.createNativeQuery(
                "SELECT POS_X, POS_Y, FOLD_MODE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                .setParameter(1, k[0]).setParameter(2, k[1]).getResultList();
        if (rows.isEmpty()) return null;
        Object[] r = rows.get(0);
        return o.put("diagram", k[0]).put("table", k[1]).put("x", ((Number) r[0]).intValue())
                .put("y", ((Number) r[1]).intValue()).put("foldMode", (String) r[2]);
    }

    private void requireDiagram(String id, int index) {
        if (row("diagram", id) == null) throw reject(index, "없는 다이어그램입니다: " + id, id);
    }

    @SuppressWarnings("unchecked")
    private List<String> nodeKeys(String diagramId) {
        List<Object> tables = em.createNativeQuery("SELECT TABLE_UUID FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?")
                .setParameter(1, diagramId).getResultList();
        return tables.stream().map(t -> diagramId + ":" + t).toList();
    }

    /** 되돌리기: value 가 null 이면 지우고, 아니면 그 값으로 되살린다. */
    private void restoreRow(String modelId, ErdChange e, String userId) {
        JsonNode v = e.value();
        if (e.kind().equals("diagram")) {
            if (v == null) {
                em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?").setParameter(1, e.id()).executeUpdate();
                em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ?").setParameter(1, e.id()).executeUpdate();
                return;
            }
            int updated = em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM SET AREA_NAME = ?, DIAGRAM_NAME = ?, SORT_SEQ = ?, "
                            + "U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ?")
                    .setParameter(1, v.path("areaName").asText()).setParameter(2, v.path("diagramName").asText())
                    .setParameter(3, v.path("sortSeq").asInt()).setParameter(4, userId).setParameter(5, e.id()).executeUpdate();
            if (updated == 0) {
                em.createNativeQuery("INSERT INTO TB_MDM_ERD_DIAGRAM (DIAGRAM_ID, ERD_MODEL_ID, AREA_NAME, DIAGRAM_NAME, SORT_SEQ, "
                                + "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) "
                                + "VALUES (?, ?, ?, ?, ?, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)")
                        .setParameter(1, e.id()).setParameter(2, modelId).setParameter(3, v.path("areaName").asText())
                        .setParameter(4, v.path("diagramName").asText()).setParameter(5, v.path("sortSeq").asInt())
                        .setParameter(6, userId).setParameter(7, userId).executeUpdate();
            }
            return;
        }
        String[] k = e.id().split(":", 2);
        if (v == null) {
            em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                    .setParameter(1, k[0]).setParameter(2, k[1]).executeUpdate();
            return;
        }
        mergeNode(k[0], new Node(k[1], v.path("x").asInt(), v.path("y").asInt()), userId);
        em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET FOLD_MODE = ? WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                .setParameter(1, v.path("foldMode").asText("NONE")).setParameter(2, k[0]).setParameter(3, k[1]).executeUpdate();
    }

    private static ErdDiagramReject reject(int index, String message, String elementId) {
        return new ErdDiagramReject(new ErdRejection(ErdRejection.INVALID, index, message,
                "getModelText 로 다이어그램을 확인하세요", elementId, null, null, null, null, null));
    }

    private void mergeNode(String diagram, Node n, String userId) {
        em.createNativeQuery("""
                MERGE INTO TB_MDM_ERD_DIAGRAM_NODE t
                USING (SELECT ? DIAGRAM_ID, ? TABLE_UUID FROM DUAL) s
                   ON (t.DIAGRAM_ID = s.DIAGRAM_ID AND t.TABLE_UUID = s.TABLE_UUID)
                 WHEN MATCHED THEN UPDATE SET t.POS_X = ?, t.POS_Y = ?, t.U_USR_ID = ?, t.U_AT = SYSTIMESTAMP
                 WHEN NOT MATCHED THEN INSERT (DIAGRAM_ID, TABLE_UUID, POS_X, POS_Y, FOLD_MODE,
                      C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                      VALUES (s.DIAGRAM_ID, s.TABLE_UUID, ?, ?, 'NONE', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""")
                .setParameter(1, diagram).setParameter(2, n.table()).setParameter(3, n.x()).setParameter(4, n.y())
                .setParameter(5, userId).setParameter(6, n.x()).setParameter(7, n.y()).setParameter(8, userId)
                .setParameter(9, userId).executeUpdate();
    }

    // requireDiagram(id, index): TB_MDM_ERD_DIAGRAM 에 없으면 reject(index, "없는 다이어그램입니다: " + id, id).
    // nodeKeys(diagramId): 그 다이어그램 노드의 "DIAGRAM_ID:TABLE_UUID" 목록.
    // restoreRow(modelId, change, userId): value 가 null 이면 DELETE, 아니면 diagram 은 MERGE, diagramNode 는 mergeNode + FOLD_MODE UPDATE.
    // reject(index, message, elementId): new ErdDiagramReject(new ErdRejection("INVALID", index, message, "getModelText 로 다이어그램을 확인하세요", elementId, null, null, null, null, null)).
}
```

`row`·`requireDiagram`·`nodeKeys`·`restoreRow`·`reject` 는 위 주석이 정한 대로 채운다(새 판단이 필요 없는 SQL 읽기·쓰기다). `"UnsupportedOperationException"` 이 남아 있으면 안 된다.

```java
// service/ErdCommandService.java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.version.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.*;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 명령 입구(스펙 2.1-2). 화면·MCP·CLI 모두 여기로 들어온다. */
@Service
public class ErdCommandService {

    static final int MAX_BATCH = 200;

    private final ErdModelStore store;
    private final ErdDiagramStore diagrams;
    private final ErdCommandLogStore log;
    private final ErdDictionaryLoader dictionaries;
    private final VersionWriteGuard writeGuard;
    private final ErdEventHub hub;
    private final TransactionTemplate tx;

    public ErdCommandService(ErdModelStore store, ErdDiagramStore diagrams, ErdCommandLogStore log,
                             ErdDictionaryLoader dictionaries, VersionWriteGuard writeGuard, ErdEventHub hub,
                             PlatformTransactionManager transactionManager) {
        this.store = store;
        this.diagrams = diagrams;
        this.log = log;
        this.dictionaries = dictionaries;
        this.writeGuard = writeGuard;
        this.hub = hub;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public ErdApplyResult apply(String modelId, long baseRev, String userId, String session, String source, List<JsonNode> raw) {
        if (raw == null || raw.isEmpty() || raw.size() > MAX_BATCH) {
            return ErdApplyResult.rejected(baseRev, new ErdRejection(ErdRejection.INVALID, 0,
                    "명령은 1~" + MAX_BATCH + "건이어야 합니다", "나눠서 보내세요", null, null, null, null, null, null));
        }
        List<ErdCommand> modelCmds = new ArrayList<>();
        List<ErdDiagramCommand> diagramCmds = new ArrayList<>();
        try {
            for (JsonNode n : raw) {
                if (ErdDiagramCommand.isDiagramOp(n.path("op").asText())) diagramCmds.add(ErdModelCodec.MAPPER.treeToValue(n, ErdDiagramCommand.class));
                else modelCmds.add(ErdModelCodec.MAPPER.treeToValue(n, ErdCommand.class));
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return ErdApplyResult.rejected(baseRev, new ErdRejection(ErdRejection.INVALID, 0, "명령 JSON 을 읽을 수 없습니다: " + e.getOriginalMessage(),
                    "op 와 필드 이름을 확인하세요", null, null, null, null, null, null));
        }
        var dict = modelCmds.isEmpty() ? null : dictionaries.load();
        return tx.execute(status -> {
            long rev = store.lockRev(modelId);
            long newRev = rev + 1;
            List<ErdChange> changes = new ArrayList<>();
            List<ErdWarning> warnings = new ArrayList<>();
            com.fasterxml.jackson.databind.node.ArrayNode inverse = ErdModelCodec.MAPPER.createArrayNode();
            MdmErdModelVer draft = store.draft(modelId).orElse(null);
            ErdModel model = ErdModelCodec.read((draft != null ? draft : store.current(modelId)).getModelJson());
            if (!modelCmds.isEmpty()) {
                if (draft == null) {
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, notEditor("DRAFT 가 없습니다", "copy 로 새 버전을 먼저 만드세요"));
                }
                ApplyOutcome out = new ErdCommandEngine(dict).apply(model, baseRev, newRev, session, modelCmds);
                if (out instanceof ApplyOutcome.Rejected r) {
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, r.rejection());
                }
                var applied = (ApplyOutcome.Applied) out;
                VersionRef ref = new VersionRef(VersionTarget.ERD_MODEL, modelId, draft.getVer());
                try {
                    writeGuard.beginDraftWrite(ref, draft.getRowVersion(), userId);
                } catch (BusinessException e) {
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, notEditor("이 DRAFT 를 고칠 권한이 없습니다(" + e.getMessage() + ")",
                            "소유자에게 공동 편집자 등록을 요청하세요"));
                }
                store.writeJson(ref, ErdModelCodec.write(applied.next()));
                model = applied.next();
                changes.addAll(applied.changes());
                warnings.addAll(applied.warnings());
                for (ErdCommand inv : applied.inverse()) inverse.add(typed(ErdCommand.class, inv));
            }
            if (!diagramCmds.isEmpty()) {
                try {
                    var res = diagrams.apply(modelId, model, diagramCmds, modelCmds.size(), userId);
                    changes.addAll(res.changes());
                    inverse.add(typed(ErdDiagramCommand.class, res.inverse()));
                } catch (ErdDiagramStore.ErdDiagramReject r) {
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, r.rejection);
                }
            }
            store.setRev(modelId, newRev);
            log.insert(modelId, newRev, draft == null ? null : draft.getVer(), userId, session, source,
                    ErdCommandLogStore.write(raw), ErdCommandLogStore.write(inverse), changes);
            ErdDelta delta = new ErdDelta(modelId, newRev, userId, session, source, changes);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    hub.publish(delta);
                }
            });
            return new ErdApplyResult(true, newRev, changes, warnings, null);
        });
    }

    public ErdChangesView changesSince(String modelId, long sinceRev) {
        long rev = store.rev(modelId);
        return log.since(modelId, sinceRev, rev)
                .map(ds -> new ErdChangesView(rev, false, ds))
                .orElseGet(() -> new ErdChangesView(rev, true, List.of()));
    }

    /** 명령 하나 되돌리기(스펙 D18). 역명령을 새 명령으로 보낸다 — 충돌 판정은 엔진 Restore 가 한다. */
    public ErdApplyResult undo(String modelId, long rev, String userId, String session, String source) {
        String[] inv = log.inverse(modelId, rev).orElse(null);
        if (inv == null) {
            return ErdApplyResult.rejected(store.rev(modelId), new ErdRejection(ErdRejection.INVALID, 0,
                    "없는 rev 입니다: " + rev, "변경 기록에서 rev 를 고르세요", null, null, null, null, null, null));
        }
        List<JsonNode> raw = new ArrayList<>();
        try {
            ErdModelCodec.MAPPER.readTree(inv[0]).forEach(raw::add);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        return apply(modelId, store.rev(modelId), userId, session, source, raw);
    }

    /** 역명령을 op 가 붙은 JSON 으로. 구체 record 로 바로 쓰면 상위 타입의 @JsonTypeInfo(op)가 빠진다. */
    private static <T> JsonNode typed(Class<T> type, T value) {
        try {
            return ErdModelCodec.MAPPER.readTree(ErdModelCodec.MAPPER.writerFor(type).writeValueAsString(value));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ErdRejection notEditor(String message, String hint) {
        return new ErdRejection("NOT_EDITOR", 0, message, hint, null, null, null, null, null, null);
    }
}
```

`ErdApplyResult`·`ErdChangesView`:
```java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import java.util.List;

public record ErdApplyResult(boolean applied, long rev, List<ErdChange> changes, List<ErdWarning> warnings, ErdRejection rejection) {
    public static ErdApplyResult rejected(long rev, ErdRejection r) {
        return new ErdApplyResult(false, rev, List.of(), List.of(), r);
    }
}

public record ErdChangesView(long rev, boolean reload, List<com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta> deltas) {
}
```

역명령 직렬화: `inverse` 배열에는 엔진의 `Restore`(op `restore`)와 다이어그램의 `RestoreDiagram`(op `restoreDiagram`)이 `op` 가 붙은 채로 들어간다. `typed(...)` 가 상위 타입으로 써서 `op` 를 붙인다. `undoRestoresPreviousState` 시험이 이 경로를 잡는다.

- [ ] **Step 5: 시험 통과 확인**

Run: Step 2 명령. Expected: 8건 PASS.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): ERD 명령 서비스 — 모델 단위 직렬화·명령 기록·다이어그램·델타 조회·되돌리기"
```
