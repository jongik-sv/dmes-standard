package com.dongkuk.dmes.mcm.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * BPMN 까지 태우는 OASIS 시험 — BFF 가 부르는 {@code POST /oasis/{serviceId}/{action}} 가 실행기에 넘기는 요청 봉투
 * ({@code meta·params·grids})를 그대로 만들어 {@link OasisServiceExecutor} 로 돌리고, 응답을 JSON 봉투로 바꿔 모양을 확인한다.
 * 서비스 시험이 못 잡는 것: DTO 바인딩(빈 params), {@code output="result"} → {@code data.result.list},
 * {@code grids.master.rows} → save 파라미터 바인딩, 서비스 오류 → {@code meta.success=false}·{@code meta.code}.
 *
 * <p><b>mls 의 HTTP 시험과 다른 점</b>: mls 는 로그인을 호스팅하지 않아 {@code X-Client-Key} 신뢰 채널로 실제 서버를 띄웠다. mcm 은
 * 로그인을 호스팅하고 cactus 인증이 켜져 있어 같은 방식이면 JWT 를 발급받아야 하고, {@code McmApplication} 이 {@code com.dongkuk.dmes.mcm}
 * 전체를 스캔해 시험 클래스의 중첩 {@code @Configuration} 과 충돌하므로 앱 전체를 띄울 수 없다({@link McmNoticeTestDb}).
 * 그래서 mcm 의 선례({@code MenuCatalogOasisSaveIntegrationTest})처럼 운영과 같은 조립({@link OasisAutoConfiguration#serviceStarter})의
 * 실행기를 직접 부른다. 웹 계층(컨트롤러·필터)은 지나지 않는다:
 * <ul>
 *   <li>{@code X-Authenticated-Role} 헤더 → 사용자 문맥 변환(필터 몫)은 {@link UserContextHolder} 를 직접 채워 대신한다. 필터가 실제로
 *       {@code ROLE_} 접두를 붙여 채우는 값과 같은 모양이다. 헤더 없음·빈 값은 역할 없는 사용자 문맥이다.</li>
 *   <li>HTTP 상태(200)·{@code Content-Type} 단언은 웹 계층 몫이라 뺀다. 업무 오류는 실행기 응답의 {@code meta.success=false} 로 같게 본다.</li>
 * </ul>
 */
class NoticeOasisHttpTest extends McmNoticeTestDb {

    @Autowired
    DataSource dataSource;
    @Autowired
    ApplicationContext context;

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private JdbcTemplate jdbc;
    private OasisServiceExecutor executor;

    @BeforeEach
    void clean() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM TB_MCM_NOTICE_TARGET WHERE NOTICE_ID LIKE 'NTHTTP%'");
        jdbc.update("DELETE FROM TB_MCM_NOTICE WHERE NOTICE_ID LIKE 'NTHTTP%'");
        executor = new OasisServiceExecutor(starter(), context, new CactusRequestConverter(), new CactusResponseConverter());
    }

    @AfterEach
    void clearUser() {
        UserContextHolder.clear();
    }

    /** 운영과 같은 조립 — {@link OasisAutoConfiguration#serviceStarter} 의 transactional + multi-tx 분기. */
    private com.dongkuk.oasis.service.ServiceStarter starter() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties txProps = new CactusTxProperties();
        txProps.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        txProps.setDefaultManager("txBiz");
        return new OasisAutoConfiguration().serviceStarter(props, txProps, context);
    }

    private void insert(String id, String title, String status, String category, String pinYn, String format, String content) {
        jdbc.update("INSERT INTO TB_MCM_NOTICE (NOTICE_ID, TITLE, CONTENT, NOTICE_STATUS, POST_START_DT, POST_END_DT, "
                        + "CONTENT_FORMAT, NOTICE_CATEGORY, PIN_YN, TARGET_SCOPE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ALL')",
                id, title, content, status, LocalDate.now().minusDays(1).toString(), LocalDate.now().plusDays(1).toString(),
                format, category, pinYn);
    }

    private static List<String> ids(JsonNode list) {
        List<String> out = new ArrayList<>();
        list.forEach(r -> out.add(r.path("NOTICE_ID").asText()));
        return out;
    }

    @Test
    void noticeBoard_search_는_빈_params_로_data_result_list_를_돌려준다() throws Exception {
        insert("NTHTTP0001", "HTTP 일반", "POSTED", "NORMAL", "N", "TEXT", "본문");
        insert("NTHTTP0002", "HTTP 긴급", "POSTED", "URGENT", "N", "HTML", "<p onclick=\"x()\">긴급</p>");
        insert("NTHTTP0003", "HTTP 작성중", "DRAFT", "URGENT", "Y", "TEXT", "본문");

        JsonNode res = post("noticeBoard", "search", envelope("noticeBoard", json.createObjectNode()));

        assertEquals(true, res.path("meta").path("success").asBoolean(false), res.toString());
        JsonNode list = res.path("data").path("result").path("list");
        assertThat(list.isArray()).as(res.toString()).isTrue();
        List<String> got = ids(list).stream().filter(id -> id.startsWith("NTHTTP")).toList();
        assertThat(got).containsExactly("NTHTTP0002", "NTHTTP0001");
        JsonNode urgent = list.get(ids(list).indexOf("NTHTTP0002"));
        assertEquals("<p>긴급</p>", urgent.path("CONTENT").asText());
        assertEquals("URGENT", urgent.path("NOTICE_CATEGORY").asText());
        assertEquals("HTML", urgent.path("CONTENT_FORMAT").asText());
        assertEquals("N", urgent.path("PIN_YN").asText());
    }

    @Test
    void noticeBoard_search_의_limit_는_params_로_받는다() throws Exception {
        insert("NTHTTP0001", "HTTP 1", "POSTED", "NORMAL", "N", "TEXT", "본문");
        insert("NTHTTP0002", "HTTP 2", "POSTED", "NORMAL", "N", "TEXT", "본문");

        JsonNode res = post("noticeBoard", "search", envelope("noticeBoard", json.createObjectNode().put("limit", 1)));

        assertEquals(1, res.path("data").path("result").path("list").size(), res.toString());
    }

    @Test
    void noticeMgmt_search_는_분류_형식_조건을_받고_허용_밖_값은_실패_봉투다() throws Exception {
        insert("NTHTTP0001", "HTTP 점검 MD", "DRAFT", "MAINT", "N", "MD", "# 제목");
        insert("NTHTTP0002", "HTTP 일반", "DRAFT", "NORMAL", "N", "TEXT", "본문");

        JsonNode res = post("noticeMgmt", "search", envelope("noticeMgmt",
                json.createObjectNode().put("title", "HTTP").put("noticeCategory", "MAINT").put("contentFormat", "MD")));
        assertEquals(true, res.path("meta").path("success").asBoolean(false), res.toString());
        assertThat(ids(res.path("data").path("result").path("list"))).containsExactly("NTHTTP0001");

        JsonNode bad = post("noticeMgmt", "search", envelope("noticeMgmt", json.createObjectNode().put("noticeCategory", "EVENT")));
        assertEquals(false, bad.path("meta").path("success").asBoolean(true), bad.toString());
    }

    @Test
    void noticeMgmt_save_는_grids_master_rows_를_받아_HTML_을_소독해_저장한다() throws Exception {
        ObjectNode row = json.createObjectNode()
                .put("rowStatus", "C")
                .put("TITLE", "HTTP 저장 HTML")
                .put("CONTENT", "<p style=\"color:red\">안내</p><script>alert(1)</script>")
                .put("NOTICE_STATUS", "DRAFT")
                .put("CONTENT_FORMAT", "HTML")
                .put("NOTICE_CATEGORY", "URGENT")
                .put("PIN_YN", "Y");
        ObjectNode body = envelope("noticeMgmt", json.createObjectNode());
        ArrayNode rows = body.putObject("grids").putObject("master").putArray("rows");
        rows.add(row);

        JsonNode res = post("noticeMgmt", "save", body);

        assertEquals(true, res.path("meta").path("success").asBoolean(false), res.toString());
        assertEquals(1, res.path("data").path("result").path("cntMerge").asInt(), res.toString());
        // savedIds — 신규 행의 서버 채번 NOTICE_ID 를 돌려준다(화면이 제목으로 추정하지 않아도 된다).
        JsonNode savedIds = res.path("data").path("result").path("savedIds");
        assertEquals(1, savedIds.size(), res.toString());
        assertEquals(jdbc.queryForObject("SELECT NOTICE_ID FROM TB_MCM_NOTICE WHERE TITLE = 'HTTP 저장 HTML'", String.class),
                savedIds.get(0).asText());
        String stored = jdbc.queryForObject("SELECT CONTENT || '|' || CONTENT_FORMAT || '|' || NOTICE_CATEGORY || '|' || PIN_YN "
                + "FROM TB_MCM_NOTICE WHERE TITLE = 'HTTP 저장 HTML'", String.class);
        assertEquals("<p>안내</p>|HTML|URGENT|Y", stored);
        jdbc.update("DELETE FROM TB_MCM_NOTICE WHERE TITLE = 'HTTP 저장 HTML'");
    }

    @Test
    void noticeBoard_search_는_X_Authenticated_Role_헤더의_역할로_대상_공지를_거른다() throws Exception {
        insert("NTHTTP0001", "HTTP 전체", "POSTED", "NORMAL", "N", "TEXT", "본문");
        insert("NTHTTP0002", "HTTP 담당자용", "POSTED", "NORMAL", "N", "TEXT", "본문");
        insert("NTHTTP0003", "HTTP 관리자용", "POSTED", "NORMAL", "N", "TEXT", "본문");
        jdbc.update("UPDATE TB_MCM_NOTICE SET TARGET_SCOPE = 'ROLE' WHERE NOTICE_ID IN ('NTHTTP0002', 'NTHTTP0003')");
        jdbc.update("INSERT INTO TB_MCM_NOTICE_TARGET (NOTICE_ID, ROLE_ID) VALUES ('NTHTTP0002', 'MDM_STEWARD')");
        jdbc.update("INSERT INTO TB_MCM_NOTICE_TARGET (NOTICE_ID, ROLE_ID) VALUES ('NTHTTP0003', 'SYSADMIN')");

        assertThat(httpIds("MDM_STEWARD")).containsExactlyInAnyOrder("NTHTTP0001", "NTHTTP0002");
        assertThat(httpIds("SYSADMIN,MDM_STD_ADMIN")).containsExactlyInAnyOrder("NTHTTP0001", "NTHTTP0003");
        assertThat(httpIds("OTHER")).containsExactly("NTHTTP0001");
    }

    /**
     * AUTH_ONLY 라 역할 매핑이 없는 사용자도 이 경로에 들어온다 — 역할 헤더가 없거나 비어 있으면 사용자 문맥에 역할이 없으므로
     * 전체(ALL) 공지만 보여야 한다. 사용자(X-Authenticated-User)는 BFF 가 로그인 세션에서 늘 싣는다.
     */
    @Test
    void noticeBoard_search_는_역할이_없는_사용자에게_전체_공지만_돌려준다() throws Exception {
        insert("NTHTTP0001", "HTTP 전체", "POSTED", "NORMAL", "N", "TEXT", "본문");
        insert("NTHTTP0002", "HTTP 담당자용", "POSTED", "URGENT", "Y", "TEXT", "본문");
        jdbc.update("UPDATE TB_MCM_NOTICE SET TARGET_SCOPE = 'ROLE' WHERE NOTICE_ID = 'NTHTTP0002'");
        jdbc.update("INSERT INTO TB_MCM_NOTICE_TARGET (NOTICE_ID, ROLE_ID) VALUES ('NTHTTP0002', 'MDM_STEWARD')");

        assertThat(httpIds(null)).as("역할 헤더 없음").containsExactly("NTHTTP0001");
        assertThat(httpIds("")).as("역할 헤더 빈 값").containsExactly("NTHTTP0001");
        assertThat(httpIds("MDM_STEWARD")).as("대조 — 역할이 있으면 대상 공지도 보인다")
                .containsExactly("NTHTTP0002", "NTHTTP0001");
    }

    @Test
    void noticeMgmt_save_는_대상_역할을_저장하고_search_행에_싣는다() throws Exception {
        ObjectNode row = json.createObjectNode()
                .put("rowStatus", "C")
                .put("TITLE", "HTTP 대상 저장")
                .put("CONTENT", "본문")
                .put("NOTICE_STATUS", "DRAFT")
                .put("TARGET_SCOPE", "ROLE");
        row.putArray("TARGET_ROLES").add("SYSADMIN").add("MDM_STEWARD");
        ObjectNode body = envelope("noticeMgmt", json.createObjectNode());
        body.putObject("grids").putObject("master").putArray("rows").add(row);

        JsonNode res = post("noticeMgmt", "save", body);

        assertEquals(true, res.path("meta").path("success").asBoolean(false), res.toString());
        JsonNode saved = null;
        for (JsonNode r : res.path("data").path("result").path("list")) {
            if ("HTTP 대상 저장".equals(r.path("TITLE").asText())) {
                saved = r;
            }
        }
        assertThat(saved).as(res.toString()).isNotNull();
        assertEquals("ROLE", saved.path("TARGET_SCOPE").asText());
        assertEquals("[\"MDM_STEWARD\",\"SYSADMIN\"]", saved.path("TARGET_ROLES").toString());
        String id = saved.path("NOTICE_ID").asText();
        jdbc.update("DELETE FROM TB_MCM_NOTICE_TARGET WHERE NOTICE_ID = ?", id);
        jdbc.update("DELETE FROM TB_MCM_NOTICE WHERE NOTICE_ID = ?", id);
    }

    /**
     * 업무 오류의 meta.code 는 던진 ErrorCode 의 코드다(2026-10-05 — 예전에는 모두 S001 이었다). 필수값 위반 저장은 E001,
     * 허용 밖 게시상태는 E002 이고, errors[] 와 HTTP 200 은 그대로다.
     */
    @Test
    void noticeMgmt_업무_오류의_meta_code_는_ErrorCode_의_코드다() throws Exception {
        ObjectNode row = json.createObjectNode().put("rowStatus", "C").put("TITLE", "").put("CONTENT", "본문")
                .put("NOTICE_STATUS", "DRAFT");
        ObjectNode body = envelope("noticeMgmt", json.createObjectNode());
        body.putObject("grids").putObject("master").putArray("rows").add(row);

        JsonNode required = post("noticeMgmt", "save", body);

        assertEquals(false, required.path("meta").path("success").asBoolean(true), required.toString());
        assertEquals("E001", required.path("meta").path("code").asText(), required.toString());
        assertThat(required.path("errors").size()).as(required.toString()).isPositive();

        insert("NTHTTP0001", "HTTP 상태", "DRAFT", "NORMAL", "N", "TEXT", "본문");
        JsonNode invalid = post("noticeMgmt", "changeStatus", envelope("noticeMgmt",
                json.createObjectNode().put("noticeId", "NTHTTP0001").put("noticeStatus", "NOPE")));

        assertEquals(false, invalid.path("meta").path("success").asBoolean(true), invalid.toString());
        assertEquals("E002", invalid.path("meta").path("code").asText(), invalid.toString());
    }

    private List<String> httpIds(String roleHeader) throws Exception {
        JsonNode res = post("noticeBoard", "search", envelope("noticeBoard", json.createObjectNode()), roleHeader);
        assertEquals(true, res.path("meta").path("success").asBoolean(false), res.toString());
        return ids(res.path("data").path("result").path("list")).stream().filter(i -> i.startsWith("NTHTTP")).toList();
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private ObjectNode envelope(String menuId, ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", params);
        return body;
    }

    private JsonNode post(String serviceId, String action, ObjectNode body) {
        return post(serviceId, action, body, "MDM_STEWARD");
    }

    /** BFF 가 보내는 봉투를 실행기 요청으로 바꿔 돌리고, 응답을 HTTP 본문과 같은 JSON 봉투로 돌려준다. */
    private JsonNode post(String serviceId, String action, ObjectNode body, String roleHeader) {
        List<String> roles = roleHeader == null || roleHeader.isBlank() ? List.of()
                : Arrays.stream(roleHeader.split(",")).map(String::trim).map(r -> "ROLE_" + r).toList();
        UserContextHolder.set(new UserInfo("user01", "사용자", null, roles));

        Map<String, Object> params = json.convertValue(body.path("params"), new TypeReference<HashMap<String, Object>>() { });
        Map<String, GridData> grids = new HashMap<>();
        JsonNode master = body.path("grids").path("master").path("rows");
        if (master.isArray()) {
            grids.put("master", new GridData(json.convertValue(master, new TypeReference<List<Map<String, Object>>>() { })));
        }
        CactusRequest request = new CactusRequest(
                new RequestMeta("user01", body.path("meta").path("menuId").asText()), params, grids);

        CactusResponse response = executor.execute(serviceId, action, request);
        return json.valueToTree(response);
    }
}
