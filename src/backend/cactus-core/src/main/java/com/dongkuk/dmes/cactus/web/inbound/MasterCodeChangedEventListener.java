package com.dongkuk.dmes.cactus.web.inbound;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.event.EventListener;

/**
 * {@link MasterCodeChangedEvent} 구독 리스너 — Caffeine 캐시 evict.
 *
 * <p>그룹 단위 evict 가 가장 흔한 케이스. 키가 {@code "{groupCd}:{group_or_underscore}"}
 * 형식이라 그룹 단위 정밀 evict 가 어렵기 때문에, **단순히 전체 캐시 비우기**로 처리한다.
 * 마스터 코드 변경은 드물어서 (월 단위) cold cache 비용 무시 가능.
 *
 * <p>{@link MasterCodeCacheAutoConfiguration} 이 등록한 {@link CacheManager} 빈을 주입받아
 * {@code mcmMasterCodeLov} 캐시에 직접 접근.
 */
public class MasterCodeChangedEventListener {

    private static final Logger log = LoggerFactory.getLogger(MasterCodeChangedEventListener.class);

    private final CacheManager cacheManager;

    public MasterCodeChangedEventListener(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @EventListener
    public void onMasterCodeChanged(MasterCodeChangedEvent event) {
        Cache cache = cacheManager.getCache(MasterCodeCacheAutoConfiguration.CACHE_NAME);
        if (cache == null) {
            return;
        }
        cache.clear();
        log.info("[mcm.lov.cache] evicted (op={} group={} item={})",
                event.op(), event.groupCd(), event.itemCd());
    }
}
