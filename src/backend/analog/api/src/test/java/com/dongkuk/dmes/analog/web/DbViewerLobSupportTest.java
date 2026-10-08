package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerLobSupport;
import com.dongkuk.dmes.analog.db.DbViewerLobSupport.LobKind;
import com.dongkuk.dmes.analog.db.DbViewerLobSupport.LobResult;
import com.dongkuk.dmes.analog.db.DbViewerLobSupport.PreviewBudget;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.ResultSet;
import java.sql.Types;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** LOB 요약·상세 순수 함수 시험 (DB 없음). */
class DbViewerLobSupportTest {

    private static byte[] bytes(int... values) {
        byte[] out = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            out[i] = (byte) values[i];
        }
        return out;
    }

    private static byte[] withHead(byte[] head, int total) {
        return Arrays.copyOf(head, total);
    }

    // ------------------------------------------------------------ 크기 표기

    @Test
    void 크기를_사람이_읽기_좋게_쓴다() {
        assertThat(DbViewerLobSupport.formatSize(0)).isEqualTo("0B");
        assertThat(DbViewerLobSupport.formatSize(16)).isEqualTo("16B");
        assertThat(DbViewerLobSupport.formatSize(1023)).isEqualTo("1023B");
        assertThat(DbViewerLobSupport.formatSize(1024)).isEqualTo("1KB");
        assertThat(DbViewerLobSupport.formatSize(49_357)).isEqualTo("48.2KB");
        assertThat(DbViewerLobSupport.formatSize(64 * 1024)).isEqualTo("64KB");
        assertThat(DbViewerLobSupport.formatSize(1_258_291)).isEqualTo("1.2MB");
        assertThat(DbViewerLobSupport.formatSize(3L * 1024 * 1024 * 1024)).isEqualTo("3GB");
        // 올림으로 1024.0KB 가 되는 경계는 다음 단위로 올린다.
        assertThat(DbViewerLobSupport.formatSize(1024 * 1024 - 1)).isEqualTo("1MB");
    }

    // ------------------------------------------------------------ 종류 판별

    @Test
    void 매직넘버로_종류를_판별한다() {
        assertThat(DbViewerLobSupport.detect(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0), 9).label())
                .isEqualTo("PNG");
        assertThat(DbViewerLobSupport.detect(bytes(0xFF, 0xD8, 0xFF, 0xE0), 4).label()).isEqualTo("JPEG");
        assertThat(DbViewerLobSupport.detect("GIF89a".getBytes(StandardCharsets.US_ASCII), 6).label())
                .isEqualTo("GIF");
        assertThat(DbViewerLobSupport.detect("GIF87a".getBytes(StandardCharsets.US_ASCII), 6).label())
                .isEqualTo("GIF");
        assertThat(DbViewerLobSupport.detect("RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.ISO_8859_1), 16)
                .label()).isEqualTo("WEBP");
        assertThat(DbViewerLobSupport.detect("%PDF-1.7".getBytes(StandardCharsets.US_ASCII), 8).label())
                .isEqualTo("PDF");
        assertThat(DbViewerLobSupport.detect(bytes('P', 'K', 3, 4, 0), 5).label()).isEqualTo("ZIP");
        assertThat(DbViewerLobSupport.detect(bytes(0x1F, 0x8B, 8), 3).label()).isEqualTo("GZIP");
        assertThat(DbViewerLobSupport.detect(bytes(1, 2, 3, 4), 4)).isNull();
        // RIFF 이지만 WEBP 가 아니면(WAV 등) 판별하지 않는다.
        assertThat(DbViewerLobSupport.detect("RIFF\0\0\0\0WAVEfmt ".getBytes(StandardCharsets.ISO_8859_1), 16))
                .isNull();
        // 길이가 모자라면 판별하지 않는다.
        assertThat(DbViewerLobSupport.detect(bytes(0x89, 'P', 'N'), 3)).isNull();
    }

    @Test
    void 이미지만_image로_표시한다() {
        assertThat(DbViewerLobSupport.detect(bytes(0xFF, 0xD8, 0xFF), 3).image()).isTrue();
        assertThat(DbViewerLobSupport.detect("%PDF-".getBytes(StandardCharsets.US_ASCII), 5).image()).isFalse();
    }

    @Test
    void UTF8_글_여부를_판별한다() {
        byte[] hangul = "안녕하세요 DB 뷰어\n둘째 줄".getBytes(StandardCharsets.UTF_8);
        assertThat(DbViewerLobSupport.isUtf8Text(hangul, hangul.length, false)).isTrue();
        // 한글 중간에서 잘렸어도 cut=true 면 글로 본다.
        assertThat(DbViewerLobSupport.isUtf8Text(hangul, 8, true)).isTrue();
        assertThat(DbViewerLobSupport.isUtf8Text(hangul, 8, false)).isFalse();
        // 잘못된 UTF-8, NUL 이 섞인 자료, 빈 자료는 글이 아니다.
        assertThat(DbViewerLobSupport.isUtf8Text(bytes(0xC3, 0x28), 2, false)).isFalse();
        assertThat(DbViewerLobSupport.isUtf8Text(bytes('a', 0, 'b'), 3, false)).isFalse();
        assertThat(DbViewerLobSupport.isUtf8Text(new byte[0], 0, false)).isFalse();
    }

    // ------------------------------------------------------------ 요약 문자열

    @Test
    void BLOB_요약은_크기와_종류를_보인다() {
        byte[] png = withHead(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A), 16);
        assertThat(DbViewerLobSupport.summarizeBinary(LobKind.BLOB, 49_357, png, 16))
                .isEqualTo("BLOB 48.2KB · PNG");
        byte[] text = "hello 안녕".getBytes(StandardCharsets.UTF_8);
        assertThat(DbViewerLobSupport.summarizeBinary(LobKind.BLOB, text.length, text, text.length))
                .isEqualTo("BLOB 12B · 글");
        byte[] unknown = bytes(1, 2, 3, 4, 5);
        assertThat(DbViewerLobSupport.summarizeBinary(LobKind.BLOB, 1_258_291, unknown, 5))
                .isEqualTo("BLOB 1.2MB");
        assertThat(DbViewerLobSupport.summarizeBinary(LobKind.BLOB, 0, new byte[0], 0)).isEqualTo("BLOB 0B");
    }

    @Test
    void RAW_요약은_같은_형식이다() {
        byte[] raw = new byte[16];
        for (int i = 0; i < 16; i++) {
            raw[i] = (byte) (0x80 + i);
        }
        assertThat(DbViewerLobSupport.summarizeBinary(LobKind.RAW, 16, raw, 16)).isEqualTo("RAW 16B");
    }

    @Test
    void CLOB_요약은_4000자를_넘으면_전체_글자수를_붙인다() {
        assertThat(DbViewerLobSupport.summarizeClob("짧은 글", 4)).isEqualTo("짧은 글");
        String preview = "가".repeat(4000);
        assertThat(DbViewerLobSupport.summarizeClob(preview, 4000)).isEqualTo(preview);
        assertThat(DbViewerLobSupport.summarizeClob(preview, 12_345)).isEqualTo(preview + "…(전체 12,345자)");
    }

    @Test
    void 글자_읽기는_상한에서_자르고_짝_없는_서로게이트를_버린다() throws Exception {
        assertThat(DbViewerLobSupport.readChars(new StringReader("abcdef"), 4)).isEqualTo("abcd");
        assertThat(DbViewerLobSupport.readChars(new StringReader("ab"), 4)).isEqualTo("ab");
        // 4번째 글자 자리에서 이모지(서로게이트 쌍)가 반으로 잘리면 앞 반쪽은 버린다.
        assertThat(DbViewerLobSupport.readChars(new StringReader("abc😀"), 4)).isEqualTo("abc");
    }

    // ------------------------------------------------------------ 예산

    @Test
    void 예산을_다_쓰면_뒤_칸은_100자만_읽는다() {
        PreviewBudget budget = new PreviewBudget(DbViewerLobSupport.RESPONSE_PREVIEW_BUDGET);
        int fullCells = 0;
        while (budget.nextClobLimit() == DbViewerLobSupport.CLOB_PREVIEW_CHARS) {
            budget.consume(DbViewerLobSupport.CLOB_PREVIEW_CHARS);
            fullCells++;
        }
        assertThat(fullCells).isEqualTo(250);
        assertThat(budget.nextClobLimit()).isEqualTo(100);
        // 100자 칸은 예산을 더 깎아도 계속 100자다.
        budget.consume(100);
        assertThat(budget.nextClobLimit()).isEqualTo(100);
    }

    // ------------------------------------------------------------ JDBC 읽기 (목)

    @Test
    void CLOB_칸을_읽어_요약하고_free한다() throws Exception {
        String full = "가".repeat(5000);
        Clob clob = mock(Clob.class);
        when(clob.getCharacterStream()).thenAnswer(inv -> new StringReader(full));
        when(clob.length()).thenReturn((long) full.length());
        ResultSet rs = mock(ResultSet.class);
        when(rs.getClob(1)).thenReturn(clob);
        PreviewBudget budget = new PreviewBudget(DbViewerLobSupport.RESPONSE_PREVIEW_BUDGET);

        String summary = DbViewerLobSupport.readSummary(rs, 1, LobKind.CLOB, budget);

        assertThat(summary).isEqualTo("가".repeat(4000) + "…(전체 5,000자)");
        assertThat(budget.remaining()).isEqualTo(DbViewerLobSupport.RESPONSE_PREVIEW_BUDGET - 4000);
        verify(clob).free();
    }

    @Test
    void 예산_소진_뒤_CLOB은_100자만_싣는다() throws Exception {
        String full = "x".repeat(900);
        Clob clob = mock(Clob.class);
        when(clob.getCharacterStream()).thenAnswer(inv -> new StringReader(full));
        when(clob.length()).thenReturn(900L);
        ResultSet rs = mock(ResultSet.class);
        when(rs.getClob(1)).thenReturn(clob);

        String summary = DbViewerLobSupport.readSummary(rs, 1, LobKind.CLOB, new PreviewBudget(0));

        assertThat(summary).isEqualTo("x".repeat(100) + "…(전체 900자)");
    }

    @Test
    void SQL_NULL_LOB은_null이다() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getClob(1)).thenReturn(null);
        when(rs.getBlob(2)).thenReturn(null);
        PreviewBudget budget = new PreviewBudget(10);
        assertThat(DbViewerLobSupport.readSummary(rs, 1, LobKind.CLOB, budget)).isNull();
        assertThat(DbViewerLobSupport.readSummary(rs, 2, LobKind.BLOB, budget)).isNull();
    }

    @Test
    void BLOB_칸은_앞부분만_읽어_종류를_붙이고_free한다() throws Exception {
        byte[] data = withHead(bytes(0xFF, 0xD8, 0xFF, 0xE0), 50_000);
        Blob blob = mock(Blob.class);
        when(blob.length()).thenReturn((long) data.length);
        when(blob.getBinaryStream()).thenAnswer(inv -> new ByteArrayInputStream(data));
        ResultSet rs = mock(ResultSet.class);
        when(rs.getBlob(1)).thenReturn(blob);

        String summary = DbViewerLobSupport.readSummary(rs, 1, LobKind.BLOB, new PreviewBudget(10));

        assertThat(summary).isEqualTo("BLOB 48.8KB · JPEG");
        verify(blob).free();
    }

    @Test
    void LONG_RAW는_조회_요약에서_읽지_않는다() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        assertThat(DbViewerLobSupport.readSummary(rs, 1, LobKind.LONG_RAW, new PreviewBudget(10)))
                .isEqualTo("LONG RAW");
        verifyNoInteractions(rs);
    }

    @Test
    void CLOB_배열은_실제_길이와_상한_중_작은_쪽만_잡는다() throws Exception {
        Clob clob = mock(Clob.class);
        when(clob.getCharacterStream()).thenAnswer(inv -> new StringReader("짧은 글"));
        when(clob.length()).thenReturn(4L);
        ResultSet rs = mock(ResultSet.class);
        when(rs.getClob(1)).thenReturn(clob);
        assertThat(DbViewerLobSupport.readSummary(rs, 1, LobKind.CLOB, new PreviewBudget(10))).isEqualTo("짧은 글");
        // 크기를 모르는 상한 큰 값이어도 length 만큼만 읽는다 — 길이가 0 이면 빈 글.
        when(clob.length()).thenReturn(0L);
        assertThat(DbViewerLobSupport.readSummary(rs, 1, LobKind.CLOB, new PreviewBudget(10))).isEmpty();
    }

    @Test
    void 칸_종류를_JDBC_타입으로_찾는다() {
        assertThat(LobKind.fromSqlType(Types.CLOB, "CLOB")).isEqualTo(LobKind.CLOB);
        assertThat(LobKind.fromSqlType(Types.CLOB, "NCLOB")).isEqualTo(LobKind.NCLOB);
        assertThat(LobKind.fromSqlType(Types.NCLOB, "NCLOB")).isEqualTo(LobKind.NCLOB);
        assertThat(LobKind.fromSqlType(Types.BLOB, "BLOB")).isEqualTo(LobKind.BLOB);
        assertThat(LobKind.fromSqlType(Types.VARBINARY, "RAW")).isEqualTo(LobKind.RAW);
        assertThat(LobKind.fromSqlType(Types.LONGVARBINARY, "LONG RAW")).isEqualTo(LobKind.LONG_RAW);
        assertThat(LobKind.fromSqlType(Types.VARCHAR, "VARCHAR2")).isNull();
        assertThat(LobKind.fromDataType("LONG RAW")).isEqualTo(LobKind.LONG_RAW);
        assertThat(LobKind.fromDataType("VARCHAR2")).isNull();
        assertThat(LobKind.fromDataType("BFILE")).isNull();
    }

    // ------------------------------------------------------------ 상세 응답

    @Test
    void 상세_CLOB은_글로_싣고_잘렸는지_표시한다() {
        LobResult whole = DbViewerLobSupport.detailFromText("CONTENT", LobKind.CLOB, "본문", 2);
        assertThat(whole.kind()).isEqualTo("text");
        assertThat(whole.length()).isEqualTo(2);
        assertThat(whole.truncated()).isFalse();
        assertThat(whole.text()).isEqualTo("본문");
        assertThat(whole.hex()).isNull();
        LobResult cut = DbViewerLobSupport.detailFromText("CONTENT", LobKind.CLOB, "본", 2_000_000);
        assertThat(cut.truncated()).isTrue();
        assertThat(cut.length()).isEqualTo(2_000_000);
    }

    @Test
    void 상세_이미지는_1MB_이하일_때만_base64로_싣는다() {
        byte[] png = withHead(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A), 100);
        LobResult image = DbViewerLobSupport.detailFromBytes("IMG", LobKind.BLOB, png, 100, false);
        assertThat(image.kind()).isEqualTo("image");
        assertThat(image.mime()).isEqualTo("image/png");
        assertThat(image.base64()).isEqualTo(java.util.Base64.getEncoder().encodeToString(png));
        assertThat(image.hex()).isNull();
        assertThat(image.truncated()).isFalse();

        // 1MB 를 넘는 이미지는 binary + hex(앞 4096바이트).
        byte[] head = withHead(png, DbViewerLobSupport.DETAIL_BYTES);
        LobResult big = DbViewerLobSupport.detailFromBytes("IMG", LobKind.BLOB, head, 5_000_000, false);
        assertThat(big.kind()).isEqualTo("binary");
        assertThat(big.base64()).isNull();
        assertThat(big.hex()).hasSize(4096 * 2).startsWith("89504e470d0a1a0a");
        assertThat(big.truncated()).isTrue();
        assertThat(big.length()).isEqualTo(5_000_000);
    }

    @Test
    void 상세_글_BLOB은_글로_싣는다() {
        byte[] text = "로그 한 줄\n둘째 줄".getBytes(StandardCharsets.UTF_8);
        LobResult result = DbViewerLobSupport.detailFromBytes("DOC", LobKind.BLOB, text, text.length, false);
        assertThat(result.kind()).isEqualTo("text");
        assertThat(result.text()).isEqualTo("로그 한 줄\n둘째 줄");
        assertThat(result.length()).isEqualTo(text.length);
        assertThat(result.truncated()).isFalse();
        assertThat(result.hex()).isNull();
    }

    @Test
    void 상세_1MB_글은_잘린_끝_글자를_버린다() {
        // 3바이트 한글을 1MB 경계(1,048,576 = 3*349,525 + 1)에서 자르면 끝에 한 바이트가 남는다.
        byte[] full = "가".repeat(400_000).getBytes(StandardCharsets.UTF_8);
        byte[] part = Arrays.copyOf(full, DbViewerLobSupport.DETAIL_BYTES);
        LobResult result = DbViewerLobSupport.detailFromBytes("DOC", LobKind.BLOB, part, full.length, false);
        assertThat(result.kind()).isEqualTo("text");
        assertThat(result.truncated()).isTrue();
        assertThat(result.text()).hasSize(349_525).doesNotContain("�");
    }

    @Test
    void 상세_알수없는_자료와_PDF는_binary_hex다() {
        byte[] unknown = bytes(0xDE, 0xAD, 0xBE, 0xEF);
        LobResult result = DbViewerLobSupport.detailFromBytes("B", LobKind.RAW, unknown, 4, false);
        assertThat(result.kind()).isEqualTo("binary");
        assertThat(result.hex()).isEqualTo("deadbeef");
        assertThat(result.truncated()).isFalse();
        assertThat(result.text()).isNull();
        assertThat(result.base64()).isNull();
        assertThat(result.mime()).isNull();

        LobResult pdf = DbViewerLobSupport.detailFromBytes("B", LobKind.BLOB,
                "%PDF-1.4 binary".getBytes(StandardCharsets.US_ASCII), 15, false);
        assertThat(pdf.kind()).isEqualTo("binary");
        assertThat(pdf.mime()).isEqualTo("application/pdf");
    }

    @Test
    void 상세_LONG_RAW가_더_있으면_잘림으로_표시한다() {
        byte[] data = new byte[DbViewerLobSupport.DETAIL_BYTES];
        LobResult result = DbViewerLobSupport.detailFromBytes("L", LobKind.LONG_RAW, data, data.length, true);
        assertThat(result.truncated()).isTrue();
        assertThat(result.length()).isEqualTo(DbViewerLobSupport.DETAIL_BYTES);
    }

    @Test
    void 상세_NULL_칸은_빈_응답이다() {
        LobResult clob = DbViewerLobSupport.detailFromText("C", LobKind.CLOB, null, 0);
        assertThat(clob.length()).isZero();
        assertThat(clob.text()).isNull();
        LobResult blob = DbViewerLobSupport.detailFromBytes("B", LobKind.BLOB, null, 0, false);
        assertThat(blob.length()).isZero();
        assertThat(blob.hex()).isNull();
    }

    // ------------------------------------------------------------ lengthKnown · note · 단계별 읽기

    private static final byte[] PNG_HEAD = bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A);

    @Test
    void lengthKnown은_LONG_RAW만_false다() {
        assertThat(DbViewerLobSupport.detailFromBytes("L", LobKind.LONG_RAW, new byte[3], 3, false).lengthKnown())
                .isFalse();
        assertThat(DbViewerLobSupport.detailFromBytes("B", LobKind.BLOB, new byte[3], 3, false).lengthKnown())
                .isTrue();
        assertThat(DbViewerLobSupport.detailFromBytes("B", LobKind.RAW, null, 0, false).lengthKnown()).isTrue();
        assertThat(DbViewerLobSupport.detailFromText("C", LobKind.CLOB, "a", 1).lengthKnown()).isTrue();
        assertThat(DbViewerLobSupport.detailFromText("C", LobKind.CLOB, null, 0).lengthKnown()).isTrue();
    }

    @Test
    void 일MB_넘는_이미지는_note를_싣고_그_밖에는_null이다() {
        byte[] head = withHead(PNG_HEAD, DbViewerLobSupport.DETAIL_BYTES);
        LobResult big = DbViewerLobSupport.detailFromBytes("IMG", LobKind.BLOB, head, 5_000_000, false);
        assertThat(big.note()).isEqualTo("이미지가 1MB 를 넘어 미리 보기를 생략했습니다");
        LobResult small = DbViewerLobSupport.detailFromBytes("IMG", LobKind.BLOB, withHead(PNG_HEAD, 100), 100, false);
        assertThat(small.note()).isNull();
        assertThat(DbViewerLobSupport.detailFromBytes("B", LobKind.RAW, bytes(1, 2), 2, false).note()).isNull();
        assertThat(DbViewerLobSupport.detailFromText("C", LobKind.CLOB, "a", 1).note()).isNull();
    }

    /** 읽은 바이트 수를 세는 스트림 — 얼마나 읽었는지 확인한다. */
    private static final class CountingStream extends ByteArrayInputStream {
        CountingStream(byte[] data) {
            super(data);
        }

        int consumed() {
            return pos;
        }
    }

    @Test
    void BLOB_상세는_앞_4KB로_판단하고_글이_아니면_더_읽지_않는다() throws Exception {
        byte[] data = new byte[2_000_000];
        Arrays.fill(data, (byte) 0xFE);
        CountingStream in = new CountingStream(data);
        LobResult result = DbViewerLobSupport.readBinaryDetail("B", LobKind.BLOB, in, data.length);
        assertThat(in.consumed()).isEqualTo(4096);
        assertThat(result.kind()).isEqualTo("binary");
        assertThat(result.length()).isEqualTo(2_000_000);
        assertThat(result.truncated()).isTrue();
        assertThat(result.lengthKnown()).isTrue();
    }

    @Test
    void BLOB_상세는_1MB_이하_이미지만_끝까지_읽는다() throws Exception {
        byte[] small = withHead(PNG_HEAD, 300_000);
        CountingStream in = new CountingStream(small);
        LobResult image = DbViewerLobSupport.readBinaryDetail("B", LobKind.BLOB, in, small.length);
        assertThat(in.consumed()).isEqualTo(300_000);
        assertThat(image.kind()).isEqualTo("image");
        assertThat(image.note()).isNull();

        byte[] big = withHead(PNG_HEAD, 3_000_000);
        CountingStream bigIn = new CountingStream(big);
        LobResult skipped = DbViewerLobSupport.readBinaryDetail("B", LobKind.BLOB, bigIn, big.length);
        assertThat(bigIn.consumed()).isEqualTo(4096);
        assertThat(skipped.kind()).isEqualTo("binary");
        assertThat(skipped.note()).isEqualTo(DbViewerLobSupport.IMAGE_TOO_BIG_NOTE);
        assertThat(skipped.length()).isEqualTo(3_000_000);
    }

    @Test
    void BLOB_상세는_UTF8_글이면_상한까지_읽는다() throws Exception {
        byte[] text = "가나다 ".repeat(120_000).getBytes(StandardCharsets.UTF_8);
        CountingStream in = new CountingStream(text);
        LobResult result = DbViewerLobSupport.readBinaryDetail("B", LobKind.BLOB, in, text.length);
        assertThat(in.consumed()).isEqualTo(DbViewerLobSupport.DETAIL_BYTES);
        assertThat(result.kind()).isEqualTo("text");
        assertThat(result.truncated()).isTrue();
        assertThat(result.length()).isEqualTo(text.length);
    }

    @Test
    void LONG_RAW_상세는_길이를_모르고_읽은_수가_length다() throws Exception {
        byte[] data = "짧은 글".getBytes(StandardCharsets.UTF_8);
        LobResult text = DbViewerLobSupport.readBinaryDetail("L", LobKind.LONG_RAW,
                new ByteArrayInputStream(data), -1);
        assertThat(text.lengthKnown()).isFalse();
        assertThat(text.kind()).isEqualTo("text");
        assertThat(text.length()).isEqualTo(data.length);
        assertThat(text.truncated()).isFalse();

        byte[] bin = new byte[10];
        Arrays.fill(bin, (byte) 0xFE);
        LobResult binary = DbViewerLobSupport.readBinaryDetail("L", LobKind.LONG_RAW,
                new ByteArrayInputStream(bin), -1);
        assertThat(binary.lengthKnown()).isFalse();
        assertThat(binary.kind()).isEqualTo("binary");
        assertThat(binary.length()).isEqualTo(10);
        assertThat(binary.truncated()).isFalse();
    }

    @Test
    void LONG_RAW_상세가_상한을_넘으면_잘림이고_큰_이미지는_note를_싣는다() throws Exception {
        byte[] text = "a".repeat(DbViewerLobSupport.DETAIL_BYTES + 500).getBytes(StandardCharsets.UTF_8);
        LobResult cut = DbViewerLobSupport.readBinaryDetail("L", LobKind.LONG_RAW, new ByteArrayInputStream(text), -1);
        assertThat(cut.truncated()).isTrue();
        assertThat(cut.length()).isEqualTo(DbViewerLobSupport.DETAIL_BYTES);
        assertThat(cut.lengthKnown()).isFalse();

        byte[] png = withHead(PNG_HEAD, DbViewerLobSupport.DETAIL_BYTES + 10);
        LobResult image = DbViewerLobSupport.readBinaryDetail("L", LobKind.LONG_RAW, new ByteArrayInputStream(png), -1);
        assertThat(image.kind()).isEqualTo("binary");
        assertThat(image.note()).isEqualTo(DbViewerLobSupport.IMAGE_TOO_BIG_NOTE);

        // 정확히 4096 바이트 binary 는 뒤에 더 없으므로 잘림이 아니다.
        byte[] exact = new byte[4096];
        Arrays.fill(exact, (byte) 0xFE);
        assertThat(DbViewerLobSupport.readBinaryDetail("L", LobKind.LONG_RAW, new ByteArrayInputStream(exact), -1)
                .truncated()).isFalse();
    }
}
