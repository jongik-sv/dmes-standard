package com.dongkuk.dmes.mdm.batch.sapdict;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * TSK-04-05 design.md §3.1 — RFC 4180 CSV 읽기·쓰기(§4.1·§4.3, 불변 규칙 I17). 외부 라이브러리 없이
 * 구현한 {@link SapCsv} 가 인용 칸·BOM·줄끝·헤더 정규화·출력 형식을 지키는지 고정한다.
 */
class SapCsvTest {

    @Test
    void 쉼표_큰따옴표_줄바꿈을_품은_인용_칸을_한_칸으로_읽는다() {
        List<List<String>> records = SapCsv.parse("a,\"b,c\",\"d\"\"e\",\"f\r\ng\"\n");

        assertEquals(List.of(List.of("a", "b,c", "d\"e", "f\r\ng")), records);
    }

    @Test
    void BOM_을_떼고_CRLF_와_LF_를_모두_읽고_빈_줄은_건너뛴다() {
        SapCsv.Table table = SapCsv.parseTable("X.csv", "\uFEFFROLLNAME,DDTEXT\r\nA,가\n\r\nB,나\r\n\n");

        assertEquals(List.of("ROLLNAME", "DDTEXT"), table.headers());
        assertEquals(2, table.rows().size());
        assertEquals("A", table.rows().get(0).get("ROLLNAME"));
        assertEquals("나", table.rows().get(1).get("DDTEXT"));
    }

    @Test
    void 헤더는_앞뒤_공백을_떼고_대문자로_맞춘다() {
        SapCsv.Table table = SapCsv.parseTable("X.csv", "rollname , DdText\nA,가\n");

        assertEquals(List.of("ROLLNAME", "DDTEXT"), table.headers());
        assertTrue(table.hasHeader("ROLLNAME"));
        assertEquals("A", table.rows().get(0).get("ROLLNAME"));
    }

    @Test
    void 헤더보다_칸이_적은_행은_빈_문자열로_채운다() {
        SapCsv.Table table = SapCsv.parseTable("X.csv", "A,B,C\n1\n");

        assertEquals("1", table.rows().get(0).get("A"));
        assertEquals("", table.rows().get(0).get("B"));
        assertEquals("", table.rows().get(0).get("C"));
    }

    @Test
    void 헤더보다_칸이_많은_행은_행_번호와_함께_입력_오류다() {
        SapDictInputException e = assertThrows(SapDictInputException.class,
                () -> SapCsv.parseTable("DD04L.csv", "A,B\n1,2\n3,4,5\n"));

        assertTrue(e.getMessage().contains("DD04L.csv"), e.getMessage());
        assertTrue(e.getMessage().contains("3"), "행 번호(헤더 포함 3번째 레코드)가 메시지에 있어야 한다: " + e.getMessage());
    }

    @Test
    void 같은_헤더가_두_번_나오면_입력_오류다() {
        SapDictInputException e = assertThrows(SapDictInputException.class,
                () -> SapCsv.parseTable("DD03L.csv", "TABNAME,tabname\nA,B\n"));

        assertTrue(e.getMessage().contains("TABNAME"), e.getMessage());
    }

    @Test
    void 쓰기는_BOM_CRLF_최소_인용이고_되읽으면_원래_값이다() {
        List<List<String>> rows = List.of(
                List.of("h1", "h2", "h3"),
                List.of("plain", "a,b", "q\"t"),
                List.of("줄\n바꿈", "", "NUMBER(3,1)"));

        byte[] bytes = SapCsv.toBytes(rows);

        assertArrayEquals(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, Arrays.copyOf(bytes, 3));
        String text = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        assertEquals("h1,h2,h3\r\nplain,\"a,b\",\"q\"\"t\"\r\n\"줄\n바꿈\",,\"NUMBER(3,1)\"\r\n", text);
        // 값 밖의 단독 LF 는 없다(값 안의 LF 는 인용 칸 안에만 있다)
        String outsideQuotes = text.replace("\"줄\n바꿈\"", "");
        assertFalse(outsideQuotes.replace("\r\n", "").contains("\n"));
        assertEquals(rows, SapCsv.parse(new String(bytes, StandardCharsets.UTF_8)));
    }

    @Test
    void MS949_로_인코딩한_한글_입력을_charset_을_주면_바르게_읽는다(@TempDir Path dir) throws Exception {
        Charset ms949 = Charset.forName("MS949");
        Path file = dir.resolve("DD04T.csv");
        Files.write(file, "ROLLNAME,DDTEXT\r\nZZDE_COIL_THK,코일 두께\r\n".getBytes(ms949));

        SapCsv.Table table = SapCsv.readTable(file, ms949);

        assertEquals("코일 두께", table.rows().get(0).get("DDTEXT"));
    }
}
