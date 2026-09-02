package com.dongkuk.oasis;

import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.service.CoreServiceStarter;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.service.StopWatchServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionHandler;
import com.dongkuk.oasis.unmarshal.ClasspathFileToString;
import com.dongkuk.oasis.unmarshal.camunda.CamundaBpmnServiceUnmarshaller;

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

    public static ServiceStarter getServiceStarter(String filePath) {

        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        serviceId -> getService(filePath),
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50).generateProcessStarter(),
                        new SpringTransactionHandler(new DefaultApplicationContext(null))));
    }

    public static ServiceStarter getServiceStarter(String filePath, TransactionHandler transactionHandler) {
        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        serviceId -> getService(filePath),
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50).generateProcessStarter(),
                        transactionHandler));
    }

    public static ServiceStarter getServiceStarter(ServiceProvider serviceProvider, TransactionHandler transactionHandler) {
        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        serviceProvider,
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver(), 10, 50).generateProcessStarter(),
                        transactionHandler));
    }
}
