package com.dongkuk.dmes.cactus.dmom.message;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.FormatItem;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * FORMAT_LAYOUT + 데이터 Map → {@code 값|값|값|} 파이프 구분 전문 문자열로 직렬화.
 *
 * <p>레거시 {@code DMomCreateMessage.CreateBodyMessage} + {@code DMomSendUtil.getMsgFromSendFormat}
 * 를 충실 이식(Phase 0 §0.1 규칙). 구분자 {@code "|"} 는 각 항목값 뒤에 부착(마지막 포함).
 *
 * <ul>
 *   <li>{@code E} : {@code data.get(itemId)} 변환 후 {@code 값 + "|"}.</li>
 *   <li>{@code G} : 메시지에 append 안 함. {@code dataLen} = 반복 횟수. 데이터 = {@code data.get(itemId)} = {@code List<Map>}.</li>
 *   <li>{@code GE} : 현재 그룹 Map 에서 변환 후 {@code 값 + "|"}. 그룹 Map 부재 시 빈 문자열.</li>
 * </ul>
 */
public class MessageSerializer {

    private static final String SEP = "|";

    // DATA_TP (CactusConstants.MOM_IF_TYPE_*)
    private static final String TYPE_STRING = "1";   // 그대로
    private static final String TYPE_NUMBER = "2";    // 고정폭 zero-pad
    private static final String TYPE_DATE = "3";      // 숫자추출 + 우측0패딩 + 절단
    private static final String TYPE_STRING2 = "4";   // trim
    private static final String TYPE_NUMBER2 = "5";   // 그대로

    private static final String GROUP_FIELD = "SNDR_INFORM_EDIT_PGM_ID"; // 레거시 특수 절단 항목

    /**
     * 직렬화 수행.
     *
     * @param layout FORMAT 레이아웃
     * @param data   FORMAT 항목값 Map (E: scalar, G: {@code List<Map<String,Object>>})
     * @return {@code 값|값|값|} 전문 문자열
     */
    public String serialize(FormatLayout layout, Map<String, Object> data) {
        Map<String, Object> src = (data == null) ? Map.of() : data;
        StringBuilder sb = new StringBuilder();
        List<FormatItem> items = layout.items();

        int i = 0;
        while (i < items.size()) {
            FormatItem it = items.get(i);
            switch (it.itemTp()) {
                case "E" -> {
                    appendField(sb, it, str(src.get(it.itemId())));
                    i++;
                }
                case "G" -> i = appendGroup(sb, items, i, src);
                case "GE" -> {
                    // G 없이 단독 GE — 정상 포맷에선 미발생. 방어적으로 빈 항목 처리.
                    sb.append(SEP);
                    i++;
                }
                default -> i++; // 알 수 없는 ITEM_TP 스킵
            }
        }
        return sb.toString();
    }

    /** 반복 그룹 처리. 반환 = GE 블록 다음 인덱스. */
    @SuppressWarnings("unchecked")
    private int appendGroup(StringBuilder sb, List<FormatItem> items, int gIndex, Map<String, Object> data) {
        FormatItem group = items.get(gIndex);
        int groupSize = group.dataLen();   // 반복 횟수

        // 연속된 GE 항목 수집
        List<FormatItem> geItems = new ArrayList<>();
        int j = gIndex + 1;
        while (j < items.size() && "GE".equals(items.get(j).itemTp())) {
            geItems.add(items.get(j));
            j++;
        }

        List<Map<String, Object>> groupList = null;
        Object raw = data.get(group.itemId());
        if (raw instanceof List<?> list) {
            groupList = (List<Map<String, Object>>) list;
        }
        // H-9: 그룹 데이터 행수 > 레이아웃 반복 횟수 → 초과 행이 무음 손실되므로 명시 거부(fail-loud).
        if (groupList != null && groupList.size() > groupSize) {
            throw new DmomException("[" + group.itemId() + "] 그룹 데이터 " + groupList.size()
                    + "행 > 레이아웃 반복 " + groupSize + " — 초과 행 무음 손실 방지");
        }

        for (int rep = 0; rep < groupSize; rep++) {
            Map<String, Object> groupMap =
                    (groupList != null && groupList.size() > rep) ? groupList.get(rep) : null;
            for (FormatItem ge : geItems) {
                if (groupMap == null) {
                    sb.append(SEP);                      // 그룹 Map 부재 → 빈 항목
                } else {
                    appendField(sb, ge, str(groupMap.get(ge.itemId())));
                }
            }
        }
        return j;
    }

    /** 항목값 변환 + 특수 절단 + 구분자 append. */
    private void appendField(StringBuilder sb, FormatItem it, String rawValue) {
        String v = convert(it.dataTp(), rawValue, it.dataLen(), it.dataDecimalPrec());
        if (v.length() >= 5 && v.startsWith("ERROR")) {
            throw new DmomException("[" + it.itemId() + "] " + v);
        }
        // H-10: 값에 구분자 '|' 가 있으면 이스케이프 없는 파이프 포맷이 밀려 전 필드가 오정렬된다.
        //       레거시 상대가 이스케이프를 모르므로 스킴을 넣지 않고 명시 거부(fail-loud)한다.
        if (v.indexOf('|') >= 0) {
            throw new DmomException("[" + it.itemId() + "] 값에 구분자 '|' 포함 — 전문 정합 파괴: '" + v + "'");
        }
        if (GROUP_FIELD.equals(it.itemId()) && v.length() > 14) {
            v = v.substring(0, 14);
        }
        sb.append(v).append(SEP);
    }

    /**
     * DATA_TP 별 값 변환 (레거시 {@code getMsgFromSendFormat} 이식).
     */
    private String convert(String dataTp, String msgData, int dataLen, int dataPrec) {
        if (msgData == null) {
            msgData = "";
        } else if (msgData.toUpperCase().contains("NULL")) {
            String nullMsg = msgData.toUpperCase()
                    .replace("NULL", "")
                    .replace(",", "")
                    .replace("[", "")
                    .replace("]", "");
            if (nullMsg.trim().isEmpty()) {
                msgData = "";
            }
        }

        if (TYPE_STRING.equals(dataTp)) {
            return msgData;
        } else if (TYPE_STRING2.equals(dataTp)) {
            return msgData.trim();
        } else if (TYPE_NUMBER.equals(dataTp)) {
            if (!msgData.isEmpty()) {
                String sData1 = "";
                String sData2 = "";
                int splitLoc = msgData.indexOf('.');
                if (splitLoc == -1) {
                    if (dataLen - dataPrec > 0) {
                        sData1 = String.format("%0" + (dataLen - dataPrec) + "d", Long.parseLong(msgData));
                    }
                    if (dataPrec > 0) {
                        sData2 = String.format("%0" + dataPrec + "d", 0).substring(0, dataPrec);
                    }
                } else {
                    String[] numSplit = msgData.split("\\.");
                    if (dataLen - dataPrec > 0) {
                        sData1 = String.format("%0" + (dataLen - dataPrec) + "d", Long.parseLong(numSplit[0]));
                    }
                    if (dataPrec > 0) {
                        sData2 = (numSplit[1].trim() + String.format("%0" + dataPrec + "d", 0)).substring(0, dataPrec);
                    }
                }
                return sData1 + sData2;
            }
            return msgData;
        } else if (TYPE_DATE.equals(dataTp)) {
            String result = msgData
                    .replace("-", "").replace("/", "").replace(":", "").replace(" ", "").replace(".", "");
            if (result.length() > 0) {
                result = result + "00000000000000000000";   // 20 zeros
            }
            if (result.length() > dataLen) {
                result = result.substring(0, dataLen);
            }
            return result;
        } else if (TYPE_NUMBER2.equals(dataTp)) {
            return msgData;
        }
        return "";   // 알 수 없는 dataTp
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
