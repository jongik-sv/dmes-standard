package kr.dongkuk.maru.mdm.engine.testsupport;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 코드 이력 생성기(D-154 스펙 부록 A.1 의 시험판, 결정적 seed). 첫 버전에 코드마다 열린 행 하나, 버전마다 {@code changeRatio} 만큼의 코드가 이전
 * 행을 닫고 새 행을 연다(ATTR01 은 약 25% 가 "X"). TABLE {@code TB} 소속도 바뀐 코드만 구간을 끊는다. 적용 구간은 하루씩 연속이고 마지막 RELEASED
 * 는 열린 끝, 그 뒤 초안(DRAFT) 하나가 열린 행 전체를 사본으로 만든다. 카테고리는 BASE(.*), RX(REGEX ATTR01 X), TB(TABLE) 셋이다.
 */
public final class CodeHistoryGenerator {

    private static final BigDecimal OPEN_VER = new BigDecimal("9999.000");
    private static final LocalDateTime OPEN_DT = LocalDateTime.parse("9999-12-31T00:00:00");
    private static final LocalDateTime START = LocalDateTime.parse("2025-01-01T00:00:00");

    private CodeHistoryGenerator() {}

    public static CodeRows generate(String id, int releasedCount, int codeCount, double changeRatio, long seed) {
        Random rnd = new Random(seed);
        List<CodeVersionRow> versions = new ArrayList<>();
        List<CodeItemRow> items = new ArrayList<>();
        List<CodeCateItemRow> cateItems = new ArrayList<>();
        BigDecimal v1 = ver(1);
        String[] attr = new String[codeCount];
        BigDecimal[] itemFrom = new BigDecimal[codeCount];
        boolean[] inTb = new boolean[codeCount];
        BigDecimal[] tbFrom = new BigDecimal[codeCount];
        for (int c = 0; c < codeCount; c++) {
            attr[c] = rnd.nextInt(4) == 0 ? "X" : "Y";
            itemFrom[c] = v1;
            inTb[c] = rnd.nextBoolean();
            tbFrom[c] = v1;
        }
        for (int n = 1; n <= releasedCount; n++) {
            BigDecimal v = ver(n);
            versions.add(new CodeVersionRow(v, "RELEASED", START.plusDays(n - 1L), n == releasedCount ? OPEN_DT : START.plusDays(n)));
            if (n == 1) {
                continue;
            }
            for (int c = 0; c < codeCount; c++) {
                if (rnd.nextDouble() >= changeRatio) {
                    continue;
                }
                items.add(item(c, itemFrom[c], v, attr[c]));
                attr[c] = rnd.nextInt(4) == 0 ? "X" : "Y";
                itemFrom[c] = v;
                if (inTb[c]) {
                    cateItems.add(new CodeCateItemRow("TB", code(c), tbFrom[c], v));
                }
                inTb[c] = rnd.nextBoolean();
                tbFrom[c] = v;
            }
        }
        BigDecimal draft = ver(releasedCount + 1);
        versions.add(new CodeVersionRow(draft, "DRAFT", null, null));
        for (int c = 0; c < codeCount; c++) {
            items.add(item(c, itemFrom[c], draft, attr[c]));
            items.add(item(c, draft, OPEN_VER, attr[c]));
            if (inTb[c]) {
                cateItems.add(new CodeCateItemRow("TB", code(c), tbFrom[c], draft));
                cateItems.add(new CodeCateItemRow("TB", code(c), draft, OPEN_VER));
            }
        }
        List<CodeCateRow> cates = List.of(
                new CodeCateRow("BASE", v1, OPEN_VER, "REGEX", ".*", "CODE"),
                new CodeCateRow("RX", v1, OPEN_VER, "REGEX", "X", "ATTR01"),
                new CodeCateRow("TB", v1, OPEN_VER, "TABLE", null, null));
        return new CodeRows(new CodeHeader(id, "INUSE"), versions, items, cates, cateItems);
    }

    public static String code(int c) {
        return String.format("C%04d", c);
    }

    private static CodeItemRow item(int c, BigDecimal from, BigDecimal to, String attr01) {
        String[] attrs = new String[10];
        attrs[0] = attr01;
        attrs[1] = "a" + c;
        return new CodeItemRow(code(c), from, to, "코드" + c, null, c % 7, Arrays.asList(c % 2 == 0 ? "A" : "B", null, null, null, null),
                Arrays.asList(attrs));
    }

    private static BigDecimal ver(int n) {
        return new BigDecimal(n).setScale(3);
    }
}
