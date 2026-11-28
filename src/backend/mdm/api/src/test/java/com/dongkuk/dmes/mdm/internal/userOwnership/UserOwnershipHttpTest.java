package com.dongkuk.dmes.mdm.internal.userOwnership;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 퇴직 처리 API(/internal/mdm/userOwnership) — mdm 앱을 실제로 띄워 보안 체인(ClientKeyFilter → 컨트롤러 주체 검사)과 Oracle SQL(JSON_TABLE 묶음
 * 바인드·DRAFT 만·편집자 중복 정리·감사 칸)을 확인한다.
 *
 * <p>심은 데이터(퇴직자 u1, 받는 사람 u2):
 * <ul>
 *   <li>코드 UO_C1 DRAFT 소유 u1, UO_C2 DRAFT 소유 u3</li>
 *   <li>ERD M1: v1 RELEASED 소유 u1(이력 — 세지 않는다), v2 DRAFT 소유 u1</li>
 *   <li>ERD M2 DRAFT(소유 x): 편집자 u1·u2 — u2 가 이미 편집자라 u1 행은 지운다</li>
 *   <li>ERD M3 DRAFT(소유 u2): 편집자 u1 — u2 가 소유자라 u1 행은 지운다</li>
 *   <li>ERD M4 DRAFT(소유 y): 편집자 u1 — u2 로 바꾼다</li>
 *   <li>작업 중 표시: M1 살아 있는 것 u1, M2 만료된 것 u1</li>
 *   <li>용어 소유 u1 하나</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = "cactus.security.client-key=" + UserOwnershipHttpTest.KEY)
@ActiveProfiles("local")
class UserOwnershipHttpTest extends AbstractMdmSharedDbTest {

    static final String KEY = "mdm-user-ownership-http-test-key";
    private static final List<String> MODELS = List.of("UO_M1", "UO_M2", "UO_M3", "UO_M4");

    @LocalServerPort
    int port;
    @Autowired
    JdbcTemplate jdbc;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();

    private static String effectiveKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return env != null && !env.isBlank() ? env : KEY;
    }

    @BeforeEach
    void seed() {
        for (String m : MODELS) {
            for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) {
                jdbc.update("DELETE FROM " + t + " WHERE ERD_MODEL_ID = ?", m);
            }
        }
        jdbc.update("DELETE FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID LIKE 'UO\\_%' ESCAPE '\\'");
        jdbc.update("DELETE FROM TB_MDM_CODE WHERE MARU_CODE_ID LIKE 'UO\\_%' ESCAPE '\\'");
        jdbc.update("DELETE FROM TB_MDM_TERM WHERE TERM_NAME LIKE 'UO\\_%' ESCAPE '\\'");

        for (String c : List.of("UO_C1", "UO_C2")) {
            jdbc.update("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES (?, ?, 'MDM')", c, c);
        }
        jdbc.update("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID) VALUES ('UO_C1', 1, 'MAJOR', 'DRAFT', 'u1')");
        jdbc.update("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID) VALUES ('UO_C2', 1, 'MAJOR', 'DRAFT', 'u3')");

        for (String m : MODELS) {
            jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES (?, ?, 'MCMAPUSER', ?)", m, m, m);
        }
        Timestamp past = Timestamp.from(Instant.parse("2026-01-01T00:00:00Z"));
        Timestamp future = Timestamp.from(Instant.now().plusSeconds(3600));
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, MODEL_JSON) "
                + "VALUES ('UO_M1', 1, 'RELEASED', 'u1', ?, ?, '{}')", past, future);
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('UO_M1', 2, 'u1', '{}')");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('UO_M2', 1, 'x', '{}')");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('UO_M3', 1, 'u2', '{}')");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('UO_M4', 1, 'y', '{}')");
        String editor = "INSERT INTO TB_MDM_ERD_EDITOR (ERD_MODEL_ID, VER, USER_ID) VALUES (?, 1, ?)";
        jdbc.update(editor, "UO_M2", "u1");
        jdbc.update(editor, "UO_M2", "u2");
        jdbc.update(editor, "UO_M3", "u1");
        jdbc.update(editor, "UO_M4", "u1");
        String claim = "INSERT INTO TB_MDM_ERD_CLAIM (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, VER) VALUES (?, ?, 's1', 'u1', ?, 0)";
        jdbc.update(claim, "UO_M1", "t1", future);
        jdbc.update(claim, "UO_M2", "t2", past);

        jdbc.update("INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, OWNER_ID) VALUES ('UO_용어', 1, 'u1')");
    }

    private HttpResponse<String> post(String action, Object body, String key, String user, String role) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/internal/mdm/userOwnership/" + action))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        if (key != null) b.header("X-Client-Key", key);
        if (user != null) b.header("X-Authenticated-User", user);
        if (role != null) b.header("X-Authenticated-Role", role);
        return client.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode mcm(String action, Object body) throws IOException, InterruptedException {
        HttpResponse<String> r = post(action, body, effectiveKey(), "system:mcm", "SYSTEM");
        assertEquals(200, r.statusCode(), r.body());
        return json.readTree(r.body());
    }

    /** {@code userId/kind → cnt}(summary) 또는 {@code kind → cnt}(handover). */
    private static Map<String, Long> counts(JsonNode items, boolean withUser) {
        Map<String, Long> out = new LinkedHashMap<>();
        for (JsonNode n : items) {
            out.put((withUser ? n.get("userId").asText() + "/" : "") + n.get("kind").asText(), n.get("cnt").asLong());
        }
        return out;
    }

    @Test
    void 키가_없거나_틀리면_401_이고_주체가_system_mcm_이_아니면_403() throws Exception {
        Map<String, Object> body = Map.of("userId", "u1");
        assertEquals(401, post("releaseClaims", body, null, "system:mcm", "SYSTEM").statusCode());
        assertEquals(401, post("releaseClaims", body, "wrong", "system:mcm", "SYSTEM").statusCode());
        int noUser = post("releaseClaims", body, effectiveKey(), null, null).statusCode();
        assertTrue(noUser == 401 || noUser == 403, "상태 " + noUser);
        assertEquals(403, post("releaseClaims", body, effectiveKey(), "admin", "SYSADMIN").statusCode());
        assertEquals(403, post("releaseClaims", body, effectiveKey(), "system:mls", "SYSTEM").statusCode());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CLAIM WHERE USER_ID = 'u1' AND ERD_MODEL_ID = 'UO_M1'", Integer.class));
    }

    @Test
    void 건수는_DRAFT_와_살아_있는_표시만_세고_천_명이_넘어도_빠지지_않는다() throws Exception {
        List<Map<String, String>> users = new ArrayList<>();
        for (int i = 0; i < 1500; i++) {
            users.add(Map.of("userId", "nobody-" + i));
        }
        users.add(700, Map.of("userId", "u1", "empNo", "1001"));
        users.add(Map.of("userId", "u3"));

        JsonNode r = mcm("summary", Map.of("users", users));

        Map<String, Long> expected = new LinkedHashMap<>();
        expected.put("u1/CODE_OWNER", 1L);
        expected.put("u1/ERD_OWNER", 1L);  // v1 RELEASED 는 이력
        expected.put("u1/ERD_EDITOR", 3L);
        expected.put("u1/TERM_OWNER", 1L);
        expected.put("u1/ERD_CLAIM", 1L);  // 만료된 표시는 세지 않는다
        expected.put("u3/CODE_OWNER", 1L);
        assertEquals(expected, counts(r.get("items"), true));
        assertEquals("ERD 초안 소유", r.get("items").get(1).get("kindNm").asText());
    }

    @Test
    void 넘기기는_DRAFT_소유와_편집자를_받는_사람에게_옮기고_표시를_지우고_감사_칸을_쓴다() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fromUserId", "u1");
        body.put("fromEmpNo", "1001");
        body.put("toUserId", "u2");
        body.put("toEmpNo", null);

        JsonNode r = mcm("handover", body);

        Map<String, Long> expected = new LinkedHashMap<>();
        for (UserOwnershipKind k : UserOwnershipKind.values()) expected.put(k.name(), 0L);
        expected.put("CODE_OWNER", 1L);
        expected.put("ERD_OWNER", 1L);
        expected.put("ERD_EDITOR", 3L); // 지운 중복 2 + 바꾼 1
        expected.put("TERM_OWNER", 1L);
        expected.put("ERD_CLAIM", 2L);  // 만료된 것까지 지운다
        assertEquals(expected, counts(r.get("items"), false));
        for (JsonNode n : r.get("items")) assertEquals(false, n.get("skipped").asBoolean(), n.toString());

        Map<String, Object> code = jdbc.queryForMap(
                "SELECT OWNER_ID, ROW_VERSION, AUD_VER, U_USR_ID, U_SVC_ID, U_PGM_ID, U_AT FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'UO_C1'");
        assertEquals("u2", code.get("OWNER_ID"));
        assertEquals(1L, ((Number) code.get("ROW_VERSION")).longValue());
        assertEquals(1L, ((Number) code.get("AUD_VER")).longValue());
        assertEquals("system:mcm", code.get("U_USR_ID"));
        assertEquals("userOwnership", code.get("U_SVC_ID"));
        assertEquals("handover", code.get("U_PGM_ID"));
        assertTrue(code.get("U_AT") != null);
        assertEquals("u3", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'UO_C2'", String.class));

        assertEquals("u1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'UO_M1' AND VER = 1", String.class));
        assertEquals("u2", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'UO_M1' AND VER = 2", String.class));
        assertEquals(List.of("UO_M2/u2", "UO_M4/u2"), jdbc.queryForList(
                "SELECT ERD_MODEL_ID || '/' || USER_ID FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID LIKE 'UO\\_%' ESCAPE '\\' ORDER BY ERD_MODEL_ID, USER_ID",
                String.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CLAIM WHERE USER_ID = 'u1'", Integer.class));
        assertEquals("u2", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_TERM WHERE TERM_NAME = 'UO_용어'", String.class));

        // 다시 부르면 넘길 것이 없다
        JsonNode again = mcm("summary", Map.of("users", List.of(Map.of("userId", "u1"))));
        assertEquals(0, again.get("items").size(), again.toString());
    }

    @Test
    void 받는_사람이_없거나_같으면_400_이고_아무것도_바꾸지_않는다() throws Exception {
        HttpResponse<String> same = post("handover", Map.of("fromUserId", "u1", "toUserId", "u1"), effectiveKey(), "system:mcm", "SYSTEM");
        assertEquals(400, same.statusCode(), same.body());
        assertEquals("USER_OWNERSHIP_INVALID", json.readTree(same.body()).get("code").asText());
        assertEquals(400, post("handover", Map.of("fromUserId", "u1"), effectiveKey(), "system:mcm", "SYSTEM").statusCode());
        assertEquals("u1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'UO_C1'", String.class));
    }

    @Test
    void 작업_중_표시_지우기는_그_사용자_표시만_지운다() throws Exception {
        jdbc.update("INSERT INTO TB_MDM_ERD_CLAIM (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, VER) VALUES ('UO_M3', 't9', 's3', 'u3', ?, 0)",
                Timestamp.from(Instant.now().plusSeconds(3600)));

        JsonNode r = mcm("releaseClaims", Map.of("userId", "u1"));

        assertEquals(2, r.get("cnt").asInt());
        assertEquals(List.of("u3"), jdbc.queryForList(
                "SELECT USER_ID FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID LIKE 'UO\\_%' ESCAPE '\\'", String.class));
        assertEquals("u1", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'UO_C1'", String.class));
    }
}
