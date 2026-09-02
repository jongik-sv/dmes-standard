package usecase.parallel;

import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 서비스를 수행한 뒤 결과를 처리하는 샘플.
 *
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
public class ParallelTest {
    @Test
    void parallelProcessExecution() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/parallel/parallel.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
        List<PathElement> path = serviceResult.path();
        assertThat(path).hasSize(31);
        assertThat(path.get(0).getId()).isEqualTo("s1");
        assertThat(path.get(30).getId()).isEqualTo("Event_0nfnrvu");
    }

    @Test
    void parallelAndLoop() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/parallel/parallelJavaService.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
        List<PathElement> path = serviceResult.path();
        assertThat(path).hasSize(16);
        assertThat(path.get(0).getId()).isEqualTo("s1");
    }

    @Test
    void handleParallelResult() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/parallel/parallelJavaServiceReturn.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
        List<PathElement> path = serviceResult.path();
        assertThat(path).hasSize(17);
        assertThat(path.get(0).getId()).isEqualTo("s1");
    }

    @Test
    void parallelMultiInstance() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/parallel/multiInstance.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(mock(ApplicationContext.class), new HashMap<>());

        ServiceResult serviceResult = serviceStarter.start("parallel", serviceContext);
        List<PathElement> path = serviceResult.path();
        assertThat(path).hasSize(5);
        assertThat(path.get(0).getId()).isEqualTo("s1");
    }
}
