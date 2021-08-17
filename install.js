const Database = require("better-sqlite3");
let db = new Database('domain.db');

// tables
db.exec('CREATE TABLE IF NOT EXISTS domains         (idDomains INTEGER PRIMARY KEY, sphere STRING, owner STRING, name STRING)');
db.exec('CREATE TABLE IF NOT EXISTS rooms           (idDomains INTEGER, sphere STRING, room STRING, FOREIGN KEY (idDomains) REFERENCES domains(idDomains))');
db.exec('CREATE TABLE IF NOT EXISTS members         (idDomains INTEGER, member STRING, FOREIGN KEY (idDomains) REFERENCES domains(idDomains))');
db.exec('CREATE TABLE IF NOT EXISTS details         (idDomains INTEGER, key STRING, value STRING, FOREIGN KEY (idDomains) REFERENCES domains(idDomains), UNIQUE (idDomains, key))');

// unique indexes
// using this format so i have names, which is super useful for control flow
db.exec('CREATE UNIQUE INDEX unique_player_domain_names ON domains (name, owner)');
db.exec('CREATE UNIQUE INDEX unique_sphere_room ON rooms (sphere, room)');