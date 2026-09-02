package com.dongkuk.oasis.model;

/**
 * 속성 정보를 저장하는 값 클래스이다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-02
 */
public final class Property {
    private final String name;
    private final String value;

    /**
     * @param name  속성명
     * @param value 속성값
     */
    public Property(String name, String value) {
        this.name = name;
        this.value = value;
    }

    /**
     * @return 속성명
     */
    public String getName() {
        return name;
    }

    /**
     * @return 속성값
     */
    public String getValue() {
        return value;
    }
}
