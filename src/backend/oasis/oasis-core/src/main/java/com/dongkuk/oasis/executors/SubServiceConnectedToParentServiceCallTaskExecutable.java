package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.model.activity.SubServiceCallTask;
import com.dongkuk.oasis.process.ProcessStarter;
import com.dongkuk.oasis.process.ProcessStarterFactory;
import com.dongkuk.oasis.service.*;

import java.util.List;
import java.util.Map;

/**
 * 메인 서비스와 연결된 서브 서비스를 실행한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class SubServiceConnectedToParentServiceCallTaskExecutable extends AbstractSubServiceCallTaskExecutable {
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(SubServiceConnectedToParentServiceCallTaskExecutable.class);

    /**
     * @param subServiceCallTask    subServiceCallTask
     * @param processStarterFactory processStarterFactory
     */
    public SubServiceConnectedToParentServiceCallTaskExecutable(SubServiceCallTask subServiceCallTask,
                                                                ProcessStarterFactory processStarterFactory) {
        super(subServiceCallTask, processStarterFactory);
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        ServiceFindableContext elementFindableExecutableNodeContext
                = (ServiceFindableContext) executableContext.processContext();

        Service service = elementFindableExecutableNodeContext.service(subServiceCallTask.serviceId());
        ServiceContext serviceContext = executableContext.serviceContext();

        Process initialProcess = service.getInitialProcess();
        Map<String, TypedObject> serviceInputs = createServiceInput(initialProcess, executableContext);
        ServiceContext subServiceContext = serviceContext.createSubServiceContext(serviceInputs);

        List<Class<?>> classes = extractDtoClasses();

        Map<String, TypedObject> serviceInputsWithDtos =
                new DtoGeneratorWithContext().generateDto(classes,
                        subServiceContext,
                        executableContext.processContext());
        serviceInputsWithDtos.putAll(subServiceContext.serviceInputs());
        ServiceContext subServiceContextWithDtos = subServiceContext.createSubServiceContext(serviceInputsWithDtos);

        ServiceContext adaptedServiceContext =
                new DefaultServiceContextAdapter().adaptServiceInput(subServiceContextWithDtos, initialProcess);
        adaptedServiceContext =
                new DtoServiceContextAdapter().adaptServiceInput(adaptedServiceContext, initialProcess);

        ProcessContext processContext = new DefaultProcessContext(adaptedServiceContext);
        ServiceFindableProcessContext serviceFindableProcessContext
                = new ServiceFindableProcessContext(processContext, elementFindableExecutableNodeContext);

        ProcessStarter processStarter = processStarterFactory.generateProcessStarter();

        log.info("Sub-service [{}] start.", subServiceCallTask.serviceId());
        boolean hasException = false;
        try {
            processStarter.start(initialProcess, serviceFindableProcessContext);
        } catch (Exception e) {
            hasException = true;
            throw e;
        } finally {
            if (!hasException)
                log.info("Sub-service [{}] finish.", subServiceCallTask.serviceId());
            else
                log.error("Sub-service [{}] finish with exceptions.", subServiceCallTask.serviceId());
        }

        SubProcessResult subProcessResult = new SubProcessResult(serviceFindableProcessContext);

        return new UnmodifiableExecutionResult(new TypedObject(subProcessResult));
    }
}
