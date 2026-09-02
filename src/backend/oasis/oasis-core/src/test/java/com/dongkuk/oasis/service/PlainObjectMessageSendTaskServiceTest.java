package com.dongkuk.oasis.service;

import com.dongkuk.oasis.BpmnServiceLoaderForTest;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.message.*;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-06-04
 */
class PlainObjectMessageSendTaskServiceTest {
    @Test
    void service_having_MessageObjectSendTask_return_service_results_with_message_object() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter("/service/MessageSendTaskServiceTest/objectMessageSendTask.bpmn");
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        defaultApplicationContext.put("topicLoader", new TypedObject(topicLoader));
        defaultApplicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(defaultApplicationContext);

        ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);

        List<Message> messageObjectMessages = serviceResult.messages();
        Assertions.assertThat(messageObjectMessages).hasSize(1);
        Message message = messageObjectMessages.get(0);
        Assertions.assertThat(message.topic().topicId()).isEqualTo("m1");
        Object object = ((MessageObjectMessage) message).object();
        Assertions.assertThat(object).isNotNull();
    }

    @Test
    void given_object_list_and_loop_make_messages() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter("/service/MessageSendTaskServiceTest/listObjectMessageSendTask.bpmn");
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        defaultApplicationContext.put("topicLoader", new TypedObject(topicLoader));
        defaultApplicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(defaultApplicationContext);

        ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);

        List<Message> messageObjectMessages = serviceResult.messages();
        Assertions.assertThat(messageObjectMessages).hasSize(2);
        Message message = messageObjectMessages.get(0);
        Assertions.assertThat(message.topic().topicId()).isEqualTo("m1");
        Object object = ((MessageObjectMessage) message).object();
        Assertions.assertThat(object).isNotNull();
    }

    @Test
    void given_object_list_and_resolve_a_message_with_property_el() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter(
                        "/service/MessageSendTaskServiceTest/listObjectMessageSendTaskWithPropertyEl.bpmn");
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        defaultApplicationContext.put("topicLoader", new TypedObject(topicLoader));
        defaultApplicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(defaultApplicationContext);

        ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);

        List<Message> messageObjectMessages = serviceResult.messages();
        Assertions.assertThat(messageObjectMessages).hasSize(1);
        Message message = messageObjectMessages.get(0);
        Assertions.assertThat(message.topic().topicId()).isEqualTo("m1");
        Object object = ((MessageObjectMessage) message).object();
        Assertions.assertThat(object).isNotNull();
        Assertions.assertThat(((MessageObject) object).getId()).isEqualTo("id1");
        Assertions.assertThat(((MessageObject) object).getName()).isEqualTo("name1");
    }

    private TopicLoader topicLoader() {
        return topicId -> (Topic) () -> topicId;
    }

    private TopicStructureLoader topicStructureLoader() {
        return topicId -> () -> {
            List<TopicStructureElement> topicStructureElements = new ArrayList<>();
            topicStructureElements.add(new TopicStructureElement("id", TopicStructureElementType.NUMBER));
            topicStructureElements.add(new TopicStructureElement("name", TopicStructureElementType.STRING));
            topicStructureElements.add(new TopicStructureElement("age", TopicStructureElementType.NUMBER));
            topicStructureElements.add(new TopicStructureElement("height", TopicStructureElementType.NUMBER));
            topicStructureElements.add(new TopicStructureElement("company", TopicStructureElementType.NUMBER));
            topicStructureElements.add(new TopicStructureElement("join_date", TopicStructureElementType.TIMESTAMP));
            topicStructureElements.add(new TopicStructureElement("active", TopicStructureElementType.BOOLEAN));
            topicStructureElements.add(new TopicStructureElement("className", TopicStructureElementType.STRING));
            return topicStructureElements;
        };
    }
}