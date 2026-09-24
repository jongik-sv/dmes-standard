package com.dongkuk.dmes.mdm.dmc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-02 design.md §3.2 H1~H4 — BPMN 까지 태우는 HTTP 파이프 시험(DmaOasisHttpTest 골격).
 *
 * <p>가짜 {@code MdmCurrentUser} 를 쓰지 않는다. 역할·사용자는 {@code X-Authenticated-*} 헤더 → {@code CactusMdmCurrentUser}
 * 실제 경로로 준다. 등록 한 액션이 OASIS 프로세스 트랜잭션 하나라는 것(I7)과 서비스 역할 가드(I12)의 증거다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + DmcOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class DmcOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-dmc-test-client-key";
    private static final String STD_ADMIN = "MDM_STD_ADMIN";
    private static final String STEWARD = "MDM_STEWARD";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;
    private MasterCodeSeeds seeds;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-dmc-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
    }

    @Test
    void H1_담당자_등록은_세_행을_만들고_헤더_사용자가_소유자다() throws Exception {
        // lvlCnt 를 문자열로 보내 OASIS 가 Integer 로 바꾸는지 함께 본다(E2E beforeAll 이 문자열을 보낸다).
        JsonNode body = post("codeMng", "reg", STEWARD, envelope("codeMng", regParams("PROC_CD").put("lvlCnt", "2")));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertEquals("1.000", body.path("data").path("result").path("ver").asText(), body.toString());
        assertEquals("steward", body.path("data").path("result").path("ownerId").asText(), body.toString());
        assertEquals(1, seeds.count("TB_MDM_CODE"));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
        assertEquals(1, seeds.count("TB_MDM_CODE_CATE"));
        assertEquals(2, jdbc.queryForObject("SELECT LVL_CNT FROM TB_MDM_CODE", Integer.class));
        assertEquals("steward", jdbc.queryForObject("SELECT C_USR_ID FROM TB_MDM_CODE", String.class));
        assertEquals("steward", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));
        assertEquals("steward", jdbc.queryForObject("SELECT C_USR_ID FROM TB_MDM_CODE_CATE", String.class));
    }

    @Test
    void H2_BASE_INSERT_가_실패하면_코드와_VER_도_남지_않는다() throws Exception {
        jdbc.execute("CREATE TRIGGER TR_H2_FAIL BEFORE INSERT ON TB_MDM_CODE_CATE BEGIN SELECT RAISE(ABORT, 'H2 forced'); END");
        try {
            JsonNode body = post("codeMng", "reg", STEWARD, envelope("codeMng", regParams("PROC_CD")));

            assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
            assertEquals(0, seeds.count("TB_MDM_CODE"), "코드 INSERT 가 롤백되지 않았다");
            assertEquals(0, seeds.count("TB_MDM_CODE_VER"), "VER INSERT 가 롤백되지 않았다");
            assertEquals(0, seeds.count("TB_MDM_CODE_CATE"));
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS TR_H2_FAIL");
        }
    }

    @Test
    void H3_표준_관리자_등록은_MDM013_문구가_meta_message_로_온다() throws Exception {
        JsonNode body = post("codeMng", "reg", STD_ADMIN, envelope("codeMng", regParams("PROC_CD")));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().startsWith(
                MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), body.toString());
        assertEquals(0, seeds.count("TB_MDM_CODE"));

        JsonNode search = post("codeMng", "search", STD_ADMIN, envelope("codeMng", json.createObjectNode()));
        assertTrue(search.path("meta").path("success").asBoolean(false), "조회는 가드가 없다 " + search);
    }

    @Test
    void H4_codeEdit_lock_unlock_분기가_서비스로_라우팅된다() throws Exception {
        // 소유권 액션 권한은 BFF(TSK-08-02 몫)가 본다. mdm 서버를 직접 부르면 BPMN 분기·서비스 경로만 시험한다.
        post("codeMng", "reg", STEWARD, envelope("codeMng", regParams("PROC_CD")));

        JsonNode unlock = post("codeEdit", "unlock", STEWARD, envelope("codeEdit", draftParams(0)));
        assertTrue(unlock.path("meta").path("success").asBoolean(false), unlock.toString());
        JsonNode row = unlock.path("data").path("result").path("versions").path(0);
        assertTrue(row.path("ownerId").isNull(), unlock.toString());
        assertEquals(1, row.path("rowVersion").asInt(), unlock.toString());

        JsonNode lock = post("codeEdit", "lock", STEWARD, envelope("codeEdit", draftParams(1)));
        assertTrue(lock.path("meta").path("success").asBoolean(false), lock.toString());
        assertEquals("steward", lock.path("data").path("result").path("versions").path(0).path("ownerId").asText());
        assertEquals("steward", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER", String.class));

        JsonNode byAdmin = post("codeEdit", "unlock", STD_ADMIN, envelope("codeEdit", draftParams(2)));
        assertFalse(byAdmin.path("meta").path("success").asBoolean(true), byAdmin.toString());
        assertTrue(byAdmin.path("meta").path("message").asText().startsWith(
                MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), byAdmin.toString());
    }

    private ObjectNode draftParams(int rowVersion) {
        return json.createObjectNode().put("maruCodeId", "PROC_CD").put("ver", "1.000").put("rowVersion", rowVersion);
    }

    // ── 도우미 ──

    ObjectNode regParams(String id) {
        return json.createObjectNode().put("maruCodeId", id).put("maruCodeName", "공정 코드");
    }

    ObjectNode envelope(String menuId, ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", params);
        return body;
    }

    JsonNode post(String service, String action, String role, ObjectNode body)
            throws IOException, InterruptedException {
        return post(service, action, role, role.equals(STD_ADMIN) ? "stdadmin" : "steward", body);
    }

    JsonNode post(String service, String action, String role, String user, ObjectNode body)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
