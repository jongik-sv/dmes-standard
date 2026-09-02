package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ElementExecutorFactory;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.gateway.DefaultParallelGateway;
import org.slf4j.MDC;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static com.dongkuk.oasis.model.PropertyNames.OUTPUT_KEY;

/**
 * 병렬 게이트웨이와 병렬 게이트웨이 사이에 있는 서브 프로세스를 병렬로 수행하는 실행기이다.
 * <p>
 * 병렬 게이트웨이가 처음 선택되면 뒤에 있는 병렬 게이트웨이로 즉시 넘어가고, 사이에 있는 모든 프로세스를 병렬로 실행한다.
 *
 * <pre>
 *     |----[process1]-------|
 * --[PG1]                 [PG2]---
 *     |----[process2]-------|
 * </pre>
 * * PG = Parallel Gateway
 * <p>
 * 즉, 프로세스 실행은 PG2에서 모두 실행하고 Process1,2 모두 종료될 때까지 기다린다.
 *
 * @author Jeongjin Kim
 * @since 2021-07-23
 */
class ParallelGatewayExecutable extends SubProcessExecutable {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ParallelGatewayExecutable.class);
    private final DefaultParallelGateway element;
    private final ElementExecutorFactory elementExecutorFactory;
    private final int maxThreads;
    private final int timeoutSecond;

    public ParallelGatewayExecutable(DefaultParallelGateway element,
                                     ElementExecutorFactory elementExecutorFactory,
                                     int maxThreads,
                                     int timeoutSecond) {
        this.element = element;
        this.elementExecutorFactory = elementExecutorFactory;
        this.maxThreads = maxThreads;
        this.timeoutSecond = timeoutSecond;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        ExecutorService executorService = Executors.newFixedThreadPool(maxThreads);

        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);

        if (executableContext.processContext().parallelSubProcesses().size() > 0) {
            Collection<? extends SubProcess> subProcesses = executableContext.processContext().parallelSubProcesses();
            for (SubProcess subProcess : subProcesses) {
                executorService.execute(() -> new MDCTemplate() {
                    @Override
                    public void process() {
                        try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
                            ExecutionResult execute = elementExecutorFactory
                                    .generateElementExecutor()
                                    .execute(subProcess, executableContext);
                            setOutputIntoProcessContext(executableContext.processContext(), subProcess, execute);
                        }
                    }
                }.mdc(serviceTag));
            }
            executorService.shutdown();
            try {
                if (!executorService.awaitTermination(timeoutSecond, TimeUnit.SECONDS)) {
                    executorService.shutdownNow();
                }
            } catch (InterruptedException ex) {
                throw new RuntimeException(ex);
            }
        }

        if (element.parallelFlow().size() > 1) {
            List<String> collect =
                    element.parallelFlow().stream().map(Flow::targetElementId).collect(Collectors.toList());

            return new UnmodifiableExecutionResult(
                    new TypedObject((ParallelGatewayFork) () -> collect));

        } else if (element.sequenceFlow() != null) {
            return new UnmodifiableExecutionResult(new TypedObject(new ParallelGatewayJoin() {
            }));
        } else
            throw new IllegalStateException("The flow configuration of the parallel gateway is incorrect.");
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return false;
    }

    private void setOutputIntoProcessContext(ProcessContext processContext,
                                             Element element,
                                             ExecutionResult executionResult) {
        if (executionResult == null)
            return;

        Property property = element.getProperty(OUTPUT_KEY);
        String outputKey = null;
        if (property != null) {
            List<PropertyExpression> propertyExpressions = PropertyParser.parse(property);
            if (propertyExpressions.size() > 1)
                throw new PropertyException(
                        String.format(
                                "The property [%s] cannot be specified for more than 2 items separated by [,].",
                                OUTPUT_KEY));

            PropertyExpression propertyExpression = propertyExpressions.get(0);
            outputKey = propertyExpression.getAlias(String.class);

            TypedObject result = executionResult.result();
            result = PropertyUtil.access(result, propertyExpression.getAccessors());
            processContext.add(outputKey, result);
        }

        Map<String, TypedObject> outputs = executionResult.outputs();
        if (outputKey != null && outputs.containsKey(outputKey))
            throw new IllegalStateException(
                    String.format(
                            "The value [%s] of property [%s] conflicts with the directly inputted output value key.",
                            outputKey, OUTPUT_KEY));

        for (Map.Entry<String, TypedObject> entry : outputs.entrySet()) {
            processContext.add(entry.getKey(), entry.getValue());
        }

    }
}
