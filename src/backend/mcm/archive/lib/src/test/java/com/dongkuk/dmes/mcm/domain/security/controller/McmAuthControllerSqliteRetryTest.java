package com.dongkuk.dmes.mcm.domain.security.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.mcm.audit.entity.LoginLog;
import com.dongkuk.dmes.mcm.audit.repository.LoginLogRepository;
import com.dongkuk.dmes.mcm.audit.repository.RevokedTokenRepository;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.domain.security.service.McmSecUserRepository;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.sqlite.SQLiteErrorCode;
import org.sqlite.SQLiteException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * 로그인 컨트롤러가 authService.login 을 트랜잭션 바깥에서 SqliteBusyRetry 로 감싸는지 — 로컬 SQLite 에서 첫 시도가
 * SQLITE_BUSY 면 다시 시도해 200 을 돌려주고, 로그인 기록(LOGIN_SUCCESS)은 한 번만 남긴다.
 */
class McmAuthControllerSqliteRetryTest {

    @AfterEach
    void tearDown() {
        McmAuditStatementInspector.setSqlite(false);
    }

    @Test
    void SQLite_에서_첫_로그인_시도가_BUSY_면_다시_시도해_200_과_LOGIN_SUCCESS_한_번을_남긴다() throws Exception {
        McmAuditStatementInspector.setSqlite(true);
        AuthService auth = mock(AuthService.class);
        RuntimeException busy = new IllegalStateException("lock",
                new RuntimeException(new SQLiteException("[SQLITE_BUSY] locked", SQLiteErrorCode.SQLITE_BUSY)));
        when(auth.login(any())).thenThrow(busy).thenReturn(Map.of("accessToken", "access", "refreshToken", "refresh"));
        LoginLogRepository loginLogs = mock(LoginLogRepository.class);
        SecUserRepository users = mock(SecUserRepository.class);
        when(users.findById(anyString())).thenReturn(Optional.empty());
        String secret = Base64.getEncoder().encodeToString(new byte[32]);
        McmAuthController controller = new McmAuthController(auth, loginLogs, users, mock(PasswordPolicyEvaluator.class),
                mock(RevokedTokenRepository.class), mock(UserPermCache.class), mock(PasswordEncoder.class),
                mock(McmSecUserRepository.class), secret);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"userId\":\"u1\",\"password\":\"pw\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").value("access"));

        verify(auth, times(2)).login(any());
        ArgumentCaptor<LoginLog> saved = ArgumentCaptor.forClass(LoginLog.class);
        verify(loginLogs, times(1)).save(saved.capture());
        assertEquals("LOGIN_SUCCESS", saved.getValue().getEventType());
    }
}
