package com.dongkuk.analog.parser;

import com.dongkuk.analog.nodes.ObjectNode;
import com.dongkuk.analog.process.LogToken;
import lombok.extern.slf4j.Slf4j;

import java.util.Date;

@Slf4j
public class LogParser {
    private ParseStack parseStack = new ParseStack();
    private String time;

    public ObjectNode getRequestNode() {
        return requestNode;
    }

    private ObjectNode requestNode = null;

    // 파싱하다가 오래 된 것은 저장, 많이 오래 된 것은 삭제
    private Date touchTime = new Date();
    private boolean debug = false;
    public LogParser(LogToken logToken){
        time = logToken.getLogData().getTime();
        log.info("---------------------  RequestNode 생성." + logToken.getLogData().getServiceTag());
        requestNode = ObjectNode.createRequestNode(logToken, parseStack);
    }
    public void addQueue(LogToken logToken) {
        // 로그 표시
        if(debug) log.info("-> " + logToken.getLogData().getThread() + " : " + logToken.getLogData().getTime() + " : " + logToken.getLogData().getMessage());
        if(parseStack.peek() == null) {
            log.info("에러 로그 -> " + logToken.getLogData().getServiceTag() + " : " + logToken.getLogData().getTime() + " : " + logToken.getLogData().getMessage());
            log.error("---------------------  ParseStack이 비었습니다." + logToken.getLogData().getServiceTag());

        }

        parseStack.peek().parse(logToken);
    }

    public String getTime() {
        return time;
    }

    public Date getTouchTime() {
       return touchTime;
    }

    public void setTouchTime() {
       touchTime = new Date();
    }

    public void setDebug(boolean debug) {
        this.debug = debug;
    }
}