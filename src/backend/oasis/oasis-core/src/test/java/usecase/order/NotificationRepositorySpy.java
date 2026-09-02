package usecase.order;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-05-17
 */
public class NotificationRepositorySpy implements NotificationRepository {
    private final List<String> records = new ArrayList<>();

    @Override
    public int record(String message) {
        records.add(message);
        return records.size();
    }

    public List<String> getRecords() {
        return records;
    }
}
