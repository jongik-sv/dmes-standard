package com.dongkuk.dmes.mdm.batch.sapdict;

import static com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason.DATA_ELEMENT_NOT_FOUND;
import static com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason.FIELD_NAME_CONFLICT;
import static com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason.NO_DATA_ELEMENT;
import static com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason.NO_KOREAN_LABEL;
import static com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason.UNSUPPORTED_TYPE;
import static java.util.Comparator.comparing;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd01lDomain;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd03lField;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd04lElement;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd04tText;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.ColumnCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.ColumnSystemCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.DomainCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.TermCandidate;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedField;
import com.dongkuk.dmes.mdm.contract.common.MdmSystemCodes;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDataType;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-05 design.md §3.4 — 순수 변환 {@link SapDictCandidateExtractor} 의 규칙별 집중 단언(§4.2, 불변 규칙
 * I6·I7·I9~I18). 픽스처는 파일 없이 {@link SapDdicExtract} 를 직접 조립한다. 메서드 이름은 설계 표와 같다 —
 * 변이 스윕 보고가 어느 규칙이 깨졌는지 이 이름으로 가리킨다.
 */
class SapDictCandidateExtractorTest {

    // ── I6 ─────────────────────────────────────────────────────────────────────────

    @Test
    void 구조_행은_어느_출력에도_나오지_않는다() {
        Fixture fx = new Fixture()
                .field("ZTPP_COIL", "ZZ_COIL_ID", "ZZDE_COIL_ID")
                .field("ZTPP_COIL", ".INCLUDE", "")
                .field("ZTPP_COIL", ".APPEND", "ZZDE_COIL_ID")
                .eligible("ZZDE_COIL_ID", "코일 아이디");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(), c.unmatched());
        assertEquals(List.of("ZZ_COIL_ID"), physNames(c));
        assertEquals(List.of("ZZ_COIL_ID"), column(c, "ZZDE_COIL_ID").fieldNames());
    }

    // ── I7 ─────────────────────────────────────────────────────────────────────────

    @Test
    void 대상_행은_컬럼_시스템_후보와_미대응_중_정확히_한_곳에_들어간다() {
        Fixture fx = new Fixture()
                .field("T1", "A", "E1").field("T2", "A", "E1")
                .field("T1", "B", "E2")
                .field("T1", "C", "K1").field("T2", "C", "K2")
                .field("T1", "D", "")
                .field("T1", "G", "GHOST")
                .field("T1", "H", "E_EN")
                .field("T1", ".INCLUDE", "")
                .eligible("E1", "가").eligible("E2", "나").eligible("K1", "다").eligible("K2", "라")
                .element("E_EN", "", "CHAR", 4, 0).ko("E_EN", "Eng", "Eng", "Eng", "Eng");

        SapDictCandidates c = fx.extract();

        List<Dd03lField> targets = fx.fields.stream().filter(f -> !f.fieldname().startsWith(".")).toList();
        Set<String> candidateNames = Set.copyOf(physNames(c));
        long inCandidates = targets.stream().filter(f -> candidateNames.contains(f.fieldname())).count();
        assertEquals(targets.size(), c.unmatched().size() + inCandidates, "분할 등식");

        Set<List<String>> unmatchedKeys = c.unmatched().stream()
                .map(u -> List.of(u.tabname(), u.fieldname())).collect(Collectors.toSet());
        assertEquals(c.unmatched().size(), unmatchedKeys.size(), "미대응 행은 (테이블, 필드) 하나에 한 행");
        for (Dd03lField f : targets) {
            boolean inCandidate = candidateNames.contains(f.fieldname());
            boolean inUnmatched = unmatchedKeys.contains(List.of(f.tabname(), f.fieldname()));
            assertTrue(inCandidate ^ inUnmatched, f + " 은 정확히 한 곳에 있어야 한다");
        }
        assertEquals(Set.of("A", "B"), candidateNames);
        assertEquals(Set.of(List.of("T1", "C"), List.of("T2", "C"), List.of("T1", "D"), List.of("T1", "G"),
                List.of("T1", "H")), unmatchedKeys);
    }

    // ── I9 ─────────────────────────────────────────────────────────────────────────

    @Test
    void 도메인이_DD01L_에_있으면_DD01L_타입을_쓴다() {
        Fixture fx = new Fixture()
                .field("T", "F", "ZZDE_X")
                .element("ZZDE_X", "ZZDO_X", "CHAR", 5, 0).ko("ZZDE_X", "두께")
                .domain("ZZDO_X", "DEC", 3, 1, "");

        assertEquals("NUMBER(3,1)", column(fx.extract(), "ZZDE_X").domainKey());
    }

    @Test
    void 도메인이_DD01L_에_없으면_DD04L_자체_타입을_쓴다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "ZZDE_MISSING_DOM")
                .field("T", "F2", "ZZDE_NO_DOM")
                .element("ZZDE_MISSING_DOM", "ZZDO_MISSING", "DEC", 5, 1).ko("ZZDE_MISSING_DOM", "속도")
                .element("ZZDE_NO_DOM", "", "CHAR", 4, 0).ko("ZZDE_NO_DOM", "코드");

        SapDictCandidates c = fx.extract();

        assertEquals("NUMBER(5,1)", column(c, "ZZDE_MISSING_DOM").domainKey());
        assertEquals("STRING(4)", column(c, "ZZDE_NO_DOM").domainKey());
    }

    @Test
    void 타입을_정할_수_없으면_UNSUPPORTED_TYPE_이다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "ZZDE_BLANK")
                .field("T", "F2", "ZZDE_DOM_BLANK")
                .element("ZZDE_BLANK", "", "", 0, 0).ko("ZZDE_BLANK", "빈 타입")
                // DD01L 을 고른 뒤 그 DATATYPE 이 공백이면 DD04L 자체 타입(CHAR)으로 물러서지 않는다
                .element("ZZDE_DOM_BLANK", "ZZDO_BLANK", "CHAR", 10, 0).ko("ZZDE_DOM_BLANK", "빈 도메인")
                .domain("ZZDO_BLANK", "", 0, 0, "");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(
                        new UnmatchedField("T", "F1", "ZZDE_BLANK", List.of(UNSUPPORTED_TYPE), "DATATYPE="),
                        new UnmatchedField("T", "F2", "ZZDE_DOM_BLANK", List.of(UNSUPPORTED_TYPE), "DATATYPE=")),
                c.unmatched());
        assertEquals(List.of(), c.columns());
    }

    // ── I10 ────────────────────────────────────────────────────────────────────────

    @Test
    void 도메인_후보는_값_정의로_묶고_SAP_도메인명으로_나누지_않는다() {
        Fixture fx = new Fixture()
                .field("T", "ZZ_ORD_DT", "ZZDE_ORD_DT")
                .field("T", "ZZ_PROD_DT", "ZZDE_PROD_DT")
                .field("T", "ZZ_SHIP_DT", "ZZDE_SHIP_DT")
                .element("ZZDE_ORD_DT", "DATUM", "DATS", 8, 0).ko("ZZDE_ORD_DT", "지시 일자")
                .element("ZZDE_PROD_DT", "DATUM", "DATS", 8, 0).ko("ZZDE_PROD_DT", "생산 일자")
                .element("ZZDE_SHIP_DT", "ZZDO_DATE", "DATS", 8, 0).ko("ZZDE_SHIP_DT", "출하 일자")
                .domain("DATUM", "DATS", 8, 0, "")
                .domain("ZZDO_DATE", "DATS", 8, 0, "");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(new DomainCandidate("STRING(8):DATE", MdmDataType.STRING, 8, null, MdmDomainKind.DATE, 3,
                        List.of("DATUM", "ZZDO_DATE"), List.of("ZZDE_ORD_DT", "ZZDE_PROD_DT", "ZZDE_SHIP_DT"))),
                c.domains());
    }

    @Test
    void 같은_SAP_도메인이라도_값_정의가_다르면_다른_후보다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "ZZDE_A")
                .field("T", "F2", "ZZDE_B")
                .element("ZZDE_A", "ZZDO_X", "CHAR", 10, 0).ko("ZZDE_A", "가")
                .element("ZZDE_B", "ZZDO_X", "CHAR", 20, 0).ko("ZZDE_B", "나");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of("STRING(10)", "STRING(20)"), c.domains().stream().map(DomainCandidate::domainKey).toList());
        assertEquals(List.of(List.of("ZZDO_X"), List.of("ZZDO_X")),
                c.domains().stream().map(DomainCandidate::sapDomains).toList());
    }

    @Test
    void STRING_8_과_STRING_8_DATE_는_다른_도메인_후보다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "ZZDE_CHAR8")
                .field("T", "F2", "ZZDE_DATS")
                .element("ZZDE_CHAR8", "", "CHAR", 8, 0).ko("ZZDE_CHAR8", "가")
                .element("ZZDE_DATS", "", "DATS", 8, 0).ko("ZZDE_DATS", "나");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of("STRING(8)", "STRING(8):DATE"),
                c.domains().stream().map(DomainCandidate::domainKey).toList());
    }

    // ── I11 ────────────────────────────────────────────────────────────────────────

    @Test
    void 한국어_라벨은_SCRTEXT_L_DDTEXT_SCRTEXT_M_SCRTEXT_S_순으로_한글이_있는_첫_값이다() {
        Fixture fx = new Fixture()
                .field("T", "F_L", "R_L").field("T", "F_DD", "R_DD").field("T", "F_M", "R_M").field("T", "F_S", "R_S")
                .element("R_L", "", "CHAR", 4, 0).ko("R_L", "코일", "다른 뜻", "또 다른", "셋째")
                .element("R_DD", "", "CHAR", 4, 0).ko("R_DD", "Coil Thk", "코일 두께", "두께", "두")
                .element("R_M", "", "CHAR", 4, 0).ko("R_M", "Coil Wgt", "Weight", "코일 중량", "중량")
                .element("R_S", "", "CHAR", 4, 0).ko("R_S", "", "Thk", " ", "두께");

        SapDictCandidates c = fx.extract();

        assertEquals("코일", column(c, "R_L").columnName());
        assertEquals("코일 두께", column(c, "R_DD").columnName());
        assertEquals("코일 중량", column(c, "R_M").columnName());
        assertEquals("두께", column(c, "R_S").columnName());
    }

    @Test
    void 한글이_하나도_없으면_NO_KOREAN_LABEL_이다() {
        Fixture fx = new Fixture()
                .field("T", "F_NONE", "R_NONE").field("T", "F_EN", "R_EN").field("T", "F_JAMO", "R_JAMO")
                .element("R_NONE", "", "CHAR", 4, 0)
                .element("R_EN", "", "CHAR", 4, 0).ko("R_EN", "Coil", "Coil", "Coil", "C")
                // 한글 음절(U+AC00–U+D7A3)이 아니라 자모뿐이다
                .element("R_JAMO", "", "CHAR", 4, 0).ko("R_JAMO", "ㅋㅋ", "ㅋ", "ㅋ", "ㅋ");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(
                        new UnmatchedField("T", "F_EN", "R_EN", List.of(NO_KOREAN_LABEL), ""),
                        new UnmatchedField("T", "F_JAMO", "R_JAMO", List.of(NO_KOREAN_LABEL), ""),
                        new UnmatchedField("T", "F_NONE", "R_NONE", List.of(NO_KOREAN_LABEL), "")),
                c.unmatched());
        assertEquals(List.of(), c.columns());
    }

    @Test
    void 컬럼명은_앞뒤_공백을_떼고_공백을_하나로_줄인다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "R1").field("T", "F2", "R2")
                .element("R1", "", "DEC", 3, 1).ko("R1", "  코일   두께 ")
                .element("R2", "", "DEC", 3, 1).ko("R2", "코일\t \t중량");

        SapDictCandidates c = fx.extract();

        assertEquals("코일 두께", column(c, "R1").columnName());
        assertEquals("코일   두께", column(c, "R1").sapScrtextL(), "참고 칸은 원문에서 앞뒤 공백만 뗀다(§4.3)");
        assertEquals("코일 중량", column(c, "R2").columnName());
    }

    // ── I12 ────────────────────────────────────────────────────────────────────────

    @Test
    void 용어는_공백과_괄호_슬래시_쉼표_가운뎃점으로_나눈다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "R1").field("T", "F2", "R2")
                .element("R1", "", "DEC", 5, 2).ko("R1", "원재료 코일 두께(mm)/편차·합계")
                .element("R2", "", "CHAR", 4, 0).ko("R2", "(가)[나]{다},라");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of("원재료", "코일", "두께", "mm", "편차", "합계"), column(c, "R1").termNames());
        assertEquals(List.of("가", "나", "다", "라"), column(c, "R2").termNames());
    }

    @Test
    void 용어_후보는_전역에서_중복을_없애고_컬럼_수를_센다() {
        Fixture fx = new Fixture()
                .field("T", "F1", "R1").field("T", "F2", "R2").field("T", "F3", "R3")
                .element("R1", "", "CHAR", 4, 0).ko("R1", "코일 두께")
                .element("R2", "", "CHAR", 4, 0).ko("R2", "코일 폭")
                .element("R3", "", "CHAR", 4, 0).ko("R3", "코일 코일");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(
                        new TermCandidate("두께", 1, List.of("R1")),
                        new TermCandidate("코일", 3, List.of("R1", "R2", "R3")),
                        new TermCandidate("폭", 1, List.of("R2"))),
                c.terms());
        assertEquals(List.of("코일", "코일"), column(c, "R3").termNames(), "컬럼 안의 순서 있는 조합은 그대로 둔다");
    }

    // ── I13 ────────────────────────────────────────────────────────────────────────

    @Test
    void 데이터_엘리먼트_하나에_컬럼_후보_하나다() {
        Fixture fx = new Fixture()
                .field("ZTPP_COIL", "ZZ_COIL_ID", "ZZDE_COIL_ID")
                .field("ZTSD_SHIP", "ZZ_COIL_ID", "ZZDE_COIL_ID")
                .field("ZTPP_COIL", "ZZ_COIL_NO", "ZZDE_COIL_ID")
                .eligible("ZZDE_COIL_ID", "코일 아이디");

        SapDictCandidates c = fx.extract();

        assertEquals(1, c.columns().size());
        assertEquals(List.of("ZZ_COIL_ID", "ZZ_COIL_NO"), column(c, "ZZDE_COIL_ID").fieldNames());
    }

    @Test
    void 대상_행이_참조하지_않는_엘리먼트는_컬럼_후보가_아니다() {
        Fixture fx = new Fixture()
                .field("T", "F", "ZZDE_USED")
                .eligible("ZZDE_USED", "사용")
                .element("ZZDE_UNUSED", "", "DEC", 7, 2).ko("ZZDE_UNUSED", "미사용");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of("ZZDE_USED"), c.columns().stream().map(ColumnCandidate::rollname).toList());
        assertEquals(List.of("사용"), c.terms().stream().map(TermCandidate::termName).toList());
        assertEquals(List.of("STRING(10)"), c.domains().stream().map(DomainCandidate::domainKey).toList());
    }

    // ── I14 ────────────────────────────────────────────────────────────────────────

    @Test
    void 필드명_충돌이면_모든_행이_미대응이고_컬럼_시스템_후보가_없다() {
        SapDictCandidates c = kunnrConflict().extract();

        assertEquals(List.of(
                        new UnmatchedField("LIKP", "KUNNR", "KUNWE", List.of(FIELD_NAME_CONFLICT), "ROLLNAMES=KUNAG;KUNWE"),
                        new UnmatchedField("VBAK", "KUNNR", "KUNAG", List.of(FIELD_NAME_CONFLICT), "ROLLNAMES=KUNAG;KUNWE")),
                c.unmatched());
        assertEquals(List.of(), c.columnSystems());
    }

    @Test
    void 필드명_충돌이어도_엘리먼트_컬럼_후보는_남는다() {
        SapDictCandidates c = kunnrConflict().extract();

        assertEquals(List.of("KUNAG", "KUNWE"), c.columns().stream().map(ColumnCandidate::rollname).toList());
        assertEquals(List.of("KUNNR"), column(c, "KUNAG").fieldNames());
        assertEquals(List.of("KUNNR"), column(c, "KUNWE").fieldNames());
    }

    @Test
    void ROLLNAME_공백도_충돌_판정의_값으로_센다() {
        Fixture fx = new Fixture()
                .field("A", "X", "R")
                .field("B", "X", "")
                .eligible("R", "가");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(
                        new UnmatchedField("A", "X", "R", List.of(FIELD_NAME_CONFLICT), "ROLLNAMES=(없음);R"),
                        new UnmatchedField("B", "X", "", List.of(NO_DATA_ELEMENT, FIELD_NAME_CONFLICT), "ROLLNAMES=(없음);R")),
                c.unmatched());
    }

    // ── I15 ────────────────────────────────────────────────────────────────────────

    @Test
    void 같은_필드명_같은_엘리먼트는_테이블이_여럿이어도_한_행이다() {
        Fixture fx = new Fixture()
                .field("ZTSD_SHIP", "ZZ_COIL_ID", "ZZDE_COIL_ID")
                .field("ZTPP_COIL", "ZZ_COIL_ID", "ZZDE_COIL_ID")
                .eligible("ZZDE_COIL_ID", "코일 아이디");

        SapDictCandidates c = fx.extract();

        assertEquals(1, c.columnSystems().size());
        assertEquals(List.of("ZTPP_COIL", "ZTSD_SHIP"), c.columnSystems().get(0).tables());
    }

    @Test
    void 컬럼_시스템_후보의_system_code_는_ERP_다() {
        Fixture fx = new Fixture().field("T", "F", "R").eligible("R", "가");

        ColumnSystemCandidate cs = fx.extract().columnSystems().get(0);

        assertEquals(MdmSystemCodes.ERP, cs.systemCode());
        assertEquals("ERP", cs.systemCode());
        assertEquals("F", cs.physName());
        assertEquals("R", cs.rollname());
    }

    @Test
    void transform_은_엘리먼트_도메인의_CONVEXIT_다() {
        Fixture fx = new Fixture()
                .field("T", "F_ALPHA", "R_ALPHA").field("T", "F_NODOM", "R_NODOM")
                .field("T", "F_MISSING", "R_MISSING").field("T", "F_BLANK", "R_BLANK")
                .element("R_ALPHA", "ZZDO_ALPHA", "CHAR", 20, 0).ko("R_ALPHA", "가")
                .element("R_NODOM", "", "CHAR", 20, 0).ko("R_NODOM", "나")
                .element("R_MISSING", "ZZDO_MISSING", "CHAR", 20, 0).ko("R_MISSING", "다")
                .element("R_BLANK", "ZZDO_BLANK", "CHAR", 20, 0).ko("R_BLANK", "라")
                .domain("ZZDO_ALPHA", "CHAR", 20, 0, " ALPHA ")
                .domain("ZZDO_BLANK", "CHAR", 20, 0, "");

        Map<String, String> transforms = fx.extract().columnSystems().stream()
                .collect(Collectors.toMap(ColumnSystemCandidate::physName, ColumnSystemCandidate::transform));

        assertEquals(Map.of("F_ALPHA", "ALPHA", "F_NODOM", "", "F_MISSING", "", "F_BLANK", ""), transforms);
    }

    @Test
    void note_는_DE_와_DOMAIN_을_적는다() {
        Fixture fx = new Fixture()
                .field("T", "ZZ_COIL_ID", "ZZDE_COIL_ID").field("T", "ZZ_LINE_SPD", "ZZDE_LINE_SPD")
                .field("T", "ZZ_X", "ZZDE_X")
                .element("ZZDE_COIL_ID", "ZZDO_COIL_ID", "CHAR", 20, 0).ko("ZZDE_COIL_ID", "코일 아이디")
                .element("ZZDE_LINE_SPD", "", "DEC", 5, 1).ko("ZZDE_LINE_SPD", "라인 스피드")
                // DD01L 에 그 도메인이 없어도 이름은 적는다
                .element("ZZDE_X", "ZZDO_MISSING", "CHAR", 4, 0).ko("ZZDE_X", "엑스")
                .domain("ZZDO_COIL_ID", "CHAR", 20, 0, "ALPHA");

        Map<String, String> notes = fx.extract().columnSystems().stream()
                .collect(Collectors.toMap(ColumnSystemCandidate::physName, ColumnSystemCandidate::note));

        assertEquals(Map.of(
                "ZZ_COIL_ID", "DE=ZZDE_COIL_ID; DOMAIN=ZZDO_COIL_ID",
                "ZZ_LINE_SPD", "DE=ZZDE_LINE_SPD",
                "ZZ_X", "DE=ZZDE_X; DOMAIN=ZZDO_MISSING"), notes);
    }

    // ── I16 ────────────────────────────────────────────────────────────────────────

    @Test
    void 미대응_사유는_정해진_순서로_모두_적는다() {
        Fixture fx = new Fixture()
                .field("VBAK", "VBELN", "VBELN_VA")
                .field("LIKP", "VBELN", "VBELN_VL")
                .element("VBELN_VA", "", "CHAR", 10, 0).ko("VBELN_VA", "Sales Document")
                .element("VBELN_VL", "", "CHAR", 10, 0);

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(NO_KOREAN_LABEL, FIELD_NAME_CONFLICT), c.unmatched().get(0).reasons());
        assertEquals(List.of(NO_KOREAN_LABEL, FIELD_NAME_CONFLICT), c.unmatched().get(1).reasons());
    }

    @Test
    void detail_은_DATATYPE_과_ROLLNAMES_를_구분자로_잇는다() {
        Fixture fx = new Fixture()
                .field("T1", "X", "R_FLTP")
                .field("T2", "X", "R_OK")
                .element("R_FLTP", "", "FLTP", 16, 16)
                .eligible("R_OK", "가");

        SapDictCandidates c = fx.extract();

        assertEquals(new UnmatchedField("T1", "X", "R_FLTP", List.of(UNSUPPORTED_TYPE, NO_KOREAN_LABEL, FIELD_NAME_CONFLICT),
                "DATATYPE=FLTP | ROLLNAMES=R_FLTP;R_OK"), c.unmatched().get(0));
        assertEquals(new UnmatchedField("T2", "X", "R_OK", List.of(FIELD_NAME_CONFLICT), "ROLLNAMES=R_FLTP;R_OK"),
                c.unmatched().get(1));
    }

    @Test
    void 엘리먼트가_없으면_엘리먼트_단위_사유를_더_보지_않는다() {
        Fixture fx = new Fixture()
                .field("T", "ZZ_RAW_VAL", "")
                .field("T", "ZZ_GHOST", "ZZDE_NOT_EXIST");

        SapDictCandidates c = fx.extract();

        assertEquals(List.of(
                        new UnmatchedField("T", "ZZ_GHOST", "ZZDE_NOT_EXIST", List.of(DATA_ELEMENT_NOT_FOUND), ""),
                        new UnmatchedField("T", "ZZ_RAW_VAL", "", List.of(NO_DATA_ELEMENT), "")),
                c.unmatched());
    }

    // ── I17 ────────────────────────────────────────────────────────────────────────

    @Test
    void sample_rollnames_는_정렬한_앞_5개다() {
        Fixture fx = new Fixture();
        for (String r : List.of("R6", "R3", "R1", "R5", "R2", "R4")) {
            fx.field("T", "F_" + r, r).eligible(r, "코일 " + r);
        }

        SapDictCandidates c = fx.extract();

        DomainCandidate domain = c.domains().get(0);
        assertEquals(6, domain.elementCount());
        assertEquals(List.of("R1", "R2", "R3", "R4", "R5"), domain.sampleRollnames());
        TermCandidate term = c.terms().stream().filter(t -> t.termName().equals("코일")).findFirst().orElseThrow();
        assertEquals(6, term.columnCount());
        assertEquals(List.of("R1", "R2", "R3", "R4", "R5"), term.sampleRollnames());
    }

    @Test
    void 출력_행은_정해진_키로_정렬된다() {
        SapDictCandidates c = shuffledFixture().extract();

        assertSorted(c.terms(), comparing(TermCandidate::termName));
        assertSorted(c.domains(), comparing(DomainCandidate::domainKey));
        assertSorted(c.columns(), comparing(ColumnCandidate::rollname));
        assertSorted(c.columnSystems(), comparing(ColumnSystemCandidate::physName));
        assertSorted(c.unmatched(), comparing(UnmatchedField::tabname).thenComparing(UnmatchedField::fieldname));
    }

    // ── I18 ────────────────────────────────────────────────────────────────────────

    @Test
    void 같은_입력이면_같은_결과다() {
        Fixture fx = shuffledFixture();

        assertEquals(fx.extract(), fx.extract());
    }

    // ── 픽스처 ─────────────────────────────────────────────────────────────────────

    private static Fixture kunnrConflict() {
        return new Fixture()
                .field("VBAK", "KUNNR", "KUNAG")
                .field("LIKP", "KUNNR", "KUNWE")
                .element("KUNAG", "KUNNR", "CHAR", 10, 0).ko("KUNAG", "판매처")
                .element("KUNWE", "KUNNR", "CHAR", 10, 0).ko("KUNWE", "인도처")
                .domain("KUNNR", "CHAR", 10, 0, "ALPHA");
    }

    /** 정렬 키 역순으로 넣은 입력. 다섯 목록 모두 두 행 이상이 나온다. */
    private static Fixture shuffledFixture() {
        return new Fixture()
                .field("ZT", "ZZ_Z", "R_Z").field("ZT", "ZZ_BAD2", "").field("AT", "ZZ_BAD1", "")
                .field("AT", "ZZ_M", "R_M").field("AT", "ZZ_A", "R_A").field("ZT", "ZZ_BAD0", "")
                .element("R_Z", "", "DEC", 9, 2).ko("R_Z", "하 나")
                .element("R_M", "", "CHAR", 30, 0).ko("R_M", "마 다")
                .element("R_A", "", "CHAR", 12, 0).ko("R_A", "가 나");
    }

    private static <T> void assertSorted(List<T> list, Comparator<T> order) {
        assertTrue(list.size() >= 2, "정렬 검사가 공허하지 않도록 두 행 이상이어야 한다: " + list);
        List<T> sorted = new ArrayList<>(list);
        sorted.sort(order);
        assertEquals(sorted, list);
    }

    private static List<String> physNames(SapDictCandidates c) {
        return c.columnSystems().stream().map(ColumnSystemCandidate::physName).toList();
    }

    private static ColumnCandidate column(SapDictCandidates c, String rollname) {
        return c.columns().stream().filter(col -> col.rollname().equals(rollname)).findFirst()
                .orElseThrow(() -> new AssertionError("컬럼 후보 없음: " + rollname + " in " + c.columns()));
    }

    private static final class Fixture {
        final List<Dd03lField> fields = new ArrayList<>();
        final Map<String, Dd04lElement> elements = new LinkedHashMap<>();
        final Map<String, Dd04tText> texts = new LinkedHashMap<>();
        final Map<String, Dd01lDomain> domains = new LinkedHashMap<>();

        Fixture field(String tabname, String fieldname, String rollname) {
            fields.add(new Dd03lField(tabname, fieldname, rollname));
            return this;
        }

        Fixture element(String rollname, String domname, String datatype, int leng, int decimals) {
            elements.put(rollname, new Dd04lElement(rollname, domname, datatype, leng, decimals));
            return this;
        }

        /** SCRTEXT_L 하나만 있는 한국어 행. */
        Fixture ko(String rollname, String scrtextL) {
            return ko(rollname, scrtextL, "", "", "");
        }

        Fixture ko(String rollname, String scrtextL, String ddtext, String scrtextM, String scrtextS) {
            texts.put(rollname, new Dd04tText(rollname, ddtext, scrtextS, scrtextM, scrtextL));
            return this;
        }

        Fixture domain(String domname, String datatype, int leng, int decimals, String convexit) {
            domains.put(domname, new Dd01lDomain(domname, datatype, leng, decimals, convexit));
            return this;
        }

        /** 도메인 없이 CHAR 10 인 적격 엘리먼트. */
        Fixture eligible(String rollname, String scrtextL) {
            return element(rollname, "", "CHAR", 10, 0).ko(rollname, scrtextL);
        }

        SapDictCandidates extract() {
            return SapDictCandidateExtractor.extract(new SapDdicExtract(fields, elements, texts, domains));
        }
    }
}
