package com.dongkuk.oasis.process;

import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.logger.StartAndFinishLogger;
import com.dongkuk.oasis.model.Process;

/**
 * 프로세스의 시작과 끝을 로깅하는 {@link ProcessStarter}의 프록시이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public abstract class AbstractStopWatchProcessStarter implements ProcessStarter {
    protected final ProcessStarter processStarter;

    /**
     * @param processStarter 프로세스 스타터
     */
    public AbstractStopWatchProcessStarter(ProcessStarter processStarter) {
        if (processStarter instanceof AbstractStopWatchProcessStarter)
            throw new IllegalArgumentException("StopWatchProcessStarter is unavailable.");

        this.processStarter = processStarter;
    }

    protected void start(Process process,
                         ProcessContext processContext,
                         StartAndFinishLogger<ProcessLoggerParam> processStartAndFinishLogger) {
        processStartAndFinishLogger.logStart(new ProcessLoggerParam(process.getId(), process.getName()));
        boolean isException = false;
        try {
            processStarter.start(process, processContext);
        } catch (Exception | Error e) {
            isException = true;
            throw e;
        } finally {
            if (!isException) {
                processStartAndFinishLogger.logFinish(new ProcessLoggerParam(process.getId(), process.getName()));
            } else {
                processStartAndFinishLogger
                        .logFinishWithException(new ProcessLoggerParam(process.getId(), process.getName()));
            }

        }
    }
}
