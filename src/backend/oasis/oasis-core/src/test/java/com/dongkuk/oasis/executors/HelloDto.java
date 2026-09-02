package com.dongkuk.oasis.executors;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
public class HelloDto {
    private final String name;

    public HelloDto(String name) {
        this.name = name;
    }

    public HelloDto(NickName nameSpec) {
        this.name = nameSpec.getName();
    }

    public String getName() {
        return name;
    }

}
