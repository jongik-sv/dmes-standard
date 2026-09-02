package usecase.multiDataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
public class UserSignIn {
    private static final Logger log = LoggerFactory.getLogger(UserSignIn.class);
    private final UserSignInRepository userSignInRepository;

    public UserSignIn(UserSignInRepository userSignInRepository) {
        this.userSignInRepository = userSignInRepository;
    }

    public void hello() {
        log.info("hello!!!!!!");
    }

    public void signIn(UserDto userDto) {
        userSignInRepository.signIn(userDto);
    }

    public int resultSignIn(UserDto userDto) {
        return userSignInRepository.users().size();
    }
}
