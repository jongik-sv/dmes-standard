package usecase.sequential;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

public class SequentialElementConvertToObjectTest {
    @Test
    void givenDtoClassOnCollectionElementVariableThenConvertToObject() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/sequential/convertMapToObject.bpmn");
        SpyClass spyClass = new SpyClass();
        List<Map<String, Object>> maps = Arrays.asList(
                new MapBuilder<String, Object>().addEntity("name", "John").addEntity("age", 30).build(),
                new MapBuilder<String, Object>().addEntity("name", "Mike").addEntity("age", 10).build());
        Map<String, TypedObject> s = new TypedMapBuilder()
                .addEntity("ids", new TypedObject(maps, new TypeReference<List<Map<String, Object>>>() {
                }))
                .addEntity("spy", spyClass).build();

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), s);

        ServiceResult serviceResult = serviceStarter.start("convertMapToObject", serviceContext);
        assertThat(serviceResult.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(spyClass.getData()).hasSize(2);
        assertThat(spyClass.getData().get(0)).isEqualTo("John");
        assertThat(spyClass.getData().get(1)).isEqualTo("Mike");
    }

    @Test
    void givenDtoClassOnCollectionElementVariableButObjectIsNotMapThenThrowException() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/sequential/convertMapToObject.bpmn");
        SpyClass spyClass = new SpyClass();
        Map<String, TypedObject> s = new TypedMapBuilder()
                .addEntity("ids", new TypedObject("id"))
                .addEntity("spy", spyClass).build();

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), s);

        ServiceResult serviceResult = serviceStarter.start("convertMapToObject", serviceContext);
        Assertions.assertThat(serviceResult.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
    }
}
