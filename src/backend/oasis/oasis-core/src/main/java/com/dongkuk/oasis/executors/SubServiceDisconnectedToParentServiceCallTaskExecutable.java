package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.event.MessageSendEvent;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.dongkuk.oasis.message.Message;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.model.activity.SubServiceCallTask;
import com.dongkuk.oasis.process.ProcessStarterFactory;
import com.dongkuk.oasis.service.ServiceFindableContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.slf4j.MDC;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static com.dongkuk.oasis.model.PropertyNames.OUTPUT_KEY;

class SubServiceDisconnectedToParentServiceCallTaskExecutable extends AbstractSubServiceCallTaskExecutable {
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(SubServiceDisconnectedToParentServiceCallTaskExecutable.class);

    public SubServiceDisconnectedToParentServiceCallTaskExecutable(
            SubServiceCallTask subServiceCallTask,
            ProcessStarterFactory processStarterFactory,
            int timeoutSecond) {
        super(subServiceCallTask, processStarterFactory, timeoutSecond);
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        ServiceStarter serviceStarter;
        List<TypedObject> typedObjects = executableContext.get(ServiceStarter.class);
        if (typedObjects == null || typedObjects.isEmpty()) {
            throw new IllegalStateException("ServiceStarter is not found.");
        } else if (typedObjects.size() > 1) {
            throw new IllegalStateException("Too many ServiceStarter is found.");
        } else {
            serviceStarter = typedObjects.get(0).getObject(ServiceStarter.class);
        }

        Service service = ((ServiceFindableContext) executableContext.processContext())
                .service(subServiceCallTask.serviceId());

        Process initialProcess = service.getInitialProcess();
        ServiceContext serviceContext = executableContext.serviceContext();
        Map<String, TypedObject> serviceInputs = createServiceInput(initialProcess, executableContext);
        ServiceContext subServiceContext = serviceContext.createServiceContext(serviceInputs);
        boolean parallelExecution = ParallelExecutionScope.isActive();

        ExecutorService executorService = Executors.newFixedThreadPool(1);

        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        final ServiceResult[] serviceResults = new ServiceResult[1];
        executorService.execute(() -> new MDCTemplate() {
            @Override
            public void process() {
                if (parallelExecution) {
                    try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
                        log.info("Disconnected Sub-service [{}] start.", subServiceCallTask.serviceId());
                        serviceResults[0] = serviceStarter.start(subServiceCallTask.serviceId(), subServiceContext);
                        log.info("Disconnected Sub-service [{}] finish.", subServiceCallTask.serviceId());
                    }
                } else {
                    log.info("Disconnected Sub-service [{}] start.", subServiceCallTask.serviceId());
                    serviceResults[0] = serviceStarter.start(subServiceCallTask.serviceId(), subServiceContext);
                    log.info("Disconnected Sub-service [{}] finish.", subServiceCallTask.serviceId());
                }
            }
        }.mdc(serviceTag));

        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(timeoutSecond, TimeUnit.SECONDS)) {
                executorService.shutdownNow();
            }
        } catch (InterruptedException ex) {
            throw new RuntimeException(ex);
        }
        for (Message message : serviceResults[0].messages()) {
            serviceContext.raiseEvent(new MessageSendEvent(message));
        }
        return new UnmodifiableExecutionResult(new TypedObject(serviceResults[0]));
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
                                "The [%s] property cannot be specified for more than 2 items separated by [,].",
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
                            "The value [%s] of the [%s] property conflicts " +
                                    "with the directly inputted output value key.",
                            outputKey, OUTPUT_KEY));

        for (Map.Entry<String, TypedObject> entry : outputs.entrySet()) {
            processContext.add(entry.getKey(), entry.getValue());
        }

    }
}
