package com.dongkuk.dmes.cactus.security.auth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordEncoderTest {

    private final PasswordEncoder encoder = new PasswordEncoder();

    @Test
    @DisplayName("인코딩 후 원본 비밀번호와 매칭 성공")
    void encodeAndMatch() {
        String raw = "password123!";
        String encoded = encoder.encode(raw);

        assertNotEquals(raw, encoded);
        assertTrue(encoder.matches(raw, encoded));
    }

    @Test
    @DisplayName("잘못된 비밀번호는 매칭 실패")
    void wrongPassword() {
        String encoded = encoder.encode("password123!");

        assertFalse(encoder.matches("wrongPassword", encoded));
    }

    @Test
    @DisplayName("같은 비밀번호라도 매번 다른 해시 생성")
    void differentHashEachTime() {
        String raw = "password123!";

        String hash1 = encoder.encode(raw);
        String hash2 = encoder.encode(raw);

        assertNotEquals(hash1, hash2);
        assertTrue(encoder.matches(raw, hash1));
        assertTrue(encoder.matches(raw, hash2));
    }
}
