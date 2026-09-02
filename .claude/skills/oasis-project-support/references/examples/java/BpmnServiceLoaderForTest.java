package integration;

import oasis.NonModifyClassNameResolver;
import oasis.context.DefaultApplicationContext;
import oasis.context.SpringApplicationContext;
import oasis.factories.ProcessStaterAndElementExecutorFactory;
import oasis.loader.ClassPathFileServiceLoader;
import oasis.model.Service;
import oasis.provider.CamundaBpmnServiceProvider;
import oasis.service.CoreServiceStarter;
import oasis.service.ServiceStarter;
import oasis.service.SpringServiceStarter;
import oasis.service.StopWatchServiceStarter;
import oasis.transaction.NonTransactionHandler;
import oasis.transaction.SpringTransactionHandler;
import oasis.transaction.TransactionHandler;
import oasis.unmarshal.ClasspathFileToString;
import oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

/**
 * @author Jeongjin Kim
 * @since 2021-05-12
 */
public class BpmnServiceLoaderForTest {
    public static Service getService(String filePath) {
        String serviceDocumentString = new ClasspathFileToString()
                .getString(filePath,
                        "utf-8");

        CamundaBpmnServiceUnmarshaller unmarshaller =
                new CamundaBpmnServiceUnmarshaller();
        return unmarshaller.unmarshal(serviceDocumentString, "s1", "s1");
    }

    /**
     * {@code txBiz} 트랜잭션을 시작하는 서비스 스타터를 생성한다.
     *
     * @param ac Spring Application Context
     * @return OASIS Service Starter
     */
    public static ServiceStarter getServiceStarter(org.springframework.context.ApplicationContext ac) {
        return getServiceStarter(ac, new String[]{"txBiz"});
    }

    public static ServiceStarter getServiceStarter(org.springframework.context.ApplicationContext ac,
                                                   String[] transactionManagerNames) {
        return new StopWatchServiceStarter(
                new SpringServiceStarter(
                        new CoreServiceStarter(
                                new CamundaBpmnServiceProvider(
                                        new ClassPathFileServiceLoader(
                                                "/services", "bpmn", "^^"
                                        )
                                ),
                                new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50)
                                        .generateProcessStarter(),
                                new SpringTransactionHandler(
                                        new SpringApplicationContext(ac), transactionManagerNames)),
                        ac));
    }

    public static ServiceStarter getServiceStarter() {
        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        new CamundaBpmnServiceProvider(
                                new ClassPathFileServiceLoader(
                                        "/services", "bpmn", "^^"
                                )
                        ),
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50)
                                .generateProcessStarter(),
                        new NonTransactionHandler()));
    }

    public static ServiceStarter getServiceStarter(String filePath) {

        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        serviceId -> getService(filePath),
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50)
                                .generateProcessStarter(),
                        new SpringTransactionHandler(new DefaultApplicationContext(null))));
    }

    public static ServiceStarter getServiceStarter(String filePath, TransactionHandler transactionHandler) {
        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        serviceId -> getService(filePath),
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50)
                                .generateProcessStarter(),
                        transactionHandler));
    }
}
