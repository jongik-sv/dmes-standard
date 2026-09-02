package com.dongkuk.oasis.process;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.BpmnServiceLoaderForTest;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-07-08
 */
public class OutputExpressionTest {
    @Test
    void normalOutput() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("normal")).build()));

        List<String> result1 = result.result("result").getObject(new TypeReference<List<String>>() {
        });
        assertThat(result1).hasSize(2);
    }

    @Test
    void accessIndex() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("index0")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("hi");
    }

    @Test
    void accessKey() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("key")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("hello");
    }

    @Test
    void accessIndexKey() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("indexKey")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("Richard");
    }

    @Test
    void accessKeyIndex() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("keyIndex")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("key");
    }

    @Test
    void accessArray() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("array")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("hello");
    }

    @Test
    void accessListListList() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("listListList")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("hello");
    }

    @Test
    void accessAliasFirst() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/OutputExpressionTest/outputExpression.bpmn");
        ServiceResult result = serviceStarter.start("outputExpression",
                new DefaultServiceContext(
                        new DefaultApplicationContext(new HashMap<>()),
                        new MapBuilder<String, TypedObject>()
                                .addEntity("action", new TypedObject("alias")).build()));

        String result1 = result.result("result").getObject(String.class);
        assertThat(result1).isEqualTo("hi");
    }
}
