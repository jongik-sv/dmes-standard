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
import java.util.ArrayList;
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

    /** 별칭 매칭 spec §3 — systemCode 는 COLUMN view 요청에만 싣고, 비면 싣지 않는다. */
    private MdmMetaClient clientWith(String systemCode) {
        RestClient.Builder builder = RestClient.builder().defaultHeader("X-Client-Key", "k");
        server = MockRestServiceServer.bindTo(builder).build();
        return new MdmMetaClient(builder.build(), "http://mdm.test/", "mls", systemCode);
    }

    @Test
    void COLUMN_요청에만_params_systemCode_를_싣는다() {
        MdmMetaClient aliasClient = clientWith("MES");
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.params.type").value("COLUMN"))
                .andExpect(jsonPath("$.params.systemCode").value("MES"))
                .andRespond(withSuccess(ok("{\"items\":[],\"failed\":[]}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.params.type").value("DOMAIN"))
                .andExpect(jsonPath("$.params.systemCode").doesNotExist())
                .andRespond(withSuccess(ok("{\"items\":[],\"failed\":[]}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andExpect(jsonPath("$.params.systemCode").doesNotExist())
                .andRespond(withSuccess(ok("{\"latestSeq\":1,\"items\":[],\"truncated\":false}"), MediaType.APPLICATION_JSON));

        aliasClient.fetch(MdmTargetType.COLUMN, List.of("ABS_CHM_SLP_AMT"));
        aliasClient.fetch(MdmTargetType.DOMAIN, List.of("7"));
        aliasClient.changes(0, 10);

        server.verify();
    }

    @Test
    void systemCode_가_null_이거나_비면_COLUMN_요청에도_싣지_않는다() {
        for (String blank : new String[] {null, "", "  "}) {
            MdmMetaClient c = clientWith(blank);
            server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                    .andExpect(jsonPath("$.params.type").value("COLUMN"))
                    .andExpect(jsonPath("$.params.systemCode").doesNotExist())
                    .andRespond(withSuccess(ok("{\"items\":[],\"failed\":[]}"), MediaType.APPLICATION_JSON));

            c.fetch(MdmTargetType.COLUMN, List.of("COIL_THK"));

            server.verify();
        }
    }

    @Test
    void 별칭으로_맞은_COLUMN_값의_matchedSystem_과_systemPhysName_을_읽고_없으면_null_이다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[
                         {"key":"ABS_CHM_SLP_AMT","value":{"physName":"ABS_CHM_RPLN_AMT","columnName":"금액","dataType":"NUMBER",
                          "required":false,"matchedSystem":"MES","systemPhysName":"Abs_Chm_Slp_Amt"}},
                         {"key":"COIL_THK","value":{"physName":"COIL_THK","columnName":"코일 두께","dataType":"NUMBER","required":false,
                          "matchedSystem":null,"systemPhysName":null}},
                         {"key":"OLD","value":{"physName":"OLD","columnName":"옛 응답","dataType":"STRING","required":false}}],
                         "failed":[]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.COLUMN, List.of("ABS_CHM_SLP_AMT", "COIL_THK", "OLD"));

        MdmColumnMeta alias = (MdmColumnMeta) r.found().get("ABS_CHM_SLP_AMT");
        assertThat(alias.physName()).isEqualTo("ABS_CHM_RPLN_AMT");
        assertThat(alias.matchedSystem()).isEqualTo("MES");
        assertThat(alias.systemPhysName()).isEqualTo("Abs_Chm_Slp_Amt");
        MdmColumnMeta std = (MdmColumnMeta) r.found().get("COIL_THK");
        assertThat(std.matchedSystem()).isNull();
        assertThat(std.systemPhysName()).isNull();
        MdmColumnMeta old = (MdmColumnMeta) r.found().get("OLD");
        assertThat(old.matchedSystem()).isNull();
        assertThat(old.systemPhysName()).isNull();
    }

    /** 컬럼 설명 HTML(2026-10-03 계약) — HTML 설명이면 소독한 HTML 이 descriptionHtml 에, 글자는 description 에 온다. 일반 글·옛 MDM 응답이면 null. */
    @Test
    void COLUMN_값의_descriptionHtml_을_읽고_null_이거나_칸이_없으면_null_이다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[
                         {"key":"NOTICE_BODY","value":{"physName":"NOTICE_BODY","columnName":"본문","description":"굵은 설명",
                          "dataType":"STRING","required":false,"matchedSystem":null,"systemPhysName":null,
                          "descriptionHtml":"<p><b>굵은</b> 설명</p>"}},
                         {"key":"COIL_THK","value":{"physName":"COIL_THK","columnName":"코일 두께","description":"두께",
                          "dataType":"NUMBER","required":false,"descriptionHtml":null}},
                         {"key":"OLD","value":{"physName":"OLD","columnName":"옛 응답","dataType":"STRING","required":false}}],
                         "failed":[]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.COLUMN, List.of("NOTICE_BODY", "COIL_THK", "OLD"));

        MdmColumnMeta html = (MdmColumnMeta) r.found().get("NOTICE_BODY");
        assertThat(html.descriptionHtml()).isEqualTo("<p><b>굵은</b> 설명</p>");
        assertThat(html.description()).isEqualTo("굵은 설명");
        assertThat(((MdmColumnMeta) r.found().get("COIL_THK")).descriptionHtml()).isNull();
        assertThat(((MdmColumnMeta) r.found().get("OLD")).descriptionHtml()).isNull();
    }

    @Test
    void fetch_RULE_은_LocalDateTime_과_정수_셀_키를_엔진_레코드로_되읽고_failed_를_돌려준다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"QLTY","value":[{"ruleId":"QLTY","ver":1.001,"ruleKind":"DECISION","hitPolicy":"FIRST",
                         "applyFrom":"2026-01-01T00:00:00","applyTo":"2026-07-01T00:00:00","engineVersion":"1","vars":[],
                         "contract":{"always":[],"rows":[]},
                         "rows":[{"rowId":1,"seq":1,"rowKind":"NORMAL","cells":{"1":{"op":"GT","left":"1000","right":null,"list":null,
                         "expr":null,"ast":null,"val":null,"text":"COIL_WID > 1000"}}}]}]}],
                         "failed":[{"key":"BROKEN","message":"셀 키는 var_id 정수여야 합니다"}]}"""), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.RULE, List.of("QLTY", "BROKEN"));

        @SuppressWarnings("unchecked")
        List<RuleDefinition> versions = (List<RuleDefinition>) r.found().get("QLTY");
        assertThat(versions).hasSize(1);
        // 룰 버전은 major/minor 소수(D-144) — 자리수(scale 3)까지 그대로 BigDecimal 로 읽는다
        assertThat(versions.get(0).ver()).isEqualTo(new BigDecimal("1.001"));
        assertThat(versions.get(0).applyFrom()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
        assertThat(versions.get(0).applyTo()).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
        assertThat(versions.get(0).rows().get(0).cells().get(1).text()).isEqualTo("COIL_WID > 1000");
        assertThat(r.failed()).containsEntry("BROKEN", "셀 키는 var_id 정수여야 합니다");
    }

    @Test
    void fetch_RULE_은_major_버전_1_000_의_뒤_0_을_잃지_않는다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("""
                        {"items":[{"key":"QLTY","value":[
                         {"ruleId":"QLTY","ver":1.000,"ruleKind":"DECISION","hitPolicy":"FIRST","applyFrom":"2026-01-01T00:00:00",
                          "applyTo":"2026-07-01T00:00:00","engineVersion":"1","vars":[],"contract":{"always":[],"rows":[]},"rows":[]},
                         {"ruleId":"QLTY","ver":10.000,"ruleKind":"DECISION","hitPolicy":"FIRST","applyFrom":"2026-07-01T00:00:00",
                          "applyTo":null,"engineVersion":"1","vars":[],"contract":{"always":[],"rows":[]},"rows":[]}]}],
                         "failed":[]}"""), MediaType.APPLICATION_JSON));

        @SuppressWarnings("unchecked")
        List<RuleDefinition> versions = (List<RuleDefinition>) client.fetch(MdmTargetType.RULE, List.of("QLTY")).found().get("QLTY");

        assertThat(versions).extracting(RuleDefinition::ver).containsExactly(new BigDecimal("1.000"), new BigDecimal("10.000"));
        assertThat(versions.get(0).ver().scale()).isEqualTo(3);
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
    void search_의_meta_success_false_는_MdmUnavailableException_에_서버_메시지를_싣는다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andRespond(withSuccess("{\"meta\":{\"success\":false,\"code\":\"E001\",\"message\":\"입력값이 올바르지 않습니다\"}}",
                        MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.changes(0, 1))
                .isInstanceOf(MdmUnavailableException.class).hasMessageContaining("입력값이 올바르지 않습니다");
    }

    @Test
    void view_의_meta_success_false_는_장애가_아니라_그_묶음_키의_failed_다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess("{\"meta\":{\"success\":false,\"code\":\"S001\",\"message\":\"입력값이 올바르지 않습니다\"}}",
                        MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.DOMAIN, List.of("1", "2"));

        assertThat(r.found()).isEmpty();
        assertThat(r.failed()).containsOnlyKeys("1", "2");
        assertThat(r.failed().get("1")).contains("입력값이 올바르지 않습니다");
        server.verify();
    }

    @Test
    void fetch_는_키를_500개씩_나눠_부르고_결과를_합친다() {
        List<String> keys = new ArrayList<>();
        for (int i = 1; i <= 1001; i++) {
            keys.add("K" + i);
        }
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.grids.keys.rows.length()").value(500))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("K1"))
                .andExpect(jsonPath("$.grids.keys.rows[499].key").value("K500"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"K1\",\"value\":{\"a\":1}}],\"failed\":[]}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.grids.keys.rows.length()").value(500))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("K501"))
                // 두 번째 묶음만 MDM 이 거부해도 다른 묶음의 결과는 남고, 거부된 묶음 키만 failed 다.
                .andRespond(withSuccess("{\"meta\":{\"success\":false,\"message\":\"거부\"}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andExpect(jsonPath("$.grids.keys.rows.length()").value(1))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("K1001"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"K1001\",\"value\":{\"b\":2}}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.DOMAIN, keys);

        assertThat(r.found()).containsOnlyKeys("K1", "K1001");
        assertThat(r.failed()).hasSize(500).containsKey("K501").containsKey("K1000");
        server.verify();
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
    void 값_하나를_엔진_모양으로_읽을_수_없으면_그_키만_failed_이고_나머지는_found_다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"S1\",\"value\":\"문자열\"},"
                        + "{\"key\":\"S2\",\"value\":[]},"
                        // 3단계 전 모양(스냅샷 하나)은 이제 읽을 수 없다 — 그 키만 failed
                        + "{\"key\":\"S3\",\"value\":{\"layoutName\":\"전문\"}}],\"failed\":[]}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"S1\",\"value\":\"문자열\"}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmFetchResult layouts = client.fetch(MdmTargetType.LAYOUT, List.of("S1", "S2", "S3"));
        assertThat(layouts.failed()).containsOnlyKeys("S1", "S3");
        assertThat(layouts.failed().get("S1")).contains("LAYOUT");
        assertThat(layouts.found()).containsOnlyKeys("S2");

        MdmFetchResult sets = client.fetch(MdmTargetType.RULE_SET, List.of("S1"));
        assertThat(sets.found()).isEmpty();
        assertThat(sets.failed()).containsOnlyKeys("S1");
        server.verify();
    }

    @Test
    void 성공인데_data_result_가_없거나_null_이면_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andRespond(withSuccess("{\"meta\":{\"success\":true},\"data\":{}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess("{\"meta\":{\"success\":true},\"data\":{\"result\":null}}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.changes(5, 1000)).isInstanceOf(MdmUnavailableException.class)
                .hasMessageContaining("data.result");
        assertThatThrownBy(() -> client.fetch(MdmTargetType.COLUMN, List.of("A"))).isInstanceOf(MdmUnavailableException.class)
                .hasMessageContaining("data.result");
        server.verify();
    }

    @Test
    void fetch_는_value_가_없거나_null_인_항목을_found_에_넣지_않고_failed_로_돌린다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"1\",\"value\":[]},{\"key\":\"2\",\"value\":null},"
                        + "{\"key\":\"3\"}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmFetchResult r = client.fetch(MdmTargetType.LAYOUT, List.of("1", "2", "3"));

        assertThat(r.found()).containsOnlyKeys("1");
        assertThat(r.found().values()).doesNotContainNull();
        // 건너뛰면 "없음"으로 60분 캐시된다 — 받을 수 없는 키로 돌린다.
        assertThat(r.failed()).containsOnlyKeys("2", "3");
        assertThat(r.failed().get("2")).contains("value 없음");
    }

    @Test
    void changes_는_latestSeq_가_없거나_null_이거나_숫자가_아니면_MdmUnavailableException() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andRespond(withSuccess(ok("{\"items\":[],\"truncated\":false}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andRespond(withSuccess(ok("{\"latestSeq\":null,\"items\":[],\"truncated\":false}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andRespond(withSuccess(ok("{\"latestSeq\":\"abc\",\"items\":[],\"truncated\":false}"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search"))
                .andRespond(withSuccess(ok("{\"latestSeq\":0,\"items\":[],\"truncated\":false}"), MediaType.APPLICATION_JSON));

        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> client.changes(5, 1000)).isInstanceOf(MdmUnavailableException.class)
                    .hasMessageContaining("latestSeq");
        }
        assertThat(client.changes(0, 1000).latestSeq()).as("0 은 정상 값이다(기록이 없는 MDM)").isZero();
        server.verify();
    }

    /**
     * D-144 3단계 — LAYOUT 값은 RELEASED 버전 목록이다. ver 는 문자열 "1.000" 으로 와서 자리수 그대로 BigDecimal, 적용 구간은 ISO 일시,
     * 버전마다 합성 구간과 스냅샷 맵을 싣는다.
     */
    @Test
    void LAYOUT_값은_버전_목록이고_ver_자리수와_합성_구간을_지킨다() {
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"3\",\"value\":[{\"ver\":\"1.010\","
                        + "\"applyFrom\":\"2026-01-01T00:00:00\",\"applyTo\":\"9999-12-31T00:00:00\",\"segments\":["
                        + "{\"applyFrom\":\"2026-01-01T00:00:00\",\"applyTo\":\"2026-04-01T00:00:00\",\"snapshot\":{\"totalLength\":17}},"
                        + "{\"applyFrom\":\"2026-04-01T00:00:00\",\"applyTo\":\"9999-12-31T00:00:00\",\"snapshot\":{\"totalLength\":19}}]}]}],"
                        + "\"failed\":[]}"), MediaType.APPLICATION_JSON));
        @SuppressWarnings("unchecked")
        List<MdmLayoutVersion> versions = (List<MdmLayoutVersion>) client.fetch(MdmTargetType.LAYOUT, List.of("3")).found().get("3");
        assertThat(versions).hasSize(1);
        MdmLayoutVersion v = versions.get(0);
        assertThat(v.ver()).isEqualTo(new BigDecimal("1.010"));
        assertThat(v.ver().scale()).isEqualTo(3);
        assertThat(v.applyFrom()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
        assertThat(v.applyTo()).isEqualTo(LocalDateTime.of(9999, 12, 31, 0, 0));
        assertThat(v.segments()).extracting(MdmLayoutVersion.Segment::applyTo)
                .containsExactly(LocalDateTime.of(2026, 4, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0));
        assertThat(v.segments().get(1).snapshot()).containsEntry("totalLength", 19);
    }
}
