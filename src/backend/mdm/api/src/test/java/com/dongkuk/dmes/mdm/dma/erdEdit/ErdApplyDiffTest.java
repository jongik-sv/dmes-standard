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
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
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

    long rowVersion() {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mdm' AND STATUS = 'DRAFT'", Long.class);
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
        long rv = rowVersion();
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
        assertThat(rowVersion()).isEqualTo(rv);
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
        JsonNode logged = c.om.readTree(jdbc.queryForObject(
                "SELECT CMD_JSON FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm' AND REV = 3", String.class));
        assertThat(logged.isArray()).as(logged.toString()).isTrue();
        assertThat(logged.size()).as(logged.toString()).isEqualTo(1);
        assertThat(logged.get(0).path("op").asText()).isEqualTo("restore");
        // 반영도 변경 기록의 rev 하나라 되돌릴 수 있다
        JsonNode undone = c.call("restore", "owner", Map.of("modelId", "mdm", "rev", 3, "session", "ui-owner", "source", "UI"));
        assertThat(undone.at("/data/result/applied").asBoolean()).as(undone.toString()).isTrue();
        assertThat(model().at("/columns/" + cid + "/length").asInt()).isEqualTo(len - 1);
    }

    static List<String> physOrder(JsonNode model, String table) {
        List<String> out = new ArrayList<>();
        model.at("/tables/" + tableId(model, table) + "/columnOrder").forEach(id -> out.add(model.at("/columns/" + id.asText() + "/phys").asText()));
        return out;
    }

    /** DB 컬럼 순서 회차 D5 — 모델 컬럼 순서만 바꾸면 차이는 COLUMN_ORDER 한 건이고, 반영하면 DB 순서로 돌아가 차이가 없다. */
    @Test
    void applyDiffRestoresDbColumnOrder() throws Exception {
        String order = "COLUMN_ORDER:TB_MDM_ERD_CLAIM";
        JsonNode imported = c.call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", 0,
                "session", "ui-owner", "source", "UI"));
        assertThat(imported.at("/data/result/applied").asBoolean()).as(imported.toString()).isTrue();
        List<String> dbOrder = physOrder(model(), "TB_MDM_ERD_CLAIM");
        String first = columnId(model(), "TB_MDM_ERD_CLAIM", dbOrder.get(0));
        JsonNode moved = c.call("save", "owner", Map.of("modelId", "mdm", "baseRev", 1, "session", "ui-owner", "source", "UI",
                "commandsJson", "[{\"op\":\"moveColumn\",\"id\":\"" + first + "\",\"position\":2}]"));
        assertThat(moved.at("/data/result/applied").asBoolean()).as(moved.toString()).isTrue();
        assertThat(physOrder(model(), "TB_MDM_ERD_CLAIM")).isNotEqualTo(dbOrder);
        assertThat(diffIds()).containsExactly(order);

        JsonNode ok = applyDiff(2, List.of(order)).at("/data/result");
        assertThat(ok.path("applied").asBoolean()).as(ok.toString()).isTrue();
        assertThat(ok.at("/summary/items").asInt()).isEqualTo(1);
        assertThat(physOrder(model(), "TB_MDM_ERD_CLAIM")).isEqualTo(dbOrder);
        assertThat(diffIds()).isEmpty();
    }

    static String tableId(JsonNode model, String table) {
        for (var it = model.path("tables").fields(); it.hasNext(); ) {
            var e = it.next();
            if (e.getValue().path("phys").asText().equals(table)) return e.getKey();
        }
        throw new AssertionError("표 없음: " + table);
    }

    int routes() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = 'd-zz'", Integer.class);
    }

    /** ERD 2차 §7.1 — 다시 가져오기 반영(TABLE_REMOVED)이 관계를 지우면 그 꺾임점도 같은 rev 에 지우고, 되돌리기 1번으로 함께 돌아온다. */
    @Test
    void applyDiffRemovingRelationDropsItsRouteAndUndoRestores() throws Exception {
        JsonNode imported = c.call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", 0,
                "session", "ui-owner", "source", "UI"));
        assertThat(imported.at("/data/result/applied").asBoolean()).as(imported.toString()).isTrue();      // rev 1
        JsonNode m = model();
        String parent = tableId(m, "TB_MDM_ERD_MODEL");
        String parentPk = columnId(m, "TB_MDM_ERD_MODEL", "ERD_MODEL_ID");
        JsonNode saved = c.call("save", "owner", Map.of("modelId", "mdm", "baseRev", 1, "session", "ui-owner", "source", "UI",
                "commandsJson", "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-zz\",\"phys\":\"TB_ZZ_ROUTE\",\"logical\":\"꺾임시험\"},"
                        + "{\"op\":\"addColumn\",\"id\":\"c-zz1\",\"table\":\"t-zz\",\"phys\":\"ERD_MODEL_ID\",\"logical\":\"모델아이디\",\"dataType\":\"VARCHAR2\",\"length\":50},"
                        + "{\"op\":\"addRelation\",\"id\":\"r-zz\",\"child\":\"t-zz\",\"parent\":\"" + parent + "\",\"pairs\":[[\"c-zz1\",\"" + parentPk + "\"]]},"
                        + "{\"op\":\"addDiagram\",\"id\":\"d-zz\",\"areaName\":\"a\",\"diagramName\":\"b\"},"
                        + "{\"op\":\"setRoute\",\"diagram\":\"d-zz\",\"relation\":\"r-zz\",\"points\":[{\"x\":1,\"y\":2}]}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();             // rev 2
        assertThat(routes()).isEqualTo(1);
        String item = "TABLE_REMOVED:TB_ZZ_ROUTE";
        assertThat(diffIds()).contains(item);
        JsonNode applied = applyDiff(2, List.of(item)).at("/data/result");
        assertThat(applied.path("applied").asBoolean()).as(applied.toString()).isTrue();                      // rev 3
        assertThat(routes()).isZero();
        boolean routeDeleted = false;
        for (JsonNode ch : applied.path("changes")) {
            if (ch.path("kind").asText().equals("diagramRoute") && ch.path("id").asText().equals("d-zz:r-zz")
                    && ch.path("op").asText().equals("delete")) routeDeleted = true;
        }
        assertThat(routeDeleted).as(applied.toString()).isTrue();
        JsonNode undone = c.call("restore", "owner", Map.of("modelId", "mdm", "rev", 3, "session", "ui-owner", "source", "UI"));
        assertThat(undone.at("/data/result/applied").asBoolean()).as(undone.toString()).isTrue();
        assertThat(routes()).isEqualTo(1);
        assertThat(model().at("/relations/r-zz").isMissingNode()).isFalse();
    }

    /** restore 의 sinceRev 는 요청 baseRev 다 — 차이를 읽은 뒤의 편집을 조용히 덮지 않는다. */
    @Test
    void applyDiffConflictsWithEditAfterBaseRev() throws Exception {
        importAndShrink("ui-other");                                                               // rev 2
        int logs = logCount();
        long rv = rowVersion();
        JsonNode r = applyDiff(1, List.of(CHANGED)).at("/data/result");
        assertThat(r.path("applied").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.at("/rejection/code").asText()).isEqualTo("CONFLICT");
        assertThat(r.at("/rejection/byRev").asLong()).isEqualTo(2);
        assertThat(r.at("/rejection/byUserId").asText()).isEqualTo("owner");
        assertThat(rev()).isEqualTo(2);
        assertThat(logCount()).isEqualTo(logs);
        assertThat(rowVersion()).isEqualTo(rv);
    }

    @Test
    void applyDiffNeedsImportedModelAndValidItems() throws Exception {
        int logs0 = logCount();
        long rv0 = rowVersion();
        JsonNode empty = applyDiff(0, List.of("TABLE_ADDED:TB_MDM_ERD_CLAIM")).at("/data/result");
        assertThat(empty.at("/rejection/code").asText()).as(empty.toString()).isEqualTo("INVALID");
        assertThat(empty.at("/rejection/message").asText() + empty.at("/rejection/hint").asText()).contains("FROM_DB");
        assertThat(rev()).isZero();
        assertThat(logCount()).isEqualTo(logs0);
        assertThat(rowVersion()).isEqualTo(rv0);
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
