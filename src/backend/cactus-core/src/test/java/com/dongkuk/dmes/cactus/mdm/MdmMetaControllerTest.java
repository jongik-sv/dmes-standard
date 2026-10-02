package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** spec §5.5 엔드포인트 — 화면 메타·이름 정규화·모듈 404·SYSADMIN 헤더 판정·항목·미리 적재. */
class MdmMetaControllerTest {

    private FakeMetaFeed feed;
    private MutableClock clock;
    private MockMvc mvc;
    private final Logger controllerLog = (Logger) LoggerFactory.getLogger(MdmMetaController.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @AfterEach
    void tearDown() {
        controllerLog.detachAppender(logs);
        SecurityContextHolder.clearContext();
    }

    @BeforeEach
    void setUp() {
        logs.start();
        controllerLog.addAppender(logs);
        SecurityContextHolder.clearContext();
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
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
        assertThat(warnings()).isEmpty(); // MDM 에서 받을 수 없음은 WARN 이 아니다
    }

    /** 검토 반영 — MDM 장애가 아닌 예외(해석기 오류 등)는 컬럼은 그대로 두되 WARN 으로 예외와 함께 남긴다. */
    @Test
    void 코드_해석이_MDM_장애가_아닌_예외로_실패하면_WARN_을_남기고_컬럼은_그대로_준다() throws Exception {
        feed.put(MdmTargetType.CODE, "PROC_CD", codeRows("PROC_CD", "BOGUS")); // 엔진: 알 수 없는 def_target → IllegalStateException
        feed.put(MdmTargetType.COLUMN, "PROC_COL", procColumn());

        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"procCol\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.procCol.physName").value("PROC_COL"))
                .andExpect(jsonPath("$.items.procCol.allowedCodes").value(nullValue()))
                .andExpect(jsonPath("$.unavailable").isEmpty());
        assertThat(warnings()).singleElement().satisfies(e -> {
            assertThat(e.getFormattedMessage()).contains("PROC_COL").contains("PROC_CD");
            assertThat(e.getThrowableProxy()).isNotNull();
            assertThat(e.getThrowableProxy().getClassName()).isEqualTo(IllegalStateException.class.getName());
        });
    }

    /** 검토 반영 — 차가운 캐시에서 컬럼 N 개가 서로 다른 코드 K 개를 참조해도 코드 원본은 한 번에 받는다. */
    @Test
    void 여러_컬럼의_코드_원본은_한_번의_CODE_요청으로_받는다() throws Exception {
        feed.put(MdmTargetType.CODE, "PROC_CD", procCodeRows());
        feed.put(MdmTargetType.CODE, "GRADE_CD", codeRows("GRADE_CD", "CODE"));
        feed.put(MdmTargetType.COLUMN, "PROC_COL", procColumn());
        feed.put(MdmTargetType.COLUMN, "PROC_COL2", codeColumn("PROC_COL2", "PROC_CD"));
        feed.put(MdmTargetType.COLUMN, "GRADE_COL", codeColumn("GRADE_COL", "GRADE_CD"));

        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"names\":[\"procCol\",\"procCol2\",\"gradeCol\",\"coilThk\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.procCol.allowedCodes[0].code").value("A"))
                .andExpect(jsonPath("$.items.procCol2.allowedCodes[0].code").value("A"))
                .andExpect(jsonPath("$.items.gradeCol.allowedCodes[0].code").value("A"));
        assertThat(feed.fetchCalls.get()).isEqualTo(2); // COLUMN 1번 + CODE 1번
        assertThat(feed.fetchedKeys.get(1)).containsExactlyInAnyOrder("PROC_CD", "GRADE_CD");
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

    /** 검토 반영(R10 보강) — 인증된 사용자가 있으면 그 권한으로만 판정하고 헤더는 보지 않는다. */
    @Test
    void 인증이_있으면_권한으로_판정하고_헤더는_무시한다() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("u1", null, AuthorityUtils.createAuthorityList("ROLE_MCM_VIEWER")));
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "SYSADMIN")).andExpect(status().isForbidden());

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null, AuthorityUtils.createAuthorityList("ROLE_sysadmin")));
        mvc.perform(get("/api/mls/mdmMeta/status")).andExpect(status().isOk());
    }

    /** 익명 인증(또는 인증 없음)이면 헤더로 판정한다 — mqc·mpp·mpn 처럼 사용자 문맥이 없는 모듈. */
    @Test
    void 익명_인증이면_헤더로_판정한다() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new AnonymousAuthenticationToken("k", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "ROLE_SYSADMIN")).andExpect(status().isOk());
        mvc.perform(get("/api/mls/mdmMeta/status").header("X-Authenticated-Role", "MCM_VIEWER")).andExpect(status().isForbidden());
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
    void entries_는_캐시_값을_싣지_않아_비즈니스식_원문이_브라우저로_나가지_않는다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\"]}"));

        String body = mvc.perform(get("/api/mls/mdmMeta/entries").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].key").value("COIL_THK"))
                .andExpect(jsonPath("$.items[0].absent").value(false))
                .andExpect(jsonPath("$.items[0].value").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        // spec §4.2 — bizExpr.text 는 서버 전용이다(화면 응답에는 존재 여부만).
        assertThat(body).doesNotContain("bizExpr").doesNotContain("value <= COIL_WID");
    }

    /** 2026-10-02 사용자 결정 — SYSADMIN 항목 상세 보기는 spec §4.2 의 예외로 비즈니스식 원문까지 캐시 값 전체를 싣는다. */
    @Test
    void entry_는_SYSADMIN_에게_비즈니스식_원문까지_캐시_값_전체를_준다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\"]}"));

        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "column").param("key", "coilThk").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("COLUMN"))
                .andExpect(jsonPath("$.key").value("COIL_THK"))
                .andExpect(jsonPath("$.absent").value(false))
                .andExpect(jsonPath("$.loadedAt").value("2026-10-02T00:00:00Z"))
                .andExpect(jsonPath("$.hits").value(0))
                .andExpect(jsonPath("$.remainingSeconds").value(3600))
                .andExpect(jsonPath("$.loadSeq").value(0))
                .andExpect(jsonPath("$.value.physName").value("COIL_THK"))
                .andExpect(jsonPath("$.value.bizExpr.text").value("value <= COIL_WID"))
                .andExpect(jsonPath("$.value.bizRequiredVars[0]").value("COIL_WID"))
                .andExpect(jsonPath("$.value.stdExpr.text").value("value >= 0"));
    }

    @Test
    void entry_는_SYSADMIN_이_아니면_403_다른_모듈은_404_잘못된_종류나_빈_키는_400() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\"]}"));

        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", "COIL_THK")).andExpect(status().isForbidden());
        String denied = mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", "COIL_THK")
                        .header("X-Authenticated-Role", "MCM_VIEWER"))
                .andExpect(status().isForbidden())
                .andReturn().getResponse().getContentAsString();
        assertThat(denied).doesNotContain("value <= COIL_WID");
        mvc.perform(get("/api/mqc/mdmMeta/entry").param("type", "COLUMN").param("key", "COIL_THK").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "TABLE").param("key", "COIL_THK").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/mls/mdmMeta/entry").param("key", "COIL_THK").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", " ").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void entry_는_캐시를_읽기만_해서_조회_수도_MDM_호출도_바뀌지_않는다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\"]}"));
        int calls = feed.fetchCalls.get();

        for (int i = 0; i < 2; i++) {
            mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", "COIL_THK").header("X-Authenticated-Role", "SYSADMIN"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.hits").value(0));
        }
        mvc.perform(get("/api/mls/mdmMeta/entries").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(jsonPath("$.items[0].key").value("COIL_THK"))
                .andExpect(jsonPath("$.items[0].hits").value(0));
        assertThat(feed.fetchCalls.get()).isEqualTo(calls);
    }

    @Test
    void entry_는_캐시에_없으면_MDM_에서_받지_않고_404() throws Exception {
        int calls = feed.fetchCalls.get();
        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", "COIL_THK").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("캐시에 없습니다(만료·삭제됨): COLUMN COIL_THK"));
        assertThat(feed.fetchCalls.get()).isEqualTo(calls);

        mvc.perform(get("/api/mls/mdmMeta/entries").header("X-Authenticated-Role", "SYSADMIN")).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void entry_는_max_age_가_지난_항목을_없는_것으로_본다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"COIL_THK\"]}"));
        clock.advance(Duration.ofMinutes(60));

        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", "COIL_THK").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isNotFound());
    }

    @Test
    void entry_는_없음_항목을_absent_와_빈_값으로_준다() throws Exception {
        mvc.perform(post("/api/mls/mdmMeta/columns").contentType(MediaType.APPLICATION_JSON).content("{\"names\":[\"NOPE\"]}"));

        mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "COLUMN").param("key", "NOPE").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.absent").value(true))
                .andExpect(jsonPath("$.value").value(nullValue()));
    }

    /** 값은 MdmJson 설정으로 바꾼다 — 소수 자리수(1.000)를 지키고 날짜는 ISO 문자열이다. JsonPath 는 1.000 을 1.0 으로 읽으므로 본문 글자로 본다. */
    @Test
    void entry_는_소수_자리수와_ISO_날짜를_지킨다() throws Exception {
        feed.put(MdmTargetType.CODE, "PROC_CD", procCodeRows());
        mvc.perform(post("/api/mls/mdmMeta/load").contentType(MediaType.APPLICATION_JSON).header("X-Authenticated-Role", "SYSADMIN")
                        .content("{\"type\":\"CODE\",\"keys\":[\"PROC_CD\"]}"))
                .andExpect(jsonPath("$.loaded[0]").value("PROC_CD"));

        String body = mvc.perform(get("/api/mls/mdmMeta/entry").param("type", "CODE").param("key", "PROC_CD")
                        .header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains("1.000").contains("9999.000").contains("\"2026-01-01T00:00:00\"");
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

    private List<ILoggingEvent> warnings() {
        return logs.list.stream().filter(e -> e.getLevel() == Level.WARN).toList();
    }

    private static CodeRows procCodeRows() {
        return codeRows("PROC_CD", "CODE");
    }

    private static CodeRows codeRows(String codeId, String defTarget) {
        return new CodeRows(new CodeHeader(codeId, "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("A", new BigDecimal("1.000"), new BigDecimal("9999.000"), "에이", null, 1,
                        Arrays.asList(new String[5]), Arrays.asList(new String[10]))),
                List.of(new CodeCateRow("BASE", new BigDecimal("1.000"), new BigDecimal("9999.000"), "REGEX", ".*", defTarget)),
                List.of());
    }

    private static MdmColumnMeta procColumn() {
        return codeColumn("PROC_COL", "PROC_CD");
    }

    private static MdmColumnMeta codeColumn(String physName, String codeId) {
        return new MdmColumnMeta(physName, "공정", null, null, null, null, null, "STRING", 10, null,
                false, null, null, null, null, new MdmColumnMeta.DomainRef("8", "공정", "CODE"), null, null, List.of(),
                new MdmColumnMeta.CodeRefMeta(codeId, "BASE"));
    }
}
