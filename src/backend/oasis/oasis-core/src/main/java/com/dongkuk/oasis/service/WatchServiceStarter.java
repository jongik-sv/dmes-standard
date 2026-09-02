package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.logger.StartAndFinishLogger;
import org.slf4j.Logger;

/**
 * 서비스의 시작과 끝을 로깅하는 {@link ServiceStarter}의 프록시이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
abstract class WatchServiceStarter implements ServiceStarter {
    protected final ServiceStarter serviceStarter;

    /**
     * @param serviceStarter 프로세스 스타터
     */
    public WatchServiceStarter(ServiceStarter serviceStarter) {
        if (serviceStarter instanceof StopWatchSubServiceStarter)
            throw new IllegalArgumentException("StopWatchServiceStarter is not available.");

        this.serviceStarter = serviceStarter;
    }

    protected ServiceResult logAndServiceStart(String serviceId,
                                               ServiceContext serviceContext,
                                               StartAndFinishLogger<ServiceLoggerParam> serviceStartAndFinishLogger,
                                               Logger log) {
        ServiceLoggerParam serviceLoggerParam = new ServiceLoggerParam(serviceId);
        serviceLoggerParam.setRequestTag(serviceContext.requestTag());
        serviceStartAndFinishLogger.logStart(serviceLoggerParam);
        ServiceResult result = null;
        try {
            result = serviceStarter.start(serviceId, serviceContext);
        } catch (Exception | Error e) {
            log.error(e.getMessage(), e);
            throw e;
        } finally {
            if (result != null && result.serviceResultCode() == ServiceResultCode.SUCCESS)
                serviceStartAndFinishLogger.logFinish(new ServiceLoggerParam(serviceId));
            else
                serviceStartAndFinishLogger.
                        logFinishWithException(new ServiceLoggerParam(serviceId));
        }
        return result;
    }
}
