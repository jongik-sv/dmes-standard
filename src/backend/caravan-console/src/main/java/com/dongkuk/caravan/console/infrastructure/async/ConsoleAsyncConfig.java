package com.dongkuk.caravan.console.infrastructure.async;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * caravan-console 의 비동기 Executor 빈 정의.
 *
 * <p>caravan-console 원본 {@code AsyncConfig.dashboardExecutor} 의 caravan-console 이전체 — 빈 이름은
 * {@code consoleDashboardExecutor} 로 변경 (mcm 측 다른 빈과 충돌 회피).</p>
 *
 * <p>{@link com.dongkuk.caravan.console.dashboard.ConsoleDashboardService} 의 BIZ_SYSTEM 단위 병렬 집계용.</p>
 */
@Configuration
public class ConsoleAsyncConfig {

    @Bean("consoleDashboardExecutor")
    public Executor consoleDashboardExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(20);
        executor.setThreadNamePrefix("console-dashboard-");
        executor.initialize();
        return executor;
    }
}
