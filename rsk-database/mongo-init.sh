set -e
DB=rsk # $MONGO_INITDB_DATABASE
USER=api-user # $MONGO_INITDB_USER
PASS=pwd # $MONGO_INITDB_PASS
# TODO: for some reason the sh file is not using the env variables set in the yml file so I'm hardcoding them

mongo <<EOF
use $DB

db.createUser({
  user: '$USER',
  pwd: '$PASS',
  roles: [{
    role: 'readWrite',
    db: '$DB'
  }]
})
EOF
