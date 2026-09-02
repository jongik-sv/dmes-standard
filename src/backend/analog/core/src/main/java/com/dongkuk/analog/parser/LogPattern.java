package com.dongkuk.analog.parser;

import com.dongkuk.analog.nodes.AssignValue;
import com.dongkuk.analog.scanner.LogData;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
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

        private Pattern compiledPattern; // 컴파일된 패턴을 저장할 필드

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

//    private static final LogPattern instance = LogPattern.loadPattern();

    private static LogPattern instance;

    private LogPattern() {
    }

    public static LogPattern getInstance() {
        return instance;
    }

    public static void loadPattern(File configFile) {
        try {

            ObjectMapper objectMapper = new ObjectMapper();
            instance = objectMapper.readValue(configFile, LogPattern.class);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

//        try {
//        ObjectMapper objectMapper = new ObjectMapper();
//            instance = objectMapper.readValue(new File("./config.json"), LogPattern.class);
//        } catch (IOException e) {
//            throw new RuntimeException(e);
//        }

        log.info("LogPattern Start -----------------------------------------------------------------------------");
        log.info("Version: " + instance.getVersion());
        for (Token token : instance.getTokens()) {
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

            token.assignValues = new ArrayList<>();
            if(assignValueStrings != null) {
                for (String  inputString: assignValueStrings) {
                    token.assignValues.add(new AssignValue(inputString));
                }
            }
            log.info(token.assignValues.toString());
        }
        log.info("LogPattern Finish-----------------------------------------------------------------------------");
    }
}
