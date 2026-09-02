package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.logger.StopWatchStartAndFinishLogger;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.utils.StringUtil;

/**
 * 태스크의 실행과 종료 시점을 기록한다.
 * 스레드 안전하지 않으므로 유의한다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-20
 */
final class ElementStartAndFinishLogger extends StopWatchStartAndFinishLogger<ElementLoggerParam> {
    /**
     * @param elementClass 요소 클래스
     */
    public ElementStartAndFinishLogger(Class<? extends Element> elementClass) {
        super(elementClass);
    }

    @Override
    public void logStart(ElementLoggerParam params) {
        log.info("Task [{}]({}) start.", params.getTaskId(), StringUtil.removeNewLine(params.getTaskName()));
        start();
    }

    @Override
    public void logFinish(ElementLoggerParam params) {
        stop();
        log.info("Task [{}]({}) finish.({}ms)",
                params.getTaskId(),
                StringUtil.removeNewLine(params.getTaskName()),
                getTimeMillis()
        );
    }

    @Override
    public void logFinishWithException(ElementLoggerParam params) {
        stop();
        log.error("Task [{}]({}) finish with exceptions.({}ms)",
                params.getTaskId(),
                StringUtil.removeNewLine(params.getTaskName()),
                getTimeMillis()
        );
    }
}
