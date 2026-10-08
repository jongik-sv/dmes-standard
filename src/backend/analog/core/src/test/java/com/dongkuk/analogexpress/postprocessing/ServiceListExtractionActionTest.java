package com.dongkuk.analogexpress.postprocessing;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 서비스 목록의 Action 추출 시험. 패턴은 analog api 의 application.yml 과 같은 값을 쓴다.
 * 실제 로그 문구는 cactus OasisServiceExecutor 가 남기는 "serviceId/action" 줄이다.
 */
class ServiceListExtractionActionTest {

    private static final String LEX_PATTERN = "(?<time>20\\d\\d-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d) \\[(?<thread>[^\\]]+)\\] \\[(?<serviceTag>[\\w:]+)\\] \\[(?<service>[^\\]]+)\\] (?<level>(?:TRACE|DEBUG|INFO|WARN|ERROR))\\s+(?<logger>[\\w.$-]+) - (?<message>.*)";
    private static final String RUN_TIME_PATTERN = "RunTime : \\[(?<runTime>\\d+)\\]\\s*$";
    private static final String ACTION_PATTERN = "^[\\w.-]+/(?<action>\\w+)$";

    private final ServiceListExtraction extraction = new ServiceListExtraction(
            LEX_PATTERN, "Service end - service name ", RUN_TIME_PATTERN, "serviceId/action", ACTION_PATTERN);

    @Test
    void executor_줄에서_Action_을_채운다() {
        String log = String.join("\n",
                "2026-10-08 11:07:18.632 [http-nio-8096-exec-2] [ykP4] [ruleCalc] INFO  c.d.d.c.oasis.OasisServiceExecutor - ruleCalc/view",
                "2026-10-08 11:07:18.700 [http-nio-8096-exec-2] [ykP4] [ruleCalc] DEBUG o.h.SQL - select * from t where a = 'x/y'",
                "2026-10-08 11:07:19.000 [http-nio-8096-exec-2] [ykP4] [ruleCalc] INFO  c.d.d.c.oasis.OasisServiceExecutor - Service end - service name [ruleCalc] RunTime : [368]");

        List<ServiceDefinition> list = extraction.extract(log);

        assertThat(list).hasSize(1);
        assertThat(list.get(0).getAction()).isEqualTo("view");
        assertThat(list.get(0).getServiceName()).isEqualTo("ruleCalc");
    }

    @Test
    void 다른_메시지에는_Action_이_잡히지_않는다() {
        String log = String.join("\n",
                "2026-10-08 11:07:18.632 [http-nio-8096-exec-2] [ab12] [metaFeed] INFO  c.d.d.c.oasis.OasisServiceExecutor - Service end - service name [metaFeed] RunTime : [12]",
                "2026-10-08 11:07:18.640 [http-nio-8096-exec-2] [ab12] [metaFeed] DEBUG o.h.SQL - select a/b from dual",
                "2026-10-08 11:07:18.650 [http-nio-8096-exec-2] [ab12] [metaFeed] DEBUG o.h.t.d.s.BasicBinder - binding parameter [1] as [VARCHAR] - [a/b]");

        List<ServiceDefinition> list = extraction.extract(log);

        assertThat(list).hasSize(1);
        assertThat(list.get(0).getAction()).isNull();
    }

    @Test
    void 서비스_태그마다_처음_맞는_줄을_Action_으로_쓴다() {
        String log = String.join("\n",
                "2026-10-08 11:07:18.632 [t-1] [aaaa] [metaFeed] INFO  c.d.d.c.oasis.OasisServiceExecutor - metaFeed/search",
                "2026-10-08 11:07:18.640 [t-2] [bbbb] [ruleConfirm] INFO  c.d.d.c.oasis.OasisServiceExecutor - ruleConfirm/search",
                "2026-10-08 11:07:18.650 [t-1] [aaaa] [metaFeed] INFO  c.d.d.c.oasis.OasisServiceExecutor - metaFeed/view");

        List<ServiceDefinition> list = extraction.extract(log);

        assertThat(list).extracting(ServiceDefinition::getAction).containsExactly("search", "search");
    }

    @Test
    void 같은_태그에서는_먼저_나온_Action_이_유지된다() {
        String log = String.join("\n",
                "2026-10-08 11:07:18.632 [t-1] [aaaa] [metaFeed] INFO  c.d.d.c.oasis.OasisServiceExecutor - metaFeed/search",
                "2026-10-08 11:07:18.650 [t-1] [aaaa] [metaFeed] INFO  c.d.d.c.oasis.OasisServiceExecutor - metaFeed/view");

        assertThat(extraction.extract(log).get(0).getAction()).isEqualTo("search");
    }

    @Test
    void CRLF_줄바꿈과_점이_든_serviceId_도_처리한다() {
        String log = "2026-10-08 11:07:18.632 [t-1] [aaaa] [mdm.metaFeed] INFO  c.d.d.c.oasis.OasisServiceExecutor - mdm.metaFeed/search\r\n"
                + "2026-10-08 11:07:18.700 [t-1] [aaaa] [mdm.metaFeed] DEBUG o.h.SQL - select 1\r\n";

        assertThat(extraction.extract(log).get(0).getAction()).isEqualTo("search");
    }
}
