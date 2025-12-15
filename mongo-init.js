
const DB = process.env.RSK_DB_CONNECTION_DATABASE;
const USER = process.env.RSK_DB_CONNECTION_USER;
const PASS = process.env.RSK_DB_CONNECTION_PASSWORD;

// Use the database
db = db.getSiblingDB(DB);

// Create user
db.createUser({
  user: USER,
  pwd: PASS,
  roles: [{
    role: 'readWrite',
    db: DB
  }]
})