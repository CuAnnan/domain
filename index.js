#! /usr/bin/node
/***
 * This is just a series of functions to add and remove things from a SQLite Database rather than an object's attributes
 * The sphere, name, and room values all refer explicitly to object ids from the MUSH
 *
 * I haven't, as of 2021-08-19, rewritten all of the exposed function syntax.
 * The syntax for all functions is execscript(build/indexjs command args|separated|by|pipes)
 *
 * Thanks to Ambrosia and Polk from the RhostMUSH discord server for their continued support and guidance in working
 * with execscript is warranted and given.
 */

// TODO: move away from command line arguments and towards using registers which are exposed to process as environment variables

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
    'test':function(){

        for(let key in process.env)
        {
            if(key.startsWith('MUSHQN_')) {
                console.log(key);
            }
        }
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

/**
 * This is an exposed function. The command line format for it is
 * execscript(domain/index.js, claimDomain <player object id>|<sphere object id>|<Name of Domain>|<room object id>)
 * @param player
 * @param sphere
 * @param name
 * @param room
 */
function claimDomain(player, sphere, name, room) {
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

/***
 * Removes the domain from the db
 * execscript(domain/index/js revokeDomain <player>|<domain>
 * @param player
 * @param domain
 */
function revokeDomain(player, domain)
{
    try {
        let stmt = db.prepare("DELETE FROM domains WHERE owner = ? AND name = ?");
        stmt.run(player, domain);
        respond(`You have revoked your claim to the domain ${domain}`);
    }catch(e)
    {
        respond(`There was an error revoking your claim to the domain ${player} ${e.message}`);
    }
}

function getDomainNamesByPlayer(domainName)
{
    let stmt = db.prepare("SELECT name FROM domains WHERE owner = ?");
    let qry = stmt.all(domainName);
    let results = [];
    for(let res of qry)
    {
        results.push(res.name);
    }
    let domainsOwned = results.join('|');
    respond(domainsOwned);
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
function addRoomToDomain(player, sphere, name, room)
{
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

function removeRoomFromDomain(player, sphere, name, room)
{
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
function addMembersToDomain(owner, name) {
    let args = Array.from(arguments);
    let players = args.slice(2);
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
   let stmt = db.prepare('INSERT INTO members (idDomains, member) VALUES (?, ?)');
    for(let player of players)
    {
        let query = stmt.run(idDomain, player);
    }
}

/***
 * This is an exposed function. The command line format for it is
 * exescript (domain/index.js, removeMembersFromDomain, [player object id]|[Name of Domain]|[space separated list of player object ids, which are extracted from the arguments object])
 * @param owner
 * @param name
 */
function removeMembersFromDomain(owner, name)
{
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
function setDomainDetail(player, name, key, value)
{
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

/**
 * This function finds the domain named <domainName> that the <player> is a member of and returns the detaisl
 * The details are returned as a single string not ready for display and so the zone object will need to format
 * accordingly.
 * @param player
 * @param domainName
 */
function fetchDomainDetails(player, domainName)
{
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