package com.dongkuk.oasis.process;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * @author Jeongjin Kim
 * @since 2021-04-07
 */
public class VarietyReturnMethods {
    private static final Logger log = LoggerFactory.getLogger(VarietyReturnMethods.class);

    public String string() {
        return "hi";
    }

    public List<String> stringList() {
        return Arrays.asList("hi", "hello");
    }

    public Map<String, String> stringStringMap() {
        Map<String, String> stringStringMap = new HashMap<>();
        stringStringMap.put("hi", "hello");
        stringStringMap.put("hello", "hi");
        return stringStringMap;
    }

    public String hello() {
        return "hello";
    }

    public Map<String, String> helloMap() {
        Map<String, String> hello = new HashMap<>();
        hello.put("greeting", "hello");
        return hello;
    }

    public int count() {
        return 3;
    }

    public List<Map<String, Object>> listMap() {
        List<Map<String, Object>> list = new ArrayList<>();
        Map<String, Object> map1 = new HashMap<>();
        map1.put("id", 1);
        map1.put("name", "Richard");
        Map<String, Object> map2 = new HashMap<>();
        map2.put("id", 2);
        map2.put("name", "Nancy");
        list.add(map1);
        list.add(map2);
        return list;
    }

    public Map<String, List<String>> mapList() {
        Map<String, List<String>> mapList = new HashMap<>();
        mapList.put("item", Arrays.asList("key", "cal", "foo"));
        mapList.put("address", Arrays.asList("busan", "haeundae"));
        return mapList;
    }

    public String[] stringArray() {
        return new String[]{"hi", "hello"};
    }

    public List<List<List<String>>> listListList() {
        return Collections.singletonList(Collections.singletonList(Collections.singletonList("hello")));
    }

    public String greeting(String name) {
        return "hello " + name;
    }

    public String taskBranching(String flowName) {
        return flowName;
    }

    public void noReturnValue() {

    }

    public void mapParam(Map<String, Object> param) {
        log.info(param.toString());
    }

    public void listParam(List<Object> param) {
        log.info(param.toString());
    }

    public void stringListParam(List<String> param) {
        log.info(param.toString());
    }

    public void intParam(int param) {
        log.info("" + param);
    }

    public void doubleParam(double param) {
        log.info("" + param);
    }
}
