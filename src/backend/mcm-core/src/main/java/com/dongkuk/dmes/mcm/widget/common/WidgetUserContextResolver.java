package com.dongkuk.dmes.mcm.widget.common;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 현재 사용자 정보 조회 — 위젯 기본 배치(부서 → 상위 부서 → 전사), 쿼리 시스템 변수(:userId·:deptCd), 챗봇 문맥(이름·부서)이 함께 쓴다.
 * 사용자는 늘 {@link SecurityIdentity} 에서 얻는다. 미인증이면 {@link IllegalStateException}(SecurityIdentity 규약).
 */
@Component
public class WidgetUserContextResolver {

    /** 상위 부서 탐색 상한 — 잘못된 데이터(순환·너무 깊은 트리)에서도 끝나게. */
    static final int MAX_DEPT_DEPTH = 10;

    private final SecurityIdentity securityIdentity;
    private final SecUserRepository userRepository;
    private final DeptInfoRepository deptRepository;

    public WidgetUserContextResolver(SecurityIdentity securityIdentity,
                                     SecUserRepository userRepository,
                                     DeptInfoRepository deptRepository) {
        this.securityIdentity = securityIdentity;
        this.userRepository = userRepository;
        this.deptRepository = deptRepository;
    }

    public WidgetUserContext current() {
        String userId = securityIdentity.requireUserId();
        Optional<SecUser> user = userRepository.findById(userId);
        String userNm = user.map(SecUser::getUserNm).filter(s -> !s.isBlank()).orElse(userId);
        String deptCd = user.map(SecUser::getDeptCd).filter(s -> !s.isBlank()).orElse(null);
        List<String> chain = deptChain(deptCd);
        String deptNm = deptCd == null ? null : deptRepository.findById(deptCd).map(DeptInfo::getDeptNm).orElse(null);
        return new WidgetUserContext(userId, userNm, deptCd, deptNm, chain);
    }

    /** deptCd 부터 UPPER_DEPT_CD 를 따라 올라간 목록(자기 자신 포함). 순환·상한에서 멈춘다. */
    public List<String> deptChain(String deptCd) {
        List<String> out = new ArrayList<>();
        if (deptCd == null || deptCd.isBlank()) return out;
        Set<String> seen = new LinkedHashSet<>();
        String cur = deptCd;
        while (cur != null && !cur.isBlank() && seen.add(cur) && out.size() < MAX_DEPT_DEPTH) {
            out.add(cur);
            cur = deptRepository.findById(cur).map(DeptInfo::getUpperDeptCd).orElse(null);
        }
        return out;
    }
}
