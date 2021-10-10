#! /usr/bin/node
/***
 * This is just a series of functions to add and remove things from a SQLite Database rather than an object's attributes
 * The sphere, name, and room values all refer explicitly to object ids from the MUSH
 *
 * I haven't, as of 2021-08-19, rewritten all of the exposed function syntax.
 * The syntax for all functions is execscript(build/indexjs command args|separated|by|pipes)
 * Any argument that might conceivably have a space in it is passed via the registers not the arguments.
 *
 * Thanks to Ambrosia and Polk from the RhostMUSH discord server for their continued support and guidance in working
 * with execscript is warranted and given.
 */


const Database = require("better-sqlite3");
const db = new Database(__dirname+'/domain.db');

const functions = {
    'claimDomain':claimDomain,
    'addRoomToDomain':addRoomToDomain,
    'removeRoomFromDomain':removeRoomFromDomain,
    'addMembersToDomain':addMembersToDomain,
    'setDomainDetail':setDomainDetail,
    'revokeDomain':revokeDomain,
    'getDomainNamesByPlayer':getDomainNamesByPlayer,
    'removeMembersFromDomain':removeMembersFromDomain,
    'fetchDomainDetails':fetchDomainDetails,
    'setFeedingMethod':setFeedingMethod,
    'getFeedingMethod':getFeedingMethod,
    'setFeedingPool':setFeedingPool,
    'getFeedingPool':getFeedingPool,
    'getDomainSecurity':getDomainSecurity,
    'checkDomainMembership':checkDomainMembership,
    'transferDomain':transferDomain,
    'leaveDomain':leaveDomain,
    'adminListDomains':adminListDomains,
    'testregisters':function()
    {
        console.log(registers);
    },
    'test':async function(){
        let p = new Promise((resolve, reject)=>{
            setTimeout(()=>{
                resolve();
            },2000);
        });
        p.then(()=>{
            respond('This is how promises work');
        });
    }
};

/**
 * The code for this function came from https://github.com/RhostMUSH/deno-rhost/blob/master/rhost.js, courtesy of Polk
 * @param string
 */
function* convertStringTo128Bit(string)
{
    for(let char of string[Symbol.iterator]())
    {
        let cp = char.codePointAt(0);
        let out;
        if(cp > 127)
        {
            cp = cp.toString(0x10).padStart(4,'0');
            out =`%<u${cp}>`;
        }
        else
        {
            out = String.fromCodePoint(cp);
        }
        yield out;
    }
}

function respond(string)
{
    let response = '';
    for(let char of convertStringTo128Bit(string))
    {
        response += char;
    }

    process.stdout.write(response);
}

function adminListDomains()
{
    let stmt = db.prepare('SELECT idDomains, name, sphere, owner FROM domains');
    let qry = stmt.all();
    let results = [];
    for(let row of qry)
    {
        results.push(`${row.idDomains}~${row.name}~${row.sphere}~${row.owner}`);
    }
    respond(results.join('|'));
}

/**
 * This is an exposed function. The command line format for it is
 * execscript(domain/index.js, claimDomain <player object id>|<sphere object id>|<room object id>)
 * The name of the domain is stored as a register
 * @param player
 * @param sphere
 * @param room
 */
function claimDomain(player, sphere, room) {
    let name = registers.name.value;
    db.exec('BEGIN TRANSACTION');
    try
    {
        let idDomain;
        let error='';
        try {
            let stmt = db.prepare('INSERT INTO domains (name, sphere, owner) VALUES (?, ?, ?)');
            let query = stmt.run(name, sphere, player);
            idDomain = query.lastInsertRowid;
        }catch(e){
            respond(`You already have a domain named ${name}`);
            throw (e);
        }
        try {
            executeAddRoomToDomainQuery(idDomain, sphere, room);
        }catch(e){
            respond(`This room is already part of a domain for your sphere`);
            throw (e);
        }
        try {
            executeAddMembersToDomainQuery(idDomain, [player]);
        }catch(e){
            respond(`Could not execute query to add player to domain, rolling back. Please alert your system administrator.`);
            throw (e);
        }
        db.exec('COMMIT');
        respond(`You have claimed a domain and called it ${name}`);
    }catch(e)
    {
        db.exec('ROLLBACK');
    }

}

function transferDomain(oldOwner, newOwner)
{
    let name = registers.domain.value;
    try
    {
        let idDomains = getIdDomainsByPlayerAndName(oldOwner, name);
        let stmt = db.prepare('UPDATE domains SET owner = ? where name = ? AND owner = ?');
        stmt.run(newOwner, name, oldOwner);
        executeAddMembersToDomainQuery(idDomains, [newOwner]);
        respond(`Ownership of domain ${name} transferred.`);
    }
    catch(e)
    {
        console.log(e);
    }
}

/***
 * Removes the domain from the db
 * execscript(domain/index/js revokeDomain <player>|<domain>
 * @param player
 */
function revokeDomain(player)
{
    let domain = registers.domain.value;;
    try {
        let stmt = db.prepare("DELETE FROM domains WHERE owner = ? AND name = ?");
        stmt.run(player, domain);
        respond(`You have revoked your claim to the domain ${domain}`);
    }catch(e)
    {
        respond(`There was an error revoking your claim to the domain ${player} ${e.message}`);
    }
}

function getDomainNamesByPlayer(member)
{
    let stmt = db.prepare(
        "SELECT " +
            "d.name AS name " +
        "FROM " +
            "domains d " +
            "LEFT JOIN members m USING (idDomains) " +
        "WHERE " +
            "m.member = ?"
    );
    let qry = stmt.all(member);
    let results = [];
    for(let res of qry)
    {
        results.push(res.name);
    }
    let domains = results.join('|');
    respond(domains);
}

/**
 * Helper function to get the id of a domain
 * @param player
 * @param name
 * @returns {number} the id of the domain
 */
function getIdDomainsByPlayerAndName(player, name)
{
    let stmt = db.prepare('SELECT idDomains, name FROM domains WHERE owner = ? AND name = ?');
    let qry = stmt.get(player, name);
    return qry;
}

/**
 * This is an exposed function. The command line format for it is
 * node index.js addRoomToDomain [player object id] [sphere object id] [Name of Domain] [room object id]
 * @param player
 * @param sphere
 * @param name
 * @param room
 */
function addRoomToDomain(player, sphere, room)
{
    let name = registers.domain.value;
    let res = getIdDomainsByPlayerAndName(player, name);
    let idDomains = res.idDomains;
    let domainName = res.name;
    try {
        executeAddRoomToDomainQuery(idDomains, sphere, room);
        respond(`You have added this room to your domain ${domainName}`)
    }catch(e)
    {
        if(e.message.startsWith('UNIQUE constraint'))
        {
            respond('This room is already a part of a domain for this sphere');
        }
        else
        {
            respond(`There was an error adding this room to your domain ${domainName}`);
        }
    }
}

function executeAddRoomToDomainQuery(idDomain, sphere, room)
{
    let stmt = db.prepare('INSERT INTO rooms (idDomains, sphere, room) VALUES (?, ?, ?)');
    let query =stmt.run(idDomain, sphere, room);
}

function removeRoomFromDomain(player, sphere, room)
{
    let name = registers.domain.value;
    let res = getIdDomainsByPlayerAndName(player, name);
    let idDomains = res.idDomains;
    let domainName = res.name;
    try {
        executeRemoveRoomFromDomainQuery(idDomains, sphere, room);
        respond(`You have removed this room from your domain ${domainName}`)
    }catch(e)
    {
        respond(`There was an error removing your room from the domain. ${e.message}`);
    }
}

function executeRemoveRoomFromDomainQuery(idDomain, sphere, room)
{
    let stmt = db.prepare('DELETE FROM rooms WHERE idDomains = ? AND sphere = ? AND ROOM = ?');
    stmt.run(idDomain, sphere, room);
}

/***
 * This is an exposed function. The command line format for it is
 * exescript (domain/index.js, addPlayersToDomain, [player object id]|[Name of Domain]|[space separated list of player object ids, which are extracted from the arguments object])
 * @param owner
 * @param name
 */
function addMembersToDomain(owner) {
    let name = registers.domain.value;
    let args = Array.from(arguments);
    let players = args.slice(1);
    let res = getIdDomainsByPlayerAndName(owner, name);
    let idDomains = res.idDomains;
    try {
        executeAddMembersToDomainQuery(idDomains, players);
        respond('Added');
    }catch(e){
        respond('There was a problem adding player(s) to domain');
    }
}

/**
 * @param idDomain  The pkid of domain
 * @param players   An array of player object ids
 */
function executeAddMembersToDomainQuery(idDomain, players)
{
   let stmt = db.prepare('INSERT OR IGNORE INTO members (idDomains, member) VALUES (?, ?)');
    for(let player of players)
    {
        stmt.run(idDomain, player);
    }
}

/***
 * This is an exposed function. The command line format for it is
 * exescript (domain/index.js, removeMembersFromDomain, [player object id]|[Name of Domain]|[space separated list of player object ids, which are extracted from the arguments object])
 * @param owner
 * @param name
 */
function removeMembersFromDomain(owner)
{
    let name = registers.domain.value;
    let args = Array.from(arguments);
    let players = args.slice(2);
    let res = getIdDomainsByPlayerAndName(owner, name);
    let idDomains = res.idDomains;
    try
    {
        executeRemoveMembersFromDomainQuery(idDomains, players);
        respond('Removed players from the domain');
    }catch(e){
        respond(`There was a problem removing the player(s) from the domain ${e.message}`);
    }
}

function leaveDomain(user)
{
    try {
        let name = registers.domain.value;
        let domainStmt = db.prepare(
            'SELECT ' +
                    'd.idDomains AS idDomains ' +
                'FROM ' +
                    'domains d ' +
                    'LEFT JOIN members m USING (idDomains) ' +
                'WHERE ' +
                    'm.member = ? AND d.name = ?'
        );
        console.log(user, name);
        let idDomains = domainStmt.get(user, name).idDomains;
        executeRemoveMembersFromDomainQuery(idDomains, [user]);
        respond(`You have left the domain ${name}`);
    }catch(e){
        console.log(e);
    }
}

function checkDomainMembership(member, sphere, room)
{
    let stmt = db.prepare(
        'SELECT ' +
                'd.idDomains ' +
            'FROM ' +
                'domains d ' +
                    'LEFT JOIN rooms r USING (idDomains) ' +
                    'LEFT JOIN members m ON (m.idDomains = d.idDomains) ' +
            'WHERE ' +
                'r.room = ? AND m.member = ? AND d.sphere = ?'
    );
    let row = stmt.get(room, member, sphere);
    respond(""+(row?1:0));
}

/**
 * @param idDomain  The pkid of domain
 * @param players   An array of player object ids
 */
function executeRemoveMembersFromDomainQuery(idDomain, players)
{
    let stmt = db.prepare('DELETE FROM members WHERE idDomains = ? AND member = ?');
    for(let player of players)
    {
        let query = stmt.run(idDomain, player);
    }
}

/**
 * This is an exposed function. The command line format for it is
 * node index.js setDomainDetails [player object id] [Name of Domain] [key] [value]
 * @param player
 * @param name
 */
function setDomainDetail(player, key, value)
{
    let name = registers.domain.value;
    let idDomains = getIdDomainsByPlayerAndName(player, name).idDomains;
    key = key.toLowerCase();
    try {
        let stmt = db.prepare(
            'INSERT INTO details ' +
            '(idDomains, key, value) ' +
            'VALUES (?, ?, ?)' +
            'ON CONFLICT(key, idDomains) DO UPDATE SET value = excluded.value'
        );
        stmt.run(idDomains, key, value);
        respond(`Set ${key} to ${value} on domain ${name}`);
    }catch(e){
        respond(e.message);
    }
}

function getDomainSecurity(room)
{
    let sphere = registers.security.value;

    let stmt = db.prepare(
        'SELECT ' +
                'd.value, d.key ' +
            'FROM ' +
                'domains dom ' +
                    'LEFT JOIN details d USING (idDomains) ' +
                    'LEFT JOIN rooms r ON (d.idDomains = r.idDomains) ' +
            'WHERE ' +
                'r.room = ? and dom.sphere = ?'
    );
    let rows = stmt.all(room, sphere);
    let response = [];
    let details = {security:0, rating:0};
    for(let row of rows)
    {
        details[row.key] = row.value;
    }

    for(const [key, value] of Object.entries(details))
    {
        response.push(`${key}:${value}`);
    }

    respond(response.join('|'));
}

/**
 * This function finds the domain named <domainName> that the <player> is a member of and returns the detaisl
 * The details are returned as a single string not ready for display and so the zone object will need to format
 * accordingly.
 * @param player
 * @param domainName
 */
function fetchDomainDetails(player)
{
    let domainName = registers.domain.value;

    try {
        let domainStmt = db.prepare(
            'SELECT ' +
            'd.name AS name, d.idDomains AS idDomains, d.owner AS owner ' +
            'FROM ' +
            'domains d LEFT JOIN members m USING(idDomains) ' +
            'WHERE ' +
            'm.member = ? AND d.name = ?'
        );
        let domainQry = domainStmt.get(player, domainName);
        let {idDomains, owner} = domainQry;
        let response = `Domain Name~${domainName}|Owner~${owner}`;
        let members=getDomainRecords('member', idDomains);
        response += `|Members~${members.join('*')}`;
        let rooms = getDomainRecords('room', idDomains);
        response += `|Rooms~${rooms.join('*')}`;
        let detailsStmt = db.prepare('SELECT key, value FROM details WHERE idDomains = ?');
        let detailsQry = detailsStmt.all(idDomains);
        for(let detail of detailsQry)
        {
            response += `|${detail.key}~${detail.value}`;
        }
        respond(response);
    }catch(e){
        console.log(e);
    }
}

function getDomainRecords(recordType, idDomains)
{
    let recordStmt = db.prepare(`SELECT ${recordType} FROM ${recordType}s WHERE idDomains = ?`);
    let recordQry = recordStmt.all(idDomains);
    let records = [];
    for(let record of recordQry)
    {
        records.push(record[recordType]);
    }
    return records;
}

function setFeedingMethod()
{
    let feedingStmt = db.prepare('INSERT INTO feeding (player, method) VALUES (?,?) ON CONFLICT DO UPDATE SET method = excluded.method');
    feedingStmt.run(registers.user.value, registers.method.value);
    respond(`Set feeding method to ${registers.method.value}`);
}

function getFeedingMethod()
{
    let feedingStmt = db.prepare('SELECT method FROM feeding WHERE player = ?');
    let qry = feedingStmt.get(registers.user.value);
    respond(qry.method);
}

/**
 * @param player
 */
function setFeedingPool()
{
    let feedingStmt = db.prepare('INSERT INTO feeding (player, pool) VALUES (?,?) ON CONFLICT DO UPDATE SET pool = excluded.pool');
    feedingStmt.run(registers.user.value, registers.pool.value);
    respond(`Set feeding pool to ${registers.pool.value}`);
}

function getFeedingPool()
{
    let feedingStmt = db.prepare('SELECT pool FROM feeding WHERE player = ?');
    let qry = feedingStmt.get(registers.user.value);
    respond(qry.pool);
}

function parseCommand(command, args)
{
    let func;
    let functionKeys = Object.keys(functions);
    if(functionKeys.indexOf(command) >=0) {
        func = functions[command];
        try {
            if (args) {
                func(...args);
            } else {
                func();
            }
        } catch (e){
            console.log(e);
        }
    }
    else
    {
        respond(`#-1 Unknown command ${command}`);
    }
}
let command, args, argvparts=process.argv.slice(2,3)[0].split(' ');

let registers={};

Object.keys(process.env).filter(key=> key.match(/^MUSHQ_/)).forEach(function(key){
    let reg = key.replace('MUSHQ_', '');
    let name = process.env[`MUSHQN_${reg}`];
    let value = process.env[key];
    registers[name]={
        register:reg,
        name:name,
        value:value
    };

});


if(argvparts.length > 1)
{
    let argparts;
    [command, argparts]=argvparts;
    args=argparts.split('|');
}
else
{
    command = argvparts[0];
}

parseCommand(command, args);