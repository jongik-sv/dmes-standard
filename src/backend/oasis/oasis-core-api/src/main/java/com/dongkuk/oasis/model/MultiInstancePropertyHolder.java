package com.dongkuk.oasis.model;

/**
 * @author Jeongjin Kim
 * @since 2021-08-02
 */
public class MultiInstancePropertyHolder implements MultiInstance {
    private final MultiInstanceType multiInstanceType;
    private final String collectionName;
    private final String itemVariableName;

    /**
     * @param multiInstanceType 멀티인스턴스 타입
     * @param collectionName    컬렉션 이름
     * @param itemVariableName  컬렉션 아이템 이름
     */
    public MultiInstancePropertyHolder(MultiInstanceType multiInstanceType,
                                       String collectionName,
                                       String itemVariableName) {
        this.multiInstanceType = multiInstanceType;
        this.collectionName = collectionName;
        this.itemVariableName = itemVariableName;
    }

    /**
     * @param multiInstanceType 멀티인스턴스 타입
     */
    public MultiInstancePropertyHolder(MultiInstanceType multiInstanceType) {
        this(multiInstanceType, null, null);
    }

    @Override
    public MultiInstanceType multiInstanceType() {
        return multiInstanceType;
    }

    @Override
    public String collectionName() {
        return collectionName;
    }

    @Override
    public String itemVariableName() {
        return itemVariableName;
    }
}
