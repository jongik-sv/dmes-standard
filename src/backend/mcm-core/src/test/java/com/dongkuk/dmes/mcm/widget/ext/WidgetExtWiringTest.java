package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;

import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtExchangeRequest;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtWeatherRequest;
import com.dongkuk.dmes.mcm.widget.ext.repository.ExchangeRateRepository;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * 빈 연결 확인 — mcm 런처처럼 {@code widget.ext} 패키지를 스캔해 설정 바인딩(dmes.widget.ext.*)·생성자 선택·저장소가
 * 함께 뜨는지, OASIS 진입점이 실제 DB(Oracle 시험 PDB)로 끝까지 도는지 본다. 외부 호출은 enabled=false 로 막는다(실제 네트워크 금지).
 * 환율 허용 목록은 실제 정의 표(TB_MCM_WIDGET_DEF)의 exchange 정의로 판정한다.
 */
@SpringJUnitConfig(WidgetExtWiringTest.Config.class)
@TestPropertySource(properties = {
        "dmes.widget.ext.enabled=false",
        "dmes.widget.ext.exchange.provider=koreaexim",
        "dmes.widget.ext.exchange.koreaexim-key=K",
        "dmes.widget.ext.weather.base-url=https://wx.test/forecast"
})
class WidgetExtWiringTest {

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = {ExchangeRateRepository.class, WidgetDefRepository.class})
    @ComponentScan(basePackageClasses = WidgetExtService.class,
            excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*Test.*"))
    static class Config {

        @Bean
        DataSource dataSource() {
            return McmCoreOraTestDb.appDataSource("widget-ext-wiring");
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.widget.ext.entity", "com.dongkuk.dmes.mcm.widget.def.entity");
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
            return new JpaTransactionManager(entityManagerFactory);
        }

        @Bean
        SecurityIdentity securityIdentity() {
            SecurityIdentity identity = mock(SecurityIdentity.class);
            when(identity.currentUserId()).thenReturn("userA");
            return identity;
        }
    }

    @Autowired WidgetExtProperties properties;
    @Autowired WidgetExtService service;
    @Autowired ExchangeRateWriter writer;
    @Autowired WidgetDefRepository defRepository;
    @Autowired ApplicationEventPublisher events;
    @Autowired ExchangeRateRepository rateRepository;

    @BeforeEach
    void clean() {
        rateRepository.deleteAllInBatch();
        defRepository.deleteAllInBatch();
    }

    @Test
    @DisplayName("dmes.widget.ext.* 가 바인딩되고 widgetExtService 가 DB 값만으로 환율·날씨를 돌려준다")
    void wiresAndServesFromDbWhenDisabled() {
        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.getExchange().getProvider()).isEqualTo("koreaexim");
        assertThat(properties.getExchange().getKoreaeximKey()).isEqualTo("K");
        assertThat(properties.getExchange().getFrankfurterBaseUrl()).isEqualTo("https://api.frankfurter.dev/v1");
        assertThat(properties.getWeather().getBaseUrl()).isEqualTo("https://wx.test/forecast");

        WidgetExtExchangeRequest req = new WidgetExtExchangeRequest();
        req.setSymbols("USD");
        req.setDays(7);
        assertThatThrownBy(() -> service.exchange(req)) // 환율 정의가 없으면 허용 목록이 비어 있다
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
        WidgetDef fx = new WidgetDef();
        fx.setWidgetId("def.fxwiring");
        fx.setSrcTp(WidgetDef.SRC_DEF);
        fx.setTypeId("exchange");
        fx.setTitle("환율");
        fx.setUseYn("Y");
        fx.setConfigJson("{\"base\":\"KRW\",\"currencies\":[\"USD\",\"EUR\"],\"days\":30}");
        defRepository.save(fx);
        events.publishEvent(new WidgetDefSavedEvent("def.fxwiring")); // 위젯관리 저장이 내는 이벤트 — 허용 목록 캐시를 비운다
        WidgetExtExchangeRequest other = new WidgetExtExchangeRequest();
        other.setSymbols("GBP");
        other.setDays(7);
        assertThatThrownBy(() -> service.exchange(other)) // 정의에 없는 통화는 거절
                .isInstanceOf(BusinessException.class).hasMessage(ExchangeAllowList.MSG_NOT_ALLOWED);
        assertThat(service.exchange(req)).containsEntry("disabled", true);

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        writer.upsert("KRW", "frankfurter", List.of(
                new ExchangeRatePoint(today.minusDays(1), "USD", new BigDecimal("1380")),
                new ExchangeRatePoint(today, "USD", new BigDecimal("1382.5"))));
        Map<String, Object> filled = service.exchange(req);
        assertThat(filled).doesNotContainKey("disabled");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> latest = (List<Map<String, Object>>) filled.get("latest");
        assertThat(latest).singleElement().satisfies(l -> {
            assertThat(l).containsEntry("cur", "USD").containsEntry("rate", 1382.5).containsEntry("diff", 2.5);
        });

        WidgetExtWeatherRequest w = new WidgetExtWeatherRequest();
        w.setLat(new BigDecimal("37.5665"));
        w.setLon(new BigDecimal("126.978"));
        assertThat(service.weather(w)).containsEntry("disabled", true);
    }
}
