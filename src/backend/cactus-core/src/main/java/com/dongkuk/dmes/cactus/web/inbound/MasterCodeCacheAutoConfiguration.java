package com.dongkuk.dmes.cactus.web.inbound;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

/**
 * 마스터 코드 LoV 캐시 자동 설정.
 *
 * <p>{@link DefaultMasterCodeProvider} 의 <code>findMasterCodeLov(code, group)</code> 결과를
 * Caffeine in-memory 캐시에 TTL 5분으로 적재한다. 마스터 코드는 변경 빈도가 낮으므로
 * 캐시 hit 률이 매우 높음. mcm 의 등록/수정 발생 시 {@link MasterCodeChangedEventListener}
 * 가 자동 evict 한다.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>Caffeine 클래스가 classpath 에 있음 (consumer 가 caffeine 의존성 보유)</li>
 *   <li>소비 모듈이 자체 {@link CacheManager} 빈을 등록하지 않음 (대체 가능)</li>
 * </ul>
 *
 * <p>분산 환경 (mpn/mqc/mpp 가 각자 별도 JVM) 에서는 각 프로세스가 자기 캐시를 가지며
 * TTL 5분으로 자연 만료. 즉시 일관성이 필요하면 {@link MasterCodeChangedEvent} 를
 * RabbitMQ/Kafka 브로드캐스트로 확장 (현재는 동일 프로세스 내 invalidate 만 지원).
 */
@Configuration
@ConditionalOnClass({Caffeine.class, CacheManager.class})
@EnableCaching
public class MasterCodeCacheAutoConfiguration {

    /** 캐시 이름 — {@link DefaultMasterCodeProvider} 의 {@code @Cacheable} 과 일치해야 함. */
    public static final String CACHE_NAME = "mcmMasterCodeLov";

    @Bean
    @ConditionalOnMissingBean(CacheManager.class)
    public CacheManager cactusMasterCodeCacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager(CACHE_NAME);
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .maximumSize(1_000));
        return manager;
    }

    /** {@link MasterCodeChangedEvent} 구독 → 캐시 evict. */
    @Bean
    public MasterCodeChangedEventListener cactusMasterCodeChangedEventListener(CacheManager cacheManager) {
        return new MasterCodeChangedEventListener(cacheManager);
    }
}
