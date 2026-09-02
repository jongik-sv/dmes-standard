package learning.gson;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.serialization.TypedObjectJsonSerializer;
import com.dongkuk.oasis.utils.MapBuilder;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.junit.jupiter.api.Test;

import java.util.Map;

public class ToJsonTest {
    @Test
    void toJson() {
        Gson gson = new GsonBuilder()
                .disableHtmlEscaping()
                .registerTypeAdapter(TypedObject.class, new TypedObjectJsonSerializer())
                .setPrettyPrinting().create();

        Picnic kim = new Picnic("kim", 22,
                new MapBuilder<String, TypedObject>()
                        .addEntity("key1",
                                new TypedObject(
                                        new MapBuilder<String, Object>()
                                                .addEntity("id", 123)
                                                .addEntity("age", new CustomClass("22"))
                                                .build(),
                                        new TypeReference<Map<String, Object>>() {
                                        }
                                ))
                        .build());
        String s = gson.toJson(kim);

        System.out.println(s);
    }

    static class CustomClass {
        private final String uid;

        CustomClass(String uid) {
            this.uid = uid;
        }

        public String getUid() {
            return uid;
        }
    }

    static class Picnic {
        private final String name;
        private final int age;
        private final Map<String, TypedObject> data;

        Picnic(String name, int age, Map<String, TypedObject> data) {
            this.name = name;
            this.age = age;
            this.data = data;
        }

    }
}
