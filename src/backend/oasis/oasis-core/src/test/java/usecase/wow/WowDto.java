package usecase.wow;

/**
 * @author Jeongjin Kim
 * @since 2021-05-18
 */
public class WowDto {
    private final String id;

    public WowDto(String id) {
        this.id = id;
    }

    public String getId() {
        return id;
    }
}
