package usecase.sqlScriptWithDto;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

import java.time.LocalDateTime;

/**
 * @author Jeongjin Kim
 * @since 2022-04-20
 */
@SuppressFBWarnings("UWF_UNWRITTEN_FIELD")
public class UserDto {
    private Integer id;
    private String firstName;
    private String lastName;
    private LocalDateTime updateTime;

    public Integer getId() {
        return id;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public LocalDateTime getUpdateTime() {
        return updateTime;
    }
}
