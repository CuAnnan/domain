#! /usr/bin/node
/***
 * This is just a series of functions to add and remove things from a SQLite Database rather than an object's attributes
 * The sphere, name, and room values all refer explicitly to object ids from the MUSH
 */


const Database = require("better-sqlite3");
const db = new Database(__dirname+'/domain.db');

const functions = {
    'claimDomain':claimDomain,
    'addRoomToDomain':addRoomToDomain,
    'addPlayersToDomain':addPlayersToDomain,
    'setDomainDetails':setDomainDetails,
    'revokeDomain':revokeDomain,
    'test':function(){
        process.stdout.write('Success');
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
function claimDomain(player, sphere, name, room) {
    db.exec('BEGIN TRANSACTION');
    try
    {
        let idDomain;
        try {
            let stmt = db.prepare('INSERT INTO domains (name, sphere, owner) VALUES (?, ?, ?)');
            let query = stmt.run(name, sphere, player);
            idDomain = query.lastInsertRowid;
        }catch(e){
            process.stdout.write(`0 You already have a domain named ${name} "${e.message}"`);
            throw (e);
        }
        try {
            executeAddRoomToDomainQuery(idDomain, sphere, room);
        }catch(e){
            process.stdout.write(`0 This room is already part of a domain for your sphere`);
        }
        try {
            executeAddPlayersToDomainQuery(idDomain, player);
        }catch(e){
            process.stdout.write(`-1 Could not execute query to add player to domain`);
        }
        db.exec('COMMIT');
        process.stdout.write(`1 You have created a domain called ${name}`);
    }catch(e)
    {
        db.exec('ROLLBACK');
    }

}

function revokeDomain(player, domain)
{
    try {
        let stmt = db.prepare("DELETE FROM domains WHERE player = ? AND name = ?");
        stmt.run(player, domain);
        process.stdout.write(`1 You have revoked your claim to the domain ${name}`);
    }catch(e)
    {
        process.stdout.write(`0 ${e.message}`);
    }
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
        if(args) {
            func(...args);
        }
        else
        {
            func();
        }
    }
    else
    {
        process.stdout.write(`#-1 Unknown command ${command}`);
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