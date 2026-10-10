package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 클래스패스 erd/hints/&lt;module&gt;.json 을 읽는다(단계 1 S6). 배포 서버에는 docs·소스가 없어서 scripts/erd/erd-hints.mjs 가 만든 파일을 커밋해 둔다.
 * 파일이 없으면 그 근거만 빠진다(빈 값). 형식이 틀리면 조용히 넘기지 않고 실패한다(낡은 생성기를 알아채게).
 * 파일 모양은 child·parent 를 객체로 감싸고 ErdHints.Ref 는 평평하므로, record 에 바로 묶지 않고 노드를 읽어 옮긴다.
 */
@Component
public class ErdHintsLoader {

    private static final Pattern MODULE = Pattern.compile("^[a-z0-9][a-z0-9-]{0,19}$");
    private static final Set<String> KINDS = Set.of("DOC", "SQL_JOIN");

    public ErdHints load(String module) {
        String m = module == null ? "" : module.trim().toLowerCase(Locale.ROOT);
        if (!MODULE.matcher(m).matches()) throw new IllegalArgumentException("모듈 이름이 올바르지 않습니다: " + module);
        ClassPathResource res = new ClassPathResource("erd/hints/" + m + ".json");
        if (!res.exists()) return ErdHints.EMPTY;
        try (InputStream in = res.getInputStream()) {
            return parse(ErdModelCodec.MAPPER.readTree(in), res.getPath());
        } catch (IOException e) {
            throw bad(res.getPath(), "JSON 을 읽을 수 없습니다: " + e.getMessage());
        }
    }

    static ErdHints parse(JsonNode root, String where) {
        JsonNode refs = root == null ? null : root.get("refs");
        if (refs == null || !refs.isArray()) throw bad(where, "refs 배열이 없습니다");
        List<ErdHints.Ref> out = new ArrayList<>();
        for (int i = 0; i < refs.size(); i++) {
            JsonNode r = refs.get(i);
            String kind = r.path("kind").asText("");
            if (!KINDS.contains(kind)) throw bad(where, "refs[" + i + "].kind 는 DOC·SQL_JOIN 중 하나여야 합니다: " + kind);
            out.add(new ErdHints.Ref(kind,
                    name(r.path("child").path("table"), where, i, "child.table"),
                    names(r.path("child").path("columns"), where, i, "child.columns"),
                    name(r.path("parent").path("table"), where, i, "parent.table"),
                    names(r.path("parent").path("columns"), where, i, "parent.columns"),
                    r.path("ref").asText("")));
        }
        return new ErdHints(out);
    }

    private static String name(JsonNode n, String where, int i, String field) {
        String v = n.asText("").trim().toUpperCase(Locale.ROOT);
        if (v.isEmpty()) throw bad(where, "refs[" + i + "]." + field + " 가 비었습니다");
        return v;
    }

    private static List<String> names(JsonNode arr, String where, int i, String field) {
        if (!arr.isArray() || arr.isEmpty()) throw bad(where, "refs[" + i + "]." + field + " 는 비지 않은 배열이어야 합니다");
        List<String> out = new ArrayList<>();
        for (JsonNode c : arr) out.add(name(c, where, i, field));
        return out;
    }

    private static IllegalStateException bad(String where, String why) {
        return new IllegalStateException("근거 파일 " + where + " 이 올바르지 않습니다: " + why
                + ". scripts/erd/erd-hints.mjs 로 다시 만드세요");
    }
}
