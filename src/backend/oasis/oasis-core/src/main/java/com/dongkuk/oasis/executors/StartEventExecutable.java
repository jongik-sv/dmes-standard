package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;

/**
 * @author Jeongjin Kim
 * @since 2021-06-28
 */
final class StartEventExecutable implements Executable {
    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        return null;
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return false;
    }
}
