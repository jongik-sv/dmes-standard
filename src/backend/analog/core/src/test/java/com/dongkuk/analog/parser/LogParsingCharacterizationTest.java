package com.dongkuk.analog.parser;

import com.dongkuk.analog.nodes.AssignValue;
import com.dongkuk.analog.process.LogToken;
import com.dongkuk.analog.scanner.LogData;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * analog 로그 파서 특성 테스트 — 2026-10-04 리팩토링(스레드 풀·LogPattern 정리) 직전의 파싱 결과를 고정한다.
 *
 * <p>대상 파일(파서 관련 12개): parser/LogPattern·LogParser·ParseStack, process/LogProcessor·LogToken·TokenType,
 * scanner/LogLexer·LogData, nodes/AssignValue·Node·ObjectNode·QueryNode.
 * 기대값은 바꾸기 전 코드로 뽑은 값이다 — 결과가 달라지면 동작이 바뀐 것이다.
 */
class LogParsingCharacterizationTest {

    @Test
    void 렉서는_lex_패턴으로_줄을_나누고_이어진_줄과_파싱불가_줄을_구분한다() throws Exception {
        Queue<LogData> queue = new ConcurrentLinkedQueue<>();
        ParseFixture.newLexer(queue).readBuffer(new BufferedReader(new StringReader(ParseFixture.SAMPLE_LOG)));

        List<String> actual = new ArrayList<>();
        for (LogData d : queue) {
            actual.add(d.getConStr() + "|" + d.getTime() + "|" + d.getThread() + "|" + d.getServiceTag() + "|"
                    + d.getLevel() + "|" + d.getLogger() + "|" + d.getMessage() + "|" + d.isEoq());
        }
        assertThat(actual).containsExactly(
                "false|2026-05-15 10:00:00.000|http-1|T1|INFO|c.d.Web|POST \"/api/order/save\"|false",
                "false|2026-05-15 10:00:00.010|http-1|T1|INFO|c.d.Svc|Service [SVC01] start. Request Tag [RT1]|false",
                "false|2026-05-15 10:00:00.020|http-2|T2|INFO|c.d.Web|GET \"/api/item/list\"|false",
                "false|2026-05-15 10:00:00.030|http-1|T1|INFO|c.d.Svc|Process [P1](saveProc) start.|false",
                "false|2026-05-15 10:00:00.040|http-1|T1|INFO|c.d.Svc|Task [K1](saveTask) start.|false",
                "false|2026-05-15 10:00:00.050|http-1|T1|DEBUG|c.d.Sql|Mybatis SQL : select * from item where id = ?|false",
                "false|2026-05-15 10:00:00.051|http-1|T1|TRACE|c.d.Bind|binding parameter [1] as [VARCHAR] - [A01]|false",
                "false|2026-05-15 10:00:00.052|http-1|T1|DEBUG|org.hibernate.engine.internal.TwoPhaseLoad|Resolving attributes|false",
                "false|2026-05-15 10:00:00.060|http-1|T1|INFO|c.d.Svc|Invoking class : [com.d.Foo], method : [bar]|false",
                "false|2026-05-15 10:00:00.070|http-1|T1|INFO|c.d.Svc|Task [K1](saveTask) finish.(30ms)|false",
                "false|2026-05-15 10:00:00.080|http-1|T1|ERROR|c.d.Svc|failure occurred|false",
                "true|null|null|null|null|null|\tat com.d.Foo.bar(Foo.java:10)|false",
                "true|null|null|null|null|null|\tat com.d.Main.main(Main.java:3)|false",
                "false|2026-05-15 10:00:00.090|http-1|T1|INFO|c.d.Svc|plain business message|false",
                "false|2026-05-15 10:00:00.095|http-2|T2|INFO|c.d.Svc|Sub-service [SUB9] start.|false",
                "false|2026-05-15 10:00:00.100|http-1|T1|INFO|c.d.Svc|Process [P1](saveProc) finish.(70ms)|false",
                "false|2026-05-15 10:00:00.110|http-1|T1|INFO|c.d.Svc|Service [SVC01] finish.(100ms)|false",
                "false|2026-05-15 10:00:00.120|http-1|T1|INFO|c.d.Web|Completed 200 OK|false",
                "false|2026-05-15 10:00:00.200|http-2|T2|DEBUG|c.d.Svc|Converted value on extraction: x|false",
                "false|null|null|null|null|null|null|true");
    }

    static Stream<Arguments> 토큰_표본() {
        return Stream.of(
                Arguments.of("INFO", "c.d.Svc", "Service [SVC01] start. Request Tag [RT1]", "ServiceStart", "{objectId=SVC01, requestTag=RT1}"),
                Arguments.of("INFO", "c.d.Svc", "Service [SVC01] finish.(100ms)", "ServiceFinish", "{objectId=SVC01, runTime=100}"),
                Arguments.of("INFO", "c.d.Svc", "Sub-service [SUB9] start.", "SubServiceStart", "{objectId=SUB9}"),
                Arguments.of("INFO", "c.d.Svc", "Sub-service [SUB9] finish.", "SubServiceFinish", "{objectId=SUB9}"),
                Arguments.of("INFO", "c.d.Svc", "Process [P1](saveProc) start.", "ProcessStart", "{objectId=P1, objectName=saveProc}"),
                Arguments.of("INFO", "c.d.Svc", "Process [P1](saveProc) finish.(70ms)", "ProcessFinish", "{objectId=P1, objectName=saveProc, runTime=70}"),
                Arguments.of("INFO", "c.d.Svc", "Task [K1](saveTask) start.", "TaskStart", "{objectId=K1, objectName=saveTask}"),
                Arguments.of("INFO", "c.d.Svc", "Task [K1](saveTask) finish.(30ms)", "TaskFinish", "{objectId=K1, objectName=saveTask, runTime=30}"),
                Arguments.of("DEBUG", "c.d.Sql", "Mybatis SQL : select 1", "Query1", "{query=select 1}"),
                Arguments.of("DEBUG", "org.hibernate.SQL", "select a from b", "Query2", "{query=select a from b}"),
                Arguments.of("DEBUG", "c.d.Jdbc", "Executing prepared SQL statement [select 2]", "Query3", "{query=select 2]}"),
                Arguments.of("TRACE", "c.d.Bind", "binding parameter [1] as [VARCHAR] - [A01]", "QueryParameter2", "{type=VARCHAR, value=A01}"),
                Arguments.of("TRACE", "c.d.Bind", "Setting SQL statement parameter value: column index 1, parameter value [7], value class [java.lang.Integer]", "QueryParameter1", "{type=java.lang.Integer, value=7}"),
                Arguments.of("INFO", "c.d.Svc", "Invoking class : [com.d.Foo], method : [bar]", "InvokingClass", "{class=com.d.Foo, method=bar}"),
                Arguments.of("INFO", "org.hibernate.internal.util.EntityPrinter", "com.dongkuk.dmes.Foo{id=1}", "RequestLog", "{requestLog={id=1}}"),
                Arguments.of("ERROR", "c.d.Svc", "failure\n\tat com.d.Foo.bar(Foo.java:10)", "Exception", null),
                Arguments.of("ERROR", "c.d.Svc", "failure without stack", "Message", null),
                Arguments.of("INFO", "c.d.Svc", "Parameter x has bound by name.", "DisCardMessage1", null),
                Arguments.of("INFO", "c.d.Svc", "extracted value ([a] : [b])", "DisCardMessageWithStart", null),
                Arguments.of("DEBUG", "org.hibernate.engine.internal.TwoPhaseLoad", "Resolving", "DisCardMessageWithLogger", null),
                Arguments.of("DEBUG", "org.hibernate.type.CollectionType", "reated collection wrapper: x", "DisCardMessageWithLogger", null),
                Arguments.of("INFO", "c.d.Web", "POST \"/api/order/save\"", "RequestMessage", "{Request=POST \"/api/order/save\", RequestType=api}"),
                Arguments.of("INFO", "c.d.Web", "Completed 200 OK", "CompletedMessage", null),
                Arguments.of("INFO", "c.d.Svc", "Converted value on binding: 1", "ConvertedValueOnBinding", null),
                Arguments.of("INFO", "c.d.Svc", "plain business message", "Message", null));
    }

    @ParameterizedTest(name = "[{index}] {2} => {3}")
    @MethodSource("토큰_표본")
    void 토큰_분류와_정규식_추출값은_기본_패턴_순서를_따른다(String level, String logger, String message,
                                            String expectedToken, String expectedMatches) {
        LogData logData = new LogData();
        logData.setLevel(level);
        logData.setLogger(logger);
        logData.setMessage(message);

        LogToken token = ParseFixture.parseToken(logData);

        assertThat(token.getTokenDefine().getTokenName()).isEqualTo(expectedToken);
        Map<String, String> matches = token.getMatches();
        assertThat(matches == null ? null : new TreeMap<>(matches).toString()).isEqualTo(expectedMatches);
    }

    @Test
    void assignValue_는_매치키_선택자_변수_저장형을_나눈다() {
        List<String> actual = new ArrayList<>();
        for (String s : List.of("objectId:#{Local}objId", "objectName:#{Parent}objName.arr", "objectType:#{Root}objType.set",
                "objectMessage:Message", "'y':#{Parent}hasQuery", "runTime", "message:#{Root}exception.Arr",
                " requestTag : #{Root} requestTag ")) {
            AssignValue a = new AssignValue(s);
            actual.add(a.getMatchKey() + "|" + a.getSelector() + "|" + a.getVariable() + "|" + a.getType());
        }
        assertThat(actual).containsExactly(
                "objectId|Local|objId|null",
                "objectName|Parent|objName|arr",
                "objectType|Root|objType|set",
                "objectMessage|Local|Message|null",
                "'y'|Parent|hasQuery|null",
                "runTime|Local|runTime|null",
                "message|Root|exception|Arr",
                "requestTag|Root|requestTag|null");
    }

    @Test
    void 샘플_로그의_요청_트리는_고정된_결과와_같다() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        List<Object> tree = ParseFixture.parseTree(ParseFixture.SAMPLE_LOG);

        // 속성 맵이 HashMap 이라 필드 순서는 보지 않는다. 숫자형(Long/Integer) 차이를 없애려 한 번 직렬화해 비교한다.
        try (InputStream golden = getClass().getResourceAsStream("/characterization/sample-log-tree.json")) {
            assertThat(mapper.readTree(mapper.writeValueAsString(tree))).isEqualTo(mapper.readTree(golden));
        }
    }
}
