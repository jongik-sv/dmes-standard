package usecase.userException;

import com.dongkuk.oasis.exceptions.UserException;

/**
 * @author Jeongjin Kim
 * @since 2021-06-14
 */
public class ValidationException extends UserException{
    /**
     * 사용자 임의 예외 생성.
     *
     * @param message 메시지
     */
    public ValidationException(String message) {
        super(message);
    }
}
