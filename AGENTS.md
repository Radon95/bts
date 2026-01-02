The project is a server to use the badminton umpire panel (bup) (https://github.com/Radon95/bup.git) at tournaments.
It can connect to the third-party software "Badminton Tournament Planner" where a tournament is planned and where matches are scheduled and put onto courts etc.
It then shows the respective matches on the respective bup website and receives the (intermediate) results and if the "Badminton Tournament Planner" is connected puts them in there.

To setup the project run the following:
make
make dev
make run

The setup above pulls the current bup version on the initial setup.
To pull the newest version later run:
make bupdate
make install-bup-dev

If there are changes in bup needed tell me which changes and I can do them in the bup repository.
