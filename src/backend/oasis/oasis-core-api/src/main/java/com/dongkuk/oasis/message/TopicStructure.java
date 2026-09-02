package com.dongkuk.oasis.message;

import java.util.List;

/**
 * 토픽의 메시지 구조를 대표한다.
 */
public interface TopicStructure {
    /**
     * @return 메시지 구조
     */
    List<TopicStructureElement> topicStructureElements();
}
