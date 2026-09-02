package com.dongkuk.oasis.executors;

public class NameMessageDto {
    private final String name;
    private final String message;

    public NameMessageDto(String name, String message) {
        this.name = name;
        this.message = message;
    }

    public String getName() {
        return name;
    }

    public String getMessage() {
        return message;
    }
}
