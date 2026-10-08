package com.dongkuk.dmes.cactus.scheduling;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.filter.Filter;
import ch.qos.logback.core.spi.FilterReply;

import java.util.Map;

/**
 * 예약 작업 실행 중에 찍힌 줄인지(MDC {@code serviceId} 가 {@code sch.} 로 시작) 가려 로그 파일을 나눈다.
 *
 * <p>{@code dmes-logback-base.xml} 에서 업무 로그 파일에는 {@code onlyScheduled=false}(예약 작업 줄 제외),
 * 예약 작업 로그 파일({@code logs/sch/dmes-sch.log})에는 {@code onlyScheduled=true}(예약 작업 줄만)로 붙인다.
 * 예약 작업 안에서 실행된 SQL·bind 줄은 같은 스레드의 MDC 를 그대로 가져가므로 함께 분류된다.
 */
public class ScheduledJobLogFilter extends Filter<ILoggingEvent> {

    private boolean onlyScheduled;

    /** true 면 예약 작업 줄만 통과시키고, false(기본)면 예약 작업 줄만 막는다. */
    public void setOnlyScheduled(boolean onlyScheduled) {
        this.onlyScheduled = onlyScheduled;
    }

    @Override
    public FilterReply decide(ILoggingEvent event) {
        return isScheduled(event) == onlyScheduled ? FilterReply.NEUTRAL : FilterReply.DENY;
    }

    static boolean isScheduled(ILoggingEvent event) {
        Map<String, String> mdc = event.getMDCPropertyMap();
        String serviceId = mdc == null ? null : mdc.get("serviceId");
        return serviceId != null && serviceId.startsWith(ScheduledJobLogContext.NAME_PREFIX);
    }
}
