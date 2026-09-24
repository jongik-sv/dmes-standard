package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutCodecException;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutSegment;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutSegments;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutSerializer;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * 샘플 전문 한 줄 렌더(TSK-05-03 design.md §6.1 execute — D13, 불변 I2·I6). 서버 직렬화기로 구간마다 바이트를 만든다 — 브라우저
 * {@code TextEncoder} 는 UTF-8 만 인코딩하므로 EUC-KR 바이트 렌더의 기준은 서버다. 넘침 등 항목 오류는 {@code errors} 로 모으고 그
 * 칸을 {@code #} 로 채워 렌더를 멈추지 않는다. 같은 스냅샷으로 파싱한 결과를 함께 돌려준다.
 */
@Component
public class LayoutSampleRenderer {

    private static final byte MARK = '#';

    private final LayoutCodecs codecs;

    public LayoutSampleRenderer(LayoutCodecs codecs) {
        this.codecs = codecs;
    }

    public Map<String, Object> render(MdmLayoutSnapshot snapshot, Map<String, String> samples, LocalDateTime sendTime, long seq,
                                      Function<String, String> names) {
        Charset cs = LayoutSerializer.charset(snapshot);
        LayoutSerializer serializer = codecs.serializer();
        MdmLayoutSerializeContext ctx = new MdmLayoutSerializeContext(sendTime, seq);
        Map<String, Object> record = new LinkedHashMap<>(samples);
        List<LayoutSegment> segments = LayoutSegments.of(snapshot);
        byte[] line = new byte[snapshot.totalLength()];
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        for (int i = 0; i < segments.size(); i++) {
            LayoutSegment s = segments.get(i);
            MdmLayoutItemSnapshot item = s.item();
            byte[] b;
            try {
                b = serializer.encode(snapshot, s, record, ctx, cs);
            } catch (LayoutCodecException e) {
                errors.add(error(item.seq(), item.columnPhys(), e.getMessage()));
                b = new byte[s.length()];
                Arrays.fill(b, MARK);
            }
            System.arraycopy(b, 0, line, s.offset(), b.length);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("INDEX", i);
            row.put("ZONE", s.zone());
            row.put("HEADER_SEQ", s.headerSeq());
            row.put("ZONE_LABEL", s.body() ? "본문" : s.headerName());
            row.put("SEQ", item.seq());
            row.put("NAME", item.fillKind() == MdmFillKind.FILLER ? "여분" : name(names, item.columnPhys()));
            row.put("COLUMN_PHYS", item.columnPhys());
            row.put("FILL_KIND", item.fillKind().name());
            row.put("OFFSET", s.offset());
            row.put("LENGTH", s.length());
            row.put("POSITION", s.length() == 1 ? String.valueOf(s.offset() + 1) : (s.offset() + 1) + "-" + (s.offset() + s.length()));
            row.put("TEXT", new String(b, cs));
            rows.add(row);
        }
        List<Map<String, Object>> parsed = new ArrayList<>();
        try {
            for (Map.Entry<String, Object> e : codecs.parser().parse(snapshot, line).entrySet()) {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("COLUMN_PHYS", e.getKey());
                p.put("NAME", name(names, e.getKey()));
                p.put("VALUE", e.getValue() instanceof BigDecimal d ? d.toPlainString() : e.getValue());
                parsed.add(p);
            }
        } catch (LayoutCodecException e) {
            errors.add(error(e.seq(), e.columnPhys(), "파싱: " + e.getMessage()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("encoding", cs.name());
        out.put("totalBytes", line.length);
        out.put("line", new String(line, cs));
        out.put("segments", rows);
        out.put("parsed", parsed);
        out.put("errors", errors);
        out.put("issues", List.of());
        return out;
    }

    private static String name(Function<String, String> names, String phys) {
        String n = phys == null ? null : names.apply(phys);
        return n == null ? phys : n;
    }

    private static Map<String, Object> error(Integer seq, String phys, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("SEQ", seq);
        m.put("COLUMN_PHYS", phys);
        m.put("MESSAGE", message);
        return m;
    }
}
