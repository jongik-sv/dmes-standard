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
 * TSK-09-01 design.md §0.2·§3(B3) — 용어 → 도메인(상속·표준식) → 컬럼(자동 생성·매핑)이 한 흐름으로 등록·검증되는지
 * 확인한다. 세 화면(termMng·domainMng·columnMng)은 각자 독립 시험만 갖고 서로 이어받지 않는다({@code DmaOasisHttpTest}·
 * {@code DomainMngOasisFlowTest} 는 각자 자기 STAMP 로만 데이터를 만든다) — 이 시험이 그 갭을 메운다.
 *
 * <p>{@code DmaTestSupport} 의 직접 삽입 헬퍼는 쓰지 않는다. 실제 BPMN({@code services/dma/termMng.bpmn}·
 * {@code domainMng.bpmn}·{@code columnMng.bpmn})을 HTTP 로 그대로 태운다 — 등록 흐름 자체가 시험 대상이라 지름길을
 * 쓰면 의미가 없다({@code DmaOasisHttpTest} 도 같은 이유로 그렇게 한다).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + TermDomainColumnChainOasisFlowTest.CLIENT_KEY)
@ActiveProfiles("local")
class TermDomainColumnChainOasisFlowTest extends AbstractMdmSharedDbTest {

    static final String CLIENT_KEY = "mdm-dma-chain-test-client-key";
    private static final String STD_ADMIN_ROLE = "MDM_STD_ADMIN";

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        // QTY/NUMBER 도메인이 unitCode 를 요구한다(DomainMngOasisFlowTest 와 같은 시드).
        DmaTestSupport.unitIfAbsent(jdbc, "mm", "LENGTH", "mm");
    }

    @Test
    void 용어_등록이_도메인_상속을_거쳐_컬럼_저장까지_한_흐름으로_이어진다() throws Exception {
        // 1. termMng.save — 새 용어 등록(design.md §3 B3.1).
        ObjectNode termParams = json.createObjectNode()
                .put("termName", "임시필드").put("senseNo", 1).put("definition", "이 시험이 등록하는 새 용어")
                .put("engName", "Temp Field").put("engAbbr", "TMPFLD");
        JsonNode termSaved = post("termMng", "save", termParams, null);
        assertTrue(termSaved.path("meta").path("success").asBoolean(false), termSaved.toString());
        long termId = termSaved.path("data").path("result").path("termId").asLong();
        assertTrue(termId > 0, termSaved.toString());

        // 2. domainMng.save — 부모(길이 20, value<=30) → 자식(길이 15, value>=0) 상속 + std_rule 저장 시
        //    테스트 케이스 자동 실행(design.md §3 B3.2, TSK-04-03 자체 검증 재사용).
        ObjectNode parentParams = domainDraft("CHAIN_PARENT_THK", "QTY", "NUMBER");
        parentParams.put("unitCode", "mm").put("length", 20).put("stdRule", "value <= 30");
        JsonNode parentSaved = post("domainMng", "save", parentParams, testCaseGrids("25", "true"));
        assertTrue(parentSaved.path("meta").path("success").asBoolean(false), parentSaved.toString());
        long parentId = parentSaved.path("data").path("result").path("domainId").asLong();

        ObjectNode childParams = domainDraft("CHAIN_CHILD_THK", "QTY", "NUMBER");
        childParams.put("parentDomainId", parentId).put("length", 15).put("stdRule", "value >= 0");
        JsonNode childSaved = post("domainMng", "save", childParams, testCaseGrids("25", "true"));
        assertTrue(childSaved.path("meta").path("success").asBoolean(false), childSaved.toString());
        long childId = childSaved.path("data").path("result").path("domainId").asLong();
        long childVer = childSaved.path("data").path("result").path("ver").asLong();

        // 3. columnMng.compare — 1번 용어가 실제로 분해기에 반영됐는지 *** 없이 확인(design.md §3 B3.3, 용어
        //    사전은 요청마다 새로 읽는다 — I26).
        JsonNode compare = post("columnMng", "compare",
                json.createObjectNode().put("direction", "FORWARD").put("input", "임시필드"), null);
        assertTrue(compare.path("meta").path("success").asBoolean(false), compare.toString());
        String physName = compare.path("data").path("result").path("physName").asText();
        assertEquals("TMPFLD", physName, compare.toString());
        assertFalse(physName.contains("*"), compare.toString());
        assertFalse(compare.path("data").path("result").path("placeholder").asBoolean(true), compare.toString());

        // 3b. columnMng.save — 논리명에 사전에 없는 조각이 섞이면(물리명 자체에 리터럴 "*"가 없어도) 저장을
        //    거부한다(design.md §5 "용어 사전에 없는 조각은 *** 로 표시하고 무단 치환하지 않는다", B3 담당 불변
        //    규칙). ColumnMngService.save 는 클라이언트가 보낸 physName 과 별개로 columnName 을 서버가 다시
        //    분해해 미해결 토큰이 있으면 거부한다 — 이 재분해 검사 자체가 대상이라 physName 에는 일부러 "*"를
        //    넣지 않는다(DmaOasisHttpTest P2 는 physName 에 "*"가 이미 있는 경우만 다뤄 이 경로를 못 잡는다).
        ObjectNode unresolvedColumn = json.createObjectNode()
                .put("columnName", "임시필드 미등록용어").put("physName", "TMPFLD_UNKNOWN")
                .put("labelLong", "임시필드 미등록용어").put("domainId", childId).put("required", true);
        ObjectNode unresolvedGrids = json.createObjectNode();
        unresolvedGrids.putObject("systems").putArray("rows");
        unresolvedGrids.putObject("terms").putArray("rows");
        JsonNode unresolvedResult = post("columnMng", "save", unresolvedColumn, unresolvedGrids);
        assertFalse(unresolvedResult.path("meta").path("success").asBoolean(true), unresolvedResult.toString());
        assertTrue(unresolvedResult.path("meta").path("message").asText("")
                        .startsWith(MdmErrorCode.NAME_PLACEHOLDER_REMAINS.defaultMessage()),
                "미해결 토큰이 " + MdmErrorCode.NAME_PLACEHOLDER_REMAINS + " 로 거부되지 않았다: " + unresolvedResult);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_COLUMN", Integer.class),
                "미해결 조각이 있는데도 컬럼이 저장됐다");

        // 4. columnMng.save — 2번 도메인(자식)을 참조하는 컬럼 저장. terms 그리드를 비우면 방금 분해한 결과로
        //    서버가 term_ids 를 채운다(ColumnMngService.resolveTermIds, I26). save 응답 DTO 에는 columnId 만
        //    있어(domain_id·term_ids 없음) view 로 반영을 확인한다 — build-log.md 「설계 이탈」 참조.
        ObjectNode columnParams = json.createObjectNode()
                .put("columnName", "임시필드").put("physName", "TMPFLD")
                .put("labelLong", "임시필드").put("domainId", childId).put("required", true);
        ObjectNode columnGrids = json.createObjectNode();
        columnGrids.putObject("systems").putArray("rows");
        columnGrids.putObject("terms").putArray("rows");
        JsonNode columnSaved = post("columnMng", "save", columnParams, columnGrids);
        assertTrue(columnSaved.path("meta").path("success").asBoolean(false), columnSaved.toString());
        long columnId = columnSaved.path("data").path("result").path("columnId").asLong();

        JsonNode columnView = post("columnMng", "view", json.createObjectNode().put("columnId", columnId), null);
        assertEquals(childId, columnView.path("data").path("result").path("column").path("domainId").asLong(),
                columnView.toString());
        JsonNode terms = columnView.path("data").path("result").path("terms");
        boolean hasOurTerm = false;
        for (JsonNode t : terms) {
            if (t.path("termId").asLong() == termId) {
                hasOurTerm = true;
                assertFalse(t.path("missing").asBoolean(true), t.toString());
            }
        }
        assertTrue(hasOurTerm, terms.toString());

        // 5. domainMng.validate — 자식 도메인의 유효식이 부모·자식 규칙을 AND 로 누적해 값 하나는 통과, 하나는
        //    거부하는지 확인(design.md §3 B3.5). save 응답은 값 자체를 되돌려주지 않으므로 같은 draft 로
        //    validate(쓰기 없음)를 다시 불러 판정 결과 행을 읽는다 — 부모 규칙까지 실제로 걸리는지 보는 공개
        //    API 는 이것뿐이다(execute 는 domainId 를 무시하고 요청에 실린 규칙만 평가해 부모 체인을 안 탄다).
        ObjectNode validateParams = domainDraft("CHAIN_CHILD_THK", "QTY", "NUMBER");
        validateParams.put("domainId", childId).put("ver", childVer)
                .put("parentDomainId", parentId).put("length", 15).put("stdRule", "value >= 0");
        JsonNode validate = post("domainMng", "validate", validateParams, testCaseGrids("25", "true", "50", "false"));
        assertTrue(validate.path("meta").path("success").asBoolean(false), validate.toString());
        assertTrue(validate.path("data").path("result").path("ok").asBoolean(false), validate.toString());
        JsonNode results = validate.path("data").path("result").path("testResults");
        assertEquals(2, results.size(), results.toString());
        // 25 → 부모(value<=30)·자식(value>=0) 모두 통과
        assertTrue(results.get(0).path("ACTUAL").asBoolean(), results.toString());
        assertEquals("MATCH", results.get(0).path("RESULT").asText(), results.toString());
        // 50 → 자식 규칙만으론 통과할 값이지만 부모(value<=30)에 걸려 거부된다(AND 누적이 실제로 적용됨)
        assertFalse(results.get(1).path("ACTUAL").asBoolean(true), results.toString());
        assertEquals("MATCH", results.get(1).path("RESULT").asText(), results.toString());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ObjectNode domainDraft(String std, String kind, String type) {
        ObjectNode p = json.createObjectNode();
        p.put("domainName", "도메인 " + std);
        p.put("stdName", std);
        p.put("domainKind", kind);
        p.put("dataType", type);
        return p;
    }

    private ObjectNode testCaseGrids(String... valueExpect) {
        ObjectNode g = json.createObjectNode();
        ArrayNode cases = g.putObject("testCases").putArray("rows");
        for (int i = 0; i < valueExpect.length; i += 2) {
            cases.addObject().put("VALUE", valueExpect[i]).put("EXPECT", Boolean.parseBoolean(valueExpect[i + 1]));
        }
        g.putObject("examples").putArray("rows");
        return g;
    }

    private JsonNode post(String service, String action, ObjectNode params, ObjectNode grids) throws Exception {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", service);
        body.set("params", params);
        if (grids != null) {
            body.set("grids", grids);
        }
        String key = System.getenv("BACKEND_CLIENT_KEY");
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", key != null && !key.isBlank() ? key : CLIENT_KEY)
                .header("X-Authenticated-User", "stdadmin")
                .header("X-Authenticated-Role", STD_ADMIN_ROLE)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }
}
