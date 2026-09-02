package com.dongkuk.oasis.serialization;

import com.dongkuk.oasis.TypedObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSerializationContext;
import com.google.gson.JsonSerializer;

import java.lang.reflect.Type;

public class TypedObjectJsonSerializer implements JsonSerializer<TypedObject> {

    @Override
    public JsonElement serialize(TypedObject src, Type typeOfSrc, JsonSerializationContext context) {
        JsonObject jsonObject = new JsonObject();
        jsonObject.addProperty("type", src.getType().getTypeName());
        jsonObject.add("object", context.serialize(src.getObject()));
        return jsonObject;
    }
}
