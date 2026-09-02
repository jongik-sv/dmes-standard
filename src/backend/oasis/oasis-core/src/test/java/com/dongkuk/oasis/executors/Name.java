package com.dongkuk.oasis.executors;

public class Name {
    private final String name;

    public Name(String name) {
        this.name = name;
    }

    public Name() {
        name = "default";
    }

    public String getName() {
        return name;
    }
}
