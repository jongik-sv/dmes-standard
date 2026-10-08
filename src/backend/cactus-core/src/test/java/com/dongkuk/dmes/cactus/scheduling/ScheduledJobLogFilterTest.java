package com.dongkuk.dmes.cactus.scheduling;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import ch.qos.logback.core.spi.FilterReply;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduledJobLogFilterTest {

    private final LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    private final Logger logger = context.getLogger(ScheduledJobLogFilterTest.class);

    private LoggingEvent event(Map<String, String> mdc) {
        LoggingEvent e = new LoggingEvent("x", logger, Level.INFO, "msg", null, null);
        e.setMDCPropertyMap(mdc);
        return e;
    }

    private FilterReply decide(boolean onlyScheduled, Map<String, String> mdc) {
        ScheduledJobLogFilter filter = new ScheduledJobLogFilter();
        filter.setOnlyScheduled(onlyScheduled);
        return filter.decide(event(mdc));
    }

    @Test
    void 업무_로그_파일_필터는_예약_작업_줄만_막는다() {
        assertThat(decide(false, Map.of("serviceId", "sch.mcm.widgetCollector.collectMinute"))).isEqualTo(FilterReply.DENY);
        assertThat(decide(false, Map.of("serviceId", "mcm.order/search"))).isEqualTo(FilterReply.NEUTRAL);
        assertThat(decide(false, Map.of())).isEqualTo(FilterReply.NEUTRAL);
    }

    @Test
    void 예약_작업_로그_파일_필터는_예약_작업_줄만_통과시킨다() {
        assertThat(decide(true, Map.of("serviceId", "sch.mdm.mdmRevisionPoller.poll"))).isEqualTo(FilterReply.NEUTRAL);
        assertThat(decide(true, Map.of("serviceId", "mdm.order/search"))).isEqualTo(FilterReply.DENY);
        assertThat(decide(true, Map.of())).isEqualTo(FilterReply.DENY);
    }

    @Test
    void 이름이_sch_로_시작해도_점이_없으면_예약_작업이_아니다() {
        assertThat(decide(true, Map.of("serviceId", "schedule.search/run"))).isEqualTo(FilterReply.DENY);
    }

    @Test
    void 작업_이름에_logback_컨텍스트의_모듈_id_가_들어간다() {
        String previous = context.getProperty(ScheduledJobLogContext.MODULE_PROPERTY);
        try {
            context.putProperty(ScheduledJobLogContext.MODULE_PROPERTY, "mcm");
            assertThat(ScheduledJobLogContext.jobName("mdmRevisionPoller.poll")).isEqualTo("sch.mcm.mdmRevisionPoller.poll");
        } finally {
            context.putProperty(ScheduledJobLogContext.MODULE_PROPERTY, previous);
        }
    }

    @Test
    void 모듈_id_가_없으면_모듈_없이_이름만_쓴다() {
        String previous = context.getProperty(ScheduledJobLogContext.MODULE_PROPERTY);
        try {
            context.putProperty(ScheduledJobLogContext.MODULE_PROPERTY, "");
            assertThat(ScheduledJobLogContext.jobName("x.y")).isEqualTo("sch.x.y");
        } finally {
            context.putProperty(ScheduledJobLogContext.MODULE_PROPERTY, previous);
        }
    }
}
