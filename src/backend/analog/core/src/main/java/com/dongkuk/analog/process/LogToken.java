package com.dongkuk.analog.process;

import com.dongkuk.analog.parser.LogPattern;
import com.dongkuk.analog.scanner.LogData;
import com.google.code.regexp.Matcher;
import lombok.extern.slf4j.Slf4j;

import java.util.HashMap;
import java.util.Map;

@Slf4j
public class LogToken {
    private LogData logData;
    // 패턴 매칭한 내용을 바깥으로 전달 해야 한다.
    private Map<String, String> matches = null;
    private LogPattern.Token tokenDefine = null;

    private LogToken(LogData logData) {
        this.logData = logData;
    }

    public LogPattern.Token getTokenDefine() {
        return tokenDefine;
    }
    public TokenType getTokenType() {
//        if(tokenDefine == null) return TokenType.valueOf("Message") ;
        return TokenType.valueOf(tokenDefine.getTokenType());
    }

    public LogData getLogData() {
        return logData;
    }
    public Map<String, String> getMatches() {
        return matches;
    }

    private static LogPattern logPattern = LogPattern.getInstance();

    static public LogToken parse(LogData logData) {
        LogToken logToken = new LogToken(logData);
        for (LogPattern.Token token : logPattern.getTokens()) {
            if(token.getStringMatchers() != null) {
                if(!token.getStringMatchers().match(logData)) continue;
            }

            if(token.getRegExMatcher() != null) {
               if(!token.getRegExMatcher().canDoMatch()) continue;
            } else {
                logToken.tokenDefine = token;
                break;
            }


            Matcher matcher = token.getRegExMatcher().match(logData.getMessage());
            if (matcher.find()) {
                logToken.matches = new HashMap<>();

//                System.out.println(" -> " + token.getTokenName());
                for(Map<String, String> map: matcher.namedGroups() ) {
                    for (String groupName : map.keySet()) {
                        logToken.matches.put(groupName, map.get(groupName))        ;
//                        System.out.println("   -> " + groupName + ":" + logToken.matches.get(groupName));
                    }
                }

                logToken.tokenDefine = token;
                break;
            }
        }

//        log.info("logData.getMessage() = " + logData.getMessage());
        return logToken;
    }

}
