package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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

/** erdEdit OASIS 서비스 — BPMN 까지 태우는 HTTP 파이프(DmeOasisHttpTest 형식). 역할·사용자는 헤더로 준다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdEditOasisHttpTest.KEY)
@ActiveProfiles("local")
class ErdEditOasisHttpTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-test-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : KEY;
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        return call(action, user, "MDM_STEWARD", params);
    }

    JsonNode call(String action, String user, String role, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    @Test
    void regSaveViewAndChanges() throws Exception {
        assertThat(call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"))
                .at("/meta/success").asBoolean()).isTrue();
        JsonNode saved = call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "session", "ui-owner", "source", "UI",
                "commandsJson", "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).isTrue();
        assertThat(saved.at("/data/result/changes/0/value/phys").asText()).isEqualTo("TB_A"); // JsonNode 가 Jackson 3 응답에서도 객체로 나온다
        JsonNode view = call("view", "viewer", Map.of("modelId", "mcm"));
        assertThat(view.at("/data/result/rev").asLong()).isEqualTo(1);
        assertThat(view.at("/data/result/model").asText()).contains("TB_A");
        JsonNode changes = call("view", "viewer", Map.of("modelId", "mcm", "sinceRev", 0));
        assertThat(changes.at("/data/result/deltas/0/changes/0/id").asText()).isEqualTo("t-1");
    }

    @Test
    void rejectionIsSuccessResponseWithRejection() throws Exception {
        call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"));
        JsonNode r = call("save", "stranger", Map.of("modelId", "mcm", "baseRev", 0, "session", "x", "source", "MCP",
                "commandsJson", "[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        assertThat(r.at("/data/result/rejection/code").asText()).isEqualTo("NOT_EDITOR");
    }

    @Test
    void compareGivesPhysPreview() throws Exception {
        JsonNode r = call("compare", "owner", Map.of("logical", "역할아이디"));
        assertThat(r.at("/meta/success").asBoolean()).isTrue();
        assertThat(r.at("/data/result").has("tokens")).isTrue();
    }

    long draftRowVersion() {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", Long.class);
    }

    /** deferred 36 — 실패 경로가 S001 이 아니라 업무 오류 코드로 오고, 실패한 동작은 아무것도 바꾸지 않는다. */
    @Test
    void failurePathsAreBusinessErrors() throws Exception {
        reg();
        assertThat(call("view", "owner", Map.of("modelId", "mcm", "ver", "9.999")).at("/meta/code").asText()).isEqualTo("MDM029");
        JsonNode view = call("view", "owner", Map.of("modelId", "mcm"));
        String ver = view.at("/data/result/ver").asText();
        long rv = view.at("/data/result/rowVersion").asLong();
        assertThat(call("unlock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rv + 5)).at("/meta/code").asText())
                .isEqualTo("MDM001");
        assertThat(draftRowVersion()).isEqualTo(rv);
        // 사전에 없는 토막의 컬럼(MISS) — 첫 확정은 경고로만 알린다(R8-1). 확인 없이 확정하면 MDM014.
        JsonNode setup = call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "commandsJson",
                "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                        + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"ZZQX_QWV\",\"logical\":\"모름\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        assertThat(setup.at("/data/result/applied").asBoolean()).as(setup.toString()).isTrue();
        Map<String, Object> confirm = new HashMap<>(Map.of("modelId", "mcm", "ver", ver, "rowVersion", draftRowVersion(),
                "applyFrom", "2030-01-01 00:00:00"));
        long rv1 = draftRowVersion();
        assertThat(call("confirm", "kim", confirm).at("/meta/code").asText()).isEqualTo("MDM003");               // 소유자가 아니다
        assertThat(draftRowVersion()).isEqualTo(rv1);
        assertThat(call("confirm", "owner", "MDM_STD_ADMIN", confirm).at("/meta/code").asText()).isEqualTo("MDM013"); // 담당자 역할이 없다
        assertThat(draftRowVersion()).isEqualTo(rv1);
        JsonNode noAck = call("confirm", "owner", confirm);
        assertThat(noAck.at("/meta/code").asText()).as(noAck.toString()).isEqualTo("MDM014");
        assertThat(draftRowVersion()).isEqualTo(rv1);
        confirm.put("warningsAcknowledged", true);
        assertThat(call("confirm", "owner", confirm).at("/data/result/ok").asBoolean()).isTrue();
        // 두 번째 버전에서 새로 더한 위반 컬럼은 확정을 막는다(D19) → MDM010
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET APPLY_FROM = ADD_MONTHS(APPLY_FROM, -240) WHERE ERD_MODEL_ID = 'mcm'");
        String ver2 = call("copy", "owner", Map.of("modelId", "mcm", "verKind", "MINOR")).at("/data/result/ver").asText();
        long rev = jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", Long.class);
        JsonNode added = call("save", "owner", Map.of("modelId", "mcm", "baseRev", rev, "commandsJson",
                "[{\"op\":\"addColumn\",\"id\":\"c-2\",\"table\":\"t-1\",\"phys\":\"ZZQX_QWZ\",\"logical\":\"모름2\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        assertThat(added.at("/data/result/applied").asBoolean()).as(added.toString()).isTrue();
        long rv2 = draftRowVersion();
        JsonNode blocked = call("confirm", "owner", Map.of("modelId", "mcm", "ver", ver2, "rowVersion", rv2,
                "applyFrom", "2031-01-01 00:00:00", "warningsAcknowledged", true));
        assertThat(blocked.at("/meta/code").asText()).as(blocked.toString()).isEqualTo("MDM010");
        assertThat(draftRowVersion()).isEqualTo(rv2);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND VER = ?", String.class,
                new java.math.BigDecimal(ver2))).isEqualTo("DRAFT");
    }

    private void reg() throws Exception {
        assertThat(call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"))
                .at("/meta/success").asBoolean()).isTrue();
    }

    @Test
    void searchAndExecuteEditorsAndValidate() throws Exception {
        reg();
        JsonNode search = call("search", "viewer", Map.of());
        assertThat(search.at("/meta/success").asBoolean()).as(search.toString()).isTrue();
        assertThat(search.toString()).contains("\"modelId\":\"mcm\"").contains("\"ownerId\":\"owner\"");
        JsonNode add = call("execute", "owner", Map.of("modelId", "mcm", "kind", "ADD_EDITOR", "userId", "kim"));
        assertThat(add.at("/data/result/ok").asBoolean()).as(add.toString()).isTrue();
        JsonNode view = call("view", "kim", Map.of("modelId", "mcm"));
        assertThat(view.at("/data/result/editors/0").asText()).isEqualTo("kim");
        JsonNode saved = call("save", "kim", Map.of("modelId", "mcm", "baseRev", 0, "commandsJson",
                "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
        JsonNode removed = call("execute", "owner", Map.of("modelId", "mcm", "kind", "REMOVE_EDITOR", "userId", "kim"));
        assertThat(removed.at("/data/result/ok").asBoolean()).as(removed.toString()).isTrue();
        JsonNode validate = call("validate", "owner", Map.of("modelId", "mcm"));
        assertThat(validate.at("/meta/success").asBoolean()).as(validate.toString()).isTrue();
        JsonNode restored = call("restore", "owner", Map.of("modelId", "mcm", "rev", 1, "session", "ui-owner", "source", "UI"));
        assertThat(restored.at("/data/result/applied").asBoolean()).as(restored.toString()).isTrue();
    }

    @Test
    void draftOwnershipAndDelete() throws Exception {
        reg();
        JsonNode view = call("view", "owner", Map.of("modelId", "mcm"));
        long rv = view.at("/data/result/rowVersion").asLong();
        String ver = view.at("/data/result/ver").asText();
        JsonNode unlock = call("unlock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rv));
        assertThat(unlock.at("/meta/success").asBoolean()).as(unlock.toString()).isTrue();
        long rv2 = unlock.at("/data/result/rowVersion").asLong();
        JsonNode lock = call("lock", "kim", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rv2));
        assertThat(lock.at("/meta/success").asBoolean()).as(lock.toString()).isTrue();
        long rv3 = lock.at("/data/result/rowVersion").asLong();
        // 담당자 조회 어댑터가 없는 시험 환경은 fail-closed(MDM005) — 넘기기 배선만 본다.
        JsonNode handover = call("handover", "kim", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rv3, "newOwnerId", "lee"));
        assertThat(handover.at("/meta/code").asText()).as(handover.toString()).isEqualTo("MDM005");
        // I1: 확정 버전이 없는 모델의 첫 DRAFT 는 지울 수 없다(지우면 모듈이 막힌다). 업무 오류(MDM009)이고 아무것도 바뀌지 않는다.
        JsonNode first = call("delete", "kim", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rv3));
        assertThat(first.at("/meta/code").asText()).as(first.toString()).isEqualTo("MDM009");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", Long.class)).isZero();
        // 확정 버전이 있으면 새 DRAFT 는 지운다.
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID = 'mcm'");
        JsonNode copy = call("copy", "kim", Map.of("modelId", "mcm", "verKind", "MINOR"));                // rev 1 (표시)
        String ver2 = copy.at("/data/result/ver").asText();
        long rv4 = jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", Long.class);
        JsonNode del = call("delete", "kim", Map.of("modelId", "mcm", "ver", ver2, "rowVersion", rv4));     // rev 2 (표시)
        assertThat(del.at("/data/result/ok").asBoolean()).as(del.toString()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", Integer.class)).isZero();
        // B2: OASIS 트랜잭션 안의 삭제도 rev 를 올리고 표시 행(SYSTEM, 지운 사람)을 남긴다.
        assertThat(jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForMap("SELECT USER_ID, SOURCE FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mcm' AND REV = 2"))
                .containsEntry("USER_ID", "kim").containsEntry("SOURCE", "SYSTEM");
        JsonNode changes = call("view", "kim", Map.of("modelId", "mcm", "sinceRev", 0));
        assertThat(changes.at("/data/result/reload").asBoolean()).as(changes.toString()).isTrue();
    }

    @Test
    void confirmThenCopyNewVersion() throws Exception {
        reg();
        call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "commandsJson",
                "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        JsonNode view = call("view", "owner", Map.of("modelId", "mcm"));
        JsonNode confirm = call("confirm", "owner", Map.of("modelId", "mcm", "ver", view.at("/data/result/ver").asText(),
                "rowVersion", view.at("/data/result/rowVersion").asLong(), "applyFrom", "2030-01-01 00:00:00",
                "warningsAcknowledged", true));
        assertThat(confirm.at("/data/result/ok").asBoolean()).as(confirm.toString()).isTrue();
        // 적용 시각 전의 확정 버전이 있으면 새 버전을 못 만든다(MDM006) — 적용 시각을 과거로 돌린 뒤에 만든다.
        JsonNode early = call("copy", "owner", Map.of("modelId", "mcm", "verKind", "MINOR"));
        assertThat(early.at("/meta/code").asText()).as(early.toString()).isEqualTo("MDM006");
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET APPLY_FROM = ADD_MONTHS(APPLY_FROM, -240) WHERE ERD_MODEL_ID = 'mcm'");
        JsonNode copy = call("copy", "owner", Map.of("modelId", "mcm", "verKind", "MINOR"));
        assertThat(copy.at("/data/result/ver").asText()).as(copy.toString()).isEqualTo("1.001");
    }

    @Test
    void claimReleaseAndPresenceThroughOasis() throws Exception {
        reg();
        call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "commandsJson",
                "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        JsonNode c1 = call("execute", "owner", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1", "session", "s-a"));
        assertThat(c1.at("/data/result/ok").asBoolean()).as(c1.toString()).isTrue();
        // 응답 뒤 다른 연결에서 바로 읽힌다 — CLAIM 이 응답 전에 커밋됐다는 최소 확인(OASIS 트랜잭션에 합류, deferred 27).
        assertThat(jdbc.queryForList("SELECT SESSION_NM FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = 'mcm' AND TABLE_UUID = 't-1'", String.class))
                .containsExactly("s-a");
        // 유효한 표시를 다른 세션이 빼앗지 못한다.
        JsonNode c2 = call("execute", "owner", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1", "session", "s-b"));
        assertThat(c2.at("/meta/success").asBoolean()).as(c2.toString()).isTrue();
        assertThat(c2.at("/data/result/ok").asBoolean()).as(c2.toString()).isFalse();
        JsonNode rel = call("execute", "owner", Map.of("modelId", "mcm", "kind", "RELEASE", "tableId", "t-1", "session", "s-a"));
        assertThat(rel.at("/data/result/ok").asBoolean()).as(rel.toString()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = 'mcm'", Integer.class)).isZero();
        JsonNode c3 = call("execute", "owner", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1", "session", "s-b"));
        assertThat(c3.at("/data/result/ok").asBoolean()).as(c3.toString()).isTrue();
        // 없는 모델은 FK 오류가 아니라 ERD_MODEL_NOT_FOUND.
        JsonNode missing = call("execute", "owner", Map.of("modelId", "nope", "kind", "CLAIM", "tableId", "t-1", "session", "s-a"));
        assertThat(missing.at("/meta/code").asText()).as(missing.toString()).isEqualTo("MDM029");
        JsonNode view = call("view", "owner", Map.of("modelId", "mcm"));
        assertThat(view.at("/data/result/presence").isArray()).as(view.toString()).isTrue();
    }

    /** 단계 1 S1: 화면 상태 공유는 읽기 액션 view 의 kind 다. execute 는 더 이상 SET_VIEW 를 받지 않는다. */
    @Test
    void setViewNeedsConnectedSessionAndValidJson() throws Exception {
        reg();
        // RBAC 키는 OASIS 액션 이름이다. view 가 READ 세트에 있으므로 읽기 전용 사용자도 부를 수 있다.
        assertThat(MdmPermissions.READ_ACTIONS).contains("view");
        JsonNode noSse = call("view", "viewer", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse",
                "viewJson", "{\"diagramId\":\"d-1\",\"selectedTables\":[\"t-1\"]}"));
        assertThat(noSse.at("/meta/code").asText()).as(noSse.toString()).isEqualTo("MDM021");
        assertThat(noSse.at("/meta/message").asText() + noSse).contains("실시간 채널");
        JsonNode bad = call("view", "viewer", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse", "viewJson", "{oops"));
        assertThat(bad.at("/meta/code").asText()).as(bad.toString()).isEqualTo("MDM021");
        JsonNode notObj = call("view", "viewer", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse", "viewJson", "[1]"));
        assertThat(notObj.at("/meta/code").asText()).as(notObj.toString()).isEqualTo("MDM021");

        JsonNode old = call("execute", "owner", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse",
                "viewJson", "{\"diagramId\":\"d-1\",\"selectedTables\":[\"t-1\"]}"));
        assertThat(old.at("/meta/code").asText()).as(old.toString()).isEqualTo("MDM021");
        assertThat(old.at("/meta/message").asText() + old).contains("지원하지 않는 kind");

        JsonNode unknown = call("view", "viewer", Map.of("modelId", "mcm", "kind", "BOGUS"));
        assertThat(unknown.at("/meta/code").asText()).as(unknown.toString()).isEqualTo("MDM021");
        assertThat(unknown.at("/meta/message").asText() + unknown).contains("지원하지 않는 kind");

        // kind 가 없으면 단계 0 그대로 모델 전체를 돌려준다.
        JsonNode plain = call("view", "viewer", Map.of("modelId", "mcm"));
        assertThat(plain.at("/data/result/model").isTextual()).as(plain.toString()).isTrue();
    }

    // ---- 최종 검토 B5·B6 ----

    private void assertInvalid(JsonNode r) {
        assertThat(r.at("/meta/code").asText()).as(r.toString()).isEqualTo("MDM021");
    }

    /** B5: 칸 크기를 넘는 값은 ORA-12899(S001)가 아니라 입력 오류(MDM021)다. */
    @Test
    void oversizeInputsAreInvalidNotS001() throws Exception {
        assertInvalid(call("reg", "owner", Map.of("modelId", "m".repeat(51), "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM")));
        assertInvalid(call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "x".repeat(21), "schemaName", "MCMAPUSER", "modelName", "MCM")));
        assertInvalid(call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "S".repeat(129), "modelName", "MCM")));
        assertInvalid(call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "n".repeat(201))));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL", Integer.class)).isZero();
        reg();
        assertInvalid(call("execute", "owner", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t".repeat(51), "session", "s-a")));
        assertInvalid(call("execute", "owner", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1", "session", "s".repeat(101))));
        assertInvalid(call("execute", "owner", Map.of("modelId", "mcm", "kind", "ADD_EDITOR", "userId", "u".repeat(51))));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CLAIM", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR", Integer.class)).isZero();
        // 경계값은 들어간다
        JsonNode ok = call("execute", "owner", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t".repeat(50), "session", "s".repeat(100)));
        assertThat(ok.at("/data/result/ok").asBoolean()).as(ok.toString()).isTrue();
    }

    /** B6: 모듈 하나에 모델 하나(D2) — 같은 모듈의 두 번째 등록은 깨끗한 업무 오류다. */
    @Test
    void secondModelForSameModuleIsInvalid() throws Exception {
        reg();
        JsonNode dup = call("reg", "owner", Map.of("modelId", "mcm2", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM2"));
        assertInvalid(dup);
        assertThat(dup.at("/meta/message").asText() + dup.toString()).contains("mcm");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_MODEL", Integer.class)).isEqualTo(1);
    }
}
