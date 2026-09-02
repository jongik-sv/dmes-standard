package com.dongkuk.oasis.process;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.EmptyApplicationContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-04-16
 */
public class MethodParameterBindTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void stringBind() {
        Service service = getService("/process/MethodParameterBindTest/methodBinding.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );
        processContext.add("name", new TypedObject("sister"));
        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("hello sister");
    }

    @Test
    void stringBindFails() {
        Service service = getService("/process/MethodParameterBindTest/methodBinding.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );
        processContext.add("wrongName", new TypedObject("sister"));

        assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                processStarter.start(process, processContext)
        );
    }

    @Test
    void inputStringBind() {
        Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("string"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("hello sister");
    }

    @Test
    void inputMapBind() {
        Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("map"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("success");
    }

    @Test
    void inputListBind() {
        Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("list"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("success");
    }

    @Test
    void inputStringListBind() {
        Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("stringList"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("success");
    }

    @Test
    void inputIntBind() {
        Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("int"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("success");
    }

    @Test
    void inputDoubleBind() {
        Service service = getService("/process/MethodParameterBindTest/inputBinding.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("double"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);
        TypedObject result = processContext.elementOutput("result");
        String object = result.getObject(String.class);
        assertThat(object).isEqualTo("success");
    }
}
