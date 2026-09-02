package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.ClassNameResolver;
import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.execution.ElementExecutorFactory;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutorResolver;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.ErrorBoundaryEvent;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.model.activity.*;
import com.dongkuk.oasis.model.event.DefaultEndEvent;
import com.dongkuk.oasis.model.event.DefaultErrorBoundaryEvent;
import com.dongkuk.oasis.model.event.DefaultStartEvent;
import com.dongkuk.oasis.model.event.UserExceptionEndEvent;
import com.dongkuk.oasis.model.gateway.DefaultExclusiveGateway;
import com.dongkuk.oasis.model.gateway.DefaultParallelGateway;
import com.dongkuk.oasis.process.ProcessStarterFactory;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
public final class CoreExecutorResolver implements ExecutorResolver {
    private final ClassNameResolver classNameResolver;
    private final ProcessStarterFactory processStarterFactory;
    private final ElementExecutorFactory elementExecutorFactory;
    private final int maxThreads;
    private final int timeoutSecond;

    /**
     * @param classNameResolver      클래스 이름 결정자
     * @param processStarterFactory  processStarterFactory
     * @param elementExecutorFactory elementExecutorFactory
     * @param maxThreads             병렬 처리시 최대 동시 실행 스레드 수
     * @param timeoutSecond          병렬 처리시 최대 대기 시간
     */
    public CoreExecutorResolver(ClassNameResolver classNameResolver,
                                ProcessStarterFactory processStarterFactory,
                                ElementExecutorFactory elementExecutorFactory,
                                int maxThreads,
                                int timeoutSecond) {
        this.classNameResolver = classNameResolver == null ? new NonModifyClassNameResolver() : classNameResolver;
        this.processStarterFactory = processStarterFactory;
        this.elementExecutorFactory = elementExecutorFactory;
        this.maxThreads = maxThreads;
        this.timeoutSecond = timeoutSecond;
    }

    @Override
    public Executable find(Element element) {
        if (element instanceof DefaultInlineSubProcess)
            return new InlineSubProcessExecutable((SubProcess) element, processStarterFactory);
        else if (element instanceof DefaultTask)
            return new DefaultTaskExecutable((DefaultTask) element);
        else if (element instanceof OfflineSubProcessCallTask)
            return new OfflineSubProcessCallTaskExecutable((OfflineSubProcessCallTask) element, processStarterFactory);
        else if (element instanceof JavaServiceTask)
            return new JavaServiceTaskExecutable((JavaServiceTask) element, classNameResolver);
        else if (element instanceof SqlScriptTask)
            return new SqlScriptTaskExecutable((SqlScriptTask) element);
        else if (element instanceof ProcedureScriptTask)
            return new ProcedureScriptTaskExecutable((ProcedureScriptTask) element);
        else if (element instanceof SubServiceCallTask)
            return new SubServiceCallTaskExecutable(
                    (SubServiceCallTask) element, processStarterFactory, timeoutSecond);
        else if (element instanceof TransactionScriptTask)
            return new TransactionScriptTaskExecutable((TransactionScriptTask) element);
        else if (element instanceof DefaultStartEvent)
            return new StartEventExecutable();
        else if (element instanceof DefaultEndEvent)
            return new EndEventExecutable();
        else if (element instanceof UserExceptionEndEvent)
            return new UserExceptionEndEventExecutable((UserExceptionEndEvent) element);
        else if (element instanceof ErrorBoundaryEvent)
            return new ErrorBoundaryEventExecutable((DefaultErrorBoundaryEvent) element);
        else if (element instanceof DefaultExclusiveGateway)
            return new ExclusiveGatewayExecutable((DefaultExclusiveGateway) element);
        else if (element instanceof DefaultParallelGateway)
            return new ParallelGatewayExecutable((DefaultParallelGateway) element,
                    elementExecutorFactory,
                    maxThreads,
                    timeoutSecond);
        else if (element instanceof ExternalSendTask)
            return new ExternalSendTaskExecutable((ExternalSendTask) element);
        else
            throw new IllegalArgumentException("Unsupported element type.");
    }
}
