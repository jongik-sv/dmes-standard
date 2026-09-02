package usecase.exceptionControll;

import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class OrderWithExceptionTest {

    @Test
    void order() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/callDomainObjectWithException.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult callDomainObjectWithException = serviceStarter.start("callDomainObjectWithException", serviceContext);
        Assertions.assertThat(callDomainObjectWithException.exception()).isInstanceOf(RuntimeException.class);
        Assertions.assertThat(callDomainObjectWithException.serviceResultMessage()).isEqualTo("런타임 익셉숀");
    }
}
