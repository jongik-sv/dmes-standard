package com.dongkuk.caravan.core.handler;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.context.ApplicationContext;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/**
 * TC-HDL-001 ~ TC-HDL-007: KafkaInterfaceHandlerRegistry 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaInterfaceHandlerRegistryTest {

    @Mock
    private ApplicationContext applicationContext;

    @Mock
    private DefaultKafkaInterfaceHandler defaultHandler;

    @Mock
    private KafkaInterfaceHandler customHandler;

    private KafkaInterfaceHandlerRegistry registry;

    @Before
    public void setUp() {
        registry = new KafkaInterfaceHandlerRegistry(applicationContext, defaultHandler);
    }

    // TC-HDL-001: 등록된 TRANSACTION_CODE → 해당 핸들러 반환
    @Test
    public void TC_HDL_001_getHandler_registered() {
        when(applicationContext.getBean("PQR02012", KafkaInterfaceHandler.class))
                .thenReturn(customHandler);

        KafkaInterfaceHandler handler = registry.getHandler("PQR02012");

        assertSame(customHandler, handler);
    }

    // TC-HDL-002: 미등록 TRANSACTION_CODE → DefaultHandler 반환
    @Test
    public void TC_HDL_002_getHandler_unregistered() {
        when(applicationContext.getBean("UNKNOWN_CODE", KafkaInterfaceHandler.class))
                .thenThrow(new NoSuchBeanDefinitionException("UNKNOWN_CODE"));

        KafkaInterfaceHandler handler = registry.getHandler("UNKNOWN_CODE");

        assertSame(defaultHandler, handler);
    }

    // TC-HDL-003: null TRANSACTION_CODE → DefaultHandler 반환
    @Test
    public void TC_HDL_003_getHandler_null() {
        KafkaInterfaceHandler handler = registry.getHandler(null);

        assertSame(defaultHandler, handler);
        verify(applicationContext, never()).getBean(anyString(), any(Class.class));
    }

    // TC-HDL-004: 빈 문자열 TRANSACTION_CODE → DefaultHandler 반환
    @Test
    public void TC_HDL_004_getHandler_blank() {
        KafkaInterfaceHandler handler = registry.getHandler("  ");

        assertSame(defaultHandler, handler);
        verify(applicationContext, never()).getBean(anyString(), any(Class.class));
    }

    // TC-HDL-005: hasHandler() - 존재
    @Test
    public void TC_HDL_005_hasHandler_exists() {
        when(applicationContext.getBean("PQR02012", KafkaInterfaceHandler.class))
                .thenReturn(customHandler);

        assertTrue(registry.hasHandler("PQR02012"));
    }

    // TC-HDL-006: hasHandler() - 미존재
    @Test
    public void TC_HDL_006_hasHandler_notExists() {
        when(applicationContext.getBean("UNKNOWN", KafkaInterfaceHandler.class))
                .thenThrow(new NoSuchBeanDefinitionException("UNKNOWN"));

        assertFalse(registry.hasHandler("UNKNOWN"));
    }

    // TC-HDL-007: hasHandler() - null
    @Test
    public void TC_HDL_007_hasHandler_null() {
        assertFalse(registry.hasHandler(null));
    }
}
