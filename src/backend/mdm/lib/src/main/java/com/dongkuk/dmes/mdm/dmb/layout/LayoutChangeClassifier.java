package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.support.MdmTextLimits;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 이전 버전 스냅샷과 새 스냅샷의 변경 분류(TSK-05-03 design.md §6.6 — html 변경 분류 표 + D11, 불변 I17). 기준은 03:47 "전문 총 길이와
 * 기존 항목 오프셋이 변하지 않으면 이전 버전으로 파싱하는 상대 시스템이 깨지지 않아 순차 전환이 가능하다" 이다. 여분(FILLER)을 쪼개
 * 항목을 넣는 것·CONST 값·기본 속성만 바뀐 것은 순차, 상대 파서가 깨지는 변경(길이·순서·헤더 구성·형식·삽입·삭제·총 길이)은 동시다.
 */
public final class LayoutChangeClassifier {

    public static final String SEQUENTIAL = "SEQUENTIAL";
    public static final String SIMULTANEOUS = "SIMULTANEOUS";

    public enum Kind {
        INITIAL, FILLER_SPLIT, CONST_VALUE, META, ITEM_LENGTH, ITEM_ORDER, HEADER_STACK, FORMAT, ITEM_INSERT, ITEM_REMOVED, TOTAL_LENGTH;

        /** 상대 시스템의 기존 파서가 깨지는 변경 — 양측 동시 전환. */
        public boolean simultaneous() {
            return switch (this) {
                case ITEM_LENGTH, ITEM_ORDER, HEADER_STACK, FORMAT, ITEM_INSERT, ITEM_REMOVED, TOTAL_LENGTH -> true;
                default -> false;
            };
        }
    }

    /** @param switchMode 최초 등록이면 null */
    public record Change(String switchMode, List<Kind> kinds, String summary) {
    }

    /** 요약 조각을 잇는 {@code ", "} 의 UTF-8 바이트 수. */
    private static final int SEPARATOR_BYTES = 2;

    private LayoutChangeClassifier() {
    }

    /**
     * 변경 요약을 CHANGE_SUMMARY({@code VARCHAR2(4000 BYTE)}) 에 들어가게 맞춘다 — 넘으면 오류 없이 뒤 항목을 {@code …외 N건} 으로
     * 접는다(분류 결과·경고 문구는 그대로 두고 DB 에 쓰는 문자열만 줄인다). 항목은 {@code ", "} 로 이어 붙은 조각이며, 앞에 붙은 EAI 변경
     * 문구도 한 조각이다. 첫 조각 하나가 혼자 넘으면 그 조각을 글자 단위로 자른다.
     */
    public static String fitSummary(String summary) {
        if (!MdmTextLimits.overBytes(summary)) {
            return summary;
        }
        // 항목 안에 ", " 가 있으면 조각 수가 실제 항목 수와 달라 "…외 N건" 의 N 이 어긋날 수 있다(길이 상한은 그대로 지킨다)
        String[] parts = summary.split(", ");
        // 앞에서부터 접두 바이트를 누적하며 한 번 훑는다 — 들어가는 가장 긴 접두(keep 조각)를 기억한다
        int best = 0;
        int prefixBytes = 0;
        for (int keep = 1; keep < parts.length; keep++) {
            prefixBytes += MdmTextLimits.bytes(parts[keep - 1]) + (keep > 1 ? SEPARATOR_BYTES : 0);
            if (prefixBytes > MdmTextLimits.TEXT_BYTES_MAX) {
                break;
            }
            if (prefixBytes + MdmTextLimits.bytes(foldedSuffix(parts.length - keep)) <= MdmTextLimits.TEXT_BYTES_MAX) {
                best = keep;
            }
        }
        if (best > 0) {
            return String.join(", ", Arrays.copyOf(parts, best)) + foldedSuffix(parts.length - best);
        }
        String suffix = parts.length > 1 ? foldedSuffix(parts.length - 1) : "…";
        int budget = MdmTextLimits.TEXT_BYTES_MAX - MdmTextLimits.bytes(suffix);
        StringBuilder cut = new StringBuilder();
        int used = 0;
        for (int i = 0; i < parts[0].length(); ) {
            int cp = parts[0].codePointAt(i);
            String ch = new String(Character.toChars(cp));
            used += MdmTextLimits.bytes(ch);
            if (used > budget) {
                break;
            }
            cut.append(ch);
            i += ch.length();
        }
        return cut + suffix;
    }

    private static String foldedSuffix(int folded) {
        return " …외 " + folded + "건";
    }

    public static Change classify(MdmLayoutSnapshot prev, MdmLayoutSnapshot next, Function<String, String> displayName) {
        if (prev == null) {
            return new Change(null, List.of(Kind.INITIAL), "최초 등록");
        }
        Function<String, String> name = phys -> {
            String n = displayName == null || phys == null ? null : displayName.apply(phys);
            return n == null || n.isBlank() ? phys : n;
        };
        Map<Kind, List<String>> found = new EnumMap<>(Kind.class);
        // 2. 기본 속성·인코딩
        if (!Objects.equals(prev.layoutName(), next.layoutName()) || !Objects.equals(prev.sndSystem(), next.sndSystem())
                || !Objects.equals(prev.rcvSystem(), next.rcvSystem()) || !Objects.equals(prev.eaiCode(), next.eaiCode())
                || !Objects.equals(prev.padRule(), next.padRule())) {
            add(found, Kind.META, "기본 속성 변경");
        }
        if (!Objects.equals(prev.encoding(), next.encoding())) {
            add(found, Kind.FORMAT, "인코딩 " + prev.encoding() + " → " + next.encoding());
        }
        // 3. 헤더 구성
        headers(prev.headers(), next.headers(), found, name);
        // 4·5. 본문
        body(prev.items(), next.items(), found, name);
        // 6. 총 길이
        if (prev.totalLength() != next.totalLength()) {
            add(found, Kind.TOTAL_LENGTH, "총 길이 " + prev.totalLength() + " → " + next.totalLength());
        }
        if (found.isEmpty()) {
            add(found, Kind.META, "기본 속성 변경"); // 7. 방어 — 호출자는 같은 스냅샷이면 버전을 만들지 않는다
        }
        List<Kind> kinds = List.copyOf(found.keySet());
        String mode = kinds.stream().anyMatch(Kind::simultaneous) ? SIMULTANEOUS : SEQUENTIAL;
        String summary = found.values().stream().flatMap(List::stream).collect(Collectors.joining(", "));
        return new Change(mode, kinds, summary);
    }

    private static void add(Map<Kind, List<String>> found, Kind kind, String part) {
        List<String> parts = found.computeIfAbsent(kind, k -> new ArrayList<>());
        if (!parts.contains(part)) {
            parts.add(part);
        }
    }

    private static void headers(List<MdmLayoutHeaderRef> a, List<MdmLayoutHeaderRef> b, Map<Kind, List<String>> found,
                                Function<String, String> name) {
        List<MdmLayoutHeaderRef> pa = sortedHeaders(a);
        List<MdmLayoutHeaderRef> pb = sortedHeaders(b);
        boolean stack = pa.size() != pb.size();
        for (int i = 0; !stack && i < pa.size(); i++) {
            MdmLayoutHeaderRef x = pa.get(i);
            MdmLayoutHeaderRef y = pb.get(i);
            stack = x.headerLayoutId() != y.headerLayoutId() || x.totalLength() != y.totalLength() || x.offset() != y.offset()
                    || !structure(x.items()).equals(structure(y.items()));
        }
        if (stack) {
            add(found, Kind.HEADER_STACK, "헤더 구성 변경");
            return;
        }
        for (int i = 0; i < pa.size(); i++) {
            List<MdmLayoutItemSnapshot> xs = pa.get(i).items();
            List<MdmLayoutItemSnapshot> ys = pb.get(i).items();
            for (int j = 0; j < xs.size(); j++) {
                MdmLayoutItemSnapshot x = xs.get(j);
                MdmLayoutItemSnapshot y = ys.get(j);
                if (x.fillKind() == MdmFillKind.CONST && !Objects.equals(effective(x), effective(y))) {
                    add(found, Kind.CONST_VALUE, "상수 " + name.apply(x.columnPhys()) + " " + effective(x) + " → " + effective(y));
                }
            }
        }
    }

    private static List<MdmLayoutHeaderRef> sortedHeaders(List<MdmLayoutHeaderRef> h) {
        return (h == null ? List.<MdmLayoutHeaderRef>of() : h).stream().sorted(Comparator.comparingInt(MdmLayoutHeaderRef::seq)).toList();
    }

    /** 헤더 항목 구조 — 상수 값만 빼고 비교한다(AUTO 종류는 구조다). */
    private static List<List<Object>> structure(List<MdmLayoutItemSnapshot> items) {
        List<List<Object>> out = new ArrayList<>();
        for (MdmLayoutItemSnapshot i : items) {
            out.add(java.util.Arrays.asList(i.seq(), i.fillKind(), i.columnPhys(), i.offset(), i.length(), i.dataType(), i.numFormat(),
                    i.transUnit(), i.unitItem(), i.unitCode(), i.scale(), i.fillKind() == MdmFillKind.AUTO ? i.defaultValue() : null));
        }
        return out;
    }

    private static String effective(MdmLayoutItemSnapshot i) {
        return i.overrideValue() != null && !i.overrideValue().isBlank() ? i.overrideValue() : i.defaultValue();
    }

    private static void body(List<MdmLayoutItemSnapshot> a, List<MdmLayoutItemSnapshot> b, Map<Kind, List<String>> found,
                             Function<String, String> name) {
        List<MdmLayoutItemSnapshot> pa = sortedItems(a);
        List<MdmLayoutItemSnapshot> pb = sortedItems(b);
        Map<String, MdmLayoutItemSnapshot> before = byPhys(pa);
        Map<String, MdmLayoutItemSnapshot> after = byPhys(pb);
        List<String> common = new ArrayList<>();
        List<String> shifted = new ArrayList<>();
        for (MdmLayoutItemSnapshot x : before.values()) {
            MdmLayoutItemSnapshot y = after.get(x.columnPhys());
            String n = name.apply(x.columnPhys());
            if (y == null) {
                add(found, Kind.ITEM_REMOVED, n + " 삭제");
                continue;
            }
            common.add(x.columnPhys());
            if (x.length() != y.length()) {
                add(found, Kind.ITEM_LENGTH, n + " 길이 " + x.length() + " → " + y.length());
            } else if (x.offset() != y.offset()) {
                shifted.add(x.columnPhys());
            }
            if (x.fillKind() != y.fillKind() || x.dataType() != y.dataType() || !Objects.equals(x.numFormat(), y.numFormat())
                    || !Objects.equals(x.transUnit(), y.transUnit()) || !Objects.equals(x.unitItem(), y.unitItem())
                    || !Objects.equals(x.unitCode(), y.unitCode()) || !Objects.equals(x.scale(), y.scale())
                    || x.fillKind() == MdmFillKind.AUTO && !Objects.equals(x.defaultValue(), y.defaultValue())) {
                add(found, Kind.FORMAT, n + " 형식 변경");
            } else if (x.fillKind() == MdmFillKind.CONST && !Objects.equals(x.defaultValue(), y.defaultValue())) {
                add(found, Kind.CONST_VALUE, "상수 " + n + " " + x.defaultValue() + " → " + y.defaultValue());
            }
        }
        // 공통 컬럼의 상대 순서
        List<String> orderAfter = after.keySet().stream().filter(common::contains).toList();
        if (!common.equals(orderAfter)) {
            add(found, Kind.ITEM_ORDER, "항목 순서 변경");
        }
        // 5. 새 항목 — 이전 여분 구간 안이면 여분 쪼개 쓰기, 아니면 삽입
        List<MdmLayoutItemSnapshot> fillers = pa.stream().filter(i -> i.fillKind() == MdmFillKind.FILLER).toList();
        Map<MdmLayoutItemSnapshot, Boolean> split = new LinkedHashMap<>();
        for (MdmLayoutItemSnapshot y : after.values()) {
            if (before.containsKey(y.columnPhys())) {
                continue;
            }
            MdmLayoutItemSnapshot hole = fillers.stream()
                    .filter(f -> y.offset() >= f.offset() && y.offset() + y.length() <= f.offset() + f.length()).findFirst().orElse(null);
            if (hole == null) {
                add(found, Kind.ITEM_INSERT, name.apply(y.columnPhys()) + " 추가");
            } else {
                split.put(hole, true);
            }
        }
        for (MdmLayoutItemSnapshot f : split.keySet()) {
            String pieces = pb.stream().filter(i -> i.offset() >= f.offset() && i.offset() + i.length() <= f.offset() + f.length())
                    .map(i -> i.fillKind() == MdmFillKind.FILLER ? "여분 " + i.length() : name.apply(i.columnPhys()) + " " + i.length())
                    .collect(Collectors.joining(" + "));
            add(found, Kind.FILLER_SPLIT, "여분 " + f.length() + " → " + pieces + " (여분 쪼개 쓰기)");
        }
        // 길이는 같고 절대 오프셋만 움직였는데 다른 종류가 설명하지 못하면 순서 변경
        if (!shifted.isEmpty() && !found.containsKey(Kind.ITEM_LENGTH) && !found.containsKey(Kind.ITEM_ORDER)
                && !found.containsKey(Kind.HEADER_STACK) && !found.containsKey(Kind.ITEM_INSERT) && !found.containsKey(Kind.ITEM_REMOVED)) {
            add(found, Kind.ITEM_ORDER, "항목 순서 변경");
        }
    }

    private static List<MdmLayoutItemSnapshot> sortedItems(List<MdmLayoutItemSnapshot> items) {
        return (items == null ? List.<MdmLayoutItemSnapshot>of() : items).stream()
                .sorted(Comparator.comparingInt(MdmLayoutItemSnapshot::offset)).toList();
    }

    /** FILLER 가 아닌 항목, 오프셋 순. */
    private static Map<String, MdmLayoutItemSnapshot> byPhys(List<MdmLayoutItemSnapshot> items) {
        Map<String, MdmLayoutItemSnapshot> out = new LinkedHashMap<>();
        for (MdmLayoutItemSnapshot i : items) {
            if (i.fillKind() != MdmFillKind.FILLER && i.columnPhys() != null) {
                out.put(i.columnPhys(), i);
            }
        }
        return out;
    }
}
