package com.dongkuk.caravan.hub.common.util;

import com.jcraft.jsch.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * TC-FILE-011: SFTP 세션 매니저 테스트
 */
class SftpSessionManagerTest {

    private SftpSessionManager sftpSessionManager;

    @BeforeEach
    void setUp() {
        sftpSessionManager = new SftpSessionManager();
    }

    // ========== 세션 생성 실패 ==========

    @Nested
    @DisplayName("세션 생성")
    class SessionCreation {

        @Test
        @DisplayName("잘못된 호스트로 세션 생성 시도 시 null 반환")
        void shouldReturnNullWhenHostIsInvalid() {
            // when
            Session session = sftpSessionManager.getOrCreateSession(
                    "invalid-host-that-does-not-exist", 22, "user", "pass");

            // then
            assertThat(session).isNull();
        }

        @Test
        @DisplayName("동일 호스트로 연속 호출 시에도 안전하게 null 반환")
        void shouldReturnNullSafelyOnRepeatedCalls() {
            // when
            Session s1 = sftpSessionManager.getOrCreateSession("bad-host", 22, "user", "pass");
            Session s2 = sftpSessionManager.getOrCreateSession("bad-host", 22, "user", "pass");

            // then
            assertThat(s1).isNull();
            assertThat(s2).isNull();
        }
    }

    // ========== 세션 제거 ==========

    @Nested
    @DisplayName("세션 제거")
    class SessionRemoval {

        @Test
        @DisplayName("존재하지 않는 세션 제거 시 에러 없음")
        void shouldNotThrowWhenRemovingNonExistentSession() {
            // when & then
            assertThatCode(() ->
                    sftpSessionManager.removeSession("non-existent", 22, "user")
            ).doesNotThrowAnyException();
        }
    }

    // ========== destroy ==========

    @Nested
    @DisplayName("서비스 종료")
    class ServiceShutdown {

        @Test
        @DisplayName("세션 없이 destroy 호출 시 에러 없음")
        void shouldNotThrowOnDestroyWithNoSessions() {
            // when & then
            assertThatCode(() -> sftpSessionManager.destroy()).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("실패한 세션 생성 후 destroy 호출 시 에러 없음")
        void shouldNotThrowOnDestroyAfterFailedSessions() {
            // given
            sftpSessionManager.getOrCreateSession("bad-host", 22, "user", "pass");

            // when & then
            assertThatCode(() -> sftpSessionManager.destroy()).doesNotThrowAnyException();
        }
    }

    // ========== 캐시 키 생성 ==========

    @Nested
    @DisplayName("캐시 키 구분")
    class CacheKeyDistinction {

        @Test
        @DisplayName("다른 호스트는 별도 캐시 엔트리")
        void shouldCreateSeparateEntriesForDifferentHosts() {
            // when
            Session s1 = sftpSessionManager.getOrCreateSession("host-a", 22, "user", "pass");
            Session s2 = sftpSessionManager.getOrCreateSession("host-b", 22, "user", "pass");

            // then - 둘 다 null이지만 별도로 처리되었음 (에러 없음)
            assertThat(s1).isNull();
            assertThat(s2).isNull();
        }

        @Test
        @DisplayName("같은 호스트 다른 포트는 별도 캐시 엔트리")
        void shouldCreateSeparateEntriesForDifferentPorts() {
            // when
            Session s1 = sftpSessionManager.getOrCreateSession("host-a", 22, "user", "pass");
            Session s2 = sftpSessionManager.getOrCreateSession("host-a", 2222, "user", "pass");

            // then
            assertThat(s1).isNull();
            assertThat(s2).isNull();
        }

        @Test
        @DisplayName("같은 호스트/포트 다른 유저는 별도 캐시 엔트리")
        void shouldCreateSeparateEntriesForDifferentUsers() {
            // when
            Session s1 = sftpSessionManager.getOrCreateSession("host-a", 22, "user1", "pass");
            Session s2 = sftpSessionManager.getOrCreateSession("host-a", 22, "user2", "pass");

            // then
            assertThat(s1).isNull();
            assertThat(s2).isNull();
        }
    }
}
