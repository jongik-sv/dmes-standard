package com.dongkuk.oasis.message;

import com.dongkuk.oasis.TypedObject;

/**
 * 메시지를 만드는 인터페이스이다.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-12-28
 */
public interface MessageObjectMessageBuilder extends MessageBuilder {
    /**
     * 메시지를 만든다.
     *
     * @param topic  토픽
     * @param object 파라미터
     * @return 만들어진 메시지
     */
    MessageObjectMessage build(Topic topic, TypedObject object);
}
