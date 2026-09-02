package com.dongkuk.analog.nodes;

import com.dongkuk.analog.parser.ParseStack;
import com.dongkuk.analog.process.LogToken;
import com.dongkuk.analog.process.TokenType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Start로 시작하고 Finish로 끝나는 타입(예외 Request)
 * 종류
 *   - Service
 *   - Process
 *   - Task
 *   - SubService
 *   - Request : 세로운 쓰레드가 시작되면 생성 (Start/Finish는 없음)
 */
@Slf4j
@Getter
public class ObjectNode extends Node {
    private String name;
    private String thread;
    private String serviceTag;
    private String objectType;
    private List<Object> children;
    private Map<String, Object> properties;
    private ParseStack parseStack;
    private boolean complete = false;

    // 일반 Node
    public ObjectNode(LogToken logToken, ParseStack parseStack) {
        Map<String, String> matches = logToken.getMatches();
        serviceTag = logToken.getLogData().getServiceTag();
        name = "unknwon";

        if(matches.containsKey("objectName")) name = matches.get("objectName");
        else if(matches.containsKey("objectId")) name = matches.get("objectId");

        this.objectType = logToken.getTokenType().toString();
        this.properties = new HashMap<>();
        this.children = new ArrayList<>();
        this.parseStack = parseStack;
        this.parseStack.push(this);

        this.properties.put("objectType", objectType);
        this.getProperties().put("timestamp", logToken.getLogData().getTime());
        log.info(serviceTag + " : " + String.format("%" + parseStack.size() * 4  + "s", " ") + objectType + " start(" + name + ")");
    }

    //requstNode에서 사용하는 생성자
    private ObjectNode(LogToken logToken, ParseStack parseStack, String name) {
        thread = logToken.getLogData().getThread();
        serviceTag = logToken.getLogData().getServiceTag();
        this.name = name;
        this.objectType = name;

        this.properties = new HashMap<>();
        this.children = new ArrayList<>();
        this.parseStack = parseStack;
        this.parseStack.push(this);
        this.properties.put("objectType", objectType);
        this.properties.put("timestamp", logToken.getLogData().getTime());
        this.properties.put("thread", thread);
        this.properties.put("serviceTag", serviceTag);
        log.info(serviceTag+ " : " + String.format("%" + parseStack.size() * 4  + "s", " ") + objectType + " start(" + name + ")");
    }
    // 최초 RequestNode 생성 시 사용
    public static ObjectNode createRequestNode(LogToken logToken, ParseStack parseStack) {
        ObjectNode requestNode = new ObjectNode(logToken, parseStack, "Request");
//        requestNode.parse(logToken);
        return requestNode;
    }

    public void addChild(Node child) {
        children.add(child);
    }

    public void addChild(String str) {
        children.add(str);
    }

    @Override
    public void parse(LogToken logToken) {
        boolean afterClose = false;
        if(logToken.getTokenType().isObject()) {
            if(logToken.getTokenDefine().getNodeStatus().equals("Start")) {
                // 새로운 노드를 연다.
                ObjectNode childNode = new ObjectNode(logToken, parseStack);
                if(children == null)
                    children = new ArrayList<>();

                // 자식 노드 생성
                addChild(childNode);

            } else if (logToken.getTokenDefine().getNodeStatus().equals("Finish")) {
                // Object의 ID가 같은지 비교도 해야 한다.
                String objectIdFinish = logToken.getMatches().get("objectId");
                String objectIdStart = (String)parseStack.peek().getProperties().get("objectId");

                if((objectIdStart == null ||  objectIdFinish == null)  && !objectIdStart.equals(objectIdFinish)) {
                    log.error(" >>>>>>>>>>>> 시작/종료의 objectId가 동일하지 않습니다. --> " + objectIdStart + ", " + objectIdFinish);
                }

                // 현재 노드를 닫는다.
                afterClose = true;
            }
        } else if (logToken.getTokenType().equals(TokenType.Query)) {
            QueryNode queryNode = new QueryNode(logToken, parseStack);
            addChild(queryNode);
        } else if (logToken.getTokenType().equals(TokenType.InfoMessage)) {
            // addChild() 하지 않고 값 처리만 한다.
        } else if (logToken.getTokenType().equals(TokenType.Exception)) {
            // exception 처리
        } else if (logToken.getTokenType().equals(TokenType.Message)) {
//            addChild(new MessageNode(logToken, parseStack));
            if (!logToken.getTokenDefine().isDiscard())
                addChild(logToken.getLogData().getMessage());
            if(logToken.getTokenDefine().getTokenName().equals("CompletedMessage")) {
                parseStack.getRoot().getProperties().put("complete", "true");
                afterClose = true;
                // 마지막 Completed 200 OK 찍음
                // todo : 해당 메시지 외에도 종료할 조건이 필요함
            }
        } else {
            // todo : 오류 처리를 한다.
            log.error("파싱을 할 수 없습니다. " + logToken.getLogData().getMessage());
            log.error(logToken.getTokenDefine().getTokenType() + " " + logToken.getTokenDefine().getTokenName());
            return;
        }

        // logToken에서 데이터를 구해서 property 설정
        logToken.getTokenDefine().getAssignValues().forEach((assignValue) -> {
            assignValue.assign(logToken, parseStack);
        });

        if(afterClose) {
            closeNode();
        }
    }

    public void closeNode() {
        log.info(serviceTag + " : " + String.format("%" + parseStack.size() * 4  + "s", " ") + objectType + "   end(" + name + ")");
        if(parseStack.size() < 2 ) {
            Object stringObjectMap = makeTree();
            ObjectMapper objectMapper = new ObjectMapper();
            complete = true;

            try {
                // Map을 JSON 문자열로 변환
                String jsonString = objectMapper.writeValueAsString(stringObjectMap);
//                System.out.println(jsonString);
            } catch (JsonProcessingException e) {
                e.printStackTrace();
            }
        }
        if(parseStack.size() > 0) parseStack.pop();
    }

    public List<Object> getChildren() {
        return children;
    }
}