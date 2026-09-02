package usecase.userException;

import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-08-19
 */
public class RuntimeExceptionTest {
    @Test
    void runtimeException() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/userException/runtimeException.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());
        ServiceResult userExceptionEvent = serviceStarter.start("userExceptionEvent", serviceContext);
        Assertions.assertThat(userExceptionEvent.exception()).isInstanceOf(RuntimeException.class);
    }
}
