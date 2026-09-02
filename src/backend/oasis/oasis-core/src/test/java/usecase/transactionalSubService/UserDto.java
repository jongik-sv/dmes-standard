package usecase.transactionalSubService;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */

public class UserDto {
    private final Long id;
    private final String firstName;
    private final String lastName;
    private final String createdBy;

    public UserDto(Long id, String firstName, String lastName, String createdBy) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.createdBy = createdBy;
    }

    public String getCreatedBy() {
        return createdBy;
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
