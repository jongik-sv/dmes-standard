package com.dongkuk.dmes.mdm.contract.mastercode;

import java.util.List;

/**
 * 코드 행의 선분 밖 값. {@code lvls} 는 길이 {@link MasterCodeConventions#LVL_SLOTS}(0번 = lvl1), {@code attrs} 는 길이
 * {@link MasterCodeConventions#ATTR_SLOTS}(0번 = attr01)이며 원소는 null 을 허용한다. 길이 검사는 구현(06-03)이 한다.
 */
public record MasterCodeItemValues(String name, String alterName, Integer seq, String description,
                                   List<String> lvls, List<String> attrs) {
}
