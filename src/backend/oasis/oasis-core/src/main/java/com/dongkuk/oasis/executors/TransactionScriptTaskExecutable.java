package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.event.CommitTransactionAskedEvent;
import com.dongkuk.oasis.event.RollbackTransactionAskedEvent;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.TransactionScriptTask;

import java.util.Collections;
import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.TRANSACTION_MANAGER_NAME;

/**
 * @author Jeongjin Kim
 * @since 2021-06-28
 */
final class TransactionScriptTaskExecutable implements Executable {
    private final TransactionScriptTask transactionScriptTask;
    private final List<String> acceptablePropertyNames = Collections.singletonList(TRANSACTION_MANAGER_NAME);

    /**
     * @param transactionScriptTask transactionScriptTask
     */
    public TransactionScriptTaskExecutable(TransactionScriptTask transactionScriptTask) {
        this.transactionScriptTask = transactionScriptTask;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        if (ParallelExecutionScope.isActive()) {
            throw new IllegalStateException("Transaction script tasks are not allowed during parallel execution.");
        }

        Property property = transactionScriptTask.getProperty(TRANSACTION_MANAGER_NAME);
        if (property == null) {
            throw new IllegalStateException("The value of the transaction property [tx] is missing.");
        }
        String[] getTransactionManagerNames = property.getValue().split(",");

        if (transactionScriptTask.getTransactionScript().equals("commit"))
            executableContext.raiseEvent(
                    new CommitTransactionAskedEvent(getTransactionManagerNames));
        else if (transactionScriptTask.getTransactionScript().equals("rollback"))
            executableContext.raiseEvent(
                    new RollbackTransactionAskedEvent(getTransactionManagerNames));
        else
            throw new IllegalStateException(
                    String.format("Cannot interpret the transaction script. The entered script : [%s]",
                            transactionScriptTask.getTransactionScript()));

        return null;
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }
}
