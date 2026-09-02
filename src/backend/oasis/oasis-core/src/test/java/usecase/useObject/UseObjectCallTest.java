package usecase.useObject;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * @author Jeongjin Kim
 * @since 2022-06-19
 */
public class UseObjectCallTest {
    @Test
    void givenTaskObjectThenUseIt() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/useObject/useObject.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);
        TypedObject result = mainService.result("result");
        Assertions.assertThat(result.getObject()).isEqualTo("factory");
    }

    @Test
    void givenTaskObjectButNewPropertySetThenCreateNew() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/useObject/useSelfObject.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);
        TypedObject result = mainService.result("result");
        Assertions.assertThat(result.getObject()).isEqualTo("self");
    }
}
