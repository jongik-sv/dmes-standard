package com.dongkuk.analog.parser;

import com.dongkuk.analog.nodes.Node;
import com.dongkuk.analog.nodes.ObjectNode;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.util.Iterator;
import java.util.concurrent.ConcurrentLinkedDeque;

@Slf4j
@Data
public class ParseStack {
    ConcurrentLinkedDeque<Node> nodeStack = new ConcurrentLinkedDeque<>();

    public Node peek() {
       return nodeStack.peek();
    }

    public Node pop() {
       // 삭제 ObjectNode return
        if(nodeStack.isEmpty()) return null;
        return nodeStack.pop();
    }

    public void push(Node node) {
        nodeStack.push(node);

//        log.error(nodeStack.toString()) ;
    }

    public int size() {
        return nodeStack.size();
    }

    /**
     *  bottom을 가져온다 (가정 먼저 push된 요소)
     *
     * @return
     */
    public Node getRoot() {
        Node root = nodeStack.getLast();
        return root;
    }

    /**
     * 입력된 objectType으로 가장 최근에 push된 요소를 찾아서 리턴한다.
     *
     * @param objectType
     * @return
     */
    public Node getNearestNode(String objectType) {
        String lowerCaseObjectType = objectType.toLowerCase();
        for (Node node: nodeStack) {
           ObjectNode objectNode = (ObjectNode) node;
           if(objectNode.getObjectType().toLowerCase().equals(lowerCaseObjectType)) return node;
        }

        return null;
    }


    public Node getParent() {
        if(nodeStack.size() < 2) return null;

        Iterator<Node> iterator = nodeStack.iterator();
        // 첫 번째 요소(가장 최근에 push된 요소)를 무시하고 다음 요소로 이동
        iterator.next();
        return iterator.next(); // 두 번째 요소(바로 아래의 요소)를 반환
    }
}
