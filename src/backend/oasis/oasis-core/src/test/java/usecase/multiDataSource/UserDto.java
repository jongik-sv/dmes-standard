package usecase.multiDataSource;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */

public class UserDto {
    private final Long id;
    private final String firstName;
    private final String lastName;

    public UserDto(Long id, String firstName, String lastName) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
    }

    public Long getId() {
        return id;
    }

    public String getLastName() {
        return lastName;
    }

    public String getFirstName() {
        return firstName;
    }
}
