package learning;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-16
 */
public class ObjectMapperTest {
    @Test
    void test() throws JsonProcessingException {
        ObjectMapper f = new ObjectMapper();
        String d = "{\"f\":3}";
        JsonNode jsonNode = f.readTree(d);
        jsonNode.get("f");
    }

    @Test
    void objectToMap() {
        ObjectMapper objectMapper = new ObjectMapper();
        Map<String, Object> hi =
                objectMapper.convertValue(new TestClass("hi"), new TypeReference<Map<String, Object>>() {
                });

        Object name = hi.get("name");
        Assertions.assertThat(name).isEqualTo("hi");
    }

    static class TestClass {
        private final String name;

        public TestClass(String name) {
            this.name = name;
        }

        public String getName() {
            return name;
        }
    }
}
