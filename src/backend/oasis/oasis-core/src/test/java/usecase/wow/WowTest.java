package usecase.wow;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class WowTest {
    Map<String, TypedObject> applicationContextMap = new HashMap<>();
    WowRepositorySpy wowRepositorySpy;

    @BeforeEach
    void initApplicationContext() {
        wowRepositorySpy = new WowRepositorySpy();
        applicationContextMap.put("wowRepository", new TypedObject(wowRepositorySpy));
    }

    @Test
    void runWow() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/wowClassCall.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(applicationContextMap);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("id", new TypedObject("3"))
                .build());

        serviceStarter.start("callDomainObject", serviceContext);

        assertThat(wowRepositorySpy.getSavedId()).isEqualTo("3");
    }
}
