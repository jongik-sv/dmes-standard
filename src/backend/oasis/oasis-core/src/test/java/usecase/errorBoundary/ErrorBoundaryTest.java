package usecase.errorBoundary;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * @author Jeongjin Kim
 * @since 2023-01-03
 */
public class ErrorBoundaryTest {

    @Test
    void noExceptionFound() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void exceptionFound() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_exception.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);
        Assertions.assertThat(result.path().get(result.path().size() - 1).getId()).isEqualTo("Event_1ockqrw");
        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void taskExceptionFound() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_task_exception.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.path().get(result.path().size() - 1).getId()).isEqualTo("Event_0cz1jtp");
        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void otherTaskExceptionFound() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_other_exception.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.path().get(result.path().size() - 1).getId()).isEqualTo("Event_0cz1jtp");
        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void noExceptionFoundInSubProcess() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_subprocess_exception.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void exceptionFoundInSubProcess() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_subprocess_with_exception.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.exception()).isNotNull();
    }

    @Test
    void exceptionFoundInSubProcessAndErrorBoundaryEvent() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_subprocess_with_exception_with_error_boundary_event.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.path().get(result.path().size() - 1).getId()).isEqualTo("Event_0oqqfvm");
        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void errorBoundaryEventInSubProcess() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_in_subprocess.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void errorBoundaryEventAttachedToSubProcessTaskInParallelOccurException() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_in_parallel_with_error_boundary_event.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, new HashMap<>());

        ServiceResult sid = serviceStarter.start("sid", serviceContext);
        Assertions.assertThat(sid.exception()).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void errorBoundaryEventMessageBinding() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_exception_message.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        Map<String, TypedObject> build = new TypedMapBuilder().addEntity("abc", "kakao").build();
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, build);

        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.path().get(result.path().size() - 1).getId()).isEqualTo("Event_0o0tjtl");
        Assertions.assertThat(result.exception()).isNull();
    }

    @Test
    void errorBoundaryEventInSequentialLoop() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/errorBoundary/error_boundary_with_seqloop.bpmn");

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        Map<String, TypedObject> build = new TypedMapBuilder().addEntity("list",
                new TypedObject(Arrays.asList(1, 2, 3, 4, 5), new TypeReference<List<Integer>>() {
                })).build();
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext, build);
        ServiceResult result = serviceStarter.start("sid", serviceContext);

        Assertions.assertThat(result.exception()).isNull();
    }
}
