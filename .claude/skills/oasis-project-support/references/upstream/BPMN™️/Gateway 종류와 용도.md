# Gateway 종류와 용도

게이트웨이는 시퀀스 흐름이 프로세스 내에서 모이고 흩어지는 방식을 제어하는데 사용한다.

![](https://blog.kakaocdn.net/dn/brxGDP/btqWKY6wT94/nCqkI1lD0uRsdFIJcZQJZ0/img.png)

다른 액티비티와 마찬가지로 토큰을 소비하고 토큰 추가 만들 수 있다. 모든 비즈니스 프로세스 흐름을 정의하는데 결정, 분기, 모이기, 복사, 연결 등에 사용할 수 있다.

![](https://blog.kakaocdn.net/dn/m5aEe/btqWLZc3uN4/IWnwffQMGvjB6oZW0KTGa1/img.png)

게이트웨이는 발산 및 수렴을 제어하는데 이 말은 여러 인풋, 여러 아웃풋을 가질 수 있다는 의미임.

# Exclusive Gateway

한 곳만 선택하여 토큰을 보낸다.

![](https://blog.kakaocdn.net/dn/dyscd0/btqWNdvnQQm/t5bwM7MY5ZbVvKqfrw2DK0/img.png)

# Inclusive Gateway

모든 흐름이 평가되고 참인 곳으로 모두 토큰을 보낸다. 병렬로 흩어진 흐름을 모으는데도 사용한다. 토큰이 게이트웨이에 도착하면 다른 흐름에서 오는 토큰을 기다릴 수 있다.

![](https://blog.kakaocdn.net/dn/xi41T/btqWBAFuXrj/fhhdQEK30M7PxYU2zNlVKK/img.png)

# Parallel Gateway

흐름에 대한 평가를 하지 않고 모든 흐름으로 토큰을 보낸다.

![](https://blog.kakaocdn.net/dn/dMrTKQ/btqWOfT0dDu/7ROFpcOxAyonoI1rRBQeoK/img.png)

흐름에 대한 평가를 하지 않고 모든 흐름으로 토큰을 보냄

![](https://blog.kakaocdn.net/dn/bCiWHs/btqWOgeksyi/uu7sDROjrBzDXYjQORYNSK/img.png)

# Complex Gateway

Complex 게이트웨이는 복잡한 동기화 동작을 모델링하는 데 사용할 수 있다. Expression activationCondition은 정확한 동작을 설명하는 데 사용한다. 예를 들어,이 표현식은 게이트웨이를 활성화하기 위해 5 개의 수신 시퀀스 흐름 중 3 개의 토큰이 필요하도록 지정할 수 있다. 게이트웨이에서 생성되는 토큰은 포함 게이트웨이의 분할 동작에서와 같이 나가는 시퀀스 흐름의 조건에 따라 결정된다. 토큰이 나머지 두 시퀀스 흐름에 나중에 도착하면 해당 토큰으로 인해 게이트웨이가 재설정되고 나가는 시퀀스 흐름에서 새 토큰이 생성 될 수 있있다. 재설정하기 전에 추가 토큰을 기다려야하는지 여부를 판별하기 위해 게이트웨이는 포함 게이트웨이의 동기화 의미를 사용한다.

Complex 게이트웨이는 다른 게이트웨이와 달리 내부 상태가 있으며, 이는 부울 인스턴스 속성 waitingForStart로 표시되며, 이는 초기에 true이고 활성화 후 false가 된다. 이 속성은 나가는 시퀀스 흐름의 조건에서 사용되어 활성화시 토큰이 생성되는 위치와 재설정시 토큰이 생성되는 위치를 지정할 수 있다. 나가는 각 시퀀스 흐름은 활성화 또는 재설정시 토큰을 얻지 만 둘 다받는 것이 좋다. 적어도 하나의 나가는 시퀀스 흐름은 활성화시 토큰을 받아야하지만 토큰은 재설정시 생성되지 않아야한다.

![](https://blog.kakaocdn.net/dn/bZtUB9/btqWKZRVQKM/HrNUUPpnA9lFf36dXurhO1/img.png)

# Event-Based Gateway

게이트웨이에 달린 이벤트 들 중에 먼저 온 곳으로 토큰을 보낸다.

![](https://blog.kakaocdn.net/dn/bfpTFQ/btqWLZc391S/Sjmkp1KEwSnGIlZUjGeSok/img.png)