package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
 * 첫 가져오기(import kind=FROM_DB) — BPMN 15번째 흐름까지 HTTP 로 태운다. 시험 PDB(TPL_EMPTY 복제)에는 MDMAPUSER(V1~V6)만 있으므로
 * MDM 스키마를 가져온다. 기대 수는 실행 때 사전 뷰에서 센다(V 파일이 늘어도 흔들리지 않게).
 *
 * <p>가져오기 두 번은 차례로 보낸다. 시험 연결 풀은 2개이고 HTTP 쓰기 하나가 2개를 잡으므로(OASIS 트랜잭션 + 안쪽 트랜잭션,
 * deferred 27번) 동시에 보내면 풀이 마른다. 판정 자리는 잠금 뒤라 차례로 보내도 같은 경로를 시험한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdImportTest.KEY)
@ActiveProfiles("local")
class ErdImportTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-import-key";
    static final String TABLE_FILTER = "TABLE_NAME NOT LIKE 'BIN$%' AND TABLE_NAME <> 'flyway_schema_history'";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void clean() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        assertThat(call("reg", "owner", Map.of("modelId", "mdm", "moduleId", "mdm", "schemaName", "MDMAPUSER", "modelName", "MDM"))
                .at("/meta/success").asBoolean()).isTrue();
    }

    private static String clientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : KEY;
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", clientKey())
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", "MDM_STEWARD")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    JsonNode importDb(String user, long baseRev) throws Exception {
        return call("import", user, Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", baseRev,
                "session", "ui-" + user, "source", "UI"));
    }

    long rev() {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mdm'", Long.class);
    }

    JsonNode model() throws Exception {
        return om.readTree(call("view", "owner", Map.of("modelId", "mdm")).at("/data/result/model").asText());
    }

    /** 자식·부모 표 물리명이 맞는 DB 상태 관계. 없으면 null. */
    static JsonNode dbRelation(JsonNode model, String child, String parent) {
        String c = tableId(model, child), p = tableId(model, parent);
        for (JsonNode r : model.path("relations")) {
            if (r.path("child").asText().equals(c) && r.path("parent").asText().equals(p) && r.path("state").asText().equals("DB")) return r;
        }
        return null;
    }

    static String tableId(JsonNode model, String phys) {
        var it = model.path("tables").fields();
        while (it.hasNext()) {
            var e = it.next();
            if (e.getValue().path("phys").asText().equals(phys)) return e.getKey();
        }
        throw new AssertionError("표 없음: " + phys);
    }

    @Test
    void importsMdmSchemaWithDbRelationsAndDiagram() throws Exception {
        int tables = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE " + TABLE_FILTER, Integer.class);
        int columns = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TAB_COLUMNS WHERE TABLE_NAME IN (SELECT TABLE_NAME FROM USER_TABLES WHERE "
                + TABLE_FILTER + ")", Integer.class);
        int fks = jdbc.queryForObject("SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'R' AND " + TABLE_FILTER, Integer.class);
        int pks = jdbc.queryForObject("SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'P' AND " + TABLE_FILTER, Integer.class);

        JsonNode r = importDb("owner", 0);
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        JsonNode res = r.at("/data/result");
        assertThat(res.path("applied").asBoolean()).as(res.path("rejection").toString()).isTrue();
        assertThat(res.path("rev").asLong()).isEqualTo(1);
        assertThat(res.at("/summary/tables").asInt()).isEqualTo(tables);
        assertThat(res.at("/summary/columns").asInt()).isEqualTo(columns);
        assertThat(res.at("/summary/keys").asInt()).isGreaterThanOrEqualTo(pks);
        assertThat(res.at("/summary/relations/DB").asInt()).isEqualTo(fks);
        assertThat(res.at("/summary/relations/INFERRED").asInt()).isPositive();
        String diagramId = res.at("/summary/diagramId").asText();
        assertThat(diagramId).startsWith("d-");
        assertThat(rev()).isEqualTo(1);

        JsonNode m = model();
        assertThat(m.path("tables").size()).isEqualTo(tables);
        // 단일 UNIQUE 를 부모로 둔 FK, 복합 UNIQUE 를 부모로 둔 FK, 자기 참조 FK
        assertThat(dbRelation(m, "TB_MDM_LAYOUT_ITEM", "TB_MDM_COLUMN")).isNotNull();
        assertThat(dbRelation(m, "TB_MDM_LAYOUT_CONST", "TB_MDM_LAYOUT_HEADER").path("pairs").size()).isEqualTo(3);
        JsonNode self = dbRelation(m, "TB_MDM_DOMAIN", "TB_MDM_DOMAIN");
        assertThat(self).isNotNull();
        assertThat(self.path("dbFk").asBoolean()).isTrue();
        assertThat(self.path("identifying").asBoolean()).isFalse();
        // 다이어그램 "전체"에 표가 모두 놓였다
        assertThat(jdbc.queryForObject("SELECT DIAGRAM_NAME FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ? AND ERD_MODEL_ID = 'mdm'",
                String.class, diagramId)).isEqualTo("전체");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?", Integer.class, diagramId))
                .isEqualTo(tables);
        // 명령 기록 한 줄(rev 1), 출처 UI
        assertThat(jdbc.queryForMap("SELECT USER_ID, SOURCE FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm' AND REV = 1"))
                .containsEntry("USER_ID", "owner").containsEntry("SOURCE", "UI");
    }

    /** Review Focus 3: 같은 모델에 가져오기를 두 번 보낸다(두 탭) → 둘째는 "표가 이미 있다" INVALID 이고 rev 는 한 번만 오른다. */
    @Test
    void secondImportIsInvalid() throws Exception {
        assertThat(importDb("owner", 0).at("/data/result/applied").asBoolean()).isTrue();
        JsonNode second = importDb("owner", 0);   // 다른 탭이 같은 baseRev 로 보낸 것
        assertThat(second.at("/meta/success").asBoolean()).as(second.toString()).isTrue();
        JsonNode res = second.at("/data/result");
        assertThat(res.path("applied").asBoolean()).isFalse();
        assertThat(res.at("/rejection/code").asText()).isEqualTo("INVALID");
        assertThat(res.at("/rejection/message").asText()).contains("이미 표가 있습니다");
        assertThat(res.at("/rejection/hint").asText()).contains("DB_DIFF");
        assertThat(res.path("summary").isNull() || res.path("summary").isMissingNode()).isTrue();
        assertThat(res.path("rev").asLong()).isEqualTo(1);
        assertThat(rev()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mdm'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = 'mdm'", Integer.class)).isEqualTo(1);
        // 최신 rev 로 다시 보내도 같다
        assertThat(importDb("owner", 1).at("/data/result/rejection/code").asText()).isEqualTo("INVALID");
        assertThat(rev()).isEqualTo(1);
    }

    @Test
    void undoOfImportEmptiesModelAndAllowsReimport() throws Exception {
        assertThat(importDb("owner", 0).at("/data/result/rev").asLong()).isEqualTo(1);
        JsonNode undo = call("restore", "owner", Map.of("modelId", "mdm", "rev", 1, "session", "ui-owner", "source", "UI"));
        assertThat(undo.at("/data/result/applied").asBoolean()).as(undo.toString()).isTrue();
        assertThat(undo.at("/data/result/rev").asLong()).isEqualTo(2);
        JsonNode m = model();
        assertThat(m.path("tables").size()).isZero();
        assertThat(m.path("columns").size()).isZero();
        assertThat(m.path("relations").size()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = 'mdm'", Integer.class)).isZero();
        JsonNode again = importDb("owner", 2);
        assertThat(again.at("/data/result/applied").asBoolean()).as(again.toString()).isTrue();
        assertThat(again.at("/data/result/rev").asLong()).isEqualTo(3);
    }

    @Test
    void importNeedsFromDbKindEditorAndTables() throws Exception {
        assertThat(call("import", "owner", Map.of("modelId", "mdm", "baseRev", 0)).at("/meta/code").asText()).isEqualTo("MDM021");
        assertThat(call("import", "owner", Map.of("modelId", "mdm", "kind", "APPLY_DIFF", "baseRev", 0)).at("/meta/code").asText())
                .isEqualTo("MDM021");
        assertThat(call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB")).at("/meta/code").asText()).isEqualTo("MDM021");
        JsonNode stranger = importDb("stranger", 0);
        assertThat(stranger.at("/data/result/rejection/code").asText()).as(stranger.toString()).isEqualTo("NOT_EDITOR");
        assertThat(rev()).isZero();
        // 표가 없는 스키마(복제 PDB 에 없는 스키마 이름)는 잠그기 전에 입력 오류다
        call("reg", "owner", Map.of("modelId", "nope", "moduleId", "nope", "schemaName", "NO_SUCH_SCHEMA", "modelName", "없음"));
        JsonNode empty = call("import", "owner", Map.of("modelId", "nope", "kind", "FROM_DB", "baseRev", 0));
        assertThat(empty.at("/meta/code").asText()).as(empty.toString()).isEqualTo("MDM021");
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'nope'", Long.class)).isZero();
    }
}
