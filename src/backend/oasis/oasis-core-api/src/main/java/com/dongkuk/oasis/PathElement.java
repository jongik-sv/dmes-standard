package com.dongkuk.oasis;

/**
 * @author Jeongjin Kim
 * @since 2021-06-24
 */
public class PathElement {
    private final String id;
    private final String name;

    /**
     * @param id   식별자
     * @param name 이름
     */
    public PathElement(String id, String name) {
        this.id = id;
        this.name = name;
    }

    /**
     * @return 식별자
     */
    public String getId() {
        return id;
    }

    /**
     * @return 이름
     */
    public String getName() {
        return name;
    }

    @Override
    public String toString() {
        return id + "(" + name + ")";
    }
}
