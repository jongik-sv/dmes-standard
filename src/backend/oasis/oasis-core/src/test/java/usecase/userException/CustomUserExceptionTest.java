package usecase.userException;

import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.PlainServiceResult;
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
public class CustomUserExceptionTest {
    @Test
    void customUserException() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/userException/customUserException.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("userExceptionEvent", serviceContext);
        PlainServiceResult plainServiceResult = new PlainServiceResult(serviceResult);

        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isEqualTo("검증 예외");
    }
}
