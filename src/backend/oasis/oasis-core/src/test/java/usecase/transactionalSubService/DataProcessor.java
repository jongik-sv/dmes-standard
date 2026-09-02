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

    public void updateFirstName(int userId, String firstName) {
        basicRepository.changeFirstName(userId, firstName);
    }

    public void updateFirstNameWithException(int userId, String firstName) {
        basicRepository.changeFirstName(userId, firstName);
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
