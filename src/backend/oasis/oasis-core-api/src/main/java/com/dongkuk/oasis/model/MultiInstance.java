package com.dongkuk.oasis.model;

/**
 * @author Jeongjin Kim
 * @since 2021-07-16
 */
public interface MultiInstance {

    /**
     * @return nonMultiInstance 객체 반환
     */
    static MultiInstance nonMultiInstance() {
        return new MultiInstance() {
            @Override
            public MultiInstanceType multiInstanceType() {
                return MultiInstanceType.NONE;
            }

            @Override
            public String collectionName() {
                throw new UnsupportedOperationException("Unsupported attribute.");
            }

            @Override
            public String itemVariableName() {
                throw new UnsupportedOperationException("Unsupported attribute.");
            }
        };
    }

    /**
     * @return nonMultiInstance 객체 반환
     */
    static MultiInstance loopMultiInstance() {
        return new MultiInstance() {
            @Override
            public MultiInstanceType multiInstanceType() {
                return MultiInstanceType.LOOP;
            }

            @Override
            public String collectionName() {
                throw new UnsupportedOperationException("Unsupported attribute.");
            }

            @Override
            public String itemVariableName() {
                throw new UnsupportedOperationException("Unsupported attribute.");
            }
        };
    }

    /**
     * @return 멀티 인스턴스 타입
     */
    MultiInstanceType multiInstanceType();

    /**
     * @return 요소 순회에 사용할 컬렉션 이름
     */
    String collectionName();

    /**
     * @return 컬렉션 요소에 바인딩 되는 변수 이름
     */
    String itemVariableName();
}
