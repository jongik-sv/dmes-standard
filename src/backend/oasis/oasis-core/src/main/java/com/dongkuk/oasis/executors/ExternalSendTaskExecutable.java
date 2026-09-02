package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.event.MessageSendEvent;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.message.*;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.ExternalSendTask;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2021-12-28
 */
final class ExternalSendTaskExecutable implements Executable {
    private final List<String> acceptablePropertyNames =
            Arrays.asList(INPUT_KEY, OUTPUT_KEY, INPUT_KEY_ONLY, MESSAGE_OBJECT, MESSAGE_OBJECT_SHORT_FORM);

    private final ExternalSendTask externalSendTask;

    /**
     * @param externalSendTask externalSendTask
     */
    public ExternalSendTaskExecutable(ExternalSendTask externalSendTask) {
        this.externalSendTask = externalSendTask;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Topic topic = topic(externalSendTask.getTopic(), executableContext);
        Property inputProperty = externalSendTask.getProperty(INPUT_KEY);
        Property messageObjectProperty = externalSendTask.getProperty(MESSAGE_OBJECT);
        if(messageObjectProperty == null)
            messageObjectProperty = externalSendTask.getProperty(MESSAGE_OBJECT_SHORT_FORM);

        Message message;
        if (messageObjectProperty != null) {
            message = buildMessageObjectMessage(messageObjectProperty, executableContext, topic);
        } else {
            message = buildPreStructuredMessage(externalSendTask.inputs(), inputProperty, executableContext, topic);
        }
        executableContext.raiseEvent(new MessageSendEvent(message));
        return new UnmodifiableExecutionResult(message);
    }

    private Message buildMessageObjectMessage(Property messageObjectProperty,
                                              ExecutableContext executableContext,
                                              Topic topic) {

        List<PropertyExpression> propertyExpressions = PropertyParser.parse(messageObjectProperty);
        if (propertyExpressions.size() > 1) {
            throw new PropertyException(
                    "The message object cannot be specified with more than one value separated by [,].");
        }

        PropertyExpression propertyExpression = propertyExpressions.get(0);

        String value = propertyExpression.getValue(String.class);
        if (propertyExpression.hasAlias()) {
            throw new PropertyException("Alias cannot be specified.");
        }

        TypedObject typedObject = executableContext.get(value);
        if (typedObject == null) {
            throw new PropertyException(
                    String.format("Message object [%s] does not exist in the context.", value)
            );
        }

        TypedObject accessedObject = PropertyUtil.access(typedObject, propertyExpression.getAccessors());

        MessageObjectMessageBuilder messageObjectMessageBuilder = resolveMessageObjectMessageBuilder(executableContext);
        return messageObjectMessageBuilder.build(topic, accessedObject);
    }

    private Message buildPreStructuredMessage(InputOutputContainer inputs,
                                              Property inputProperty,
                                              ExecutableContext executableContext,
                                              Topic topic) {
        Map<String, Object> param =
                new InputsAndContextFlatter().createParameter(inputProperty, inputs, executableContext);

        TopicStructure topicStructure = getTopicStructure(topic.topicId(), executableContext);
        PreStructuredMessageBuilder preStructuredMessageBuilder = resolvePreStructuredMessageBuilder(executableContext);
        return preStructuredMessageBuilder.build(topic, topicStructure, param);
    }

    private PreStructuredMessageBuilder resolvePreStructuredMessageBuilder(ExecutableContext executableContext) {
        PreStructuredMessageBuilder preStructuredMessageBuilder;

        List<TypedObject> typedObjects = executableContext.get(PreStructuredMessageBuilder.class);
        if (typedObjects.size() == 0) {
            preStructuredMessageBuilder = new CaseInsensitivePreStructuredMessageBuilder();
        } else if (typedObjects.size() > 1) {
            throw new RuntimeException("Too many message builders exist.");
        } else {
            preStructuredMessageBuilder = typedObjects.get(0).getObject(PreStructuredMessageBuilder.class);
        }
        return preStructuredMessageBuilder;
    }

    private MessageObjectMessageBuilder resolveMessageObjectMessageBuilder(ExecutableContext executableContext) {
        MessageObjectMessageBuilder messageObjectMessageBuilder;

        List<TypedObject> typedObjects = executableContext.get(MessageObjectMessageBuilder.class);
        if (typedObjects.size() == 0) {
            messageObjectMessageBuilder = new SerializedMessageObjectMessageBuilder();
        } else if (typedObjects.size() > 1) {
            throw new RuntimeException("Too many message builders exist.");
        } else {
            messageObjectMessageBuilder = typedObjects.get(0).getObject(MessageObjectMessageBuilder.class);
        }
        return messageObjectMessageBuilder;
    }

    private TopicStructure getTopicStructure(String topicId, ExecutableContext executableContext) {
        List<TypedObject> topicStructureLoaders = executableContext.get(TopicStructureLoader.class);
        if (topicStructureLoaders.size() == 0)
            throw new RuntimeException("No topic structure loaders exist.");
        else if (topicStructureLoaders.size() > 1)
            throw new RuntimeException("Too many topic structure loaders exist.");
        TopicStructureLoader topicStructureLoader = topicStructureLoaders.get(0).getObject(TopicStructureLoader.class);
        return topicStructureLoader.topicStructure(topicId);
    }

    private Topic topic(String topicId, ExecutableContext executableContext) {
        List<TypedObject> topicLoaders = executableContext.get(TopicLoader.class);
        if (topicLoaders.size() == 0)
            throw new RuntimeException("No topic loaders exist.");
        else if (topicLoaders.size() > 1)
            throw new RuntimeException("Too many topic loaders exist.");
        TopicLoader topicLoader = topicLoaders.get(0).getObject(TopicLoader.class);
        return topicLoader.topic(topicId);
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }

    static class SimplePreStructuredTopic implements PreStructuredTopic {
        private final Topic topic;
        private final TopicStructure topicStructure;

        SimplePreStructuredTopic(Topic topic, TopicStructure topicStructure) {
            this.topic = topic;
            this.topicStructure = topicStructure;
        }

        @Override
        public String topicId() {
            return topic.topicId();
        }

        @Override
        public List<TopicStructureElement> topicStructureElements() {
            return topicStructure.topicStructureElements();
        }
    }
}
