package com.dongkuk.oasis.transaction;

import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SpringTransactionHandlerParallelExecutionTest {
    @Test
    void givenParallelExecutionWhenExplicitTransactionsRequestedThenThrowException() {
        SpringTransactionHandler handler = new SpringTransactionHandler(new DefaultApplicationContext(), new String[]{"tx1"});

        try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
            assertThatThrownBy(() -> handler.execute(() -> {
            }, new String[]{"tx1"}, null))
                    .isInstanceOf(TransactionException.class)
                    .hasMessageContaining("explicit transaction");
        }
    }

    @Test
    void givenParallelExecutionWithoutExplicitTransactionsThenAllowExecution() {
        SpringTransactionHandler handler = new SpringTransactionHandler(new DefaultApplicationContext(), new String[]{"tx1"});

        try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
            assertThatCode(() -> handler.execute(() -> {
            }, null, null)).doesNotThrowAnyException();
        }
    }
}
