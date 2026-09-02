package com.dongkuk.oasis.process;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.flow.DefaultStartFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.TerminalFlow;
import com.dongkuk.oasis.model.flow.nodes.*;

import java.util.*;
import java.util.stream.Collectors;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * 프로세스 내에 있는 테스크를 순차적으로 실행하는 역할을 한다.
 * <p>
 * 스레등에 안전하다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public final class CoreProcessStarter implements ProcessStarter {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CoreProcessStarter.class);
    private final int executionLimitCount;
    private final List<FlowPicker> flowPickers = new ArrayList<>();
    private final ElementExecutor elementExecutor;
    private final List<String> acceptablePropertyNames = Arrays.asList(
            TRANSACTION_MANAGER_NAME, SERVICE_ADAPTER, ALWAYS_COMMIT_TRANSACTION_MANAGER_NAME,
            SERVICE_DTO, ITERATOR, INPUT_KEY, OUTPUT_KEY
    );

    /**
     * {@link FlowNameConditionalFlowPicker}, {@link SpElConditionalFlowPicker}, {@link DefaultFlowPicker} 를 생성하여
     * 흐름을 제어하는 {@link ProcessStarter} 를 생성한다.
     *
     * @param elementExecutor     요소 실행기
     * @param executionLimitCount 최대 요소 실행 가능 횟수
     */
    public CoreProcessStarter(ElementExecutor elementExecutor, int executionLimitCount) {
        this.elementExecutor = elementExecutor;
        this.executionLimitCount = executionLimitCount;
        flowPickers.add(new FlowNameConditionalFlowPicker());
        flowPickers.add(new SpElConditionalFlowPicker());
        flowPickers.add(new DefaultFlowPicker());
    }

    /**
     * {@link FlowNameConditionalFlowPicker}, {@link SpElConditionalFlowPicker}, {@link DefaultFlowPicker} 를 생성하여
     * 흐름을 제어하는 {@link ProcessStarter} 를 생성한다.
     *
     * @param elementExecutor 요소 실행기
     */
    public CoreProcessStarter(ElementExecutor elementExecutor) {
        this(elementExecutor, 1000);
    }

    @Override
    public void start(Process process, ProcessContext processContext) {
        verifyProperties(process);
        StartEvent startEvent = process.getStartEvent();
        // 프로세스에 Task 가 1개만 존재
        if (startEvent == null && process.getElements().size() == 1) {
            Collection<? extends Element> elements = process.getElements();
            Element element = null;
            for (Element element2 : elements) {
                element = element2;
            }
            if (elements.size() == 1) {
                ExecutableContext executableContext =
                        new ElementFindableExecutableContext(
                                new DefaultExecutableContext(processContext)
                                , process);
                ExecutionResult executionResult = elementExecutor.execute(element, executableContext);
                setOutputIntoProcessContext(processContext, element, executionResult);
            }
        } else if (startEvent != null && process.getElements().size() > 1) {
            Flow nextFlow = new DefaultStartFlow(startEvent.getId());
            int executionLimit = 0;

            Set<SubProcess> subProcessesForParallel = new HashSet<>();

            while (!(nextFlow instanceof TerminalFlow)) {
                FlowNodeElement element
                        = process.nextTargetExecutableElementOf(nextFlow.targetElementId());
                if (element == null)
                    throw new IllegalStateException(
                            String.format("No executable element [%s] found.", nextFlow.targetElementId()));

                ExecutableContext executableContext =
                        new ElementFindableExecutableContext(
                                new DefaultExecutableContext(processContext)
                                , process);

                ExecutionResult executionResult = null;

                ErrorBoundaryEvent errorBoundaryEventElement = null;

                try {
                    executionResult = elementExecutor.execute(element, executableContext);
                } catch (Exception e) {
                    List<BoundaryEvent> boundaryEvents = process.attachedBoundaryEvents(element);
                    List<ErrorBoundaryEvent> errorBoundaryEvents =
                            boundaryEvents.stream().filter(el -> el instanceof ErrorBoundaryEvent)
                                    .map(el -> (ErrorBoundaryEvent) el)
                                    .sorted(Comparator.comparingInt(value ->
                                            value.getProperty(PRIORITY) == null ? Integer.MAX_VALUE :
                                                    Integer.parseInt(value.getProperty(PRIORITY).getValue())))
                                    .collect(Collectors.toList());
                    for (ErrorBoundaryEvent errorBoundaryEvent : errorBoundaryEvents) {
                        Class<?> exceptionClass = errorBoundaryEvent.getExceptionClass();
                        if (exceptionClass.isAssignableFrom(e.getClass())) {
                            log.error("Exception occurred but is ignored due to an error boundary event.", e);
                            errorBoundaryEventElement = errorBoundaryEvent;
                            break;
                        }
                    }

                    if (errorBoundaryEventElement == null)
                        throw e;
                    else
                        executionResult = elementExecutor.execute(errorBoundaryEventElement, executableContext);
                }

                if (executionResult != null && executionResult.result().getObject() instanceof ParallelGatewayFork) {
                    subProcessesForParallel.clear();
                    ParallelGatewayFork parallelGatewayFork =
                            executionResult.result().getObject(ParallelGatewayFork.class);
                    Collection<String> targetElementIds = parallelGatewayFork.targetElementIds();

                    Set<String> targetGateway = new HashSet<>();
                    SequentialFlow joinSequentialFlow = null;
                    for (String targetElementId : targetElementIds) {
                        FlowNodeElement flowNodeElement = process.nextTargetExecutableElementOf(targetElementId);
                        if (!(flowNodeElement instanceof SubProcess)) {
                            throw new IllegalStateException(
                                    "Only subprocesses can be positioned after a parallel gateway.");
                        } else {
                            SubProcess subProcess = (SubProcess) flowNodeElement;
                            List<BoundaryEvent> boundaryEvents = process.attachedBoundaryEvents(subProcess);
                            if (boundaryEvents.size() > 0)
                                throw new IllegalStateException(
                                        "Parallel gateway subprocesses cannot have boundary events.");
                            subProcessesForParallel.add(subProcess);
                        }

                        ComplexFlowNode complexFlowNode = (ComplexFlowNode) flowNodeElement;
                        if (complexFlowNode.conditionalFlows() != null
                                || complexFlowNode.defaultFlow() != null)
                            throw new IllegalStateException(
                                    "Subprocesses within a parallel gateway can only have sequential flows.");

                        joinSequentialFlow = complexFlowNode.sequenceFlow();
                        String targetGatewayId = joinSequentialFlow.targetElementId();
                        FlowNodeElement joinParallelGateway = process.nextTargetExecutableElementOf(targetGatewayId);
                        if (!(joinParallelGateway instanceof ParallelGateway))
                            throw new IllegalStateException(
                                    "After parallel execution processes, a parallel gateway must follow for joining.");

                        targetGateway.add(targetGatewayId);
                    }
                    if (targetGateway.size() != 1)
                        throw new IllegalStateException(
                                "Parallel process start and end require a paired parallel gateway to follow.");
                    nextFlow = joinSequentialFlow;
                    processContext.setParallelSubProcesses(subProcessesForParallel);

                } else {
                    if (executionResult != null &&
                            executionResult.result().getObject() instanceof ParallelGatewayJoin) {
                        subProcessesForParallel.clear();
                    }

                    if (errorBoundaryEventElement != null) {
                        setOutputIntoProcessContext(processContext, errorBoundaryEventElement, executionResult);
                        nextFlow = pickNextFlow(errorBoundaryEventElement,
                                executionResult == null ? null : executionResult.result());

                    } else {
                        setOutputIntoProcessContext(processContext, element, executionResult);
                        nextFlow = pickNextFlow(element, executionResult == null ? null : executionResult.result());
                    }
                }
                executionLimit++;
                if (executionLimitCount < executionLimit)
                    throw new RuntimeException(
                            String.format("Exceeded the maximum allowable execution count. %d", executionLimitCount));

            }
        } else {
            throw new IllegalStateException(
                    "The process is incorrect. There must be either one task or start and end events.");
        }
    }

    private void verifyProperties(Process initialProcess) {
        Set<String> values = initialProcess.properties().exportProperties().keySet();
        for (String value : values) {
            if (!this.acceptablePropertyNames.contains(value))
                throw new PropertyException(
                        String.format("[%s] is an unavailable attribute. Element [%s](%s). Executor [%s]",
                                value, initialProcess.getId(), initialProcess.getName(), this.getClass().getName()));
        }
    }

    private Flow pickNextFlow(FlowNode flowNode, TypedObject typedObject) {
        Flow nextFlow = null;
        for (FlowPicker flowPicker : flowPickers) {
            nextFlow = flowNode.pick(flowPicker, typedObject);
            if (nextFlow != null)
                break;
        }
        if (nextFlow == null)
            throw new IllegalFlowException("No flow picked.");
        return nextFlow;
    }

    private void setOutputIntoProcessContext(ProcessContext processContext,
                                             Element element,
                                             ExecutionResult executionResult) {
        if (executionResult == null)
            return;

        if (executionResult.useObject()) {
            processContext.registerObject(executionResult.result().getObject(),
                    new SingleObjectRegisterInfo(executionResult.result().getObject().getClass(),
                            ObjectSustainLevel.PROCESS));
        }

        Property property = element.getProperty(OUTPUT_KEY);
        String outputKey = null;
        if (property != null) {
            List<PropertyExpression> propertyExpressions = PropertyParser.parse(property);
            if (propertyExpressions.size() > 1)
                throw new PropertyException(
                        String.format(
                                "The [%s] property cannot be specified with more than one value separated by [,]",
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
                            "The value [%s] of property [%s] is duplicated with a manually entered output value key.",
                            outputKey, OUTPUT_KEY));

        for (Map.Entry<String, TypedObject> entry : outputs.entrySet()) {
            processContext.add(entry.getKey(), entry.getValue());
        }

    }
}
