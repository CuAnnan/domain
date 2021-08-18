#! /usr/bin/env node
/***
 * This is just a series of functions to add and remove things from a SQLite Database rather than an object's attributes
 * The sphere, name, and room values all refer explicitly to object ids from the MUSH
 */


const Database = require("better-sqlite3");
const db = new Database('domain.db');

const functions = {
    'claimDomain':claimDomain,
    'addRoomToDomain':addRoomToDomain,
    'addPlayersToDomain':addPlayersToDomain,
    'setDomainDetails':setDomainDetails,
    'test':()=>{
        return 'success';
    }
};

/**
 * This is an exposed function. The command line format for it is
 * node index.js claimDomain [player object id] [sphere object id] [Name of Domain] [room object id]
 * @param player
 * @param sphere
 * @param name
 * @param room
 * @returns {number} 1 on success, otherwise throws an exception
 */
function claimDomain(player, sphere, name, room)
{
    let stmt = db.prepare('INSERT INTO domains (name, sphere, owner) VALUES (?, ?, ?)');
    let query = stmt.run(name, sphere, player);
    let idDomain = query.lastInsertRowid;
    executeAddRoomToDomainQuery(idDomain, sphere, room);
    executeAddPlayersToDomainQuery(idDomain, player);
    return 1;
}

/**
 * Helper function to get the id of a domain
 * @param player
 * @param name
 * @returns {number} the id of the domain
 */
function getIdDomainsByPlayerAndName(player, name)
{
    let stmt = db.prepare('SELECT idDomains FROM domains WHERE owner = ? AND name = ?');
    let qry = stmt.get(player, name);
    return qry.idDomains;
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
    let idDomains = getIdDomainsByPlayerAndName(player, name);
    executeAddRoomToDomainQuery(idDomains)
}

function executeAddRoomToDomainQuery(idDomain, sphere, room)
{
    let stmt = db.prepare('INSERT INTO rooms (idDomains, sphere, room) VALUES (?, ?, ?)');
    let query =stmt.run(idDomain, sphere, room);
    return 1;
}

/***
 * This is an exposed function. The command line format for it is
 * node index.js addPlayersToDomain [player object id] [Name of Domain] [space separated list of player object ids, which are extracted from the arguments object]
 * @param owner
 * @param name
 */
function addPlayersToDomain(owner, name) {
    let players = Array.from(arguments).slice(2);
    let idDomains = getIdDomainsByPlayerAndName(owner, name);
    executeAddPlayersToDomainQuery(idDomains, players);
}

function executeAddPlayersToDomainQuery(idDomain, players)
{
    let stmt = db.prepare('INSERT INTO members (idDomains, member) VALUES (?, ?)');
    for(let player of players)
    {
        let query = stmt.run(idDomain, player);
    }
    return 1;
}

/**
 * This is an exposed function. The command line format for it is
 * node index.js setDomainDetails [player object id] [Name of Domain] [space separated list of pairs of key value settings, which are extracted from the arguments object]
 * @param player
 * @param name
 */
function setDomainDetails(player, name)
{
    let idDomains = getIdDomainsByPlayerAndName(player, name);
    let pairs = Array.from(arguments).slice(2);
    if(pairs.length %2)
    {
        throw new Error('Invalid number of domain detail key/value pairs provided');
    }
    let keyValues = {};
    while(pairs.length)
    {
        keyValues[pairs.shift()] = pairs.shift();
    }

    let stmt = db.prepare(
        'INSERT INTO details ' +
            '(idDomains, key, value) ' +
            'VALUES (?, ?, ?)' +
            'ON CONFLICT(key, idDomains) DO UPDATE SET value = excluded.value'
    );
    for(let [key,value] of Object.entries(keyValues))
    {
        stmt.run(idDomains, key, value);
    }
    return 1;
}


function parseCommand(command, args)
{
    let func;
    let functionKeys = Object.keys(functions);
    if(functionKeys.indexOf(command) >=0)
    {
        func = functions[command];
        db.exec('BEGIN TRANSACTION');
        try {
            console.log(func(...args));
            db.exec('COMMIT');
        }
        catch(e)
        {
            console.log('#-1', e.message);
            db.exec('ROLLBACK');
        }
    }
    else
    {
        console.log('#-1 Unknown command');
    }
}

let command = process.argv.slice(2,3)[0], args = process.argv.slice(3);

parseCommand(command, args);