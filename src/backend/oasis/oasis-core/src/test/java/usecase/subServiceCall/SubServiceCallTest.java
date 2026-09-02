package usecase.subServiceCall;

import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.ServiceStarterFactoryForTest;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class SubServiceCallTest {
    @Test
    void simpleCallSubService() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("firstName", new TypedObject("jj"))
                        .addEntity("action", new TypedObject("simple"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(9);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        Map<String, String> object = subResult.getObject(
                new TypeReference<Map<String, String>>() {
                });
        assertThat(object.get("name")).isEqualTo("haksan");
    }

    @Test
    void callSubSubService() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("sub"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);
        assertThat(mainService.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(11);
    }

    @Test
    void callSubServiceUsingExpressionParameter() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("map"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(9);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        assertThat(subResult.getObject(Map.class).get("userName")).isEqualTo("Richard");
    }

    @Test
    void callLoopSubService() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("loop"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(21);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        List<TypedObject> object = subResult.getObject(new TypeReference<List<TypedObject>>() {
        });
        assertThat(object).hasSize(4);
        assertThat(object.get(0).getObject(SubProcessResult.class).get("userName")).isEqualTo("Saizy");
        assertThat(object.get(1).getObject(SubProcessResult.class).get("userName")).isEqualTo("Piter");
        assertThat(object.get(2).getObject(SubProcessResult.class).get("userName")).isEqualTo("Megan");
        assertThat(object.get(3).getObject(SubProcessResult.class).get("userName")).isEqualTo("Kate");
    }

    @Test
    void callSubServicePassingDto() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("dto"))
                        .addEntity("name", new TypedObject("Richard"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        assertThat(subResult.getObject(Map.class).get("userName")).isEqualTo("helloRichard");
    }

    @Test
    void simpleCallSubServiceUsingCalleeInput() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("firstName", new TypedObject("jj"))
                        .addEntity("action", new TypedObject("simple"))
                        .build());

        ServiceResult mainService = serviceStarter.start("rev_mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(11);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        Map<String, String> object = subResult.getObject(
                new TypeReference<Map<String, String>>() {
                });
        assertThat(object.get("name")).isEqualTo("haksan");
    }

    @Test
    void callSubSubServiceUsingCalleeInput() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("sub"))
                        .build());

        ServiceResult mainService = serviceStarter.start("rev_mainService", serviceContext);
        assertThat(mainService.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(15);
    }

    @Test
    void callLoopSubServiceUsingCalleeInput() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("loop"))
                        .build());

        ServiceResult mainService = serviceStarter.start("rev_mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(15);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        List<TypedObject> object = subResult.getObject(new TypeReference<List<TypedObject>>() {
        });
        assertThat(object).hasSize(2);
        assertThat(object.get(0).getObject(SubProcessResult.class).get("userName")).isEqualTo("Saizy");
        assertThat(object.get(1).getObject(SubProcessResult.class).get("userName")).isEqualTo("Piter");
    }

    @Test
    void callSubServiceWithListMapUsingCalleeInput() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("map"))
                        .build());

        ServiceResult mainService = serviceStarter.start("rev_mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(10);

        Map<String, TypedObject> results = mainService.results();
        TypedObject subResult = results.get("subResult");
        Map<?, ?> subServiceName = (Map<?, ?>) subResult.getObject(Map.class).get("subServiceName");
        assertThat(subServiceName.get("name")).isEqualTo("Richard");
    }

    @Test
    void callSubServiceInSubProcess() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("firstName", new TypedObject("jj"))
                        .addEntity("action", new TypedObject("subProcess"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(12);

        Map<String, TypedObject> results = mainService.results();
        SubProcessResult subResult = results.get("subResult").getObject(SubProcessResult.class);
        SubProcessResult subResult1 = (SubProcessResult) subResult.get("subResult");
        Object name = subResult1.get("name");
        assertThat(name).isEqualTo("haksan");
    }

    @Test
    void callOfflineSubServiceInSubProcess() {
        ServiceStarter serviceStarter = new ServiceStarterFactoryForTest(
                new TestServiceProvider()
        ).generateServiceStarter();

        ApplicationContext applicationContext = new DefaultApplicationContext(null);
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("firstName", new TypedObject("jj"))
                        .addEntity("action", new TypedObject("offSubProcess"))
                        .build());

        ServiceResult mainService = serviceStarter.start("mainService", serviceContext);

        List<PathElement> path = mainService.path();
        assertThat(path).hasSize(12);

        Map<String, TypedObject> results = mainService.results();
        SubProcessResult subResult = results.get("subResult").getObject(SubProcessResult.class);
        SubProcessResult subResult1 = (SubProcessResult) subResult.get("subResult");
        Object name = subResult1.get("name");
        assertThat(name).isEqualTo("haksan");
    }
}
