package com.dongkuk.caravan.core.container;

import com.dongkuk.caravan.core.consumer.KafkaDltConsumer;
import com.dongkuk.caravan.core.consumer.KafkaMessageConsumer;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/**
 * TC-CTN-001 ~ TC-CTN-010: ContainerController 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class ContainerControllerTest {

    @Mock
    private KafkaListenerEndpointRegistry registry;

    @Mock
    private ConcurrentKafkaListenerContainerFactory<String, String> containerFactory;

    @Mock
    private KafkaTopicRepository topicRepository;

    @Mock
    private ObjectProvider<KafkaMessageConsumer> messageConsumerProvider;

    @Mock
    private ObjectProvider<KafkaDltConsumer> dltConsumerProvider;

    @Mock
    private ConfigurableApplicationContext applicationContext;

    @Mock
    private MessageListenerContainer container;

    private ContainerController controller;

    private static final String LISTENER_ID = "listener-MMPPMERPTT01";

    @Before
    public void setUp() {
        controller = new ContainerController(registry, containerFactory, topicRepository,
            messageConsumerProvider, dltConsumerProvider, applicationContext);
    }

    // TC-CTN-001: pause() - 실행 중인 컨테이너 일시정지
    @Test
    public void TC_CTN_001_pause_running() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isRunning()).thenReturn(true);

        controller.pause(LISTENER_ID);

        verify(container, times(1)).pause();
    }

    // TC-CTN-002: resume() - 일시정지된 컨테이너 재개
    @Test
    public void TC_CTN_002_resume_paused() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isContainerPaused()).thenReturn(true);

        controller.resume(LISTENER_ID);

        verify(container, times(1)).resume();
    }

    // TC-CTN-003: stop() - 컨테이너 완전 정지
    @Test
    public void TC_CTN_003_stop() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isRunning()).thenReturn(true);

        controller.stop(LISTENER_ID);

        verify(container, times(1)).stop();
    }

    // TC-CTN-004: start() - 정지된 컨테이너 시작
    @Test
    public void TC_CTN_004_start() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isRunning()).thenReturn(false);

        controller.start(LISTENER_ID);

        verify(container, times(1)).start();
    }

    // TC-CTN-005: getStatus() - RUNNING
    @Test
    public void TC_CTN_005_getStatus_running() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isRunning()).thenReturn(true);
        when(container.isContainerPaused()).thenReturn(false);

        assertEquals(ContainerStatus.RUNNING, controller.getStatus(LISTENER_ID));
    }

    // TC-CTN-006: getStatus() - PAUSED
    @Test
    public void TC_CTN_006_getStatus_paused() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isRunning()).thenReturn(true);
        when(container.isContainerPaused()).thenReturn(true);

        assertEquals(ContainerStatus.PAUSED, controller.getStatus(LISTENER_ID));
    }

    // TC-CTN-007: getStatus() - STOPPED
    @Test
    public void TC_CTN_007_getStatus_stopped() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);
        when(container.isRunning()).thenReturn(false);

        assertEquals(ContainerStatus.STOPPED, controller.getStatus(LISTENER_ID));
    }

    // TC-CTN-008: getStatus() - NOT_EXISTS
    @Test
    public void TC_CTN_008_getStatus_notExists() {
        when(registry.getListenerContainer("listener-UNKNOWN")).thenReturn(null);

        assertEquals(ContainerStatus.NOT_EXISTS, controller.getStatus("listener-UNKNOWN"));
    }

    // TC-CTN-009: exists() - 존재
    @Test
    public void TC_CTN_009_exists_true() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(container);

        assertTrue(controller.exists(LISTENER_ID));
    }

    // TC-CTN-010: exists() - 미존재
    @Test
    public void TC_CTN_010_exists_false() {
        when(registry.getListenerContainer(LISTENER_ID)).thenReturn(null);

        assertFalse(controller.exists(LISTENER_ID));
    }
}
