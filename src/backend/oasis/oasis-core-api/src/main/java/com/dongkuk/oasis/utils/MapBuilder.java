package com.dongkuk.oasis.utils;

import java.util.HashMap;
import java.util.Map;

/**
 * 편리하게 맵을 생성해주는 편의 클래스.
 *
 * @param <K> 키 타입
 * @param <V> 값 타입
 * @author Jeongjin Kim
 * @since 2021-05-31
 */
public class MapBuilder<K, V> {
    private final Map<K, V> map = new HashMap<>();

    /**
     * 엔트리를 추가한다.
     *
     * @param key   키
     * @param value 값
     * @return MapBuilder
     */
    public MapBuilder<K, V> addEntity(K key, V value) {
        map.put(key, value);
        return this;
    }

    /**
     * 최종 맵을 반환한다.
     *
     * @return 맵
     */
    public Map<K, V> build() {
        return map;
    }
}
