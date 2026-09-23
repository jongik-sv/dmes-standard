package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 해석기(04 「판정 참고 구현」 04:670-735, TSK-03-02 design §6.10). {@code sql/04-code-exists.sql} 과 같은
 * 규칙을 Java 로 옮겼다. 한 가지 다르다 — SQL 은 REGEX 를 코드값에 대조하지만, 이 해석기는 04:187 대로
 * {@code def_target} 칸에 대조한다(예제 데이터의 REGEX 는 BASE·CODE 하나뿐이라 결과가 같다).
 *
 * <p>BASE 는 특례 없이 행으로 해석한다(design D4). 카테고리 인자가 null·빈 문자열이면 BASE 로 본다(05:160).
 */
public final class DefaultCodeResolver implements CodeResolver {

    private static final String BASE = "BASE";
    private static final String RELEASED = "RELEASED";
    private static final String DEPRECATED = "DEPRECATED";
    private static final String REGEX = "REGEX";
    private static final String TABLE = "TABLE";

    private final CodeLookup codes;
    private final CodeEffLookup codeEff;
    private final Map<String, Pattern> patterns = new ConcurrentHashMap<>();

    public DefaultCodeResolver(CodeLookup codes, CodeEffLookup codeEff) {
        this.codes = Objects.requireNonNull(codes, "codes");
        this.codeEff = Objects.requireNonNull(codeEff, "codeEff");
    }

    @Override
    public Optional<BigDecimal> selectVersion(String maruCodeId, LocalDateTime baseDt) {
        return codes.code(maruCodeId).flatMap(rows -> selectVersion(rows, baseDt));
    }

    @Override
    public boolean isMember(String maruCodeId, String cateId, String code, LocalDateTime baseDt) {
        if (code == null) {
            return false;
        }
        Optional<CodeRows> rows = codes.code(maruCodeId);
        if (rows.isEmpty()) {
            return false;
        }
        Optional<BigDecimal> ver = selectVersion(rows.get(), baseDt);
        return ver.isPresent() && resolve(rows.get(), cate(cateId), ver.get()).contains(code);
    }

    @Override
    public Optional<String> attr(String maruCodeId, String cateId, String code, LocalDateTime baseDt, int attrNo) {
        if (!isMember(maruCodeId, cateId, code, baseDt)) {
            return Optional.empty();
        }
        CodeRows rows = codes.code(maruCodeId).orElseThrow();
        BigDecimal ver = selectVersion(rows, baseDt).orElseThrow();
        return validItems(rows, ver).stream()
                .filter(i -> i.code().equals(code))
                .findFirst()
                .map(i -> i.attrs().get(attrNo - 1));
    }

    @Override
    public List<CodeListEntry> codeList(String maruCodeId, String cateId, LocalDateTime baseDt) {
        Optional<CodeRows> rows = codes.code(maruCodeId);
        if (rows.isEmpty() || DEPRECATED.equals(rows.get().header().status())) {
            return List.of();
        }
        Optional<BigDecimal> ver = selectVersion(rows.get(), baseDt);
        if (ver.isEmpty()) {
            return List.of();
        }
        Set<String> members = resolve(rows.get(), cate(cateId), ver.get());
        return validItems(rows.get(), ver.get()).stream()
                .filter(i -> members.contains(i.code()))
                .sorted(Comparator.comparing(CodeItemRow::seq, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(CodeItemRow::code))
                .map(i -> new CodeListEntry(i.code(), i.name(), i.alterName(), i.seq()))
                .toList();
    }

    @Override
    public Set<String> effectiveCodes(String maruCodeId, BigDecimal ver, String cateId) {
        return codes.code(maruCodeId).map(rows -> compute(rows, cate(cateId), ver)).orElse(Set.of());
    }

    /** RELEASED 중 {@code applyFrom <= dt < applyTo}, 없으면 최초 RELEASED(버전 소급). CANCELLED·DRAFT 는 보지 않는다. */
    private static Optional<BigDecimal> selectVersion(CodeRows rows, LocalDateTime baseDt) {
        List<CodeVersionRow> released = rows.versions().stream().filter(v -> RELEASED.equals(v.status())).toList();
        return Segments.covering(released, CodeVersionRow::applyFrom, CodeVersionRow::applyTo, baseDt)
                .or(() -> released.stream().min(Comparator.comparing(CodeVersionRow::ver)))
                .map(CodeVersionRow::ver);
    }

    /** ① 사본의 미리 계산한 집합(빈 집합 = 소속 없음) ② 없으면 행으로 계산. */
    private Set<String> resolve(CodeRows rows, String cateId, BigDecimal ver) {
        return codeEff.codes(rows.header().maruCodeId(), ver, cateId).orElseGet(() -> compute(rows, cateId, ver));
    }

    /** 04 SQL 2-4단계. 결과는 V 에 유효한 코드의 부분집합이다. */
    private Set<String> compute(CodeRows rows, String cateId, BigDecimal ver) {
        List<CodeCateRow> defs = rows.categories().stream().filter(c -> c.cateId().equals(cateId)).toList();
        Optional<CodeCateRow> def = Segments.coveringOrEarliest(defs, CodeCateRow::fromVer, CodeCateRow::toVer, ver);
        if (def.isEmpty()) {
            return Set.of();
        }
        Map<String, CodeItemRow> valid = new LinkedHashMap<>();
        validItems(rows, ver).forEach(i -> valid.put(i.code(), i));
        Set<String> out = new LinkedHashSet<>();
        CodeCateRow c = def.get();
        if (REGEX.equals(c.defKind())) {
            Pattern pattern = patterns.computeIfAbsent(c.defExpr(), Pattern::compile);
            for (CodeItemRow item : valid.values()) {
                String target = target(item, c.defTarget());
                if (target != null && pattern.matcher(target).matches()) {
                    out.add(item.code());
                }
            }
        } else if (TABLE.equals(c.defKind())) {
            BigDecimal effVer = c.fromVer().max(ver);
            rows.cateItems().stream()
                    .filter(ci -> ci.cateId().equals(cateId))
                    .filter(ci -> ci.fromVer().compareTo(effVer) <= 0 && effVer.compareTo(ci.toVer()) < 0)
                    .map(CodeLookup.CodeCateItemRow::code)
                    .filter(valid::containsKey)
                    .forEach(out::add);
        }
        return out;
    }

    /** {@code from_ver <= V < to_ver} 인 코드 행. 코드는 늘 V 기준이다(소급하지 않는다). */
    private static List<CodeItemRow> validItems(CodeRows rows, BigDecimal ver) {
        return rows.items().stream()
                .filter(i -> i.fromVer().compareTo(ver) <= 0 && ver.compareTo(i.toVer()) < 0)
                .toList();
    }

    /** {@code def_target} 칸 값 — CODE(기본), LVL1-LVL5, ATTR01-ATTR10. */
    private static String target(CodeItemRow item, String defTarget) {
        if (defTarget == null || defTarget.equals("CODE")) {
            return item.code();
        }
        if (defTarget.startsWith("LVL")) {
            return item.lvl().get(Integer.parseInt(defTarget.substring(3)) - 1);
        }
        if (defTarget.startsWith("ATTR")) {
            return item.attrs().get(Integer.parseInt(defTarget.substring(4)) - 1);
        }
        throw new IllegalStateException("알 수 없는 def_target: " + defTarget);
    }

    private static String cate(String cateId) {
        return cateId == null || cateId.isEmpty() ? BASE : cateId;
    }
}
