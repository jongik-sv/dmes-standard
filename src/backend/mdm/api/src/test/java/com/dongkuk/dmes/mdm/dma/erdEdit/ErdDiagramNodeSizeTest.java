package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 표 크기(README §7.4) — resizeNodes 왕복·범위 거절·되돌리기, 다른 다이어그램 명령의 크기 유지, 다이어그램 복사, view 응답.
 * 준비(rev 2): 표 t-a·t-b, 다이어그램 d-1 에 두 표를 놓는다. 컨텍스트는 ErdStage2ContractTest 와 같은 설정이라 함께 쓴다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdStage2ContractTest.KEY)
@ActiveProfiles("local")
class ErdDiagramNodeSizeTest extends AbstractMdmSharedDbTest {

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_DIAGRAM",
                "TB_MDM_ERD_CMD_LOG", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        ok(0, """
                [{"op":"addTable","audit":false,"id":"t-a","phys":"TB_A","logical":"에이"},
                 {"op":"addTable","audit":false,"id":"t-b","phys":"TB_B","logical":"비"}]""");
        ok(1, """
                [{"op":"addDiagram","id":"d-1","areaName":"a","diagramName":"하나"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-a","x":0,"y":0},{"table":"t-b","x":300,"y":0}]}]""");
    }

    ErdApplyResult apply(long baseRev, String json) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return commands.apply("mcm", baseRev, "owner", "ui", "UI", out);
    }

    ErdApplyResult ok(long baseRev, String json) throws Exception {
        ErdApplyResult r = apply(baseRev, json);
        assertThat(r.applied()).as(String.valueOf(r.rejection())).isTrue();
        return r;
    }

    static String resize(String table, Object w, Object h) {
        return "{\"op\":\"resizeNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"" + table + "\",\"w\":" + w + ",\"h\":" + h + "}]}";
    }

    /** [SIZE_W, SIZE_H] — NULL 은 null. */
    List<Object> size(String diagram, String table) {
        return jdbc.queryForObject("SELECT SIZE_W, SIZE_H FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?",
                (rs, i) -> {
                    List<Object> v = new ArrayList<>();
                    int w = rs.getInt(1);
                    v.add(rs.wasNull() ? null : w);
                    int h = rs.getInt(2);
                    v.add(rs.wasNull() ? null : h);
                    return v;
                }, diagram, table);
    }

    static List<Object> pair(Integer w, Integer h) {
        List<Object> v = new ArrayList<>();
        v.add(w);
        v.add(h);
        return v;
    }

    @Test
    void resizeStoresDeltaHasSizeAndUndoRestoresAuto() throws Exception {
        var r = ok(2, "[" + resize("t-a", 400, 120) + "]");  // rev 3
        assertThat(size("d-1", "t-a")).isEqualTo(pair(400, 120));
        ErdChange c = r.changes().get(0);
        assertThat(c.kind()).isEqualTo("diagramNode");
        assertThat(c.id()).isEqualTo("d-1:t-a");
        assertThat(c.value()).isEqualTo(om.readTree(
                "{\"diagram\":\"d-1\",\"table\":\"t-a\",\"x\":0,\"y\":0,\"foldMode\":\"NONE\",\"w\":400,\"h\":120}"));
        // 높이만 자동으로 되돌린다 — 델타 값에 h 키가 없다
        var auto = ok(3, "[" + resize("t-a", 400, null) + "]");  // rev 4
        assertThat(size("d-1", "t-a")).isEqualTo(pair(400, null));
        assertThat(auto.changes().get(0).value().has("h")).isFalse();
        // 되돌리기 2번 → 처음(크기 없음)으로, 값에 w·h 키가 없다
        assertThat(commands.undo("mcm", 4, "owner", "ui", "UI").applied()).isTrue();
        assertThat(size("d-1", "t-a")).isEqualTo(pair(400, 120));
        var first = commands.undo("mcm", 3, "owner", "ui", "UI");
        assertThat(first.applied()).as(String.valueOf(first.rejection())).isTrue();
        assertThat(size("d-1", "t-a")).isEqualTo(pair(null, null));
        assertThat(first.changes().get(0).value().has("w")).isFalse();
    }

    @Test
    void resizeRejectsOutOfRangeMissingTableAndBadShape() throws Exception {
        for (String bad : List.of(
                resize("t-a", 159, 100), resize("t-a", 1601, 100), resize("t-a", 200, 51), resize("t-a", 200, 4001),
                resize("t-a", 200.5, 100), resize("t-a", "\"200\"", 100), resize("t-none", 200, 100),
                "{\"op\":\"resizeNodes\",\"diagram\":\"d-1\",\"nodes\":[]}",
                "{\"op\":\"resizeNodes\",\"diagram\":\"d-1\",\"nodes\":[null]}",
                "{\"op\":\"resizeNodes\",\"diagram\":\"d-none\",\"nodes\":[{\"table\":\"t-a\",\"w\":200,\"h\":100}]}")) {
            var r = apply(2, "[" + bad + "]");
            assertThat(r.applied()).as(bad).isFalse();
            assertThat(r.rejection().code()).as(bad).isEqualTo("INVALID");
        }
        assertThat(size("d-1", "t-a")).isEqualTo(pair(null, null));
        // 경계값과 키 없음(= 자동)은 된다
        ok(2, "[" + resize("t-a", 160, 52) + "]");
        ok(3, "[" + resize("t-b", 1600, 4000) + "]");
        ok(4, "[{\"op\":\"resizeNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-a\"}]}]");
        assertThat(size("d-1", "t-a")).isEqualTo(pair(null, null));
        assertThat(size("d-1", "t-b")).isEqualTo(pair(1600, 4000));
    }

    /** 이동·접기·다시 놓기는 크기를 유지하고, 다이어그램 복사는 크기도 복사한다. 빼기는 되돌리면 크기와 함께 돌아온다. */
    @Test
    void otherCommandsKeepSizeCopyCopiesAndRemoveUndoRestores() throws Exception {
        ok(2, "[" + resize("t-a", 500, 200) + "]");  // rev 3
        ok(3, """
                [{"op":"moveNodes","diagram":"d-1","nodes":[{"table":"t-a","x":50,"y":60}]},
                 {"op":"setFold","diagram":"d-1","tables":["t-a"],"foldMode":"KEYS"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-a","x":70,"y":80}]}]""");  // rev 4
        assertThat(size("d-1", "t-a")).isEqualTo(pair(500, 200));
        ok(4, "[{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-2\"}]");  // rev 5
        assertThat(size("d-2", "t-a")).isEqualTo(pair(500, 200));
        assertThat(size("d-2", "t-b")).isEqualTo(pair(null, null));
        ok(5, "[{\"op\":\"removeFromDiagram\",\"diagram\":\"d-1\",\"tables\":[\"t-a\"]}]");  // rev 6
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = 'd-1' AND TABLE_UUID = 't-a'",
                Integer.class)).isZero();
        var undo = commands.undo("mcm", 6, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(size("d-1", "t-a")).isEqualTo(pair(500, 200));
    }

    /** 되돌리기 충돌 판정은 노드 행 전체를 본다 — 크기 바꾼 뒤 같은 표를 옮기면 크기 되돌리기는 CONFLICT. 되돌리기의 되돌리기(다시 하기)는 된다. */
    @Test
    void undoConflictsAfterLaterMoveAndRedoWorks() throws Exception {
        ok(2, "[" + resize("t-a", 400, 120) + "]");  // rev 3
        ok(3, "[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-a\",\"x\":10,\"y\":10}]}]");  // rev 4
        var conflict = commands.undo("mcm", 3, "owner", "ui", "UI");
        assertThat(conflict.applied()).isFalse();
        assertThat(conflict.rejection().code()).isEqualTo("CONFLICT");
        assertThat(size("d-1", "t-a")).isEqualTo(pair(400, 120));
        ok(4, "[" + resize("t-b", 200, 300) + "]");  // rev 5
        assertThat(commands.undo("mcm", 5, "owner", "ui", "UI").applied()).isTrue();  // rev 6
        assertThat(size("d-1", "t-b")).isEqualTo(pair(null, null));
        var redo = commands.undo("mcm", 6, "owner", "ui", "UI");
        assertThat(redo.applied()).as(String.valueOf(redo.rejection())).isTrue();
        assertThat(size("d-1", "t-b")).isEqualTo(pair(200, 300));
    }

    /** view 응답 nodes[] 에 크기가 있으면 w·h, 없으면 키가 없다. */
    @Test
    void viewCarriesSizeOnlyWhenSet() throws Exception {
        ok(2, "[" + resize("t-a", 320, 90) + "]");
        JsonNode view = new ErdTestClient(port, ErdStage2ContractTest.KEY).call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        JsonNode a = null, b = null;
        for (JsonNode n : view.path("nodes")) {
            if (n.path("table").asText().equals("t-a")) a = n;
            if (n.path("table").asText().equals("t-b")) b = n;
        }
        assertThat(a).as(view.toString()).isNotNull();
        assertThat(a.path("w").asInt()).isEqualTo(320);
        assertThat(a.path("h").asInt()).isEqualTo(90);
        assertThat(b).isNotNull();
        assertThat(b.has("w")).isFalse();
        assertThat(b.has("h")).isFalse();
    }
}
