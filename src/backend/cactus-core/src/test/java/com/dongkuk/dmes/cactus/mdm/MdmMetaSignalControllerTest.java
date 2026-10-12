package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.web.inbound.CactusRequestMappingHandlerMapping;
import com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** 변경 신호 접수 {@code POST /internal/mdm/metaSignal}(mdm ADR-0007 D2 개정) — ClientKeyFilter 가 세운 {@code system:mdm} 주체만 확인을 예약한다. */
class MdmMetaSignalControllerTest {

    private final AtomicInteger requested = new AtomicInteger();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-12T00:00:00Z"));
        FakeMetaFeed feed = new FakeMetaFeed();
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        MdmMetaService service = new MdmMetaService(feed, cache, clock);
        MdmRevisionPoller poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofMinutes(5), 1000) {
            @Override
            public boolean requestPoll() {
                requested.incrementAndGet();
                return true;
            }
        };
        mvc = MockMvcBuilders.standaloneSetup(new MdmMetaSignalController(poller))
                .setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new)
                .addFilters(new ClientKeyFilter("secret-key", List.of("/auth/", "/api/auth/", "/actuator/"))).build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void MDM_시스템_주체면_202_로_확인을_예약한다() throws Exception {
        mvc.perform(post("/internal/mdm/metaSignal").contentType(MediaType.APPLICATION_JSON).content("{\"latestSeq\":42}")
                        .header("X-Client-Key", "secret-key").header("X-Authenticated-User", "system:mdm").header("X-Authenticated-Role", "SYSTEM"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true));
        assertThat(requested.get()).isEqualTo(1);
    }

    @Test
    void 본문이_없어도_받는다() throws Exception {
        mvc.perform(post("/internal/mdm/metaSignal")
                        .header("X-Client-Key", "secret-key").header("X-Authenticated-User", "system:mdm").header("X-Authenticated-Role", "SYSTEM"))
                .andExpect(status().isAccepted());
        assertThat(requested.get()).isEqualTo(1);
    }

    @Test
    void 다른_주체나_SYSTEM_권한이_없으면_403() throws Exception {
        mvc.perform(post("/internal/mdm/metaSignal")
                        .header("X-Client-Key", "secret-key").header("X-Authenticated-User", "admin").header("X-Authenticated-Role", "SYSADMIN,SYSTEM"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MDM_SIGNAL_FORBIDDEN"));
        SecurityContextHolder.clearContext();
        mvc.perform(post("/internal/mdm/metaSignal")
                        .header("X-Client-Key", "secret-key").header("X-Authenticated-User", "system:mdm").header("X-Authenticated-Role", "SYSADMIN"))
                .andExpect(status().isForbidden());
        SecurityContextHolder.clearContext();
        mvc.perform(post("/internal/mdm/metaSignal").header("X-Client-Key", "secret-key")) // 주체 헤더 없음 — 인증 없음
                .andExpect(status().isForbidden());
        assertThat(requested.get()).isZero();
    }

    @Test
    void 클라이언트_키가_틀리면_401() throws Exception {
        mvc.perform(post("/internal/mdm/metaSignal")
                        .header("X-Client-Key", "wrong").header("X-Authenticated-User", "system:mdm").header("X-Authenticated-Role", "SYSTEM"))
                .andExpect(status().isUnauthorized());
        assertThat(requested.get()).isZero();
    }
}
