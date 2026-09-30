package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/** 해석 결과. 오류가 있으면 {@code tree} 는 null 이고 {@code issues} 가 비어 있지 않다. */
public record FlowParse(@Nullable FlowTree tree, List<FlowIssue> issues) {}
