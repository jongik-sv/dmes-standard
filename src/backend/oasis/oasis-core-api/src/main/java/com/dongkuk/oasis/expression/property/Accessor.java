package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.TypedObject;

/**
 * @param <T> 접근자 타입
 * @author Jeongjin Kim
 * @since 2021-07-01
 */
public interface Accessor<T> {
    /**
     * @return 접근자
     */
    T getAccessor();

    /**
     * @param object 접근하고자 하는 개체
     * @return 액세서로 접근한 개체
     */
    TypedObject access(TypedObject object);
}
