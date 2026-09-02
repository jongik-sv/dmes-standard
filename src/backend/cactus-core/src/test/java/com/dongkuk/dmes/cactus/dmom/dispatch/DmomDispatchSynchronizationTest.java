package com.dongkuk.dmes.cactus.dmom.dispatch;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.context.DmomSendBuffer;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class DmomDispatchSynchronizationTest {

    private final DmomHttpSender httpSender = mock(DmomHttpSender.class);
    private final DmomErrorLogger errorLogger = mock(DmomErrorLogger.class);

    @AfterEach
    void cleanup() {
        DmomSendBuffer.close();
    }

    @Test
    void afterCommit_모든_HTTP메시지_전송() {
        DmomMessage m1 = new DmomMessage("TC", "IF1", "a|");
        DmomMessage m2 = new DmomMessage("TC", "IF2", "b|");
        DmomDispatchSynchronization sync =
                new DmomDispatchSynchronization(List.of(m1, m2), httpSender, errorLogger);

        sync.afterCommit();

        verify(httpSender).send(m1);
        verify(httpSender).send(m2);
        verifyNoInteractions(errorLogger);
    }

    @Test
    void 한건_전송실패시_errorLogger적재_나머지는_계속() {
        DmomMessage m1 = new DmomMessage("TC", "IF1", "a|");
        DmomMessage m2 = new DmomMessage("TC", "IF2", "b|");
        doThrow(new DmomException("fail")).when(httpSender).send(m1);
        DmomDispatchSynchronization sync =
                new DmomDispatchSynchronization(List.of(m1, m2), httpSender, errorLogger);

        sync.afterCommit();

        verify(errorLogger).log(eq(m1), any());
        verify(httpSender).send(m2);   // 나머지 계속 처리
    }

    @Test
    void afterCompletion_버퍼_unbind() {
        DmomSendBuffer.openIfAbsent();
        assertThat(DmomSendBuffer.isActive()).isTrue();

        new DmomDispatchSynchronization(List.of(), httpSender, errorLogger)
                .afterCompletion(TransactionSynchronization.STATUS_COMMITTED);

        assertThat(DmomSendBuffer.isActive()).isFalse();
    }
}
