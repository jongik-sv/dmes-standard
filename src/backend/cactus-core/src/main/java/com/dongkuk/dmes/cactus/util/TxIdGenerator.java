package com.dongkuk.dmes.cactus.util;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 트랜잭션 ID 생성기.
 * 형식: {userId}-{menuId}-{yyyyMMddHHmmss}-{random3}
 * 예: user01-PROD001-20260325153000-a7f
 */
public class TxIdGenerator {

    /** 타임스탬프 포맷 (yyyyMMddHHmmss) */
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    /** 인스턴스 생성 방지용 private 생성자 */
    private TxIdGenerator() {
    }

    /**
     * 트랜잭션 ID를 생성한다.
     * @param userId 사용자 ID (null이면 "anon")
     * @param menuId 메뉴 ID (null이면 "NONE")
     * @return 생성된 트랜잭션 ID
     */
    public static String generate(String userId, String menuId) {
        String timestamp = LocalDateTime.now().format(FORMATTER);
        String random = randomHex(3);
        return (userId != null ? userId : "anon")
                + "-" + (menuId != null ? menuId : "NONE")
                + "-" + timestamp
                + "-" + random;
    }

    /**
     * 지정된 길이의 랜덤 16진수 문자열을 생성한다.
     * @param length 생성할 16진수 문자열 길이
     * @return 랜덤 16진수 문자열
     */
    private static String randomHex(int length) {
        int bound = (int) Math.pow(16, length);
        int value = ThreadLocalRandom.current().nextInt(bound);
        return String.format("%0" + length + "x", value);
    }
}
