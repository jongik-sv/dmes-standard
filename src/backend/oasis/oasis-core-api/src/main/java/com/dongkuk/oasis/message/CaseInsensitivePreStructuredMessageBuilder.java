package com.dongkuk.oasis.message;

import java.util.Map;

/**
 * 메시지의 이름을 케이스와 무관하게 연결하는 메시지인 {@link PreStructuredMessage}를
 * 만드는 인터페이스이다.
 */
public class CaseInsensitivePreStructuredMessageBuilder implements PreStructuredMessageBuilder {
    @Override
    public PreStructuredMessage build(Topic topic, TopicStructure topicStructure, Map<String, Object> param) {
        return new CaseInsensitivePreStructuredMessage(topic, topicStructure, param);
    }
}
