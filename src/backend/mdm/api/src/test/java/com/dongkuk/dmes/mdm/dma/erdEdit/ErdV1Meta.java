package com.dongkuk.dmes.mdm.dma.erdEdit;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;

/**
 * V1 기준선이 만든 표만 남기는 시험 도우미. 시험 PDB(TPL_EMPTY 복제)의 MDMAPUSER 에는 V6 ERD 표(FK 6개)도 있어서,
 * 연구 정답(FK 53개)과 맞추려면 V1 원문의 CREATE TABLE 이름으로 걸러야 한다(MdmBaselineConstraintsOraTest 와 같은 방식).
 */
final class ErdV1Meta {

    private static final Pattern CREATE_TABLE = Pattern.compile("CREATE\\s+TABLE\\s+(\\w+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern FOREIGN_KEY = Pattern.compile("FOREIGN\\s+KEY");

    private ErdV1Meta() {
    }

    /** 주석 줄을 뺀 V1 원문. */
    static String text() {
        try {
            return new ClassPathResource("db/migration/mdm/oracle/V1__baseline.sql").getContentAsString(StandardCharsets.UTF_8)
                    .lines().filter(l -> !l.stripLeading().startsWith("--")).collect(Collectors.joining("\n"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static Set<String> tables() {
        Set<String> out = new TreeSet<>();
        Matcher m = CREATE_TABLE.matcher(text());
        while (m.find()) out.add(m.group(1).toUpperCase(Locale.ROOT));
        if (out.size() < 39) throw new IllegalStateException("V1 에서 표 이름을 읽지 못했다: " + out.size());
        return out;
    }

    /** V1 원문의 FOREIGN KEY 수(연구 정답 53). */
    static long foreignKeyCount() {
        return FOREIGN_KEY.matcher(text()).results().count();
    }

    /** keep 에 든 표와 그 표끼리의 제약·인덱스만 남긴다. */
    static ErdDbMeta restrict(ErdDbMeta m, Set<String> keep) {
        return new ErdDbMeta(m.owner(),
                m.tables().stream().filter(t -> keep.contains(t.name())).toList(),
                m.constraints().stream()
                        .filter(c -> keep.contains(c.table()) && (c.refTable() == null || keep.contains(c.refTable())))
                        .toList(),
                m.indexes().stream().filter(i -> keep.contains(i.table())).toList());
    }
}
