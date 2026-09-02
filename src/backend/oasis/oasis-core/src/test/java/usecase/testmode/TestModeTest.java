package usecase.testmode;

import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class TestModeTest {
    @Test
    void givenClassToObjectMapUseTheObjectInsteadSpecifiedClassOnTheTask() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/testmode.bpmn");

        DefaultServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());
        TaskClassToRun mock = mock(TaskClassToRun.class);
        when(mock.run()).thenReturn("test");
        Map<String, Object> classToTestObjectMap = new HashMap<>();
        classToTestObjectMap.put(TaskClassToRun.class.getName(), mock);
        serviceContext.setClassToObjectMap(classToTestObjectMap);

        ServiceResult serviceResult = serviceStarter.start("testmode", serviceContext);
        String result = serviceResult.result("result").getObject(String.class);

        Assertions.assertThat(result).isEqualTo("test");
    }
}
