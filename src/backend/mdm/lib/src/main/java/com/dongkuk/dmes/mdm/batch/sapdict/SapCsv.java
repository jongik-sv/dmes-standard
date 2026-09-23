package com.dongkuk.dmes.mdm.batch.sapdict;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * RFC 4180 CSV 읽기·쓰기(TSK-04-05 design.md §4.1·§4.3). 저장소에 CSV 라이브러리가 없어(F22) 최소 구현을 둔다.
 * 읽기는 UTF-8 BOM·CRLF·LF 를 받고 완전히 빈 줄을 건너뛴다. 쓰기는 UTF-8 BOM + CRLF 이고 쉼표·큰따옴표·줄바꿈이 든
 * 값만 인용한다(I17).
 */
public final class SapCsv {

    private static final char BOM = '﻿';
    private static final byte[] UTF8_BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

    private SapCsv() {
    }

    /** 헤더 이름을 대문자로 맞춘 표. {@code rows} 의 각 행은 헤더 칸 수만큼 값을 갖는다(모자란 칸은 빈 문자열). */
    public record Table(String sourceName, List<String> headers, List<Row> rows) {

        public boolean hasHeader(String header) {
            return headers.contains(header);
        }
    }

    /** {@code recordNumber} 는 헤더를 1로 센 레코드 번호다(인용 칸 안의 줄바꿈은 레코드를 나누지 않는다). */
    public record Row(int recordNumber, Map<String, String> values) {

        public String get(String header) {
            return values.getOrDefault(header, "");
        }
    }

    /** 원시 레코드 목록. 값은 손대지 않는다. */
    public static List<List<String>> parse(String text) {
        return parse("CSV", text);
    }

    public static Table readTable(Path file, Charset charset) throws IOException {
        String name = file.getFileName().toString();
        String text;
        try {
            text = Files.readString(file, charset);
        } catch (CharacterCodingException e) {
            throw new SapDictInputException(name + ": " + charset.name() + " 로 읽을 수 없다 — --charset 을 확인한다");
        }
        return parseTable(name, text);
    }

    public static Table parseTable(String sourceName, String text) {
        List<List<String>> records = parse(sourceName, text);
        if (records.isEmpty()) {
            throw new SapDictInputException(sourceName + ": 헤더 행이 없다");
        }
        List<String> headers = records.get(0).stream().map(h -> h.strip().toUpperCase(Locale.ROOT)).toList();
        Set<String> seen = new HashSet<>();
        for (String header : headers) {
            if (!seen.add(header)) {
                throw new SapDictInputException(sourceName + ": 헤더 " + header + " 가 두 번 나온다");
            }
        }
        List<Row> rows = new ArrayList<>();
        for (int k = 1; k < records.size(); k++) {
            List<String> record = records.get(k);
            int recordNumber = k + 1;
            if (record.size() > headers.size()) {
                throw new SapDictInputException(sourceName + " " + recordNumber + "번째 레코드: 칸 수(" + record.size()
                        + ")가 헤더 칸 수(" + headers.size() + ")보다 많다");
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (int c = 0; c < headers.size(); c++) {
                values.put(headers.get(c), c < record.size() ? record.get(c) : "");
            }
            rows.add(new Row(recordNumber, values));
        }
        return new Table(sourceName, headers, List.copyOf(rows));
    }

    /** 첫 행을 헤더로 포함한 행 목록을 UTF-8 BOM + CRLF CSV 바이트로 만든다. */
    public static byte[] toBytes(List<List<String>> rows) {
        StringBuilder text = new StringBuilder();
        for (List<String> row : rows) {
            for (int c = 0; c < row.size(); c++) {
                if (c > 0) {
                    text.append(',');
                }
                text.append(quote(row.get(c)));
            }
            text.append("\r\n");
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        bytes.writeBytes(UTF8_BOM);
        bytes.writeBytes(text.toString().getBytes(StandardCharsets.UTF_8));
        return bytes.toByteArray();
    }

    private static String quote(String value) {
        if (value.indexOf(',') < 0 && value.indexOf('"') < 0 && value.indexOf('\r') < 0 && value.indexOf('\n') < 0) {
            return value;
        }
        return '"' + value.replace("\"", "\"\"") + '"';
    }

    private static List<List<String>> parse(String sourceName, String text) {
        List<List<String>> records = new ArrayList<>();
        List<String> record = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;
        boolean cellStarted = false;
        boolean lineHasContent = false;
        int n = text.length();
        int i = !text.isEmpty() && text.charAt(0) == BOM ? 1 : 0;
        while (i < n) {
            char ch = text.charAt(i);
            if (inQuotes) {
                if (ch == '"' && i + 1 < n && text.charAt(i + 1) == '"') {
                    cell.append('"');
                    i += 2;
                } else if (ch == '"') {
                    inQuotes = false;
                    i++;
                } else {
                    cell.append(ch);
                    i++;
                }
                continue;
            }
            if (ch == '"' && !cellStarted) {
                inQuotes = true;
                cellStarted = true;
                lineHasContent = true;
                i++;
            } else if (ch == ',') {
                record.add(cell.toString());
                cell.setLength(0);
                cellStarted = false;
                lineHasContent = true;
                i++;
            } else if (ch == '\r' || ch == '\n') {
                i += ch == '\r' && i + 1 < n && text.charAt(i + 1) == '\n' ? 2 : 1;
                if (lineHasContent) {
                    record.add(cell.toString());
                    records.add(record);
                }
                record = new ArrayList<>();
                cell.setLength(0);
                cellStarted = false;
                lineHasContent = false;
            } else {
                cell.append(ch);
                cellStarted = true;
                lineHasContent = true;
                i++;
            }
        }
        if (inQuotes) {
            throw new SapDictInputException(sourceName + ": 닫히지 않은 큰따옴표가 있다");
        }
        if (lineHasContent) {
            record.add(cell.toString());
            records.add(record);
        }
        return records;
    }
}
