package com.dongkuk.oasis.process;

import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.logger.StartAndFinishLogger;
import com.dongkuk.oasis.model.Process;

/**
 * 서브 프로세스의 시작과 끝을 로깅하는 {@link ProcessStarter}의 프록시이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-23
 */
public final class StopWatchSubProcessStarter extends AbstractStopWatchProcessStarter {

    /**
     * @param processStarter 프로세스 스타터
     */
    public StopWatchSubProcessStarter(ProcessStarter processStarter) {
        super(processStarter);
    }

    @Override
    public void start(Process process, ProcessContext processContext) {
        StartAndFinishLogger<ProcessLoggerParam> processStartAndFinishLogger
                = new SubProcessStartAndFinishLogger(processStarter.getClass());

        start(process, processContext, processStartAndFinishLogger);
    }
}
