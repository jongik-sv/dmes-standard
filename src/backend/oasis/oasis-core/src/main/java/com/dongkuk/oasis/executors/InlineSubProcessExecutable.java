package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.SubProcessResult;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.process.ProcessStarterFactory;

import java.util.Arrays;
import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class InlineSubProcessExecutable extends SubProcessExecutable {
    private final SubProcess subProcess;
    private final ProcessStarterFactory processStarterFactory;
    private final List<String> acceptablePropertyNames = Arrays.asList(OUTPUT_KEY, INPUT_KEY, PROCESS_DTO);

    /**
     * @param subProcess            defaultOfflineSubProcess
     * @param processStarterFactory processStarterFactory
     */
    public InlineSubProcessExecutable(SubProcess subProcess, ProcessStarterFactory processStarterFactory) {
        this.subProcess = subProcess;
        this.processStarterFactory = processStarterFactory;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {

        SubProcessResult subProcessResult = runSubProcess(executableContext,
                subProcess,
                processStarterFactory.generateProcessStarter(),
                subProcess.getProperty(INPUT_KEY),
                subProcess.inputs().export());
        return new UnmodifiableExecutionResult(new TypedObject(subProcessResult));
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }
}
