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