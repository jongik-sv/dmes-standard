package com.dongkuk.oasis.message;

/**
 * 메시지 요소를 대표한다.
 */
public final class PreStructuredMessageElement {
    private final String name;
    private final Object value;
    private final TopicStructureElementType topicStructureElementType;
    private final boolean isBound;

    /**
     * @param name               이름
     * @param value              값
     * @param topicStructureElementType 메시지 타입
     * @param isBound            값 연결 여부
     */
    public PreStructuredMessageElement(String name,
                                       Object value,
                                       TopicStructureElementType topicStructureElementType,
                                       boolean isBound) {
        this.name = name;
        this.value = value;
        this.topicStructureElementType = topicStructureElementType;
        this.isBound = isBound;
    }

    /**
     * @return 이름
     */
    public String getName() {
        return name;
    }

    /**
     * @return 값
     */
    public Object getValue() {
        return value;
    }

    /**
     * @return 메시지 요소 타입
     */
    public TopicStructureElementType topicStructureElementType() {
        return topicStructureElementType;
    }

    @Override
    public String toString() {
        return "MessageElement{" +
                "name='" + name + '\'' +
                ", value=" + value +
                ", messageElementType=" + topicStructureElementType +
                '}';
    }

    /**
     * @return 값 연결 여부
     */
    public boolean isBound() {
        return isBound;
    }
}
