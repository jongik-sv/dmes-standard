package com.dongkuk.dmes.mdm.internal.userOwnership;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.security.filter.ClientKeyFilter;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverItem;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverRequest;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipSummaryItem;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.UserRef;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * 퇴직 처리 API 의 호출자 검사 — 실제 {@link ClientKeyFilter} 를 앞에 두고 컨트롤러까지 확인한다(DB 없이). 키가 없거나 틀리면 필터가 401, 키가 맞아도
 * 주체가 {@code system:mcm} + {@code SYSTEM} 이 아니면 컨트롤러가 403 이다. 운영 보안 체인({@code anyRequest().authenticated()})까지 띄운 확인은
 * {@code UserOwnershipHttpTest}(Oracle)가 한다.
 *
 * <p>유효 키: {@code ClientKeyFilter} 는 환경 변수 {@code BACKEND_CLIENT_KEY} 를 생성자 값보다 먼저 본다 — 시험도 같은 순서로 고른다
 * ({@code MdmSecurityChainTest} 와 같다).
 */
class UserOwnershipControllerTest {

    private static final String KEY = "mdm-user-ownership-test-key";

    private final UserOwnershipService service = mock(UserOwnershipService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        mvc = MockMvcBuilders.standaloneSetup(new UserOwnershipController(service))
                .addFilters(new ClientKeyFilter(KEY, List.of()))
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static String effectiveKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return env != null && !env.isBlank() ? env : KEY;
    }

    private static MockHttpServletRequestBuilder call(String action, String body, String key, String user, String role) {
        MockHttpServletRequestBuilder b = post("/internal/mdm/userOwnership/" + action).contentType(MediaType.APPLICATION_JSON).content(body);
        if (key != null) b.header("X-Client-Key", key);
        if (user != null) b.header("X-Authenticated-User", user);
        if (role != null) b.header("X-Authenticated-Role", role);
        return b;
    }

    private static final String SUMMARY = "{\"users\":[{\"userId\":\"u1\",\"empNo\":\"1234\"}]}";
    private static final String HANDOVER = "{\"fromUserId\":\"u1\",\"fromEmpNo\":\"1001\",\"toUserId\":\"u2\",\"toEmpNo\":\"2002\"}";

    @Test
    void 키가_없거나_틀리면_401_이고_서비스를_부르지_않는다() throws Exception {
        mvc.perform(call("summary", SUMMARY, null, "system:mcm", "SYSTEM")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("A001"));
        mvc.perform(call("handover", HANDOVER, effectiveKey() + "x", "system:mcm", "SYSTEM")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void 키가_맞아도_주체_헤더가_없으면_403() throws Exception {
        mvc.perform(call("releaseClaims", "{\"userId\":\"u1\"}", effectiveKey(), null, null)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("USER_OWNERSHIP_FORBIDDEN"));
        verifyNoInteractions(service);
    }

    @Test
    void 사용자_주체나_다른_모듈_주체는_403() throws Exception {
        mvc.perform(call("handover", HANDOVER, effectiveKey(), "admin", "SYSADMIN")).andExpect(status().isForbidden());
        SecurityContextHolder.clearContext();
        mvc.perform(call("handover", HANDOVER, effectiveKey(), "system:mls", "SYSTEM")).andExpect(status().isForbidden());
        SecurityContextHolder.clearContext();
        mvc.perform(call("handover", HANDOVER, effectiveKey(), "system:mcm", "USER")).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void system_mcm_이면_건수를_items_로_돌려준다() throws Exception {
        when(service.summary(List.of(new UserRef("u1", "1234"))))
                .thenReturn(List.of(new OwnershipSummaryItem("u1", "CODE_OWNER", "코드 초안 소유", 12)));

        mvc.perform(call("summary", SUMMARY, effectiveKey(), "system:mcm", "SYSTEM"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].userId").value("u1"))
                .andExpect(jsonPath("$.items[0].kind").value("CODE_OWNER"))
                .andExpect(jsonPath("$.items[0].kindNm").value("코드 초안 소유"))
                .andExpect(jsonPath("$.items[0].cnt").value(12));
    }

    @Test
    void 넘기기는_종류별_건수와_skipped_를_돌려준다() throws Exception {
        when(service.handover(new OwnershipHandoverRequest("u1", "1001", "u2", "2002")))
                .thenReturn(List.of(new OwnershipHandoverItem("ERD_OWNER", "ERD 초안 소유", 2, false)));

        mvc.perform(call("handover", HANDOVER, effectiveKey(), "system:mcm", "SYSTEM"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].kind").value("ERD_OWNER"))
                .andExpect(jsonPath("$.items[0].cnt").value(2))
                .andExpect(jsonPath("$.items[0].skipped").value(false));
    }

    @Test
    void 잘못된_요청은_400_USER_OWNERSHIP_INVALID() throws Exception {
        when(service.handover(any())).thenThrow(new UserOwnershipService.InvalidRequest("받는 사람은 퇴직자와 달라야 합니다"));

        mvc.perform(call("handover", HANDOVER, effectiveKey(), "system:mcm", "SYSTEM"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("USER_OWNERSHIP_INVALID"))
                .andExpect(jsonPath("$.message").value("받는 사람은 퇴직자와 달라야 합니다"));
    }

    @Test
    void 작업_중_표시_지우기는_cnt_를_돌려준다() throws Exception {
        when(service.releaseClaims("u1")).thenReturn(3);

        mvc.perform(call("releaseClaims", "{\"userId\":\"u1\"}", effectiveKey(), "system:mcm", "SYSTEM"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cnt").value(3));
        verify(service).releaseClaims("u1");
    }
}
