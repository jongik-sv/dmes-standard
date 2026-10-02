package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.net.SocketTimeoutException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** spec 2026-10-02-mdm-meta-cache-design §5.2·§7 「cactus 클라이언트」 — 헤더 3종, OASIS 봉투 해석, 시간 초과. */
class MdmMetaClientTest {

    private MockRestServiceServer server;
    private MdmMetaClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().defaultHeader("X-Client-Key", "k");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new MdmMetaClient(builder.build(), "http://mdm.test/", "mls");
    }

    private static String ok(String resultJson) {
        return "{\"meta\":{\"txId\":\"t\",\"success\":true,\"code\":\"0000\"},\"data\":{\"result\":" + resultJson + "}}";
    }

    @Test
    void changes_는_헤더_세_가지와_OASIS_봉투로_search_를_부르고_결과를_푼다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Client-Key", "k"))
                .andExpect(header("X-Authenticated-User", "system:mls"))
                .andExpect(header("X-Authenticated-Role", "SYSTEM"))
                .andExpect(header("X-Tx-Id", matchesPattern("[0-9a-f-]{36}")))
                .andExpect(jsonPath("$.meta.menuId").value("metaFeed"))
                .andExpect(jsonPath("$.params.since").value(5))
                .andExpect(jsonPath("$.params.limit").value(1000))
                .andExpect(jsonPath("$.grids.keys.rows").isArray())
                .andRespond(withSuccess(ok("{\"latestSeq\":9,\"items\":[{\"seq\":6,\"type\":\"COLUMN\",\"key\":\"COIL_THK\","
                        + "\"kind\":\"SAVE\"}],\"truncated\":false}"), MediaType.APPLICATION_JSON));

        MdmChanges c = client.changes(5, 1000);

        assertThat(c.latestSeq()).isEqualTo(9);
        assertThat(c.truncated()).isFalse();
        assertThat(c.items()).containsExactly(new MdmChange(6, "COLUMN", "COIL_THK", "SAVE"));
        server.verify();
    }

    @Test
    void fetch_는_키를_grids_로_보내고_COLUMN_값을_레코드로_읽으며_모르는_칸은_무시한다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.params.type").value("COLUMN"))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("COIL_THK"))
                .andExpect(jsonPath("$.grids.keys.rows[1].key").value("NO_SUCH"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"COIL_THK","value":{"physName":"COIL_THK","columnName":"코일 두께","labelMid":"두께",
                         "dataType":"NUMBER","length":10,"scale":2,"required":true,
                         "domain":{"domainId":"7","domainName":"두께","domainKind":"QTY"},
                         "stdExpr":{"text":"value >= 0","ast":{"type":"INFIX_OPERATOR"}},"bizExpr":{"text":"value <= COIL_WID"},
                         "bizRequiredVars":["COIL_WID"],"codeRef":null,"newField":1}}],"failed":[]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.COLUMN, List.of("COIL_THK", "NO_SUCH"));

        MdmColumnMeta m = (MdmColumnMeta) r.found().get("COIL_THK");
        assertThat(m.columnName()).isEqualTo("코일 두께");
        assertThat(m.scale()).isEqualTo(2);
        assertThat(m.required()).isTrue();
        assertThat(m.domain().domainKind()).isEqualTo("QTY");
        assertThat(m.stdExpr().ast()).containsEntry("type", "INFIX_OPERATOR");
        assertThat(m.bizRequiredVars()).containsExactly("COIL_WID");
        assertThat(r.found()).doesNotContainKey("NO_SUCH");
        assertThat(r.failed()).isEmpty();
    }

    @Test
    void fetch_RULE_은_LocalDateTime_과_정수_셀_키를_엔진_레코드로_되읽고_failed_를_돌려준다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"QLTY","value":[{"ruleId":"QLTY","ver":1,"ruleKind":"DECISION","hitPolicy":"FIRST",
                         "applyFrom":"2026-01-01T00:00:00","applyTo":"2026-07-01T00:00:00","engineVersion":"1","vars":[],
                         "contract":{"always":[],"rows":[]},
                         "rows":[{"rowId":1,"seq":1,"rowKind":"NORMAL","cells":{"1":{"op":"GT","left":"1000","right":null,"list":null,
                         "expr":null,"ast":null,"val":null,"text":"COIL_WID > 1000"}}}]}]}],
                         "failed":[{"key":"BROKEN","message":"셀 키는 var_id 정수여야 합니다"}]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.RULE, List.of("QLTY", "BROKEN"));

        @SuppressWarnings("unchecked")
        List<RuleDefinition> versions = (List<RuleDefinition>) r.found().get("QLTY");
        assertThat(versions).hasSize(1);
        assertThat(versions.get(0).applyFrom()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
        assertThat(versions.get(0).applyTo()).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
        assertThat(versions.get(0).rows().get(0).cells().get(1).text()).isEqualTo("COIL_WID > 1000");
        assertThat(r.failed()).containsEntry("BROKEN", "셀 키는 var_id 정수여야 합니다");
    }

    @Test
    void fetch_CODE_는_버전_번호의_자리수를_잃지_않는다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"PROC_CD","value":{"header":{"maruCodeId":"PROC_CD","status":"INUSE"},
                         "versions":[{"ver":1.000,"status":"RELEASED","applyFrom":"2026-01-01T00:00:00","applyTo":"9999-12-31T00:00:00"}],
                         "items":[{"code":"A","fromVer":1.000,"toVer":9999.000,"name":"에이","alterName":null,"seq":1,
                          "lvl":[null,null,null,null,null],"attrs":[null,null,null,null,null,null,null,null,null,null]}],
                         "categories":[{"cateId":"BASE","fromVer":1.000,"toVer":9999.000,"defKind":"REGEX","defExpr":".*","defTarget":"CODE"}],
                         "cateItems":[]}}],"failed":[]}"""), MediaType.APPLICATION_JSON));

        CodeRows rows = (CodeRows) client.fetch(MdmTargetType.CODE, List.of("PROC_CD")).found().get("PROC_CD");

        assertThat(rows.header().status()).isEqualTo("INUSE");
        assertThat(rows.versions().get(0).ver()).isEqualByComparingTo(new BigDecimal("1.000"));
        assertThat(rows.versions().get(0).ver().scale()).isEqualTo(3);
        assertThat(rows.items().get(0).toVer()).isEqualByComparingTo(new BigDecimal("9999"));
    }

    @Test
    void meta_success_false_는_MdmUnavailableException_에_서버_메시지를_싣는다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess("{\"meta\":{\"success\":false,\"code\":\"E001\",\"message\":\"입력값이 올바르지 않습니다\"}}",
                        MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.fetch(MdmTargetType.DOMAIN, List.of("1")))
                .isInstanceOf(MdmUnavailableException.class).hasMessageContaining("입력값이 올바르지 않습니다");
    }

    @Test
    void 인증_실패_401_도_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> client.changes(0, 1)).isInstanceOf(MdmUnavailableException.class).hasMessageContaining("MDM 호출 실패");
    }

    @Test
    void 읽기_시간_초과는_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search")).andRespond(request -> {
            throw new SocketTimeoutException("Read timed out");
        });
        assertThatThrownBy(() -> client.changes(0, 1)).isInstanceOf(MdmUnavailableException.class).hasMessageContaining("Read timed out");
    }

    @Test
    void 값을_엔진_모양으로_읽을_수_없으면_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"S1\",\"value\":\"문자열\"}],\"failed\":[]}"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.fetch(MdmTargetType.RULE_SET, List.of("S1"))).isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void LAYOUT_값은_맵_그대로다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"3\",\"value\":{\"layoutName\":\"전문\",\"totalLength\":10}}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));
        @SuppressWarnings("unchecked")
        Map<String, Object> layout = (Map<String, Object>) client.fetch(MdmTargetType.LAYOUT, List.of("3")).found().get("3");
        assertThat(layout).containsEntry("layoutName", "전문");
    }
}
