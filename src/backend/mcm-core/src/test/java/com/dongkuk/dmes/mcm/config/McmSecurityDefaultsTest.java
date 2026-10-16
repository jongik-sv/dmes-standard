package com.dongkuk.dmes.mcm.config;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/**
 * {@link McmSecurityDefaults} 의 URL 권한 규칙을 고정한다. 사이트 SecurityConfig 와 같이 {@code applyTo} 뒤에
 * {@code anyRequest().authenticated()} 를 둔 최소 필터 체인을 만들고, 모든 경로에 200 을 주는 컨트롤러로 판정만 본다.
 * 경로마다 OASIS 접두 3개({@code /oasis}·{@code /mcm/oasis}·{@code /api/mcm/oasis})를 모두 확인한다.
 */
@SpringJUnitWebConfig(McmSecurityDefaultsTest.Config.class)
class McmSecurityDefaultsTest {

    private static final List<String> PREFIXES = List.of("/oasis/", "/mcm/oasis/", "/api/mcm/oasis/");

    /** 로그인만 하면 통과하는 {@code 서비스ID/action}(목록에 따로 적은 것). */
    static Stream<String> authenticatedActions() {
        return Stream.of(
                "secUser/myMenus",
                "secUser/myMenusTree",
                "secUser/myPermissions",
                "secFavorite/search",
                "secFavorite/save",
                "secStartPgm/search");
    }

    /**
     * SYSADMIN 전용 matcher 를 지운 경로(BE 리팩토링 2회차) — 이제 {@code anyRequest().authenticated()} 로 간다. BPMN 이 없는
     * 옛 서비스는 D3, 쓰이지 않던 secUser/save·resetPassword 는 F7 에서 BPMN action 과 함께 지웠다. 예전에는 SYSADMIN 이 아닌
     * 사용자에게 URL 계층이 403 을 냈고, 지금은 통과시켜 OASIS 가 서비스·분기 없음 오류를 낸다.
     */
    static Stream<String> removedActions() {
        return Stream.of(
                "secUser/save",          // F7 — BPMN action 을 archive 로 옮기며 matcher 도 지웠다
                "secUser/resetPassword", // F7
                "secRole/save",
                "secPerm/save",
                "secObj/save",
                "secMenu/save",
                "secRolePerm/save",
                "secUserRole/save",
                "secRoleGroup/save",
                "secRoleGroup/assignRoles",
                "secRoleGroup/assignUsers",
                "secCode/save",
                "secMenu/recordAccess");
    }

    /**
     * 목록에 없는 경로 — {@code anyRequest().authenticated()} 로 간다. 실제 권한 마스터 서비스(comm*Mng)도 여기 속한다.
     * comm*Mng 의 save 에 SYSADMIN gate 가 없는 것은 BE 리팩토링 2회차 F8(보안, 결정 필요)로 등록됐다 — 결정 전까지 현재 동작으로 고정한다.
     */
    static Stream<String> otherActions() {
        return Stream.of(
                "secUser/search",
                "secUser/myButtonEndpoints",
                "commRoleMng/save",
                "commPermMng/save",
                "commUserMng/save",
                "secCodeGroup/save");
    }

    @Autowired
    WebApplicationContext wac;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).apply(springSecurity()).build();
    }

    @ParameterizedTest
    @MethodSource("authenticatedActions")
    void 로그인_목록은_로그인한_사용자면_통과한다(String action) throws Exception {
        for (String prefix : PREFIXES) {
            mvc.perform(post(prefix + action).with(asUser())).andExpect(status().isOk());
            mvc.perform(post(prefix + action)).andExpect(status().isForbidden());
        }
    }

    @ParameterizedTest
    @MethodSource("removedActions")
    void 지운_옛_서비스_경로는_로그인한_사용자면_통과한다(String action) throws Exception {
        for (String prefix : PREFIXES) {
            mvc.perform(post(prefix + action).with(asUser())).andExpect(status().isOk());
            mvc.perform(post(prefix + action)).andExpect(status().isForbidden());
        }
    }

    @ParameterizedTest
    @MethodSource("otherActions")
    void 목록에_없는_경로는_로그인한_사용자면_통과한다(String action) throws Exception {
        for (String prefix : PREFIXES) {
            mvc.perform(post(prefix + action).with(asUser())).andExpect(status().isOk());
            mvc.perform(post(prefix + action)).andExpect(status().isForbidden());
        }
    }

    @Test
    void 인증_경로와_헬스체크는_로그인_없이_통과한다() throws Exception {
        mvc.perform(post("/api/auth/login")).andExpect(status().isOk());
        mvc.perform(post("/actuator/health")).andExpect(status().isOk());
        mvc.perform(post("/actuator/info")).andExpect(status().isOk());
        mvc.perform(post("/actuator/env")).andExpect(status().isForbidden());
    }

    private static RequestPostProcessor asUser() {
        return user("u1").authorities(() -> "ROLE_USER");
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    static class Config {

        @Bean
        McmSecurityDefaults mcmSecurityDefaults() {
            return new McmSecurityDefaults();
        }

        @Bean
        SecurityFilterChain filterChain(HttpSecurity http, McmSecurityDefaults defaults) throws Exception {
            http.csrf(c -> c.disable())
                    .authorizeHttpRequests(auth -> {
                        defaults.applyTo(auth);
                        auth.anyRequest().authenticated();
                    });
            return http.build();
        }

        @Bean
        EchoController echoController() {
            return new EchoController();
        }
    }

    @RestController
    static class EchoController {

        @RequestMapping("/**")
        String ok() {
            return "ok";
        }
    }
}
