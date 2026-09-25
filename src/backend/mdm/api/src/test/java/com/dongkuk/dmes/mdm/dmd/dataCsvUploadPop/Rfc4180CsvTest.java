package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service.Rfc4180Csv;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-07-04 design.md B2 — {@link Rfc4180Csv} 단위 테스트. I7·I7-1 대상 테스트.
 */
class Rfc4180CsvTest {

    private static final String HEADER_LINE = String.join(",", Rfc4180Csv.HEADER);

    /** 20 고정 컬럼 수만큼 뒤를 빈 칸으로 채운 데이터 행(콤마 수 실수를 막으려고 손으로 세지 않는다). */
    private static String dataLine(String... firstFields) {
        List<String> fields = new ArrayList<>(List.of(firstFields));
        while (fields.size() < Rfc4180Csv.HEADER.size()) {
            fields.add("");
        }
        return String.join(",", fields);
    }

    @Test
    void 인용부호_콤마_개행이_든_값을_읽는다() {
        String text = HEADER_LINE + "\r\n"
                + dataLine("KR", "\"이름, 쉼표\"", "\"줄\"\"바꿈\"", "1", "\"여러\n줄 설명\"", "A") + "\r\n";
        Rfc4180Csv.ParsedCsv parsed = Rfc4180Csv.parse(text);
        assertEquals(1, parsed.rows().size());
        Rfc4180Csv.ParsedRow row = parsed.rows().get(0);
        assertTrue(row.ok(), row.error());
        assertEquals(2, row.lineNo());
        List<String> cells = row.cells();
        assertEquals("KR", cells.get(0));
        assertEquals("이름, 쉼표", cells.get(1));
        assertEquals("줄\"바꿈", cells.get(2));
        assertEquals("여러\n줄 설명", cells.get(4));
        assertEquals("A", cells.get(5));
    }

    @Test
    void BOM_있어도_없어도_같은_헤더로_읽는다() {
        String withoutBom = HEADER_LINE + "\n";
        String withBom = "﻿" + HEADER_LINE + "\n";
        assertTrue(Rfc4180Csv.parse(withoutBom).rows().isEmpty());
        assertTrue(Rfc4180Csv.parse(withBom).rows().isEmpty());
    }

    @Test
    void 헤더가_20열_고정_순서와_다르면_레코드_1개만_오류로_담고_데이터_행은_읽지_않는다() {
        String text = "code,name\r\nKR,대한민국\r\n";
        Rfc4180Csv.ParsedCsv parsed = Rfc4180Csv.parse(text);
        assertEquals(1, parsed.rows().size());
        Rfc4180Csv.ParsedRow row = parsed.rows().get(0);
        assertEquals(1, row.lineNo());
        assertTrue(!row.ok());
        assertTrue(row.error().contains("헤더"));
    }

    @Test
    void 행별_열_수_불일치는_그_행만_오류이고_나머지_행은_계속_읽는다() {
        String text = HEADER_LINE + "\r\n"
                + "KR,대한민국\r\n" // 2열뿐 — 이 행만 오류
                + dataLine("US", "미국", "", "2") + "\r\n"; // 20열 정상
        Rfc4180Csv.ParsedCsv parsed = Rfc4180Csv.parse(text);
        assertEquals(2, parsed.rows().size());

        Rfc4180Csv.ParsedRow bad = parsed.rows().get(0);
        assertEquals(2, bad.lineNo());
        assertTrue(!bad.ok());
        assertTrue(bad.error().contains("열 수"));

        Rfc4180Csv.ParsedRow good = parsed.rows().get(1);
        assertEquals(3, good.lineNo());
        assertTrue(good.ok());
        assertEquals("US", good.cells().get(0));
    }

    @Test
    void 닫히지_않은_큰따옴표는_구조적_오류로_레코드_1개만_담는다() {
        Rfc4180Csv.ParsedCsv parsed = Rfc4180Csv.parse(HEADER_LINE + "\r\n\"닫히지 않음");
        assertEquals(1, parsed.rows().size());
        assertTrue(!parsed.rows().get(0).ok());
    }
}
