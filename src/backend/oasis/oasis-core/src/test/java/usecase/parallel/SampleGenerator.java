package usecase.parallel;

import net.datafaker.Faker;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-08-03
 */
public class SampleGenerator {
    public List<Map<String, Object>> listMap() {
        List<Map<String, Object>> listMap = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 5; i < 10; i++) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", i);
            map.put("firstName", faker.name().firstName());
            map.put("lastName", faker.name().lastName());
            listMap.add(map);
        }
        return listMap;
    }
}
