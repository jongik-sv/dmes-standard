package com.dongkuk.analog.nodes;

import com.dongkuk.analog.parser.ParseStack;
import com.dongkuk.analog.process.LogToken;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import java.util.*;
import com.google.code.regexp.Matcher;
import com.google.code.regexp.Pattern;
@Getter
@Slf4j
public class AssignValue {
    private String matchKey;
    private String selector;
    private String variable;
    private String type;
    /**
     *     1. String을 하나 입력 받아서 ':'으로 split 해서 만든 배열을 splitArr에 넣는다.
     *     2. splitArr[0]은 match 변수에 넣고
     *       - 만약 '로 감싸져 있으면 match에서 찾는 것이 아니라 그 문자 자체가 된다.
     *     3. splitArr[1]을 다시 "."으로 split 해서 만든 배열을 splitArr2에 넣는다.
     *     4. splitArr2[1]이 있으면 type 변수에 넣고 없으면 null을 넣는다.
     *     5. splitArr2[0]에서 selector와 var를 찾는다.
     *         - selector :  "#{"와 "}" 사이의 문자열, selector 패턴이 없으면 'Local'로 지정
     *         - var : 뒤에 뒤이어서 나오는 문자열에서 "."을 만나기 전까지의 문자열
     *     6. 동작확인
     *       예제 입력
     *         - objectId:#{Local}objId
     *         - objectName:#{Parent}objName.arr
     *         - objectType:#{Root}objType.set
     *         - objectMessage:Message
     *         - 'y':#{Parent}hasQuery
     *       예제 출력
     *         - match: objectId, selector : Local, var : Variable, type : null
     *         - match: objectName, selector : Parent, var : Abc, type : arr
     *         - match: objectType, selector : Root, var : Aaa, type : set
     *         - match: objectMessage, selector : Local, var : Variable, type : null
     *         - match: y 문자 자체, selector : Parent, var : hasQuery, type : null
     */
    public AssignValue(String inputString) {
        if (inputString != null) {
            inputString = inputString.replaceAll("\\s+", "");
        }

        if (inputString == null || inputString.trim().equals("")) {
            return;
        };

        String[] valueCheck = inputString.split(":");
        matchKey = valueCheck[0].trim();

        if(valueCheck.length == 1) {
            selector = "Local";
            variable = matchKey;
            return;
        }

        String[] typeCheck = valueCheck[1].split("\\.");
        type = typeCheck.length > 1 ? typeCheck[1] : null;

        // 기본값 설정
        selector = "Local";
        variable = typeCheck[0].trim();

        Pattern pattern = Pattern.compile("#\\{(.*?)}");
        Matcher matcher = pattern.matcher(variable);
        if (matcher.find()) {
            selector = matcher.group(1).trim();
            variable = variable.substring(matcher.end()).trim();
        }
    }

    public void assign(LogToken logToken, ParseStack parseStack) {
        if(matchKey == null || matchKey.isEmpty()) return;
        String sourceValue = null;
        if(matchKey.toLowerCase().equals("message")) {
            sourceValue = logToken.getLogData().getMessage();
        } else if(matchKey.toLowerCase().equals("time")) {
            sourceValue = logToken.getLogData().getTime();
        } else if(matchKey.toLowerCase().equals("thread")) {
            sourceValue = logToken.getLogData().getThread();
        } else if(matchKey.toLowerCase().equals("servicetag")) {
           sourceValue = logToken.getLogData().getServiceTag();
        } else if(!matchKey.equals("''") && matchKey.startsWith("'") && matchKey.endsWith("'")) {
            sourceValue = matchKey.substring(1, matchKey.length() -1);
        }else {
            Map<String, String> source = logToken.getMatches();
            if (!source.containsKey(matchKey)) {
                log.error("프로퍼티를 설정하기 위한 '" + matchKey + "'를 매칭 변수에서 찾을 수 없습니다.");
            }
            sourceValue = source.get(matchKey);
        }

        Map<String, Object> target;

        if (selector == null || selector.isEmpty() || selector.toLowerCase().equals("local")) {
            target =  parseStack.peek().getProperties();
        } else if (selector.toLowerCase().equals("parent")) {
            target = parseStack.getParent().getProperties();
        } else if (selector.toLowerCase().equals("root") || selector.toLowerCase().equals("request")) {
            target = parseStack.getRoot().getProperties();
        } else {
            target = parseStack.getNearestNode(selector).getProperties();
            if (target == null) {
                log.error("조상 Node중에 '" + selector + "'로 검색되는 노드가 없습니다.");
                return;
            }
        }

        if (type == null || type.trim().isEmpty()) { // 그냥 String
           target.put(variable, sourceValue);
        } else if(type.toLowerCase().equals("arr")) { // List에 저장
            String targetKey = variable.toLowerCase(); // + "." + type.toUpperCase();
            if (!target.containsKey(targetKey)) {
               List<String> targetArr = new ArrayList<>();
               target.put(targetKey, targetArr);
            }
            List<String> v = (List<String>) target.get(targetKey);
            v.add(sourceValue);
        } else if(type.toLowerCase().equals("set")) { // Set에 저장
            String targetKey = variable.toLowerCase(); // + "." + type.toUpperCase();
            if (!target.containsKey(targetKey)) {
                Set<String> targetArr = new LinkedHashSet<>();
                target.put(targetKey, targetArr);
            }
            Set<String> v = (Set<String>) target.get(targetKey);
            v.add(sourceValue);
        } else {
            log.error("저장 타입은 null(String), List(Arr), Set(Set) 3종류 밖에 없습니다. 입력타입(" + type +")");
        }
    }
}