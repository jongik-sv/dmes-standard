package com.dongkuk.oasis.service;

public class MessageObject {
    private final String id;
    private final String name;

    public MessageObject(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }
}
