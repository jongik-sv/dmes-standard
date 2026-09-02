package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public interface WowContext {
    /**
     * 컨텍스트에서 데이터를 반환한다.
     * 만약 해당하는 키의 값이 없으면 {@code null}을 반환한다.
     *
     * @param key key
     * @return object
     */
    TypedObject get(String key);

    /**
     * 프로퍼티 값을 반환한다.
     * 이름에 해당하는 프로퍼티가 존재하지 않으면 {@code null}을 반환한다.
     *
     * @param name 프로프티명
     * @return 프로퍼티값
     */
    Object getPropertyValue(String name);
}
