package com.dongkuk.analog.parser;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * /tree 소비 루프(LogProcessor.runConsumer)가 끝 신호(EOQ)를 받았을 때 버퍼에 남은 마지막 논리 줄과
 * 그 줄에 이어진 줄(스택 등)까지 트리에 넣는지 본다.
 *
 * <p>ParseFixture.parseTree 는 렉서가 큐를 다 채운 뒤 소비하므로 소비 스레드가 생산 도중 깨는 타이밍 문제 없이
 * EOQ 처리만 결정적으로 확인한다.
 */
class LogProcessorEoqFlushTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static String line(String time, String level, String logger, String message) {
        return "2026-05-15 " + time + " [http-1] [T1] [SVC01] " + level + " " + logger + " - " + message;
    }

    private static JsonNode onlyRequest(List<Object> tree) {
        JsonNode json = MAPPER.valueToTree(tree);
        assertThat(json).hasSize(1);
        return json.get(0);
    }

    @Disabled("재현 — 다음 fix 커밋에서 켬")
    @Test
    void 끝_신호_직전의_예외_줄과_이어진_스택_줄이_트리에_들어간다() throws Exception {
        String log = String.join("\n",
                line("10:00:00.000", "INFO ", "c.d.Web", "POST \"/api/order/save\""),
                line("10:00:00.010", "INFO ", "c.d.Svc", "Service [SVC01] start. Request Tag [RT1]"),
                line("10:00:00.020", "INFO ", "c.d.Svc", "plain business message"),
                line("10:00:00.030", "ERROR", "c.d.Svc", "failure at the end"),
                "\tat com.d.Foo.bar(Foo.java:10)",
                "\tat com.d.Main.main(Main.java:3)");

        JsonNode request = onlyRequest(ParseFixture.parseTree(log));

        assertThat(request.path("property").path("exception").isArray()).isTrue();
        assertThat(request.path("property").path("exception").get(0).asText())
                .isEqualTo("failure at the end\n\tat com.d.Foo.bar(Foo.java:10)\n\tat com.d.Main.main(Main.java:3)");
    }

    @Disabled("재현 — 다음 fix 커밋에서 켬")
    @Test
    void 끝_신호_직전의_일반_메시지_줄이_트리에_들어간다() throws Exception {
        String log = String.join("\n",
                line("10:00:00.000", "INFO ", "c.d.Web", "POST \"/api/order/save\""),
                line("10:00:00.010", "INFO ", "c.d.Svc", "Service [SVC01] start. Request Tag [RT1]"),
                line("10:00:00.020", "INFO ", "c.d.Svc", "first business message"),
                line("10:00:00.030", "INFO ", "c.d.Svc", "last business message"));

        JsonNode request = onlyRequest(ParseFixture.parseTree(log));

        JsonNode service = request.path("child").get(1);
        assertThat(service.path("property").path("objectType").asText()).isEqualTo("Service");
        assertThat(service.path("child").toString()).contains("first business message", "last business message");
    }
}
