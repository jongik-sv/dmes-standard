package com.dongkuk.dmes.mdm.dma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-04-04 design.md §3.3 P1~P8 — BPMN 까지 태우는 HTTP 파이프 시험(MdmSecurityChainTest 패턴).
 *
 * <p>가짜 {@code MdmCurrentUser} 를 쓰지 않는다. 역할은 {@code X-Authenticated-Role} 헤더 → {@code ClientKeyFilter} →
 * {@code CactusMdmCurrentUser} 실제 경로로 주어야 P1·P6 가 서버 권한 검사의 증거가 된다. 데이터는 JdbcTemplate 으로
 * 넣고 읽는다(OASIS 프로세스 트랜잭션이 커밋한 행을 새 연결로 확인).
 *
 * <p>F12 실측: BPMN serviceTask 안에서 던진 예외는 HTTP 200 + {@code meta.success=false} + {@code meta.message}
 * (= 예외 message)로만 온다. 화면 오류 문구는 이 message 에 기댄다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + DmaOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class DmaOasisHttpTest extends AbstractMdmSharedDbTest {

    static final String TEST_CLIENT_KEY = "mdm-dma-test-client-key";
    private static final String STD_ADMIN = "MDM_STD_ADMIN";
    private static final String STEWARD = "MDM_STEWARD";

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;
    private long domainId;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_TERM");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
        insertTerm("원재료", "RMTL");
        insertTerm("코일", "COIL");
        insertTerm("두께", "THK");
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, VER) "
                + "VALUES ('코일 두께', 'COIL_THK', 'QTY', 'NUMBER', 0)");
        domainId = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK'", Long.class);
    }

    @Test
    void P1_담당자_저장은_MDM016_문구가_meta_message_로_오고_행이_없다() throws Exception {
        JsonNode body = post("columnMng", "save", STEWARD, saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().startsWith(
                MdmErrorCode.STD_ADMIN_ROLE_REQUIRED.defaultMessage()), body.toString());
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void P2_자리_표시자가_남으면_MDM017_이고_행이_없다() throws Exception {
        JsonNode body = post("columnMng", "save", STD_ADMIN, saveBody("원재료 코일 두께 편차", "RMTL_COIL_THK_***", true, true));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().startsWith(
                MdmErrorCode.NAME_PLACEHOLDER_REMAINS.defaultMessage()), body.toString());
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void P3_표준_관리자_정상_저장은_columnId_를_돌려준다() throws Exception {
        JsonNode body = post("columnMng", "save", STD_ADMIN, saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertTrue(body.path("data").path("result").path("columnId").isNumber(), body.toString());
        assertEquals(1, count("TB_MDM_COLUMN"));
        assertEquals(1, count("TB_MDM_COLUMN_SYSTEM"));
        String auditUser = jdbc.queryForObject("SELECT C_USR_ID FROM TB_MDM_COLUMN", String.class);
        assertEquals("stdadmin", auditUser, "HTTP 경로에서는 감사 칼럼이 채워진다");
    }

    @Test
    void P4_terms_그리드를_빈_rows_로_보내면_서버가_재분해로_채운다() throws Exception {
        JsonNode body = post("columnMng", "save", STD_ADMIN, saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        // 용어 ID 는 IDENTITY 가 매긴다(Oracle 은 DELETE 뒤에도 번호를 되돌리지 않는다) — 넣은 용어에서 읽는다.
        assertEquals("[" + termId("원재료") + "," + termId("코일") + "," + termId("두께") + "]",
                jdbc.queryForObject("SELECT TERM_IDS FROM TB_MDM_COLUMN", String.class));
    }

    @Test
    void P4b_그리드를_아예_빼면_바인딩이_실패한다_FE_는_두_그리드를_항상_보낸다() throws Exception {
        // Build 실측(design.md 「Build 이탈」 B1): camunda:class 빈 경로는 opt 속성을 넘기지 않아 빠진 그리드 파라미터가
        // "No suitable method" 로 실패한다. 그래서 FE api.ts 가 systems·terms 를 항상(빈 rows 여도) 보낸다(I16).
        JsonNode body = post("columnMng", "save", STD_ADMIN, saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, false));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().contains("No suitable method"), body.toString());
        assertEquals(0, count("TB_MDM_COLUMN"));
    }

    @Test
    void P5_담당자도_조회_상세_분해는_된다() throws Exception {
        post("columnMng", "save", STD_ADMIN, saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true));
        long columnId = jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN", Long.class);

        JsonNode search = post("columnMng", "search", STEWARD, envelope(json.createObjectNode().put("keyword", "두께")));
        JsonNode view = post("columnMng", "view", STEWARD, envelope(json.createObjectNode().put("columnId", columnId)));
        JsonNode compare = post("columnMng", "compare", STEWARD,
                envelope(json.createObjectNode().put("direction", "FORWARD").put("input", "원재료 코일두께")));

        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        assertEquals(1, search.path("data").path("result").path("list").size(), search.toString());
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertEquals("RMTL_COIL_THK", view.path("data").path("result").path("column").path("physName").asText());
        assertTrue(compare.path("meta").path("success").asBoolean(false), compare.toString());
        assertEquals("RMTL_COIL_THK", compare.path("data").path("result").path("physName").asText(), compare.toString());
    }

    @Test
    void P6_담당자의_용어_등록은_MDM016() throws Exception {
        JsonNode body = post("termRegPop", "reg", STEWARD, envelope(regParams()));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().startsWith(
                MdmErrorCode.STD_ADMIN_ROLE_REQUIRED.defaultMessage()), body.toString());
        assertEquals(3, count("TB_MDM_TERM"));
    }

    @Test
    void P7_표준_관리자는_유사어_조회와_등록을_한다() throws Exception {
        JsonNode search = post("termRegPop", "search", STD_ADMIN,
                envelope(json.createObjectNode().put("termName", "편차").put("engName", "Deviation")));
        JsonNode reg = post("termRegPop", "reg", STD_ADMIN, envelope(regParams()));

        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        assertEquals(1, search.path("data").path("result").path("nextSenseNo").asInt());
        assertEquals("DEV", search.path("data").path("result").path("abbr").path("suggested").asText());
        assertTrue(reg.path("meta").path("success").asBoolean(false), reg.toString());
        assertTrue(reg.path("data").path("result").path("term").path("termId").isNumber(), reg.toString());
        assertEquals(4, count("TB_MDM_TERM"));
    }

    @Test
    void P8_뒤_단계_실패는_앞_단계_쓰기를_남기지_않는다() throws Exception {
        // 검증은 모두 쓰기 전에 끝나므로(§6.12) 쓰기 뒤 실패는 DB 에서만 난다. 시험 전용 트리거로 매핑 INSERT 를
        // 실패시켜, 먼저 INSERT 된 컬럼 행이 프로세스 트랜잭션과 함께 롤백되는지 실측한다.
        jdbc.execute("CREATE OR REPLACE TRIGGER TR_P8_FAIL BEFORE INSERT ON TB_MDM_COLUMN_SYSTEM "
                + "FOR EACH ROW WHEN (NEW.PHYS_NAME = 'P8_FAIL') "
                + "BEGIN RAISE_APPLICATION_ERROR(-20001, 'P8 forced failure'); END;");
        try {
            ObjectNode body = saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true);
            ((ArrayNode) body.path("grids").path("systems").path("rows")).addObject()
                    .put("systemCode", "MES").put("physName", "P8_FAIL");

            JsonNode result = post("columnMng", "save", STD_ADMIN, body);

            assertFalse(result.path("meta").path("success").asBoolean(true), result.toString());
            assertEquals(0, count("TB_MDM_COLUMN"), "컬럼 INSERT 가 롤백되지 않았다");
            assertEquals(0, count("TB_MDM_COLUMN_SYSTEM"));
        } finally {
            jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER TR_P8_FAIL'; EXCEPTION WHEN OTHERS THEN "
                    + "IF SQLCODE != -4080 THEN RAISE; END IF; END;");
        }
    }

    @Test
    void P8b_다른_컬럼과_필드명이_겹치면_아무것도_쓰지_않는다() throws Exception {
        post("columnMng", "save", STD_ADMIN, saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true));
        long columnId = jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN", Long.class);
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ, VER) "
                + "VALUES ('코일 두께', 'COIL_THK', ?, 0, 0, 0)", domainId);
        long other = jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_THK'", Long.class);
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, 'MES', 'THK', 0)", other);
        ObjectNode body = saveBody("원재료 코일 두께", "RMTL_COIL_THK", true, true);
        ((ObjectNode) body.get("params")).put("columnId", columnId).put("usageNote", "바뀌면 안 된다");
        ((ArrayNode) body.path("grids").path("systems").path("rows")).addObject().put("systemCode", "MES").put("physName", "THK");

        JsonNode result = post("columnMng", "save", STD_ADMIN, body);

        assertFalse(result.path("meta").path("success").asBoolean(true), result.toString());
        assertTrue(result.path("meta").path("message").asText().startsWith(
                MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED.defaultMessage()), result.toString());
        assertEquals(2, count("TB_MDM_COLUMN"));
        assertEquals(2, count("TB_MDM_COLUMN_SYSTEM"));
        assertEquals(null, jdbc.queryForObject("SELECT USAGE_NOTE FROM TB_MDM_COLUMN WHERE COLUMN_ID = ?", String.class, columnId));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ObjectNode saveBody(String columnName, String physName, boolean withSystems, boolean withTerms) {
        ObjectNode params = json.createObjectNode()
                .put("columnName", columnName)
                .put("physName", physName)
                .put("labelLong", "원재료 코일 두께")
                .put("domainId", domainId)
                .put("required", true);
        ObjectNode body = envelope(params);
        ObjectNode grids = body.putObject("grids");
        if (withSystems) {
            ArrayNode rows = grids.putObject("systems").putArray("rows");
            rows.addObject().put("systemCode", "ERP").put("physName", "ZZ_" + physName.replace("*", "X"));
        }
        if (withTerms) {
            grids.putObject("terms").putArray("rows");
        }
        return body;
    }

    private ObjectNode regParams() {
        return json.createObjectNode()
                .put("termName", "편차").put("senseNo", 1).put("definition", "기준값과의 차이")
                .put("engName", "Deviation").put("engAbbr", "DEV");
    }

    private ObjectNode envelope(ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "columnMng");
        body.set("params", params);
        return body;
    }

    private JsonNode post(String service, String action, String role, ObjectNode body)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", role.equals(STD_ADMIN) ? "stdadmin" : "steward")
                .header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private long termId(String name) {
        return jdbc.queryForObject("SELECT TERM_ID FROM TB_MDM_TERM WHERE TERM_NAME = ? AND SENSE_NO = 1", Long.class, name);
    }

    private void insertTerm(String name, String abbr) {
        jdbc.update("INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, ENG_ABBR, VER) VALUES (?, 1, ?, ?, 0)",
                name, name + " 정의", abbr);
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
