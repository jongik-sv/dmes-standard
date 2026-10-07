package com.dongkuk.dmes.mcm.widget.chat.service;

import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * 앱 기본 DataSource 를 감싸지 않을 때(운영 기본, {@code dmes.datasource.lazy-connection=false}) — 바깥 txBiz 가 시작할 때 잡은
 * 연결 하나를 LLM 을 기다리는 내내 쥔다. 채팅 안의 읽기는 짧은 트랜잭션으로 묶여 범위 EntityManager 연결은 더 쥐지 않는다.
 */
@SpringJUnitConfig(WidgetChatPoolJpaTestConfig.class)
class WidgetChatPoolHoldRawJpaTest extends WidgetChatPoolHoldJpaTestBase {

    @Override
    int expectedHeldDuringLlm() {
        return 1;
    }
}
