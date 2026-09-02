package usecase.testmode;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.executors.GreetingMessage2;
import com.dongkuk.oasis.executors.OasisClass2;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * @author Jeongjin Kim
 * @since 2022-05-30
 */
public class OasisCallTest {
    @Test
    void givenObjectInApplicationContextCanNotFindClass() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/reuse_object.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        GreetingMessage mock = new GreetingMessage("hello");
        applicationContext.put("greetingMessage", new TypedObject(mock));
        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext);
        ServiceResult reuse_object = serviceStarter.start("reuse_object", serviceContext);
        assertThat(reuse_object.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
    }

    @Test
    void givenObjectInTestWorksWell() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/reuse_object.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext);
        GreetingMessage mock = new GreetingMessage("hello");
        Map<String, Object> object = new HashMap<>();
        object.put(GreetingMessage.class.getName(), mock);
        serviceContext.setClassToObjectMap(object);

        ServiceResult reuse_object = serviceStarter.start("reuse_object", serviceContext);
        assertThat(reuse_object.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(reuse_object.result("result").getObject()).isEqualTo("hello");
    }

    @Test
    void givenMockObjectInTestWorksWell() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/reuse_object.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext);
        Map<String, Object> object = new HashMap<>();
        GreetingMessage mock = mock(GreetingMessage.class);
        when(mock.getMessage()).thenReturn("hello");
        object.put(GreetingMessage.class.getName(), mock);
        serviceContext.setClassToObjectMap(object);

        ServiceResult reuse_object = serviceStarter.start("reuse_object", serviceContext);
        assertThat(reuse_object.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(reuse_object.result("result").getObject()).isEqualTo("hello");
    }

    @Test
    void givenMock() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/reuse_object.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext);
        Map<String, Object> object = new HashMap<>();
        OasisClass mock = mock(OasisClass.class);
        when(mock.greeting()).thenReturn("hello");
        object.put(OasisClass.class.getName(), mock);
        object.put(GreetingMessage.class.getName(), mock(GreetingMessage.class));
        serviceContext.setClassToObjectMap(object);

        ServiceResult reuse_object = serviceStarter.start("reuse_object", serviceContext);
        assertThat(reuse_object.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(reuse_object.result("result").getObject()).isEqualTo("hello");
    }

    @Test
    void givenMock1() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/reuse_object.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext);
        Map<String, Object> object = new HashMap<>();
        OasisClass mock = new OasisClass(null) {
            @Override
            public String greeting() {
                return "hello";
            }
        };

        object.put(OasisClass.class.getName(), mock);
        object.put(GreetingMessage.class.getName(), mock(GreetingMessage.class));
        serviceContext.setClassToObjectMap(object);

        ServiceResult reuse_object = serviceStarter.start("reuse_object", serviceContext);
        assertThat(reuse_object.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(reuse_object.result("result").getObject()).isEqualTo("hello");
    }

    @Test
    void givenMock2() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/testmode/reuse_object_other_package.bpmn");
        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext);
        Map<String, Object> object = new HashMap<>();
        OasisClass2 mock = new OasisClass2(null) {
            @Override
            public String greeting() {
                return "hello";
            }
        };

        object.put(OasisClass2.class.getName(), mock);
        object.put(GreetingMessage2.class.getName(), mock(GreetingMessage2.class));
        serviceContext.setClassToObjectMap(object);

        ServiceResult reuse_object = serviceStarter.start("reuse_object_other_package", serviceContext);
        assertThat(reuse_object.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        assertThat(reuse_object.result("result").getObject()).isEqualTo("hello");
    }

    static public class GreetingMessage {
        private final String message;

        public GreetingMessage(String message) {
            this.message = message;
        }

        public String getMessage() {
            return message;
        }
    }

    static public class OasisClass {
        private final GreetingMessage greetingMessage;

        public OasisClass(GreetingMessage greetingMessage) {
            this.greetingMessage = greetingMessage;
        }

        public String greeting() {
            return greetingMessage.getMessage();
        }
    }
}
