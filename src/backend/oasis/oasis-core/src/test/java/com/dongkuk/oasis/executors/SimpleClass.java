package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.annotations.MethodQualifier;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
public class SimpleClass {
    private HelloDto helloDto;
    private String message;

    public String hello(HelloDto helloDto) {
        return helloDto.getName();
    }

    public String hello(String message) {
        return "Hi! " + message;
    }

    public String hello(Hello hello) {
        return hello.sayHello();
    }

    public String hello(Map<String, Object> hellos) {
        String collect = hellos.values().stream().map(o -> (String) o).collect(Collectors.joining(","));
        System.out.println(collect);
        return collect;
    }

    public SimpleClass(HelloDto helloDto) {
        this.helloDto = helloDto;
    }

    public SimpleClass(Hello hello) {
        message = hello.sayHello();
    }

    public String getMessage() {
        return message;
    }

    public String helloDtoName() {
        return this.helloDto.getName();
    }

    public SimpleClass() {
    }

    @MethodQualifier("nonono")
    public String no() {
        return "no";
    }
}
