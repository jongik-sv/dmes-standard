package usecase.subServiceCall;

import java.util.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-09
 */
public class ListMapGenerator {

    public List<Map<String, Object>> listMap() {
        List<Map<String, Object>> list = new ArrayList<>();
        Map<String, Object> map1 = new HashMap<>();
        map1.put("id", 1);
        map1.put("name", "Richard");
        Map<String, Object> map2 = new HashMap<>();
        map2.put("id", 2);
        map2.put("name", "Nancy");
        list.add(map1);
        list.add(map2);
        return list;
    }

    public Map<String, List<String>> mapList() {
        Map<String, List<String>> mapList = new HashMap<>();
        mapList.put("item", Arrays.asList("key", "cal", "foo"));
        mapList.put("address", Arrays.asList("busan", "haeundae"));
        return mapList;
    }
}
