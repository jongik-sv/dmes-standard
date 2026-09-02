# Task의 마커와 타입

![](https://blog.kakaocdn.net/dn/N14E3/btqFg4pQ18w/G1akmYL4UmifKZp9Yy3NRK/img.png)

Task는 프로세스 흐름 상에서 더 이상 상세 레벨로 내려갈 수 없는 가장 작은 단위이다. 일반적으로 사람이나 애플리케이션이 실제로 행동하는 것을 표현하는 단위이기도 하다.

# Taks의 Maker

Task는 Loop, Multi-Instance, Compensation 3가지 타입 마커를 넣어서 더 상세하게 표현 할 수 있다.

![](https://blog.kakaocdn.net/dn/OsHFS/btqFg4Ds1sQ/oeq17Q9RnbbGs275fO5tCK/img.png)

# Task의 Type

## Service Task

![](https://blog.kakaocdn.net/dn/daQlb3/btqFjF23qVV/6WnEAfRjWckJS9kNqQmH11/img.png)

서비스의 일종이고 웹 서비스나 자동화된 애플리케이션일 수 있다.

## Send Task

![](https://blog.kakaocdn.net/dn/PBTvH/btqFjdsoy33/WaURI0c1gDj9QIyVTFcT71/img.png)

Message를 외부 참여자에게 보내기 위한 Task 이다. 메시지를 전송하면 해당 Task는 종료된다.

## Receive Task

![](https://blog.kakaocdn.net/dn/bwmmwX/btqFizpa8dP/z9iVppTohVhg0QijByyLi0/img.png)

외부 참여자가 보내는 Message를 수신하기 위해 기다리는 Task이다. 메시지를 수신하면 Taks는 종료된다.

## User Task

![](https://blog.kakaocdn.net/dn/OJPHJ/btqFgHBJXz7/uhkVxV2UR0NTk658s9Ltr0/img.png)

사람이 소프트웨어 애플리케이션을 통해 수행하는 일반적인 일을 표현하기 위한 Task이다.

## Manual Task

![](https://blog.kakaocdn.net/dn/bXZwJC/btqFjplRA6M/kZXqNr6mfG5jCjGX7KmIYK/img.png)

소프트웨어 애플리케이션을 사용하지 않고 사람이 직접 수행하는 Task이다. *설비를 A장소에 설치* 등을 예를 들 수 있다.

## Business Rule

![](https://blog.kakaocdn.net/dn/vsMoa/btqFg5bfv7M/WvEvYQZJTb9GG6UtlwLr0K/img.png)

비스니스 규칙 엔진에 입력값을 넣고, 결과 얻는 Task이다.

## Script Task

![](https://blog.kakaocdn.net/dn/sMbVC/btqFizvVpzO/kSQFtabjEW9bb4pjz2Tw31/img.png)

비즈니스 프로세스 엔진에 의해서 실행되는 Task이다. 모델러나 개발자가 스크립트를 작성하여 넣으면 엔진에 의해서 스크립트가 실행된다. 스크립트가 다 실행되면 Task는 종료된다.