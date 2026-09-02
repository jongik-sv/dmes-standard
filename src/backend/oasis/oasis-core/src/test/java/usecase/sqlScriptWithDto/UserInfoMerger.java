package usecase.sqlScriptWithDto;

/**
 * @author Jeongjin Kim
 * @since 2022-04-20
 */
public class UserInfoMerger {
    public String merge(UserDto userDto) {
        String s = userDto.getId() + userDto.getFirstName() + userDto.getLastName();
        System.out.println(s);
        return s;
    }
}
