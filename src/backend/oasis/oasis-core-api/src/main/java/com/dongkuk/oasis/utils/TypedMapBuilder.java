package com.dongkuk.oasis.utils;

import com.dongkuk.oasis.TypedObject;

import java.util.HashMap;
import java.util.Map;

/**
 * 편리하게 {@link com.dongkuk.oasis.TypedObject} 맵을 생성해주는 편의 클래스.
 *
 * @author Jeongjin Kim
 * @since 2022-04-21
 */
public class TypedMapBuilder {
    private final Map<String, TypedObject> map = new HashMap<>();

    /**
     * 엔트리를 추가한다.
     *
     * @param key   키
     * @param value 값
     * @return MapBuilder
     */
    public TypedMapBuilder addEntity(String key, TypedObject value) {
        map.put(key, value);
        return this;
    }

    /**
     * 엔트리를 추가한다.
     *
     * @param key   키
     * @param value 값
     * @return MapBuilder
     */
    public TypedMapBuilder addEntity(String key, Object value) {
        if (!(value instanceof TypedObject))
            map.put(key, new TypedObject(value));
        return this;
    }

    /**
     * 최종 맵을 반환한다.
     *
     * @return 맵
     */
    public Map<String, TypedObject> build() {
        return map;
    }
}
