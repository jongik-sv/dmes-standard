package com.dongkuk.oasis.context;

/**
 * @author Jeongjin Kim
 * @since 2021-08-20
 */
public class SingleObjectRegisterInfo implements ObjectRegisterInfo {
    private final String name;
    private final Class<?> aClass;
    private final ObjectSustainLevel objectSustainLevel;

    /**
     * @param name 이름
     * @param objectSustainLevel 오브젝트 유지 단계
     */
    public SingleObjectRegisterInfo(String name, ObjectSustainLevel objectSustainLevel) {
        this.name = name;
        this.aClass = null;
        this.objectSustainLevel = objectSustainLevel;
    }

    /**
     * @param aClass 타입
     * @param objectSustainLevel 오브젝트 유지 단계
     */
    public SingleObjectRegisterInfo(Class<?> aClass, ObjectSustainLevel objectSustainLevel) {
        this.aClass = aClass;
        this.name = null;
        this.objectSustainLevel = objectSustainLevel;
    }

    @Override
    public String name() {
        return name;
    }

    @Override
    public Class<?> classType() {
        return aClass;
    }

    @Override
    public ObjectSustainLevel sustainLevel() {
        return objectSustainLevel;
    }
}
