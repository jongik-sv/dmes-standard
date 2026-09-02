package usecase.sequential;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

public class SequentialElementUnzipObjectTest {
    @Test
    void givenDtoClassOnCollectionElementVariableThenConvertToObject() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/sequential/convertUnzipObject.bpmn");
        List<SpyDto> maps = Arrays.asList(
                new SpyDto("John", 30),
                new SpyDto("Mike", 10));

        Map<String, TypedObject> serviceInputs = new TypedMapBuilder().addEntity("dtos", new TypedObject(maps, new TypeReference<List<SpyDto>>() {
        })).build();

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), serviceInputs);

        ServiceResult serviceResult = serviceStarter.start("convertMapToObject", serviceContext);
        assertThat(serviceResult.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        Map<String, TypedObject> results = serviceResult.results();
        TypedObject results1 = results.get("results");
        List<TypedObject> object = results1.getObject(new TypeReference<List<TypedObject>>() {
        });

        assertThat(object).hasSize(2);
        assertThat(object.get(0).getObject()).isEqualTo("John30");
        assertThat(object.get(1).getObject()).isEqualTo("Mike10");
    }
}
