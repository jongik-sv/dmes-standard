package com.dongkuk.oasis.message;

import java.util.Map;

/**
 * 메시지를 만드는 인터페이스이다.
 * <p>
 * 메시지의 구조인 {@link Topic}과 연결될 내용을 가지고 있는 데이터를 이용한다.
 *
 * @author Jeongjin Kim
 * @since 2021-12-28
 */
public interface PreStructuredMessageBuilder extends MessageBuilder {
    /**
     * 메시지를 만든다.
     *
     * @param topic          토픽
     * @param topicStructure 토픽 구조
     * @param param          파라미터
     * @return 만들어진 메시지
     */
    PreStructuredMessage build(Topic topic, TopicStructure topicStructure, Map<String, Object> param);
}
