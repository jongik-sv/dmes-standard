package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ApplicationContextSettable;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.context.SpringApplicationContext;
import org.springframework.context.ApplicationContext;

/**
 * 서비스를 시작할 때 {@link ApplicationContext}를 {@link ServiceContext}에 동적으로 초기화해서 실행시켜주는 서비스 실행기이다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public final class SpringServiceStarter implements ServiceStarter {
    private final ApplicationContext applicationContext;
    private final ServiceStarter serviceStarter;

    /**
     * @param serviceStarter     서비스 실행기
     * @param applicationContext 스프링 애플리케이션 컨텍스트
     */
    public SpringServiceStarter(ServiceStarter serviceStarter,
                                ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
        this.serviceStarter = serviceStarter;
    }

    @Override
    public ServiceResult start(String serviceId, ServiceContext serviceContext) {
        if (serviceContext instanceof ApplicationContextSettable)
            ((ApplicationContextSettable) serviceContext)
                    .setApplicationContext(new SpringApplicationContext(applicationContext));
        return serviceStarter.start(serviceId, serviceContext);
    }

    @Override
    public ServiceResult start(String serviceId) {
        return start(serviceId, ServiceContext.emptyContext());
    }
}
