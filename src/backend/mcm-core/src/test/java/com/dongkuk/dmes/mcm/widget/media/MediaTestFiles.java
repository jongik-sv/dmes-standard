package com.dongkuk.dmes.mcm.widget.media;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** 미디어 시험용 바이트 — 형식별 매직 넘버로 시작하는 작은 가짜 파일. */
final class MediaTestFiles {

    private MediaTestFiles() {}

    static final byte[] PNG_MAGIC = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};
    static final byte[] GIF_MAGIC = ascii("GIF89a");
    static final byte[] WEBP_MAGIC = concat(ascii("RIFF"), new byte[] {0x24, 0x00, 0x00, 0x00}, ascii("WEBPVP8 "));
    static final byte[] MP4_MAGIC = concat(new byte[] {0x00, 0x00, 0x00, 0x18}, ascii("ftypmp42"));
    static final byte[] WEBM_MAGIC = {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, (byte) 0x9F, 0x42, (byte) 0x86, (byte) 0x81};

    /** 매직 넘버 + 0..n 채움 바이트로 총 size 바이트를 만든다. */
    static byte[] file(byte[] magic, int size) {
        byte[] out = Arrays.copyOf(magic, Math.max(size, magic.length));
        for (int i = magic.length; i < out.length; i++) {
            out[i] = (byte) (i % 251);
        }
        return out;
    }

    static byte[] png(int size) { return file(PNG_MAGIC, size); }

    static byte[] ascii(String s) { return s.getBytes(StandardCharsets.US_ASCII); }

    static byte[] concat(byte[]... parts) {
        int len = 0;
        for (byte[] p : parts) len += p.length;
        byte[] out = new byte[len];
        int pos = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, pos, p.length);
            pos += p.length;
        }
        return out;
    }
}
