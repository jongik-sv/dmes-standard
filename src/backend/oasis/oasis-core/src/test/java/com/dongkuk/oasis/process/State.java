package com.dongkuk.oasis.process;

/**
 * @author Jeongjin Kim
 * @since 2021-08-20
 */
public class State {
    private String data;

    public void start() {
        data = "started";
    }

    public String getData() {
        return data;
    }
}
