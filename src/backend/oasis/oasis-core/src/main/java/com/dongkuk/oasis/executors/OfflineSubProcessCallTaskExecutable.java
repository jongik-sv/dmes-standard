package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.SubProcessResult;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.model.activity.OfflineSubProcessCallTask;
import com.dongkuk.oasis.process.ElementFindableContext;
import com.dongkuk.oasis.process.ProcessStarterFactory;

import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class OfflineSubProcessCallTaskExecutable extends SubProcessExecutable {
    private final OfflineSubProcessCallTask offlineSubProcessCallTask;
    private final List<String> acceptablePropertyNames =
            Arrays.asList(PROCESS_ID, OUTPUT_KEY, INPUT_KEY, PROCESS_DTO);
    private final List<String> acceptablePropertyNamesOfSubProcess
            = Arrays.asList(INPUT_KEY, PROCESS_DTO);
    private final ProcessStarterFactory processStarterFactory;

    /**
     * @param offlineSubProcessCallTask offlineSubProcessCallTask
     * @param processStarterFactory     processStarterFactory
     */
    public OfflineSubProcessCallTaskExecutable(OfflineSubProcessCallTask offlineSubProcessCallTask,
                                               ProcessStarterFactory processStarterFactory) {
        this.offlineSubProcessCallTask = offlineSubProcessCallTask;
        this.processStarterFactory = processStarterFactory;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        ElementFindableContext elementFindableExecutableNodeContext
                = (ElementFindableContext) executableContext;
        Property processIdProperty = offlineSubProcessCallTask.getProperty(PROCESS_ID);
        if (processIdProperty == null)
            throw new IllegalArgumentException("Required value missing, " + PROCESS_ID);

        SubProcess subProcess =
                (SubProcess) elementFindableExecutableNodeContext.element(processIdProperty.getValue());

        validateSubProcessProperties(subProcess);

        Property inputProperty = offlineSubProcessCallTask.getProperty(INPUT_KEY);
        if (inputProperty == null)
            inputProperty = subProcess.getProperty(INPUT_KEY);

        Map<String, TypedObject> inputs = new HashMap<>();
        inputs.putAll(subProcess.inputs().export());
        inputs.putAll(offlineSubProcessCallTask.inputs().export());

        SubProcessResult subProcessResult = runSubProcess(executableContext,
                subProcess,
                processStarterFactory.generateProcessStarter(),
                inputProperty,
                inputs);
        return new UnmodifiableExecutionResult(new TypedObject(subProcessResult));
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }

    private void validateSubProcessProperties(Element element) {
        Set<String> values = element.properties().exportProperties().keySet();
        for (String value : values) {
            if (!acceptablePropertyNamesOfSubProcess.contains(value))
                throw new PropertyException(
                        String.format("[%s] is an unavailable attribute. element [%s](%s)",
                                value, element.getId(), element.getName()));
        }
    }
}
