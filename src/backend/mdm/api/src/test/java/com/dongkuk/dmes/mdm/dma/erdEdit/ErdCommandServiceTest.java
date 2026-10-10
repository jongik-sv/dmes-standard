package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
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
    @Autowired ErdModelStore store;
    @Autowired VersionStateService stateService;
    @Autowired ErdReloadMarker reloadMarker;
    @Autowired org.springframework.transaction.PlatformTransactionManager txManager;
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
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        assertThat(r.applied()).isTrue();
        assertThat(r.rev()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG", Integer.class)).isEqualTo(1);
        assertThat(seen).singleElement().satisfies(d -> assertThat(d.changes()).hasSize(1));
    }

    @Test
    void rejectionWritesNothing() throws Exception {
        ErdApplyResult r = commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-1","phys":"bad name","logical":"x"}]"""));
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isZero();
    }

    @Test
    void strangerIsNotEditorButCoEditorWrites() throws Exception {
        assertThat(commands.apply("mcm", 0, "stranger", "s", "MCP", cmds("""
                [{"op":"addTable","audit":false,"phys":"TB_A","logical":"에이"}]""")).rejection().code()).isEqualTo("NOT_EDITOR");
        versions.addEditor("mcm", "mate", "owner");
        assertThat(commands.apply("mcm", 0, "mate", "claude-a", "MCP", cmds("""
                [{"op":"addTable","audit":false,"phys":"TB_A","logical":"에이"}]""")).applied()).isTrue();
    }

    @Test
    void modelCommandWithoutDraftIsNotEditor() throws Exception {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00'");
        var r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"phys":"TB_A","logical":"에이"}]"""));
        assertThat(r.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(r.rejection().hint()).contains("copy");
    }

    @Test
    void diagramCommandWithoutDraftApplies() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00'");
        var r = commands.apply("mcm", 1, "owner", "ui-o", "UI", cmds("""
                [{"op":"addDiagram","id":"d-1","areaName":"시스템관리","diagramName":"메뉴·권한"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-1","x":40,"y":40}]}]"""));
        assertThat(r.applied()).isTrue();
        assertThat(r.changes()).extracting(c -> c.kind()).contains("diagram", "diagramNode");
    }

    @Test
    void changesSinceAndTooFar() throws Exception {
        for (int i = 0; i < 3; i++) {
            commands.apply("mcm", i, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A" + i + "\",\"logical\":\"x\"}]"));
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
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        commands.apply("mcm", 1, "owner", "ui", "UI", cmds("""
                [{"op":"updateTable","id":"t-1","set":{"logical":"바뀜"}}]"""));
        var r = commands.undo("mcm", 2, "owner", "ui", "UI");
        assertThat(r.applied()).isTrue();
        String json = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        assertThat(json).contains("\"logical\":\"에이\"");
    }

    /** audit 를 생략한 addTable 은 감사 컬럼 8개를 함께 만들고, undo 는 표와 8개를 모두 지운다. */
    @Test
    void addTableWithoutAuditFieldAddsEightAuditColumnsAndUndoRemovesThem() throws Exception {
        var r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","id":"t-1","phys":"TB_A","logical":"에이"}]"""));
        assertThat(r.applied()).isTrue();
        assertThat(r.changes().stream().filter(c -> c.kind().equals("column")).count()).isEqualTo(8);
        String json = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        for (String n : List.of("C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID")) {
            assertThat(json).contains("\"" + n + "\"");
        }
        assertThat(commands.undo("mcm", 1, "owner", "ui", "UI").applied()).isTrue();
        String after = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        assertThat(after).doesNotContain("C_USR_ID").doesNotContain("TB_A");
    }

    @Test
    void concurrentAppliesKeepRevContiguous() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        List<Future<ErdApplyResult>> fs = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            int n = i;
            fs.add(pool.submit(() -> commands.apply("mcm", 0, "owner", "s" + (n % 3), "UI",
                    cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_C" + n + "\",\"logical\":\"x\"}]"))));
        }
        for (var f : fs) assertThat(f.get(60, TimeUnit.SECONDS).applied()).isTrue();
        pool.shutdown();
        List<Long> revs = jdbc.queryForList("SELECT REV FROM TB_MDM_ERD_CMD_LOG ORDER BY REV", Long.class);
        assertThat(revs).containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L, 11L, 12L);
        String json = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        for (int i = 0; i < 12; i++) assertThat(json).contains("TB_C" + i);
    }

    // ---- Task 9 통제관 판정(R4-3 restore 직접 금지, 엄격 읽기) ----

    @Test
    void restoreCannotBeSentDirectly() throws Exception {
        for (String op : List.of("restore", "restoreDiagram")) {
            ErdApplyResult r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds(
                    "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},{\"op\":\"" + op + "\",\"elements\":[]}]"));
            assertThat(r.applied()).isFalse();
            assertThat(r.rejection().code()).isEqualTo("INVALID");
            assertThat(r.rejection().commandIndex()).isEqualTo(1);
            assertThat(r.rejection().message()).isEqualTo("restore 는 직접 보낼 수 없습니다");
            assertThat(r.rejection().hint()).contains("undo");
        }
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isZero();
    }

    private void addTableAndColumn() throws Exception {
        assertThat(commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"},
                 {"op":"addColumn","id":"c-1","table":"t-1","phys":"COL_A","logical":"에이","dataType":"VARCHAR2","length":10}]""")).applied()).isTrue();
    }

    private void assertInvalidAndUnchanged(String json, long expectedRev) throws Exception {
        ErdApplyResult r = commands.apply("mcm", expectedRev, "owner", "ui", "UI", cmds(json));
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(expectedRev);
    }

    @Test
    void fractionalLengthIsInvalid() throws Exception {
        addTableAndColumn();
        assertInvalidAndUnchanged("[{\"op\":\"addColumn\",\"table\":\"t-1\",\"phys\":\"COL_B\",\"logical\":\"비\",\"length\":3.7}]", 1);
    }

    @Test
    void stringBooleanIsInvalid() throws Exception {
        addTableAndColumn();
        assertInvalidAndUnchanged("[{\"op\":\"addColumn\",\"table\":\"t-1\",\"phys\":\"COL_B\",\"logical\":\"비\",\"notNull\":\"true\"}]", 1);
    }

    @Test
    void nullForPrimitivePositionIsInvalid() throws Exception {
        addTableAndColumn();
        assertInvalidAndUnchanged("[{\"op\":\"moveColumn\",\"id\":\"c-1\",\"position\":null}]", 1);
    }

    @Test
    void stringIntegerIsInvalid() throws Exception {
        addTableAndColumn();
        assertInvalidAndUnchanged("[{\"op\":\"moveColumn\",\"id\":\"c-1\",\"position\":\"1\"}]", 1);
    }

    @Test
    void missingPrimitivePositionIsInvalid() throws Exception {
        addTableAndColumn();
        assertInvalidAndUnchanged("[{\"op\":\"moveColumn\",\"id\":\"c-1\"}]", 1);
    }

    @Test
    void unknownOpAndNonObjectAreInvalidAtTheirIndex() throws Exception {
        var r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"에이\"},{\"op\":\"nope\"}]"));
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(r.rejection().commandIndex()).isEqualTo(1);
        var r2 = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[\"addTable\"]"));
        assertThat(r2.rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void rejectionIndexIsTheClientIndexInMixedBatch() throws Exception {
        long rowVersionBefore = jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", Long.class);
        String jsonBefore = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
        var r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addDiagram","id":"d-1","areaName":"a","diagramName":"b"},
                 {"op":"addTable","audit":false,"phys":"bad name","logical":"x"}]"""));
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(r.rejection().commandIndex()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM", Integer.class)).isZero();
        var r2 = commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"},
                 {"op":"placeTables","diagram":"d-none","nodes":[{"table":"t-1","x":1,"y":1}]}]"""));
        assertThat(r2.rejection().commandIndex()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG", Integer.class)).isZero();
        // 두 번째 거절은 엔진·쓰기 가드·JSON 쓰기를 모두 지난 뒤 다이어그램에서 난다 — 그래도 DRAFT 행은 그대로여야 한다.
        assertThat(jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", Long.class)).isEqualTo(rowVersionBefore);
        assertThat(jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class)).isEqualTo(jsonBefore);
    }

    @Test
    void diagramRejectsUnknownTableAndForeignModel() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]"));
        var noTable = commands.apply("mcm", 1, "owner", "ui", "UI", cmds("[{\"op\":\"placeTables\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-x\",\"x\":1,\"y\":1}]}]"));
        assertThat(noTable.rejection().code()).isEqualTo("INVALID");
        versions.createModel("mls", "mls", "MLSAPUSER", "MLS", "owner");
        var foreign = commands.apply("mls", 0, "owner", "ui", "UI", cmds("[{\"op\":\"updateDiagram\",\"id\":\"d-1\",\"set\":{\"diagramName\":\"침범\"}}]"));
        assertThat(foreign.rejection().code()).isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT DIAGRAM_NAME FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID='d-1'", String.class)).isEqualTo("b");
        var dup = commands.apply("mcm", 1, "owner", "ui", "UI", cmds("[{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]"));
        assertThat(dup.rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void undoRevertsDiagramChange() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        commands.apply("mcm", 1, "owner", "ui", "UI", cmds("""
                [{"op":"addDiagram","id":"d-1","areaName":"a","diagramName":"b"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-1","x":40,"y":40}]}]"""));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE", Integer.class)).isEqualTo(1);
        var r = commands.undo("mcm", 2, "owner", "ui", "UI");
        assertThat(r.applied()).isTrue();
        assertThat(r.rev()).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM", Integer.class)).isZero();
    }

    @Test
    void undoConflictsWhenLaterChangeTouchedSameProperty() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        commands.apply("mcm", 1, "owner", "ui", "UI", cmds("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"둘\"}}]"));
        commands.apply("mcm", 2, "owner", "other", "MCP", cmds("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"셋\"}}]"));
        var r = commands.undo("mcm", 2, "owner", "ui", "UI");
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("CONFLICT");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(3);
    }

    @Test
    void undoUnknownRevIsInvalid() throws Exception {
        var r = commands.undo("mcm", 77, "owner", "ui", "UI");
        assertThat(r.rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void invalidSourceIsRejectedNotThrown() throws Exception {
        var r = commands.apply("mcm", 0, "owner", "ui", "WEB", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(r.rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void largeBatchPersistsLogClobsOver32k() throws Exception {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < 200; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_L").append(i).append("\",\"logical\":\"큰묶음").append(i)
                    .append("\",\"comment\":\"").append("설명".repeat(60)).append("\"}");
        }
        var r = commands.apply("mcm", 0, "owner", "ui", "UI", cmds(sb.append(']').toString()));
        assertThat(r.applied()).isTrue();
        assertThat(jdbc.queryForObject("SELECT LENGTH(CHANGES_JSON) FROM TB_MDM_ERD_CMD_LOG", Integer.class)).isGreaterThan(40_000);
        var v = commands.changesSince("mcm", 0);
        assertThat(v.deltas()).hasSize(1);
        assertThat(v.deltas().get(0).changes()).hasSize(200);
        var u = commands.undo("mcm", 1, "owner", "ui", "UI");
        assertThat(u.applied()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG", Integer.class)).isEqualTo(2);
    }

    // ---- Task 9 fix 1 ----

    private void released() {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00'");
    }

    @Test
    void diagramCommandByStrangerIsNotEditor() throws Exception {
        String add = "[{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]";
        var withDraft = commands.apply("mcm", 0, "stranger", "s", "UI", cmds(add));
        assertThat(withDraft.applied()).isFalse();
        assertThat(withDraft.rejection().code()).isEqualTo("NOT_EDITOR");
        released();
        var noDraft = commands.apply("mcm", 0, "stranger", "s", "UI", cmds(add));
        assertThat(noDraft.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG", Integer.class)).isZero();
    }

    @Test
    void coEditorMayEditDiagramOnReleasedVersion() throws Exception {
        versions.addEditor("mcm", "mate", "owner");
        released();
        var r = commands.apply("mcm", 0, "mate", "s", "UI", cmds("[{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]"));
        assertThat(r.applied()).isTrue();
    }

    @Test
    void baseRevAboveCurrentRevIsInvalid() throws Exception {
        var r = commands.apply("mcm", 5, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(r.rejection().message()).contains("현재 rev(0)");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isZero();
    }

    private static final String PARENT_CHILD = """
            [{"op":"addTable","audit":false,"id":"t-r","phys":"TB_ROLE","logical":"역할"},
             {"op":"addColumn","id":"c-r1","table":"t-r","phys":"ROLE_ID","logical":"역할아이디","dataType":"VARCHAR2","length":30,"notNull":true},
             {"op":"setPrimaryKey","table":"t-r","columns":["c-r1"]},
             {"op":"addTable","audit":false,"id":"t-m","phys":"TB_MAPPING","logical":"매핑"}]""";

    @Test
    void addRelationWithoutIdentifyingDefaultsToFalse() throws Exception {
        assertThat(commands.apply("mcm", 0, "owner", "ui", "UI", cmds(PARENT_CHILD)).applied()).isTrue();
        var r = commands.apply("mcm", 1, "owner", "ui", "UI", cmds("[{\"op\":\"addRelation\",\"id\":\"r-1\",\"child\":\"t-m\",\"parent\":\"t-r\"}]"));
        assertThat(r.applied()).as(String.valueOf(r.rejection())).isTrue();
        var rel = r.changes().stream().filter(c -> c.kind().equals("relation")).findFirst().orElseThrow();
        assertThat(rel.value().path("identifying").asBoolean(true)).isFalse();
        // 명시한 null·틀린 형은 그대로 거절
        for (String bad : List.of("null", "\"true\"", "1")) {
            var b = commands.apply("mcm", 2, "owner", "ui", "UI", cmds("[{\"op\":\"addRelation\",\"id\":\"r-2\",\"child\":\"t-m\",\"parent\":\"t-r\",\"identifying\":" + bad + "}]"));
            assertThat(b.rejection().code()).as(bad).isEqualTo("INVALID");
        }
    }

    private void placeNode() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        commands.apply("mcm", 1, "owner", "ui", "UI", cmds("""
                [{"op":"addDiagram","id":"d-1","areaName":"a","diagramName":"b"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-1","x":10,"y":10}]}]"""));
    }

    @Test
    void diagramUndoConflictsWhenSameNodeMovedLater() throws Exception {
        placeNode();  // rev 2
        commands.apply("mcm", 2, "owner", "ui-a", "UI", cmds("[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-1\",\"x\":100,\"y\":100}]}]"));   // rev 3
        commands.apply("mcm", 3, "owner", "ui-b", "UI", cmds("[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-1\",\"x\":200,\"y\":200}]}]"));   // rev 4
        var r = commands.undo("mcm", 3, "owner", "ui-a", "UI");
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("CONFLICT");
        assertThat(r.rejection().message()).isEqualTo("되돌리려는 뒤에 이 다이어그램 요소가 바뀌었습니다");
        assertThat(jdbc.queryForObject("SELECT POS_X FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-1'", Integer.class)).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(4);
        // 마지막 이동은 되돌려진다(그 뒤에 아무도 안 건드렸다)
        assertThat(commands.undo("mcm", 4, "owner", "ui-b", "UI").applied()).isTrue();
        assertThat(jdbc.queryForObject("SELECT POS_X FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-1'", Integer.class)).isEqualTo(100);
    }

    @Test
    void diagramUndoConflictsWhenDiagramDeletedLater() throws Exception {
        placeNode();  // rev 2
        commands.apply("mcm", 2, "owner", "ui", "UI", cmds("[{\"op\":\"deleteDiagram\",\"id\":\"d-1\"}]"));  // rev 3
        var r = commands.undo("mcm", 2, "owner", "ui", "UI");
        assertThat(r.rejection().code()).isEqualTo("CONFLICT");
    }

    @Test
    void restoreNeverTouchesAnotherModelsDiagram() throws Exception {
        versions.createModel("mls", "mls", "MLSAPUSER", "MLS", "owner");
        commands.apply("mls", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        commands.apply("mls", 1, "owner", "ui", "UI", cmds("""
                [{"op":"addDiagram","id":"d-m","areaName":"a","diagramName":"b"},
                 {"op":"placeTables","diagram":"d-m","nodes":[{"table":"t-1","x":7,"y":7}]}]"""));
        // mcm 의 기록 한 건을 mls 의 다이어그램을 가리키도록 손댄다(로그 변조·id 재사용 가정)
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_B\",\"logical\":\"비\"}]"));
        for (String el : List.of("{\"kind\":\"diagramNode\",\"id\":\"d-m:t-1\",\"op\":\"delete\",\"value\":null}",
                "{\"kind\":\"diagram\",\"id\":\"d-m\",\"op\":\"delete\",\"value\":null}")) {
            jdbc.update("UPDATE TB_MDM_ERD_CMD_LOG SET INVERSE_JSON = ? WHERE ERD_MODEL_ID='mcm' AND REV=1",
                    "[{\"op\":\"restoreDiagram\",\"elements\":[" + el + "]}]");
            var r = commands.undo("mcm", 1, "owner", "ui", "UI");
            assertThat(r.applied()).isFalse();
            assertThat(r.rejection().code()).isEqualTo("INVALID");
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-m'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID='d-m'", Integer.class)).isEqualTo(1);
    }

    @Test
    void removeFromDiagramMissingNodeIsInvalid() throws Exception {
        placeNode();
        var r = commands.apply("mcm", 2, "owner", "ui", "UI", cmds("[{\"op\":\"removeFromDiagram\",\"diagram\":\"d-1\",\"tables\":[\"t-zzz\"]}]"));
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(2);
    }

    @Test
    void changesSinceAheadOfServerReloads() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        var ahead = commands.changesSince("mcm", 5);
        assertThat(ahead.reload()).isTrue();
        assertThat(ahead.rev()).isEqualTo(1);
        assertThat(commands.changesSince("mcm", 1).reload()).isFalse();
        assertThat(commands.changesSince("mcm", 1).deltas()).isEmpty();
    }

    @Test
    void preLockRejectionReturnsCurrentRev() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        var r = commands.apply("mcm", 0, "owner", "ui", "WEB", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_B\",\"logical\":\"비\"}]"));
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(r.rev()).isEqualTo(1);
    }

    // ---- 최종 검토 B1·B2·B3 ----

    /** B1: 권한은 엔진 판정보다 먼저 본다(스펙 2.1 순서) — 엔진이 INVALID 로 거절할 명령도 남이 보내면 NOT_EDITOR 다. B3: 소유자를 싣는다. */
    @Test
    void strangerIsNotEditorBeforeEngineValidation() throws Exception {
        var r = commands.apply("mcm", 0, "stranger", "s", "MCP", cmds("""
                [{"op":"addTable","audit":false,"phys":"bad name","logical":"x"}]"""));
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(r.rejection().ownerId()).isEqualTo("owner");
        assertThat(r.rejection().hint()).contains("공동 편집자");
    }

    /** B3: 다이어그램 경로의 NOT_EDITOR 도 소유자를 싣는다. */
    @Test
    void diagramNotEditorCarriesOwner() throws Exception {
        var r = commands.apply("mcm", 0, "stranger", "s", "UI", cmds("[{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]"));
        assertThat(r.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(r.rejection().ownerId()).isEqualTo("owner");
    }

    private VersionRef draftRef() {
        return new VersionRef(VersionTarget.ERD_MODEL, "mcm", store.draft("mcm").orElseThrow().getVer());
    }

    private void deleteDraft() {
        var d = store.draft("mcm").orElseThrow();
        stateService.deleteDraft(new VersionRef(VersionTarget.ERD_MODEL, "mcm", d.getVer()), d.getRowVersion(), "owner");
    }

    /** B2: DRAFT 삭제는 rev 를 올리고 SYSTEM 표시 행을 남긴다 — 그 표시를 건너는 changesSince 는 reload, 커밋 뒤 표시 델타를 알린다. */
    @Test
    void deleteDraftBumpsRevAndChangesSinceReloads() throws Exception {
        released();
        versions.newVersion("mcm", "MINOR", "owner");                                                    // rev 1 (표시)
        List<ErdDelta> seen = new CopyOnWriteArrayList<>();
        Runnable off = hub.addListenerForTest("mcm", seen::add);
        assertThat(commands.apply("mcm", 1, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]")).applied()).isTrue(); // rev 2
        deleteDraft();                                                                                   // rev 3 (표시)
        off.run();
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT SOURCE FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID='mcm' AND REV=3", String.class)).isEqualTo("SYSTEM");
        var crossing = commands.changesSince("mcm", 2);
        assertThat(crossing.reload()).isTrue();
        assertThat(crossing.rev()).isEqualTo(3);
        assertThat(commands.changesSince("mcm", 1).reload()).isTrue();
        assertThat(commands.changesSince("mcm", 3).reload()).isFalse();
        assertThat(seen).extracting(ErdDelta::rev).containsExactly(2L, 3L);
        assertThat(seen.get(1).source()).isEqualTo("SYSTEM");
    }

    /** I1: 확정 버전이 없는 모델의 첫 DRAFT 는 지울 수 없다 — 지우면 모델에 버전이 하나도 없어 모듈이 막힌다(B6 모듈 유일). */
    @Test
    void firstDraftOfNeverReleasedModelCannotBeDeleted() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        org.assertj.core.api.Assertions.assertThatThrownBy(this::deleteDraft)
                .isInstanceOf(com.dongkuk.dmes.cactus.common.BusinessException.class)
                .satisfies(e -> assertThat(((com.dongkuk.dmes.cactus.common.BusinessException) e).getErrors().get(0).code())
                        .isEqualTo(com.dongkuk.dmes.mdm.contract.common.MdmErrorCode.TRANSITION_NOT_ALLOWED.code()));
        assertThat(store.draft("mcm")).isPresent();
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE SOURCE='SYSTEM'", Integer.class)).isZero();
    }

    /** M2: 클라이언트 명령도 baseRev 뒤에 표시(DRAFT 삭제·새 DRAFT)가 있으면 INVALID — 요소 rev 로는 통째 교체를 못 본다. */
    @Test
    void applyWithBaseRevBeforeMarkerIsInvalid() throws Exception {
        released();
        versions.newVersion("mcm", "MINOR", "owner");                                                    // rev 1 (표시)
        var r = commands.apply("mcm", 0, "owner", "mcp", "MCP", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(r.rejection().hint()).contains("getChangesSince");
        assertThat(r.rev()).isEqualTo(1);
        // 다이어그램 명령도 같다(같은 baseRev 계약)
        var d = commands.apply("mcm", 0, "owner", "mcp", "MCP", cmds("[{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]"));
        assertThat(d.rejection().code()).isEqualTo("INVALID");
        assertThat(commands.apply("mcm", 1, "owner", "mcp", "MCP", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]")).applied()).isTrue();
    }

    /** M4: 표시 행 USER_ID(50자)를 넘는 사용자 id 는 SYSTEM 으로 남긴다(S001 이 아니다). */
    @Test
    void markerUserLongerThanColumnFallsBackToSystem() {
        new org.springframework.transaction.support.TransactionTemplate(txManager)
                .executeWithoutResult(s -> reloadMarker.mark("mcm", new BigDecimal("1.000"), "u".repeat(51), ErdReloadMarker.DRAFT_DELETED));
        assertThat(jdbc.queryForObject("SELECT USER_ID FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID='mcm' AND REV=1", String.class)).isEqualTo("SYSTEM");
        new org.springframework.transaction.support.TransactionTemplate(txManager)
                .executeWithoutResult(s -> reloadMarker.mark("mcm", new BigDecimal("1.000"), "u".repeat(50), ErdReloadMarker.DRAFT_DELETED));
        assertThat(jdbc.queryForObject("SELECT USER_ID FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID='mcm' AND REV=2", String.class)).isEqualTo("u".repeat(50));
    }

    /** B2: 새 DRAFT(copy)도 같은 표시를 남긴다. */
    @Test
    void newVersionBumpsRevAndChangesSinceReloads() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        released();
        versions.newVersion("mcm", "MINOR", "owner");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(2);
        assertThat(commands.changesSince("mcm", 1).reload()).isTrue();
        assertThat(commands.changesSince("mcm", 2).reload()).isFalse();
        // 표시 뒤의 명령은 평소처럼 델타로 받는다
        commands.apply("mcm", 2, "owner", "ui", "UI", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_B\",\"logical\":\"x\"}]"));
        var after = commands.changesSince("mcm", 2);
        assertThat(after.reload()).isFalse();
        assertThat(after.deltas()).extracting(ErdDelta::rev).containsExactly(3L);
    }

    /** B2: 지운 DRAFT 의 명령을 다음 DRAFT 로 되돌릴 수 없다 — 사이에 표시가 있으면 INVALID. 표시 뒤의 명령은 되돌린다. */
    @Test
    void undoAcrossDraftMarkerIsInvalid() throws Exception {
        released();
        versions.newVersion("mcm", "MINOR", "owner");                                                    // rev 1 (표시)
        assertThat(commands.apply("mcm", 1, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"}]""")).applied()).isTrue();  // rev 2
        deleteDraft();                                                                                   // rev 3 (표시)
        versions.newVersion("mcm", "MINOR", "owner");                                                    // rev 4 (표시), 같은 번호 1.001
        var r = commands.undo("mcm", 2, "owner", "ui", "UI");
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        // M5: 권한이 먼저다 — 남이 표시를 건너 되돌리면 NOT_EDITOR.
        assertThat(commands.undo("mcm", 2, "stranger", "s", "UI").rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class)).isEqualTo(4);
        assertThat(commands.apply("mcm", 4, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-2","phys":"TB_B","logical":"비"}]""")).applied()).isTrue();    // rev 5
        assertThat(commands.undo("mcm", 5, "owner", "ui", "UI").applied()).isTrue();
        assertThat(draftRef().ver()).isEqualByComparingTo(new BigDecimal("1.001"));
    }

    /** 표시 행은 SYSTEM 출처 전용이다 — 명령은 SYSTEM 으로 보낼 수 없다. */
    @Test
    void systemSourceIsReservedForMarkers() throws Exception {
        var r = commands.apply("mcm", 0, "owner", "ui", "SYSTEM", cmds("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(r.rejection().code()).isEqualTo("INVALID");
    }

    /** B2: 새 DRAFT 표시 하나만으로도 되돌리기를 막는다 — 복사한 DRAFT 에 같은 표가 있어 막지 않으면 조용히 옛 버전 명령이 되돌려진다. */
    @Test
    void undoAcrossCopyMarkerIsInvalid() throws Exception {
        assertThat(commands.apply("mcm", 0, "owner", "ui", "UI", cmds("""
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"}]""")).applied()).isTrue();  // rev 1 (1.000)
        released();
        versions.newVersion("mcm", "MINOR", "owner");                                                    // rev 2 (표시)
        var r = commands.undo("mcm", 1, "owner", "ui", "UI");
        assertThat(r.applied()).isFalse();
        assertThat(r.rejection().code()).isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class)).contains("TB_A");
    }
}
