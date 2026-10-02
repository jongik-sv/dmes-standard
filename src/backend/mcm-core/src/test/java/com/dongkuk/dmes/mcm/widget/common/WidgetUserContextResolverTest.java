package com.dongkuk.dmes.mcm.widget.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** {@link WidgetUserContextResolver} — 인증 사용자, 이름 대체, 상위 부서 탐색(순환·상한). */
@ExtendWith(MockitoExtension.class)
class WidgetUserContextResolverTest {

    @Mock SecurityIdentity securityIdentity;
    @Mock SecUserRepository userRepository;
    @Mock DeptInfoRepository deptRepository;

    @InjectMocks WidgetUserContextResolver resolver;

    private final Map<String, DeptInfo> depts = new HashMap<>();

    private void dept(String cd, String nm, String upper) {
        DeptInfo d = mock(DeptInfo.class);
        lenient().when(d.getDeptNm()).thenReturn(nm);
        lenient().when(d.getUpperDeptCd()).thenReturn(upper);
        depts.put(cd, d);
    }

    @BeforeEach
    void setUp() {
        lenient().when(deptRepository.findById(anyString()))
                .thenAnswer(inv -> Optional.ofNullable(depts.get(inv.getArgument(0, String.class))));
    }

    private void user(String id, String nm, String deptCd) {
        SecUser u = mock(SecUser.class);
        lenient().when(u.getUserNm()).thenReturn(nm);
        lenient().when(u.getDeptCd()).thenReturn(deptCd);
        when(securityIdentity.requireUserId()).thenReturn(id);
        when(userRepository.findById(id)).thenReturn(Optional.of(u));
    }

    @Test
    @DisplayName("부서 → 상위 부서 순서로 목록을 만들고 이름을 채운다")
    void chainAndNames() {
        dept("D100", "생산1팀", "D10");
        dept("D10", "생산부", "D1");
        dept("D1", "본사", null);
        user("u1", "홍길동", "D100");

        WidgetUserContext ctx = resolver.current();

        assertThat(ctx.userId()).isEqualTo("u1");
        assertThat(ctx.userNm()).isEqualTo("홍길동");
        assertThat(ctx.deptCd()).isEqualTo("D100");
        assertThat(ctx.deptNm()).isEqualTo("생산1팀");
        assertThat(ctx.deptChain()).containsExactly("D100", "D10", "D1");
    }

    @Test
    @DisplayName("상위 부서가 순환하면 처음 돌아온 곳에서 멈춘다")
    void cycleStops() {
        dept("A", "a", "B");
        dept("B", "b", "A");
        assertThat(resolver.deptChain("A")).containsExactly("A", "B");
    }

    @Test
    @DisplayName("상위 부서가 너무 깊으면 10단에서 멈춘다")
    void depthLimit() {
        for (int i = 0; i < 20; i++) dept("D" + i, "d" + i, "D" + (i + 1));
        List<String> chain = resolver.deptChain("D0");
        assertThat(chain).hasSize(WidgetUserContextResolver.MAX_DEPT_DEPTH);
        assertThat(chain.get(0)).isEqualTo("D0");
    }

    @Test
    @DisplayName("부서가 없으면 빈 목록, 이름이 비면 userId 로 대신한다")
    void noDept() {
        user("u2", " ", null);
        WidgetUserContext ctx = resolver.current();
        assertThat(ctx.userNm()).isEqualTo("u2");
        assertThat(ctx.deptCd()).isNull();
        assertThat(ctx.deptNm()).isNull();
        assertThat(ctx.deptChain()).isEmpty();
    }

    @Test
    @DisplayName("사용자 행이 없어도 userId 로 동작한다")
    void unknownUser() {
        when(securityIdentity.requireUserId()).thenReturn("ghost");
        when(userRepository.findById("ghost")).thenReturn(Optional.empty());
        WidgetUserContext ctx = resolver.current();
        assertThat(ctx.userNm()).isEqualTo("ghost");
        assertThat(ctx.deptChain()).isEmpty();
    }
}
