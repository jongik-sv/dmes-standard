package com.dongkuk.dmes.mdm.batch.sapdict;

import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd01lDomain;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd03lField;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd04lElement;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd04tText;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.ColumnCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.ColumnSystemCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.DomainCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.TermCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedField;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason;
import com.dongkuk.dmes.mdm.batch.sapdict.SapTypeMapping.ValueDefinition;
import com.dongkuk.dmes.mdm.contract.common.MdmSystemCodes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.SortedSet;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * SAP DDIC 추출 → 후보 목록의 순수 변환(TSK-04-05 design.md §4.2). 파일 I/O 가 없고 같은 입력이면 같은 결과다(I18).
 * 정렬은 모두 {@link String#compareTo} 기준이다.
 */
public final class SapDictCandidateExtractor {

    /** 용어 분해 구분자: 공백·괄호·슬래시·쉼표·가운뎃점(I12). */
    private static final Pattern TERM_SEPARATOR = Pattern.compile("[\\s()\\[\\]{}/,\u00B7]+");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final int SAMPLE_LIMIT = 5;
    private static final String NO_ROLLNAME = "(없음)";

    private SapDictCandidateExtractor() {
    }

    /** 엘리먼트 단위 판정 결과. {@code reasons} 가 비어 있으면 적격 엘리먼트다. */
    private record ElementVerdict(List<UnmatchedReason> reasons, String effectiveDatatype, ValueDefinition definition,
            String columnName) {
    }

    public static SapDictCandidates extract(SapDdicExtract in) {
        // 대상 행 = 구조 행(.INCLUDE·.APPEND)이 아닌 DD03L 행(I6)
        List<Dd03lField> targets = in.fields().stream().filter(f -> !f.fieldname().startsWith(".")).toList();

        Map<String, ElementVerdict> verdicts = new TreeMap<>();
        Map<String, List<Dd03lField>> rowsByField = new TreeMap<>();
        for (Dd03lField field : targets) {
            verdicts.computeIfAbsent(field.rollname(), rollname -> judge(rollname, in));
            rowsByField.computeIfAbsent(field.fieldname(), k -> new ArrayList<>()).add(field);
        }

        List<ColumnSystemCandidate> columnSystems = new ArrayList<>();
        List<UnmatchedField> unmatched = new ArrayList<>();
        for (Map.Entry<String, List<Dd03lField>> entry : rowsByField.entrySet()) {
            List<Dd03lField> rows = entry.getValue();
            SortedSet<String> rollnames = new TreeSet<>(rows.stream().map(Dd03lField::rollname).toList());
            // 공백 ROLLNAME 도 하나의 값으로 센다. 테이블과 무관하게 필드명 전체에서 판정한다(I14)
            boolean conflict = rollnames.size() > 1;
            if (!conflict && verdicts.get(rollnames.first()).reasons().isEmpty()) {
                columnSystems.add(columnSystem(entry.getKey(), rollnames.first(), rows, in));
                continue;
            }
            for (Dd03lField row : rows) {
                unmatched.add(unmatchedRow(row, verdicts.get(row.rollname()), conflict ? rollnames : null));
            }
        }
        unmatched.sort(Comparator.comparing(UnmatchedField::tabname).thenComparing(UnmatchedField::fieldname));

        List<ColumnCandidate> columns = new ArrayList<>();
        for (Map.Entry<String, ElementVerdict> entry : verdicts.entrySet()) {
            if (entry.getValue().reasons().isEmpty()) {
                columns.add(column(entry.getKey(), entry.getValue(), targets, in));
            }
        }

        return new SapDictCandidates(terms(columns), domains(columns, verdicts, in), columns, columnSystems, unmatched);
    }

    /** 엘리먼트 단위 판정(I16): 엘리먼트 없음 → 미존재 → 타입 → 한국어 라벨. 앞의 둘은 뒤를 보지 않는다. */
    private static ElementVerdict judge(String rollname, SapDdicExtract in) {
        if (rollname.isEmpty()) {
            return new ElementVerdict(List.of(UnmatchedReason.NO_DATA_ELEMENT), "", null, null);
        }
        Dd04lElement element = in.elements().get(rollname);
        if (element == null) {
            return new ElementVerdict(List.of(UnmatchedReason.DATA_ELEMENT_NOT_FOUND), "", null, null);
        }
        List<UnmatchedReason> reasons = new ArrayList<>();
        // 유효 타입(I9): 도메인이 DD01L 에 있으면 DD01L, 아니면 DD04L 자체 칸
        Dd01lDomain domain = domainOf(element, in);
        String datatype = domain != null ? domain.datatype() : element.datatype();
        Optional<ValueDefinition> definition = domain != null
                ? SapTypeMapping.map(domain.datatype(), domain.leng(), domain.decimals())
                : SapTypeMapping.map(element.datatype(), element.leng(), element.decimals());
        if (definition.isEmpty()) {
            reasons.add(UnmatchedReason.UNSUPPORTED_TYPE);
        }
        String columnName = koreanLabel(in.koreanTexts().get(rollname));
        if (columnName == null) {
            reasons.add(UnmatchedReason.NO_KOREAN_LABEL);
        }
        return new ElementVerdict(List.copyOf(reasons), datatype.strip(), definition.orElse(null), columnName);
    }

    private static Dd01lDomain domainOf(Dd04lElement element, SapDdicExtract in) {
        String domname = element.domname().strip();
        return domname.isEmpty() ? null : in.domains().get(domname);
    }

    /** SCRTEXT_L → DDTEXT → SCRTEXT_M → SCRTEXT_S 중 한글 음절이 든 첫 값을 공백 정규화한 것. 없으면 null(I11). */
    private static String koreanLabel(Dd04tText text) {
        if (text == null) {
            return null;
        }
        for (String label : List.of(text.scrtextL(), text.ddtext(), text.scrtextM(), text.scrtextS())) {
            if (label.chars().anyMatch(c -> c >= '\uAC00' && c <= '\uD7A3')) {
                return WHITESPACE.matcher(label.strip()).replaceAll(" ");
            }
        }
        return null;
    }

    private static List<String> termTokens(String columnName) {
        return Arrays.stream(TERM_SEPARATOR.split(columnName)).filter(t -> !t.isEmpty()).toList();
    }

    private static ColumnSystemCandidate columnSystem(String fieldname, String rollname, List<Dd03lField> rows,
            SapDdicExtract in) {
        Dd04lElement element = in.elements().get(rollname);
        Dd01lDomain domain = domainOf(element, in);
        String domname = element.domname().strip();
        String transform = domain == null ? "" : domain.convexit().strip();
        String note = domname.isEmpty() ? "DE=" + rollname : "DE=" + rollname + "; DOMAIN=" + domname;
        List<String> tables = List.copyOf(new TreeSet<>(rows.stream().map(Dd03lField::tabname).toList()));
        return new ColumnSystemCandidate(MdmSystemCodes.ERP, fieldname, rollname, transform, note, tables);
    }

    /** {@code conflictRollnames} 가 null 이 아니면 필드명 충돌이다. */
    private static UnmatchedField unmatchedRow(Dd03lField row, ElementVerdict verdict, SortedSet<String> conflictRollnames) {
        List<UnmatchedReason> reasons = new ArrayList<>(verdict.reasons());
        List<String> details = new ArrayList<>();
        if (reasons.contains(UnmatchedReason.UNSUPPORTED_TYPE)) {
            details.add("DATATYPE=" + verdict.effectiveDatatype());
        }
        if (conflictRollnames != null) {
            reasons.add(UnmatchedReason.FIELD_NAME_CONFLICT);
            details.add("ROLLNAMES=" + String.join(";",
                    conflictRollnames.stream().map(r -> r.isEmpty() ? NO_ROLLNAME : r).toList()));
        }
        reasons.sort(Comparator.naturalOrder());
        return new UnmatchedField(row.tabname(), row.fieldname(), row.rollname(), List.copyOf(reasons),
                String.join(" | ", details));
    }

    private static ColumnCandidate column(String rollname, ElementVerdict verdict, List<Dd03lField> targets,
            SapDdicExtract in) {
        Dd04tText text = in.koreanTexts().get(rollname);
        List<String> fieldNames = List.copyOf(new TreeSet<>(targets.stream()
                .filter(f -> f.rollname().equals(rollname)).map(Dd03lField::fieldname).toList()));
        return new ColumnCandidate(rollname, verdict.columnName(), termTokens(verdict.columnName()),
                verdict.definition().domainKey(), text.scrtextL().strip(), text.scrtextM().strip(),
                text.scrtextS().strip(), text.ddtext().strip(), fieldNames);
    }

    private static List<TermCandidate> terms(List<ColumnCandidate> columns) {
        Map<String, SortedSet<String>> rollnamesByTerm = new TreeMap<>();
        for (ColumnCandidate column : columns) {
            // 한 컬럼명 안에 두 번 나와도 그 컬럼은 한 번만 센다
            for (String term : new LinkedHashSet<>(column.termNames())) {
                rollnamesByTerm.computeIfAbsent(term, k -> new TreeSet<>()).add(column.rollname());
            }
        }
        return rollnamesByTerm.entrySet().stream()
                .map(e -> new TermCandidate(e.getKey(), e.getValue().size(), sample(e.getValue())))
                .toList();
    }

    private static List<DomainCandidate> domains(List<ColumnCandidate> columns, Map<String, ElementVerdict> verdicts,
            SapDdicExtract in) {
        Map<String, List<ColumnCandidate>> byKey = new TreeMap<>();
        for (ColumnCandidate column : columns) {
            byKey.computeIfAbsent(column.domainKey(), k -> new ArrayList<>()).add(column);
        }
        List<DomainCandidate> domains = new ArrayList<>();
        for (Map.Entry<String, List<ColumnCandidate>> entry : byKey.entrySet()) {
            List<ColumnCandidate> members = entry.getValue();
            ValueDefinition definition = verdicts.get(members.get(0).rollname()).definition();
            SortedSet<String> sapDomains = new TreeSet<>();
            SortedSet<String> rollnames = new TreeSet<>();
            for (ColumnCandidate member : members) {
                String domname = in.elements().get(member.rollname()).domname().strip();
                if (!domname.isEmpty()) {
                    sapDomains.add(domname);
                }
                rollnames.add(member.rollname());
            }
            domains.add(new DomainCandidate(entry.getKey(), definition.dataType(), definition.length(),
                    definition.scale(), definition.kindHint(), members.size(), List.copyOf(sapDomains), sample(rollnames)));
        }
        return domains;
    }

    private static List<String> sample(SortedSet<String> sorted) {
        return sorted.stream().limit(SAMPLE_LIMIT).toList();
    }
}
