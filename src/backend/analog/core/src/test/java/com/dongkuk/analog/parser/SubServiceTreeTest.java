package com.dongkuk.analog.parser;

import com.dongkuk.analog.process.LogToken;
import com.dongkuk.analog.scanner.LogData;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sub-service 호출 로그가 올바른 트리가 되는지 본다.
 * 줄 순서는 OASIS 소스에서 뽑았다 — 서비스 호출 Task 가 SubServiceConnectedToParentServiceCallTaskExecutable 을 부르면
 * "Sub-service [X] start." → (일반 Process 시작·종료, 그 안의 Task) → "Sub-service [X] finish." 순이다.
 * 분리 호출(Disconnected)은 다른 스레드가 같은 serviceTag(MDC)로 "Service [X] start. Request Tag" 까지 남긴다.
 * 기대 모양: Task(hasSubService y) └ Service(SUB, processId·processName, runTime) └ Task …
 */
class SubServiceTreeTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static String line(int ms, String thread, String level, String message) {
        return String.format("2026-05-15 10:00:00.%03d [%s] [T1] [SVC01] %-5s c.d.Svc - %s", ms, thread, level, message);
    }

    private static String info(int ms, String message) {
        return line(ms, "http-1", "INFO", message);
    }

    private static JsonNode tree(String... lines) throws Exception {
        List<Object> tree = ParseFixture.parseTree(String.join("\n", lines));
        assertThat(tree).hasSize(1);
        return MAPPER.readTree(MAPPER.writeValueAsString(tree.get(0)));
    }

    /** objectType·objectId 가 맞는 가장 먼저 만나는 노드(자기 자신 포함). */
    private static JsonNode find(JsonNode node, String objectType, String objectId) {
        if (node.path("property").path("objectType").asText().equals(objectType)
                && node.path("property").path("objectId").asText().equals(objectId)) return node;
        for (JsonNode c : node.path("child")) {
            if (!c.isObject()) continue;
            JsonNode r = find(c, objectType, objectId);
            if (r != null) return r;
        }
        return null;
    }

    private static List<String> childTypes(JsonNode node) {
        List<String> out = new ArrayList<>();
        for (JsonNode c : node.path("child")) {
            out.add(c.isTextual() ? "\"" + c.asText() + "\"" : c.path("property").path("objectType").asText()
                    + ":" + c.path("property").path("objectId").asText());
        }
        return out;
    }

    /** 트리 안 모든 문자열 자식(Message). */
    private static List<String> allStrings(JsonNode node) {
        List<String> out = new ArrayList<>();
        for (JsonNode c : node.path("child")) {
            if (c.isTextual()) out.add(c.asText());
            else out.addAll(allStrings(c));
        }
        return out;
    }

    @Test
    void 연결된_서브서비스는_Task_아래_Service_노드가_되고_Process_래퍼는_흡수된다() throws Exception {
        JsonNode req = tree(
                info(0, "POST \"/api/order/save\""),
                info(10, "Service [SVC01] start. Request Tag [RT1]"),
                info(20, "Process [P1](mainProc) start."),
                info(30, "Task [K1](callSub) start."),
                info(40, "Sub-service [SUB1] start."),
                info(50, "Process [PS1](subProc) start."),
                info(60, "Task [K2](subTask) start."),
                line(70, "http-1", "DEBUG", "Mybatis SQL : select 1 from dual"),
                info(80, "Task [K2](subTask) finish.(20ms)"),
                info(90, "Process [PS1](subProc) finish.(40ms)"),
                info(100, "Sub-service [SUB1] finish."),
                info(110, "Task [K1](callSub) finish.(80ms)"),
                info(120, "Process [P1](mainProc) finish.(110ms)"),
                info(130, "Service [SVC01] finish.(120ms)"),
                info(140, "Completed 200 OK"));

        JsonNode k1 = find(req, "Task", "K1");
        assertThat(k1.path("property").path("hasSubService").asText()).isEqualTo("y");
        assertThat(childTypes(k1)).containsExactly("Service:SUB1");

        JsonNode sub = find(k1, "Service", "SUB1");
        assertThat(sub.path("property").path("runTime").asText()).isEqualTo("40");   // Service 시간이 없으면 Process 시간
        assertThat(sub.path("property").path("processId").asText()).isEqualTo("PS1");
        assertThat(sub.path("property").path("processName").asText()).isEqualTo("subProc");
        assertThat(sub.path("property").has("exception")).isFalse();
        assertThat(childTypes(sub)).containsExactly("Task:K2");
        assertThat(childTypes(find(sub, "Task", "K2"))).containsExactly("Query:");

        // SUB 가 제대로 닫혀 Task K1 의 종료·상위 노드가 어긋나지 않는다.
        assertThat(k1.path("property").path("runTime").asText()).isEqualTo("80");
        assertThat(find(req, "Service", "SVC01").path("property").path("runTime").asText()).isEqualTo("120");
        assertThat(req.path("property").path("complete").asText()).isEqualTo("true");
        assertThat(req.path("property").path("service").toString()).contains("SVC01").contains("SUB1");
        assertThat(allStrings(req)).containsExactly("POST \"/api/order/save\"");
    }

    @Test
    void Sub_Service_Sub_Process_로거_줄은_SUB_노드에_흡수되고_시간이_얹힌다() throws Exception {
        JsonNode req = tree(
                info(0, "POST \"/api/order/save\""),
                info(10, "Service [SVC01] start. Request Tag [RT1]"),
                info(20, "Process [P1](mainProc) start."),
                info(30, "Task [K1](callSub) start."),
                info(40, "Sub-service [SUB1] start."),
                info(41, "Sub Service [SUB1] start."),
                info(42, "Sub Process [PS1](subProc) start."),
                info(50, "Task [K2](subTask) start."),
                info(60, "Task [K2](subTask) finish.(10ms)"),
                info(70, "Sub Process [PS1](subProc) finish.(25ms)"),
                info(71, "Sub Service [SUB1] finish.(30ms)"),
                info(80, "Sub-service [SUB1] finish."),
                info(90, "Task [K1](callSub) finish.(60ms)"),
                info(100, "Process [P1](mainProc) finish.(90ms)"),
                info(110, "Service [SVC01] finish.(100ms)"),
                info(120, "Completed 200 OK"));

        JsonNode sub = find(req, "Service", "SUB1");
        assertThat(sub.path("property").path("runTime").asText()).isEqualTo("30");   // Sub Service 시간이 우선
        assertThat(sub.path("property").path("processId").asText()).isEqualTo("PS1");
        assertThat(sub.path("property").path("processName").asText()).isEqualTo("subProc");
        assertThat(childTypes(sub)).containsExactly("Task:K2");
        assertThat(find(req, "Task", "K1").path("property").path("hasSubService").asText()).isEqualTo("y");
        // 둘째 Service·Process 노드가 생기지 않았다.
        assertThat(find(req, "Process", "PS1")).isNull();
        assertThat(childTypes(find(req, "Task", "K1"))).containsExactly("Service:SUB1");
        assertThat(allStrings(req)).containsExactly("POST \"/api/order/save\"");
        assertThat(req.path("property").path("complete").asText()).isEqualTo("true");
    }

    @Test
    void 서브서비스가_서브서비스를_부르면_두_단계로_중첩된다() throws Exception {
        JsonNode req = tree(
                info(0, "POST \"/api/order/save\""),
                info(10, "Service [SVC01] start. Request Tag [RT1]"),
                info(20, "Process [P1](mainProc) start."),
                info(30, "Task [K1](callA) start."),
                info(40, "Sub-service [SUBA] start."),
                info(50, "Process [PA](procA) start."),
                info(60, "Task [KA](callB) start."),
                info(70, "Sub-service [SUBB] start."),
                info(80, "Process [PB](procB) start."),
                info(90, "Task [KB](leaf) start."),
                info(100, "Task [KB](leaf) finish.(5ms)"),
                info(110, "Process [PB](procB) finish.(15ms)"),
                info(120, "Sub-service [SUBB] finish."),
                info(130, "Task [KA](callB) finish.(60ms)"),
                info(140, "Process [PA](procA) finish.(90ms)"),
                info(150, "Sub-service [SUBA] finish."),
                info(160, "Task [K1](callA) finish.(120ms)"),
                info(170, "Process [P1](mainProc) finish.(150ms)"),
                info(180, "Service [SVC01] finish.(170ms)"),
                info(190, "Completed 200 OK"));

        JsonNode suba = find(req, "Service", "SUBA");
        JsonNode ka = find(suba, "Task", "KA");
        JsonNode subb = find(ka, "Service", "SUBB");
        assertThat(childTypes(find(req, "Task", "K1"))).containsExactly("Service:SUBA");
        assertThat(childTypes(suba)).containsExactly("Task:KA");
        assertThat(ka.path("property").path("hasSubService").asText()).isEqualTo("y");
        assertThat(childTypes(ka)).containsExactly("Service:SUBB");
        assertThat(childTypes(subb)).containsExactly("Task:KB");
        assertThat(subb.path("property").path("runTime").asText()).isEqualTo("15");
        assertThat(suba.path("property").path("runTime").asText()).isEqualTo("90");
        assertThat(find(req, "Service", "SVC01").path("property").path("runTime").asText()).isEqualTo("170");
        assertThat(req.path("property").path("complete").asText()).isEqualTo("true");
        assertThat(allStrings(req)).containsExactly("POST \"/api/order/save\"");
    }

    @Test
    void Sub_service_finish_with_exceptions_는_SUB_노드를_닫고_오류를_남긴다() throws Exception {
        JsonNode req = tree(
                info(0, "POST \"/api/order/save\""),
                info(10, "Service [SVC01] start. Request Tag [RT1]"),
                info(20, "Process [P1](mainProc) start."),
                info(30, "Task [K1](callSub) start."),
                info(40, "Sub-service [SUB1] start."),
                info(50, "Process [PS1](subProc) start."),
                info(60, "Task [K2](subTask) start."),
                line(70, "http-1", "ERROR", "Task [K2](subTask) finish with exceptions.(10ms)"),
                line(80, "http-1", "ERROR", "Process [PS1](subProc) finish with exceptions.(30ms)"),
                line(90, "http-1", "ERROR", "Sub-service [SUB1] finish with exceptions."),
                line(100, "http-1", "ERROR", "Task [K1](callSub) finish with exceptions.(65ms)"),
                line(110, "http-1", "ERROR", "Process [P1](mainProc) finish with exceptions.(90ms)"),
                line(120, "http-1", "ERROR", "Service [SVC01] finish with exceptions.(100ms)"),
                info(130, "Completed 500 INTERNAL_SERVER_ERROR"));

        JsonNode sub = find(req, "Service", "SUB1");
        assertThat(sub.path("property").path("exception").toString())
                .contains("Process [PS1](subProc) finish with exceptions.(30ms)")
                .contains("Sub-service [SUB1] finish with exceptions.");
        assertThat(childTypes(sub)).containsExactly("Task:K2");
        assertThat(find(sub, "Task", "K2").path("property").path("exception").size()).isEqualTo(1);
        // 안쪽부터 제대로 닫혀 바깥 노드 시간이 각자 자기 줄 값이다.
        assertThat(find(req, "Task", "K1").path("property").path("runTime").asText()).isEqualTo("65");
        assertThat(find(req, "Service", "SVC01").path("property").path("runTime").asText()).isEqualTo("100");
        assertThat(req.path("property").path("complete").asText()).isEqualTo("true");
        assertThat(allStrings(req)).containsExactly("POST \"/api/order/save\"");
    }

    @Test
    void 분리_호출_서브서비스는_다른_스레드_줄이어도_같은_serviceTag_의_SUB_노드가_된다() throws Exception {
        JsonNode req = tree(
                info(0, "POST \"/api/order/save\""),
                info(10, "Service [SVC01] start. Request Tag [RT1]"),
                info(20, "Process [P1](mainProc) start."),
                info(30, "Task [K1](callSub) start."),
                line(40, "pool-9-thread-1", "INFO", "Disconnected Sub-service [SUB1] start."),
                line(41, "pool-9-thread-1", "INFO", "Service [SUB1] start. Request Tag [RT2]"),
                line(42, "pool-9-thread-1", "INFO", "Process [PS1](subProc) start."),
                line(50, "pool-9-thread-1", "INFO", "Task [K2](subTask) start."),
                line(60, "pool-9-thread-1", "INFO", "Task [K2](subTask) finish.(10ms)"),
                line(70, "pool-9-thread-1", "INFO", "Process [PS1](subProc) finish.(20ms)"),
                line(71, "pool-9-thread-1", "INFO", "Service [SUB1] finish.(30ms)"),
                line(80, "pool-9-thread-1", "INFO", "Disconnected Sub-service [SUB1] finish."),
                info(90, "Task [K1](callSub) finish.(60ms)"),
                info(100, "Process [P1](mainProc) finish.(80ms)"),
                info(110, "Service [SVC01] finish.(90ms)"),
                info(120, "Completed 200 OK"));

        JsonNode k1 = find(req, "Task", "K1");
        assertThat(k1.path("property").path("hasSubService").asText()).isEqualTo("y");
        assertThat(childTypes(k1)).containsExactly("Service:SUB1");
        JsonNode sub = find(k1, "Service", "SUB1");
        assertThat(childTypes(sub)).containsExactly("Task:K2");
        assertThat(sub.path("property").path("runTime").asText()).isEqualTo("30");
        assertThat(sub.path("property").path("processId").asText()).isEqualTo("PS1");
        // 안쪽 Service 시작의 Request Tag 가 요청 뿌리의 태그를 덮지 않는다.
        assertThat(req.path("property").path("requestTag").asText()).isEqualTo("RT1");
        assertThat(find(req, "Service", "SVC01").path("property").path("runTime").asText()).isEqualTo("90");
        assertThat(req.path("property").path("complete").asText()).isEqualTo("true");
        assertThat(allStrings(req)).containsExactly("POST \"/api/order/save\"");
    }

    @Test
    void 서브서비스_아닌_일반_Service_Process_Task_파싱은_그대로다() throws Exception {
        JsonNode req = tree(
                info(0, "POST \"/api/order/save\""),
                info(10, "Service [SVC01] start. Request Tag [RT1]"),
                info(20, "Process [P1](mainProc) start."),
                info(30, "Task [K1](t) start."),
                info(40, "Task [K1](t) finish.(10ms)"),
                info(50, "Process [P1](mainProc) finish.(30ms)"),
                info(60, "Service [SVC01] finish.(50ms)"),
                info(70, "Completed 200 OK"));

        JsonNode svc = find(req, "Service", "SVC01");
        assertThat(childTypes(svc)).containsExactly("Process:P1");
        assertThat(childTypes(find(svc, "Process", "P1"))).containsExactly("Task:K1");
        assertThat(svc.path("property").has("hasSubService")).isFalse();
        assertThat(svc.path("property").has("processId")).isFalse();
    }

    @ParameterizedTest(name = "[{index}] {0} => {1}")
    @CsvSource(delimiter = '|', value = {
            "Sub-service [S1] start.|SubServiceStart",
            "Sub-service [S1] finish.|SubServiceFinish",
            "Sub-service [S1] finish with exceptions.|SubServiceFinishWithException",
            "Disconnected Sub-service [S1] start.|DisconnectedSubServiceStart",
            "Disconnected Sub-service [S1] finish.|DisconnectedSubServiceFinish",
            "Sub Service [S1] start.|SubServiceLoggerStart",
            "Sub Service [S1] finish.(7ms)|SubServiceLoggerFinish",
            "Sub Service [S1] finish with exceptions.(7ms)|SubServiceLoggerFinishWithException",
            "Sub Process [P1](n) start.|SubProcessStart",
            "Sub Process [P1](n) finish.(7ms)|SubProcessFinish",
            "Sub Process [P1](n) finish with exceptions.(7ms)|SubProcessFinishWithException",
            "Service [S1] start. Request Tag [R]|ServiceStart",
            "Service [S1] finish.(7ms)|ServiceFinish",
            "Service [S1] finish with exceptions.(7ms)|ServiceFinishWithException",
            "Process [P1](n) finish with exceptions.(7ms)|ProcessFinishWithException",
            "Task [K1](n) finish with exceptions.(7ms)|TaskFinishWithException"})
    void 서비스_계열_줄은_서로_다른_토큰으로_갈린다(String message, String expectedToken) {
        LogData logData = new LogData();
        logData.setLevel("INFO");
        logData.setLogger("c.d.Svc");
        logData.setMessage(message);
        LogToken token = ParseFixture.parseToken(logData);
        assertThat(token.getTokenDefine().getTokenName()).isEqualTo(expectedToken);
    }
}
