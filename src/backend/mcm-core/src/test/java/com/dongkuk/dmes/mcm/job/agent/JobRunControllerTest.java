package com.dongkuk.dmes.mcm.job.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunDispatcher.SubmitResult;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.cactus.web.inbound.CactusRequestMappingHandlerMapping;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.Principal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class JobRunControllerTest {

    private final ObjectMapper json = new ObjectMapper();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        JobRunDispatcher dispatcher = mock(JobRunDispatcher.class);
        when(dispatcher.serverName()).thenReturn("host:mdm:1");
        when(dispatcher.submit(any())).thenReturn(SubmitResult.ACCEPTED);
        JobHandlerRegistry handlers = new JobHandlerRegistry(JobModule.MDM,
                List.of(new SimpleScheduledJob("mdm.sync", JobModule.MDM, "동기화", null, Duration.ofMinutes(5), c -> 1)));
        // 운영은 CactusRequestMappingHandlerMapping 이 클래스 @RequestMapping 만 단 컨트롤러를 인식한다(Spring 7 기본 매핑은 @Controller 만 본다).
        // standaloneSetup 도 같은 매핑으로 맞춘다(OasisControllerTest 선례).
        mvc = MockMvcBuilders.standaloneSetup(new JobRunController(new JobRunAcceptor(JobModule.MDM, dispatcher, handlers)))
                .setCustomHandlerMapping(CactusRequestMappingHandlerMapping::new).build();
    }

    private static Principal principal(String name, String... roles) {
        return new UsernamePasswordAuthenticationToken(name, null, java.util.Arrays.stream(roles).map(SimpleGrantedAuthority::new).toList());
    }

    private String body(String module) throws Exception {
        return json.writeValueAsString(new JobRunRequest("r1", "mdm.sync", module, "job^^code", "run", Map.of("a", 1), Map.of(),
                Map.of("handlerId", "mdm.sync"), 60, null, "2026-10-09T02:00:00", false, null));
    }

    @Test
    @DisplayName("system:mcm 주체 + ROLE_SYSTEM → 202")
    void mcmSystemIsAccepted() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mcm", "ROLE_SYSTEM"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.serverNm").value("host:mdm:1"));
    }

    @Test
    @DisplayName("사용자 주체(역할 USER)는 403 — 사용자 토큰으로는 실행시킬 수 없다")
    void userPrincipalIsForbidden() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("admin", "ROLE_USER", "ROLE_SYSADMIN"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("JOB_FORBIDDEN"));
    }

    @Test
    @DisplayName("SYSTEM 역할이어도 system:mcm 이 아닌 주체(system:mls 등)는 403")
    void otherSystemPrincipalIsForbidden() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mls", "ROLE_SYSTEM"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("system:mcm 이어도 ROLE_SYSTEM 이 없으면 403, 주체가 없어도 403")
    void missingRoleOrPrincipalIsForbidden() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mcm", "ROLE_USER"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/internal/job/run").contentType(MediaType.APPLICATION_JSON).content(body("MDM")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("module 이 이 앱과 다르면 400")
    void moduleMismatch() throws Exception {
        mvc.perform(post("/internal/job/run").principal(principal("system:mcm", "ROLE_SYSTEM"))
                        .contentType(MediaType.APPLICATION_JSON).content(body("MCM")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("JOB_MODULE_MISMATCH"));
    }
}
