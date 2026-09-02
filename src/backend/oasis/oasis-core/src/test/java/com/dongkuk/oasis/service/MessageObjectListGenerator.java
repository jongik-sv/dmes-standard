package com.dongkuk.oasis.service;

import java.util.Arrays;
import java.util.List;

public class MessageObjectListGenerator {
    public List<MessageObject> generate() {
        return Arrays.asList(new MessageObject("id1", "name1"),
                new MessageObject("id2", "name2"));
    }
}
