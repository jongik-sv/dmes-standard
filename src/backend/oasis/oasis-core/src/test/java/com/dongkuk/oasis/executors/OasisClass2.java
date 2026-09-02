package com.dongkuk.oasis.executors;

public class OasisClass2 {
    private final GreetingMessage2 greetingMessage;

    public OasisClass2(GreetingMessage2 greetingMessage) {
        this.greetingMessage = greetingMessage;
    }

    public String greeting() {
        return greetingMessage.getMessage();
    }
}
