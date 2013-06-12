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

var download_assets = function(download_list) {
    var shell = require('shelljs');

    if(!shell.test('-e', 'smugmug')) {
        shell.mkdir('smugmug');
    }
    shell.cd('smugmug');

    console.log("Prepping download of up to %d galleries", download_list.length);
    _.each(download_list, function(item, index, list) {
        if(!item.skip && !item.done) {
            var filename = item.url.substring(item.url.lastIndexOf('/') + 1);

            console.log('Download gallery (%d) [%s] (%s) from %s', index + 1, item.gallery.trim(), item.size, item.url);

            var normalized_gallery = item.gallery.replace(/[^a-zA-Zí\d\s:]/g, '');
            normalized_gallery = normalized_gallery.trim();

            if(!shell.test('-e', normalized_gallery)) {
                console.log("%s doesn't exist, creating", normalized_gallery);
                shell.mkdir(normalized_gallery);
            }

            shell.cd(normalized_gallery);

            if(!shell.test('-e', util.format("%s.zip", filename))) {
                var download = shell.exec(util.format('curl -L %s -o %s.zip', item.url, filename));
            } else {
                console.log("Appears that (%s) already exists so we will skip", filename);
            }
            shell.cd('..');
            console.log();
        }
    });
};

var download_messages = function(callback) {
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
                                            gallery: result[1].trim(),
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

                        callback(download_list);
                    }
                );
            });
        });
    });
};

function processInbox(password, save) {
    imap = new Imap({
        user: args.imap.user,
        password: password,
        host: args.imap.host,
        port: args.imap.port,
        secure: args.imap.secure
    });

    download_messages(function(download_list) {
        if(save) {
            writeDownloadListToFile(download_list);
        }
        download_assets(download_list);
    });

}

function writeDownloadListToFile(download_list) {
    var jsonText = JSON.stringify({list: download_list}, null, 4);

    console.log(jsonText);

    fs.writeFile("download.json", jsonText, function(err) {
        if(err) {
            console.log(err);
        } else {
            console.log("The file was saved!");
        }
    });
}

function processFile(file) {
    var fileContents = fs.readFileSync(file,'utf8');
    var schema = JSON.parse(fileContents);

    if(schema && schema.list) {
        download_assets(schema.list);
    } else {
        console.log("schema not properly formed.");
    }
}


var main = function() {
    program
        .version('0.0.1');

    program
        .command('email')
        .option('-s --save', 'Save a json file for resuming')
        .description('Read message from SmugMug in the INBOX before downloading')
        .action(function(env) {
            program.password(util.format('Enter IMAP password for [%s]:', args.imap.user), function(password) {
                processInbox(password, env.save);
            });
        });

    program
        .command('resume')
        .option('-f --file <jsonfile>', 'Resume from a saved JSON file from mail output')
        .description('Resume from a previously saved JSON')
        .action(function(env) {
            if(env.file) {
                processFile(env.file);
            } else {
                die('Specify a file with path');
            }
        });

    program.parse(process.argv);
};



if(require.main === module) {
    main();
}