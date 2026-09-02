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
 * @since 2021-07-21
 */
public class UserExceptionEndEventTest {
    @Test
    void userExceptionMessageBindingWithInput() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/userException/userExceptionEvent.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("userExceptionEvent", serviceContext);
        PlainServiceResult plainServiceResult = new PlainServiceResult(serviceResult);

        System.out.println(plainServiceResult);
        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isEqualTo("blabla 설정을 잘못 했습니다. jee에게 문의하세요.");
    }

    @Test
    void userExceptionMessageBindingWithoutInput() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/userException/userExceptionEventPlainMessage.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("userExceptionEvent", serviceContext);
        PlainServiceResult plainServiceResult = new PlainServiceResult(serviceResult);

        System.out.println(plainServiceResult);
        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isEqualTo("사용자 예외가 발생했습니다.");
    }

    @Test
    void noUserExceptionMessageBinding() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/userException/noUserExceptionEvent.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("userExceptionEvent", serviceContext);
        PlainServiceResult plainServiceResult = new PlainServiceResult(serviceResult);

        System.out.println(plainServiceResult);
        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isEqualTo("사용자 예외가 발생했습니다.");
    }
}
