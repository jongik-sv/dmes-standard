package usecase;

import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

public class ServiceTypeInputTest {

    @Test
    void whenInputTypeServiceLoadTest() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/nickName.bpmn");
        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());
        ServiceResult serviceResult = serviceStarter.start("nickName", serviceContext);

        assertEquals(ServiceResultCode.SUCCESS, serviceResult.serviceResultCode());
        assertEquals("Eliza", serviceResult.result("helloName").getObject(String.class));
    }

}
