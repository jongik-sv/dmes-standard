package com.dongkuk.dmes.analog.db;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CoderResult;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Locale;

/**
 * DB 뷰어 LOB·RAW 칸 처리 — 조회 결과의 요약 문자열 만들기와 상세 재조회 응답 만들기.
 *
 * <p>요약 문자열 규칙(순수 함수)은 DB 없이 시험할 수 있게 JDBC 읽기와 분리해 두었다.
 * JDBC 읽기({@link #readSummary})는 읽은 LOB 을 칸마다 {@code free()} 하고 스트림을 닫는다.
 */
public final class DbViewerLobSupport {

    private DbViewerLobSupport() {
    }

    /** 조회 결과 CLOB 칸 미리 보기 글자 수. */
    public static final int CLOB_PREVIEW_CHARS = 4_000;

    /** 글자 예산을 다 쓴 뒤의 CLOB 칸 미리 보기 글자 수. */
    public static final int CLOB_OVERFLOW_PREVIEW_CHARS = 100;

    /** 응답 하나 전체의 LOB 미리 보기 글자 예산. */
    public static final int RESPONSE_PREVIEW_BUDGET = 1_000_000;

    /** 종류 판별에 쓰는 앞 바이트 수(매직 넘버). */
    static final int HEAD_BYTES = 16;

    /** 글 여부 판별에 쓰는 앞 바이트 수. */
    static final int TEXT_SNIFF_BYTES = 4_096;

    /** 상세 재조회 — CLOB 글자 상한. */
    public static final int DETAIL_TEXT_CHARS = 1_000_000;

    /** 상세 재조회 — BLOB·RAW·LONG RAW 읽기 상한(1MB). 이미지 base64 도 이 크기까지만 싣는다. */
    public static final int DETAIL_BYTES = 1_048_576;

    /** 1MB 를 넘는 이미지의 미리 보기 생략 안내. */
    public static final String IMAGE_TOO_BIG_NOTE = "이미지가 1MB 를 넘어 미리 보기를 생략했습니다";

    /** 상세 재조회 — binary 일 때 16진수로 싣는 바이트 수. */
    public static final int DETAIL_HEX_BYTES = 4_096;

    /** 대상 칸 종류. */
    public enum LobKind {
        CLOB("CLOB"), NCLOB("NCLOB"), BLOB("BLOB"), RAW("RAW"), LONG_RAW("LONG RAW");

        private final String label;

        LobKind(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }

        /** ALL_TAB_COLUMNS.DATA_TYPE 값으로 찾는다. 대상 아니면 null. */
        public static LobKind fromDataType(String dataType) {
            if (dataType == null) {
                return null;
            }
            for (LobKind kind : values()) {
                if (kind.label.equals(dataType.trim().toUpperCase(Locale.ROOT))) {
                    return kind;
                }
            }
            return null;
        }

        /** JDBC 메타데이터({@code getColumnType}·{@code getColumnTypeName})로 찾는다. 대상 아니면 null. */
        public static LobKind fromSqlType(int sqlType, String typeName) {
            String name = typeName == null ? "" : typeName.trim().toUpperCase(Locale.ROOT);
            return switch (sqlType) {
                case Types.CLOB -> name.equals("NCLOB") ? NCLOB : CLOB;
                case Types.NCLOB -> NCLOB;
                case Types.BLOB -> BLOB;
                case Types.VARBINARY, Types.BINARY -> RAW;
                case Types.LONGVARBINARY -> LONG_RAW;
                default -> null;
            };
        }
    }

    /** 이진 자료 종류 판별 결과. */
    public record BinaryType(String label, String mime, boolean image) {
    }

    /** 응답 하나 전체의 CLOB 글자 예산. 응답(execute 한 번)마다 새로 만든다. */
    public static final class PreviewBudget {
        private long remaining;

        public PreviewBudget(long total) {
            this.remaining = total;
        }

        /** 다음 CLOB 칸에 읽을 글자 수 — 예산이 남았으면 4,000자, 다 썼으면 100자. */
        public int nextClobLimit() {
            return remaining > 0 ? CLOB_PREVIEW_CHARS : CLOB_OVERFLOW_PREVIEW_CHARS;
        }

        public void consume(int chars) {
            remaining -= chars;
        }

        public long remaining() {
            return remaining;
        }
    }

    /**
     * 상세 재조회 응답. 쓰지 않는 필드는 null.
     *
     * @param length      전체 길이 — {@code lengthKnown} 이 false(LONG RAW)이면 읽은 바이트 수
     * @param lengthKnown 전체 길이를 아는지. LONG RAW 만 false
     * @param note        화면에 보여 줄 안내(예: 1MB 넘는 이미지). 없으면 null
     */
    public record LobResult(String column, String dataType, String kind, long length, boolean truncated,
                            String text, String mime, String base64, String hex,
                            boolean lengthKnown, String note) {
    }

    // ---------------------------------------------------------------- 순수 함수

    /** 바이트 수를 B·KB·MB·GB 로 읽기 좋게 쓴다 (1024 단위, 소수 한 자리, 끝의 .0 은 생략). */
    public static String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        String[] units = {"KB", "MB", "GB"};
        double value = bytes;
        int unit = -1;
        do {
            value /= 1024.0;
            unit++;
            // 1023.96KB 처럼 올림하면 1024.0 이 되는 경우는 다음 단위로 올린다.
        } while (unit < units.length - 1 && Math.round(value * 10) >= 10240);
        String number = String.format(Locale.ROOT, "%.1f", value);
        if (number.endsWith(".0")) {
            number = number.substring(0, number.length() - 2);
        }
        return number + units[unit];
    }

    /** 앞 바이트(매직 넘버)로 종류를 판별한다. 판별 대상은 PNG·JPEG·GIF·WEBP·PDF·ZIP·GZIP. 모르면 null. */
    public static BinaryType detect(byte[] d, int len) {
        if (d == null) {
            return null;
        }
        if (startsWith(d, len, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) {
            return new BinaryType("PNG", "image/png", true);
        }
        if (startsWith(d, len, 0xFF, 0xD8, 0xFF)) {
            return new BinaryType("JPEG", "image/jpeg", true);
        }
        if (startsWith(d, len, 'G', 'I', 'F', '8') && len >= 6 && (d[4] == '7' || d[4] == '9') && d[5] == 'a') {
            return new BinaryType("GIF", "image/gif", true);
        }
        if (startsWith(d, len, 'R', 'I', 'F', 'F') && len >= 12
                && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') {
            return new BinaryType("WEBP", "image/webp", true);
        }
        if (startsWith(d, len, '%', 'P', 'D', 'F', '-')) {
            return new BinaryType("PDF", "application/pdf", false);
        }
        if (startsWith(d, len, 'P', 'K', 0x03, 0x04) || startsWith(d, len, 'P', 'K', 0x05, 0x06)
                || startsWith(d, len, 'P', 'K', 0x07, 0x08)) {
            return new BinaryType("ZIP", "application/zip", false);
        }
        if (startsWith(d, len, 0x1F, 0x8B)) {
            return new BinaryType("GZIP", "application/gzip", false);
        }
        return null;
    }

    private static boolean startsWith(byte[] d, int len, int... magic) {
        if (len < magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if ((d[i] & 0xFF) != magic[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * 앞부분이 올바른 UTF-8 글인지 본다. 제어 문자(탭·줄바꿈 제외)가 있으면 글이 아니다.
     *
     * @param cut true 면 {@code len} 바이트 뒤에 자료가 더 있다는 뜻 — 끝에서 잘린 글자는 오류로 보지 않는다.
     */
    public static boolean isUtf8Text(byte[] d, int len, boolean cut) {
        if (d == null || len <= 0) {
            return false;
        }
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        ByteBuffer in = ByteBuffer.wrap(d, 0, len);
        CharBuffer out = CharBuffer.allocate(len + 1);
        CoderResult result = decoder.decode(in, out, !cut);
        if (result.isError()) {
            return false;
        }
        if (!cut) {
            result = decoder.flush(out);
            if (result.isError()) {
                return false;
            }
        }
        out.flip();
        while (out.hasRemaining()) {
            char c = out.get();
            if ((c < 0x20 && c != '\t' && c != '\n' && c != '\r') || c == 0x7F) {
                return false;
            }
        }
        return true;
    }

    /** 앞 N바이트를 UTF-8 글로 푼다. 끝에서 잘린 글자는 버리고, 중간의 잘못된 바이트는 대체 문자로 둔다. */
    static String decodeUtf8(byte[] d, int len, boolean cut) {
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPLACE)
                .onUnmappableCharacter(CodingErrorAction.REPLACE);
        ByteBuffer in = ByteBuffer.wrap(d, 0, len);
        CharBuffer out = CharBuffer.allocate(len + 1);
        decoder.decode(in, out, !cut);
        if (!cut) {
            decoder.flush(out);
        }
        out.flip();
        return out.toString();
    }

    /**
     * BLOB·RAW·LONG RAW 요약 — {@code BLOB 48.2KB · PNG}, {@code RAW 16B}.
     *
     * @param size 전체 바이트 수
     * @param head 앞부분 바이트(종류 판별용, 최대 4KB)
     */
    public static String summarizeBinary(LobKind kind, long size, byte[] head, int headLen) {
        StringBuilder sb = new StringBuilder(kind.label()).append(' ').append(formatSize(size));
        if (size > 0 && headLen > 0) {
            BinaryType type = detect(head, headLen);
            if (type != null) {
                sb.append(" · ").append(type.label());
            } else if (isUtf8Text(head, headLen, size > headLen)) {
                sb.append(" · 글");
            }
        }
        return sb.toString();
    }

    /** CLOB 요약 — 읽은 앞부분 + (잘렸으면) {@code …(전체 12,345자)}. */
    public static String summarizeClob(String preview, long totalChars) {
        if (totalChars > preview.length()) {
            return preview + "…(전체 " + String.format(Locale.US, "%,d", totalChars) + "자)";
        }
        return preview;
    }

    /** 글자 스트림에서 최대 {@code max} 자를 읽는다. 끝에서 짝 없는 상위 서로게이트는 버린다. */
    public static String readChars(Reader reader, int max) throws IOException {
        char[] buf = new char[Math.max(0, max)];
        int total = 0;
        while (total < max) {
            int n = reader.read(buf, total, max - total);
            if (n < 0) {
                break;
            }
            total += n;
        }
        if (total == max && total > 0 && Character.isHighSurrogate(buf[total - 1])) {
            total--;
        }
        return new String(buf, 0, total);
    }

    /** 바이트 스트림에서 최대 {@code max} 바이트를 채워 읽는다. */
    static int readUpTo(InputStream in, byte[] buf, int offset, int max) throws IOException {
        int total = 0;
        while (total < max) {
            int n = in.read(buf, offset + total, max - total);
            if (n < 0) {
                break;
            }
            total += n;
        }
        return total;
    }

    // ---------------------------------------------------------------- 조회 결과 요약 (JDBC 읽기)

    /** 칸 종류를 메타데이터로 판별한다. LOB·RAW 가 아니면 null. */
    public static LobKind kindOf(ResultSetMetaData meta, int column) throws SQLException {
        return LobKind.fromSqlType(meta.getColumnType(column), meta.getColumnTypeName(column));
    }

    /**
     * LOB·RAW 한 칸을 요약 문자열로 읽는다. SQL NULL 이면 null.
     * 읽은 Clob·Blob 은 {@code free()} 하고 스트림은 닫는다.
     */
    public static String readSummary(ResultSet rs, int column, LobKind kind, PreviewBudget budget)
            throws SQLException {
        try {
            return switch (kind) {
                case CLOB, NCLOB -> readClobSummary(rs, column, kind, budget);
                case BLOB -> readBlobSummary(rs, column);
                case RAW -> {
                    byte[] bytes = rs.getBytes(column);
                    yield bytes == null ? null
                            : summarizeBinary(kind, bytes.length, bytes, Math.min(bytes.length, TEXT_SNIFF_BYTES));
                }
                // LONG RAW 는 조회 요약에서 읽지 않는다 — 상세 창(/db/lob)에서만 읽는다.
                // 읽지 않고 건너뛴 스트림은 다음 칸을 읽을 때 드라이버가 버린다.
                case LONG_RAW -> LobKind.LONG_RAW.label();
            };
        } catch (IOException e) {
            throw new SQLException("LOB 칸을 읽지 못했습니다: " + e.getMessage(), e);
        }
    }

    private static String readClobSummary(ResultSet rs, int column, LobKind kind, PreviewBudget budget)
            throws SQLException, IOException {
        Clob clob = kind == LobKind.NCLOB ? rs.getNClob(column) : rs.getClob(column);
        if (clob == null) {
            return null;
        }
        try {
            long total = clob.length();
            int cap = (int) Math.min(total, budget.nextClobLimit());
            String preview;
            try (Reader reader = clob.getCharacterStream()) {
                preview = readChars(reader, cap);
            }
            budget.consume(preview.length());
            return summarizeClob(preview, total);
        } finally {
            freeQuietly(clob);
        }
    }

    private static String readBlobSummary(ResultSet rs, int column) throws SQLException, IOException {
        Blob blob = rs.getBlob(column);
        if (blob == null) {
            return null;
        }
        try {
            long size = blob.length();
            byte[] head = new byte[(int) Math.min(size, TEXT_SNIFF_BYTES)];
            int read = 0;
            try (InputStream in = blob.getBinaryStream()) {
                // 앞 16바이트만 읽어 종류를 판별하고, 모르면 4KB 까지 더 읽어 글 여부를 본다.
                read = readUpTo(in, head, 0, Math.min(head.length, HEAD_BYTES));
                if (detect(head, read) == null && read == HEAD_BYTES) {
                    read += readUpTo(in, head, read, head.length - read);
                }
            }
            return summarizeBinary(LobKind.BLOB, size, head, read);
        } finally {
            freeQuietly(blob);
        }
    }

    static void freeQuietly(Clob clob) {
        try {
            clob.free();
        } catch (SQLException | RuntimeException ignored) {
            // free 실패는 조회 결과에 영향이 없다 (커넥션 반납 때 정리됨).
        }
    }

    static void freeQuietly(Blob blob) {
        try {
            blob.free();
        } catch (SQLException | RuntimeException ignored) {
            // free 실패는 조회 결과에 영향이 없다 (커넥션 반납 때 정리됨).
        }
    }

    // ---------------------------------------------------------------- 상세 재조회 응답

    /** CLOB·NCLOB 상세 — 앞 {@link #DETAIL_TEXT_CHARS} 자까지 글로 싣는다. {@code text} 가 null 이면 SQL NULL. */
    public static LobResult detailFromText(String column, LobKind kind, String text, long totalChars) {
        if (text == null) {
            return new LobResult(column, kind.label(), "text", 0, false, null, null, null, null, true, null);
        }
        return new LobResult(column, kind.label(), "text", totalChars, totalChars > text.length(),
                text, null, null, null, true, null);
    }

    /**
     * BLOB·RAW·LONG RAW 상세.
     *
     * @param data        읽은 앞부분(최대 {@link #DETAIL_BYTES}). null 이면 SQL NULL.
     * @param totalLength 전체 바이트 수 (LONG RAW 는 읽은 만큼)
     * @param moreExists  {@code data} 뒤에 읽지 않은 자료가 더 있는지 (LONG RAW 처럼 전체 길이를 모를 때)
     */
    public static LobResult detailFromBytes(String column, LobKind kind, byte[] data, long totalLength,
                                            boolean moreExists) {
        String dataType = kind.label();
        boolean lengthKnown = kind != LobKind.LONG_RAW;
        if (data == null) {
            return new LobResult(column, dataType, "binary", 0, false, null, null, null, null, lengthKnown, null);
        }
        int len = data.length;
        boolean more = moreExists || totalLength > len;
        BinaryType type = detect(data, len);
        if (type != null && type.image() && !more && len <= DETAIL_BYTES) {
            return new LobResult(column, dataType, "image", totalLength, false, null, type.mime(),
                    java.util.Base64.getEncoder().encodeToString(data), null, lengthKnown, null);
        }
        String note = type != null && type.image() ? IMAGE_TOO_BIG_NOTE : null;
        if (type == null) {
            int sniff = Math.min(len, TEXT_SNIFF_BYTES);
            if (isUtf8Text(data, sniff, len > sniff)) {
                return new LobResult(column, dataType, "text", totalLength, more,
                        decodeUtf8(data, len, more), "text/plain", null, null, lengthKnown, null);
            }
        }
        int hexLen = Math.min(len, DETAIL_HEX_BYTES);
        return new LobResult(column, dataType, "binary", totalLength, more || totalLength > hexLen, null,
                type == null ? null : type.mime(), null, HexFormat.of().formatHex(data, 0, hexLen),
                lengthKnown, note);
    }

    /**
     * 앞 4KB({@code head}) 로 종류를 보고 더 읽을 총 바이트 수를 정한다 (head 를 포함한 수).
     * 이미지(1MB 이하)나 UTF-8 글일 때만 상한까지 더 읽고, 그 밖에는 {@code headLen} 그대로다.
     *
     * @param size 전체 바이트 수. 모르면(LONG RAW) 음수 — 이때 더 읽는 경우는 상한+1 까지 읽어 넘침을 알아낸다.
     */
    public static int wantedBytes(byte[] head, int headLen, long size) {
        boolean unknown = size < 0;
        BinaryType type = detect(head, headLen);
        if (type != null) {
            if (!type.image()) {
                return headLen;
            }
            if (unknown) {
                return DETAIL_BYTES + 1;
            }
            return size <= DETAIL_BYTES ? (int) size : headLen;
        }
        if (isUtf8Text(head, headLen, true)) {
            return unknown ? DETAIL_BYTES + 1 : (int) Math.min(size, DETAIL_BYTES);
        }
        return headLen;
    }

    /**
     * BLOB·LONG RAW 상세 — 앞 4KB 를 먼저 읽어 종류를 판단한 뒤, 이미지(1MB 이하)나 UTF-8 글일 때만
     * 상한까지 더 읽는다. 그 밖의 자료는 4KB 이상 메모리에 올리지 않는다.
     *
     * @param size 전체 바이트 수, 모르면(LONG RAW) 음수
     */
    public static LobResult readBinaryDetail(String column, LobKind kind, InputStream in, long size)
            throws IOException {
        boolean sizeKnown = size >= 0;
        int headCap = sizeKnown ? (int) Math.min(size, TEXT_SNIFF_BYTES) : TEXT_SNIFF_BYTES;
        byte[] data = new byte[headCap];
        int read = readUpTo(in, data, 0, headCap);
        boolean cut = sizeKnown ? size > read : read == headCap;
        int want = cut ? wantedBytes(data, read, size) : read;
        boolean more;
        if (want > read) {
            data = Arrays.copyOf(data, want);
            read += readUpTo(in, data, read, want - read);
            more = sizeKnown ? size > read : read == want;
        } else {
            // 더 읽지 않기로 했다 — 길이를 모르면 한 바이트만 더 읽어 뒤에 자료가 있는지 본다.
            more = sizeKnown ? size > read : cut && in.read() >= 0;
        }
        int keep = Math.min(read, DETAIL_BYTES);
        if (keep < data.length) {
            data = Arrays.copyOf(data, keep);
        }
        return detailFromBytes(column, kind, data, sizeKnown ? size : data.length, more);
    }
}
