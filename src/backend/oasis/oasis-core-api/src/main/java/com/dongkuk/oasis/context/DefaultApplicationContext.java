package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 간단한 맵 형태의 저장공간을 사용하여 애플리케이션 컨텍스트를 관리한다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class DefaultApplicationContext implements ApplicationContext {
    private final Map<String, TypedObject> data = new HashMap<>();

    /**
     * Application Context.
     *
     * @param data context data, nullable
     */
    public DefaultApplicationContext(Map<String, TypedObject> data) {
        putAll(data);
    }

    /**
     * 기본 생성자.
     */
    public DefaultApplicationContext() {
    }

    /**
     * @param data 데이타
     */
    public void putAll(Map<String, TypedObject> data) {
        if (data != null) {
            for (Map.Entry<String, TypedObject> stringObjectEntry : data.entrySet()) {
                this.data.put(stringObjectEntry.getKey(), stringObjectEntry.getValue());
            }
        }
    }

    @Override
    public TypedObject get(String key) {
        return data.get(key);
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        for (TypedObject value : data.values()) {
            if (TypeUtils.isAssignable(type, value.getType()))
                typedObjects.add(value);
        }
        return typedObjects;
    }

    /**
     * @param key   키
     * @param value 값
     */
    public void put(String key, TypedObject value) {
        this.data.put(key, value);
    }
}
