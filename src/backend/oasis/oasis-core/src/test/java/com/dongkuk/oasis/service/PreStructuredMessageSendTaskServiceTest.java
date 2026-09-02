package com.dongkuk.oasis.service;

import com.dongkuk.oasis.BpmnServiceLoaderForTest;
import com.dongkuk.oasis.ServiceProviderForTest;
import com.dongkuk.oasis.ServiceStarterFactoryForTest;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.message.*;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import utils.DatabaseHelper;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-06-04
 */
class PreStructuredMessageSendTaskServiceTest {
    @Test
    void service_having_SendTask_return_service_results_with_message() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter("/service/MessageSendTaskServiceTest/sendTask.bpmn");
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        defaultApplicationContext.put("topicLoader", new TypedObject(topicLoader));
        defaultApplicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(defaultApplicationContext);

        ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);

        List<Message> preStructuredMessages = serviceResult.messages();
        Assertions.assertThat(preStructuredMessages).hasSize(1);
    }

    @Test
    void service_including_subProcess_having_SendTask_returns_service_result_with_message() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter("/service/MessageSendTaskServiceTest/subProcessSendTask.bpmn");
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext();

        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        defaultApplicationContext.put("topicLoader", new TypedObject(topicLoader));
        defaultApplicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(defaultApplicationContext);

        ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);

        List<Message> preStructuredMessages = serviceResult.messages();
        Assertions.assertThat(preStructuredMessages).hasSize(3);
    }

    @Test
    void service_having_two_SendTask_returns_service_result_with_two_messages() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new ServiceProviderForTest(
                        new ServiceProviderForTest.ServiceEntry("subServiceSendTask", "/service/MessageSendTaskServiceTest/subServiceSendTask.bpmn"),
                        new ServiceProviderForTest.ServiceEntry("sendTask", "/service/MessageSendTaskServiceTest/sendTask.bpmn")
                )
        ).generateServiceStarter();
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext();

        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        defaultApplicationContext.put("topicLoader", new TypedObject(topicLoader));
        defaultApplicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(defaultApplicationContext);

        ServiceResult serviceResult = serviceStarter.start("subServiceSendTask", serviceContext);

        List<Message> preStructuredMessages = serviceResult.messages();
        Assertions.assertThat(preStructuredMessages).hasSize(2);
    }

    @Test
    void service_having_SendTask_with_no_binding_values_in_context_returns_no_message_bound() {
        final DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        applicationContext.put("topicLoader", new TypedObject(topicLoader));
        applicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter(
                        "/service/MessageSendTaskServiceTest/sendTask.bpmn");
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext);

        ServiceResult serviceResult = serviceStarter.start("xx", serviceContext);

        List<Message> preStructuredMessages = serviceResult.messages();
        PreStructuredMessage message = (PreStructuredMessage) preStructuredMessages.get(0);
        for (PreStructuredMessageElement preStructuredMessageElement : message.preStructuredMessageElements()) {
            Assertions.assertThat(preStructuredMessageElement.isBound()).isFalse();
        }
    }

    @ParameterizedTest
    @CsvSource(value = "/service/MessageSendTaskServiceTest/sendTaskWithSqlScript.bpmn")
    void service_having_SendTask_with_sql_task_result_binding_values_returns_bind_message(String bpmn)
            throws SQLException {
        final DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        int count = topicStructureLoader.topicStructure("22").topicStructureElements().size();

        applicationContext.put("topicLoader", new TypedObject(topicLoader));
        applicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));
        SpringTransactionHandler transactionHandler =
                DatabaseHelper.getSpringTransactionHandler(
                        "service/MessageSendTaskServiceTest/initData.sql",
                        "tm1",
                        applicationContext);
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter(
                        bpmn
                        , transactionHandler);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext);

        ServiceResult serviceResult = serviceStarter.start("xx", serviceContext);

        List<Message> preStructuredMessages = serviceResult.messages();
        Assertions.assertThat(preStructuredMessages).hasSize(1);
        PreStructuredMessage message = (PreStructuredMessage) preStructuredMessages.get(0);
        Assertions.assertThat(message.preStructuredMessageElements()).hasSize(count);

        Assertions.assertThat(message.preStructuredMessageElements().get(0).getValue()).isEqualTo(1);
        Assertions.assertThat(message.preStructuredMessageElements().get(0).topicStructureElementType())
                .isEqualTo(TopicStructureElementType.NUMBER);
    }

    @Test
    void plain_object_convert_to_string() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest
                .getServiceStarter("/service/MessageSendTaskServiceTest/sendTaskWithPlainObject.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        TopicLoader topicLoader = topicLoader();
        TopicStructureLoader topicStructureLoader = topicStructureLoader();

        applicationContext.put("topicLoader", new TypedObject(topicLoader));
        applicationContext.put("topicStructureLoader", new TypedObject(topicStructureLoader));

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext);

        ServiceResult serviceResult = serviceStarter.start("xxx", serviceContext);

        List<Message> preStructuredMessages = serviceResult.messages();
        PreStructuredMessage preStructuredMessage = (PreStructuredMessage) preStructuredMessages.get(0);
        for (PreStructuredMessageElement preStructuredMessageElement : preStructuredMessage.preStructuredMessageElements()) {
            if (preStructuredMessageElement.getName().equals("name"))
                Assertions.assertThat(preStructuredMessageElement.getValue()).isEqualTo("Jeongjin");
            else if (preStructuredMessageElement.getName().equals("className"))
                Assertions.assertThat(preStructuredMessageElement.getValue()).isEqualTo("ClassName");
        }
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