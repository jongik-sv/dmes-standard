package com.dongkuk.dmes.analog.web;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Collection;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 예약 작업 로그 모듈 sch: 여러 모듈이 한 파일(logs/sch/dmes-sch.날짜.0.log, prudent 모드라 live 이름 없이 날짜 파일 하나)에
 * 섞어 쓴 줄을 module=sch 로 검색하고, 서비스 목록(tree)이 sch.모듈.클래스.메서드 별로 나오는지 확인한다.
 * 여러 줄 SQL(시각 없는 줄)이 섞여 있어도 동작해야 한다.
 */
@SpringBootTest(properties = {
        "analog-express.modules=mcm,sch",
        "analog-express.client_types=app",
        "analog-express.stage=DEV",
        "cactus.security.client-key=test-analog-client-key"
})
class LogSearchControllerSchModuleTest {

    private static final String LINE = "2026-10-08 10:%02d:%02d.%03d [%s] [%s] [%s] %s %s - %s\n";

    @TempDir
    static Path logDir;

    @DynamicPropertySource
    static void logBaseDir(DynamicPropertyRegistry registry) throws IOException {
        // 기본 log_base_dir 형식 ../logs/{MODULE} 대신 {MODULE} 치환이 sch 디렉터리로 가는지까지 보려고 모듈별 폴더를 만든다.
        Path sch = Files.createDirectories(logDir.resolve("sch"));
        StringBuilder sb = new StringBuilder();
        sb.append(String.format(LINE, 0, 0, 1, "pool-2-thread-1", "Ab12", "sch.mcm.widgetCollector.collectMinute", "INFO ", "c.d.d.c.s.ScheduledJobLogContext", "sch.mcm.widgetCollector.collectMinute/run"));
        sb.append(String.format(LINE, 0, 0, 2, "pool-3-thread-1", "Cd34", "sch.mdm.mdmRevisionPoller.poll", "INFO ", "c.d.d.c.s.ScheduledJobLogContext", "sch.mdm.mdmRevisionPoller.poll/run"));
        sb.append(String.format(LINE, 0, 0, 3, "pool-2-thread-1", "Ab12", "sch.mcm.widgetCollector.collectMinute", "DEBUG", "org.hibernate.SQL", ""));
        sb.append("    select\n        wd1_0.WIDGET_ID\n    from\n        TB_WIDGET wd1_0\n");
        sb.append(String.format(LINE, 0, 0, 9, "pool-3-thread-1", "Cd34", "sch.mdm.mdmRevisionPoller.poll", "INFO ", "c.d.d.c.s.ScheduledJobLogContext", "Service end - service name [sch.mdm.mdmRevisionPoller.poll] RunTime : [7]"));
        sb.append(String.format(LINE, 0, 0, 12, "pool-2-thread-1", "Ab12", "sch.mcm.widgetCollector.collectMinute", "INFO ", "c.d.d.c.s.ScheduledJobLogContext", "Service end - service name [sch.mcm.widgetCollector.collectMinute] RunTime : [11]"));
        Files.writeString(sch.resolve("dmes-sch.2026-10-08.0.log"), sb.toString(), StandardCharsets.UTF_8);
        registry.add("analog-express.log_base_dir", () -> logDir.toString() + "/{MODULE}");
    }

    @Autowired
    WebApplicationContext webApplicationContext;

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        Collection<Filter> filters = webApplicationContext.getBeansOfType(Filter.class).values();
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .addFilters(filters.toArray(new Filter[0]))
                .build();
    }

    private static String b64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void 날짜_파일_하나에_섞인_두_모듈의_예약_작업_줄과_여러_줄_SQL_을_함께_검색한다() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", "test-analog-client-key")
                        .param("from", "20261008100000")
                        .param("to", "20261008100059")
                        .param("keyword", b64("sch."))
                        .param("serverType", "app")
                        .param("module", "sch")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", containsString("sch.mcm.widgetCollector.collectMinute/run")))
                .andExpect(jsonPath("$.log", containsString("sch.mdm.mdmRevisionPoller.poll/run")))
                .andExpect(jsonPath("$.log", containsString("TB_WIDGET wd1_0")));
    }

    @Test
    void 서비스_목록은_sch_모듈_클래스_메서드별로_나온다() throws Exception {
        mockMvc.perform(get("/log/range/time/tree")
                        .header("X-Client-Key", "test-analog-client-key")
                        .param("from", "20261008100000")
                        .param("to", "20261008100059")
                        .param("keyword", b64("sch."))
                        .param("serverType", "app")
                        .param("module", "sch")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("sch.mcm.widgetCollector.collectMinute")))
                .andExpect(content().string(containsString("sch.mdm.mdmRevisionPoller.poll")));
    }

    @Test
    void 날짜_범위_밖이면_sch_파일이_검색에_들어오지_않는다() throws Exception {
        mockMvc.perform(get("/log/range/time")
                        .header("X-Client-Key", "test-analog-client-key")
                        .param("from", "20261009100000")
                        .param("to", "20261009100059")
                        .param("keyword", b64("sch."))
                        .param("serverType", "app")
                        .param("module", "sch")
                        .param("clientType", "app")
                        .param("ignoreCase", "false")
                        .param("byThread", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.log", not(containsString("sch.mcm"))));
    }
}
