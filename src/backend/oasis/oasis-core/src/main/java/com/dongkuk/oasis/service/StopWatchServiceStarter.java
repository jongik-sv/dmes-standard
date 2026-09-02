package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.logger.StartAndFinishLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 서비스의 시작과 끝을 로깅하는 {@link ServiceStarter}의 프록시이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public final class StopWatchServiceStarter extends WatchServiceStarter {
    private static final Logger log = LoggerFactory.getLogger(StopWatchServiceStarter.class);

    /**
     * @param serviceStarter 프로세스 스타터
     */
    public StopWatchServiceStarter(ServiceStarter serviceStarter) {
        super(serviceStarter);
    }

    @Override
    public ServiceResult start(String serviceId, ServiceContext serviceContext) {
        StartAndFinishLogger<ServiceLoggerParam> serviceStartAndFinishLogger
                = new ServiceStartAndFinishLogger(serviceStarter.getClass());

        return logAndServiceStart(serviceId, serviceContext, serviceStartAndFinishLogger, log);
    }

    @Override
    public ServiceResult start(String serviceId) {
        return start(serviceId, ServiceContext.emptyContext());
    }
}
