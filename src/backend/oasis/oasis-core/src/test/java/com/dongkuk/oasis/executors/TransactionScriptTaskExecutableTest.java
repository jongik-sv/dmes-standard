package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.CommitTransactionAskedEvent;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.execution.ExecutableContextStub;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.TransactionScriptTask;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;

class TransactionScriptTaskExecutableTest {
    @Test
    void givenNoTransactionPropertyThenThrowException() {
        TransactionScriptTaskExecutable executable =
                new TransactionScriptTaskExecutable(new TransactionScriptTask(
                        "tid",
                        "test",
                        Collections.emptyList(),
                        null,
                        null,
                        "commit",
                        new PropertyContainer(),
                        new InputOutputContainer(Collections.emptyMap()),
                        new InputOutputContainer(Collections.emptyMap()),
                        null
                ));
        SpyExecutable spyExecutable = new SpyExecutable(null);
        Assertions.assertThatIllegalStateException().isThrownBy(() -> executable.execute(spyExecutable));
    }

    @Test
    void givenCommitScriptThenCommitTransactionAskedEventRaised() {
        TransactionScriptTaskExecutable executable =
                new TransactionScriptTaskExecutable(new TransactionScriptTask(
                        "tid",
                        "test",
                        Collections.emptyList(),
                        null,
                        null,
                        "commit",
                        new PropertyContainer().add(new Property("tx", "tx1")),
                        new InputOutputContainer(Collections.emptyMap()),
                        new InputOutputContainer(Collections.emptyMap()),
                        null
                ));
        SpyExecutable spyExecutable = new SpyExecutable(null);
        executable.execute(spyExecutable);
        assertThat(spyExecutable.getEvent()).isInstanceOf(CommitTransactionAskedEvent.class);
    }

    @Test
    void givenParallelExecutionThenThrowException() {
        TransactionScriptTaskExecutable executable =
                new TransactionScriptTaskExecutable(new TransactionScriptTask(
                        "tid",
                        "test",
                        Collections.emptyList(),
                        null,
                        null,
                        "commit",
                        new PropertyContainer().add(new Property("tx", "tx1")),
                        new InputOutputContainer(Collections.emptyMap()),
                        new InputOutputContainer(Collections.emptyMap()),
                        null
                ));
        SpyExecutable spyExecutable = new SpyExecutable(null);

        try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
            Assertions.assertThatIllegalStateException()
                    .isThrownBy(() -> executable.execute(spyExecutable))
                    .withMessageContaining("parallel execution");
        }
    }

    static class SpyExecutable extends ExecutableContextStub {
        Event event;

        public SpyExecutable(TypedObject getData) {
            super(getData);
        }

        @Override
        public void raiseEvent(Event event) {
            this.event = event;
        }

        public Event getEvent() {
            return event;
        }
    }
}
