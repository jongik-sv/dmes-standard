package kr.dongkuk.maru.mdm.engine.testsupport;

import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.OPEN_DT;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.attrs;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.dt;
import static kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures.lvl;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.code.MasterDataResolver;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataCateItemRow;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataCateRow;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataHeader;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataItemRow;

/**
 * 05 샘플 데이터 PORT(05-master-data.md:705-760, TSK-03-02 design.md §3.4).
 *
 * <p>원천은 사건 3(CSV 적재 2026-08-20 09:00)·5(KRPUS 수정 2026-08-25 09:00)·6(KRINC 닫기 2026-09-01 09:00)의 시각만 준다.
 * 나머지는 design §3.4 가정이다: 사건 1 BASE 생성 2026-08-19 09:00, 사건 4 KR 등록 2026-08-21 09:00,
 * 사건 7 MAJOR 등록 2026-09-02 09:00, 사건 8 MAJOR 소속 저장 2026-09-03 09:00.
 */
public final class PortFixtures {

    public static final String PORT = "PORT";

    private PortFixtures() {}

    public static MasterDataRows port() {
        return port(null);
    }

    public static MasterDataRows port(LocalDateTime closedAt) {
        return new MasterDataRows(
                new DataHeader(PORT, closedAt == null ? "INUSE" : "DEPRECATED", closedAt),
                List.of(
                        item("KRPUS", "부산", "KR", "2026-08-20T09:00", "2026-08-25T09:00"),
                        item("KRPUS", "부산항", "KR", "2026-08-25T09:00", null),
                        item("KRINC", "인천", "KR", "2026-08-20T09:00", "2026-09-01T09:00"),
                        item("CNSHA", "상하이", "CN", "2026-08-20T09:00", null)),
                List.of(
                        new DataCateRow("BASE", "REGEX", ".*", "KEY", dt("2026-08-19T09:00"), OPEN_DT),
                        new DataCateRow("KR", "REGEX", "^KR$", "ATTR01", dt("2026-08-21T09:00"), OPEN_DT),
                        new DataCateRow("MAJOR", "TABLE", null, null, dt("2026-09-02T09:00"), OPEN_DT)),
                List.of(
                        new DataCateItemRow("MAJOR", "KRPUS", dt("2026-09-03T09:00"), OPEN_DT),
                        new DataCateItemRow("MAJOR", "CNSHA", dt("2026-09-03T09:00"), OPEN_DT)));
    }

    /** 항목 행 하나. {@code to} 가 null 이면 열린 행(9999-12-31). */
    public static DataItemRow item(String code, String name, String attr01, String from, String to) {
        return new DataItemRow(code, name, null, null, lvl(), attrs(attr01), dt(from), to == null ? OPEN_DT : dt(to));
    }

    /** 행 묶음 여러 개를 마루 데이터 ID 로 찾는 판정기. */
    public static MasterDataResolver resolver(MasterDataRows... rows) {
        Map<String, MasterDataRows> byId = Arrays.stream(rows)
                .collect(Collectors.toMap(r -> r.header().maruDataId(), Function.identity()));
        return new MasterDataResolver(id -> Optional.ofNullable(byId.get(id)));
    }
}
