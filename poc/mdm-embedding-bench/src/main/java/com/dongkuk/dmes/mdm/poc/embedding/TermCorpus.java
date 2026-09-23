package com.dongkuk.dmes.mdm.poc.embedding;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 철강·MES 도메인 용어 합성 코퍼스(표기 + 정의 + 영문명).
 *
 * <p>실제 용어집이 아직 없으므로 공정·대상·속성 조합으로 1만 건을 만든다. 시드가 고정이라 매번 같은 코퍼스가 나온다.
 * 정의 길이는 원천 02 샘플("대상의 두꺼운 정도")처럼 짧은 것부터 두세 문장짜리까지 섞어 토큰 길이 분포를 넓힌다.
 */
public final class TermCorpus {

    /** 용어 한 건. 원천 02 TB_MDM_TERM 의 term_name·definition·eng_name 에 해당한다. */
    public record Term(int id, String name, String definition, String engName) {}

    private static final String[][] PROCESSES = {
            {"원재료", "Raw Material", "RMTL"}, {"입측", "Entry", "ENT"}, {"출측", "Delivery", "DLV"},
            {"냉연", "Cold Rolling", "CR"}, {"열연", "Hot Rolling", "HR"}, {"도금", "Plating", "PLT"},
            {"소둔", "Annealing", "ANN"}, {"산세", "Pickling", "PKL"}, {"조질압연", "Skin Pass", "SPM"},
            {"도장", "Coating", "CTG"}, {"전단", "Shearing", "SHR"}, {"포장", "Packing", "PKG"},
            {"출하", "Shipping", "SHP"}, {"검사", "Inspection", "INSP"}, {"정정", "Finishing", "FIN"},
            {"연주", "Continuous Casting", "CC"}, {"제강", "Steelmaking", "SM"}, {"수입", "Receiving", "RCV"},
            {"재공", "Work In Process", "WIP"}, {"품질", "Quality", "QLTY"}, {"설비", "Equipment", "EQP"},
            {"계획", "Planning", "PLN"}, {"주문", "Order", "ORD"}, {"생산", "Production", "PROD"},
    };
    private static final String[][] OBJECTS = {
            {"코일", "Coil", "COIL"}, {"강판", "Steel Sheet", "SHT"}, {"스트립", "Strip", "STRP"},
            {"슬라브", "Slab", "SLAB"}, {"롤", "Roll", "ROLL"}, {"로트", "Lot", "LOT"},
            {"배치", "Batch", "BATCH"}, {"제품", "Product", "PRD"}, {"소재", "Material", "MTL"},
            {"도료", "Paint", "PNT"}, {"아연", "Zinc", "ZN"}, {"라인", "Line", "LINE"},
            {"작업지시", "Work Order", "WO"}, {"시편", "Specimen", "SPC"}, {"용접부", "Weld", "WLD"},
            {"권취", "Coiling", "CLG"},
    };
    private static final String[][] ATTRS = {
            {"두께", "Thickness", "THK", "대상의 두꺼운 정도", "mm"},
            {"폭", "Width", "WID", "대상의 가로 방향 너비", "mm"},
            {"길이", "Length", "LEN", "대상의 길이 방향 치수", "m"},
            {"중량", "Weight", "WGT", "대상의 무게", "kg"},
            {"온도", "Temperature", "TEMP", "측정 시점의 온도", "℃"},
            {"속도", "Speed", "SPD", "라인을 통과하는 속도", "mpm"},
            {"장력", "Tension", "TNS", "통판 중 걸리는 장력", "kN"},
            {"경도", "Hardness", "HRD", "표면 경도 측정값", "HV"},
            {"인장강도", "Tensile Strength", "TS", "인장 시험에서 얻은 최대 응력", "MPa"},
            {"항복강도", "Yield Strength", "YS", "소성 변형이 시작되는 응력", "MPa"},
            {"연신율", "Elongation", "EL", "파단까지 늘어난 비율", "%"},
            {"편차", "Deviation", "DEV", "기준값에서 벗어난 정도", "mm"},
            {"부착량", "Coating Weight", "CW", "단위 면적당 부착된 양", "g/m2"},
            {"조도", "Roughness", "RGH", "표면의 거친 정도", "um"},
            {"등급", "Grade", "GRD", "판정된 등급", "-"},
            {"코드", "Code", "CD", "구분을 나타내는 코드", "-"},
            {"번호", "Number", "NO", "식별을 위한 번호", "-"},
            {"일자", "Date", "DT", "발생한 날짜", "-"},
            {"일시", "Datetime", "DTM", "발생한 날짜와 시각", "-"},
            {"수량", "Quantity", "QTY", "개수로 센 양", "EA"},
            {"외경", "Outer Diameter", "OD", "코일 바깥 지름", "mm"},
            {"내경", "Inner Diameter", "ID", "코일 안쪽 지름", "mm"},
            {"평탄도", "Flatness", "FLT", "판의 평평한 정도", "I-unit"},
            {"결함수", "Defect Count", "DFCT_CNT", "검출된 결함의 개수", "EA"},
            {"상태", "Status", "STS", "진행 상태", "-"},
            {"실적", "Actual", "ACT", "실제로 수행한 결과", "-"},
            {"목표", "Target", "TGT", "달성하려고 정한 값", "-"},
            {"상한", "Upper Limit", "UL", "허용 범위의 최댓값", "-"},
            {"하한", "Lower Limit", "LL", "허용 범위의 최솟값", "-"},
    };
    private static final String[] CLAUSES = {
            "품질 판정과 공정 조건 설정에 쓴다.",
            "상위 시스템(ERP)과 MES 사이 인터페이스로 주고받는다.",
            "측정기 값이 없으면 작업자가 직접 입력한다.",
            "L2 설비에서 수집해 1초 주기로 저장한다.",
            "고객 주문 사양과 견주어 합부를 가린다.",
            "공정 이상이 생기면 이 값으로 원인을 추적한다.",
            "APS 계획 수립 때 제약 조건으로 참조한다.",
            "출하 전 최종 검사 성적서에 인쇄한다.",
    };

    private TermCorpus() {}

    /** 시드를 고정해 {@code count} 건을 만든다. 표기가 같으면 의미 번호처럼 뒤에 숫자를 붙이지 않고 건너뛴다. */
    public static List<Term> generate(int count, long seed) {
        Random rnd = new Random(seed);
        Map<String, Term> byName = new LinkedHashMap<>();
        int guard = 0;
        while (byName.size() < count && guard++ < count * 50) {
            String[] p = PROCESSES[rnd.nextInt(PROCESSES.length)];
            String[] o = OBJECTS[rnd.nextInt(OBJECTS.length)];
            String[] a = ATTRS[rnd.nextInt(ATTRS.length)];
            String[] q = rnd.nextInt(3) == 0 ? PROCESSES[rnd.nextInt(PROCESSES.length)] : null;
            String name = (q != null && q != p ? q[0] + " " : "") + p[0] + " " + o[0] + " " + a[0];
            if (byName.containsKey(name)) {
                continue;
            }
            String eng = (q != null && q != p ? q[1] + " " : "") + p[1] + " " + o[1] + " " + a[1];
            StringBuilder def = new StringBuilder();
            def.append(p[0]).append(" 단계 ").append(o[0]).append("의 ").append(a[3]);
            if (!"-".equals(a[4])) {
                def.append("(단위 ").append(a[4]).append(")");
            }
            def.append('.');
            int extra = rnd.nextInt(4);   // 0~3 문장 추가 — 정의 길이 분포를 넓힌다
            for (int i = 0; i < extra; i++) {
                def.append(' ').append(CLAUSES[rnd.nextInt(CLAUSES.length)]);
            }
            byName.put(name, new Term(byName.size() + 1, name, def.toString(), eng));
        }
        return new ArrayList<>(byName.values());
    }

    /**
     * 인코딩 입력 문자열 — 원천 02:530·817 의 {@code 표기 + 정의 + 영문명}.
     * 형식: {@code "{표기}: {정의} ({영문명})"}. 빈 칸은 구분자째 뺀다(design.md §6 임베딩 입력 형식).
     */
    public static String encodeInput(String name, String definition, String engName) {
        StringBuilder sb = new StringBuilder(name.strip());
        if (definition != null && !definition.isBlank()) {
            sb.append(": ").append(definition.strip());
        }
        if (engName != null && !engName.isBlank()) {
            sb.append(" (").append(engName.strip()).append(')');
        }
        return sb.toString();
    }

    public static String encodeInput(Term t) {
        return encodeInput(t.name(), t.definition(), t.engName());
    }
}
