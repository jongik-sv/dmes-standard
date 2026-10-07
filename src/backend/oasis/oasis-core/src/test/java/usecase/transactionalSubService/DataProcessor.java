package usecase.transactionalSubService;

import com.dongkuk.oasis.utils.MapBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class DataProcessor {
    private final BasicRepository basicRepository;

    public DataProcessor(BasicRepository basicRepository) {
        this.basicRepository = basicRepository;
    }

    // Oracle 은 정수 열을 BigDecimal 로 돌려주므로 Number 로 받는다.
    public void updateFirstName(Number userId, String firstName) {
        basicRepository.changeFirstName(userId.intValue(), firstName);
    }

    public void updateFirstNameWithException(Number userId, String firstName) {
        basicRepository.changeFirstName(userId.intValue(), firstName);
        throw new RuntimeException("error");
    }

    public List<Map<String, Object>> generateRandomRows() {
        List<Map<String, Object>> data = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            data.add(new MapBuilder<String, Object>().addEntity("name", String.valueOf(i)).build());
        }
        return data;
    }
}
