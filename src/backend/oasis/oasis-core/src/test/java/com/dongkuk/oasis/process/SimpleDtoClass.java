package com.dongkuk.oasis.process;

/**
 * @author Jeongjin Kim
 * @since 2021-04-07
 */
public class SimpleDtoClass {
    private final int id;
    private final String name;

    public SimpleDtoClass(int id, String name) {
        this.id = id;
        this.name = name;
    }

    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }
}
