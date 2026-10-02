import com.dongkuk.dmes.mdm.dma.naming.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

/** 컬럼 논리명을 현재 용어 사전으로 다시 분해해 새 TERM_IDS 를 TSV 로 낸다(DB 는 읽기만). */
public class Recompose {
    public static void main(String[] a) throws Exception {
        String db = a[0];
        List<TermEntry> terms = new ArrayList<>();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db + "?open_mode=1")) {
            try (ResultSet r = c.createStatement().executeQuery(
                    "select TERM_ID, TERM_NAME, SENSE_NO, DEFINITION, CONTEXT, ENG_NAME, ENG_ABBR, SYNONYMS, ALIASES from TB_MDM_TERM")) {
                while (r.next()) {
                    terms.add(new TermEntry(r.getLong(1), r.getString(2), r.getInt(3), r.getString(4), r.getString(5),
                            r.getString(6), r.getString(7), r.getString(8), r.getString(9)));
                }
            }
            ColumnNameComposer composer = new ColumnNameComposer(TermDictionary.of(terms));
            try (PrintWriter out = new PrintWriter(new OutputStreamWriter(new FileOutputStream(a[1]), StandardCharsets.UTF_8));
                 ResultSet r = c.createStatement().executeQuery("select COLUMN_ID, COLUMN_NAME, TERM_IDS from TB_MDM_COLUMN order by COLUMN_ID")) {
                while (r.next()) {
                    long id = r.getLong(1);
                    String name = r.getString(2);
                    Set<Long> old = new HashSet<>();
                    String oj = r.getString(3);
                    if (oj != null) for (String p : oj.replaceAll("[\\[\\]\\s]", "").split(",")) if (p.matches("\\d+")) old.add(Long.parseLong(p));
                    NameComposition comp = composer.forward(name);
                    List<String> ids = new ArrayList<>(), names = new ArrayList<>(), unknown = new ArrayList<>();
                    for (NameToken t : comp.tokens()) {
                        if (t.status() == TokenStatus.UNKNOWN || t.selected() == null) {
                            ids.add("null"); names.add("***"); unknown.add(t.surface());
                            continue;
                        }
                        TermEntry pick = t.selected();
                        for (TermCandidate cand : t.candidates()) {
                            if (old.contains(cand.term().termId())) { pick = cand.term(); break; }
                        }
                        ids.add(String.valueOf(pick.termId())); names.add(pick.termName());
                    }
                    out.println(id + "\t" + name + "\t" + (oj == null ? "" : oj) + "\t[" + String.join(",", ids) + "]\t"
                            + String.join(" + ", names) + "\t" + String.join("|", unknown));
                }
            }
        }
    }
}
