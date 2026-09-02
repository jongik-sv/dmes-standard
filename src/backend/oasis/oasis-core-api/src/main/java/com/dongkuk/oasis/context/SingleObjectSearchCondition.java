package com.dongkuk.oasis.context;

/**
 * @author Jeongjin Kim
 * @since 2021-08-20
 */
public class SingleObjectSearchCondition implements ObjectSearchCondition {
    private final String name;
    private final Class<?> aClass;

    /**
     * @param name 이름
     */
    public SingleObjectSearchCondition(String name) {
        this.name = name;
        this.aClass = null;
    }

    /**
     * @param aClass 타입
     */
    public SingleObjectSearchCondition(Class<?> aClass) {
        this.aClass = aClass;
        this.name = null;
    }

    @Override
    public String name() {
        return name;
    }

    @Override
    public Class<?> classType() {
        return aClass;
    }
}
