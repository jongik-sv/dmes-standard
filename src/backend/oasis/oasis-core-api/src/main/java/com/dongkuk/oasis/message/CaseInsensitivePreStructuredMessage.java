package com.dongkuk.oasis.message;

import com.dongkuk.oasis.CaseInsensitiveMap;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.Type;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

class CaseInsensitivePreStructuredMessage implements PreStructuredMessage {
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(CaseInsensitivePreStructuredMessage.class);
    private final List<PreStructuredMessageElement> preStructuredMessageElements = new ArrayList<>();
    private final Topic topic;

    /**
     * @param topic          토픽
     * @param topicStructure 토픽 구조
     * @param param          매핑 대상 데이터
     */
    public CaseInsensitivePreStructuredMessage(Topic topic, TopicStructure topicStructure, Map<String, Object> param) {
        Iterable<TopicStructureElement> messageStructures = topicStructure.topicStructureElements();
        Map<String, Object> caseInsensitiveMap = new CaseInsensitiveMap<>(param);

        for (TopicStructureElement topicStructureElement : messageStructures) {
            String name = topicStructureElement.getName();
            Object object = caseInsensitiveMap.get(name);
            if (object == null) {
                this.preStructuredMessageElements.add(
                        new PreStructuredMessageElement(name,
                                null,
                                topicStructureElement.getMessageElementType(),
                                false));
            } else {
                TopicStructureElementType realObjectTopicStructureElementType = messageElementTypeOf(object.getClass());
                boolean isUnknownTypeObject = false;
                if (realObjectTopicStructureElementType == TopicStructureElementType.UNKNOWN) {
                    realObjectTopicStructureElementType = TopicStructureElementType.STRING;
                    isUnknownTypeObject = true;
                }

                if (!topicStructureElement.getMessageElementType().equals(realObjectTopicStructureElementType))
                    throw new RuntimeException(
                            String.format(
                                    "Message Structure Type is [%s], but real object type is [%s]"
                                    , topicStructureElement.getMessageElementType()
                                    , realObjectTopicStructureElementType));

                this.preStructuredMessageElements.add(new PreStructuredMessageElement(name,
                        isUnknownTypeObject ? object.toString() : object,
                        topicStructureElement.getMessageElementType(),
                        true));
            }
        }

        this.topic = topic;
        log.info("Created Message of [{}]", topic.topicId());
        for (PreStructuredMessageElement preStructuredMessageElement : this.preStructuredMessageElements) {
            log.info(preStructuredMessageElement.toString());
        }
    }

    private TopicStructureElementType messageElementTypeOf(Type type) {
        if (TypeUtils.isAssignable(String.class, type))
            return TopicStructureElementType.STRING;
        else if (TypeUtils.isAssignable(Number.class, type))
            return TopicStructureElementType.NUMBER;
        else if (TypeUtils.isAssignable(Boolean.class, type))
            return TopicStructureElementType.BOOLEAN;
        else if (TypeUtils.isAssignable(Instant.class, type))
            return TopicStructureElementType.TIMESTAMP;
        else if (TypeUtils.isAssignable(LocalDate.class, type))
            return TopicStructureElementType.DATE;
        else if (TypeUtils.isAssignable(LocalTime.class, type))
            return TopicStructureElementType.TIME;
        return TopicStructureElementType.UNKNOWN;
    }

    @Override
    public Topic topic() {
        return topic;
    }

    @Override
    public List<PreStructuredMessageElement> preStructuredMessageElements() {
        return this.preStructuredMessageElements;
    }
}
