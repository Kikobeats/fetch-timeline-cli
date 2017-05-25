#!/usr/bin/env node

'use strict'

const fetchTimeline = require('fetch-timeline')
const formatDate = require('date-fns/format')
const multi = require('multi-write-stream')
const JSONStream = require('JSONStream')
const dateTime = require('date-time')
const prettyMs = require('pretty-ms')
const omit = require('lodash.omit')
const pick = require('lodash.pick')
const get = require('lodash.get')
const chalk = require('chalk')
const path = require('path')
const fs = require('fs')

const pkg = require('../package.json')
require('update-notifier')({pkg}).notify()

const cli = require('meow')({
  pkg,
  help: fs.readFileSync(path.resolve(__dirname, 'help.txt'), 'utf8')
})

const getIdentifier = params => params.screenName || params.userId
const isString = str => typeof str === 'string'

const fileDate = () => formatDate(Date.now(), 'YYYY-MM-DD')

const CREDENTIALS = [
  'TWITTER_CONSUMER_KEY',
  'TWITTER_CONSUMER_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET'
]

const lineBreak = () => process.stdout.write('\n')

const log = require('acho').skin(require('acho-skin-cli'))({
  align: false,
  keyword: 'symbol'
})

function exitOnError (err, code) {
  const collection = [].concat(err)
  collection.forEach(err => log.error(err.message || err))
  process.exit(code || 1)
}

function checkEnv (envs) {
  const errors = []
  envs.forEach(function (env) {
    if (!process.env[env]) {
      const message = `You need to provide '${env}'.`
      errors.push(new Error(message))
    }
  })

  if (errors.length > 0) return exitOnError(errors)
}

lineBreak()
checkEnv(CREDENTIALS)

const credentials = {
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
}

const {flags} = cli
const params = omit(flags, ['limit', 'save', 'limitDays'])
const opts = Object.assign(pick(flags, ['limit', 'limitDays']), {credentials})

const stream = fetchTimeline(params, opts)
const writables = [ process.stdout ]
const {save} = flags
let endMessage

if (save) {
  const identifier = getIdentifier(params)
  const filename = isString(save)
    ? save
    : `${identifier}.${fileDate()}.json`

  endMessage = `Saved at '${filename}'.`
  writables.push(fs.createWriteStream(filename))
}

const writable = multi(writables)

stream
  .pipe(JSONStream.stringify('[', ',\n', ']\n', 2))
  .pipe(writable)

stream.on('error', function (err) {
  // TODO: Create a better error message with res headers:
  // X-Rate-Limit-Limit: the rate limit ceiling for that given request
  // X-Rate-Limit-Remaining: the number of requests left for the 15 minute window
  // X-Rate-Limit-Reset: the remaining window before the rate limit resets in UTC epoch seconds
  const {statusCode, message: errMessage, code} = err
  const message = `${statusCode}: ${errMessage}`
  exitOnError(message, code)
})

stream.on('info', function (info) {
  const {apiCalls, count, newerTweetDate, olderTweetDate} = info
  const screenName = get(info, 'user.screen_name')

  setTimeout(function () {
    lineBreak()
    log.info(`${chalk.white('Total API calls  :')} ${apiCalls} calls`)
    log.info(`${chalk.white('Total tweets     :')} ${count} tweets`)

    if (count) {
      const now = Date.now()
      const newer = dateTime(newerTweetDate)
      const older = dateTime(olderTweetDate)
      const newerAgo = prettyMs(now - newerTweetDate.getTime())
      const olderAgo = prettyMs(now - olderTweetDate.getTime())

      log.info(`${chalk.white('Newer tweet date :')} ${newer} (${newerAgo})`)
      log.info(`${chalk.white('Older tweet date :')} ${older} (${olderAgo})`)
    }

    if (screenName) {
      const twitterUrl = `https://twitter.com/${screenName}`
      log.info(`${chalk.white('User profile     :')} ${twitterUrl}`)
    }

    if (endMessage) {
      lineBreak()
      log.success(endMessage)
    }
  }, 250)
})
