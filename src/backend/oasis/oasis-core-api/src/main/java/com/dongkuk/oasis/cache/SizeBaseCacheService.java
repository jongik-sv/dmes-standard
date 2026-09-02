package com.dongkuk.oasis.cache;

import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

/**
 * @param <K> key
 * @param <V> value
 * @author Jeongjin Kim
 * @since 2021-09-15
 */
public class SizeBaseCacheService<K, V> implements CacheService<K, V> {
    private final int size;

    private final Map<K, V> data;
    private final List<K> list;
    private final Object lock = new Object();

    /**
     * SizeBaseCacheService 를 초기화한다.
     *
     * @param size 캐시 크기
     */
    public SizeBaseCacheService(int size) {
        this.size = size;
        this.data = new HashMap<>(size);
        this.list = new LinkedList<>();
    }

    /**
     * SizeBaseCacheService 를 초기화한다.
     */
    public SizeBaseCacheService() {
        this(100);
    }

    @Override
    public V getObject(K key) {
        synchronized (lock) {
            list.remove(key);
            list.add(key);
        }
        return data.get(key);
    }

    @Override
    synchronized public void cache(K key, V value) {
        if (list.size() == size) {
            K keyToRemove = list.get(0);
            data.remove(keyToRemove);
            list.remove(0);
        }
        list.add(key);
        data.put(key, value);
    }

    @Override
    synchronized public void evict() {
        data.clear();
        list.clear();
    }
}
