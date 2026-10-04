package com.dongkuk.analog.parser;

import com.dongkuk.analog.process.LogProcessor;
import com.dongkuk.analog.process.LogToken;
import com.dongkuk.analog.scanner.LogData;
import com.dongkuk.analog.scanner.LogLexer;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.StringReader;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * 파서 특성 테스트 공용 픽스처 — 운영 설정(application.yml)과 같은 lex 패턴·줄 시작 문자열과
 * 기본 analog-serializer.json 을 쓴다. 파서 API 를 부르는 곳은 이 클래스 한 곳에 모은다.
 */
final class ParseFixture {

    /** api application.yml 의 analog-serializer.lex_pattern 과 같은 값. */
    static final String LEX_PATTERN = "(?<time>20\\d\\d-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d) \\[(?<thread>[^\\]]+)\\] \\[(?<serviceTag>[\\w:]+)\\] \\[(?<service>[^\\]]+)\\] (?<level>(?:TRACE|DEBUG|INFO|WARN|ERROR))\\s+(?<logger>[\\w.$-]+) - (?<message>.*)";
    /** api application.yml 의 analog-express.new_line_inspector 와 같은 값. */
    static final String START_STRING = "20";

    /**
     * 요청 하나(T1)를 Service·Process·Task·Query·예외·메시지까지 열고 닫고, 다른 요청(T2)이 사이에 끼는 샘플.
     * 마지막 줄은 아직 열린 T2 의 버림 메시지다 — 이제 LogProcessor 는 끝 신호(EOQ)에서 마지막 논리 줄도 소비한다.
     * 예전 기대값(골든)을 그대로 두려고 남긴 보초 줄이다.
     */
    static final String SAMPLE_LOG = String.join("\n",
            "2026-05-15 10:00:00.000 [http-1] [T1] [SVC01] INFO  c.d.Web - POST \"/api/order/save\"",
            "2026-05-15 10:00:00.010 [http-1] [T1] [SVC01] INFO  c.d.Svc - Service [SVC01] start. Request Tag [RT1]",
            "2026-05-15 10:00:00.020 [http-2] [T2] [SVC02] INFO  c.d.Web - GET \"/api/item/list\"",
            "2026-05-15 10:00:00.030 [http-1] [T1] [SVC01] INFO  c.d.Svc - Process [P1](saveProc) start.",
            "2026-05-15 10:00:00.040 [http-1] [T1] [SVC01] INFO  c.d.Svc - Task [K1](saveTask) start.",
            "2026-05-15 10:00:00.050 [http-1] [T1] [SVC01] DEBUG c.d.Sql - Mybatis SQL : select * from item where id = ?",
            "2026-05-15 10:00:00.051 [http-1] [T1] [SVC01] TRACE c.d.Bind - binding parameter [1] as [VARCHAR] - [A01]",
            "2026-05-15 10:00:00.052 [http-1] [T1] [SVC01] DEBUG org.hibernate.engine.internal.TwoPhaseLoad - Resolving attributes",
            "2026-05-15 10:00:00.060 [http-1] [T1] [SVC01] INFO  c.d.Svc - Invoking class : [com.d.Foo], method : [bar]",
            "2026-05-15 10:00:00.070 [http-1] [T1] [SVC01] INFO  c.d.Svc - Task [K1](saveTask) finish.(30ms)",
            "2026-05-15 10:00:00.080 [http-1] [T1] [SVC01] ERROR c.d.Svc - failure occurred",
            "\tat com.d.Foo.bar(Foo.java:10)",
            "\tat com.d.Main.main(Main.java:3)",
            "2026-bad line that starts with 20 but does not match",
            "2026-05-15 10:00:00.090 [http-1] [T1] [SVC01] INFO  c.d.Svc - plain business message",
            "2026-05-15 10:00:00.095 [http-2] [T2] [SVC02] INFO  c.d.Svc - Sub-service [SUB9] start.",
            "2026-05-15 10:00:00.100 [http-1] [T1] [SVC01] INFO  c.d.Svc - Process [P1](saveProc) finish.(70ms)",
            "2026-05-15 10:00:00.110 [http-1] [T1] [SVC01] INFO  c.d.Svc - Service [SVC01] finish.(100ms)",
            "2026-05-15 10:00:00.120 [http-1] [T1] [SVC01] INFO  c.d.Web - Completed 200 OK",
            "2026-05-15 10:00:00.200 [http-2] [T2] [SVC02] DEBUG c.d.Svc - Converted value on extraction: x");

    private ParseFixture() {
    }

    static File defaultPatternFile() {
        try {
            return new File(ParseFixture.class.getResource("/analog-serializer.json").toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    static LogLexer newLexer(Queue<LogData> queue) {
        LogLexer lexer = new LogLexer();
        lexer.setQueue(queue);
        lexer.setLogPattern(LEX_PATTERN);
        lexer.setStartString(START_STRING);
        return lexer;
    }

    /** 기본 패턴 파일을 읽는다. */
    static LogPattern loadDefaultPattern() {
        return LogPattern.load(defaultPatternFile());
    }

    /** 로그 한 줄을 기본 패턴으로 토큰 분류한다. */
    static LogToken parseToken(LogData logData) {
        return LogToken.parse(logData, loadDefaultPattern());
    }

    /**
     * 컨트롤러 /log/range/time/tree 와 같은 순서(렉서 → 큐 → 프로세서)로 트리를 만든다.
     * 동시 실행 대신 readBuffer 를 먼저 끝내고 소비해 결과가 흔들리지 않게 한다.
     */
    static List<Object> parseTree(String logText) throws IOException {
        BlockingQueue<LogData> queue = new LinkedBlockingQueue<>();
        LogProcessor processor = new LogProcessor(newLexer(queue), queue, loadDefaultPattern());
        processor.getLogLexer().readBuffer(new BufferedReader(new StringReader(logText)));
        processor.run();
        return processor.getTree();
    }
}
