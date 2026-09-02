package usecase.parallel;

import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-08-03
 */
public class Member {
    private final MemberRepository memberRepository;

    public Member(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }

    public void join(Map<String, Object> memberInfo) {
        memberRepository.join(memberInfo);
    }
}
