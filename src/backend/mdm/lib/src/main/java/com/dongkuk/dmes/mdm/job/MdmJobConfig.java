package com.dongkuk.dmes.mdm.job;

import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * mdm 앱의 예약 작업 빈. 기동 때 {@code JobHandlerRegistrar} 가 {@link ScheduledJob} 빈을 처리기 목록에 올리고 기본 일정이 있으면
 * 작업(CODE)을 만든다.
 *
 * <p>mdm 앱은 mcm-core 를 {@code McmCoreAutoConfiguration} 으로만 들여와 {@code widget/ext} 의 빈이 스캔되지 않는다. 그래서 환율
 * 제공자 두 개와 설정 바인딩을 여기서 직접 올린다(mcm-core 코드는 바꾸지 않는다). 설정은 {@code dmes.widget.ext.*}.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(WidgetExtProperties.class)
public class MdmJobConfig {

    @Bean
    public FrankfurterProvider frankfurterProvider(WidgetExtProperties properties) {
        return new FrankfurterProvider(properties);
    }

    @Bean
    public KoreaEximProvider koreaEximProvider(WidgetExtProperties properties) {
        return new KoreaEximProvider(properties);
    }

    @Bean
    public ExchangeRateSyncService exchangeRateSyncService(JdbcTemplate jdbc, DataItemSaveCore saveCore,
                                                           PlatformTransactionManager transactionManager, Clock clock,
                                                           WidgetExtProperties properties, FrankfurterProvider frankfurter,
                                                           KoreaEximProvider koreaExim) {
        return new ExchangeRateSyncService(jdbc, saveCore, transactionManager, clock, properties, frankfurter, koreaExim);
    }

    /** 환율 마스터 동기화: 외부 환율을 마루 데이터 FX_RATE 에 반영한다. */
    @Bean
    public ScheduledJob mdmExchangeRateSync(ExchangeRateSyncService service) {
        return new ExchangeRateSyncJob(service);
    }
}
