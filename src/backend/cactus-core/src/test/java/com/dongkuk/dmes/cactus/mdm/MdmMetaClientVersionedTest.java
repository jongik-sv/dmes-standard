package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** D-154 — 목차·본문 요청과 옛 MDM 신호 (가) part 가 되울리지 않음·(나) 업무 거부 → part 없이 한 번 더(스펙 §4.1·§5.8). */
class MdmMetaClientVersionedTest {

    private static final String URL = "http://mdm.test/oasis/metaFeed/view";
    private MockRestServiceServer server;
    private MdmMetaClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new MdmMetaClient(builder.build(), "http://mdm.test/", "mls");
    }

    private static String ok(String result) {
        return "{\"meta\":{\"success\":true},\"data\":{\"result\":" + result + "}}";
    }

    private static final String REJECTED = "{\"meta\":{\"success\":false,\"message\":\"입력값 오류\"}}";

    private static final String RULE_1000 = "{\"ruleId\":\"R\",\"ver\":1.000,\"ruleKind\":\"DECISION\",\"hitPolicy\":\"FIRST\","
            + "\"applyFrom\":\"2026-01-01T00:00:00\",\"applyTo\":null,\"engineVersion\":\"1\",\"vars\":[],"
            + "\"contract\":{\"always\":[],\"rows\":[]},\"rows\":[]}";

    @Test
    void 목차는_part_TOC_와_초까지의_at_을_보내고_목차와_current_를_읽는다() {
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.params.type").value("RULE"))
                .andExpect(jsonPath("$.params.part").value("TOC"))
                .andExpect(jsonPath("$.params.at").value("2026-10-03T00:00:00"))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("R"))
                .andRespond(withSuccess(ok("{\"part\":\"TOC\",\"items\":[{\"key\":\"R\",\"value\":{\"header\":null,\"versions\":["
                        + "{\"ver\":1.000,\"status\":\"RELEASED\",\"applyFrom\":\"2026-01-01T00:00:00\",\"applyTo\":null}]},"
                        + "\"current\":{\"ver\":\"1\",\"value\":" + RULE_1000 + "}}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("R"), LocalDateTime.of(2026, 10, 3, 0, 0));

        assertThat(r.tocs().get("R").versions()).extracting(MdmTocVersion::ver).containsExactly(new BigDecimal("1.000"));
        assertThat(r.current().get("R").ver()).as("current.ver 도 scale 3 키로").isEqualTo("1.000");
        assertThat(r.current().get("R").body()).isInstanceOf(RuleDefinition.class);
        assertThat(r.legacy()).isEmpty();
        server.verify();
    }

    @Test
    void 신호_가_응답에_part_가_없으면_그_묶음을_전_이력으로_읽는다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"R\",\"value\":[" + RULE_1000 + "]}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("R"), LocalDateTime.of(2026, 10, 3, 0, 0));

        assertThat(r.tocs()).isEmpty();
        assertThat(r.legacy().get("R")).isInstanceOf(List.class);
        server.verify();
    }

    @Test
    void 신호_나_업무_거부면_part_없이_한_번_더_보내고_그_결과를_전_이력으로_읽는다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC"))
                .andRespond(withSuccess(REJECTED, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").doesNotExist()).andExpect(jsonPath("$.params.at").doesNotExist())
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"R\",\"value\":[" + RULE_1000 + "]}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("R"), LocalDateTime.of(2026, 10, 3, 0, 0));

        assertThat(r.legacy()).containsKey("R");
        server.verify();
    }

    @Test
    void 두_번_다_거부되면_그_키들은_failed_이고_다음_요청은_다시_part_부터_보낸다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC")).andRespond(withSuccess(REJECTED, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").doesNotExist()).andRespond(withSuccess(REJECTED, MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("TOC"))
                .andRespond(withSuccess(ok("{\"part\":\"TOC\",\"items\":[],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmTocResult first = client.fetchToc(MdmTargetType.RULE, List.of("R"), null);
        MdmTocResult second = client.fetchToc(MdmTargetType.RULE, List.of("R"), null);

        assertThat(first.failed()).containsKey("R");
        assertThat(second.failed()).isEmpty();
        assertThat(second.tocs()).isEmpty();
        server.verify();
    }

    @Test
    void 본문은_키_ver_행을_보내고_코드_본문을_CodeVersionSlice_로_읽고_NOT_RELEASED_는_그_쌍의_failed_다() {
        String slice = "{\"maruCodeId\":\"C\",\"ver\":1.000,\"items\":[],\"categories\":[{\"cateId\":\"BASE\",\"fromVer\":1.000,"
                + "\"toVer\":9999.000,\"defKind\":\"REGEX\",\"defExpr\":\".*\",\"defTarget\":\"CODE\",\"all\":false,\"members\":[]}]}";
        server.expect(requestTo(URL))
                .andExpect(jsonPath("$.params.part").value("BODY"))
                .andExpect(jsonPath("$.grids.keys.rows[0].key").value("C"))
                .andExpect(jsonPath("$.grids.keys.rows[0].ver").value("1.000"))
                .andExpect(jsonPath("$.grids.keys.rows[1].ver").value("2.000"))
                .andRespond(withSuccess(ok("{\"part\":\"BODY\",\"items\":[{\"key\":\"C\",\"ver\":\"1.000\",\"value\":" + slice + "}],"
                        + "\"failed\":[{\"key\":\"C\",\"ver\":\"2.000\",\"message\":\"NOT_RELEASED\"}]}"), MediaType.APPLICATION_JSON));

        MdmBodyResult r = client.fetchBodies(MdmTargetType.CODE, List.of(new MdmBodyKey("C", "1.000"), new MdmBodyKey("C", "2.000")));

        assertThat(r.found().get(new MdmBodyKey("C", "1.000"))).isInstanceOf(CodeVersionSlice.class);
        assertThat(r.failed()).containsEntry(new MdmBodyKey("C", "2.000"), "NOT_RELEASED");
        assertThat(r.legacyAsked()).isEmpty();
        server.verify();
    }

    @Test
    void 본문_신호_가_는_정의_키로_전_이력을_돌려주고_물은_정의_키를_남긴다() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.params.part").value("BODY"))
                .andRespond(withSuccess(ok("{\"items\":[{\"key\":\"R\",\"value\":[" + RULE_1000 + "]}],\"failed\":[]}"),
                        MediaType.APPLICATION_JSON));

        MdmBodyResult r = client.fetchBodies(MdmTargetType.RULE, List.of(new MdmBodyKey("R", "1.000"), new MdmBodyKey("NO", "1.000")));

        assertThat(r.legacy()).containsOnlyKeys("R");
        assertThat(r.legacyAsked()).containsExactlyInAnyOrder("R", "NO");
        server.verify();
    }

    @Test
    void 값_하나를_읽을_수_없으면_그_키만_failed_다() {
        server.expect(requestTo(URL)).andRespond(withSuccess(ok("{\"part\":\"TOC\",\"items\":["
                + "{\"key\":\"BAD\",\"value\":{\"versions\":[{\"ver\":\"x\"}]},\"current\":null},"
                + "{\"key\":\"R\",\"value\":{\"header\":null,\"versions\":[]},\"current\":null}],\"failed\":[]}"), MediaType.APPLICATION_JSON));

        MdmTocResult r = client.fetchToc(MdmTargetType.RULE, List.of("BAD", "R"), null);

        assertThat(r.failed()).containsKey("BAD");
        assertThat(r.tocs()).containsOnlyKeys("R");
        server.verify();
    }

    @Test
    void fetch_만_구현한_옛_피드는_default_로_전_이력을_돌려준다() {
        MdmMetaFeed old = new MdmMetaFeed() {
            @Override
            public MdmChanges changes(long since, int limit) {
                throw new UnsupportedOperationException();
            }

            @Override
            public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
                return new MdmFetchResult(Map.of("R", List.of()), Map.of());
            }
        };
        assertThat(old.fetchToc(MdmTargetType.RULE, List.of("R"), null).legacy()).containsKey("R");
        MdmBodyResult body = old.fetchBodies(MdmTargetType.RULE, List.of(new MdmBodyKey("R", "1.000"), new MdmBodyKey("R", "2.000")));
        assertThat(body.legacy()).containsOnlyKeys("R");
        assertThat(body.legacyAsked()).isEqualTo(Set.of("R"));
    }
}
