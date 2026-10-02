package com.dongkuk.dmes.mcm.widget.media;

/**
 * 미디어 파일을 찾을 수 없다 — 형식이 틀린 fileId(경로 조작 시도 포함), 메타 행 없음, 디스크 파일 없음.
 * {@link WidgetMediaController} 가 본문 없는 404 로 바꾼다(어느 경우인지 밖에 알리지 않는다).
 */
public class WidgetMediaNotFoundException extends RuntimeException {

    public WidgetMediaNotFoundException(String fileId) {
        super("미디어 파일을 찾을 수 없습니다: " + fileId);
    }
}
