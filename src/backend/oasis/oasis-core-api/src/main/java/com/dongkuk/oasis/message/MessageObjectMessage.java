package com.dongkuk.oasis.message;

import java.lang.reflect.Type;

/**
 * 메시지가 담긴 객체를 담고있는 메시지.
 */
public interface MessageObjectMessage extends Message {
    /**
     * 메시지 오브젝트 반환.
     *
     * @return 메시지 오브젝트
     */
    Object object();

    /**
     * 오브젝트의 타입을 반환한다.
     *
     * @return 오브젝트의 타입
     */
    Type type();
}
