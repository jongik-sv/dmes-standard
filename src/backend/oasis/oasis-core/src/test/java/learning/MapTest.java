package learning;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-07-02
 */
public class MapTest {
    @Test
    void mapKey() {
        Map<String, String> ff = new HashMap<>();
        ff.put("\\", "hi");

        String s = ff.get("\\");
        Assertions.assertThat(s).isEqualTo("hi");
    }
}
