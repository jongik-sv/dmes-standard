package com.dongkuk.dmes.cactus.mdm;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.web.inbound.CactusRequestMappingHandlerMapping;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** spec §5.5 엔드포인트 — 화면 메타·이름 정규화·모듈 404·SYSADMIN 헤더 판정·항목·미리 적재. */
class MdmMetaControllerTest {

    private FakeMetaFeed feed;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        feed = new FakeMetaFeed();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        MdmMetaService service = new MdmMetaService(feed, cache, clock);
        MdmRevisionPoller poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000);
        MdmMetaController controller = new MdmMetaController("mls", "123@host", service, cache, poller, clock);
        mvc = MockMvcBuilders.standaloneSetup(controller).setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new).build();

        feed.put(MdmTargetType.COLUMN, "COIL_THK", new MdmColumnMeta("COIL_THK", "코일 두께", null, "두께", null, "설명", null, "NUMBER", 10, 2,
                true, null, null, null, null, new MdmColumnMeta.DomainRef("7", "두께", "QTY"),
                new MdmColumnMeta.Expr("value >= 0", null), new MdmColumnMeta.BizExpr("value <= COIL_WID"), List.of("COIL_WID"), null));
    }

    @Test
    void columns_는_camelCase_요청_이름으로_화면_메타를_주고_비즈니스식_원문은_싣지_않는다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"names\":[\"coilThk\",\"NO_SUCH\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.coilThk.physName").value("COIL_THK"))
                .andExpect(jsonPath("$.items.coilThk.labelMid").value("두께"))
                .andExpect(jsonPath("$.items.coilThk.stdExpr.text").value("value >= 0"))
                .andExpect(jsonPath("$.items.coilThk.bizRuleOnServer").value(true))
                .andExpect(jsonPath("$.items.coilThk.bizExpr").doesNotExist())
                .andExpect(jsonPath("$.missing[0]").value("NO_SUCH"))
                .andExpect(jsonPath("$.unavailable").isEmpty());
    }

    @Test
    void 코드_참조가_있으면_허용_코드를_풀어서_더한다() throws Exception {
        feed.put(MdmTargetType.CODE, "PROC_CD", procCodeRows());
        feed.put(MdmTargetType.COLUMN, "PROC_COL", procColumn());

        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"procCol\"]}"))
                .andExpect(jsonPath("$.items.procCol.allowedCodes[0].code").value("A"))
                .andExpect(jsonPath("$.items.procCol.allowedCodes[0].name").value("에이"))
                .andExpect(jsonPath("$.items.procCol.bizRuleOnServer").value(false));
    }

    /** Task 9 검토 반영 — 코드 원본을 받을 수 없어도 컬럼 메타(캡션·툴팁)는 그대로 준다. 허용 코드는 null 로 "풀지 못함"을 알린다. */
    @Test
    void 코드_원본을_받을_수_없어도_컬럼은_items_에_남고_allowedCodes_만_null_이다() throws Exception {
        feed.failedKeys.put("PROC_CD", "코드 정의 손상");
        feed.put(MdmTargetType.COLUMN, "PROC_COL", procColumn());

        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"procCol\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.procCol.physName").value("PROC_COL"))
                .andExpect(jsonPath("$.items.procCol.codeRef.maruCodeId").value("PROC_CD"))
                .andExpect(jsonPath("$.items.procCol.allowedCodes").value(nullValue()))
                .andExpect(jsonPath("$.unavailable").isEmpty())
                .andExpect(jsonPath("$.missing").isEmpty());
    }

    @Test
    void MDM_을_받을_수_없는_이름은_unavailable_이다() throws Exception {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"coilThk\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unavailable[0]").value("coilThk"));
    }

    @Test
    void 다른_모듈_경로는_404() throws Exception {
        mvc.perform(post("/api/mqc/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"coilThk\"]}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void domains_는_도메인_메타를_준다() throws Exception {
        feed.put(MdmTargetType.DOMAIN, "7", new MdmDomainMeta("7", "두께", "THK", "QTY", "NUMBER", 10, 2, "mm", "설명",
                new MdmColumnMeta.Expr("value >= 0", null), true, null));
        mvc.perform(post("/api/mls/mdmMeta/domains").contentType(MediaType.APPLICATION_JSON).content("{\"domainIds\":[\"7\",\"8\"]}"))
                .andExpect(jsonPath("$.items['7'].stdName").value("THK"))
                .andExpect(jsonPath("$.missing[0]").value("8"));
    }

    @Test
    void status_는_SYSADMIN_이_아니면_403_이고_SYSADMIN_이면_상태를_준다() throws Exception {
        mvc.perform(get("/api/mls/mdmMeta/status")).andExpect(status().isForbidden());
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "MCM_VIEWER")).andExpect(status().isForbidden());
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "MCM_VIEWER, ROLE_SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.module").value("mls"))
                .andExpect(jsonPath("$.instanceId").value("123@host"))
                .andExpect(jsonPath("$.appliedSeq").value(0))
                .andExpect(jsonPath("$.counts.COLUMN").value(0))
                .andExpect(jsonPath("$.maxEntries").value(100))
                .andExpect(jsonPath("$.maxAgeSeconds").value(3600));
    }

    @Test
    void entries_는_대상_종류와_키로_거르고_잘못된_종류는_400() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\",\"NOPE\"]}"));

        mvc.perform(get("/api/mls/mdmMeta/entries").param("type", "COLUMN").param("q", "coil").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].type").value("COLUMN"))
                .andExpect(jsonPath("$.items[0].key").value("COIL_THK"))
                .andExpect(jsonPath("$.items[0].absent").value(false))
                .andExpect(jsonPath("$.items[0].remainingSeconds").value(3600));
        mvc.perform(get("/api/mls/mdmMeta/entries").param("type", "TABLE").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void load_는_이_인스턴스에_다시_적재하고_결과를_나눠_준다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).header("X-Authenticated-Role", "SYSADMIN")
                        .content("{\"type\":\"COLUMN\",\"keys\":[\"coilThk\",\"nope\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loaded[0]").value("COIL_THK"))
                .andExpect(jsonPath("$.missing[0]").value("NOPE"));
        mvc.perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"COLUMN\",\"keys\":[\"x\"]}"))
                .andExpect(status().isForbidden());
    }

    private static CodeRows procCodeRows() {
        return new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1.000"), new BigDecimal("9999.000"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", "CODE")),
                List.of());
    }

    private static MdmColumnMeta procColumn() {
        return new MdmColumnMeta("PROC_COL", "공정", null, null, null, null, null, "STRING", 10, null,
                false, null, null, null, null, new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta("PROC_CD", "BASE"));
    }
}
