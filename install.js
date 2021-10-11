const Database = require("better-sqlite3");let db = new Database('domain.db');// tables for domainsdb.exec('CREATE TABLE IF NOT EXISTS domains (idDomains INTEGER PRIMARY KEY, sphere STRING, owner STRING, name STRING)');db.exec('CREATE TABLE IF NOT EXISTS rooms (idDomains INTEGER REFERENCES domains(idDomains) ON DELETE CASCADE, sphere STRING, room STRING)');db.exec('CREATE TABLE IF NOT EXISTS members (idDomains INTEGER REFERENCES domains(idDomains) ON DELETE CASCADE, member STRING)');db.exec('CREATE TABLE IF NOT EXISTS details (idDomains INTEGER REFERENCES domains(idDomains) ON DELETE CASCADE, key STRING, value STRING)');// unique indexes for domainsdb.exec('CREATE UNIQUE INDEX unique_player_domain_names ON domains (name, owner)');db.exec('CREATE UNIQUE INDEX unique_sphere_domain_name ON domains (name, sphere)');db.exec('CREATE UNIQUE INDEX unique_sphere_room ON rooms (sphere, room)');db.exec('CREATE UNIQUE INDEX unique_member_domain ON members (member, idDomains)');db.exec('CREATE UNIQUE INDEX unique_domain_detail ON details (idDomains, key)');// table for feeding stuffdb.exec('CREATE TABLE IF NOT EXISTS feeding (player STRING, method STRING, pool STRING)');// unique index used for upsertdb.exec('CREATE UNIQUE INDEX unique_player_feeding ON feeding (player)');// table for boons stuffdb.exec('CREATE TABLE IF NOT EXISTS boons (idBoons INTEGER PRIMARY KEY, magnitude STRING, from STRING, to STRING, holder STRING, acknowledged INTEGER DEFAULT 0, validated INTEGER DEFAULT 0, date INTEGER)');// indices for searchingdb.exec('CREATE INDEX search_from ON boons (from)');db.exec('CREATE INDEX search_to ON boons(to)');db.exec('CREATE INDEX search_holder ON boons(holder)');