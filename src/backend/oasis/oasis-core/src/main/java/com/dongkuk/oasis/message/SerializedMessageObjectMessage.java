package com.dongkuk.oasis.message;

import com.dongkuk.oasis.TypedObject;
import com.google.gson.Gson;

import java.lang.reflect.Type;

class SerializedMessageObjectMessage implements MessageObjectMessage {
    private final Topic topic;
    private final TypedObject object;
    private final String serialized;

    SerializedMessageObjectMessage(Topic topic, TypedObject object) {
        this.topic = topic;
        this.object = object;
        Gson gson = new Gson();
        serialized = gson.toJson(object.getObject(), object.getType());
    }

    @Override
    public Object object() {
        Gson gson = new Gson();
        return gson.fromJson(serialized, object.getType());
    }

    @Override
    public Type type() {
        return object.getType();
    }

    @Override
    public Topic topic() {
        return topic;
    }
}
