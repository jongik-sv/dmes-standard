package com.dongkuk.oasis;

import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.provider.ServiceProvider;
import com.dongkuk.oasis.service.CoreServiceStarter;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.service.ServiceStarterFactory;
import com.dongkuk.oasis.service.StopWatchServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final public class ServiceStarterFactoryForTest implements ServiceStarterFactory {
    private final ServiceProvider serviceProvider;

    public ServiceStarterFactoryForTest(ServiceProvider serviceProvider) {
        this.serviceProvider = serviceProvider;
    }

    @Override
    public ServiceStarter generateServiceStarter() {
        return new StopWatchServiceStarter(
                new CoreServiceStarter(
                        serviceProvider,
                        new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver()).generateProcessStarter(),
                        new SpringTransactionHandler(new DefaultApplicationContext(null))));
    }
}
