package com.dongkuk.dmes.mdm.batch.sapdict;

import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.ColumnCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.ColumnSystemCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.DomainCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.TermCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedField;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 후보 목록 → 다섯 CSV 파일(TSK-04-05 design.md §4.3, 불변 규칙 I3·I17). {@link #render} 가 바이트를 모두 만든 뒤에만
 * {@link #write} 가 {@code --out} 디렉터리에 다섯 이름을 쓴다 — 그 밖의 파일은 건드리지 않는다.
 */
public final class SapDictCandidateWriter {

    public static final String TERMS = "term-candidates.csv";
    public static final String DOMAINS = "domain-candidates.csv";
    public static final String COLUMNS = "column-candidates.csv";
    public static final String COLUMN_SYSTEMS = "column-system-candidates.csv";
    public static final String UNMATCHED = "unmatched-fields.csv";

    private static final String MULTI_VALUE_SEPARATOR = ";";

    private SapDictCandidateWriter() {
    }

    /** 파일 이름 → CSV 바이트. 순서는 02 의 등록 순서(용어 → 도메인 → 컬럼 → 컬럼 시스템) 다음 미대응이다. */
    public static Map<String, byte[]> render(SapDictCandidates candidates) {
        Map<String, byte[]> files = new LinkedHashMap<>();
        files.put(TERMS, csv(List.of("term_name", "column_count", "sample_rollnames"), candidates.terms(),
                (TermCandidate t) -> List.of(t.termName(), String.valueOf(t.columnCount()), join(t.sampleRollnames()))));
        files.put(DOMAINS, csv(List.of("domain_key", "data_type", "length", "scale", "kind_hint", "element_count",
                        "sap_domains", "sample_rollnames"), candidates.domains(),
                (DomainCandidate d) -> List.of(d.domainKey(), d.dataType().name(), number(d.length()), number(d.scale()),
                        d.kindHint() == null ? "" : d.kindHint().name(), String.valueOf(d.elementCount()),
                        join(d.sapDomains()), join(d.sampleRollnames()))));
        files.put(COLUMNS, csv(List.of("rollname", "column_name", "term_names", "domain_key", "sap_scrtext_l",
                        "sap_scrtext_m", "sap_scrtext_s", "sap_ddtext", "field_names"), candidates.columns(),
                (ColumnCandidate c) -> List.of(c.rollname(), c.columnName(), join(c.termNames()), c.domainKey(),
                        c.sapScrtextL(), c.sapScrtextM(), c.sapScrtextS(), c.sapDdtext(), join(c.fieldNames()))));
        files.put(COLUMN_SYSTEMS, csv(List.of("system_code", "phys_name", "rollname", "transform", "note", "tables"),
                candidates.columnSystems(),
                (ColumnSystemCandidate s) -> List.of(s.systemCode(), s.physName(), s.rollname(), s.transform(), s.note(),
                        join(s.tables()))));
        files.put(UNMATCHED, csv(List.of("tabname", "fieldname", "rollname", "reasons", "detail"), candidates.unmatched(),
                (UnmatchedField u) -> List.of(u.tabname(), u.fieldname(), u.rollname(),
                        join(u.reasons().stream().map(UnmatchedReason::name).toList()), u.detail())));
        return files;
    }

    /** {@code outDir} 가 없으면 만들고, 다섯 이름만 쓴다(같은 이름은 덮어쓴다). */
    public static void write(Map<String, byte[]> files, Path outDir) throws IOException {
        Files.createDirectories(outDir);
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            Files.write(outDir.resolve(file.getKey()), file.getValue());
        }
    }

    private static <T> byte[] csv(List<String> header, List<T> items, Function<T, List<String>> toRow) {
        List<List<String>> rows = new ArrayList<>();
        rows.add(header);
        items.forEach(item -> rows.add(toRow.apply(item)));
        return SapCsv.toBytes(rows);
    }

    private static String join(List<String> values) {
        return String.join(MULTI_VALUE_SEPARATOR, values);
    }

    private static String number(Integer value) {
        return value == null ? "" : value.toString();
    }
}
