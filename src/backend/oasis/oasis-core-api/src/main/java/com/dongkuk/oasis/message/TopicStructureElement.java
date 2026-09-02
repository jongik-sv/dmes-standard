package com.dongkuk.oasis.message;

/**
 * 메시지 구조를 표현한다.
 */
public final class TopicStructureElement {
    private final String name;
    private final TopicStructureElementType topicStructureElementType;

    /**
     * @param name               이름
     * @param topicStructureElementType 메시지 요소 타입
     */
    public TopicStructureElement(String name, TopicStructureElementType topicStructureElementType) {
        this.name = name;
        this.topicStructureElementType = topicStructureElementType;
    }

    /**
     * @return 이름
     */
    public String getName() {
        return name;
    }

    /**
     * @return 메시지 타입
     */
    public TopicStructureElementType getMessageElementType() {
        return topicStructureElementType;
    }
}
