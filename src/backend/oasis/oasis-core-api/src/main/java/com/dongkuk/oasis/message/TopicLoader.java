package com.dongkuk.oasis.message;

/**
 * Topic을 가져온다.
 */
public interface TopicLoader {
    /**
     * @param topicId 토픽 식별자
     * @return 토픽
     */
    Topic topic(String topicId);
}
