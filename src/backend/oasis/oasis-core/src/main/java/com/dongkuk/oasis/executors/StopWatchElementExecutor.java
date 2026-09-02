package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.logger.StartAndFinishLogger;
import com.dongkuk.oasis.model.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public final class StopWatchElementExecutor implements ElementExecutor {
    private final ElementExecutor elementExecutor;

    /**
     * element 실행기.
     *
     * @param elementExecutor 요소 실행기
     */
    public StopWatchElementExecutor(ElementExecutor elementExecutor) {
        if (elementExecutor instanceof StopWatchElementExecutor)
            throw new IllegalArgumentException("StopWatchElementExecutor is not available.");
        this.elementExecutor = elementExecutor;
    }

    @Override
    public ExecutionResult execute(Element element, ExecutableContext executableContext) {
        StartAndFinishLogger<ElementLoggerParam> taskStartAndFinishLogger
                = new ElementStartAndFinishLogger(element.getClass());

        taskStartAndFinishLogger.logStart(new ElementLoggerParam(element.getId(), element.getName()));
        ExecutionResult executionResult;
        boolean isException = false;
        try {
            executionResult = elementExecutor.execute(element, executableContext);
        } catch (Exception | Error e) {
            isException = true;
            throw e;
        } finally {
            if (!isException) {
                taskStartAndFinishLogger.logFinish(new ElementLoggerParam(element.getId(), element.getName()));
            } else {
                taskStartAndFinishLogger
                        .logFinishWithException(new ElementLoggerParam(element.getId(), element.getName()));
            }
        }
        return executionResult;
    }
}
