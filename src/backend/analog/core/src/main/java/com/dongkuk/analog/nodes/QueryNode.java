package com.dongkuk.analog.nodes;

import com.dongkuk.analog.parser.ParseStack;
import com.dongkuk.analog.process.LogToken;
import com.dongkuk.analog.process.TokenType;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Getter
public class QueryNode extends Node {
    private ParseStack parseStack;
    private Map<String, Object> properties = new HashMap<>();

    public QueryNode(LogToken logToken, ParseStack parseStack) {
        this.parseStack = parseStack;
        this.parseStack.push(this);
        this.properties.put("objectType", logToken.getTokenType().toString());
        this.properties.put("timestamp", logToken.getLogData().getTime());
        log.info(logToken.getLogData().getServiceTag() + " : " + String.format("%" + parseStack.size() * 4 + "s", " ") + logToken.getTokenType().toString());
    }

    @Override
    public void parse(LogToken logToken) {
        if (logToken.getTokenType().equals(TokenType.QueryParameter)) {
            logToken.getTokenDefine().getAssignValues().forEach((assignValue) -> {
                assignValue.assign(logToken, parseStack);
            });
            return;
        } else if (logToken.getTokenDefine().getTokenName().equals("ConvertedValueOnBinding")) {
            return;
        } else if (logToken.getTokenDefine().getTokenName().equals("SQL")) {
            logToken.getTokenDefine().getAssignValues().forEach((assignValue) -> {
                assignValue.assign(logToken, parseStack);
            });
            return;
        } else {
            try {

                Instant startTime = Instant.parse(((String)properties.get("timestamp")).replace(",", ".").replace(" ", "T")+"Z");
                Instant endTime = Instant.parse(logToken.getLogData().getTime().replace(",", ".").replace(" ", "T") + "Z");

                Duration duration = Duration.between(startTime, endTime);
                properties.put("runTime", duration.toMillis());
            }
            catch (Exception e) {
                log.error("시간 변환에 실패 했습니다.");
                log.error(e.getMessage());
            }
            closeNode();
            parseStack.peek().parse(logToken);
        }
    }

    public void closeNode() {
        parseStack.pop();
    }
}