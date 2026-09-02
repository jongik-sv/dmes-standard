package com.dongkuk.oasis.context;

/**
 * @author Jeongjin Kim
 * @since 2021-08-20
 */
public interface ObjectSearchCondition {
    /**
     * @return 등록한 이름
     */
    String name();

    /**
     * @return 등록한 타입
     */
    Class<?> classType();
}
