package usecase.wow;

/**
 * @author Jeongjin Kim
 * @since 2021-05-18
 */
public class WowRepositorySpy implements WowRepository {
    private String savedId;

    @Override
    public int save(WowDto wowDto) {
        this.savedId = wowDto.getId();
        return 1;
    }

    public String getSavedId() {
        return savedId;
    }
}
