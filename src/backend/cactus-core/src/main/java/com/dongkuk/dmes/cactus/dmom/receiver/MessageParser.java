package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.FormatItem;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code 값|값|값|} 파이프 구분 전문 → FORMAT_LAYOUT 기반 데이터 Map 으로 역직렬화.
 *
 * <p>{@link com.dongkuk.dmes.cactus.dmom.message.MessageSerializer} 의 역연산. 레거시
 * {@code DMomParseMessage.msgParsing}(E/G/GE 매핑) + {@code DMomRecvUtil.getMsgFromRecvFormat}
 * (DATA_TP 역변환)을 충실 이식한다(상세설계 §4.4/§5).
 *
 * <ul>
 *   <li>{@code E} : 토큰 1개 소비 → {@code result.put(itemId, 역변환값)}.</li>
 *   <li>{@code G} : 메시지 토큰을 직접 소비하지 않음. {@code dataLen} = 반복 횟수. 후속 연속 {@code GE} 묶음을
 *       반복 횟수만큼 소비해 {@code List<Map>} 으로 적재 → {@code result.put(groupId, list)}.</li>
 *   <li>{@code GE} : 그룹 처리(G)에서 소비. 단독(orphan) 출현 시 방어적으로 토큰 1개 스킵.</li>
 * </ul>
 *
 * <p>분리는 {@code split("\\|", -1)} 로 <b>빈 토큰을 보존</b>(trailing 파이프 포함)한다. 전문이 포맷보다
 * 짧으면 부족분은 빈 문자열("")로 채운다.
 */
public class MessageParser {

    private static final String SEP = "\\|";

    // DATA_TP (CactusConstants.MOM_IF_TYPE_*) — MessageSerializer 와 동일 코드 체계
    private static final String TYPE_STRING = "1";   // trim
    private static final String TYPE_NUMBER = "2";   // 고정폭 → 소수점 복원
    private static final String TYPE_DATE = "3";     // 날짜 절단
    private static final String TYPE_STRING2 = "4";  // trim (레거시 미구현 → 신규 보강)
    private static final String TYPE_NUMBER2 = "5";  // 원형(trim)

    /**
     * 역직렬화 수행.
     *
     * @param layout       FORMAT 레이아웃
     * @param interfaceMsg 파이프 구분 전문(raw)
     * @return 항목값 Map (E: scalar, G: {@code List<Map<String,Object>>})
     */
    public Map<String, Object> parse(FormatLayout layout, String interfaceMsg) {
        String[] tokens = (interfaceMsg == null ? "" : interfaceMsg).split(SEP, -1);
        Map<String, Object> result = new LinkedHashMap<>();
        List<FormatItem> items = layout.items();

        int ti = 0;   // 토큰 인덱스
        int i = 0;    // 항목 인덱스
        while (i < items.size()) {
            FormatItem it = items.get(i);
            switch (it.itemTp()) {
                case "E" -> {
                    result.put(it.itemId(), convert(it, token(tokens, ti)));
                    ti++;
                    i++;
                }
                case "G" -> {
                    int[] next = parseGroup(result, items, i, tokens, ti);
                    i = next[0];
                    ti = next[1];
                }
                case "GE" -> {
                    // G 없이 단독 GE — 정상 포맷 미발생. 방어적으로 토큰 1개 스킵.
                    ti++;
                    i++;
                }
                default -> i++;
            }
        }

        // H-9: 미소비 데이터 토큰 검출 → 반복그룹(G) 개수/필드 정합 불일치를 무음 오정렬 대신 명시 오류로.
        //      (짧은 전문 = 부족분 "" 패딩 및 trailing 빈 토큰은 기존 설계상 허용 → 빈 토큰은 무시.)
        for (int k = ti; k < tokens.length; k++) {
            if (!tokens[k].isEmpty()) {
                throw new DmomException("전문-레이아웃 토큰 불일치 — 소비 " + ti + "/" + tokens.length
                        + " (미소비 데이터 index " + k + "='" + tokens[k] + "'). 반복그룹(G) 개수/필드 정합 확인");
            }
        }
        return result;
    }

    /** 반복 그룹 처리. 반환 = {@code [GE 블록 다음 항목 인덱스, 다음 토큰 인덱스]}. */
    private int[] parseGroup(Map<String, Object> result, List<FormatItem> items, int gIndex,
                             String[] tokens, int ti) {
        FormatItem group = items.get(gIndex);
        int groupSize = group.dataLen();   // 반복 횟수

        // 연속된 GE 항목 수집
        List<FormatItem> geItems = new ArrayList<>();
        int j = gIndex + 1;
        while (j < items.size() && "GE".equals(items.get(j).itemTp())) {
            geItems.add(items.get(j));
            j++;
        }

        List<Map<String, Object>> list = new ArrayList<>(Math.max(groupSize, 0));
        for (int rep = 0; rep < groupSize; rep++) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (FormatItem ge : geItems) {
                row.put(ge.itemId(), convert(ge, token(tokens, ti)));
                ti++;
            }
            list.add(row);
        }
        result.put(group.itemId(), list);
        return new int[]{j, ti};
    }

    /** 토큰 안전 접근 — 범위 밖이면 빈 문자열(전문이 짧을 때). */
    private static String token(String[] tokens, int ti) {
        return (ti >= 0 && ti < tokens.length) ? tokens[ti] : "";
    }

    /**
     * DATA_TP 별 토큰 역변환 (레거시 {@code getMsgFromRecvFormat} 이식, 상세설계 §5).
     */
    private Object convert(FormatItem it, String token) {
        String dataTp = it.dataTp();
        String t = (token == null) ? "" : token.trim();

        if (TYPE_STRING.equals(dataTp) || TYPE_STRING2.equals(dataTp)) {
            return t;
        } else if (TYPE_NUMBER.equals(dataTp)) {
            if (t.isEmpty()) {
                return "";
            }
            int prec = it.dataDecimalPrec();
            if (prec > 0 && t.indexOf('.') == -1) {
                // 소수점 없는 고정폭 → 소수부 prec 자리로 복원
                return num(it, t)
                        .divide(BigDecimal.TEN.pow(prec), prec, RoundingMode.UP)
                        .toString();
            }
            return num(it, t).toString();   // 앞 0 제거
        } else if (TYPE_DATE.equals(dataTp)) {
            // "1900" < token < "9999" (문자열 비교) 일 때만 유효 날짜로 간주
            if (t.compareTo("1900") > 0 && t.compareTo("9999") < 0) {
                String cleaned = t
                        .replace("-", "").replace("/", "").replace(":", "")
                        .replace(" ", "").replace(".", "");
                int len = it.dataLen();
                return (len > 0 && cleaned.length() > len) ? cleaned.substring(0, len) : cleaned;
            }
            return "";
        } else if (TYPE_NUMBER2.equals(dataTp)) {
            return t.isEmpty() ? "" : num(it, t).toString();
        }
        return t;   // 알 수 없는 dataTp — 원본 trim
    }

    /** 숫자 변환 — 비숫자 토큰은 무음 크래시(NumberFormatException) 대신 명시 오류(DmomException)로 전환(H-11). */
    private BigDecimal num(FormatItem it, String t) {
        try {
            return new BigDecimal(t);
        } catch (NumberFormatException e) {
            throw new DmomException("[" + it.itemId() + "] 숫자 변환 실패(DATA_TP=" + it.dataTp() + "): '" + t + "'");
        }
    }
}
