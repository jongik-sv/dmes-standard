package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 관계선 꺾임점(ERD 2차 §7.1) — setRoute·clearRoutes, 관계·표·다이어그램 삭제의 연쇄 삭제와 되돌리기 1번 복원, 델타.
 * 준비(rev 3): 표 t-r(부모)·t-m(자식)·t-x, 관계 r-1(t-m → t-r), 다이어그램 d-1·d-2 에 세 표를 놓는다.
 */
@SpringBootTest
@ActiveProfiles("local")
class ErdDiagramRouteTest extends AbstractMdmSharedDbTest {

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
            assertThat(r.rejection().code()).as(bad).isEqualTo("INVALID");
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

    JsonNode relations() throws Exception {
        return om.readTree(draftJson()).path("relations");
    }

    String draftJson() {
        return jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE STATUS='DRAFT'", String.class);
    }
}
