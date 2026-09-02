package com.dongkuk.oasis.executors;

public class NickName {
    private final String name;

    public NickName() {
        this.name = "default";
    }

    public NickName(String nickName) {
        this.name = nickName;
    }

    public String getName() {
        return name;
    }
}
