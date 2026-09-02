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
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;

/**
 * @author Jeongjin Kim
 * @since 2021-04-07
 */
public class BranchingTest {
    @Test
    void processStartUsage() {
        Service service = getService("/process/BranchingTest/conditionBranching.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
                new NonModifyClassNameResolver()).generateProcessStarter();
        processStarter.start(process, processContext);
    }

    @Test
    void gatewayBranching() {
        Service service = getService("/process/BranchingTest/gatewayBranching.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
                new NonModifyClassNameResolver()).generateProcessStarter();
        processStarter.start(process, processContext);
    }

    @Test
    void taskBranching() {
        Service service = getService("/process/BranchingTest/taskBranching.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("flowName", new TypedObject("simple"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
                new NonModifyClassNameResolver()).generateProcessStarter();

        processStarter.start(process, processContext);
        TypedObject out = processContext.elementOutput("out");
        Assertions.assertThat(out.getObject()).isEqualTo("out1");
    }

    @Test
    void taskBranching2() {
        Service service = getService("/process/BranchingTest/taskBranching.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .addEntity("flowName", new TypedObject("complicated"))
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
                new NonModifyClassNameResolver()).generateProcessStarter();

        processStarter.start(process, processContext);
        TypedObject out = processContext.elementOutput("out");
        Assertions.assertThat(out.getObject()).isEqualTo("out2");
    }

    @Test
    void nameConditionalBranch() {
        Service service = getService("/process/BranchingTest/nameConditionalBranching.bpmn");

        Process process = service.getInitialProcess();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext()
                , new MapBuilder<String, TypedObject>()
                .build());
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
                new NonModifyClassNameResolver()).generateProcessStarter();

        processStarter.start(process, processContext);
        TypedObject out = processContext.elementOutput("re");
        Assertions.assertThat(out.getObject()).isEqualTo("c");
    }
}
