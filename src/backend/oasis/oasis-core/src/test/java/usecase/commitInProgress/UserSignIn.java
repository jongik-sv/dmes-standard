package usecase.commitInProgress;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
public class UserSignIn {
    private final UserSignInRepository userSignInRepository;

    public UserSignIn(UserSignInRepository userSignInRepository) {
        this.userSignInRepository = userSignInRepository;
    }

    public void signIn(String id, String firstName, String lastName) {
        userSignInRepository.signIn(id, firstName, lastName);
    }
}
