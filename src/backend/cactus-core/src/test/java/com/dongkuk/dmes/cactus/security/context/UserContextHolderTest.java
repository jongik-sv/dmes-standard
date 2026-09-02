package com.dongkuk.dmes.cactus.security.context;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class UserContextHolderTest {

    @AfterEach
    void tearDown() {
        UserContextHolder.clear();
    }

    @Test
    @DisplayName("set/get - 사용자 정보 저장 및 조회")
    void setAndGet() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");
        UserContextHolder.set(userInfo);

        assertEquals(userInfo, UserContextHolder.get());
        assertEquals("admin", UserContextHolder.getUserId());
    }

    @Test
    @DisplayName("미인증 시 getUserId()는 SYSTEM 반환")
    void getUserId_whenNotAuthenticated() {
        assertEquals("SYSTEM", UserContextHolder.getUserId());
    }

    @Test
    @DisplayName("미인증 시 get()은 null 반환")
    void get_whenNotAuthenticated() {
        assertNull(UserContextHolder.get());
    }

    @Test
    @DisplayName("clear 후 null 반환")
    void clear() {
        UserContextHolder.set(new UserInfo("admin", "홍길동", "E20210001"));
        UserContextHolder.clear();

        assertNull(UserContextHolder.get());
        assertEquals("SYSTEM", UserContextHolder.getUserId());
    }
}
