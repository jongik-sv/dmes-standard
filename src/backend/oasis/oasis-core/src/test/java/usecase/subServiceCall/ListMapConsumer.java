package usecase.subServiceCall;

import java.util.List;
import java.util.Map;

public class ListMapConsumer {
    public Map<String, Object> consume(List<Map<String, Object>> nameList) {
        System.out.println(nameList);
        return nameList.get(0);
    }
}
