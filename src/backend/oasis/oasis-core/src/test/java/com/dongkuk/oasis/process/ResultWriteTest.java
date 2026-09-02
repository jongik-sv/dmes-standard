package com.dongkuk.oasis.process;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.EmptyApplicationContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;

/**
 * @author Jeongjin Kim
 * @since 2021-04-12
 */
public class ResultWriteTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void processStartUsage() {
        Service service = getService("/process/ResultWriteTest/tryModifyResult.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        Assertions.assertThatExceptionOfType(UnsupportedOperationException.class).isThrownBy(
                () -> processStarter.start(process, processContext)
        );
    }
}
