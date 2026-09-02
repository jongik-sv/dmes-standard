package usecase.multiDataSource;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
@Entity
//@PersistenceUnit(unitName = "hello")
@Table(name = "users")
public class UserEntity {
    @Id
    private Long id;
    private String firstName;
    private String lastName;

    public UserEntity(Long id, String firstName, String lastName) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
    }

    public UserEntity() {
    }

    public Long getId() {
        return id;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }
}
