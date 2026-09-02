package usecase.sequential;

import java.util.ArrayList;
import java.util.List;

public class SpyClass {
    private List<String> data = new ArrayList<>();

    public void addData(String data) {
        this.data.add(data);
    }

    public List<String> getData() {
        return data;
    }
}
