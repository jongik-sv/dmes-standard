package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.ClassNameResolver;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.TaskExecutionException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.wow.Wow;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class JavaServiceTaskExecutable implements Executable {
    private final Executable executable;
    String methodName;
    String fullQualifiedClassName;
    private String classNameFromTask;

    /**
     * @param javaServiceTask   plainJavaServiceTaskExecutor
     * @param classNameResolver classNameResolver
     */
    @SuppressWarnings("unchecked")
    public JavaServiceTaskExecutable(JavaServiceTask javaServiceTask,
                                     ClassNameResolver classNameResolver) {
        classNameFromTask = javaServiceTask.getClassName();
        String[] classNameAndMethod = classNameFromTask.split("#");
        methodName = null;

        if (classNameAndMethod.length == 2) {
            classNameFromTask = classNameAndMethod[0];
            methodName = classNameAndMethod[1];
        }

        fullQualifiedClassName = classNameResolver.resolve(classNameFromTask);

        Class<?> aClass;
        try {
            aClass = Class.forName(fullQualifiedClassName);
        } catch (ClassNotFoundException e) {
            aClass = null;
        }

        if (aClass != null && Wow.class.isAssignableFrom(aClass)) {
            executable = new WowJavaServiceTaskExecutable((Class<Wow>) aClass, javaServiceTask);
        } else {
            executable = new PlainJavaServiceTaskExecutable(aClass,
                    javaServiceTask,
                    methodName,
                    fullQualifiedClassName);
        }
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        try {
            return executable.execute(executableContext);
        } catch (ObjectNotFoundException e) {
            throw new IllegalStateException(
                    String.format(
                            "Object not found. Resolved FullQualifiedClassName : [%s], Task entered ClassName : [%s]",
                            fullQualifiedClassName,
                            classNameFromTask));
        }
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return executable.canAcceptProperty(propertyName);
    }
}
