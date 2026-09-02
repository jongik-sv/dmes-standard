package com.dongkuk.oasis.process;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.BpmnServiceLoaderForTest;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-08-20
 */
public class JavaObjectSustainInProcessTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void createdJavaObjectShouldSustainInProcess() {
        Service service = getService("/process/JavaObjectSustainInProcessTest/javaObjectSustain.bpmn");
        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        processStarter.start(process, processContext);

        TypedObject typedObject = processContext.get("state");
        assertThat(typedObject.getObject()).isEqualTo("started");
    }

    @Test
    void createdJavaObjectShouldNotSustainInProcessIfNewPropertyIsFalse() {
        Service service = getService("/process/JavaObjectSustainInProcessTest/javaObjectSustain.bpmn");
        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        processStarter.start(process, processContext);

        TypedObject typedObject = processContext.get("state2");
        assertThat(typedObject.getObject()).isNull();
    }

    @Test
    void runInlineSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/JavaObjectSustainInProcessTest/inlineSubProcess.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("inlineSubProcess",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        TypedObject state2 = inlineSubProcess.result("state2");
        assertThat(state2.getObject()).isEqualTo("started");

        TypedObject inlineOutput = inlineSubProcess.result("inlineOutput");
        SubProcessResult object = inlineOutput.getObject(SubProcessResult.class);
        Object state = object.get("state");
        assertThat(state).isNull();
    }
}
