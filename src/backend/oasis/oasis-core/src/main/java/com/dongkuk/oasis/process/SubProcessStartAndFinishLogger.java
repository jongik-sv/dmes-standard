package com.dongkuk.oasis.process;

import com.dongkuk.oasis.logger.StopWatchStartAndFinishLogger;

/**
 * 프로세스의 실행과 종료 시점을 기록한다.
 * 스레드 안전하지 않으므로 유의한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-23
 */
final class SubProcessStartAndFinishLogger extends StopWatchStartAndFinishLogger<ProcessLoggerParam> {
    /**
     * @param processClass 프로세스 클래스
     */
    public SubProcessStartAndFinishLogger(Class<? extends ProcessStarter> processClass) {
        super(processClass);
    }

    @Override
    public void logStart(ProcessLoggerParam params) {
        log.info("Sub Process [{}]({}) start.", params.getProcessId(), params.getProcessName());
        start();
    }

    @Override
    public void logFinish(ProcessLoggerParam params) {
        stop();
        log.info("Sub Process [{}]({}) finish.({}ms)",
                params.getProcessId(),
                params.getProcessName(),
                getTimeMillis()
        );
    }

    @Override
    public void logFinishWithException(ProcessLoggerParam params) {
        stop();
        log.error("Sub Process [{}]({}) finish with exceptions.({}ms)",
                params.getProcessId(),
                params.getProcessName(),
                getTimeMillis()
        );
    }
}
