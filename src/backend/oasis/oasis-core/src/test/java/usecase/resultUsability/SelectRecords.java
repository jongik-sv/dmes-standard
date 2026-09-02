package usecase.resultUsability;

import com.dongkuk.oasis.utils.MapBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
public class SelectRecords {
    public List<RecordDto> find() {
        List<RecordDto> list = new ArrayList<>();
        list.add(new RecordDto("1", "1name"));
        list.add(new RecordDto("2", "2name"));
        list.add(new RecordDto("3", "3name"));
        return list;
    }

    public Map<String, RecordDto> findMap() {
        return new MapBuilder<String, RecordDto>()
                .addEntity("k1", new RecordDto("1", "1name"))
                .addEntity("k2", new RecordDto("2", "2name"))
                .addEntity("k3", new RecordDto("3", "3name"))
                .build();
    }
}
