package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpUrlTemplate;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import com.dongkuk.dmes.mcm.widget.ext.WeatherCollectReader;
import com.dongkuk.dmes.mcm.widget.ext.WeatherReport;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.util.StreamUtils;

/**
 * 날씨 수집(설계 docs/superpowers/specs/2026-10-09-weather-collect-design.md) 확인 — V5 시드 SQL 이 5건을 멱등으로 넣고, 넣은 정의가 수집 설정 검사·주소
 * 치환·변수 읽기를 통과하며, {@link WeatherCollectReader} 가 최신 회차 하나만 읽는지. V5 파일은 시험 안에서 직접 다시 실행한다(컨텍스트가 뜰 때 행이 지워지므로).
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class WeatherCollectOraTest {

    private static final String V5 = "db/migration/oracle/mcmapuser/V5__weather_collect_seed.sql";

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;

    private WeatherCollectReader reader;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA WHERE JOB_ID LIKE 'mcm.weather.%'");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID LIKE 'mcm.weather.%'");
    }

    @BeforeEach
    void setUp() {
        reader = new WeatherCollectReader(dataSource, "MCMAPUSER");
    }

    /** V5 의 SQL 한 문장(주석 줄과 끝 세미콜론을 뺀 것)을 실행한다. */
    private void runSeed() throws Exception {
        String text = StreamUtils.copyToString(new ClassPathResource(V5).getInputStream(), StandardCharsets.UTF_8);
        String sql = text.lines().filter(l -> !l.startsWith("--")).collect(Collectors.joining("\n")).strip();
        assertThat(sql).endsWith(";");
        jdbc.update(sql.substring(0, sql.length() - 1));
    }

    private void putSlot(String jobId, String slot, Map<String, Object> items) {
        items.forEach((k, v) -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT) VALUES (?, ?, ?, ?, ?)",
                jobId, slot, k, v instanceof String ? null : v, v instanceof String ? v : null));
    }

    @Test
    @DisplayName("V5 는 작업 5건을 USER 소유 COLLECT 로 넣고, 다시 돌려도 늘지 않으며, 지운 작업만 되살린다")
    void seedIsIdempotent() throws Exception {
        runSeed();
        runSeed();

        List<Map<String, Object>> rows = jdbc.queryForList("SELECT JOB_ID, MODULE_CD, JOB_KIND, SERVICE_ID, ACTION, USE_YN, OWNER_TP, TIMEOUT_SEC, CRON_EXPR, NEXT_RUN_AT "
                + "FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID LIKE 'mcm.weather.%' ORDER BY JOB_ID");
        assertThat(rows).extracting(r -> r.get("JOB_ID")).containsExactly(
                "mcm.weather.busan", "mcm.weather.dangjin", "mcm.weather.incheon", "mcm.weather.pohang", "mcm.weather.seoul");
        assertThat(rows).allSatisfy(r -> {
            assertThat(r).containsEntry("MODULE_CD", "MCM").containsEntry("JOB_KIND", "COLLECT").containsEntry("SERVICE_ID", "jobCollect")
                    .containsEntry("ACTION", "run").containsEntry("USE_YN", "Y").containsEntry("OWNER_TP", "USER");
            assertThat(r.get("NEXT_RUN_AT")).isNotNull();
            CronSpec cron = CronSpec.parse((String) r.get("CRON_EXPR"));
            assertThat(cron.minGap().toMinutes()).isEqualTo(30);
        });
        assertThat(rows.stream().map(r -> r.get("NEXT_RUN_AT")).distinct()).hasSize(5);   // 첫 실행 분을 어긋나게 — 실행 풀(4) 넘침 방지

        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.weather.busan'");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET JOB_NM = '고친 이름' WHERE JOB_ID = 'mcm.weather.seoul'");
        runSeed();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID LIKE 'mcm.weather.%'", Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT JOB_NM FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.weather.seoul'", String.class)).isEqualTo("고친 이름");
    }

    @Test
    @DisplayName("시드 정의는 수집 설정 검사를 통과하고(항목 19개, 항목 한도 20 이내), 변수 lat·lon 을 넣은 주소가 Open-Meteo 요청이 된다")
    void seedConfigIsValidCollectConfig() throws Exception {
        runSeed();
        Map<String, Object> def = jdbc.queryForMap("SELECT CONFIG_JSON, VARS_JSON FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.weather.incheon'");

        CollectConfig parsed = CollectConfigs.check(new com.fasterxml.jackson.databind.ObjectMapper().readTree((String) def.get("CONFIG_JSON")),
                sql -> { throw new AssertionError("SQL 원천이 아니다"); }, host -> host.equals("api.open-meteo.com"));
        assertThat(parsed.save()).isTrue();
        CollectConfig.HttpSource http = (CollectConfig.HttpSource) parsed.source();
        assertThat(http.items()).hasSize(19).extracting(CollectConfig.HttpItem::key).contains("cur_temp", "d0_date", "d2_pop");

        Map<String, Object> vars = new LinkedHashMap<>();
        for (JobVar v : JobVars.parse((String) def.get("VARS_JSON"))) vars.put(v.name(), v.value());
        assertThat(JobVars.validate(JobVars.parse((String) def.get("VARS_JSON")))).isEmpty();
        URI uri = HttpUrlTemplate.render(http, vars, LocalDate.of(2026, 10, 9));
        assertThat(uri.getHost()).isEqualTo("api.open-meteo.com");
        assertThat(uri.getRawQuery()).isEqualTo("latitude=37.46&longitude=126.71"
                + "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m"
                + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=3");
    }

    @Test
    @DisplayName("좌표(소수 둘째 자리)로 지점을 찾아 가장 최근 회차 하나만 읽는다")
    void readsLatestSlotOfMatchingJob() throws Exception {
        runSeed();
        Map<String, Object> old = new LinkedHashMap<>();
        old.put("cur_temp", new BigDecimal("10.0"));
        old.put("cur_code", 0);
        old.put("d0_date", "2026-10-09");
        putSlot("mcm.weather.seoul", "202610091200", old);
        Map<String, Object> latest = new LinkedHashMap<>();
        latest.put("cur_temp", new BigDecimal("18.4"));
        latest.put("cur_code", 3);
        latest.put("cur_wind", new BigDecimal("12.5"));
        latest.put("cur_humidity", 61);
        latest.put("d0_date", "2026-10-09");
        latest.put("d0_min", new BigDecimal("11.2"));
        latest.put("d0_max", new BigDecimal("21.0"));
        latest.put("d0_code", 3);
        latest.put("d1_date", "2026-10-10");
        putSlot("mcm.weather.seoul", "202610091230", latest);
        putSlot("mcm.weather.busan", "202610091300", Map.of("cur_temp", new BigDecimal("99")));

        WeatherCollectReader.Result r = reader.read(new BigDecimal("37.57"), new BigDecimal("126.98"));

        assertThat(r.status()).isEqualTo(WeatherCollectReader.Status.OK);
        assertThat(r.collectedAt()).isEqualTo(java.time.LocalDateTime.of(2026, 10, 9, 12, 30));
        assertThat(r.report().current()).isEqualTo(new WeatherReport.Current(18.4, 3, 12.5, 61));
        assertThat(r.report().daily()).extracting(WeatherReport.Daily::date).containsExactly("2026-10-09", "2026-10-10");
        assertThat(r.report().daily().get(0)).isEqualTo(new WeatherReport.Daily("2026-10-09", 11.2, 21.0, 3, null));
    }

    @Test
    @DisplayName("수집 대상이 아닌 좌표 = UNCOLLECTED, 쓰지 않는(USE_YN=N) 작업·다른 접두 작업은 지점이 아니다, 값이 없으면 EMPTY")
    void statuses() throws Exception {
        runSeed();
        assertThat(reader.read(new BigDecimal("35.00"), new BigDecimal("129.00")).status()).isEqualTo(WeatherCollectReader.Status.UNCOLLECTED);
        assertThat(reader.read(new BigDecimal("37.57"), new BigDecimal("126.98")).status()).isEqualTo(WeatherCollectReader.Status.EMPTY);

        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET USE_YN = 'N' WHERE JOB_ID = 'mcm.weather.seoul'");
        assertThat(reader.read(new BigDecimal("37.57"), new BigDecimal("126.98")).status()).isEqualTo(WeatherCollectReader.Status.UNCOLLECTED);

        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET JOB_ID = 'other.weather.seoul', USE_YN = 'Y' WHERE JOB_ID = 'mcm.weather.seoul'");
        try {
            assertThat(reader.read(new BigDecimal("37.57"), new BigDecimal("126.98")).status()).isEqualTo(WeatherCollectReader.Status.UNCOLLECTED);
        } finally {
            jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'other.weather.seoul'");
        }
    }

    @Test
    @DisplayName("허용 거리(0.1°) 안의 가까운 지점에 맞춘다 — 빠른 추가가 아닌 좌표도 근처 수집 지점의 값을 본다")
    void matchesNearestWithinTolerance() throws Exception {
        runSeed();
        putSlot("mcm.weather.seoul", "202610091230", Map.of("cur_temp", new BigDecimal("18.4")));
        putSlot("mcm.weather.incheon", "202610091230", Map.of("cur_temp", new BigDecimal("15.0")));

        WeatherCollectReader.Result near = reader.read(new BigDecimal("37.63"), new BigDecimal("127.05"));
        assertThat(near.status()).isEqualTo(WeatherCollectReader.Status.OK);
        assertThat(near.report().current().temp()).isEqualTo(18.4);

        assertThat(reader.read(new BigDecimal("37.68"), new BigDecimal("126.98")).status()).isEqualTo(WeatherCollectReader.Status.UNCOLLECTED);   // 서울에서 0.11° 위
    }

    @Test
    @DisplayName("같은 좌표 작업이 여럿이면(복사 후 좌표 미수정) 최신 회차가 있는 쪽, 모듈이 MCM 이 아닌 작업은 지점이 아니다, 변수가 깨진 작업은 건너뛴다")
    void duplicatesAndBrokenJobs() throws Exception {
        runSeed();
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, VARS_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "SELECT 'mcm.weather.seoul2', MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, VARS_JSON, TIMEOUT_SEC, OWNER_TP FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.weather.seoul'");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, VARS_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mcm.weather.broken', 'MCM', 'x', 'COLLECT', 'jobCollect', 'run', '0 * * * *', 'Y', '[null]', 60, 'USER')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, VARS_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "SELECT 'mcm.weather.mdm', 'MDM', JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, REPLACE(VARS_JSON, '37.57', '36.50'), TIMEOUT_SEC, OWNER_TP FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.weather.seoul'");
        putSlot("mcm.weather.seoul2", "202610091230", Map.of("cur_temp", new BigDecimal("18.4")));   // 사본에만 값이 있다
        putSlot("mcm.weather.mdm", "202610091230", Map.of("cur_temp", new BigDecimal("99")));

        WeatherCollectReader.Result r = reader.read(new BigDecimal("37.57"), new BigDecimal("126.98"));
        assertThat(r.status()).isEqualTo(WeatherCollectReader.Status.OK);
        assertThat(r.report().current().temp()).isEqualTo(18.4);

        assertThat(reader.read(new BigDecimal("36.50"), new BigDecimal("126.98")).status()).isEqualTo(WeatherCollectReader.Status.UNCOLLECTED);   // MDM 모듈 작업은 지점이 아니다
    }
}
