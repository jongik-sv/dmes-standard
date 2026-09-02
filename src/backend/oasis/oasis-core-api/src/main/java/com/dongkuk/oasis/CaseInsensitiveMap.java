package com.dongkuk.oasis;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * {@link Map#get}을 할 때 {@code Key}의 대소문자 구분을 하지 않고 반환하는 {@link Map}이다.
 * <p>
 * {@code Key}는 {@link String}타입이다.
 *
 * @param <V> 값 타입
 */
public class CaseInsensitiveMap<V> implements Map<String, V> {
    private final Map<String, V> data;
    private final Map<String, String> keyMap = new HashMap<>();

    /**
     * @param data 초기화 데이터
     */
    public CaseInsensitiveMap(Map<String, V> data) {
        this.data = new HashMap<>(data);
        for (String s : data.keySet()) {
            addKeyMapping(s);
        }
    }

    /**
     * 맵 초기화.
     */
    public CaseInsensitiveMap() {
        this.data = new HashMap<>();
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
        return data.containsKey(getMappedKey(key));
    }

    private String getMappedKey(Object key) {
        return keyMap.get(upperCaseKey(key));
    }

    private String upperCaseKey(Object key) {
        return ((String) key).toUpperCase();
    }

    @Override
    public boolean containsValue(Object value) {
        return data.containsValue(value);
    }

    @Override
    public V get(Object key) {
        return data.get(getMappedKey(key));
    }

    @Override
    public V put(String key, V value) {
        if (containsKey(key)) {
            V v = get(key);
            remove(key);
            addKeyMapping(key);
            data.put(key, value);
            return v;
        } else {
            addKeyMapping(key);
            return data.put(key, value);
        }
    }

    private void addKeyMapping(String key) {
        keyMap.put(key.toUpperCase(), key);
    }

    @Override
    public V remove(Object key) {
        V remove = data.remove(getMappedKey(key));
        keyMap.remove(upperCaseKey(key));
        return remove;
    }

    @Override
    public void putAll(Map<? extends String, ? extends V> m) {
        this.data.putAll(m);
        for (String key : m.keySet()) {
            addKeyMapping(key);
        }
    }

    @Override
    public void clear() {
        data.clear();
        keyMap.clear();
    }

    @Override
    public Set<String> keySet() {
        return data.keySet();
    }

    @Override
    public Collection<V> values() {
        return data.values();
    }

    @Override
    public Set<Entry<String, V>> entrySet() {
        return data.entrySet();
    }
}
