package com.dongkuk.dmes.cactus.security.auth;

import org.mindrot.jbcrypt.BCrypt;

/**
 * BCrypt 비밀번호 해싱/검증.
 * USER_ENC_PWD 컬럼에 BCrypt 해시를 저장한다.
 *
 * <p>빈 등록은 {@link com.dongkuk.dmes.cactus.autoconfigure.CactusAuthAutoConfiguration}
 * 에서 {@code cactus.auth.enabled=true} 인 경우에만 수행된다.
 */
public class PasswordEncoder {

    /**
     * 평문 비밀번호를 BCrypt로 해싱한다.
     * @param rawPassword 평문 비밀번호
     * @return BCrypt 해시 문자열
     */
    public String encode(String rawPassword) {
        return BCrypt.hashpw(rawPassword, BCrypt.gensalt(12));
    }

    /**
     * 평문 비밀번호와 저장된 해시를 비교한다.
     * @param rawPassword 평문 비밀번호
     * @param storedHash 저장된 BCrypt 해시
     * @return 일치 여부
     */
    public boolean matches(String rawPassword, String storedHash) {
        return BCrypt.checkpw(rawPassword, storedHash);
    }
}
