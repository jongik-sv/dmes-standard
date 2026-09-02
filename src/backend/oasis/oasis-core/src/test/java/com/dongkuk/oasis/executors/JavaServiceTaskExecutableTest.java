package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.exceptions.TaskExecutionException;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2022-05-30
 */
class JavaServiceTaskExecutableTest {
    @Test
    void givenObjectInProcessContextAndObjectNameThenUseIt() {
        JavaServiceTaskExecutable executable = new JavaServiceTaskExecutable(
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "nicname#getName",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                new NonModifyClassNameResolver()
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        DefaultProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        processContext.add("nicname", new TypedObject(new NickName("nicknick")));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("nicknick");
    }

    @Test
    void givenObjectInProcessContextButWrongClassNameThenException() {
        JavaServiceTaskExecutable executable = new JavaServiceTaskExecutable(
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName2#getName",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                new NonModifyClassNameResolver()
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        DefaultProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        processContext.add("nicname", new TypedObject(new NickName("nicknick")));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        Assertions.assertThatExceptionOfType(TaskExecutionException.class)
                .isThrownBy(() -> executable.execute(executableContext));
    }

    @Test
    void givenObjectInApplicationContextAndObjectNameThenUseIt() {
        JavaServiceTaskExecutable executable = new JavaServiceTaskExecutable(
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "nicname",
                        new PropertyContainer()
                                .add(new Property("new", "false"))
                                .add(new Property("method", "getName")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                new NonModifyClassNameResolver()
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        applicationContext.put("nicname", new TypedObject(new NickName("nicknick")));
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("nicknick");
    }

    @Test
    void givenObjectInApplicationContextAndObjectNameThenUseItRatherThenExistClass(){
        JavaServiceTaskExecutable executable = new JavaServiceTaskExecutable(
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName",
                        new PropertyContainer()
                                .add(new Property("new", "false"))
                                .add(new Property("method", "getName")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                new NonModifyClassNameResolver()
        );
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        applicationContext.put("com.dongkuk.oasis.executors.NickName", new TypedObject(new NickNameMock()));
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("mock");
    }

    @Test
    void givenObjectInApplicationContextAndObjectNameThenUseItRatherThenExistClassEvenNewPropertySet(){
        JavaServiceTaskExecutable executable = new JavaServiceTaskExecutable(
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName",
                        new PropertyContainer()
                                .add(new Property("new", "true"))
                                .add(new Property("method", "getName")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                new NonModifyClassNameResolver()
        );
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        applicationContext.put("com.dongkuk.oasis.executors.NickName", new TypedObject(new NickNameMock()));
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("mock");
    }
}