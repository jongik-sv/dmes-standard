package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;

import java.lang.reflect.Type;
import java.util.List;

/**
 * 애플리케이션 컨텍스트 정보를 관리하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-05-12
 */
public interface ApplicationContext {
    /**
     * 요청한 개체를 반환한다.
     * <p>
     * 요청한 개체가 존재하지 않으면 {@code null}을 반환한다.
     *
     * @param key 개체키
     * @return 개체
     */
    TypedObject get(String key);

    /**
     * 요청한 타입 개체를 반환한다.
     * <p>
     * 요청한 개체가 존재하지 않으면 빈 리스트를 반환한다.
     *
     * @param type 개체키
     * @return 개체
     */
    List<TypedObject> get(Type type);
}
