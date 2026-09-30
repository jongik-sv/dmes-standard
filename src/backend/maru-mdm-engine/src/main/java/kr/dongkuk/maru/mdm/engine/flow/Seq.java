package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;

/** 차례로 실행하는 블록들. 빈 목록이면 빈 갈래다. */
public record Seq(List<Block> items) implements Block {}
