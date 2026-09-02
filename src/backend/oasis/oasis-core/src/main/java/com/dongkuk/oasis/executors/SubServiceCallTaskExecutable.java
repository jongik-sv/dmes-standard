package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.SubServiceCallTask;
import com.dongkuk.oasis.process.ProcessStarterFactory;

import static com.dongkuk.oasis.model.PropertyNames.CREATE_NEW_SERVICE;

class SubServiceCallTaskExecutable extends AbstractSubServiceCallTaskExecutable {
    private Executable executable;

    /**
     * @param subServiceCallTask    subServiceCallTask
     * @param processStarterFactory processStarterFactory
     * @param timeoutSecond         timeoutSecond
     */
    public SubServiceCallTaskExecutable(SubServiceCallTask subServiceCallTask,
                                        ProcessStarterFactory processStarterFactory, int timeoutSecond) {
        super(subServiceCallTask, processStarterFactory, timeoutSecond);
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Property property = subServiceCallTask.getProperty(CREATE_NEW_SERVICE);
        if (property != null && Boolean.parseBoolean(property.getValue())) {
            executable = new SubServiceDisconnectedToParentServiceCallTaskExecutable(
                    subServiceCallTask, processStarterFactory, timeoutSecond);
        } else {
            executable = new SubServiceConnectedToParentServiceCallTaskExecutable(
                    subServiceCallTask, processStarterFactory);
        }
        return executable.execute(executableContext);
    }
}
