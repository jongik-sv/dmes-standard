package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.service;

import java.util.ArrayList;
import java.util.List;

/**
 * RFC 4180 최소 CSV 파서 — 20 고정 컬럼(code,name,alter_name,seq,description,lvl1..lvl5,attr01..attr10) 헤더 검증까지
 * 한다(design.md B2). {@code batch.sapdict.SapCsv} 와 같은 문법(따옴표 이스케이프·CRLF/LF·인용부호 안 개행 허용)이지만
 * 배치 모듈에 기대지 않도록 독립 구현한다(배치·화면 경로 결합 방지, {@code SapDictNoWriteArchitectureTest} 등 배치 전용
 * ArchUnit 경계를 건드리지 않는다).
 *
 * <p>헤더(레코드 1)가 20 열 고정 순서와 다르면 전체를 구조적 오류로 본다({@link #parse} 결과가 그 레코드 하나만 담는다,
 * I7-1) — 헤더가 틀리면 어느 칸이 무엇인지 알 수 없어 데이터 행을 더 읽을 수 없다. 헤더가 맞으면 데이터 행은 하나씩
 * 검사해 열 수가 다른 행만 그 행의 오류로 담고 나머지는 계속 읽는다(줄 번호 뒤섞임 없음, I7).
 */
public final class Rfc4180Csv {

    /** 20 고정 컬럼, 이 순서 그대로(05 「CSV 형식」). */
    public static final List<String> HEADER = List.of(
            "code", "name", "alter_name", "seq", "description",
            "lvl1", "lvl2", "lvl3", "lvl4", "lvl5",
            "attr01", "attr02", "attr03", "attr04", "attr05", "attr06", "attr07", "attr08", "attr09", "attr10");

    private static final char BOM = '﻿';

    private Rfc4180Csv() {
    }

    /**
     * 레코드 하나 — {@code lineNo} 는 헤더를 1 로 센 레코드 번호(인용부호 안 개행이 있어도 레코드 단위로 센다,
     * {@code SapCsv.Row} 와 같은 규약). {@code error} 가 null 이 아니면 이 레코드만의 파싱 오류다({@link #ok()}).
     */
    public record ParsedRow(int lineNo, List<String> cells, String error) {
        public boolean ok() {
            return error == null;
        }
    }

    /** {@code rows} 는 헤더(레코드 1) 다음부터, 데이터 레코드 순서 그대로. */
    public record ParsedCsv(List<ParsedRow> rows) {
    }

    public static ParsedCsv parse(String text) {
        List<List<String>> records = splitRecords(text);
        if (records == null) {
            // 닫히지 않은 큰따옴표 — 레코드 경계를 신뢰할 수 없어 구조적 오류로 전체를 반려한다(헤더 불일치와 같은 취급).
            return new ParsedCsv(List.of(new ParsedRow(1, List.of(), "닫히지 않은 큰따옴표가 있습니다")));
        }
        if (records.isEmpty()) {
            return new ParsedCsv(List.of(new ParsedRow(1, List.of(), "빈 CSV 입니다 — 헤더가 없습니다")));
        }
        List<String> header = records.get(0);
        if (!HEADER.equals(header)) {
            return new ParsedCsv(List.of(new ParsedRow(1, header, "헤더가 " + String.join(",", HEADER)
                    + " 20열 고정 순서와 다릅니다: " + String.join(",", header))));
        }
        List<ParsedRow> rows = new ArrayList<>();
        for (int i = 1; i < records.size(); i++) {
            List<String> record = records.get(i);
            int lineNo = i + 1;
            String error = record.size() != HEADER.size()
                    ? "열 수(" + record.size() + ")가 20(고정 컬럼 수)과 다릅니다" : null;
            rows.add(new ParsedRow(lineNo, record, error));
        }
        return new ParsedCsv(rows);
    }

    /** null 이면 닫히지 않은 큰따옴표(구조적 오류). BOM 은 첫 글자에서만 건너뛴다. */
    private static List<List<String>> splitRecords(String text) {
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
            return null;
        }
        if (lineHasContent) {
            record.add(cell.toString());
            records.add(record);
        }
        return records;
    }
}
