package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 읽기 kind — view kind=STATUS, compare kind=DB_DIFF 를 OASIS HTTP 로 부른다(ErdEditOasisHttpTest 형식).
 * MDMAPUSER 를 가져온 모델에서 본다. 차이 시험은 이 시험이 만든 표(TB_ERD_DIFF_*)만 바꾼다 — V1~V6 표는 건드리지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdReadKindsTest.KEY)
@ActiveProfiles("local")
class ErdReadKindsTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-read-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();
    /** 시험이 넣는 도메인 id. 시험 PDB 의 사전은 비어 있으므로(reset) 겹치지 않는다. */
    static final long DOMAIN_ID = 900001L;

    @BeforeEach
    void setUp() throws Exception {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        DmaTestSupport.clear(jdbc);
        dropDiffTables();
        jdbc.execute("CREATE TABLE TB_ERD_DIFF_P (ID VARCHAR2(10) NOT NULL, CONSTRAINT PK_TB_ERD_DIFF_P PRIMARY KEY (ID))");
        jdbc.execute("CREATE TABLE TB_ERD_DIFF_C (ID VARCHAR2(10) NOT NULL, P_ID VARCHAR2(10), NOTE VARCHAR2(10), "
                + "CONSTRAINT PK_TB_ERD_DIFF_C PRIMARY KEY (ID))");
        // 컬럼 사전 한 줄 — 가져오기가 DOMAIN_ID 컬럼에 이 도메인을 채운다(S9). 리포지토리 save 는 DmaTestSupport.Config(가짜 사용자)를
        // 가져와야 해서 헤더 사용자와 섞이므로 JdbcTemplate 으로 넣는다. NOT NULL 칸만 채운다(감사 칼럼은 NULL 허용).
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE) "
                + "VALUES (?, '도메인아이디', 'DOMAIN_ID', 'QTY', 'NUMBER', 19, 0)", DOMAIN_ID);
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('도메인아이디', 'DOMAIN_ID', ?)", DOMAIN_ID);
        assertThat(call("reg", "owner", Map.of("modelId", "mdm", "moduleId", "mdm", "schemaName", "MDMAPUSER", "modelName", "MDM"))
                .at("/meta/success").asBoolean()).isTrue();
        JsonNode imported = call("import", "owner", Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", 0));
        assertThat(imported.at("/data/result/applied").asBoolean()).as(imported.toString()).isTrue();
    }

    @AfterEach
    void tearDown() {
        dropDiffTables();
        DmaTestSupport.clear(jdbc);
    }

    void dropDiffTables() {
        for (String t : List.of("TB_ERD_DIFF_N", "TB_ERD_DIFF_C", "TB_ERD_DIFF_P")) {
            Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = ?", Integer.class, t);
            if (n != null && n > 0) jdbc.execute("DROP TABLE " + t + " CASCADE CONSTRAINTS PURGE");
        }
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

    @Test
    void statusGivesEveryColumnStatusDomainsAndCounts() throws Exception {
        JsonNode model = om.readTree(call("view", "viewer", Map.of("modelId", "mdm")).at("/data/result/model").asText());
        JsonNode r = call("view", "viewer", Map.of("modelId", "mdm", "kind", "STATUS"));
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        JsonNode res = r.at("/data/result");
        assertThat(res.path("modelId").asText()).isEqualTo("mdm");
        assertThat(res.path("ver").asText()).isEqualTo("1.000");
        assertThat(res.path("rev").asLong()).isEqualTo(1);
        int columnCount = model.path("columns").size();
        assertThat(res.path("statuses").size()).isEqualTo(columnCount);
        int sum = 0;
        for (String s : List.of("OK", "ALIAS", "NEW", "TYPE", "DOMAIN", "MISS")) {
            assertThat(res.path("counts").has(s)).as(s).isTrue();
            sum += res.at("/counts/" + s).asInt();
        }
        assertThat(sum).isEqualTo(columnCount);
        String domainCol = null;
        var it = model.path("columns").fields();
        while (it.hasNext()) {
            var e = it.next();
            if (e.getValue().path("phys").asText().equals("DOMAIN_ID")) domainCol = e.getKey();
        }
        assertThat(domainCol).isNotNull();
        assertThat(res.at("/statuses/" + domainCol).asText()).isIn("OK", "DOMAIN", "TYPE");   // 사전에 있다 → MISS·NEW 가 아니다
        assertThat(res.at("/domains/" + DOMAIN_ID + "/name").asText()).isEqualTo("도메인아이디");
        assertThat(res.at("/domains/" + DOMAIN_ID + "/dataType").asText()).isEqualTo("NUMBER");
        assertThat(res.path("elapsedMs").asLong()).isNotNegative();
    }

    @Test
    void dbDiffIsEmptyAfterImportThenListsDbChanges() throws Exception {
        JsonNode empty = call("compare", "viewer", Map.of("modelId", "mdm", "kind", "DB_DIFF"));
        assertThat(empty.at("/meta/success").asBoolean()).as(empty.toString()).isTrue();
        assertThat(empty.at("/data/result/schema").asText()).isEqualTo("MDMAPUSER");
        assertThat(empty.at("/data/result/items").size()).as(empty.toString()).isZero();

        jdbc.execute("ALTER TABLE TB_ERD_DIFF_C MODIFY (NOTE VARCHAR2(20))");
        jdbc.execute("ALTER TABLE TB_ERD_DIFF_C ADD (EXTRA NUMBER(5))");
        jdbc.execute("ALTER TABLE TB_ERD_DIFF_C ADD CONSTRAINT FK_TB_ERD_DIFF_C_P FOREIGN KEY (P_ID) REFERENCES TB_ERD_DIFF_P (ID)");
        jdbc.execute("CREATE TABLE TB_ERD_DIFF_N (A NUMBER(3))");

        JsonNode diff = call("compare", "viewer", Map.of("modelId", "mdm", "kind", "DB_DIFF"));
        JsonNode items = diff.at("/data/result/items");
        List<String> ids = new ArrayList<>();
        items.forEach(i -> ids.add(i.path("id").asText()));
        assertThat(ids).as(diff.toString()).containsExactly(
                "COLUMN_ADDED:TB_ERD_DIFF_C.EXTRA",
                "COLUMN_CHANGED:TB_ERD_DIFF_C.NOTE",
                "FK_ADDED:TB_ERD_DIFF_C(P_ID)>TB_ERD_DIFF_P(ID)",
                "TABLE_ADDED:TB_ERD_DIFF_N");
        assertThat(items.at("/1/before/length").asInt()).isEqualTo(10);
        assertThat(items.at("/1/after/length").asInt()).isEqualTo(20);
        assertThat(diff.at("/data/result/rev").asLong()).isEqualTo(1);   // 읽기다 — rev 가 그대로
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mdm'", Long.class)).isEqualTo(1);
    }

    @Test
    void unknownKindsAreInvalid() throws Exception {
        assertThat(call("view", "viewer", Map.of("modelId", "mdm", "kind", "NOPE")).at("/meta/code").asText()).isEqualTo("MDM021");
        assertThat(call("compare", "viewer", Map.of("modelId", "mdm", "kind", "NOPE")).at("/meta/code").asText()).isEqualTo("MDM021");
        // kind 가 없으면 단계 0 동작 그대로다
        assertThat(call("compare", "viewer", Map.of("phys", "DOMAIN_ID")).at("/data/result").has("tokens")).isTrue();
    }
}
