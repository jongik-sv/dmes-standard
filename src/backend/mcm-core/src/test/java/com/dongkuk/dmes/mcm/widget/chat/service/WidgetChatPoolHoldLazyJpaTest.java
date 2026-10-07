package com.dongkuk.dmes.mcm.widget.chat.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * 앱 기본 DataSource 를 {@code LazyConnectionDataSourceProxy} 로 감쌀 때({@code dmes.datasource.lazy-connection=true}) — 바깥
 * txBiz 는 첫 SQL 전까지 물리 연결을 받지 않고, 채팅은 SQL 없이 바깥을 내려놓으므로 LLM 을 기다리는 동안 이 풀의 연결을 쥐지 않는다.
 */
@SpringJUnitConfig(WidgetChatPoolJpaTestConfig.class)
@TestPropertySource(properties = "chat.pool.lazy=true")
class WidgetChatPoolHoldLazyJpaTest extends WidgetChatPoolHoldJpaTestBase {

    @Override
    int expectedHeldDuringLlm() {
        return 0;
    }

    @Test
    @DisplayName("풀 크기만큼의 채팅이 LLM 을 기다리는 동안에도 다른 요청이 connectionTimeout 전에 끝난다")
    void otherRequestCompletesWhileChatsWaitForLlm() throws Exception {
        ConcurrentRun run = otherRequestWhileChatsWait();

        assertThat(run.allWaiting()).as("채팅이 모두 LLM 대기에 들어갔다").isTrue();
        assertThat(run.heldWhileWaiting()).as("LLM 대기 중 쥔 연결 수").isZero();
        assertThat(run.otherFailure()).as("다른 요청 실패").isNull();
        assertThat(run.otherMs()).as("다른 요청 소요(ms)").isLessThan(WidgetChatPoolJpaTestConfig.CONNECTION_TIMEOUT_MS);
        assertThat(run.chatFailures()).as("채팅 실패").isEmpty();
    }
}
