package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import org.slf4j.MDC;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * 반복 요소를 순서대로 실행시키는 실행기.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
final class ParallelMultiInstanceInternalElementExecutor extends MultiInstanceInternalElementExecutor {
    private int threadLimit = 10;
    private int timeoutSecondLimit = 50;

    public void setThreadLimit(int threadLimit) {
        this.threadLimit = threadLimit;
    }

    public void setTimeoutSecond(int timeoutSecond) {
        this.timeoutSecondLimit = timeoutSecond;
    }

    /**
     * 반복 실행 가능한 요소를 실행한다.
     *
     * @param executable        요소 실행기
     * @param element           요소
     * @param executableContext 실행 가능 요소 컨텍스트
     * @return 태스크 실행 결과, 실행 결과가 없으면 {@code null}을 반환한다.
     */
    public ExecutionResult execute(Executable executable, Element element, ExecutableContext executableContext) {
        int maxThreads;
        int timeoutSecond;

        Property maxThreadProperty = element.getProperty(MAX_THREAD);
        if (maxThreadProperty == null)
            maxThreads = threadLimit;
        else
            maxThreads = Integer.parseInt(maxThreadProperty.getValue());

        if (threadLimit < maxThreads)
            throw new IllegalStateException(
                    String.format(
                            "The maximum execution thread count [%d] is greater than the thread limit [%d].",
                            maxThreads, threadLimit));

        Property timeoutSecondProperty = element.getProperty(THREAD_TIMEOUT);
        if (timeoutSecondProperty == null)
            timeoutSecond = timeoutSecondLimit;
        else
            timeoutSecond = Integer.parseInt(timeoutSecondProperty.getValue());

        ExecutorService executorService = Executors.newFixedThreadPool(maxThreads);

        Property property = element.getProperty(ITERATOR);
        if (property != null)
            throw new PropertyException(
                    String.format("The attribute [%s] is not available. Please use Collection and Element Variable."
                            , ITERATOR));

        MultiInstance multiInstanceElement = (MultiInstance) element;
        String collectionNameAttr = multiInstanceElement.collectionName();
        String itemVariableNameAttr = multiInstanceElement.itemVariableName();

        if (collectionNameAttr == null)
            throw new IllegalStateException("Although it's a repeating element, the Collection property is missing.");

        List<PropertyExpression> propertyExpressions = PropertyParser.parse(collectionNameAttr);
        if (propertyExpressions.size() > 1)
            throw new PropertyException(
                    "The property [%s] cannot be specified for more than 2 items separated by [,].");

        PropertyExpression propertyExpression = propertyExpressions.get(0);

        String value = propertyExpression.getValue(String.class);

        TypedObject typedObject = executableContext.get(value);
        if (typedObject == null)
            throw new PropertyException(
                    String.format(
                            "The iterator [%s] for repeating execution in the repeating element [%s] " +
                                    "does not exist in the context. " +
                                    "Please check the value.", value, element.getId())
            );

        TypedObject accessedObject = PropertyUtil.access(typedObject, propertyExpression.getAccessors());

        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);

        List<ExecutionResult> executionResultList = executeMultiInstanceElement(accessedObject,
                itemVariableNameAttr,
                executableContext,
                executable,
                (executable1, executionResultList1, iteratorUnpackedContext)
                        -> executorService.execute(() -> new MDCTemplate() {
                    @Override
                    public void process() {
                        try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
                            ExecutionResult iterableExecutionResult = executable1.execute(iteratorUnpackedContext);
                            executionResultList1.add(iterableExecutionResult);
                        }
                    }
                }.mdc(serviceTag)),
                itemVariableNameAttr == null
        );

        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(timeoutSecond, TimeUnit.SECONDS)) {
                executorService.shutdownNow();
            }
        } catch (InterruptedException ex) {
            throw new RuntimeException(ex);
        }

        return convertExecutionResultListToSingle(executionResultList);
    }
}
