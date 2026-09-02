CREATE TABLE users
(
    id        integer      NOT NULL,
    firstName varchar(255) not null,
    lastName  varchar(255) not null,
    primary key (id)
);
insert into users(id, firstName, lastName) values(0, 'jj','kim');
insert into users(id, firstName, lastName) values(1, 'yy','yun');
insert into users(id, firstName, lastName) values(2, 'aa','park');

CREATE TABLE members
(
    id        varchar(255)      NOT NULL,
    firstName varchar(255) not null,
    lastName  varchar(255) not null,
    primary key (id)
);
insert into members(id, firstName, lastName) values('0', 'jj','kim');
insert into members(id, firstName, lastName) values('1', 'yy','kim');
insert into members(id, firstName, lastName) values('2', 'aa','park');

CREATE TABLE history
(
    id        varchar(255)      NOT NULL,
    firstName varchar(255) not null,
    lastName  varchar(255) not null,
    age       int not null,
    primary key (id)
);
insert into history(id, firstName, lastName, age) values('0', 'jj','kim', 10);
insert into history(id, firstName, lastName, age) values('1', 'yy','kim', 20);
insert into history(id, firstName, lastName, age) values('2', 'aa','park', 30);
insert into history(id, firstName, lastName, age) values('3', 'bb','lee', 25);
insert into history(id, firstName, lastName, age) values('4', 'cc','park', 30);
insert into history(id, firstName, lastName, age) values('5', 'zz','yoo', 40);