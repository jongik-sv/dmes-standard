package usecase.multiDataSource;

import com.dongkuk.oasis.exceptions.UserException;

/**
 * @author Jeongjin Kim
 * @since 2021-06-14
 */
public class MyUserExceptionTask {
    public void userException() {
        throw new UserException("이미 사용자가 등록되어 있습니다.");
    }
}
