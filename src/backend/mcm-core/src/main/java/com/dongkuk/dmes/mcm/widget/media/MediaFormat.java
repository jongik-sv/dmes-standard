package com.dongkuk.dmes.mcm.widget.media;

import java.util.Locale;
import java.util.Optional;

/**
 * 미디어 위젯이 받는 파일 형식 — 스펙 2026-10-02-widget-admin-generic §4.3·W-D29.
 * <p>형식은 확장자와 파일 앞 바이트(매직 넘버)를 함께 본다. SVG·html 등 목록 밖 형식은 받지 않는다
 * (SVG 는 스크립트를 품을 수 있다).
 */
public enum MediaFormat {

    PNG("image/png", false, "png"),
    JPEG("image/jpeg", false, "jpg", "jpeg"),
    GIF("image/gif", false, "gif"),
    WEBP("image/webp", false, "webp"),
    MP4("video/mp4", true, "mp4"),
    WEBM("video/webm", true, "webm");

    /** 이미지 상한 10MB. */
    public static final long IMAGE_MAX_BYTES = 10L * 1024 * 1024;
    /** 동영상 상한 100MB. */
    public static final long VIDEO_MAX_BYTES = 100L * 1024 * 1024;
    /** 판정에 읽는 앞 바이트 수(WEBP 가 12바이트로 가장 길다). */
    public static final int HEADER_BYTES = 12;

    private final String contentType;
    private final boolean video;
    private final String[] extensions;

    MediaFormat(String contentType, boolean video, String... extensions) {
        this.contentType = contentType;
        this.video = video;
        this.extensions = extensions;
    }

    public String contentType() { return contentType; }

    public boolean isVideo() { return video; }

    /** 이 형식의 크기 상한(이미지 10MB, 동영상 100MB). */
    public long maxBytes() {
        return video ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    }

    /** 파일 이름의 확장자(대소문자 무시)로 형식을 고른다. 확장자가 없거나 목록 밖이면 빈 값. */
    public static Optional<MediaFormat> fromFileName(String fileName) {
        if (fileName == null) return Optional.empty();
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) return Optional.empty();
        String ext = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
        for (MediaFormat f : values()) {
            for (String e : f.extensions) {
                if (e.equals(ext)) return Optional.of(f);
            }
        }
        return Optional.empty();
    }

    /**
     * 파일 앞 바이트(매직 넘버)로 형식을 고른다. 모르는 내용이면 빈 값.
     * <pre>
     *   PNG  89 50 4E 47        JPEG FF D8 FF          GIF  47 49 46 38("GIF8")
     *   WEBP "RIFF" ???? "WEBP" MP4  ???? "ftyp"       WEBM 1A 45 DF A3(EBML)
     * </pre>
     */
    public static Optional<MediaFormat> detect(byte[] head) {
        if (head == null) return Optional.empty();
        if (startsWith(head, 0, 0x89, 0x50, 0x4E, 0x47)) return Optional.of(PNG);
        if (startsWith(head, 0, 0xFF, 0xD8, 0xFF)) return Optional.of(JPEG);
        if (startsWith(head, 0, 'G', 'I', 'F', '8')) return Optional.of(GIF);
        if (startsWith(head, 0, 'R', 'I', 'F', 'F') && startsWith(head, 8, 'W', 'E', 'B', 'P')) return Optional.of(WEBP);
        if (startsWith(head, 4, 'f', 't', 'y', 'p')) return Optional.of(MP4);
        if (startsWith(head, 0, 0x1A, 0x45, 0xDF, 0xA3)) return Optional.of(WEBM);
        return Optional.empty();
    }

    private static boolean startsWith(byte[] head, int offset, int... expected) {
        if (head.length < offset + expected.length) return false;
        for (int i = 0; i < expected.length; i++) {
            if ((head[offset + i] & 0xFF) != expected[i]) return false;
        }
        return true;
    }
}
