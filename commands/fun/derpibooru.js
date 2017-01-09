// TODO: add a maximum limit to args length
//
// TODO: Make selecting own filter a toggleable option
//
// TODO: Move database to PostgreSQL and put filters in there
//
// TODO: Make reject() (i.e. log()) function names more sensible
//
// TODO: Change filters to tag aliases

'use strict';

const https = require('https'),
      qs = require('querystring'),
      admins = require('./../../options/admins.json'),
      options = require('./../../options/options.json'),
      utils = require('./../../utils/utils.js'),
      filterDefault = 133664;

// Hardcode the first parameter (i.e. file from which fileLog was called) to
// avoid repetition
function log(arr) {
    arr.unshift('derpibooru');
    return utils.fileLog(arr);
}

// Tag aliases (previously “custom filters”)
//
// `include` is the Derpibooru filter this filter includes. This is
// passed along to Derpibooru as the `filter_id` parameter. The
// number is from derpibooru.org/filters/[basedOn number], e.g.
// https://derpibooru.org/filters/100073. Be careful when changing
// this, because if you muck this up and type in something like the
// Maximum Spoilers filter, you will end up getting images of
// things too evil for this world.
//
// `default` filter hides a lot of unpleasant stuff. You can see
// what tags it blocks here:
// https://derpibooru.org/filters/133664
//
// or below - hides the below filters:
// 1000 hours in ms paint, aryan pony, background pony strikes again,
// barely pony related, base, blood, content-aware scale, deviantart stamp,
// diamond dog, disembodied hands, drama, explicit, explicit source,
// exploitable meme, fat, fluffy pony, fluffy pony grimdark, foalcon,
// forced meme, g1 to g3.5, greentext, grimdark, grotesque, header,
// image macro, impossibly large ass, impossibly large everything, inflation,
// luftwaffe, male pregnancy, morbidly obese, nazi, nostril flare,
// not pony related, obese, obligatory pony, oc:anon, oc:aryanne,
// oc:kyrie, op is a duck, pony creator, pregnant, questionable, rule 34,
// seizure warning, semi-grimdark, suggestive, text only, youtube,
// youtube caption
//
// `rdd`, `fourhts`, and `fourths` is for fourhts. You’re welcome.
//
// TODO: Make this into the form of a database, like the setguildprefix
// command
const filters = {
    default: {
        include: filterDefault
    }, rdd: {
        include: filterDefault,
        tags: 'cute,-comic,raridash,artist:raridashdoodles'
    }, fourths: {
        aliasOf: 'fourhts'
    }, fourhts: {
        tags: '(raridash OR sciset OR taviscratch OR raripie OR appleshy ' +
          'OR hoodies OR twinkie OR rarilight OR thoraxspike) AND cute ' +
          'AND NOT comic'
    }
};

// Escape tags before inserting into HTTPS request URL.
function escapeTags(tags) {
    // Wildcard * when no tags is because query to Derpibooru
    // cannot be blank (otherwise empty string returned by server)
    log(['debug', 'escapeTags', `escaped tags: ${qs.escape(tags)}`]);
    return (qs.escape(tags) && tags) ? qs.escape(tags) : '*';
}

// Checks if filter entry in filters object is used with a
// Derpibooru filter as well. If so, return the &filter_id param,
// which is used in the path of the Derpibooru requests.
function checkIfFilter(f, filter, authorID) {
    let filter_value,
        filter_int = parseInt(filter, 10);
    // TODO: Add support for aliasOf
    if (Number.isInteger(filter_int) && filter_int > 0) {
        // Check if user is admin
        // TODO: Make this available to mods as well, and make it toggleable
        if (admins.indexOf(authorID) > -1) filter_value = filter_int;
        else {
            // If user does not have permission to use `[custom filter]
            // This part still runs because JS is silly
            //
            // This sets the filter_id to the default, safe filter
            filter_value = filterDefault;
        }
    }
    // Derpibooru filter numbers (or IDs) must be positive integers
    // Also, someone please tell me how to properly separate this long else
    // if statment into separate lines
    else if (
        f[filter].hasOwnProperty('include') &&
        Number.isInteger(f[filter].include) &&
        f[filter].include > 0
    ) {
        filter_value = parseInt(f[filter].include, 10);
    } else {
        filter_value = filterDefault;
    }
    return `&filter_id=${filter_value}`;
}

// Main function
function bacon(args, blehp, authorID) {

    var getFilterAndTags = new Promise((resolve, reject) => {

        var filter, tags;

        // Set tags that will be used in search
        if (args) {
            // Use-case #1, e.g. ~derpibooru `fourths or ~derpibooru `133664
            // With custom filters

            if (args.charAt(0) === '`') {
                let filterTags;
                log(['debug', 'command - ', JSON.stringify(args.split(/ (.+)/))]);

                // first word is the name of the filter (e.g. `raridash)
                // the backtick is removed before the first word is
                // assigned to the filter variable
                filter = args.split(/ (.+)/)[0].slice(1);

                // second word onwards is list of tags
                let customTags = args.split(/ (.+)/)[1];

                // filter_int is the image ID as an integer
                let filter_int = parseInt(filter, 10);
                if (Number.isInteger(filter_int) &&
                    filter_int > 0 &&
                    filter_int < 999999) {
                    // Check if user is admin
                    // TODO: Make this available to mods as well, and make it
                    // toggleable (also see the checkIfFilter function)
                    if (! (admins.indexOf(authorID) > -1)) {
                        reject({
                            log: [
                                '',
                                'User doesn’t have permission to select own ' +
                                'filter'
                            ],
                            message:
                                'You do not have permission to select your ' +
                                'own filter (via the ` format).'
                        });
                    }
                    filterTags = '';
                }
                // Setting filterTags, i.e. retrieving the tags key in the
                // filter in the filters object. The comments are the only
                // reason this section is so long, so they better be useful
                // to somebody. I hope.
                // Filter stated by user (first parameter which is prefixed
                // by a backtick ` ) exists in the filters object
                else if (filters.hasOwnProperty(filter)) {
                    function blohp(filter, i) {
                        // Check if filter is an alias of another filter
                        // Also prevent recursion (i is max number of times to
                        // run)
                        //
                        // This is the maximum level you can nest aliases (3):
                        // a { aliasOf: 'b' },
                        // b { aliasOf: 'c' },
                        // c { aliasOf: 'd' },
                        // d { tags: 'cute,-comic,raridash' }

                        function checkIfFilterTags() {
                            // Check if filter has tags
                            if (
                              filters.hasOwnProperty(filter) &&
                              filters[filter].hasOwnProperty('tags')
                            ) {
                                return filters[filter].tags;
                            } else {
                                reject({
                                    log: [
                                        'checkIfFilterTags',
                                        `filter ${filter} doesn’t exist!`
                                    ],
                                    message: `Filter ${filter} doesn’t exist!`
                                });
                            }
                        }

                        // Check if filter is an alias
                        if (
                          filters.hasOwnProperty(filter) &&
                          filters[filter].hasOwnProperty('aliasOf')
                        ) {
                            if (i < 3) {
                                return blohp(filters[filter].aliasOf, i + 1);
                            } else {
                                reject({
                                    log: [
                                        'blohp',
                                        'filter aliases in filters database' +
                                        'nested too deep!'
                                    ],
                                    message:
                                        'There’s something wrong with the ' +
                                        'custom filter database. This is a ' +
                                        'problem with the command; please ' +
                                        'let the developer know.'
                                });
                            }
                        } else {
                            return [filter, checkIfFilterTags()];
                        }
                    }
                    [filter, filterTags] = blohp(filter, 0);
                }
                // Filter stated by user does not actually exist in the
                // filters object
                else {
                    // Return error
                    reject({
                        log: [
                            'getFilterAndTags',
                            `filter ${filter} doesn’t exist!`
                        ],
                        message: `filter ${filter} doesn’t exist!`
                    });
                }
                log(['debug', 'filterTags', filterTags]);

                // Set tags based on if filter tags exist (in the
                // form of filters[name of filter].tags) and if there are
                // custom tags passed by the command parameters
                //
                // Note that filter tags are different from Derpibooru
                // filters -- Derpibooru filters are passed by the
                // &filter_id query, are positive integers, and can be seen
                // on the Derpibooru website. Filter tags are only in the
                // filters object, above. Examples of filter tags are the
                // tags key in filters['changeling'] and
                // filters['raridash'].
                if (filterTags && customTags) {
                    // Both filterTags and customTags exist
                    log([
                        'info',
                        '',
                        'tags specified by both filter and custom tags'
                    ]);
                    tags = filterTags + ' ' + customTags;
                } else if (filterTags && (! customTags)) {
                    // Only filterTags exist
                    log([
                        'info',
                        '',
                        'tags specified by filter; no custom tags specified'
                    ]);
                    tags = filterTags;
                } else if ((! filterTags) && customTags) {
                    // Only customTags exist
                    log([
                        'warn',
                        '',
                        'no filter tags; custom tags specified'
                    ]);
                    tags = customTags;
                } else {
                    // If the filter name stated by user doesn’t actually exist.
                    // This should only happen if filter is set as an integer
                    // (e.g. derpibooru_custom `133664), as if the filter is not
                    // an integer and doesn’t exist, filterTags should already
                    // have been set to those of the default, above.
                    log([
                        'warn',
                        '',
                        'no filter tags; no custom tags specified'
                    ]);
                    tags = '';
                }
            }
            // Use-case #2, e.g. ~derpibooru rarity
            // Lack of custom filters - just tags
            else {
                filter = 'default';
                tags =
                  filters[filter].tags
                    ? filters[filter].tags + ',' + args
                    : args;
                log(['debug', '', 'no custom filters specified (just tags)']);
            }

            log(['debug', '', `using filter ${filter}; using tags ${tags}`]);
            log(['debug', '', `Arguments used are ${args}`]);
        } else {
            log(['debug', 'derpibooru', 'No arguments passed']);

            // Use case #1, e.g. derpibooru
            // Just the command by itself
            filter = 'default';
            tags =
              filters.default.tags ? filters.default.tags : '';
        }

        resolve({ filter: filter, tags: tags });

    });

    getFilterAndTags.then(function (obj) {
        var filter = obj.filter,
            tags = obj.tags;
        // Get the total number of search results
        return new Promise((resolve, reject) => {

            log([
                'debug',
                '',
                'Connecting to Derpibooru using this URL (1st time):\n' +
                `/search.json?q=${escapeTags(tags)}&page=1` +
                `${checkIfFilter(filters, filter, authorID)}`
            ]);

            // HTTPS requests from here on in
            //
            // GET
            // 'https://derpibooru.org/search.json?q='+tags+'&page='+page
            //
            // Sorta based on JSON example on
            // https://nodejs.org/api/http.html#http_http_get_options_callback

            // Options for getTotalNo
            let getTotalNoOptions = {
                hostname: 'derpibooru.org',
                port: '443',
                path: `/search.json?q=${escapeTags(tags)}&page=1` +
                  `${checkIfFilter(filters, filter, authorID)}`,
                method: 'GET'
            };

            // The actual GET request that retrieves search results
            // (paginated with 15 images per page)
            let getTotalReq = https.get(getTotalNoOptions, (res) => {
                let contentType = res.headers['content-type'];

                // Error: Invalid status code
                if (res.statusCode !== 200) {
                    reject({
                        log: [
                            'getTotalNo',
                            `Returned HTTP status code ${res.statusCode}`
                        ],
                        message:
                            `Derpibooru returned error code ${res.statusCode}.`,
                        request: res
                    });
                }
                // Error: Not actually JSON
                else if (! /^application\/json/.test(contentType) ) {
                    reject({
                        log: [
                            'getTotalNo',
                            'Derpibooru did not return JSON. ' +
                            `(received ${res.contentType}`
                        ],
                        message:
                            'Derpibooru’s API didn’t return JSON. ' +
                            'Perhaps the API is offline or has moved? ' +
                            'Please let Chrys know.',
                        request: res
                    });
                }

                res.setEncoding('utf8');
                let raw = '';

                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    try {
                        // Parsed JSON response
                        let res_parsed = JSON.parse(raw);
                        log([
                            'debug',
                            'getTotalNo',
                            `total no. of results - ${res_parsed.total}`
                        ]);
                        // No. of results
                        resolve({
                            total: res_parsed.total,
                            filter: filter,
                            tags: tags
                        });
                    } catch (e) {
                        reject({
                            log: ['getTotalNo', e.message],
                            message: 'Sorry, something went wrong in parsing' +
                              'total number of pages!'
                        });
                    }
                });

                res.on('error', e => {
                    reject({
                        log: ['getTotalNo', e.message],
                        message: 'Sorry, something went wrong in getting' +
                          'total number of pages!'
                    });
                });

                res.on('socket', function (socket) {
                    res.on('timeout', e => {
                        reject({
                            log: ['getTotalNo', e.message],
                            message: 'Sorry, something went wrong with ' +
                              'connecting to Derpibooru. Please let Chrys ' +
                              'know.'
                        });
                        res.abort();
                    });
                });

            }); // letTotalReq
        }); // return new Promise()

    }).then(function (obj) {
        return new Promise((resolve, reject) => {
            var resultsTotal = obj.total,
                filter = obj.filter,
                tags = obj.tags;
            // Getting total number of search results succeeded
            // (this value stored in resultsTotal)

            // Check if resultsTotal is actually a valid number
            if (resultsTotal < 0 || ( ! Number.isInteger(resultsTotal))) {
                reject({
                    log: [
                        'getTotalNo.then',
                        'Total no. of search results isn’t a number' +
                        `(got ${resultsTotal})`
                    ],
                    message: 'Sorry, Derpibooru returned something weird that' +
                      'I couldn’t handle. Please let Chrys know.'
                });
            }
            let pagesTotal = Math.ceil(resultsTotal / 15);
            // Search results page to go on (randomised)
            let page = Math.ceil(Math.random() * pagesTotal);

            log([
                'debug',
                'getTotalNo.then',
                'Connecting to Derpibooru using this URL (2nd time):\n' +
                `/search.json?q=${escapeTags(tags)}&page=${page}` +
                `${checkIfFilter(filters, filter, authorID)}`
            ]);

            let options = {
                hostname: 'derpibooru.org',
                port: '443',
                path: `/search.json?q=${escapeTags(tags)}&page=${page}` +
                  `${checkIfFilter(filters, filter, authorID)}`,
                method: 'GET'
            };

            // The asynchronous request that retrieves an image
            // TODO: Change to request()
            let req = https.get(options, res => {
                let contentType = res.headers['content-type'];

                // Error: Invalid status code
                if (res.statusCode !== 200) {
                    reject({
                        log: [
                            'https.get',
                            `Returned HTTP status code ${res.statusCode}`
                        ],
                        message:
                            `Can’t access Derpibooru API`,
                        request: res
                    });
                } // Error: Not actually JSON
                else if ( ! /^application\/json/.test(contentType) ) {
                    reject({
                        log: [
                            'https.get',
                            `Received ${res.contentType} instead of JSON.`
                        ],
                        message: `Derpibooru API returned something weird.`,
                        request: res
                    });
                }

                res.setEncoding('utf8');
                let raw = '';

                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    try {
                        // Parsed JSON response
                        let res_parsed = JSON.parse(raw);

                        // No of results on this page (e.g. in case there’s
                        // only two or three results instead of the default
                        // fifteen on a full page)
                        let pageResultsNo = res_parsed.search.length;

                        // Parse retrieved JSON and select one image
                        let pageIndex =
                          Math.floor(Math.random() * pageResultsNo);
                        // Randomly selected image
                        let selection = res_parsed.search[pageIndex];
                        // Image URL
                        let imageUrl = selection.representations.large;
                        // Image source
                        let imageSource = selection.id;

                        let description = '';
                        // Filter ID used. TODO: Make this way more elegant
                        let filterUsed =
                            checkIfFilter(filters, filter, authorID).slice(11);
                        if (filterUsed !== filterDefault)
                            description += `**Filter:** ${filterUsed}`;
                        if (tags !== '') {
                            if (description !== '') description += '\n';
                            if (tags.length <= 120) {
                                description += `**Tags:** ${tags}`;
                            } else {
                                description +=
                                    `**Tags:** *(too long to list)*`;
                            }
                        }

                        // Message (or rather, embed) returned
                        //
                        // color is in format 0xFFFFFF, i.e. any integer from
                        //     0 to 2**24.
                        // In this case, set a random colour by doing this:
                        //    1 << 24 shifts the 1 24 positions to the left,
                        //        giving what is equal to 2**24
                        //    Math.random() - turns into random number from
                        //        zero to 2**24, of course
                        //    | 0 - bitwise OR operator (for integers). In
                        //        this case, this takes advantage of the
                        //        fact that bitwise operators remove
                        //        anything after decimal point
                        //    Output is a random integer from 0 to 2**24.
                        let result = {
                            embed: {
                                title: 'Derpibooru page →',
                                url: 'https://derpibooru.org/' + imageSource,
                                description: description,
                                color: ((1 << 24) * Math.random() | 0),
                                image: {
                                    url: 'https:' + imageUrl
                                }
                            }
                        };

                        resolve(result);
                    } catch (e) {
                        // The most common reason this will happen is when there
                        // are no results (thus JSON cannot be parsed).
                        reject({
                            log: ['getTotalNo.then', e.message],
                            message: 'Derpibooru didn’t return any results.'
                        });
                    }
                }); // res.on('end' ... )

                res.on('error', e => {
                    reject({
                        log: ['getTotalNo.then', e.message],
                        message: 'Derpibooru returned an error.'
                    });
                });

                res.on('socket', function (socket) {
                    res.on('timeout', e => {
                        reject({
                            log: ['getTotalNo.then', e.message],
                            message: 'Connecting to Derpibooru timed out.'
                        });
                        res.abort();
                    });
                });

            }); // let req = https.get
        });
    }).then(function (message) {
        // Success! Return message (or in this case, embed)
        blehp(message);
    }).catch(err => {
        // If catch() caught an Error object, return error.message
        if (err instanceof Error) blehp('**Error:** ' + err.message);
        // If error was the result of a promise reject()
        else if (typeof err === 'object') {
            // err.log[0]: Function from which this function was called
            // err.log[1]: Log message
            // err.message: Message to return to user running Discord command
            // err.request: request callback, for stopping the HTTPS request
            log(['error', err.log[0], err.log[1]]);

            // Nom on the response data to free up memory
            if (err.request !== undefined) err.request.resume();
            var resolveMessage = '**Error:**\n' + err.message;
            // blehp() is the equivalent of the resolve() function in promises
            // i.e. blehp() is what helps output resolveMessage to Discord
            blehp(resolveMessage);
        }
        else if (typeof err === 'string') blehp(err);
        else {
            // This really shouldn’t happen
            console.log(errorC('derpibooru:'), err);
            blehp(
                '**Error:** Something really weird happened. This is a bug ' +
                'in the command; please let the developer know.'
            );
        }
    }); // getTotalNo.catch()

}

module.exports = {
    usage:
`Returns an image from **Derpibooru**, filtered by **tags**. If \
there is more than one result, the image returned will be randomly selected. \
Note that this command uses a custom filter that doesn’t show images that aren’t art \
and/or aren’t safe for work. You can see a list of the tags blocked here: \
<https://derpibooru.org/filters/133664>

Inspired by fourhts’ Cute Horses. (http://wikipedia.sexy/hoers)

**Usage:**
\`\`\`markdown
# Return any image from Derpibooru
~dp
# Return random image with the following tags (in the same format as you \
would in Derpibooru’s search box):
~dp changeling OR raripie
\`\`\`

**Advanced usage for the 0.84% that care - tag aliases:**

As well as search queries, you can use one of the predefined tag aliases, \
which are aliases for a collection of tags
backtick in front of their name.

**List of tag aliases:**
\`\`\`markdown
# ~dp \`rdd
# is identical to:
~dp cute, -comic, raridash, artist:raridashdoodles
# ~dp \`fourths or ~dp \`fourhts
# is identical to:
~dp (raridash OR sciset OR taviscratch OR raripie OR appleshy OR hoodies OR \
twinkie OR rarilight OR thoraxspike) AND cute AND NOT comic
\`\`\``
        ,
    aliases: ['dp', 'dpc'],
    dm: true,
    delete: false,
    cooldown: 10,
    process: obj => {
        var msg = obj.msg,
            args = obj.args;
        // Based off fourhts’ cute shipping thing at
        // http://wikipedia.sexy/hoers/
        // and also ES6 promises
        // http://stackoverflow.com/a/14220323

        return Promise.resolve({
            message: "Retrieving Derpibooru image…",
            edit: new Promise(resolve => {
                let output;
                let a = new Promise(resolve => {
                    bacon(
                        args,
                        (message) => {
                            output = message;
                            log([
                                'debug',
                                '',
                                'resolving message: ' + JSON.stringify(message)
                            ]);
                            resolve(output);
                        },
                        msg.author.id
                    );
                }).then(message => {
                    log([
                        'debug',
                        '',
                        'returning output of derpibooru: ' +
                        JSON.stringify(message)
                    ]);
                    resolve(message);
                }).catch(e => {
                    log([
                        'error',
                        '',
                        'unknown error (printed below)'
                    ]);
                    console.log(e);
                });
            }) // edit_async: new Promise({})
        });

    } // process
} // module.exports
