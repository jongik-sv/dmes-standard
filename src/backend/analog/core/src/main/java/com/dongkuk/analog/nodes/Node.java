package com.dongkuk.analog.nodes;

import com.dongkuk.analog.parser.ParseStack;
import com.dongkuk.analog.process.LogToken;
import lombok.extern.slf4j.Slf4j;

import java.util.*;

@Slf4j
public abstract class Node {
    public abstract void parse(LogToken logToken);

    public abstract Map<String, Object> getProperties();
    public abstract ParseStack getParseStack();

    public Object makeTree() {
        Map<String, Object> tree = new HashMap<>();

        if(getProperties().get("objectType").equals("Request")) {
            String mainService = "code";
            String timestamp = (String)getProperties().get("timestamp");
            String serviceTag = (String)getProperties().get("serviceTag");
            String requestTag = (String)getProperties().get("requestTag");

            if(requestTag == null) requestTag = "_";

            if(getProperties().containsKey("service")) {
                Set<String> services = (Set<String>) getProperties().get("service");
                if(!services.isEmpty()) mainService = services.iterator().next();
            }
            String id = timestamp + "$" + mainService + "$" + serviceTag + "$" + requestTag;
            tree.put("_id", id);
        }

        tree.put("property", getProperties());


        if(this instanceof ObjectNode) {
            ObjectNode objectNode = (ObjectNode) this;
            if(objectNode.getChildren() != null && objectNode.getChildren().size() != 0) {
                List<Object> childrenTree = new ArrayList<>();
                tree.put("child", childrenTree);
                for (Object child:objectNode.getChildren() ) {

                    if(child instanceof ObjectNode || child instanceof QueryNode) {
                        childrenTree.add(((Node)child).makeTree());
                    } else if(child instanceof String){
                        childrenTree.add(child) ;
                    } else {
                        log.error("해당 오브젝트를 처리 할 수 없습니다." + child.getClass());
                    }
                }
            }
        }
        return tree;
    }
}
