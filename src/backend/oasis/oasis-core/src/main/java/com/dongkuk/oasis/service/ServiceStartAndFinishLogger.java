package com.dongkuk.oasis.service;

import com.dongkuk.oasis.logger.StopWatchStartAndFinishLogger;

/**
 * 서비스의 실행과 종료 시점을 기록한다.
 * 스레드 안전하지 않으므로 유의한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
final class ServiceStartAndFinishLogger extends StopWatchStartAndFinishLogger<ServiceLoggerParam> {
    /**
     * @param serviceStarterClass 프로세스 클래스
     */
    public ServiceStartAndFinishLogger(Class<? extends ServiceStarter> serviceStarterClass) {
        super(serviceStarterClass);
    }

    @Override
    public void logStart(ServiceLoggerParam params) {
        if (params.getRequestTag() != null) {
            log.info("Service [{}] start. Request Tag [{}]",
                    params.getServiceId(),
                    params.getRequestTag());
        } else {
            log.info("Service [{}] start.",
                    params.getServiceId());
        }

        start();
    }

    @Override
    public void logFinish(ServiceLoggerParam params) {
        stop();
        log.info("Service [{}] finish.({}ms)",
                params.getServiceId(),
                getTimeMillis()
        );
    }

    @Override
    public void logFinishWithException(ServiceLoggerParam params) {
        stop();
        log.error("Service [{}] finish with exceptions.({}ms)",
                params.getServiceId(),
                getTimeMillis()
        );
    }
}
