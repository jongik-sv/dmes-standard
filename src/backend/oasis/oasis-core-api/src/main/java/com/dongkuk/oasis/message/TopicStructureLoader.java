package com.dongkuk.oasis.message;

/**
 * 메시지 토픽 구조를 가져온다.
 */
public interface TopicStructureLoader {
    /**
     * 토픽 구조를 반환한다.
     *
     * @param topicId 토픽 식별자
     * @return 토픽 구조
     */
    TopicStructure topicStructure(String topicId);
}
