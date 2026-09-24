package com.dongkuk.dmes.mdm.contract.mastercode;

import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.util.List;

/** 버전 V 의 모습 = 세 표에서 {@code from_ver <= V < to_ver} 인 행(04:33). */
public record MasterCodeVersionView(VersionRef version, List<MasterCodeItemRow> items,
                                    List<MasterCodeCateRow> categories, List<MasterCodeCateItemRow> cateItems) {
}
