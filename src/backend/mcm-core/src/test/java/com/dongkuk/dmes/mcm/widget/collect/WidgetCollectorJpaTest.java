package com.dongkuk.dmes.mcm.widget.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectData;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRunId;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectDataRepository;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectRunRepository;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 정시 수집기·쓰기·읽기 — 스펙 2026-10-05 정시 수집 §3~§5(H2 메모리, 실제 JPA). 원천은 가짜(질의 실행기 모의)이고 시계는 움직이는 시계다.
 * 일정 계산 자체는 {@link CollectConfigsTest}, 원천별 수집은 {@link CollectSourcesTest}.
 */
@SpringJUnitConfig(WidgetCollectorJpaTest.Config.class)
class WidgetCollectorJpaTest {

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = WidgetCollectRunRepository.class)
    static class Config {

        @Bean
        DataSource dataSource() {
            DriverManagerDataSource ds = new DriverManagerDataSource();
            ds.setDriverClassName("org.h2.Driver"); // testRuntimeOnly — 클래스 직접 참조 금지
            ds.setUrl("jdbc:h2:mem:widgetcollect;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS MCMAPUSER");
            ds.setUsername("sa");
            ds.setPassword("");
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setPackagesToScan("com.dongkuk.dmes.mcm.widget.collect.entity");
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            Properties props = new Properties();
            props.put("hibernate.hbm2ddl.auto", "create-drop");
            em.setJpaProperties(props);
            return em;
        }

        @Bean
        WidgetCollectWriter writer(WidgetCollectRunRepository runs, WidgetCollectDataRepository data) {
            return new WidgetCollectWriter(runs, data);
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
            return new JpaTransactionManager(entityManagerFactory);
        }
    }

    /** 서울 2026-10-05 00:10:20 — interval 10 분 정렬 시각. UTC 로는 10-04 15:10:20. */
    private static final Instant T0 = Instant.parse("2026-10-04T15:10:20Z");
    private static final String SLOT0 = "202610050010";

    @Autowired WidgetCollectRunRepository runs;
    @Autowired WidgetCollectDataRepository data;
    @Autowired WidgetCollectWriter writer;

    private WidgetDefRepository defRepository;
    private WidgetQueryRunner queryRunner;
    private WidgetCollectProperties properties;
    private MutableClock clock;
    private WidgetCollector collector;
    private final List<WidgetDef> defs = new ArrayList<>();

    @BeforeEach
    void setUp() {
        data.deleteAll();
        runs.deleteAll();
        defs.clear();
        defRepository = mock(WidgetDefRepository.class);
        when(defRepository.findBySrcTpAndTypeIdOrderByWidgetIdAsc("D", "collect")).thenAnswer(inv -> List.copyOf(defs));
        queryRunner = mock(WidgetQueryRunner.class);
        when(queryRunner.runCollect(anyString(), anyInt())).thenReturn(rows("L1", 5, "L2", 7));
        properties = new WidgetCollectProperties();
        clock = new MutableClock(T0);
        collector = newCollector(writer);
    }

    private WidgetCollector newCollector(WidgetCollectWriter w) {
        return new WidgetCollector(defRepository, w, properties, new SqlCollectSource(queryRunner),
                new HttpCollectSource(properties), new ExchangeCollectSource(new WidgetExtProperties(),
                        new com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider(new WidgetExtProperties()),
                        new com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider(new WidgetExtProperties())), clock);
    }

    private static WidgetQueryResult rows(Object... keyValue) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < keyValue.length; i += 2) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LINE", keyValue[i]);
            row.put("CNT", keyValue[i + 1]);
            rows.add(row);
        }
        return new WidgetQueryResult(List.of("LINE", "CNT"), rows, false);
    }

    private WidgetDef def(String id, String scheduleJson) {
        return def(id, scheduleJson, "{\"kind\":\"sql\",\"sql\":\"SELECT LINE, CNT FROM T\",\"valueField\":\"CNT\",\"keyField\":\"LINE\"}", "Y");
    }

    private WidgetDef def(String id, String scheduleJson, String sourceJson, String useYn) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId("collect");
        d.setUseYn(useYn);
        d.setConfigJson("{\"schedule\":" + scheduleJson + ",\"source\":" + sourceJson + "}");
        defs.add(d);
        when(defRepository.findById(id)).thenReturn(Optional.of(d));
        return d;
    }

    private static final String EVERY_10 = "{\"mode\":\"interval\",\"everyMin\":10}";

    // ── 수집 시각 ────────────────────────────────────────────────────

    @Test
    @DisplayName("수집 시각이면 RUN 행을 넣고 수집해 OK·항목 수로 끝낸다 — slot 은 서울 시각의 분(yyyyMMddHHmm)")
    void collectsDueDefinition() {
        def("def.a0000001", EVERY_10);

        assertThat(collector.tick()).isEqualTo(1);

        WidgetCollectRun run = runs.findById(new WidgetCollectRunId("def.a0000001", SLOT0)).orElseThrow();
        assertThat(run.getStatus()).isEqualTo("OK");
        assertThat(run.getItemCnt()).isEqualTo(2);
        assertThat(run.getMsg()).isNull();
        assertThat(run.getStartedAt()).isEqualTo(T0);
        assertThat(run.getEndedAt()).isNotNull();
        assertThat(run.getCreatedAt()).isNotNull(); // 감사 칸
        List<WidgetCollectData> values = data.findByWidgetIdAndSlotOrderByItemKeyAsc("def.a0000001", SLOT0);
        assertThat(values).extracting(WidgetCollectData::getItemKey).containsExactly("L1", "L2");
        assertThat(values.get(0).getValueNum()).isEqualByComparingTo("5");
        assertThat(values.get(1).getValueTxt()).isNull();
        verify(queryRunner).runCollect("SELECT LINE, CNT FROM T", 50);
    }

    @Test
    @DisplayName("수집 시각이 아니면 아무것도 하지 않는다 — 틱이 늦게 돌아도 틱이 시작한 분 기준이고 초는 무시한다")
    void notDueDoesNothing() {
        def("def.a0000001", EVERY_10);
        clock.set(Instant.parse("2026-10-04T15:07:59Z")); // 00:07
        assertThat(collector.tick()).isZero();
        clock.set(Instant.parse("2026-10-04T15:20:59Z")); // 00:20:59 — 20 분 슬롯, 초는 무시
        assertThat(collector.tick()).isEqualTo(1);
        assertThat(runs.findAll()).extracting(WidgetCollectRun::getSlot).containsExactly("202610050020");
        verify(queryRunner, times(1)).runCollect(anyString(), anyInt());
    }

    @Test
    @DisplayName("daily: 목록의 HH:mm 에만, 자정 경계(23:59→00:00)는 날짜가 바뀐 slot 으로")
    void dailyAndMidnight() {
        def("def.d0000001", "{\"mode\":\"daily\",\"at\":[\"09:30\",\"00:00\"]}");
        clock.set(Instant.parse("2026-10-05T00:30:10Z")); // 서울 09:30
        assertThat(collector.tick()).isEqualTo(1);
        clock.set(Instant.parse("2026-10-05T00:31:10Z")); // 09:31
        assertThat(collector.tick()).isZero();
        clock.set(Instant.parse("2026-10-04T14:59:59Z")); // 서울 23:59:59 (10-04)
        assertThat(collector.tick()).isZero();
        clock.set(Instant.parse("2026-10-04T15:00:00Z")); // 서울 00:00:00 (10-05)
        assertThat(collector.tick()).isEqualTo(1);
        assertThat(runs.findAll()).extracting(WidgetCollectRun::getSlot).containsExactlyInAnyOrder("202610050930", "202610050000");
    }

    @Test
    @DisplayName("사용 중지·유형 아닌·설정이 깨진 정의는 건너뛰고 나머지는 계속 수집한다")
    void skipsInactiveAndBrokenDefinitions() {
        def("def.a0000001", EVERY_10, "{\"kind\":\"sql\",\"sql\":\"SELECT 1\",\"valueField\":\"CNT\",\"keyField\":\"LINE\"}", "N");
        WidgetDef broken = def("def.b0000001", EVERY_10);
        broken.setConfigJson("{\"schedule\":{\"mode\":\"interval\",\"everyMin\":7},\"source\":{\"kind\":\"sql\"}}");
        WidgetDef nullCfg = def("def.c0000001", EVERY_10);
        nullCfg.setConfigJson(null);
        def("def.d0000001", EVERY_10);

        assertThat(collector.tick()).isEqualTo(1);
        assertThat(runs.findAll()).extracting(WidgetCollectRun::getWidgetId).containsExactly("def.d0000001");
    }

    @Test
    @DisplayName("한 틱에 수집할 정의는 정의 순서대로 최대 50개")
    void atMost50PerTick() {
        for (int i = 0; i < 55; i++) def(String.format("def.x%07d", i), EVERY_10);
        assertThat(collector.tick()).isEqualTo(50);
        assertThat(runs.count()).isEqualTo(50);
        assertThat(runs.findById(new WidgetCollectRunId("def.x0000049", SLOT0))).isPresent();
        assertThat(runs.findById(new WidgetCollectRunId("def.x0000050", SLOT0))).isEmpty();
    }

    // ── 중복 방지 ────────────────────────────────────────────────────

    @Test
    @DisplayName("같은 슬롯에 틱이 두 번 와도 한 번만 수집한다 — 두 번째는 건너뛰고 값도 한 벌")
    void sameSlotCollectedOnce() {
        def("def.a0000001", EVERY_10);
        assertThat(collector.tick()).isEqualTo(1);
        assertThat(collector.tick()).isZero();
        verify(queryRunner, times(1)).runCollect(anyString(), anyInt());
        assertThat(runs.count()).isEqualTo(1);
        assertThat(data.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("다른 인스턴스·이전 시도가 이미 잡은 슬롯(RUN 행 존재)은 수집하지 않는다 — 죽어서 RUN 으로 남은 회차도 다음 슬롯을 막지 않는다")
    void existingRunRowBlocksOnlyThatSlot() {
        def("def.a0000001", EVERY_10);
        runs.saveAndFlush(WidgetCollectRun.start("def.a0000001", SLOT0, T0.minusSeconds(5)));
        assertThat(collector.tick()).isZero();
        verify(queryRunner, never()).runCollect(anyString(), anyInt());
        assertThat(runs.findById(new WidgetCollectRunId("def.a0000001", SLOT0)).orElseThrow().getStatus()).isEqualTo("RUN");

        clock.advance(Duration.ofMinutes(10));
        assertThat(collector.tick()).isEqualTo(1);
        assertThat(runs.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("동시에 넣다가 PK 위반이 나면(다른 인스턴스가 먼저 넣음) 그 정의는 건너뛰고 다른 정의는 계속한다")
    void primaryKeyViolationSkips() {
        def("def.a0000001", EVERY_10);
        def("def.b0000001", EVERY_10);
        WidgetCollectWriter racing = spy(new WidgetCollectWriter(runs, data)); // 프록시가 아닌 사본(Mockito 는 프록시를 spy 로 못 만든다)
        doThrow(new DataIntegrityViolationException("duplicate")).when(racing).tryStart(org.mockito.ArgumentMatchers.eq("def.a0000001"), anyString(), any());
        WidgetCollector c = newCollector(racing);

        assertThat(c.tick()).isEqualTo(1);
        assertThat(runs.findAll()).extracting(WidgetCollectRun::getWidgetId).containsExactly("def.b0000001");
    }

    @Test
    @DisplayName("같은 PK 를 두 번 insert 하면 덮어쓰지 않고 무결성 예외 — RUN·DATA 모두(Persistable)")
    void duplicatePrimaryKeyIsRejectedNotMerged() {
        runs.saveAndFlush(WidgetCollectRun.start("def.a0000001", SLOT0, T0));
        assertThatThrownBy(() -> runs.saveAndFlush(WidgetCollectRun.start("def.a0000001", SLOT0, T0.plusSeconds(1))))
                .isInstanceOf(DataIntegrityViolationException.class);
        data.saveAndFlush(new WidgetCollectData("def.a0000001", SLOT0, "K", BigDecimal.ONE, null));
        assertThatThrownBy(() -> data.saveAndFlush(new WidgetCollectData("def.a0000001", SLOT0, "K", BigDecimal.TEN, null)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(data.findAll().get(0).getValueNum()).isEqualByComparingTo("1");

        // 쓰기 서비스의 항목 넣기는 이미 있으면 무시(false)
        assertThat(writer.insertItem("def.a0000001", SLOT0, new CollectItem("K", BigDecimal.TEN, null))).isFalse();
        assertThat(writer.insertItem("def.a0000001", SLOT0, new CollectItem("K2", BigDecimal.TEN, null))).isTrue();
        assertThat(writer.tryStart("def.a0000001", SLOT0, T0)).isFalse();
    }

    // ── 실패 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("실패는 FAIL 과 메시지로 기록하고 값은 넣지 않는다 — 한 정의의 실패가 다른 정의를 막지 않는다")
    void failureRecordedAndOthersContinue() {
        def("def.a0000001", EVERY_10, "{\"kind\":\"sql\",\"sql\":\"SELECT BAD\",\"valueField\":\"CNT\"}", "Y");
        def("def.b0000001", EVERY_10);
        when(queryRunner.runCollect("SELECT BAD", 50)).thenThrow(new BusinessException(com.dongkuk.dmes.mcm.common.exception.ErrorCode.BUSINESS_ERROR, "위젯 데이터를 불러오지 못했습니다"));

        assertThat(collector.tick()).isEqualTo(2);

        WidgetCollectRun failed = runs.findById(new WidgetCollectRunId("def.a0000001", SLOT0)).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("FAIL");
        assertThat(failed.getMsg()).isEqualTo("위젯 데이터를 불러오지 못했습니다");
        assertThat(failed.getItemCnt()).isZero();
        assertThat(failed.getEndedAt()).isNotNull();
        assertThat(data.findByWidgetIdAndSlotOrderByItemKeyAsc("def.a0000001", SLOT0)).isEmpty();
        assertThat(runs.findById(new WidgetCollectRunId("def.b0000001", SLOT0)).orElseThrow().getStatus()).isEqualTo("OK");
    }

    @Test
    @DisplayName("예상 밖 예외는 종류만 FAIL 메시지에 적는다 — 원인 메시지(주소·인증값)는 넣지 않는다")
    void unexpectedExceptionMessageDoesNotLeak() {
        def("def.a0000001", EVERY_10);
        when(queryRunner.runCollect(anyString(), anyInt())).thenThrow(new IllegalStateException("jdbc:oracle://secret-host/db password=hunter2"));
        assertThat(collector.tick()).isEqualTo(1);
        WidgetCollectRun run = runs.findById(new WidgetCollectRunId("def.a0000001", SLOT0)).orElseThrow();
        assertThat(run.getStatus()).isEqualTo("FAIL");
        assertThat(run.getMsg()).isEqualTo("수집 중 오류가 발생했습니다: IllegalStateException").doesNotContain("hunter2");
    }

    @Test
    @DisplayName("수집된 값이 하나도 없으면 FAIL, 메시지는 200자로 자른다")
    void noItemsIsFailureAndMessageTruncated() {
        def("def.a0000001", EVERY_10);
        when(queryRunner.runCollect(anyString(), anyInt())).thenReturn(new WidgetQueryResult(List.of("LINE", "CNT"), List.of(), false));
        collector.tick();
        WidgetCollectRun run = runs.findById(new WidgetCollectRunId("def.a0000001", SLOT0)).orElseThrow();
        assertThat(run.getStatus()).isEqualTo("FAIL");
        assertThat(run.getMsg()).isEqualTo("수집된 값이 없습니다.");

        writer.finish("def.a0000001", SLOT0, "FAIL", 0, "가".repeat(500), T0);
        assertThat(runs.findById(new WidgetCollectRunId("def.a0000001", SLOT0)).orElseThrow().getMsg()).hasSize(200);
    }

    @Test
    @DisplayName("http 원천은 허용 호스트가 없으면 실행 때 FAIL 로 기록한다(저장 때 못 거른 설정도 수집기가 거절)")
    void httpWithoutAllowedHostFails() {
        def("def.h0000001", EVERY_10, "{\"kind\":\"http\",\"url\":\"https://api.example.com/q\",\"items\":[{\"key\":\"a\",\"path\":\"v\"}]}", "Y");
        collector.tick();
        WidgetCollectRun run = runs.findById(new WidgetCollectRunId("def.h0000001", SLOT0)).orElseThrow();
        assertThat(run.getStatus()).isEqualTo("FAIL");
        assertThat(run.getMsg()).isEqualTo("허용 목록에 없는 호스트라 수집하지 않습니다.");
    }

    @Test
    @DisplayName("환율 원천은 dmes.widget.ext.enabled=false 면 FAIL 로 기록한다")
    void exchangeDisabledFails() {
        WidgetExtProperties ext = new WidgetExtProperties();
        ext.setEnabled(false);
        WidgetCollector c = new WidgetCollector(defRepository, writer, properties, new SqlCollectSource(queryRunner),
                new HttpCollectSource(properties), new ExchangeCollectSource(ext, new com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider(ext),
                        new com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider(ext)), clock);
        def("def.e0000001", EVERY_10, "{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}", "Y");
        assertThat(c.tick()).isEqualTo(1);
        assertThat(runs.findById(new WidgetCollectRunId("def.e0000001", SLOT0)).orElseThrow().getStatus()).isEqualTo("FAIL");
    }

    @Test
    @DisplayName("환율 원천: 일요일 회차는 직전 영업일(금요일) 값으로 OK — 7일 안에 값이 하나도 없으면 FAIL")
    void exchangeWeekendUsesLatestBusinessDay() {
        List<com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint> points = new ArrayList<>(List.of(
                new com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint(java.time.LocalDate.of(2026, 10, 2), "USD", new BigDecimal("1380.5")),
                new com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint(java.time.LocalDate.of(2026, 10, 1), "USD", new BigDecimal("1370"))));
        com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider fake = new com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider() {
            @Override
            public String id() {
                return "frankfurter";
            }

            @Override
            public List<com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint> fetch(String base, List<String> symbols, java.time.LocalDate from, java.time.LocalDate to) {
                return points;
            }
        };
        WidgetCollector c = new WidgetCollector(defRepository, writer, properties, new SqlCollectSource(queryRunner),
                new HttpCollectSource(properties), new ExchangeCollectSource(new WidgetExtProperties(), fake, fake), clock);
        def("def.e0000001", "{\"mode\":\"interval\",\"everyMin\":60}", "{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}", "Y");
        clock.set(Instant.parse("2026-10-04T03:00:05Z")); // 서울 일요일 12:00

        assertThat(c.tick()).isEqualTo(1);

        WidgetCollectRun run = runs.findById(new WidgetCollectRunId("def.e0000001", "202610041200")).orElseThrow();
        assertThat(run.getStatus()).isEqualTo("OK");
        assertThat(run.getItemCnt()).isEqualTo(1);
        assertThat(data.findByWidgetIdAndSlotOrderByItemKeyAsc("def.e0000001", "202610041200").get(0).getValueNum()).isEqualByComparingTo("1380.5");

        points.clear();
        clock.set(Instant.parse("2026-10-04T04:00:05Z")); // 13:00
        assertThat(c.tick()).isEqualTo(1);
        WidgetCollectRun failed = runs.findById(new WidgetCollectRunId("def.e0000001", "202610041300")).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("FAIL");
        assertThat(failed.getMsg()).isEqualTo("수집된 값이 없습니다.");
    }

    // ── 꺼짐 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("dmes.widget.collect.enabled=false 면 수집도 보관 삭제도 하지 않는다")
    void disabledDoesNothing() {
        def("def.a0000001", EVERY_10);
        runs.saveAndFlush(WidgetCollectRun.start("def.old00001", "202601010000", T0));
        properties.setEnabled(false);
        assertThat(collector.tick()).isZero();
        assertThat(collector.purge()).isZero();
        verify(queryRunner, never()).runCollect(anyString(), anyInt());
        verify(defRepository, never()).findBySrcTpAndTypeIdOrderByWidgetIdAsc(anyString(), anyString());
        assertThat(runs.count()).isEqualTo(1);
    }

    // ── 보관 삭제 ────────────────────────────────────────────────────

    @Test
    @DisplayName("보관 삭제: 오늘-90일 0시 이전 SLOT 의 DATA·RUN 을 지운다 — 경계 직전은 삭제, 경계는 보관, 지워진 정의의 행도 정리")
    void purgeOlderThan90Days() {
        // 오늘 2026-10-05 → 기준 2026-07-07 00:00
        for (String slot : List.of("202607062359", "202607070000", "202610050010")) {
            runs.saveAndFlush(WidgetCollectRun.start("def.a0000001", slot, T0));
            data.saveAndFlush(new WidgetCollectData("def.a0000001", slot, "K", BigDecimal.ONE, null));
        }
        runs.saveAndFlush(WidgetCollectRun.start("def.deleted01", "202601010000", T0));
        data.saveAndFlush(new WidgetCollectData("def.deleted01", "202601010000", "K", BigDecimal.ONE, null));

        assertThat(collector.purge()).isEqualTo(4);

        assertThat(runs.findAll()).extracting(WidgetCollectRun::getSlot).containsExactlyInAnyOrder("202607070000", "202610050010");
        assertThat(data.findAll()).extracting(WidgetCollectData::getSlot).containsExactlyInAnyOrder("202607070000", "202610050010");
    }

    @Test
    @DisplayName("스케줄: 수집은 매분 0초, 삭제는 매일 03:30, 둘 다 Asia/Seoul")
    void scheduledAnnotations() throws Exception {
        Scheduled tick = WidgetCollector.class.getMethod("scheduledTick").getAnnotation(Scheduled.class);
        assertThat(tick.cron()).isEqualTo("0 * * * * *");
        assertThat(tick.zone()).isEqualTo("Asia/Seoul");
        Method purge = WidgetCollector.class.getMethod("scheduledPurge");
        assertThat(purge.getAnnotation(Scheduled.class).cron()).isEqualTo("0 30 3 * * *");
        assertThat(purge.getAnnotation(Scheduled.class).zone()).isEqualTo("Asia/Seoul");
        // 스케줄 진입점은 예외를 삼킨다
        when(defRepository.findBySrcTpAndTypeIdOrderByWidgetIdAsc("D", "collect")).thenThrow(new IllegalStateException("db down"));
        collector.scheduledTick();
        reset(defRepository);
    }

    // ── 읽기 ─────────────────────────────────────────────────────────

    private WidgetCollectReader reader() {
        return new WidgetCollectReader(defRepository, data, runs, clock);
    }

    private static final Instant NOW = Instant.parse("2026-10-05T03:00:00Z"); // 서울 12:00

    private void put(String id, String slot, String key, String num, String txt) {
        data.saveAndFlush(new WidgetCollectData(id, slot, key, num == null ? null : new BigDecimal(num), txt));
    }

    @Test
    @DisplayName("읽기 응답 모양과 순서 — columns·rows(SLOT 오름차순→ITEM_KEY 오름차순)·truncated·lastRun, show.days 일 안의 값만")
    void readerShapeOrderAndWindow() {
        clock.set(NOW);
        WidgetDef d = def("def.r0000001", EVERY_10);
        d.setConfigJson(d.getConfigJson().replace("}}", "},\"show\":{\"days\":2}}")); // 2일: 10-03 12:00 부터
        put("def.r0000001", "202610031159", "B", "1", null);      // 창 밖
        put("def.r0000001", "202610031200", "B", "2.50000000", null);
        put("def.r0000001", "202610031200", "A", null, "RUN");
        put("def.r0000001", "202610050900", "A", "12", null);
        put("def.r0000001", "202610050900", "B", "100", null);
        put("def.other0001", "202610050900", "A", "9", null);     // 다른 정의
        writer.tryStart("def.r0000001", "202610050900", T0);
        writer.finish("def.r0000001", "202610050900", "FAIL", 0, "원천 실패", T0);
        runs.saveAndFlush(WidgetCollectRun.start("def.r0000001", "202610031200", T0));

        Map<String, Object> result = reader().readIfCollect("def.r0000001").orElseThrow();

        assertThat(result.keySet()).containsExactly("columns", "rows", "truncated", "lastRun");
        assertThat(result.get("columns")).isEqualTo(List.of("COLLECTED_AT", "ITEM_KEY", "VALUE"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("rows");
        assertThat(rows).extracting(r -> r.get("COLLECTED_AT") + "|" + r.get("ITEM_KEY") + "|" + r.get("VALUE")).containsExactly(
                "2026-10-03T12:00:00|A|RUN", "2026-10-03T12:00:00|B|2.5", "2026-10-05T09:00:00|A|12", "2026-10-05T09:00:00|B|100");
        assertThat(rows.get(1).get("VALUE")).isInstanceOf(BigDecimal.class);
        assertThat(rows.get(0).keySet()).containsExactly("COLLECTED_AT", "ITEM_KEY", "VALUE");
        assertThat(result.get("truncated")).isEqualTo(false);
        assertThat(result.get("lastRun")).isEqualTo(Map.of("at", "2026-10-05T09:00:00", "status", "FAIL", "message", "원천 실패"));
    }

    @Test
    @DisplayName("수집된 값이 없으면 rows 는 빈 배열·lastRun 은 null, RUN 만 있으면 lastRun 에 RUN(메시지 없음)")
    void readerEmpty() {
        clock.set(NOW);
        def("def.r0000001", EVERY_10);
        Map<String, Object> empty = reader().readIfCollect("def.r0000001").orElseThrow();
        assertThat(empty.get("rows")).isEqualTo(List.of());
        assertThat(empty.get("truncated")).isEqualTo(false);
        assertThat(empty).containsKey("lastRun");
        assertThat(empty.get("lastRun")).isNull();

        runs.saveAndFlush(WidgetCollectRun.start("def.r0000001", "202610051155", T0));
        assertThat(reader().readIfCollect("def.r0000001").orElseThrow().get("lastRun"))
                .isEqualTo(Map.of("at", "2026-10-05T11:55:00", "status", "RUN"));
    }

    @Test
    @DisplayName("500행을 넘으면 가장 오래된 행부터 버리고 truncated=true — 남은 500행은 SLOT·항목 오름차순")
    void readerCapsAt500KeepingNewest() {
        clock.set(NOW);
        def("def.r0000001", EVERY_10);
        List<WidgetCollectData> all = new ArrayList<>();
        for (int slot = 0; slot < 200; slot++) { // 서울 10-05 00:00 부터 5분 간격 200 슬롯 x 3 항목 = 600행
            String s = String.format("20261005%02d%02d", (slot * 5) / 60, (slot * 5) % 60);
            for (String key : List.of("C", "A", "B")) all.add(new WidgetCollectData("def.r0000001", s, key, BigDecimal.valueOf(slot), null));
        }
        data.saveAllAndFlush(all);

        Map<String, Object> result = reader().readIfCollect("def.r0000001").orElseThrow();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("rows");
        assertThat(rows).hasSize(500);
        assertThat(result.get("truncated")).isEqualTo(true);
        assertThat(rows.get(499).get("COLLECTED_AT")).isEqualTo("2026-10-05T16:35:00"); // 마지막 슬롯(199 번)의 마지막 항목
        assertThat(rows.get(499).get("ITEM_KEY")).isEqualTo("C");
        // 600-500 = 100 행(= 33 슬롯 + 1 행) 이 앞에서 버려져 첫 행은 34 번째 슬롯의 B 부터(…A 는 버려짐)
        assertThat(rows.get(0).get("ITEM_KEY")).isEqualTo("B");
        assertThat(rows.get(0).get("COLLECTED_AT")).isEqualTo("2026-10-05T02:45:00");
        for (int i = 1; i < rows.size(); i++) {
            String prev = rows.get(i - 1).get("COLLECTED_AT") + "|" + rows.get(i - 1).get("ITEM_KEY");
            String cur = rows.get(i).get("COLLECTED_AT") + "|" + rows.get(i).get("ITEM_KEY");
            assertThat(prev.compareTo(cur)).isLessThan(0);
        }
    }

    @Test
    @DisplayName("collect 정의가 아니거나 없으면 빈 값(기존 쿼리 경로로), 사용 중지는 기존과 같은 문구로 거절, 설정이 깨지면 고정 문구")
    void readerRouting() {
        clock.set(NOW);
        WidgetDef query = def("def.q0000001", EVERY_10);
        query.setTypeId("query-table");
        assertThat(reader().readIfCollect("def.q0000001")).isEmpty();
        when(defRepository.findById("def.none0001")).thenReturn(Optional.empty());
        assertThat(reader().readIfCollect("def.none0001")).isEmpty();
        WidgetDef code = def("home.notice", EVERY_10);
        code.setSrcTp("C");
        assertThat(reader().readIfCollect("home.notice")).isEmpty();

        def("def.off00001", EVERY_10, "{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}", "N");
        assertThatThrownBy(() -> reader().readIfCollect("def.off00001")).isInstanceOf(BusinessException.class).hasMessage("사용 중지된 위젯입니다");

        WidgetDef broken = def("def.bad00001", EVERY_10);
        broken.setConfigJson("{\"schedule\":{}}");
        assertThatThrownBy(() -> reader().readIfCollect("def.bad00001")).isInstanceOf(BusinessException.class).hasMessage("위젯 데이터를 불러오지 못했습니다");
    }

    // ── 시계 ─────────────────────────────────────────────────────────

    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void set(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
