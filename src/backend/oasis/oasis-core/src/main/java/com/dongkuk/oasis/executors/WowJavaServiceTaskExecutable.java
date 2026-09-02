package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultWowContext;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.WowContext;
import com.dongkuk.oasis.exceptions.IllegalTaskException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.wow.Wow;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class WowJavaServiceTaskExecutable implements Executable {
    private final JavaServiceTask wowJavaServiceTask;
    private final Class<Wow> aClass;

    /**
     * @param wowJavaServiceTask wowJavaServiceTask
     * @param aClass             class
     */
    public WowJavaServiceTaskExecutable(Class<Wow> aClass, JavaServiceTask wowJavaServiceTask) {
        this.wowJavaServiceTask = wowJavaServiceTask;
        this.aClass = aClass;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Wow wow;
        try {
            wow = aClass.newInstance();
        } catch (InstantiationException | IllegalAccessException e) {
            throw new IllegalTaskException(aClass.getName() + " Creation failed", e);
        }
        WowContext wowContext = new DefaultWowContext(executableContext,
                wowJavaServiceTask.properties().exportProperties());
        TypedObject result = wow.run(wowContext);
        return new UnmodifiableExecutionResult(result, wowJavaServiceTask.outputs().export());
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return true;
    }
}
