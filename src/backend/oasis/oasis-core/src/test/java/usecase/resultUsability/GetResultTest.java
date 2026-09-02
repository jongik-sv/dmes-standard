package usecase.resultUsability;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 서비스를 수행한 뒤 결과를 처리하는 샘플.
 *
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
@SuppressWarnings("unchecked")
public class GetResultTest {
    @Test
    void hey() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/resultUsability.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("resultUsability", serviceContext);

        Map<String, TypedObject> resultMap = serviceResult.results();
        TypedObject resultList1 = serviceResult.result("resultList");
        Object resultList2 = serviceResult.result("resultList").getObject();
        @SuppressWarnings("rawtypes")
        List resultList3 = serviceResult.result("resultList").getObject(List.class);
        List<RecordDto> resultList4 = serviceResult.result("resultList")
                .getObjectAsList(RecordDto.class);
        List<RecordDto> resultList5 = serviceResult.result("resultList")
                .getObject(new TypeReference<List<RecordDto>>() {
                });

        assertThat(resultMap).isNotNull();
        assertThat(resultList1).isNotNull();
        assertThat(resultList2).isNotNull();
        assertThat(resultList3).hasSize(3);
        assertThat(resultList4).hasSize(3);
        assertThat(resultList5).hasSize(3);

        TypedObject resultMap1 = serviceResult.result("resultMap");
        Object resultMap2 = serviceResult.result("resultMap").getObject();
        @SuppressWarnings("rawtypes")
        Map resultMap3 = serviceResult.result("resultMap").getObject(Map.class);
        Map<String, RecordDto> resultMap4 = serviceResult.result("resultMap")
                .getObjectAsMap(String.class, RecordDto.class);
        Map<String, RecordDto> resultMap5 = serviceResult.result("resultMap")
                .getObject(new TypeReference<Map<String, RecordDto>>() {
                });

        assertThat(resultMap1).isNotNull();
        assertThat(resultMap2).isNotNull();
        //noinspection unchecked
        assertThat(resultMap3).isNotNull();
        assertThat(resultMap4).hasSize(3);
        assertThat(resultMap5).hasSize(3);
    }
}
