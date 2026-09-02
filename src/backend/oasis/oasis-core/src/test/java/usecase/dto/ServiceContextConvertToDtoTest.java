package usecase.dto;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.Test;

import java.util.Collections;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;

public class ServiceContextConvertToDtoTest {
    @Test
    void givenDtoClassInProcessThenGenerateDtoAndUse() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/dto/service_dto_generator.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(Collections.emptyMap());

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("no", new TypedObject(10))
                        .build());

        ServiceResult callDomainObject = serviceStarter.start("callDomainObject", serviceContext);
        assertThat(callDomainObject.result("data").getObject())
                .isEqualTo("ServiceDto{id='null', no=10, startData=null}");
    }

    @Test
    void givenIllegalDtoClassThenExceptionReturn() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/dto/service_dto_generator_no_class.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(Collections.emptyMap());

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("no", new TypedObject(10))
                        .build());

        ServiceResult callDomainObject = serviceStarter.start("callDomainObject", serviceContext);
        assertThat(callDomainObject.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
    }
}
