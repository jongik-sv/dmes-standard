package com.dongkuk.oasis.model;

import com.dongkuk.oasis.TypedObject;

import java.util.*;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-06-15
 */
public class InputOutputContainer {
    private final Map<String, TypedObject> data;
    private final List<String> dataOrder;

    /**
     * @param data 값
     */
    public InputOutputContainer(Map<String, TypedObject> data) {
        this(data, new ArrayList<>(data.keySet()));
    }

    /**
     * @param data 값
     * @param keyOrder data의 key {@code List} 입력 순서 유지
     */
    public InputOutputContainer(Map<String, TypedObject> data, List<String> keyOrder) {
        if (data == null)
            throw new IllegalArgumentException("data is null.");
        this.data = data;

        if (keyOrder == null)
            throw new IllegalArgumentException("keyOrder is null.");

        this.dataOrder = keyOrder;
    }

    /**
     * 빈 InputOutputContainer 정의.
     */
    public InputOutputContainer() {
        this(Collections.emptyMap(), Collections.emptyList());
    }

    /**
     * 요청한 이름을 가진 값을 반환한다.
     * <p>
     * 요청한 이름을 가진 데이타가 없으면 {@code null}을 반환한다.
     *
     * @param key 키
     * @param <T> 반환타입
     * @return 값
     */
    @SuppressWarnings("unchecked")
    public <T> T getValue(String key) {
        TypedObject object = data.get(key);
        if (object == null)
            return null;
        return (T) object.getObject();
    }

    /**
     * 요청한 이름을 가진 값을 반환한다.
     * <p>
     * 요청한 이름을 가진 데이타가 없으면 {@code null}을 반환한다.
     *
     * @param key 키
     * @return 값
     */
    public TypedObject get(String key) {
        return data.get(key);
    }

    /**
     * 데이터를 반환한다.
     *
     * @return 값
     */
    public Map<String, TypedObject> export() {
        return Collections.unmodifiableMap(data);
    }

    /**
     * 데이터를 {@code Map<String, Object>}로 변환하여 반환한다.
     *
     * @return 값
     */
    public Map<String, Object> exportValues() {
        return this.data.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));

    }

    /**
     * 데이터를 {@code Map<String, Object>}로 변환하여 반환한다.
     * <p>
     * 길이가 1이고 타입이 {@code Map} 이면 {@code Map} 전체 요소를 풀어서 반환한다.
     *
     * @param explodeMap 길이가 1인 {@code inputs}이고 {@link Map}이면 {@link Map}을 풀어서 반환할지 여부
     * @return 값
     */
    public Map<String, Object> exportValues(boolean explodeMap) {
        Map<String, Object> wholeInputs = this.exportValues();
        if (explodeMap) {
            // input 요소가 1개만 존재하고 그 요소가 Map 이면 요소의 Map 을 전체 파라미터로 사용한다.
            if (wholeInputs.size() == 1) {
                Map.Entry<String, Object> firstEntry = wholeInputs.entrySet().stream().findFirst().get();

                Object value = firstEntry.getValue();

                if (value instanceof Map) {
                    //noinspection unchecked
                    return new HashMap<>((Map<String, Object>) value);
                } else {
                    return wholeInputs;
                }
            } else {
                return wholeInputs;
            }
        }
        return wholeInputs;
    }

    /**
     * Input 입력값을 {@code List<InputOutputEntry>} 형태로 변환하여 반환한다.
     *
     * @return data 값
     */
    public List<InputOutputEntry> exportInOrder() {
        List<InputOutputEntry> list = new ArrayList<>();
        for (String key : dataOrder) {
            list.add(new InputOutputEntry(key, this.data.get(key)));
        }

        return list;
    }

    public static class InputOutputEntry {
        private final String key;
        private final TypedObject value;

        InputOutputEntry(String key, TypedObject value) {
            this.key = key;
            this.value = value;
        }

        /**
         * 입력의 key 값을 반환한다.
         *
         * @return key 값
         */
        public String getKey() {
            return key;
        }

        /**
         * 입력의 data 값을 반환한다.
         *
         * @return data 값
         */
        public TypedObject getValue() {
            return value;
        }
    }

    /**
     * 요청한 이름을 가진 값 존재여부를 반환한다.
     * <p>
     * 존재하면 {@code true}, 존재하지 않으면 {@code false}를 반환한다.
     *
     * @param key 키
     * @return 존재여부
     */
    public boolean hasValue(String key) {
        return data.containsKey(key);
    }

}
