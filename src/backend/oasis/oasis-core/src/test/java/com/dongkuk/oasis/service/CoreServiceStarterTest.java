package com.dongkuk.oasis.service;

import com.dongkuk.oasis.BpmnServiceLoaderForTest;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.exceptions.UnmarshalException;
import com.dongkuk.oasis.utils.MapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-06-04
 */
class CoreServiceStarterTest {
    @Test
    void givenAcceptableParameterThenWorksWell() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest.getServiceStarter("/service/CoreServiceStarterTest/noServiceAdapter.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(new DefaultApplicationContext(null),
                new MapBuilder<String, TypedObject>()
                        .addEntity("inputClass", new TypedObject(new DomainClassInputClass("3")))
                        .build()
        );
        ServiceResult serviceAdapter = serviceStarter.start("serviceAdapter", serviceContext);
        String result = serviceAdapter.result("result").getObject(String.class);
        assertThat(result).isEqualTo("3");
    }

    @Test
    void givenUnacceptableParameterThenFail() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest.getServiceStarter("/service/CoreServiceStarterTest/noServiceAdapter.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(new DefaultApplicationContext(null),
                new MapBuilder<String, TypedObject>()
                        .addEntity("id", new TypedObject("3"))
                        .build()
        );
        ServiceResult serviceAdapter = serviceStarter.start("serviceAdapter", serviceContext);
        assertThat(serviceAdapter.exception()).isInstanceOf(RuntimeException.class);
    }

    @Test
    void givenUnacceptableParameterAndParameterAdapterThenWorksWell() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest.getServiceStarter("/service/CoreServiceStarterTest/serviceAdapter.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(new DefaultApplicationContext(null),
                new MapBuilder<String, TypedObject>()
                        .addEntity("id", new TypedObject("3"))
                        .build()
        );
        ServiceResult serviceAdapter = serviceStarter.start("serviceAdapter", serviceContext);
        String result = serviceAdapter.result("result").getObject(String.class);
        assertThat(result).isEqualTo("3");
    }

    @Test
    void givenEmptyPropertyExistsThrowUnmarshalException() {
        ServiceStarter serviceStarter
                = BpmnServiceLoaderForTest.getServiceStarter("/service/CoreServiceStarterTest/emptyProperty.bpmn");
        ServiceContext serviceContext = new DefaultServiceContext(new DefaultApplicationContext(null),
                new MapBuilder<String, TypedObject>()
                        .build()
        );
        ServiceResult serviceAdapter = serviceStarter.start("serviceAdapter", serviceContext);
        assertThat(serviceAdapter.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(serviceAdapter.exception()).isInstanceOf(UnmarshalException.class);
    }
}