#!/usr/bin/env node

var util    = require('util'),
    fs      = require('fs'),
    inspect = require('util').inspect,
    program = require('commander-plus'),
    _       = require('underscore')._,
    url     = require('url'),
    Imap    = require('imap'),
    args    = require('./config.json');

var imap = null;

function show(obj) {
  return inspect(obj, false, Infinity);
}

function die(err) {
    console.log('Uh oh: ' + err);
    process.exit(1);
}

function openInbox(cb) {
    imap.connect(function(err) {
        if (err) die(err);
        imap.openBox('INBOX', true, cb);
    });
}

function processInbox(password) {
    imap = new Imap({
        user: args.imap.user,
        password: password,
        host: args.imap.host,
        port: args.imap.port,
        secure: args.imap.secure
    });

    download_list = [];

    openInbox(function(err, mailbox) {
        if(err) die(err);
        imap.openBox('INBOX', true, function(err, mailbox) {
            imap.search(['ALL', ["SUBJECT", "Your digital files are ready!*"], ["FROM", "help@smugmug.com"]], function(err, results) {
                imap.fetch(results,
                    {headers: ['from', 'to', 'subject', 'date'],
                     body: true,
                        cb: function(fetch) {
                            fetch.on('message', function(msg) {
                                var body = '';
                                msg.on('data', function(chunk) {
                                    body += chunk.toString('utf8');
                                });
                                msg.on('end', function() {

                                    if(body.match(/base64/)) {
                                        var base64_result = body.match(/base64\r\n\r\n([^--]*)/);
                                        body = new Buffer(base64_result[1], 'base64').toString();
                                    }

                                    var regex = /Great news! Your digital files for (.+?)(?=are)are ready and waiting. Click on this link to get your zip file: ([^\(]*) \(([^\)]*)\)/;
                                    var result = body.match(regex);

                                    if(result) {
                                        download_list.push(
                                        {
                                            gallery: result[1],
                                            url: result[2],
                                            size: result[3]
                                        });
                                    } else {
                                        die('Something went wrong');
                                    }
                                });
                            });
                        }
                    }, function(err) {
                        if(err) throw err;
                        imap.logout();
                        var shell = require('shelljs');

                        shell.mkdir('smugmug');
                        shell.cd('smugmug');

                        _.each(download_list, function(item) {

                            var filename = item.url.substring(item.url.lastIndexOf('/') + 1);

                            console.log('Download gallery [%s] (%s) from %s', item.gallery, item.size, item.url);

                            shell.mkdir(item.gallery);
                            shell.cd(item.gallery);
                            var download = shell.exec(util.format('curl -L %s -o %s.zip', item.url, filename));
                            shell.cd('..');
                        });
                    }
                );
            });
        });
    });    
}


var main = function() {
    program
        .version('0.0.1');

    program.password(util.format('Enter IMAP password for [%s]:', args.imap.user), function(password) {
        processInbox(password);
    });


};



if(require.main === module) {
    main();
}