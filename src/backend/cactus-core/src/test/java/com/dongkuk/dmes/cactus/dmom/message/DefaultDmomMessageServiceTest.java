package com.dongkuk.dmes.cactus.dmom.message;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.context.DmomSendBuffer;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomDbOutboundWriter;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomHttpSender;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.dmes.cactus.dmom.format.FormatItem;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.transport.CaravanHubTransport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * createMsg 통합 테스트 — <b>실제 Spring 트랜잭션 동기화 라이프사이클</b>을 검증한다.
 *
 * <p>DB 없이도 커밋 경계를 검증하기 위해 {@link StubTxManager}(AbstractPlatformTransactionManager 최소 구현)
 * + {@link TransactionTemplate} 을 사용한다. 이 매니저는 getTransaction 시 동기화 init,
 * commit 시 {@code afterCommit/afterCompletion} 을 실제로 발동한다.
 */
class DefaultDmomMessageServiceTest {

    private final DmomFormatRepository formatRepository = mock(DmomFormatRepository.class);
    private final MessageSerializer serializer = new MessageSerializer();   // 실제 직렬화기
    private final DmomDbOutboundWriter dbWriter = mock(DmomDbOutboundWriter.class);
    private final DmomHttpSender httpSender = mock(DmomHttpSender.class);
    private final DmomErrorLogger errorLogger = mock(DmomErrorLogger.class);

    private final DefaultDmomMessageService service =
            new DefaultDmomMessageService(formatRepository, serializer, dbWriter, httpSender, errorLogger);

    private final TransactionTemplate txTemplate = new TransactionTemplate(new StubTxManager());

    @AfterEach
    void cleanup() {
        DmomSendBuffer.close();
    }

    private FormatLayout sampleLayout() {
        return new FormatLayout("FMT", BigDecimal.ONE,
                List.of(new FormatItem(1, "E", "A", "항목A", "1", 10, 0)));
    }

    private DmomSendRequest request(CaravanHubTransport transport) {
        return DmomSendRequest.builder()
                .transactionCode("TC")
                .interfaceId("MMQCMMCMTT01")
                .transport(transport)
                .data(Map.of("A", "hello"))
                .build();
    }

    @Test
    void 활성트랜잭션_없으면_fail_fast() {
        assertThatThrownBy(() -> service.createMsg(request(CaravanHubTransport.HTTP)))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("active Spring transaction");
        verifyNoInteractions(httpSender, dbWriter);
    }

    @Test
    void 포맷없으면_DmomException() {
        when(formatRepository.getActiveLayout(any(), any())).thenReturn(FormatLayout.empty());
        txTemplate.executeWithoutResult(status ->
                assertThatThrownBy(() -> service.createMsg(request(CaravanHubTransport.HTTP)))
                        .isInstanceOf(DmomException.class)
                        .hasMessageContaining("FORMAT_LAYOUT 없음"));
    }

    @Test
    void HTTP_커밋전엔_미전송_커밋후_send발동() {
        when(formatRepository.getActiveLayout(any(), any())).thenReturn(sampleLayout());

        txTemplate.executeWithoutResult(status -> {
            String msg = service.createMsg(request(CaravanHubTransport.HTTP));
            assertThat(msg).isEqualTo("hello|");
            verifyNoInteractions(httpSender);          // 커밋 전 → 아직 미전송
        });

        // 커밋 완료(afterCommit) 후 전송
        verify(httpSender).send(new DmomMessage("TC", "MMQCMMCMTT01", "hello|"));
    }

    @Test
    void DB_커밋전_즉시_INSERT() {
        when(formatRepository.getActiveLayout(any(), any())).thenReturn(sampleLayout());

        txTemplate.executeWithoutResult(status -> {
            service.createMsg(request(CaravanHubTransport.DB));
            verify(dbWriter).insert(any(), eq("hello|"));   // 즉시 호출 (커밋 전, in-tx)
        });
        verifyNoInteractions(httpSender);
    }

    @Test
    void 롤백시_HTTP_미전송() {
        when(formatRepository.getActiveLayout(any(), any())).thenReturn(sampleLayout());

        assertThatThrownBy(() -> txTemplate.executeWithoutResult(status -> {
            service.createMsg(request(CaravanHubTransport.HTTP));
            throw new RuntimeException("강제 롤백");
        })).isInstanceOf(RuntimeException.class);

        verifyNoInteractions(httpSender);     // 롤백 → afterCommit 미발동
        assertThat(DmomSendBuffer.isActive()).isFalse();   // afterCompletion → unbind
    }

    /** 동기화 발동을 위한 최소 트랜잭션 매니저 (DB 불요). */
    static class StubTxManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
