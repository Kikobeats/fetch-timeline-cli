#!/usr/bin/env node
'use strict';

var fs             = require('fs');
var Acho           = require('acho');
var meow           = require('meow');
var ProgressBar    = require('progress');
var exists         = require('existential');
var jsonFuture     = require('json-future');
var fetchTimeline  = require('fetch-timeline');
var pkg            = require('../package.json');
var updateNotifier = require('update-notifier');

Date.prototype.toYMD = function() {
  var year, month, day;
  year = String(this.getFullYear());
  month = String(this.getMonth() + 1);
  if (month.length == 1) {
    month = "0" + month;
  }
  day = String(this.getDate());
  if (day.length == 1) {
    day = "0" + day;
  }
  return year + "-" + month + "-" + day;
};

var cli = meow({
  pkg: pkg,
  help: fs.readFileSync(__dirname + '/help.txt', 'utf8')
});

updateNotifier({pkg: cli.pkg}).notify();

var save;
var file;
var output;
var options;
var identifier = cli.input.pop() || null;

var acho = new Acho({
  keyword: 'fetch-timeline',
  align: false
});

var lineBreak = function() {
  process.stdout.write('\n');
};

var checkCredentials = function() {

  var envs = [
    'TWITTER_CONSUMER_KEY',
    'TWITTER_CONSUMER_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_TOKEN_SECRET'
  ];

  var envError = false;

  envs.forEach(function(variable) {
    if (!process.env[variable]) {
      acho.error(' You need to provide %s credential as environment variable.', variable);
      envError = true;
    }
  });

  if (envError) process.exit(1);
};

var determineParams = function() {
  var params = {};

  if (identifier) {
    if (typeof identifier === 'string')
      params.screen_name = identifier;
    else
      params.user_id = identifier;
  }

  save = cli.flags.save || cli.flags.s;
  output = cli.flags.output || cli.flags.o;
  file = cli.flags.file || cli.flags.f;

  params.limit = cli.flags.limit || cli.flags.l || 3200;
  if (params.limit > 3200) params.limit = 3200;

  var replies = exists(cli.flags.replies) ? cli.flags.replies : true;
  var rts = exists(cli.flags.rts) ? cli.flags.rts : true;

  params.include_rts = rts;
  params.exclude_replies = !replies;

  return params;
};

var errorException = function(err) {
  acho.err(err.message);
  process.exit(err.errno);
};

lineBreak();
checkCredentials();
var params = determineParams();

options = {
  params: params,

  credentials: {
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  },

  temFile: {
    ext: '.json'
  }
};

var progressMessage;

if (identifier)
  progressMessage = "fetching '" + identifier + "' ";
else
  progressMessage = '  fetching ';

progressMessage += 'timeline [:bar] :percent :elapseds';

var progressBar = new ProgressBar(progressMessage, {
  total: params.limit,
  width: 20
});

var timeline = fetchTimeline(options);

timeline.on('data', function(chunk) {
  progressBar.tick(chunk.length);
});

timeline.on('end', function(timeline) {
  jsonFuture.loadAsync(timeline.tweets.path, function(err, tweets) {
    if (err) errorException(err);
    timeline.tweets.cleanup(function() {
      timeline.tweets = tweets;

      lineBreak();
      if (output) console.log(timeline.tweets);
      if (!save) process.exit();

      var filepath = file || timeline.user.screen_name + '_' + timeline.firstTweetDate.toYMD() + '.json';
      jsonFuture.saveAsync(filepath, timeline.tweets, function(err) {
        if (err) errorException(err);
        acho.success("Saved at '" + filepath + "'.");
      });
    });
  });
});

timeline.on('error', errorException);
