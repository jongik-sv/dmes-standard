package com.dongkuk.oasis.cache;

/**
 * @param <K> key
 * @param <V> value
 * @author Jeongjin Kim
 * @since 2021-09-15
 */
public interface CacheService<K, V> {
    /**
     * 캐시된 오브젝트를 반환한다. 오브젝트가 없으면 {@code null} 을 반환한다.
     *
     * @param key not null
     * @return 캐시된 오브젝트, 없으면 {@code null}
     */
    V getObject(K key);

    /**
     * 캐시한다.
     *
     * @param key   not null
     * @param value 캐시할 오브젝트
     */
    void cache(K key, V value);

    /**
     * 캐시되어 있는 오브젝트를 삭제한다.
     */
    void evict();
}
