package com.dongkuk.dmes.mdm.batch.sapdict;

import com.dongkuk.dmes.mdm.batch.sapdict.SapCsv.Row;
import com.dongkuk.dmes.mdm.batch.sapdict.SapCsv.Table;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd01lDomain;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd03lField;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd04lElement;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd04tText;
import java.io.IOException;
import java.nio.charset.Charset;
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
 * 입력 디렉터리의 SE16 추출 CSV 네 개를 읽어 {@link SapDdicExtract} 로 만든다(TSK-04-05 design.md §4.1).
 * 필수 헤더·활성 행(I5)·구조 행 제외(I6)·키 중복·숫자 칸·한국어 행(I11)을 여기서 검사한다. 오류는 모두
 * {@link SapDictInputException} 이다(I4).
 */
public final class SapDdicReader {

    public static final String DD03L = "DD03L.csv";
    public static final String DD04L = "DD04L.csv";
    public static final String DD04T = "DD04T.csv";
    public static final String DD01L = "DD01L.csv";

    private static final List<String> DD03L_HEADERS = List.of("TABNAME", "FIELDNAME", "ROLLNAME");
    private static final List<String> DD04L_HEADERS = List.of("ROLLNAME", "DOMNAME", "DATATYPE", "LENG", "DECIMALS");
    private static final List<String> DD04T_HEADERS =
            List.of("ROLLNAME", "DDLANGUAGE", "DDTEXT", "SCRTEXT_S", "SCRTEXT_M", "SCRTEXT_L");
    private static final List<String> DD01L_HEADERS = List.of("DOMNAME", "DATATYPE", "LENG", "DECIMALS", "CONVEXIT");

    /** SAP 내부 언어 키 {@code 3} 과 ISO 표기 {@code KO}. */
    private static final Set<String> KOREAN_LANGUAGE_KEYS = Set.of("3", "KO");

    private SapDdicReader() {
    }

    public static SapDdicExtract read(Path dir, Charset charset) throws IOException {
        for (String name : List.of(DD03L, DD04L, DD04T, DD01L)) {
            if (!Files.isRegularFile(dir.resolve(name))) {
                throw new SapDictInputException("입력 파일 " + name + " 가 없다: " + dir.resolve(name));
            }
        }
        return new SapDdicExtract(
                readFields(load(dir, DD03L, DD03L_HEADERS, charset)),
                readElements(load(dir, DD04L, DD04L_HEADERS, charset)),
                readKoreanTexts(load(dir, DD04T, DD04T_HEADERS, charset)),
                readDomains(load(dir, DD01L, DD01L_HEADERS, charset)));
    }

    private static Table load(Path dir, String name, List<String> required, Charset charset) throws IOException {
        Table table = SapCsv.readTable(dir.resolve(name), charset);
        for (String header : required) {
            if (!table.hasHeader(header)) {
                throw new SapDictInputException(name + ": 필수 헤더 " + header
                        + " 가 없다(SE16 추출 시 라벨이 아니라 기술명 헤더를 켠다)");
            }
        }
        return table;
    }

    private static List<Dd03lField> readFields(Table table) {
        List<Dd03lField> fields = new ArrayList<>();
        Set<List<String>> keys = new HashSet<>();
        for (Row row : activeRows(table)) {
            String fieldname = value(row, "FIELDNAME");
            // .INCLUDE·.APPEND 는 필드가 아니다. 한 테이블에 여러 번 나오므로 키 검사 전에 버린다
            if (fieldname.startsWith(".")) {
                continue;
            }
            String tabname = value(row, "TABNAME");
            if (!keys.add(List.of(tabname, fieldname))) {
                throw duplicate(table, row, "(TABNAME, FIELDNAME) = (" + tabname + ", " + fieldname + ")");
            }
            fields.add(new Dd03lField(tabname, fieldname, value(row, "ROLLNAME")));
        }
        return fields;
    }

    private static Map<String, Dd04lElement> readElements(Table table) {
        Map<String, Dd04lElement> elements = new LinkedHashMap<>();
        for (Row row : activeRows(table)) {
            String rollname = value(row, "ROLLNAME");
            Dd04lElement element = new Dd04lElement(rollname, value(row, "DOMNAME"), value(row, "DATATYPE"),
                    number(table, row, "LENG"), number(table, row, "DECIMALS"));
            if (elements.putIfAbsent(rollname, element) != null) {
                throw duplicate(table, row, "ROLLNAME = " + rollname);
            }
        }
        return elements;
    }

    private static Map<String, Dd04tText> readKoreanTexts(Table table) {
        Map<String, Dd04tText> texts = new LinkedHashMap<>();
        for (Row row : activeRows(table)) {
            if (!KOREAN_LANGUAGE_KEYS.contains(value(row, "DDLANGUAGE").toUpperCase(Locale.ROOT))) {
                continue;
            }
            String rollname = value(row, "ROLLNAME");
            Dd04tText text = new Dd04tText(rollname, value(row, "DDTEXT"), value(row, "SCRTEXT_S"),
                    value(row, "SCRTEXT_M"), value(row, "SCRTEXT_L"));
            if (texts.putIfAbsent(rollname, text) != null) {
                throw duplicate(table, row, "한국어 행(DDLANGUAGE 3·KO)의 ROLLNAME = " + rollname);
            }
        }
        return texts;
    }

    private static Map<String, Dd01lDomain> readDomains(Table table) {
        Map<String, Dd01lDomain> domains = new LinkedHashMap<>();
        for (Row row : activeRows(table)) {
            String domname = value(row, "DOMNAME");
            Dd01lDomain domain = new Dd01lDomain(domname, value(row, "DATATYPE"),
                    number(table, row, "LENG"), number(table, row, "DECIMALS"), value(row, "CONVEXIT"));
            if (domains.putIfAbsent(domname, domain) != null) {
                throw duplicate(table, row, "DOMNAME = " + domname);
            }
        }
        return domains;
    }

    /** {@code AS4LOCAL} 칸이 있으면 활성({@code A}) 행만, 없으면 모든 행(I5). */
    private static List<Row> activeRows(Table table) {
        if (!table.hasHeader("AS4LOCAL")) {
            return table.rows();
        }
        return table.rows().stream().filter(row -> value(row, "AS4LOCAL").equals("A")).toList();
    }

    private static String value(Row row, String header) {
        return row.get(header).strip();
    }

    /** SAP NUMC 칸. 공백이면 0, 앞자리 0 은 그대로 읽고, 숫자가 아니면 입력 오류다. */
    private static int number(Table table, Row row, String header) {
        String value = value(row, header);
        if (value.isEmpty()) {
            return 0;
        }
        if (!value.matches("[0-9]{1,9}")) {
            throw new SapDictInputException(table.sourceName() + " " + row.recordNumber() + "번째 레코드: " + header
                    + " 가 숫자가 아니다: '" + value + "'");
        }
        return Integer.parseInt(value);
    }

    private static SapDictInputException duplicate(Table table, Row row, String key) {
        return new SapDictInputException(table.sourceName() + " " + row.recordNumber() + "번째 레코드: 활성 행 안에서 키가 중복된다 — "
                + key);
    }
}
