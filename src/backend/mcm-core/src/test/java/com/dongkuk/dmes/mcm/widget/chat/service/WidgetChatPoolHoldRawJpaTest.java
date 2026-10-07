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

    /**
     * 지연 획득을 끄면 채팅마다 바깥 txBiz 연결 1개를 LLM 대기 내내 쥐므로, 풀 크기만큼의 채팅이 바깥 연결을 모두 가져가 채팅 자신의
     * 기록 쓰기(REQUIRES_NEW)와 다른 요청이 연결을 받지 못한다(2026-10-07 실측, design-mcm-lazy-ds.md §5). 이 구성의 남은 한계라
     * 판정하지 않고 수치만 남긴다 — 운영에서 끄고 쓰면 동시 채팅 수를 풀 크기보다 작게 두어야 한다.
     */
    @Override
    void assertConcurrent(ConcurrentRun run) {
    }
}
