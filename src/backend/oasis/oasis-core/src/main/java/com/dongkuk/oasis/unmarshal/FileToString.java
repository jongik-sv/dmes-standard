package com.dongkuk.oasis.unmarshal;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
public interface FileToString {
    /**
     * 경로에 있는 파일을 읽어 {@link String}으로 반환.
     *
     * @param path        파일 경로
     * @param charsetName charsetName
     * @return 파일 문자열
     */
    String getString(String path, String charsetName);
}
