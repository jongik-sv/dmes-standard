package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;

import javax.annotation.Nonnull;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 게이트웨이, 서브 프로세스 등 Task Level 이상 데이터가 필요한 경우 불필요한 정보까지 사용자의 접근을 막기위해 제한적인 데이터 맵을 제공하여 사용하게 하기 위함.
 *
 * @author Jeongjin Kim
 * @since 2021-07-29
 */
public final class SubProcessResult implements Map<String, Object> {
    private final Map<String, TypedObject> data = new HashMap<>();

    /**
     * @param processContext processContext
     */
    public SubProcessResult(ProcessContext processContext) {
        for (Entry<String, TypedObject> entry : processContext.elementOutputs().entrySet()) {
            data.put(entry.getKey(), entry.getValue());
        }
    }

    @Override
    public int size() {
        return data.size();
    }

    @Override
    public boolean isEmpty() {
        return data.isEmpty();
    }

    @Override
    public boolean containsKey(Object key) {
        return data.containsKey(key);
    }

    @Override
    public boolean containsValue(Object value) {
        return data.containsValue(value);
    }

    @Override
    public Object get(Object key) {
        return data.get(key).getObject();
    }

    /**
     * @param key 가져올 값의 키
     * @return 타입을 포함한 값
     */
    public TypedObject getTypedObject(String key) {
        return data.get(key);
    }

    @Override
    public Object put(String key, Object value) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Object remove(Object key) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void putAll(@Nonnull Map<? extends String, ?> m) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void clear() {
        throw new UnsupportedOperationException();
    }

    @Override
    @Nonnull
    public Set<String> keySet() {
        return data.keySet();
    }

    @Override
    @Nonnull
    public Collection<Object> values() {
        return data.values().stream().map(TypedObject::getObject).collect(Collectors.toList());
    }

    @Override
    @Nonnull
    public Set<Entry<String, Object>> entrySet() {
        return data.entrySet().stream().map(entry ->
                new ContextAccessorEntry<String, Object>(entry.getKey(), entry.getValue()))
                .collect(Collectors.toSet());
    }

    static class ContextAccessorEntry<K, V> implements Entry<K, V> {
        private final K key;
        private V value;

        ContextAccessorEntry(K key, V value) {
            this.key = key;
            this.value = value;
        }

        @Override
        public K getKey() {
            return key;
        }

        @Override
        public V getValue() {
            return value;
        }

        @Override
        public V setValue(V value) {
            return this.value = value;
        }
    }
}
