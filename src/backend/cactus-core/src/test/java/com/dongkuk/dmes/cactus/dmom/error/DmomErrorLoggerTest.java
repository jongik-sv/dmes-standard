package com.dongkuk.dmes.cactus.dmom.error;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DmomErrorLoggerTest {

    private final SqlSessionTemplate bizTemplate = mock(SqlSessionTemplate.class);
    private final TransactionTemplate errorTxTemplate = mock(TransactionTemplate.class);
    private final DmomErrorLogger logger = new DmomErrorLogger(bizTemplate, errorTxTemplate);
    private final DmomMessage message = new DmomMessage("TC", "MMQCMMCMTT01", "a|b|");

    @BeforeEach
    @SuppressWarnings("unchecked")
    void stubTxTemplate() {
        // executeWithoutResult 호출 시 콜백을 실제로 실행
        doAnswer(inv -> {
            Consumer<TransactionStatus> action = inv.getArgument(0);
            action.accept(mock(TransactionStatus.class));
            return null;
        }).when(errorTxTemplate).executeWithoutResult(any());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void TC_ERROR_적재_파라미터_확인() {
        logger.log(message, new DmomException("boom"));

        ArgumentCaptor<Map> captor = ArgumentCaptor.forClass(Map.class);
        verify(bizTemplate).insert(eq("DmomMapper.insertTcError"), captor.capture());
        Map<String, Object> p = captor.getValue();
        assertThat(p)
                .containsEntry("transactionCode", "TC")
                .containsEntry("interfaceId", "MMQCMMCMTT01")
                .containsEntry("interfaceProtocol", "HUB_HTTP")
                .containsEntry("interfaceMsg", "a|b|")
                .containsEntry("errorType", "S")
                .containsEntry("errorCode", "DmomException")
                .containsEntry("errorMsg", "boom")
                .containsEntry("errorStatusCode", "N");
    }

    @Test
    void 적재실패는_삼킨다() {
        when(bizTemplate.insert(eq("DmomMapper.insertTcError"), any()))
                .thenThrow(new RuntimeException("db down"));

        assertThatCode(() -> logger.log(message, new DmomException("boom")))
                .doesNotThrowAnyException();
    }
}
