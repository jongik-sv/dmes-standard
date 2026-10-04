package com.dongkuk.analog.parser;

import com.dongkuk.analog.nodes.AssignValue;
import com.dongkuk.analog.scanner.LogData;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.PatternSyntaxException;

import com.google.code.regexp.Matcher;
import com.google.code.regexp.Pattern;

@Slf4j
public class LogPattern {

    @JsonProperty("version")
    private double version;

    @JsonProperty("tokens")
    private List<Token> tokens;

    public double getVersion() {
        return version;
    }

    public List<Token> getTokens() {
        return tokens;
    }

    public static class Token {
        @JsonProperty("tokenName")
        private String tokenName;

        @JsonProperty("tokenType")
        private String tokenType;

        @JsonProperty("nodeType")
        private String nodeType;

        @JsonProperty("nodeStatus")
        private String nodeStatus;

        @JsonProperty("discard")
        private boolean discard;

        @JsonProperty("stringMatchers")
        private StringMatchers stringMatchers = null;

        @JsonProperty("regExMatcher")
        private RegExMatcher regExMatcher = null;

        @JsonProperty("assignValue")
        private List<String> assignValueStrings;
        private List<AssignValue> assignValues;

        public String getTokenName() {
            return tokenName;
        }

        public String getTokenType() {
            return tokenType;
        }

        public String getNodeType() {
            return nodeType;
        }

        public String getNodeStatus() {
            return nodeStatus;
        }

        public boolean isDiscard() {
            return discard;
        }

        public StringMatchers getStringMatchers() {
            if(stringMatchers == null) return null;
            return stringMatchers;
        }

        public List<AssignValue> getAssignValues() {
            return assignValues;
        }

        public RegExMatcher getRegExMatcher() {
            return regExMatcher;
        }
    }

    @Data
    public static class StringMatchers {
        @JsonProperty("startWith")
        private List<String> startWith;
        @JsonProperty("containsAny")
        private List<String> containsAny;
        @JsonProperty("containsAll")
        private List<String> containsAll;
        @JsonProperty("logger")
        private List<String> logger;
        @JsonProperty("level")
        private List<String> level;

        private boolean startWithAny(List<String> arr, String logText) {
            if(arr == null || arr.size() == 0) return true;

            for (String prefix : arr) {
                if (logText.startsWith(prefix)) {
                    return true;
                }
            }
            return false;
        }

        private boolean containsAny(List<String> arr, String logText) {
            if(arr == null || arr.size() == 0) return true;

            for (String text : arr) {
                if (logText.contains(text)) {
                    return true;
                }
            }
            return false;
        }

        private boolean containsAll(List<String> arr, String logText) {
            if(arr == null || arr.size() == 0) return true;

            for (String text : arr) {
                if (!logText.contains(text)) {
                    return false;
                }
            }
            return true;
        }
        public boolean match(LogData logData) {

            if (startWith != null && startWithAny(startWith, logData.getMessage()) == false) return false;
            if (level != null && startWithAny(level, logData.getLevel()) == false) return false;
            if (logger != null && startWithAny(logger, logData.getLogger()) == false) return false;
            if (containsAny != null && containsAny(containsAny, logData.getMessage()) == false) return false;
            if (containsAll != null && containsAll(containsAll, logData.getMessage()) == false) return false;

            return true;
        }
    }

    public static class RegExMatcher {
        @JsonProperty("test")
        private String test;

        // 컴파일된 패턴을 저장할 필드 — LogPattern 하나를 여러 요청 스레드가 함께 쓰므로 volatile 로 안전하게 게시한다.
        private volatile Pattern compiledPattern;

        public String getTest() {
            return test;
        }

        // 패턴 컴파일 메서드
        private Pattern getCompiledPattern() {
        if (compiledPattern == null) {
                try {
                    compiledPattern = Pattern.compile(test, Pattern.DOTALL);
                } catch (PatternSyntaxException e) {
                    // 유효성 검증 실패 시 처리
                    throw new RuntimeException("Invalid regular expression: " + e.getMessage());
                }
            }
            return compiledPattern;
        }

        public Matcher match(String logText) {
            if(!canDoMatch()) return null;
            Pattern pattern = getCompiledPattern();
            Matcher matcher = pattern.matcher(logText);
            return matcher;
        }

        public boolean canDoMatch() {
            return !(test == null || test.isEmpty());
        }

    }

    // 전역 static 인스턴스(getInstance/loadPattern 으로 갈아 끼우던 방식)는 2026-10-04 에 없앴다.
    // 요청마다 갈아 끼우면 다른 요청이 반쯤 초기화된(assignValues 가 비어 있는) 인스턴스를 볼 수 있었고,
    // LogToken 이 처음 읽힌 인스턴스를 static 으로 붙잡아 이후 교체가 무시됐다.
    // 이제 load 가 다 채운 새 인스턴스를 돌려주고, 쓰는 쪽(LogProcessor)이 그 인스턴스를 들고 다닌다.

    private LogPattern() {
    }

    /** 설정 파일을 읽어 다 채운 LogPattern 을 돌려준다. */
    public static LogPattern load(File configFile) {
        try {
            return initialize(new ObjectMapper().readValue(configFile, LogPattern.class));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /** 설정 내용을 읽어 다 채운 LogPattern 을 돌려준다(jar 안 classpath 자원처럼 File 로 열 수 없는 경우). */
    public static LogPattern load(InputStream configStream) {
        try {
            return initialize(new ObjectMapper().readValue(configStream, LogPattern.class));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /** 토큰별 assignValue 를 만들어 채운다 — 이 일이 끝난 뒤에야 인스턴스를 밖으로 내보낸다. */
    private static LogPattern initialize(LogPattern pattern) {
        log.info("LogPattern Start -----------------------------------------------------------------------------");
        log.info("Version: " + pattern.getVersion());
        for (Token token : pattern.getTokens()) {
            log.info("Token Name: " + token.getTokenName());
            log.info("Token Type: " + token.getTokenType());
            log.info("Node Type: " + token.getNodeType());
            log.info("Node Status: " + token.getNodeStatus());
            log.info("Discard: " + token.isDiscard());
            log.info("stringMatchers: " + token.getStringMatchers());

            RegExMatcher regExMatcher = token.getRegExMatcher();
            if (regExMatcher != null) {
                log.info("RegEx Test: " + regExMatcher.getTest());
            }

            List<String> assignValueStrings = token.assignValueStrings;
            if (assignValueStrings != null) {
                log.info("Assign Value: " + assignValueStrings);
            }

            List<AssignValue> assignValues = new ArrayList<>();
            if(assignValueStrings != null) {
                for (String  inputString: assignValueStrings) {
                    assignValues.add(new AssignValue(inputString));
                }
            }
            token.assignValues = assignValues;
            log.info(token.assignValues.toString());
        }
        log.info("LogPattern Finish-----------------------------------------------------------------------------");
        return pattern;
    }
}
