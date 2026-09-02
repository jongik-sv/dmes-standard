package com.dongkuk.oasis.model;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-11
 */
public class PropertyContainer {
    private final Map<String, Property> properties = new HashMap<>();

    /**
     * 컨테이너에 {@link Property}를 추가한다.
     * <p>
     * 같은 이름으로된 {@link Property}가 있으면 예외가 발생한다.
     *
     * @param property 추가할 프로퍼티
     * @return itself
     */
    public PropertyContainer add(Property property) {
        if (properties.containsKey(property.getName()))
            throw new IllegalStateException(String.format("[%s] is a duplicate attribute", property.getName()));

        properties.put(property.getName(), property);
        return this;
    }

    /**
     * 프로퍼티 값을 반환한다.
     *
     * @return 프로퍼티 값
     */
    public Map<String, String> exportProperties() {
        Map<String, String> pro = new HashMap<>(properties.size());
        for (Property value : properties.values()) {
            pro.put(value.getName(), value.getValue());
        }
        return pro;
    }

    /**
     * 요청한 이름을 가진 프로퍼티를 반환한다.
     * <p>
     * 요청한 이름을 가진 속성이 없으면 {@code null}을 반환한다.
     *
     * @param name 프로퍼티 이름
     * @return 프로퍼티
     */
    public Property get(String name) {
        return properties.get(name);
    }

    /**
     * 요청한 이름을 가진 프로퍼티의 값을 반환한다.
     * <p>
     * 요청한 이름을 가진 속성이 없으면 {@code null}을 반환한다.
     *
     * @param name 프로퍼티 이름
     * @return 프로퍼티 값
     */
    public String getValue(String name) {
        Property property = properties.get(name);
        if (property != null)
            return property.getValue();
        else
            return null;
    }

    /**
     * 요청한 이름을 가진 프로퍼티가 존재여부를 반환한다.
     * <p>
     * 존재하면 {@code true}, 존재하지 않으면 {@code false}를 반환한다.
     *
     * @param name 프로퍼티 이름
     * @return 존재여부
     */
    public boolean hasProperty(String name) {
        return properties.containsKey(name);
    }
}
