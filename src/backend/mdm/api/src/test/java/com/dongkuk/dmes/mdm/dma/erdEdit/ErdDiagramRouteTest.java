package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
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
 * 관계선 꺾임점(ERD 2차 §7.1)·끝점 변(README §7.5) — setRoute·clearRoutes·setRouteSides, 관계·표·다이어그램 삭제의 연쇄 삭제와 되돌리기 1번 복원, 델타.
 * 준비(rev 3): 표 t-r(부모)·t-m(자식)·t-x, 관계 r-1(t-m → t-r), 다이어그램 d-1·d-2 에 세 표를 놓는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdStage2ContractTest.KEY)
@ActiveProfiles("local")
class ErdDiagramRouteTest extends AbstractMdmSharedDbTest {

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    final ObjectMapper om = new ObjectMapper();

    static final String P1 = "[{\"x\":10,\"y\":20},{\"x\":30,\"y\":-40}]";

    @BeforeEach
    void setUp() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_DIAGRAM",
                "TB_MDM_ERD_CMD_LOG", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        ok(0, """
                [{"op":"addTable","audit":false,"id":"t-r","phys":"TB_ROLE","logical":"역할"},
                 {"op":"addColumn","id":"c-r1","table":"t-r","phys":"ROLE_ID","logical":"역할아이디","dataType":"VARCHAR2","length":30,"notNull":true},
                 {"op":"setPrimaryKey","table":"t-r","columns":["c-r1"]},
                 {"op":"addTable","audit":false,"id":"t-m","phys":"TB_MAPPING","logical":"매핑"},
                 {"op":"addTable","audit":false,"id":"t-x","phys":"TB_OTHER","logical":"기타"}]""");
        ok(1, "[{\"op\":\"addRelation\",\"id\":\"r-1\",\"child\":\"t-m\",\"parent\":\"t-r\"}]");
        ok(2, """
                [{"op":"addDiagram","id":"d-1","areaName":"a","diagramName":"하나"},
                 {"op":"addDiagram","id":"d-2","areaName":"a","diagramName":"둘"},
                 {"op":"placeTables","diagram":"d-1","nodes":[{"table":"t-r","x":0,"y":0},{"table":"t-m","x":300,"y":0},{"table":"t-x","x":600,"y":0}]},
                 {"op":"placeTables","diagram":"d-2","nodes":[{"table":"t-r","x":0,"y":0},{"table":"t-m","x":0,"y":300}]}]""");
    }

    List<JsonNode> cmds(String json) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return out;
    }

    ErdApplyResult apply(long baseRev, String json) throws Exception {
        return commands.apply("mcm", baseRev, "owner", "ui", "UI", cmds(json));
    }

    ErdApplyResult ok(long baseRev, String json) throws Exception {
        ErdApplyResult r = apply(baseRev, json);
        assertThat(r.applied()).as(String.valueOf(r.rejection())).isTrue();
        return r;
    }

    static String setRoute(String diagram, String relation, String points) {
        return "{\"op\":\"setRoute\",\"diagram\":\"" + diagram + "\",\"relation\":\"" + relation + "\",\"points\":" + points + "}";
    }

    long rev() {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID='mcm'", Long.class);
    }

    int routes(String diagram) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ?", Integer.class, diagram);
    }

    JsonNode points(String diagram, String relation) throws Exception {
        List<String> v = jdbc.queryForList("SELECT POINTS_JSON FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ? AND REL_UUID = ?",
                String.class, diagram, relation);
        return v.isEmpty() ? null : om.readTree(v.get(0));
    }

    /** 두 다이어그램에 r-1 꺾임점을 둔다(rev 4). */
    void routeBoth() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "," + setRoute("d-2", "r-1", "[{\"x\":5,\"y\":5}]") + "]");
    }

    static List<String> routeChanges(ErdApplyResult r) {
        return r.changes().stream().filter(c -> c.kind().equals("diagramRoute")).map(c -> c.id() + "|" + c.op()).toList();
    }

    @Test
    void setRouteStoresThenReplacesAndDeltaHasValue() throws Exception {
        var r = ok(3, "[" + setRoute("d-1", "r-1", P1) + "]");
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        ErdChange c = r.changes().stream().filter(x -> x.kind().equals("diagramRoute")).findFirst().orElseThrow();
        assertThat(c.id()).isEqualTo("d-1:r-1");
        assertThat(c.op()).isEqualTo(ErdChange.UPSERT);
        assertThat(c.value()).isEqualTo(om.readTree("{\"diagram\":\"d-1\",\"relation\":\"r-1\",\"points\":" + P1 + "}"));
        // 다시 보내면 통째로 바꾼다
        ok(4, "[" + setRoute("d-1", "r-1", "[{\"x\":1,\"y\":2}]") + "]");
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree("[{\"x\":1,\"y\":2}]"));
        assertThat(routes("d-1")).isEqualTo(1);
        // getChangesSince 가 diagramRoute 델타를 준다
        var v = commands.changesSince("mcm", 3);
        assertThat(v.reload()).isFalse();
        assertThat(v.deltas()).extracting(ErdDelta::rev).containsExactly(4L, 5L);
        ErdChange last = v.deltas().get(1).changes().get(0);
        assertThat(last.kind()).isEqualTo("diagramRoute");
        assertThat(last.id()).isEqualTo("d-1:r-1");
        assertThat(last.value().path("points").get(0).path("y").asInt()).isEqualTo(2);
    }

    @Test
    void setRouteRejectsBadPointsUnknownRelationAndDiagram() throws Exception {
        String fifty = pointsOf(50);
        String many = pointsOf(51);
        for (String bad : List.of(
                setRoute("d-1", "r-1", "[]"),
                setRoute("d-1", "r-1", many),
                setRoute("d-1", "r-1", "[{\"x\":1.5,\"y\":2}]"),
                setRoute("d-1", "r-1", "[{\"x\":1,\"y\":\"2\"}]"),
                setRoute("d-1", "r-1", "[{\"x\":1}]"),
                setRoute("d-1", "r-1", "[null]"),
                setRoute("d-1", "r-1", "null"),
                "{\"op\":\"setRoute\",\"diagram\":\"d-1\",\"relation\":\"r-1\"}",
                setRoute("d-1", "r-none", P1),
                setRoute("d-none", "r-1", P1),
                "{\"op\":\"setRoute\",\"diagram\":\"d-1\",\"points\":" + P1 + "}")) {
            var r = apply(3, "[" + bad + "]");
            assertThat(r.applied()).as(bad).isFalse();
            // 값 규칙 위반 = INVALID, 엄격 읽기(필드 형식) 실패 = BAD_COMMAND(erd-side-2)
            assertThat(r.rejection().code()).as(bad).isIn("INVALID", "BAD_COMMAND");
        }
        assertThat(rev()).isEqualTo(3);
        assertThat(routes("d-1")).isZero();
        // 50개는 된다
        ok(3, "[" + setRoute("d-1", "r-1", fifty) + "]");
        assertThat(points("d-1", "r-1").size()).isEqualTo(50);
    }

    static String pointsOf(int n) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < n; i++) sb.append(i == 0 ? "" : ",").append("{\"x\":").append(i).append(",\"y\":0}");
        return sb.append(']').toString();
    }

    @Test
    void clearRoutesDeletesListedAndIgnoresMissing() throws Exception {
        routeBoth();
        var r = ok(4, "[{\"op\":\"clearRoutes\",\"diagram\":\"d-1\",\"relations\":[\"r-1\",\"r-none\"]}]");
        assertThat(routes("d-1")).isZero();
        assertThat(routes("d-2")).isEqualTo(1);
        // 없던 꺾임점(r-none)은 델타에 넣지 않는다
        assertThat(routeChanges(r)).containsExactly("d-1:r-1|delete");
        // null 목록·null 항목·없는 다이어그램은 거절하고 아무것도 쓰지 않는다
        for (String bad : List.of("{\"op\":\"clearRoutes\",\"diagram\":\"d-2\",\"relations\":null}",
                "{\"op\":\"clearRoutes\",\"diagram\":\"d-2\"}",
                "{\"op\":\"clearRoutes\",\"diagram\":\"d-2\",\"relations\":[null]}",
                "{\"op\":\"clearRoutes\",\"diagram\":\"d-none\",\"relations\":[\"r-1\"]}")) {
            var b = apply(5, "[" + bad + "]");
            assertThat(b.applied()).as(bad).isFalse();
            assertThat(b.rejection().code()).as(bad).isEqualTo("INVALID");
        }
        assertThat(rev()).isEqualTo(5);
        assertThat(routes("d-2")).isEqualTo(1);
        // 되돌리면 꺾임점이 돌아온다
        assertThat(commands.undo("mcm", 5, "owner", "ui", "UI").applied()).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
    }

    /** 빈 relations 는 거절하지 않는다(조정 결정 10-12) — 걸린 관계가 없는 표를 [자동 배치]로 옮긴 묶음이 그대로 들어간다. */
    @Test
    void emptyClearRoutesIsNoOpAndDoesNotRejectAutoLayoutBatch() throws Exception {
        routeBoth();
        var r = ok(4, "[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-x\",\"x\":5,\"y\":5}]},"
                + "{\"op\":\"clearRoutes\",\"diagram\":\"d-1\",\"relations\":[]}]");
        assertThat(routeChanges(r)).isEmpty();
        assertThat(r.changes()).extracting(ErdChange::id).containsExactly("d-1:t-x");
        assertThat(routes("d-1")).isEqualTo(1);
        // 빈 clearRoutes 하나만 보내도 거절하지 않는다(rev 는 다른 묶음처럼 오른다 — 반영된 묶음 = 새 rev 계약)
        var only = ok(5, "[{\"op\":\"clearRoutes\",\"diagram\":\"d-1\",\"relations\":[]}]");
        assertThat(only.changes()).isEmpty();
        assertThat(only.rev()).isEqualTo(6);
    }

    /** §7.1 [자동 배치] = moveNodes 와 clearRoutes 한 묶음. 되돌리기 1번으로 표 위치와 꺾임점이 함께 돌아온다. */
    @Test
    void autoLayoutBatchMoveAndClearUndoesInOneStep() throws Exception {
        routeBoth();
        var r = ok(4, "[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-m\",\"x\":900,\"y\":900},{\"table\":\"t-r\",\"x\":10,\"y\":10}]},"
                + "{\"op\":\"clearRoutes\",\"diagram\":\"d-1\",\"relations\":[\"r-1\"]}]");  // rev 5
        assertThat(routeChanges(r)).containsExactly("d-1:r-1|delete");
        assertThat(routes("d-1")).isZero();
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(jdbc.queryForObject("SELECT POS_X FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-1' AND TABLE_UUID='t-m'", Integer.class))
                .isEqualTo(300);
        assertThat(jdbc.queryForObject("SELECT POS_X FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-1' AND TABLE_UUID='t-r'", Integer.class))
                .isZero();
    }

    /**
     * b1 검토 major: 관계 삭제(꺾임점 연쇄) 뒤 꺾임점의 다이어그램 하나가 지워져도 관계 삭제 되돌리기는 들어간다.
     * 지워진 다이어그램의 꺾임점만 건너뛰고, 그 꺾임점은 델타에 없다(없던 행 → 없는 행).
     */
    @Test
    void undoRelationDeleteSkipsRouteOfDiagramDeletedMeanwhile() throws Exception {
        routeBoth();                                                                  // rev 4
        ok(4, "[{\"op\":\"deleteRelation\",\"id\":\"r-1\"}]");                         // rev 5
        ok(5, "[{\"op\":\"deleteDiagram\",\"id\":\"d-2\"}]");                          // rev 6
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(relations().has("r-1")).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(routes("d-2")).isZero();
        assertThat(routeChanges(undo)).containsExactly("d-1:r-1|upsert");
        // 그 되돌리기의 역명령에도 d-2 꺾임점이 없다
        String inv = jdbc.queryForObject("SELECT INVERSE_JSON FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID='mcm' AND REV=7", String.class);
        assertThat(inv).contains("d-1:r-1").doesNotContain("d-2:r-1");
    }

    /** deleteColumn 이 관계 짝의 컬럼을 지우면 관계가 지워지고, 그 꺾임점도 같은 rev 에 지워진다. */
    @Test
    void deleteColumnDroppingRelationDropsRoutesAndUndoRestores() throws Exception {
        routeBoth();
        var del = ok(4, "[{\"op\":\"deleteColumn\",\"id\":\"c-r1\"}]");               // rev 5 — 부모 PK 컬럼(짝에 든다)
        assertThat(del.changes()).anyMatch(c -> c.kind().equals("relation") && c.op().equals(ErdChange.DELETE));
        assertThat(routeChanges(del)).containsExactlyInAnyOrder("d-1:r-1|delete", "d-2:r-1|delete");
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(relations().has("r-1")).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(points("d-2", "r-1")).isEqualTo(om.readTree("[{\"x\":5,\"y\":5}]"));
    }

    @Test
    void deleteRelationDropsRoutesInAllDiagramsAndOneUndoRestoresAll() throws Exception {
        routeBoth();
        var del = ok(4, "[{\"op\":\"deleteRelation\",\"id\":\"r-1\"}]");
        assertThat(del.rev()).isEqualTo(5);
        assertThat(routes("d-1") + routes("d-2")).isZero();
        assertThat(routeChanges(del)).containsExactlyInAnyOrder("d-1:r-1|delete", "d-2:r-1|delete");
        assertThat(del.changes()).anyMatch(c -> c.kind().equals("relation") && c.op().equals(ErdChange.DELETE));
        // 되돌리기 1번 = 관계와 두 꺾임점
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(relations().has("r-1")).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(points("d-2", "r-1")).isEqualTo(om.readTree("[{\"x\":5,\"y\":5}]"));
        // 되돌리기를 되돌리면 다시 지워진다(충돌 없음)
        var redo = commands.undo("mcm", 6, "owner", "ui", "UI");
        assertThat(redo.applied()).as(String.valueOf(redo.rejection())).isTrue();
        assertThat(routes("d-1") + routes("d-2")).isZero();
    }

    @Test
    void deleteTableDropsRoutesOfAttachedRelationsAndUndoRestores() throws Exception {
        routeBoth();
        var del = ok(4, "[{\"op\":\"deleteTable\",\"id\":\"t-m\"}]");  // rev 5
        assertThat(routes("d-1") + routes("d-2")).isZero();
        assertThat(routeChanges(del)).containsExactlyInAnyOrder("d-1:r-1|delete", "d-2:r-1|delete");
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(points("d-2", "r-1")).isEqualTo(om.readTree("[{\"x\":5,\"y\":5}]"));
    }

    @Test
    void deleteDiagramDropsItsRoutesAndUndoRestores() throws Exception {
        routeBoth();
        var del = ok(4, "[{\"op\":\"deleteDiagram\",\"id\":\"d-1\"}]");
        assertThat(routes("d-1")).isZero();
        assertThat(routes("d-2")).isEqualTo(1);
        assertThat(routeChanges(del)).containsExactly("d-1:r-1|delete");
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-1'", Integer.class)).isEqualTo(3);
    }

    @Test
    void undoAddDiagramWithRoutesLaterDeletesRoutesToo() throws Exception {
        ok(3, "[{\"op\":\"addDiagram\",\"id\":\"d-3\",\"areaName\":\"a\",\"diagramName\":\"셋\"}]");  // rev 4
        ok(4, "[" + setRoute("d-3", "r-1", P1) + "]");  // rev 5
        var undo = commands.undo("mcm", 4, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(routes("d-3")).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID='d-3'", Integer.class)).isZero();
    }

    @Test
    void removeFromDiagramDropsRoutesOfThatTableInThatDiagramOnly() throws Exception {
        routeBoth();
        var r = ok(4, "[{\"op\":\"removeFromDiagram\",\"diagram\":\"d-1\",\"tables\":[\"t-r\"]}]");
        assertThat(routes("d-1")).isZero();
        assertThat(routes("d-2")).isEqualTo(1);
        assertThat(routeChanges(r)).containsExactly("d-1:r-1|delete");
        // 되돌리기 1번 = 노드와 꺾임점(rev 6)
        assertThat(commands.undo("mcm", 5, "owner", "ui", "UI").applied()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID='d-1' AND TABLE_UUID='t-r'",
                Integer.class)).isEqualTo(1);
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        // 관계가 없는 표를 빼면 꺾임점은 그대로
        var none = ok(6, "[{\"op\":\"removeFromDiagram\",\"diagram\":\"d-1\",\"tables\":[\"t-x\"]}]");
        assertThat(routeChanges(none)).isEmpty();
        assertThat(routes("d-1")).isEqualTo(1);
    }

    @Test
    void moveNodesKeepsRoutes() throws Exception {
        routeBoth();
        ok(4, "[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-m\",\"x\":900,\"y\":900}]}]");
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
    }

    /** 관계를 만들고 같은 묶음에서 꺾임점을 둔 변경을 되돌리면 — 엔진이 관계를 지우는 연쇄가 꺾임점 되돌리기보다 먼저 돌면 거짓 CONFLICT 가 난다. */
    @Test
    void undoAddRelationWithRouteInSameBatchHasNoFalseConflict() throws Exception {
        ok(3, "[{\"op\":\"addRelation\",\"id\":\"r-2\",\"child\":\"t-x\",\"parent\":\"t-r\"}," + setRoute("d-1", "r-2", P1) + "]");  // rev 4
        var undo = commands.undo("mcm", 4, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(points("d-1", "r-2")).isNull();
        assertThat(relations().has("r-2")).isFalse();
    }

    @Test
    void staleBaseRevSetRouteAppliesButUndoConflictsWhenRouteChangedLater() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "]");  // rev 4
        // 다이어그램 명령은 moveNodes 처럼 낡은 baseRev 로도 들어간다(나중 쓰기가 이긴다)
        var later = commands.apply("mcm", 3, "owner", "ui-b", "UI", cmds("[" + setRoute("d-1", "r-1", "[{\"x\":7,\"y\":7}]") + "]"));  // rev 5
        assertThat(later.applied()).as(String.valueOf(later.rejection())).isTrue();
        var undo = commands.undo("mcm", 4, "owner", "ui", "UI");
        assertThat(undo.applied()).isFalse();
        assertThat(undo.rejection().code()).isEqualTo("CONFLICT");
        assertThat(rev()).isEqualTo(5);
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree("[{\"x\":7,\"y\":7}]"));
        // 마지막 변경은 되돌려진다
        assertThat(commands.undo("mcm", 5, "owner", "ui-b", "UI").applied()).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
    }

    @Test
    void strangerCannotSetRoute() throws Exception {
        var r = commands.apply("mcm", 3, "stranger", "s", "UI", cmds("[" + setRoute("d-1", "r-1", P1) + "]"));
        assertThat(r.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(routes("d-1")).isZero();
    }

    // ---- 끝점 변 setRouteSides (README §7.5) ----

    static String sides(String diagram, String relation, String child, String parent) {
        return "{\"op\":\"setRouteSides\",\"diagram\":\"" + diagram + "\",\"relation\":\"" + relation + "\",\"childSide\":"
                + (child == null ? "null" : "\"" + child + "\"") + ",\"parentSide\":" + (parent == null ? "null" : "\"" + parent + "\"") + "}";
    }

    /** [CHILD_SIDE, PARENT_SIDE] (NULL 은 null). 행이 없으면 null. */
    List<String> dbSides(String diagram, String relation) {
        List<List<String>> v = jdbc.query("SELECT CHILD_SIDE, PARENT_SIDE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ? AND REL_UUID = ?",
                (rs, i) -> {
                    List<String> l = new ArrayList<>();
                    l.add(rs.getString(1));
                    l.add(rs.getString(2));
                    return l;
                }, diagram, relation);
        return v.isEmpty() ? null : v.get(0);
    }

    static List<String> pair(String child, String parent) {
        List<String> l = new ArrayList<>();
        l.add(child);
        l.add(parent);
        return l;
    }

    JsonNode routeDelta(ErdApplyResult r, String id) {
        return r.changes().stream().filter(c -> c.kind().equals("diagramRoute") && c.id().equals(id)).findFirst().orElseThrow().value();
    }

    JsonNode viewRoute(String diagram, String relation) throws Exception {
        JsonNode view = new ErdTestClient(port, ErdStage2ContractTest.KEY).call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        for (JsonNode r : view.path("routes")) {
            if (r.path("diagram").asText().equals(diagram) && r.path("relation").asText().equals(relation)) return r;
        }
        return null;
    }

    /** 행이 없는 선에 변만 지정하면 points [] 인 행이 생기고, 델타·view 에 변 키가 있다. 다시 보내면 두 변을 덮어쓰고 null 변은 키가 없다. */
    @Test
    void setRouteSidesCreatesSidesOnlyRowAndOverwritesBoth() throws Exception {
        var r = ok(3, "[" + sides("d-1", "r-1", "L", "R") + "]");  // rev 4
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree("[]"));
        assertThat(routeDelta(r, "d-1:r-1")).isEqualTo(om.readTree(
                "{\"diagram\":\"d-1\",\"relation\":\"r-1\",\"points\":[],\"childSide\":\"L\",\"parentSide\":\"R\"}"));
        JsonNode v = viewRoute("d-1", "r-1");
        assertThat(v).isNotNull();
        assertThat(v.path("points").isArray()).isTrue();
        assertThat(v.path("points").size()).isZero();
        assertThat(v.path("childSide").asText()).isEqualTo("L");
        assertThat(v.path("parentSide").asText()).isEqualTo("R");
        // 덮어쓰기: 한쪽만 null — 그 키가 없다
        var o = ok(4, "[" + sides("d-1", "r-1", "R", null) + "]");  // rev 5
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("R", null));
        assertThat(routeDelta(o, "d-1:r-1")).isEqualTo(om.readTree("{\"diagram\":\"d-1\",\"relation\":\"r-1\",\"points\":[],\"childSide\":\"R\"}"));
        JsonNode v2 = viewRoute("d-1", "r-1");
        assertThat(v2.has("parentSide")).isFalse();
        assertThat(v2.path("childSide").asText()).isEqualTo("R");
        // 키 없음 = null
        ok(5, "[{\"op\":\"setRouteSides\",\"diagram\":\"d-1\",\"relation\":\"r-1\",\"parentSide\":\"L\"}]");
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair(null, "L"));
        // 다른 다이어그램은 영향 없음
        assertThat(routes("d-2")).isZero();
    }

    /** 점 없는 선에는 변 키가 없고(V9 전 모양), setRoute 는 점만 바꿔 변을 유지한다. 새 행은 변 NULL. */
    @Test
    void setRouteKeepsSidesAndNewRowHasNone() throws Exception {
        var first = ok(3, "[" + setRoute("d-1", "r-1", P1) + "]");  // rev 4
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair(null, null));
        assertThat(routeDelta(first, "d-1:r-1").has("childSide")).isFalse();
        assertThat(viewRoute("d-1", "r-1").has("childSide")).isFalse();
        ok(4, "[" + sides("d-1", "r-1", "L", "R") + "]");  // rev 5
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));  // 점은 그대로
        var again = ok(5, "[" + setRoute("d-1", "r-1", "[{\"x\":1,\"y\":2}]") + "]");  // rev 6
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree("[{\"x\":1,\"y\":2}]"));
        assertThat(routeDelta(again, "d-1:r-1")).isEqualTo(om.readTree(
                "{\"diagram\":\"d-1\",\"relation\":\"r-1\",\"points\":[{\"x\":1,\"y\":2}],\"childSide\":\"L\",\"parentSide\":\"R\"}"));
        // 변만 있는 행에 setRoute 해도 변이 남는다
        ok(6, "[" + sides("d-2", "r-1", "R", null) + "]");
        ok(7, "[" + setRoute("d-2", "r-1", "[{\"x\":9,\"y\":9}]") + "]");
        assertThat(dbSides("d-2", "r-1")).isEqualTo(pair("R", null));
    }

    /** 점 없고 변만 있는 행: 두 변을 null 로 지우면 행을 지운다. 점이 있는 행은 변만 비우고 행을 둔다. 행이 없고 둘 다 null 이면 no-op(rev 만 오른다). */
    @Test
    void clearingBothSidesDeletesSidesOnlyRowKeepsRowWithPointsAndNullIsNoOp() throws Exception {
        var noop = ok(3, "[" + sides("d-1", "r-1", null, null) + "]");  // rev 4
        assertThat(noop.rev()).isEqualTo(4);
        assertThat(noop.changes()).isEmpty();
        assertThat(routes("d-1")).isZero();
        ok(4, "[" + sides("d-1", "r-1", "L", null) + "]");  // rev 5
        assertThat(routes("d-1")).isEqualTo(1);
        var gone = ok(5, "[" + sides("d-1", "r-1", null, null) + "]");  // rev 6
        assertThat(routes("d-1")).isZero();
        assertThat(routeChanges(gone)).containsExactly("d-1:r-1|delete");
        assertThat(viewRoute("d-1", "r-1")).isNull();
        // 점이 있는 행
        ok(6, "[" + setRoute("d-2", "r-1", P1) + "," + sides("d-2", "r-1", "L", "R") + "]");  // rev 7
        var cleared = ok(7, "[" + sides("d-2", "r-1", null, null) + "]");
        assertThat(dbSides("d-2", "r-1")).isEqualTo(pair(null, null));
        assertThat(points("d-2", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(routeDelta(cleared, "d-2:r-1").has("childSide")).isFalse();
    }

    /** 되돌리기: 변이 없던 행(키 없음 → NULL)·행이 없던 선(→ 행 삭제)·변만 있던 행(지운 것을 되살림)이 모두 돌아온다. */
    @Test
    void undoSetRouteSidesRestoresPreviousIncludingAbsentKeysAsNull() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "]");                 // rev 4 — 변 NULL
        ok(4, "[" + sides("d-1", "r-1", "L", "R") + "]");              // rev 5
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");       // rev 6
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair(null, null));  // 키 없음 → NULL 로 덮어쓴다
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(routeDelta(undo, "d-1:r-1").has("childSide")).isFalse();
        // 되돌리기의 되돌리기 = 다시 하기
        var redo = commands.undo("mcm", 6, "owner", "ui", "UI");       // rev 7
        assertThat(redo.applied()).as(String.valueOf(redo.rejection())).isTrue();
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
        // 행이 없던 선: 되돌리면 행이 사라진다
        ok(7, "[" + sides("d-2", "r-1", "R", "R") + "]");              // rev 8
        assertThat(routes("d-2")).isEqualTo(1);
        var gone = commands.undo("mcm", 8, "owner", "ui", "UI");       // rev 9
        assertThat(gone.applied()).as(String.valueOf(gone.rejection())).isTrue();
        assertThat(routes("d-2")).isZero();
        assertThat(routeChanges(gone)).containsExactly("d-2:r-1|delete");
        // 변만 있던 행을 두 변 null 로 지운 것(rev 10)을 되돌리면 변만 있는 행(points [])이 돌아온다
        ok(9, "[" + sides("d-2", "r-1", "L", null) + "]");             // rev 10
        ok(10, "[" + sides("d-2", "r-1", null, null) + "]");           // rev 11
        assertThat(routes("d-2")).isZero();
        var back = commands.undo("mcm", 11, "owner", "ui", "UI");      // rev 12
        assertThat(back.applied()).as(String.valueOf(back.rejection())).isTrue();
        assertThat(dbSides("d-2", "r-1")).isEqualTo(pair("L", null));
        assertThat(points("d-2", "r-1")).isEqualTo(om.readTree("[]"));
    }

    /** 변을 바꾼 뒤 점을 다시 바꾸면(행 전체 비교) 변 바꾸기 되돌리기는 CONFLICT. */
    @Test
    void undoSetRouteSidesConflictsAfterLaterSetRoute() throws Exception {
        ok(3, "[" + sides("d-1", "r-1", "L", "R") + "]");              // rev 4
        ok(4, "[" + setRoute("d-1", "r-1", P1) + "]");                  // rev 5
        var undo = commands.undo("mcm", 4, "owner", "ui", "UI");
        assertThat(undo.applied()).isFalse();
        assertThat(undo.rejection().code()).isEqualTo("CONFLICT");
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
    }

    /** clearRoutes 는 행을 통째로 지운다(점과 변). 그 되돌리기는 점과 변을 함께 되살린다. */
    @Test
    void clearRoutesRemovesSidesAndUndoRestoresThem() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "," + sides("d-1", "r-1", "L", "R") + ","
                + sides("d-2", "r-1", "R", null) + "]");                // rev 4 — d-2 는 변만 있는 행
        var clear = ok(4, "[{\"op\":\"clearRoutes\",\"diagram\":\"d-1\",\"relations\":[\"r-1\"]},"
                + "{\"op\":\"clearRoutes\",\"diagram\":\"d-2\",\"relations\":[\"r-1\"]}]");  // rev 5
        assertThat(routes("d-1") + routes("d-2")).isZero();
        assertThat(routeChanges(clear)).containsExactlyInAnyOrder("d-1:r-1|delete", "d-2:r-1|delete");
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(dbSides("d-2", "r-1")).isEqualTo(pair("R", null));
        assertThat(points("d-2", "r-1")).isEqualTo(om.readTree("[]"));
    }

    /**
     * 화면의 마지막 점 지우기(변이 있는 선) = clearRoutes + setRouteSides(지금 변) 한 묶음. 델타는 한 건(점 [] 과 변),
     * DB 는 '[]' 와 변, 되돌리기 1번이면 점과 변이 함께 돌아온다.
     */
    @Test
    void lastPointDeleteBatchKeepsSidesAndUndoRestoresPoints() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "," + sides("d-1", "r-1", "L", "R") + "]");  // rev 4
        var del = ok(4, "[{\"op\":\"clearRoutes\",\"diagram\":\"d-1\",\"relations\":[\"r-1\"]}," + sides("d-1", "r-1", "L", "R") + "]");  // rev 5
        assertThat(routeChanges(del)).containsExactly("d-1:r-1|upsert");
        assertThat(routeDelta(del, "d-1:r-1")).isEqualTo(om.readTree(
                "{\"diagram\":\"d-1\",\"relation\":\"r-1\",\"points\":[],\"childSide\":\"L\",\"parentSide\":\"R\"}"));
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree("[]"));
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
        var undo = commands.undo("mcm", 5, "owner", "ui", "UI");
        assertThat(undo.applied()).as(String.valueOf(undo.rejection())).isTrue();
        assertThat(points("d-1", "r-1")).isEqualTo(om.readTree(P1));
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
    }

    /** 연쇄 삭제(관계 삭제·다이어그램 삭제)도 변을 기억해 되돌리기 1번으로 되살린다. */
    @Test
    void cascadeDeletesRememberSidesAndUndoRestores() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "," + sides("d-1", "r-1", "L", "R") + "," + sides("d-2", "r-1", null, "L") + "]");  // rev 4
        ok(4, "[{\"op\":\"deleteRelation\",\"id\":\"r-1\"}]");          // rev 5
        assertThat(routes("d-1") + routes("d-2")).isZero();
        assertThat(commands.undo("mcm", 5, "owner", "ui", "UI").applied()).isTrue();  // rev 6
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
        assertThat(dbSides("d-2", "r-1")).isEqualTo(pair(null, "L"));
        ok(6, "[{\"op\":\"deleteDiagram\",\"id\":\"d-2\"}]");           // rev 7
        assertThat(commands.undo("mcm", 7, "owner", "ui", "UI").applied()).isTrue();  // rev 8
        assertThat(dbSides("d-2", "r-1")).isEqualTo(pair(null, "L"));
        ok(8, "[{\"op\":\"removeFromDiagram\",\"diagram\":\"d-1\",\"tables\":[\"t-m\"]}]");  // rev 9
        assertThat(routes("d-1")).isZero();
        assertThat(commands.undo("mcm", 9, "owner", "ui", "UI").applied()).isTrue();
        assertThat(dbSides("d-1", "r-1")).isEqualTo(pair("L", "R"));
    }

    @Test
    void copyDiagramCopiesSides() throws Exception {
        ok(3, "[" + setRoute("d-1", "r-1", P1) + "," + sides("d-1", "r-1", "R", "L") + "]");  // rev 4
        ok(4, "[{\"op\":\"copyDiagram\",\"from\":\"d-1\",\"id\":\"d-3\"}]");  // rev 5
        assertThat(dbSides("d-3", "r-1")).isEqualTo(pair("R", "L"));
        assertThat(points("d-3", "r-1")).isEqualTo(om.readTree(P1));
        // 변만 있는 행도 복사한다
        ok(5, "[" + sides("d-2", "r-1", null, "R") + "]");
        ok(6, "[{\"op\":\"copyDiagram\",\"from\":\"d-2\",\"id\":\"d-4\"}]");
        assertThat(dbSides("d-4", "r-1")).isEqualTo(pair(null, "R"));
        assertThat(points("d-4", "r-1")).isEqualTo(om.readTree("[]"));
    }

    @Test
    void setRouteSidesRejectsBadSideSelfRelationUnknownRelationAndDiagram() throws Exception {
        ok(3, "[{\"op\":\"addRelation\",\"id\":\"r-self\",\"child\":\"t-r\",\"parent\":\"t-r\",\"onNameClash\":\"REUSE\"}]");  // rev 4
        for (String bad : List.of(
                sides("d-1", "r-1", "X", null), sides("d-1", "r-1", null, "l"), sides("d-1", "r-1", "", null),
                sides("d-1", "r-1", "LR", "R"), sides("d-1", "r-1", " ", null),
                sides("d-1", "r-self", "L", "R"), sides("d-1", "r-self", null, null),
                sides("d-1", "r-none", "L", "R"), sides("d-none", "r-1", "L", "R"),
                "{\"op\":\"setRouteSides\",\"diagram\":\"d-1\",\"childSide\":\"L\"}",
                "{\"op\":\"setRouteSides\",\"diagram\":\"d-1\",\"relation\":\"\",\"childSide\":\"L\"}",
                "{\"op\":\"setRouteSides\",\"relation\":\"r-1\",\"childSide\":\"L\"}",
                "{\"op\":\"setRouteSides\",\"diagram\":\"d-1\",\"relation\":\"r-1\",\"childSide\":1}")) {
            var r = apply(4, "[" + bad + "]");
            assertThat(r.applied()).as(bad).isFalse();
            assertThat(r.rejection().code()).as(bad).isEqualTo("INVALID");
        }
        assertThat(rev()).isEqualTo(4);
        assertThat(routes("d-1")).isZero();
    }

    @Test
    void strangerCannotSetRouteSides() throws Exception {
        var r = commands.apply("mcm", 3, "stranger", "s", "UI", cmds("[" + sides("d-1", "r-1", "L", "R") + "]"));
        assertThat(r.rejection().code()).isEqualTo("NOT_EDITOR");
        assertThat(routes("d-1")).isZero();
    }

    @Test
    void setRouteSidesIsDiagramOp() {
        assertThat(ErdDiagramCommand.isDiagramOp("setRouteSides")).isTrue();
        assertThat(ErdDiagramCommand.isDiagramOp("setRoute")).isTrue();
        assertThat(ErdDiagramCommand.isDiagramOp("setRouteSide")).isFalse();
    }

    JsonNode relations() throws Exception {
        return om.readTree(draftJson()).path("relations");
    }

    String draftJson() {
        return jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
    }
}
