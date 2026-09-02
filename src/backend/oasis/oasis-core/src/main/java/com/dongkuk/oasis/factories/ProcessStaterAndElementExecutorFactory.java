package com.dongkuk.oasis.factories;

import com.dongkuk.oasis.ClassNameResolver;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.execution.ElementExecutorFactory;
import com.dongkuk.oasis.executors.CoreElementExecutor;
import com.dongkuk.oasis.executors.CoreExecutorResolver;
import com.dongkuk.oasis.executors.StopWatchElementExecutor;
import com.dongkuk.oasis.process.CoreProcessStarter;
import com.dongkuk.oasis.process.ProcessStarter;
import com.dongkuk.oasis.process.ProcessStarterFactory;
import com.dongkuk.oasis.process.StopWatchProcessStarter;

/**
 * @author Jeongjin Kim
 * @since 2021-07-12
 */
public class ProcessStaterAndElementExecutorFactory implements ProcessStarterFactory, ElementExecutorFactory {
    private final ClassNameResolver classNameResolver;
    private final int maxThreads;
    private final int timeoutSecond;

    /**
     * @param classNameResolver classNameResolver
     * @param maxThreads        maxThreads
     * @param timeoutSecond     timeoutSecond
     */
    public ProcessStaterAndElementExecutorFactory(
            ClassNameResolver classNameResolver, int maxThreads, int timeoutSecond) {
        this.classNameResolver = classNameResolver;
        this.maxThreads = maxThreads;
        this.timeoutSecond = timeoutSecond;
    }

    /**
     * {@code maxThreads}는 10, {@code timeSecond}는 50 으로 기본값 설정한다.
     *
     * @param classNameResolver classNameResolver
     */
    public ProcessStaterAndElementExecutorFactory(
            ClassNameResolver classNameResolver) {
        this(classNameResolver, 10, 50);
    }

    @Override
    public ProcessStarter generateProcessStarter() {
        return new StopWatchProcessStarter(
                new CoreProcessStarter(
                        generateElementExecutor()
                ));
    }

    @Override
    public ElementExecutor generateElementExecutor() {
        return new StopWatchElementExecutor(
                new CoreElementExecutor(
                        new CoreExecutorResolver(classNameResolver,
                                this,
                                this,
                                maxThreads,
                                timeoutSecond)));
    }
}
