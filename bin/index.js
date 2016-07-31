#!/usr/bin/env node

'use strict'

var fs = require('fs')
var path = require('path')
var format = require('util').format
var pkg = require('../package.json')
var JSONStream = require('JSONStream')
var multi = require('multi-write-stream')
var fetchTimeline = require('fetch-timeline')
var existsDefault = require('existential-default')

require('update-notifier')({pkg: pkg}).notify()

var cli = require('meow')({
  pkg: pkg,
  help: fs.readFileSync(path.resolve(__dirname, 'help.txt'), 'utf8')
}, {
  alias: {
    f: 'file',
    s: 'save'
  }
})

var CREDENTIALS = [
  'TWITTER_CONSUMER_KEY',
  'TWITTER_CONSUMER_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET'
]

Date.prototype.toYMD = function () {
  var year, month, day
  year = String(this.getFullYear())
  month = String(this.getMonth() + 1)
  if (month.length === 1) month = '0' + month
  day = String(this.getDate())
  if (day.length === 1) day = '0' + day
  return year + '-' + month + '-' + day
}

function lineBreak () {
  process.stdout.write('\n')
}

var acho = require('acho').skin(require('acho-skin-cli'))({
  align: false,
  keyword: 'symbol'
})

function exitOnError (err, code) {
  if (!Array.isArray(err)) err = [err]
  err.forEach(function (err) {
    acho.error(err)
  })
  process.exit(code || 1)
}

function checkEnv (envs) {
  var errors = []
  envs.forEach(function (env) {
    if (!process.env[env]) {
      var message = format("You need to provide '%s' as environment variable.", env)
      errors.push(new Error(message))
    }
  })

  if (errors.length > 0) return exitOnError(errors)
}

var identifier = cli.input.pop()

function getTwitterParams () {
  var params = {}

  if (identifier) {
    if (typeof identifier === 'string') params.screen_name = identifier
    else params.user_id = identifier
  }

  params.limit = cli.flags.limit || cli.flags.l

  var replies = existsDefault(cli.flags.replies, true)
  var rts = existsDefault(cli.flags.rts, true)

  params.include_rts = rts
  params.exclude_replies = !replies

  return params
}

lineBreak()
checkEnv(CREDENTIALS)

var params = getTwitterParams()

var credentials = {
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
}

var timeline = fetchTimeline(params, credentials)
var writables = [ process.stdout ]
var finalMessage

if (cli.flags.save) {
  var filename = cli.flags.file || [identifier, new Date().toYMD(), 'json'].join('.')
  finalMessage = format("Saved at '%s'.", filename)
  writables.push(fs.createWriteStream(filename))
}

var writable = multi(writables)

timeline
  .pipe(JSONStream.stringify('[', ',\n', ']\n', 2))
  .pipe(writable)

timeline.on('error', function (err) {
  // TODO: Create a better error message with res headers:
  // X-Rate-Limit-Limit: the rate limit ceiling for that given request
  // X-Rate-Limit-Remaining: the number of requests left for the 15 minute window
  // X-Rate-Limit-Reset: the remaining window before the rate limit resets in UTC epoch seconds
  var message = err.statusCode + ': ' + err.message
  exitOnError(message, err.code)
})

if (finalMessage) {
  timeline.on('end', function () {
    lineBreak()
    acho.success(finalMessage)
  })
}
