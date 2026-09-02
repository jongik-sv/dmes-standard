package usecase.resultUsability;

/**
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
public class RecordDto {
    private final String id;
    private final String name;

    public RecordDto(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

}
